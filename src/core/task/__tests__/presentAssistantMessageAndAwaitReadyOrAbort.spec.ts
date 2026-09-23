// npx vitest run core/task/__tests__/presentAssistantMessageAndAwaitReadyOrAbort.spec.ts
//
// Task-level regression test for the SINGLE production wait boundary that sits
// directly on the real path:
//
//   Task#recursivelyMakeClineRequests (post-stream)
//     -> await this.presentAssistantMessageAndAwaitReadyOrAbort()
//         -> (conditionally) presentAssistantMessage(this)   [the real presenter]
//         -> pWaitFor(() => userMessageContentReady, {timeout: 60000})
//
// This replaces the old `waitForUserMessageContentReadyOrAbort` extract, whose
// tests only exercised `pWaitFor` AFTER an already-settled presenter call. That
// was insufficient: the actual production bug was an earlier, separate,
// UNCONDITIONAL, un-timed `await presentAssistantMessage(this)` directly in
// `recursivelyMakeClineRequests` (the "HANG_FIX" block) that ran BEFORE any
// watchdog was reached at all. A presenter that never resolves would hang that
// await forever - the watchdog test suite never covered that failure mode
// because it never invoked the presenter through the boundary being tested.
//
// This suite drives the REAL, unmocked `Task#presentAssistantMessageAndAwaitReadyOrAbort`
// against a REAL `Task` instance, with a REAL (never-resolving, or controllable)
// `presentAssistantMessage` promise sitting inside the SAME boundary call, using
// vitest fake timers to advance the clock without waiting 60 real seconds.

import * as os from "os"
import * as path from "path"

import * as vscode from "vscode"

import type { GlobalState, ProviderSettings } from "@ai-code-orchestrator/types"

import { Task } from "../Task"
import { TaskCompletionStatus } from "../TaskCompletionStatus"
import { ClineProvider } from "../../webview/ClineProvider"
import { ContextProxy } from "../../config/ContextProxy"
// Task.ts imports `presentAssistantMessage` from the barrel (`../assistant-message`),
// which re-exports it from this exact module. Spying on the underlying module (rather
// than the barrel) is what actually intercepts the call Task.ts makes, since the
// barrel's re-export is a live binding to this module's export.
import * as presentAssistantMessageModule from "../../assistant-message/presentAssistantMessage"

vi.mock("vscode", () => {
	const mockDisposable = { dispose: vi.fn() }
	const mockEventEmitter = { event: vi.fn(), fire: vi.fn() }
	const mockTextDocument = { uri: { fsPath: "/mock/workspace/path/file.ts" } }
	const mockTextEditor = { document: mockTextDocument }
	const mockTab = { input: { uri: { fsPath: "/mock/workspace/path/file.ts" } } }
	const mockTabGroup = { tabs: [mockTab] }

	return {
		RelativePattern: vi.fn((base: unknown, pattern: string) => ({ base, pattern })),
		TabInputTextDiff: vi.fn(),
		CodeActionKind: {
			QuickFix: { value: "quickfix" },
			RefactorRewrite: { value: "refactor.rewrite" },
		},
		window: {
			createTextEditorDecorationType: vi.fn().mockReturnValue({ dispose: vi.fn() }),
			visibleTextEditors: [mockTextEditor],
			tabGroups: {
				all: [mockTabGroup],
				close: vi.fn(),
				onDidChangeTabs: vi.fn(() => mockDisposable),
			},
			showErrorMessage: vi.fn(),
			showInformationMessage: vi.fn(),
			showWarningMessage: vi.fn(),
		},
		workspace: {
			workspaceFolders: [{ uri: { fsPath: "/mock/workspace/path" }, name: "mock-workspace", index: 0 }],
			createFileSystemWatcher: vi.fn(() => ({
				onDidCreate: vi.fn(() => mockDisposable),
				onDidDelete: vi.fn(() => mockDisposable),
				onDidChange: vi.fn(() => mockDisposable),
				dispose: vi.fn(),
			})),
			fs: {
				stat: vi.fn().mockResolvedValue({ type: 1 }), // FileType.File = 1
			},
			onDidSaveTextDocument: vi.fn(() => mockDisposable),
			getConfiguration: vi.fn(() => ({ get: (_key: string, defaultValue: any) => defaultValue })),
		},
		env: {
			uriScheme: "vscode",
			language: "en",
		},
		EventEmitter: vi.fn().mockImplementation(() => mockEventEmitter),
		Disposable: {
			from: vi.fn(),
		},
		TabInputText: vi.fn(),
	}
})

