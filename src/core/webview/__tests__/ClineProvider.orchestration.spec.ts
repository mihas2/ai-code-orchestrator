import { afterEach, describe, expect, it, vi } from "vitest"
import EventEmitter from "events"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { AiCodeOrchestratorEventName } from "@ai-code-orchestrator/types"
import { createBudget } from "../../orchestration/budget"
import { buildTaskEvidenceRegistry } from "../../orchestration/evidenceRegistry"
import { VersionedLeadSessionStore, type LeadSession } from "../../orchestration/leadSession"
import { ClineProvider } from "../ClineProvider"
import type { StartOrchestrationInput } from "../../orchestration/types"

vi.mock("../../orchestration/workerIsolation", () => ({
	GitWorkerWorkspaceRegistry: class {
		constructor(_repository: string) {}
		async allocate(runId: string, nodeId: string, attempt: number) {
			return { workerId: `${runId}-${nodeId}-${attempt}`, path: "/isolated/worker", baseHash: "test-base" }
		}
		async release() {}
	},
}))

const settings = {
	schemaVersion: 1 as const,
	enabled: true,
	orchestratorModeSlug: "orchestrator",
	maxParallelWorkers: 1,
	maxDepth: 1,
	timeoutMs: 1_000,
	maxReworkAttempts: 0,
	contextPolicy: "minimal" as const,
	conflictPolicy: "stop" as const,
	reviewPolicy: "off" as const,
	requirePlanApproval: false,
	requireIntegrationApproval: false,
	allowWorkerCommands: false,
	allowWorkerMcp: false,
	persistTranscripts: false,
}

function providerBoundary(enabled: boolean, mode: string) {
	const values = new Map<string, unknown>()
	const provider = Object.create(ClineProvider.prototype) as ClineProvider
	Object.defineProperty(provider, "cwd", { value: process.cwd(), configurable: true })
	Object.assign(provider, {
		outputChannel: { appendLine: vi.fn() },
		context: {
			globalState: {
				get: (key: string) => values.get(key),
				update: async (key: string, value: unknown) => void values.set(key, value),
			},
		},
		contextProxy: {
			getValue: (key: string) => (key === "orchestrationSettings" ? { ...settings, enabled } : undefined),
			getValues: () => ({ currentApiConfigName: "default" }),
		},
		providerSettingsManager: {
			getProfile: vi.fn(async () => ({
				id: "default-id",
				name: "default",
				apiProvider: "openrouter",
				openRouterModelId: "default-model",
			})),
		},
		getMode: vi.fn(async () => mode),
		getCustomModes: vi.fn(async () => []),
		customModesManager: { getCustomModes: vi.fn(async () => []) },
		resolveOrchestrationRoute: vi.fn(async () => ({
			profileId: "default-id",
			provider: "openrouter",
			modelId: "default-model",
			role: "worker",
			source: "primary",
			resolvedAt: Date.now(),
		})),
		postMessageToWebview: vi.fn(async () => undefined),
	})
	Object.assign(provider as any, {
		__values: values,
		clineStack: [],
		orchestratorDecisionServices: new WeakMap(),
		rootBudgetLedgers: new Map(),
	})
	return provider
}

const input: StartOrchestrationInput = {
	runId: "run",
	rootTaskId: "root",
	goal: "boundary",
	settings,
	nodes: [
		{
			nodeId: "node",
			role: "worker",
			mode: "code",
			title: "Worker",
			objective: "Do work",
			inputContract: {
				contractVersion: 1,
				runId: "run",
				nodeId: "node",
				goal: "boundary",
				objective: "Do work",
				acceptanceCriteria: [],
				constraints: [],
				mode: "code",
				fileScopes: { include: [], exclude: [] },
				dependencySummaries: [],
				relevantFacts: [],
				allowedTools: [],
				outputRequirements: [],
				tokenBudget: 1,
				parentContextDigest: "digest",
			},
		},
	],
}

