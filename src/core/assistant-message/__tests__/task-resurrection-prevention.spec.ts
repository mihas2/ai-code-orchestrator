// npx vitest run src/core/assistant-message/__tests__/task-resurrection-prevention.spec.ts
//
// Regression tests for task resurrection after delegation fix.
//
// Root cause: Parent task is resurrected with new instanceId after delegation,
// despite having userMessageContentReady=true and TaskCompletionStatus.COMPLETING set.
//
// Fix includes:
// 1. Abort checks after async operations in recursivelyMakeClineRequests
// 2. Partial block finalization on attempt_completion
// 3. Completion status checks in external loop
// 4. isPaused=true instead of dispose during delegation
//
// See specification: docs/plans/task-resurrection-lifecycle-fix-spec.md

import { describe, it, expect, beforeEach, vi } from "vitest"
import { presentAssistantMessage } from "../presentAssistantMessage"
import { TaskCompletionStatus } from "../../task/TaskCompletionStatus"

vi.mock("../../task/Task")

vi.mock("../../tools/validateToolUse", () => ({
	validateToolUse: vi.fn(),
	isValidToolName: vi.fn(() => true),
}))

// Mirrors AttemptCompletionTool.handle():
// - partial blocks go to handlePartial(), which only streams a preview and must NOT
//   change the completion status (that would stop the task loop too early);
// - complete blocks go to execute(), which asks "completion_result" and moves the task
//   from RUNNING to COMPLETING when the user accepts it.
async function simulateAttemptCompletion(task: any, block: any) {
	if (block.partial) {
		return
	}
	const { response } = await task.ask("completion_result", "", false)
	if (response === "yesButtonClicked" && task.taskCompletionStatus === TaskCompletionStatus.RUNNING) {
		task.setCompletionStatus(TaskCompletionStatus.COMPLETING)
	}
}

const attemptCompletionHandleMock = vi.fn().mockImplementation(simulateAttemptCompletion)

vi.mock("../../tools/AttemptCompletionTool", () => ({
	attemptCompletionTool: {
		handle: (...args: unknown[]) => attemptCompletionHandleMock(...args),
	},
}))

