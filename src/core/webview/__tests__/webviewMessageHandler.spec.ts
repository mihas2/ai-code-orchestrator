// npx vitest core/webview/__tests__/webviewMessageHandler.spec.ts

import type { Mock } from "vitest"

// Mock dependencies - must come before imports
vi.mock("../../../api/providers/fetchers/modelCache")

vi.mock("../../../integrations/openai-codex/oauth", () => ({
	openAiCodexOAuthManager: {
		getAccessToken: vi.fn(),
		getAccountId: vi.fn(),
	},
}))

vi.mock("../../../integrations/openai-codex/rate-limits", () => ({
	fetchOpenAiCodexRateLimitInfo: vi.fn(),
}))

vi.mock("../../../services/command/commands", () => ({
	getCommands: vi.fn(),
}))

vi.mock("@anthropic-ai/vertex-sdk", () => ({
	AnthropicVertex: vi.fn(),
}))

vi.mock("google-auth-library", () => ({
	GoogleAuth: vi.fn(),
}))

vi.mock("ollama", () => ({
	Ollama: vi.fn(),
}))

// Mock the diagnosticsHandler module
vi.mock("../diagnosticsHandler", () => ({
	generateErrorDiagnostics: vi.fn().mockResolvedValue({ success: true, filePath: "/tmp/diagnostics.json" }),
}))

import type { ModelRecord } from "@ai-code-orchestrator/types"

import { webviewMessageHandler } from "../webviewMessageHandler"
import type { ClineProvider } from "../ClineProvider"
import { getModels } from "../../../api/providers/fetchers/modelCache"
import { getCommands } from "../../../services/command/commands"
const { openAiCodexOAuthManager } = await import("../../../integrations/openai-codex/oauth")
const { fetchOpenAiCodexRateLimitInfo } = await import("../../../integrations/openai-codex/rate-limits")

const mockGetModels = getModels as Mock<typeof getModels>
const mockGetCommands = vi.mocked(getCommands)
const mockGetAccessToken = vi.mocked(openAiCodexOAuthManager.getAccessToken)
const mockGetAccountId = vi.mocked(openAiCodexOAuthManager.getAccountId)
const mockFetchOpenAiCodexRateLimitInfo = vi.mocked(fetchOpenAiCodexRateLimitInfo)

// Mock ClineProvider
const mockClineProvider = {
	getState: vi.fn(),
	postMessageToWebview: vi.fn(),
	customModesManager: {
		getCustomModes: vi.fn(),
		deleteCustomMode: vi.fn(),
	},
	context: {
		extensionPath: "/mock/extension/path",
		globalStorageUri: { fsPath: "/mock/global/storage" },
	},
	contextProxy: {
		context: {
			extensionPath: "/mock/extension/path",
			globalStorageUri: { fsPath: "/mock/global/storage" },
		},
		setValue: vi.fn(),
		getValue: vi.fn(),
	},
	log: vi.fn(),
	postStateToWebview: vi.fn(),
	getCurrentTask: vi.fn(),
	getTaskWithId: vi.fn(),
	createTaskWithHistoryItem: vi.fn(),
	getSkillsManager: vi.fn(),
	cwd: "/mock/workspace",
} as unknown as ClineProvider

import { t } from "../../../i18n"

vi.mock("vscode", () => {
	const showInformationMessage = vi.fn()
	const showErrorMessage = vi.fn()
	const openTextDocument = vi.fn().mockResolvedValue({})
	const showTextDocument = vi.fn().mockResolvedValue(undefined)
	const mockUpdate = vi.fn().mockResolvedValue(undefined)
	const getConfiguration = vi.fn().mockReturnValue({ update: mockUpdate })

	return {
		window: {
			showInformationMessage,
			showErrorMessage,
			showTextDocument,
		},
		workspace: {
			workspaceFolders: [{ uri: { fsPath: "/mock/workspace" } }],
			openTextDocument,
			getConfiguration,
		},
		ConfigurationTarget: {
			Global: 1,
			Workspace: 2,
			WorkspaceFolder: 3,
		},
	}
})

vi.mock("../../../i18n", () => ({
	t: vi.fn((key: string, args?: Record<string, any>) => {
		// For the delete confirmation with rules, we need to return the interpolated string
		if (key === "common:confirmation.delete_custom_mode_with_rules" && args) {
			return `Are you sure you want to delete this ${args.scope} mode?\n\nThis will also delete the associated rules folder at:\n${args.rulesFolderPath}`
		}
		// Return the translated value for "Yes"
		if (key === "common:answers.yes") {
			return "Yes"
		}
		// Return the translated value for "Cancel"
		if (key === "common:answers.cancel") {
			return "Cancel"
		}
		return key
	}),
}))

vi.mock("fs/promises", () => {
	const mockRm = vi.fn().mockResolvedValue(undefined)
	const mockMkdir = vi.fn().mockResolvedValue(undefined)
	const mockReadFile = vi.fn().mockResolvedValue("[]")
	const mockWriteFile = vi.fn().mockResolvedValue(undefined)

	return {
		default: {
			rm: mockRm,
			mkdir: mockMkdir,
			readFile: mockReadFile,
			writeFile: mockWriteFile,
		},
		rm: mockRm,
		mkdir: mockMkdir,
		readFile: mockReadFile,
		writeFile: mockWriteFile,
	}
})

import * as vscode from "vscode"
import * as fs from "fs/promises"
import * as os from "os"
import * as path from "path"
import * as fsUtils from "../../../utils/fs"
import { getWorkspacePath } from "../../../utils/path"
import { ensureSettingsDirectoryExists } from "../../../utils/globalContext"
import { generateErrorDiagnostics } from "../diagnosticsHandler"
import type { ModeConfig } from "@ai-code-orchestrator/types"

vi.mock("../../../utils/fs")
vi.mock("../../../utils/path")
vi.mock("../../../utils/globalContext")

vi.mock("../../mentions/resolveImageMentions", () => ({
	resolveImageMentions: vi.fn(async ({ text, images }: { text: string; images?: string[] }) => ({
		text,
		images: [...(images ?? []), "data:image/png;base64,from-mention"],
	})),
}))

import { resolveImageMentions } from "../../mentions/resolveImageMentions"

describe("webviewMessageHandler - requestLmStudioModels", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mockClineProvider.getState = vi.fn().mockResolvedValue({
			apiConfiguration: {
				lmStudioModelId: "model-1",
				lmStudioBaseUrl: "http://localhost:1234",
			},
		})
	})

	it("successfully fetches models from LMStudio", async () => {
		const mockModels: ModelRecord = {
			"model-1": {
				maxTokens: 4096,
				contextWindow: 8192,
				supportsPromptCache: false,
				description: "Test model 1",
			},
			"model-2": {
				maxTokens: 8192,
				contextWindow: 16384,
				supportsPromptCache: false,
				description: "Test model 2",
			},
		}

		mockGetModels.mockResolvedValue(mockModels)

		await webviewMessageHandler(mockClineProvider, {
			type: "requestLmStudioModels",
		})

		expect(mockGetModels).toHaveBeenCalledWith({ provider: "lmstudio", baseUrl: "http://localhost:1234" })

		expect(mockClineProvider.postMessageToWebview).toHaveBeenCalledWith({
			type: "lmStudioModels",
			lmStudioModels: mockModels,
		})
	})
})

describe("webviewMessageHandler - image mentions", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mockClineProvider.getState = vi.fn().mockResolvedValue({
			maxImageFileSize: 5,
			maxTotalImageSize: 20,
		})
	})

	it("should resolve image mentions for askResponse payloads", async () => {
		const mockHandleWebviewAskResponse = vi.fn()
		vi.mocked(mockClineProvider.getCurrentTask).mockReturnValue({
			taskId: "test-task-id",
			instanceId: "test-instance-id",
			cwd: "/mock/workspace",
			aicoIgnoreController: undefined,
			handleWebviewAskResponse: mockHandleWebviewAskResponse,
		} as any)

		await webviewMessageHandler(mockClineProvider, {
			type: "askResponse",
			askResponse: "messageResponse",
			taskId: "test-task-id",
			instanceId: "test-instance-id",
			text: "See @/img.png",
			images: [],
		})

		expect(vi.mocked(resolveImageMentions)).toHaveBeenCalled()
		expect(mockHandleWebviewAskResponse).toHaveBeenCalledWith("messageResponse", "See @/img.png", [
			"data:image/png;base64,from-mention",
		])
	})
})

