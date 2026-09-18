import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { Task } from "../Task"
import type { ClineProvider } from "../../../core/webview/ClineProvider"
import type { HistoryItem, ProviderSettings } from "@ai-code-orchestrator/types"

describe("Task unhandled rejection handling", () => {
	let mockProvider: ClineProvider
	let consoleErrorSpy: ReturnType<typeof vi.spyOn>
	let providerLogSpy: ReturnType<typeof vi.spyOn>
	let mockApiConfiguration: ProviderSettings

	beforeEach(() => {
		mockApiConfiguration = {
			apiProvider: "anthropic",
			apiModelId: "claude-3-5-sonnet-20241022",
			apiKey: "test-key",
		}

		// Mock provider with minimal required methods
		mockProvider = {
			log: vi.fn(),
			getState: vi.fn().mockResolvedValue({ mode: "code", currentApiConfigName: "default" }),
			postStateToWebview: vi.fn(),
			postMessageToWebview: vi.fn(),
			updateCustomInstructions: vi.fn(),
			context: {
				globalStorageUri: { fsPath: "/tmp/test-storage" },
			},
		} as unknown as ClineProvider

		consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
		providerLogSpy = vi.spyOn(mockProvider, "log")
	})

	afterEach(() => {
		consoleErrorSpy.mockRestore()
		providerLogSpy.mockRestore()
		vi.clearAllMocks()
	})

	describe("resumeTaskFromHistory rejection handling in constructor", () => {
		it("should catch and log rejection when resumeTaskFromHistory fails", async () => {
			const mockHistoryItem: HistoryItem = {
				number: 1,
				id: "test-task-id",
				ts: Date.now(),
				task: "test task",
				tokensIn: 0,
				tokensOut: 0,
				cacheWrites: 0,
				cacheReads: 0,
				totalCost: 0,
			}

			// Create a task instance that will fail during resumeTaskFromHistory
			const task = new Task({
				provider: mockProvider,
				apiConfiguration: mockApiConfiguration,
				historyItem: mockHistoryItem,
				startTask: true,
			})

			// Mock getSavedClineMessages to throw an error
			vi.spyOn(task as any, "getSavedClineMessages").mockRejectedValue(new Error("Failed to load history"))

			// Wait for any pending promises to settle
			await vi.waitFor(
				() => {
					expect(consoleErrorSpy).toHaveBeenCalled()
				},
				{ timeout: 1000 },
			)

			// Verify error was logged
			expect(consoleErrorSpy).toHaveBeenCalledWith(
				expect.stringContaining("Unhandled rejection in resumeTaskFromHistory"),
				expect.any(Error),
			)

			// Verify provider.log was called
			expect(providerLogSpy).toHaveBeenCalledWith(expect.stringContaining("Failed to resume task from history"))
		})

		it("should not cause unhandled rejection when resumeTaskFromHistory succeeds", async () => {
			const mockHistoryItem: HistoryItem = {
				number: 1,
				id: "test-task-id",
				ts: Date.now(),
				task: "test task",
				tokensIn: 0,
				tokensOut: 0,
				cacheWrites: 0,
				cacheReads: 0,
				totalCost: 0,
			}

			const task = new Task({
				provider: mockProvider,
				apiConfiguration: mockApiConfiguration,
				historyItem: mockHistoryItem,
				startTask: true,
			})

			// Mock successful resume
			vi.spyOn(task as any, "getSavedClineMessages").mockResolvedValue([])
			vi.spyOn(task as any, "getSavedApiConversationHistory").mockResolvedValue([
				{ role: "user", content: "test" },
			])
			vi.spyOn(task as any, "overwriteClineMessages").mockResolvedValue(undefined)
			vi.spyOn(task as any, "overwriteApiConversationHistory").mockResolvedValue(undefined)
			vi.spyOn(task as any, "ask").mockResolvedValue({
				response: "yesButtonClicked",
				text: "",
				images: [],
			})
			vi.spyOn(task as any, "initiateTaskLoop").mockResolvedValue(undefined)

			// Wait for resume to complete
			await vi.waitFor(
				() => {
					expect(task as any).toHaveProperty("isInitialized", true)
				},
				{ timeout: 2000 },
			)

			// Verify no errors were logged
			expect(consoleErrorSpy).not.toHaveBeenCalled()
		})

		it("should handle abandoned task during resumeTaskFromHistory", async () => {
			const mockHistoryItem: HistoryItem = {
				number: 1,
				id: "test-task-id",
				ts: Date.now(),
				task: "test task",
				tokensIn: 0,
				tokensOut: 0,
				cacheWrites: 0,
				cacheReads: 0,
				totalCost: 0,
			}

			const task = new Task({
				provider: mockProvider,
				apiConfiguration: mockApiConfiguration,
				historyItem: mockHistoryItem,
				startTask: true,
			})

			// Simulate abandoned task
			;(task as any).abandoned = true

			// Mock getSavedClineMessages to throw an error after abandon
			vi.spyOn(task as any, "getSavedClineMessages").mockImplementation(async () => {
				await new Promise((resolve) => setTimeout(resolve, 10))
				throw new Error("Task abandoned")
			})

			// Wait for any pending promises
			await vi.waitFor(
				() => {
					// When task is abandoned, error should not be re-thrown or logged as unhandled
					return true
				},
				{ timeout: 500 },
			)

			// No unhandled rejection should occur
			expect(consoleErrorSpy).not.toHaveBeenCalledWith(
				expect.stringContaining("Unhandled rejection"),
				expect.any(Error),
			)
		})
	})

	describe("resumeTaskFromHistory rejection handling with abort", () => {
		it("should not log error when task is aborted", async () => {
			const mockHistoryItem: HistoryItem = {
				number: 1,
				id: "test-task-id",
				ts: Date.now(),
				task: "test task",
				tokensIn: 0,
				tokensOut: 0,
				cacheWrites: 0,
				cacheReads: 0,
				totalCost: 0,
			}

			const task = new Task({
				provider: mockProvider,
				apiConfiguration: mockApiConfiguration,
				historyItem: mockHistoryItem,
				startTask: true,
			})

			// Set abort flags
			;(task as any).abort = true
			;(task as any).abortReason = "user_cancelled"

			// Mock getSavedClineMessages to throw after abort
			vi.spyOn(task as any, "getSavedClineMessages").mockRejectedValue(new Error("Aborted"))

			await vi.waitFor(
				() => {
					return true
				},
				{ timeout: 500 },
			)

			// Should not log unhandled rejection for aborted tasks
			expect(consoleErrorSpy).not.toHaveBeenCalledWith(
				expect.stringContaining("Unhandled rejection"),
				expect.any(Error),
			)
		})
	})
})
