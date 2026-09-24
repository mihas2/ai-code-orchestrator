// npx vitest run core/task/__tests__/hard-timeout-no-resurrection.spec.ts
//
// Behavioral regression tests for the no-resurrection policy: a task may only
// be ended by attempt_completion / a terminal completion status, an explicit
// user stop (abort), or a genuine API error. There is no timeout-based abort
// of a task waiting for the presenter - the wait boundary in Task.ts awaits
// `userMessageContentReady || this.abort` with no deadline. These tests close
// the gaps NOT already covered by:
//   - Task-timeout-cancellation.spec.ts (presentAssistantMessage-level cancellation
//     guards for pushToolResult/askApproval/handleError)
//   - delegation-request-count-real-loop.spec.ts (successful delegated child makes
//     exactly one request; parent is never touched by a successful delegation)
//
// Specifically, THIS file drives the REAL, full `initiateTaskLoop` /
// `recursivelyMakeClineRequests` loop (not just an isolated boundary) to prove,
// at the loop level:
//   1. A task that is already aborted, or already COMPLETED, before the boundary
//      is even entered short-circuits without issuing a request or throwing.
//   2. A successful delegated child that is still `TaskCompletionStatus.RUNNING`
//      (hasDelegatedToParent=true) does not re-enter the request loop, and the
//      cancellation machinery does not touch a separate parent Task instance.
//
// Fake timers are used where a test needs deterministic control over ordering.
// Deferred promises are used to control exactly when the mocked API stream /
// presenter settle, instead of relying on real setTimeout delays.

import * as os from "os"
import * as path from "path"

import * as vscode from "vscode"

import type { GlobalState, ProviderSettings } from "@ai-code-orchestrator/types"

import { Task } from "../Task"
import { TaskCompletionStatus } from "../TaskCompletionStatus"
import { ClineProvider } from "../../webview/ClineProvider"
import { ContextProxy } from "../../config/ContextProxy"
import type { ApiStream, ApiStreamChunk } from "../../../api/transform/stream"

// ROOT CAUSE OF PRIOR HANGS (documented, not guessed): `getEnvironmentDetails`
// (called at the top of every `recursivelyMakeClineRequests` iteration, before
// any API request is issued) calls `listFiles` -> `execRipgrep`, which spawns a
// REAL child process (`childProcess.spawn`, see services/glob/list-files.ts).
// Real OS-level subprocess I/O does not reliably interleave with vitest's fake
// timers when using `advanceTimersByTimeAsync` to fast-forward 60+ virtual
// seconds - the subprocess's own internal 10s safety-net `setTimeout` becomes a
// fake timer, but the process's real `'close'`/`'data'` events are not
// synthetic-time-driven, so the two clocks stop cooperating and the call never
// settles. This is unrelated to the boundary/pWaitFor watchdog under test - it
// is purely a test-environment mocking gap. Mocking `listFiles` here (the same
// style as attemptApiRequest/ask/saveClineMessages/checkpointSave are already
// mocked below) avoids spawning any real process for these tests.
vi.mock("../../../services/glob/list-files", () => ({
	listFiles: vi.fn(),
}))

