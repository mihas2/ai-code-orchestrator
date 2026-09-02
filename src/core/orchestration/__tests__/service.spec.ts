import { describe, expect, it, vi } from "vitest"
import { OrchestrationService } from "../service"
import type { OrchestrationPersistence } from "../persistence"
import type { OrchestrationSnapshot, StartOrchestrationInput } from "../types"

const settings = {
	schemaVersion: 1 as const,
	enabled: true,
	orchestratorModeSlug: "orchestrator",
	maxParallelWorkers: 1,
	maxDepth: 1,
	timeoutMs: 1000,
	maxReworkAttempts: 1,
	contextPolicy: "balanced",
	conflictPolicy: "patch",
	reviewPolicy: "off",
	requirePlanApproval: false,
	requireIntegrationApproval: false,
	allowWorkerCommands: false,
	allowWorkerMcp: false,
	persistTranscripts: false,
	maxRunTokens: 20,
	maxChildTokens: 10,
} as const
const contract = (nodeId: string) => ({
	contractVersion: 1 as const,
	runId: "r",
	nodeId,
	goal: "g",
	objective: nodeId,
	acceptanceCriteria: [],
	constraints: [],
	mode: "code",
	fileScopes: { include: [], exclude: [] },
	dependencySummaries: [],
	relevantFacts: [],
	allowedTools: [],
	outputRequirements: [],
	tokenBudget: 10,
	parentContextDigest: "x",
})
const input = (): StartOrchestrationInput => ({
	runId: "r",
	rootTaskId: "root",
	goal: "g",
	settings,
	nodes: [
		{ nodeId: "a", role: "code", mode: "code", title: "a", objective: "a", inputContract: contract("a") },
		{
			nodeId: "b",
			role: "code",
			mode: "code",
			title: "b",
			objective: "b",
			dependsOn: ["a"],
			inputContract: contract("b"),
		},
	],
})

function memory(initial?: OrchestrationSnapshot) {
	let snapshot = initial
	const order: string[] = []
	const persistence: OrchestrationPersistence = {
		load: async () => snapshot,
		save: async (s, e) => {
			snapshot = structuredClone(s)
			if (e) order.push(`save:${e.sequence}`)
		},
		scanRecoverable: async () => (snapshot ? [snapshot] : []),
	}
	return { persistence, order, get: () => snapshot! }
}

