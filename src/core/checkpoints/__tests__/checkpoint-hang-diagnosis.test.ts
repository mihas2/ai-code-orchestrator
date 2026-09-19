// npx vitest run src/core/checkpoints/__tests__/checkpoint-hang-diagnosis.test.ts

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { Task } from "../../task/Task"
import { checkpointSave, getCheckpointService } from "../index"
import * as vscode from "vscode"

vi.mock("vscode")
vi.mock("../../../services/checkpoints")
vi.mock("../../../utils/git")

describe("Checkpoint Hang Diagnosis - Fixed", () => {
	let mockTask: any
	let mockProvider: any
	let mockCheckpointService: any
	let consoleLogSpy: any
	let consoleErrorSpy: any

	beforeEach(() => {
		// Spy on console methods to verify logging
		consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {})
		consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

		// Create mock checkpoint service
		mockCheckpointService = {
			isInitialized: false,
			saveCheckpoint: vi.fn(),
			on: vi.fn(),
			initShadowGit: vi.fn(),
		}

		// Create mock provider
		mockProvider = {
			log: vi.fn(),
			context: {
				globalStorageUri: {
					fsPath: "/mock/storage",
				},
			},
			postMessageToWebview: vi.fn(),
		}

		// Create mock task
		mockTask = {
			taskId: "test-task",
			instanceId: "test-instance",
			enableCheckpoints: true,
			checkpointTimeout: 15,
			checkpointService: undefined,
			checkpointServiceInitializing: false,
			cwd: "/mock/workspace",
			abort: false,
			clineMessages: [],
			providerRef: {
				deref: () => mockProvider,
			},
			say: vi.fn(async () => {}),
		}
	})

	afterEach(() => {
		vi.clearAllMocks()
		consoleLogSpy.mockRestore()
		consoleErrorSpy.mockRestore()
	})

	describe("FIX: checkpoint save with abort=true", () => {
		it("should skip checkpoint message when task is aborted", async () => {
			// Setup: Task is aborted
			mockTask.abort = true
			mockCheckpointService.isInitialized = true
			mockCheckpointService.saveCheckpoint.mockResolvedValue({
				commit: "test-hash",
			})
			mockTask.checkpointService = mockCheckpointService

			// Simulate task.say throwing error when abort is true
			mockTask.say.mockImplementation(async () => {
				if (mockTask.abort) {
					throw new Error("task aborted")
				}
			})

			// This should complete without throwing
			await checkpointSave(mockTask, false, true)

			// Verify diagnostic logging was added
			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Starting checkpoint save"))
		})

		it("should handle abort during checkpoint event gracefully", async () => {
			// Setup: Service is initialized
			mockCheckpointService.isInitialized = true
			mockTask.checkpointService = mockCheckpointService

			// Setup checkpoint event handler
			let checkpointHandler: any
			mockCheckpointService.on.mockImplementation((event: string, handler: any) => {
				if (event === "checkpoint") {
					checkpointHandler = handler
				}
			})

			// Task starts normal, then aborts
			mockTask.abort = false
			mockTask.say.mockImplementation(async () => {
				if (mockTask.abort) {
					throw new Error("task aborted")
				}
			})

			// Initialize service
			await getCheckpointService(mockTask)

			// Set abort flag
			mockTask.abort = true

			// Trigger checkpoint event - should not throw
			if (checkpointHandler) {
				// The fix wraps this in an async IIFE with try-catch
				checkpointHandler({
					type: "checkpoint",
					fromHash: "abc123",
					toHash: "def456",
					duration: 100,
					suppressMessage: false,
				})

				// Give the async handler time to execute
				await new Promise((resolve) => setTimeout(resolve, 10))

				// Verify the abort was detected and logged
				expect(mockProvider.log).toHaveBeenCalledWith(
					expect.stringContaining("skipping checkpoint message - task aborted"),
				)

				// task.say should NOT have been called
				expect(mockTask.say).not.toHaveBeenCalled()
			}
		})
	})

	describe("FIX: enhanced error logging", () => {
		it("should log checkpoint save start and completion", async () => {
			// Setup
			mockCheckpointService.isInitialized = true
			mockCheckpointService.saveCheckpoint.mockResolvedValue({
				commit: "test-hash",
			})
			mockTask.checkpointService = mockCheckpointService

			// Execute
			await checkpointSave(mockTask, false, true)

			// Verify diagnostic logs
			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Starting checkpoint save"))
			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Checkpoint save completed"))
		})

		it("should log when checkpoints are disabled", async () => {
			// Setup
			mockTask.enableCheckpoints = false

			// Execute
			await getCheckpointService(mockTask)

			// Verify
			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Checkpoints disabled"))
		})

		it("should log service initialization progress", async () => {
			// Setup
			mockTask.checkpointServiceInitializing = true
			mockCheckpointService.isInitialized = false
			mockTask.checkpointService = undefined

			// Simulate initialization completing after 100ms
			setTimeout(() => {
				mockTask.checkpointService = mockCheckpointService
				mockCheckpointService.isInitialized = true
			}, 100)

			// Execute
			await getCheckpointService(mockTask, { interval: 50 })

			// Verify initialization was logged
			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Service already initializing"))
			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("waiting for service to initialize"))
		})
	})

	describe("FIX: error handling improvements", () => {
		it("should wrap checkpoint save errors properly", async () => {
			// Setup
			mockCheckpointService.isInitialized = true
			mockCheckpointService.saveCheckpoint.mockRejectedValue(new Error("Save failed"))
			mockTask.checkpointService = mockCheckpointService

			// Execute - should not throw (errors are logged)
			await checkpointSave(mockTask, false, true)

			// Verify error was logged
			expect(consoleErrorSpy).toHaveBeenCalledWith(
				expect.stringContaining("Failed to save checkpoint"),
				expect.any(Error),
			)

			// Checkpoints should be disabled after error
			expect(mockTask.enableCheckpoints).toBe(false)
		})

		it("should handle pWaitFor timeout gracefully", async () => {
			// Setup: Service never initializes
			mockTask.checkpointServiceInitializing = true
			mockTask.checkpointService = undefined
			mockTask.checkpointTimeout = 0.1 // 100ms timeout

			// Execute
			const result = await getCheckpointService(mockTask, { interval: 50 })

			// Should return undefined
			expect(result).toBeUndefined()

			// Should disable checkpoints
			expect(mockTask.enableCheckpoints).toBe(false)

			// Should log error
			expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("Service initialization timeout"))
		})
	})
})
