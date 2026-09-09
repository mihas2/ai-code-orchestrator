import type { ModelRoute, OrchestrationSettings } from "@ai-code-orchestrator/types"

export type RunStatus =
	| "planning"
	| "planned"
	| "dispatching"
	| "running"
	| "reviewing"
	| "reworking"
	| "integrating"
	| "synthesizing"
	| "completed"
	| "failed"
	| "canceled"
	| "paused"
export type NodeStatus =
	| "planned"
	| "blocked"
	| "running"
	| "awaiting_review"
	| "needs_rework"
	| "ready_to_integrate"
	| "integrated"
	| "failed"
	| "canceled"
export type TerminalNodeStatus = Extract<NodeStatus, "integrated" | "failed" | "canceled">

export interface NodeLog {
	nodeId: string
	status: "completed" | "failed" | "rejected" | "dispatching" | "canceled"
	timestamp: number
	stdout?: string
	stderr?: string
	error?: string
	reason?: string
}

export interface ErrorRecord {
	code: string
	message: string
	recoverable: boolean
}
export interface FileScopes {
	include: string[]
	exclude: string[]
	write?: string[]
	allowOverlapWith?: string[]
}
export interface ContextContract {
	contractVersion: 1
	runId: string
	nodeId: string
	goal: string
	objective: string
	acceptanceCriteria: string[]
	constraints: string[]
	mode: string
	fileScopes: FileScopes
	dependencySummaries: Array<{ nodeId: string; summary: string; artifactRefs: string[] }>
	relevantFacts: string[]
	allowedTools: string[]
	allowedCommands?: string[]
	outputRequirements: string[]
	tokenBudget: number
	parentContextDigest: string
}
export interface TestResult {
	command: string
	passed: boolean
	exitCode?: number
	outputRef?: string
}
export interface ResultContract {
	contractVersion: 1
	status: "completed" | "partial" | "failed"
	summary: string
	filesRead: string[]
	filesChanged: string[]
	artifactRefs: string[]
	tests: TestResult[]
	assumptions: string[]
	risks: string[]
	openQuestions: string[]
	nextActions: string[]
	/** Structured review findings reported by reviewer-role workers. */
	findings?: Array<{
		id: string
		severity: ReviewSeverity
		message: string
		title?: string
		file?: string
		line?: number
		evidence?: string
		recommendation?: string
		acceptanceCriterionRef?: string
	}>
}
export interface BudgetUsage {
	inputTokens: number
	cachedInputTokens: number
	outputTokens: number
	reasoningTokens: number
	cost?: number
}
export interface BudgetLedger {
	tokenLimit?: number
	costLimit?: number
	callLimit?: number
	reservedTokens: number
	reservedCost: number
	reservedCalls: number
	used: BudgetUsage
	usedCalls: number
	usageByIdempotencyKey?: Record<
		string,
		{ reservedTokens: number; reservedCost: number; calls: number; reconciled: boolean }
	>
	usageUnknown?: boolean
}
export interface OrchestrationNode {
	nodeId: string
	runId: string
	taskId?: string
	role: string
	mode: string
	title: string
	objective: string
	dependsOn: string[]
	status: NodeStatus
	attempt: number
	maxAttempts: number
	/** Arguments supplied when the task was created. */
	payload?: unknown
	inputContract: ContextContract
	outputContract?: ResultContract
	/** Usage reported by the latest completed attempt. */
	usage?: Partial<BudgetUsage>
	route?: ModelRoute
	artifactRefs: string[]
	reviewRefs: string[]
	conflictRefs: string[]
	timestamps: Record<string, number>
	error?: ErrorRecord
}
export interface OrchestrationRun {
	schemaVersion: 1
	runId: string
	rootTaskId: string
	status: RunStatus
	goal: string
	planVersion: number
	nodeIds: string[]
	settingsSnapshot: OrchestrationSettings
	createdAt: number
	updatedAt: number
	budget: BudgetLedger
	activeNodeIds: string[]
	eventSequence: number
	cancellationRequested?: boolean
	error?: ErrorRecord
	statusBeforePause?: RunStatus
}
export type EventType =
	| "orchestrationStarted"
	| "planReady"
	| "nodeStatusChanged"
	| "nodeReport"
	| "reviewFinding"
	| "conflictDetected"
	| "budgetUpdated"
	| "orchestrationPaused"
	| "orchestrationCompleted"
	| "orchestrationError"
