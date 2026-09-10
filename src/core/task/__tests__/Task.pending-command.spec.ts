// npx vitest run src/core/task/__tests__/Task.pending-command.spec.ts
//
// Tests for the backend-scoped pending-command approval API added to Task:
//   - pendingCommandApproval (private field)
//   - getPendingCommandApproval(ts)
//   - tryRespondToPendingCommandApproval(ts, response, text?, images?)
//
// Strategy: Object.create(Task.prototype) with minimal stubs — same pattern as
// ask-queued-message-drain.spec.ts. Autoapproval is disabled by returning
// { decision: "ask" } from the providerRef.deref() => undefined path
// (checkAutoApproval returns "ask" when state is undefined and type is "command").

import { Task } from "../Task"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build the minimal Task stub needed for ask() + the new pending-command API. */
async function makeTaskStub() {
	const task = Object.create(Task.prototype) as Task

	// Core ask() state
	;(task as any).abort = false
	;(task as any).clineMessages = []
	;(task as any).askResponse = undefined
	;(task as any).askResponseText = undefined
	;(task as any).askResponseImages = undefined
	;(task as any).lastMessageTs = undefined
	;(task as any).pendingCommandApproval = undefined

	// Message queue (used inside ask() polling)
	const { MessageQueueService } = await import("../../message-queue/MessageQueueService")
	;(task as any).messageQueueService = new MessageQueueService()

	// Minimal method stubs expected by ask()
	;(task as any).addToClineMessages = vi.fn(async () => {})
	;(task as any).saveClineMessages = vi.fn(async () => {})
	;(task as any).updateClineMessage = vi.fn(async () => {})
	;(task as any).cancelAutoApprovalTimeout = vi.fn(() => {})
	;(task as any).checkpointSave = vi.fn(async () => {})
	;(task as any).emit = vi.fn()
	// No provider => checkAutoApproval gets state=undefined => decision="ask" for "command"
	;(task as any).providerRef = { deref: () => undefined }

	// Additional methods called by handleWebviewAskResponse
	;(task as any).findLastIndex = vi.fn(() => -1)
	;(task as any).findMessageByTimestamp = vi.fn(() => undefined)

	return task
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("Task scoped pending-command approval API", () => {
	// -----------------------------------------------------------------------
	// 1. Full command ask registers the snapshot
	// -----------------------------------------------------------------------
	it("registers pendingCommandApproval for a full (non-partial) command ask", async () => {
		const task = await makeTaskStub()

		const ts1 = 1000
		// Override Date.now to control the ts
		vi.spyOn(Date, "now").mockReturnValueOnce(ts1)

		const askPromise = task.ask("command", "echo hello", undefined)

		// The snapshot should be set synchronously before the first await completes
		// (pWaitFor is mocked globally in vitest.setup; it resolves immediately).
		// Give the microtask queue a tick.
		await Promise.resolve()

		expect(task.getPendingCommandApproval(ts1)).toEqual({ ts: ts1, command: "echo hello" })

		// Clean up by responding so the promise doesn't hang.
		task.handleWebviewAskResponse("yesButtonClicked")
		await askPromise
	})

	// -----------------------------------------------------------------------
	// 2. Partial ask does NOT register a snapshot
	// -----------------------------------------------------------------------
	it("does NOT register pendingCommandApproval for partial=true command ask", async () => {
		const task = await makeTaskStub()

		const ts1 = 2000
		vi.spyOn(Date, "now").mockReturnValueOnce(ts1)

		// partial=true throws AskIgnoredError — catch it
		const { AskIgnoredError } = await import("../AskIgnoredError")
		await expect(task.ask("command", "echo partial", true)).rejects.toBeInstanceOf(AskIgnoredError)

		// No snapshot for partial
		expect(task.getPendingCommandApproval(ts1)).toBeUndefined()
	})

	// -----------------------------------------------------------------------
	// 3. getPendingCommandApproval returns undefined for wrong ts
	// -----------------------------------------------------------------------
	it("getPendingCommandApproval returns undefined for a mismatched ts", async () => {
		const task = await makeTaskStub()

		const ts1 = 3000
		vi.spyOn(Date, "now").mockReturnValueOnce(ts1)

		const askPromise = task.ask("command", "ls", undefined)
		await Promise.resolve()

		// Correct ts succeeds
		expect(task.getPendingCommandApproval(ts1)).toBeDefined()
		// Wrong ts returns undefined
		expect(task.getPendingCommandApproval(ts1 + 1)).toBeUndefined()

		task.handleWebviewAskResponse("yesButtonClicked")
		await askPromise
	})

	// -----------------------------------------------------------------------
	// 4. Snapshot carries the backend text (not UI override)
	// -----------------------------------------------------------------------
	it("getPendingCommandApproval returns the backend text passed to ask()", async () => {
		const task = await makeTaskStub()

		const ts1 = 4000
		vi.spyOn(Date, "now").mockReturnValueOnce(ts1)

		const askPromise = task.ask("command", "npm test", undefined)
		await Promise.resolve()

		const snap = task.getPendingCommandApproval(ts1)
		expect(snap?.command).toBe("npm test")

		task.handleWebviewAskResponse("yesButtonClicked")
		await askPromise
	})

	// -----------------------------------------------------------------------
	// 5. Non-command ask does NOT register a snapshot
	// -----------------------------------------------------------------------
	it("does NOT register pendingCommandApproval for type !== command", async () => {
		const task = await makeTaskStub()

		const ts1 = 5000
		vi.spyOn(Date, "now").mockReturnValueOnce(ts1)

		const askPromise = task.ask("followup", "Are you sure?", undefined)
		await Promise.resolve()

		expect(task.getPendingCommandApproval(ts1)).toBeUndefined()

		task.handleWebviewAskResponse("messageResponse", "yes")
		await askPromise
	})

	// -----------------------------------------------------------------------
	// 6. tryRespondToPendingCommandApproval returns true once, false on replay
	// -----------------------------------------------------------------------
	it("tryRespond returns true on first call and false on replay", async () => {
		const task = await makeTaskStub()

		const ts1 = 6000
		vi.spyOn(Date, "now").mockReturnValueOnce(ts1)

		const askPromise = task.ask("command", "make build", undefined)
		await Promise.resolve()

		// First call — should succeed
		const first = task.tryRespondToPendingCommandApproval(ts1, "yesButtonClicked")
		expect(first).toBe(true)

		// Second call with same ts — snapshot already consumed
		const second = task.tryRespondToPendingCommandApproval(ts1, "yesButtonClicked")
		expect(second).toBe(false)

		await askPromise
	})

	// -----------------------------------------------------------------------
	// 7. After handleWebviewAskResponse the getter returns undefined
	// -----------------------------------------------------------------------
	it("getPendingCommandApproval returns undefined after normal handleWebviewAskResponse", async () => {
		const task = await makeTaskStub()

		const ts1 = 7000
		vi.spyOn(Date, "now").mockReturnValueOnce(ts1)

		const askPromise = task.ask("command", "git status", undefined)
		await Promise.resolve()

		expect(task.getPendingCommandApproval(ts1)).toBeDefined()

		// Normal webview response (simulates user clicking approve in the UI)
		task.handleWebviewAskResponse("yesButtonClicked")

		// Snapshot must be cleared
		expect(task.getPendingCommandApproval(ts1)).toBeUndefined()

		await askPromise
	})

	// -----------------------------------------------------------------------
	// 8. supersedePendingAsk clears the snapshot
	// -----------------------------------------------------------------------
	it("supersedePendingAsk prevents scoped response", async () => {
		const task = await makeTaskStub()

		const ts1 = 8000
		vi.spyOn(Date, "now").mockReturnValueOnce(ts1)

		// Start the ask — it will block on pWaitFor (which is mocked to resolve immediately
		// in the global setup, so we need to manually set lastMessageTs to supersede it).
		// We capture the promise but do NOT await yet.
		const askPromise = task.ask("command", "rm -rf /tmp/x", undefined)
		await Promise.resolve()

		// Snapshot should exist
		expect(task.getPendingCommandApproval(ts1)).toBeDefined()

		// Supersede — changes lastMessageTs, making the ask stale
		task.supersedePendingAsk()

		// Getter must now return undefined (snapshot cleared + ts mismatch)
		expect(task.getPendingCommandApproval(ts1)).toBeUndefined()

		// tryRespond must also return false
		expect(task.tryRespondToPendingCommandApproval(ts1, "yesButtonClicked")).toBe(false)

		// The original ask will throw AskIgnoredError("superseded") — catch it
		const { AskIgnoredError } = await import("../AskIgnoredError")
		await expect(askPromise).rejects.toBeInstanceOf(AskIgnoredError)
	})

	// -----------------------------------------------------------------------
	// 9. abortTask clears the snapshot (via dispose)
	// -----------------------------------------------------------------------
	it("abortTask prevents scoped response", async () => {
		const task = await makeTaskStub()

		// Provide minimal extra stubs required by abortTask/dispose
		;(task as any).taskId = "test-task-abort"
		;(task as any).instanceId = "inst-1"
		;(task as any).globalStoragePath = "/tmp"
		;(task as any).cancelCurrentRequest = vi.fn()
		;(task as any).providerProfileChangeListener = undefined
		;(task as any).messageQueueStateChangedHandler = undefined
		;(task as any).emitFinalTokenUsageUpdate = vi.fn()
		;(task as any).aicoIgnoreController = undefined
		;(task as any).fileContextTracker = { dispose: vi.fn() }
		;(task as any).diffViewProvider = { isEditing: false, revertChanges: vi.fn() }
		;(task as any).isStreaming = false
		;(task as any).removeAllListeners = vi.fn()
		;(task as any).idleAsk = undefined
		;(task as any).resumableAsk = undefined
		;(task as any).interactiveAsk = undefined
		;(task as any).saveClineMessages = vi.fn(async () => {})

		const ts1 = 9000
		vi.spyOn(Date, "now").mockReturnValueOnce(ts1)

		// Manually set the snapshot as if ask() had set it (we don't call ask() here
		// because abortTask + dispose race is what we're testing, not ask() lifecycle)
		;(task as any).lastMessageTs = ts1
		;(task as any).pendingCommandApproval = Object.freeze({ ts: ts1, command: "dangerous-cmd" })

		expect(task.getPendingCommandApproval(ts1)).toBeDefined()

		await task.abortTask()

		// After abort, snapshot must be cleared and abort flag set
		expect(task.getPendingCommandApproval(ts1)).toBeUndefined()
		expect(task.tryRespondToPendingCommandApproval(ts1, "yesButtonClicked")).toBe(false)
	})

	// -----------------------------------------------------------------------
	// 10. text === undefined uses empty string in snapshot
	// -----------------------------------------------------------------------
	it("snapshot command is empty string when text is undefined", async () => {
		const task = await makeTaskStub()

		const ts1 = 10000
		vi.spyOn(Date, "now").mockReturnValueOnce(ts1)

		const askPromise = task.ask("command", undefined, undefined)
		await Promise.resolve()

		const snap = task.getPendingCommandApproval(ts1)
		expect(snap?.command).toBe("")

		task.handleWebviewAskResponse("yesButtonClicked")
		await askPromise
	})

	// -----------------------------------------------------------------------
	// 11. claimCommandApproval returns snapshot token, then stale on replay
	// -----------------------------------------------------------------------
	it("claimCommandApproval returns snapshot on first call, false on replay", async () => {
		const task = await makeTaskStub()

		const ts1 = 11000
		vi.spyOn(Date, "now").mockReturnValueOnce(ts1)

		const askPromise = task.ask("command", "cargo test", undefined)
		await Promise.resolve()

		// First claim succeeds and returns the snapshot
		const token = task.claimCommandApproval(ts1)
		expect(token).toBeDefined()
		expect(token).not.toBe(false)
		if (!token) throw new Error("unreachable")
		expect(token.command).toBe("cargo test")
		expect(token.ts).toBe(ts1)

		// After claim, getPendingCommandApproval returns undefined (snapshot moved to claimed)
		expect(task.getPendingCommandApproval(ts1)).toBeUndefined()

		// Second claim with same ts returns false (duplicate)
		expect(task.claimCommandApproval(ts1)).toBe(false)

		// Clean up
		task.commitCommandApproval(token, "yesButtonClicked")
		await askPromise
	})

	// -----------------------------------------------------------------------
	// 12. commitCommandApproval forwards response; false on wrong token
	// -----------------------------------------------------------------------
	it("commitCommandApproval returns true and forwards response; false for wrong token", async () => {
		const task = await makeTaskStub()

		const ts1 = 12000
		vi.spyOn(Date, "now").mockReturnValueOnce(ts1)

		const askPromise = task.ask("command", "make test", undefined)
		await Promise.resolve()

		const token = task.claimCommandApproval(ts1)
		if (!token) throw new Error("claim must succeed")

		// Wrong token object → false, no side-effects
		const fakeToken = { ts: ts1, command: "make test" }
		expect(task.commitCommandApproval(fakeToken, "yesButtonClicked")).toBe(false)

		// Correct token → true, ask resolves
		expect(task.commitCommandApproval(token, "yesButtonClicked")).toBe(true)

		// Replay commit → false (already consumed)
		expect(task.commitCommandApproval(token, "yesButtonClicked")).toBe(false)

		await askPromise
	})

	// -----------------------------------------------------------------------
	// 13. releaseCommandApproval restores pending so a retry can claim again
	// -----------------------------------------------------------------------
	it("releaseCommandApproval restores snapshot so retry can claimCommandApproval", async () => {
		const task = await makeTaskStub()

		const ts1 = 13000
		vi.spyOn(Date, "now").mockReturnValueOnce(ts1)

		const askPromise = task.ask("command", "pytest", undefined)
		await Promise.resolve()

		const token = task.claimCommandApproval(ts1)
		if (!token) throw new Error("claim must succeed")

		// Snapshot is gone from pending
		expect(task.getPendingCommandApproval(ts1)).toBeUndefined()

		// Release restores it
		task.releaseCommandApproval(token)

		// Now pending is visible again
		expect(task.getPendingCommandApproval(ts1)).toBeDefined()

		// And a new claim succeeds
		const token2 = task.claimCommandApproval(ts1)
		expect(token2).not.toBe(false)
		if (!token2) throw new Error("unreachable")

		// Release of old token is a no-op (wrong reference)
		task.releaseCommandApproval(token) // token !== token2 (different reference? — actually same obj by content but not identity if release re-freezes)

		// Commit with token2
		task.commitCommandApproval(token2, "yesButtonClicked")
		await askPromise
	})

	// -----------------------------------------------------------------------
	// 14. handleWebviewAskResponse invalidates claimed token
	// -----------------------------------------------------------------------
	it("handleWebviewAskResponse invalidates the claimed token (commit returns false)", async () => {
		const task = await makeTaskStub()

		const ts1 = 14000
		vi.spyOn(Date, "now").mockReturnValueOnce(ts1)

		const askPromise = task.ask("command", "go test", undefined)
		await Promise.resolve()

		const token = task.claimCommandApproval(ts1)
		if (!token) throw new Error("claim must succeed")

		// Another path responds via handleWebviewAskResponse
		task.handleWebviewAskResponse("yesButtonClicked")

		// commit must now return false — token was invalidated
		expect(task.commitCommandApproval(token, "yesButtonClicked")).toBe(false)

		await askPromise
	})

	// -----------------------------------------------------------------------
	// 15. concurrent identical submissions: one claim, one drop
	// -----------------------------------------------------------------------
	it("concurrent identical claim calls: exactly one succeeds, one gets false", async () => {
		const task = await makeTaskStub()

		const ts1 = 15000
		vi.spyOn(Date, "now").mockReturnValueOnce(ts1)

		const askPromise = task.ask("command", "npm run build", undefined)
		await Promise.resolve()

		// Simulate two concurrent yesAndAllow arriving synchronously
		const token1 = task.claimCommandApproval(ts1)
		const token2 = task.claimCommandApproval(ts1)

		// Exactly one succeeds
		const successes = [token1, token2].filter((t) => t !== false)
		const failures = [token1, token2].filter((t) => t === false)
		expect(successes).toHaveLength(1)
		expect(failures).toHaveLength(1)

		// Commit the winning token
		const winner = successes[0] as Readonly<{ ts: number; command: string }>
		task.commitCommandApproval(winner, "yesButtonClicked")
		await askPromise
	})

	// -----------------------------------------------------------------------
	// 16. save failure: release permits retry (claim succeeds after release)
	// -----------------------------------------------------------------------
	it("save failure: releaseCommandApproval allows a subsequent successful claim", async () => {
		const task = await makeTaskStub()

		const ts1 = 16000
		vi.spyOn(Date, "now").mockReturnValueOnce(ts1)

		const askPromise = task.ask("command", "docker build .", undefined)
		await Promise.resolve()

		// First attempt: claim succeeds
		const token = task.claimCommandApproval(ts1)
		if (!token) throw new Error("claim must succeed")

		// Save fails → release
		task.releaseCommandApproval(token)

		// Retry: claim should succeed again
		const token2 = task.claimCommandApproval(ts1)
		expect(token2).not.toBe(false)
		if (!token2) throw new Error("retry claim must succeed")

		task.commitCommandApproval(token2, "yesButtonClicked")
		await askPromise
	})

	// -----------------------------------------------------------------------
	// 17. delayed getValue: claim → ordinary response → release/commit are no-ops
	//
	// Simulates the async "yesAndAllow" handler path:
	//   1. Handler claims the token (atomic, synchronous).
	//   2. While handler awaits getValue() (settings read), an ordinary
	//      response arrives via handleWebviewAskResponse — this clears
	//      claimedCommandApproval and sets askResponse.
	//   3. After getValue resolves, the handler calls releaseCommandApproval
	//      (save failure path) or commitCommandApproval (success path).
	//      Both must be no-ops because the claimed slot was already cleared.
	//   4. No additional handleWebviewAskResponse call fires from commit.
	// -----------------------------------------------------------------------
	it("delayed getValue: ordinary response during claim invalidates token — release/commit are no-ops", async () => {
		const task = await makeTaskStub()

		const ts1 = 17000
		vi.spyOn(Date, "now").mockReturnValueOnce(ts1)

		const askPromise = task.ask("command", "kubectl apply -f k8s.yaml", undefined)
		await Promise.resolve()

		// ── Phase 1: handler claims the token (synchronous, before any await) ─
		const token = task.claimCommandApproval(ts1)
		expect(token).not.toBe(false)
		if (!token) throw new Error("claim must succeed")

		// Pending slot is now empty (snapshot moved to claimed)
		expect(task.getPendingCommandApproval(ts1)).toBeUndefined()

		// ── Phase 2: ordinary response arrives while handler awaits getValue ──
		// handleWebviewAskResponse clears claimedCommandApproval and sets askResponse.
		task.handleWebviewAskResponse("yesButtonClicked")

		// The ask resolves via the ordinary response
		await askPromise

		// ── Phase 3: handler's getValue resolves; it tries to release or commit ─

		// releaseCommandApproval: token no longer matches (already cleared) → no-op
		// Critically, pendingCommandApproval must NOT be restored.
		task.releaseCommandApproval(token)
		expect(task.getPendingCommandApproval(ts1)).toBeUndefined()
		expect((task as any).pendingCommandApproval).toBeUndefined()

		// commitCommandApproval: token not the active claimed token → returns false
		const committed = task.commitCommandApproval(token, "yesButtonClicked")
		expect(committed).toBe(false)

		// handleWebviewAskResponse (cancelAutoApprovalTimeout stub) called exactly
		// once — from the ordinary response above, NOT from commit.
		expect((task as any).cancelAutoApprovalTimeout).toHaveBeenCalledTimes(1)
	})

	// -----------------------------------------------------------------------
	// 18. delayed getValue: abort during claim → release/commit are no-ops
	// -----------------------------------------------------------------------
	it("delayed getValue: abort during claim invalidates token — release is no-op, commit returns false", async () => {
		const task = await makeTaskStub()

		const ts1 = 18000
		vi.spyOn(Date, "now").mockReturnValueOnce(ts1)

		const askPromise = task.ask("command", "rm -rf /tmp/build", undefined)
		await Promise.resolve()

		// Claim the token
		const token = task.claimCommandApproval(ts1)
		expect(token).not.toBe(false)
		if (!token)
			throw new Error("claim must succeed")

			// Simulate abort: abort flag is set, claimedCommandApproval is cleared
			// (mirrors what Task.dispose / abortTask does)
		;(task as any).abort = true
		;(task as any).claimedCommandApproval = undefined

		// releaseCommandApproval: token not the active claimed token → no-op
		// pendingCommandApproval must NOT be restored.
		task.releaseCommandApproval(token)
		expect((task as any).pendingCommandApproval).toBeUndefined()

		// commitCommandApproval: token not active → false (no side-effects)
		const committed = task.commitCommandApproval(token, "yesButtonClicked")
		expect(committed).toBe(false)

		// Clean up: reset abort flag and send a response so the ask doesn't hang
		;(task as any).abort = false
		task.handleWebviewAskResponse("noButtonClicked")
		await askPromise
	})
})
