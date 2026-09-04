import { describe, expect, it, vi } from "vitest"

import { ClineProvider } from "../ClineProvider"

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
	it("activateProviderProfile with syncGlobalProviderState=false does not mutate the source of truth", async () => {
		const provider = makeActivationProvider()

		await provider.activateProviderProfile(
			{ name: "task-profile" },
			{ persistModeConfig: false, persistTaskHistory: false, syncGlobalProviderState: false },
		)

		expect(provider.contextProxy.setProviderSettings).not.toHaveBeenCalled()
		expect(provider.contextProxy.setValue).not.toHaveBeenCalledWith("currentApiConfigName", expect.anything())
	})

	it("activateProviderProfile still persists user-initiated profile activation", async () => {
		const provider = makeActivationProvider()

		await provider.activateProviderProfile({ name: "task-profile" })

		expect(provider.contextProxy.setProviderSettings).toHaveBeenCalledWith(
			expect.objectContaining({ apiModelId: "task-model" }),
		)
		expect(provider.contextProxy.setValue).toHaveBeenCalledWith("currentApiConfigName", "task-profile")
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
})
