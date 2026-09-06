import { describe, expect, it, vi } from "vitest"

import { ClineProvider } from "../ClineProvider"
import { RunSlashCommandTool } from "../../tools/RunSlashCommandTool"
import { SwitchModeTool } from "../../tools/SwitchModeTool"
import { getCommand } from "../../../services/command/commands"

vi.mock("../../../services/command/commands", () => ({
	getCommand: vi.fn(),
	getCommandNames: vi.fn().mockResolvedValue([]),
}))

function makeActivationProvider() {
	const provider = Object.create(ClineProvider.prototype) as any
	const taskProfile = {
		name: "task-profile",
		id: "task-profile-id",
		apiProvider: "anthropic",
		apiModelId: "task-model",
	}
	provider.providerSettingsManager = {
		activateProfile: vi.fn().mockResolvedValue(taskProfile),
		getProfile: vi.fn().mockResolvedValue(taskProfile),
		listConfig: vi.fn().mockResolvedValue([]),
		setModeConfig: vi.fn(),
	}
	provider.contextProxy = {
		getValue: vi.fn(),
		setValue: vi.fn(),
		setProviderSettings: vi.fn(),
	}
	provider.getState = vi.fn().mockResolvedValue({ mode: "code" })
	provider.updateTaskApiHandlerIfNeeded = vi.fn()
	provider.persistStickyProviderProfileToCurrentTask = vi.fn()
	provider.postStateToWebview = vi.fn()
	provider.emit = vi.fn()
	return provider
}