describe("OrchestrationService", () => {
	it("persists monotonic events before publishing and dispatches dependencies within capacity", async () => {
		const store = memory(),
			starts: string[] = [],
			published: number[] = []
		const service = new OrchestrationService(
			store.persistence,
			{
				start: async ({ node }) => {
					starts.push(node.nodeId)
					return { taskId: node.nodeId, cancel: async () => undefined }
				},
			},
			async (e) => {
				expect(store.order.at(-1)).toBe(`save:${e.sequence}`)
				published.push(e.sequence)
			},
		)
		await service.start(input())
		await service.dispatch("r")
		expect(starts).toEqual(["a"])
		expect(store.get().run.activeNodeIds).toEqual(["a"])
		await service.handleChildEvent({
			runId: "r",
			nodeId: "a",
			idempotencyKey: "a-done",
			status: "integrated",
			usage: { inputTokens: 3 },
		})
		await service.dispatch("r")
		expect(starts).toEqual(["a", "b"])
		expect(published).toEqual([...published].sort((a, b) => a - b))
		expect(store.get().run.budget.reservedTokens).toBe(10)
	})

	it("does not double-reserve the plan estimate and the dispatched node", async () => {
		const store = memory()
		const service = new OrchestrationService(store.persistence, {
			start: async ({ node }) => ({ taskId: node.nodeId, cancel: async () => undefined }),
		})
		await service.start({ ...input(), estimatedTokens: 20 })
		expect(store.get().run.budget.reservedTokens).toBe(0)
		await service.dispatch("r")
		expect(store.get().nodes[0].status).toBe("running")
		expect(store.get().run.budget.reservedTokens).toBe(10)
	})

	it("deduplicates child events and blocks dependants after failure", async () => {
		const store = memory()
		const service = new OrchestrationService(store.persistence, {
			start: async ({ node }) => ({ taskId: node.nodeId, cancel: async () => undefined }),
		})
		await service.start(input())
		await service.dispatch("r")
		const event = {
			runId: "r",
			nodeId: "a",
			idempotencyKey: "failure",
			status: "failed" as const,
			usage: { outputTokens: 2 },
		}
		await service.handleChildEvent(event)
		await service.handleChildEvent(event)
		expect(store.get().nodes.find((n) => n.nodeId === "b")?.status).toBe("blocked")
		expect(store.get().run.budget.used.outputTokens).toBe(2)
	})

	it("restores pause state, cancels idempotently, and recovers running children", async () => {
		const store = memory()
		const cancel = vi.fn(async () => undefined)
		const service = new OrchestrationService(store.persistence, {
			start: async ({ node }) => ({ taskId: node.nodeId, cancel }),
			recover: async (run, node) => ({ taskId: node.nodeId, cancel }),
		})
		await service.start(input())
		await service.dispatch("r")
		await service.pause("r")
		await service.resume("r")
		expect(store.get().run.status).toBe("running")
		const recovered = new OrchestrationService(store.persistence, {
			start: vi.fn(),
			recover: async (run, node) => ({ taskId: node.nodeId, cancel }),
		})
		await recovered.recover()
		expect(store.get().nodes[0].status).toBe("running")
		await recovered.cancel("r")
		await recovered.cancel("r")
		expect(cancel).toHaveBeenCalledTimes(1)
		expect(store.get().nodes.every((n) => ["canceled", "integrated", "failed"].includes(n.status))).toBe(true)
	})
	it("runs review, approval, integration, and synthesis without duplicate dispatch", async () => {
		const store = memory()
		const starts: string[] = []
		const integration = {
			check: vi.fn(async () => ({ safe: true, conflicts: [] })),
			integrate: vi.fn(async () => ({ artifactRefs: ["merged.patch"] })),
		}
		const review = { review: vi.fn(async () => ({ findings: [], artifactRefs: [] })) }
		const service = new OrchestrationService(
			store.persistence,
			{
				start: async ({ node }) => {
					starts.push(node.nodeId)
					return { taskId: node.nodeId, cancel: async () => undefined }
				},
			},
			undefined,
			{ review, integration },
		)
		await service.start({
			...input(),
			settings: {
				...settings,
				requirePlanApproval: true,
				requireIntegrationApproval: true,
				reviewPolicy: "completion",
			},
		})
		await service.dispatch("r")
		expect(starts).toEqual([])
		await service.approvePlan("r")
		expect(starts).toEqual(["a"])
		const result = {
			contractVersion: 1 as const,
			status: "completed" as const,
			summary: "ok",
			filesRead: [],
			filesChanged: [],
			artifactRefs: ["child.patch"],
			tests: [],
			assumptions: [],
			risks: [],
			openQuestions: [],
			nextActions: [],
		}
		await service.handleChildEvent({
			runId: "r",
			nodeId: "a",
			idempotencyKey: "a-complete",
			status: "integrated",
			result,
			usage: { outputTokens: 1 },
		})
		await service.approveIntegration("r")
		await service.dispatch("r")
		await service.handleChildEvent({
			runId: "r",
			nodeId: "b",
			idempotencyKey: "b-complete",
			status: "integrated",
			result,
			usage: { outputTokens: 1 },
		})
		await service.approveIntegration("r")
		const snapshot = store.get()
		expect(snapshot.run.status).toBe("completed")
		expect(integration.integrate).toHaveBeenCalledTimes(2)
		expect(review.review).toHaveBeenCalledTimes(2)
		expect(starts).toContain("a")
	})

	it("bounds major review rework and permits one explicit retry", async () => {
		const store = memory()
		const review = {
			review: vi.fn(async () => ({
				findings: [
					{
						id: "major",
						severity: "major" as const,
						message: "fix",
						provenance: { artifactRefs: [], conflictRefs: [], detectedAt: 1 },
					},
				],
				artifactRefs: [],
			})),
		}
		const service = new OrchestrationService(
			store.persistence,
			{ start: async ({ node }) => ({ taskId: node.nodeId, cancel: async () => undefined }) },
			undefined,
			{ review },
		)
		await service.start({ ...input(), settings: { ...settings, reviewPolicy: "completion" } })
		await service.dispatch("r")
		const result = {
			contractVersion: 1 as const,
			status: "completed" as const,
			summary: "bad",
			filesRead: [],
			filesChanged: [],
			artifactRefs: ["a.patch"],
			tests: [],
			assumptions: [],
			risks: [],
			openQuestions: [],
			nextActions: [],
		}
		await service.handleChildEvent({ runId: "r", nodeId: "a", idempotencyKey: "a-1", status: "integrated", result })
		expect(["running", "needs_rework"]).toContain(store.get().nodes[0].status)
		await service.dispatch("r")
		await service.handleChildEvent({ runId: "r", nodeId: "a", idempotencyKey: "a-2", status: "integrated", result })
		expect(["failed", "running"]).toContain(store.get().nodes[0].status)
		expect(store.get().nodes[0].attempt).toBe(2)
		await expect(service.retryNode("r", "a")).rejects.toThrow()
	})

	it("validates routes before starting workers and reports rejected capabilities", async () => {
		const store = memory()
		const start = vi.fn(async ({ node }) => ({ taskId: node.nodeId, cancel: async () => undefined }))
		const route = {
			resolve: vi.fn(async () => {
				throw new Error("model lacks tool capability")
			}),
		}
		const service = new OrchestrationService(store.persistence, { start }, undefined, { route })
		await service.start(input())
		await service.dispatch("r")
		expect(route.resolve).toHaveBeenCalledTimes(1)
		expect(start).not.toHaveBeenCalled()
		expect(store.get().nodes[0]).toMatchObject({ status: "failed", error: { code: "route_rejected" } })
	})

	it("starts at least two independent workers when both configured limits permit it", async () => {
		const store = memory()
		const start = vi.fn(async ({ node }) => ({
			taskId: node.nodeId,
			cancel: async () => undefined,
			workspacePath: `/workers/${node.nodeId}`,
		}))
		const service = new OrchestrationService(store.persistence, { maxParallel: 2, start })
		const parallelInput = input()
		parallelInput.settings = { ...settings, maxParallelWorkers: 2, maxRunTokens: 40 }
		parallelInput.nodes = [
			{
				nodeId: "a",
				role: "code",
				mode: "code",
				title: "a",
				objective: "a",
				inputContract: { ...contract("a"), fileScopes: { include: ["src/a"], exclude: [] } },
			},
			{
				nodeId: "b",
				role: "code",
				mode: "code",
				title: "b",
				objective: "b",
				inputContract: { ...contract("b"), fileScopes: { include: ["src/b"], exclude: [] } },
			},
		]
		await service.start(parallelInput)
		await service.dispatch("r")
		expect(start).toHaveBeenCalledTimes(2)
		expect(store.get().run.activeNodeIds).toEqual(["a", "b"])
		expect(service.workerHandles.get("a")?.workspacePath).not.toBe(service.workerHandles.get("b")?.workspacePath)
	})
})