describe("ClineProvider orchestration route resolution", () => {
	function routeProvider(state: any, profiles: Record<string, any>) {
		const provider = providerBoundary(true, "orchestrator") as any
		provider.getState = vi.fn(async () => state)
		provider.providerSettingsManager = {
			getProfile: vi.fn(async (ref: { name?: string; id?: string }) => {
				const profile = ref.name
					? profiles[ref.name]
					: Object.values(profiles).find((p: any) => p.id === ref.id)
				if (!profile) throw new Error("not found")
				return profile
			}),
		}
		provider.getProviderProfileEntry = vi.fn((name: string) => ({ id: profiles[name]?.id }))
		provider.resolveOrchestrationRoute = ClineProvider.prototype["resolveOrchestrationRoute"].bind(provider)
		return provider
	}

	it("uses assigned profile and explicit model instead of the active profile", async () => {
		const provider = routeProvider(
			{
				currentApiConfigName: "A",
				roleAssignments: { roles: { worker: { profileName: "B", modelId: "model-X", inheritPrimary: false } } },
			},
			{
				A: { id: "a", name: "A", apiProvider: "openrouter", openRouterModelId: "model-A" },
				B: { id: "b", name: "B", apiProvider: "openrouter", openRouterModelId: "model-B" },
			},
		)
		expect(await provider.resolveOrchestrationRoute({ role: "worker", mode: "code" })).toMatchObject({
			profileId: "b",
			modelId: "model-X",
		})
	})

	it("routes reviewer nodes through the reviewer assignment", async () => {
		const provider = routeProvider(
			{
				currentApiConfigName: "A",
				roleAssignments: {
					roles: { reviewer: { profileName: "Review", modelId: "review-model", inheritPrimary: false } },
				},
			},
			{
				A: { id: "a", name: "A", apiProvider: "openrouter", openRouterModelId: "model-A" },
				Review: {
					id: "review",
					name: "Review",
					apiProvider: "openrouter",
					openRouterModelId: "review-primary",
				},
			},
		)
		expect(await provider.resolveOrchestrationRoute({ role: "reviewer", mode: "reviewer" })).toMatchObject({
			profileId: "review",
			modelId: "review-model",
			role: "reviewer",
			source: "explicit",
		})
	})

	it("inherits the current primary model of the assigned profile", async () => {
		const profiles = { B: { id: "b", name: "B", apiProvider: "openrouter", openRouterModelId: "model-B2" } }
		const provider = routeProvider(
			{
				currentApiConfigName: "A",
				roleAssignments: { roles: { worker: { profileName: "B", inheritPrimary: true } } },
			},
			profiles,
		)
		expect(await provider.resolveOrchestrationRoute({ role: "worker" })).toMatchObject({
			profileId: "b",
			modelId: "model-B2",
		})
	})

	it("uses an assigned model even when legacy inheritPrimary is true", async () => {
		const provider = routeProvider(
			{
				currentApiConfigName: "A",
				roleAssignments: {
					roles: { architect: { profileName: "B", modelId: "claude-opus-4-8", inheritPrimary: true } },
				},
			},
			{
				A: { id: "a", name: "A", apiProvider: "anthropic", apiModelId: "claude-sonnet-4-6" },
				B: { id: "b", name: "B", apiProvider: "anthropic", apiModelId: "claude-sonnet-4-6" },
			},
		)
		expect(await provider.resolveOrchestrationRoute({ role: "architect" })).toMatchObject({
			profileId: "b",
			modelId: "claude-opus-4-8",
			source: "explicit",
		})
	})

	it("keeps active-profile fallback when no assignment exists", async () => {
		const provider = routeProvider(
			{ currentApiConfigName: "A" },
			{ A: { id: "a", name: "A", apiProvider: "openrouter", openRouterModelId: "model-A" } },
		)
		expect(await provider.resolveOrchestrationRoute({ role: "worker" })).toMatchObject({
			profileId: "a",
			modelId: "model-A",
		})
	})

	it("fails closed for an unknown canonical role before task creation", async () => {
		const provider = routeProvider(
			{ currentApiConfigName: "A", roleAssignments: { roles: { worker: { profileName: "A" } } } },
			{ A: { id: "a", name: "A", apiProvider: "openrouter", openRouterModelId: "model-A" } },
		)
		await expect(provider.resolveOrchestrationRoute({ role: "future-role", mode: "code" })).rejects.toThrow(
			"Unknown orchestration role 'future-role'",
		)
	})

	it("resolves a canonical role to its assigned mode, profile, and model", async () => {
		const provider = routeProvider(
			{
				currentApiConfigName: "A",
				roleAssignments: {
					roles: { implementer: { modeSlug: "code", profileName: "B", modelId: "model-code" } },
				},
			},
			{ B: { id: "b", name: "B", apiProvider: "openrouter", openRouterModelId: "primary" } },
		)
		await expect(provider.resolveOrchestrationRoute({ role: "implementer" })).resolves.toMatchObject({
			role: "implementer",
			modeSlug: "code",
			profileId: "b",
			modelId: "model-code",
		})
	})

	it("fails closed when an orchestration assignment profile is unavailable", async () => {
		const provider = routeProvider(
			{
				currentApiConfigName: "A",
				roleAssignments: { roles: { worker: { profileName: "deleted-profile" } } },
			},
			{ A: { id: "a", name: "A", apiProvider: "openrouter", openRouterModelId: "model-A" } },
		)

		await expect(provider.resolveOrchestrationRoute({ role: "worker" })).rejects.toThrow(
			"Orchestration profile 'deleted-profile' for role 'worker' could not be resolved",
		)
	})
})