export interface OrchestrationEvent {
	eventId: string
	idempotencyKey: string
	runId: string
	nodeId?: string
	sequence: number
	timestamp: number
	type: EventType
	payload: Readonly<Record<string, unknown>>
}
export interface OrchestrationSnapshot {
	run: OrchestrationRun
	nodes: OrchestrationNode[]
	events: OrchestrationEvent[]
	capturedAt: number
	/** Durable acceptance call identity. Its presence without a result requires reconciliation, never replay. */
	acceptanceInFlight?: { attemptId: string; startedAt: number }
	/** Durable provider receipt consumed exactly once by the state machine after restart. */
	acceptanceResult?: { attemptId: string; result: RootAcceptanceResult; recordedAt: number }
	/** Durable review in-flight identity. */
	reviewInFlight?: { runId: string; nodeId: string; attempt: number; startedAt: number }
	/** Durable review result receipt. */
	reviewResult?: { runId: string; nodeId: string; attempt: number; result: ReviewResult; recordedAt: number }
	/** Durable cancel intent for nodes pending executor.start */
	canceledNodeIntents?: Record<string, { attempt: number; reason?: string; canceledAt: number }>
	artifacts?: ArtifactDescriptor[]
	findings?: ReviewFinding[]
	conflicts?: ConflictRecord[]
	integrationResults?: IntegrationResult[]
	synthesis?: SynthesisResult
	pendingApproval?: "plan" | "integration"
}
export interface PlanNodeInput {
	nodeId: string
	role: string
	mode: string
	title: string
	objective: string
	dependsOn?: string[]
	/** Arguments supplied when the task was created. */
	payload?: unknown
	inputContract: ContextContract
	maxAttempts?: number
}
export interface StartOrchestrationInput {
	runId: string
	rootTaskId: string
	goal: string
	settings: OrchestrationSettings
	nodes: PlanNodeInput[]
	estimatedTokens?: number
	estimatedCost?: number
	budget?: BudgetLedger
	now?: number
}
export interface ChildEvent {
	runId: string
	nodeId: string
	attempt?: number
	taskId?: string
	runtimeIdentity?: string
	idempotencyKey: string
	status: NodeStatus
	result?: ResultContract
	usage?: Partial<BudgetUsage>
	/** Providers must explicitly state whether usage is authoritative. */
	usageKnown?: boolean
	error?: ErrorRecord
	stdout?: string
	stderr?: string
}
export interface ExecutionHandle {
	taskId: string
	cancel(reason?: string): Promise<void>
	dispose?(): Promise<void>
	workspacePath?: string
}
export interface RouteCapabilityValidator {
	resolve(input: {
		run: Readonly<OrchestrationRun>
		node: Readonly<OrchestrationNode>
		attempt: number
	}): Promise<ModelRoute>
}
export interface OrchestrationExecutor {
	readonly maxParallel?: number
	start(input: { run: OrchestrationRun; node: OrchestrationNode; idempotencyKey: string }): Promise<ExecutionHandle>
	recover?(run: OrchestrationRun, node: OrchestrationNode): Promise<ExecutionHandle | undefined>
	review?(input: {
		run: Readonly<OrchestrationRun>
		node: Readonly<OrchestrationNode>
		result: Readonly<ResultContract>
		artifacts: readonly ArtifactDescriptor[]
		idempotencyKey: string
	}): Promise<ReviewFinding[]>
}
export interface ArtifactDescriptor {
	ref: string
	path: string
	baseHash?: string
	resultHash?: string
	preserved: boolean
	runId?: string
	nodeId?: string
	attempt?: number
	workspacePath?: string
}
export type ReviewSeverity = "blocker" | "major" | "minor" | "note"
export interface FindingProvenance {
	artifactRefs: string[]
	conflictRefs: string[]
	reviewer?: string
	detectedAt: number
	attempt?: number
}
export interface ReviewFinding {
	/** Stable internal identifier; findingId and title mirror the orchestration specification. */
	id: string
	findingId?: string
	severity: ReviewSeverity
	message: string
	title?: string
	runId?: string
	nodeId?: string
	provenance: FindingProvenance
	file?: string
	filePath?: string
	line?: number
	evidence?: string
	recommendation?: string
	acceptanceCriterionRef?: string
}
export interface ReviewResult {
	findings: ReviewFinding[]
	artifactRefs: string[]
}
export interface ConflictRecord {
	id: string
	kind: "base_revision" | "path_overlap" | "adapter"
	paths: string[]
	nodeIds: string[]
	artifactRefs: string[]
	message: string
	detectedAt: number
}
export interface IntegrationResult {
	nodeId: string
	status: "integrated" | "blocked" | "failed"
	artifactRefs: string[]
	conflictRefs: string[]
	message?: string
}
export interface SynthesisResult {
	runId: string
	status: "completed" | "partial" | "failed"
	summary: string
	nodeSummaries: Array<{ nodeId: string; status: NodeStatus; summary?: string }>
	artifactRefs: string[]
	conflictRefs: string[]
	reviewFindingIds: string[]
	generatedAt: number
}
export interface ReviewAdapter {
	review(input: {
		run: Readonly<OrchestrationRun>
		node: Readonly<OrchestrationNode>
		result: Readonly<ResultContract>
		artifacts: readonly ArtifactDescriptor[]
		idempotencyKey: string
	}): Promise<ReviewResult>
}
export interface IntegrationAdapter {
	check(input: {
		run: Readonly<OrchestrationRun>
		node: Readonly<OrchestrationNode>
		artifacts: readonly ArtifactDescriptor[]
		parentArtifacts?: readonly ArtifactDescriptor[]
		parentNodeId?: string
		childNodeId?: string
		idempotencyKey?: string
	}): Promise<{ safe: boolean; conflicts: string[]; currentBaseHash?: string }>
	integrate(input: {
		run: Readonly<OrchestrationRun>
		node: Readonly<OrchestrationNode>
		artifacts: readonly ArtifactDescriptor[]
		parentArtifacts?: readonly ArtifactDescriptor[]
		parentNodeId?: string
		childNodeId?: string
		idempotencyKey: string
	}): Promise<{ artifactRefs: string[] }>
}
export interface SynthesisAdapter {
	synthesize(snapshot: Readonly<OrchestrationSnapshot>): Promise<SynthesisResult>
}

export type RootAcceptanceOutcome = "accepted" | "rework" | "blocked"
export interface RootAcceptanceResult {
	outcome: RootAcceptanceOutcome
	feedback?: string
	/** Criterion ids that failed; only owning nodes are invalidated. */
	criterionIds?: string[]
	nodeIds?: string[]
}

/** The root-owned gate is the only authority allowed to complete a run. */
export interface RootAcceptanceAdapter {
	accept(input: {
		run: Readonly<OrchestrationRun>
		snapshot: Readonly<OrchestrationSnapshot>
		/** Persisted before invocation; adapters should use it as their idempotency key. */
		attemptId: string
	}): Promise<RootAcceptanceResult>
	/** Reconcile a previously persisted call after a service restart. */
	reconcile?(input: {
		run: Readonly<OrchestrationRun>
		snapshot: Readonly<OrchestrationSnapshot>
		attemptId: string
	}): Promise<RootAcceptanceResult | undefined>
}
