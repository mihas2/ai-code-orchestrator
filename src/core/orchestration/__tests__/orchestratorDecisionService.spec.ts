import { describe, expect, it, vi } from "vitest"
import { OrchestratorDecisionService } from "../orchestratorDecisionService"
import { type LeadSession, type LeadSessionStore } from "../leadSession"
import type { BoundedLeadResult, StreamingLeadProvider } from "../leadProvider"
import { createBudget } from "../budget"
import { PersistedRootBudgetRepository } from "../budgetRepository"

const decision = (requestId: string, path: "direct" | "delegated" | "orchestrated" | "clarification" = "direct") => ({
	schemaVersion: 1,
	requestId,
	task: { summary: "task", goal: "goal" },
	decision: path,
	judgment: { label: "medium" as const, confidence: 0.9, rationale: "model assessed requirements" },
	phases: [{ id: "worker", summary: "complete task", dependsOn: [], roles: ["worker"], acceptance: ["tests pass"] }],
	dependencies: [],
	roles: [{ role: "worker", model: "lead-model", capabilities: [], budget: { tokens: 10, cost: 0, calls: 1 } }],
	acceptance: ["tests pass"],
	evidence: [],
	checkpoints: [],
	estimates: { durationMs: 100, budget: { tokens: 10, cost: 0, calls: 1 } },
	hardBudget: { tokens: 100, cost: 0, calls: 2 },
	nonGoals: [],
	risks: [],
	policyConstraints: [],
})

class MemoryStore implements LeadSessionStore {
	value?: LeadSession
	async load() {
		return this.value
	}
	async save(_key: string, value: LeadSession, expectedVersion?: number) {
		if (expectedVersion !== undefined && this.value?.version !== expectedVersion) throw new Error("stale")
		this.value = value
	}
}