describe("ClineProvider profile resolution context policy", () => {
	it("preserves non-orchestration fallback for an unavailable assigned profile", async () => {
		const provider = providerBoundary(true, "code") as any
		provider.getState = vi.fn(async () => ({ currentApiConfigName: "active" }))
		provider.providerSettingsManager.getProfile = vi.fn(async () => {
			throw new Error("not found")
		})

		await expect(
			provider.resolveEffectiveApiConfiguration({
				mode: "code",
				baseApiConfiguration: { apiProvider: "openrouter", openRouterModelId: "active-model" },
				state: {
					currentApiConfigName: "active",
					roleAssignments: { roles: { code: { profileName: "deleted-profile" } } },
				},
			}),
		).resolves.toMatchObject({ isRoleSpecificConfig: false })
	})
})

describe("ClineProvider orchestration boundary", () => {
	it("does not allow the legacy enabled flag to disable orchestration", async () => {
		const provider = providerBoundary(false, "orchestrator")
		await expect(provider.getOrchestrationService()).resolves.toBeDefined()
	})

	it("only exposes orchestration from the orchestrator role", async () => {
		await expect(providerBoundary(true, "code").getOrchestrationService()).rejects.toThrow(
			"only available in orchestrator mode",
		)
	})

	it("owns one lazy service and reports unsupported execution explicitly", async () => {
		const provider = providerBoundary(true, "orchestrator")
		const first = await provider.getOrchestrationService()
		const second = await provider.getOrchestrationService()
		expect(second).toBe(first)

		await first.start(input)
		await first.dispatch("run")
		const snapshot = await first.getSnapshot("run")
		expect(snapshot.nodes[0].error?.message).toContain("no safe Task adapter")
		expect(provider.postMessageToWebview).toHaveBeenCalledWith(
			expect.objectContaining({ type: "orchestrationEvent" }),
		)
	})
})

function acceptanceSession(decision: "direct" | "delegated" = "direct"): LeadSession {
	return {
		schemaVersion: 1,
		sessionId: "session",
		requestId: "request-1",
		rootTaskId: "root",
		goal: "Ship the requested boundary safely",
		requestRevision: 0,
		fingerprint: "fingerprint",
		configFingerprint: "config",
		workspaceFingerprint: "workspace",
		phase: "executing",
		version: 1,
		decision: {
			schemaVersion: 1,
			requestId: "request-1",
			task: { summary: "boundary", goal: "Ship the requested boundary safely" },
			decision,
			judgment: { label: "low", confidence: 1, rationale: "ordinary task" },
			phases: [],
			dependencies: [],
			roles: [],
			acceptance: ["tests pass"],
			evidence: [],
			checkpoints: [],
			estimates: { durationMs: 1, budget: { tokens: 10, cost: 0, calls: 1 } },
			hardBudget: { tokens: 100, cost: 0, calls: 4 },
			nonGoals: [],
			risks: [],
			policyConstraints: [],
		} as any,
		evidence: [],
		usage: { calls: 1, known: true },
		reservations: { assessment: 10, execution: 80, acceptance: 10, used: 1 },
		budget: createBudget(100, undefined, 4),
		acceptanceAttempt: 0,
		updatedAt: 1,
	}
}

