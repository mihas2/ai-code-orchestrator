import { describe, it, expect, vi, beforeEach } from "vitest"

import { AttemptCompletionToolUse } from "../../../shared/tools"

import { attemptCompletionTool, AttemptCompletionCallbacks } from "../AttemptCompletionTool"
import { Task } from "../../task/Task"

describe("AttemptCompletionTool child status handling", () => {
	let mockTask: any
	let mockCallbacks: AttemptCompletionCallbacks

	beforeEach(() => {
		mockTask = {
			parentTaskId: "parent-task-id",
			taskId: "child-task-id",
			say: vi.fn().mockResolvedValue(undefined),
			ask: vi.fn().mockResolvedValue({ response: "yesButtonClicked" }),
			providerRef: {
				deref: vi.fn(),
			},
			emit: vi.fn(),
			emitFinalTokenUsageUpdate: vi.fn(),
			getTokenUsage: vi.fn().mockReturnValue({}),
			toolUsage: {},
			didToolFailInCurrentTurn: false,
			consecutiveMistakeCount: 0,
			todoList: [],
		}

		mockCallbacks = {
			handleError: vi.fn(),
			pushToolResult: vi.fn(),
			askFinishSubTaskApproval: vi.fn().mockResolvedValue(true),
			askApproval: vi.fn().mockResolvedValue(true),
			toolDescription: vi.fn().mockReturnValue(""),
		}
	})

	describe("Normal delegation flow", () => {
		it("completes delegation when child status is 'active'", async () => {
			const mockProvider = {
				getTaskWithId: vi.fn().mockResolvedValue({
					historyItem: { status: "active" },
				}),
				reopenParentFromDelegation: vi.fn().mockResolvedValue(undefined),
			}
			mockTask.providerRef.deref.mockReturnValue(mockProvider)

			await attemptCompletionTool.execute(
				{ result: "Task completed successfully" },
				mockTask as unknown as Task,
				mockCallbacks,
			)

			expect(mockProvider.reopenParentFromDelegation).toHaveBeenCalledWith({
				parentTaskId: "parent-task-id",
				childTaskId: "child-task-id",
				completionResultSummary: "Task completed successfully",
			})
			expect(mockCallbacks.pushToolResult).toHaveBeenCalledWith("")
		})

		it("skips delegation when child status is 'completed' (idempotent)", async () => {
			const mockProvider = {
				getTaskWithId: vi.fn().mockResolvedValue({
					historyItem: { status: "completed" },
				}),
				reopenParentFromDelegation: vi.fn(),
			}
			mockTask.providerRef.deref.mockReturnValue(mockProvider)

			await attemptCompletionTool.execute(
				{ result: "Task completed successfully" },
				mockTask as unknown as Task,
				mockCallbacks,
			)

			// Should not attempt delegation
			expect(mockProvider.reopenParentFromDelegation).not.toHaveBeenCalled()
			// Should show completion ask to user
			expect(mockTask.ask).toHaveBeenCalledWith("completion_result", "", false)
		})
	})

	describe("Unexpected status handling", () => {
		it("returns error when child status is undefined", async () => {
			const mockProvider = {
				getTaskWithId: vi.fn().mockResolvedValue({
					historyItem: { status: undefined },
				}),
				reopenParentFromDelegation: vi.fn(),
			}
			mockTask.providerRef.deref.mockReturnValue(mockProvider)

			await attemptCompletionTool.execute(
				{ result: "Task completed successfully" },
				mockTask as unknown as Task,
				mockCallbacks,
			)

			// Should not attempt delegation
			expect(mockProvider.reopenParentFromDelegation).not.toHaveBeenCalled()
			// Should surface error to user
			expect(mockTask.say).toHaveBeenCalledWith("error", expect.stringContaining("unexpected status"))
			expect(mockCallbacks.pushToolResult).toHaveBeenCalledWith(expect.stringContaining("unexpected status"))
		})

		it("returns error when child status is 'delegated'", async () => {
			const mockProvider = {
				getTaskWithId: vi.fn().mockResolvedValue({
					historyItem: { status: "delegated" },
				}),
				reopenParentFromDelegation: vi.fn(),
			}
			mockTask.providerRef.deref.mockReturnValue(mockProvider)

			await attemptCompletionTool.execute(
				{ result: "Task completed successfully" },
				mockTask as unknown as Task,
				mockCallbacks,
			)

			// Should not attempt delegation
			expect(mockProvider.reopenParentFromDelegation).not.toHaveBeenCalled()
			// Should surface error to user
			expect(mockTask.say).toHaveBeenCalledWith("error", expect.stringContaining("unexpected status"))
			expect(mockCallbacks.pushToolResult).toHaveBeenCalledWith(expect.stringContaining("unexpected status"))
		})

		it("returns error when getTaskWithId fails", async () => {
			const mockProvider = {
				getTaskWithId: vi.fn().mockRejectedValue(new Error("History read failed")),
				reopenParentFromDelegation: vi.fn(),
			}
			mockTask.providerRef.deref.mockReturnValue(mockProvider)

			await attemptCompletionTool.execute(
				{ result: "Task completed successfully" },
				mockTask as unknown as Task,
				mockCallbacks,
			)

			// Should not attempt delegation
			expect(mockProvider.reopenParentFromDelegation).not.toHaveBeenCalled()
			// Should surface error to user
			expect(mockTask.say).toHaveBeenCalledWith("error", expect.stringContaining("Failed to verify child task"))
			expect(mockCallbacks.pushToolResult).toHaveBeenCalledWith(
				expect.stringContaining("Failed to verify child task"),
			)
		})
	})

	describe("User denial handling", () => {
		it("returns when user denies subtask completion", async () => {
			const mockProvider = {
				getTaskWithId: vi.fn().mockResolvedValue({
					historyItem: { status: "active" },
				}),
				reopenParentFromDelegation: vi.fn(),
			}
			mockTask.providerRef.deref.mockReturnValue(mockProvider)
			mockCallbacks.askFinishSubTaskApproval = vi.fn().mockResolvedValue(false)

			await attemptCompletionTool.execute(
				{ result: "Task completed successfully" },
				mockTask as unknown as Task,
				mockCallbacks,
			)

			// Should not reopen parent
			expect(mockProvider.reopenParentFromDelegation).not.toHaveBeenCalled()
			// Denial uses the shared structured tool response contract.
			expect(mockCallbacks.pushToolResult).toHaveBeenCalledWith(expect.stringContaining('"status":"denied"'))
		})
	})

	describe("Non-child task handling", () => {
		it("completes normally when task has no parent", async () => {
			mockTask.parentTaskId = undefined

			await attemptCompletionTool.execute(
				{ result: "Task completed successfully" },
				mockTask as unknown as Task,
				mockCallbacks,
			)

			// Should show completion ask to user
			expect(mockTask.ask).toHaveBeenCalledWith("completion_result", "", false)
			// Should not attempt any delegation checks
			expect(mockTask.providerRef.deref).not.toHaveBeenCalled()
		})
	})

	describe("Delayed save/abort race", () => {
		it("handles race where child completes before parent metadata is saved", async () => {
			// This simulates a race condition where:
			// 1. Parent delegates to child
			// 2. Child starts and completes very quickly
			// 3. Child's attempt_completion sees status="active" (normal case)
			const mockProvider = {
				getTaskWithId: vi.fn().mockResolvedValue({
					historyItem: { status: "active" },
				}),
				reopenParentFromDelegation: vi.fn().mockResolvedValue(undefined),
			}
			mockTask.providerRef.deref.mockReturnValue(mockProvider)

			await attemptCompletionTool.execute(
				{ result: "Quick completion" },
				mockTask as unknown as Task,
				mockCallbacks,
			)

			// Should complete delegation normally
			expect(mockProvider.reopenParentFromDelegation).toHaveBeenCalled()
		})

		it("surfaces error when child sees undefined status due to metadata corruption", async () => {
			// This simulates a more severe race/corruption where:
			// 1. Parent metadata save fails silently
			// 2. Child starts anyway (bug - should have been blocked)
			// 3. Child's attempt_completion sees status=undefined
			const mockProvider = {
				getTaskWithId: vi.fn().mockResolvedValue({
					historyItem: { status: undefined },
				}),
				reopenParentFromDelegation: vi.fn(),
			}
			mockTask.providerRef.deref.mockReturnValue(mockProvider)

			await attemptCompletionTool.execute(
				{ result: "Completion with corrupted metadata" },
				mockTask as unknown as Task,
				mockCallbacks,
			)

			// Should surface error, not hide it
			expect(mockTask.say).toHaveBeenCalledWith("error", expect.stringContaining("unexpected status"))
			expect(mockProvider.reopenParentFromDelegation).not.toHaveBeenCalled()
		})
	})
})
