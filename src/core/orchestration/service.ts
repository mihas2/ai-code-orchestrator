import { randomUUID } from "node:crypto"
import { coordinateIntegration, reviewBlocks, synthesizeSnapshot } from "./reviewIntegration"
import { LogAggregator } from "./logAggregator"
import type {
	ChildEvent,
	ExecutionHandle,
	OrchestrationExecutor,
	OrchestrationNode,
	OrchestrationRun,
	OrchestrationSnapshot,
	StartOrchestrationInput,
	OrchestrationEvent,
	NodeStatus,
	NodeLog,
} from "./types"
import type { OrchestrationPersistence } from "./persistence"
import { validateDag } from "./dag"
import { assertNodeTransition, assertRunTransition } from "./transitions"
import {
	createBudget,
	reconcileBudget,
	reserveBudget,
	reserveBudgetOnce,
	reconcileBudgetOnce,
	validateUsage,
} from "./budget"
import { validateReviewOnlyPlan } from "./planner"
import { PersistedRootBudgetRepository, type RootBudgetRepository } from "./budgetRepository"

export interface OrchestratorAdapters {
	review?: import("./types").ReviewAdapter
	integration?: import("./types").IntegrationAdapter
	synthesis?: import("./types").SynthesisAdapter
	route?: import("./types").RouteCapabilityValidator
	/** Root-owned acceptance runs after integration/synthesis; integration alone is not acceptance. */
	acceptance?: import("./types").RootAcceptanceAdapter
	logger?: (
		level: "error",
		entry: {
			event: string
			cycle?: string[]
			runId?: string
			expectedRootTaskId?: string
			actualRootTaskId?: string
		},
	) => void
}

export class OrchestrationOwnershipError extends Error {
	readonly code = "orchestration_run_ownership_denied"
	constructor(readonly runId: string) {
		super("Orchestration run does not belong to the requesting task tree")
		this.name = "OrchestrationOwnershipError"
	}
}

export class DagValidationError extends Error {
	readonly error = "Cyclic dependency detected"
	constructor(readonly cycle: string[]) {
		super("Cyclic dependency detected")
		this.name = "DagValidationError"
	}
}

export interface OrchestratorService {
	start(input: StartOrchestrationInput): Promise<OrchestrationRun>
	dispatch(runId: string): Promise<void>
	handleChildEvent(event: ChildEvent): Promise<void>
	approvePlan(runId: string): Promise<void>
	approveIntegration(runId: string, expectedRootTaskId: string): Promise<void>
	retryNode(runId: string, nodeId: string, expectedRootTaskId: string): Promise<void>
	cancelNode(runId: string, nodeId: string, expectedRootTaskId: string, reason?: string): Promise<void>
	cancel(runId: string, expectedRootTaskId: string, reason?: string): Promise<void>
	pause(runId: string): Promise<void>
	resume(runId: string): Promise<void>
	getSnapshot(runId: string): Promise<OrchestrationSnapshot>
	recover(): Promise<void>
	getBudgetRepository(runId: string, expectedRootTaskId: string): Promise<RootBudgetRepository>
}

const terminalRun = new Set(["completed", "failed", "canceled"])
const terminalNode = new Set<NodeStatus>(["integrated", "failed", "canceled"])

export class OrchestrationService implements OrchestratorService {
	private snapshots = new Map<string, OrchestrationSnapshot>()
	private logAggregators = new Map<string, LogAggregator>()
	private handles = new Map<string, ExecutionHandle>()
	private watchdogs = new Map<string, ReturnType<typeof setTimeout>>()
	private runtimeRunPrefix(runId: string) {
		return `${encodeURIComponent(runId)}:`
	}
	private runtimeKey(runId: string, nodeId: string, attempt: number) {
		return `${this.runtimeRunPrefix(runId)}${encodeURIComponent(nodeId)}:${attempt}`
	}
	private eventKeys = new Map<string, Set<string>>()
	private leaseTokens = new Map<string, string>()
	private budgetRepositories = new Map<string, RootBudgetRepository>()
	private dispatchQueues = new Map<string, Promise<void>>()
	/** Exposed read-only worker registry for lifecycle/recovery diagnostics. */
	get workerHandles(): ReadonlyMap<string, ExecutionHandle> {
		return this.handles
	}

	constructor(
		private readonly persistence: OrchestrationPersistence,
		private readonly executor: OrchestrationExecutor,
		private readonly publish?: (event: OrchestrationEvent) => void | Promise<void>,
		private readonly adapters: OrchestratorAdapters = {},
	) {}

	getLogAggregator(runId: string): LogAggregator {
		let aggregator = this.logAggregators.get(runId)
		if (!aggregator) {
			aggregator = new LogAggregator(runId)
			this.logAggregators.set(runId, aggregator)
		}
		return aggregator
	}

	private recordNodeLog(runId: string, nodeId: string, log: Omit<NodeLog, "nodeId">) {
		this.getLogAggregator(runId).addNodeLog(nodeId, { nodeId, ...log })
	}