function apiResponse(text: string, known = true) {
	return {
		getModel: () => ({ id: "acceptance-model" }),
		createMessage: vi.fn((_system: string, messages: Array<{ content: string }>, options: { taskId: string }) => ({
			async *[Symbol.asyncIterator]() {
				yield { type: "text", text }
				if (known) yield { type: "usage", inputTokens: 2, outputTokens: 3, totalCost: 0.01 }
			},
		})),
	}
}

async function acceptanceBoundary(api: ReturnType<typeof apiResponse>, values = new Map<string, unknown>()) {
	const provider = providerBoundary(true, "orchestrator") as any
	provider.__values = values
	provider.context.globalState.get = (key: string) => values.get(key)
	provider.context.globalState.update = async (key: string, value: unknown) => void values.set(key, value)
	const task = {
		taskId: "root",
		cwd: process.cwd(),
		api,
		apiConversationHistory: [{ role: "assistant", content: "tests passed" }],
		getTaskMode: vi.fn(async () => "orchestrator"),
		currentRequestAbortController: new AbortController(),
	}
	provider.clineStack = [task]
	provider.getTaskWithId = vi.fn(async (id: string) => ({
		historyItem: { id, mode: "orchestrator", childIds: [] },
		apiConversationHistory: task.apiConversationHistory,
	}))
	provider.getWorkspaceRevisionFingerprint = vi.fn(async () => "revision-1")
	provider.getOrchestratorSystemPrompt = vi.fn(async () => "system")
	return provider as ClineProvider
}

function acceptedDecision() {
	const evidenceRef = buildTaskEvidenceRegistry({
		requestId: "request-1",
		originalGoal: "Ship the requested boundary safely",
		result: "done",
		workspaceRevision: "revision-1",
		tasks: [{ taskId: "root", role: "orchestrator", history: [{ role: "assistant", content: "tests passed" }] }],
	}).records[0].id
	return JSON.stringify({
		schemaVersion: 1,
		requestId: "request-1",
		outcome: "accepted",
		confidence: 1,
		rationale: "verified",
		criteria: [{ criterionId: "REQ-1", status: "met", evidenceRefs: [evidenceRef], rationale: "passed" }],
	})
}