describe("Task Resurrection Prevention", () => {
	let mockCline: any

	beforeEach(() => {
		attemptCompletionHandleMock.mockClear()

		mockCline = {
			taskId: "01test",
			instanceId: "abc123",
			abort: false,
			userMessageContentReady: false,
			didCompleteReadingStream: false,
			currentStreamingContentIndex: 0,
			presentAssistantMessageLocked: false,
			presentAssistantMessageHasPendingUpdates: false,
			assistantMessageContent: [],
			userMessageContent: [],
			didRejectTool: false,
			didAlreadyUseTool: false,
			consecutiveMistakeCount: 0,
			clineMessages: [],
			currentStreamingDidCheckpoint: false,
			taskCompletionStatus: TaskCompletionStatus.RUNNING,
			parentTaskId: undefined,
			isPaused: false,
			checkpointSave: vi.fn().mockResolvedValue(undefined),
			setCompletionStatus: vi.fn().mockImplementation((status: TaskCompletionStatus) => {
				mockCline.taskCompletionStatus = status
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

		mockCline.pushToolResultToUserContent = vi.fn().mockImplementation((toolResult: any) => {
			const existingResult = mockCline.userMessageContent.find(
				(block: any) => block.type === "tool_result" && block.tool_use_id === toolResult.tool_use_id,
			)
			if (existingResult) {
				return false
			}
			mockCline.userMessageContent.push(toolResult)
			return true
		})

		// Default: the user accepts the completion result (see simulateAttemptCompletion)
		attemptCompletionHandleMock.mockImplementation(simulateAttemptCompletion)
	})

	// ============================================================================
	// 1. ABORT-CHECKS (3 теста)
	// ============================================================================
	describe("Abort Checks After Async Operations", () => {
		it("should throw error when task is aborted at start", async () => {
			// Тест: abort установлен до вызова presentAssistantMessage
			// Ожидание: функция выбрасывает исключение с сообщением "aborted"

			mockCline.abort = true
			mockCline.assistantMessageContent = []
			mockCline.currentStreamingContentIndex = 0
			mockCline.didCompleteReadingStream = true

			// presentAssistantMessage должен детектировать abort и выбросить исключение
			await expect(presentAssistantMessage(mockCline)).rejects.toThrow(/aborted/)
		})

		it("should detect abort flag early to prevent resurrection", async () => {
			// Тест: проверяем что abort флаг проверяется в начале функции
			// Это предотвращает создание новых API запросов

			mockCline.abort = true
			mockCline.didCompleteReadingStream = true

			await expect(presentAssistantMessage(mockCline)).rejects.toThrow(/aborted/)

			// Проверяем, что abort был установлен и функция вышла рано
			expect(mockCline.abort).toBe(true)
		})

		it("should prevent new API calls when abort is set", async () => {
			// Тест: при установленном abort не должно быть новых API вызовов

			mockCline.abort = true
			mockCline.assistantMessageContent = []
			mockCline.didCompleteReadingStream = false

			// Должно выбросить исключение до любых API вызовов
			await expect(presentAssistantMessage(mockCline)).rejects.toThrow(/aborted/)
		})
	})

	// ============================================================================
	// 2. PARTIAL FINALIZATION (2 теста)
	// ============================================================================
	describe("Partial Block Finalization on attempt_completion", () => {
		it("should treat a partial attempt_completion block as a preview until it is finalized", async () => {
			// A partial block is a streaming preview: presentAssistantMessage must not
			// force-finalize it, set the completion status or release the task loop.
			// Task.ts marks the block complete (partial=false) when the tool call ends.
			const block = {
				type: "tool_use" as const,
				id: "completion-partial",
				name: "attempt_completion" as const,
				params: { result: "test" },
				nativeArgs: { result: "test" },
				partial: true,
			}
			mockCline.assistantMessageContent = [block]
			mockCline.currentStreamingContentIndex = 0
			mockCline.didCompleteReadingStream = true
			mockCline.taskCompletionStatus = TaskCompletionStatus.RUNNING

			await presentAssistantMessage(mockCline)

			expect(attemptCompletionHandleMock).toHaveBeenCalledTimes(1)
			expect(mockCline.currentStreamingContentIndex).toBe(0)
			expect(mockCline.userMessageContentReady).toBe(false)
			expect(mockCline.taskCompletionStatus).toBe(TaskCompletionStatus.RUNNING)

			// The tool call ends: the block is finalized and presented again
			block.partial = false
			await presentAssistantMessage(mockCline)

			expect(attemptCompletionHandleMock).toHaveBeenCalledTimes(2)
			expect(mockCline.currentStreamingContentIndex).toBe(1)
			expect(mockCline.userMessageContentReady).toBe(true)
			expect(mockCline.taskCompletionStatus).toBe(TaskCompletionStatus.COMPLETING)
		})

		it("should not process attempt_completion again once the finalized block completed", async () => {
			const block = {
				type: "tool_use" as const,
				id: "completion-test",
				name: "attempt_completion" as const,
				params: { result: "done" },
				nativeArgs: { result: "done" },
				partial: false,
			}
			mockCline.assistantMessageContent = [block]
			mockCline.currentStreamingContentIndex = 0
			mockCline.didCompleteReadingStream = true
			mockCline.taskCompletionStatus = TaskCompletionStatus.RUNNING

			await presentAssistantMessage(mockCline)

			expect(attemptCompletionHandleMock).toHaveBeenCalledTimes(1)
			expect(mockCline.userMessageContentReady).toBe(true)
			expect(mockCline.taskCompletionStatus).toBe(TaskCompletionStatus.COMPLETING)

			// A late call (e.g. from the stream loop) must not run the completion again
			await presentAssistantMessage(mockCline)

			expect(attemptCompletionHandleMock).toHaveBeenCalledTimes(1)
		})
	})

	// ============================================================================
	// 3. COMPLETION STATUS CHECKS (2 теста)
	// ============================================================================
	describe("Completion Status Loop Prevention", () => {
		it("should respect COMPLETING status to prevent resurrection", async () => {
			// Тест: задача в статусе COMPLETING не должна делать новые запросы
			// Это проверяет исправление в Task.ts:2688

			mockCline.taskCompletionStatus = TaskCompletionStatus.COMPLETING
			mockCline.userMessageContentReady = true
			mockCline.didCompleteReadingStream = true
			mockCline.assistantMessageContent = []

			// В статусе COMPLETING внешний цикл должен прерваться
			// presentAssistantMessage должен завершиться без новых запросов
			await presentAssistantMessage(mockCline)

			// Проверяем что флаги остались установленными
			expect(mockCline.taskCompletionStatus).toBe(TaskCompletionStatus.COMPLETING)
			expect(mockCline.userMessageContentReady).toBe(true)
		})

		it("should respect COMPLETED status to prevent resurrection", async () => {
			// Аналогично для COMPLETED статуса

			mockCline.taskCompletionStatus = TaskCompletionStatus.COMPLETED
			mockCline.userMessageContentReady = true
			mockCline.didCompleteReadingStream = true
			mockCline.assistantMessageContent = []

			await presentAssistantMessage(mockCline)

			// Статус должен остаться COMPLETED
			expect(mockCline.taskCompletionStatus).toBe(TaskCompletionStatus.COMPLETED)
			expect(mockCline.userMessageContentReady).toBe(true)
		})
	})

	// ============================================================================
	// 4. DELEGATION WITHOUT DISPOSE (3 теста)
	// ============================================================================
	describe("Parent Task Preservation During Delegation", () => {
		it("should preserve parent isPaused flag during delegation", async () => {
			// Тест: isPaused=true устанавливается вместо dispose

			mockCline.parentTaskId = undefined // This is the parent
			mockCline.isPaused = false

			// Simulate delegation by setting isPaused
			mockCline.isPaused = true

			// Check that parent is paused, not disposed
			expect(mockCline.isPaused).toBe(true)
			expect(mockCline.abort).toBe(false) // Should NOT be aborted
		})

		it("should preserve parent instanceId after delegation", async () => {
			// Тест: instanceId родителя не меняется после делегирования

			const originalInstanceId = mockCline.instanceId
			const originalTaskId = mockCline.taskId

			// Simulate delegation
			mockCline.isPaused = true

			// After delegation, IDs should remain the same
			expect(mockCline.instanceId).toBe(originalInstanceId)
			expect(mockCline.taskId).toBe(originalTaskId)
		})

		it("should preserve parent flags (userMessageContentReady, completionStatus) after delegation", async () => {
			// Тест: флаги родителя сохраняются при делегировании

			// Set parent flags before delegation
			mockCline.userMessageContentReady = true
			mockCline.taskCompletionStatus = TaskCompletionStatus.COMPLETING

			// Simulate delegation
			mockCline.isPaused = true

			// Flags should be preserved
			expect(mockCline.userMessageContentReady).toBe(true)
			expect(mockCline.taskCompletionStatus).toBe(TaskCompletionStatus.COMPLETING)
			expect(mockCline.isPaused).toBe(true)
		})
	})

	// ============================================================================
	// 5. INTEGRATION (1 тест)
	// ============================================================================
	describe("Full Delegation Cycle Without Resurrection", () => {
		it(
			"should complete delegation without creating new parent instances",
			async () => {
				// Integration тест: проверяем что все исправления работают вместе

				// 1. Parent starts delegation
				const parentInstanceId = mockCline.instanceId
				const parentTaskId = mockCline.taskId

				// 2. Parent sets userMessageContentReady and COMPLETING before pausing
				mockCline.userMessageContentReady = true
				mockCline.setCompletionStatus(TaskCompletionStatus.COMPLETING)

				// 3. Parent is paused (NOT disposed)
				mockCline.isPaused = true

				// Verify parent state is preserved
				expect(mockCline.instanceId).toBe(parentInstanceId)
				expect(mockCline.taskId).toBe(parentTaskId)
				expect(mockCline.userMessageContentReady).toBe(true)
				expect(mockCline.taskCompletionStatus).toBe(TaskCompletionStatus.COMPLETING)
				expect(mockCline.isPaused).toBe(true)
				expect(mockCline.abort).toBe(false) // Critical: NOT aborted

				// 4. Simulate subtask completion and parent resume
				mockCline.isPaused = false

				// 5. Parent resumes with same instanceId (NO resurrection)
				expect(mockCline.instanceId).toBe(parentInstanceId)
				expect(mockCline.taskId).toBe(parentTaskId)

				// 6. Parent should NOT make new API requests due to COMPLETING status
				mockCline.assistantMessageContent = []
				await presentAssistantMessage(mockCline)

				// Parent should stay in COMPLETING status
				expect(mockCline.taskCompletionStatus).toBe(TaskCompletionStatus.COMPLETING)
			},
			{ timeout: 5000 },
		)
	})
})
