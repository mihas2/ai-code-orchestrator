import { describe, expect, it, vi } from "vitest"
import {
	extractPlannerJson,
	isReviewOnlyGoal,
	parseAndValidatePlan,
	redactPlannerContext,
	validateReviewOnlyPlan,
} from "../planner"

const limits = { modes: ["code", "debug"], allowedScopes: ["src", "."], maxChildTokens: 100, maxRunTokens: 150 }
const plan = (
	nodes: unknown[] = [
		{
			id: "a",
			role: "worker",
			mode: "code",
			objective: "Implement",
			acceptanceCriteria: ["tests pass"],
			constraints: [],
			fileScopes: { include: ["src"], exclude: [], write: ["src/a.ts"] },
			dependencies: [],
			tokenBudget: 10,
		},
	],
) => JSON.stringify({ version: 1, nodes })

describe("planner adapter", () => {
	it("parses a valid plan", () => expect(parseAndValidatePlan(plan(), limits)[0].nodeId).toBe("a"))
	it("keeps plans with unknown roles and logs a diagnostic", () => {
		const logger = vi.fn()
		const result = parseAndValidatePlan(plan([{ ...JSON.parse(plan()).nodes[0], role: "future-role" }]), {
			...limits,
			roles: ["worker"],
			logger,
		})
		expect(result).toHaveLength(1)
		expect(logger).toHaveBeenCalledWith(
			"info",
			"Plan includes unknown role 'future-role', may fallback to default during resolution",
		)
	})
	it.each([
		["plain JSON", plan()],
		["fenced JSON", `\`\`\`json\n${plan()}\n\`\`\``],
		["surrounded JSON", `Here is the plan:\n${plan()}\nThat is all.`],
	])("extracts %s", (_, raw) => expect(parseAndValidatePlan(raw, limits)[0].nodeId).toBe("a"))
	it("extracts arrays while preserving nested strings", () =>
		expect(extractPlannerJson('prefix ["} ]", {"ok": true}] suffix')).toBe('["} ]", {"ok": true}]'))
	it("uses the second balanced JSON candidate when the first is invalid", () => {
		const raw = `{"version":1,"nodes":[]}\n${plan()}`
		expect(parseAndValidatePlan(raw, limits)[0].nodeId).toBe("a")
	})
	it("rejects a Russian review request when the planner returns an orchestrator child", () => {
		const goal = "сделай ревью проекта"
		const nodes = parseAndValidatePlan(
			plan([{ ...JSON.parse(plan()).nodes[0], role: "orchestrator", mode: "orchestrator" }]),
			{
				...limits,
				modes: [...limits.modes, "orchestrator"],
			},
		)
		expect(isReviewOnlyGoal(goal)).toBe(true)
		expect(() => validateReviewOnlyPlan(goal, nodes)).toThrow("reviewer node is required")
	})
	it("rejects review-only plans without a reviewer child", () => {
		const nodes = parseAndValidatePlan(plan(), limits)
		expect(() => validateReviewOnlyPlan("Review the completed implementation for regressions", nodes)).toThrow(
			"reviewer node is required",
		)
	})
	it("accepts review-only plans with a reviewer child", () => {
		const reviewerPlan = plan([{ ...JSON.parse(plan()).nodes[0], role: "reviewer", mode: "reviewer" }])
		const nodes = parseAndValidatePlan(reviewerPlan, { ...limits, modes: [...limits.modes, "reviewer"] })
		expect(() => validateReviewOnlyPlan("Audit the completed implementation", nodes)).not.toThrow()
	})
	it("rejects completely invalid input", () => {
		expect(() => parseAndValidatePlan("", limits)).toThrow("malformed JSON")
		expect(() => parseAndValidatePlan("{", limits)).toThrow("malformed JSON")
	})
	it("reports schema validation separately", () =>
		expect(() => parseAndValidatePlan('{"version":1,"nodes":[]}', limits)).toThrow("invalid plan"))
	it("rejects cycles", () =>
		expect(() =>
			parseAndValidatePlan(
				plan([
					{
						id: "a",
						role: "worker",
						mode: "code",
						objective: "a",
						acceptanceCriteria: [],
						constraints: [],
						fileScopes: { include: ["src"], exclude: [] },
						dependencies: ["b"],
						tokenBudget: 1,
					},
					{
						id: "b",
						role: "worker",
						mode: "code",
						objective: "b",
						acceptanceCriteria: [],
						constraints: [],
						fileScopes: { include: ["src"], exclude: [] },
						dependencies: ["a"],
						tokenBudget: 1,
					},
				]),
				limits,
			),
		).toThrow("cycle"))
	it("rejects unsafe scopes and unsupported modes", () =>
		expect(() =>
			parseAndValidatePlan(
				plan([
					{
						id: "a",
						role: "worker",
						mode: "shell",
						objective: "a",
						acceptanceCriteria: [],
						constraints: [],
						fileScopes: { include: ["../secret"], exclude: [] },
						dependencies: [],
						tokenBudget: 1,
					},
				]),
				limits,
			),
		).toThrow("unsupported_mode"))
	it("redacts secrets and bounds context", () =>
		expect(redactPlannerContext("api_key=secret ".repeat(1000))).not.toContain("secret"))
})
