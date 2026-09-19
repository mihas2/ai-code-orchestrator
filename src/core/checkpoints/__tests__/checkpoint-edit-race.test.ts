// npx vitest run src/core/checkpoints/__tests__/checkpoint-edit-race.test.ts
//
// Regression test for the `userMessageContentReady` race condition described in
// plans/checkpoint-race-condition-audit.md.
//
// Root cause (pre-fix): the `checkpoint` event handler in `checkpoints/index.ts`
// wrote `task.userMessageContentReady = true` from an unsynchronized fire-and-forget
// IIFE, after `await task.say("checkpoint_saved", ...)`. Because the real owner of
// this flag is `presentAssistantMessage()` (which resets it to `false` at the start
// of every new API request / partial-block handling in Task.ts), the event handler's
// write could race with those resets:
//   - If the event handler's delayed write happened to land AFTER the loop reset the
//     flag to `false` for the *next* turn, `pWaitFor(() => this.userMessageContentReady)`
//     in `recursivelyMakeClineRequests` would incorrectly resolve early for the wrong
//     turn, OR (depending on timing) never observe a `true` value at all and hang
//     forever, since nothing else in that turn would set it.
//
// The fix removes the write entirely: the checkpoint handler is now UI-only (chat
// message + webview notification). `checkpointSave()` is already `await`-ed
// synchronously from `presentAssistantMessage`'s `checkpointSaveAndMark`, so the task
// loop's progress never depended on the event firing in the first place.
//
// These tests assert the *current* (fixed) behavior: the checkpoint event handler
// must never write to `task.userMessageContentReady`, regardless of how the
// `say("checkpoint_saved", ...)` promise is timed relative to the task loop's own
// resets of that flag. Before the fix, the "does not resurrect a reset flag" test
// below would fail (the flag would flip back to `true` after the handler's delayed
// write), demonstrating the exact class of bug this change eliminates.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { getCheckpointService } from "../index"

vi.mock("vscode")
vi.mock("../../../services/checkpoints")
vi.mock("../../../utils/git", () => ({
	checkGitInstalled: vi.fn().mockResolvedValue(true),
}))

