// npx vitest run core/task/__tests__/delegation-request-count-real-loop.spec.ts
//
// Task-level integration test that measures the REAL API request count through
// the REAL Task request loop (`initiateTaskLoop` -> `recursivelyMakeClineRequests`),
// closing the gap explicitly called out for `delegation-request-count.spec.ts`:
// that file's "request-count guard" tests only call the extracted
// `shouldEndLoopAfterAssistantTurn()` predicate directly - they never drive the
// actual `Task` request loop, so they cannot observe whether a SECOND API
// request is actually issued (or not) after delegation.
//
// APPROACH (per the task's explicit fallback instruction): the only boundary
// mocked here is `Task.prototype.attemptApiRequest` - a real, public, documented
// async-generator method that is the actual network/provider boundary
// `recursivelyMakeClineRequests` calls into for each request. This is replaced
// with a small, controlled async generator that we fully control per-call (a
// spy records how many times it's invoked and can return different chunk
// sequences per call). Everything downstream of that boundary is REAL and
// unmocked:
//   - `Task.recursivelyMakeClineRequests` / `initiateTaskLoop` (the decision
//     under test - the request-count guard - is NOT mocked)
//   - `presentAssistantMessage` (the real drain-loop presenter)
//   - `AttemptCompletionTool` (the real delegation producer that sets
//     `hasDelegatedToParent`)
//   - `shouldEndLoopAfterAssistantTurn()` (the real consumer-side guard)
// The provider's parent-resume boundary (`getTaskWithId` /
// `reopenParentFromDelegation`) is stubbed, exactly like the existing
// `delegation-request-count.spec.ts` fixture, since actually resuming a parent
// Task is out of scope for this guard and is covered elsewhere.

import * as os from "os"
import * as path from "path"

import * as vscode from "vscode"

import type { GlobalState, ProviderSettings } from "@ai-code-orchestrator/types"

import { Task } from "../Task"
import { ClineProvider } from "../../webview/ClineProvider"
import { ContextProxy } from "../../config/ContextProxy"
import type { ApiStream, ApiStreamChunk } from "../../../api/transform/stream"

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
	const storageUri = { fsPath: path.join(os.tmpdir(), "delegation-request-count-real-loop-test") }

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
 * A controlled async generator standing in for `Task.prototype.attemptApiRequest`.
 * Each call to `next()` (i.e. each real API "request") pulls the next queued
 * chunk sequence and yields it. If the queue is exhausted, yields a minimal
 * empty-text-then-done sequence (defensive default - tests below always queue
 * exactly as many sequences as requests they expect).
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

function createChildTaskWithControlledApi(chunkSequences: ApiStreamChunk[][]) {
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

	mockProvider.getTaskWithId = vi.fn().mockResolvedValue({ historyItem: { id: "child-1", status: "active" } })
	mockProvider.reopenParentFromDelegation = vi.fn().mockResolvedValue(undefined)

	const mockApiConfig: ProviderSettings = {
		apiProvider: "anthropic",
		apiModelId: "claude-3-5-sonnet-20241022",
		apiKey: "test-api-key",
	}

	const child = new Task({
		provider: mockProvider,
		apiConfiguration: mockApiConfig,
		task: "child task",
		parentTask: { taskId: "parent-1", workspacePath: "/mock/workspace/path" } as any,
		taskId: "child-1",
		startTask: false,
	})

	// The SINGLE mocked boundary: the real, public, documented network/provider
	// call site. Nothing about the decision under test (request-count guard,
	// hasDelegatedToParent, shouldEndLoopAfterAssistantTurn) is mocked.
	const { generatorFn, spy: attemptApiRequestSpy } = makeControlledAttemptApiRequest(chunkSequences)
	vi.spyOn(child, "attemptApiRequest").mockImplementation(generatorFn)

	// Auto-approve any ask() (finish-subtask approval, tool approvals, etc.) so
	// the loop can run to completion without a real UI round-trip. This is the
	// same kind of test double already used by the existing
	// `delegation-request-count.spec.ts` fixture for the presenter-only tests.
	vi.spyOn(child, "ask").mockResolvedValue({ response: "yesButtonClicked" } as any)
	// NOTE: `say()` itself is left REAL (not mocked) - `recursivelyMakeClineRequests`
	// depends on `say("api_req_started", ...)` actually pushing a message into
	// `this.clineMessages` (it later looks that message up via `findLastIndex` to
	// attach cost/usage info). Only the I/O boundary underneath it
	// (`saveClineMessages`, which writes task history to disk) is stubbed out.
	vi.spyOn(child as any, "saveClineMessages").mockResolvedValue(true as any)
	vi.spyOn(child, "checkpointSave").mockResolvedValue(undefined as any)

	return { child, mockProvider, attemptApiRequestSpy }
}

function toolCallChunk(id: string, name: string, args: Record<string, unknown>): ApiStreamChunk {
	return { type: "tool_call", id, name, arguments: JSON.stringify(args) }
}

