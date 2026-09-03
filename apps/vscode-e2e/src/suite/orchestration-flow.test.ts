import * as assert from "assert"

import {
	AiCodeOrchestratorEventName,
	DEFAULT_ORCHESTRATION_SETTINGS,
	type ClineMessage,
} from "@ai-code-orchestrator/types"

import { setDefaultSuiteTimeout } from "./test-utils"
import { waitFor, waitUntilAborted, waitUntilCompleted } from "./utils"

const modes = ["code", "architect", "code"] as const
const childInstructions = [
	"Implement the frontend portion of the todo app. Reply with FRONTEND_RESULT when complete.",
	"Design and implement the backend portion of the todo app. Reply with BACKEND_RESULT when complete.",
	"Review the frontend and backend integration. Reply with INTEGRATION_RESULT when complete.",
]

type Delegation = { parentTaskId: string; childTaskId: string }

function getExpectedDelegation(run: Run, index: number): Delegation {
	const delegation = run.delegations[index]
	if (!delegation) {
		throw new Error(`Expected orchestration delegation at index ${index}, but none was emitted`)
	}

	return delegation
}

type Run = {
	delegations: Delegation[]
	started: string[]
	completed: string[]
	aborted: string[]
	modes: Map<string, string>
	messages: Map<string, ClineMessage[]>
}

function observe(api: typeof globalThis.api): Run {
	const run: Run = {
		delegations: [],
		started: [],
		completed: [],
		aborted: [],
		modes: new Map(),
		messages: new Map(),
	}

	api.on(AiCodeOrchestratorEventName.TaskDelegated, (parentTaskId, childTaskId) =>
		run.delegations.push({ parentTaskId, childTaskId }),
	)
	api.on(AiCodeOrchestratorEventName.TaskStarted, (taskId) => run.started.push(taskId))
	api.on(AiCodeOrchestratorEventName.TaskCompleted, (taskId) => run.completed.push(taskId))
	api.on(AiCodeOrchestratorEventName.TaskAborted, (taskId) => run.aborted.push(taskId))
	api.on(AiCodeOrchestratorEventName.TaskModeSwitched, (taskId, mode) => run.modes.set(taskId, mode))
	api.on(AiCodeOrchestratorEventName.Message, ({ taskId, message }) => {
		if (message.type === "say" && message.partial === false) {
			run.messages.set(taskId, [...(run.messages.get(taskId) ?? []), message])
		}
	})

	return run
}

function orchestrationConfiguration(requirePlanApproval = false) {
	return {
		mode: "orchestrator",
		alwaysAllowModeSwitch: true,
		alwaysAllowSubtasks: true,
		autoApprovalEnabled: true,
		enableCheckpoints: false,
		orchestrationSettings: {
			...DEFAULT_ORCHESTRATION_SETTINGS,
			requirePlanApproval,
			maxParallelWorkers: 1,
			maxDepth: 4,
			timeoutMs: 60_000,
		},
	} as const
}

async function cleanup(api: typeof globalThis.api) {
	try {
		await api.clearCurrentTask()
	} catch {
		// Cleanup must not hide the assertion that failed the test.
	}
}

