import { describe, expect, it, vi } from "vitest"
import { OrchestrationService } from "../service"
import type { OrchestrationPersistence } from "../persistence"
import type { StartOrchestrationInput, OrchestrationSnapshot } from "../types"

const settings = {
	schemaVersion: 1 as const,
	enabled: true,
	orchestratorModeSlug: "orchestrator",
	maxParallelWorkers: 3, // Allow multiple parallel workers
	maxDepth: 1,
	timeoutMs: 10000,
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
	maxChildTokens: 30,
} as const

const contract = (
	nodeId: string,
	fileScopes: { include: string[]; write?: string[]; exclude?: string[]; allowOverlapWith?: string[] },
) => ({
	contractVersion: 1 as const,
	runId: "r",
	nodeId,
	goal: "test",
	objective: nodeId,
	acceptanceCriteria: [],
	constraints: [],
	mode: "code",
	fileScopes: {
		include: fileScopes.include,
		write: fileScopes.write,
		exclude: fileScopes.exclude ?? [],
		allowOverlapWith: fileScopes.allowOverlapWith,
	},
	dependencySummaries: [],
	relevantFacts: [],
	allowedTools: [],
	outputRequirements: [],
	tokenBudget: 10,
	parentContextDigest: "x",
})

function memory(initial?: OrchestrationSnapshot) {
	let snapshot = initial
	const persistence: OrchestrationPersistence = {
		load: async () => snapshot,
		save: async (s) => {
			snapshot = structuredClone(s)
		},
		scanRecoverable: async () => (snapshot ? [snapshot] : []),
	}
	return { persistence, get: () => snapshot! }
}

