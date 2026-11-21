/**
 * Test: presentAssistantMessage - Write Tool Hang Fix
 *
 * This test validates the fix for a critical race condition where userMessageContentReady
 * would never be set to true, causing infinite hang in pWaitFor().
 *
 * Root Cause:
 * 1. presentAssistantMessage() locks and calls writeToFileTool.handle()
 * 2. writeToFileTool.handle() takes a LONG time (askApproval waits for user)
 * 3. While locked, stream completes → didCompleteReadingStream=true
 * 4. Task.ts calls presentAssistantMessage() to set the flag
 * 5. BUT function is LOCKED → returns early without setting flag!
 * 6. After unlock, recursive call happens but flag is still false
 * 7. Task hangs in pWaitFor(() => this.userMessageContentReady)
 *
 * Fix: Check and set userMessageContentReady even when locked, if conditions are met.
 *
 * Current lock contract (JOINABLE): a call made while locked does not return early; it
 * flags pending updates and awaits the active execution, which drains them before
 * releasing the lock. These tests therefore fire the "locked" calls the way Task.ts does
 * (from outside the running tool, without awaiting them inside it) and check the state
 * once the owner and every joiner have settled. Awaiting a joiner from inside the
 * running tool would deadlock, because the joiner waits for that very execution.
 */

import * as fs from "fs"
import * as os from "os"
import * as path from "path"

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { presentAssistantMessage } from "../presentAssistantMessage"
import type { Task } from "../../task/Task"

