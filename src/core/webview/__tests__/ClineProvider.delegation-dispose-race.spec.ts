import { describe, it, expect, vi, beforeEach } from "vitest"
import { ClineProvider } from "../ClineProvider"
import type { Task } from "../../task/Task"
import { AiCodeOrchestratorEventName } from "@ai-code-orchestrator/types"

/**
 * Test suite to reproduce the delegation dispose race condition bug.
 *
 * SYMPTOMS:
 * 1. Orchestrator creates reviewer subtask
 * 2. child.start() is called
 * 3. Immediately after that, both tasks (parent and child) call dispose()
 * 4. Child task never executes
 *
 * HYPOTHESES:
 * H1: handleModeSwitch is called when stack is empty (after removeClineFromStack, before push child)
 * H2: child.start() is awaited but internally starts startTask() as fire-and-forget
 * H3: child is added to stack before start(), and if start() fails synchronously, this triggers dispose
 */
describe("ClineProvider delegation dispose race condition", () => {
	let mockProvider: any
	let mockParent: Partial<Task>
	let mockChild: Partial<Task>
	let disposeCallOrder: string[]

	beforeEach(() => {
		disposeCallOrder = []

		mockParent = {
			taskId: "parent-123",
			instanceId: "parent-instance-1",
			abort: false,
			abandoned: false,
			abortReason: undefined,
			didFinishAbortingStream: false,
			apiConfiguration: { apiProvider: "anthropic" } as any,
			flushPendingToolResultsToHistory: vi.fn().mockResolvedValue(true),
			retrySaveApiConversationHistory: vi.fn().mockResolvedValue(true),
			dispose: vi.fn(() => {
				disposeCallOrder.push("parent-dispose")
			}),
			resumeAfterDelegation: vi.fn(),
		}

		mockChild = {
			taskId: "child-456",
			instanceId: "child-instance-1",
			start: vi.fn(),
			abortTask: vi.fn(),
			dispose: vi.fn(() => {
				disposeCallOrder.push("child-dispose")
			}),
		}

		mockProvider = {
			log: vi.fn(),
			updateGlobalState: vi.fn().mockResolvedValue(undefined),
			getState: vi.fn().mockResolvedValue({
				mode: "code",
				currentApiConfigName: "default",
			}),
			getTaskWithId: vi.fn(),
			updateTaskHistory: vi.fn().mockResolvedValue(undefined),
			taskHistoryStore: {
				get: vi.fn(),
				updateParentChildLinks: vi.fn().mockResolvedValue(undefined),
			},
			createTask: vi.fn().mockResolvedValue(mockChild),
			handleModeSwitch: vi.fn().mockResolvedValue(undefined),
			removeClineFromStack: vi.fn().mockResolvedValue(undefined),
			postStateToWebview: vi.fn().mockResolvedValue(undefined),
			activateProviderProfile: vi.fn().mockResolvedValue(undefined),
			updateTaskApiHandlerIfNeeded: vi.fn(),
			getCurrentTask: vi.fn(),
			clineStack: [],
			delegationInProgress: new Set<string>(),
			emit: vi.fn(),
		}
	})

	it("H1 FIXED: handleModeSwitch is called AFTER child is added to stack", async () => {
		// Setup: parent is current task
		mockProvider.clineStack = [mockParent as Task]
		mockProvider.getCurrentTask = vi.fn(() => {
			// Simulate getCurrentTask behavior: returns last task in stack
			return mockProvider.clineStack.length > 0
				? mockProvider.clineStack[mockProvider.clineStack.length - 1]
				: undefined
		})

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

		// Mock removeClineFromStack to clear the stack (simulating real behavior)
		mockProvider.removeClineFromStack = vi.fn(async () => {
			mockProvider.clineStack.pop()
		})

		// Track when handleModeSwitch is called and what getCurrentTask returns
		let currentTaskDuringModeSwitch: Task | undefined
		mockProvider.handleModeSwitch = vi.fn(async (mode: string) => {
			currentTaskDuringModeSwitch = mockProvider.getCurrentTask()
			console.log(
				"[TEST] handleModeSwitch called, getCurrentTask():",
				currentTaskDuringModeSwitch?.taskId ?? "undefined",
			)
			console.log(
				"[TEST] clineStack at mode switch:",
				mockProvider.clineStack.map((t: any) => t.taskId),
			)
		})

		// Execute delegation
		await (ClineProvider.prototype as any).delegateParentAndOpenChild.call(mockProvider, {
			parentTaskId: "parent-123",
			message: "child task message",
			initialTodos: [],
			mode: "ask",
		})

		// ASSERT: handleModeSwitch was called AFTER child was added to stack
		// CRITICAL FIX: parent is paused in place (isPaused=true), removeClineFromStack
		// is no longer called during delegation to preserve instance identity.
		expect(mockProvider.removeClineFromStack).not.toHaveBeenCalled()
		expect(mockProvider.handleModeSwitch).toHaveBeenCalledWith("ask")

		// FIXED: getCurrentTask() now returns child during handleModeSwitch
		expect(currentTaskDuringModeSwitch).toBe(mockChild)
		expect(currentTaskDuringModeSwitch?.taskId).toBe("child-456")

		console.log(
			"[TEST] Stack state during handleModeSwitch call contains child:",
			currentTaskDuringModeSwitch?.taskId === "child-456",
		)
	})

	it("H2: child is added to stack before start() is called", async () => {
		// Setup
		mockProvider.clineStack = [mockParent as Task]
		mockProvider.getCurrentTask = vi.fn(() => mockProvider.clineStack[mockProvider.clineStack.length - 1])

		vi.mocked(mockProvider.getTaskWithId!).mockResolvedValue({
			historyItem: {
				id: "parent-123",
				ts: Date.now(),
				task: "parent task",
				status: "active",
				childIds: [],
			} as any,
			task: mockParent as any,
		} as any)

		mockProvider.removeClineFromStack = vi.fn(async () => {
			mockProvider.clineStack.pop()
		})

		// Track stack state when child.start() is called
		let stackLengthAtStart: number
		vi.mocked(mockChild.start!).mockImplementation(async () => {
			stackLengthAtStart = mockProvider.clineStack.length
			console.log(
				"[TEST] child.start() called, stack:",
				mockProvider.clineStack.map((t: any) => t.taskId),
			)
		})

		await (ClineProvider.prototype as any).delegateParentAndOpenChild.call(mockProvider, {
			parentTaskId: "parent-123",
			message: "child task message",
			initialTodos: [],
			mode: "ask",
		})

		// ASSERT: child was already in stack when start() was called.
		// CRITICAL FIX: the parent stays in the stack (paused, not removed), so the stack
		// has 2 entries [parent(paused), child] instead of 1 when start() is invoked.
		expect(stackLengthAtStart!).toBe(2)
		expect(mockProvider.clineStack[1]).toBe(mockChild)
	})

	it("H3: synchronous error in child.start() triggers immediate disposal flow", async () => {
		// Setup
		mockProvider.clineStack = [mockParent as Task]
		mockProvider.getCurrentTask = vi.fn(() => mockProvider.clineStack[mockProvider.clineStack.length - 1])

		vi.mocked(mockProvider.getTaskWithId!).mockResolvedValue({
			historyItem: {
				id: "parent-123",
				ts: Date.now(),
				task: "parent task",
				status: "active",
				childIds: [],
			} as any,
			task: mockParent as any,
		} as any)

		mockProvider.removeClineFromStack = vi.fn(async () => {
			mockProvider.clineStack.pop()
		})

		// Simulate child.start() throwing synchronously
		const startError = new Error("Simulated start failure")
		vi.mocked(mockChild.start!).mockRejectedValue(startError)

		// Execute and expect error
		await expect(
			(ClineProvider.prototype as any).delegateParentAndOpenChild.call(mockProvider, {
				parentTaskId: "parent-123",
				message: "child task message",
				initialTodos: [],
				mode: "ask",
			}),
		).rejects.toThrow("Failed to start child task")

		// ASSERT: child.abortTask was called during rollback
		expect(mockChild.abortTask).toHaveBeenCalledWith(true)

		// ASSERT: parent was restored to stack
		expect(mockProvider.clineStack).toContain(mockParent)
		expect(mockProvider.clineStack).not.toContain(mockChild)
	})

	it("FIXED: handleModeSwitch with child in stack correctly applies mode", async () => {
		// This test demonstrates the FIX: when handleModeSwitch is called
		// AFTER child is added to stack, getCurrentTask() returns child

		mockProvider.clineStack = [mockParent as Task]
		mockProvider.getCurrentTask = vi.fn(() => mockProvider.clineStack[mockProvider.clineStack.length - 1])

		vi.mocked(mockProvider.getTaskWithId!).mockResolvedValue({
			historyItem: {
				id: "parent-123",
				ts: Date.now(),
				task: "parent task",
				status: "active",
				childIds: [],
			} as any,
			task: mockParent as any,
		} as any)

		mockProvider.removeClineFromStack = vi.fn(async () => {
			mockProvider.clineStack.pop()
		})

		let modeSwitchedOnTask: Task | undefined
		// Real handleModeSwitch behavior: it calls setDefaultMode which calls getCurrentTask
		mockProvider.handleModeSwitch = vi.fn(async (mode: string) => {
			const task = mockProvider.getCurrentTask()
			console.log("[TEST] handleModeSwitch: getCurrentTask() returned:", task?.taskId ?? "undefined")

			// This is what setDefaultMode does:
			if (task) {
				// switchRuntimeMode would be called here
				modeSwitchedOnTask = task
				console.log("[TEST] Would call switchRuntimeMode on task:", task.taskId)
			} else {
				console.log("[TEST] SKIPPING switchRuntimeMode - no current task!")
			}
		})

		const child = await (ClineProvider.prototype as any).delegateParentAndOpenChild.call(mockProvider, {
			parentTaskId: "parent-123",
			message: "child task message",
			initialTodos: [],
			mode: "ask",
		})

		// ASSERT: delegation succeeded
		expect(child).toBe(mockChild)
		expect(mockChild.start).toHaveBeenCalled()

		// FIXED: handleModeSwitch was called with child in stack
		expect(mockProvider.handleModeSwitch).toHaveBeenCalled()
		expect(modeSwitchedOnTask).toBe(mockChild)
		expect(modeSwitchedOnTask?.taskId).toBe("child-456")
	})
})
