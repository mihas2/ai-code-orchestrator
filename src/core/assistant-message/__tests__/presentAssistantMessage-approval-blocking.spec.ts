// npx vitest run src/core/assistant-message/__tests__/presentAssistantMessage-approval-blocking.spec.ts
//
// Unit test for approval-based tools hanging after checkpoint.
//
// Root cause: Stream completes WHILE tool waits for user approval, causing the
// `userMessageContentReady` flag to never be set due to frozen execution context.
//
// Fix applied in presentAssistantMessage.ts:520
// Rescue path after `await task.ask()` checks conditions and sets flag if stream completed.

import { describe, it, expect, beforeEach, vi } from "vitest"
import { presentAssistantMessage } from "../presentAssistantMessage"

vi.mock("../../task/Task")

vi.mock("../../tools/validateToolUse", () => ({
	validateToolUse: vi.fn(),
	isValidToolName: vi.fn(() => true),
}))

// Mock read_file tool to call askApproval
// This simulates a tool that requires approval DURING execution (like read_file with batch approval)
const readFileExecuteMock = vi.fn().mockImplementation(async (params: any, task: any, callbacks: any) => {
	console.log("[TEST] readFileExecuteMock called, params:", params)
	console.log("[TEST] callbacks.askApproval exists:", !!callbacks.askApproval)

	// Simulate tool requiring approval
	const approved = await callbacks.askApproval("tool", JSON.stringify({ tool: "read_file", path: params.path }))

	console.log("[TEST] askApproval returned:", approved)

	if (approved) {
		// Tool executes successfully
		// pushToolResult expects either a string or an array of content blocks
		callbacks.pushToolResult("File content here")
	}
})

vi.mock("../../tools/ReadFileTool", () => ({
	readFileTool: {
		name: "read_file",
		async handle(task: any, block: any, callbacks: any) {
			// BaseTool.handle() extracts params from block.nativeArgs
			if (block.partial) {
				return
			}
			const params = block.nativeArgs || block.params
			await readFileExecuteMock(params, task, callbacks)
		},
		async handlePartial() {
			// no-op
		},
	},
}))

describe("presentAssistantMessage - approval tool hang fix", () => {
	let mockTask: any

	beforeEach(() => {
		readFileExecuteMock.mockClear()

		mockTask = {
			taskId: "test-task-id",
			instanceId: "test-instance",
			abort: false,
			presentAssistantMessageLocked: false,
			presentAssistantMessageHasPendingUpdates: false,
			currentStreamingContentIndex: 0,
			assistantMessageContent: [],
			userMessageContent: [],
			didCompleteReadingStream: false, // Initially stream is NOT complete
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
			// Critical: task.ask() mock simulates stream completion during approval wait
			ask: vi.fn().mockImplementation(async () => {
				// Simulate: while waiting for approval, stream completes
				// DON'T manually change index - it's managed by presentAssistantMessage
				mockTask.didCompleteReadingStream = true

				return { response: "yesButtonClicked", text: "", images: [] }
			}),
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

	it("should set userMessageContentReady=true via rescue path when stream completes during approval wait", async () => {
		// Setup: Only ONE tool requiring approval (read_file), NO text block
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

		// Start with didCompleteReadingStream = true (stream already complete)
		mockTask.didCompleteReadingStream = true

		// BEFORE: flag is false
		expect(mockTask.userMessageContentReady).toBe(false)
		expect(mockTask.currentStreamingContentIndex).toBe(0)

		// Execute presentAssistantMessage
		// It will:
		// 1. Process tool_use block (index 0)
		// 2. readFileTool.handle() calls askApproval()
		// 3. askApproval() calls task.ask()
		// 4. DURING task.ask(): mock sets didCompleteReadingStream=true (already true)
		// 5. AFTER task.ask() returns: rescue path should detect and set flag
		await presentAssistantMessage(mockTask)

		// Debug output
		console.log("readFileExecuteMock called:", readFileExecuteMock.mock.calls.length)
		console.log("task.ask called:", mockTask.ask.mock.calls.length)
		console.log("didCompleteReadingStream:", mockTask.didCompleteReadingStream)
		console.log("currentStreamingContentIndex:", mockTask.currentStreamingContentIndex)
		console.log("userMessageContentReady:", mockTask.userMessageContentReady)

		// AFTER: rescue path should have detected stream completion and set flag
		expect(mockTask.didCompleteReadingStream).toBe(true)
		// Index should be incremented after processing the one tool block (0->1)
		expect(mockTask.currentStreamingContentIndex).toBe(1) // out of bounds (1 >= 1)
		expect(mockTask.userMessageContentReady).toBe(true) // ✅ CRITICAL: rescue path must set this

		// Tool should have been approved and executed
		expect(mockTask.ask).toHaveBeenCalled()
		expect(readFileExecuteMock).toHaveBeenCalledTimes(1)
	})

	it("should handle approval rejection when stream completes during wait", async () => {
		// Test case: user rejects tool while stream is completing
		// Track if tool logic executed (not just approval asked)
		let toolLogicExecuted = false
		readFileExecuteMock.mockImplementation(async (params: any, task: any, callbacks: any) => {
			const approved = await callbacks.askApproval(
				"tool",
				JSON.stringify({ tool: "read_file", path: params.path }),
			)
			if (approved) {
				toolLogicExecuted = true
				callbacks.pushToolResult("File content")
			}
		})

		mockTask.ask = vi.fn().mockImplementation(async () => {
			// Simulate stream completion during approval wait
			mockTask.didCompleteReadingStream = true

			// User rejects the tool
			return { response: "noButtonClicked", text: "Don't read this file", images: [] }
		})

		const toolCallId = "tool_call_read_file_rejected"
		mockTask.assistantMessageContent = [
			{
				type: "tool_use",
				id: toolCallId,
				name: "read_file",
				params: { path: "sensitive.ts" },
				nativeArgs: { path: "sensitive.ts" },
				partial: false,
			},
		]

		expect(mockTask.userMessageContentReady).toBe(false)

		await presentAssistantMessage(mockTask)

		// Even when tool is rejected, rescue path should still check and set flag
		expect(mockTask.userMessageContentReady).toBe(true)
		expect(mockTask.didRejectTool).toBe(true)
		// Tool mock was called (to ask approval), but tool logic did NOT execute
		expect(readFileExecuteMock).toHaveBeenCalledTimes(1)
		expect(toolLogicExecuted).toBe(false)
	})

	it("should NOT set flag if stream is still incomplete after approval", async () => {
		// Test case: approval completes but stream is still ongoing
		mockTask.ask = vi.fn().mockImplementation(async () => {
			// Approval returns but stream is still incomplete
			mockTask.didCompleteReadingStream = false // Stream NOT complete
			// Index is still within bounds
			return { response: "yesButtonClicked", text: "", images: [] }
		})

		mockTask.assistantMessageContent = [
			{
				type: "tool_use",
				id: "tool_call_read_file_streaming",
				name: "read_file",
				params: { path: "test.ts" },
				nativeArgs: { path: "test.ts" },
				partial: false,
			},
			{
				type: "text",
				text: "More content coming...",
				partial: true, // Stream is still active
			},
		]

		expect(mockTask.userMessageContentReady).toBe(false)

		await presentAssistantMessage(mockTask)

		// Flag should remain false because stream is not complete
		expect(mockTask.userMessageContentReady).toBe(false)
		expect(mockTask.didCompleteReadingStream).toBe(false)
	})
})