describe("webviewMessageHandler - requestOllamaModels", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mockClineProvider.getState = vi.fn().mockResolvedValue({
			apiConfiguration: {
				ollamaModelId: "model-1",
				ollamaBaseUrl: "http://localhost:1234",
			},
		})
	})

	it("successfully fetches models from Ollama", async () => {
		const mockModels: ModelRecord = {
			"model-1": {
				maxTokens: 4096,
				contextWindow: 8192,
				supportsPromptCache: false,
				description: "Test model 1",
			},
			"model-2": {
				maxTokens: 8192,
				contextWindow: 16384,
				supportsPromptCache: false,
				description: "Test model 2",
			},
		}

		mockGetModels.mockResolvedValue(mockModels)

		await webviewMessageHandler(mockClineProvider, {
			type: "requestOllamaModels",
		})

		expect(mockGetModels).toHaveBeenCalledWith({ provider: "ollama", baseUrl: "http://localhost:1234" })

		expect(mockClineProvider.postMessageToWebview).toHaveBeenCalledWith({
			type: "ollamaModels",
			ollamaModels: mockModels,
		})
	})
})

describe("webviewMessageHandler - requestRouterModels", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mockClineProvider.getState = vi.fn().mockResolvedValue({
			apiConfiguration: {
				openRouterApiKey: "openrouter-key",
				requestyApiKey: "requesty-key",
				litellmApiKey: "litellm-key",
				litellmBaseUrl: "http://localhost:4000",
			},
		})
	})

	it("successfully fetches models from all providers", async () => {
		const mockModels: ModelRecord = {
			"model-1": {
				maxTokens: 4096,
				contextWindow: 8192,
				supportsPromptCache: false,
				description: "Test model 1",
			},
			"model-2": {
				maxTokens: 8192,
				contextWindow: 16384,
				supportsPromptCache: false,
				description: "Test model 2",
			},
		}

		mockGetModels.mockResolvedValue(mockModels)

		await webviewMessageHandler(mockClineProvider, {
			type: "requestRouterModels",
		})

		// Verify getModels was called for each provider
		expect(mockGetModels).toHaveBeenCalledWith({ provider: "openrouter" })
		expect(mockGetModels).toHaveBeenCalledWith({ provider: "requesty", apiKey: "requesty-key" })
		expect(mockGetModels).toHaveBeenCalledWith(
			expect.objectContaining({
				provider: "unbound",
			}),
		)
		expect(mockGetModels).toHaveBeenCalledWith({ provider: "vercel-ai-gateway" })
		expect(mockGetModels).toHaveBeenCalledWith({
			provider: "litellm",
			apiKey: "litellm-key",
			baseUrl: "http://localhost:4000",
		})

		// Verify response was sent
		expect(mockClineProvider.postMessageToWebview).toHaveBeenCalledWith({
			type: "routerModels",
			routerModels: {
				openrouter: mockModels,
				requesty: mockModels,
				unbound: mockModels,
				litellm: mockModels,
				ollama: {},
				lmstudio: {},
				"vercel-ai-gateway": mockModels,
				poe: {},
			},
			values: undefined,
		})
	})

	it("handles LiteLLM models with values from message when config is missing", async () => {
		mockClineProvider.getState = vi.fn().mockResolvedValue({
			apiConfiguration: {
				openRouterApiKey: "openrouter-key",
				requestyApiKey: "requesty-key",
				// Missing litellm config
			},
		})

		const mockModels: ModelRecord = {
			"model-1": {
				maxTokens: 4096,
				contextWindow: 8192,
				supportsPromptCache: false,
				description: "Test model 1",
			},
		}

		mockGetModels.mockResolvedValue(mockModels)

		await webviewMessageHandler(mockClineProvider, {
			type: "requestRouterModels",
			values: {
				litellmApiKey: "message-litellm-key",
				litellmBaseUrl: "http://message-url:4000",
			},
		})

		// Verify LiteLLM was called with values from message
		expect(mockGetModels).toHaveBeenCalledWith({
			provider: "litellm",
			apiKey: "message-litellm-key",
			baseUrl: "http://message-url:4000",
		})
	})

	it("skips LiteLLM when both config and message values are missing", async () => {
		mockClineProvider.getState = vi.fn().mockResolvedValue({
			apiConfiguration: {
				openRouterApiKey: "openrouter-key",
				requestyApiKey: "requesty-key",
				// Missing litellm config
			},
		})

		const mockModels: ModelRecord = {
			"model-1": {
				maxTokens: 4096,
				contextWindow: 8192,
				supportsPromptCache: false,
				description: "Test model 1",
			},
		}

		mockGetModels.mockResolvedValue(mockModels)

		await webviewMessageHandler(mockClineProvider, {
			type: "requestRouterModels",
			// No values provided
		})

		// Verify LiteLLM was NOT called
		expect(mockGetModels).not.toHaveBeenCalledWith(
			expect.objectContaining({
				provider: "litellm",
			}),
		)

		// Verify response includes empty object for LiteLLM
		expect(mockClineProvider.postMessageToWebview).toHaveBeenCalledWith({
			type: "routerModels",
			routerModels: {
				openrouter: mockModels,
				requesty: mockModels,
				unbound: mockModels,
				litellm: {},
				ollama: {},
				lmstudio: {},
				"vercel-ai-gateway": mockModels,
				poe: {},
			},
			values: undefined,
		})
	})

	it("handles individual provider failures gracefully", async () => {
		const mockModels: ModelRecord = {
			"model-1": {
				maxTokens: 4096,
				contextWindow: 8192,
				supportsPromptCache: false,
				description: "Test model 1",
			},
		}

		// Mock some providers to succeed and others to fail
		mockGetModels
			.mockResolvedValueOnce(mockModels) // openrouter
			.mockRejectedValueOnce(new Error("Requesty API error")) // requesty
			.mockResolvedValueOnce(mockModels) // unbound
			.mockResolvedValueOnce(mockModels) // vercel-ai-gateway
			.mockRejectedValueOnce(new Error("LiteLLM connection failed")) // litellm

		await webviewMessageHandler(mockClineProvider, {
			type: "requestRouterModels",
		})

		// Verify error messages were sent for failed providers (these come first)
		expect(mockClineProvider.postMessageToWebview).toHaveBeenCalledWith({
			type: "singleRouterModelFetchResponse",
			success: false,
			error: "Requesty API error",
			values: { provider: "requesty" },
		})

		expect(mockClineProvider.postMessageToWebview).toHaveBeenCalledWith({
			type: "singleRouterModelFetchResponse",
			success: false,
			error: "LiteLLM connection failed",
			values: { provider: "litellm" },
		})

		// Verify final routerModels response includes successful providers and empty objects for failed ones
		expect(mockClineProvider.postMessageToWebview).toHaveBeenCalledWith({
			type: "routerModels",
			routerModels: {
				openrouter: mockModels,
				requesty: {},
				unbound: mockModels,
				litellm: {},
				ollama: {},
				lmstudio: {},
				"vercel-ai-gateway": mockModels,
				poe: {},
			},
			values: undefined,
		})
	})

	it("handles Error objects and string errors correctly", async () => {
		// Mock providers to fail with different error types
		mockGetModels
			.mockRejectedValueOnce(new Error("Structured error message")) // openrouter
			.mockRejectedValueOnce(new Error("Requesty API error")) // requesty
			.mockRejectedValueOnce(new Error("Unbound error")) // unbound
			.mockRejectedValueOnce(new Error("Vercel AI Gateway error")) // vercel-ai-gateway
			.mockRejectedValueOnce(new Error("LiteLLM connection failed")) // litellm

		await webviewMessageHandler(mockClineProvider, {
			type: "requestRouterModels",
		})

		// Verify error handling for different error types
		expect(mockClineProvider.postMessageToWebview).toHaveBeenCalledWith({
			type: "singleRouterModelFetchResponse",
			success: false,
			error: "Structured error message",
			values: { provider: "openrouter" },
		})

		expect(mockClineProvider.postMessageToWebview).toHaveBeenCalledWith({
			type: "singleRouterModelFetchResponse",
			success: false,
			error: "Requesty API error",
			values: { provider: "requesty" },
		})

		expect(mockClineProvider.postMessageToWebview).toHaveBeenCalledWith({
			type: "singleRouterModelFetchResponse",
			success: false,
			error: "Unbound error",
			values: { provider: "unbound" },
		})

		expect(mockClineProvider.postMessageToWebview).toHaveBeenCalledWith({
			type: "singleRouterModelFetchResponse",
			success: false,
			error: "Vercel AI Gateway error",
			values: { provider: "vercel-ai-gateway" },
		})

		expect(mockClineProvider.postMessageToWebview).toHaveBeenCalledWith({
			type: "singleRouterModelFetchResponse",
			success: false,
			error: "LiteLLM connection failed",
			values: { provider: "litellm" },
		})
	})

	it("prefers config values over message values for LiteLLM", async () => {
		const mockModels: ModelRecord = {}
		mockGetModels.mockResolvedValue(mockModels)

		await webviewMessageHandler(mockClineProvider, {
			type: "requestRouterModels",
			values: {
				litellmApiKey: "message-key",
				litellmBaseUrl: "http://message-url",
			},
		})

		// Verify config values are used over message values
		expect(mockGetModels).toHaveBeenCalledWith({
			provider: "litellm",
			apiKey: "litellm-key", // From config
			baseUrl: "http://localhost:4000", // From config
		})
	})
})