describe("ClineProvider provider profile isolation", () => {
	it("activateProviderProfile is runtime-safe by default", async () => {
		const provider = makeActivationProvider()

		await provider.activateProviderProfile({ name: "task-profile" })

		expect(provider.providerSettingsManager.getProfile).toHaveBeenCalledWith({ name: "task-profile" })
		expect(provider.providerSettingsManager.activateProfile).not.toHaveBeenCalled()
		expect(provider.contextProxy.setProviderSettings).not.toHaveBeenCalled()
		expect(provider.contextProxy.setValue).not.toHaveBeenCalled()
		expect(provider.providerSettingsManager.setModeConfig).not.toHaveBeenCalled()
		expect(provider.updateTaskApiHandlerIfNeeded).toHaveBeenCalledWith(
			expect.objectContaining({ apiModelId: "task-model" }),
			{ forceRebuild: true },
		)
	})

	it("activateProviderProfile persists an explicit Settings activation", async () => {
		const provider = makeActivationProvider()

		await provider.activateProviderProfile({ name: "task-profile" }, { syncGlobalProviderState: true })

		expect(provider.providerSettingsManager.activateProfile).toHaveBeenCalledWith({ name: "task-profile" })
		expect(provider.contextProxy.setProviderSettings).toHaveBeenCalledWith(
			expect.objectContaining({ apiModelId: "task-model" }),
		)
		expect(provider.contextProxy.setValue).toHaveBeenCalledWith("currentApiConfigName", "task-profile")
		expect(provider.providerSettingsManager.setModeConfig).toHaveBeenCalledWith("code", "task-profile-id")
	})

	it("handleModeSwitch applies its profile without mutating provider Settings", async () => {
		const provider = makeActivationProvider()
		provider.context = { workspaceState: { get: vi.fn(() => false) } }
		provider.clineStack = []
		provider.updateGlobalState = vi.fn()
		provider.getGlobalState = vi.fn().mockReturnValue(undefined)
		provider.providerSettingsManager.getModeConfigId = vi.fn().mockResolvedValue("task-profile-id")
		provider.providerSettingsManager.listConfig = vi
			.fn()
			.mockResolvedValue([{ name: "task-profile", id: "task-profile-id" }])

		await provider.handleModeSwitch("code")

		expect(provider.contextProxy.setProviderSettings).not.toHaveBeenCalled()
		expect(provider.contextProxy.setValue).not.toHaveBeenCalledWith("currentApiConfigName", expect.anything())
		expect(provider.providerSettingsManager.setModeConfig).not.toHaveBeenCalled()
		expect(provider.updateTaskApiHandlerIfNeeded).toHaveBeenCalled()
	})

	it("switchRuntimeMode updates only task state and does not persist mode configuration", async () => {
		const provider = makeActivationProvider()
		const task = {
			taskId: "task-id",
			_taskMode: "code",
			taskHistory: [],
			emit: vi.fn(),
		}
		provider.taskHistoryStore = { get: vi.fn().mockReturnValue({ id: "task-id", mode: "code" }) }
		provider.updateTaskHistory = vi.fn().mockResolvedValue(undefined)
		provider.log = vi.fn()

		await provider.switchRuntimeMode(task, "architect")

		expect(task._taskMode).toBe("architect")
		expect(provider.updateTaskHistory).toHaveBeenCalledWith({ id: "task-id", mode: "architect" })
		expect(provider.providerSettingsManager.setModeConfig).not.toHaveBeenCalled()
	})

	it("setDefaultMode updates global mode and persists mode configuration", async () => {
		const provider = makeActivationProvider()
		provider.clineStack = []
		provider.updateGlobalState = vi.fn().mockResolvedValue(undefined)
		provider.getGlobalState = vi.fn().mockReturnValue(undefined)
		provider.emit = vi.fn()
		provider.context = { workspaceState: { get: vi.fn(() => false) } }
		provider.getGlobalState = vi.fn((key: string) => (key === "currentApiConfigName" ? "task-profile" : undefined))
		provider.providerSettingsManager.getModeConfigId = vi.fn().mockResolvedValue(undefined)
		provider.providerSettingsManager.listConfig = vi
			.fn()
			.mockResolvedValue([{ name: "task-profile", id: "task-profile-id" }])

		await provider.setDefaultMode("architect")

		expect(provider.updateGlobalState).toHaveBeenCalledWith("mode", "architect")
		expect(provider.providerSettingsManager.setModeConfig).toHaveBeenCalledWith("architect", "task-profile-id")
	})

	it("Settings receives profile apiConfiguration, not task apiConfiguration, when a task is open", async () => {
		const provider = Object.create(ClineProvider.prototype) as any
		provider.taskHistoryStore = { initialized: Promise.resolve(), get: vi.fn(), getAll: vi.fn(() => []) }
		provider.contextProxy = { getValue: vi.fn().mockResolvedValue(undefined) }
		provider.getGlobalState = vi.fn().mockReturnValue(undefined)
		provider.getState = vi.fn().mockResolvedValue({
			apiConfiguration: { apiProvider: "anthropic", apiModelId: "profile-model" },
		})
		provider.getCurrentTask = vi.fn().mockReturnValue({
			taskId: "task-id",
			instanceId: "instance-id",
			apiConfiguration: { apiProvider: "anthropic", apiModelId: "task-model" },
			clineMessages: [],
			todoList: [],
		})
		provider.mergeAllowedCommands = vi.fn(() => [])
		provider.mergeDeniedCommands = vi.fn(() => [])
		provider.currentWorkspacePath = "/workspace"
		provider.context = { extension: { packageJSON: { version: "1" } } }
		provider.latestAnnouncementId = "latest"

		const state = await provider.getStateToPostToWebview({ includeTaskHistory: false })

		expect(state.apiConfiguration).toEqual({ apiProvider: "anthropic", apiModelId: "profile-model" })
	})
	describe("runtime paths", () => {
		it("SwitchModeTool updates runtime mode without changing the Settings mode", async () => {
			const provider = makeActivationProvider()
			const task = {
				taskId: "task-id",
				_taskMode: "code",
				taskHistory: [],
				emit: vi.fn(),
				consecutiveMistakeCount: 0,
				didToolFailInCurrentTurn: false,
				recordToolError: vi.fn(),
				providerRef: { deref: vi.fn(() => provider) },
			}
			provider.getState = vi.fn().mockResolvedValue({ mode: "code", customModes: [] })
			provider.switchRuntimeMode = vi.fn(async (runtimeTask: any, mode: string) => {
				runtimeTask._taskMode = mode
			})

			await new SwitchModeTool().execute({ mode_slug: "architect", reason: "focus" }, task as any, {
				askApproval: vi.fn().mockResolvedValue(true),
				handleError: vi.fn(),
				pushToolResult: vi.fn(),
			})

			expect(task._taskMode).toBe("architect")
			expect((await provider.getState()).mode).toBe("code")
			expect(provider.contextProxy.setValue).not.toHaveBeenCalledWith("mode", expect.anything())
			expect(provider.providerSettingsManager.setModeConfig).not.toHaveBeenCalled()
		})

		it("RunSlashCommandTool mode switches update runtime without persisting Settings", async () => {
			const provider = makeActivationProvider()
			provider.getState = vi.fn().mockResolvedValue({
				mode: "code",
				customModes: [],
				experiments: { runSlashCommand: true },
			})
			provider.switchRuntimeMode = vi.fn(async (task: any, mode: string) => (task._taskMode = mode))
			const task = {
				cwd: "/workspace",
				_taskMode: "code",
				providerRef: { deref: vi.fn(() => provider) },
				consecutiveMistakeCount: 0,
				recordToolError: vi.fn(),
			}
			vi.mocked(getCommand).mockResolvedValue({
				name: "debug-app",
				content: "Debug it",
				source: "project",
				filePath: "/workspace/debug-app.md",
				mode: "debug",
			})

			await new RunSlashCommandTool().execute({ command: "debug-app" }, task as any, {
				askApproval: vi.fn().mockResolvedValue(true),
				handleError: vi.fn(),
				pushToolResult: vi.fn(),
			})

			expect(task._taskMode).toBe("debug")
			expect(provider.switchRuntimeMode).toHaveBeenCalledWith(task, "debug")
			expect(provider.contextProxy.setProviderSettings).not.toHaveBeenCalled()
			expect(provider.providerSettingsManager.setModeConfig).not.toHaveBeenCalled()
		})

		it("sequential runtime switches preserve the original Settings defaults", async () => {
			const provider = makeActivationProvider()
			const task = { taskId: "task-id", _taskMode: "code", taskHistory: [], emit: vi.fn() }
			provider.taskHistoryStore = { get: vi.fn().mockReturnValue(undefined) }
			provider.updateTaskHistory = vi.fn().mockResolvedValue(undefined)
			provider.log = vi.fn()

			await provider.switchRuntimeMode(task, "architect")
			await provider.switchRuntimeMode(task, "debug")
			await provider.switchRuntimeMode(task, "code")

			expect(task._taskMode).toBe("code")
			expect(provider.providerSettingsManager.setModeConfig).not.toHaveBeenCalled()
			expect(provider.contextProxy.setProviderSettings).not.toHaveBeenCalled()
		})

		it("activateProviderProfile with sync=false changes only the task-facing provider", async () => {
			const provider = makeActivationProvider()

			await provider.activateProviderProfile({ name: "task-profile" }, { syncGlobalProviderState: false })

			expect(provider.providerSettingsManager.getProfile).toHaveBeenCalled()
			expect(provider.providerSettingsManager.activateProfile).not.toHaveBeenCalled()
			expect(provider.contextProxy.setProviderSettings).not.toHaveBeenCalled()
			expect(provider.contextProxy.setValue).not.toHaveBeenCalled()
			expect(provider.providerSettingsManager.setModeConfig).not.toHaveBeenCalled()
		})
	})

	describe("Settings paths and synchronization", () => {
		it("setDefaultMode updates Settings and synchronizes the active runtime mode", async () => {
			const provider = makeActivationProvider()
			const task = { taskId: "task-id", _taskMode: "code", taskHistory: [], emit: vi.fn() }
			provider.getCurrentTask = vi.fn(() => task)
			provider.context = { workspaceState: { get: vi.fn(() => true) } }
			provider.updateGlobalState = vi.fn().mockResolvedValue(undefined)
			provider.emit = vi.fn()
			provider.postMessageToWebview = vi.fn().mockResolvedValue(undefined)
			provider.postStateToWebview = vi.fn().mockResolvedValue(undefined)
			provider.switchRuntimeMode = vi.fn(async (t: any, mode: string) => (t._taskMode = mode))

			await provider.setDefaultMode("architect")

			expect(provider.updateGlobalState).toHaveBeenCalledWith("mode", "architect")
			expect(provider.switchRuntimeMode).toHaveBeenCalledWith(task, "architect")
			expect(task._taskMode).toBe("architect")
			expect(provider.contextProxy.setProviderSettings).not.toHaveBeenCalled()
		})

		it("setProviderProfile persists Settings state, unlike runtime profile activation", async () => {
			const provider = makeActivationProvider()

			await provider.setProviderProfile("task-profile")

			expect(provider.providerSettingsManager.activateProfile).toHaveBeenCalledWith({ name: "task-profile" })
			expect(provider.contextProxy.setProviderSettings).toHaveBeenCalled()
			expect(provider.contextProxy.setValue).toHaveBeenCalledWith("currentApiConfigName", "task-profile")
		})

		it("profile creation updates Settings metadata without requiring runtime activation", async () => {
			const provider = makeActivationProvider()
			provider.providerSettingsManager.saveConfig = vi.fn().mockResolvedValue("new-id")
			provider.providerSettingsManager.listConfig = vi.fn().mockResolvedValue([{ name: "new", id: "new-id" }])
			provider.updateGlobalState = vi.fn().mockResolvedValue(undefined)

			await provider.upsertProviderProfile("new", { apiProvider: "anthropic", apiModelId: "new-model" }, false)

			expect(provider.providerSettingsManager.saveConfig).toHaveBeenCalled()
			expect(provider.updateGlobalState).toHaveBeenCalledWith("listApiConfigMeta", [
				{ name: "new", id: "new-id" },
			])
			expect(provider.contextProxy.setProviderSettings).not.toHaveBeenCalled()
		})
		it("profile deletion updates Settings selection without touching provider runtime state", async () => {
			const provider = makeActivationProvider()
			provider.contextProxy.getValues = vi.fn(() => ({
				currentApiConfigName: "old",
				listApiConfigMeta: [
					{ name: "old", id: "old-id" },
					{ name: "kept", id: "kept-id" },
				],
			}))
			provider.contextProxy.setValues = vi.fn().mockResolvedValue(undefined)

			await provider.deleteProviderProfile({ name: "old", id: "old-id" })

			expect(provider.contextProxy.setValues).toHaveBeenCalledWith(
				expect.objectContaining({
					currentApiConfigName: "kept",
					listApiConfigMeta: [{ name: "kept", id: "kept-id" }],
				}),
			)
			expect(provider.contextProxy.setProviderSettings).not.toHaveBeenCalled()
			expect(provider.providerSettingsManager.setModeConfig).not.toHaveBeenCalled()
		})
	})

	describe("webview serialization", () => {
		it("serializes Settings and runtime slices independently", async () => {
			const provider = Object.create(ClineProvider.prototype) as any
			provider.taskHistoryStore = { initialized: Promise.resolve(), getAll: vi.fn(() => []) }
			provider.context = { extension: { packageJSON: { version: "1" } } }
			provider.contextProxy = { getValue: vi.fn().mockResolvedValue(undefined) }
			provider.currentWorkspacePath = "/workspace"
			provider.latestAnnouncementId = "latest"
			provider.mergeAllowedCommands = vi.fn(() => [])
			provider.mergeDeniedCommands = vi.fn(() => [])
			provider.getState = vi
				.fn()
				.mockResolvedValue({ mode: "code", currentApiConfigName: "settings", apiConfiguration: {} })
			provider.getCurrentTask = vi.fn(() => ({
				taskId: "task",
				instanceId: "instance",
				taskMode: "architect",
				taskApiConfigName: "runtime",
				clineMessages: [],
				todoList: [],
			}))

			const state = await provider.getStateToPostToWebview({ includeTaskHistory: false })

			expect(state.defaultMode).toBe("code")
			expect(state.currentApiConfigName).toBe("settings")
			expect(state.runtimeMode).toBe("architect")
			expect(state.runtimeApiConfigName).toBe("runtime")
		})

		it("runtime mode updates post only the runtime slice", async () => {
			const provider = makeActivationProvider()
			const task = { taskId: "task", _taskMode: "code", taskHistory: [], emit: vi.fn() }
			provider.taskHistoryStore = { get: vi.fn() }
			provider.updateTaskHistory = vi.fn()
			provider.postMessageToWebview = vi.fn().mockResolvedValue(undefined)
			provider.log = vi.fn()

			await provider.switchRuntimeMode(task, "debug")

			expect(provider.postMessageToWebview).toHaveBeenCalledWith({
				type: "state",
				state: { runtimeMode: "debug" },
			})
			expect(provider.contextProxy.setValue).not.toHaveBeenCalled()
		})

		it("a fresh task snapshot uses Settings defaults rather than the completed task runtime", async () => {
			const provider = Object.create(ClineProvider.prototype) as any
			provider.taskHistoryStore = { initialized: Promise.resolve(), getAll: vi.fn(() => []) }
			provider.context = { extension: { packageJSON: { version: "1" } } }
			provider.contextProxy = { getValue: vi.fn() }
			provider.latestAnnouncementId = "latest"
			provider.mergeAllowedCommands = vi.fn(() => [])
			provider.mergeDeniedCommands = vi.fn(() => [])
			provider.getState = vi
				.fn()
				.mockResolvedValue({ mode: "architect", currentApiConfigName: "settings", apiConfiguration: {} })
			provider.getCurrentTask = vi
				.fn()
				.mockReturnValueOnce({
					taskMode: "debug",
					taskApiConfigName: "runtime",
					clineMessages: [],
					todoList: [],
				})
				.mockReturnValueOnce(undefined)

			const active = await provider.getStateToPostToWebview({ includeTaskHistory: false })
			const fresh = await provider.getStateToPostToWebview({ includeTaskHistory: false })

			expect(active).toEqual(
				expect.objectContaining({
					defaultMode: "architect",
					runtimeMode: "debug",
					currentApiConfigName: "settings",
					runtimeApiConfigName: "runtime",
				}),
			)
			expect(fresh).toEqual(
				expect.objectContaining({
					defaultMode: "architect",
					runtimeMode: "architect",
					currentApiConfigName: "settings",
					runtimeApiConfigName: "settings",
				}),
			)
		})
	})
})
