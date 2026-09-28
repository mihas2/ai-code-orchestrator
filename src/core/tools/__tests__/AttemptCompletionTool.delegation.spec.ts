import { describe, it, expect, vi, beforeEach } from "vitest"
import type { HistoryItem } from "@ai-code-orchestrator/types"
import { AttemptCompletionTool } from "../AttemptCompletionTool"
import { Task } from "../../task/Task"

describe("AttemptCompletionTool delegation error handling", () => {
	let tool: AttemptCompletionTool
	let mockProvider: any
	let mockTask: any
	let mockCallbacks: any

	beforeEach(() => {
		mockProvider = {
			getTaskWithId: vi.fn(),
			reopenParentFromDelegation: vi.fn(),
		}

		mockTask = {
			taskId: "child-task",
			parentTaskId: "parent-task",
			clineMessages: [],
			providerRef: { deref: () => mockProvider },
			consecutiveMistakeCount: 0,
			didToolFailInCurrentTurn: false,
			say: vi.fn().mockResolvedValue(undefined),
			ask: vi.fn(),
			sayAndCreateMissingParamError: vi.fn(),
			recordToolError: vi.fn(),
			todoList: [],
		}

		mockCallbacks = {
			askFinishSubTaskApproval: vi.fn().mockResolvedValue(true),
			toolDescription: vi.fn().mockReturnValue("attempt_completion description"),
			pushToolResult: vi.fn(),
			handleError: vi.fn(),
		}

		tool = new AttemptCompletionTool()
	})

	it("should catch and log rejection from reopenParentFromDelegation", async () => {
		const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
		const rejectionError = new Error("Resume failed")

		mockProvider.getTaskWithId.mockResolvedValue({
			historyItem: { status: "active" },
		})
		mockProvider.reopenParentFromDelegation.mockRejectedValue(rejectionError)

		// The error should propagate and be caught by the outer try-catch
		await expect(tool.execute({ result: "Task complete" }, mockTask as Task, mockCallbacks)).rejects.toThrow(
			"Resume failed",
		)

		expect(consoleErrorSpy).toHaveBeenCalledWith(
			expect.stringContaining(
				"[DELEGATE_TO_PARENT] Failed to reopen parent task parent-task from child child-task: Resume failed",
			),
		)

		consoleErrorSpy.mockRestore()
	})

	it("should propagate rejection from delegateToParent", async () => {
		const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
		const rejectionError = new Error("Network timeout")

		mockProvider.getTaskWithId.mockResolvedValue({
			historyItem: { status: "active" },
		})
		mockProvider.reopenParentFromDelegation.mockRejectedValue(rejectionError)

		await expect(tool.execute({ result: "Done" }, mockTask as Task, mockCallbacks)).rejects.toThrow(
			"Network timeout",
		)

		expect(mockProvider.reopenParentFromDelegation).toHaveBeenCalledWith({
			parentTaskId: "parent-task",
			childTaskId: "child-task",
			completionResultSummary: "Done",
		})

		consoleErrorSpy.mockRestore()
	})

	it("should include parent and child task IDs in error log", async () => {
		const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

		mockProvider.getTaskWithId.mockResolvedValue({
			historyItem: { status: "active" },
		})
		mockProvider.reopenParentFromDelegation.mockRejectedValue(new Error("DB error"))

		await expect(tool.execute({ result: "Complete" }, mockTask as Task, mockCallbacks)).rejects.toThrow("DB error")

		expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringMatching(/parent-task.*child-task/))

		consoleErrorSpy.mockRestore()
	})

	it("should handle non-Error rejection objects", async () => {
		const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

		mockProvider.getTaskWithId.mockResolvedValue({
			historyItem: { status: "active" },
		})
		mockProvider.reopenParentFromDelegation.mockRejectedValue("String rejection")

		await expect(tool.execute({ result: "Done" }, mockTask as Task, mockCallbacks)).rejects.toThrow(
			"String rejection",
		)

		expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("String rejection"))

		consoleErrorSpy.mockRestore()
	})
})
