import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { Task } from "../Task"
import type { ClineProvider } from "../../webview/ClineProvider"
import type { ProviderSettings } from "@ai-code-orchestrator/types"

/**
 * Test suite to verify that unhandled rejections from Task.start() are properly caught
 */
describe("Task.start() unhandled rejection handling", () => {
	let mockProvider: Partial<ClineProvider>
	let mockApiConfiguration: ProviderSettings
	let consoleErrorSpy: ReturnType<typeof vi.spyOn>

	beforeEach(() => {
		// Mock API configuration
		mockApiConfiguration = {
			apiProvider: "anthropic",
			apiModelId: "claude-3-5-sonnet-20241022",
		} as ProviderSettings

		// Mock provider with minimal required functionality
		mockProvider = {
			postStateToWebview: vi.fn().mockResolvedValue(undefined),
			postStateToWebviewWithoutTaskHistory: vi.fn().mockResolvedValue(undefined),
			getGlobalState: vi.fn().mockReturnValue({
				get: vi.fn().mockReturnValue(undefined),
				update: vi.fn().mockResolvedValue(undefined),
			}),
			getWorkspaceState: vi.fn().mockReturnValue({
				get: vi.fn().mockReturnValue(undefined),
				update: vi.fn().mockResolvedValue(undefined),
			}),
			outputChannel: {
				appendLine: vi.fn(),
			},
			context: {
				globalStorageUri: {
					fsPath: "/tmp/test-storage",
				},
			},
		} as any

		// Spy on console.error to verify it's called
		consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
	})

	afterEach(() => {
		consoleErrorSpy.mockRestore()
	})

	it("should catch and log rejection from startTask when task throws during initialization", async () => {
		// Create a task instance with proper constructor signature
		const task = new Task({
			provider: mockProvider as ClineProvider,
			apiConfiguration: mockApiConfiguration,
			task: "test task",
			images: undefined,
			startTask: false, // Don't auto-start in constructor
		})

		// Mock startTask to throw an error
		const originalStartTask = (task as any).startTask
		;(task as any).startTask = vi.fn().mockRejectedValue(new Error("Initialization failed"))

		// Call start() - it should not throw
		expect(() => task.start()).not.toThrow()

		// Wait for the promise to be rejected and caught
		await new Promise((resolve) => setTimeout(resolve, 50))

		// Verify console.error was called with the rejection
		expect(consoleErrorSpy).toHaveBeenCalledWith(
			expect.stringContaining("Unhandled rejection from startTask"),
			expect.any(Error),
		)

		// Cleanup
		;(task as any).startTask = originalStartTask
	})

	it("should catch and log rejection when startTask throws after say() call", async () => {
		const task = new Task({
			provider: mockProvider as ClineProvider,
			apiConfiguration: mockApiConfiguration,
			task: "test task",
			images: undefined,
			startTask: false,
		})

		// Mock say to throw an error
		const originalSay = (task as any).say
		;(task as any).say = vi.fn().mockRejectedValue(new Error("Say failed"))

		// Call start() - it should not throw
		expect(() => task.start()).not.toThrow()

		// Wait for the promise to be rejected and caught
		await new Promise((resolve) => setTimeout(resolve, 50))

		// Verify console.error was called
		expect(consoleErrorSpy).toHaveBeenCalledWith(
			expect.stringContaining("Unhandled rejection from startTask"),
			expect.any(Error),
		)

		// Cleanup
		;(task as any).say = originalSay
	})

	it("should not log error when task is abandoned during startTask", async () => {
		const task = new Task({
			provider: mockProvider as ClineProvider,
			apiConfiguration: mockApiConfiguration,
			task: "test task",
			images: undefined,
			startTask: false,
		})

		// Mock startTask to set abandoned flag and throw
		const originalStartTask = (task as any).startTask
		;(task as any).startTask = vi.fn().mockImplementation(async () => {
			;(task as any).abandoned = true
			throw new Error("Task abandoned")
		})

		// Call start()
		task.start()

		// Wait for the promise to be rejected and caught
		await new Promise((resolve) => setTimeout(resolve, 50))

		// Verify console.error was NOT called because task was abandoned
		expect(consoleErrorSpy).not.toHaveBeenCalled()

		// Cleanup
		;(task as any).startTask = originalStartTask
	})

	it("should handle multiple start() calls gracefully", async () => {
		const task = new Task({
			provider: mockProvider as ClineProvider,
			apiConfiguration: mockApiConfiguration,
			task: "test task",
			images: undefined,
			startTask: false,
		})

		// Mock startTask
		const startTaskMock = vi.fn().mockResolvedValue(undefined)
		;(task as any).startTask = startTaskMock

		// Call start() multiple times
		task.start()
		task.start()
		task.start()

		// Wait for promises
		await new Promise((resolve) => setTimeout(resolve, 50))

		// Verify startTask was only called once due to _started guard
		expect(startTaskMock).toHaveBeenCalledTimes(1)
	})
})
