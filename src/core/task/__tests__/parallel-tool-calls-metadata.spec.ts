// npx vitest run core/task/__tests__/parallel-tool-calls-metadata.spec.ts

import type { ProviderSettings } from "@ai-code-orchestrator/types"

import { Task } from "../Task"
import { ClineProvider } from "../../webview/ClineProvider"
import { summarizeConversation } from "../../condense"
import { manageContext } from "../../context-management"

vi.mock("vscode", () => {
	const mockDisposable = { dispose: vi.fn() }
	const mockEventEmitter = { event: vi.fn(), fire: vi.fn() }
	const mockTextDocument = { uri: { fsPath: "/mock/workspace/path/file.ts" } }
	const mockTextEditor = { document: mockTextDocument }
	const mockTab = { input: { uri: { fsPath: "/mock/workspace/path/file.ts" } } }
	const mockTabGroup = { tabs: [mockTab] }

	return {
		TabInputTextDiff: vi.fn(),
		CodeActionKind: {
			QuickFix: { value: "quickfix" },
			RefactorRewrite: { value: "refactor.rewrite" },
		},
		window: {
			createTextEditorDecorationType: vi.fn().mockReturnValue({
				dispose: vi.fn(),
			}),
			visibleTextEditors: [mockTextEditor],
			tabGroups: {
				all: [mockTabGroup],
				close: vi.fn(),
				onDidChangeTabs: vi.fn(() => ({ dispose: vi.fn() })),
			},
			showErrorMessage: vi.fn(),
		},
		workspace: {
			getConfiguration: vi.fn(() => ({ get: (_k: string, d: any) => d })),
			workspaceFolders: [
				{
					uri: { fsPath: "/mock/workspace/path" },
					name: "mock-workspace",
					index: 0,
				},
			],
			createFileSystemWatcher: vi.fn(() => ({
				onDidCreate: vi.fn(() => mockDisposable),
				onDidDelete: vi.fn(() => mockDisposable),
				onDidChange: vi.fn(() => mockDisposable),
				dispose: vi.fn(),
			})),
			fs: {
				stat: vi.fn().mockResolvedValue({ type: 1 }),
			},
			onDidSaveTextDocument: vi.fn(() => mockDisposable),
		},
		env: {
			uriScheme: "vscode",
			language: "en",
		},
		EventEmitter: vi.fn().mockImplementation(() => mockEventEmitter),
		Disposable: {
			from: vi.fn(),
		},
		TabInputText: vi.fn(),
		version: "1.85.0",
	}
})

vi.mock("../../environment/getEnvironmentDetails", () => ({
	getEnvironmentDetails: vi.fn().mockResolvedValue(""),
}))

vi.mock("../../ignore/AicoIgnoreController", () => ({
	AicoIgnoreController: vi.fn().mockImplementation(() => ({
		initialize: vi.fn().mockResolvedValue(undefined),
		filterPaths: vi.fn((paths: string[]) => paths),
		validateAccess: vi.fn().mockReturnValue(true),
		validateCommand: vi.fn().mockReturnValue(undefined),
		dispose: vi.fn(),
	})),
}))

vi.mock("p-wait-for", () => ({
	default: vi.fn().mockImplementation(async () => Promise.resolve()),
}))

