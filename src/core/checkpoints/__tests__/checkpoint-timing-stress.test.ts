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

	it("checkpoint handler НЕ должен писать в userMessageContentReady (single-writer stress test)", async () => {
		await initCheckpointService()
		expect(checkpointHandler).toBeDefined()

		// Test case 1: Checkpoint event fires во время streaming
		mockTask.userMessageContentReady = false
		const eventPayload1 = { fromHash: "abc123", toHash: "def456", suppressMessage: false }
		checkpointHandler!(eventPayload1)

		await new Promise((resolve) => setTimeout(resolve, 20))

		// Флаг ДОЛЖЕН остаться false (checkpoint handler не пишет его)
		expect(mockTask.userMessageContentReady).toBe(false)

		// Test case 2: Симуляция race condition - task loop resetsфлаг для нового turn
		// presentAssistantMessage установил флаг для предыдущего turn
		mockTask.userMessageContentReady = true

		// Task loop начинает новый turn и сбрасывает флаг
		mockTask.userMessageContentReady = false

		// Delayed checkpoint event fires (из предыдущего turn)
		const eventPayload2 = { fromHash: "old1", toHash: "old2", suppressMessage: false }
		checkpointHandler!(eventPayload2)

		// Даем время на handler
		await new Promise((resolve) => setTimeout(resolve, 30))

		// Флаг ДОЛЖЕН остаться false (handler не воскрешает флаг)
		// Это ключевой тест: до fix handler писал true и ломал следующий turn
		expect(mockTask.userMessageContentReady).toBe(false)

		// Test case 3: Множественные rapid checkpoint events
		checkpointHandler!({ fromHash: "c1", toHash: "c2", suppressMessage: false })
		checkpointHandler!({ fromHash: "c2", toHash: "c3", suppressMessage: false })
		checkpointHandler!({ fromHash: "c3", toHash: "c4", suppressMessage: false })

		await new Promise((resolve) => setTimeout(resolve, 50))

		// Флаг все еще false - checkpoint handlers НЕ пишут его
		expect(mockTask.userMessageContentReady).toBe(false)

		// Только presentAssistantMessage устанавливает флаг
		mockTask.userMessageContentReady = true
		expect(mockTask.userMessageContentReady).toBe(true)
	})
})