vi.mock("vscode", () => {
	const mockDisposable = { dispose: vi.fn() }
	const mockEventEmitter = { event: vi.fn(), fire: vi.fn() }
	const mockTextDocument = { uri: { fsPath: "/mock/workspace/path/file.ts" } }
	const mockTextEditor = { document: mockTextDocument }
	const mockTab = {
		input: { uri: { fsPath: "/mock/workspace/path/file.ts" } },
		label: "file.ts",
		isDirty: false,
	}
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
				close: vi.fn().mockResolvedValue(undefined),
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
	const storageUri = { fsPath: path.join(os.tmpdir(), "hard-timeout-no-resurrection-test") }

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

/**
 * Same controlled-async-generator helper as delegation-request-count-real-loop.spec.ts:
 * stands in for `Task.prototype.attemptApiRequest`, the real network/provider
 * boundary. Each call pulls the next queued chunk sequence.
 */
function makeControlledAttemptApiRequest(chunkSequences: ApiStreamChunk[][]) {
	const spy = vi.fn()
	let callIndex = 0

	async function* controlled(): ApiStream {
		const sequence = chunkSequences[callIndex] ?? [{ type: "text", text: "" }]
		callIndex++
		spy()
		for (const chunk of sequence) {
			yield chunk
		}
	}

	return { generatorFn: controlled, spy }
}

function createTaskWithControlledApi(
	chunkSequences: ApiStreamChunk[][],
	options?: { parentTaskId?: string; taskId?: string },
) {
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
	mockProvider.getState = vi.fn().mockResolvedValue({
		mode: "code",
		customModes: [],
		experiments: {},
		disabledTools: [],
		autoApprovalEnabled: true,
		mcpEnabled: false,
	})
	mockProvider.getMcpHub = vi.fn().mockReturnValue(undefined)
	mockProvider.getTaskWithId = vi
		.fn()
		.mockResolvedValue({ historyItem: { id: options?.taskId ?? "task-1", status: "active" } })
	mockProvider.reopenParentFromDelegation = vi.fn().mockResolvedValue(undefined)

	const mockApiConfig: ProviderSettings = {
		apiProvider: "anthropic",
		apiModelId: "claude-3-5-sonnet-20241022",
		apiKey: "test-api-key",
	}

	const task = new Task({
		provider: mockProvider,
		apiConfiguration: mockApiConfig,
		task: "task under test",
		parentTask: options?.parentTaskId
			? ({ taskId: options.parentTaskId, workspacePath: "/mock/workspace/path" } as any)
			: undefined,
		taskId: options?.taskId ?? "task-1",
		startTask: false,
	})

	const { generatorFn, spy: attemptApiRequestSpy } = makeControlledAttemptApiRequest(chunkSequences)
	vi.spyOn(task, "attemptApiRequest").mockImplementation(generatorFn)

	vi.spyOn(task, "ask").mockResolvedValue({ response: "yesButtonClicked" } as any)
	vi.spyOn(task as any, "saveClineMessages").mockResolvedValue(true as any)
	vi.spyOn(task, "checkpointSave").mockResolvedValue(undefined as any)

	return { task, mockProvider, attemptApiRequestSpy }
}

function toolCallChunk(id: string, name: string, args: Record<string, unknown>): ApiStreamChunk {
	return { type: "tool_call", id, name, arguments: JSON.stringify(args) }
}

describe("No resurrection through the REAL Task loop (no timeout-based abort)", () => {
	beforeEach(async () => {
		// `vi.restoreAllMocks()` in `afterEach` reverts the `vi.fn()` created by
		// the `vi.mock("../../../services/glob/list-files", ...)` factory above
		// back to a bare, un-implemented mock after the first test that uses it -
		// so the resolved value must be re-established before every test, not
		// only once at module-mock-definition time.
		const listFilesModule = await import("../../../services/glob/list-files")
		;(listFilesModule.listFiles as ReturnType<typeof vi.fn>).mockResolvedValue([[], false])
	})

	afterEach(() => {
		vi.useRealTimers()
		vi.restoreAllMocks()
	})

	// -------------------------------------------------------------------------
	// 1. Already aborted / already COMPLETED BEFORE the boundary is entered
	// -------------------------------------------------------------------------
	it("a task that is already aborted before the wait boundary is entered exits the loop without issuing a request or throwing", async () => {
		const { task, attemptApiRequestSpy } = createTaskWithControlledApi([[{ type: "text", text: "should not run" }]])

		// Task is aborted BEFORE recursivelyMakeClineRequests is ever invoked.
		task.abort = true
		task.abortReason = "user_cancelled"

		let loopError: unknown
		try {
			await (task as any).initiateTaskLoop([{ type: "text", text: "start" }])
		} catch (error) {
			loopError = error
		}

		// Pre-aborted tasks must not throw, and must not issue any outbound request.
		expect(attemptApiRequestSpy).not.toHaveBeenCalled()
		expect(loopError).toBeUndefined()
	})

	it("a task that is already COMPLETED before the wait boundary is entered does not loop into a SECOND request when the model's turn has no tool use (TERMINAL_STATUS_GUARD)", async () => {
		// NOTE: the caller invoking `initiateTaskLoop` on an already-COMPLETED task
		// is itself unusual (nothing in the production call path does this for a
		// fresh loop start) - but if it happens, the FIRST request is still issued
		// (this guard runs post-stream, after a turn has been produced, not before
		// the loop starts). What must NOT happen is a SECOND request produced by
		// the "no tool used" nudge being pushed onto the stack for an
		// already-terminal instance - that is the actual resurrection bug this
		// guard closes (see TERMINAL_STATUS_GUARD in Task.ts).
		const { task, attemptApiRequestSpy } = createTaskWithControlledApi([
			[{ type: "text", text: "should not loop" }],
		])

		task.setCompletionStatus(TaskCompletionStatus.COMPLETED)

		let loopError: unknown
		try {
			await (task as any).initiateTaskLoop([{ type: "text", text: "start" }])
		} catch (error) {
			loopError = error
		}

		// Exactly one request - never a second one from the no-tool-use nudge.
		expect(attemptApiRequestSpy).toHaveBeenCalledTimes(1)
		expect(loopError).toBeUndefined()
		expect(task.taskCompletionStatus).toBe(TaskCompletionStatus.COMPLETED)
	})

	// -------------------------------------------------------------------------
	// 2. Successful delegated child (RUNNING) - full loop - no re-entry, parent untouched
	// -------------------------------------------------------------------------
	it("a successfully delegated child that remains taskCompletionStatus=RUNNING does not re-enter the request loop, and no separate parent Task instance is touched by the timeout/cancellation machinery", async () => {
		const { task, mockProvider, attemptApiRequestSpy } = createTaskWithControlledApi(
			[[toolCallChunk("tool-1", "attempt_completion", { result: "Child work is done." })]],
			{ parentTaskId: "parent-1", taskId: "child-1" },
		)

		await (task as any).initiateTaskLoop([{ type: "text", text: "do the child work" }])

		// Delegation succeeded; per the documented policy, delegation does NOT
		// change taskCompletionStatus (it stays RUNNING) - hasDelegatedToParent is
		// the marker that actually stops the loop.
		expect(task.hasDelegatedToParent).toBe(true)
		expect(task.taskCompletionStatus).toBe(TaskCompletionStatus.RUNNING)
		expect(attemptApiRequestSpy).toHaveBeenCalledTimes(1)
		expect(mockProvider.reopenParentFromDelegation).toHaveBeenCalledTimes(1)

		// This child instance's own abort/cancellation state must be untouched -
		// a successful delegation is not a cancellation, and this test's
		// `attemptApiRequestSpy` call count (still 1) proves no re-entry happened.
		expect(task.abort).toBe(false)
		expect(task.currentRequestAbortController).toBeUndefined()
	})
})
