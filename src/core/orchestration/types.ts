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
	reservedTokens: number
	reservedCost: number
	used: BudgetUsage
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
	now?: number
}
export interface ChildEvent {
	runId: string
	nodeId: string
	idempotencyKey: string
	status: NodeStatus
	result?: ResultContract
	usage?: Partial<BudgetUsage>
	error?: ErrorRecord
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
	}): Promise<{ safe: boolean; conflicts: string[]; currentBaseHash?: string }>
	integrate(input: {
		run: Readonly<OrchestrationRun>
		node: Readonly<OrchestrationNode>
		artifacts: readonly ArtifactDescriptor[]
		idempotencyKey: string
	}): Promise<{ artifactRefs: string[] }>
}
export interface SynthesisAdapter {
	synthesize(snapshot: Readonly<OrchestrationSnapshot>): Promise<SynthesisResult>
}
