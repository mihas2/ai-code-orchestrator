// npx vitest run src/core/assistant-message/__tests__/presentAssistantMessage-completion-guard.spec.ts
//
// Regression tests for attempt_completion infinite loop fix.
//
// Root cause: Erroneous guard at the start of presentAssistantMessage blocked ALL function calls,
// including processing of subtask results. This led to:
// 1. Infinite loop via EMERGENCY_RESCUE after attempt_completion
// 2. Interruption of parent tasks during delegation
//
// Fix: Guard removed from the start of the function (lines 76-84). Guard remains only before recursion (line 983).
//
// See specification: plans/presentAssistantMessage-infinite-loop-fix-spec.md

import { describe, it, expect, beforeEach, vi } from "vitest"
import { presentAssistantMessage } from "../presentAssistantMessage"
import { TaskCompletionStatus } from "../../task/TaskCompletionStatus"

vi.mock("../../task/Task")

vi.mock("../../tools/validateToolUse", () => ({
	validateToolUse: vi.fn(),
	isValidToolName: vi.fn(() => true),
}))

const attemptCompletionHandleMock = vi.fn().mockImplementation(async (task: any, block: any) => {
	// Simulate the behavior of AttemptCompletionTool setting completion status
	// This happens in both execute() for complete blocks and handlePartial() for partial blocks
	if (task.taskCompletionStatus === TaskCompletionStatus.RUNNING) {
		task.setCompletionStatus(TaskCompletionStatus.COMPLETING)
	}
})

vi.mock("../../tools/AttemptCompletionTool", () => ({
	attemptCompletionTool: {
		handle: (...args: unknown[]) => attemptCompletionHandleMock(...args),
	},
}))

