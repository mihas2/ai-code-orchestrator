import { describe, expect, it, vi } from "vitest"
import { GlobalStateOrchestrationPersistence, type GlobalStateLike } from "../persistence"
import { OrchestrationService } from "../service"
import type { OrchestrationPersistence } from "../persistence"
import type { OrchestrationSnapshot, ResultContract, StartOrchestrationInput } from "../types"

const settings = {
	schemaVersion: 1 as const,
	enabled: true,
	orchestratorModeSlug: "orchestrator",
	maxParallelWorkers: 2,
	maxDepth: 2,
	timeoutMs: 10_000,
	maxReworkAttempts: 2,
	contextPolicy: "balanced" as const,
	conflictPolicy: "patch" as const,
	reviewPolicy: "off" as const,
	requirePlanApproval: false,
	requireIntegrationApproval: false,
	allowWorkerCommands: false,
	allowWorkerMcp: false,
	persistTranscripts: false,
	maxRunTokens: 1_000,
	maxChildTokens: 100,
}
const result = (patch: string): ResultContract => ({
	contractVersion: 1,
	status: "completed",
	summary: patch,
	filesRead: [],
	filesChanged: [],
	artifactRefs: [patch],
	tests: [],
	assumptions: [],
	risks: [],
	openQuestions: [],
	nextActions: [],
})
const node = (runId: string, id: string, dependsOn: string[] = [], scope = id) => ({
	nodeId: id,
	role: "worker",
	mode: "code",
	title: id,
	objective: id,
	dependsOn,
	inputContract: {
		contractVersion: 1 as const,
		runId,
		nodeId: id,
		goal: "goal",
		objective: id,
		acceptanceCriteria: [id === "a" ? "criterion-a" : "criterion-b"],
		constraints: [],
		mode: "code",
		fileScopes: { include: [scope], write: [scope], exclude: [] },
		dependencySummaries: [],
		relevantFacts: [],
		allowedTools: [],
		outputRequirements: ["ResultContract"],
		tokenBudget: 10,
		parentContextDigest: "digest",
	},
})
const input = (runId: string, nodes: StartOrchestrationInput["nodes"]): StartOrchestrationInput => ({
	runId,
	rootTaskId: "root",
	goal: "goal",
	settings,
	nodes,
})
const executor = (starts: string[], deferred?: (id: string) => void) => ({
	maxParallel: 2,
	start: vi.fn(async ({ node: n }: { node: { nodeId: string } }) => {
		starts.push(n.nodeId)
		deferred?.(n.nodeId)
		return { taskId: n.nodeId, cancel: async () => undefined }
	}),
})
class ClonePersistence implements OrchestrationPersistence {
	private snapshot?: OrchestrationSnapshot
	async load() {
		return this.snapshot && structuredClone(this.snapshot)
	}
	async save(snapshot: OrchestrationSnapshot) {
		this.snapshot = structuredClone(snapshot)
	}
	async scanRecoverable() {
		return this.snapshot ? [structuredClone(this.snapshot)] : []
	}
	get() {
		return structuredClone(this.snapshot!)
	}
	set(snapshot: OrchestrationSnapshot) {
		this.snapshot = structuredClone(snapshot)
	}
}
const complete = (runId: string, id: string, patch: string) => ({
	runId,
	nodeId: id,
	idempotencyKey: `${id}-${patch}`,
	status: "integrated" as const,
	result: result(patch),
	usage: { outputTokens: 1 },
})

