import * as vscode from "vscode"

import { ContextProxy } from "../../config/ContextProxy"
import { Task } from "../../task/Task"
import { ClineProvider } from "../ClineProvider"

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

vi.mock("fs/promises", () => ({
	mkdir: vi.fn().mockResolvedValue(undefined),
	writeFile: vi.fn().mockResolvedValue(undefined),
	readFile: vi.fn().mockResolvedValue("[]"),
	unlink: vi.fn().mockResolvedValue(undefined),
	rmdir: vi.fn().mockResolvedValue(undefined),
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
vi.mock("../../../utils/safeWriteJson", () => ({ safeWriteJson: vi.fn().mockResolvedValue(undefined) }))
vi.mock("../../../api", () => ({ buildApiHandler: vi.fn(() => ({ getModel: vi.fn(() => ({ id: "test-model" })) })) }))
vi.mock("../../prompts/sections/custom-instructions", () => ({
	addCustomInstructions: vi.fn().mockResolvedValue("mode instructions"),
}))
vi.mock("../../prompts/system", () => ({ SYSTEM_PROMPT: vi.fn().mockResolvedValue("system prompt") }))
vi.mock("../../../integrations/workspace/WorkspaceTracker", () => ({
	default: vi.fn(() => ({ initializeFilePaths: vi.fn(), dispose: vi.fn() })),
}))
vi.mock("../../../api/providers/fetchers/modelCache", () => ({
	getModels: vi.fn().mockResolvedValue({}),
	flushModels: vi.fn(),
}))

const config = { apiProvider: "anthropic", apiModelId: "parent-model", apiKey: "key" } as any

function context(): vscode.ExtensionContext {
	return {
		globalState: { get: vi.fn(), update: vi.fn().mockResolvedValue(undefined), keys: vi.fn(() => []) },
		workspaceState: { get: vi.fn(), update: vi.fn().mockResolvedValue(undefined), keys: vi.fn(() => []) },
		secrets: {
			get: vi.fn(),
			store: vi.fn().mockResolvedValue(undefined),
			delete: vi.fn().mockResolvedValue(undefined),
		},
		globalStorageUri: { fsPath: "/workspace" },
		extensionUri: { fsPath: "/extension" },
		extension: { packageJSON: { version: "1.0.0" } },
		subscriptions: [],
	} as unknown as vscode.ExtensionContext
}

function makeProvider() {
	const provider = new ClineProvider(
		context(),
		{
			appendLine: vi.fn(),
			append: vi.fn(),
			clear: vi.fn(),
			show: vi.fn(),
			hide: vi.fn(),
			dispose: vi.fn(),
		} as any,
		"sidebar",
		new ContextProxy(context()),
	) as any
	provider.postStateToWebview = vi.fn().mockResolvedValue(undefined)
	provider.postStateToWebviewWithoutTaskHistory = vi.fn().mockResolvedValue(undefined)
	provider.postMessageToWebview = vi.fn().mockResolvedValue(undefined)
	provider.getState = vi
		.fn()
		.mockResolvedValue({ apiConfiguration: config, mode: "code", roleAssignments: { roles: {} } })
	provider.getTaskWithId = vi.fn().mockResolvedValue({ historyItem: { id: "parent", childIds: [] } })
	provider.updateTaskHistory = vi.fn().mockResolvedValue(undefined)
	provider.handleModeSwitch = vi.fn().mockResolvedValue(undefined)
	return provider
}

function task(provider: any, id: string, options: any = {}) {
	const value = new Task({ provider, apiConfiguration: config, task: id, startTask: false, ...options }) as any
	Object.defineProperty(value, "taskId", { value: id, configurable: true })
	Object.defineProperty(value, "instanceId", { value: `${id}-instance`, configurable: true })
	vi.spyOn(value, "abortTask").mockResolvedValue(undefined)
	vi.spyOn(value, "flushPendingToolResultsToHistory").mockResolvedValue(true)
	vi.spyOn(value, "retrySaveApiConversationHistory").mockResolvedValue(true)
	vi.spyOn(value, "start").mockImplementation(() => {})
	return value
}

describe("ClineProvider delegation flow", () => {
	afterEach(() => {
		vi.useRealTimers()
		vi.restoreAllMocks()
	})

	it("delegates, aborts the parent, pushes the child, and syncs webview state", async () => {
		const provider = makeProvider()
		const parent = task(provider, "parent")
		const child = task(provider, "child", { parentTask: parent })
		provider.clineStack = [parent]
		provider.createTask = vi.fn().mockImplementation(async () => {
			provider.clineStack.push(child)
			return child
		})
		const result = await provider.delegateParentAndOpenChild({
			parentTaskId: "parent",
			message: "work",
			initialTodos: [],
			mode: "code",
		})
		expect(parent.abortTask).toHaveBeenCalled()
		expect(provider.getCurrentTaskStack()).toContain("child")
		expect(result).toBe(child)
		expect(provider.postStateToWebview).not.toHaveBeenCalled()
	})

	it("preserves the child's role assignment and does not reuse parent provider keys", async () => {
		const provider = makeProvider()
		provider.getState.mockResolvedValue({
			apiConfiguration: { apiProvider: "openai", openAiApiKey: "old" },
			mode: "code",
			roleAssignments: { roles: { architect: { profileName: "child", modelId: "child-model" } } },
		})
		const parent = task(provider, "parent")
		const child = task(provider, "child", {
			parentTask: parent,
			apiConfiguration: { apiProvider: "openrouter", openRouterApiKey: "new", openRouterModelId: "child-model" },
		})
		provider.clineStack = [parent]
		provider.createTask = vi.fn().mockImplementation(async () => {
			provider.clineStack.push(child)
			return child
		})
		await provider.delegateParentAndOpenChild({
			parentTaskId: "parent",
			message: "work",
			initialTodos: [],
			mode: "architect",
		})
		const passed = provider.createTask.mock.calls[0][3]
		expect(passed).not.toHaveProperty("openAiApiKey")
		expect(child.apiConfiguration.apiProvider).toBe("openrouter")
		expect(child.apiConfiguration.openRouterApiKey).toBe("new")
	})

	it("switches mode before creating the child", async () => {
		const provider = makeProvider()
		const parent = task(provider, "parent")
		const child = task(provider, "child", { parentTask: parent })
		provider.clineStack = [parent]
		const order: string[] = []
		provider.handleModeSwitch.mockImplementation(async () => {
			order.push("mode")
		})
		provider.createTask = vi.fn().mockImplementation(async () => {
			order.push("create")
			provider.clineStack.push(child)
			return child
		})
		await provider.delegateParentAndOpenChild({
			parentTaskId: "parent",
			message: "work",
			initialTodos: [],
			mode: "architect",
		})
		expect(provider.handleModeSwitch).toHaveBeenCalledWith("architect")
		expect(order).toEqual(["mode", "create"])
	})

	it("flushes parent state and starts the child cleanly", async () => {
		const provider = makeProvider()
		const parent = task(provider, "parent")
		parent.clineMessages = [{ type: "say", text: "unsaved" }]
		const child = task(provider, "child", { parentTask: parent })
		provider.clineStack = [parent]
		provider.createTask = vi.fn().mockImplementation(async () => {
			provider.clineStack.push(child)
			return child
		})
		await provider.delegateParentAndOpenChild({
			parentTaskId: "parent",
			message: "work",
			initialTodos: [],
			mode: "code",
		})
		expect(parent.flushPendingToolResultsToHistory).toHaveBeenCalled()
		expect(parent.clineMessages).toContainEqual({ type: "say", text: "unsaved" })
		expect(child.clineMessages).toEqual([])
		expect(child.start).toHaveBeenCalled()
	})

	it("rejects a stale cancel after delegation and leaves the child active", async () => {
		vi.useFakeTimers()
		const provider = makeProvider()
		const parent = task(provider, "parent")
		const child = task(provider, "child", { parentTask: parent })
		provider.clineStack = [parent]
		provider.createTask = vi.fn().mockImplementation(async () => {
			provider.clineStack.push(child)
			return child
		})
		await provider.delegateParentAndOpenChild({
			parentTaskId: "parent",
			message: "work",
			initialTodos: [],
			mode: "code",
		})
		await provider.cancelTask("parent", "parent-instance")
		expect(child.abortTask).not.toHaveBeenCalled()
		expect(provider.getCurrentTask()).toBe(child)
	})

	it("handles an invalid child configuration without corrupting the parent", async () => {
		const provider = makeProvider()
		const parent = task(provider, "parent")
		provider.clineStack = [parent]
		provider.createTask = vi.fn().mockRejectedValue(new Error("missing mode"))
		await expect(
			provider.delegateParentAndOpenChild({
				parentTaskId: "parent",
				message: "work",
				initialTodos: [],
				mode: "",
			}),
		).rejects.toThrow("missing mode")
		expect(provider.getCurrentTaskStack()).toEqual(["parent"])
		expect(vscode.window.showErrorMessage).not.toHaveBeenCalled()
	})
})
