import { describe, expect, it, vi } from "vitest"
import { extractPlannerJson, parseAndValidatePlan, redactPlannerContext } from "../planner"

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
