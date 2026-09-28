// npx vitest run __tests__/provider-delegation.spec.ts

import { describe, it, expect, vi } from "vitest"
import { AiCodeOrchestratorEventName } from "@ai-code-orchestrator/types"
import { ClineProvider } from "../core/webview/ClineProvider"

describe("ClineProvider.delegateParentAndOpenChild()", () => {
	it("persists parent delegation metadata and emits TaskDelegated", async () => {
		const providerEmit = vi.fn()
		const parentTask = { taskId: "parent-1", emit: vi.fn() } as any

		const childStart = vi.fn()
		const updateTaskHistory = vi.fn()
		const removeClineFromStack = vi.fn().mockResolvedValue(undefined)
		const createTask = vi.fn().mockResolvedValue({ taskId: "child-1", start: childStart })
		const handleModeSwitch = vi.fn().mockResolvedValue(undefined)
		const getTaskWithId = vi.fn().mockImplementation(async (id: string) => {
			if (id === "parent-1") {
				return {
					historyItem: {
						id: "parent-1",
						task: "Parent",
						tokensIn: 0,
						tokensOut: 0,
						totalCost: 0,
						childIds: [],
					},
				}
			}
			// child-1
			return {
				historyItem: {
					id: "child-1",
					task: "Do something",
					tokensIn: 0,
					tokensOut: 0,
					totalCost: 0,
				},
			}
		})

		const provider = {
			emit: providerEmit,
			getCurrentTask: vi.fn(() => parentTask),
			removeClineFromStack,
			createTask,
			getTaskWithId,
			updateTaskHistory,
			handleModeSwitch,
			getState: vi.fn().mockResolvedValue({
				mode: "orchestrator",
				currentApiConfigName: "test-profile",
				apiConfiguration: {},
			}),
			log: vi.fn(),
			delegationInProgress: new Set<string>(),
			taskHistoryStore: {
				updateParentChildLinks: vi.fn().mockResolvedValue(undefined),
			},
			postStateToWebview: vi.fn().mockResolvedValue(undefined),
			clineStack: [],
		} as unknown as ClineProvider

		const params = {
			parentTaskId: "parent-1",
			message: "Do something",
			initialTodos: [],
			mode: "code",
		}

		const child = await (ClineProvider.prototype as any).delegateParentAndOpenChild.call(provider, params)

		expect(child.taskId).toBe("child-1")

		// CRITICAL FIX: parent is paused in place (isPaused=true) instead of being removed
		// from the stack, to preserve instance identity and avoid task resurrection on resume.
		expect(removeClineFromStack).not.toHaveBeenCalled()
		// Child task is created with startTask: false and initialStatus: "active"
		expect(createTask).toHaveBeenCalledWith(
			"Do something",
			undefined,
			parentTask,
			expect.objectContaining({
				initialTodos: [],
				initialStatus: "active",
				startTask: false,
				workspacePath: undefined,
			}),
			undefined,
			undefined,
		)

		// Metadata persistence - parent gets "delegated" status (child status is set at creation via initialStatus)
		// Now uses taskHistoryStore.updateParentChildLinks instead of updateTaskHistory
		expect(provider.taskHistoryStore.updateParentChildLinks).toHaveBeenCalledTimes(1)

		// Parent set to "delegated" with snapshot
		const updateCall = (provider.taskHistoryStore.updateParentChildLinks as any).mock.calls[0][0]
		expect(updateCall).toEqual(
			expect.objectContaining({
				parentId: "parent-1",
				parentUpdate: expect.objectContaining({
					status: "delegated",
					delegatedToId: "child-1",
					awaitingChildId: "child-1",
					childIds: expect.arrayContaining(["child-1"]),
					parentSnapshot: expect.objectContaining({
						mode: "orchestrator",
						apiConfigName: "test-profile",
						capturedAt: expect.any(Number),
					}),
				}),
				childId: "child-1",
				childUpdate: expect.objectContaining({
					parentTaskId: "parent-1",
				}),
			}),
		)

		// child.start() must be called AFTER parent metadata is persisted
		expect(childStart).toHaveBeenCalledTimes(1)

		// Event emission (provider-level)
		expect(providerEmit).toHaveBeenCalledWith(AiCodeOrchestratorEventName.TaskDelegated, "parent-1", "child-1")

		// Mode switch
		expect(handleModeSwitch).toHaveBeenCalledWith("code")
	})

	it("calls child.start() only after parent metadata is persisted (no race condition)", async () => {
		const callOrder: string[] = []

		const parentTask = { taskId: "parent-1", emit: vi.fn() } as any
		const childStart = vi.fn(() => callOrder.push("child.start"))

		const removeClineFromStack = vi.fn().mockResolvedValue(undefined)
		const createTask = vi.fn(async () => {
			callOrder.push("createTask")
			return { taskId: "child-1", start: childStart }
		})
		const handleModeSwitch = vi.fn().mockResolvedValue(undefined)
		const getTaskWithId = vi.fn().mockResolvedValue({
			historyItem: {
				id: "parent-1",
				task: "Parent",
				tokensIn: 0,
				tokensOut: 0,
				totalCost: 0,
				childIds: [],
			},
		})

		const updateParentChildLinks = vi.fn(async () => {
			callOrder.push("updateParentChildLinks")
		})

		const provider = {
			emit: vi.fn(),
			getCurrentTask: vi.fn(() => parentTask),
			removeClineFromStack,
			createTask,
			getTaskWithId,
			handleModeSwitch,
			getState: vi.fn().mockResolvedValue({
				mode: "orchestrator",
				currentApiConfigName: "test-profile",
				apiConfiguration: {},
			}),
			log: vi.fn(),
			delegationInProgress: new Set<string>(),
			taskHistoryStore: {
				updateParentChildLinks,
			},
			postStateToWebview: vi.fn().mockResolvedValue(undefined),
			clineStack: [],
		} as unknown as ClineProvider

		await (ClineProvider.prototype as any).delegateParentAndOpenChild.call(provider, {
			parentTaskId: "parent-1",
			message: "Do something",
			initialTodos: [],
			mode: "code",
		})

		// Verify ordering: createTask → updateParentChildLinks → child.start
		expect(callOrder).toEqual(["createTask", "updateParentChildLinks", "child.start"])
	})
})