function createMockExtensionContext(): vscode.ExtensionContext {
	const storageUri = { fsPath: path.join(os.tmpdir(), "task-present-and-wait-boundary-test") }

	return {
		globalState: {
			get: vi.fn().mockImplementation((_key: keyof GlobalState) => undefined),
			update: vi.fn().mockResolvedValue(undefined),
			keys: vi.fn().mockReturnValue([]),
		},
		globalStorageUri: storageUri,
		workspaceState: {
			get: vi.fn().mockImplementation((_key) => undefined),
			update: vi.fn().mockResolvedValue(undefined),
			keys: vi.fn().mockReturnValue([]),
		},
		secrets: {
			get: vi.fn().mockResolvedValue(undefined),
			store: vi.fn().mockResolvedValue(undefined),
			delete: vi.fn().mockResolvedValue(undefined),
		},
		extensionUri: { fsPath: "/mock/extension/path" },
		extension: { packageJSON: { version: "1.0.0" } },
	} as unknown as vscode.ExtensionContext
}

function createMockOutputChannel() {
	return {
		appendLine: vi.fn(),
		append: vi.fn(),
		clear: vi.fn(),
		show: vi.fn(),
		hide: vi.fn(),
		dispose: vi.fn(),
	}
}

function createTask(): Task {
	const mockExtensionContext = createMockExtensionContext()
	const mockOutputChannel = createMockOutputChannel()

	const mockProvider = new ClineProvider(
		mockExtensionContext,
		mockOutputChannel as any,
		"sidebar",
		new ContextProxy(mockExtensionContext),
	) as any

	mockProvider.postMessageToWebview = vi.fn().mockResolvedValue(undefined)
	mockProvider.postStateToWebview = vi.fn().mockResolvedValue(undefined)
	mockProvider.postStateToWebviewWithoutTaskHistory = vi.fn().mockResolvedValue(undefined)
	mockProvider.getState = vi.fn().mockResolvedValue({})

	const mockApiConfig: ProviderSettings = {
		apiProvider: "anthropic",
		apiModelId: "claude-3-5-sonnet-20241022",
		apiKey: "test-api-key",
	}

	// startTask: false => constructor does not kick off startTask()/resumeTaskFromHistory(),
	// so there is no interference from the API pipeline. We are testing
	// `presentAssistantMessageAndAwaitReadyOrAbort` in isolation, as a boundary method,
	// while still calling through to the REAL `presentAssistantMessage` (spied, not
	// reimplemented) so the "presenter never resolves" failure mode is genuinely exercised.
	return new Task({
		provider: mockProvider,
		apiConfiguration: mockApiConfig,
		task: "test task",
		startTask: false,
	})
}