vi.mock("delay", () => ({
	__esModule: true,
	default: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("../build-tools", () => ({
	buildNativeToolsArrayWithRestrictions: vi.fn().mockResolvedValue({
		tools: [
			{
				type: "function",
				function: { name: "read_file", description: "Read a file", parameters: { type: "object" } },
			},
		],
	}),
}))

vi.mock("../../condense", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../../condense")>()
	return {
		...actual,
		summarizeConversation: vi.fn().mockResolvedValue({
			messages: [{ role: "user", content: [{ type: "text", text: "continued" }], ts: 1 }],
			summary: "summary",
			cost: 0,
			newContextTokens: 1,
			condenseId: "condense-1",
		}),
	}
})

vi.mock("../../context-management", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../../context-management")>()
	return {
		...actual,
		willManageContext: vi.fn().mockReturnValue(false),
		manageContext: vi.fn().mockImplementation(async ({ messages }: { messages: unknown[] }) => ({
			messages,
			summary: "",
			cost: 0,
			prevContextTokens: 0,
		})),
	}
})

const nativeTool = {
	type: "function" as const,
	function: { name: "read_file", description: "Read a file", parameters: { type: "object" } },
}

function createProvider(stateApiConfiguration: ProviderSettings) {
	return {
		context: {
			globalStorageUri: { fsPath: "/test/storage" },
		},
		getState: vi.fn().mockResolvedValue({
			apiConfiguration: stateApiConfiguration,
			mcpEnabled: false,
			autoCondenseContext: false,
			autoApprovalEnabled: false,
		}),
		getMcpHub: vi.fn().mockReturnValue(undefined),
		log: vi.fn(),
		on: vi.fn(),
		off: vi.fn(),
		postStateToWebview: vi.fn().mockResolvedValue(undefined),
		postStateToWebviewWithoutTaskHistory: vi.fn().mockResolvedValue(undefined),
		postMessageToWebview: vi.fn().mockResolvedValue(undefined),
		updateTaskHistory: vi.fn().mockResolvedValue(undefined),
	} as unknown as ClineProvider
}

function createTask(apiConfiguration: ProviderSettings, stateApiConfiguration: ProviderSettings = apiConfiguration) {
	const task = new Task({
		provider: createProvider(stateApiConfiguration),
		apiConfiguration,
		task: "test task",
		startTask: false,
		enableCheckpoints: false,
	})
	vi.spyOn(task as any, "getSystemPrompt").mockResolvedValue("system")
	vi.spyOn(task as any, "saveClineMessages").mockResolvedValue(true)
	vi.spyOn(task as any, "saveApiConversationHistory").mockResolvedValue(true)
	return task
}

const openaiDisabledState: ProviderSettings = {
	apiProvider: "openai",
	openAiModelId: "gpt-4o",
	openAiApiKey: "global-key",
	openAiParallelToolCalls: false,
}

const openaiEnabledTask: ProviderSettings = {
	apiProvider: "openai",
	openAiModelId: "gpt-4o",
	openAiApiKey: "role-key",
	openAiParallelToolCalls: true,
}

const anthropicDisabledTask: ProviderSettings = {
	apiProvider: "anthropic",
	apiModelId: "claude-sonnet-4-20250514",
	apiKey: "role-key",
	openAiParallelToolCalls: false,
}

const anthropicEnabledTask: ProviderSettings = {
	apiProvider: "anthropic",
	apiModelId: "claude-sonnet-4-20250514",
	apiKey: "role-key",
	openAiParallelToolCalls: true,
}

const anthropicUnsetTask: ProviderSettings = {
	apiProvider: "anthropic",
	apiModelId: "claude-sonnet-4-20250514",
	apiKey: "role-key",
}

function textStream() {
	return (async function* () {
		yield { type: "text" as const, text: "ok" }
	})()
}

async function drain(stream: AsyncGenerator<unknown>) {
	const chunks = []
	for await (const chunk of stream) {
		chunks.push(chunk)
	}
	return chunks
}

describe("Task parallelToolCalls metadata", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		Task.resetGlobalApiRequestTime()
	})

	afterEach(() => {
		Task.resetGlobalApiRequestTime()
	})

	describe.each([
		{
			label: "disabled",
			apiConfiguration: {
				apiProvider: "openai",
				openAiModelId: "gpt-4o",
				openAiApiKey: "test-key",
				openAiParallelToolCalls: false,
			} satisfies ProviderSettings,
			expected: false,
		},
		{
			label: "unset",
			apiConfiguration: {
				apiProvider: "openai",
				openAiModelId: "gpt-4o",
				openAiApiKey: "test-key",
			} satisfies ProviderSettings,
			expected: false,
		},
		{
			label: "enabled",
			apiConfiguration: {
				apiProvider: "openai",
				openAiModelId: "gpt-4o",
				openAiApiKey: "test-key",
				openAiParallelToolCalls: true,
			} satisfies ProviderSettings,
			expected: true,
		},
	])("when openAiParallelToolCalls is $label", ({ apiConfiguration, expected }) => {
		it("passes the setting through condenseContext", async () => {
			const task = createTask(apiConfiguration)

			await task.condenseContext()

			expect(summarizeConversation).toHaveBeenCalledWith(
				expect.objectContaining({
					metadata: expect.objectContaining({
						tools: [nativeTool],
						tool_choice: "auto",
						parallelToolCalls: expected,
					}),
				}),
			)
			expect(vi.mocked(summarizeConversation).mock.calls[0]?.[0].metadata?.parallelToolCalls).toBe(expected)
		})

		it("passes the setting through attemptApiRequest context management and the main request", async () => {
			const task = createTask(apiConfiguration)
			task.clineMessages = [
				{ ts: 1, type: "say", say: "text", text: "seed" },
				{
					ts: 2,
					type: "say",
					say: "api_req_started",
					text: JSON.stringify({ tokensIn: 1000, tokensOut: 0 }),
				},
			]
			vi.spyOn(task.api, "createMessage").mockReturnValue(textStream())

			await drain(task.attemptApiRequest(0))

			expect(manageContext).toHaveBeenCalledWith(
				expect.objectContaining({
					metadata: expect.objectContaining({
						tools: [nativeTool],
						tool_choice: "auto",
						parallelToolCalls: expected,
					}),
				}),
			)
			expect(vi.mocked(manageContext).mock.calls[0]?.[0].metadata?.parallelToolCalls).toBe(expected)
			expect(task.api.createMessage).toHaveBeenCalledWith(
				"system",
				expect.any(Array),
				expect.objectContaining({
					tools: [nativeTool],
					tool_choice: "required",
					parallelToolCalls: expected,
				}),
			)
		})

		it("passes the setting through the context-window error handler", async () => {
			const task = createTask(apiConfiguration)
			const createMessage = vi.spyOn(task.api, "createMessage")
			const manageContextCallsBefore = vi.mocked(manageContext).mock.calls.length

			await (task as any).handleContextWindowExceededError()

			const handlerCalls = vi.mocked(manageContext).mock.calls.slice(manageContextCallsBefore)
			expect(handlerCalls).toHaveLength(1)
			expect(handlerCalls[0]?.[0].metadata).toEqual(
				expect.objectContaining({
					tools: [nativeTool],
					tool_choice: "auto",
					parallelToolCalls: expected,
				}),
			)
			expect(createMessage).not.toHaveBeenCalled()
		})
	})

	describe("when task configuration differs from global provider state", () => {
		it("uses the OpenAI task flag instead of a disabled global OpenAI configuration", async () => {
			const task = createTask(openaiEnabledTask, openaiDisabledState)
			task.clineMessages = [
				{ ts: 1, type: "say", say: "text", text: "seed" },
				{
					ts: 2,
					type: "say",
					say: "api_req_started",
					text: JSON.stringify({ tokensIn: 1000, tokensOut: 0 }),
				},
			]
			vi.spyOn(task.api, "createMessage").mockReturnValue(textStream())

			await task.condenseContext()
			await drain(task.attemptApiRequest(0))
			const manageContextCallsBeforeHandler = vi.mocked(manageContext).mock.calls.length
			await (task as any).handleContextWindowExceededError()

			expect(vi.mocked(summarizeConversation).mock.calls).toHaveLength(1)
			expect(vi.mocked(summarizeConversation).mock.calls[0]?.[0].metadata?.parallelToolCalls).toBe(true)
			expect(vi.mocked(manageContext).mock.calls[0]?.[0].metadata?.parallelToolCalls).toBe(true)
			expect(task.api.createMessage).toHaveBeenCalledTimes(1)
			expect(task.api.createMessage).toHaveBeenCalledWith(
				"system",
				expect.any(Array),
				expect.objectContaining({ parallelToolCalls: true }),
			)
			const handlerCalls = vi.mocked(manageContext).mock.calls.slice(manageContextCallsBeforeHandler)
			expect(handlerCalls).toHaveLength(1)
			expect(handlerCalls[0]?.[0].metadata?.parallelToolCalls).toBe(true)
		})

		it("uses the Anthropic task flag instead of a disabled global OpenAI configuration", async () => {
			const task = createTask(anthropicEnabledTask, openaiDisabledState)
			task.clineMessages = [
				{ ts: 1, type: "say", say: "text", text: "seed" },
				{
					ts: 2,
					type: "say",
					say: "api_req_started",
					text: JSON.stringify({ tokensIn: 1000, tokensOut: 0 }),
				},
			]
			vi.spyOn(task.api, "createMessage").mockReturnValue(textStream())

			await task.condenseContext()
			await drain(task.attemptApiRequest(0))
			const manageContextCallsBeforeHandler = vi.mocked(manageContext).mock.calls.length
			await (task as any).handleContextWindowExceededError()

			expect(vi.mocked(summarizeConversation).mock.calls).toHaveLength(1)
			expect(vi.mocked(summarizeConversation).mock.calls[0]?.[0].metadata?.parallelToolCalls).toBe(true)
			expect(vi.mocked(manageContext).mock.calls[0]?.[0].metadata?.parallelToolCalls).toBe(true)
			expect(task.api.createMessage).toHaveBeenCalledTimes(1)
			expect(task.api.createMessage).toHaveBeenCalledWith(
				"system",
				expect.any(Array),
				expect.objectContaining({ parallelToolCalls: true }),
			)
			const handlerCalls = vi.mocked(manageContext).mock.calls.slice(manageContextCallsBeforeHandler)
			expect(handlerCalls).toHaveLength(1)
			expect(handlerCalls[0]?.[0].metadata?.parallelToolCalls).toBe(true)
		})

		it.each([
			{ label: "false", apiConfiguration: anthropicDisabledTask },
			{ label: "unset", apiConfiguration: anthropicUnsetTask },
		])("passes false for an Anthropic task when the flag is $label", async ({ apiConfiguration }) => {
			const task = createTask(apiConfiguration, openaiEnabledTask)
			task.clineMessages = [
				{ ts: 1, type: "say", say: "text", text: "seed" },
				{
					ts: 2,
					type: "say",
					say: "api_req_started",
					text: JSON.stringify({ tokensIn: 1000, tokensOut: 0 }),
				},
			]
			vi.spyOn(task.api, "createMessage").mockReturnValue(textStream())

			await task.condenseContext()
			await drain(task.attemptApiRequest(0))
			const manageContextCallsBeforeHandler = vi.mocked(manageContext).mock.calls.length
			await (task as any).handleContextWindowExceededError()

			expect(vi.mocked(summarizeConversation).mock.calls).toHaveLength(1)
			expect(vi.mocked(summarizeConversation).mock.calls[0]?.[0].metadata?.parallelToolCalls).toBe(false)
			expect(vi.mocked(manageContext).mock.calls[0]?.[0].metadata?.parallelToolCalls).toBe(false)
			expect(task.api.createMessage).toHaveBeenCalledTimes(1)
			expect(task.api.createMessage).toHaveBeenCalledWith(
				"system",
				expect.any(Array),
				expect.objectContaining({ parallelToolCalls: false }),
			)
			const handlerCalls = vi.mocked(manageContext).mock.calls.slice(manageContextCallsBeforeHandler)
			expect(handlerCalls).toHaveLength(1)
			expect(handlerCalls[0]?.[0].metadata?.parallelToolCalls).toBe(false)
		})
	})
})