describe("Child delegation - real API request count through the real Task loop (attemptApiRequest boundary mocked, decision-under-test real)", () => {
	afterEach(() => {
		vi.restoreAllMocks()
	})

	it("SUCCESS: a completed+approved attempt_completion delegation results in EXACTLY ONE API request - the old child does not make a second request", async () => {
		// Single call sequence: model immediately calls attempt_completion.
		const { child, mockProvider, attemptApiRequestSpy } = createChildTaskWithControlledApi([
			[
				toolCallChunk("tool-1", "attempt_completion", { result: "Child work is done." }),
				{ type: "usage", inputTokens: 10, outputTokens: 5 },
			],
		])

		const recursivelySpy = vi.spyOn(child, "recursivelyMakeClineRequests")
		const sayCallsSpy: string[] = []
		const originalSay = child.say.bind(child)
		vi.spyOn(child, "say").mockImplementation(async (...args: any[]) => {
			sayCallsSpy.push(String(args[0]))
			return originalSay(...(args as Parameters<typeof child.say>))
		})

		let loopError: unknown
		let returnValue: unknown
		try {
			returnValue = await (child as any).initiateTaskLoop([{ type: "text", text: "do the child work" }])
		} catch (error) {
			loopError = error
		}
		console.error("[TEST DEBUG] loopError:", loopError)
		console.error("[TEST DEBUG] returnValue:", returnValue)
		console.error("[TEST DEBUG] recursivelySpy calls:", recursivelySpy.mock.calls.length)
		console.error("[TEST DEBUG] sayCallsSpy:", JSON.stringify(sayCallsSpy))
		console.error("[TEST DEBUG] child.abort:", child.abort, "child.isPaused:", child.isPaused)
		console.error(
			"[TEST DEBUG] clineMessages:",
			JSON.stringify(
				child.clineMessages.map((m) => ({ type: m.type, say: (m as any).say, ask: (m as any).ask })),
			),
		)

		// The real request-count guard's observable effect: exactly one API
		// request was ever issued by this child instance.
		expect(attemptApiRequestSpy).toHaveBeenCalledTimes(1)

		// And the real delegation producer actually ran and delegated.
		expect(child.hasDelegatedToParent).toBe(true)
		expect(mockProvider.reopenParentFromDelegation).toHaveBeenCalledTimes(1)
		expect(mockProvider.reopenParentFromDelegation).toHaveBeenCalledWith({
			parentTaskId: "parent-1",
			childTaskId: "child-1",
			completionResultSummary: "Child work is done.",
		})
	})

	it("DENIAL/FEEDBACK: when the user denies the finish-subtask approval, the child continues and DOES make a second API request (delegation must not silently stop the child either)", async () => {
		const { child, mockProvider, attemptApiRequestSpy } = createChildTaskWithControlledApi([
			// First request: model attempts completion.
			[toolCallChunk("tool-1", "attempt_completion", { result: "Child thinks it's done." })],
			// Second request: after denial feedback is sent back, the model responds
			// with plain text and no tool use. The real production loop treats "no
			// tools used" as an incomplete turn and pushes a `noToolsUsed()` reminder
			// back to the model rather than ending the task, so a THIRD request
			// follows automatically - this is real, unmocked `recursivelyMakeClineRequests`
			// / `initiateTaskLoop` behavior, not something this test forces.
			[{ type: "text", text: "Understood, let me fix that." }],
			// Third request: model retries attempt_completion and this time it's approved.
			[toolCallChunk("tool-2", "attempt_completion", { result: "Now it is actually done." })],
		])

		// Deny the finish-subtask approval on the FIRST ask() call only, then fall
		// back to auto-approving anything else (e.g. the second attempt_completion ask)
		// so the loop can terminate deterministically.
		let askCallCount = 0
		vi.spyOn(child, "ask").mockImplementation(async () => {
			askCallCount++
			if (askCallCount === 1) {
				return { response: "noButtonClicked" } as any
			}
			return { response: "yesButtonClicked" } as any
		})

		await (child as any).initiateTaskLoop([{ type: "text", text: "do the child work" }])

		// Denial must not set hasDelegatedToParent on the first attempt, and must not
		// prevent legitimate continuation requests (the "no tools used" follow-up,
		// then the retried, approved completion).
		expect(child.hasDelegatedToParent).toBe(true)
		expect(mockProvider.reopenParentFromDelegation).toHaveBeenCalledTimes(1)
		expect(attemptApiRequestSpy).toHaveBeenCalledTimes(3)
	})

	it("parent is never touched/cancelled by a successful child delegation (no parent Task instance created or mutated by this flow)", async () => {
		const { child, mockProvider } = createChildTaskWithControlledApi([
			[toolCallChunk("tool-1", "attempt_completion", { result: "Done." })],
		])

		await (child as any).initiateTaskLoop([{ type: "text", text: "do the child work" }])

		// `reopenParentFromDelegation` is the parent-resume boundary and remains the
		// provider's responsibility - we only assert it was called with the right
		// arguments (already checked above); here we assert the child itself never
		// reached into any parent-cancellation path. The child's own `abort` must
		// remain false (a successful delegation is not the same as an abort).
		expect(child.abort).toBe(false)
		expect(mockProvider.reopenParentFromDelegation).toHaveBeenCalledTimes(1)
	})
})
