import * as vscode from "vscode"

import { ContextProxy } from "../../config/ContextProxy"
import { ClineProvider } from "../ClineProvider"

const { resolveModelRoute, taskConstructor } = vi.hoisted(() => ({
	resolveModelRoute: vi.fn(),
	taskConstructor: vi.fn(),
}))

vi.mock("vscode", () => ({
	ExtensionContext: vi.fn(),
	OutputChannel: vi.fn(),
	WebviewView: vi.fn(),
	Uri: { joinPath: vi.fn(), file: vi.fn() },
	RelativePattern: vi.fn((base: unknown, pattern: string) => ({ base, pattern })),
	commands: { executeCommand: vi.fn().mockResolvedValue(undefined) },
	window: {
		showInformationMessage: vi.fn(),
		showWarningMessage: vi.fn(),
		showErrorMessage: vi.fn(),
		createTextEditorDecorationType: vi.fn(() => ({ dispose: vi.fn() })),
		onDidChangeActiveTextEditor: vi.fn(() => ({ dispose: vi.fn() })),
	},
	workspace: {
		workspaceFolders: [{ uri: { fsPath: "/workspace" } }],
		createFileSystemWatcher: vi.fn(() => ({
			onDidCreate: vi.fn(() => ({ dispose: vi.fn() })),
			onDidChange: vi.fn(() => ({ dispose: vi.fn() })),
			onDidDelete: vi.fn(() => ({ dispose: vi.fn() })),
			dispose: vi.fn(),
		})),
		getConfiguration: vi.fn(() => ({ get: vi.fn((_: string, value: unknown) => value), update: vi.fn() })),
		onDidChangeConfiguration: vi.fn(() => ({ dispose: vi.fn() })),
		onDidSaveTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
	},
	env: { uriScheme: "vscode", language: "en", appName: "Visual Studio Code" },
	ExtensionMode: { Test: 3 },
	version: "1.85.0",
}))

vi.mock("@ai-code-orchestrator/types", async () => {
	const actual = await vi.importActual<typeof import("@ai-code-orchestrator/types")>("@ai-code-orchestrator/types")
	return { ...actual, resolveModelRoute }
})
vi.mock("../../task/Task", () => ({
	Task: vi.fn().mockImplementation((args) => {
		taskConstructor(args)
		return { ...args, taskId: "task", instanceId: "instance", start: vi.fn() }
	}),
}))
vi.mock("fs/promises", () => ({
	mkdir: vi.fn(),
	writeFile: vi.fn(),
	readFile: vi.fn().mockResolvedValue("[]"),
	unlink: vi.fn(),
	rmdir: vi.fn(),
	readdir: vi.fn().mockResolvedValue([]),
	stat: vi.fn().mockRejectedValue({ code: "ENOENT" }),
}))
vi.mock("p-wait-for", () => ({ default: vi.fn().mockResolvedValue(undefined) }))
vi.mock("delay", () => ({ default: vi.fn().mockResolvedValue(undefined) }))
vi.mock("../../../utils/storage", () => ({
	getTaskDirectoryPath: vi.fn().mockResolvedValue("/workspace/tasks/task"),
	getSettingsDirectoryPath: vi.fn().mockResolvedValue("/workspace/settings"),
	getGlobalStoragePath: vi.fn().mockResolvedValue("/workspace"),
}))
vi.mock("../../../utils/safeWriteJson", () => ({ safeWriteJson: vi.fn() }))
vi.mock("../../../api", () => ({ buildApiHandler: vi.fn(() => ({ getModel: vi.fn() })) }))
vi.mock("../../prompts/sections/custom-instructions", () => ({ addCustomInstructions: vi.fn().mockResolvedValue("") }))
vi.mock("../../prompts/system", () => ({ SYSTEM_PROMPT: vi.fn().mockResolvedValue("") }))
vi.mock("../../../integrations/workspace/WorkspaceTracker", () => ({
	default: vi.fn(() => ({ initializeFilePaths: vi.fn(), dispose: vi.fn() })),
}))
vi.mock("../../../api/providers/fetchers/modelCache", () => ({
	getModels: vi.fn().mockResolvedValue({}),
	flushModels: vi.fn(),
}))

const globalConfig = {
	apiProvider: "anthropic",
	apiModelId: "global-model",
	apiKey: "global-key",
	openRouterModelId: "legacy-openrouter",
	openAiModelId: "legacy-openai",
} as any

function extensionContext(): vscode.ExtensionContext {
	return {
		globalState: { get: vi.fn(), update: vi.fn(), keys: vi.fn(() => []) },
		workspaceState: { get: vi.fn(), update: vi.fn(), keys: vi.fn(() => []) },
		secrets: { get: vi.fn(), store: vi.fn(), delete: vi.fn() },
		globalStorageUri: { fsPath: "/workspace" },
		extensionUri: { fsPath: "/extension" },
		extension: { packageJSON: { version: "1" } },
		subscriptions: [],
	} as any
}

