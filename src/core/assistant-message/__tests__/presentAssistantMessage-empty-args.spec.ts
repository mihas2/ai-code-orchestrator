import { describe, it, expect, beforeEach, vi } from "vitest"

import { presentAssistantMessage } from "../presentAssistantMessage"
import { NativeToolCallParser } from "../NativeToolCallParser"

vi.mock("../../task/Task")
vi.mock("../../tools/validateToolUse", () => ({
	validateToolUse: vi.fn(),
	isValidToolName: vi.fn(() => true),
}))

describe("presentAssistantMessage - empty tool arguments", () => {
	let mockTask: any

	beforeEach(() => {
		NativeToolCallParser.clearAllStreamingToolCalls()
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
					}),
				}),
			},
			say: vi.fn().mockResolvedValue(undefined),
			ask: vi.fn().mockResolvedValue({ response: "yesButtonClicked" }),
			overwriteClineMessages: vi.fn().mockImplementation(async (messages: any[]) => {
				mockTask.clineMessages = messages
			}),
			partialAskTsByToolCallId: new Map<string, number>(),
			beginPartialToolAsk: vi.fn(),
			removePartialAskForToolCall: vi.fn().mockImplementation(async (toolCallId: string) => {
				const ts = mockTask.partialAskTsByToolCallId.get(toolCallId)
				mockTask.partialAskTsByToolCallId.delete(toolCallId)
				if (ts === undefined) {
					return false
				}
				const message = mockTask.clineMessages.find((item: any) => item.ts === ts)
				if (!message || message.partial !== true || message.type !== "ask") {
					return false
				}
				mockTask.clineMessages = mockTask.clineMessages.filter((item: any) => item.ts !== ts)
				return true
			}),
		}

		mockTask.pushToolResultToUserContent = vi.fn().mockImplementation((toolResult: any) => {
			mockTask.userMessageContent.push(toolResult)
			return true
		})
	})

	it("puts the block parseError into the model tool_result and does not execute the tool", async () => {
		const toolCallId = "toolu_empty_present"
		const parsed = NativeToolCallParser.parseToolCall({
			id: toolCallId,
			name: "read_file",
			arguments: "   ",
		})

		expect(parsed?.type).toBe("tool_use")
		if (parsed?.type !== "tool_use") {
			return
		}

		mockTask.assistantMessageContent = [{ ...parsed, id: toolCallId }]

		await presentAssistantMessage(mockTask)

		const expected = NativeToolCallParser.missingToolArgumentsMessage("read_file")
		const toolResult = mockTask.userMessageContent.find((block: any) => block.type === "tool_result")
		expect(toolResult).toBeDefined()
		expect(toolResult.is_error).toBe(true)
		expect(toolResult.tool_use_id).toBe(toolCallId)
		expect(toolResult.content).toContain(expected)
		expect(toolResult.content).not.toContain("missing nativeArgs")
		expect(mockTask.recordToolUsage).not.toHaveBeenCalled()
		expect(mockTask.ask).not.toHaveBeenCalled()
	})

	it("returns a tool_result for an unknown tool name that carries parseError", async () => {
		const toolCallId = "toolu_unknown_parse"
		const parseError = "Invalid tool call for 'not_a_real_tool': arguments could not be parsed."
		mockTask.assistantMessageContent = [
			{
				type: "tool_use",
				id: toolCallId,
				name: "not_a_real_tool",
				params: {},
				partial: false,
				parseError,
			},
		]

		await presentAssistantMessage(mockTask)

		const toolResult = mockTask.userMessageContent.find((block: any) => block.type === "tool_result")
		expect(toolResult).toMatchObject({
			type: "tool_result",
			tool_use_id: toolCallId,
			is_error: true,
		})
		expect(toolResult.content).toContain(parseError)
		expect(mockTask.recordToolUsage).not.toHaveBeenCalled()
	})

	it("says the tool error once, removes the hanging partial ask, and still sends tool_result", async () => {
		const toolCallId = "toolu_empty_ui"
		const parsed = NativeToolCallParser.parseToolCall({
			id: toolCallId,
			name: "read_file",
			arguments: "",
		})

		expect(parsed?.type).toBe("tool_use")
		if (parsed?.type !== "tool_use") {
			return
		}

		const partialAsk = {
			ts: 1,
			type: "ask",
			ask: "tool",
			text: '{"tool":"readFile","path":""}',
			partial: true,
		}
		const block = { ...parsed, id: toolCallId }
		mockTask.partialAskTsByToolCallId.set(toolCallId, partialAsk.ts)
		mockTask.clineMessages = [partialAsk]
		mockTask.assistantMessageContent = [block]

		const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
		try {
			await presentAssistantMessage(mockTask)

			expect(mockTask.clineMessages).toEqual([])
			expect(mockTask.removePartialAskForToolCall).toHaveBeenCalledWith(toolCallId)
			expect(mockTask.say).toHaveBeenCalledTimes(1)
			expect(mockTask.say).toHaveBeenCalledWith(
				"error",
				expect.stringContaining("unusableToolCall.emptyArguments"),
			)
			expect(warn).toHaveBeenCalledWith(expect.stringContaining("toolName=read_file"))
			expect(warn).toHaveBeenCalledWith(expect.stringContaining(`toolCallId=${toolCallId}`))
			expect(warn).toHaveBeenCalledWith(expect.stringContaining("rawArgumentsLength=0"))

			const toolResult = mockTask.userMessageContent.find((item: any) => item.type === "tool_result")
			expect(toolResult.is_error).toBe(true)
			expect(toolResult.tool_use_id).toBe(toolCallId)

			mockTask.currentStreamingContentIndex = 0
			mockTask.userMessageContent = []
			await presentAssistantMessage(mockTask)

			expect(mockTask.say).toHaveBeenCalledTimes(1)
			expect(warn).toHaveBeenCalledTimes(1)
			expect(mockTask.userMessageContent.filter((item: any) => item.type === "tool_result")).toHaveLength(1)
		} finally {
			warn.mockRestore()
		}
	})

	it("does not remove another tool's partial ask or a completed ask waiting for a response", async () => {
		const toolCallId = "toolu_empty_foreign"
		const parsed = NativeToolCallParser.parseToolCall({
			id: toolCallId,
			name: "read_file",
			arguments: "",
		})
		expect(parsed?.type).toBe("tool_use")
		if (parsed?.type !== "tool_use") {
			return
		}

		const otherPartial = {
			ts: 11,
			type: "ask",
			ask: "tool",
			text: '{"tool":"listFiles"}',
			partial: true,
		}
		const waitingAsk = {
			ts: 12,
			type: "ask",
			ask: "tool",
			text: '{"tool":"readFile","path":"kept.ts"}',
			partial: false,
		}
		mockTask.partialAskTsByToolCallId.set("toolu_other", otherPartial.ts)
		mockTask.partialAskTsByToolCallId.set(toolCallId, waitingAsk.ts)
		mockTask.clineMessages = [otherPartial, waitingAsk]
		mockTask.assistantMessageContent = [{ ...parsed, id: toolCallId }]

		await presentAssistantMessage(mockTask)

		expect(mockTask.clineMessages).toEqual([otherPartial, waitingAsk])
		expect(mockTask.removePartialAskForToolCall).toHaveBeenCalledWith(toolCallId)
	})

	it("reports two empty calls once each and removes only the partial ask bound to each call", async () => {
		const firstId = "toolu_empty_one"
		const secondId = "toolu_empty_two"
		const first = NativeToolCallParser.parseToolCall({ id: firstId, name: "read_file", arguments: "" })
		const second = NativeToolCallParser.parseToolCall({ id: secondId, name: "list_files", arguments: "" })
		expect(first?.type).toBe("tool_use")
		expect(second?.type).toBe("tool_use")
		if (first?.type !== "tool_use" || second?.type !== "tool_use") {
			return
		}

		const firstAsk = { ts: 21, type: "ask", ask: "tool", text: "first", partial: true }
		const secondAsk = { ts: 22, type: "ask", ask: "tool", text: "second", partial: true }
		mockTask.partialAskTsByToolCallId.set(firstId, firstAsk.ts)
		mockTask.partialAskTsByToolCallId.set(secondId, secondAsk.ts)
		mockTask.assistantMessageContent = [
			{ ...first, id: firstId },
			{ ...second, id: secondId },
		]
		mockTask.clineMessages = [firstAsk, secondAsk]

		await presentAssistantMessage(mockTask)

		expect(mockTask.clineMessages).toEqual([])
		expect(mockTask.removePartialAskForToolCall).toHaveBeenNthCalledWith(1, firstId)
		expect(mockTask.removePartialAskForToolCall).toHaveBeenNthCalledWith(2, secondId)
		expect(mockTask.say).toHaveBeenCalledTimes(2)
		const toolResults = mockTask.userMessageContent.filter((item: any) => item.type === "tool_result")
		expect(toolResults).toHaveLength(2)
		expect(toolResults.map((item: any) => item.tool_use_id)).toEqual([firstId, secondId])
		expect(new Set(toolResults.map((item: any) => item.tool_use_id)).size).toBe(2)
	})

	it("answers a non-streaming fallback block with a tool_result for the same id", async () => {
		const toolCallId = "toolu_unparsed"
		const fallback = {
			type: "tool_use" as const,
			name: "not_a_real_tool" as const,
			id: toolCallId,
			params: {},
			partial: false,
			parseError: "Invalid tool call for 'not_a_real_tool': arguments could not be parsed.",
		}

		mockTask.assistantMessageContent = [fallback]
		await presentAssistantMessage(mockTask)

		const toolResult = mockTask.userMessageContent.find((block: any) => block.type === "tool_result")
		expect(toolResult.tool_use_id).toBe(toolCallId)
		expect(toolResult.is_error).toBe(true)
		expect(toolResult.content).toContain(fallback.parseError)
		expect(mockTask.recordToolUsage).not.toHaveBeenCalled()
	})
})
