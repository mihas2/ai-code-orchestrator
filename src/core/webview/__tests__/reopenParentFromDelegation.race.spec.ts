// Regression test for race condition bug: "Parent is already being resumed for child"
// Issue: When child completes quickly or multiple completion signals arrive concurrently,
// reopenParentFromDelegation would reject with "already being resumed" instead of
// properly handling concurrent/sequential resumption.

import { describe, it, expect, vi, beforeEach } from "vitest"
import { ClineProvider } from "../ClineProvider"
import { AiCodeOrchestratorEventName } from "@ai-code-orchestrator/types"

describe("reopenParentFromDelegation race condition handling", () => {
	const makeProvider = () => {
		const provider = Object.create(ClineProvider.prototype) as any
		provider.log = vi.fn()
		provider.contextProxy = { globalStorageUri: { fsPath: "/mock/storage" } }
		provider.customModesManager = { getCustomModes: vi.fn().mockResolvedValue([]) }
		provider.providerSettingsManager = {
			listConfig: vi.fn().mockResolvedValue([]),
			getProfile: vi.fn().mockResolvedValue({ apiProvider: "mock" }),
		}
		provider.updateGlobalState = vi.fn().mockResolvedValue(undefined)
		provider.activateProviderProfile = vi.fn().mockResolvedValue(undefined)
		provider.emit = vi.fn()
		return provider
	}

	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("coalesces concurrent completion signals for the same child (idempotency)", async () => {
		const provider = makeProvider()
		let releaseResume: () => void
		const pendingResume = new Promise<void>((resolve) => (releaseResume = resolve))
		const resumeAfterDelegation = vi.fn().mockImplementation(() => pendingResume)

		provider.getTaskWithId = vi.fn().mockResolvedValue({
			historyItem: {
				id: "parent",
				status: "delegated",
				awaitingChildId: "child",
				delegatedToId: "child",
				childIds: [],
			},
		})
		provider.updateTaskHistory = vi.fn().mockResolvedValue([])
		provider.createTaskWithHistoryItem = vi.fn().mockResolvedValue({
			overwriteClineMessages: vi.fn().mockResolvedValue(undefined),
			overwriteApiConversationHistory: vi.fn().mockResolvedValue(undefined),
			resumeAfterDelegation,
		})

		// Fire two concurrent completion signals
		const params = { parentTaskId: "parent", childTaskId: "child", completionResultSummary: "Done" }
		const first = provider.reopenParentFromDelegation(params)
		const second = provider.reopenParentFromDelegation(params)

		// Wait for createTaskWithHistoryItem to be called
		await vi.waitFor(() => expect(provider.createTaskWithHistoryItem).toHaveBeenCalled())

		// Verify both promises reference the same in-flight operation
		expect(first).toBe(second)

		// Release the resume and wait for completion
		releaseResume!()
		await Promise.all([first, second])

		// Only one task creation and one resume should occur
		expect(provider.createTaskWithHistoryItem).toHaveBeenCalledTimes(1)
		expect(resumeAfterDelegation).toHaveBeenCalledTimes(1)
	})

	it("serializes different child completions instead of failing with 'already being resumed'", async () => {
		const provider = makeProvider()
		let releaseFirstResume: () => void
		const pendingFirstResume = new Promise<void>((resolve) => (releaseFirstResume = resolve))

		let phase = 0
		provider.getTaskWithId = vi.fn().mockImplementation(async (id: string) => ({
			historyItem:
				id === "parent"
					? phase === 0
						? {
								id,
								status: "delegated",
								delegatedToId: "child-a",
								awaitingChildId: "child-a",
								childIds: [],
							}
						: {
								id,
								status: "delegated",
								delegatedToId: "child-b",
								awaitingChildId: "child-b",
								childIds: [],
							}
					: { id, status: "active" },
		}))

		provider.updateTaskHistory = vi.fn().mockImplementation(async (item: any) => {
			// Transition to phase 1 after child-a completes
			if (item.id === "parent" && item.completedByChildId === "child-a") {
				phase = 1
			}
		})

		provider.createTaskWithHistoryItem = vi
			.fn()
			.mockResolvedValueOnce({
				overwriteClineMessages: vi.fn().mockResolvedValue(undefined),
				overwriteApiConversationHistory: vi.fn().mockResolvedValue(undefined),
				resumeAfterDelegation: vi.fn(() => pendingFirstResume),
			})
			.mockResolvedValueOnce({
				overwriteClineMessages: vi.fn().mockResolvedValue(undefined),
				overwriteApiConversationHistory: vi.fn().mockResolvedValue(undefined),
				resumeAfterDelegation: vi.fn().mockResolvedValue(undefined),
			})

		// Start first child completion
		const firstCompletion = provider.reopenParentFromDelegation({
			parentTaskId: "parent",
			childTaskId: "child-a",
			completionResultSummary: "Result A",
		})

		// Wait for first resume to start
		await vi.waitFor(() => expect(provider.createTaskWithHistoryItem).toHaveBeenCalledTimes(1))

		// While first resume is in flight, second child completes
		// This should NOT fail with "already being resumed" error
		const secondCompletion = provider.reopenParentFromDelegation({
			parentTaskId: "parent",
			childTaskId: "child-b",
			completionResultSummary: "Result B",
		})

		// Release first resume
		releaseFirstResume!()

		// Both should complete successfully
		await expect(firstCompletion).resolves.toBeUndefined()
		await expect(secondCompletion).resolves.toBeUndefined()

		// Both children should have been processed
		expect(provider.createTaskWithHistoryItem).toHaveBeenCalledTimes(2)
	})

	it("handles rapid sequential completions without rejection", async () => {
		const provider = makeProvider()
		const parentHistory: any = {
			id: "parent",
			status: "delegated",
			delegatedToId: "child-1",
			awaitingChildId: "child-1",
			childIds: [],
		}

		provider.getTaskWithId = vi.fn().mockImplementation(async (id: string) => ({
			historyItem: id === "parent" ? { ...parentHistory } : { id, status: "active" },
		}))

		provider.updateTaskHistory = vi.fn().mockImplementation(async (item: any) => {
			if (item.id === "parent") {
				Object.assign(parentHistory, item)
			}
		})

		provider.createTaskWithHistoryItem = vi.fn().mockResolvedValue({
			overwriteClineMessages: vi.fn().mockResolvedValue(undefined),
			overwriteApiConversationHistory: vi.fn().mockResolvedValue(undefined),
			resumeAfterDelegation: vi.fn().mockResolvedValue(undefined),
		})

		// Rapid sequential completions (e.g., child completes, UI refreshes, triggers another completion signal)
		await provider.reopenParentFromDelegation({
			parentTaskId: "parent",
			childTaskId: "child-1",
			completionResultSummary: "Done",
		})

		// Second call should be idempotent (detects already resumed state)
		await provider.reopenParentFromDelegation({
			parentTaskId: "parent",
			childTaskId: "child-1",
			completionResultSummary: "Done",
		})

		// Should only create parent instance once
		expect(provider.createTaskWithHistoryItem).toHaveBeenCalledTimes(1)
	})

	it("rejects when trying to resume with wrong child (safety check)", async () => {
		const provider = makeProvider()
		provider.getTaskWithId = vi.fn().mockResolvedValue({
			historyItem: {
				id: "parent",
				status: "delegated",
				awaitingChildId: "child-a",
				delegatedToId: "child-a",
				childIds: [],
			},
		})

		await expect(
			provider.reopenParentFromDelegation({
				parentTaskId: "parent",
				childTaskId: "child-b",
				completionResultSummary: "Wrong child",
			}),
		).rejects.toThrow("awaits child child-a; received child-b")
	})

	it("emits events correctly even with concurrent completions", async () => {
		const provider = makeProvider()
		const emitSpy = vi.spyOn(provider, "emit")

		provider.getTaskWithId = vi.fn().mockResolvedValue({
			historyItem: {
				id: "parent",
				status: "delegated",
				awaitingChildId: "child",
				delegatedToId: "child",
				childIds: [],
			},
		})
		provider.updateTaskHistory = vi.fn().mockResolvedValue([])
		provider.createTaskWithHistoryItem = vi.fn().mockResolvedValue({
			overwriteClineMessages: vi.fn().mockResolvedValue(undefined),
			overwriteApiConversationHistory: vi.fn().mockResolvedValue(undefined),
			resumeAfterDelegation: vi.fn().mockResolvedValue(undefined),
		})

		const params = { parentTaskId: "parent", childTaskId: "child", completionResultSummary: "Done" }
		await Promise.all([provider.reopenParentFromDelegation(params), provider.reopenParentFromDelegation(params)])

		// Should emit completion and resumed events exactly once
		expect(emitSpy).toHaveBeenCalledWith(
			AiCodeOrchestratorEventName.TaskDelegationCompleted,
			"parent",
			"child",
			"Done",
		)
		expect(emitSpy).toHaveBeenCalledWith(AiCodeOrchestratorEventName.TaskDelegationResumed, "parent", "child")

		// Filter for delegation events
		const delegationCalls = emitSpy.mock.calls.filter(
			([event]) =>
				event === AiCodeOrchestratorEventName.TaskDelegationCompleted ||
				event === AiCodeOrchestratorEventName.TaskDelegationResumed,
		)
		expect(delegationCalls).toHaveLength(2) // One completion + one resumed
	})
})
