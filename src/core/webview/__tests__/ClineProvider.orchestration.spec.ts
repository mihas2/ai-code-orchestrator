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
		context: {
			globalState: {
				get: (key: string) => values.get(key),
				update: async (key: string, value: unknown) => void values.set(key, value),
			},
		},
		contextProxy: {
			getValue: (key: string) => (key === "orchestrationSettings" ? { ...settings, enabled } : undefined),
		},
		getMode: vi.fn(async () => mode),
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
