import { describe, expect, it } from "vitest"
import { buildEvidenceRegistry } from "../evidenceRegistry"

const snapshot: any = {
	run: { runId: "run", goal: "goal" },
	capturedAt: 1,
	nodes: [
		{
			nodeId: "n",
			attempt: 1,
			status: "integrated",
			artifactRefs: ["a"],
			outputContract: { status: "completed", tests: [{ command: "pnpm test", passed: true, exitCode: 0 }] },
		},
	],
	artifacts: [{ ref: "a", path: "src/a.ts", resultHash: "abc", preserved: true }],
	findings: [
		{
			id: "f",
			severity: "note",
			runId: "run",
			nodeId: "n",
			provenance: { artifactRefs: ["a"], conflictRefs: [], attempt: 1, detectedAt: 1 },
		},
	],
	events: [
		{ eventId: "e", idempotencyKey: "e", runId: "run", sequence: 1, timestamp: 1, type: "nodeReport", payload: {} },
	],
}

describe("snapshot evidence registry", () => {
	it("materializes stable result, artifact, test, review, and event records", () => {
		const first = buildEvidenceRegistry(snapshot, "request", "result", "revision")
		const second = buildEvidenceRegistry(snapshot, "request", "result", "revision")
		expect(first).toEqual(second)
		expect(first.records.map((record) => record.type)).toEqual([
			"node-result",
			"test",
			"artifact",
			"review",
			"event",
		])
		expect(first.records.find((record) => record.type === "test")).toMatchObject({ passed: true, exitCode: 0 })
		expect(first.records.every((record) => record.provenance)).toBe(true)
		expect(first.records.find((record) => record.type === "artifact")).toMatchObject({
			status: "available",
			hash: "abc",
		})
	})

	it("marks missing artifacts unavailable and drops stale review attempts", () => {
		const stale = structuredClone(snapshot)
		stale.artifacts = []
		stale.findings = [
			{
				...stale.findings![0],
				severity: "blocker",
				provenance: { ...stale.findings![0].provenance, attempt: 0 },
			},
		]
		const registry = buildEvidenceRegistry(stale, "request", "result", "revision")
		expect(registry.records.find((record) => record.type === "artifact")).toMatchObject({ status: "unavailable" })
		expect(registry.records.some((record) => record.type === "review")).toBe(false)
	})
})