	async start(input: StartOrchestrationInput): Promise<OrchestrationRun> {
		if (this.persistence.acquireLease && !this.leaseTokens.has(input.runId))
			this.leaseTokens.set(input.runId, await this.persistence.acquireLease(input.runId))
		const existing = await this.persistence.load(input.runId)
		if (existing) {
			this.snapshots.set(input.runId, existing)
			this.getLogAggregator(input.runId)
			return existing.run
		}
		validateReviewOnlyPlan(input.goal, input.nodes)
		const issues = validateDag(input.nodes)
		const cycle = issues.find((issue) => issue.code === "cycle")
		if (cycle) {
			this.adapters.logger?.("error", { event: "dag_cycle_detected", cycle: cycle.nodeIds })
			throw new DagValidationError(cycle.nodeIds)
		}
		if (issues.length) throw new Error(`Invalid orchestration plan: ${issues.map((i) => i.code).join(", ")}`)
		const now = input.now ?? Date.now()
		const run: OrchestrationRun = {
			schemaVersion: 1,
			runId: input.runId,
			rootTaskId: input.rootTaskId,
			status: "planning",
			goal: input.goal,
			planVersion: 1,
			nodeIds: input.nodes.map((n) => n.nodeId),
			settingsSnapshot: input.settings,
			createdAt: now,
			updatedAt: now,
			budget:
				input.budget ??
				createBudget(
					input.settings.maxRunTokens,
					input.settings.maxRunCost,
					input.settings.maxParallelWorkers * 64,
				),
			activeNodeIds: [],
			eventSequence: 0,
		}
		// Validate the plan estimate against the run limits, but do not keep that
		// reservation: dispatch reserves each node independently. Retaining both
		// reservations would count the same work twice and reject valid plans.
		if (input.estimatedTokens || input.estimatedCost) {
			reserveBudget(run.budget, input.estimatedTokens, input.estimatedCost)
			reconcileBudget(run.budget, input.estimatedTokens ?? 0, input.estimatedCost ?? 0, {})
		}
		const nodes = input.nodes.map((n) => ({
			...n,
			runId: run.runId,
			dependsOn: n.dependsOn ?? [],
			status: "planned" as const,
			attempt: 0,
			maxAttempts: n.maxAttempts ?? input.settings.maxReworkAttempts + 1,
			artifactRefs: [],
			reviewRefs: [],
			conflictRefs: [],
			timestamps: { planned: now },
		}))
		const snapshot: OrchestrationSnapshot = { run, nodes, events: [], capturedAt: now }
		this.snapshots.set(run.runId, snapshot)
		this.getLogAggregator(run.runId)
		await this.saveEvent(snapshot, "orchestrationStarted", { status: run.status }, `run:${run.runId}:started`)
		await this.transitionRun(snapshot, "planned", "planReady")
		if (input.settings.requirePlanApproval) snapshot.pendingApproval = "plan"
		await this.persist(snapshot)
		return run
	}

	async dispatch(id: string) {
		const prior = this.dispatchQueues.get(id) ?? Promise.resolve()
		const next = prior.catch(() => undefined).then(() => this.dispatchOnce(id))
		this.dispatchQueues.set(id, next)
		try {
			await next
		} finally {
			if (this.dispatchQueues.get(id) === next) this.dispatchQueues.delete(id)
		}
	}

	private async dispatchOnce(id: string) {
		const s = await this.require(id)
		// Dispatch is only valid while planning or executing. In particular, do not
		// redispatch ready-to-integrate nodes after an integration conflict.
		if (
			s.run.cancellationRequested ||
			s.run.status === "paused" ||
			s.run.status === "synthesizing" ||
			terminalRun.has(s.run.status) ||
			s.pendingApproval
		)
			return
		if (s.run.status === "planning") await this.transitionRun(s, "planned", "planReady")
		if (s.run.status === "planned" || s.run.status === "integrating") {
			assertRunTransition(s.run.status, "dispatching")
			s.run.status = "dispatching"
		}
		// Task has one active slot; honor the executor's safe concurrency cap.
		const capacity = Math.max(
			0,
			Math.min(s.run.settingsSnapshot.maxParallelWorkers, this.executor.maxParallel ?? 1) -
				s.run.activeNodeIds.length,
		)
		const ready = s.nodes.filter(
			(n) =>
				(n.status === "planned" || n.status === "needs_rework") &&
				n.dependsOn.every((d) => s.nodes.find((x) => x.nodeId === d)?.status === "integrated"),
		)
		const selected: OrchestrationNode[] = []
		const active = s.nodes.filter((node) => s.run.activeNodeIds.includes(node.nodeId))
		for (const candidate of ready) {
			if (selected.length >= capacity) break
			const writes = candidate.inputContract.fileScopes.write ?? candidate.inputContract.fileScopes.include
			const overlaps = [...active, ...selected].some((other) => {
				const otherWrites = other.inputContract.fileScopes.write ?? other.inputContract.fileScopes.include
				return writes.some((left) =>
					otherWrites.some(
						(right) =>
							left === "." ||
							right === "." ||
							left === right ||
							left.startsWith(`${right}/`) ||
							right.startsWith(`${left}/`),
					),
				)
			})
			if (!overlaps) selected.push(candidate)
		}
		for (const n of selected) {
			// Check for durable cancel intent before attempting to start
			const cancelIntent = s.canceledNodeIntents?.[n.nodeId]
			if (cancelIntent && cancelIntent.attempt === n.attempt + 1) {
				n.attempt++
				n.status = "canceled"
				n.timestamps.canceled = Date.now()
				n.error = { code: "canceled", message: cancelIntent.reason ?? "Canceled", recoverable: false }
				if (s.canceledNodeIntents) delete s.canceledNodeIntents[n.nodeId]
				await this.saveEvent(
					s,
					"nodeStatusChanged",
					{ nodeId: n.nodeId, status: "canceled" },
					`node:${id}:${n.nodeId}:${n.attempt}:canceled`,
				)
				continue
			}
			const childLimit = s.run.settingsSnapshot.maxChildTokens
			if (childLimit !== undefined && n.inputContract.tokenBudget > childLimit) {
				await this.failNode(s, n, {
					code: "child_budget_exceeded",
					message: "Child token budget exceeds maxChildTokens",
					recoverable: true,
				})
				continue
			}
			try {
				// Allocate and persist the attempt before any external dispatch.
				n.attempt++
				const repository = await this.getBudgetRepository(id, s.run.rootTaskId)
				const reserved = await repository.reserve(
					`${n.nodeId}:${n.attempt}`,
					"execution",
					n.inputContract.tokenBudget,
					0,
				)
				if (!reserved) throw new Error("Execution attempt reservation already exists")
			} catch (error) {
				await this.failNode(
					s,
					n,
					{
						code: "run_budget_exceeded",
						message: error instanceof Error ? error.message : String(error),
						recoverable: false,
					},
					false,
				)
				continue
			}
			assertNodeTransition(n.status, "running")
			n.status = "running"
			n.timestamps.running = Date.now()
			try {
				if (this.adapters.route)
					n.route = await this.adapters.route.resolve({ run: s.run, node: n, attempt: n.attempt })
			} catch (error) {
				await this.failNode(s, n, {
					code: "route_rejected",
					message: error instanceof Error ? error.message : String(error),
					recoverable: true,
				})
				continue
			}
			// Mark as active with attempt awareness
			if (!s.run.activeNodeIds.includes(n.nodeId)) {
				s.run.activeNodeIds.push(n.nodeId)
			}
			await this.saveEvent(
				s,
				"nodeStatusChanged",
				{ status: n.status, attempt: n.attempt, route: n.route },
				`node:${id}:${n.nodeId}:${n.attempt}:running`,
			)
			await this.persist(s)
			try {
				const handle = await this.executor.start({
					run: s.run,
					node: n,
					idempotencyKey: `${id}:${n.nodeId}:${n.attempt}`,
				})
				this.handles.set(this.runtimeKey(id, n.nodeId, n.attempt), handle)
				this.startWatchdog(s, n, handle)
			} catch (error) {
				// start() rejected before handing back a worker handle, so no provider
				// usage could have occurred and the reservation may be released.
				await this.failNode(
					s,
					n,
					{
						code: "dispatch_failed",
						message: error instanceof Error ? error.message : String(error),
						recoverable: true,
					},
					true,
				)
			}
		}
		if (s.run.activeNodeIds.length && s.run.status !== "running") {
			assertRunTransition(s.run.status, "running")
			s.run.status = "running"
		}
		this.blockFailedDependencies(s)
		await this.persist(s)
	}

