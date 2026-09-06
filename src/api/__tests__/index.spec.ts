import { buildApiHandler } from "../index"
import { AnthropicHandler, OpenRouterHandler, OpenAiHandler } from "../providers"
import { NativeOllamaHandler } from "../providers/native-ollama"

const { createMockHandler } = vitest.hoisted(() => ({
	createMockHandler: () => ({}),
}))

vitest.mock("../providers", () => ({
	AnthropicHandler: vitest.fn(createMockHandler),
	AwsBedrockHandler: vitest.fn(createMockHandler),
	OpenRouterHandler: vitest.fn(createMockHandler),
	PoeHandler: vitest.fn(createMockHandler),
	VertexHandler: vitest.fn(createMockHandler),
	AnthropicVertexHandler: vitest.fn(createMockHandler),
	OpenAiHandler: vitest.fn(createMockHandler),
	OpenAiCodexHandler: vitest.fn(createMockHandler),
	LmStudioHandler: vitest.fn(createMockHandler),
	GeminiHandler: vitest.fn(createMockHandler),
	OpenAiNativeHandler: vitest.fn(createMockHandler),
	DeepSeekHandler: vitest.fn(createMockHandler),
	MoonshotHandler: vitest.fn(createMockHandler),
	MistralHandler: vitest.fn(createMockHandler),
	VsCodeLmHandler: vitest.fn(createMockHandler),
	RequestyHandler: vitest.fn(createMockHandler),
	UnboundHandler: vitest.fn(createMockHandler),
	FakeAIHandler: vitest.fn(createMockHandler),
	XAIHandler: vitest.fn(createMockHandler),
	LiteLLMHandler: vitest.fn(createMockHandler),
	QwenCodeHandler: vitest.fn(createMockHandler),
	SambaNovaHandler: vitest.fn(createMockHandler),
	ZAiHandler: vitest.fn(createMockHandler),
	FireworksHandler: vitest.fn(createMockHandler),
	VercelAiGatewayHandler: vitest.fn(createMockHandler),
	MiniMaxHandler: vitest.fn(createMockHandler),
	BasetenHandler: vitest.fn(createMockHandler),
}))

vitest.mock("../providers/native-ollama", () => ({
	NativeOllamaHandler: vitest.fn(createMockHandler),
}))

describe("buildApiHandler", () => {
	beforeEach(() => {
		vitest.clearAllMocks()
	})

	it("copies apiModelId to openAiModelId for the OpenAI provider when it is missing", () => {
		buildApiHandler({
			apiProvider: "openai",
			apiModelId: "gpt-4o",
			openAiModelId: undefined,
		} as any)

		expect(vitest.mocked(OpenAiHandler)).toHaveBeenCalledWith(expect.objectContaining({ openAiModelId: "gpt-4o" }))
	})

	it("preserves an explicitly configured openAiModelId over apiModelId", () => {
		buildApiHandler({
			apiProvider: "openai",
			apiModelId: "legacy-model",
			openAiModelId: "gpt-4o-mini",
		} as any)

		expect(vitest.mocked(OpenAiHandler)).toHaveBeenCalledWith(
			expect.objectContaining({ openAiModelId: "gpt-4o-mini" }),
		)
	})

	it("keeps openAiModelId undefined when both model fields are absent", () => {
		buildApiHandler({ apiProvider: "openai" } as any)

		expect(vitest.mocked(OpenAiHandler)).toHaveBeenCalledWith(
			expect.not.objectContaining({ openAiModelId: expect.anything() }),
		)
	})

	it("does not normalize apiModelId for the Anthropic provider", () => {
		buildApiHandler({ apiProvider: "anthropic", apiModelId: "claude-3-5-sonnet" } as any)

		expect(vitest.mocked(AnthropicHandler)).toHaveBeenCalledWith({ apiModelId: "claude-3-5-sonnet" })
	})

	it("preserves existing routing behavior for other providers", () => {
		buildApiHandler({ apiProvider: "openrouter", apiModelId: "openrouter-model" } as any)

		expect(vitest.mocked(OpenRouterHandler)).toHaveBeenCalledWith({ apiModelId: "openrouter-model" })
		expect(vitest.mocked(OpenAiHandler)).not.toHaveBeenCalled()
		expect(vitest.mocked(NativeOllamaHandler)).not.toHaveBeenCalled()
	})
})