describe("presentAssistantMessage - completion guard regression tests", () => {
	let mockTask: any

	beforeEach(() => {
		attemptCompletionHandleMock.mockClear()

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

		// Mock attemptCompletionTool to simulate successful completion
		attemptCompletionHandleMock.mockImplementation(async (task: any, block: any, callbacks: any) => {
			// Simulate approval
			await callbacks.askApproval("tool", JSON.stringify({ tool: "attempt_completion" }))
			// AttemptCompletionTool does NOT set userMessageContentReady or change status
			// That's done in presentAssistantMessage after tool.handle() returns
		})
	})

	it("should NOT recursively call presentAssistantMessage after attempt_completion", async () => {
		// ============================================================================
		// Test 1: attempt_completion does NOT cause infinite recursion
		// ============================================================================
		//
		// Setup: task with one block containing attempt_completion
		// Expected: function is NOT called recursively after processing attempt_completion
		// Expected: userMessageContentReady = true
		// Expected: completionStatus = COMPLETING

		const toolCallId = "completion-1"
		mockTask.assistantMessageContent = [
			{
				type: "tool_use",
				id: toolCallId,
				name: "attempt_completion",
				params: { result: "Task completed successfully" },
				nativeArgs: { result: "Task completed successfully" },
				partial: false,
			},
		]
		mockTask.currentStreamingContentIndex = 0
		mockTask.didCompleteReadingStream = true
		mockTask.taskCompletionStatus = TaskCompletionStatus.RUNNING

		// Spy on presentAssistantMessage to detect recursion
		const presentAssistantMessageSpy = vi.fn()
		const originalPresentAssistantMessage = presentAssistantMessage
		// Note: We can't easily spy on recursive calls in the same function,
		// so we'll verify by checking the final state instead

		expect(mockTask.userMessageContentReady).toBe(false)
		expect(mockTask.taskCompletionStatus).toBe(TaskCompletionStatus.RUNNING)

		await presentAssistantMessage(mockTask)

		// Checks:
		// 1. attempt_completion tool was executed
		expect(attemptCompletionHandleMock).toHaveBeenCalledTimes(1)

		// 2. Index was incremented (0 → 1, now out of bounds)
		expect(mockTask.currentStreamingContentIndex).toBe(1)

		// 3. CRITICAL: userMessageContentReady is set to true immediately after attempt_completion
		// This prevents pWaitFor timeout and EMERGENCY_RESCUE
		expect(mockTask.userMessageContentReady).toBe(true)

		// 4. completionStatus is set to COMPLETING
		expect(mockTask.taskCompletionStatus).toBe(TaskCompletionStatus.COMPLETING)

		// 5. No further recursion happened (index at boundary, not beyond)
		expect(mockTask.currentStreamingContentIndex).toBe(mockTask.assistantMessageContent.length)
	})

	it("should allow parent task to process subtask tool_result after completion", async () => {
		// ============================================================================
		// Test 2: Parent task processes subtask result
		// ============================================================================
		//
		// Setup: parent task (orchestrator) with completionStatus = RUNNING
		// Setup: block with tool_result from new_task (subtask completed)
		// Expected: function executes WITHOUT early return
		// Expected: tool_result is processed correctly
		// Expected: parent task is NOT interrupted

		mockTask.taskId = "parent-task-123"
		mockTask.parentTaskId = undefined // This is the parent
		mockTask.taskCompletionStatus = TaskCompletionStatus.RUNNING

		// Simulate situation: parent called new_task, subtask completed,
		// and now parent receives tool_result
		const newTaskToolId = "new-task-1"
		mockTask.assistantMessageContent = [
			{
				type: "tool_use",
				id: newTaskToolId,
				name: "new_task",
				params: { mode: "code", message: "Do work" },
				nativeArgs: { mode: "code", message: "Do work" },
				partial: false,
			},
		]

		// tool_result already added to userMessageContent (done by reopenParentFromDelegation)
		mockTask.userMessageContent = [
			{
				type: "tool_result",
				tool_use_id: newTaskToolId,
				content: [
					{
						type: "text",
						text: "Subtask completed: File created successfully",
					},
				],
			},
		]

		// currentStreamingContentIndex points to the new_task block
		mockTask.currentStreamingContentIndex = 0
		mockTask.didCompleteReadingStream = true
		mockTask.userMessageContentReady = false

		// Before the fix, a guard at the start of presentAssistantMessage would block this call
		// because it checked completionStatus without distinguishing between contexts.
		// Now, the function should proceed normally.

		await presentAssistantMessage(mockTask)

		// Checks:
		// 1. Function executed without early return (lock was released)
		expect(mockTask.presentAssistantMessageLocked).toBe(false)

		// 2. Index was incremented past the new_task block
		expect(mockTask.currentStreamingContentIndex).toBeGreaterThan(0)

		// 3. userMessageContentReady is set (no more blocks to process)
		expect(mockTask.userMessageContentReady).toBe(true)

		// 4. Parent task status remains RUNNING (it didn't call attempt_completion yet)
		// Note: In real scenario, parent would continue and eventually call attempt_completion itself
		expect(mockTask.taskCompletionStatus).toBe(TaskCompletionStatus.RUNNING)
	})

	it("should prevent recursion when completionStatus is COMPLETING", async () => {
		// ============================================================================
		// Test 3: Guard before recursion works correctly
		// ============================================================================
		//
		// Setup: task with attempt_completion and additional block after it
		// Expected: guard triggers, preventing processing of blocks after completion
		// Expected: userMessageContentReady = true
		// Expected: status = COMPLETING

		mockTask.assistantMessageContent = [
			{
				type: "tool_use",
				id: "completion-1",
				name: "attempt_completion",
				params: { result: "Done" },
				nativeArgs: { result: "Done" },
				partial: false,
			},
			// This block should NOT be processed due to the guard
			{
				type: "tool_use",
				id: "tool-after-completion",
				name: "read_file",
				params: { path: "test.ts" },
				nativeArgs: { path: "test.ts" },
				partial: false,
			},
		]

		mockTask.currentStreamingContentIndex = 0
		mockTask.didCompleteReadingStream = true
		mockTask.taskCompletionStatus = TaskCompletionStatus.RUNNING

		await presentAssistantMessage(mockTask)

		// After processing:
		// 1. attempt_completion block processed, index 0→1, status→COMPLETING
		// 2. Guard before recursion triggers, second block is NOT processed

		// Checks:
		// 1. attempt_completion was called
		expect(attemptCompletionHandleMock).toHaveBeenCalledTimes(1)

		// 2. Status changed to COMPLETING
		expect(mockTask.taskCompletionStatus).toBe(TaskCompletionStatus.COMPLETING)

		// 3. userMessageContentReady is set
		expect(mockTask.userMessageContentReady).toBe(true)

		// 4. Index stopped at 1 (guard prevented processing of second block)
		expect(mockTask.currentStreamingContentIndex).toBe(1)

		// 5. Second block was NOT processed (guard triggered)
		// In real code this block won't be shown to the user
	})

	it("should NOT trigger EMERGENCY_RESCUE after successful attempt_completion", async () => {
		// ============================================================================
		// Test 4: EMERGENCY_RESCUE does not trigger after attempt_completion
		// ============================================================================
		//
		// Setup: task with attempt_completion block
		// Mock: pWaitFor with timeout (simulated via setTimeout)
		// Expected: userMessageContentReady = true BEFORE timeout expires
		// Expected: EMERGENCY_RESCUE is NOT called
		// Expected: no repeated API requests

		const toolCallId = "completion-emergency"
		mockTask.assistantMessageContent = [
			{
				type: "tool_use",
				id: toolCallId,
				name: "attempt_completion",
				params: { result: "Task done" },
				nativeArgs: { result: "Task done" },
				partial: false,
			},
		]
		mockTask.currentStreamingContentIndex = 0
		mockTask.didCompleteReadingStream = true
		mockTask.taskCompletionStatus = TaskCompletionStatus.RUNNING

		// Simulate pWaitFor timeout check
		const timeoutDuration = 5000 // 5 seconds (this test's own simulated timeout; production pWaitFor has no timeout)
		let emergencyRescueTriggered = false

		const timeoutPromise = new Promise((resolve) => {
			setTimeout(() => {
				// Simulate EMERGENCY_RESCUE logic
				if (
					mockTask.didCompleteReadingStream &&
					!mockTask.userMessageContentReady &&
					mockTask.taskCompletionStatus !== TaskCompletionStatus.COMPLETED
				) {
					console.warn(`[EMERGENCY_RESCUE] Would trigger after ${timeoutDuration}ms timeout`)
					emergencyRescueTriggered = true
					mockTask.userMessageContentReady = true
				}
				resolve(undefined)
			}, timeoutDuration)
		})

		// Start presentAssistantMessage
		const presentPromise = presentAssistantMessage(mockTask)

		// Wait for presentAssistantMessage to complete
		await presentPromise

		// Checks BEFORE timeout:
		// 1. userMessageContentReady is set immediately
		expect(mockTask.userMessageContentReady).toBe(true)

		// 2. completionStatus is COMPLETING
		expect(mockTask.taskCompletionStatus).toBe(TaskCompletionStatus.COMPLETING)

		// 3. EMERGENCY_RESCUE should NOT trigger (flag is already set)
		expect(emergencyRescueTriggered).toBe(false)

		// Wait for timeout to confirm EMERGENCY_RESCUE doesn't trigger
		await timeoutPromise

		// 4. After timeout, EMERGENCY_RESCUE still did not trigger
		expect(emergencyRescueTriggered).toBe(false)

		// 5. Only one attempt_completion call (no resurrection)
		expect(attemptCompletionHandleMock).toHaveBeenCalledTimes(1)
	})

	it("should handle attempt_completion as last block without hanging", async () => {
		// ============================================================================
		// Edge case: attempt_completion as last block (most critical scenario)
		// ============================================================================
		//
		// This scenario caused an infinite loop in the old version of the code:
		// 1. Guard at the start blocked processing after setting status=COMPLETING
		// 2. pWaitFor waited 60 seconds
		// 3. EMERGENCY_RESCUE "resurrected" the task
		// 4. Loop repeated

		const toolCallId = "completion-last-block"
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
		mockTask.currentStreamingContentIndex = 0
		mockTask.didCompleteReadingStream = true
		mockTask.taskCompletionStatus = TaskCompletionStatus.RUNNING

		// Add timeout to detect hang
		const hangTimeoutMs = 3000
		const hangTimeout = new Promise((_, reject) => {
			setTimeout(() => reject(new Error("Test timeout - possible hang detected")), hangTimeoutMs)
		})

		const testPromise = presentAssistantMessage(mockTask)

		// Race between test execution and timeout
		await Promise.race([testPromise, hangTimeout])

		// If we got here, there was no hang
		expect(mockTask.userMessageContentReady).toBe(true)
		expect(mockTask.taskCompletionStatus).toBe(TaskCompletionStatus.COMPLETING)
		expect(mockTask.currentStreamingContentIndex).toBe(1)
		expect(attemptCompletionHandleMock).toHaveBeenCalledTimes(1)
	})

	it("should allow parent to resume after child attempt_completion delegation", async () => {
		// ============================================================================
		// Integration test: Parent processes blocks after delegation
		// ============================================================================
		//
		// This test verifies that removing the guard from the start of the function
		// does NOT break processing of parent task blocks after returning from subtask

		mockTask.taskId = "parent-orchestrator"
		mockTask.parentTaskId = undefined
		mockTask.taskCompletionStatus = TaskCompletionStatus.RUNNING

		// Simulate situation: parent regained control after delegation
		// and now must process the tool_use block
		const newTaskToolId = "delegation-new-task"
		mockTask.assistantMessageContent = [
			{
				type: "tool_use",
				id: newTaskToolId,
				name: "new_task",
				params: { mode: "code", message: "Create a file" },
				nativeArgs: { mode: "code", message: "Create a file" },
				partial: false,
			},
		]

		// tool_result already added to userMessageContent (done by reopenParentFromDelegation)
		mockTask.userMessageContent = [
			{
				type: "tool_result",
				tool_use_id: newTaskToolId,
				content: [
					{
						type: "text",
						text: "Subtask result: File created at /path/to/file.ts",
					},
				],
			},
		]

		mockTask.currentStreamingContentIndex = 0
		mockTask.userMessageContentReady = false
		mockTask.didCompleteReadingStream = true

		// CRITICAL: Parent must process the block WITHOUT being blocked by the guard
		// The old guard at the start of the function would have blocked this call
		await presentAssistantMessage(mockTask)

		// Checks:
		// 1. Index was incremented (block processed)
		expect(mockTask.currentStreamingContentIndex).toBeGreaterThan(0)

		// 2. userMessageContentReady is set (no more blocks)
		expect(mockTask.userMessageContentReady).toBe(true)

		// 3. Parent remains in RUNNING status
		expect(mockTask.taskCompletionStatus).toBe(TaskCompletionStatus.RUNNING)

		// 4. There were no errors or hangs
		expect(mockTask.presentAssistantMessageLocked).toBe(false)
	})
})
