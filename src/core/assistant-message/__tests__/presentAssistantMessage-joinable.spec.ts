import { describe, it, expect, beforeEach, vi } from "vitest"
import { presentAssistantMessage } from "../presentAssistantMessage"
import type { Task } from "../../task/Task"

/**
 * Test suite for joinable presenter pattern
 *
 * Verifies that concurrent calls to presentAssistantMessage:
 * 1. Wait for active execution instead of returning immediately
 * 2. Don't create self-await deadlocks
 * 3. Process all pending updates via drain loop
 */
describe("presentAssistantMessage - joinable pattern", () => {
	let mockTask: any

	beforeEach(() => {
		mockTask = {
			taskId: "test-task",
			instanceId: "test-instance",
			abort: false,
			presentAssistantMessageLocked: false,
			presentAssistantMessageHasPendingUpdates: false,
			currentStreamingContentIndex: 0,
			didCompleteReadingStream: false,
			userMessageContentReady: false,
			assistantMessageContent: [],
			didRejectTool: false,
			didAlreadyUseTool: false,
			userMessageContent: [],
			pushToolResultToUserContent: vi.fn(),
			say: vi.fn().mockResolvedValue(undefined),
		}
	})

	it("should allow concurrent calls to wait for active execution", async () => {
		// Setup: Two text blocks to process
		mockTask.assistantMessageContent = [
			{ type: "text", text: "Block 1" },
			{ type: "text", text: "Block 2" },
		]
		mockTask.didCompleteReadingStream = true

		const callOrder: string[] = []

		// First call - will acquire lock and start processing
		const promise1 = presentAssistantMessage(mockTask as Task).then(() => {
			callOrder.push("call1-done")
		})

		// Second call - should wait for first to complete (joinable)
		const promise2 = presentAssistantMessage(mockTask as Task).then(() => {
			callOrder.push("call2-done")
		})

		await Promise.all([promise1, promise2])

		// Both calls should complete
		expect(callOrder).toContain("call1-done")
		expect(callOrder).toContain("call2-done")

		// All blocks should be processed
		expect(mockTask.currentStreamingContentIndex).toBe(2)
		expect(mockTask.presentAssistantMessageLocked).toBe(false)
	})

	it("should process pending updates via drain loop", async () => {
		mockTask.assistantMessageContent = [{ type: "text", text: "Block 1" }]
		mockTask.didCompleteReadingStream = true

		// Start processing
		const promise = presentAssistantMessage(mockTask as Task)

		// Simulate streaming adding more content
		mockTask.assistantMessageContent.push({ type: "text", text: "Block 2" })

		await promise

		// Both blocks should be processed by the drain loop
		expect(mockTask.currentStreamingContentIndex).toBe(2)
	})

	it("should handle abort during processing", async () => {
		mockTask.assistantMessageContent = [{ type: "text", text: "Block 1" }]
		mockTask.abort = true

		// Should throw immediately if aborted
		await expect(presentAssistantMessage(mockTask as Task)).rejects.toThrow("aborted")
	})

	it("should exit drain loop when no more pending updates", async () => {
		mockTask.assistantMessageContent = [{ type: "text", text: "Block 1" }]
		mockTask.didCompleteReadingStream = true

		await presentAssistantMessage(mockTask as Task)

		// Should have exited cleanly
		expect(mockTask.presentAssistantMessageLocked).toBe(false)
		expect(mockTask.userMessageContentReady).toBe(true)
	})

	it("should not create self-await deadlock in drain loop", async () => {
		mockTask.assistantMessageContent = [
			{ type: "text", text: "Block 1" },
			{ type: "text", text: "Block 2" },
		]
		mockTask.didCompleteReadingStream = true

		// This should complete without hanging (no self-await)
		await expect(presentAssistantMessage(mockTask as Task)).resolves.toBeUndefined()

		expect(mockTask.currentStreamingContentIndex).toBe(2)
	})

	// ============================================================================
	// LOCK CONTRACT REGRESSION TESTS
	//
	// These tests exercise the actual async gap between an owner call starting
	// execution and a joiner call arriving mid-execution, rather than relying on
	// two calls issued back-to-back in the same microtask tick. `say` is used as
	// a real `await` boundary (deferred with a manually-resolved promise) so a
	// joiner can genuinely observe `presentAssistantMessageLocked === true`
	// while the owner is still inside its awaited tool handling.
	// ============================================================================

	it("deferred barrier: joiner waits for a slow owner execution to actually finish (no lost wakeup)", async () => {
		let releaseSay: (() => void) | undefined
		const sayGate = new Promise<void>((resolve) => {
			releaseSay = resolve
		})

		mockTask.assistantMessageContent = [{ type: "text", text: "Block 1", partial: false }]
		mockTask.didCompleteReadingStream = true
		// Make `say` hang until we manually release it - this is the real async
		// gap the joiner must wait through.
		mockTask.say = vi.fn().mockImplementation(async () => {
			await sayGate
		})

		const ownerPromise = presentAssistantMessage(mockTask as Task)

		// Give the owner a tick to acquire the lock and enter the awaited `say`.
		await Promise.resolve()
		await Promise.resolve()
		expect(mockTask.presentAssistantMessageLocked).toBe(true)

		// Joiner arrives while owner is still blocked inside `say`.
		const joinerPromise = presentAssistantMessage(mockTask as Task)
		let joinerResolved = false
		joinerPromise.then(() => {
			joinerResolved = true
		})

		// The joiner must NOT resolve before the owner's await gate is released -
		// if it did, that would indicate a lost wakeup (joiner returning based on
		// a stale/null active-promise read instead of genuinely waiting).
		await Promise.resolve()
		await Promise.resolve()
		expect(joinerResolved).toBe(false)
		expect(mockTask.presentAssistantMessageLocked).toBe(true)

		// Release the owner's awaited call; both owner and joiner should now settle.
		releaseSay!()
		await Promise.all([ownerPromise, joinerPromise])

		expect(joinerResolved).toBe(true)
		expect(mockTask.presentAssistantMessageLocked).toBe(false)
	})

	it("rejection -> lock cleanup -> next call: a failing execution still releases the lock for the next caller", async () => {
		mockTask.assistantMessageContent = [{ type: "text", text: "Block 1", partial: false }]
		mockTask.didCompleteReadingStream = true

		const boom = new Error("say exploded")
		mockTask.say = vi.fn().mockRejectedValueOnce(boom).mockResolvedValue(undefined)

		// First call: the owner's core execution throws inside the awaited `say`.
		// The single outer `finally` in presentAssistantMessageCore must still run,
		// releasing the lock despite the thrown error propagating out.
		await expect(presentAssistantMessage(mockTask as Task)).rejects.toThrow("say exploded")

		expect(mockTask.presentAssistantMessageLocked).toBe(false)

		// Second call: with the lock released, a fresh call must be able to
		// acquire it and make real progress (not hang forever waiting on a
		// stale active-promise reference from the failed first call).
		mockTask.currentStreamingContentIndex = 0
		mockTask.userMessageContentReady = false
		mockTask.assistantMessageContent = [{ type: "text", text: "Block 2", partial: false }]

		await presentAssistantMessage(mockTask as Task)

		expect(mockTask.presentAssistantMessageLocked).toBe(false)
		expect(mockTask.userMessageContentReady).toBe(true)
		expect(mockTask.currentStreamingContentIndex).toBe(1)
	})

	it("joiner propagates rejection from the active owner execution instead of swallowing it", async () => {
		let rejectSay: ((error: Error) => void) | undefined
		const sayGate = new Promise<void>((_resolve, reject) => {
			rejectSay = reject
		})

		mockTask.assistantMessageContent = [{ type: "text", text: "Block 1", partial: false }]
		mockTask.didCompleteReadingStream = true
		mockTask.say = vi.fn().mockImplementation(async () => {
			await sayGate
		})

		const ownerPromise = presentAssistantMessage(mockTask as Task)

		// Let the owner acquire the lock and block inside `say`.
		await Promise.resolve()
		await Promise.resolve()
		expect(mockTask.presentAssistantMessageLocked).toBe(true)

		// Joiner arrives and must await the SAME failure the owner will see.
		const joinerPromise = presentAssistantMessage(mockTask as Task)

		const failure = new Error("owner execution failed")
		rejectSay!(failure)

		// Both the owner and the joiner must reject with the same underlying
		// error. The joiner must NOT resolve successfully nor swallow the error.
		await expect(ownerPromise).rejects.toThrow("owner execution failed")
		await expect(joinerPromise).rejects.toThrow("owner execution failed")

		// Lock must still be released afterward despite the failure.
		expect(mockTask.presentAssistantMessageLocked).toBe(false)
	})
})
