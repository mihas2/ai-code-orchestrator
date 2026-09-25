// pnpm --filter ai-code-orchestrator test core/webview/__tests__/ClineProvider.clearTask.drain.spec.ts

// TODO: непокрытые сценарии (зафиксированы аудитом, не блокируют текущий фикс):
// - rehydrate из onTaskAborted во время дренажа (abortReason === "streaming_failed")
// - несколько re-entrant push и остаток стека после лимита `length + 1`
// - rejection из abortTask / cleanup / getTaskWithId / updateTaskHistory
// - сброс clearTaskInFlight после rejection и повторный вызов после ошибки
// - failure path в plusButtonClicked и гарантии последующих UI actions
// - порядок updateTaskHistory при 3-уровневом delegation-стеке
// - фактический state snapshot и отсутствие промежуточного рендера родителя

import { beforeEach, describe, expect, it, vi } from "vitest"

import { ClineProvider } from "../ClineProvider"
import { Task } from "../../task/Task"
import type { ProviderSettings } from "@ai-code-orchestrator/types"

// Mock dependencies (mirrors ClineProvider.flicker-free-cancel.spec.ts setup style).
vi.mock("vscode", () => {
	const mockDisposable = { dispose: vi.fn() }
	return {
		workspace: {
			getConfiguration: vi.fn(() => ({
				get: vi.fn().mockReturnValue([]),
				update: vi.fn().mockResolvedValue(undefined),
			})),
			workspaceFolders: [],
			onDidChangeConfiguration: vi.fn(() => mockDisposable),
		},
		env: {
			uriScheme: "vscode",
			language: "en",
		},
		EventEmitter: vi.fn().mockImplementation(() => ({
			event: vi.fn(),
			fire: vi.fn(),
		})),
		Disposable: {
			from: vi.fn(),
		},
		window: {
			showErrorMessage: vi.fn(),
			createTextEditorDecorationType: vi.fn().mockReturnValue({
				dispose: vi.fn(),
			}),
			onDidChangeActiveTextEditor: vi.fn(() => mockDisposable),
		},
		Uri: {
			file: vi.fn().mockReturnValue({ toString: () => "file://test" }),
		},
	}
})

vi.mock("../../task/Task")
vi.mock("../../config/ContextProxy")
vi.mock("../../../services/mcp/McpServerManager", () => ({
	McpServerManager: {
		getInstance: vi.fn().mockResolvedValue({
			registerClient: vi.fn(),
		}),
		unregisterProvider: vi.fn(),
	},
}))
vi.mock("../../../integrations/workspace/WorkspaceTracker")
vi.mock("../../config/ProviderSettingsManager")
vi.mock("../../config/CustomModesManager")
vi.mock("../../../utils/path", () => ({
	getWorkspacePath: vi.fn().mockReturnValue("/test/workspace"),
}))

vi.mock("../../../shared/embeddingModels", () => ({
	EMBEDDING_MODEL_PROFILES: [],
}))

