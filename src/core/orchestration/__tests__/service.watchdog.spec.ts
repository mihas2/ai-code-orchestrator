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
		expect(store.get().run.budget).toMatchObject({ reservedTokens: 1, reservedCalls: 1 })
	})

	it("releases a reservation when dispatch fails before returning a worker handle", async () => {
		const store = memory()
		const service = new OrchestrationService(store.persistence, {
			start: async () => {
				throw new Error("pre-dispatch")
			},
		})

		await service.start(input())
		await service.dispatch("run")

		expect(store.get().nodes[0]).toMatchObject({ status: "failed", error: { code: "dispatch_failed" } })
		expect(store.get().run.budget).toMatchObject({ reservedTokens: 0, reservedCalls: 0, usedCalls: 0 })
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

	it("retains the active worker reservation when recovery cannot reattach", async () => {
		const store = memory()
		const first = new OrchestrationService(store.persistence, {
			start: async () => ({ taskId: "task", cancel: async () => undefined }),
		})
		await first.start(input())
		await first.dispatch("run")

		const restarted = new OrchestrationService(store.persistence, {
			start: async () => ({ taskId: "unused", cancel: async () => undefined }),
			recover: async () => undefined,
		})
		await restarted.recover()

		expect(store.get().nodes[0]).toMatchObject({ status: "failed", error: { code: "recovery_unavailable" } })
		expect(store.get().run.budget).toMatchObject({ reservedTokens: 1, reservedCalls: 1 })
	})
	it("keeps handles for two concurrent runs with the same nodeId", async () => {
		const stores = [memory(), memory()]
		let index = 0
		const service = new OrchestrationService(
			{
				load: async (id) => stores[id === "one" ? 0 : 1].get(),
				save: async (s) => stores[s.run.runId === "one" ? 0 : 1].persistence.save(s),
				scanRecoverable: async () => [],
			},
			{ maxParallel: 1, start: async () => ({ taskId: `task-${++index}`, cancel: async () => undefined }) },
		)
		await service.start({ ...input(), runId: "one" })
		await service.start({ ...input(), runId: "two" })
		await service.dispatch("one")
		await service.dispatch("two")
		expect([...service.workerHandles.keys()]).toEqual(["one:node:1", "two:node:1"])
	})

	it("cancels only the requested run when nodeIds overlap", async () => {
		vi.useFakeTimers()
		const firstCancel = vi.fn(async () => undefined)
		const secondCancel = vi.fn(async () => undefined)
		const store = memory()
		const stores = [memory(), memory()]
		let run = 0
		const service = new OrchestrationService(
			{
				load: async (id) => stores[id === "one" ? 0 : 1].get(),
				save: async (s) => stores[s.run.runId === "one" ? 0 : 1].persistence.save(s),
				scanRecoverable: async () => [],
			},
			{
				maxParallel: 1,
				start: async () => ({ taskId: `task-${++run}`, cancel: run === 1 ? firstCancel : secondCancel }),
			},
		)
		await service.start({ ...input(), runId: "one" })
		await service.start({ ...input(), runId: "two" })
		await service.dispatch("one")
		await service.dispatch("two")
		await service.cancel("one", "root")
		expect(firstCancel).toHaveBeenCalledWith(undefined)
		expect(secondCancel).not.toHaveBeenCalled()
		expect(service.workerHandles.size).toBe(1)
		await vi.advanceTimersByTimeAsync(100)
		expect(secondCancel).toHaveBeenCalledWith("orchestration timeout")
	})

	it("does not let one run's watchdog clear another run's same-node watchdog", async () => {
		vi.useFakeTimers()
		const cancels = [vi.fn(async () => undefined), vi.fn(async () => undefined)]
		const stores = [memory(), memory()]
		let index = 0
		const service = new OrchestrationService(
			{
				load: async (id) => stores[id === "one" ? 0 : 1].get(),
				save: async (s) => stores[s.run.runId === "one" ? 0 : 1].persistence.save(s),
				scanRecoverable: async () => [],
			},
			{ maxParallel: 1, start: async () => ({ taskId: "task", cancel: cancels[index++] }) },
		)
		await service.start({ ...input(), runId: "one" })
		await service.start({ ...input(), runId: "two" })
		await service.dispatch("one")
		await service.dispatch("two")
		await service.handleChildEvent({ runId: "one", nodeId: "node", idempotencyKey: "done-one", status: "failed" })
		await vi.advanceTimersByTimeAsync(100)
		expect(cancels[0]).not.toHaveBeenCalled()
		expect(cancels[1]).toHaveBeenCalledTimes(1)
	})
})
