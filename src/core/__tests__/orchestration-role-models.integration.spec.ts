import { describe, expect, it, vi } from "vitest"

import { buildApiHandler } from "../../api"
import { OrchestrationService } from "../orchestration/service"
import type { OrchestrationPersistence } from "../orchestration/persistence"
import type {
	ExecutionHandle,
	OrchestrationExecutor,
	OrchestrationSnapshot,
	ResultContract,
	StartOrchestrationInput,
} from "../orchestration/types"

vi.mock("../../api", () => ({
	buildApiHandler: vi.fn(),
}))

const MODELS = {
	code: "test-code-model",
	debug: "test-debug-model",
	architect: "test-architect-model",
} as const

const settings = {
	schemaVersion: 1 as const,
	enabled: true,
	orchestratorModeSlug: "orchestrator",
	maxParallelWorkers: 1,
	maxDepth: 4,
	timeoutMs: 10_000,
	maxReworkAttempts: 0,
	contextPolicy: "balanced" as const,
	conflictPolicy: "patch" as const,
	reviewPolicy: "off" as const,
	requirePlanApproval: false,
	requireIntegrationApproval: false,
	allowWorkerCommands: false,
	allowWorkerMcp: false,
	persistTranscripts: false,
	maxRunTokens: 100,
	maxChildTokens: 20,
}

const result = (summary: string): ResultContract => ({
	contractVersion: 1,
	status: "completed",
	summary,
	filesRead: [],
	filesChanged: [],
	artifactRefs: [],
	tests: [],
	assumptions: [],
	risks: [],
	openQuestions: [],
	nextActions: [],
})

function contract(runId: string, nodeId: string, mode: string) {
	return {
		contractVersion: 1 as const,
		runId,
		nodeId,
		goal: "Handle the user's request",
		objective: `Complete the ${mode} stage`,
		acceptanceCriteria: ["return a completion result"],
		constraints: [],
		mode,
		fileScopes: { include: [`src/${nodeId}`], exclude: [], write: [`src/${nodeId}`] },
		dependencySummaries: [],
		relevantFacts: [],
		allowedTools: [],
		outputRequirements: ["attempt_completion"],
		tokenBudget: 10,
		parentContextDigest: "root",
	}
}

function memory() {
	let snapshot: OrchestrationSnapshot | undefined
	const persistence: OrchestrationPersistence = {
		load: async () => snapshot && structuredClone(snapshot),
		save: async (value) => void (snapshot = structuredClone(value)),
		scanRecoverable: async () => (snapshot ? [structuredClone(snapshot)] : []),
	}
	return { persistence, get: () => snapshot! }
}

describe("orchestration role model assignment integration", () => {
	it("runs the complete sequential cycle with the configured model for every role", async () => {
		const runId = "role-model-cycle"
		const requests: Array<{ role: string; modelId: string; handlerModelId: string }> = []
		const handlers = new Map<string, { getModel: () => { id: string; info: Record<string, unknown> } }>()
		vi.mocked(buildApiHandler).mockImplementation((configuration: any) => {
			const modelId = configuration.openAiModelId
			if (!modelId) throw new Error("openAiModelId is required")
			const handler = { getModel: () => ({ id: modelId, info: {} }) }
			handlers.set(modelId, handler)
			return handler as any
		})

		const nodes = (["code", "debug", "architect"] as const).map((role, index) => ({
			nodeId: `${role}-stage`,
			role,
			mode: role,
			title: `${role} stage`,
			objective: `Run ${role}`,
			dependsOn: index ? [`${["code", "debug", "architect"][index - 1]}-stage`] : [],
			inputContract: contract(runId, `${role}-stage`, role),
		}))

		const store = memory()
		const executor: OrchestrationExecutor = {
			maxParallel: 1,
			start: async ({ node }) => {
				const modelId = MODELS[node.role as keyof typeof MODELS]
				const handler = buildApiHandler({ apiProvider: "openai", openAiModelId: modelId } as any)
				requests.push({ role: node.role, modelId, handlerModelId: handler.getModel().id })
				const handle: ExecutionHandle = {
					taskId: `${node.nodeId}-task`,
					cancel: async () => undefined,
				}
				return handle
			},
		}
		const service = new OrchestrationService(store.persistence, executor)

		await service.start({
			runId,
			rootTaskId: "user-task",
			goal: "Implement the user's request",
			settings,
			nodes,
		})

		for (const node of nodes) {
			await service.dispatch(runId)
			await service.handleChildEvent({
				runId,
				nodeId: node.nodeId,
				idempotencyKey: `${node.nodeId}:attempt_completion`,
				status: "integrated",
				result: result(`${node.role} completed`),
			})
		}

		expect(requests).toEqual([
			{ role: "code", modelId: MODELS.code, handlerModelId: MODELS.code },
			{ role: "debug", modelId: MODELS.debug, handlerModelId: MODELS.debug },
			{ role: "architect", modelId: MODELS.architect, handlerModelId: MODELS.architect },
		])
		expect(handlers.size).toBe(3)
		expect(store.get().nodes.every((node) => node.status === "integrated")).toBe(true)
		expect(store.get().nodes.map((node) => node.outputContract?.summary)).toEqual([
			"code completed",
			"debug completed",
			"architect completed",
		])
		expect(store.get().run.status).toBe("completed")
		expect(store.get().run.activeNodeIds).toEqual([])
		expect(buildApiHandler).toHaveBeenCalledTimes(3)
	})
})