describe("OrchestrationService scope overlap detection", () => {
	it("allows parallel execution for non-overlapping scopes", async () => {
		const store = memory()
		const starts: string[] = []
		const service = new OrchestrationService(
			store.persistence,
			{
				maxParallel: 3, // Allow parallel execution
				start: async ({ node }) => {
					starts.push(node.nodeId)
					return {
						taskId: "task-" + node.nodeId,
						cancel: async () => {},
						pid: undefined,
					}
				},
			},
			undefined,
		)

		const input: StartOrchestrationInput = {
			runId: "r",
			rootTaskId: "root",
			goal: "test",
			settings,
			nodes: [
				{
					nodeId: "node1",
					role: "code",
					mode: "code",
					title: "node1",
					objective: "node1",
					inputContract: contract("node1", { include: ["src/api"], write: ["src/api"] }),
				},
				{
					nodeId: "node2",
					role: "code",
					mode: "code",
					title: "node2",
					objective: "node2",
					inputContract: contract("node2", { include: ["src/web"], write: ["src/web"] }),
				},
			],
		}

		await service.start(input)
		await service.dispatch("r")

		// Both nodes should start in parallel since their scopes don't overlap
		expect(starts).toHaveLength(2)
		expect(starts).toContain("node1")
		expect(starts).toContain("node2")
	})

	it("prevents parallel execution for overlapping scopes", async () => {
		const store = memory()
		const starts: string[] = []
		const service = new OrchestrationService(
			store.persistence,
			{
				start: async ({ node }) => {
					starts.push(node.nodeId)
					return {
						taskId: "task-" + node.nodeId,
						cancel: async () => {},
						pid: undefined,
					}
				},
			},
			undefined,
		)

		const input: StartOrchestrationInput = {
			runId: "r",
			rootTaskId: "root",
			goal: "test",
			settings,
			nodes: [
				{
					nodeId: "node1",
					role: "code",
					mode: "code",
					title: "node1",
					objective: "node1",
					inputContract: contract("node1", { include: ["src/api"], write: ["src/api"] }),
				},
				{
					nodeId: "node2",
					role: "code",
					mode: "code",
					title: "node2",
					objective: "node2",
					inputContract: contract("node2", {
						include: ["src/api/users"],
						write: ["src/api/users"],
						allowOverlapWith: ["node1"],
					}),
				},
			],
		}

		await service.start(input)
		await service.dispatch("r")

		// Only one node should start since scopes overlap (src/api contains src/api/users)
		expect(starts).toHaveLength(1)
	})

	it("blocks all nodes when one has root scope", async () => {
		const store = memory()
		const starts: string[] = []
		const service = new OrchestrationService(
			store.persistence,
			{
				start: async ({ node }) => {
					starts.push(node.nodeId)
					return {
						taskId: "task-" + node.nodeId,
						cancel: async () => {},
						pid: undefined,
					}
				},
			},
			undefined,
		)

		const input: StartOrchestrationInput = {
			runId: "r",
			rootTaskId: "root",
			goal: "test",
			settings,
			nodes: [
				{
					nodeId: "node1",
					role: "code",
					mode: "code",
					title: "node1",
					objective: "node1",
					inputContract: contract("node1", { include: ["."], write: ["."] }),
				},
				{
					nodeId: "node2",
					role: "code",
					mode: "code",
					title: "node2",
					objective: "node2",
					inputContract: contract("node2", { include: ["src"], write: ["src"] }),
				},
			],
		}

		await service.start(input)
		await service.dispatch("r")

		// Only one node should start since "." overlaps with everything
		expect(starts).toHaveLength(1)
	})

	it("detects overlap with trailing slashes normalized", async () => {
		const store = memory()
		const starts: string[] = []
		const service = new OrchestrationService(
			store.persistence,
			{
				start: async ({ node }) => {
					starts.push(node.nodeId)
					return {
						taskId: "task-" + node.nodeId,
						cancel: async () => {},
						pid: undefined,
					}
				},
			},
			undefined,
		)

		const input: StartOrchestrationInput = {
			runId: "r",
			rootTaskId: "root",
			goal: "test",
			settings,
			nodes: [
				{
					nodeId: "node1",
					role: "code",
					mode: "code",
					title: "node1",
					objective: "node1",
					inputContract: contract("node1", { include: ["src/api/"], write: ["src/api/"] }),
				},
				{
					nodeId: "node2",
					role: "code",
					mode: "code",
					title: "node2",
					objective: "node2",
					inputContract: contract("node2", {
						include: ["src/api"],
						write: ["src/api"],
						allowOverlapWith: ["node1"],
					}),
				},
			],
		}

		await service.start(input)
		await service.dispatch("r")

		// Only one node should start - paths are the same after normalization
		expect(starts).toHaveLength(1)
	})

	it("uses write scopes when available, falls back to include", async () => {
		const store = memory()
		const starts: string[] = []
		const service = new OrchestrationService(
			store.persistence,
			{
				start: async ({ node }) => {
					starts.push(node.nodeId)
					return {
						taskId: "task-" + node.nodeId,
						cancel: async () => {},
						pid: undefined,
					}
				},
			},
			undefined,
		)

		const input: StartOrchestrationInput = {
			runId: "r",
			rootTaskId: "root",
			goal: "test",
			settings,
			nodes: [
				{
					nodeId: "node1",
					role: "code",
					mode: "code",
					title: "node1",
					objective: "node1",
					// No write scope, uses include
					inputContract: contract("node1", { include: ["src/api"] }),
				},
				{
					nodeId: "node2",
					role: "code",
					mode: "code",
					title: "node2",
					objective: "node2",
					// Has write scope
					inputContract: contract("node2", { include: ["src"], write: ["src/api/users"] }),
				},
			],
		}

		await service.start(input)
		await service.dispatch("r")

		// Only one node starts - node1's include overlaps with node2's write
		expect(starts).toHaveLength(1)
	})

	it("allows sequential execution after first node completes", async () => {
		const store = memory()
		const starts: string[] = []
		let completeNode1: (() => void) | undefined

		const service = new OrchestrationService(
			store.persistence,
			{
				start: async ({ node }) => {
					starts.push(node.nodeId)
					return {
						taskId: "task-" + node.nodeId,
						cancel: async () => {},
						pid: undefined,
					}
				},
			},
			undefined,
		)

		const input: StartOrchestrationInput = {
			runId: "r",
			rootTaskId: "root",
			goal: "test",
			settings,
			nodes: [
				{
					nodeId: "node1",
					role: "code",
					mode: "code",
					title: "node1",
					objective: "node1",
					inputContract: contract("node1", { include: ["src/api"], write: ["src/api"] }),
				},
				{
					nodeId: "node2",
					role: "code",
					mode: "code",
					title: "node2",
					objective: "node2",
					inputContract: contract("node2", {
						include: ["src/api"],
						write: ["src/api"],
						allowOverlapWith: ["node1"],
					}),
				},
			],
		}

		await service.start(input)
		await service.dispatch("r")

		// First node starts
		expect(starts).toHaveLength(1)
		expect(starts[0]).toBe("node1")

		// Simulate node1 completion
		await service.handleChildEvent({
			runId: "r",
			nodeId: "node1",
			status: "integrated",
			idempotencyKey: "key1",
			result: {
				contractVersion: 1,
				status: "completed",
				summary: "done",
				filesRead: [],
				filesChanged: [],
				artifactRefs: [],
				tests: [],
				assumptions: [],
				risks: [],
				openQuestions: [],
				nextActions: [],
			},
		})

		// Second node should now be able to start
		await service.dispatch("r")
		expect(starts).toHaveLength(2)
		expect(starts[1]).toBe("node2")
	})
})
