import { describe, expect, it, vi } from "vitest"
import { parseAndValidatePlan } from "../planner"
import { OrchestrationService } from "../service"
import type { OrchestrationPersistence } from "../persistence"
import type { OrchestrationSnapshot, ResultContract, StartOrchestrationInput } from "../types"

const settings = {
	schemaVersion: 1 as const,
	enabled: true,
	orchestratorModeSlug: "orchestrator",
	maxParallelWorkers: 2,
	maxDepth: 2,
	timeoutMs: 1_000,
	maxReworkAttempts: 1,
	contextPolicy: "balanced" as const,
	conflictPolicy: "patch" as const,
	reviewPolicy: "off" as const,
	requirePlanApproval: false,
	requireIntegrationApproval: false,
	allowWorkerCommands: false,
	allowWorkerMcp: false,
	persistTranscripts: false,
	maxRunTokens: 100,
	maxChildTokens: 20,
}

const contract = (nodeId: string, scope = `src/${nodeId}`) => ({
	contractVersion: 1 as const,
	runId: "integration-run",
	nodeId,
	goal: "Implement the user task",
	objective: nodeId,
	acceptanceCriteria: ["tests pass"],
	constraints: [],
	mode: "code",
	fileScopes: { include: [scope], exclude: [], write: [scope] },
	dependencySummaries: [],
	relevantFacts: [],
	allowedTools: [],
	outputRequirements: ["ResultContract"],
	tokenBudget: 10,
	parentContextDigest: "root-digest",
})

const result = (summary = "done"): ResultContract => ({
	contractVersion: 1,
	status: "completed",
	summary,
	filesRead: [],
	filesChanged: [],
	artifactRefs: [],
	tests: [],
	assumptions: [],
	risks: [],
	openQuestions: [],
	nextActions: [],
})

function memory(initial?: OrchestrationSnapshot) {
	let snapshot = initial
	const persistence: OrchestrationPersistence = {
		load: async () => snapshot && structuredClone(snapshot),
		save: async (value) => void (snapshot = structuredClone(value)),
		scanRecoverable: async () => (snapshot ? [structuredClone(snapshot)] : []),
	}
	return { persistence, get: () => snapshot! }
}

const input = (nodes: StartOrchestrationInput["nodes"]): StartOrchestrationInput => ({
	runId: "integration-run",
	rootTaskId: "user-task",
	goal: "Implement the user task",
	settings,
	nodes,
})

const node = (nodeId: string, dependsOn: string[] = []) => ({
	nodeId,
	role: "worker",
	mode: "code",
	title: nodeId,
	objective: nodeId,
	dependsOn,
	inputContract: contract(nodeId),
})