function makeProvider(state: any = {}) {
	const provider = new ClineProvider(
		extensionContext(),
		{ appendLine: vi.fn(), append: vi.fn(), clear: vi.fn(), show: vi.fn(), hide: vi.fn(), dispose: vi.fn() } as any,
		"sidebar",
		new ContextProxy(extensionContext()),
	) as any
	provider.getState = vi
		.fn()
		.mockResolvedValue({
			apiConfiguration: globalConfig,
			mode: "code",
			organizationAllowList: { allowAll: true },
			roleAssignments: { roles: {} },
			...state,
		})
	provider.setValues = vi.fn().mockResolvedValue(undefined)
	provider.removeClineFromStack = vi.fn().mockResolvedValue(undefined)
	provider.addClineToStack = vi.fn().mockResolvedValue(undefined)
	provider.providerSettingsManager = { getProfile: vi.fn() }
	provider.clineStack = []
	return provider
}

const profile = (overrides: any = {}) => ({
	id: "custom-id",
	apiProvider: "openrouter",
	openRouterApiKey: "profile-key",
	profileRoleModelSettings: {},
	...overrides,
})

describe("ClineProvider.createTask role assignment", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		resolveModelRoute.mockReturnValue({ provider: "openrouter", modelId: "resolved-model" })
	})

	async function create(provider: any, mode = "code", explicitRole?: string) {
		return provider.createTask("text", [], undefined, {}, { mode }, explicitRole)
	}

	it.each([
		["manual UI", "code", undefined, "code", { profileName: "custom", modelId: "code-model" }],
		["orchestration", "code", "worker", "worker", { profileName: "custom", modelId: "worker-model" }],
	])("uses the assignment for %s", async (_, mode, explicitRole, key, assignment) => {
		const provider = makeProvider({ roleAssignments: { roles: { [key]: assignment } } })
		provider.providerSettingsManager.getProfile.mockResolvedValue(profile())
		await create(provider, mode, explicitRole)
		expect(provider.providerSettingsManager.getProfile).toHaveBeenCalledWith({ name: "custom" })
		expect(resolveModelRoute).toHaveBeenCalledWith(
			expect.objectContaining({ role: key, explicitModelId: assignment.modelId }),
		)
	})

	it.each([
		["code", "worker"],
		["orchestrator", "orchestrator"],
	])("falls back from %s to %s", async (mode, key) => {
		const provider = makeProvider({
			roleAssignments: { roles: { [key]: { profileName: "custom", modelId: "fallback" } } },
		})
		provider.providerSettingsManager.getProfile.mockResolvedValue(profile())
		await create(provider, mode)
		expect(resolveModelRoute).toHaveBeenCalledWith(expect.objectContaining({ role: key }))
	})

	it("loads the selected profile and resolves its model", async () => {
		const selected = profile({ openRouterApiKey: "selected-key" })
		const provider = makeProvider({
			roleAssignments: { roles: { code: { profileName: "custom", modelId: "gpt-4" } } },
		})
		provider.providerSettingsManager.getProfile.mockResolvedValue(selected)
		await create(provider)
		expect(provider.providerSettingsManager.getProfile).toHaveBeenCalledWith({ name: "custom" })
		expect(resolveModelRoute).toHaveBeenCalledWith(
			expect.objectContaining({ primaryModelId: "", explicitModelId: "gpt-4" }),
		)
		expect(taskConstructor).toHaveBeenCalledWith(
			expect.objectContaining({
				apiConfiguration: expect.objectContaining({ openRouterModelId: "resolved-model" }),
				isRoleSpecificConfig: true,
			}),
		)
	})

	it("clears every legacy provider model key", async () => {
		const provider = makeProvider({
			roleAssignments: { roles: { code: { profileName: "custom", modelId: "routed" } } },
		})
		provider.providerSettingsManager.getProfile.mockResolvedValue(
			profile({ openRouterModelId: "old", openAiModelId: "old" }),
		)
		await create(provider)
		const config = taskConstructor.mock.calls[0][0].apiConfiguration
		expect(config.openRouterModelId).toBe("resolved-model")
		expect(config.openAiModelId).toBeUndefined()
		expect(config.apiModelId).toBeUndefined()
	})

	it("marks routed tasks role-specific and global tasks non-role-specific", async () => {
		const routed = makeProvider({
			roleAssignments: { roles: { code: { profileName: "custom", modelId: "routed" } } },
		})
		routed.providerSettingsManager.getProfile.mockResolvedValue(profile())
		await create(routed)
		expect(taskConstructor).toHaveBeenLastCalledWith(expect.objectContaining({ isRoleSpecificConfig: true }))
		const global = makeProvider()
		await create(global)
		expect(taskConstructor).toHaveBeenLastCalledWith(
			expect.objectContaining({ isRoleSpecificConfig: false, apiConfiguration: globalConfig }),
		)
	})

	it("routes an orchestration worker and falls back to global config when absent", async () => {
		const provider = makeProvider({
			roleAssignments: { roles: { worker: { profileName: "custom", modelId: "worker-model" } } },
		})
		provider.providerSettingsManager.getProfile.mockResolvedValue(profile())
		await create(provider, "code", "worker")
		expect(taskConstructor).toHaveBeenLastCalledWith(
			expect.objectContaining({
				isRoleSpecificConfig: true,
				apiConfiguration: expect.objectContaining({ openRouterModelId: "resolved-model" }),
			}),
		)
		const fallback = makeProvider()
		await create(fallback, "code", "worker")
		expect(taskConstructor).toHaveBeenLastCalledWith(
			expect.objectContaining({ isRoleSpecificConfig: false, apiConfiguration: globalConfig }),
		)
	})
})
