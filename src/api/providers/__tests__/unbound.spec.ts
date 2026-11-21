// npx vitest run src/api/providers/__tests__/unbound.spec.ts

import { Anthropic } from "@anthropic-ai/sdk"
import OpenAI from "openai"

import { UnboundHandler } from "../unbound"
import { ApiHandlerOptions } from "../../../shared/api"

const mockCreate = vitest.fn()

vitest.mock("openai", () => {
	return {
		default: vitest.fn().mockImplementation(() => ({
			chat: {
				completions: {
					create: mockCreate,
				},
			},
		})),
	}
})

vitest.mock("../fetchers/modelCache", () => ({
	getModels: vitest.fn().mockImplementation(() => Promise.resolve({})),
}))

describe("UnboundHandler parallel tool calls", () => {
	const mockOptions: ApiHandlerOptions = {
		unboundApiKey: "test-key",
	}

	beforeEach(() => vitest.clearAllMocks())

	const mockTools: OpenAI.Chat.ChatCompletionTool[] = [
		{
			type: "function",
			function: { name: "get_weather", description: "Get weather", parameters: { type: "object" } },
		},
	]

	it.each([
		[false, false],
		[true, true],
	] as const)("forwards parallelToolCalls %s as parallel_tool_calls %s", async (parallelToolCalls, expected) => {
		const mockStream = {
			async *[Symbol.asyncIterator]() {
				yield { choices: [{ delta: { content: "ok" } }] }
			},
		}
		mockCreate.mockResolvedValue(mockStream)

		const messages: Anthropic.Messages.MessageParam[] = [{ role: "user", content: "hi" }]
		const handler = new UnboundHandler(mockOptions)
		const iterator = handler.createMessage("system", messages, {
			taskId: "test-task",
			tools: mockTools,
			parallelToolCalls,
		})
		await iterator.next()

		expect(OpenAI).toHaveBeenCalled()
		expect(mockCreate.mock.calls[0][0].parallel_tool_calls).toBe(expected)
	})

	it("omits parallel_tool_calls when no tools are sent", async () => {
		const mockStream = {
			async *[Symbol.asyncIterator]() {
				yield { choices: [{ delta: { content: "ok" } }] }
			},
		}
		mockCreate.mockResolvedValue(mockStream)

		const messages: Anthropic.Messages.MessageParam[] = [{ role: "user", content: "hi" }]
		const handler = new UnboundHandler(mockOptions)
		const iterator = handler.createMessage("system", messages, {
			taskId: "test-task",
			parallelToolCalls: false,
		})
		await iterator.next()

		expect(mockCreate.mock.calls[0][0]).not.toHaveProperty("parallel_tool_calls")
	})
})
