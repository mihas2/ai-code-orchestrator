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
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import { presentAssistantMessage } from "../presentAssistantMessage"
import type { Task } from "../../task/Task"

describe("presentAssistantMessage - Write Tool Hang Fix", () => {
	let mockTask: Partial<Task>
	let askApprovalDelay: number

	beforeEach(() => {
		askApprovalDelay = 0

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
			cwd: "/test",

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

				// Simulate the call from Task.ts after stream completes
				// This should set userMessageContentReady=true even though locked
				await presentAssistantMessage(mockTask as Task)

				// After the locked call, userMessageContentReady should be true!
				expect(mockTask.userMessageContentReady).toBe(true)
			}

			return { response: "yesButtonClicked" }
		})

		// Start the first presentAssistantMessage call
		await presentAssistantMessage(mockTask as Task)

		// Verify final state
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
		mockTask.ask = vi.fn().mockImplementation(async () => {
			approvalCallCount++

			if (approvalCallCount === 1) {
				await new Promise((resolve) => setTimeout(resolve, 50))

				// Stream NOT complete yet
				mockTask.didCompleteReadingStream = false

				// Call presentAssistantMessage while locked
				await presentAssistantMessage(mockTask as Task)

				// Should NOT set flag because stream is not complete
				expect(mockTask.userMessageContentReady).toBe(false)
			}

			return { response: "yesButtonClicked" }
		})

		// Start the first presentAssistantMessage call
		await presentAssistantMessage(mockTask as Task)

		// After tool completes and index increments, flag should be set
		expect(mockTask.userMessageContentReady).toBe(true)
		expect(mockTask.currentStreamingContentIndex).toBe(1)
	})

	it("should NOT set flag when locked if not out of bounds", async () => {
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
		mockTask.ask = vi.fn().mockImplementation(async () => {
			approvalCallCount++

			if (approvalCallCount === 1) {
				await new Promise((resolve) => setTimeout(resolve, 50))

				// Stream completes
				mockTask.didCompleteReadingStream = true

				// Call presentAssistantMessage while locked
				// idx=0, len=2 → NOT out of bounds
				await presentAssistantMessage(mockTask as Task)

				// Should NOT set flag because not out of bounds
				expect(mockTask.userMessageContentReady).toBe(false)
			}

			return { response: "yesButtonClicked" }
		})

		// Start the first presentAssistantMessage call
		await presentAssistantMessage(mockTask as Task)

		// Flag should still be false because there's another block to process
		expect(mockTask.userMessageContentReady).toBe(false)
		expect(mockTask.currentStreamingContentIndex).toBe(1)
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
		mockTask.ask = vi.fn().mockImplementation(async () => {
			approvalCallCount++

			if (approvalCallCount === 1) {
				await new Promise((resolve) => setTimeout(resolve, 50))

				mockTask.didCompleteReadingStream = true

				// Simulate multiple calls while locked (like streaming hundreds of updates)
				for (let i = 0; i < 5; i++) {
					await presentAssistantMessage(mockTask as Task)
					lockedCallCount++
				}

				// After all locked calls, flag should be set once
				expect(mockTask.userMessageContentReady).toBe(true)
				expect(lockedCallCount).toBe(5)
			}

			return { response: "yesButtonClicked" }
		})

		// Start the first presentAssistantMessage call
		await presentAssistantMessage(mockTask as Task)

		// Verify final state
		expect(mockTask.userMessageContentReady).toBe(true)
		expect(mockTask.presentAssistantMessageHasPendingUpdates).toBe(false)
	})
})