describe("ClineProvider leadAcceptanceGate production boundary", () => {
	const temporaryDirectories: string[] = []
	afterEach(async () =>
		Promise.all(temporaryDirectories.splice(0).map((cwd) => fs.rm(cwd, { recursive: true, force: true }))),
	)

	it("accepts an unchanged direct non-git root using the production fingerprint", async () => {
		const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "acceptance-non-git-"))
		temporaryDirectories.push(cwd)
		await fs.writeFile(path.join(cwd, "result.txt"), "stable")
		const api = apiResponse(acceptedDecision())
		const provider = (await acceptanceBoundary(api)) as any
		provider.clineStack[0].cwd = cwd
		delete provider.getWorkspaceRevisionFingerprint
		await new VersionedLeadSessionStore(provider.context.globalState).save("root", acceptanceSession())
		await expect(provider.leadAcceptanceGate({ taskId: "root", result: "done" })).resolves.toMatchObject({
			outcome: "accepted",
		})
	})

	it("passes requestId and original goal, persists known usage, and reuses acceptance after provider restart", async () => {
		const values = new Map<string, unknown>()
		const api = apiResponse(acceptedDecision())
		let provider = await acceptanceBoundary(api, values)
		await new VersionedLeadSessionStore((provider as any).context.globalState).save("root", acceptanceSession())

		await expect(provider.leadAcceptanceGate({ taskId: "root", result: "done" })).resolves.toEqual({
			outcome: "accepted",
			feedback: undefined,
		})
		const prompt = api.createMessage.mock.calls[0][1][0].content
		expect(prompt).toContain('RequestId: "request-1"')
		expect(prompt).toContain('"originalGoal":"Ship the requested boundary safely"')
		let persisted = await new VersionedLeadSessionStore((provider as any).context.globalState).load("root")
		expect(persisted?.budget?.used).toMatchObject({ inputTokens: 2, outputTokens: 3 })
		expect(persisted?.budget?.usedCalls).toBe(1)

		provider = await acceptanceBoundary(api, values)
		await expect(provider.leadAcceptanceGate({ taskId: "root", result: "done" })).resolves.toEqual({
			outcome: "accepted",
		})
		expect(api.createMessage).toHaveBeenCalledTimes(1)
		persisted = await new VersionedLeadSessionStore((provider as any).context.globalState).load("root")
		expect(persisted?.phase).toBe("completed")
	})

	it("durably counts malformed calls, allocates a new attemptId, and enforces max attempts", async () => {
		const values = new Map<string, unknown>()
		const api = apiResponse("not-json")
		let provider = await acceptanceBoundary(api, values)
		await new VersionedLeadSessionStore((provider as any).context.globalState).save("root", acceptanceSession())
		await expect(provider.leadAcceptanceGate({ taskId: "root", result: "done" })).resolves.toMatchObject({
			outcome: "blocked",
		})
		let persisted = await new VersionedLeadSessionStore((provider as any).context.globalState).load("root")
		const firstKey = Object.keys(persisted?.budget?.usageByIdempotencyKey ?? {})[0]
		expect(persisted?.acceptanceAttempt).toBe(1)

		provider = await acceptanceBoundary(api, values)
		await expect(provider.leadAcceptanceGate({ taskId: "root", result: "done" })).resolves.toMatchObject({
			outcome: "blocked",
		})
		persisted = await new VersionedLeadSessionStore((provider as any).context.globalState).load("root")
		const keys = Object.keys(persisted?.budget?.usageByIdempotencyKey ?? {})
		expect(persisted?.acceptanceAttempt).toBe(2)
		expect(keys).toHaveLength(2)
		expect(keys[1]).not.toBe(firstKey)

		provider = await acceptanceBoundary(api, values)
		await expect(provider.leadAcceptanceGate({ taskId: "root", result: "done" })).resolves.toMatchObject({
			outcome: "blocked",
			feedback: "Acceptance repair limit exceeded.",
		})
		expect(api.createMessage).toHaveBeenCalledTimes(2)
	})

	it("fails closed for a missing root and delegated child completion", async () => {
		const api = apiResponse(acceptedDecision())
		const provider = (await acceptanceBoundary(api)) as any
		provider.clineStack = []
		await expect(provider.leadAcceptanceGate({ taskId: "root", result: "done" })).resolves.toMatchObject({
			outcome: "blocked",
		})
		provider.clineStack = [{ taskId: "root" }]
		await expect(
			provider.leadAcceptanceGate({ taskId: "child", parentTaskId: "root", result: "done" }),
		).resolves.toMatchObject({ outcome: "blocked" })
		expect(api.createMessage).not.toHaveBeenCalled()
	})

	it("keeps delegated parent acceptance authoritative across a provider restart", async () => {
		const values = new Map<string, unknown>()
		const api = apiResponse(acceptedDecision())
		let provider = (await acceptanceBoundary(api, values)) as any
		await new VersionedLeadSessionStore(provider.context.globalState).save("root", acceptanceSession())
		const parent = provider.clineStack[0]
		const child = { taskId: "child", parentTaskId: "root", getTaskMode: vi.fn(async () => "code") }
		provider.clineStack = [parent, child]
		await expect(
			provider.leadAcceptanceGate({ taskId: "child", parentTaskId: "root", result: "done" }),
		).resolves.toMatchObject({ outcome: "blocked" })
		await expect(provider.leadAcceptanceGate({ taskId: "root", result: "done" })).resolves.toMatchObject({
			outcome: "accepted",
		})

		provider = (await acceptanceBoundary(api, values)) as any
		provider.clineStack = [provider.clineStack[0], child]
		await expect(
			provider.leadAcceptanceGate({ taskId: "child", parentTaskId: "root", result: "done" }),
		).resolves.toMatchObject({ outcome: "blocked" })
		await expect(provider.leadAcceptanceGate({ taskId: "root", result: "done" })).resolves.toMatchObject({
			outcome: "accepted",
		})
		expect(api.createMessage).toHaveBeenCalledTimes(1)
	})

	it("does not invoke the provider for unknown or expired accepting markers", async () => {
		const values = new Map<string, unknown>()
		const api = apiResponse(acceptedDecision())
		let provider = (await acceptanceBoundary(api, values)) as any
		const store = new VersionedLeadSessionStore(provider.context.globalState)
		await store.save("root", {
			...acceptanceSession(),
			accepting: {
				attempt: 1,
				attemptId: "unknown",
				requestId: "request-1",
				expiresAt: Date.now() - 1,
				resultHash: "x",
				workspaceRevision: "revision-1",
				requestRevision: 0,
				startedAt: 1,
			},
		})
		await expect(provider.leadAcceptanceGate({ taskId: "root", result: "done" })).resolves.toMatchObject({
			outcome: "blocked",
		})
		expect(api.createMessage).not.toHaveBeenCalled()
		provider = (await acceptanceBoundary(api, values)) as any
		await store.save("root", {
			...acceptanceSession(),
			accepting: {
				attempt: 1,
				attemptId: "known",
				requestId: "request-1",
				expiresAt: Date.now() + 60_000,
				resultHash: "x",
				workspaceRevision: "revision-1",
				requestRevision: 0,
				startedAt: 1,
			},
		})
		await expect(provider.leadAcceptanceGate({ taskId: "root", result: "done" })).resolves.toMatchObject({
			outcome: "blocked",
		})
		expect(api.createMessage).not.toHaveBeenCalled()
	})

	it("rejects blocking review evidence even when the lead reports acceptance", async () => {
		const api = apiResponse(acceptedDecision())
		const provider = (await acceptanceBoundary(api)) as any
		provider.getTaskWithId = vi.fn(async (id: string) => ({
			historyItem: { id, mode: "reviewer", childIds: [] },
			apiConversationHistory: [{ role: "assistant", content: "BLOCKING REVIEW: failed" }],
		}))
		await expect(provider.leadAcceptanceGate({ taskId: "root", result: "done" })).resolves.toMatchObject({
			outcome: "blocked",
		})
	})

	it("serializes concurrent acceptance and preserves the winning evidence", async () => {
		const values = new Map<string, unknown>()
		let release!: () => void
		const gate = new Promise<void>((resolve) => (release = resolve))
		const api = apiResponse(acceptedDecision())
		api.createMessage.mockImplementation(
			(_system: string, messages: Array<{ content: string }>, options: { taskId: string }) => ({
				async *[Symbol.asyncIterator]() {
					await gate
					yield { type: "text", text: acceptedDecision() }
					yield { type: "usage", inputTokens: 2, outputTokens: 3, totalCost: 0.01 }
				},
			}),
		)
		const provider = (await acceptanceBoundary(api, values)) as any
		await new VersionedLeadSessionStore(provider.context.globalState).save("root", acceptanceSession())
		const first = provider.leadAcceptanceGate({ taskId: "root", result: "done" })
		const second = provider.leadAcceptanceGate({ taskId: "root", result: "done" })
		release()
		const results = await Promise.all([first, second])
		expect(results.filter((result) => result.outcome === "accepted")).toHaveLength(1)
		expect(api.createMessage).toHaveBeenCalledTimes(1)
	})

	it("does not persist acceptance after a fresh snapshot changes the evidence", async () => {
		const api = apiResponse(acceptedDecision())
		const provider = (await acceptanceBoundary(api)) as any
		await new VersionedLeadSessionStore(provider.context.globalState).save("root", acceptanceSession())
		let revisionReads = 0
		provider.getWorkspaceRevisionFingerprint = vi.fn(async () => {
			revisionReads += 1
			return revisionReads >= 3 ? "revision-2" : "revision-1"
		})
		api.createMessage.mockImplementation(
			(_system: string, _messages: Array<{ content: string }>, _options: { taskId: string }) => ({
				async *[Symbol.asyncIterator]() {
					yield { type: "text", text: acceptedDecision() }
					yield { type: "usage", inputTokens: 2, outputTokens: 3, totalCost: 0.01 }
				},
			}),
		)
		const pending = provider.leadAcceptanceGate({ taskId: "root", result: "done" })
		await expect(pending).resolves.toMatchObject({
			outcome: "blocked",
			feedback: "Acceptance result became stale and was not persisted.",
		})
		const persisted = await new VersionedLeadSessionStore(provider.context.globalState).load("root")
		expect(persisted?.phase).not.toBe("completed")
	})
})

