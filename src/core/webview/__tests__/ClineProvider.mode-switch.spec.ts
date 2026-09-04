import { describe, expect, it, vi } from "vitest"

import { ClineProvider } from "../ClineProvider"

/**
 * These tests deliberately exercise the provider's persistence boundary rather than only
 * checking the in-memory mode. This is the regression that a no-op updateGlobalState hid.
 */
describe("ClineProvider mode persistence", () => {
	const createProvider = (initialMode: unknown = "code") => {
		const state: Record<string, unknown> = { mode: initialMode }
		const contextProxy = {
			getValue: vi.fn((key: string) => state[key]),
			setValue: vi.fn(async (key: string, value: unknown) => {
				state[key] = value
			}),
		}

		// Avoid constructing the provider and its unrelated VS Code services in this unit suite.
		const provider = Object.create(ClineProvider.prototype) as ClineProvider
		const testProvider = provider as any
		testProvider.contextProxy = contextProxy
		testProvider.context = { workspaceState: { get: vi.fn(() => false) } }
		testProvider.clineStack = []
		testProvider.postMessageToWebview = vi.fn().mockResolvedValue(undefined)
		testProvider.taskHistoryStore = { get: vi.fn(), getAll: vi.fn(() => []) }
		testProvider.emit = vi.fn()
		testProvider.postStateToWebview = vi.fn().mockResolvedValue(undefined)
		testProvider.providerSettingsManager = {
			getModeConfigId: vi.fn().mockResolvedValue(undefined),
			listConfig: vi.fn().mockResolvedValue([]),
			setModeConfig: vi.fn().mockResolvedValue(undefined),
		}
		return { provider, contextProxy, state }
	}

	it("updateGlobalState delegates the key and value to ContextProxy", async () => {
		const { provider, contextProxy, state } = createProvider()

		// A direct assertion catches the original empty implementation.
		await (provider as any).updateGlobalState("mode", "architect")

		expect(contextProxy.setValue).toHaveBeenCalledWith("mode", "architect")
		expect(state.mode).toBe("architect")
	})

	it("handleModeSwitch persists the mode through ContextProxy", async () => {
		const { provider, contextProxy, state } = createProvider("code")

		// This is the end-to-end path: handleModeSwitch -> updateGlobalState -> setValue.
		await provider.handleModeSwitch("architect" as any)

		expect(contextProxy.setValue).toHaveBeenCalledWith("mode", "architect")
		expect(state.mode).toBe("architect")
		expect(provider.emit).toHaveBeenCalled()
	})

	it("persists an unknown mode value instead of silently dropping it", async () => {
		const { provider, contextProxy, state } = createProvider()

		// Mode validation belongs to callers; persistence must not turn into a no-op.
		await (provider as any).updateGlobalState("mode", "does-not-exist")

		expect(contextProxy.setValue).toHaveBeenCalledWith("mode", "does-not-exist")
		expect(state.mode).toBe("does-not-exist")
	})

	it.each([null, undefined])("persists %s mode values", async (value) => {
		const { provider, contextProxy, state } = createProvider("code")

		// Nullish values are included to ensure the forwarding method does not filter them out.
		await (provider as any).updateGlobalState("mode", value)

		expect(contextProxy.setValue).toHaveBeenCalledWith("mode", value)
		expect(state.mode).toBe(value)
	})

	it("publishes a runtime-only mode update without changing the Settings mode", async () => {
		const { provider, contextProxy, state } = createProvider("code")
		const task = { taskId: "task-1", taskMode: "code", emit: vi.fn() } as any

		await provider.switchRuntimeMode(task, "architect")

		expect(state.mode).toBe("code")
		expect(contextProxy.setValue).not.toHaveBeenCalledWith("mode", expect.anything())
		expect(provider.postMessageToWebview).toHaveBeenCalledWith({
			type: "state",
			state: { runtimeMode: "architect" },
		})
	})
})