	async handleChildEvent(e: ChildEvent) {
		const s = await this.require(e.runId),
			n = s.nodes.find((x) => x.nodeId === e.nodeId)
		if (!n) throw new Error("Unknown orchestration node")
		if (s.events.some((x) => x.idempotencyKey === e.idempotencyKey)) return
		if (terminalRun.has(s.run.status)) return
		// Validate that the event matches the current node attempt and runtime identity
		const eventAttempt = e.attempt ?? n.attempt
		if (eventAttempt !== n.attempt) return
		const key = this.runtimeKey(e.runId, e.nodeId, n.attempt)
		const handle = this.handles.get(key)
		if (handle && e.runtimeIdentity && handle.taskId !== e.runtimeIdentity) return
		// Child "integrated" means the child completed. Review and integration still
		// have to run in the orchestrator, so expose it as ready_to_integrate first.
		const key = this.runtimeKey(e.runId, n.nodeId, n.attempt)
		const handle = this.handles.get(key)
		const requiresIntegration = !!this.adapters.integration || s.run.settingsSnapshot.requireIntegrationApproval
		const requiresReview = !!this.adapters.review && s.run.settingsSnapshot.reviewPolicy !== "off"
		// Keep completion durable as awaiting_review until the review action promotes it.
		// Integration-only completion skips review and is immediately ready to integrate.
		const reportedStatus =
			e.status === "integrated" && requiresReview
				? "awaiting_review"
				: e.status === "integrated" && requiresIntegration
					? "ready_to_integrate"
					: e.status
		if (n.status === "integrated" && e.status === "integrated") return
		this.clearWatchdog(e.runId, n.nodeId, n.attempt)
		assertNodeTransition(n.status, reportedStatus)
		n.status = reportedStatus
		n.timestamps[reportedStatus] = Date.now()
		if (e.result) {
			if (e.result.status !== "completed") {
				n.status = "needs_rework"
				n.error = {
					code: "incomplete_result",
					message: "Worker reported partial or failed result",
					recoverable: true,
				}
				s.run.activeNodeIds = s.run.activeNodeIds.filter((x) => x !== n.nodeId)
				this.handles.delete(this.runtimeKey(e.runId, n.nodeId, n.attempt))
				await (
					await this.getBudgetRepository(e.runId, s.run.rootTaskId)
				).charge(`${e.nodeId}:${n.attempt}`, e.usage, e.usageKnown !== false)
				await this.persist(s)
				return
			}
			n.outputContract = e.result
			n.artifactRefs = [...new Set(e.result.artifactRefs)]
		}
		if (e.error) n.error = e.error
		if (e.status === "integrated")
			this.recordNodeLog(e.runId, e.nodeId, {
				status: "completed",
				timestamp: Date.now(),
				stdout: e.stdout,
				stderr: e.stderr,
			})
		else if (e.status === "failed")
			this.recordNodeLog(e.runId, e.nodeId, {
				status: "failed",
				timestamp: Date.now(),
				error: e.error?.message,
				stdout: e.stdout,
				stderr: e.stderr,
			})
		if (e.usage) {
			n.usage = Object.fromEntries(
				Object.entries(e.usage).map(([key, value]) => [
					key,
					typeof value === "number" ? validateUsage(value) : value,
				]),
			) as typeof e.usage
		}
		await (
			await this.getBudgetRepository(e.runId, s.run.rootTaskId)
		).charge(`${e.nodeId}:${n.attempt}`, n.usage, e.usageKnown !== false)
		s.run.activeNodeIds = s.run.activeNodeIds.filter((x) => x !== n.nodeId)
		if (eventHandle) {
			this.handles.delete(key)
			await eventHandle.dispose?.()
		}
		const usedTokens =
			s.run.budget.used.inputTokens +
			s.run.budget.used.cachedInputTokens +
			s.run.budget.used.outputTokens +
			s.run.budget.used.reasoningTokens
		if (
			s.run.budget.usageUnknown === true ||
			(s.run.budget.tokenLimit !== undefined && usedTokens > s.run.budget.tokenLimit) ||
			(s.run.budget.costLimit !== undefined &&
				n.usage?.cost !== undefined &&
				(s.run.budget.used.cost ?? 0) > s.run.budget.costLimit)
		) {
			s.run.status = "failed"
			s.run.error = {
				code: "budget_exceeded",
				message: "Reported usage exceeded the hard run budget",
				recoverable: false,
			}
			await this.saveEvent(
				s,
				"orchestrationError",
				{ status: "failed", error: s.run.error },
				`run:${s.run.runId}:budget-exceeded`,
			)
			await this.persist(s)
			return
		}
		await this.saveEvent(
			s,
			"nodeStatusChanged",
			{ status: reportedStatus, result: e.result, error: e.error },
			e.idempotencyKey,
		)
		if (reportedStatus === "integrated") {
			await this.acceptCompletedNode(s, n)
		}
		if (reportedStatus === "awaiting_review" || reportedStatus === "ready_to_integrate") {
			if (reportedStatus === "awaiting_review" && this.adapters.review && n.outputContract) {
				await this.reviewNode(s, n)
			} else if (reportedStatus === "ready_to_integrate" && s.run.settingsSnapshot.requireIntegrationApproval) {
				s.pendingApproval = "integration"
			}
		}
		this.blockFailedDependencies(s)
		await this.finishIfReady(s)
		await this.persist(s)
		if (!terminalRun.has(s.run.status) && s.run.status !== "paused") await this.dispatch(e.runId)
	}

