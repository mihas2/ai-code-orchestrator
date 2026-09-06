import { describe, expect, it } from "vitest"
import { validateDag } from "../dag"
import { createBudget, reserveBudget } from "../budget"
import { GlobalStateOrchestrationPersistence } from "../persistence"

describe("orchestration core", () => {
	const contract = (id: string, write?: string[]) => ({
		contractVersion: 1 as const,
		runId: "r",
		nodeId: id,
		goal: "g",
		objective: "o",
		acceptanceCriteria: [],
		constraints: [],
		mode: "code",
		fileScopes: { include: [], exclude: [], write },
		dependencySummaries: [],
		relevantFacts: [],
		allowedTools: [],
		outputRequirements: [],
		tokenBudget: 1,
		parentContextDigest: "x",
	})
	it("detects cycles and duplicate writes", () => {
		const a: any = { nodeId: "a", dependsOn: ["b"], inputContract: contract("a", ["x"]) }
		const b: any = { nodeId: "b", dependsOn: ["a"], inputContract: contract("b", ["x"]) }
		expect(validateDag([a, b]).map((x) => x.code)).toEqual(
			expect.arrayContaining(["cycle", "duplicate_write_scope"]),
		)
	})
	it("enforces budget", () => {
		const b = createBudget(2)
		reserveBudget(b, 2)
		expect(() => reserveBudget(b, 1)).toThrow()
	})
	it("persists and scans", async () => {
		const data: any = {}
		const state = {
			get: (k: string) => data[k],
			update: async (k: string, v: any) => {
				data[k] = v
			},
		}
		const p = new GlobalStateOrchestrationPersistence(state)
		const s: any = {
			run: { runId: "r", status: "running", eventSequence: 0 },
			nodes: [],
			events: [],
			capturedAt: 1,
		}
		await p.save(s)
		expect((await p.scanRecoverable()).length).toBe(1)
	})
})
