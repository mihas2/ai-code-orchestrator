import { afterEach, describe, expect, it, vi } from "vitest"
import { OrchestrationService } from "../service"
import type { OrchestrationPersistence } from "../persistence"
import type { OrchestrationSnapshot, StartOrchestrationInput } from "../types"

const settings = {
	schemaVersion: 1 as const,
	enabled: true,
	orchestratorModeSlug: "orchestrator",
	maxParallelWorkers: 1,
	maxDepth: 1,
	timeoutMs: 100,
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
	maxChildTokens: 100,
}

const input = (): StartOrchestrationInput => ({
	runId: "run",
	rootTaskId: "root",
	goal: "goal",
	settings,
	nodes: [
		{
			nodeId: "node",
			role: "code",
			mode: "code",
			title: "node",
			objective: "node",
			inputContract: {
				contractVersion: 1,
				runId: "run",
				nodeId: "node",
				goal: "goal",
				objective: "node",
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
		},
	],
})

function memory() {
	let snapshot: OrchestrationSnapshot | undefined
	const persistence: OrchestrationPersistence = {
		load: async () => snapshot,
		save: async (next) => {
			snapshot = structuredClone(next)
		},
		scanRecoverable: async () => (snapshot ? [snapshot] : []),
	}
	return { persistence, get: () => snapshot! }
}

afterEach(() => vi.useRealTimers())

describe("OrchestrationService watchdog", () => {
	it("fails a silent node after timeout and cancels its execution handle", async () => {
		vi.useFakeTimers()
		const store = memory()
		const cancel = vi.fn(async () => undefined)
		const service = new OrchestrationService(store.persistence, {
			start: async () => ({ taskId: "task", cancel }),
		})

		await service.start(input())
		await service.dispatch("run")
		await vi.advanceTimersByTimeAsync(100)

		expect(cancel).toHaveBeenCalledWith("orchestration timeout")
		expect(store.get().nodes[0].status).toBe("failed")
		expect(store.get().nodes[0].error).toMatchObject({ code: "timeout", recoverable: true })
		expect(store.get().run.activeNodeIds).toEqual([])
	})

	it("clears the watchdog when a child event arrives", async () => {
		vi.useFakeTimers()
		const store = memory()
		const cancel = vi.fn(async () => undefined)
		const service = new OrchestrationService(store.persistence, {
			start: async () => ({ taskId: "task", cancel }),
		})
		await service.start(input())
		await service.dispatch("run")
		await service.handleChildEvent({ runId: "run", nodeId: "node", idempotencyKey: "done", status: "failed" })
		await vi.advanceTimersByTimeAsync(100)

		expect(cancel).not.toHaveBeenCalled()
	})
})
