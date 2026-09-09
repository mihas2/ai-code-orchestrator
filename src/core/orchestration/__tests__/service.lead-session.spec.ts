import { describe, expect, it, vi, beforeEach } from "vitest"
import { OrchestrationService } from "../service"
import type { OrchestrationPersistence } from "../persistence"
import type { OrchestrationSnapshot, ChildEvent, ExecutionHandle } from "../types"
import { createBudget } from "../budget"

const createSnapshot = (overrides: Partial<OrchestrationSnapshot> = {}): OrchestrationSnapshot => ({
	run: {
		schemaVersion: 1,
		runId: "test-run",
		rootTaskId: "root-task",
		status: "running",
		goal: "test goal",
		planVersion: 1,
		nodeIds: ["node-1"],
		settingsSnapshot: {
			requireIntegrationApproval: false,
			requirePlanApproval: false,
			maxParallelWorkers: 2,
			maxReworkAttempts: 2,
			reviewPolicy: "off",
			timeoutMs: 30000,
			maxRunTokens: 100000,
		},
		createdAt: Date.now(),
		updatedAt: Date.now(),
		budget: createBudget(100000, 100, 10),
		activeNodeIds: ["node-1"],
		eventSequence: 0,
	},
	nodes: [
		{
			nodeId: "node-1",
			runId: "test-run",
			role: "worker",
			mode: "code",
			title: "Test Node",
			objective: "Test objective",
			dependsOn: [],
			status: "running",
			attempt: 1,
			maxAttempts: 3,
			inputContract: {
				contractVersion: 1,
				runId: "test-run",
				nodeId: "node-1",
				goal: "test",
				objective: "test",
				acceptanceCriteria: [],
				constraints: [],
				mode: "code",
				fileScopes: { include: ["."], exclude: [], write: ["."] },
				dependencySummaries: [],
				relevantFacts: [],
				allowedTools: [],
				outputRequirements: [],
				tokenBudget: 10000,
				parentContextDigest: "digest",
			},
			artifactRefs: [],
			reviewRefs: [],
			conflictRefs: [],
			timestamps: { running: Date.now() },
		},
	],
	events: [],
	capturedAt: Date.now(),
	...overrides,
})

