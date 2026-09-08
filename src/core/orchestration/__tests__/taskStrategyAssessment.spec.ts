import { describe, expect, it, vi } from "vitest"
import { assessTaskStrategy, taskStrategyFingerprint, type AssessmentRepository } from "../taskStrategyAssessment"

const assessment = (confidence = 0.9, decision: "direct" | "delegated" | "orchestrated" = "orchestrated") => ({
	schemaVersion: 1,
	requestId: "r1",
	task: { summary: "task", goal: "goal" },
	decision,
	judgment: { label: "high", confidence, rationale: "many steps" },
	phases: [{ id: "p1", summary: "do", dependsOn: [], roles: ["lead"], acceptance: ["done"] }],
	dependencies: [],
	roles: [{ role: "lead", model: "m1", capabilities: [], budget: { tokens: 10, cost: 1, calls: 1 } }],
	acceptance: ["done"],
	evidence: [],
	checkpoints: [],
	estimates: { durationMs: 1, budget: { tokens: 10, cost: 1, calls: 1 } },
	hardBudget: { tokens: 100, cost: 10, calls: 2 },
	nonGoals: [],
	risks: [],
	policyConstraints: [],
})
const options = (assess: (r: any, s: AbortSignal) => Promise<unknown>, extra = {}) => ({
	assess,
	policy: { roles: ["lead"], models: ["m1"], ceiling: { tokens: 1000, cost: 10, calls: 2 } },
	reservation: { tokens: 100, cost: 1, calls: 1 },
	timeoutMs: 100,
	...extra,
})

describe("task strategy assessment", () => {
	it("parses, validates, and reuses persisted approval", async () => {
		const store = new Map<string, any>(),
			repo: AssessmentRepository = {
				load: async (k) => store.get(k),
				save: async (v) => void store.set(v.requestFingerprint, v),
			}
		const assess = vi.fn(async () => assessment())
		const request = { requestId: "r1", summary: " task ", goal: "goal" }
		const first = await assessTaskStrategy(request, options(assess, { repository: repo }))
		const second = await assessTaskStrategy(request, options(assess, { repository: repo }))
		expect(first.status).toBe("approved")
		expect(second).toEqual(first)
		expect(assess).toHaveBeenCalledTimes(1)
	})
	it("repairs exactly once and blocks if still invalid", async () => {
		const assess = vi.fn(async () => ({})),
			repair = vi.fn(async () => ({}))
		const result = await assessTaskStrategy(
			{ requestId: "r1", summary: "x", goal: "y" },
			options(assess, { repair }),
		)
		expect(result.status).toBe("blocked")
		expect(repair).toHaveBeenCalledTimes(1)
		expect(result.attempts).toBe(2)
	})
	it("clarifies low confidence and rejects child calls", async () => {
		const assess = vi.fn(async () => assessment(0.2))
		expect((await assessTaskStrategy({ requestId: "r1", summary: "x", goal: "y" }, options(assess))).status).toBe(
			"needs_clarification",
		)
		expect(
			(await assessTaskStrategy({ requestId: "r1", summary: "x", goal: "y" }, options(assess, { isRoot: false })))
				.status,
		).toBe("blocked")
		expect(assess).toHaveBeenCalledTimes(1)
	})
	it("has deterministic fingerprints", () =>
		expect(taskStrategyFingerprint({ requestId: "r", summary: " x ", goal: "y" })).toBe(
			taskStrategyFingerprint({ requestId: "r", summary: "x", goal: "y" }),
		))
	it("follows model decisions instead of text length", async () => {
		const assess = vi
			.fn()
			.mockResolvedValueOnce(assessment(0.9, "direct"))
			.mockResolvedValueOnce(assessment(0.9, "orchestrated"))
		const short = await assessTaskStrategy({ requestId: "short", summary: "x", goal: "y" }, options(assess))
		const complex = await assessTaskStrategy(
			{ requestId: "complex", summary: "x".repeat(5000), goal: "y".repeat(5000) },
			options(assess),
		)
		expect(short.assessment?.decision).toBe("direct")
		expect(complex.assessment?.decision).toBe("orchestrated")
	})
	it("blocks policy and budget violations", async () => {
		const policyResult = await assessTaskStrategy(
			{ requestId: "policy", summary: "x", goal: "y" },
			options(async () => ({ ...assessment(), roles: [{ ...assessment().roles[0], model: "m2" }] })),
		)
		const budgetResult = await assessTaskStrategy(
			{ requestId: "budget", summary: "x", goal: "y" },
			options(async () => ({
				...assessment(),
				usage: { inputTokens: 900, outputTokens: 200, cost: 0, calls: 1 },
			})),
		)
		expect(policyResult.status).toBe("blocked")
		expect(budgetResult.status).toBe("blocked")
	})
	it("returns timeout when the model aborts on deadline", async () => {
		const result = await assessTaskStrategy(
			{ requestId: "timeout", summary: "x", goal: "y" },
			options(
				(_request, signal) =>
					new Promise((_, reject) => {
						signal.addEventListener("abort", () => reject(new Error("cancelled")), { once: true })
					}),
				{ timeoutMs: 1 },
			),
		)
		expect(result.status).toBe("timeout")
	})
	it("distinguishes model abort from timeout and rejects excessive reservations", async () => {
		const aborted = await assessTaskStrategy(
			{ requestId: "aborted", summary: "x", goal: "y" },
			options(async () => {
				throw new Error("cancelled")
			}),
		)
		const overReserved = await assessTaskStrategy(
			{ requestId: "reserved", summary: "x", goal: "y" },
			options(async () => assessment(), { reservation: { tokens: 1001, cost: 1, calls: 1 } }),
		)
		expect(aborted.status).toBe("aborted")
		expect(overReserved.status).toBe("blocked")
	})
})
