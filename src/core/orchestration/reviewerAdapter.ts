import type {
	ArtifactDescriptor,
	OrchestrationNode,
	OrchestrationRun,
	OrchestrationSnapshot,
	ReviewAdapter,
	ReviewFinding,
	ReviewResult,
	ResultContract,
	SynthesisAdapter,
	SynthesisResult,
} from "./types"

export const REVIEWER_STATE_KEY = "orchestration.reviewerState"
export const CURRENT_REVIEWER_STATE_VERSION = 1

export interface ReviewerState {
	enabled: boolean
	prompt: string | null
	policy?: string
}

export interface PersistedReviewerState extends ReviewerState {
	version: number
}

type ExtensionStateStore = {
	get<T>(key: string): T | undefined
	update(key: string, value: unknown): PromiseLike<void>
}

export type ReviewerStateContext = {
	globalState: ExtensionStateStore
	workspaceState: ExtensionStateStore
}

export type ReviewerStateScope = "global" | "workspace"

export type ReviewerRunner = (input: {
	run: Readonly<OrchestrationRun>
	node: Readonly<OrchestrationNode>
	result: Readonly<ResultContract>
	artifacts: readonly ArtifactDescriptor[]
	idempotencyKey: string
	diff?: string
	acceptanceCriteria: readonly string[]
}) => Promise<ReviewFinding[]>

/** Bridges the orchestration review contract to the host's reviewer execution. */
export class ReviewerAdapter implements ReviewAdapter {
	private state: ReviewerState = { enabled: false, prompt: null }

	constructor(
		private readonly runner?: ReviewerRunner,
		private context?: ReviewerStateContext,
		private readonly options: { scope?: ReviewerStateScope } = {},
	) {}

	getState(): ReviewerState {
		return { ...this.state }
	}

	async saveState(state: ReviewerState): Promise<void> {
		this.state = { ...state }
		if (!this.context) return
		const persisted: PersistedReviewerState = { version: CURRENT_REVIEWER_STATE_VERSION, ...this.state }
		try {
			await this.store().update(REVIEWER_STATE_KEY, JSON.stringify(persisted))
		} catch (error) {
			console.warn(`[ReviewerAdapter] Failed to persist reviewer state: ${String(error)}`)
		}
	}

	async restoreState(context: ReviewerStateContext = this.context as ReviewerStateContext): Promise<ReviewerState> {
		this.context = context
		const store = this.store()
		try {
			const raw = store.get<unknown>(REVIEWER_STATE_KEY)
			const migrated = this.migrate(raw)
			this.state = migrated.state
			if (migrated.migrated) await store.update(REVIEWER_STATE_KEY, JSON.stringify(migrated.persisted))
		} catch (error) {
			this.state = { enabled: false, prompt: null }
			console.warn(`[ReviewerAdapter] Invalid persisted reviewer state; using defaults: ${String(error)}`)
		}
		return this.getState()
	}

	private store(): ExtensionStateStore {
		if (!this.context) throw new Error("Reviewer state context is not configured")
		return this.options.scope === "workspace" ? this.context.workspaceState : this.context.globalState
	}

	private migrate(raw: unknown): { state: ReviewerState; persisted: PersistedReviewerState; migrated: boolean } {
		if (raw === undefined) {
			const state = { ...this.state }
			return { state, persisted: { version: CURRENT_REVIEWER_STATE_VERSION, ...state }, migrated: false }
		}
		const decoded = typeof raw === "string" ? JSON.parse(raw) : raw
		if (!decoded || typeof decoded !== "object") throw new Error("state is not an object")
		const value = decoded as Partial<PersistedReviewerState>
		if (typeof value.enabled !== "boolean") throw new Error("enabled is invalid")
		if (value.prompt !== undefined && value.prompt !== null && typeof value.prompt !== "string")
			throw new Error("prompt is invalid")
		const state: ReviewerState = {
			enabled: value.enabled,
			prompt: value.prompt ?? null,
			...(typeof value.policy === "string" ? { policy: value.policy } : {}),
		}
		const persisted = { version: CURRENT_REVIEWER_STATE_VERSION, ...state }
		return {
			state,
			persisted,
			migrated: value.version !== CURRENT_REVIEWER_STATE_VERSION || value.prompt === undefined,
		}
	}

	async review(input: Parameters<ReviewAdapter["review"]>[0]): Promise<ReviewResult> {
		if (!this.runner) {
			if (input.run.settingsSnapshot.reviewPolicy === "off")
				return { findings: [], artifactRefs: input.artifacts.map((a) => a.ref) }
			throw new Error("ReviewerRunner is not configured")
		}
		const findings = await this.runner({
			...input,
			diff: undefined,
			acceptanceCriteria: input.node.inputContract.acceptanceCriteria,
		})
		return {
			findings: findings.map((finding) => ({
				...finding,
				findingId: finding.findingId ?? finding.id,
				runId: finding.runId ?? input.run.runId,
				nodeId: finding.nodeId ?? input.node.nodeId,
				title: finding.title ?? finding.message,
				filePath: finding.filePath ?? finding.file,
			})),
			artifactRefs: input.artifacts.map((artifact) => artifact.ref),
		}
	}
}

/** Deterministic synthesis adapter used by the runtime when no external synthesizer is configured. */
export class OrchestrationSynthesisAdapter implements SynthesisAdapter {
	async synthesize(snapshot: Readonly<OrchestrationSnapshot>): Promise<SynthesisResult> {
		return {
			runId: snapshot.run.runId,
			status: snapshot.nodes.every((node) => node.status === "integrated") ? "completed" : "partial",
			summary: snapshot.run.goal,
			nodeSummaries: snapshot.nodes.map((node) => ({
				nodeId: node.nodeId,
				status: node.status,
				summary: node.outputContract?.summary,
			})),
			artifactRefs: snapshot.artifacts?.map((artifact) => artifact.ref) ?? [],
			conflictRefs: snapshot.conflicts?.map((conflict) => conflict.id) ?? [],
			reviewFindingIds: snapshot.findings?.map((finding) => finding.findingId ?? finding.id) ?? [],
			generatedAt: Date.now(),
		}
	}
}
