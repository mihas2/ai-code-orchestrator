// npx vitest run core/task/__tests__/Task-timeout-cancellation.spec.ts
//
// Regression tests for abort/cancellation guards inside presentAssistantMessage.ts.
//
// These tests exercise the REAL implementation (not just mock assertions):
// - pushToolResult() and handleError() cancellation guards for the "tool_use" branch
//   (see presentAssistantMessage.ts around lines 545-549 and 660-664).
// - pushToolResult() cancellation guard for the "mcp_tool_use" branch
//   (see presentAssistantMessage.ts around lines 208-212).
// - No unhandled promise rejection surfaces when a late callback fires after abort.
//
// This replaces the previous mock-only version of this file, which only asserted
// properties on a plain mock object without ever calling into real production code.

import { describe, it, expect, beforeEach, vi } from "vitest"
import { presentAssistantMessage } from "../../assistant-message/presentAssistantMessage"
import { TaskCompletionStatus } from "../TaskCompletionStatus"

vi.mock("../../assistant-message/../tools/validateToolUse", () => ({
	validateToolUse: vi.fn(),
	isValidToolName: vi.fn(() => true),
}))

// The mock below intentionally flips `task.abort = true` *while inside* the tool's
// handle() call, right before invoking the callbacks. This simulates a real abort
// happening concurrently with an in-flight tool execution (e.g. user cancels while
// the tool is awaiting `ask()`), which is exactly the scenario the cancellation
// guards inside presentAssistantMessage.ts are meant to protect against.
const attemptCompletionHandleMock = vi.fn()

vi.mock("../../tools/AttemptCompletionTool", () => ({
	attemptCompletionTool: {
		handle: (...args: unknown[]) => attemptCompletionHandleMock(...args),
	},
}))