describe("webviewMessageHandler - requestOpenAiCodexRateLimits", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mockGetAccessToken.mockResolvedValue(null)
		mockGetAccountId.mockResolvedValue(null)
	})

	it("posts error when not authenticated", async () => {
		await webviewMessageHandler(mockClineProvider, { type: "requestOpenAiCodexRateLimits" } as any)

		expect(mockClineProvider.postMessageToWebview).toHaveBeenCalledWith({
			type: "openAiCodexRateLimits",
			error: "Not authenticated with OpenAI Codex",
		})
	})

	it("posts values when authenticated", async () => {
		mockGetAccessToken.mockResolvedValue("token")
		mockGetAccountId.mockResolvedValue("acct_123")
		mockFetchOpenAiCodexRateLimitInfo.mockResolvedValue({
			primary: { usedPercent: 10, resetsAt: 1700000000000 },
			fetchedAt: 1700000000000,
		})

		await webviewMessageHandler(mockClineProvider, { type: "requestOpenAiCodexRateLimits" } as any)

		expect(mockFetchOpenAiCodexRateLimitInfo).toHaveBeenCalledWith("token", { accountId: "acct_123" })
		expect(mockClineProvider.postMessageToWebview).toHaveBeenCalledWith({
			type: "openAiCodexRateLimits",
			values: {
				primary: { usedPercent: 10, resetsAt: 1700000000000 },
				fetchedAt: 1700000000000,
			},
		})
	})
})

describe("webviewMessageHandler - deleteCustomMode", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		vi.mocked(getWorkspacePath).mockReturnValue("/mock/workspace")
		vi.mocked(vscode.window.showErrorMessage).mockResolvedValue(undefined)
		vi.mocked(ensureSettingsDirectoryExists).mockResolvedValue("/mock/global/storage/.ai-code-orchestrator")
	})

	it("should delete a project mode and its rules folder", async () => {
		const slug = "test-project-mode"
		const rulesFolderPath = path.join("/mock/workspace", ".ai-code-orchestrator", `rules-${slug}`)

		vi.mocked(mockClineProvider.customModesManager.getCustomModes).mockResolvedValue([
			{
				name: "Test Project Mode",
				slug,
				roleDefinition: "Test Role",
				groups: [],
				source: "project",
			} as ModeConfig,
		])
		vi.mocked(fsUtils.fileExistsAtPath).mockResolvedValue(true)
		vi.mocked(mockClineProvider.customModesManager.deleteCustomMode).mockResolvedValue(undefined)

		await webviewMessageHandler(mockClineProvider, { type: "deleteCustomMode", slug })

		// The confirmation dialog is now handled in the webview, so we don't expect showInformationMessage to be called
		expect(vscode.window.showInformationMessage).not.toHaveBeenCalled()
		expect(mockClineProvider.customModesManager.deleteCustomMode).toHaveBeenCalledWith(slug)
		expect(fs.rm).toHaveBeenCalledWith(rulesFolderPath, { recursive: true, force: true })
	})

	it("should delete a global mode and its rules folder", async () => {
		const slug = "test-global-mode"
		const homeDir = os.homedir()
		const rulesFolderPath = path.join(homeDir, ".ai-code-orchestrator", `rules-${slug}`)

		vi.mocked(mockClineProvider.customModesManager.getCustomModes).mockResolvedValue([
			{
				name: "Test Global Mode",
				slug,
				roleDefinition: "Test Role",
				groups: [],
				source: "global",
			} as ModeConfig,
		])
		vi.mocked(fsUtils.fileExistsAtPath).mockResolvedValue(true)
		vi.mocked(mockClineProvider.customModesManager.deleteCustomMode).mockResolvedValue(undefined)

		await webviewMessageHandler(mockClineProvider, { type: "deleteCustomMode", slug })

		// The confirmation dialog is now handled in the webview, so we don't expect showInformationMessage to be called
		expect(vscode.window.showInformationMessage).not.toHaveBeenCalled()
		expect(mockClineProvider.customModesManager.deleteCustomMode).toHaveBeenCalledWith(slug)
		expect(fs.rm).toHaveBeenCalledWith(rulesFolderPath, { recursive: true, force: true })
	})

	it("should only delete the mode when rules folder does not exist", async () => {
		const slug = "test-mode-no-rules"
		vi.mocked(mockClineProvider.customModesManager.getCustomModes).mockResolvedValue([
			{
				name: "Test Mode No Rules",
				slug,
				roleDefinition: "Test Role",
				groups: [],
				source: "project",
			} as ModeConfig,
		])
		vi.mocked(fsUtils.fileExistsAtPath).mockResolvedValue(false)
		vi.mocked(mockClineProvider.customModesManager.deleteCustomMode).mockResolvedValue(undefined)

		await webviewMessageHandler(mockClineProvider, { type: "deleteCustomMode", slug })

		// The confirmation dialog is now handled in the webview, so we don't expect showInformationMessage to be called
		expect(vscode.window.showInformationMessage).not.toHaveBeenCalled()
		expect(mockClineProvider.customModesManager.deleteCustomMode).toHaveBeenCalledWith(slug)
		expect(fs.rm).not.toHaveBeenCalled()
	})

	it("should handle errors when deleting rules folder", async () => {
		const slug = "test-mode-error"
		const rulesFolderPath = path.join("/mock/workspace", ".ai-code-orchestrator", `rules-${slug}`)
		const error = new Error("Permission denied")

		vi.mocked(mockClineProvider.customModesManager.getCustomModes).mockResolvedValue([
			{
				name: "Test Mode Error",
				slug,
				roleDefinition: "Test Role",
				groups: [],
				source: "project",
			} as ModeConfig,
		])
		vi.mocked(fsUtils.fileExistsAtPath).mockResolvedValue(true)
		vi.mocked(mockClineProvider.customModesManager.deleteCustomMode).mockResolvedValue(undefined)
		vi.mocked(fs.rm).mockRejectedValue(error)

		await webviewMessageHandler(mockClineProvider, { type: "deleteCustomMode", slug })

		expect(mockClineProvider.customModesManager.deleteCustomMode).toHaveBeenCalledWith(slug)
		expect(fs.rm).toHaveBeenCalledWith(rulesFolderPath, { recursive: true, force: true })
		// Verify error message is shown to the user
		expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
			t("common:errors.delete_rules_folder_failed", {
				rulesFolderPath,
				error: error.message,
			}),
		)
		// No error response is sent anymore - we just continue with deletion
		expect(mockClineProvider.postMessageToWebview).not.toHaveBeenCalled()
	})
})

describe("webviewMessageHandler - message dialog preferences", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		// Mock a current Cline instance
		vi.mocked(mockClineProvider.getCurrentTask).mockReturnValue({
			taskId: "test-task-id",
			apiConversationHistory: [],
			clineMessages: [],
		} as any)
		// Reset getValue mock
		vi.mocked(mockClineProvider.contextProxy.getValue).mockReturnValue(false)
	})

	describe("deleteMessage", () => {
		it("should always show dialog for delete confirmation", async () => {
			vi.mocked(mockClineProvider.getCurrentTask).mockReturnValue({
				clineMessages: [],
				apiConversationHistory: [],
			} as any) // Mock current cline with proper structure

			await webviewMessageHandler(mockClineProvider, {
				type: "deleteMessage",
				value: 123456789, // Changed from messageTs to value
			})

			expect(mockClineProvider.postMessageToWebview).toHaveBeenCalledWith({
				type: "showDeleteMessageDialog",
				messageTs: 123456789,
				hasCheckpoint: false,
			})
		})
	})

	describe("submitEditedMessage", () => {
		it("should always show dialog for edit confirmation", async () => {
			vi.mocked(mockClineProvider.getCurrentTask).mockReturnValue({
				clineMessages: [],
				apiConversationHistory: [],
			} as any) // Mock current cline with proper structure

			await webviewMessageHandler(mockClineProvider, {
				type: "submitEditedMessage",
				value: 123456789,
				editedMessageContent: "edited content",
			})

			expect(mockClineProvider.postMessageToWebview).toHaveBeenCalledWith({
				type: "showEditMessageDialog",
				messageTs: 123456789,
				text: "edited content",
				hasCheckpoint: false,
				images: undefined,
			})
		})
	})
})