describe("presentAssistantMessage - Write Tool Hang Fix", () => {
	let mockTask: Partial<Task>
	let askApprovalDelay: number
	// write_to_file creates parent directories on the real file system before approval,
	// so the task must point at a writable workspace (an absolute "/test" fails with EACCES).
	let workspaceDir: string

	beforeEach(() => {
		askApprovalDelay = 0
		workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "write-tool-hang-"))

		mockTask = {
			taskId: "test-task",
			instanceId: "1",
			abort: false,
			presentAssistantMessageLocked: false,
			presentAssistantMessageHasPendingUpdates: false,
			currentStreamingContentIndex: 0,
			assistantMessageContent: [],
			didCompleteReadingStream: false,
			userMessageContentReady: false,
			didRejectTool: false,
			didAlreadyUseTool: false,
			currentStreamingDidCheckpoint: false,
			consecutiveMistakeCount: 0,
			userMessageContent: [],
			cwd: workspaceDir,

			// Mock methods
			ask: vi.fn().mockResolvedValue({ response: "yesButtonClicked" }),
			say: vi.fn().mockResolvedValue(undefined),
			pushToolResultToUserContent: vi.fn(),
			recordToolUsage: vi.fn(),
			checkpointSave: vi.fn().mockResolvedValue(undefined),

			// Mock providers
			providerRef: {
				deref: () => ({
					getState: async () => ({
						mode: "code",
						experiments: {},
						diagnosticsEnabled: true,
						writeDelayMs: 0,
					}),
				}),
			} as any,

			diffViewProvider: {
				editType: undefined,
				isEditing: false,
				originalContent: "",
				open: vi.fn().mockResolvedValue(undefined),
				update: vi.fn().mockResolvedValue(undefined),
				saveChanges: vi.fn().mockResolvedValue(undefined),
				saveDirectly: vi.fn().mockResolvedValue(undefined),
				reset: vi.fn().mockResolvedValue(undefined),
				revertChanges: vi.fn().mockResolvedValue(undefined),
				pushToolWriteResult: vi.fn().mockResolvedValue("File written"),
				scrollToFirstDiff: vi.fn(),
			} as any,

			fileContextTracker: {
				trackFileContext: vi.fn().mockResolvedValue(undefined),
			} as any,

			aicoIgnoreController: {
				validateAccess: vi.fn().mockReturnValue(true),
			} as any,

			aicoProtectedController: {
				isWriteProtected: vi.fn().mockReturnValue(false),
			} as any,

			api: {
				getModel: () => ({ id: "claude-3-5-sonnet" }),
			} as any,

			processQueuedMessages: vi.fn(),
			recordToolError: vi.fn(),

			toolRepetitionDetector: {
				check: vi.fn().mockReturnValue({ allowExecution: true }),
			} as any,
		}
	})

	afterEach(() => {
		fs.rmSync(workspaceDir, { recursive: true, force: true })
	})

	it("should set userMessageContentReady=true when locked if stream completes", async () => {
		// Setup: One write_to_file tool block
		mockTask.assistantMessageContent = [
			{
				type: "tool_use",
				id: "toolu_write_1",
				name: "write_to_file",
				params: {
					path: "test.txt",
					content: "test content",
				},
				nativeArgs: {
					path: "test.txt",
					content: "test content",
				},
				partial: false,
			},
		]

		// Simulate slow askApproval that allows stream to complete during lock
		let approvalCallCount = 0
		const joiners: Promise<void>[] = []
		mockTask.ask = vi.fn().mockImplementation(async () => {
			approvalCallCount++

			// On first call (askApproval in writeToFileTool):
			// - Simulate delay to allow stream to complete
			// - While delayed, another presentAssistantMessage call comes in
			if (approvalCallCount === 1) {
				// Wait a bit to simulate user thinking
				await new Promise((resolve) => setTimeout(resolve, 50))

				// During this delay, stream completes and calls presentAssistantMessage
				// In real scenario, this happens from Task.ts line 3722
				mockTask.didCompleteReadingStream = true

				// Simulate the call from Task.ts after stream completes (not awaited here)
				expect(mockTask.presentAssistantMessageLocked).toBe(true)
				joiners.push(presentAssistantMessage(mockTask as Task))
			}

			return { response: "yesButtonClicked" }
		})

		// Start the first presentAssistantMessage call
		await presentAssistantMessage(mockTask as Task)
		await Promise.all(joiners)

		// The locked call must not be lost: the flag ends up set and the lock released
		expect(joiners).toHaveLength(1)
		expect(mockTask.userMessageContentReady).toBe(true)
		expect(mockTask.currentStreamingContentIndex).toBe(1)
		expect(mockTask.presentAssistantMessageLocked).toBe(false)
	})

	it("should NOT set flag when locked if stream is not complete", async () => {
		// Setup: One write_to_file tool block
		mockTask.assistantMessageContent = [
			{
				type: "tool_use",
				id: "toolu_write_1",
				name: "write_to_file",
				params: {
					path: "test.txt",
					content: "test content",
				},
				nativeArgs: {
					path: "test.txt",
					content: "test content",
				},
				partial: false,
			},
		]

		// Simulate askApproval that allows another call during lock
		let approvalCallCount = 0
		const joiners: Promise<void>[] = []
		mockTask.ask = vi.fn().mockImplementation(async () => {
			approvalCallCount++

			if (approvalCallCount === 1) {
				await new Promise((resolve) => setTimeout(resolve, 50))

				// Stream NOT complete yet
				mockTask.didCompleteReadingStream = false

				// Call presentAssistantMessage while locked (not awaited here)
				joiners.push(presentAssistantMessage(mockTask as Task))

				// The locked call itself must not set the flag
				expect(mockTask.userMessageContentReady).toBe(false)
			}

			return { response: "yesButtonClicked" }
		})

		// Start the first presentAssistantMessage call
		await presentAssistantMessage(mockTask as Task)
		await Promise.all(joiners)

		// After tool completes and index increments, flag should be set
		expect(mockTask.userMessageContentReady).toBe(true)
		expect(mockTask.currentStreamingContentIndex).toBe(1)
	})

	it("should NOT set flag from a locked call while blocks remain, and drain them before setting it", async () => {
		// Setup: TWO blocks - write_to_file and text
		mockTask.assistantMessageContent = [
			{
				type: "tool_use",
				id: "toolu_write_1",
				name: "write_to_file",
				params: {
					path: "test.txt",
					content: "test content",
				},
				nativeArgs: {
					path: "test.txt",
					content: "test content",
				},
				partial: false,
			},
			{
				type: "text",
				content: "File created successfully",
				partial: false,
			},
		]

		// Simulate askApproval that allows another call during lock
		let approvalCallCount = 0
		const joiners: Promise<void>[] = []
		mockTask.ask = vi.fn().mockImplementation(async () => {
			approvalCallCount++

			if (approvalCallCount === 1) {
				await new Promise((resolve) => setTimeout(resolve, 50))

				// Stream completes
				mockTask.didCompleteReadingStream = true

				// Call presentAssistantMessage while locked (not awaited here)
				// idx=0, len=2 → NOT out of bounds
				joiners.push(presentAssistantMessage(mockTask as Task))

				// Should NOT set flag because not out of bounds
				expect(mockTask.userMessageContentReady).toBe(false)
			}

			return { response: "yesButtonClicked" }
		})

		// Start the first presentAssistantMessage call
		await presentAssistantMessage(mockTask as Task)
		await Promise.all(joiners)

		// The locked call flagged a pending update, so the owner drained the remaining
		// (complete) text block before releasing the lock; only then is the flag set.
		expect(mockTask.currentStreamingContentIndex).toBe(2)
		expect(mockTask.userMessageContentReady).toBe(true)
		expect(mockTask.presentAssistantMessageLocked).toBe(false)
	})

	it("should handle multiple locked calls correctly", async () => {
		// Setup: One write_to_file tool block
		mockTask.assistantMessageContent = [
			{
				type: "tool_use",
				id: "toolu_write_1",
				name: "write_to_file",
				params: {
					path: "test.txt",
					content: "test content",
				},
				nativeArgs: {
					path: "test.txt",
					content: "test content",
				},
				partial: false,
			},
		]

		let lockedCallCount = 0

		// Simulate askApproval that allows MULTIPLE calls during lock
		let approvalCallCount = 0
		const joiners: Promise<void>[] = []
		mockTask.ask = vi.fn().mockImplementation(async () => {
			approvalCallCount++

			if (approvalCallCount === 1) {
				await new Promise((resolve) => setTimeout(resolve, 50))

				mockTask.didCompleteReadingStream = true

				// Simulate multiple calls while locked (like streaming hundreds of updates)
				for (let i = 0; i < 5; i++) {
					joiners.push(presentAssistantMessage(mockTask as Task))
					lockedCallCount++
				}

				expect(lockedCallCount).toBe(5)
				expect(mockTask.presentAssistantMessageHasPendingUpdates).toBe(true)
			}

			return { response: "yesButtonClicked" }
		})

		// Start the first presentAssistantMessage call
		await presentAssistantMessage(mockTask as Task)
		await Promise.all(joiners)

		// Verify final state
		expect(mockTask.userMessageContentReady).toBe(true)
		expect(mockTask.presentAssistantMessageHasPendingUpdates).toBe(false)
	})
})