describe("OrchestrationService DAG scheduler/recovery acceptance regressions", () => {
	it("integrates A ready_to_integrate before dispatching B and accepts the root only after both", async () => {
		const p = new ClonePersistence(),
			starts: string[] = [],
			integration = {
				check: vi.fn(async () => ({ safe: true, conflicts: [] })),
				integrate: vi.fn(async ({ node: n }: any) => ({ artifactRefs: [`merged-${n.nodeId}`] })),
			},
			accept = vi.fn(async () => ({ outcome: "accepted" as const }))
		const s = new OrchestrationService(p, executor(starts), undefined, { integration, acceptance: { accept } })
		await s.start(input("dag-accept", [node("dag-accept", "a"), node("dag-accept", "b", ["a"])]))
		await s.dispatch("dag-accept")
		await s.handleChildEvent(complete("dag-accept", "a", "a/a.patch"))
		expect(p.get().nodes[1].status).toBe("running")
		expect(starts).toEqual(["a", "b"])
		expect(accept).not.toHaveBeenCalled()
		await s.handleChildEvent(complete("dag-accept", "b", "b/b.patch"))
		expect(p.get().run.status).toBe("completed")
		expect(accept).toHaveBeenCalledTimes(1)
	})
	it("starts a node exactly once across concurrent deferred reserve route and start", async () => {
		const p = new ClonePersistence(),
			starts: string[] = [],
			gate = Promise.resolve()
		const s = new OrchestrationService(p, { ...executor(starts), maxParallel: 1 }, undefined, {
			route: {
				resolve: async () => {
					await gate
					return { provider: "p", model: "m" } as any
				},
			},
		})
		await s.start(input("race", [node("race", "a")]))
		await Promise.all([s.dispatch("race"), s.dispatch("race")])
		expect(starts).toEqual(["a"])
		expect(p.get().nodes[0].attempt).toBe(1)
	})
	it("recovers synthesizing and explicit resume without replaying integration or ambiguous acceptance; unknown usage stays reconciliation-required", async () => {
		const p = new ClonePersistence(),
			starts: string[] = [],
			integrate = vi.fn(async () => ({ artifactRefs: ["merged"] })),
			accept = vi.fn(async () => ({ outcome: "accepted" as const }))
		const first = new OrchestrationService(p, executor(starts), undefined, {
			integration: { check: async () => ({ safe: true, conflicts: [] }), integrate },
			acceptance: { accept },
		})
		await first.start(input("recover-synth", [node("recover-synth", "a")]))
		await first.dispatch("recover-synth")
		await first.handleChildEvent(complete("recover-synth", "a", "a/a.patch"))
		const persisted = p.get()
		persisted.run.status = "synthesizing"
		p.set(persisted)
		const restarted = new OrchestrationService(p, executor([], undefined), undefined, {
			integration: { check: async () => ({ safe: true, conflicts: [] }), integrate },
			acceptance: { accept },
		})
		await restarted.recover()
		expect(integrate).toHaveBeenCalledTimes(1)
		await restarted.resume("recover-synth")
		expect(p.get().run.status).toBe("completed")
		expect(integrate).toHaveBeenCalledTimes(1)
		expect(accept).toHaveBeenCalledTimes(1)
		const unknownStore = new ClonePersistence(),
			unknown = new OrchestrationService(unknownStore, executor([]))
		await unknown.start(input("unknown", [node("unknown", "a")]))
		await unknown.dispatch("unknown")
		await unknown.handleChildEvent({ ...complete("unknown", "a", "a/a.patch"), usageKnown: false })
		expect(unknownStore.get().run.budget.usageUnknown).toBe(true)
		expect(unknownStore.get().run.status).not.toBe("completed")
	})
	it("persists acceptance in-flight before the call and reconciles it after restart without replay", async () => {
		const p = new ClonePersistence(),
			starts: string[] = []
		const accept = vi.fn(async () => new Promise<never>(() => undefined))
		const first = new OrchestrationService(p, executor(starts), undefined, {
			acceptance: { accept },
		})
		await first.start(input("accept-crash", [node("accept-crash", "a")]))
		await first.dispatch("accept-crash")
		void first.handleChildEvent(complete("accept-crash", "a", "a.patch"))
		await vi.waitFor(() => expect(p.get().acceptanceInFlight?.attemptId).toBeTruthy())
		const attemptId = p.get().acceptanceInFlight!.attemptId
		const reconcile = vi.fn(async ({ attemptId: actual }: { attemptId: string }) => {
			expect(actual).toBe(attemptId)
			return { outcome: "accepted" as const }
		})
		const restarted = new OrchestrationService(p, executor([]), undefined, {
			acceptance: { accept, reconcile },
		})
		await restarted.recover()
		expect(p.get().run.status).toBe("paused")
		await restarted.resume("accept-crash")
		expect(p.get().run.status).toBe("completed")
		expect(accept).toHaveBeenCalledTimes(1)
		expect(reconcile).toHaveBeenCalledTimes(1)
	})
	it("fails closed when an in-flight acceptance has no durable reconciliation receipt", async () => {
		const p = new ClonePersistence(),
			s = new OrchestrationService(p, executor([]))
		await s.start(input("accept-ambiguous", [node("accept-ambiguous", "a")]))
		const snapshot = p.get()
		snapshot.nodes[0].status = "integrated"
		snapshot.run.status = "synthesizing"
		snapshot.acceptanceInFlight = { attemptId: "attempt-1", startedAt: 1 }
		p.set(snapshot)
		const accept = vi.fn(async () => ({ outcome: "accepted" as const }))
		const restarted = new OrchestrationService(p, executor([]), undefined, { acceptance: { accept } })
		await restarted.recover()
		await restarted.resume("accept-ambiguous")
		expect(p.get().run.status).toBe("paused")
		expect(p.get().run.error?.code).toBe("acceptance_reconciliation_required")
		expect(accept).not.toHaveBeenCalled()
	})
	it("blocks a persisted acceptance receipt whose identity does not match the in-flight attempt", async () => {
		const p = new ClonePersistence(),
			s = new OrchestrationService(p, executor([]))
		await s.start(input("accept-stale", [node("accept-stale", "a")]))
		const snapshot = p.get()
		snapshot.nodes[0].status = "integrated"
		snapshot.run.status = "synthesizing"
		snapshot.acceptanceInFlight = { attemptId: "current", startedAt: 1 }
		snapshot.acceptanceResult = { attemptId: "stale", result: { outcome: "accepted" }, recordedAt: 2 }
		p.set(snapshot)
		const accept = vi.fn(async () => ({ outcome: "accepted" as const }))
		const restarted = new OrchestrationService(p, executor([]), undefined, { acceptance: { accept } })
		await restarted.recover()
		await restarted.resume("accept-stale")
		expect(p.get().run.status).toBe("paused")
		expect(p.get().run.error?.code).toBe("acceptance_attempt_mismatch")
		expect(accept).not.toHaveBeenCalled()
	})
	it("does not accept a provider receipt when the service attempt identity changes", async () => {
		const p = new ClonePersistence(),
			s = new OrchestrationService(p, executor([]))
		await s.start(input("accept-service-attempt", [node("accept-service-attempt", "a")]))
		const snapshot = p.get()
		snapshot.nodes[0].status = "integrated"
		snapshot.run.status = "synthesizing"
		snapshot.acceptanceInFlight = { attemptId: "service-current", startedAt: 1 }
		snapshot.acceptanceResult = { attemptId: "provider-stale", result: { outcome: "accepted" }, recordedAt: 2 }
		p.set(snapshot)
		const accept = vi.fn(async () => ({ outcome: "accepted" as const }))
		const restarted = new OrchestrationService(p, executor([]), undefined, { acceptance: { accept } })
		await restarted.recover()
		await restarted.resume("accept-service-attempt")
		expect(p.get().run.status).toBe("paused")
		expect(p.get().run.error?.code).toBe("acceptance_attempt_mismatch")
		expect(accept).not.toHaveBeenCalled()
	})
	it("keeps the old ledger immutable when repository is created before restart and exposes charges in the new store", async () => {
		const p = new ClonePersistence(),
			s = new OrchestrationService(p, executor([]))
		await s.start(input("ledger", [node("ledger", "a")]))
		const repo = await s.getBudgetRepository("ledger", "root")
		const old = p.get().run.budget
		await repo.reserve("x", "execution", 3)
		expect(old.reservedTokens).toBe(0)
		const restarted = new OrchestrationService(p, executor([]))
		const fresh = await restarted.getBudgetRepository("ledger", "root")
		expect(fresh.getLedger().reservedTokens).toBe(3)
	})
	it("targeted reject-rework-accept uses a new patch and attempt without replaying unrelated nodes", async () => {
		const p = new ClonePersistence(),
			starts: string[] = [],
			applied: string[] = [],
			accept = vi
				.fn()
				.mockResolvedValueOnce({ outcome: "rework" as const, nodeIds: ["a"], feedback: "fix" })
				.mockResolvedValueOnce({ outcome: "accepted" as const })
		const integration = {
			check: vi.fn(async () => ({ safe: true, conflicts: [] })),
			integrate: vi.fn(async ({ artifacts }: any) => {
				applied.push(artifacts[0].ref)
				return { artifactRefs: artifacts.map((a: any) => `merged:${a.ref}`) }
			}),
		}
		const s = new OrchestrationService(p, executor(starts), undefined, { integration, acceptance: { accept } })
		await s.start(input("rework", [node("rework", "a"), node("rework", "b")]))
		await s.dispatch("rework")
		await s.handleChildEvent(complete("rework", "a", "a/old.patch"))
		await s.handleChildEvent(complete("rework", "b", "b/b.patch"))
		expect(starts).toEqual(["a", "b", "a"])
		await s.handleChildEvent(complete("rework", "a", "a/new.patch"))
		expect(applied).toEqual(["a/old.patch", "b/b.patch", "a/new.patch"])
		expect(new Set(integration.integrate.mock.calls.map(([call]) => call.idempotencyKey)).size).toBe(3)
		expect(p.get().nodes.find((n) => n.nodeId === "a")?.attempt).toBe(2)
		expect(p.get().nodes.find((n) => n.nodeId === "b")?.attempt).toBe(1)
		expect(p.get().run.status).toBe("completed")
	})
})
