import { describe, expect, it, vi } from "vitest"
import { LeadCoordinator } from "../leadCoordinator"
import { type LeadSession, type LeadSessionStore } from "../leadSession"
import type { BoundedLeadResult, StreamingLeadProvider } from "../leadProvider"

const decision = (requestId: string, path: "direct" | "delegated" | "orchestrated" = "direct") => ({
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

describe("LeadCoordinator production path", () => {
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
		const coordinator = new LeadCoordinator(provider, store)
		const context = {
			rootTaskId: "root",
			request: { requestId: "req", summary: "short", goal: "goal" },
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
		const result = await new LeadCoordinator(provider, new MemoryStore()).ensure({
			rootTaskId: "root",
			request: { requestId: "req", summary: "task", goal: "goal" },
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
})
