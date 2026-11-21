import { AskIgnoredError } from "../AskIgnoredError"
import { Task } from "../Task"

function createTask() {
	const task = Object.create(Task.prototype) as Task
	const state = task as any
	state.abort = false
	state.clineMessages = []
	state.partialAskTsByToolCallId = new Map<string, number>()
	state.pendingPartialToolCallId = undefined
	state.nextPartialAskTs = 0
	state.lastMessageTs = undefined
	state.providerRef = {
		deref: () => ({
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
	state.saveClineMessages = vi.fn(async () => true)
	return task
}

describe("Task.removePartialAskForToolCall", () => {
	it("removes only the partial ask recorded for that tool call", async () => {
		const task = createTask()
		task.beginPartialToolAsk("toolu_a")
		await expect(task.ask("tool", "a", true)).rejects.toBeInstanceOf(AskIgnoredError)

		task.beginPartialToolAsk("toolu_b")
		await expect(task.ask("tool", "b", true)).rejects.toBeInstanceOf(AskIgnoredError)

		const [first, second] = (task as any).clineMessages
		expect(await task.removePartialAskForToolCall("toolu_a")).toBe(true)
		expect((task as any).clineMessages).toEqual([second])
		expect(first.ts).not.toBe(second.ts)
	})

	it("does not remove another tool's partial ask when this call has no recorded ts", async () => {
		const task = createTask()
		task.beginPartialToolAsk("toolu_other")
		await expect(task.ask("tool", "other", true)).rejects.toBeInstanceOf(AskIgnoredError)
		const [other] = (task as any).clineMessages

		expect(await task.removePartialAskForToolCall("toolu_empty")).toBe(false)
		expect((task as any).clineMessages).toEqual([other])
	})

	it("does not remove an ask of the same type that is already waiting for a response", async () => {
		const task = createTask()
		task.beginPartialToolAsk("toolu_waiting")
		await expect(task.ask("tool", "streaming", true)).rejects.toBeInstanceOf(AskIgnoredError)
		const [message] = (task as any).clineMessages
		message.partial = false

		expect(await task.removePartialAskForToolCall("toolu_waiting")).toBe(false)
		expect((task as any).clineMessages).toEqual([message])
		expect(message.partial).toBe(false)
	})

	it("updates the ask bound to the tool call instead of the latest partial of the same type", async () => {
		const task = createTask()
		task.beginPartialToolAsk("toolu_a")
		await expect(task.ask("tool", "a", true)).rejects.toBeInstanceOf(AskIgnoredError)
		task.beginPartialToolAsk("toolu_b")
		await expect(task.ask("tool", "b", true)).rejects.toBeInstanceOf(AskIgnoredError)

		task.beginPartialToolAsk("toolu_a")
		await expect(task.ask("tool", "a-updated", true)).rejects.toBeInstanceOf(AskIgnoredError)

		const [first, second] = (task as any).clineMessages
		expect(first.text).toBe("a-updated")
		expect(second.text).toBe("b")
		expect((task as any).updateClineMessage).toHaveBeenCalledWith(first)
	})

	it("updates and removes interleaved MCP and regular partial asks independently", async () => {
		const task = createTask()
		task.beginPartialToolAsk("mcp_1")
		await expect(task.ask("use_mcp_server", "mcp", true)).rejects.toBeInstanceOf(AskIgnoredError)
		task.beginPartialToolAsk("toolu_1")
		await expect(task.ask("tool", "tool", true)).rejects.toBeInstanceOf(AskIgnoredError)

		task.beginPartialToolAsk("mcp_1")
		await expect(task.ask("use_mcp_server", "mcp-updated", true)).rejects.toBeInstanceOf(AskIgnoredError)
		task.beginPartialToolAsk("toolu_1")
		await expect(task.ask("tool", "tool-updated", true)).rejects.toBeInstanceOf(AskIgnoredError)

		const [mcpAsk, toolAsk] = (task as any).clineMessages
		expect(mcpAsk).toMatchObject({ ask: "use_mcp_server", text: "mcp-updated", partial: true })
		expect(toolAsk).toMatchObject({ ask: "tool", text: "tool-updated", partial: true })
		expect((task as any).partialAskTsByToolCallId.get("mcp_1")).toBe(mcpAsk.ts)
		expect((task as any).partialAskTsByToolCallId.get("toolu_1")).toBe(toolAsk.ts)

		expect(await task.removePartialAskForToolCall("mcp_1")).toBe(true)
		expect((task as any).clineMessages).toEqual([toolAsk])
		expect((task as any).partialAskTsByToolCallId.has("mcp_1")).toBe(false)
		expect((task as any).partialAskTsByToolCallId.get("toolu_1")).toBe(toolAsk.ts)
	})

	it("drops only the finalized ask from the map and leaves a still-partial sibling", async () => {
		const task = createTask()
		const state = task as any
		state.providerRef = { deref: () => undefined }
		state.messageQueueService = { isEmpty: () => true }
		state.askResponse = undefined
		state.emit = vi.fn()

		task.beginPartialToolAsk("toolu_open")
		await expect(task.ask("tool", "still-partial", true)).rejects.toBeInstanceOf(AskIgnoredError)
		task.beginPartialToolAsk("toolu_done")
		await expect(task.ask("tool", "streaming", true)).rejects.toBeInstanceOf(AskIgnoredError)

		const pending = task.ask("tool", "final", false)
		setTimeout(() => {
			state.askResponse = "yesButtonClicked"
		}, 0)
		await expect(pending).resolves.toMatchObject({ response: "yesButtonClicked" })

		const [openAsk, doneAsk] = state.clineMessages
		expect(openAsk).toMatchObject({ text: "still-partial", partial: true })
		expect(doneAsk).toMatchObject({ text: "final", partial: false })
		expect(state.partialAskTsByToolCallId.has("toolu_done")).toBe(false)
		expect(state.partialAskTsByToolCallId.get("toolu_open")).toBe(openAsk.ts)
		expect(state.pendingPartialToolCallId).toBeUndefined()
	})

	it("clears the partial-ask map on supersede, abort, and dispose", async () => {
		const superseded = createTask()
		superseded.beginPartialToolAsk("toolu_super")
		await expect(superseded.ask("tool", "partial", true)).rejects.toBeInstanceOf(AskIgnoredError)
		expect((superseded as any).partialAskTsByToolCallId.size).toBe(1)

		superseded.supersedePendingAsk()
		expect((superseded as any).partialAskTsByToolCallId.size).toBe(0)
		expect((superseded as any).pendingPartialToolCallId).toBeUndefined()

		const aborted = createTask()
		const abortedState = aborted as any
		aborted.beginPartialToolAsk("toolu_abort")
		await expect(aborted.ask("tool", "partial", true)).rejects.toBeInstanceOf(AskIgnoredError)
		aborted.beginPartialToolAsk("toolu_abort")
		abortedState.emitFinalTokenUsageUpdate = vi.fn()
		abortedState.emit = vi.fn()
		abortedState.saveClineMessages = vi.fn(async () => true)
		abortedState.dispose = vi.fn()

		await aborted.abortTask()
		expect(abortedState.partialAskTsByToolCallId.size).toBe(0)
		expect(abortedState.pendingPartialToolCallId).toBeUndefined()

		const disposed = createTask()
		const disposedState = disposed as any
		disposed.beginPartialToolAsk("toolu_dispose")
		await expect(disposed.ask("tool", "partial", true)).rejects.toBeInstanceOf(AskIgnoredError)
		disposed.beginPartialToolAsk("toolu_dispose")
		disposedState.taskId = "task-dispose"
		disposedState.instanceId = "instance-dispose"
		disposedState.abandoned = false
		disposedState.parentTaskId = undefined
		disposedState.cancelCurrentRequest = vi.fn()
		disposedState.messageQueueService = { removeListener: vi.fn(), dispose: vi.fn() }
		disposedState.removeAllListeners = vi.fn()
		disposedState.fileContextTracker = { dispose: vi.fn() }
		disposedState.diffViewProvider = { isEditing: false }
		disposedState.isStreaming = false
		disposedState.globalStoragePath = "/tmp/aico-test"

		disposed.dispose()
		expect(disposedState.partialAskTsByToolCallId.size).toBe(0)
		expect(disposedState.pendingPartialToolCallId).toBeUndefined()
	})
})