describe("OrchestratorDecisionService production path", () => {
	it("calls the lead first and reuses an approved assessment", async () => {
		const store = new MemoryStore()
		const provider = {
			complete: vi.fn(
				async (request): Promise<BoundedLeadResult> => ({
					text: JSON.stringify(decision(request.requestId)),
					usage: { inputTokens: 20, outputTokens: 10, calls: 1, known: true },
					modelId: "lead-model",
				}),
			),
		} as unknown as StreamingLeadProvider
		const coordinator = new OrchestratorDecisionService(provider, store)
		const context = {
			rootTaskId: "root",
			request: { requestId: "req", summary: "short", goal: "goal" },
			systemPrompt: "canonical orchestrator prompt",
			configFingerprint: "cfg",
			workspaceFingerprint: "ws",
			allowedRoles: ["worker"],
			allowedModels: ["lead-model"],
			budget: { assessment: 100, execution: 100, acceptance: 20 },
			signal: new AbortController().signal,
		}
		const first = await coordinator.ensure(context)
		const second = await coordinator.ensure(context)
		expect(first.phase).toBe("executing")
		expect(second).toEqual(first)
		expect(provider.complete).toHaveBeenCalledTimes(1)
	})

	it("fails closed when provider usage is unknown", async () => {
		const provider = {
			complete: vi.fn(
				async (request): Promise<BoundedLeadResult> => ({
					text: JSON.stringify(decision(request.requestId)),
					usage: { calls: 1, known: false },
					modelId: "lead-model",
				}),
			),
		} as unknown as StreamingLeadProvider
		const result = await new OrchestratorDecisionService(provider, new MemoryStore()).ensure({
			rootTaskId: "root",
			request: { requestId: "req", summary: "task", goal: "goal" },
			systemPrompt: "canonical orchestrator prompt",
			configFingerprint: "cfg",
			workspaceFingerprint: "ws",
			allowedRoles: ["worker"],
			allowedModels: ["lead-model"],
			budget: { assessment: 100, execution: 100, acceptance: 20 },
			signal: new AbortController().signal,
		})
		expect(result.phase).toBe("blocked")
	})

	it("fails closed for an unavailable role or model", async () => {
		const provider = {
			complete: vi.fn(
				async (request): Promise<BoundedLeadResult> => ({
					text: JSON.stringify(decision(request.requestId)),
					usage: { calls: 1, known: true },
					modelId: "lead-model",
				}),
			),
		} as unknown as StreamingLeadProvider
		const result = await new OrchestratorDecisionService(provider, new MemoryStore()).ensure({
			rootTaskId: "root",
			request: { requestId: "req", summary: "task", goal: "goal" },
			systemPrompt: "canonical orchestrator prompt",
			configFingerprint: "cfg",
			workspaceFingerprint: "ws",
			allowedRoles: [],
			allowedModels: [],
			budget: { assessment: 100, execution: 100, acceptance: 20 },
			signal: new AbortController().signal,
		})
		expect(result.phase).toBe("blocked")
		expect(result.decision).toBeUndefined()
	})
	it.each(["direct", "delegated", "orchestrated", "clarification"] as const)(
		"durably returns the %s strategy instead of rejecting it",
		async (path) => {
			const store = new MemoryStore()
			const provider = {
				complete: vi.fn(
					async (request): Promise<BoundedLeadResult> => ({
						text: JSON.stringify(decision(request.requestId, path)),
						usage: { inputTokens: 1, outputTokens: 1, calls: 1, known: true },
						modelId: "lead-model",
					}),
				),
			} as unknown as StreamingLeadProvider
			const result = await new OrchestratorDecisionService(provider, store).ensure({
				rootTaskId: `root-${path}`,
				request: { requestId: `req-${path}`, summary: "task", goal: "goal" },
				systemPrompt: "canonical orchestrator prompt",
				configFingerprint: "cfg",
				workspaceFingerprint: "ws",
				allowedRoles: ["worker"],
				allowedModels: ["lead-model"],
				allowedCapabilities: [],
				budget: { assessment: 100, execution: 100, acceptance: 20 },
				signal: new AbortController().signal,
			})
			expect(result.decision?.decision).toBe(path)
			expect(store.value?.decision?.decision).toBe(path)
		},
	)
	it("charges known usage for invalid JSON and never reuses its reconciled acceptance key", async () => {
		const ledger = createBudget(100, undefined, 4)
		const repository = new PersistedRootBudgetRepository("root", "run", ledger)
		const provider = {
			complete: vi
				.fn<StreamingLeadProvider["complete"]>()
				.mockResolvedValueOnce({
					text: "not json",
					usage: { inputTokens: 2, outputTokens: 3, calls: 1, known: true },
					modelId: "lead",
				})
				.mockResolvedValueOnce({
					text: "still not json",
					usage: { inputTokens: 1, outputTokens: 1, calls: 1, known: true },
					modelId: "lead",
				}),
		} as unknown as StreamingLeadProvider
		const coordinator = new OrchestratorDecisionService(provider, new MemoryStore())
		const base = {
			rootTaskId: "root",
			requestId: "req",
			criteria: [],
			result: "result",
			evidenceRegistry: {
				requestId: "req",
				originalGoal: "goal",
				resultHash: "hash",
				workspaceRevision: "rev",
				records: [],
			},
			systemPrompt: "prompt",
			signal: new AbortController().signal,
			budget: 10,
			attempt: 1,
			budgetRepository: repository,
		}

		await expect(coordinator.accept({ ...base, attemptId: "attempt-1" })).rejects.toThrow(
			"Invalid lead acceptance decision",
		)
		await expect(coordinator.accept({ ...base, attemptId: "attempt-2" })).rejects.toThrow(
			"Invalid lead acceptance decision",
		)
		expect(provider.complete).toHaveBeenCalledTimes(2)
		expect(ledger.usedCalls).toBe(2)
		expect(ledger.used).toMatchObject({ inputTokens: 3, outputTokens: 4 })
		expect(Object.keys(ledger.usageByIdempotencyKey ?? {})).toEqual([
			"run:lead:acceptance:attempt-1",
			"run:lead:acceptance:attempt-2",
		])
	})

	it("does not call the provider when unknown usage survives into a new attempt", async () => {
		const ledger = createBudget(100)
		const repository = new PersistedRootBudgetRepository("root", "run", ledger)
		await repository.reserve("lead:acceptance:attempt-1", "acceptance", 10)
		await repository.charge("lead:acceptance:attempt-1", undefined, false)
		const provider = { complete: vi.fn() } as unknown as StreamingLeadProvider
		const coordinator = new OrchestratorDecisionService(provider, new MemoryStore())

		await expect(
			coordinator.accept({
				rootTaskId: "root",
				requestId: "req",
				criteria: [],
				result: "result",
				attemptId: "attempt-2",
				evidenceRegistry: {
					requestId: "req",
					originalGoal: "goal",
					resultHash: "hash",
					workspaceRevision: "rev",
					records: [],
				},
				systemPrompt: "prompt",
				signal: new AbortController().signal,
				budget: 10,
				attempt: 1,
				budgetRepository: repository,
			}),
		).rejects.toThrow("Budget usage is unknown")
		expect(provider.complete).not.toHaveBeenCalled()
		expect(ledger.reservedTokens).toBe(10)
	})
})
