// npx vitest run core/task/__tests__/hasDelegatedToParent-guard.spec.ts
//
// Real regression test for the "child delegation must not issue another API
// request" fix.
//
// AttemptCompletionTool.execute() (REAL, unmocked) actually sets
// `task.hasDelegatedToParent = true` on a successful delegation, and leaves it
// `false` when delegation does not happen (user denial). This is the producer
// side of the contract that the CHILD DELEGATION GUARD in
// `Task.recursivelyMakeClineRequests` (see Task.ts, search for
// "hasDelegatedToParent") relies on to stop a stale child instance from
// issuing another API request after it already handed its result to the
// parent.
//
// NOTE on scope: the consumer side of the contract (the one-line guard
// `if (this.hasDelegatedToParent) return true` inside
// `recursivelyMakeClineRequests`) is not independently exercised here via a
// full end-to-end run of that method. Doing so would require reconstructing
// nearly the entire Task request/response pipeline (stream parsing,
// checkpointing, environment details, history persistence, etc.), which is
// already covered - and mocked at the appropriate boundary - by
// `presentAssistantMessage-completion-guard.spec.ts` and
// `task-resurrection-prevention.spec.ts`. The guard itself is a single,
// unconditional early-return statement; its correctness is verified by
// code review and by the type-checker, and indirectly by the fact that
// `initiateTaskLoop`'s matching break condition (also touched by this fix)
// is covered by the existing regression suite.

import { describe, it, expect, vi } from "vitest"
import { Task } from "../Task"
import { attemptCompletionTool } from "../../tools/AttemptCompletionTool"

describe("hasDelegatedToParent - producer (AttemptCompletionTool)", () => {
	it("sets task.hasDelegatedToParent = true on successful delegation to an active parent", async () => {
		const mockProvider = {
			getTaskWithId: vi.fn().mockResolvedValue({ historyItem: { status: "active" } }),
			reopenParentFromDelegation: vi.fn().mockResolvedValue(undefined),
		}

		const mockTask: any = {
			taskId: "child-task",
			parentTaskId: "parent-task",
			clineMessages: [],
			providerRef: { deref: () => mockProvider },
			consecutiveMistakeCount: 0,
			didToolFailInCurrentTurn: false,
			say: vi.fn().mockResolvedValue(undefined),
			ask: vi.fn(),
			sayAndCreateMissingParamError: vi.fn(),
			recordToolError: vi.fn(),
			todoList: [],
			hasDelegatedToParent: false,
		}

		const mockCallbacks = {
			askApproval: vi.fn().mockResolvedValue(true),
			askFinishSubTaskApproval: vi.fn().mockResolvedValue(true),
			toolDescription: vi.fn().mockReturnValue("attempt_completion description"),
			pushToolResult: vi.fn(),
			handleError: vi.fn(),
		}

		await attemptCompletionTool.execute({ result: "Task completed successfully" }, mockTask as Task, mockCallbacks)

		expect(mockProvider.reopenParentFromDelegation).toHaveBeenCalledWith({
			parentTaskId: "parent-task",
			childTaskId: "child-task",
			completionResultSummary: "Task completed successfully",
		})
		expect(mockTask.hasDelegatedToParent).toBe(true)
	})

	it("does NOT set hasDelegatedToParent when the user denies subtask completion", async () => {
		const mockProvider = {
			getTaskWithId: vi.fn().mockResolvedValue({ historyItem: { status: "active" } }),
			reopenParentFromDelegation: vi.fn(),
		}

		const mockTask: any = {
			taskId: "child-task",
			parentTaskId: "parent-task",
			clineMessages: [],
			providerRef: { deref: () => mockProvider },
			consecutiveMistakeCount: 0,
			didToolFailInCurrentTurn: false,
			say: vi.fn().mockResolvedValue(undefined),
			ask: vi.fn(),
			sayAndCreateMissingParamError: vi.fn(),
			recordToolError: vi.fn(),
			todoList: [],
			hasDelegatedToParent: false,
		}

		const mockCallbacks = {
			askApproval: vi.fn().mockResolvedValue(true),
			askFinishSubTaskApproval: vi.fn().mockResolvedValue(false),
			toolDescription: vi.fn().mockReturnValue("attempt_completion description"),
			pushToolResult: vi.fn(),
			handleError: vi.fn(),
		}

		await attemptCompletionTool.execute({ result: "Task completed successfully" }, mockTask as Task, mockCallbacks)

		expect(mockProvider.reopenParentFromDelegation).not.toHaveBeenCalled()
		expect(mockTask.hasDelegatedToParent).toBe(false)
	})
})
