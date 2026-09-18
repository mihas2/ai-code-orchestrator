import nock from "nock"
import { vi } from "vitest"

import "./utils/path" // Import to enable String.prototype.toPosix().

// Disable network requests by default for all tests.
nock.disableNetConnect()

export function allowNetConnect(host?: string | RegExp) {
	if (host) {
		nock.enableNetConnect(host)
	} else {
		nock.enableNetConnect()
	}
}

// Global mocks that many tests expect.
global.structuredClone = global.structuredClone || ((obj: any) => JSON.parse(JSON.stringify(obj)))

// Mock vscode module for tests that don't explicitly mock it
vi.mock("vscode", async () => {
	const actual = await vi.importActual<any>("vscode")
	return {
		...actual,
		RelativePattern: vi.fn((base: unknown, pattern: string) => ({ base, pattern })),
		workspace: {
			...actual?.workspace,
			createFileSystemWatcher: vi.fn(() => ({
				onDidCreate: vi.fn(() => ({ dispose: vi.fn() })),
				onDidChange: vi.fn(() => ({ dispose: vi.fn() })),
				onDidDelete: vi.fn(() => ({ dispose: vi.fn() })),
				dispose: vi.fn(),
			})),
			workspaceFolders: [{ uri: { fsPath: "/workspace" } }],
			getConfiguration: vi.fn(() => ({ get: vi.fn((_, value) => value), update: vi.fn() })),
			onDidChangeConfiguration: vi.fn(() => ({ dispose: vi.fn() })),
			onDidSaveTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
		},
		window: {
			...actual?.window,
			showInformationMessage: vi.fn(),
			showWarningMessage: vi.fn(),
			showErrorMessage: vi.fn(),
			createTextEditorDecorationType: vi.fn(() => ({ dispose: vi.fn() })),
			onDidChangeActiveTextEditor: vi.fn(() => ({ dispose: vi.fn() })),
		},
		Uri: {
			...actual?.Uri,
			joinPath: vi.fn(),
			file: vi.fn(),
		},
		commands: {
			...actual?.commands,
			executeCommand: vi.fn().mockResolvedValue(undefined),
		},
		env: { uriScheme: "vscode", language: "en", appName: "Visual Studio Code" },
		ExtensionMode: { Test: 3 },
		version: "1.85.0",
	}
})
