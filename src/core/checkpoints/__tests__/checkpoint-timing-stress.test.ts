import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { getCheckpointService } from "../index"

vi.mock("vscode")
vi.mock("../../../services/checkpoints")
vi.mock("../../../utils/git", () => ({
	checkGitInstalled: vi.fn().mockResolvedValue(true),
}))

/**
 * Stress test to check timing variations in checkpoint save.
 *
 * Goal: ensure that removing `task.userMessageContentReady = true`
 * from checkpoint handler eliminated race condition between:
 * - checkpoint save (fire-and-forget async IIFE)
 * - presentAssistantMessage (the only legitimate writer of the flag)
 */
describe("Checkpoint timing stress test", () => {
	let mockTask: any
	let mockProvider: any
	let mockCheckpointService: any
	let checkpointHandler: ((payload: any) => void) | undefined

	async function initCheckpointService() {
		const checkpointsModule = await import("../../../services/checkpoints")
		vi.mocked(checkpointsModule.RepoPerTaskCheckpointService.create).mockReturnValue(mockCheckpointService)

		// Reset task state before init to ensure clean state
		mockTask.checkpointService = undefined
		mockTask.checkpointServiceInitializing = false
		checkpointHandler = undefined

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
			taskId: "stress-task",
			instanceId: "stress-instance",
			enableCheckpoints: true,
			checkpointTimeout: 15,
			checkpointService: undefined,
			checkpointServiceInitializing: false,
			cwd: "/mock/workspace",
			abort: false,
			abandoned: false,
			clineMessages: [],
			userMessageContentReady: false,
			providerRef: { deref: () => mockProvider },
			say: vi.fn(async () => {}),
		}
	})

	afterEach(() => {
		checkpointHandler = undefined
		vi.clearAllMocks()
		vi.restoreAllMocks()
	})

	it("checkpoint handler MUST NOT write to userMessageContentReady (single-writer stress test)", async () => {
		await initCheckpointService()
		expect(checkpointHandler).toBeDefined()

		// Test case 1: Checkpoint event fires during streaming
		mockTask.userMessageContentReady = false
		const eventPayload1 = { fromHash: "abc123", toHash: "def456", suppressMessage: false }
		checkpointHandler!(eventPayload1)

		await new Promise((resolve) => setTimeout(resolve, 20))

		// Flag MUST remain false (checkpoint handler does not write it)
		expect(mockTask.userMessageContentReady).toBe(false)

		// Test case 2: Simulating race condition - task loop resets flag for new turn
		// presentAssistantMessage set the flag for the previous turn
		mockTask.userMessageContentReady = true

		// Task loop starts new turn and resets flag
		mockTask.userMessageContentReady = false

		// Delayed checkpoint event fires (from previous turn)
		const eventPayload2 = { fromHash: "old1", toHash: "old2", suppressMessage: false }
		checkpointHandler!(eventPayload2)

		// Give time for handler to execute
		await new Promise((resolve) => setTimeout(resolve, 30))

		// Flag MUST remain false (handler does not resurrect the flag)
		// This is the key test: before fix, handler wrote true and broke the next turn
		expect(mockTask.userMessageContentReady).toBe(false)

		// Test case 3: Multiple rapid checkpoint events
		checkpointHandler!({ fromHash: "c1", toHash: "c2", suppressMessage: false })
		checkpointHandler!({ fromHash: "c2", toHash: "c3", suppressMessage: false })
		checkpointHandler!({ fromHash: "c3", toHash: "c4", suppressMessage: false })

		await new Promise((resolve) => setTimeout(resolve, 50))

		// Flag still false - checkpoint handlers do NOT write it
		expect(mockTask.userMessageContentReady).toBe(false)

		// Only presentAssistantMessage sets the flag
		mockTask.userMessageContentReady = true
		expect(mockTask.userMessageContentReady).toBe(true)
	})
})
