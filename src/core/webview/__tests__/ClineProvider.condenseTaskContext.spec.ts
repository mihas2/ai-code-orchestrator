// npx vitest run core/webview/__tests__/ClineProvider.condenseTaskContext.spec.ts

import * as vscode from "vscode"

import { ClineProvider } from "../ClineProvider"

vi.mock("vscode", () => {
	const window = {
		createTextEditorDecorationType: vi.fn(() => ({ dispose: vi.fn() })),
		showErrorMessage: vi.fn(),
		showWarningMessage: vi.fn(),
		showInformationMessage: vi.fn(),
		onDidChangeActiveTextEditor: vi.fn(() => ({ dispose: vi.fn() })),
	}
	const workspace = {
		getConfiguration: vi.fn(() => ({
			get: vi.fn((_key: string, defaultValue: any) => defaultValue),
			update: vi.fn(),
		})),
		workspaceFolders: [],
	}
	const env = { machineId: "test-machine", uriScheme: "vscode", appName: "VSCode", language: "en", sessionId: "s" }
	const Uri = { file: (p: string) => ({ fsPath: p, toString: () => p }) }
	return { window, workspace, env, Uri, commands: { executeCommand: vi.fn() }, ExtensionMode: { Development: 2 } }
})

function makeProvider(stack: any[]) {
	const provider = {
		clineStack: stack,
		log: vi.fn(),
		postMessageToWebview: vi.fn().mockResolvedValue(undefined),
		getCurrentTask: vi.fn(() => stack.at(-1)),
	}
	const condense = (taskId?: string) => (ClineProvider.prototype as any).condenseTaskContext.call(provider, taskId)
	return { provider, condense }
}

const task = (taskId: string, condenseContext = vi.fn().mockResolvedValue(undefined)) => ({ taskId, condenseContext })

describe("ClineProvider.condenseTaskContext (manual condense button)", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("condenses the requested task and answers the webview", async () => {
		const parent = task("parent")
		const child = task("child")
		const { provider, condense } = makeProvider([parent, child])

		await condense("parent")

		expect(parent.condenseContext).toHaveBeenCalledOnce()
		expect(child.condenseContext).not.toHaveBeenCalled()
		expect(provider.postMessageToWebview).toHaveBeenCalledWith({
			type: "condenseTaskContextResponse",
			text: "parent",
		})
	})

	it("falls back to the current task when the id is missing or stale", async () => {
		const current = task("current")
		const { provider, condense } = makeProvider([current])

		await condense(undefined)
		await condense("unknown")

		expect(current.condenseContext).toHaveBeenCalledTimes(2)
		expect(provider.postMessageToWebview).toHaveBeenLastCalledWith({
			type: "condenseTaskContextResponse",
			text: "current",
		})
	})

	it("still answers the webview and shows the error when condensing throws", async () => {
		const failing = task("t1", vi.fn().mockRejectedValue(new Error("boom")))
		const { provider, condense } = makeProvider([failing])

		await expect(condense("t1")).resolves.toBeUndefined()

		expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(expect.stringContaining("boom"))
		expect(provider.postMessageToWebview).toHaveBeenCalledWith({
			type: "condenseTaskContextResponse",
			text: "t1",
		})
	})

	it("answers the webview even when there is no task at all", async () => {
		const { provider, condense } = makeProvider([])

		await expect(condense("gone")).resolves.toBeUndefined()

		expect(vscode.window.showErrorMessage).toHaveBeenCalled()
		expect(provider.postMessageToWebview).toHaveBeenCalledWith({
			type: "condenseTaskContextResponse",
			text: "gone",
		})
	})
})
