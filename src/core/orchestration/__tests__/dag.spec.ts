import { describe, expect, it } from "vitest"
import { validateDag } from "../dag"
import type { PlanNodeInput } from "../types"

const node = (nodeId: string, write: string[], allowOverlapWith?: string[]): PlanNodeInput =>
	({
		nodeId,
		role: "worker",
		mode: "code",
		title: nodeId,
		objective: "test",
		inputContract: {
			contractVersion: 1,
			runId: "run",
			nodeId,
			goal: "test",
			objective: "test",
			acceptanceCriteria: [],
			constraints: [],
			mode: "code",
			fileScopes: { include: [], exclude: [], write, allowOverlapWith },
			dependencySummaries: [],
			relevantFacts: [],
			allowedTools: [],
			outputRequirements: [],
			tokenBudget: 1,
			parentContextDigest: "digest",
		},
	}) as PlanNodeInput

describe("validateDag write-scope overlap", () => {
	it("detects hierarchical overlap between a directory and a descendant", () => {
		const issues = validateDag([node("parent", ["src"]), node("child", ["src/a.ts"])])

		expect(issues).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ code: "duplicate_write_scope", nodeIds: ["parent", "child"] }),
			]),
		)
	})

	it("allows explicitly permitted overlap in either node", () => {
		const issues = validateDag([node("parent", ["src"], ["child"]), node("child", ["src/a.ts"])])

		expect(issues.some((issue) => issue.code === "duplicate_write_scope")).toBe(false)
	})

	it("compares path segments rather than string prefixes", () => {
		const issues = validateDag([node("parent", ["src"]), node("sibling", ["src-other/a.ts"])])

		expect(issues.some((issue) => issue.code === "duplicate_write_scope")).toBe(false)
	})
})
