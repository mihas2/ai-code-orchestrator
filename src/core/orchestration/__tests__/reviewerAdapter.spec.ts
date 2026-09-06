import { describe, expect, it, vi } from "vitest"
import { OrchestrationSynthesisAdapter, ReviewerAdapter } from "../reviewerAdapter"
import type { OrchestrationNode, OrchestrationRun, ResultContract } from "../types"

const run = {
	runId: "run-1",
	settingsSnapshot: { reviewPolicy: "completion" },
} as OrchestrationRun
const node = {
	nodeId: "node-1",
	inputContract: { acceptanceCriteria: ["tests pass"] },
} as OrchestrationNode
const result = { contractVersion: 1, status: "completed", summary: "ok" } as ResultContract

const artifact = { ref: "artifact-1", path: "src/a.ts", preserved: true }

describe("reviewer adapters", () => {
	it("delegates the result contract and review criteria to the reviewer role", async () => {
		const runner = vi.fn(async () => [])
		const reviewer = new ReviewerAdapter(runner)

		await reviewer.review({ run, node, result, artifacts: [artifact], idempotencyKey: "review-1" })

		expect(runner).toHaveBeenCalledWith({
			run,
			node,
			result,
			artifacts: [artifact],
			idempotencyKey: "review-1",
			diff: undefined,
			acceptanceCriteria: ["tests pass"],
		})
	})

	it("rejects the default no-op reviewer when review is required", async () => {
		await expect(
			new ReviewerAdapter().review({ run, node, result, artifacts: [], idempotencyKey: "review-1" }),
		).rejects.toThrow("ReviewerRunner is not configured")
	})

	it("normalizes specification aliases and preserves structured findings", async () => {
		const adapter = new OrchestrationSynthesisAdapter()
		const reviewer = new ReviewerAdapter(async () => [
			{
				id: "finding-1",
				severity: "major",
				message: "Unsafe change",
				provenance: { artifactRefs: [], conflictRefs: [], detectedAt: 1 },
			},
		])

		const review = await reviewer.review({ run, node, result, artifacts: [artifact], idempotencyKey: "review-1" })
		expect(review.artifactRefs).toEqual(["artifact-1"])
		expect(review.findings[0]).toMatchObject({
			id: "finding-1",
			findingId: "finding-1",
			title: "Unsafe change",
			runId: "run-1",
			nodeId: "node-1",
		})
		expect(adapter).toBeDefined()
	})

	it("synthesizes finding ids using the compatibility id", async () => {
		const adapter = new OrchestrationSynthesisAdapter()
		const snapshot = {
			run,
			nodes: [{ nodeId: "node-1", status: "integrated" }],
			artifacts: [artifact],
			findings: [
				{
					id: "f",
					severity: "minor",
					message: "n",
					provenance: { artifactRefs: [], conflictRefs: [], detectedAt: 1 },
					findingId: "spec-f",
				},
			],
		} as any
		expect((await adapter.synthesize(snapshot)).reviewFindingIds).toEqual(["spec-f"])
	})

	it("allows an explicitly disabled review policy without a runner", async () => {
		const review = await new ReviewerAdapter().review({
			run: { ...run, settingsSnapshot: { reviewPolicy: "off" } } as OrchestrationRun,
			node,
			result,
			artifacts: [],
			idempotencyKey: "review-1",
		})

		expect(review.findings).toEqual([])
	})
})