	async approvePlan(id: string) {
		const s = await this.require(id)
		if (s.pendingApproval !== "plan" || s.run.status !== "planned") throw new Error("Plan is not awaiting approval")
		delete s.pendingApproval
		await this.persist(s)
		await this.dispatch(id)
	}
	async approveIntegration(id: string, expectedRootTaskId: string) {
		const s = await this.require(id, expectedRootTaskId, true)
		if (s.pendingApproval !== "integration") throw new Error("Integration is not awaiting approval")
		delete s.pendingApproval
		await this.finishIfReady(s)
		await this.persist(s)
		if (!terminalRun.has(s.run.status) && s.run.status !== "paused") await this.dispatch(id)
	}
	async reviewNodeById(id: string, nid: string) {
		const s = await this.require(id)
		const n = s.nodes.find((x) => x.nodeId === nid)
		if (!n || n.status !== "awaiting_review") throw new Error("Node is not awaiting review")
		await this.reviewNode(s, n)
		await this.persist(s)
	}

	async retryNode(id: string, nid: string, expectedRootTaskId: string) {
		const s = await this.require(id, expectedRootTaskId, true),
			n = s.nodes.find((x) => x.nodeId === nid)
		if (
			!n ||
			(n.status !== "failed" && n.status !== "needs_rework") ||
			n.attempt >= n.maxAttempts ||
			terminalRun.has(s.run.status)
		)
			throw new Error("Node cannot be retried or reworked")
		n.status = "planned"
		delete n.error
		await this.persist(s)
		await this.dispatch(id)
	}
	async cancelNode(id: string, nodeId: string, expectedRootTaskId: string, reason?: string) {
		const s = await this.require(id, expectedRootTaskId, true)
		const n = s.nodes.find((node) => node.nodeId === nodeId)
		if (!n) throw new Error("Unknown orchestration node")
		if (terminalRun.has(s.run.status) || terminalNode.has(n.status)) return
		// Handle both running nodes and nodes pending start with durable cancellation
		if (n.status === "running") {
			const key = this.runtimeKey(id, nodeId, n.attempt)
			const handle = this.handles.get(key)
			if (handle) {
				await handle.cancel(reason ?? "Canceled")
				this.clearWatchdog(id, nodeId, n.attempt)
				if (this.handles.get(key) === handle) this.handles.delete(key)
				await handle.dispose?.()
			}
			n.status = "canceled"
			n.timestamps.canceled = Date.now()
			n.error = { code: "canceled", message: reason ?? "Canceled", recoverable: false }
			s.run.activeNodeIds = s.run.activeNodeIds.filter((id) => id !== nodeId)
		} else if (n.status === "planned" || n.status === "needs_rework") {
			// Record cancel intent durably before start() is called
			if (!s.canceledNodeIntents) s.canceledNodeIntents = {}
			s.canceledNodeIntents[nodeId] = { attempt: n.attempt + 1, reason, canceledAt: Date.now() }
			n.status = "canceled"
			n.timestamps.canceled = Date.now()
			n.error = { code: "canceled", message: reason ?? "Canceled", recoverable: false }
		} else {
			throw new Error("Node cannot be canceled in its current state")
		}
		this.blockFailedDependencies(s)
		const hasWork = s.nodes.some((node) => !terminalNode.has(node.status) && node.status !== "blocked")
		if (!s.run.activeNodeIds.length && !hasWork) {
			assertRunTransition(s.run.status, "canceled")
			s.run.status = "canceled"
			s.run.cancellationRequested = true
		}
		// Publish only after the run summary and dependent nodes agree with the canceled node.
		await this.saveEvent(
			s,
			"nodeStatusChanged",
			{ nodeId, status: "canceled" },
			`node:${id}:${nodeId}:${n.attempt}:canceled`,
		)
		await this.persist(s)
		if (!terminalRun.has(s.run.status)) await this.dispatch(id)
	}
	async cancel(id: string, expectedRootTaskId: string, reason?: string) {
		const s = await this.require(id, expectedRootTaskId, true)
		if (terminalRun.has(s.run.status)) return
		s.run.cancellationRequested = true
		s.run.status = "canceled"
		s.run.error = { code: "canceled", message: reason ?? "Canceled", recoverable: false }
		const runPrefix = this.runtimeRunPrefix(id)
		const runKeys = [...this.handles.keys()].filter((key) => key.startsWith(runPrefix))
		await Promise.all(runKeys.map((key) => this.handles.get(key)?.cancel(reason)))
		for (const key of [...this.watchdogs.keys()]) if (key.startsWith(runPrefix)) this.clearWatchdogKey(key)
		// Dispose all handles after cancel
		await Promise.all(runKeys.map((key) => this.handles.get(key)?.dispose?.()))
		for (const key of runKeys) this.handles.delete(key)
		s.run.activeNodeIds = []
		for (const n of s.nodes) if (!terminalNode.has(n.status)) n.status = "canceled"
		await this.saveEvent(s, "orchestrationError", { status: "canceled", reason }, `run:${id}:canceled`)
		await this.persist(s)
	}
	async pause(id: string) {
		const s = await this.require(id)
		if (terminalRun.has(s.run.status) || s.run.status === "paused") return
		s.run.statusBeforePause = s.run.status
		s.run.status = "paused"
		await this.saveEvent(s, "orchestrationPaused", {}, `run:${id}:paused`)
		await this.persist(s)
	}
	async resume(id: string) {
		const s = await this.require(id)
		if (s.run.status !== "paused") throw new Error("Run is not paused")
		s.run.status = s.run.statusBeforePause ?? "planned"
		delete s.run.statusBeforePause
		delete s.run.error
		await this.persist(s)
		await this.finishIfReady(s)
		await this.persist(s)
		if (!terminalRun.has(s.run.status) && s.run.status !== "synthesizing") await this.dispatch(id)
	}
	async getSnapshot(id: string) {
		return this.require(id)
	}
	async getBudgetRepository(id: string, expectedRootTaskId: string): Promise<RootBudgetRepository> {
		const snapshot = await this.require(id, expectedRootTaskId, true)
		let repository = this.budgetRepositories.get(id)
		if (!repository) {
			repository = new PersistedRootBudgetRepository(
				expectedRootTaskId,
				id,
				snapshot.run.budget,
				async (ledger) => {
					// Resolve the live service-owned snapshot at mutation time. Recovery may
					// have replaced its budget object, so transfer the mutated scalar state.
					const current = await this.require(id, expectedRootTaskId, true)
					current.run.budget = structuredClone(ledger)
					await this.persist(current)
				},
				async (ledger) => {
					const current = await this.require(id, expectedRootTaskId, true)
					Object.assign(ledger, current.run.budget)
				},
			)
			this.budgetRepositories.set(id, repository)
		}
		return repository
	}
	async recover() {
		for (const s of await this.persistence.scanRecoverable()) {
			try {
				if (this.persistence.acquireLease && !this.leaseTokens.has(s.run.runId))
					this.leaseTokens.set(s.run.runId, await this.persistence.acquireLease(s.run.runId))
				if (!s?.run?.runId || !Array.isArray(s.nodes))
					throw new Error("Invalid persisted orchestration snapshot")
				this.snapshots.set(s.run.runId, s)
				// Normalize inconsistent state: running nodes without activeNodeIds or vice versa
				const actualRunning = s.nodes.filter((n) => n.status === "running")
				const declaredActive = new Set(s.run.activeNodeIds)
				if (
					actualRunning.length !== declaredActive.size ||
					!actualRunning.every((n) => declaredActive.has(n.nodeId))
				) {
					s.run.statusBeforePause = s.run.status
					s.run.status = "paused"
					s.run.error = {
						code: "recovery_state_inconsistent",
						message: "Snapshot has inconsistent running/active state; manual review required",
						recoverable: true,
					}
					await this.persist(s)
					continue
				}
				if (s.run.status === "synthesizing") {
					s.run.statusBeforePause = "synthesizing"
					s.run.status = "paused"
					s.run.error = {
						code: "synthesis_recovery_required",
						message:
							"Run stopped during terminal synthesis/acceptance; inspect persisted result before resuming.",
						recoverable: true,
					}
					await this.persist(s)
					continue
				}
				for (const n of s.nodes)
					if (
						n.status === "running" &&
						!this.handles.has(this.runtimeKey(s.run.runId, n.nodeId, n.attempt))
					) {
						const h = await this.executor.recover?.(s.run, n)
						if (h) {
							this.handles.set(this.runtimeKey(s.run.runId, n.nodeId, n.attempt), h)
							this.startWatchdog(s, n, h)
						} else
							await this.failNode(
								s,
								n,
								{
									code: "recovery_unavailable",
									message: "Child execution cannot be recovered",
									recoverable: true,
								},
								false,
							)
					}
				await this.dispatch(s.run.runId)
			} catch {
				// A malformed run must not prevent other persisted runs from recovering.
				continue
			}
		}
	}

