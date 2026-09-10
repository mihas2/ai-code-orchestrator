import { describe, expect, it, vi } from "vitest"
import { ClineProvider } from "../../webview/ClineProvider"
import type { StartOrchestrationInput } from "../types"
import { AiCodeOrchestratorEventName } from "@ai-code-orchestrator/types"
import EventEmitter from "events"

vi.mock("../workerIsolation", () => ({
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
	maxParallelWorkers: 2,
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

function createMockProvider(autoApprovalSettings: {
	alwaysAllowReadOnly?: boolean
	alwaysAllowReadOnlyOutsideWorkspace?: boolean
	alwaysAllowWrite?: boolean
	alwaysAllowWriteOutsideWorkspace?: boolean
	alwaysAllowWriteProtected?: boolean
	alwaysAllowExecute?: boolean
}) {
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
			getValue: (key: string) => (key === "orchestrationSettings" ? settings : undefined),
			getValues: () => ({
				currentApiConfigName: "default",
				...autoApprovalSettings,
			}),
		},
		providerSettingsManager: {
			getProfile: vi.fn(async () => ({
				id: "default-id",
				name: "default",
				apiProvider: "openrouter",
				openRouterModelId: "default-model",
			})),
		},
		getMode: vi.fn(async () => "orchestrator"),
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
		getState: vi.fn(async () => ({
			currentApiConfigName: "default",
			...autoApprovalSettings,
		})),
	})
	return provider
}

const createInput = (nodeIds: string[]): StartOrchestrationInput => ({
	runId: "run",
	rootTaskId: "root",
	goal: "test auto-approval inheritance",
	settings,
	nodes: nodeIds.map((nodeId) => ({
		nodeId,
		role: "worker",
		mode: "code",
		title: `Worker ${nodeId}`,
		objective: `Do work ${nodeId}`,
		inputContract: {
			contractVersion: 1,
			runId: "run",
			nodeId,
			goal: "test auto-approval inheritance",
			objective: `Do work ${nodeId}`,
			acceptanceCriteria: [],
			constraints: [],
			mode: "code",
			fileScopes: { include: [], exclude: [] },
			dependencySummaries: [],
			relevantFacts: [],
			allowedTools: [],
			outputRequirements: [],
			tokenBudget: 10,
			parentContextDigest: "x",
		},
	})),
})