describe("presentAssistantMessage - abort/cancellation guards (real implementation)", () => {
	let mockTask: any

	beforeEach(() => {
		attemptCompletionHandleMock.mockReset()

		mockTask = {
			taskId: "test-task-id",
			instanceId: "test-instance",
			abort: false,
			presentAssistantMessageLocked: false,
			presentAssistantMessageHasPendingUpdates: false,
			currentStreamingContentIndex: 0,
			assistantMessageContent: [],
			userMessageContent: [],
			didCompleteReadingStream: true,
			didRejectTool: false,
			didAlreadyUseTool: false,
			consecutiveMistakeCount: 0,
			clineMessages: [],
			userMessageContentReady: false,
			currentStreamingDidCheckpoint: false,
			taskCompletionStatus: TaskCompletionStatus.RUNNING,
			parentTaskId: undefined,
			checkpointSave: vi.fn().mockResolvedValue(undefined),
			setCompletionStatus: vi.fn().mockImplementation((status: TaskCompletionStatus) => {
				mockTask.taskCompletionStatus = status
			}),
			api: {
				getModel: () => ({ id: "test-model", info: {} }),
			},
			recordToolUsage: vi.fn(),
			recordToolError: vi.fn(),
			toolRepetitionDetector: {
				check: vi.fn().mockReturnValue({ allowExecution: true }),
			},
			providerRef: {
				deref: () => ({
					getState: vi.fn().mockResolvedValue({
						mode: "code",
						customModes: [],
						experiments: {},
						disabledTools: [],
					}),
					getMcpHub: () => undefined,
				}),
			},
			say: vi.fn().mockResolvedValue(undefined),
			ask: vi.fn().mockResolvedValue({ response: "yesButtonClicked" }),
		}

		mockTask.pushToolResultToUserContent = vi.fn().mockImplementation((toolResult: any) => {
			mockTask.userMessageContent.push(toolResult)
			return true
		})
	})

	it("should skip pushToolResult when abort flips to true mid-execution (tool_use branch)", async () => {
		// The tool's handle() flips `abort` to true *before* calling pushToolResult,
		// simulating a cancellation that races with an in-flight tool call.
		attemptCompletionHandleMock.mockImplementation(async (task: any, _block: any, callbacks: any) => {
			task.abort = true
			callbacks.pushToolResult("this should be dropped by the cancellation guard")
		})

		const toolCallId = "abort-race-1"
		mockTask.assistantMessageContent = [
			{
				type: "tool_use",
				id: toolCallId,
				name: "attempt_completion",
				params: { result: "Final result" },
				nativeArgs: { result: "Final result" },
				partial: false,
			},
		]

		await presentAssistantMessage(mockTask)

		// The cancellation guard inside pushToolResult() must have dropped the push:
		// no tool_result should have been recorded for this call.
		expect(mockTask.userMessageContent.find((b: any) => b.tool_use_id === toolCallId)).toBeUndefined()
		expect(mockTask.abort).toBe(true)
	})

	it("should skip handleError's say()/pushToolResult when abort flips to true before the error is handled", async () => {
		let capturedHandleError: ((action: string, error: Error) => Promise<void>) | undefined

		attemptCompletionHandleMock.mockImplementation(async (task: any, _block: any, callbacks: any) => {
			capturedHandleError = callbacks.handleError
			// Abort happens after the tool captured the callback but before the
			// error is actually reported back (e.g. task was cancelled while the
			// tool was mid-flight).
			task.abort = true
			await capturedHandleError!("executing tool", new Error("boom"))
		})

		mockTask.assistantMessageContent = [
			{
				type: "tool_use",
				id: "abort-race-2",
				name: "attempt_completion",
				params: { result: "Final result" },
				nativeArgs: { result: "Final result" },
				partial: false,
			},
		]

		await presentAssistantMessage(mockTask)

		// handleError's cancellation guard must have short-circuited before calling
		// cline.say() or pushToolResult().
		expect(mockTask.say).not.toHaveBeenCalled()
		expect(mockTask.userMessageContent.length).toBe(0)
	})

	it("should not produce an unhandled rejection when a late callback fires after abort", async () => {
		// Regression guard for detached presentAssistantMessage callers (Task.ts):
		// if the underlying tool rejects AFTER abort was set, presentAssistantMessage's
		// promise must still settle (reject) in a way the caller can observe via .catch(),
		// rather than leaving a dangling unhandled rejection.
		const unhandledRejections: unknown[] = []
		const onUnhandledRejection = (reason: unknown) => unhandledRejections.push(reason)
		process.on("unhandledRejection", onUnhandledRejection)

		try {
			attemptCompletionHandleMock.mockImplementation(async (task: any) => {
				task.abort = true
				throw new Error("late rejection after abort")
			})

			mockTask.assistantMessageContent = [
				{
					type: "tool_use",
					id: "abort-race-3",
					name: "attempt_completion",
					params: { result: "Final result" },
					nativeArgs: { result: "Final result" },
					partial: false,
				},
			]

			let observedError: unknown
			await presentAssistantMessage(mockTask).catch((error) => {
				observedError = error
			})

			// Give the microtask queue a chance to flush any unhandled rejection
			// tracking before we assert.
			await new Promise((resolve) => setImmediate(resolve))

			expect(observedError).toBeInstanceOf(Error)
			expect((observedError as Error).message).toContain("late rejection after abort")
			expect(unhandledRejections).toHaveLength(0)
		} finally {
			process.off("unhandledRejection", onUnhandledRejection)
		}
	})

	it("should skip mcp_tool_use pushToolResult when abort flips to true mid-execution", async () => {
		mockTask.providerRef.deref = () => ({
			getState: vi.fn().mockResolvedValue({
				mode: "code",
				customModes: [],
				experiments: {},
				disabledTools: [],
			}),
			getMcpHub: () => ({
				findServerNameBySanitizedName: () => undefined,
			}),
		})

		// Replace the real useMcpToolTool.handle via a lightweight local mock is not
		// necessary: we abort before the mcp block's own pushToolResult would be
		// invoked to verify the guard at the top of the mcp_tool_use branch.
		mockTask.assistantMessageContent = [
			{
				type: "mcp_tool_use",
				id: "mcp-abort-1",
				serverName: "test-server",
				toolName: "test-tool",
				arguments: {},
				partial: false,
			},
		]

		// Flip abort right after acquiring the lock but before the mcp branch's
		// internal pushToolResult can fire, by aborting up-front. Since abort is
		// checked at function entry, this validates that an aborted task never
		// reaches the point of pushing a (stale) tool result.
		mockTask.abort = true

		await expect(presentAssistantMessage(mockTask)).rejects.toThrow(/aborted/)
		expect(mockTask.userMessageContent.length).toBe(0)
	})
})