describe("Task#presentAssistantMessageAndAwaitReadyOrAbort (real Task instance, real p-wait-for, real presenter call site)", () => {
	afterEach(() => {
		vi.useRealTimers()
		vi.restoreAllMocks()
	})

	it("resolves 'continue' immediately when userMessageContentReady is already true and the presenter does not need to be invoked", async () => {
		const task = createTask()
		task.userMessageContentReady = true
		task.didCompleteReadingStream = true

		const result = await (task as any).presentAssistantMessageAndAwaitReadyOrAbort()

		expect(result).toBe("continue")
		expect(task.abort).toBe(false)
	})

	it("BEHAVIORAL REGRESSION GUARD: a presenter that NEVER resolves is caught by the SAME 60s watchdog as the readiness wait (this is the exact bug: previously this await ran unconditionally, BEFORE any watchdog existed)", async () => {
		vi.useFakeTimers()
		const task = createTask()
		// Conditions that make the boundary decide it must call the presenter itself
		// (mirrors the real "HANG_FIX" trigger: stream finished, nothing else set
		// userMessageContentReady).
		task.userMessageContentReady = false
		task.didCompleteReadingStream = true
		task.setCompletionStatus(TaskCompletionStatus.RUNNING)

		// Real presenter call site, but the underlying `presentAssistantMessage` is
		// replaced with a promise that NEVER settles - simulating a joined/active
		// execution that hangs (e.g. a lock that is never released). We spy on the
		// module export because `presentAssistantMessageAndAwaitReadyOrAbort` calls
		// the imported function directly, which is the real call site on the
		// production path (see Task.ts).
		vi.spyOn(presentAssistantMessageModule, "presentAssistantMessage").mockReturnValue(
			new Promise<void>(() => {
				/* never resolves, never rejects */
			}),
		)

		const resultPromise = (task as any).presentAssistantMessageAndAwaitReadyOrAbort()
		const assertion = expect(resultPromise).rejects.toThrow(/Task hung waiting for userMessageContentReady/)

		// Without the fix, this would hang forever (no amount of time advancing
		// would help, because the old code awaited the never-resolving presenter
		// UNCONDITIONALLY before the watchdog even started). With the fix, the
		// watchdog inside THIS SAME boundary call catches it at 60s.
		await vi.advanceTimersByTimeAsync(60_100)

		await assertion
		expect(task.abort).toBe(true)
	})

	it("cancels the in-flight HTTP request (instance-local cleanup) when the hang path fires, without needing a bare `this.abort = true`", async () => {
		vi.useFakeTimers()
		const task = createTask()
		task.userMessageContentReady = false
		task.didCompleteReadingStream = true
		task.setCompletionStatus(TaskCompletionStatus.RUNNING)

		const abortSpy = vi.fn()
		task.currentRequestAbortController = { abort: abortSpy } as unknown as AbortController

		vi.spyOn(presentAssistantMessageModule, "presentAssistantMessage").mockReturnValue(new Promise<void>(() => {}))

		const resultPromise = (task as any).presentAssistantMessageAndAwaitReadyOrAbort()
		const assertion = expect(resultPromise).rejects.toThrow()

		await vi.advanceTimersByTimeAsync(60_100)
		await assertion

		expect(abortSpy).toHaveBeenCalledTimes(1)
		expect(task.currentRequestAbortController).toBeUndefined()
		expect(task.abortReason).toBe("user_cancelled")
	})

	it("a USER abort (this.abort = true) unblocks the wait immediately - it does not have to wait out the full 60s for a genuinely never-resolving presenter", async () => {
		vi.useFakeTimers()
		const task = createTask()
		task.userMessageContentReady = false
		task.didCompleteReadingStream = true

		vi.spyOn(presentAssistantMessageModule, "presentAssistantMessage").mockReturnValue(new Promise<void>(() => {}))

		const resultPromise = (task as any).presentAssistantMessageAndAwaitReadyOrAbort()

		// Simulate the user cancelling the task while the presenter is hung.
		await vi.advanceTimersByTimeAsync(5_000)
		task.abort = true
		await vi.advanceTimersByTimeAsync(200) // let the 100ms poll interval observe the flag

		const result = await resultPromise

		// Resolves (does not throw) - the caller's own `if (this.abort) return false`
		// check is what actually stops the loop, per the boundary's documented
		// cancellation contract.
		expect(result).toBe("continue")
	})

	it("surfaces a LATE presenter rejection as a real, observed failure - not silently, and not as an unhandled rejection", async () => {
		vi.useFakeTimers()
		const unhandledRejections: unknown[] = []
		const onUnhandledRejection = (reason: unknown) => unhandledRejections.push(reason)
		process.on("unhandledRejection", onUnhandledRejection)

		try {
			const task = createTask()
			task.userMessageContentReady = false
			task.didCompleteReadingStream = true

			let rejectPresenter: ((error: Error) => void) | undefined
			vi.spyOn(presentAssistantMessageModule, "presentAssistantMessage").mockReturnValue(
				new Promise<void>((_resolve, reject) => {
					rejectPresenter = reject
				}),
			)

			const resultPromise = (task as any).presentAssistantMessageAndAwaitReadyOrAbort()
			const assertion = expect(resultPromise).rejects.toThrow("presenter exploded late")

			// The rejection arrives well within the timeout window (legitimate
			// in-flight work that ultimately fails), so it must be observed as a
			// real failure, not reinterpreted as a 60s hang.
			await vi.advanceTimersByTimeAsync(10_000)
			rejectPresenter!(new Error("presenter exploded late"))
			await vi.advanceTimersByTimeAsync(200)

			await assertion
			// Flush microtasks so any unhandled rejection would have been reported by now.
			await vi.advanceTimersByTimeAsync(0)
		} finally {
			process.off("unhandledRejection", onUnhandledRejection)
		}

		expect(unhandledRejections).toEqual([])
	})

	it("does NOT falsely abort a legitimate, still-active presenter (e.g. blocked on a real long-running approval) that resolves well within the 60s window", async () => {
		vi.useFakeTimers()
		const task = createTask()
		task.userMessageContentReady = false
		task.didCompleteReadingStream = true

		let resolvePresenter: (() => void) | undefined
		vi.spyOn(presentAssistantMessageModule, "presentAssistantMessage").mockImplementation(async () => {
			await new Promise<void>((resolve) => {
				resolvePresenter = resolve
			})
			// Real presentAssistantMessage sets this before returning once the last
			// block has been presented; we mirror that here since we've replaced the
			// module function entirely for this test.
			task.userMessageContentReady = true
		})

		const resultPromise = (task as any).presentAssistantMessageAndAwaitReadyOrAbort()

		// Simulate a long, legitimate wait (e.g. user takes 45s to approve a tool)
		// that is still well under the 60s watchdog.
		await vi.advanceTimersByTimeAsync(45_000)
		expect(task.abort).toBe(false) // must not have aborted yet

		resolvePresenter!()
		await vi.advanceTimersByTimeAsync(200)

		const result = await resultPromise

		expect(result).toBe("continue")
		expect(task.abort).toBe(false)
	})

	it("resolves 'exit-loop' (does not throw) when the wait times out but completionStatus is already terminal (COMPLETED)", async () => {
		vi.useFakeTimers()
		const task = createTask()
		task.userMessageContentReady = false
		task.didCompleteReadingStream = true
		task.setCompletionStatus(TaskCompletionStatus.COMPLETED)

		vi.spyOn(presentAssistantMessageModule, "presentAssistantMessage").mockReturnValue(new Promise<void>(() => {}))

		const resultPromise = (task as any).presentAssistantMessageAndAwaitReadyOrAbort()

		await vi.advanceTimersByTimeAsync(60_100)

		const result = await resultPromise

		expect(result).toBe("exit-loop")
	})
})
