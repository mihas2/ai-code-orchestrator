import * as assert from "assert"

import {
	AiCodeOrchestratorEventName,
	type AiCodeOrchestratorSettings,
	type ProviderSettings,
} from "@ai-code-orchestrator/types"
import * as vscode from "vscode"

import { MockAIProvider } from "./mock-provider"
import { setDefaultSuiteTimeout } from "./test-utils"
import { waitFor, waitUntilCompleted } from "./utils"

const MODELS = {
	sonnet4: "claude-sonnet-4",
	opus5: "claude-opus-5",
	sonnet35: "claude-sonnet-3.5",
} as const

type Assignment = { profileName?: string; modelId?: string; inheritPrimary: boolean }
type RoleAssignments = { schemaVersion: 1; roles: Record<string, Assignment> }

const profile = (modelId: string): ProviderSettings => ({
	apiProvider: "fake-ai",
	apiModelId: modelId,
	fakeAi: new MockAIProvider(),
})

function settings(roleAssignments: RoleAssignments): AiCodeOrchestratorSettings {
	return {
		apiProvider: "fake-ai",
		apiModelId: MODELS.sonnet4,
		fakeAi: new MockAIProvider(),
		roleAssignments,
	}
}

async function configureProfiles(api: typeof globalThis.api, assignments: RoleAssignments) {
	await api.upsertProfile("default", profile(MODELS.sonnet4), false)
	await api.upsertProfile("advanced", profile(MODELS.opus5), false)
	await api.upsertProfile("planning", profile(MODELS.sonnet35), false)
	await api.upsertProfile("basic", profile(MODELS.sonnet4), false)
	await api.setActiveProfile("default")
	await api.setConfiguration(settings(assignments))
	await waitFor(() => api.getActiveProfile() === "default")
}

function assertAssignment(api: typeof globalThis.api, mode: string, expected: Assignment) {
	const state = api.getConfiguration()
	const actual = state.roleAssignments?.roles[mode]
	assert.deepStrictEqual(actual, expected)
}

async function startAndObserve(api: typeof globalThis.api, mode: string, text = "Reply with ROLE_MODEL_E2E") {
	const started: string[] = []
	api.on(AiCodeOrchestratorEventName.TaskStarted, (taskId) => started.push(taskId))
	const taskId = await api.startNewTask({
		configuration: { mode, alwaysAllowModeSwitch: true, autoApprovalEnabled: true },
		text,
	})
	await waitFor(() => started.includes(taskId), { timeout: 30_000 })
	return taskId
}

async function cleanup(api: typeof globalThis.api) {
	try {
		await api.clearCurrentTask()
		await Promise.all(
			["default", "advanced", "planning", "basic"].map((name) => api.deleteProfile(name).catch(() => undefined)),
		)
	} catch {
		// Cleanup must not mask the assertion that failed the test.
	}
}

suite("AI Code Orchestrator Role Model Assignment", function () {
	setDefaultSuiteTimeout(this)

	test("uses the assigned role model instead of the active profile model", async () => {
		const api = globalThis.api
		await configureProfiles(api, {
			schemaVersion: 1,
			roles: { code: { profileName: "advanced", modelId: MODELS.opus5, inheritPrimary: false } },
		})
		try {
			const taskId = await startAndObserve(api, "code")
			assert.ok(await api.isTaskInHistory(taskId))
			assertAssignment(api, "code", { profileName: "advanced", modelId: MODELS.opus5, inheritPrimary: false })
			assert.notEqual(api.getConfiguration().apiModelId, MODELS.opus5, "active profile remains the primary model")
		} finally {
			await cleanup(api)
		}
	})

	test("keeps different role assignments independent", async () => {
		const api = globalThis.api
		await configureProfiles(api, {
			schemaVersion: 1,
			roles: {
				code: { profileName: "advanced", modelId: MODELS.opus5, inheritPrimary: false },
				architect: { profileName: "planning", modelId: MODELS.sonnet35, inheritPrimary: false },
			},
		})
		try {
			for (const [mode, modelId, profileName] of [
				["code", MODELS.opus5, "advanced"],
				["architect", MODELS.sonnet35, "planning"],
				["debug", MODELS.sonnet4, undefined],
			] as const) {
				const taskId = await startAndObserve(api, mode)
				await api.cancelCurrentTask().catch(() => undefined)
				assert.ok(taskId)
				if (profileName) assertAssignment(api, mode, { profileName, modelId, inheritPrimary: false })
			}
			assert.equal(api.getConfiguration().roleAssignments?.roles.code?.modelId, MODELS.opus5)
			assert.equal(api.getConfiguration().roleAssignments?.roles.architect?.modelId, MODELS.sonnet35)
		} finally {
			await cleanup(api)
		}
	})

	test("preserves a role model when the active profile changes", async () => {
		const api = globalThis.api
		await configureProfiles(api, {
			schemaVersion: 1,
			roles: { code: { profileName: "advanced", modelId: MODELS.opus5, inheritPrimary: false } },
		})
		try {
			const taskId = await startAndObserve(api, "code")
			await api.setActiveProfile("basic")
			await waitFor(() => api.getActiveProfile() === "basic")
			assertAssignment(api, "code", { profileName: "advanced", modelId: MODELS.opus5, inheritPrimary: false })
			assert.ok(await api.isTaskInHistory(taskId))
		} finally {
			await cleanup(api)
		}
	})

	test("persists a Modes settings assignment through the webview bridge", async () => {
		const api = globalThis.api
		await configureProfiles(api, { schemaVersion: 1, roles: {} })
		try {
			await vscode.commands.executeCommand("aiOrchestrator.openSettings")
			await api.setConfiguration(
				settings({
					schemaVersion: 1,
					roles: { code: { profileName: "advanced", modelId: MODELS.opus5, inheritPrimary: false } },
				}),
			)
			await waitFor(() => api.getConfiguration().roleAssignments?.roles.code?.profileName === "advanced")
			assertAssignment(api, "code", { profileName: "advanced", modelId: MODELS.opus5, inheritPrimary: false })
			const taskId = await startAndObserve(api, "code")
			assert.ok(await api.isTaskInHistory(taskId))
		} finally {
			await cleanup(api)
		}
	})

	test("applies child role assignments independently during orchestration", async () => {
		const api = globalThis.api
		await configureProfiles(api, {
			schemaVersion: 1,
			roles: {
				orchestrator: { profileName: "advanced", modelId: MODELS.opus5, inheritPrimary: false },
				code: { profileName: "basic", modelId: MODELS.sonnet4, inheritPrimary: false },
			},
		})
		try {
			const taskId = await startAndObserve(
				api,
				"orchestrator",
				"Delegate one code child. The child must reply CHILD_ROLE_MODEL_E2E and then summarize it.",
			)
			await waitUntilCompleted({ api, taskId, timeout: 30_000 })
			assertAssignment(api, "orchestrator", {
				profileName: "advanced",
				modelId: MODELS.opus5,
				inheritPrimary: false,
			})
			assertAssignment(api, "code", { profileName: "basic", modelId: MODELS.sonnet4, inheritPrimary: false })
			assert.deepStrictEqual(api.getCurrentTaskStack(), [])
		} finally {
			await cleanup(api)
		}
	})
})
