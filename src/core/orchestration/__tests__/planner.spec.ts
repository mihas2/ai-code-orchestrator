import { describe, expect, it } from "vitest"
import { parseAndValidatePlan, redactPlannerContext } from "../planner"

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
	it("rejects malformed JSON", () => expect(() => parseAndValidatePlan("{", limits)).toThrow("malformed JSON"))
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
