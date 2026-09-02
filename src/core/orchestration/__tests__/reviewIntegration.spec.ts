import { describe, expect, it, vi } from "vitest"
import { coordinateIntegration, createFinding, reviewBlocks, synthesizeSnapshot } from "../reviewIntegration"
import type { IntegrationAdapter, OrchestrationSnapshot } from "../types"

const base = {
	runId: "r",
	rootTaskId: "root",
	status: "integrating" as const,
	goal: "goal",
	planVersion: 1,
	nodeIds: ["n"],
	settingsSnapshot: { reviewPolicy: "completion", requireIntegrationApproval: true } as any,
	schemaVersion: 1 as const,
	createdAt: 1,
	updatedAt: 1,
	budget: {} as any,
	activeNodeIds: [],
	eventSequence: 0,
}
const node = {
	nodeId: "n",
	runId: "r",
	status: "ready_to_integrate" as const,
	title: "Node",
	dependsOn: [],
	outputContract: { summary: "done" },
	artifactRefs: [],
	reviewRefs: [],
	conflictRefs: [],
} as any
const adapter: IntegrationAdapter = {
	check: vi.fn(async () => ({ safe: true, conflicts: [] })),
	integrate: vi.fn(async () => ({ artifactRefs: ["integrated"] })),
}

describe("review and integration coordination", () => {
	it("blocks major findings and preserves artifacts without approval", async () => {
		const finding = createFinding({ id: "f", severity: "major", message: "unsafe" }, ["a"])
		expect(reviewBlocks({ policy: "completion", findings: [finding] })).toBe(true)
		const result = await coordinateIntegration({
			run: base,
			node,
			artifacts: [{ ref: "a", path: "a.ts", preserved: true }],
			adapter,
			approved: false,
		})
		expect(result).toMatchObject({ status: "blocked", artifactRefs: ["a"] })
		expect(adapter.integrate).not.toHaveBeenCalled()
	})

	it("refuses stale bases before adapter mutation", async () => {
		const result = await coordinateIntegration({
			run: base,
			node,
			artifacts: [{ ref: "a", path: "a.ts", baseHash: "old", preserved: true }],
			adapter,
			approved: true,
			baseHash: "new",
		})
		expect(result.status).toBe("blocked")
		expect(adapter.integrate).not.toHaveBeenCalled()
	})

	it("creates a deterministic fallback synthesis", async () => {
		const snapshot = {
			run: base,
			nodes: [{ ...node, status: "integrated" }],
			events: [],
			capturedAt: 1,
		} as OrchestrationSnapshot
		expect((await synthesizeSnapshot(snapshot)).status).toBe("completed")
	})
})