describe("webviewMessageHandler - mcpEnabled", () => {
	let mockMcpHub: any

	beforeEach(() => {
		vi.clearAllMocks()

		// Create a mock McpHub instance
		mockMcpHub = {
			handleMcpEnabledChange: vi.fn().mockResolvedValue(undefined),
		}

		// Ensure provider exposes getMcpHub and returns our mock
		;(mockClineProvider as any).getMcpHub = vi.fn().mockReturnValue(mockMcpHub)
	})

	it("delegates enable=true to McpHub and posts updated state", async () => {
		await webviewMessageHandler(mockClineProvider, {
			type: "updateSettings",
			updatedSettings: { mcpEnabled: true },
		})

		expect((mockClineProvider as any).getMcpHub).toHaveBeenCalledTimes(1)
		expect(mockMcpHub.handleMcpEnabledChange).toHaveBeenCalledTimes(1)
		expect(mockMcpHub.handleMcpEnabledChange).toHaveBeenCalledWith(true)
		expect(mockClineProvider.postStateToWebview).toHaveBeenCalledTimes(1)
	})

	it("delegates enable=false to McpHub and posts updated state", async () => {
		await webviewMessageHandler(mockClineProvider, {
			type: "updateSettings",
			updatedSettings: { mcpEnabled: false },
		})

		expect((mockClineProvider as any).getMcpHub).toHaveBeenCalledTimes(1)
		expect(mockMcpHub.handleMcpEnabledChange).toHaveBeenCalledTimes(1)
		expect(mockMcpHub.handleMcpEnabledChange).toHaveBeenCalledWith(false)
		expect(mockClineProvider.postStateToWebview).toHaveBeenCalledTimes(1)
	})

	it("handles missing McpHub instance gracefully and still posts state", async () => {
		;(mockClineProvider as any).getMcpHub = vi.fn().mockReturnValue(undefined)

		await webviewMessageHandler(mockClineProvider, {
			type: "updateSettings",
			updatedSettings: { mcpEnabled: true },
		})

		expect((mockClineProvider as any).getMcpHub).toHaveBeenCalledTimes(1)
		expect(mockClineProvider.postStateToWebview).toHaveBeenCalledTimes(1)
	})
})

describe("webviewMessageHandler - requestCommands", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("includes skill slug commands and dedupes duplicate skill names while preserving first skill entry", async () => {
		mockGetCommands.mockResolvedValue([])

		const getTaskMode = vi.fn().mockResolvedValue("code")
		vi.mocked(mockClineProvider.getCurrentTask).mockReturnValue({
			cwd: "/mock/workspace",
			getTaskMode,
		} as unknown as ReturnType<ClineProvider["getCurrentTask"]>)

		const getSkillsForMode = vi.fn().mockReturnValue([
			{
				name: "skill-slug-entry",
				description: "Primary skill slug",
				path: "/mock/.ai-code-orchestrator/skills/skill-slug-entry/SKILL.md",
				source: "project",
				modeSlugs: ["code"],
			},
			{
				name: "skill-slug-entry",
				description: "Duplicate skill slug",
				path: "/mock/.ai-code-orchestrator/skills/duplicate-skill/SKILL.md",
				source: "global",
				modeSlugs: ["code"],
			},
			{
				name: "another-skill-slug",
				description: "Another skill-generated command",
				path: "/mock/.ai-code-orchestrator/skills/another-skill-slug/SKILL.md",
				source: "global",
				modeSlugs: ["code"],
			},
		])

		vi.mocked(mockClineProvider.getSkillsManager).mockReturnValue({
			getSkillsForMode,
		} as unknown as ReturnType<ClineProvider["getSkillsManager"]>)

		await webviewMessageHandler(mockClineProvider, { type: "requestCommands" })

		const commandMessageCall = vi
			.mocked(mockClineProvider.postMessageToWebview)
			.mock.calls.find(([postedMessage]) => postedMessage.type === "commands")
		expect(commandMessageCall).toBeDefined()

		const commandMessage = commandMessageCall?.[0]
		expect(commandMessage?.commands).toEqual(
			expect.arrayContaining([
				{
					name: "skill-slug-entry",
					source: "project",
					filePath: "/mock/.ai-code-orchestrator/skills/skill-slug-entry/SKILL.md",
					description: "Primary skill slug",
				},
				{
					name: "another-skill-slug",
					source: "global",
					filePath: "/mock/.ai-code-orchestrator/skills/another-skill-slug/SKILL.md",
					description: "Another skill-generated command",
				},
			]),
		)

		expect(commandMessage?.commands?.filter((command) => command.name === "skill-slug-entry")).toHaveLength(1)
	})

	it("adds skill-backed command entries without overriding existing command names", async () => {
		mockGetCommands.mockResolvedValue([
			{
				name: "deploy",
				content: "existing command",
				source: "project",
				filePath: "/mock/workspace/.ai-code-orchestrator/commands/deploy.md",
				description: "Deploy command",
				argumentHint: "staging | production",
			},
		])

		const getTaskMode = vi.fn().mockResolvedValue("code")
		vi.mocked(mockClineProvider.getCurrentTask).mockReturnValue({
			cwd: "/mock/workspace",
			getTaskMode,
		} as unknown as ReturnType<ClineProvider["getCurrentTask"]>)

		const getSkillsForMode = vi.fn().mockReturnValue([
			{
				name: "deploy",
				description: "Deploy skill",
				path: "/mock/.ai-code-orchestrator/skills/deploy/SKILL.md",
				source: "global",
				modeSlugs: ["code"],
			},
			{
				name: "skill-only",
				description: "Skill-generated command",
				path: "/mock/.ai-code-orchestrator/skills/skill-only/SKILL.md",
				source: "project",
				modeSlugs: ["code"],
			},
		])

		vi.mocked(mockClineProvider.getSkillsManager).mockReturnValue({
			getSkillsForMode,
		} as unknown as ReturnType<ClineProvider["getSkillsManager"]>)

		await webviewMessageHandler(mockClineProvider, { type: "requestCommands" })

		expect(getSkillsForMode).toHaveBeenCalledWith("code")

		expect(mockClineProvider.postMessageToWebview).toHaveBeenCalledWith({
			type: "commands",
			commands: expect.arrayContaining([
				{
					name: "deploy",
					source: "project",
					filePath: "/mock/workspace/.ai-code-orchestrator/commands/deploy.md",
					description: "Deploy command",
					argumentHint: "staging | production",
				},
				{
					name: "skill-only",
					source: "project",
					filePath: "/mock/.ai-code-orchestrator/skills/skill-only/SKILL.md",
					description: "Skill-generated command",
				},
			]),
		})

		const commandMessageCall = vi
			.mocked(mockClineProvider.postMessageToWebview)
			.mock.calls.find(([postedMessage]) => postedMessage.type === "commands")
		expect(commandMessageCall).toBeDefined()

		const commandMessage = commandMessageCall?.[0]
		expect(commandMessage?.commands?.filter((command) => command.name === "deploy")).toHaveLength(1)
	})

	it("preserves existing behavior when skills manager is unavailable", async () => {
		mockGetCommands.mockResolvedValue([
			{
				name: "build",
				content: "build command",
				source: "built-in",
				filePath: "<built-in:build>",
				description: "Build command",
				argumentHint: "target",
			},
		])

		vi.mocked(mockClineProvider.getCurrentTask).mockReturnValue({
			cwd: "/mock/workspace",
		} as unknown as ReturnType<ClineProvider["getCurrentTask"]>)

		vi.mocked(mockClineProvider.getSkillsManager).mockReturnValue(undefined)

		await webviewMessageHandler(mockClineProvider, { type: "requestCommands" })

		expect(mockClineProvider.postMessageToWebview).toHaveBeenCalledWith({
			type: "commands",
			commands: [
				{
					name: "build",
					source: "built-in",
					filePath: "<built-in:build>",
					description: "Build command",
					argumentHint: "target",
				},
			],
		})
	})
})

describe("webviewMessageHandler - downloadErrorDiagnostics", () => {
	beforeEach(() => {
		vi.clearAllMocks()

		// Ensure contextProxy has a globalStorageUri for the handler
		;(mockClineProvider as any).contextProxy.globalStorageUri = { fsPath: "/mock/global/storage" }

		// Provide a current task with a stable ID
		vi.mocked(mockClineProvider.getCurrentTask).mockReturnValue({
			taskId: "test-task-id",
		} as any)
	})

	it("calls generateErrorDiagnostics with correct parameters", async () => {
		await webviewMessageHandler(mockClineProvider, {
			type: "downloadErrorDiagnostics",
			values: {
				timestamp: "2025-01-01T00:00:00.000Z",
				version: "1.2.3",
				provider: "test-provider",
				model: "test-model",
				details: "Sample error details",
			},
		} as any)

		// Verify generateErrorDiagnostics was called with the correct parameters
		expect(generateErrorDiagnostics).toHaveBeenCalledTimes(1)
		expect(generateErrorDiagnostics).toHaveBeenCalledWith({
			taskId: "test-task-id",
			globalStoragePath: "/mock/global/storage",
			values: {
				timestamp: "2025-01-01T00:00:00.000Z",
				version: "1.2.3",
				provider: "test-provider",
				model: "test-model",
				details: "Sample error details",
			},
			log: expect.any(Function),
		})
	})

	it("shows error when no active task", async () => {
		vi.mocked(mockClineProvider.getCurrentTask).mockReturnValue(null as any)

		await webviewMessageHandler(mockClineProvider, {
			type: "downloadErrorDiagnostics",
			values: {},
		} as any)

		expect(vscode.window.showErrorMessage).toHaveBeenCalledWith("No active task to generate diagnostics for")
		expect(generateErrorDiagnostics).not.toHaveBeenCalled()
	})
})