describe("Checkpoint event handler / userMessageContentReady race (regression)", () => {
	let mockTask: any
	let mockProvider: any
	let mockCheckpointService: any
	let checkpointHandler: ((payload: any) => void) | undefined

	// `getCheckpointService` only registers the "checkpoint" event listener when it
	// actually goes through `RepoPerTaskCheckpointService.create(...)` (the
	// `task.checkpointService` cache-hit early-return path does NOT call `.on(...)`).
	// We must configure the auto-mocked static factory to return our fake service so
	// the real registration code path (`checkGitInstallation`) runs.
	async function initCheckpointService() {
		const checkpointsModule = await import("../../../services/checkpoints")
		vi.mocked(checkpointsModule.RepoPerTaskCheckpointService.create).mockReturnValue(mockCheckpointService)
		await getCheckpointService(mockTask)
	}

	beforeEach(() => {
		vi.spyOn(console, "log").mockImplementation(() => {})
		vi.spyOn(console, "error").mockImplementation(() => {})

		checkpointHandler = undefined

		mockCheckpointService = {
			isInitialized: true,
			saveCheckpoint: vi.fn(),
			on: vi.fn((event: string, handler: any) => {
				if (event === "checkpoint") {
					checkpointHandler = handler
				}
			}),
			initShadowGit: vi.fn(),
		}

		mockProvider = {
			log: vi.fn(),
			context: { globalStorageUri: { fsPath: "/mock/storage" } },
			postMessageToWebview: vi.fn(),
		}

		mockTask = {
			taskId: "race-task",
			instanceId: "race-instance",
			enableCheckpoints: true,
			checkpointTimeout: 15,
			checkpointService: undefined,
			checkpointServiceInitializing: false,
			cwd: "/mock/workspace",
			abort: false,
			abandoned: false,
			clineMessages: [],
			// The field under test: only `presentAssistantMessage()` is allowed to
			// write to this in production code. Here we simulate the task loop's
			// own management of it independently of the checkpoint handler.
			userMessageContentReady: false,
			providerRef: { deref: () => mockProvider },
			say: vi.fn(async () => {}),
		}
	})

	afterEach(() => {
		vi.clearAllMocks()
	})

	it("T3: does not resurrect userMessageContentReady after the task loop resets it for the next turn", async () => {
		// Simulate `say("checkpoint_saved")` resolving slowly (e.g. slow disk I/O,
		// as described in the audit's reproduction recipe in section 7.5).
		let resolveSay: () => void
		mockTask.say.mockImplementation(
			() =>
				new Promise<void>((resolve) => {
					resolveSay = resolve
				}),
		)

		await initCheckpointService()
		expect(checkpointHandler).toBeDefined()

		// Turn N: presentAssistantMessage marks the flag ready after finishing the
		// edit tool's block (this happens synchronously in the real code, driven by
		// `checkpointSaveAndMark` having already awaited `checkpointSave()`).
		mockTask.userMessageContentReady = true

		// The checkpoint event (emitted synchronously inside `saveCheckpoint`) fires
		// now. Its `say()` call is in flight but not yet resolved.
		checkpointHandler!({ fromHash: "abc123", toHash: "def456", suppressMessage: false })

		// Task loop proceeds to the NEXT turn and resets the flag at the start of a
		// new API request (mirrors `Task.ts` resetting `userMessageContentReady =
		// false` before streaming the next assistant response).
		mockTask.userMessageContentReady = false

		// Now the slow `say()` call finally resolves.
		resolveSay!()
		await new Promise((resolve) => setImmediate(resolve))
		await new Promise((resolve) => setImmediate(resolve))

		// FIX ASSERTION: the checkpoint handler must NOT have written `true` back
		// into the flag after the loop already reset it to `false` for the new turn.
		// Under the old buggy code (`task.userMessageContentReady = true` inside the
		// handler), this assertion would fail because the delayed write would land
		// after our manual reset above and flip the flag back to `true`,
		// corrupting the next turn's wait condition.
		expect(mockTask.userMessageContentReady).toBe(false)
	})

	it("T3b: never writes to userMessageContentReady even when say() resolves quickly", async () => {
		mockTask.say.mockResolvedValue(undefined)

		await initCheckpointService()
		expect(checkpointHandler).toBeDefined()

		mockTask.userMessageContentReady = false

		checkpointHandler!({ fromHash: "aaa", toHash: "bbb", suppressMessage: false })
		await new Promise((resolve) => setImmediate(resolve))
		await new Promise((resolve) => setImmediate(resolve))

		// Regardless of timing, the handler is UI-only and must never touch this flag.
		expect(mockTask.userMessageContentReady).toBe(false)
	})

	it("RW-3: skips say() when task is already aborted before the event fires", async () => {
		mockTask.abort = true

		await initCheckpointService()
		expect(checkpointHandler).toBeDefined()

		checkpointHandler!({ fromHash: "abc", toHash: "def", suppressMessage: false })
		await new Promise((resolve) => setImmediate(resolve))

		expect(mockTask.say).not.toHaveBeenCalled()
		expect(mockProvider.log).toHaveBeenCalledWith(expect.stringContaining("skipping checkpoint message"))
	})

	it("RW-3: skips say() when task is already abandoned before the event fires", async () => {
		mockTask.abandoned = true

		await initCheckpointService()
		expect(checkpointHandler).toBeDefined()

		checkpointHandler!({ fromHash: "abc", toHash: "def", suppressMessage: false })
		await new Promise((resolve) => setImmediate(resolve))

		expect(mockTask.say).not.toHaveBeenCalled()
	})

	it("RW-3: does not throw and stops early if task becomes aborted while say() is in flight", async () => {
		let resolveSay: () => void
		mockTask.say.mockImplementation(
			() =>
				new Promise<void>((resolve) => {
					resolveSay = resolve
				}),
		)

		await initCheckpointService()
		expect(checkpointHandler).toBeDefined()

		expect(() => checkpointHandler!({ fromHash: "abc", toHash: "def", suppressMessage: false })).not.toThrow()

		// Task gets aborted while `say()` is still pending (e.g. user cancelled task
		// tree, or a sibling delegation caused the parent to be disposed).
		mockTask.abort = true

		resolveSay!()
		await new Promise((resolve) => setImmediate(resolve))
		await new Promise((resolve) => setImmediate(resolve))

		// No crash, and no further writes to state on a disposed/aborted instance.
		expect(mockTask.enableCheckpoints).toBe(true)
		expect(mockTask.userMessageContentReady).toBe(false)
	})

	it("RW-3: does not throw and stops early if task becomes abandoned while say() is in flight", async () => {
		let resolveSay: () => void
		mockTask.say.mockImplementation(
			() =>
				new Promise<void>((resolve) => {
					resolveSay = resolve
				}),
		)

		await initCheckpointService()
		expect(checkpointHandler).toBeDefined()

		checkpointHandler!({ fromHash: "abc", toHash: "def", suppressMessage: false })

		mockTask.abandoned = true

		resolveSay!()
		await new Promise((resolve) => setImmediate(resolve))
		await new Promise((resolve) => setImmediate(resolve))

		expect(mockTask.enableCheckpoints).toBe(true)
	})

	it("still performs its UI duties (webview notification) regardless of say() timing", async () => {
		mockTask.say.mockResolvedValue(undefined)

		await initCheckpointService()
		expect(checkpointHandler).toBeDefined()

		checkpointHandler!({ fromHash: "aaa", toHash: "bbb", suppressMessage: false })
		await new Promise((resolve) => setImmediate(resolve))

		expect(mockProvider.postMessageToWebview).toHaveBeenCalledWith(
			expect.objectContaining({ type: "currentCheckpointUpdated", text: "bbb" }),
		)
	})
})