describe("OrchestrationService integration", () => {
	it("creates a persisted, approval-gated plan from a user task", async () => {
		const userTask = JSON.stringify({
			version: 1,
			nodes: [
				{
					id: "implementation",
					role: "worker",
					mode: "code",
					objective: "Implement request",
					acceptanceCriteria: ["tests pass"],
					constraints: [],
					fileScopes: { include: ["src/implementation"], exclude: [] },
					dependencies: [],
					tokenBudget: 10,
				},
			],
		})
		const nodes = parseAndValidatePlan(userTask, { modes: ["code"], allowedScopes: ["src"], maxChildTokens: 20 })
		const store = memory()
		const start = vi.fn(async () => ({ taskId: "child", cancel: async () => undefined }))
		const service = new OrchestrationService(store.persistence, { start })
		await service.start({ ...input(nodes), settings: { ...settings, requirePlanApproval: true } })
		await service.dispatch("integration-run")
		expect(store.get()).toMatchObject({
			run: { rootTaskId: "user-task", status: "planned" },
			pendingApproval: "plan",
		})
		expect(store.get().nodes[0]).toMatchObject({ nodeId: "implementation", status: "planned" })
		expect(start).not.toHaveBeenCalled()
	})

	it("executes independent tasks concurrently while preserving isolated contracts", async () => {
		const store = memory()
		const start = vi.fn(async ({ node: current }) => ({
			taskId: current.nodeId,
			workspacePath: `/workers/${current.nodeId}`,
			cancel: async () => undefined,
		}))
		const service = new OrchestrationService(store.persistence, { maxParallel: 2, start })
		await service.start(input([node("api"), node("ui")]))
		await service.dispatch("integration-run")
		expect(start).toHaveBeenCalledTimes(2)
		expect(store.get().run.activeNodeIds).toEqual(["api", "ui"])
		expect(start.mock.calls.map(([call]) => call.node.inputContract.nodeId)).toEqual(["api", "ui"])
		expect(service.workerHandles.get("integration-run:api:1")?.workspacePath).not.toBe(
			service.workerHandles.get("integration-run:ui:1")?.workspacePath,
		)
	})

	it("completes a review-rework-review-integration cycle", async () => {
		const store = memory()
		const review = {
			review: vi
				.fn()
				.mockResolvedValueOnce({
					findings: [
						{
							id: "major-1",
							severity: "major",
							message: "Fix it",
							provenance: { artifactRefs: [], conflictRefs: [], detectedAt: 1 },
						},
					],
					artifactRefs: [],
				})
				.mockResolvedValueOnce({ findings: [], artifactRefs: [] }),
		}
		const integration = {
			check: vi.fn(async () => ({ safe: true, conflicts: [] })),
			integrate: vi.fn(async () => ({ artifactRefs: ["merged.patch"] })),
		}
		const service = new OrchestrationService(
			store.persistence,
			{
				start: async ({ node: current }) => ({
					taskId: `${current.nodeId}-${current.attempt}`,
					cancel: async () => undefined,
				}),
			},
			undefined,
			{ review, integration },
		)
		await service.start({ ...input([node("api")]), settings: { ...settings, reviewPolicy: "completion" } })
		await service.dispatch("integration-run")
		await service.handleChildEvent({
			runId: "integration-run",
			nodeId: "api",
			idempotencyKey: "attempt-1",
			status: "integrated",
			result: result("first"),
		})
		expect(store.get().nodes[0].status).toBe("running")
		await service.handleChildEvent({
			runId: "integration-run",
			nodeId: "api",
			idempotencyKey: "attempt-2",
			status: "integrated",
			result: result("fixed"),
		})
		expect(store.get().run.status).toBe("completed")
		expect(review.review).toHaveBeenCalledTimes(2)
		expect(integration.integrate).toHaveBeenCalledTimes(1)
	})

	it("records executor errors and fails dependent work", async () => {
		const store = memory()
		const service = new OrchestrationService(store.persistence, {
			start: vi.fn(async () => {
				throw new Error("worker unavailable")
			}),
		})
		await service.start(input([node("api"), node("ui", ["api"])]))
		await service.dispatch("integration-run")
		expect(store.get().nodes[0]).toMatchObject({
			status: "failed",
			error: { code: "dispatch_failed", recoverable: true },
		})
		expect(store.get().nodes[1].status).toBe("blocked")
		expect(store.get().run.status).toBe("dispatching")
	})

	it("recovers durable running workers after service restart", async () => {
		const store = memory()
		const first = new OrchestrationService(store.persistence, {
			start: async () => ({ taskId: "child-api", workspacePath: "/workers/api", cancel: async () => undefined }),
		})
		await first.start(input([node("api")]))
		await first.dispatch("integration-run")
		const recover = vi.fn(async (_run, current) => ({
			taskId: `recovered-${current.nodeId}`,
			workspacePath: `/workers/${current.nodeId}`,
			cancel: async () => undefined,
		}))
		const restarted = new OrchestrationService(store.persistence, { start: vi.fn(), recover })
		await restarted.recover()
		expect(recover).toHaveBeenCalledTimes(1)
		expect(restarted.workerHandles.get("integration-run:api:1")?.taskId).toBe("recovered-api")
		expect((await restarted.getSnapshot("integration-run")).nodes[0].status).toBe("running")
	})
})
