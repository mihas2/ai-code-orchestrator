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
vi.mock("p-wait-for", () => ({ default: vi.fn(() => Promise.resolve()) }))
vi.mock("delay", () => ({ default: vi.fn().mockResolvedValue(undefined) }))
vi.mock("../../../utils/storage", () => ({
	getTaskDirectoryPath: vi.fn((globalStoragePath: string) => Promise.resolve(`${globalStoragePath}/tasks/task`)),
	getSettingsDirectoryPath: vi.fn().mockResolvedValue("/workspace/settings"),
	getGlobalStoragePath: vi.fn().mockReturnValue("/workspace"),
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

const config = { apiProvider: "anthropic", apiModelId: "test-model", apiKey: "key" } as any

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
	provider.getTaskWithId = vi.fn().mockResolvedValue({ historyItem: { id: "task-1", childIds: [] } })
	provider.updateTaskHistory = vi.fn().mockResolvedValue(undefined)
	return provider
}

function task(provider: any, id: string, instanceId: string, lastMessageTs?: number) {
	const value = new Task({ provider, apiConfiguration: config, task: id, startTask: false }) as any
	Object.defineProperty(value, "taskId", { value: id, configurable: true })
	Object.defineProperty(value, "instanceId", { value: instanceId, configurable: true })
	Object.defineProperty(value, "lastMessageTs", { value: lastMessageTs, writable: true, configurable: true })
	Object.defineProperty(value, "isStreaming", { value: true, writable: true, configurable: true })
	Object.defineProperty(value, "isWaitingForFirstChunk", { value: true, writable: true, configurable: true })
	Object.defineProperty(value, "currentRequestAbortController", {
		value: new AbortController(),
		writable: true,
		configurable: true,
	})
	vi.spyOn(value, "abortTask").mockResolvedValue(undefined)
	vi.spyOn(value, "cancelCurrentRequest").mockImplementation(() => {})
	vi.spyOn(value, "resumeTaskFromHistory").mockResolvedValue(undefined)
	return value
}

describe("ClineProvider.cancelTask identity validation (STOP-004A)", () => {
	let consoleLogSpy: any

	beforeEach(() => {
		consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {})
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	it("rejects cancel when taskId is missing", async () => {
		const provider = makeProvider()
		const mockTask = task(provider, "task-1", "instance-1", 123)
		provider.clineStack = [mockTask]

		await provider.cancelTask(undefined, "instance-1", false, "123")

		expect(mockTask.abortTask).not.toHaveBeenCalled()
		expect(consoleLogSpy).toHaveBeenCalledWith(
			expect.stringContaining("[cancelTask] Rejecting cancel - missing taskId or instanceId"),
			expect.objectContaining({
				provided: { taskId: undefined, instanceId: "instance-1", executionId: "123" },
			}),
		)
	})

	it("rejects cancel when instanceId is missing", async () => {
		const provider = makeProvider()
		const mockTask = task(provider, "task-1", "instance-1", 123)
		provider.clineStack = [mockTask]

		await provider.cancelTask("task-1", undefined, false, "123")

		expect(mockTask.abortTask).not.toHaveBeenCalled()
		expect(consoleLogSpy).toHaveBeenCalledWith(
			expect.stringContaining("[cancelTask] Rejecting cancel - missing taskId or instanceId"),
			expect.objectContaining({
				provided: { taskId: "task-1", instanceId: undefined, executionId: "123" },
			}),
		)
	})

	it("rejects cancel when no current task exists", async () => {
		const provider = makeProvider()
		provider.clineStack = []

		await provider.cancelTask("task-1", "instance-1", false, "123")

		expect(consoleLogSpy).toHaveBeenCalledWith(
			expect.stringContaining("[cancelTask] Rejecting cancel - no current task"),
			expect.objectContaining({
				provided: { taskId: "task-1", instanceId: "instance-1", executionId: "123" },
			}),
		)
	})

	it("rejects cancel when taskId does not match current task", async () => {
		const provider = makeProvider()
		const mockTask = task(provider, "task-1", "instance-1", 123)
		provider.clineStack = [mockTask]

		await provider.cancelTask("task-999", "instance-1", false, "123")

		expect(mockTask.abortTask).not.toHaveBeenCalled()
		expect(consoleLogSpy).toHaveBeenCalledWith(
			expect.stringContaining("[cancelTask] Rejecting cancel - task identity mismatch"),
			expect.objectContaining({
				provided: { taskId: "task-999", instanceId: "instance-1", executionId: "123" },
				current: { currentTaskId: "task-1", currentInstanceId: "instance-1", currentExecutionId: "123" },
			}),
		)
	})

	it("rejects cancel when instanceId does not match current task", async () => {
		const provider = makeProvider()
		const mockTask = task(provider, "task-1", "instance-1", 123)
		provider.clineStack = [mockTask]

		await provider.cancelTask("task-1", "instance-999", false, "123")

		expect(mockTask.abortTask).not.toHaveBeenCalled()
		expect(consoleLogSpy).toHaveBeenCalledWith(
			expect.stringContaining("[cancelTask] Rejecting cancel - task identity mismatch"),
			expect.objectContaining({
				provided: { taskId: "task-1", instanceId: "instance-999", executionId: "123" },
				current: { currentTaskId: "task-1", currentInstanceId: "instance-1", currentExecutionId: "123" },
			}),
		)
	})

	it("rejects cancel when executionId does not match (stale request)", async () => {
		const provider = makeProvider()
		const mockTask = task(provider, "task-1", "instance-1", 123)
		provider.clineStack = [mockTask]

		await provider.cancelTask("task-1", "instance-1", false, "999")

		expect(mockTask.abortTask).not.toHaveBeenCalled()
		expect(consoleLogSpy).toHaveBeenCalledWith(
			expect.stringContaining("[cancelTask] Rejecting cancel - executionId mismatch (stale request)"),
			expect.objectContaining({
				provided: { taskId: "task-1", instanceId: "instance-1", executionId: "999" },
				current: { currentTaskId: "task-1", currentInstanceId: "instance-1", currentExecutionId: "123" },
			}),
		)
	})

	it("allows cancel with matching taskId, instanceId, and executionId", async () => {
		const provider = makeProvider()
		const mockTask = task(provider, "task-1", "instance-1", 123)
		provider.clineStack = [mockTask]

		await provider.cancelTask("task-1", "instance-1", false, "123")

		expect(mockTask.abortTask).toHaveBeenCalled()
	})

	it("allows cancel without executionId (kill-path fallback) when taskId/instanceId match", async () => {
		const provider = makeProvider()
		const mockTask = task(provider, "task-1", "instance-1", 123)
		provider.clineStack = [mockTask]

		await provider.cancelTask("task-1", "instance-1", false, undefined)

		expect(mockTask.abortTask).toHaveBeenCalled()
		expect(consoleLogSpy).toHaveBeenCalledWith(
			expect.stringContaining("[cancelTask] Allowing cancel without executionId (kill-path fallback)"),
			expect.objectContaining({
				provided: { taskId: "task-1", instanceId: "instance-1", executionId: undefined },
				current: { currentTaskId: "task-1", currentInstanceId: "instance-1", currentExecutionId: "123" },
			}),
		)
	})

	it("allows cancel when both executionId are undefined", async () => {
		const provider = makeProvider()
		const mockTask = task(provider, "task-1", "instance-1", undefined)
		provider.clineStack = [mockTask]

		await provider.cancelTask("task-1", "instance-1", false, undefined)

		expect(mockTask.abortTask).toHaveBeenCalled()
	})

	it("bypasses all validation when bypassValidation is true", async () => {
		const provider = makeProvider()
		const mockTask = task(provider, "task-1", "instance-1", 123)
		provider.clineStack = [mockTask]

		await provider.cancelTask("task-999", "instance-999", true, "999")

		expect(mockTask.abortTask).toHaveBeenCalled()
		expect(consoleLogSpy).not.toHaveBeenCalledWith(
			expect.stringContaining("[cancelTask] Rejecting cancel"),
			expect.anything(),
		)
	})

	it("rejects cancel before first API request (no active request)", async () => {
		const provider = makeProvider()
		const mockTask = task(provider, "task-1", "instance-1", 123)
		mockTask.isWaitingForFirstChunk = false
		mockTask.currentRequestAbortController = undefined
		provider.clineStack = [mockTask]

		await provider.cancelTask("task-1", "instance-1", false, "123")

		expect(mockTask.abortTask).not.toHaveBeenCalled()
		const logCalls = consoleLogSpy.mock.calls.map((call: any) => call[0])
		expect(
			logCalls.some(
				(log: any) =>
					typeof log === "string" && log.includes("[cancelTask] ignoring cancel before first API request"),
			),
		).toBe(true)
	})

	it("allows cancel when isWaitingForFirstChunk is true (active request)", async () => {
		const provider = makeProvider()
		const mockTask = task(provider, "task-1", "instance-1", 123)
		mockTask.isWaitingForFirstChunk = true
		mockTask.currentRequestAbortController = undefined
		provider.clineStack = [mockTask]

		await provider.cancelTask("task-1", "instance-1", false, "123")

		expect(mockTask.abortTask).toHaveBeenCalled()
	})

	it("allows cancel when currentRequestAbortController exists (active request)", async () => {
		const provider = makeProvider()
		const mockTask = task(provider, "task-1", "instance-1", 123)
		mockTask.isWaitingForFirstChunk = false
		mockTask.currentRequestAbortController = new AbortController()
		provider.clineStack = [mockTask]

		await provider.cancelTask("task-1", "instance-1", false, "123")

		expect(mockTask.abortTask).toHaveBeenCalled()
	})
})
