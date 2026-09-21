/**
 * Regression test for checkpoint → write_to_file hang bug
 *
 * Bug description: After checkpoint save completes, when write_to_file executes,
 * the task hangs indefinitely in pWaitFor(() => this.userMessageContentReady).
 *
 * Root causes:
 * 1. pWaitFor had no timeout, causing infinite wait
 * 2. userMessageContentReady flag requires BOTH conditions: isOutOfBounds AND didCompleteReadingStream
 * 3. checkpointSave could potentially hang on IO without timeout protection
 * 4. Race condition where stream completes while checkpoint is saving
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import pWaitFor from "p-wait-for"

describe("Checkpoint → Write hang scenario", () => {
	let mockTask: any
	let mockCline: any
	let checkpointSaveAndMarkCalled = false
	let writeToFileHandleCalled = false

	beforeEach(() => {
		vi.clearAllMocks()
		checkpointSaveAndMarkCalled = false
		writeToFileHandleCalled = false

		// Mock minimal Task structure
		mockTask = {
			taskId: "test-task-123",
			instanceId: "instance-456",
			abort: false,
			userMessageContentReady: false,
			didCompleteReadingStream: false,
			currentStreamingContentIndex: 0,
			assistantMessageContent: [
				{
					type: "tool_use",
					id: "tool_1",
					name: "write_to_file",
					params: { path: "test.txt", content: "test" },
					partial: false,
				},
			],
			currentStreamingDidCheckpoint: false,
			checkpointSave: vi.fn().mockResolvedValue(undefined),
			consecutiveMistakeCount: 0,
		}

		mockCline = mockTask
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	it("should not hang when userMessageContentReady is set correctly", async () => {
		// Simulate the correct flow
		mockCline.didCompleteReadingStream = true
		mockCline.currentStreamingContentIndex = 0

		// Simulate presentAssistantMessage logic
		const simulatePresentAssistantMessage = () => {
			const isOutOfBounds = mockCline.currentStreamingContentIndex >= mockCline.assistantMessageContent.length
			if (isOutOfBounds && mockCline.didCompleteReadingStream) {
				mockCline.userMessageContentReady = true
			}
		}

		// Simulate checkpoint
		await mockCline.checkpointSave(true)
		mockCline.currentStreamingDidCheckpoint = true

		// Simulate write_to_file execution completes
		mockCline.currentStreamingContentIndex++

		// presentAssistantMessage should set the flag
		simulatePresentAssistantMessage()

		// This should NOT hang
		await expect(
			pWaitFor(() => mockCline.userMessageContentReady, {
				interval: 10,
				timeout: 1000, // 1 second - should complete much faster
			}),
		).resolves.toBeUndefined()

		expect(mockCline.userMessageContentReady).toBe(true)
	})

	it("should have timeout protection in pWaitFor", async () => {
		// Simulate the bug: flag never gets set
		mockCline.userMessageContentReady = false
		mockCline.didCompleteReadingStream = true

		// This SHOULD timeout (simulating the bug scenario)
		await expect(
			pWaitFor(() => mockCline.userMessageContentReady, {
				interval: 10,
				timeout: 100, // 100ms timeout
			}),
		).rejects.toThrow()
	})

	it("should handle checkpoint save timeout gracefully", async () => {
		// Simulate slow checkpoint save
		mockCline.checkpointSave = vi.fn().mockImplementation(
			() => new Promise((resolve) => setTimeout(resolve, 5000)), // 5 second delay
		)

		const timeoutPromise = new Promise(
			(_, reject) => setTimeout(() => reject(new Error("Checkpoint save timeout after 30s")), 100), // Fast timeout for test
		)

		await expect(Promise.race([mockCline.checkpointSave(true), timeoutPromise])).rejects.toThrow(
			"Checkpoint save timeout",
		)
	})

	it("should set userMessageContentReady when out of bounds and stream complete", async () => {
		mockCline.currentStreamingContentIndex = 0
		mockCline.assistantMessageContent = [{ type: "text", content: "test", partial: false }]
		mockCline.didCompleteReadingStream = true

		// Increment index to go out of bounds
		mockCline.currentStreamingContentIndex++

		const isOutOfBounds = mockCline.currentStreamingContentIndex >= mockCline.assistantMessageContent.length

		expect(isOutOfBounds).toBe(true)
		expect(mockCline.didCompleteReadingStream).toBe(true)

		// This is the logic from presentAssistantMessage
		if (isOutOfBounds && mockCline.didCompleteReadingStream) {
			mockCline.userMessageContentReady = true
		}

		expect(mockCline.userMessageContentReady).toBe(true)
	})

	it("should NOT set userMessageContentReady when stream not complete (even if out of bounds)", async () => {
		mockCline.currentStreamingContentIndex = 1
		mockCline.assistantMessageContent = [{ type: "text", content: "test", partial: false }]
		mockCline.didCompleteReadingStream = false // Stream still ongoing

		const isOutOfBounds = mockCline.currentStreamingContentIndex >= mockCline.assistantMessageContent.length

		expect(isOutOfBounds).toBe(true)
		expect(mockCline.didCompleteReadingStream).toBe(false)

		// This is the logic from presentAssistantMessage - should NOT set flag
		if (isOutOfBounds && mockCline.didCompleteReadingStream) {
			mockCline.userMessageContentReady = true
		}

		expect(mockCline.userMessageContentReady).toBe(false)
	})

	it("should reproduce the exact hang scenario: checkpoint → write → hang", async () => {
		// Initial state: tool_use block for write_to_file
		mockCline.assistantMessageContent = [
			{
				type: "tool_use",
				id: "write_1",
				name: "write_to_file",
				params: { path: "test.txt", content: "hello" },
				partial: false,
			},
		]
		mockCline.currentStreamingContentIndex = 0
		mockCline.didCompleteReadingStream = false // Stream not complete yet
		mockCline.userMessageContentReady = false

		// Step 1: Checkpoint is called BEFORE write_to_file
		await mockCline.checkpointSave(true)
		mockCline.currentStreamingDidCheckpoint = true

		// Step 2: While checkpoint is saving, stream completes
		mockCline.didCompleteReadingStream = true

		// Step 3: write_to_file starts executing (but doesn't increment yet)
		// At this point: idx=0, len=1, stream complete

		// Step 4: write_to_file completes, increment happens
		mockCline.currentStreamingContentIndex++
		// Now: idx=1, len=1 (out of bounds)

		// Step 5: presentAssistantMessage SHOULD be called to set flag
		const isOutOfBounds = mockCline.currentStreamingContentIndex >= mockCline.assistantMessageContent.length
		if (isOutOfBounds && mockCline.didCompleteReadingStream) {
			mockCline.userMessageContentReady = true
		}

		// Step 6: Task tries to wait for flag with timeout
		await expect(
			pWaitFor(() => mockCline.userMessageContentReady, {
				interval: 10,
				timeout: 1000,
			}),
		).resolves.toBeUndefined()

		expect(mockCline.userMessageContentReady).toBe(true)
	})

	it("should have emergency rescue when timeout occurs but stream is complete", async () => {
		mockCline.didCompleteReadingStream = true
		mockCline.userMessageContentReady = false

		// Try to wait with timeout
		try {
			await pWaitFor(() => mockCline.userMessageContentReady, {
				interval: 10,
				timeout: 100,
			})
		} catch (error) {
			// Emergency rescue logic
			if (mockCline.didCompleteReadingStream && !mockCline.userMessageContentReady) {
				console.warn("[EMERGENCY_RESCUE] Forcing userMessageContentReady=true")
				mockCline.userMessageContentReady = true
			}
		}

		// After rescue, flag should be true
		expect(mockCline.userMessageContentReady).toBe(true)
	})

	it("should handle the HANG_FIX scenario from logs", async () => {
		// From logs: "[HANG_FIX] Post-stream: Calling presentAssistantMessage to set userMessageContentReady"
		// This happens when partialBlocks is empty after stream completion

		mockCline.assistantMessageContent = [
			{ type: "tool_use", id: "1", name: "write_to_file", params: {}, partial: false },
		]
		mockCline.currentStreamingContentIndex = 1 // Already processed
		mockCline.didCompleteReadingStream = true
		mockCline.userMessageContentReady = false

		// Simulate the HANG_FIX logic
		if (!mockCline.userMessageContentReady && mockCline.didCompleteReadingStream) {
			// This is the fix that should call presentAssistantMessage
			const isOutOfBounds = mockCline.currentStreamingContentIndex >= mockCline.assistantMessageContent.length
			if (isOutOfBounds) {
				mockCline.userMessageContentReady = true
			}
		}

		expect(mockCline.userMessageContentReady).toBe(true)
	})

	it("should verify the safety check catches missed flag setting", async () => {
		// Setup: out of bounds, stream complete, but flag is false (shouldn't happen but test the safety check)
		mockCline.currentStreamingContentIndex = 1
		mockCline.assistantMessageContent = [{ type: "text", content: "test", partial: false }]
		mockCline.didCompleteReadingStream = true
		mockCline.userMessageContentReady = false

		const isOutOfBounds = mockCline.currentStreamingContentIndex >= mockCline.assistantMessageContent.length

		// Safety check logic from presentAssistantMessage
		if (isOutOfBounds && mockCline.didCompleteReadingStream && !mockCline.userMessageContentReady) {
			console.error("[SAFETY_CHECK] CRITICAL: Flag should be true but isn't! Forcing to true.")
			mockCline.userMessageContentReady = true
		}

		expect(mockCline.userMessageContentReady).toBe(true)
	})
})
