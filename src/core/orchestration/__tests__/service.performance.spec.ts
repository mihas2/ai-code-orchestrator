import { describe, expect, it, vi } from "vitest"
import { OrchestrationService } from "../service"
import { redactPlannerContext } from "../planner"
import type { OrchestrationPersistence } from "../persistence"
import type { OrchestrationSnapshot, StartOrchestrationInput } from "../types"

const settings = {
	schemaVersion: 1 as const,
	enabled: true,
	orchestratorModeSlug: "orchestrator",
	maxParallelWorkers: 4,
	maxDepth: 4,
	timeoutMs: 10_000,
	maxReworkAttempts: 1,
	contextPolicy: "balanced" as const,
	conflictPolicy: "patch" as const,
	reviewPolicy: "off" as const,
	requirePlanApproval: false,
	requireIntegrationApproval: false,
	allowWorkerCommands: false,
	allowWorkerMcp: false,
	persistTranscripts: false,
	maxRunTokens: 320,
	maxChildTokens: 10,
}

function store() {
	let snapshot: OrchestrationSnapshot | undefined
	const persistence: OrchestrationPersistence = {
		load: async () => snapshot,
		save: async (value) => void (snapshot = structuredClone(value)),
		scanRecoverable: async () => (snapshot ? [snapshot] : []),
	}
	return { persistence, get: () => snapshot! }
}

const makeNodes = (count: number): StartOrchestrationInput["nodes"] =>
	Array.from({ length: count }, (_, index) => ({
		nodeId: `node-${index}`,
		role: "worker",
		mode: "code",
		title: `Node ${index}`,
		objective: `Process shard ${index}`,
		dependsOn: index < 4 ? [] : [`node-${index - 4}`],
		inputContract: {
			contractVersion: 1 as const,
			runId: "performance-run",
			nodeId: `node-${index}`,
			goal: "Process repository",
			objective: `Process shard ${index}`,
			acceptanceCriteria: [],
			constraints: [],
			mode: "code",
			fileScopes: { include: [`src/shard-${index}`], exclude: [], write: [`src/shard-${index}`] },
			dependencySummaries: [],
			relevantFacts: [],
			allowedTools: [],
			outputRequirements: [],
			tokenBudget: 10,
			parentContextDigest: "root",
		},
	}))

const input = (nodes = makeNodes(32)): StartOrchestrationInput => ({
	runId: "performance-run",
	rootTaskId: "root",
	goal: "Process repository",
	settings,
	nodes,
})

describe("OrchestrationService performance and limits", () => {
	it("schedules a 32-node DAG without exceeding limited parallelism", async () => {
		const memory = store()
		let active = 0
		let peak = 0
		const service = new OrchestrationService(memory.persistence, {
			maxParallel: 4,
			start: vi.fn(async ({ node }) => {
				active++
				peak = Math.max(peak, active)
				return { taskId: node.nodeId, cancel: async () => undefined }
			}),
		})
		await service.start(input())
		for (let wave = 0; wave < 8; wave++) {
			await service.dispatch("performance-run")
			const running = memory.get().nodes.filter((node) => node.status === "running")
			expect(running).toHaveLength(4)
			expect(memory.get().run.activeNodeIds.length).toBeLessThanOrEqual(4)
			for (const node of running) {
				active--
				await service.handleChildEvent({
					runId: "performance-run",
					nodeId: node.nodeId,
					idempotencyKey: `done-${node.nodeId}`,
					status: "integrated",
					usage: { inputTokens: 5, outputTokens: 2 },
				})
			}
		}
		expect(peak).toBe(4)
		expect(memory.get().nodes.every((node) => node.status === "integrated")).toBe(true)
		expect(memory.get().run.status).toBe("completed")
	}, 10_000)

	it("bounds and redacts a large repository context before planning", () => {
		const repositoryContext = `${"export const value = 1\n".repeat(100_000)}\napi_key=super-secret`
		const optimized = redactPlannerContext(repositoryContext, 12_000)
		expect(optimized.length).toBeLessThanOrEqual(12_000)
		expect(optimized).not.toContain("super-secret")
		expect(optimized).toContain("export const value")
	})

	it("enforces child budgets before the hierarchical run budget", async () => {
		const childStore = store()
		const start = vi.fn(async ({ node }) => ({ taskId: node.nodeId, cancel: async () => undefined }))
		const oversized = makeNodes(1)
		oversized[0].inputContract.tokenBudget = 11
		const childService = new OrchestrationService(childStore.persistence, { maxParallel: 4, start })
		await childService.start(input(oversized))
		await childService.dispatch("performance-run")
		expect(childStore.get().nodes[0].error?.code).toBe("child_budget_exceeded")
		expect(start).not.toHaveBeenCalled()

		const runStore = store()
		const runService = new OrchestrationService(runStore.persistence, { maxParallel: 4, start })
		await runService.start({ ...input(makeNodes(2)), settings: { ...settings, maxRunTokens: 15 } })
		await runService.dispatch("performance-run")
		expect(runStore.get().nodes.map((node) => node.status)).toEqual(["running", "failed"])
		expect(runStore.get().nodes[1].error?.code).toBe("run_budget_exceeded")
		expect(runStore.get().run.budget.reservedTokens).toBe(10)
	})
})