describe("OrchestrationExecutor auto-approval inheritance", () => {
	it("should pass parent auto-approval settings to first worker via configuration", async () => {
		// Arrange: Create provider with auto-approval settings enabled
		const provider = createMockProvider({
			alwaysAllowReadOnly: true,
			alwaysAllowReadOnlyOutsideWorkspace: true,
			alwaysAllowWrite: true,
			alwaysAllowWriteOutsideWorkspace: false,
			alwaysAllowWriteProtected: false,
			alwaysAllowExecute: false,
		})

		// Track configurations passed to workers
		const workerConfigurations: any[] = []

		// Mock delegateParentAndOpenChild to capture configuration
		provider.delegateParentAndOpenChild = vi.fn(async ({ configuration }) => {
			workerConfigurations.push(configuration)

			// Create mock child task
			const child = new EventEmitter() as any
			child.taskId = `child-${workerConfigurations.length}`
			child.clineMessages = []
			child.apiConversationHistory = []
			child.off = vi.fn()
			child.on = vi.fn()

			// Simulate task completion after a short delay
			setTimeout(() => {
				const completeHandler = (child.on as any).mock.calls.find(
					([event]: [string]) => event === AiCodeOrchestratorEventName.TaskCompleted,
				)?.[1]
				if (completeHandler) {
					completeHandler(child.taskId, { totalTokensIn: 10, totalTokensOut: 10, totalCost: 0.001 })
				}
			}, 10)

			return child
		})

		// Mock getCurrentTask to return parent
		const parentTask = { taskId: "root" } as any
		provider.getCurrentTask = vi.fn(() => parentTask)

		// Act: Starting creates the run; dispatching launches its ready workers.
		const service = await provider.getOrchestrationService()
		const input = createInput(["worker1", "worker2"])
		await service.start(input)
		await service.dispatch(input.runId)

		// Assert: Both workers should receive parent's auto-approval settings in configuration
		expect(workerConfigurations).toHaveLength(2)

		// This is the failing assertion - first worker does NOT receive auto-approval settings
		const firstWorkerConfig = workerConfigurations[0]
		expect(firstWorkerConfig).toBeDefined()
		expect(firstWorkerConfig).toHaveProperty("alwaysAllowReadOnly", true)
		expect(firstWorkerConfig).toHaveProperty("alwaysAllowReadOnlyOutsideWorkspace", true)
		expect(firstWorkerConfig).toHaveProperty("alwaysAllowWrite", true)
		expect(firstWorkerConfig).toHaveProperty("alwaysAllowWriteOutsideWorkspace", false)
		expect(firstWorkerConfig).toHaveProperty("alwaysAllowWriteProtected", false)
		expect(firstWorkerConfig).toHaveProperty("alwaysAllowExecute", false)

		// If we have a second worker, it should also receive the settings
		if (workerConfigurations.length > 1) {
			const secondWorkerConfig = workerConfigurations[1]
			expect(secondWorkerConfig).toBeDefined()
			expect(secondWorkerConfig).toHaveProperty("alwaysAllowReadOnly", true)
			expect(secondWorkerConfig).toHaveProperty("alwaysAllowReadOnlyOutsideWorkspace", true)
			expect(secondWorkerConfig).toHaveProperty("alwaysAllowWrite", true)
		}
	})

	it("should maintain consistent auto-approval behavior across multiple workers", async () => {
		// Arrange: Create provider with specific auto-approval settings
		const provider = createMockProvider({
			alwaysAllowReadOnly: true,
			alwaysAllowReadOnlyOutsideWorkspace: false,
			alwaysAllowWrite: false,
			alwaysAllowWriteOutsideWorkspace: false,
			alwaysAllowWriteProtected: false,
			alwaysAllowExecute: true,
		})

		const workerConfigurations: any[] = []

		provider.delegateParentAndOpenChild = vi.fn(async ({ configuration }) => {
			workerConfigurations.push(configuration)

			const child = new EventEmitter() as any
			child.taskId = `child-${workerConfigurations.length}`
			child.clineMessages = []
			child.apiConversationHistory = []
			child.off = vi.fn()
			child.on = vi.fn()

			setTimeout(() => {
				const completeHandler = (child.on as any).mock.calls.find(
					([event]: [string]) => event === AiCodeOrchestratorEventName.TaskCompleted,
				)?.[1]
				if (completeHandler) {
					completeHandler(child.taskId, { totalTokensIn: 10, totalTokensOut: 10, totalCost: 0.001 })
				}
			}, 10)

			return child
		})

		const parentTask = { taskId: "root" } as any
		provider.getCurrentTask = vi.fn(() => parentTask)

		// Act: Start the run and explicitly dispatch up to the configured parallel limit.
		const service = await provider.getOrchestrationService()
		const input = createInput(["w1", "w2", "w3"])
		await service.start(input)
		await service.dispatch(input.runId)

		// Assert: Every worker started in the first wave receives identical settings.
		expect(workerConfigurations).toHaveLength(settings.maxParallelWorkers)

		for (let i = 0; i < workerConfigurations.length; i++) {
			const config = workerConfigurations[i]
			expect(config, `Worker ${i + 1} configuration`).toMatchObject({
				alwaysAllowReadOnly: true,
				alwaysAllowReadOnlyOutsideWorkspace: false,
				alwaysAllowWrite: false,
				alwaysAllowWriteOutsideWorkspace: false,
				alwaysAllowWriteProtected: false,
				alwaysAllowExecute: true,
			})
		}
	})
})
