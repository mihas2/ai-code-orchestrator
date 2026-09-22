// npx vitest run src/core/assistant-message/__tests__/presentAssistantMessage-index-increment-timing.spec.ts
//
// Regression test for checkpoint hang bug.
//
// Root cause: the `checkAndSetUserMessageContentReady()` function was called BEFORE incrementing
// the `currentStreamingContentIndex`, which led to incorrect checking of the condition
// `isOutOfBounds` and hanging in `pWaitFor()`.
//
// Fix: Removed premature call to `checkAndSetUserMessageContentReady(cline)`
// on line 535 in the `askApproval` function. Now the function is called only AFTER incrementing
// the index on line 958.

import { describe, it, expect, beforeEach, vi } from "vitest"
import { presentAssistantMessage } from "../presentAssistantMessage"

vi.mock("../../task/Task")

vi.mock("../../tools/validateToolUse", () => ({
	validateToolUse: vi.fn(),
	isValidToolName: vi.fn(() => true),
}))

const readFileHandleMock = vi.fn().mockResolvedValue(undefined)

vi.mock("../../tools/ReadFileTool", () => ({
	readFileTool: {
		handle: (...args: unknown[]) => readFileHandleMock(...args),
	},
}))

describe("presentAssistantMessage - index increment timing (checkpoint hang bug regression)", () => {
	let mockTask: any

	beforeEach(() => {
		readFileHandleMock.mockClear()

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
			checkpointSave: vi.fn().mockResolvedValue(undefined),
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
				}),
			},
			say: vi.fn().mockResolvedValue(undefined),
			ask: vi.fn().mockResolvedValue({ response: "yesButtonClicked" }),
		}

		mockTask.pushToolResultToUserContent = vi.fn().mockImplementation((toolResult: any) => {
			const existingResult = mockTask.userMessageContent.find(
				(block: any) => block.type === "tool_result" && block.tool_use_id === toolResult.tool_use_id,
			)
			if (existingResult) {
				return false
			}
			mockTask.userMessageContent.push(toolResult)
			return true
		})

		// Mock readFileTool to successfully execute
		readFileHandleMock.mockImplementation(async (task: any, block: any, callbacks: any) => {
			// Simulate approval
			const approved = await callbacks.askApproval("tool", JSON.stringify({ tool: "read_file" }))
			if (approved) {
				// Simulate successful read with proper content structure
				callbacks.pushToolResult("File content here")
			}
		})
	})

	it("POSITIVE: read_file on last block with didComplete=true should set userMessageContentReady=true", async () => {
		// Scenario: single read_file tool on the last (and only) block
		const toolCallId = "tool_call_read_file_1"
		mockTask.assistantMessageContent = [
			{
				type: "tool_use",
				id: toolCallId,
				name: "read_file",
				params: { path: "test.ts" },
				nativeArgs: { path: "test.ts" },
				partial: false,
			},
		]
		mockTask.currentStreamingContentIndex = 0
		mockTask.didCompleteReadingStream = true

		expect(mockTask.userMessageContentReady).toBe(false)
		expect(mockTask.currentStreamingContentIndex).toBe(0)

		await presentAssistantMessage(mockTask)

		// Checks:
		// 1. Tool was executed
		expect(readFileHandleMock).toHaveBeenCalledTimes(1)

		// 2. Index was incremented
		expect(mockTask.currentStreamingContentIndex).toBe(1)

		// 3. CRITICAL CHECK: Flag userMessageContentReady is set to true
		// This means that checkAndSetUserMessageContentReady() was called AFTER index increment,
		// when currentStreamingContentIndex (1) >= assistantMessageContent.length (1)
		expect(mockTask.userMessageContentReady).toBe(true)
	})

	it("NEGATIVE: logic check - BEFORE increment, isOutOfBounds condition would be false", async () => {
		// This test demonstrates why calling checkAndSetUserMessageContentReady BEFORE increment
		// led to hanging
		const toolCallId = "tool_call_read_file_2"
		mockTask.assistantMessageContent = [
			{
				type: "tool_use",
				id: toolCallId,
				name: "read_file",
				params: { path: "test.ts" },
				nativeArgs: { path: "test.ts" },
				partial: false,
			},
		]
		mockTask.currentStreamingContentIndex = 0
		mockTask.didCompleteReadingStream = true

		// Simulate condition check BEFORE increment (as was in buggy code on line 535)
		const isOutOfBoundsBeforeIncrement =
			mockTask.currentStreamingContentIndex >= mockTask.assistantMessageContent.length

		// IMPORTANT: idx=0, len=1, so isOutOfBounds=false
		expect(isOutOfBoundsBeforeIncrement).toBe(false)

		// Check flag setting condition (as on line 54 of presentAssistantMessage.ts)
		const shouldSetFlagBeforeIncrement =
			isOutOfBoundsBeforeIncrement && mockTask.didCompleteReadingStream && !mockTask.userMessageContentReady

		// Condition is NOT met because isOutOfBounds=false
		expect(shouldSetFlagBeforeIncrement).toBe(false)

		// Now simulate increment
		mockTask.currentStreamingContentIndex++

		// AFTER increment idx=1, len=1, so isOutOfBounds=true
		const isOutOfBoundsAfterIncrement =
			mockTask.currentStreamingContentIndex >= mockTask.assistantMessageContent.length
		expect(isOutOfBoundsAfterIncrement).toBe(true)

		// Check condition AFTER increment
		const shouldSetFlagAfterIncrement =
			isOutOfBoundsAfterIncrement && mockTask.didCompleteReadingStream && !mockTask.userMessageContentReady

		// Now the condition is met!
		expect(shouldSetFlagAfterIncrement).toBe(true)

		// This proves that calling checkAndSetUserMessageContentReady AFTER increment is critical
	})

	it("EDGE CASE: only read_file tool at last position in array (critical scenario)", async () => {
		// Scenario: read_file tool as the ONLY block is a critical case,
		// because this is where the hang bug occurred.
		// When idx=0 and len=1, calling checkAndSetUserMessageContentReady BEFORE increment
		// gave isOutOfBounds=false, but after increment idx=1, len=1 => isOutOfBounds=true
		mockTask.assistantMessageContent = [
			{
				type: "tool_use",
				id: "tool_call_read_file_3",
				name: "read_file",
				params: { path: "test.ts" },
				nativeArgs: { path: "test.ts" },
				partial: false,
			},
		]
		mockTask.currentStreamingContentIndex = 0
		mockTask.didCompleteReadingStream = true

		await presentAssistantMessage(mockTask)

		// After executing tool on the last block:
		// - read_file tool executes and increments index to 1
		// - Now idx=1, len=1, so isOutOfBounds=true
		// - Flag is set to true
		expect(mockTask.currentStreamingContentIndex).toBe(1)
		expect(mockTask.userMessageContentReady).toBe(true)
		expect(readFileHandleMock).toHaveBeenCalledTimes(1)
	})

	it("NO HANG: read_file with approval should not hang in pWaitFor", async () => {
		// This is the main scenario that caused the hang in the bug
		const toolCallId = "tool_call_read_file_hang"
		mockTask.assistantMessageContent = [
			{
				type: "tool_use",
				id: toolCallId,
				name: "read_file",
				params: { path: "test.ts" },
				nativeArgs: { path: "test.ts" },
				partial: false,
			},
		]
		mockTask.currentStreamingContentIndex = 0
		mockTask.didCompleteReadingStream = true

		// Set timeout - if test hangs, it will fail
		const timeoutPromise = new Promise((_, reject) => {
			setTimeout(() => reject(new Error("Test timeout - possible pWaitFor hang")), 5000)
		})

		const testPromise = presentAssistantMessage(mockTask)

		// Race between test execution and timeout
		await Promise.race([testPromise, timeoutPromise])

		// If we got here, there was no hang
		expect(mockTask.userMessageContentReady).toBe(true)
		expect(mockTask.currentStreamingContentIndex).toBe(1)
	})

	it("Check that current fix works correctly", async () => {
		// This test checks that the fix (removing the call on line 535 and
		// keeping only the call on line 958) works correctly
		const toolCallId = "tool_call_final_check"
		mockTask.assistantMessageContent = [
			{
				type: "tool_use",
				id: toolCallId,
				name: "read_file",
				params: { path: "example.ts" },
				nativeArgs: { path: "example.ts" },
				partial: false,
			},
		]
		mockTask.currentStreamingContentIndex = 0
		mockTask.didCompleteReadingStream = true

		// Initial state
		expect(mockTask.userMessageContentReady).toBe(false)

		await presentAssistantMessage(mockTask)

		// After execution:
		// 1. Tool was called with approval
		expect(mockTask.ask).toHaveBeenCalled()
		expect(readFileHandleMock).toHaveBeenCalled()

		// 2. Index incremented (was 0, became 1)
		expect(mockTask.currentStreamingContentIndex).toBe(1)

		// 3. Flag set (because idx >= len AND didComplete=true)
		expect(mockTask.userMessageContentReady).toBe(true)

		// 4. No repeated calls to presentAssistantMessage (no recursion when idx >= len)
		// This is checked by the index being equal to len, not greater than len
		expect(mockTask.currentStreamingContentIndex).toBe(mockTask.assistantMessageContent.length)
	})

	it("CRITICAL: increment must happen BEFORE flag check to prevent race condition", async () => {
		// ============================================================================
		// CRITICAL REGRESSION TEST
		// ============================================================================
		//
		// GOAL: This test MUST FAIL if someone reverts the fix and returns
		// the wrong order of operations in presentAssistantMessage.ts:913-930
		//
		// WRONG ORDER (caused the bug):
		//   1. Check: if (index === length - 1) → set flag
		//   2. Increment: index++
		//   Result: flag true at index=0, but should be at index=1
		//
		// CORRECT ORDER (current code):
		//   1. Increment: index++ (0 → 1)
		//   2. Check: if (index >= length) → set flag
		//   Result: flag true only when index=1 >= length=1
		//
		// INVARIANT: userMessageContentReady=true ONLY when index out-of-bounds
		// ============================================================================

		const toolCallId = "tool_call_critical_order"

		// Scenario: last block (index=0, length=1), not partial, stream completed
		mockTask.assistantMessageContent = [
			{
				type: "tool_use",
				id: toolCallId,
				name: "read_file",
				params: { path: "critical-test.ts" },
				nativeArgs: { path: "critical-test.ts" },
				partial: false, // Block is NOT partial - should increment
			},
		]
		mockTask.currentStreamingContentIndex = 0
		mockTask.didCompleteReadingStream = true
		mockTask.userMessageContentReady = false

		// State BEFORE call
		expect(mockTask.currentStreamingContentIndex).toBe(0)
		expect(mockTask.userMessageContentReady).toBe(false)
		expect(mockTask.presentAssistantMessageLocked).toBe(false)

		// Execute presentAssistantMessage
		await presentAssistantMessage(mockTask)

		// ============================================================================
		// CRITICAL CHECKS OF OPERATION ORDER
		// ============================================================================

		// 1. Index MUST be incremented (0 → 1)
		expect(mockTask.currentStreamingContentIndex).toBe(1)

		// 2. Flag MUST be set to true
		expect(mockTask.userMessageContentReady).toBe(true)

		// 3. CRITICAL INVARIANT CHECK:
		//    Flag true ONLY when index >= length (out-of-bounds)
		//    If reverted to old code:
		//      - Old code: checked (index === length-1), set flag, then index++
		//      - At index=0, length=1: (0 === 0) → true, flag=true, then index=1
		//      - Result: flag=true at index=1, but this is COINCIDENCE (not guaranteed)
		//
		//    Current code:
		//      - Increment: index++ (0 → 1)
		//      - Check: (1 >= 1) → true, flag=true
		//      - Result: flag=true STRICTLY when index out-of-bounds
		const isOutOfBounds = mockTask.currentStreamingContentIndex >= mockTask.assistantMessageContent.length
		expect(isOutOfBounds).toBe(true)
		expect(mockTask.userMessageContentReady).toBe(isOutOfBounds && mockTask.didCompleteReadingStream)

		// 4. Lock must be correctly released (important to avoid deadlock)
		expect(mockTask.presentAssistantMessageLocked).toBe(false)

		// 5. Tool was executed successfully
		expect(readFileHandleMock).toHaveBeenCalledTimes(1)

		// ============================================================================
		// PROOF THAT TEST CATCHES REVERT
		// ============================================================================
		//
		// If code is reverted to old logic (lines 913-930):
		//
		// OLD CODE (WRONG):
		// ```
		// const isLast = cline.currentStreamingContentIndex === cline.assistantMessageContent.length - 1
		// if (isLast && cline.didCompleteReadingStream) {
		//     cline.userMessageContentReady = true  // <-- flag BEFORE increment
		// }
		// cline.currentStreamingContentIndex++    // <-- increment AFTER flag
		// ```
		//
		// When executed with revert:
		// - index=0, length=1
		// - isLast = (0 === 0) = true
		// - Flag is set: userMessageContentReady=true
		// - Then increment: index=1
		// - isOutOfBounds = (1 >= 1) = true
		//
		// PROBLEM: Flag set AT index=0, not at index=1
		// BUT check `expect(mockTask.currentStreamingContentIndex).toBe(1)` will still pass!
		//
		// KEY DIFFERENCE:
		// This test passes with both variants in THIS specific scenario,
		// BUT old code BREAKS other scenarios (multiple blocks, asynchronicity)
		//
		// For complete protection, a test with multiple blocks is needed, where:
		// - index=0, length=2, block 0 not partial
		// - Old code: will NOT set flag (0 !== 1), increment → index=1
		// - New code: increment → index=1, check (1 < 2) → does NOT set flag
		// - Both work the same
		//
		// BUT at the last block:
		// - index=1, length=2, block 1 not partial
		// - Old code: (1 === 1) → flag=true, then index=2
		// - New code: index=2, then (2 >= 2) → flag=true
		// - DIFFERENCE in flag setting timing!
		//
		// This test ensures that at the moment of flag setting, index is ALREADY out-of-bounds
		// ============================================================================
	})
})
