import { describe, it, expect, beforeEach, vi } from "vitest"
import { presentAssistantMessage } from "../presentAssistantMessage"
import type { Task } from "../../task/Task"

describe("presentAssistantMessage - recursion race condition", () => {
	let mockTask: any

	beforeEach(() => {
		mockTask = {
			taskId: "test-task-id",
			instanceId: "test-instance",
			abort: false,
			presentAssistantMessageLocked: false,
			presentAssistantMessageHasPendingUpdates: false,
			currentStreamingContentIndex: 0,
			assistantMessageContent: [
				{ type: "text", text: "block 0", partial: false },
				{ type: "tool_use", id: "tool1", name: "read_file", input: {}, partial: false },
			],
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
	})

	it("should set userMessageContentReady=true after processing the last block", async () => {
		// A single presentAssistantMessage call should recursively process ALL blocks
		await presentAssistantMessage(mockTask as Task)

		// After processing all blocks, the index should be beyond the array boundary
		expect(mockTask.currentStreamingContentIndex).toBe(2) // 0→1→2 (two blocks, index beyond boundary)

		// And the flag MUST be set (critical to avoid hanging)
		expect(mockTask.userMessageContentReady).toBe(true) // ❌ FAIL if race condition
	})

	it("should NOT hang if recursion occurs before flag check", async () => {
		// Emulate the situation: didCompleteReadingStream=true, but flag is not set
		mockTask.didCompleteReadingStream = true
		mockTask.userMessageContentReady = false

		// Process all blocks
		await presentAssistantMessage(mockTask as Task)

		// Flag MUST be set
		expect(mockTask.userMessageContentReady).toBe(true) // ❌ FAIL if race
	})
})
