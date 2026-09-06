import { describe, expect, it, vi } from "vitest"
import { OrchestrationService } from "../service"
import type { OrchestrationPersistence } from "../persistence"
import type { OrchestrationSnapshot } from "../types"

const snapshot = (rootTaskId: string, overrides: Partial<OrchestrationSnapshot> = {}): OrchestrationSnapshot =>
	({
		run: {
			schemaVersion: 1,
			runId: "run",
			rootTaskId,
			status: "running",
			goal: "goal",
			planVersion: 1,
			nodeIds: ["node"],
			settingsSnapshot: { requireIntegrationApproval: false },
			createdAt: 1,
			updatedAt: 1,
			budget: { reserved: {}, used: {}, tokenLimit: undefined, costLimit: undefined },
			activeNodeIds: [],
			eventSequence: 0,
		},
		nodes: [
			{
				nodeId: "node",
				runId: "run",
				role: "worker",
				mode: "code",
				title: "node",
				objective: "node",
				inputContract: { tokenBudget: 1, fileScopes: { read: [], write: [] } },
				dependsOn: [],
				status: "failed",
				attempt: 0,
				maxAttempts: 2,
				artifactRefs: [],
				reviewRefs: [],
				conflictRefs: [],
				timestamps: {},
			},
		],
		events: [],
		capturedAt: 1,
		...overrides,
	}) as OrchestrationSnapshot

const serviceFor = (initial: OrchestrationSnapshot) => {
	let stored = structuredClone(initial)
	const persistence: OrchestrationPersistence = {
		load: async (runId) => (runId === stored.run.runId ? stored : undefined),
		save: async (value) => {
			stored = structuredClone(value)
		},
		scanRecoverable: async () => [],
	}
	return {
		service: new OrchestrationService(persistence, {
			start: vi.fn(async () => ({ taskId: "node", cancel: vi.fn() })),
		}),
		get: () => stored,
	}
}

describe("orchestration run ownership", () => {
	for (const operation of ["cancel", "retry", "approveIntegration"] as const) {
		it(`${operation} allows the owning rootTaskId`, async () => {
			const initial = snapshot(
				"owner",
				operation === "approveIntegration" ? { pendingApproval: "integration" } : {},
			)
			const { service } = serviceFor(initial)
			if (operation === "cancel") await service.cancel("run", "owner")
			if (operation === "retry") await service.retryNode("run", "node", "owner")
			if (operation === "approveIntegration") await service.approveIntegration("run", "owner")
		})

		it(`${operation} rejects a run owned by another rootTaskId without touching it`, async () => {
			const initial = snapshot(
				"owner",
				operation === "approveIntegration" ? { pendingApproval: "integration" } : {},
			)
			const { service, get } = serviceFor(initial)
			await expect(
				operation === "cancel"
					? service.cancel("run", "cancel reason", "attacker")
					: operation === "retry"
						? service.retryNode("run", "node", "attacker")
						: service.approveIntegration("run", "attacker"),
			).rejects.toMatchObject({ code: "orchestration_run_ownership_denied" })
			expect(get()).toEqual(initial)
		})
	}

	it("fails closed when the requesting rootTaskId is missing", async () => {
		const initial = snapshot("owner", { pendingApproval: "integration" })
		const { service, get } = serviceFor(initial)
		await expect(service.cancel("run", "")).rejects.toMatchObject({ code: "orchestration_run_ownership_denied" })
		await expect(service.retryNode("run", "node", "")).rejects.toMatchObject({
			code: "orchestration_run_ownership_denied",
		})
		await expect(service.approveIntegration("run", "")).rejects.toMatchObject({
			code: "orchestration_run_ownership_denied",
		})
		expect(get()).toEqual(initial)
	})

	it("rejects an unknown run without performing an operation", async () => {
		const { service } = serviceFor(snapshot("owner"))
		await expect(service.cancel("missing", "cancel reason", "owner")).rejects.toThrow("Unknown orchestration run")
		await expect(service.retryNode("missing", "node", "owner")).rejects.toThrow("Unknown orchestration run")
		await expect(service.approveIntegration("missing", "owner")).rejects.toThrow("Unknown orchestration run")
	})
})
