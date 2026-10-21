import { describe, it, expect, vi } from "vitest"

import { presentAssistantMessage } from "../presentAssistantMessage"
import { Task } from "../../task/Task"
import { useMcpToolTool } from "../../tools/UseMcpToolTool"
import { readFileTool } from "../../tools/ReadFileTool"

function createTask() {
	const task = Object.create(Task.prototype) as Task
	const state = task as any
	state.taskId = "partial-ask-task"
	state.instanceId = "partial-ask-instance"
	state.abort = false
	state.workspacePath = "/workspace"
	state.presentAssistantMessageLocked = false
	state.presentAssistantMessageHasPendingUpdates = false
	state.currentStreamingContentIndex = 0
	state.assistantMessageContent = []
	state.userMessageContent = []
	state.didCompleteReadingStream = false
	state.didRejectTool = false
	state.didAlreadyUseTool = false
	state.consecutiveMistakeCount = 0
	state.clineMessages = []
	state.partialAskTsByToolCallId = new Map<string, number>()
	state.pendingPartialToolCallId = undefined
	state.nextPartialAskTs = 0
	state.lastMessageTs = undefined
	state.providerRef = {
		deref: () => ({
			getState: vi.fn().mockResolvedValue({ mode: "code", customModes: [] }),
			getMcpHub: () => undefined,
			postStateToWebviewWithoutTaskHistory: vi.fn(async () => {}),
		}),
	}
	state.addToClineMessages = vi.fn(async (message: any) => {
		state.clineMessages.push(message)
	})
	state.updateClineMessage = vi.fn(async () => {})
	state.overwriteClineMessages = vi.fn(async (messages: any[]) => {
		state.clineMessages = messages
	})
	state.say = vi.fn(async () => {})
	state.recordToolUsage = vi.fn()
	state.recordToolError = vi.fn()
	state.pushToolResultToUserContent = vi.fn((toolResult: any) => {
		state.userMessageContent.push(toolResult)
		return true
	})
	return task
}

describe("presentAssistantMessage partial tool ask binding", () => {
	it("binds interleaved MCP and regular partial asks and removes only the targeted message", async () => {
		const task = createTask()
		const mcpId = "mcp_partial_1"
		const toolId = "toolu_partial_1"
		const mcpBlock = {
			type: "mcp_tool_use" as const,
			id: mcpId,
			name: "mcp_server_tool",
			serverName: "server",
			toolName: "tool",
			arguments: { query: "one" },
			partial: true,
		}
		const readBlock = {
			type: "tool_use" as const,
			id: toolId,
			name: "read_file" as const,
			params: { path: "a.ts" },
			nativeArgs: { path: "a.ts" },
			partial: true,
		}

		const state = task as any
		state.assistantMessageContent = [mcpBlock]
		await presentAssistantMessage(task)

		state.currentStreamingContentIndex = 1
		state.assistantMessageContent = [mcpBlock, readBlock]
		await presentAssistantMessage(task)

		const updatedMcp = { ...mcpBlock, arguments: { query: "two" } }
		state.currentStreamingContentIndex = 0
		state.assistantMessageContent = [updatedMcp, readBlock]
		await presentAssistantMessage(task)

		const updatedRead = {
			...readBlock,
			params: { path: "b.ts" },
			nativeArgs: { path: "b.ts" },
		}
		state.currentStreamingContentIndex = 1
		state.assistantMessageContent = [updatedMcp, updatedRead]
		await presentAssistantMessage(task)

		expect(state.clineMessages).toHaveLength(2)
		expect(state.clineMessages[0].ask).toBe("use_mcp_server")
		expect(state.clineMessages[0].text).toContain("two")
		expect(state.clineMessages[0].partial).toBe(true)
		expect(state.clineMessages[1].ask).toBe("tool")
		expect(state.clineMessages[1].text).toContain("b.ts")
		expect(state.clineMessages[1].text).not.toContain("a.ts")
		expect(state.partialAskTsByToolCallId.get(mcpId)).toBe(state.clineMessages[0].ts)
		expect(state.partialAskTsByToolCallId.get(toolId)).toBe(state.clineMessages[1].ts)
		expect(state.pendingPartialToolCallId).toBeUndefined()

		expect(await task.removePartialAskForToolCall(mcpId)).toBe(true)
		expect(state.clineMessages).toEqual(
			[state.clineMessages[0] ? state.clineMessages[0] : undefined].filter(Boolean),
		)
		expect(state.clineMessages).toHaveLength(1)
		expect(state.clineMessages[0].ask).toBe("tool")
		expect(state.clineMessages[0].text).toContain("b.ts")
		expect(state.partialAskTsByToolCallId.has(mcpId)).toBe(false)
		expect(state.partialAskTsByToolCallId.get(toolId)).toBe(state.clineMessages[0].ts)
	})

	it("clears pendingPartialToolCallId when a partial MCP handle throws", async () => {
		const task = createTask()
		const toolCallId = "mcp_partial_throw"
		const state = task as any
		state.assistantMessageContent = [
			{
				type: "mcp_tool_use",
				id: toolCallId,
				name: "mcp_server_tool",
				serverName: "server",
				toolName: "tool",
				arguments: {},
				partial: true,
			},
		]

		const handle = vi.spyOn(useMcpToolTool, "handle").mockImplementation(async () => {
			expect(state.pendingPartialToolCallId).toBe(toolCallId)
			throw new Error("partial mcp boom")
		})

		try {
			await expect(presentAssistantMessage(task)).rejects.toThrow("partial mcp boom")
			expect(state.pendingPartialToolCallId).toBeUndefined()
		} finally {
			handle.mockRestore()
		}
	})

	it("clears pendingPartialToolCallId when a partial regular tool handle throws", async () => {
		const task = createTask()
		const toolCallId = "toolu_partial_throw"
		const state = task as any
		state.assistantMessageContent = [
			{
				type: "tool_use",
				id: toolCallId,
				name: "read_file",
				params: { path: "a.ts" },
				nativeArgs: { path: "a.ts" },
				partial: true,
			},
		]

		const handle = vi.spyOn(readFileTool, "handle").mockImplementation(async () => {
			expect(state.pendingPartialToolCallId).toBe(toolCallId)
			throw new Error("partial tool boom")
		})

		try {
			await expect(presentAssistantMessage(task)).rejects.toThrow("partial tool boom")
			expect(state.pendingPartialToolCallId).toBeUndefined()
		} finally {
			handle.mockRestore()
		}
	})
})
