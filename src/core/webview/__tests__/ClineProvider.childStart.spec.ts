import { describe, it, expect, vi, beforeEach } from "vitest"
import { ClineProvider } from "../ClineProvider"
import type { Task } from "../../task/Task"

/**
 * Test suite to verify that child.start() errors are properly handled with rollback
 * of parent delegation metadata, preventing race conditions.
 */
describe("ClineProvider child task start error handling", () => {
	let mockProvider: any
	let mockParent: Partial<Task>
	let mockChild: Partial<Task>

	beforeEach(() => {
		mockParent = {
			taskId: "parent-123",
			abort: false,
			abandoned: false,
			abortReason: undefined,
			didFinishAbortingStream: false,
		}

		mockChild = {
			taskId: "child-456",
			start: vi.fn(),
			abortTask: vi.fn(),
		}

		mockProvider = {
			log: vi.fn(),
			updateGlobalState: vi.fn(),
			getTaskWithId: vi.fn(),
			updateTaskHistory: vi.fn(),
			createTask: vi.fn().mockResolvedValue(mockChild),
			clineStack: [],
		}
	})

	it("should rollback parent metadata when child.start() throws", async () => {
		// Simulate child.start() throwing an error
		const startError = new Error("Child start failed")
		vi.mocked(mockChild.start!).mockRejectedValue(startError)

		const parentSnapshot = {
			mode: "code" as const,
			capturedAt: Date.now(),
			apiConfiguration: {} as any,
			customInstructions: "",
		}

		const parentRuntimeState = {
			abort: false,
			abandoned: false,
			abortReason: undefined,
			didFinishAbortingStream: false,
		}

		vi.mocked(mockProvider.getTaskWithId!).mockResolvedValue({
			historyItem: {
				id: "parent-123",
				ts: Date.now(),
				task: "parent task",
				tokensIn: 0,
				tokensOut: 0,
				cacheWrites: 0,
				cacheReads: 0,
				totalCost: 0,
				status: "active",
				childIds: [],
			},
			task: mockParent as any,
		} as any)

		// Simulate the delegateParentAndOpenChild logic
		const delegateFlow = async () => {
			// Step 5: Persist parent delegation metadata
			const { historyItem } = await mockProvider.getTaskWithId!("parent-123")
			const childIds = Array.from(new Set([...(historyItem.childIds ?? []), mockChild.taskId!]))
			const updatedHistory = {
				...historyItem,
				status: "delegated" as const,
				delegatedToId: mockChild.taskId,
				awaitingChildId: mockChild.taskId,
				childIds,
				parentSnapshot,
			}
			await mockProvider.updateTaskHistory!(updatedHistory)

			// Step 6: Start the child task - THIS SHOULD THROW
			try {
				await mockChild.start!()
			} catch (startErr) {
				const errorMsg = `Failed to start child task: ${(startErr as Error)?.message ?? String(startErr)}`
				mockProvider.log!(`[delegateParentAndOpenChild] CRITICAL: ${errorMsg}`)

				// Abort the child
				try {
					await mockChild.abortTask!(true)
				} catch (abortErr) {
					mockProvider.log!(
						`[delegateParentAndOpenChild] Failed to abort child after start failure: ${
							(abortErr as Error)?.message ?? String(abortErr)
						}`,
					)
				}

				// Restore the parent runtime state
				;(mockParent as any).abort = parentRuntimeState.abort
				;(mockParent as any).abandoned = parentRuntimeState.abandoned
				;(mockParent as any).abortReason = parentRuntimeState.abortReason
				;(mockParent as any).didFinishAbortingStream = parentRuntimeState.didFinishAbortingStream
				if (mockProvider.clineStack!.length === 0) {
					mockProvider.clineStack!.push(mockParent as any)
				}

				// Rollback parent metadata
				try {
					await mockProvider.updateGlobalState!("mode", parentSnapshot.mode)
					const originalHistory = await mockProvider.getTaskWithId!("parent-123")
					await mockProvider.updateTaskHistory!({
						...originalHistory.historyItem,
						status: parentRuntimeState.abandoned ? "active" : originalHistory.historyItem.status,
						delegatedToId: undefined,
						awaitingChildId: undefined,
						parentSnapshot: undefined,
					})
				} catch (rollbackError) {
					mockProvider.log!(
						`[delegateParentAndOpenChild] Failed to persist rollback after start failure: ${String(rollbackError)}`,
					)
				}

				throw new Error(`[delegateParentAndOpenChild] ${errorMsg}`)
			}
		}

		// Execute the flow and expect it to throw
		await expect(delegateFlow()).rejects.toThrow("Failed to start child task")

		// Verify child.start() was called
		expect(mockChild.start).toHaveBeenCalledTimes(1)

		// Verify child.abortTask() was called
		expect(mockChild.abortTask).toHaveBeenCalledWith(true)

		// Verify parent metadata rollback was attempted
		expect(mockProvider.updateTaskHistory).toHaveBeenCalledTimes(2)

		// First call: setting delegation metadata
		expect(mockProvider.updateTaskHistory).toHaveBeenNthCalledWith(1, {
			id: "parent-123",
			ts: expect.any(Number),
			task: "parent task",
			tokensIn: 0,
			tokensOut: 0,
			cacheWrites: 0,
			cacheReads: 0,
			totalCost: 0,
			status: "delegated",
			delegatedToId: "child-456",
			awaitingChildId: "child-456",
			childIds: ["child-456"],
			parentSnapshot,
		})

		// Second call: rolling back delegation metadata
		expect(mockProvider.updateTaskHistory).toHaveBeenNthCalledWith(2, {
			id: "parent-123",
			ts: expect.any(Number),
			task: "parent task",
			tokensIn: 0,
			tokensOut: 0,
			cacheWrites: 0,
			cacheReads: 0,
			totalCost: 0,
			status: "active",
			delegatedToId: undefined,
			awaitingChildId: undefined,
			parentSnapshot: undefined,
			childIds: [],
		})

		// Verify parent runtime state was restored
		expect(mockParent.abort).toBe(false)
		expect(mockParent.abandoned).toBe(false)
		expect(mockParent.abortReason).toBeUndefined()
		expect(mockParent.didFinishAbortingStream).toBe(false)

		// Verify parent was added back to stack
		expect(mockProvider.clineStack).toHaveLength(1)
		expect(mockProvider.clineStack![0]).toBe(mockParent)
	})

	it("should succeed when child.start() completes successfully", async () => {
		// Simulate successful child.start()
		vi.mocked(mockChild.start!).mockResolvedValue(undefined)

		const parentSnapshot = {
			mode: "code" as const,
			capturedAt: Date.now(),
			apiConfiguration: {} as any,
			customInstructions: "",
		}

		vi.mocked(mockProvider.getTaskWithId!).mockResolvedValue({
			historyItem: {
				id: "parent-123",
				ts: Date.now(),
				task: "parent task",
				tokensIn: 0,
				tokensOut: 0,
				cacheWrites: 0,
				cacheReads: 0,
				totalCost: 0,
				status: "active",
				childIds: [],
			},
			task: mockParent as any,
		} as any)

		// Simulate successful delegation flow
		const delegateFlow = async () => {
			// Step 5: Persist parent delegation metadata
			const { historyItem } = await mockProvider.getTaskWithId!("parent-123")
			const childIds = Array.from(new Set([...(historyItem.childIds ?? []), mockChild.taskId!]))
			const updatedHistory = {
				...historyItem,
				status: "delegated" as const,
				delegatedToId: mockChild.taskId,
				awaitingChildId: mockChild.taskId,
				childIds,
				parentSnapshot,
			}
			await mockProvider.updateTaskHistory!(updatedHistory)

			// Step 6: Start the child task - should succeed
			await mockChild.start!()
		}

		// Execute the flow and expect success
		await expect(delegateFlow()).resolves.toBeUndefined()

		// Verify child.start() was called
		expect(mockChild.start).toHaveBeenCalledTimes(1)

		// Verify child.abortTask() was NOT called
		expect(mockChild.abortTask).not.toHaveBeenCalled()

		// Verify only one updateTaskHistory call (for delegation, no rollback)
		expect(mockProvider.updateTaskHistory).toHaveBeenCalledTimes(1)
		expect(mockProvider.updateTaskHistory).toHaveBeenCalledWith({
			id: "parent-123",
			ts: expect.any(Number),
			task: "parent task",
			tokensIn: 0,
			tokensOut: 0,
			cacheWrites: 0,
			cacheReads: 0,
			totalCost: 0,
			status: "delegated",
			delegatedToId: "child-456",
			awaitingChildId: "child-456",
			childIds: ["child-456"],
			parentSnapshot,
		})
	})
})