const resultContract = {
	contractVersion: 1 as const,
	status: "completed" as const,
	summary: "completed",
	filesRead: ["src/worker.ts"],
	filesChanged: ["src/worker.ts"],
	artifactRefs: ["artifact:worker"],
	tests: [],
	assumptions: [],
	risks: [],
	openQuestions: [],
	nextActions: [],
}

describe("ClineProvider TaskCompleted result boundary", () => {
	it("extracts completion history and reaches ready_to_integrate with usage", async () => {
		const provider = providerBoundary(true, "orchestrator") as any
		const child = Object.assign(new EventEmitter(), {
			taskId: "child",
			clineMessages: [
				{
					type: "ask",
					ask: "completion_result",
					text: JSON.stringify({ ...resultContract, filesRead: [], filesChanged: [] }),
				},
			],
			apiConversationHistory: [],
			abortTask: vi.fn(async () => undefined),
		})
		const root = { taskId: "root" }
		provider.clineStack = [root]
		provider.createTask = vi.fn(async (_message, _images, parent) => {
			expect(parent).toBe(root)
			return child
		})
		const service = await provider.getOrchestrationService()
		await service.start({ ...input, settings: { ...settings, requireIntegrationApproval: true } })
		await service.dispatch("run")
		child.emit(
			AiCodeOrchestratorEventName.TaskCompleted,
			"child",
			{ totalTokensIn: 7, totalTokensOut: 3, totalCost: 0.2 },
			{},
		)
		await new Promise((resolve) => setImmediate(resolve))
		const snapshot = await service.getSnapshot("run")
		expect(snapshot.nodes[0].status).toBe("ready_to_integrate")
		expect(snapshot.nodes[0].outputContract).toEqual({ ...resultContract, filesRead: [], filesChanged: [] })
		expect(snapshot.run.budget.used).toMatchObject({ inputTokens: 7, outputTokens: 3, cost: 0.2 })
	})

	it("reports an invalid completion contract as failed", async () => {
		const provider = providerBoundary(true, "orchestrator") as any
		const child = Object.assign(new EventEmitter(), {
			taskId: "child",
			clineMessages: [],
			apiConversationHistory: [],
		})
		const root = { taskId: "root" }
		provider.clineStack = [root]
		provider.createTask = vi.fn(async (_message, _images, parent) => {
			expect(parent).toBe(root)
			return child
		})
		const service = await provider.getOrchestrationService()
		await service.start(input)
		await service.dispatch("run")
		child.emit(
			AiCodeOrchestratorEventName.TaskCompleted,
			"child",
			{ totalTokensIn: 1, totalTokensOut: 2, totalCost: 0 },
			{},
		)
		await new Promise((resolve) => setImmediate(resolve))
		const snapshot = await service.getSnapshot("run")
		expect(snapshot.nodes[0].status).toBe("failed")
		expect(snapshot.nodes[0].error?.code).toBe("result_contract_unavailable")
	})
})
