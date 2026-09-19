import * as assert from "assert"
import { AiCodeOrchestratorEventName } from "@ai-code-orchestrator/types"
import { setDefaultSuiteTimeout } from "./test-utils"
import { waitFor, waitUntilCompleted } from "./utils"

/**
 * Regression test for subtask silent stop issue.
 *
 * Problem: When parent delegates to child via new_task:
 * 1. Parent gets `abandoned: true` through removeClineFromStack() → abortTask(true)
 * 2. Child is created and starts working
 * 3. Catch block in Task.ts:2158 silently swallows errors when abandoned === true
 * 4. Child stops without any logs
 *
 * This test verifies:
 * - Child task does NOT incorrectly receive abandoned=true
 * - Child task completes successfully (not silently stopped)
 * - Logs are emitted if task is abandoned/cancelled
 */
suite("Subtask Abandoned Flag Fix", function () {
	setDefaultSuiteTimeout(this)

	test("child task completes successfully without being abandoned", async () => {
		const api = globalThis.api
		const events = {
			delegations: [] as Array<{ parentTaskId: string; childTaskId: string }>,
			started: [] as string[],
			completed: [] as string[],
			aborted: [] as string[],
		}

		// Track events
		api.on(AiCodeOrchestratorEventName.TaskDelegated, (parentTaskId: string, childTaskId: string) => {
			events.delegations.push({ parentTaskId, childTaskId })
		})
		api.on(AiCodeOrchestratorEventName.TaskStarted, (taskId: string) => {
			events.started.push(taskId)
		})
		api.on(AiCodeOrchestratorEventName.TaskCompleted, (taskId: string) => {
			events.completed.push(taskId)
		})
		api.on(AiCodeOrchestratorEventName.TaskAborted, (taskId: string) => {
			events.aborted.push(taskId)
		})

		const parentTaskId = await api.startNewTask({
			configuration: {
				mode: "code",
				alwaysAllowModeSwitch: true,
				alwaysAllowSubtasks: true,
				autoApprovalEnabled: true,
				enableCheckpoints: false,
			},
			text: 'Create one child task in code mode with message "Reply with CHILD_COMPLETED when done". Wait for it to complete.',
		})

		try {
			// Wait for delegation to occur
			await waitFor(() => events.delegations.length > 0, { timeout: 30_000 })
			assert.equal(events.delegations.length, 1, "Expected exactly one delegation")

			const delegation = events.delegations[0]
			assert.ok(delegation, "Delegation should exist")
			const { childTaskId } = delegation
			assert.ok(childTaskId, "Child task ID should be defined")

			// Wait for child to start
			await waitFor(() => events.started.includes(childTaskId), { timeout: 10_000 })
			assert.ok(events.started.includes(childTaskId), "Child task should have started")

			// Critical assertion: Child should NOT be in aborted list while running
			// If the bug exists, child would be silently stopped due to incorrect abandoned flag
			assert.ok(
				!events.aborted.includes(childTaskId),
				"Child task should NOT be aborted during delegation (bug: incorrect abandoned flag)",
			)

			// Wait for parent to complete (which means child completed successfully)
			await waitUntilCompleted({ api, taskId: parentTaskId, timeout: 60_000 })

			// Verify child completed successfully (not aborted)
			assert.ok(
				events.completed.includes(childTaskId),
				"Child task should have completed successfully (not silently stopped)",
			)
			assert.ok(
				!events.aborted.includes(childTaskId),
				"Child task should NOT be in aborted list (bug: silent stop due to abandoned flag)",
			)

			// Verify parent also completed
			assert.ok(events.completed.includes(parentTaskId), "Parent task should have completed")

			// Clean stack
			assert.deepEqual(api.getCurrentTaskStack(), [], "Task stack should be empty after completion")
		} finally {
			await api.clearCurrentTask().catch(() => {
				// Cleanup must not hide the assertion that failed the test
			})
		}
	})

	test("child task emits logs when actually cancelled by user", async () => {
		const api = globalThis.api
		const events = {
			delegations: [] as Array<{ parentTaskId: string; childTaskId: string }>,
			aborted: [] as string[],
		}

		api.on(AiCodeOrchestratorEventName.TaskDelegated, (parentTaskId: string, childTaskId: string) => {
			events.delegations.push({ parentTaskId, childTaskId })
		})
		api.on(AiCodeOrchestratorEventName.TaskAborted, (taskId: string) => {
			events.aborted.push(taskId)
		})

		const _parentTaskId = await api.startNewTask({
			configuration: {
				mode: "code",
				alwaysAllowModeSwitch: true,
				alwaysAllowSubtasks: true,
				autoApprovalEnabled: true,
				enableCheckpoints: false,
			},
			text: 'Create one child task in code mode with message "Work for a long time". Do not wait for completion.',
		})

		try {
			// Wait for delegation
			await waitFor(() => events.delegations.length > 0, { timeout: 30_000 })
			const delegation = events.delegations[0]
			assert.ok(delegation, "Delegation should exist")
			const { childTaskId } = delegation

			// Give child a moment to start working
			await new Promise((resolve) => setTimeout(resolve, 2000))

			// Cancel the task tree
			await api.cancelCurrentTask()

			// Verify child was actually aborted (not silently stopped)
			await waitFor(() => events.aborted.includes(childTaskId), { timeout: 5_000 })
			assert.ok(events.aborted.includes(childTaskId), "Child task should be aborted when cancelled by user")
		} finally {
			await api.clearCurrentTask().catch(() => {
				// Cleanup
			})
		}
	})
})
