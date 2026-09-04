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
		return { ...args, taskId: "task", instanceId: "instance", start: vi.fn(), emit: vi.fn() }
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
	provider.getState = vi.fn().mockResolvedValue({
		apiConfiguration: globalConfig,
		mode: "code",
		organizationAllowList: { allowAll: true },
		roleAssignments: { roles: {} },
		...state,
	})
	provider.setValues = vi.fn().mockResolvedValue(undefined)
	provider.removeClineFromStack = vi.fn().mockResolvedValue(undefined)
	provider.addClineToStack = vi.fn().mockResolvedValue(undefined)
	provider.providerSettingsManager = {
		getProfile: vi.fn(),
		getModeConfigId: vi.fn().mockResolvedValue(undefined),
		listConfig: vi.fn().mockResolvedValue([]),
	}
	provider.customModesManager = { getCustomModes: vi.fn().mockResolvedValue([]) }
	provider.updateGlobalState = vi.fn().mockResolvedValue(undefined)
	provider.performPreparationTasks = vi.fn().mockResolvedValue(undefined)
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

	it("preserves executor-provided orchestration configuration over persisted assignments", async () => {
		const provider = makeProvider({
			roleAssignments: { roles: { worker: { profileName: "persisted", modelId: "persisted-model" } } },
		})
		provider.providerSettingsManager.getProfile.mockResolvedValue(profile({ apiProvider: "openrouter" }))
		await provider.createTask(
			"text",
			[],
			undefined,
			{},
			{ apiProvider: "openai", openAiModelId: "executor-model", apiKey: "key" } as any,
			"worker",
		)
		const config = taskConstructor.mock.calls.at(-1)![0]
		expect(config.apiConfiguration.openAiModelId).toBe("executor-model")
		expect(config.apiConfiguration.openRouterModelId).toBeUndefined()
		expect(config.isRoleSpecificConfig).toBe(true)
		expect(resolveModelRoute).not.toHaveBeenCalled()
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

describe("ClineProvider task restoration role assignment", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		resolveModelRoute.mockImplementation(({ explicitModelId, primaryModelId }) => ({
			provider: "openrouter",
			modelId: explicitModelId ?? primaryModelId,
		}))
	})

	const historyItem = { id: "history", task: "restored", mode: "code", ts: 1 } as any

	it("A1 restores the explicit role model and marks the task role-specific", async () => {
		const provider = makeProvider({
			roleAssignments: { roles: { code: { profileName: "custom", modelId: "role-model" } } },
		})
		provider.providerSettingsManager.getProfile.mockResolvedValue(profile({ openRouterModelId: "profile-model" }))
		await provider.createTaskWithHistoryItem({ ...historyItem }, { startTask: false })
		expect(taskConstructor).toHaveBeenLastCalledWith(
			expect.objectContaining({
				apiConfiguration: expect.objectContaining({ openRouterModelId: "role-model" }),
				isRoleSpecificConfig: true,
			}),
		)
	})

	it("A2 uses an isolated profile snapshot when the role has no assignment", async () => {
		const provider = makeProvider()
		await provider.createTaskWithHistoryItem({ ...historyItem }, { startTask: false })
		const args = taskConstructor.mock.calls.at(-1)![0]
		expect(args.isRoleSpecificConfig).toBe(false)
		expect(args.apiConfiguration).toEqual(globalConfig)
		expect(args.apiConfiguration).not.toBe(globalConfig)
	})

	it("A3 resolves create and restore symmetrically", async () => {
		const provider = makeProvider({
			roleAssignments: { roles: { code: { profileName: "custom", modelId: "same-model" } } },
		})
		provider.providerSettingsManager.getProfile.mockResolvedValue(profile({ openRouterModelId: "profile-model" }))
		await provider.createTask("new", [], undefined, {}, { mode: "code" })
		const created = taskConstructor.mock.calls.at(-1)![0]
		await provider.createTaskWithHistoryItem({ ...historyItem }, { startTask: false })
		const restored = taskConstructor.mock.calls.at(-1)![0]
		expect(restored.apiConfiguration.openRouterModelId).toBe(created.apiConfiguration.openRouterModelId)
		expect(restored.isRoleSpecificConfig).toBe(created.isRoleSpecificConfig)
	})

	it("C2 gives roleAssignments.modelId priority over stale profile role settings", async () => {
		const provider = makeProvider({
			roleAssignments: { roles: { code: { profileName: "custom", modelId: "M1" } } },
		})
		provider.providerSettingsManager.getProfile.mockResolvedValue(
			profile({
				profileRoleModelSettings: {
					schemaVersion: 1,
					roleModels: { code: { modelId: "M2", inheritPrimary: false } },
				},
			}),
		)
		await provider.createTaskWithHistoryItem({ ...historyItem }, { startTask: false })
		expect(resolveModelRoute).toHaveBeenCalledWith(expect.objectContaining({ explicitModelId: "M1" }))
		expect(taskConstructor.mock.calls.at(-1)![0].apiConfiguration.openRouterModelId).toBe("M1")
	})

	it("C3 does not share task configuration references with global state", async () => {
		const provider = makeProvider()
		await provider.createTaskWithHistoryItem({ ...historyItem }, { startTask: false })
		const first = taskConstructor.mock.calls.at(-1)![0].apiConfiguration
		await provider.createTaskWithHistoryItem({ ...historyItem, id: "history-2" }, { startTask: false })
		const second = taskConstructor.mock.calls.at(-1)![0].apiConfiguration
		first.apiModelId = "mutated"
		expect(second.apiModelId).toBe("global-model")
		expect(globalConfig.apiModelId).toBe("global-model")
	})
})