	private startWatchdog(s: OrchestrationSnapshot, n: OrchestrationNode, handle: ExecutionHandle) {
		const key = this.runtimeKey(s.run.runId, n.nodeId, n.attempt)
		this.clearWatchdogKey(key)
		const timeoutMs = s.run.settingsSnapshot.timeoutMs
		if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return
		const timer = setTimeout(async () => {
			if (this.watchdogs.get(key) !== timer || this.handles.get(key) !== handle) return
			this.watchdogs.delete(key)
			if (n.status !== "running" || !s.run.activeNodeIds.includes(n.nodeId)) return
			try {
				await handle.cancel("orchestration timeout")
				if (this.handles.get(key) === handle) this.handles.delete(key)
				await this.failNode(
					s,
					n,
					{
						code: "timeout",
						message: `Node produced no child event within ${timeoutMs}ms`,
						recoverable: true,
					},
					false,
				)
				await this.persist(s)
			} catch (error) {
				s.run.status = "failed"
				s.run.error = {
					code: "watchdog_failed",
					message: error instanceof Error ? error.message : String(error),
					recoverable: false,
				}
				await this.persist(s)
			}
		}, timeoutMs)
		this.watchdogs.set(key, timer)
	}
	private clearWatchdog(runId: string, nodeId: string, attempt: number) {
		this.clearWatchdogKey(this.runtimeKey(runId, nodeId, attempt))
	}
	private clearWatchdogKey(key: string) {
		const timer = this.watchdogs.get(key)
		if (timer) clearTimeout(timer)
		this.watchdogs.delete(key)
	}
	private async failNode(
		s: OrchestrationSnapshot,
		n: OrchestrationNode,
		error: OrchestrationNode["error"],
		releaseReservation = true,
	) {
		this.clearWatchdog(s.run.runId, n.nodeId, n.attempt)
		n.status = "failed"
		n.error = error
		n.timestamps.failed = Date.now()
		this.recordNodeLog(s.run.runId, n.nodeId, {
			status: "failed",
			timestamp: n.timestamps.failed,
			error: error?.message,
		})
		s.run.activeNodeIds = s.run.activeNodeIds.filter((x) => x !== n.nodeId)
		if (releaseReservation)
			await (await this.getBudgetRepository(s.run.runId, s.run.rootTaskId)).release(`${n.nodeId}:${n.attempt}`)
		await this.saveEvent(
			s,
			"nodeStatusChanged",
			{ status: n.status, error },
			`node:${n.runId}:${n.nodeId}:${n.attempt}:failed`,
		)
	}
	private blockFailedDependencies(s: OrchestrationSnapshot) {
		for (const n of s.nodes)
			if (
				n.status === "planned" &&
				n.dependsOn.some((d) => {
					const dependencyStatus = s.nodes.find((x) => x.nodeId === d)?.status
					return (
						dependencyStatus === "failed" ||
						dependencyStatus === "blocked" ||
						dependencyStatus === "canceled"
					)
				})
			) {
				n.status = "blocked"
				n.timestamps.blocked = Date.now()
				this.recordNodeLog(s.run.runId, n.nodeId, {
					status: "rejected",
					timestamp: n.timestamps.blocked,
					reason: "Blocked by failed dependency",
				})
			}
	}
	private async reviewNode(s: OrchestrationSnapshot, n: OrchestrationNode) {
		if (!this.adapters.review || !n.outputContract || s.run.settingsSnapshot.reviewPolicy === "off") return
		// A review receipt is durable only when all runtime identity dimensions match.
		// In particular, a receipt from an earlier attempt must never suppress review.
		const reviewKey = `review:${s.run.runId}:${n.nodeId}:${n.attempt}`
		const alreadyReviewed = s.events.some(
			(event) =>
				event.type === "reviewFinding" &&
				event.payload.receipt === true &&
				event.runId === s.run.runId &&
				event.payload.nodeId === n.nodeId &&
				event.payload.attempt === n.attempt &&
				event.idempotencyKey === reviewKey,
		)
		if (alreadyReviewed) return
		// Check for in-flight review recovery
		if (
			s.reviewInFlight?.runId === s.run.runId &&
			s.reviewInFlight.nodeId === n.nodeId &&
			s.reviewInFlight.attempt === n.attempt
		) {
			if (
				s.reviewResult?.runId === s.run.runId &&
				s.reviewResult.nodeId === n.nodeId &&
				s.reviewResult.attempt === n.attempt
			) {
				// Consume the persisted result
				const result = s.reviewResult.result
				const findings = result.findings.map((finding) => ({
					...finding,
					runId: s.run.runId,
					nodeId: finding.nodeId ?? n.nodeId,
					provenance: { ...finding.provenance, attempt: n.attempt },
				}))
				s.findings = [...(s.findings ?? []), ...findings]
				n.reviewRefs.push(...findings.map((f) => f.id))
				await this.saveEvent(
					s,
					"reviewFinding",
					{ nodeId: n.nodeId, attempt: n.attempt, receipt: true },
					reviewKey,
				)
				for (const finding of findings)
					await this.saveEvent(
						s,
						"reviewFinding",
						{ nodeId: n.nodeId, attempt: n.attempt, finding },
						`finding:${s.run.runId}:${n.nodeId}:${n.attempt}:${finding.id}`,
					)
				delete s.reviewInFlight
				delete s.reviewResult
				if (reviewBlocks({ policy: s.run.settingsSnapshot.reviewPolicy, findings: result.findings })) {
					if (n.attempt >= n.maxAttempts)
						return this.failNode(
							s,
							n,
							{
								code: "review_rework_exhausted",
								message: "Review findings exceed the bounded rework limit",
								recoverable: false,
							},
							false,
						)
					assertNodeTransition(n.status, "needs_rework")
					n.status = "needs_rework"
					n.timestamps.needs_rework = Date.now()
					n.error = {
						code: "review_findings",
						message: result.findings.map((f) => f.message).join("; "),
						recoverable: true,
					}
					if (s.run.status === "reviewing") {
						assertRunTransition(s.run.status, "reworking")
						s.run.status = "reworking"
					}
				} else {
					assertNodeTransition(n.status, "ready_to_integrate")
					n.status = "ready_to_integrate"
					n.timestamps.ready_to_integrate = Date.now()
					if (s.run.settingsSnapshot.requireIntegrationApproval) s.pendingApproval = "integration"
					if (s.run.status === "reviewing") {
						assertRunTransition(s.run.status, "integrating")
						s.run.status = "integrating"
					}
				}
				return
			}
			// In-flight without result means provider crash: fail closed
			s.run.status = "paused"
			s.run.statusBeforePause = "reviewing"
			s.run.error = {
				code: "review_recovery_required",
				message: "Review call was in flight when service stopped; reconcile before retrying",
				recoverable: true,
			}
			await this.persist(s)
			return
		}
		if (s.run.status === "running") {
			assertRunTransition(s.run.status, "reviewing")
			s.run.status = "reviewing"
		}
		// Record in-flight before the provider call
		s.reviewInFlight = { runId: s.run.runId, nodeId: n.nodeId, attempt: n.attempt, startedAt: Date.now() }
		await this.persist(s)
		const artifacts = n.artifactRefs.map((ref) => ({ ref, path: ref, preserved: true }))
		const result = await this.adapters.review.review({
			run: s.run,
			node: n,
			result: n.outputContract,
			artifacts,
			idempotencyKey: `review:${s.run.runId}:${n.nodeId}:${n.attempt}`,
		})
		// Record result before consuming it
		s.reviewResult = { runId: s.run.runId, nodeId: n.nodeId, attempt: n.attempt, result, recordedAt: Date.now() }
		await this.persist(s)
		const findings = result.findings.map((finding) => ({
			...finding,
			runId: s.run.runId,
			nodeId: finding.nodeId ?? n.nodeId,
			provenance: { ...finding.provenance, attempt: n.attempt },
		}))
		s.findings = [...(s.findings ?? []), ...findings]
		n.reviewRefs.push(...findings.map((f) => f.id))
		await this.saveEvent(s, "reviewFinding", { nodeId: n.nodeId, attempt: n.attempt, receipt: true }, reviewKey)
		for (const finding of findings)
			await this.saveEvent(
				s,
				"reviewFinding",
				{ nodeId: n.nodeId, attempt: n.attempt, finding },
				`finding:${s.run.runId}:${n.nodeId}:${n.attempt}:${finding.id}`,
			)
		// Clean up in-flight and result markers after successful consumption
		delete s.reviewInFlight
		delete s.reviewResult
		if (reviewBlocks({ policy: s.run.settingsSnapshot.reviewPolicy, findings: result.findings })) {
			if (n.attempt >= n.maxAttempts)
				return this.failNode(
					s,
					n,
					{
						code: "review_rework_exhausted",
						message: "Review findings exceed the bounded rework limit",
						recoverable: false,
					},
					false,
				)
			assertNodeTransition(n.status, "needs_rework")
			n.status = "needs_rework"
			n.timestamps.needs_rework = Date.now()
			n.error = {
				code: "review_findings",
				message: result.findings.map((f) => f.message).join("; "),
				recoverable: true,
			}
			if (s.run.status === "reviewing") {
				assertRunTransition(s.run.status, "reworking")
				s.run.status = "reworking"
			}
		} else {
			assertNodeTransition(n.status, "ready_to_integrate")
			n.status = "ready_to_integrate"
			n.timestamps.ready_to_integrate = Date.now()
			if (s.run.settingsSnapshot.requireIntegrationApproval) s.pendingApproval = "integration"
			if (s.run.status === "reviewing") {
				assertRunTransition(s.run.status, "integrating")
				s.run.status = "integrating"
			}
		}
	}
	private async acceptCompletedNode(s: OrchestrationSnapshot, n: OrchestrationNode) {
		if (!this.adapters.review || !n.outputContract || s.run.settingsSnapshot.reviewPolicy === "off") return
		if (n.reviewRefs.length) return
		if (s.run.status === "running") {
			assertRunTransition(s.run.status, "reviewing")
			s.run.status = "reviewing"
		}
		await this.reviewNode(s, n)
	}
	private async finishIfReady(s: OrchestrationSnapshot) {
		if (!s.nodes.length) return
		// A terminal event is the durable acceptance receipt. If persistence captured
		// a stale synthesizing status, resume completes without another provider call.
		if (s.events.some((event) => event.type === "orchestrationCompleted")) {
			s.run.status = "completed"
			return
		}
		const ready = s.nodes.filter(
			(n) =>
				n.status === "ready_to_integrate" &&
				n.dependsOn.every((id) => s.nodes.find((d) => d.nodeId === id)?.status === "integrated"),
		)
		if (!ready.length && !s.nodes.every((n) => n.status === "integrated")) return
		if (ready.length && s.run.status !== "integrating") {
			assertRunTransition(s.run.status, "integrating")
			s.run.status = "integrating"
		}
		if (this.adapters.integration) {
			for (const n of ready) {
				const result = await coordinateIntegration({
					run: s.run,
					node: n,
					artifacts: n.artifactRefs.map((ref) => ({ ref, path: ref, preserved: true })),
					adapter: this.adapters.integration,
					approved: !s.pendingApproval,
				})
				s.integrationResults = [...(s.integrationResults ?? []), result]
				s.artifacts = [
					...(s.artifacts ?? []),
					...n.artifactRefs.map((ref) => ({ ref, path: ref, preserved: true })),
				].filter(
					(artifact, index, all) => all.findIndex((candidate) => candidate.ref === artifact.ref) === index,
				)
				if (result.status !== "integrated") {
					n.conflictRefs.push(...result.conflictRefs)
					s.conflicts = [
						...(s.conflicts ?? []),
						{
							id: `conflict:${s.run.runId}:${n.nodeId}:${n.attempt}`,
							kind: result.conflictRefs.includes("base_revision") ? "base_revision" : "adapter",
							paths: result.conflictRefs
								.filter((ref) => ref.startsWith("path:"))
								.map((ref) => ref.slice(5)),
							nodeIds: [n.nodeId],
							artifactRefs: [...n.artifactRefs],
							message: result.message ?? "Integration conflict",
							detectedAt: Date.now(),
						},
					]
					await this.saveEvent(
						s,
						"conflictDetected",
						{ nodeId: n.nodeId, result },
						`integration:${s.run.runId}:${n.nodeId}:conflict`,
					)
					return
				}
				assertNodeTransition(n.status, "integrated")
				n.status = "integrated"
				n.timestamps.integrated = Date.now()
				n.artifactRefs = result.artifactRefs
				await this.saveEvent(
					s,
					"nodeStatusChanged",
					{ status: n.status },
					`node:${s.run.runId}:${n.nodeId}:${n.attempt}:integrated`,
				)
			}
		} else if (ready.length) {
			if (s.run.settingsSnapshot.requireIntegrationApproval) s.pendingApproval = "integration"
			// Keep the node ready when no integration owner exists. This preserves the
			// durable continuation point instead of silently treating integration as done.
			return
		}
		if (!s.nodes.every((n) => n.status === "integrated")) return
		assertRunTransition(s.run.status, "synthesizing")
		s.run.status = "synthesizing"
		// Persist the stage before external work. Recovery resumes from durable
		// synthesis when available and never replays already-integrated patches.
		await this.persist(s)
		if (!s.synthesis) s.synthesis = await synthesizeSnapshot(s, this.adapters.synthesis)
		if (s.synthesis.status !== "completed") {
			s.run.status = "failed"
			s.run.error = { code: "synthesis_failed", message: s.synthesis.summary, recoverable: true }
			return
		}
		// Acceptance is opt-in at the service boundary so legacy/non-lead callers
		// retain their existing completion semantics. Allocate the invocation identity
		// durably before calling an external provider; after a crash, a result is
		// consumed once and an in-flight call is blocked for reconciliation.
		let acceptance: import("./types").RootAcceptanceResult | undefined
		if (this.adapters.acceptance) {
			if (s.acceptanceResult) {
				if (s.acceptanceInFlight && s.acceptanceResult.attemptId !== s.acceptanceInFlight.attemptId) {
					s.run.status = "paused"
					s.run.statusBeforePause = "synthesizing"
					s.run.error = {
						code: "acceptance_attempt_mismatch",
						message: "Stale acceptance result does not match the durable in-flight attempt.",
						recoverable: true,
					}
					await this.persist(s)
					return
				}
				acceptance = s.acceptanceResult.result
				s.acceptanceResult = undefined
			} else if (s.acceptanceInFlight) {
				const reconciled = await this.adapters.acceptance.reconcile?.({
					run: s.run,
					snapshot: s,
					attemptId: s.acceptanceInFlight.attemptId,
				})
				if (!reconciled) {
					s.run.status = "paused"
					s.run.statusBeforePause = "synthesizing"
					s.run.error = {
						code: "acceptance_reconciliation_required",
						message: "Acceptance call was in flight when the service stopped; reconcile before retrying.",
						recoverable: true,
					}
					await this.persist(s)
					return
				}
				acceptance = reconciled
				s.acceptanceResult = {
					attemptId: s.acceptanceInFlight.attemptId,
					result: reconciled,
					recordedAt: Date.now(),
				}
				delete s.acceptanceInFlight
				await this.persist(s)
			} else {
				const attemptId = randomUUID()
				s.acceptanceInFlight = { attemptId, startedAt: Date.now() }
				await this.persist(s)
				acceptance = await this.adapters.acceptance.accept({ run: s.run, snapshot: s, attemptId })
				s.acceptanceResult = { attemptId, result: acceptance, recordedAt: Date.now() }
				delete s.acceptanceInFlight
				await this.persist(s)
			}
		}
		// The receipt is replay protection only until this state-machine turn consumes it.
		// The following persisted transition is the durable consumed marker.
		if (acceptance) delete s.acceptanceResult
		if (acceptance && acceptance.outcome !== "accepted") {
			if (acceptance.outcome === "rework") {
				const affected = new Set(acceptance.nodeIds ?? [])
				for (const criterionId of acceptance.criterionIds ?? []) {
					const index = Number.parseInt(criterionId.replace(/^REQ-/, ""), 10) - 1
					const criterion = Number.isInteger(index)
						? s.run.goal && s.nodes.flatMap((n) => n.inputContract.acceptanceCriteria)[index]
						: undefined
					for (const node of s.nodes)
						if (criterion && node.inputContract.acceptanceCriteria.includes(criterion))
							affected.add(node.nodeId)
				}
				// Fail closed when an old adapter supplies no mapping, while preserving
				// unaffected integrated artifacts for criterion-aware adapters.
				if (!affected.size) for (const node of s.nodes) affected.add(node.nodeId)
				for (const node of s.nodes) {
					if (node.status === "integrated" && affected.has(node.nodeId)) {
						assertNodeTransition(node.status, "needs_rework")
						node.status = "needs_rework"
						node.timestamps.needs_rework = Date.now()
						node.error = {
							code: "lead_acceptance_rework",
							message: acceptance.feedback ?? "Root lead requested rework",
							recoverable: true,
						}
						node.reviewRefs = []
					}
				}
			}
			assertRunTransition(s.run.status, acceptance.outcome === "rework" ? "reworking" : "failed")
			s.run.status = acceptance.outcome === "rework" ? "reworking" : "failed"
			s.run.error = {
				code: acceptance.outcome === "rework" ? "lead_acceptance_rework" : "lead_acceptance_blocked",
				message: acceptance.feedback ?? "Root lead did not accept the integrated result",
				recoverable: acceptance.outcome === "rework",
			}
			await this.saveEvent(
				s,
				"orchestrationError",
				{ status: s.run.status, error: s.run.error },
				`run:${s.run.runId}:acceptance:${acceptance.outcome}`,
			)
			return
		}
		assertRunTransition(s.run.status, "completed")
		s.run.status = "completed"
		await this.saveEvent(s, "orchestrationCompleted", { synthesis: s.synthesis }, `run:${s.run.runId}:completed`)
	}
	private async transitionRun(
		s: OrchestrationSnapshot,
		to: OrchestrationRun["status"],
		type: OrchestrationEvent["type"],
	) {
		assertRunTransition(s.run.status, to)
		s.run.status = to
		await this.saveEvent(s, type, { status: to }, `run:${s.run.runId}:${type}`)
	}
	private async saveEvent(
		s: OrchestrationSnapshot,
		type: OrchestrationEvent["type"],
		payload: Record<string, unknown>,
		key: string,
	) {
		if (s.events.some((e) => e.idempotencyKey === key)) return
		const event: OrchestrationEvent = {
			eventId: key,
			idempotencyKey: key,
			runId: s.run.runId,
			sequence: ++s.run.eventSequence,
			timestamp: Date.now(),
			type,
			payload,
		}
		s.events.push(event)
		await this.persistence.save(s, event)
		await this.publish?.(event)
	}
	private async persist(s: OrchestrationSnapshot) {
		s.run.updatedAt = Date.now()
		s.capturedAt = Date.now()
		await this.persistence.save(s)
	}
	private async require(id: string, expectedRootTaskId?: string, enforceOwnership = false) {
		let s = this.snapshots.get(id)
		if (!s) {
			s = await this.persistence.load(id)
			if (s) this.snapshots.set(id, s)
		}
		if (!s) throw new Error("Unknown orchestration run")
		if (enforceOwnership && (!expectedRootTaskId || s.run.rootTaskId !== expectedRootTaskId)) {
			this.adapters.logger?.("error", {
				event: "orchestration_run_ownership_denied",
				runId: id,
				expectedRootTaskId,
				actualRootTaskId: s.run.rootTaskId,
			})
			throw new OrchestrationOwnershipError(id)
		}
		return s
	}
}
