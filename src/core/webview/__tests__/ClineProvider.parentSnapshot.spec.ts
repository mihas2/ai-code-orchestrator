import * as vscode from "vscode"

import { ContextProxy } from "../../config/ContextProxy"
import { Task } from "../../task/Task"
import { ClineProvider } from "../ClineProvider"
import { AiCodeOrchestratorEventName, type HistoryItem } from "@ai-code-orchestrator/types"

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
	provider.updateGlobalState = vi.fn().mockResolvedValue(undefined)
	provider.updateTaskHistory = vi.fn().mockResolvedValue(undefined)
	provider.getTaskWithId = vi.fn().mockResolvedValue({
		historyItem: {
			id: "parent",
			number: 1,
			ts: Date.now(),
			task: "parent task",
			tokensIn: 0,
			tokensOut: 0,
			totalCost: 0,
			mode: "orchestrator",
			apiConfigName: "parent-profile",
			status: "active",
		},
	})
	provider.getState = vi.fn().mockResolvedValue({
		mode: "orchestrator",
		currentApiConfigName: "parent-profile",
		apiConfiguration: config,
	})
	return provider
}

describe("ClineProvider parent snapshot restoration", () => {
	afterEach(() => {
		vi.clearAllMocks()
	})

	describe("Snapshot capture at delegation", () => {
		it("initializes a missing stack before opening a valid delegated child", async () => {
			const provider = makeProvider()
			const parent = { taskId: "parent", apiConfiguration: { apiModelId: "parent-model" } } as Task
			const child = { taskId: "child", start: vi.fn() } as unknown as Task
			provider.clineStack = undefined
			provider.getCurrentTask = vi.fn(() => parent)
			provider.removeClineFromStack = vi.fn().mockImplementation(async () => {
				provider.clineStack.pop()
			})
			provider.handleModeSwitch = vi.fn()
			provider.createTask = vi.fn().mockImplementation(async () => {
				provider.clineStack.push(child)
				return child
			})

			await expect(
				provider.delegateParentAndOpenChild({
					parentTaskId: "parent",
					message: "child message",
					initialTodos: [],
					mode: "code",
				}),
			).resolves.toBe(child)

			expect(provider.removeClineFromStack).toHaveBeenCalledWith({ skipDelegationRepair: true })
			expect(provider.clineStack).toEqual([child])
			expect(child.start).toHaveBeenCalledOnce()
		})

		it("captures authoritative parent snapshot before child creation", async () => {
			const provider = makeProvider()
			const parent = { taskId: "parent", apiConfiguration: { apiModelId: "parent-model" } } as Task
			provider.getCurrentTask = vi.fn(() => parent)
			provider.removeClineFromStack = vi.fn()
			provider.handleModeSwitch = vi.fn()
			provider.createTask = vi.fn().mockResolvedValue({ taskId: "child", start: vi.fn() })

			await provider.delegateParentAndOpenChild({
				parentTaskId: "parent",
				message: "child message",
				initialTodos: [],
				mode: "code",
			})

			expect(provider.updateTaskHistory).toHaveBeenCalledWith(
				expect.objectContaining({
					parentSnapshot: expect.objectContaining({
						mode: "orchestrator",
						apiConfigName: "parent-profile",
						modelId: "parent-model",
						capturedAt: expect.any(Number),
					}),
				}),
			)
		})

		it("fails closed when parent disposal fails", async () => {
			const provider = makeProvider()
			const parent = { taskId: "parent", apiConfiguration: { apiModelId: "parent-model" } } as Task
			const emitSpy = vi.spyOn(provider, "emit")
			provider.getCurrentTask = vi.fn(() => parent)
			provider.removeClineFromStack = vi.fn().mockRejectedValue(new Error("remove failed"))
			provider.createTask = vi.fn()

			await expect(
				provider.delegateParentAndOpenChild({
					parentTaskId: "parent",
					message: "child message",
					initialTodos: [],
					mode: "code",
				}),
			).rejects.toThrow("Failed to dispose parent task 'parent': remove failed")

			expect(provider.createTask).not.toHaveBeenCalled()
			expect(provider.getCurrentTask()).toBe(parent)
			expect(provider.updateGlobalState).toHaveBeenCalledWith("mode", "orchestrator")
			expect(emitSpy).not.toHaveBeenCalledWith(
				AiCodeOrchestratorEventName.TaskDelegated,
				"parent",
				expect.anything(),
			)
		})

		it("restores stack identity without dropping existing entries when remove partially mutates state", async () => {
			const provider = makeProvider()
			const parent = {
				taskId: "parent",
				instanceId: "parent-instance",
				abort: false,
				abandoned: false,
				apiConfiguration: { apiProvider: "anthropic", apiModelId: "parent-model" },
			} as Task
			const otherTask = { taskId: "other" } as Task
			provider.clineStack = [otherTask, parent]
			provider.getCurrentTask = vi.fn(() => parent)
			provider.getState = vi
				.fn()
				.mockResolvedValueOnce({
					mode: "orchestrator",
					currentApiConfigName: "parent-profile",
					apiConfiguration: parent.apiConfiguration,
				})
				.mockResolvedValue({
					mode: "code",
					currentApiConfigName: "child-profile",
					apiConfiguration: { apiProvider: "anthropic", apiModelId: "child-model" },
				})
			provider.removeClineFromStack = vi.fn().mockImplementation(async () => {
				provider.clineStack.pop()
				parent.abort = true
				parent.abandoned = true
				throw new Error("remove partially mutated")
			})
			provider.activateProviderProfile = vi.fn().mockResolvedValue(undefined)
			provider.createTask = vi.fn()

			await expect(
				provider.delegateParentAndOpenChild({
					parentTaskId: "parent",
					message: "child message",
					initialTodos: [],
					mode: "code",
				}),
			).rejects.toThrow("Failed to dispose parent task 'parent': remove partially mutated")

			// The disposed/partially-mutated parent is not revived, while the prior
			// stack entry remains current and no child/event/history mutation occurs.
			expect(provider.clineStack).toEqual([otherTask])
			expect(provider.createTask).not.toHaveBeenCalled()
			expect(provider.updateTaskHistory).not.toHaveBeenCalled()
			const emitSpy = vi.spyOn(provider, "emit")
			expect(emitSpy).not.toHaveBeenCalledWith(
				AiCodeOrchestratorEventName.TaskDelegated,
				"parent",
				expect.anything(),
			)
			expect(provider.updateGlobalState).toHaveBeenCalledWith("mode", "orchestrator")
			expect(provider.activateProviderProfile).toHaveBeenCalledWith(
				{ name: "parent-profile" },
				expect.objectContaining({ syncGlobalProviderState: true }),
			)
		})

		it("keeps metadata unchanged when removal fails before mutation", async () => {
			const provider = makeProvider()
			const parent = { taskId: "parent", apiConfiguration: { apiModelId: "parent-model" } } as Task
			provider.clineStack = [parent]
			provider.getCurrentTask = vi.fn(() => parent)
			provider.removeClineFromStack = vi.fn().mockRejectedValue(new Error("remove failed before mutation"))
			provider.createTask = vi.fn()

			await expect(
				provider.delegateParentAndOpenChild({
					parentTaskId: "parent",
					message: "child message",
					initialTodos: [],
					mode: "code",
				}),
			).rejects.toThrow("remove failed before mutation")

			expect(provider.clineStack).toEqual([parent])
			expect(provider.createTask).not.toHaveBeenCalled()
			expect(provider.updateTaskHistory).not.toHaveBeenCalled()
		})

		it("blocks child start if snapshot persistence fails", async () => {
			const provider = makeProvider()
			const parent = { taskId: "parent", apiConfiguration: { apiModelId: "parent-model" } } as Task
			provider.getCurrentTask = vi.fn(() => parent)
			provider.removeClineFromStack = vi.fn()
			provider.handleModeSwitch = vi.fn()
			const mockChild = { taskId: "child", start: vi.fn(), abortTask: vi.fn() }
			provider.createTask = vi.fn().mockResolvedValue(mockChild)
			provider.updateTaskHistory = vi.fn().mockRejectedValue(new Error("Persistence failed"))

			await expect(
				provider.delegateParentAndOpenChild({
					parentTaskId: "parent",
					message: "child message",
					initialTodos: [],
					mode: "code",
				}),
			).rejects.toThrow("Persistence failed")

			// Child must not start
			expect(mockChild.start).not.toHaveBeenCalled()
			// Child must be aborted
			expect(mockChild.abortTask).toHaveBeenCalledWith(true)
		})
	})

	describe("Authoritative snapshot restoration", () => {
		it("restores exact parent mode/profile from snapshot overriding stale global state", async () => {
			const provider = makeProvider()
			provider.providerSettingsManager = {
				listConfig: vi.fn().mockResolvedValue([{ name: "snapshot-profile" }]),
				getProfile: vi.fn().mockResolvedValue({ name: "snapshot-profile", ...config }),
			} as any
			provider.activateProviderProfile = vi.fn()
			provider.createTaskWithHistoryItem = vi.fn().mockResolvedValue({
				overwriteClineMessages: vi.fn(),
				overwriteApiConversationHistory: vi.fn(),
				resumeAfterDelegation: vi.fn(),
			})

			const historyWithSnapshot: HistoryItem = {
				id: "parent",
				number: 1,
				ts: Date.now(),
				task: "parent task",
				tokensIn: 0,
				tokensOut: 0,
				totalCost: 0,
				mode: "stale-mode",
				apiConfigName: "stale-profile",
				status: "delegated",
				parentSnapshot: {
					mode: "orchestrator",
					apiConfigName: "snapshot-profile",
					modelId: "snapshot-model",
					capturedAt: Date.now(),
				},
			}

			provider.getTaskWithId = vi.fn().mockResolvedValue({ historyItem: historyWithSnapshot })

			await provider.reopenParentFromDelegation({
				parentTaskId: "parent",
				childTaskId: "child",
				completionResultSummary: "Done",
			})

			// Should restore mode from snapshot, not history
			expect(provider.updateGlobalState).toHaveBeenCalledWith("mode", "orchestrator")
			// Should activate profile from snapshot, not history
			expect(provider.activateProviderProfile).toHaveBeenCalledWith(
				{ name: "snapshot-profile" },
				expect.objectContaining({ syncGlobalProviderState: false, persistTaskHistory: false }),
			)
		})

		it("falls back to legacy history fields when snapshot is missing", async () => {
			const provider = makeProvider()
			provider.providerSettingsManager = {
				listConfig: vi.fn().mockResolvedValue([{ name: "history-profile" }]),
				getProfile: vi.fn(),
			} as any
			provider.createTaskWithHistoryItem = vi.fn().mockResolvedValue({
				overwriteClineMessages: vi.fn(),
				overwriteApiConversationHistory: vi.fn(),
				resumeAfterDelegation: vi.fn(),
			})

			const historyWithoutSnapshot: HistoryItem = {
				id: "parent",
				number: 1,
				ts: Date.now(),
				task: "parent task",
				tokensIn: 0,
				tokensOut: 0,
				totalCost: 0,
				mode: "architect",
				apiConfigName: "history-profile",
				status: "delegated",
				// No parentSnapshot
			}

			provider.getTaskWithId = vi.fn().mockResolvedValue({ historyItem: historyWithoutSnapshot })

			await provider.reopenParentFromDelegation({
				parentTaskId: "parent",
				childTaskId: "child",
				completionResultSummary: "Done",
			})

			// Should use createTaskWithHistoryItem which applies history fields
			expect(provider.createTaskWithHistoryItem).toHaveBeenCalled()
		})

		it("rejects strict restore when the snapshot profile is deleted and emits no success events", async () => {
			const provider = makeProvider()
			const emitSpy = vi.spyOn(provider, "emit")
			provider.getTaskWithId = vi.fn().mockResolvedValue({
				historyItem: {
					id: "parent",
					status: "delegated",
					awaitingChildId: "child",
					parentSnapshot: {
						mode: "orchestrator",
						apiConfigName: "deleted-profile",
						modelId: "snapshot-model",
						capturedAt: Date.now(),
					},
				},
			})
			provider.providerSettingsManager = { listConfig: vi.fn().mockResolvedValue([]), getProfile: vi.fn() } as any
			await expect(
				provider.reopenParentFromDelegation({
					parentTaskId: "parent",
					childTaskId: "child",
					completionResultSummary: "Done",
				}),
			).rejects.toThrow("no longer exists")
			expect(emitSpy).not.toHaveBeenCalledWith(
				AiCodeOrchestratorEventName.TaskDelegationCompleted,
				expect.anything(),
				expect.anything(),
				expect.anything(),
			)
		})

		it("does not emit TaskDelegationResumed until successful parent restoration", async () => {
			const provider = makeProvider()
			const emitSpy = vi.spyOn(provider, "emit")
			provider.providerSettingsManager = {
				listConfig: vi.fn().mockResolvedValue([]),
				getProfile: vi.fn(),
			} as any
			provider.createTaskWithHistoryItem = vi.fn().mockRejectedValue(new Error("Restoration failed"))

			await expect(
				provider.reopenParentFromDelegation({
					parentTaskId: "parent",
					childTaskId: "child",
					completionResultSummary: "Done",
				}),
			).rejects.toThrow("Restoration failed")

			// TaskDelegationResumed should not be emitted
			expect(emitSpy).not.toHaveBeenCalledWith("TaskDelegationResumed", expect.anything(), expect.anything())
		})
	})

	describe("Concurrent resume", () => {
		it("coalesces deferred completion signals for the same awaiting child", async () => {
			const provider = makeProvider()
			let release!: () => void
			const deferred = new Promise<void>((resolve) => (release = resolve))
			const resumeAfterDelegation = vi.fn().mockImplementation(() => deferred)
			provider.getTaskWithId = vi.fn().mockResolvedValue({
				historyItem: { id: "parent", status: "delegated", awaitingChildId: "child", childIds: ["child"] },
			})
			provider.createTaskWithHistoryItem = vi.fn().mockResolvedValue({
				overwriteClineMessages: vi.fn(),
				overwriteApiConversationHistory: vi.fn(),
				resumeAfterDelegation,
			})
			const params = { parentTaskId: "parent", childTaskId: "child", completionResultSummary: "Done" }
			const first = provider.reopenParentFromDelegation(params)
			const second = provider.reopenParentFromDelegation(params)
			await vi.waitFor(() => expect(resumeAfterDelegation).toHaveBeenCalledTimes(1))
			expect(first).toBe(second)
			release()
			await Promise.all([first, second])
			expect(provider.createTaskWithHistoryItem).toHaveBeenCalledTimes(1)
		})
		it.each([
			["create", new Error("create failed")],
			["resume", new Error("resume failed")],
		] as const)(
			"retries only the pending %s phase after the durable parent commit",
			async (failurePhase, failure) => {
				const provider = makeProvider()
				const emitSpy = vi.spyOn(provider, "emit")
				const parentHistory: any = {
					id: "parent",
					status: "delegated",
					delegatedToId: "child",
					awaitingChildId: "child",
					childIds: ["child"],
				}
				provider.getTaskWithId = vi.fn().mockImplementation(async (id: string) => ({
					historyItem: id === "parent" ? { ...parentHistory } : { id, status: "active" },
				}))
				const savedMarkers: any[] = []
				provider.updateTaskHistory = vi.fn().mockImplementation(async (item: any) => {
					if (item.id === "parent") {
						Object.assign(parentHistory, item)
						savedMarkers.push({ ...item })
					}
				})
				const resume = vi.fn()
				if (failurePhase === "resume") resume.mockRejectedValueOnce(failure).mockResolvedValueOnce(undefined)
				const parentInstance = {
					overwriteClineMessages: vi.fn(),
					overwriteApiConversationHistory: vi.fn(),
					resumeAfterDelegation: resume,
				}
				provider.createTaskWithHistoryItem = vi.fn()
				if (failurePhase === "create") {
					provider.createTaskWithHistoryItem
						.mockRejectedValueOnce(failure)
						.mockResolvedValueOnce(parentInstance)
				} else {
					provider.createTaskWithHistoryItem.mockResolvedValue(parentInstance)
				}
				const params = { parentTaskId: "parent", childTaskId: "child", completionResultSummary: "Done" }

				await expect(provider.reopenParentFromDelegation(params)).rejects.toThrow(failure.message)
				expect(parentHistory).toMatchObject({ completedByChildId: "child", delegationResumePhase: "pending" })
				expect(emitSpy).not.toHaveBeenCalledWith(
					AiCodeOrchestratorEventName.TaskDelegationCompleted,
					expect.anything(),
					expect.anything(),
					expect.anything(),
				)
				await expect(provider.reopenParentFromDelegation(params)).resolves.toBeUndefined()
				expect(parentHistory.delegationResumePhase).toBe("resumed")
				expect(provider.createTaskWithHistoryItem).toHaveBeenCalledTimes(failurePhase === "create" ? 2 : 1)
				expect(resume).toHaveBeenCalledTimes(1)
				expect(savedMarkers.map((item) => item.delegationResumePhase)).toEqual(["pending", "resumed"])

				await provider.reopenParentFromDelegation(params)
				expect(provider.createTaskWithHistoryItem).toHaveBeenCalledTimes(failurePhase === "create" ? 2 : 1)
				expect(resume).toHaveBeenCalledTimes(1)
			},
		)

		it("is sequentially idempotent after the persisted parent markers are cleared", async () => {
			const provider = makeProvider()
			const emitSpy = vi.spyOn(provider, "emit")
			const parentHistory: any = {
				id: "parent",
				status: "delegated",
				delegatedToId: "child",
				awaitingChildId: "child",
				childIds: ["old-child", "child"],
			}
			provider.getTaskWithId = vi.fn().mockImplementation(async (id: string) => ({
				historyItem: id === "parent" ? parentHistory : { id, status: "active" },
			}))
			provider.updateTaskHistory = vi.fn().mockImplementation(async (item: any) => {
				if (item.id === "parent") Object.assign(parentHistory, item)
			})
			const resume = vi.fn()
			provider.createTaskWithHistoryItem = vi.fn().mockResolvedValue({
				overwriteClineMessages: vi.fn(),
				overwriteApiConversationHistory: vi.fn(),
				resumeAfterDelegation: resume,
			})

			await provider.reopenParentFromDelegation({
				parentTaskId: "parent",
				childTaskId: "child",
				completionResultSummary: "Done",
			})
			await provider.reopenParentFromDelegation({
				parentTaskId: "parent",
				childTaskId: "child",
				completionResultSummary: "Done",
			})

			expect(provider.createTaskWithHistoryItem).toHaveBeenCalledTimes(1)
			expect(resume).toHaveBeenCalledTimes(1)
			expect(provider.updateTaskHistory).toHaveBeenCalledTimes(3)
			expect(emitSpy).toHaveBeenCalledTimes(2)
			expect(parentHistory).toMatchObject({
				status: "active",
				awaitingChildId: undefined,
				delegatedToId: undefined,
			})
			expect(parentHistory.childIds).toEqual(["old-child", "child"])
		})

		it("rejects a different child while the parent resume is in flight", async () => {
			const provider = makeProvider()
			let release!: () => void
			const pending = new Promise<void>((resolve) => (release = resolve))
			provider.getTaskWithId = vi.fn().mockResolvedValue({
				historyItem: {
					id: "parent",
					status: "delegated",
					delegatedToId: "child-a",
					awaitingChildId: "child-a",
				},
			})
			provider.createTaskWithHistoryItem = vi.fn().mockResolvedValue({
				overwriteClineMessages: vi.fn(),
				overwriteApiConversationHistory: vi.fn(),
				resumeAfterDelegation: vi.fn(() => pending),
			})
			const first = provider.reopenParentFromDelegation({
				parentTaskId: "parent",
				childTaskId: "child-a",
				completionResultSummary: "A",
			})
			await vi.waitFor(() => expect(provider.createTaskWithHistoryItem).toHaveBeenCalledTimes(1))
			await expect(
				provider.reopenParentFromDelegation({
					parentTaskId: "parent",
					childTaskId: "child-b",
					completionResultSummary: "B",
				}),
			).rejects.toThrow("already being resumed for child child-a")
			release()
			await first
		})
	})

	describe("Nested delegation isolation", () => {
		it("preserves independent parent snapshots across nested delegations", async () => {
			const provider = makeProvider()
			const updateTaskHistorySpy = vi.spyOn(provider, "updateTaskHistory")

			// Root → Worker1
			provider.getCurrentTask = vi.fn(() => ({ taskId: "root", apiConfiguration: { apiModelId: "root-model" } }))
			provider.getState = vi.fn().mockResolvedValue({
				mode: "orchestrator",
				currentApiConfigName: "root-profile",
				apiConfiguration: config,
			})
			provider.removeClineFromStack = vi.fn()
			provider.handleModeSwitch = vi.fn()
			provider.createTask = vi.fn().mockResolvedValue({ taskId: "worker1", start: vi.fn() })

			await provider.delegateParentAndOpenChild({
				parentTaskId: "root",
				message: "worker1 message",
				initialTodos: [],
				mode: "code",
			})

			const rootSnapshot = (updateTaskHistorySpy.mock.calls[0][0] as HistoryItem).parentSnapshot
			expect(rootSnapshot).toMatchObject({
				mode: "orchestrator",
				apiConfigName: "root-profile",
				modelId: "root-model",
			})

			// Worker1 → Worker2 (nested)
			updateTaskHistorySpy.mockClear()
			provider.getCurrentTask = vi.fn(() => ({
				taskId: "worker1",
				apiConfiguration: { apiModelId: "worker1-model" },
			}))
			provider.getState = vi.fn().mockResolvedValue({
				mode: "code",
				currentApiConfigName: "worker1-profile",
				apiConfiguration: config,
			})
			provider.getTaskWithId = vi.fn().mockResolvedValue({
				historyItem: { id: "worker1", status: "active" },
			})
			provider.createTask = vi.fn().mockResolvedValue({ taskId: "worker2", start: vi.fn() })

			await provider.delegateParentAndOpenChild({
				parentTaskId: "worker1",
				message: "worker2 message",
				initialTodos: [],
				mode: "debug",
			})

			const worker1Snapshot = (updateTaskHistorySpy.mock.calls[0][0] as HistoryItem).parentSnapshot
			expect(worker1Snapshot).toMatchObject({
				mode: "code",
				apiConfigName: "worker1-profile",
				modelId: "worker1-model",
			})

			// Snapshots should be independent
			expect(worker1Snapshot).not.toEqual(rootSnapshot)
		})
	})

	describe("Stale global state scenarios", () => {
		it("correctly restores parent when global mode changed during child execution", async () => {
			const provider = makeProvider()
			provider.providerSettingsManager = {
				listConfig: vi.fn().mockResolvedValue([{ name: "original-profile" }]),
				getProfile: vi.fn().mockResolvedValue({ name: "original-profile", ...config }),
			} as any
			provider.activateProviderProfile = vi.fn()
			provider.createTaskWithHistoryItem = vi.fn().mockResolvedValue({
				overwriteClineMessages: vi.fn(),
				overwriteApiConversationHistory: vi.fn(),
				resumeAfterDelegation: vi.fn(),
			})

			// Global state changed to different mode during child execution
			provider.getState = vi.fn().mockResolvedValue({
				mode: "code", // Changed from orchestrator
				currentApiConfigName: "different-profile",
				apiConfiguration: config,
			})

			const historyWithSnapshot: HistoryItem = {
				id: "parent",
				number: 1,
				ts: Date.now(),
				task: "parent task",
				tokensIn: 0,
				tokensOut: 0,
				totalCost: 0,
				mode: "orchestrator",
				apiConfigName: "original-profile",
				status: "delegated",
				parentSnapshot: {
					mode: "orchestrator",
					apiConfigName: "original-profile",
					modelId: "original-model",
					capturedAt: Date.now(),
				},
			}

			provider.getTaskWithId = vi.fn().mockResolvedValue({ historyItem: historyWithSnapshot })

			await provider.reopenParentFromDelegation({
				parentTaskId: "parent",
				childTaskId: "child",
				completionResultSummary: "Done",
			})

			// Should restore original mode/profile from snapshot, not current global state
			expect(provider.updateGlobalState).toHaveBeenCalledWith("mode", "orchestrator")
			expect(provider.activateProviderProfile).toHaveBeenCalledWith(
				{ name: "original-profile" },
				expect.objectContaining({ syncGlobalProviderState: false, persistTaskHistory: false }),
			)
		})
	})
})
