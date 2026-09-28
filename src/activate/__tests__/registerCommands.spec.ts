import type { Mock } from "vitest"
import * as vscode from "vscode"
import { ClineProvider } from "../../core/webview/ClineProvider"

import { getVisibleProviderOrLog, registerCommands } from "../registerCommands"

vi.mock("execa", () => ({
	execa: vi.fn(),
}))

vi.mock("vscode", () => ({
	CodeActionKind: {
		QuickFix: { value: "quickfix" },
		RefactorRewrite: { value: "refactor.rewrite" },
	},
	window: {
		createTextEditorDecorationType: vi.fn().mockReturnValue({ dispose: vi.fn() }),
	},
	workspace: {
		workspaceFolders: [
			{
				uri: {
					fsPath: "/mock/workspace",
				},
			},
		],
	},
	commands: {
		registerCommand: vi.fn(),
	},
}))

vi.mock("../../core/webview/ClineProvider")

describe("getVisibleProviderOrLog", () => {
	let mockOutputChannel: vscode.OutputChannel

	beforeEach(() => {
		mockOutputChannel = {
			appendLine: vi.fn(),
			append: vi.fn(),
			clear: vi.fn(),
			hide: vi.fn(),
			name: "mock",
			replace: vi.fn(),
			show: vi.fn(),
			dispose: vi.fn(),
		}
		vi.clearAllMocks()
	})

	it("returns the visible provider if found", () => {
		const mockProvider = {} as ClineProvider
		;(ClineProvider.getVisibleInstance as Mock).mockReturnValue(mockProvider)

		const result = getVisibleProviderOrLog(mockOutputChannel)

		expect(result).toBe(mockProvider)
		expect(mockOutputChannel.appendLine).not.toHaveBeenCalled()
	})

	it("logs and returns undefined if no provider found", () => {
		;(ClineProvider.getVisibleInstance as Mock).mockReturnValue(undefined)

		const result = getVisibleProviderOrLog(mockOutputChannel)

		expect(result).toBeUndefined()
		expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
			"Cannot find any visible AI Code Orchestrator instances.",
		)
	})
})

describe("plusButtonClicked", () => {
	let mockOutputChannel: vscode.OutputChannel
	let mockContext: vscode.ExtensionContext
	let mockProvider: {
		clearTask: Mock
		removeClineFromStack: Mock
		refreshWorkspace: Mock
		postMessageToWebview: Mock
	}
	let callOrder: string[]

	beforeEach(() => {
		vi.clearAllMocks()

		mockOutputChannel = {
			appendLine: vi.fn(),
			append: vi.fn(),
			clear: vi.fn(),
			hide: vi.fn(),
			name: "mock",
			replace: vi.fn(),
			show: vi.fn(),
			dispose: vi.fn(),
		}

		mockContext = {
			subscriptions: [],
		} as unknown as vscode.ExtensionContext

		callOrder = []

		mockProvider = {
			clearTask: vi.fn().mockImplementation(async () => {
				callOrder.push("clearTask")
			}),
			removeClineFromStack: vi.fn().mockImplementation(async () => {
				callOrder.push("removeClineFromStack")
			}),
			refreshWorkspace: vi.fn().mockImplementation(async () => {
				callOrder.push("refreshWorkspace")
			}),
			postMessageToWebview: vi.fn().mockImplementation(async (message: { action: string }) => {
				callOrder.push(message.action)
			}),
		}
		;(ClineProvider.getVisibleInstance as Mock).mockReturnValue(mockProvider)
		;(vscode.commands.registerCommand as Mock).mockImplementation(() => ({ dispose: vi.fn() }))
	})

	function getPlusButtonClickedCallback(): (...args: any[]) => Promise<void> {
		registerCommands({ context: mockContext, outputChannel: mockOutputChannel, provider: mockProvider as any })

		const call = (vscode.commands.registerCommand as Mock).mock.calls.find(([command]) =>
			String(command).endsWith("plusButtonClicked"),
		)

		if (!call) {
			throw new Error("plusButtonClicked command was not registered")
		}

		return call[1]
	}

	it("resets the whole task stack via clearTask, not removeClineFromStack, preserving the action order", async () => {
		const callback = getPlusButtonClickedCallback()

		await callback()

		expect(mockProvider.clearTask).toHaveBeenCalledTimes(1)
		expect(mockProvider.removeClineFromStack).not.toHaveBeenCalled()
		expect(mockProvider.refreshWorkspace).toHaveBeenCalledTimes(1)
		expect(mockProvider.postMessageToWebview).toHaveBeenCalledWith({
			type: "action",
			action: "chatButtonClicked",
		})
		expect(mockProvider.postMessageToWebview).toHaveBeenCalledWith({ type: "action", action: "focusInput" })

		expect(callOrder).toEqual(["clearTask", "refreshWorkspace", "chatButtonClicked", "focusInput"])
	})
})
