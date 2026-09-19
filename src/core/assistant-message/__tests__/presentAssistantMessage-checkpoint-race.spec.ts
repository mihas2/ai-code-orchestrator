// npx vitest run src/core/assistant-message/__tests__/presentAssistantMessage-checkpoint-race.spec.ts
//
// Unit tests for the `userMessageContentReady` single-writer invariant described in
// plans/checkpoint-race-condition-audit.md.
//
// These tests assert that `presentAssistantMessage()` is the component responsible for
// setting `userMessageContentReady = true` after a file-editing tool (which triggers
// `checkpointSaveAndMark` -> `task.checkpointSave(true)`) finishes executing as the last
// content block in a turn. This directly covers audit item T1 from section 7.1.

import { describe, it, expect, beforeEach, vi } from "vitest"
import { presentAssistantMessage } from "../presentAssistantMessage"

vi.mock("../../task/Task")

vi.mock("../../tools/validateToolUse", () => ({
	validateToolUse: vi.fn(),
	isValidToolName: vi.fn(() => true),
}))

const applyDiffHandleMock = vi.fn().mockResolvedValue(undefined)

vi.mock("../../tools/ApplyDiffTool", () => ({
	applyDiffTool: {
		handle: (...args: unknown[]) => applyDiffHandleMock(...args),
	},
}))

describe("presentAssistantMessage - userMessageContentReady single-writer invariant", () => {
	let mockTask: any

	beforeEach(() => {
		applyDiffHandleMock.mockClear()
		applyDiffHandleMock.mockResolvedValue(undefined)

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
			// Field under test.
			userMessageContentReady: false,
			// checkpointSaveAndMark() depends on these.
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

	it("T1: sets userMessageContentReady=true after checkpointSaveAndMark + apply_diff.handle complete as the last block", async () => {
		const toolCallId = "tool_call_apply_diff_1"
		mockTask.assistantMessageContent = [
			{
				type: "tool_use",
				id: toolCallId,
				name: "apply_diff",
				params: { path: "foo.ts", diff: "diff content" },
				nativeArgs: { path: "foo.ts", diff: "diff content" },
				partial: false,
			},
		]

		expect(mockTask.userMessageContentReady).toBe(false)

		await presentAssistantMessage(mockTask)

		// checkpointSaveAndMark() must have awaited task.checkpointSave(true) BEFORE
		// the tool executed - this is what makes the event-handler write unnecessary.
		expect(mockTask.checkpointSave).toHaveBeenCalledWith(true)
		expect(mockTask.currentStreamingDidCheckpoint).toBe(true)

		// The tool itself must have been invoked.
		expect(applyDiffHandleMock).toHaveBeenCalledTimes(1)

		// Single-writer invariant: presentAssistantMessage is responsible for flipping
		// the flag to true once the last block finishes executing.
		expect(mockTask.userMessageContentReady).toBe(true)
	})

	it("does not re-run checkpointSaveAndMark for a second edit tool in the same streaming turn (currentStreamingDidCheckpoint guard)", async () => {
		mockTask.currentStreamingDidCheckpoint = true // Simulate a checkpoint already taken this turn.

		const toolCallId = "tool_call_apply_diff_2"
		mockTask.assistantMessageContent = [
			{
				type: "tool_use",
				id: toolCallId,
				name: "apply_diff",
				params: { path: "bar.ts", diff: "diff content" },
				nativeArgs: { path: "bar.ts", diff: "diff content" },
				partial: false,
			},
		]

		await presentAssistantMessage(mockTask)

		// checkpointSave should be skipped since currentStreamingDidCheckpoint was already true.
		expect(mockTask.checkpointSave).not.toHaveBeenCalled()
		expect(applyDiffHandleMock).toHaveBeenCalledTimes(1)
		expect(mockTask.userMessageContentReady).toBe(true)
	})

	it("leaves userMessageContentReady=false when didCompleteReadingStream is false and block is partial (streaming still in progress)", async () => {
		mockTask.didCompleteReadingStream = false
		const toolCallId = "tool_call_apply_diff_partial"
		mockTask.assistantMessageContent = [
			{
				type: "tool_use",
				id: toolCallId,
				name: "apply_diff",
				params: { path: "baz.ts", diff: "partial diff" },
				nativeArgs: { path: "baz.ts", diff: "partial diff" },
				partial: true,
			},
		]

		await presentAssistantMessage(mockTask)

		// Tool should not execute on partial blocks routed through the apply_diff case
		// handler in the same way; regardless, the flag must remain untouched here since
		// the block hasn't finished and the stream hasn't completed.
		expect(mockTask.userMessageContentReady).toBe(false)
	})
})