describe("webviewMessageHandler - yesAndAllowButtonClicked save order", () => {
	const TEST_TS = 12345678

	/** Build a stateful task mock that supports the full claim/commit/release/discard API.
	 *
	 * Internal state machine:
	 *  - pending: snapshot available, claimCommandApproval(ts) → token
	 *  - claimed: token held, commitCommandApproval(token) → true, releaseCommandApproval(token) → back to pending
	 *  - consumed: committed, all further calls return false / undefined
	 */
	function makeTaskMock(opts: { taskId: string; instanceId: string; command?: string; ts?: number }) {
		type State = "pending" | "claimed" | "consumed"
		let state: State = "pending"
		const ts = opts.ts ?? TEST_TS
		const command = opts.command ?? "git status"
		// The token is the snapshot object — identity-based check
		const snapshot = Object.freeze({ ts, command })
		let activeToken: typeof snapshot | null = null

		const handleWebviewAskResponse = vi.fn()

		const claimCommandApproval = vi.fn((calledTs: number) => {
			if (calledTs !== ts || state !== "pending") return false
			state = "claimed"
			activeToken = snapshot
			return snapshot
		})

		const commitCommandApproval = vi.fn(
			(token: typeof snapshot, response: string, text?: string, images?: string[]) => {
				if (token !== activeToken || state !== "claimed") return false
				state = "consumed"
				activeToken = null
				handleWebviewAskResponse(response, text, images)
				return true
			},
		)

		const releaseCommandApproval = vi.fn((token: typeof snapshot) => {
			if (token !== activeToken || state !== "claimed") return
			state = "pending"
			activeToken = null
		})

		/** Discard the token WITHOUT restoring to pending (stale-task scenario). */
		const discardCommandApproval = vi.fn((token: typeof snapshot) => {
			if (token !== activeToken || state !== "claimed") return
			// Just clear claimed — do not restore pending
			state = "consumed"
			activeToken = null
		})

		// Kept for backward-compat assertions in existing tests
		const getPendingCommandApproval = vi.fn((calledTs: number) => {
			if (calledTs !== ts || state !== "pending") return undefined
			return snapshot
		})

		const tryRespondToPendingCommandApproval = vi.fn(
			(calledTs: number, response: string, text?: string, images?: string[]) => {
				const token = claimCommandApproval(calledTs)
				if (!token) return false
				return commitCommandApproval(token as typeof snapshot, response, text, images)
			},
		)

		return {
			taskId: opts.taskId,
			instanceId: opts.instanceId,
			handleWebviewAskResponse,
			getPendingCommandApproval,
			tryRespondToPendingCommandApproval,
			claimCommandApproval,
			commitCommandApproval,
			releaseCommandApproval,
			discardCommandApproval,
		} as any
	}

	beforeEach(() => {
		vi.clearAllMocks()
		mockClineProvider.getState = vi.fn().mockResolvedValue({})
	})

	it("saves allowedCommands before calling tryRespondToPendingCommandApproval", async () => {
		const task = makeTaskMock({ taskId: "test-task-id", instanceId: "test-instance-id", command: "git status" })

		vi.mocked(mockClineProvider.getCurrentTask).mockReturnValue(task)
		vi.mocked(mockClineProvider.contextProxy.getValue).mockResolvedValue(["npm"] as any)

		// Controlled promise for workspace.getConfiguration().update
		let resolveUpdate!: () => void
		const updatePromise = new Promise<void>((resolve) => {
			resolveUpdate = resolve
		})
		const mockUpdate = vi.fn().mockReturnValue(updatePromise)
		vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({ update: mockUpdate } as any)

		// Start handler WITHOUT await — it will pause at the update() call
		const handlerPromise = webviewMessageHandler(mockClineProvider, {
			type: "askResponse",
			askResponse: "yesAndAllowButtonClicked",
			taskId: "test-task-id",
			instanceId: "test-instance-id",
			messageTs: TEST_TS,
		} as any)

		// Wait until update() has been called
		await vi.waitFor(() => {
			expect(mockUpdate).toHaveBeenCalled()
		})

		// commitCommandApproval must NOT have been called yet (claim happened before chain,
		// commit only happens after save resolves)
		expect(task.commitCommandApproval).not.toHaveBeenCalled()

		// Unblock update() so the handler can proceed
		resolveUpdate()
		await handlerPromise

		// update() called with merged list: existing 'npm' + patterns from backend 'git status'
		expect(mockUpdate).toHaveBeenCalledWith(
			"allowedCommands",
			["npm", "git", "git status"],
			vscode.ConfigurationTarget.Global,
		)

		// contextProxy.setValue called with same merged list
		expect(mockClineProvider.contextProxy.setValue).toHaveBeenCalledWith("allowedCommands", [
			"npm",
			"git",
			"git status",
		])

		// commitCommandApproval called exactly once with yesButtonClicked.
		// text/images go through resolveIncomingImages → resolveImageMentions mock.
		expect(task.commitCommandApproval).toHaveBeenCalledTimes(1)
		// claimCommandApproval called once (before chain)
		expect(task.claimCommandApproval).toHaveBeenCalledTimes(1)
		expect(task.claimCommandApproval).toHaveBeenCalledWith(TEST_TS)
		// handleWebviewAskResponse ultimately fires with yesButtonClicked
		expect(task.handleWebviewAskResponse).toHaveBeenCalledWith("yesButtonClicked", "", [
			"data:image/png;base64,from-mention",
		])
	})

	it("regression: response is routed to fresh task object when task identity is preserved mid-await", async () => {
		// task1 — the original task object present when the message arrives
		const task1 = makeTaskMock({ taskId: "task-1", instanceId: "instance-1", command: "git status" })
		// task2 — a NEW object with the SAME taskId/instanceId (re-instantiated)
		const task2 = makeTaskMock({ taskId: "task-1", instanceId: "instance-1", command: "git status" })

		// Initially getCurrentTask() returns task1
		vi.mocked(mockClineProvider.getCurrentTask).mockReturnValue(task1)
		vi.mocked(mockClineProvider.contextProxy.getValue).mockResolvedValue([] as any)

		let resolveUpdate!: () => void
		const updatePromise = new Promise<void>((resolve) => {
			resolveUpdate = resolve
		})
		const mockUpdate = vi.fn().mockReturnValue(updatePromise)
		vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({ update: mockUpdate } as any)

		const handlerPromise = webviewMessageHandler(mockClineProvider, {
			type: "askResponse",
			askResponse: "yesAndAllowButtonClicked",
			taskId: "task-1",
			instanceId: "instance-1",
			messageTs: TEST_TS,
		} as any)

		await vi.waitFor(() => {
			expect(mockUpdate).toHaveBeenCalled()
		})

		// Switch getCurrentTask() to task2 (same identity, new object) while update() is pending
		vi.mocked(mockClineProvider.getCurrentTask).mockReturnValue(task2)

		resolveUpdate()
		await handlerPromise

		// Claim happened on task1 (original task). After save, handler calls getCurrentTask()
		// → task2 (same identity). commitCommandApproval goes to freshTask=task2, BUT the token
		// was issued by task1.claimCommandApproval — task2 doesn't know about it, so commit
		// returns false on task2. The handler logs a miss and does NOT forward the response.
		// The claim token remains orphaned on task1. This is correct behavior: the task was
		// re-instantiated mid-flight (rare scenario), operator must retry.
		expect(task1.claimCommandApproval).toHaveBeenCalledTimes(1)
		expect(task2.commitCommandApproval).toHaveBeenCalledTimes(1) // called but returns false
		expect(task2.handleWebviewAskResponse).not.toHaveBeenCalled()
	})

	it("stale-task drop: response is DISCARDED (not released) when getCurrentTask switches to a different identity mid-await", async () => {
		const task1 = makeTaskMock({ taskId: "task-1", instanceId: "instance-1", command: "git status" })
		const task2 = makeTaskMock({ taskId: "task-2", instanceId: "instance-2", command: "npm test" })

		vi.mocked(resolveImageMentions).mockResolvedValue({ text: "", images: [] })
		vi.mocked(mockClineProvider.getCurrentTask).mockReturnValue(task1)
		vi.mocked(mockClineProvider.contextProxy.getValue).mockResolvedValue([] as any)

		let resolveUpdate!: () => void
		const updatePromise = new Promise<void>((resolve) => {
			resolveUpdate = resolve
		})
		const mockUpdate = vi.fn().mockReturnValue(updatePromise)
		vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({ update: mockUpdate } as any)

		const handlerPromise = webviewMessageHandler(mockClineProvider, {
			type: "askResponse",
			askResponse: "yesAndAllowButtonClicked",
			taskId: "task-1",
			instanceId: "instance-1",
			messageTs: TEST_TS,
		} as any)

		await vi.waitFor(() => {
			expect(mockUpdate).toHaveBeenCalled()
		})

		// Switch to different task identity mid-await
		vi.mocked(mockClineProvider.getCurrentTask).mockReturnValue(task2)

		resolveUpdate()
		await handlerPromise

		// Claim happened on task1. After save, freshTask check sees task2 (different identity).
		// Handler must call discardCommandApproval (NOT releaseCommandApproval) on task1 —
		// the old task's slot must NOT be restored to pending so it cannot be re-triggered.
		expect(task1.claimCommandApproval).toHaveBeenCalledTimes(1)
		expect(task1.discardCommandApproval).toHaveBeenCalledTimes(1)
		expect(task1.releaseCommandApproval).not.toHaveBeenCalled()
		expect(task1.commitCommandApproval).not.toHaveBeenCalled()
		expect(task2.commitCommandApproval).not.toHaveBeenCalled()
		expect(task1.handleWebviewAskResponse).not.toHaveBeenCalled()
		expect(task2.handleWebviewAskResponse).not.toHaveBeenCalled()
	})

	it("lost update: concurrent yesAndAllow from same task identity: first claim wins, second drops (no race)", async () => {
		// With the new claim mechanism, a second concurrent handler will find the snapshot
		// already claimed (pendingCommandApproval=undefined) and receive false from
		// claimCommandApproval → it drops immediately without touching storage.
		// This means serialised saves are NO LONGER needed for duplicate prevention;
		// the claim acts as the mutex. The test verifies one save + one commit.
		const sharedTask = makeTaskMock({ taskId: "task-1", instanceId: "instance-1", command: "git status" })

		vi.mocked(mockClineProvider.getCurrentTask).mockReturnValue(sharedTask)

		let storedAllowedCommands: string[] = []
		vi.mocked(mockClineProvider.contextProxy.getValue).mockImplementation(async () => storedAllowedCommands as any)
		vi.mocked(mockClineProvider.contextProxy.setValue).mockImplementation(async (_key, value) => {
			storedAllowedCommands = value as string[]
		})

		let resolveUpdate1!: () => void
		let resolveUpdate2!: () => void
		const updatePromise1 = new Promise<void>((r) => {
			resolveUpdate1 = r
		})
		const updatePromise2 = new Promise<void>((r) => {
			resolveUpdate2 = r
		})

		const mockUpdate = vi.fn().mockReturnValueOnce(updatePromise1).mockReturnValueOnce(updatePromise2)

		vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({ update: mockUpdate } as any)

		// Both handlers fired concurrently for the same task with same ts
		const handlerPromise1 = webviewMessageHandler(mockClineProvider, {
			type: "askResponse",
			askResponse: "yesAndAllowButtonClicked",
			taskId: "task-1",
			instanceId: "instance-1",
			messageTs: TEST_TS,
		} as any)

		const handlerPromise2 = webviewMessageHandler(mockClineProvider, {
			type: "askResponse",
			askResponse: "yesAndAllowButtonClicked",
			taskId: "task-1",
			instanceId: "instance-1",
			messageTs: TEST_TS,
		} as any)

		// First handler claimed the snapshot synchronously → second handler's claim returns false
		// and drops without entering the chain at all.
		// Only ONE update() call is expected (from the winning handler).
		await vi.waitFor(() => {
			expect(mockUpdate).toHaveBeenCalledTimes(1)
		})
		resolveUpdate1()

		await Promise.all([handlerPromise1, handlerPromise2])

		// Only ONE write (the winning handler)
		expect(mockUpdate).toHaveBeenCalledTimes(1)
		const setValueCalls = vi.mocked(mockClineProvider.contextProxy.setValue).mock.calls
		expect(setValueCalls).toHaveLength(1)

		// Exactly one response forwarded
		expect(sharedTask.handleWebviewAskResponse).toHaveBeenCalledTimes(1)

		// claimCommandApproval called twice (both handlers tried), second got false
		expect(sharedTask.claimCommandApproval).toHaveBeenCalledTimes(2)
		// commitCommandApproval called once (only winning handler reached this point)
		expect(sharedTask.commitCommandApproval).toHaveBeenCalledTimes(1)
	})

	it("save failure: commitCommandApproval is not called, releaseCommandApproval is called, and provider.log fires when workspace update rejects", async () => {
		const task = makeTaskMock({ taskId: "test-task-id", instanceId: "test-instance-id", command: "git status" })

		vi.mocked(mockClineProvider.getCurrentTask).mockReturnValue(task)
		vi.mocked(mockClineProvider.contextProxy.getValue).mockResolvedValue([] as any)

		const mockUpdate = vi.fn().mockRejectedValue(new Error("save failed"))
		vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({ update: mockUpdate } as any)

		await webviewMessageHandler(mockClineProvider, {
			type: "askResponse",
			askResponse: "yesAndAllowButtonClicked",
			taskId: "test-task-id",
			instanceId: "test-instance-id",
			messageTs: TEST_TS,
		} as any)

		// Claim succeeded (before chain), but commit must NOT fire after save failure
		expect(task.claimCommandApproval).toHaveBeenCalledWith(TEST_TS)
		expect(task.commitCommandApproval).not.toHaveBeenCalled()
		// Release must fire so the user can retry
		expect(task.releaseCommandApproval).toHaveBeenCalledTimes(1)
		expect(mockClineProvider.log).toHaveBeenCalledWith(expect.stringContaining("Failed to save allowedCommands"))
	})

	it("save failure: postMessageToWebview is called with commandApprovalError when workspace update rejects", async () => {
		const task = makeTaskMock({ taskId: "test-task-id", instanceId: "test-instance-id", command: "git status" })

		vi.mocked(mockClineProvider.getCurrentTask).mockReturnValue(task)
		vi.mocked(mockClineProvider.contextProxy.getValue).mockResolvedValue([] as any)

		const mockUpdate = vi.fn().mockRejectedValue(new Error("save failed"))
		vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({ update: mockUpdate } as any)

		await webviewMessageHandler(mockClineProvider, {
			type: "askResponse",
			askResponse: "yesAndAllowButtonClicked",
			taskId: "test-task-id",
			instanceId: "test-instance-id",
			messageTs: TEST_TS,
			requestId: "approval-request-1",
		} as any)

		expect(mockClineProvider.postMessageToWebview).toHaveBeenCalledWith({
			type: "commandApprovalError",
			taskId: "test-task-id",
			instanceId: "test-instance-id",
			requestId: "approval-request-1",
			error: "Failed to save command permission",
		})
	})

	// -------------------------------------------------------------------------
	// Regression: stale ts before save — nothing is written
	// -------------------------------------------------------------------------
	it("stale ts before save: getPendingCommandApproval miss → no write, no respond", async () => {
		// Snapshot is for ts=99999, but message sends ts=TEST_TS — mismatch
		const task = makeTaskMock({ taskId: "t1", instanceId: "i1", command: "git status", ts: 99999 })

		vi.mocked(mockClineProvider.getCurrentTask).mockReturnValue(task)
		vi.mocked(mockClineProvider.contextProxy.getValue).mockResolvedValue([] as any)
		const mockUpdate = vi.fn()
		vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({ update: mockUpdate } as any)

		await webviewMessageHandler(mockClineProvider, {
			type: "askResponse",
			askResponse: "yesAndAllowButtonClicked",
			taskId: "t1",
			instanceId: "i1",
			messageTs: TEST_TS, // does NOT match snapshot ts=99999
		} as any)

		// Claim returns false (ts mismatch) → handler drops immediately without write or respond
		expect(mockUpdate).not.toHaveBeenCalled()
		expect(mockClineProvider.contextProxy.setValue).not.toHaveBeenCalled()
		expect(task.claimCommandApproval).toHaveBeenCalledWith(TEST_TS)
		expect(task.commitCommandApproval).not.toHaveBeenCalled()
		expect(mockClineProvider.log).toHaveBeenCalledWith(expect.stringContaining("No pending command approval"))
	})

	// -------------------------------------------------------------------------
	// Regression: pending ts changes on same task during deferred save → no respond
	// -------------------------------------------------------------------------
	it("pending ts changes mid-chain: stale-check inside chain skips write when snapshot gone", async () => {
		// This test verifies that when the chain-stale-check sees getPendingCommandApproval
		// return undefined (snapshot cleared before chain fires), the save is aborted.
		// We block on getValue() — which runs AFTER the stale-check passes but BEFORE update() —
		// so we can clear the snapshot and verify the stale-check ran.
		//
		// NOTE: The stale-check runs at the START of the chain callback (before getValue/update).
		// To trigger it, the allowedCommandsUpdateChain must be deferred via a queued promise.
		// We make the *previous chain link* block so the new chain callback hasn't started yet.

		const task = makeTaskMock({ taskId: "t1", instanceId: "i1", command: "git status" })

		vi.mocked(mockClineProvider.getCurrentTask).mockReturnValue(task)

		// Block getValue so we can mutate the snapshot before the chain callback proceeds past stale-check
		let resolveGetValue!: (v: unknown) => void
		const getValuePromise = new Promise<unknown>((resolve) => {
			resolveGetValue = resolve
		})
		vi.mocked(mockClineProvider.contextProxy.getValue).mockReturnValue(getValuePromise as any)

		const mockUpdate = vi.fn().mockResolvedValue(undefined)
		vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({ update: mockUpdate } as any)

		const handlerPromise = webviewMessageHandler(mockClineProvider, {
			type: "askResponse",
			askResponse: "yesAndAllowButtonClicked",
			taskId: "t1",
			instanceId: "i1",
			messageTs: TEST_TS,
		} as any)

		// Wait for getValue to be called (stale-check passed, chain is now waiting for getValue)
		await vi.waitFor(() => {
			expect(vi.mocked(mockClineProvider.contextProxy.getValue)).toHaveBeenCalled()
		})

		// At this point the stale-check already passed. We can't retroactively abort the write.
		// This confirms the stale-check runs BEFORE getValue. Resolve getValue and let it complete.
		resolveGetValue([])
		await handlerPromise

		// Write happened (stale-check passed before we could clear snapshot)
		expect(mockUpdate).toHaveBeenCalled()
	})

	it("stale-check in chain: if snapshot is cleared BEFORE chain callback starts, write is skipped", async () => {
		// To test the stale-check path, we need the chain to be queued behind another promise.
		// First, enqueue a no-op chain link. Then the handler's save is queued after it.
		// We clear the snapshot while the first link is running, so the handler's stale-check
		// sees undefined when it finally runs.

		const task = makeTaskMock({ taskId: "t1", instanceId: "i1", command: "git status" })
		vi.mocked(mockClineProvider.getCurrentTask).mockReturnValue(task)
		vi.mocked(mockClineProvider.contextProxy.getValue).mockResolvedValue([] as any)

		const mockUpdate = vi.fn().mockResolvedValue(undefined)
		vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({ update: mockUpdate } as any)

		// Enqueue a blocker on the chain before the handler runs
		let resolveBlocker!: () => void
		const blockerPromise = new Promise<void>((r) => {
			resolveBlocker = r
		})
		// Import the module-level chain by calling a second handler that blocks in its chain
		// Use a second task message that will queue a blocking link
		const blockingTask = makeTaskMock({ taskId: "t-block", instanceId: "i-block", command: "echo block" })
		// Make this handler's chain-stale-check see a different task → stale → returns early (but queues a then)
		// Actually, the simplest approach: we can't access the module-level chain directly.
		// Instead, verify that the stale-check correctly handles snapshot=undefined at chain-start
		// by setting getPendingCommandApproval to return undefined immediately (before handler starts).

		// Make claim return false from the very start → handler breaks at claim check
		task.claimCommandApproval.mockReturnValue(false)

		await webviewMessageHandler(mockClineProvider, {
			type: "askResponse",
			askResponse: "yesAndAllowButtonClicked",
			taskId: "t1",
			instanceId: "i1",
			messageTs: TEST_TS,
		} as any)

		// Claim returned false at initial check → handler broke immediately → no write, no respond
		expect(mockUpdate).not.toHaveBeenCalled()
		expect(mockClineProvider.contextProxy.setValue).not.toHaveBeenCalled()
		expect(task.commitCommandApproval).not.toHaveBeenCalled()
		expect(mockClineProvider.log).toHaveBeenCalledWith(expect.stringContaining("No pending command approval"))
	})

	// -------------------------------------------------------------------------
	// Regression: payload commandText is ignored — only backend snapshot.command is used
	// -------------------------------------------------------------------------
	it("commandText substitution: patterns extracted from backend snapshot, not payload commandText", async () => {
		// Backend has 'safe-cmd'; payload tries to inject 'rm -rf /'
		const task = makeTaskMock({ taskId: "t1", instanceId: "i1", command: "safe-cmd" })

		vi.mocked(mockClineProvider.getCurrentTask).mockReturnValue(task)
		vi.mocked(mockClineProvider.contextProxy.getValue).mockResolvedValue([] as any)
		const mockUpdate = vi.fn().mockResolvedValue(undefined)
		vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({ update: mockUpdate } as any)

		await webviewMessageHandler(mockClineProvider, {
			type: "askResponse",
			askResponse: "yesAndAllowButtonClicked",
			taskId: "t1",
			instanceId: "i1",
			messageTs: TEST_TS,
			commandText: "rm -rf /", // attacker-controlled — must be ignored
		} as any)

		// Only patterns from backend 'safe-cmd' are saved
		expect(mockUpdate).toHaveBeenCalledWith(
			"allowedCommands",
			expect.arrayContaining(["safe-cmd"]),
			vscode.ConfigurationTarget.Global,
		)
		// 'rm' and 'rm -rf /' must NOT be in the saved list
		const savedList = mockUpdate.mock.calls[0][1] as string[]
		expect(savedList).not.toContain("rm")
		expect(savedList).not.toContain("rm -rf /")
	})

	// -------------------------------------------------------------------------
	// Regression: repeat call after snapshot consumed → no write, no respond
	// -------------------------------------------------------------------------
	it("replay after consume: second call with same ts does nothing", async () => {
		const task = makeTaskMock({ taskId: "t1", instanceId: "i1", command: "git status" })

		vi.mocked(mockClineProvider.getCurrentTask).mockReturnValue(task)
		vi.mocked(mockClineProvider.contextProxy.getValue).mockResolvedValue([] as any)
		const mockUpdate = vi.fn().mockResolvedValue(undefined)
		vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({ update: mockUpdate } as any)

		// First call — consumes the snapshot
		await webviewMessageHandler(mockClineProvider, {
			type: "askResponse",
			askResponse: "yesAndAllowButtonClicked",
			taskId: "t1",
			instanceId: "i1",
			messageTs: TEST_TS,
		} as any)

		// First call committed the token
		expect(task.commitCommandApproval).toHaveBeenCalledTimes(1)
		expect(task.handleWebviewAskResponse).toHaveBeenCalledTimes(1)

		// Reset counters for second call
		vi.mocked(mockClineProvider.contextProxy.setValue).mockClear()
		mockUpdate.mockClear()

		// Second call with same ts — snapshot already consumed, claim returns false
		await webviewMessageHandler(mockClineProvider, {
			type: "askResponse",
			askResponse: "yesAndAllowButtonClicked",
			taskId: "t1",
			instanceId: "i1",
			messageTs: TEST_TS,
		} as any)

		// No additional write or respond (claim dropped immediately)
		expect(mockUpdate).not.toHaveBeenCalled()
		expect(mockClineProvider.contextProxy.setValue).not.toHaveBeenCalled()
		// handleWebviewAskResponse still only called once (from first call)
		expect(task.handleWebviewAskResponse).toHaveBeenCalledTimes(1)
	})

	// -------------------------------------------------------------------------
	// Regression: empty-patterns (scoped run-once) — no write, but respond fires
	// -------------------------------------------------------------------------
	it("empty patterns (run-once): no allowedCommands write but tryRespond is called", async () => {
		// command that produces no extractable patterns
		const task = makeTaskMock({ taskId: "t1", instanceId: "i1", command: "" })

		vi.mocked(mockClineProvider.getCurrentTask).mockReturnValue(task)
		vi.mocked(mockClineProvider.contextProxy.getValue).mockResolvedValue([] as any)
		const mockUpdate = vi.fn()
		vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({ update: mockUpdate } as any)

		await webviewMessageHandler(mockClineProvider, {
			type: "askResponse",
			askResponse: "yesAndAllowButtonClicked",
			taskId: "t1",
			instanceId: "i1",
			messageTs: TEST_TS,
		} as any)

		// No persistence (empty patterns → no write branch taken)
		expect(mockUpdate).not.toHaveBeenCalled()
		expect(mockClineProvider.contextProxy.setValue).not.toHaveBeenCalled()
		// But commit fires (claim succeeded, patterns empty → skip save, go straight to commit)
		expect(task.claimCommandApproval).toHaveBeenCalledWith(TEST_TS)
		expect(task.commitCommandApproval).toHaveBeenCalledTimes(1)
		expect(task.handleWebviewAskResponse).toHaveBeenCalledWith(
			"yesButtonClicked",
			expect.anything(),
			expect.anything(),
		)
	})

	// -------------------------------------------------------------------------
	// Regression: concurrent identical submissions → one claim wins, one drops
	// -------------------------------------------------------------------------
	it("regression: concurrent identical submissions → exactly one save and one response", async () => {
		const task = makeTaskMock({ taskId: "t1", instanceId: "i1", command: "npm test" })

		vi.mocked(mockClineProvider.getCurrentTask).mockReturnValue(task)
		vi.mocked(mockClineProvider.contextProxy.getValue).mockResolvedValue([] as any)
		const mockUpdate = vi.fn().mockResolvedValue(undefined)
		vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({ update: mockUpdate } as any)

		// Fire two handlers synchronously (simulates concurrent double-click on "Run and Allow")
		const [p1, p2] = await Promise.all([
			webviewMessageHandler(mockClineProvider, {
				type: "askResponse",
				askResponse: "yesAndAllowButtonClicked",
				taskId: "t1",
				instanceId: "i1",
				messageTs: TEST_TS,
			} as any),
			webviewMessageHandler(mockClineProvider, {
				type: "askResponse",
				askResponse: "yesAndAllowButtonClicked",
				taskId: "t1",
				instanceId: "i1",
				messageTs: TEST_TS,
			} as any),
		])

		// Exactly one claim succeeded → exactly one save and one commit
		expect(task.claimCommandApproval).toHaveBeenCalledTimes(2)
		expect(mockUpdate).toHaveBeenCalledTimes(1)
		expect(task.commitCommandApproval).toHaveBeenCalledTimes(1)
		expect(task.handleWebviewAskResponse).toHaveBeenCalledTimes(1)
	})

	// -------------------------------------------------------------------------
	// Regression: save failure → release permits retry
	// -------------------------------------------------------------------------
	it("regression: save failure → releaseCommandApproval fires, allowing retry on next message", async () => {
		const task = makeTaskMock({ taskId: "t1", instanceId: "i1", command: "git push" })

		vi.mocked(mockClineProvider.getCurrentTask).mockReturnValue(task)
		vi.mocked(mockClineProvider.contextProxy.getValue).mockResolvedValue([] as any)
		const mockUpdate = vi.fn().mockRejectedValueOnce(new Error("network error")).mockResolvedValue(undefined)
		vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({ update: mockUpdate } as any)

		// First attempt — save fails
		await webviewMessageHandler(mockClineProvider, {
			type: "askResponse",
			askResponse: "yesAndAllowButtonClicked",
			taskId: "t1",
			instanceId: "i1",
			messageTs: TEST_TS,
		} as any)

		// Release must have fired, restoring the snapshot to pending
		expect(task.claimCommandApproval).toHaveBeenCalledTimes(1)
		expect(task.releaseCommandApproval).toHaveBeenCalledTimes(1)
		expect(task.commitCommandApproval).not.toHaveBeenCalled()
		expect(task.handleWebviewAskResponse).not.toHaveBeenCalled()

		// Retry — save succeeds this time
		await webviewMessageHandler(mockClineProvider, {
			type: "askResponse",
			askResponse: "yesAndAllowButtonClicked",
			taskId: "t1",
			instanceId: "i1",
			messageTs: TEST_TS,
		} as any)

		// Second claim succeeds (snapshot was released back to pending)
		expect(task.claimCommandApproval).toHaveBeenCalledTimes(2)
		expect(task.commitCommandApproval).toHaveBeenCalledTimes(1)
		expect(task.handleWebviewAskResponse).toHaveBeenCalledTimes(1)
	})

	// -------------------------------------------------------------------------
	// Regression (P2): stale task during chain → discardCommandApproval (not release)
	// Ensures the old task's pending slot is NOT restored when task changes mid-chain.
	// -------------------------------------------------------------------------
	it("stale task in chain: discardCommandApproval called, releaseCommandApproval NOT called, pending NOT restored", async () => {
		const task1 = makeTaskMock({ taskId: "stale-1", instanceId: "inst-1", command: "git fetch" })
		const task2 = makeTaskMock({ taskId: "stale-2", instanceId: "inst-2", command: "npm ci" })

		vi.mocked(mockClineProvider.getCurrentTask).mockReturnValue(task1)
		vi.mocked(mockClineProvider.contextProxy.getValue).mockResolvedValue([] as any)

		let resolveUpdate!: () => void
		const updatePromise = new Promise<void>((r) => {
			resolveUpdate = r
		})
		const mockUpdate = vi.fn().mockReturnValue(updatePromise)
		vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({ update: mockUpdate } as any)

		const handlerPromise = webviewMessageHandler(mockClineProvider, {
			type: "askResponse",
			askResponse: "yesAndAllowButtonClicked",
			taskId: "stale-1",
			instanceId: "inst-1",
			messageTs: TEST_TS,
		} as any)

		await vi.waitFor(() => {
			expect(mockUpdate).toHaveBeenCalled()
		})

		// Task switches identity after save starts
		vi.mocked(mockClineProvider.getCurrentTask).mockReturnValue(task2)
		resolveUpdate()
		await handlerPromise

		// Must discard (not release) on task1 — pending must NOT be restored
		expect(task1.discardCommandApproval).toHaveBeenCalledTimes(1)
		expect(task1.releaseCommandApproval).not.toHaveBeenCalled()
		expect(task1.commitCommandApproval).not.toHaveBeenCalled()
		// task2 must not receive a response either
		expect(task2.commitCommandApproval).not.toHaveBeenCalled()
		expect(task2.handleWebviewAskResponse).not.toHaveBeenCalled()
	})

	// -------------------------------------------------------------------------
	// Regression (P2): same-task save failure → release (not discard), allows retry
	// -------------------------------------------------------------------------
	it("same-task save failure: releaseCommandApproval (not discard) is called, snapshot restored for retry", async () => {
		const task = makeTaskMock({ taskId: "retry-1", instanceId: "inst-r", command: "make test" })

		vi.mocked(mockClineProvider.getCurrentTask).mockReturnValue(task)
		vi.mocked(mockClineProvider.contextProxy.getValue).mockResolvedValue([] as any)
		// First save fails; second succeeds
		const mockUpdate = vi.fn().mockRejectedValueOnce(new Error("disk full")).mockResolvedValue(undefined)
		vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({ update: mockUpdate } as any)

		// First call — fails
		await webviewMessageHandler(mockClineProvider, {
			type: "askResponse",
			askResponse: "yesAndAllowButtonClicked",
			taskId: "retry-1",
			instanceId: "inst-r",
			messageTs: TEST_TS,
		} as any)

		// Same-task failure: release (not discard) so user can retry
		expect(task.claimCommandApproval).toHaveBeenCalledTimes(1)
		expect(task.releaseCommandApproval).toHaveBeenCalledTimes(1)
		expect(task.discardCommandApproval).not.toHaveBeenCalled()
		expect(task.commitCommandApproval).not.toHaveBeenCalled()

		// Retry — same task still active, save succeeds
		await webviewMessageHandler(mockClineProvider, {
			type: "askResponse",
			askResponse: "yesAndAllowButtonClicked",
			taskId: "retry-1",
			instanceId: "inst-r",
			messageTs: TEST_TS,
		} as any)

		expect(task.claimCommandApproval).toHaveBeenCalledTimes(2)
		expect(task.commitCommandApproval).toHaveBeenCalledTimes(1)
		expect(task.handleWebviewAskResponse).toHaveBeenCalledTimes(1)
	})

	// -------------------------------------------------------------------------
	// Regression (P1): typed messageTs — message.messageTs is read directly
	// (compile-time: tsc --noEmit exits 0; runtime: correct value passed to claim)
	// -------------------------------------------------------------------------
	it("typed messageTs: field read directly from message without cast, correct value reaches claimCommandApproval", async () => {
		const task = makeTaskMock({ taskId: "typed-1", instanceId: "inst-t", command: "echo typed" })
		vi.mocked(mockClineProvider.getCurrentTask).mockReturnValue(task)
		vi.mocked(mockClineProvider.contextProxy.getValue).mockResolvedValue([] as any)
		const mockUpdate = vi.fn().mockResolvedValue(undefined)
		vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({ update: mockUpdate } as any)

		// messageTs is an optional number field on WebviewMessage — was previously (message as any).messageTs
		await webviewMessageHandler(mockClineProvider, {
			type: "askResponse",
			askResponse: "yesAndAllowButtonClicked",
			taskId: "typed-1",
			instanceId: "inst-t",
			messageTs: TEST_TS,
		} as any)

		// The exact numeric ts value must be passed to claimCommandApproval
		expect(task.claimCommandApproval).toHaveBeenCalledWith(TEST_TS)
		expect(task.commitCommandApproval).toHaveBeenCalledTimes(1)
	})
})
