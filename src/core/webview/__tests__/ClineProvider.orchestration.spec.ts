import { describe, expect, it, vi } from "vitest"
import EventEmitter from "events"

import { AiCodeOrchestratorEventName } from "@ai-code-orchestrator/types"
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

	it("logs when an unknown role falls back to the default role", async () => {
		const provider = routeProvider(
			{ currentApiConfigName: "A", roleAssignments: { roles: { worker: { profileName: "A" } } } },
			{ A: { id: "a", name: "A", apiProvider: "openrouter", openRouterModelId: "model-A" } },
		)
		await provider.resolveOrchestrationRoute({ role: "future-role", mode: "code" })
		expect(provider.outputChannel.appendLine).toHaveBeenCalledWith(
			"Unknown role 'future-role' not found in available modes, falling back to default 'worker'",
		)
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
		provider.getCurrentTask = vi.fn(() => ({ taskId: "root" }))
		provider.delegateParentAndOpenChild = vi.fn(async () => child)
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
		provider.getCurrentTask = vi.fn(() => ({ taskId: "root" }))
		provider.delegateParentAndOpenChild = vi.fn(async () => child)
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
