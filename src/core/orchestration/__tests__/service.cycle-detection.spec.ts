import { describe, expect, it, vi } from "vitest"
import { OrchestrationService } from "../service"
import type { OrchestrationPersistence } from "../persistence"
import type { OrchestrationSnapshot, StartOrchestrationInput } from "../types"

const settings = {
	schemaVersion: 1 as const,
	enabled: true,
	orchestratorModeSlug: "orchestrator",
	maxParallelWorkers: 2,
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
	maxRunTokens: 100,
	maxChildTokens: 100,
} as const

const node = (nodeId: string, dependsOn: string[] = []) => ({
	nodeId,
	role: "code",
	mode: "code",
	title: nodeId,
	objective: nodeId,
	dependsOn,
	inputContract: {
		contractVersion: 1 as const,
		runId: "run",
		nodeId,
		goal: "goal",
		objective: nodeId,
		acceptanceCriteria: [],
		constraints: [],
		mode: "code",
		fileScopes: { include: [], exclude: [] },
		dependencySummaries: [],
		relevantFacts: [],
		allowedTools: [],
		outputRequirements: [],
		tokenBudget: 1,
		parentContextDigest: "digest",
	},
})

const input = (nodes: ReturnType<typeof node>[]): StartOrchestrationInput => ({
	runId: "run",
	rootTaskId: "root",
	goal: "goal",
	settings,
	nodes,
})

function persistence() {
	let snapshot: OrchestrationSnapshot | undefined
	return {
		persistence: {
			load: async () => snapshot,
			save: async (value) => {
				snapshot = structuredClone(value)
			},
			scanRecoverable: async () => (snapshot ? [snapshot] : []),
		} satisfies OrchestrationPersistence,
		get: () => snapshot,
	}
}

function service(starts: string[] = [], logger?: ReturnType<typeof vi.fn>) {
	const store = persistence()
	const orchestration = new OrchestrationService(
		store.persistence,
		{
			start: async ({ node: child }) => {
				starts.push(child.nodeId)
				return { taskId: child.nodeId, cancel: async () => undefined }
			},
		},
		undefined,
		logger ? { logger } : undefined,
	)
	return { orchestration, store }
}

describe("OrchestrationService DAG cycle detection", () => {
	it("accepts an acyclic three-node chain and dispatches its first node", async () => {
		const starts: string[] = []
		const { orchestration } = service(starts)
		await orchestration.start(input([node("A"), node("B", ["A"]), node("C", ["B"])]))
		await orchestration.dispatch("run")
		expect(starts).toEqual(["A"])
	})

	it.each([
		[
			[node("A", ["B"]), node("B", ["A"])],
			["A", "B", "A"],
		],
		[
			[node("A", ["C"]), node("B", ["A"]), node("C", ["B"])],
			["A", "C", "B", "A"],
		],
		[[node("A", ["A"])], ["A", "A"]],
		[
			[node("A"), node("B", ["A", "D"]), node("C", ["B"]), node("D", ["C"]), node("E")],
			["B", "D", "C", "B"],
		],
	])("rejects cycle %j with its path", async (nodes, cycle) => {
		const starts: string[] = []
		const logger = vi.fn()
		const { orchestration } = service(starts, logger)
		await expect(orchestration.start(input(nodes))).rejects.toMatchObject({
			error: "Cyclic dependency detected",
			cycle,
		})
		expect(starts).toEqual([])
		expect(logger).toHaveBeenCalledWith("error", { event: "dag_cycle_detected", cycle })
	})

	it("accepts an empty DAG", async () => {
		const { orchestration } = service()
		await expect(orchestration.start(input([]))).resolves.toMatchObject({ nodeIds: [] })
	})
})