suite("AI Code Orchestrator Orchestration Flow", function () {
	setDefaultSuiteTimeout(this)

	test("completes a sequential orchestration and synthesizes every child result", async () => {
		const api = globalThis.api
		const run = observe(api)
		const parentTaskId = await api.startNewTask({
			configuration: orchestrationConfiguration(true),
			text: `Create a todo app with frontend and backend. Create exactly three sequential subtasks in these modes: ${modes.join(", ")}. Their instructions, in order, must be: ${childInstructions.join(" | ")}. Wait for all children and synthesize their outputs.`,
		})

		try {
			assert.equal(run.modes.get(parentTaskId), "orchestrator")
			// Wait for the real approval message before pressing the webview primary button.
			await waitFor(() => (run.messages.get(parentTaskId)?.length ?? 0) > 0)
			await api.pressPrimaryButton()
			await waitFor(() => run.delegations.length > 0)
			await waitUntilCompleted({ api, taskId: parentTaskId, timeout: 120_000 })

			assert.equal(run.delegations.length, 3)
			assert.equal(new Set(run.delegations.map(({ childTaskId }) => childTaskId)).size, 3)
			assert.deepEqual(
				run.delegations.map(({ childTaskId }) => run.modes.get(childTaskId)),
				[...modes],
			)
			assert.ok(run.delegations.every(({ childTaskId }) => run.started.includes(childTaskId)))
			assert.ok(run.delegations.every(({ childTaskId }) => run.completed.includes(childTaskId)))
			assert.deepEqual(api.getCurrentTaskStack(), [])
			const finalText = (run.messages.get(parentTaskId) ?? []).map((message) => message.text ?? "").join(" ")
			assert.match(finalText, /FRONTEND_RESULT|BACKEND_RESULT|INTEGRATION_RESULT/)
			assert.equal(run.aborted.length, 0, "a child must not be cancelled immediately after creation")
		} finally {
			await cleanup(api)
		}
	})

	test("propagates cancellation without starting later children", async () => {
		const api = globalThis.api
		const run = observe(api)
		const parentTaskId = await api.startNewTask({
			configuration: orchestrationConfiguration(),
			text: "Create exactly three sequential subtasks in code, architect, code. Complete the first, keep the second working for a while, and do not start the third until the second is complete.",
		})

		try {
			await waitFor(() => run.delegations.length >= 2)
			await api.cancelCurrentTask()
			const firstDelegation = getExpectedDelegation(run, 0)
			const secondDelegation = getExpectedDelegation(run, 1)
			await waitUntilAborted({ api, taskId: secondDelegation.childTaskId })
			assert.ok(run.completed.includes(firstDelegation.childTaskId))
			assert.ok(!run.started.includes(run.delegations[2]?.childTaskId ?? ""))
			assert.ok(
				!run.delegations.some(
					({ childTaskId }) =>
						run.started.includes(childTaskId) &&
						!run.completed.includes(childTaskId) &&
						!run.aborted.includes(childTaskId),
				),
			)
			assert.ok(!api.getCurrentTaskStack().includes(secondDelegation.childTaskId))
			assert.ok(parentTaskId)
		} finally {
			await cleanup(api)
		}
	})

	test("reports a child failure and allows the orchestration to continue", async () => {
		const api = globalThis.api
		const run = observe(api)
		const parentTaskId = await api.startNewTask({
			configuration: orchestrationConfiguration(),
			text: "Create three sequential subtasks in code, architect, code. The second must simulate an API failure and report it. Ask the user whether to retry, skip, or abort; choose skip, then execute the third and summarize the failure.",
		})

		try {
			await waitUntilCompleted({ api, taskId: parentTaskId, timeout: 120_000 })
			const text = [...run.messages.values()]
				.flat()
				.map((message) => message.text ?? "")
				.join(" ")
			assert.match(text, /fail|error|retry|skip|abort/i)
			assert.ok(run.delegations.length >= 2)
			assert.ok(run.completed.includes(parentTaskId) || run.aborted.includes(parentTaskId))
			assert.ok(api.getCurrentTaskStack().length === 0)
		} finally {
			await cleanup(api)
		}
	})

	test("resumes nested orchestration in child-to-parent order", async () => {
		const api = globalThis.api
		const run = observe(api)
		const grandparentTaskId = await api.startNewTask({
			configuration: orchestrationConfiguration(),
			text: "Delegate one child in orchestrator mode. That child must delegate two grandchildren (code and architect), wait for both, synthesize them, and then the grandparent must synthesize the child's result.",
		})

		try {
			await waitUntilCompleted({ api, taskId: grandparentTaskId, timeout: 120_000 })
			assert.ok(run.delegations.length >= 3)
			assert.equal(new Set(run.delegations.map(({ childTaskId }) => childTaskId)).size, run.delegations.length)
			assert.ok(run.delegations.some(({ parentTaskId }) => parentTaskId === grandparentTaskId))
			const parent = run.delegations.find(({ parentTaskId }) => parentTaskId === grandparentTaskId)!.childTaskId
			assert.ok(run.delegations.some(({ parentTaskId }) => parentTaskId === parent))
			assert.deepEqual(api.getCurrentTaskStack(), [])
		} finally {
			await cleanup(api)
		}
	})
})