describe("ClineProvider.clearTask drains the whole stack", () => {
	let provider: ClineProvider
	let mockContext: any
	let mockOutputChannel: any

	const mockApiConfig: ProviderSettings = {
		apiProvider: "anthropic",
		apiKey: "test-key",
	} as ProviderSettings

	// Records the order in which abortTask() is invoked across all mock tasks.
	let abortOrder: string[]

	function makeMockTask(taskId: string, opts?: { isPaused?: boolean }): any {
		return {
			taskId,
			instanceId: `instance-${taskId}`,
			isPaused: opts?.isPaused ?? false,
			emit: vi.fn(),
			abortTask: vi.fn().mockImplementation(async () => {
				abortOrder.push(taskId)
			}),
			abandoned: false,
			dispose: vi.fn(),
			on: vi.fn(),
			off: vi.fn(),
		}
	}

	beforeEach(() => {
		vi.clearAllMocks()
		abortOrder = []

		mockContext = {
			globalState: {
				get: vi.fn().mockReturnValue(undefined),
				update: vi.fn().mockResolvedValue(undefined),
				keys: vi.fn().mockReturnValue([]),
			},
			globalStorageUri: { fsPath: "/test/storage" },
			secrets: {
				get: vi.fn().mockResolvedValue(undefined),
				store: vi.fn().mockResolvedValue(undefined),
				delete: vi.fn().mockResolvedValue(undefined),
			},
			workspaceState: {
				get: vi.fn().mockReturnValue(undefined),
				update: vi.fn().mockResolvedValue(undefined),
				keys: vi.fn().mockReturnValue([]),
			},
			extensionUri: { fsPath: "/test/extension" },
		}

		mockOutputChannel = {
			appendLine: vi.fn(),
			dispose: vi.fn(),
		}

		const mockContextProxy = {
			getValues: vi.fn().mockReturnValue({}),
			getValue: vi.fn().mockReturnValue(undefined),
			setValue: vi.fn().mockResolvedValue(undefined),
			getProviderSettings: vi.fn().mockReturnValue(mockApiConfig),
			extensionUri: mockContext.extensionUri,
			globalStorageUri: mockContext.globalStorageUri,
		}

		provider = new ClineProvider(mockContext, mockOutputChannel, "sidebar", mockContextProxy as any)

		provider.getState = vi.fn().mockResolvedValue({
			apiConfiguration: mockApiConfig,
			mode: "code",
		})

		provider.postStateToWebview = vi.fn().mockResolvedValue(undefined)
		provider.postStateToWebviewWithoutTaskHistory = vi.fn().mockResolvedValue(undefined)
		;(provider as any).updateGlobalState = vi.fn().mockResolvedValue(undefined)
		provider.activateProviderProfile = vi.fn().mockResolvedValue(undefined)
		provider.performPreparationTasks = vi.fn().mockResolvedValue(undefined)
		provider.getTaskWithId = vi.fn().mockImplementation((id) =>
			Promise.resolve({
				historyItem: {
					id,
					number: 1,
					ts: Date.now(),
					task: "test task",
					tokensIn: 100,
					tokensOut: 200,
					totalCost: 0.001,
					workspace: "/test/workspace",
				},
			}),
		)
	})

	it("one call drains a multi-level stack in LIFO order", async () => {
		const root = makeMockTask("root")
		const child = makeMockTask("child")
		const grandchild = makeMockTask("grandchild")

		;(provider as any).clineStack = [root, child, grandchild]

		await provider.clearTask()

		expect(provider.getTaskStackSize()).toBe(0)
		expect(root.abortTask).toHaveBeenCalledTimes(1)
		expect(child.abortTask).toHaveBeenCalledTimes(1)
		expect(grandchild.abortTask).toHaveBeenCalledTimes(1)
		expect(abortOrder).toEqual(["grandchild", "child", "root"])
	})

	it("is idempotent under concurrent calls and a no-op after completion", async () => {
		const root = makeMockTask("root")
		const child = makeMockTask("child")
		const grandchild = makeMockTask("grandchild")

		;(provider as any).clineStack = [root, child, grandchild]

		await Promise.all([provider.clearTask(), provider.clearTask(), provider.clearTask()])

		expect(provider.getTaskStackSize()).toBe(0)
		expect(root.abortTask).toHaveBeenCalledTimes(1)
		expect(child.abortTask).toHaveBeenCalledTimes(1)
		expect(grandchild.abortTask).toHaveBeenCalledTimes(1)
		expect(abortOrder).toEqual(["grandchild", "child", "root"])

		// A subsequent call after completion must be a no-op: no new aborts, no throws.
		await expect(provider.clearTask()).resolves.toBeUndefined()
		expect(root.abortTask).toHaveBeenCalledTimes(1)
		expect(child.abortTask).toHaveBeenCalledTimes(1)
		expect(grandchild.abortTask).toHaveBeenCalledTimes(1)
	})

	it("correctly stops paused and awaiting-ask tasks, cleaning up all listeners", async () => {
		const parent = makeMockTask("parent", { isPaused: true })
		const child = makeMockTask("child")

		;(provider as any).clineStack = [parent, child]

		const parentCleanup = [vi.fn(), vi.fn()]
		const childCleanup = [vi.fn()]
		;(provider as any).taskEventListeners = new WeakMap()
		;(provider as any).taskEventListeners.set(parent, parentCleanup)
		;(provider as any).taskEventListeners.set(child, childCleanup)

		await provider.clearTask()

		expect(provider.getTaskStackSize()).toBe(0)
		expect(parent.abortTask).toHaveBeenCalledWith(true)
		expect(child.abortTask).toHaveBeenCalledWith(true)

		for (const fn of parentCleanup) {
			expect(fn).toHaveBeenCalledTimes(1)
		}
		for (const fn of childCleanup) {
			expect(fn).toHaveBeenCalledTimes(1)
		}

		// No dangling listener references remain for either removed task.
		expect((provider as any).taskEventListeners.get(parent)).toBeUndefined()
		expect((provider as any).taskEventListeners.get(child)).toBeUndefined()
	})
})