describe("OrchestrationService lead session improvements", () => {
	describe("(1) handleChildEvent stale event validation", () => {
		it("ignores events with mismatched attempt number", async () => {
			const snapshot = createSnapshot()
			snapshot.nodes[0].attempt = 2
			let stored = structuredClone(snapshot)
			const persistence: OrchestrationPersistence = {
				load: vi.fn(async () => stored),
				save: vi.fn(async (s) => {
					stored = structuredClone(s)
				}),
				scanRecoverable: vi.fn(async () => []),
			}
			const mockHandle: ExecutionHandle = { taskId: "task-123", cancel: vi.fn() }
			const service = new OrchestrationService(
				persistence,
				{
					start: vi.fn(async () => mockHandle),
				},
				undefined,
				{},
			)
			service["snapshots"].set("test-run", snapshot)
			service["handles"].set("test-run:node-1:2", mockHandle)

			const staleEvent: ChildEvent = {
				runId: "test-run",
				nodeId: "node-1",
				attempt: 1, // Old attempt
				idempotencyKey: "stale-event",
				status: "integrated",
				result: {
					contractVersion: 1,
					status: "completed",
					summary: "done",
					filesRead: [],
					filesChanged: [],
					artifactRefs: [],
					tests: [],
					assumptions: [],
					risks: [],
					openQuestions: [],
					nextActions: [],
				},
			}

			await service.handleChildEvent(staleEvent)

			// Node should remain in running state with attempt 2
			const updated = await service.getSnapshot("test-run")
			expect(updated.nodes[0].status).toBe("running")
			expect(updated.nodes[0].attempt).toBe(2)
			expect(updated.events).toHaveLength(0)
		})

		it("ignores events with mismatched runtime identity", async () => {
			const snapshot = createSnapshot()
			let stored = structuredClone(snapshot)
			const persistence: OrchestrationPersistence = {
				load: vi.fn(async () => stored),
				save: vi.fn(async (s) => {
					stored = structuredClone(s)
				}),
				scanRecoverable: vi.fn(async () => []),
			}
			const mockHandle: ExecutionHandle = { taskId: "task-123", cancel: vi.fn() }
			const service = new OrchestrationService(
				persistence,
				{
					start: vi.fn(async () => mockHandle),
				},
				undefined,
				{},
			)
			service["snapshots"].set("test-run", snapshot)
			service["handles"].set("test-run:node-1:1", mockHandle)

			const wrongIdentityEvent: ChildEvent = {
				runId: "test-run",
				nodeId: "node-1",
				attempt: 1,
				runtimeIdentity: "wrong-task-id", // Doesn't match handle.taskId
				idempotencyKey: "wrong-identity-event",
				status: "integrated",
			}

			await service.handleChildEvent(wrongIdentityEvent)

			const updated = await service.getSnapshot("test-run")
			expect(updated.nodes[0].status).toBe("running")
			expect(updated.events).toHaveLength(0)
		})

		it("accepts events with correct attempt and runtime identity", async () => {
			const snapshot = createSnapshot()
			let stored = structuredClone(snapshot)
			const persistence: OrchestrationPersistence = {
				load: vi.fn(async () => stored),
				save: vi.fn(async (s) => {
					stored = structuredClone(s)
				}),
				scanRecoverable: vi.fn(async () => []),
			}
			const mockHandle: ExecutionHandle = { taskId: "task-123", cancel: vi.fn(), dispose: vi.fn() }
			const service = new OrchestrationService(
				persistence,
				{
					start: vi.fn(async () => mockHandle),
				},
				undefined,
				{},
			)
			service["snapshots"].set("test-run", snapshot)
			service["handles"].set("test-run:node-1:1", mockHandle)

			const validEvent: ChildEvent = {
				runId: "test-run",
				nodeId: "node-1",
				attempt: 1,
				runtimeIdentity: "task-123",
				idempotencyKey: "valid-event",
				status: "integrated",
				result: {
					contractVersion: 1,
					status: "completed",
					summary: "done",
					filesRead: [],
					filesChanged: [],
					artifactRefs: [],
					tests: [],
					assumptions: [],
					risks: [],
					openQuestions: [],
					nextActions: [],
				},
			}

			await service.handleChildEvent(validEvent)

			const updated = await service.getSnapshot("test-run")
			expect(updated.nodes[0].status).toBe("integrated")
			expect(updated.events.length).toBeGreaterThan(0)
		})
	})

	describe("(2) cancelNode with durable intent for pending nodes", () => {
		it("records cancel intent for planned nodes before start", async () => {
			const snapshot = createSnapshot({
				run: {
					...createSnapshot().run,
					status: "planned",
					activeNodeIds: [],
				},
				nodes: [
					{
						...createSnapshot().nodes[0],
						status: "planned",
						attempt: 0,
						timestamps: { planned: Date.now() },
					},
				],
			})
			let stored = structuredClone(snapshot)
			const persistence: OrchestrationPersistence = {
				load: vi.fn(async () => stored),
				save: vi.fn(async (s) => {
					stored = structuredClone(s)
				}),
				scanRecoverable: vi.fn(async () => []),
			}
			const service = new OrchestrationService(
				persistence,
				{
					start: vi.fn(),
				},
				undefined,
				{},
			)
			service["snapshots"].set("test-run", snapshot)

			await service.cancelNode("test-run", "node-1", "root-task", "User canceled")

			const updated = await service.getSnapshot("test-run")
			expect(updated.canceledNodeIntents).toBeDefined()
			expect(updated.canceledNodeIntents?.["node-1"]).toEqual({
				attempt: 1,
				reason: "User canceled",
				canceledAt: expect.any(Number),
			})
			expect(updated.nodes[0].status).toBe("canceled")
		})

		it("honors cancel intent during dispatch before executor.start", async () => {
			const snapshot = createSnapshot({
				run: {
					...createSnapshot().run,
					status: "planned",
					activeNodeIds: [],
				},
				nodes: [
					{
						...createSnapshot().nodes[0],
						status: "planned",
						attempt: 0,
						timestamps: { planned: Date.now() },
					},
				],
				canceledNodeIntents: {
					"node-1": {
						attempt: 1,
						reason: "Preemptive cancel",
						canceledAt: Date.now(),
					},
				},
			})
			let stored = structuredClone(snapshot)
			const persistence: OrchestrationPersistence = {
				load: vi.fn(async () => stored),
				save: vi.fn(async (s) => {
					stored = structuredClone(s)
				}),
				scanRecoverable: vi.fn(async () => []),
			}
			const startMock = vi.fn()
			const service = new OrchestrationService(
				persistence,
				{
					start: startMock,
				},
				undefined,
				{},
			)
			service["snapshots"].set("test-run", snapshot)

			await service.dispatch("test-run")

			expect(startMock).not.toHaveBeenCalled()
			const updated = await service.getSnapshot("test-run")
			expect(updated.nodes[0].status).toBe("canceled")
			expect(updated.canceledNodeIntents?.["node-1"]).toBeUndefined()
		})

		it("cancelNode does not fail when no handle exists for running node", async () => {
			const snapshot = createSnapshot()
			snapshot.run.activeNodeIds = ["node-1"]
			let stored = structuredClone(snapshot)
			const persistence: OrchestrationPersistence = {
				load: vi.fn(async () => stored),
				save: vi.fn(async (s) => {
					stored = structuredClone(s)
				}),
				scanRecoverable: vi.fn(async () => []),
			}
			const service = new OrchestrationService(
				persistence,
				{
					start: vi.fn(),
				},
				undefined,
				{},
			)
			service["snapshots"].set("test-run", snapshot)

			await service.cancelNode("test-run", "node-1", "root-task", "No handle")

			const updated = await service.getSnapshot("test-run")
			expect(updated.nodes[0].status).toBe("canceled")
			expect(updated.run.activeNodeIds).not.toContain("node-1")
		})
	})

	describe("(3) activeNodeIds is attempt-aware", () => {
		it("does not duplicate nodeId in activeNodeIds when retrying", async () => {
			const snapshot = createSnapshot({
				nodes: [
					{
						...createSnapshot().nodes[0],
						status: "needs_rework",
						attempt: 1,
					},
				],
				run: {
					...createSnapshot().run,
					status: "reworking",
					activeNodeIds: [],
				},
			})
			let stored = structuredClone(snapshot)
			const persistence: OrchestrationPersistence = {
				load: vi.fn(async () => stored),
				save: vi.fn(async (s) => {
					stored = structuredClone(s)
				}),
				scanRecoverable: vi.fn(async () => []),
			}
			const service = new OrchestrationService(
				persistence,
				{
					start: vi.fn(async () => ({ taskId: "task-new", cancel: vi.fn() })),
				},
				undefined,
				{},
			)
			service["snapshots"].set("test-run", snapshot)

			await service.retryNode("test-run", "node-1", "root-task")
			await service.dispatch("test-run")

			const updated = await service.getSnapshot("test-run")
			const nodeIdCount = updated.run.activeNodeIds.filter((id) => id === "node-1").length
			expect(nodeIdCount).toBe(1)
		})
	})

	describe("(4) review in-flight durability and recovery", () => {
		it("pauses on recovery when reviewInFlight exists without reviewResult", async () => {
			const snapshot = createSnapshot({
				reviewInFlight: {
					runId: "test-run",
					nodeId: "node-1",
					attempt: 1,
					startedAt: Date.now() - 5000,
				},
				nodes: [
					{
						...createSnapshot().nodes[0],
						status: "awaiting_review",
						outputContract: {
							contractVersion: 1,
							status: "completed",
							summary: "done",
							filesRead: [],
							filesChanged: [],
							artifactRefs: [],
							tests: [],
							assumptions: [],
							risks: [],
							openQuestions: [],
							nextActions: [],
						},
					},
				],
			})
			let stored = structuredClone(snapshot)
			const persistence: OrchestrationPersistence = {
				load: vi.fn(async () => stored),
				save: vi.fn(async (s) => {
					stored = structuredClone(s)
				}),
				scanRecoverable: vi.fn(async () => []),
			}
			const reviewMock = vi.fn()
			const service = new OrchestrationService(
				persistence,
				{
					start: vi.fn(),
				},
				undefined,
				{
					review: {
						review: reviewMock,
					},
				},
			)
			service["snapshots"].set("test-run", snapshot)

			await service["reviewNode"](snapshot, snapshot.nodes[0])

			expect(reviewMock).not.toHaveBeenCalled()
			const updated = await service.getSnapshot("test-run")
			expect(updated.run.status).toBe("paused")
			expect(updated.run.error?.code).toBe("review_recovery_required")
		})

		it("consumes reviewResult when both in-flight and result exist", async () => {
			const snapshot = createSnapshot({
				reviewInFlight: {
					runId: "test-run",
					nodeId: "node-1",
					attempt: 1,
					startedAt: Date.now() - 5000,
				},
				reviewResult: {
					runId: "test-run",
					nodeId: "node-1",
					attempt: 1,
					result: {
						findings: [],
						artifactRefs: [],
					},
					recordedAt: Date.now(),
				},
				nodes: [
					{
						...createSnapshot().nodes[0],
						status: "awaiting_review",
						outputContract: {
							contractVersion: 1,
							status: "completed",
							summary: "done",
							filesRead: [],
							filesChanged: [],
							artifactRefs: [],
							tests: [],
							assumptions: [],
							risks: [],
							openQuestions: [],
							nextActions: [],
						},
					},
				],
			})
			let stored = structuredClone(snapshot)
			const persistence: OrchestrationPersistence = {
				load: vi.fn(async () => stored),
				save: vi.fn(async (s) => {
					stored = structuredClone(s)
				}),
				scanRecoverable: vi.fn(async () => []),
			}
			const reviewMock = vi.fn()
			const service = new OrchestrationService(
				persistence,
				{
					start: vi.fn(),
				},
				undefined,
				{
					review: {
						review: reviewMock,
					},
				},
			)
			service["snapshots"].set("test-run", snapshot)

			await service["reviewNode"](snapshot, snapshot.nodes[0])

			expect(reviewMock).not.toHaveBeenCalled()
			const updated = await service.getSnapshot("test-run")
			expect(updated.reviewInFlight).toBeUndefined()
			expect(updated.reviewResult).toBeUndefined()
			expect(updated.nodes[0].status).toBe("ready_to_integrate")
		})
	})

	describe("(5) recovery state normalization", () => {
		it("fails closed when running nodes don't match activeNodeIds", async () => {
			const snapshot = createSnapshot({
				nodes: [
					{
						...createSnapshot().nodes[0],
						status: "running",
						attempt: 1,
					},
				],
				run: {
					...createSnapshot().run,
					activeNodeIds: [], // Mismatch: node is running but not in active list
				},
			})
			const persistence: OrchestrationPersistence = {
				load: vi.fn(),
				save: vi.fn(),
				scanRecoverable: vi.fn(async () => [snapshot]),
			}
			const service = new OrchestrationService(
				persistence,
				{
					start: vi.fn(),
					recover: vi.fn(),
				},
				undefined,
				{},
			)

			await service.recover()

			const recovered = await service.getSnapshot("test-run")
			expect(recovered.run.status).toBe("paused")
			expect(recovered.run.error?.code).toBe("recovery_state_inconsistent")
		})
	})

	describe("(6) dispose handles on cancel/completion", () => {
		it("disposes handle after successful child event", async () => {
			const snapshot = createSnapshot()
			let stored = structuredClone(snapshot)
			const persistence: OrchestrationPersistence = {
				load: vi.fn(async () => stored),
				save: vi.fn(async (s) => {
					stored = structuredClone(s)
				}),
				scanRecoverable: vi.fn(async () => []),
			}
			const disposeMock = vi.fn()
			const mockHandle: ExecutionHandle = {
				taskId: "task-123",
				cancel: vi.fn(),
				dispose: disposeMock,
			}
			const service = new OrchestrationService(
				persistence,
				{
					start: vi.fn(async () => mockHandle),
				},
				undefined,
				{},
			)
			service["snapshots"].set("test-run", snapshot)
			service["handles"].set("test-run:node-1:1", mockHandle)

			const event: ChildEvent = {
				runId: "test-run",
				nodeId: "node-1",
				attempt: 1,
				idempotencyKey: "complete-event",
				status: "integrated",
				result: {
					contractVersion: 1,
					status: "completed",
					summary: "done",
					filesRead: [],
					filesChanged: [],
					artifactRefs: [],
					tests: [],
					assumptions: [],
					risks: [],
					openQuestions: [],
					nextActions: [],
				},
			}

			await service.handleChildEvent(event)

			expect(disposeMock).toHaveBeenCalled()
			expect(service["handles"].has("test-run:node-1:1")).toBe(false)
		})

		it("disposes all handles during cancel", async () => {
			const snapshot = createSnapshot({
				run: {
					...createSnapshot().run,
					activeNodeIds: ["node-1"],
				},
			})
			let stored = structuredClone(snapshot)
			const persistence: OrchestrationPersistence = {
				load: vi.fn(async () => stored),
				save: vi.fn(async (s) => {
					stored = structuredClone(s)
				}),
				scanRecoverable: vi.fn(async () => []),
			}
			const disposeMock = vi.fn()
			const mockHandle: ExecutionHandle = {
				taskId: "task-123",
				cancel: vi.fn(),
				dispose: disposeMock,
			}
			const service = new OrchestrationService(
				persistence,
				{
					start: vi.fn(async () => mockHandle),
				},
				undefined,
				{},
			)
			service["snapshots"].set("test-run", snapshot)
			service["handles"].set("test-run:node-1:1", mockHandle)

			await service.cancel("test-run", "root-task", "Full cancel")

			expect(disposeMock).toHaveBeenCalled()
			expect(service["handles"].size).toBe(0)
		})
	})
})
