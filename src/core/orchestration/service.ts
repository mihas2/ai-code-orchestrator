import { coordinateIntegration, reviewBlocks, synthesizeSnapshot } from "./reviewIntegration"
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
} from "./types"
import type { OrchestrationPersistence } from "./persistence"
import { validateDag } from "./dag"
import { assertNodeTransition, assertRunTransition } from "./transitions"
import { createBudget, reconcileBudget, reserveBudget } from "./budget"

export interface OrchestratorAdapters {
	review?: import("./types").ReviewAdapter
	integration?: import("./types").IntegrationAdapter
	synthesis?: import("./types").SynthesisAdapter
	route?: import("./types").RouteCapabilityValidator
}

export interface OrchestratorService {
	start(input: StartOrchestrationInput): Promise<OrchestrationRun>
	dispatch(runId: string): Promise<void>
	handleChildEvent(event: ChildEvent): Promise<void>
	approvePlan(runId: string): Promise<void>
	approveIntegration(runId: string): Promise<void>
	retryNode(runId: string, nodeId: string): Promise<void>
	cancel(runId: string, reason?: string): Promise<void>
	pause(runId: string): Promise<void>
	resume(runId: string): Promise<void>
	getSnapshot(runId: string): Promise<OrchestrationSnapshot>
	recover(): Promise<void>
}

const terminalRun = new Set(["completed", "failed", "canceled"])
const terminalNode = new Set<NodeStatus>(["integrated", "failed", "canceled"])

export class OrchestrationService implements OrchestratorService {
	private snapshots = new Map<string, OrchestrationSnapshot>()
	private handles = new Map<string, ExecutionHandle>()
	private watchdogs = new Map<string, ReturnType<typeof setTimeout>>()
	private eventKeys = new Map<string, Set<string>>()
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

	async start(input: StartOrchestrationInput): Promise<OrchestrationRun> {
		const existing = await this.persistence.load(input.runId)
		if (existing) {
			this.snapshots.set(input.runId, existing)
			return existing.run
		}
		const issues = validateDag(input.nodes)
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
			budget: createBudget(input.settings.maxRunTokens, input.settings.maxRunCost),
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
		await this.saveEvent(snapshot, "orchestrationStarted", { status: run.status }, `run:${run.runId}:started`)
		await this.transitionRun(snapshot, "planned", "planReady")
		if (input.settings.requirePlanApproval) snapshot.pendingApproval = "plan"
		await this.persist(snapshot)
		return run
	}

	async dispatch(id: string) {
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
				// Cost data is optional; enforce it only when a provider reports it.
				reserveBudget(s.run.budget, n.inputContract.tokenBudget, 0)
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
			n.attempt++
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
			s.run.activeNodeIds.push(n.nodeId)
			await this.saveEvent(
				s,
				"nodeStatusChanged",
				{ status: n.status, attempt: n.attempt, route: n.route },
				`node:${id}:${n.nodeId}:${n.attempt}:running`,
			)
			try {
				const handle = await this.executor.start({
					run: s.run,
					node: n,
					idempotencyKey: `${id}:${n.nodeId}:${n.attempt}`,
				})
				this.handles.set(n.nodeId, handle)
				this.startWatchdog(s, n, handle)
			} catch (error) {
				await this.failNode(s, n, {
					code: "dispatch_failed",
					message: error instanceof Error ? error.message : String(error),
					recoverable: true,
				})
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
		// Child "integrated" means the child completed. Review and integration still
		// have to run in the orchestrator, so expose it as ready_to_integrate first.
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
		this.clearWatchdog(n.nodeId)
		assertNodeTransition(n.status, reportedStatus)
		const reserved = n.inputContract.tokenBudget
		n.status = reportedStatus
		n.timestamps[reportedStatus] = Date.now()
		if (e.result) {
			n.outputContract = e.result
			n.artifactRefs = [...new Set(e.result.artifactRefs)]
		}
		if (e.error) n.error = e.error
		if (e.usage) n.usage = e.usage
		if (e.usage) reconcileBudget(s.run.budget, reserved, 0, e.usage)
		else reconcileBudget(s.run.budget, reserved, 0, {})
		s.run.activeNodeIds = s.run.activeNodeIds.filter((x) => x !== n.nodeId)
		this.handles.delete(n.nodeId)
		const usedTokens =
			s.run.budget.used.inputTokens +
			s.run.budget.used.cachedInputTokens +
			s.run.budget.used.outputTokens +
			s.run.budget.used.reasoningTokens
		if (
			(s.run.budget.tokenLimit !== undefined && usedTokens > s.run.budget.tokenLimit) ||
			(s.run.budget.costLimit !== undefined &&
				e.usage?.cost !== undefined &&
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
	async approveIntegration(id: string) {
		const s = await this.require(id)
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

	async retryNode(id: string, nid: string) {
		const s = await this.require(id),
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
	async cancel(id: string, reason?: string) {
		const s = await this.require(id)
		if (terminalRun.has(s.run.status)) return
		s.run.cancellationRequested = true
		s.run.status = "canceled"
		s.run.error = { code: "canceled", message: reason ?? "Canceled", recoverable: false }
		await Promise.all([...this.handles.values()].map((h) => h.cancel(reason)))
		for (const nodeId of this.watchdogs.keys()) this.clearWatchdog(nodeId)
		this.handles.clear()
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
		await this.persist(s)
		await this.dispatch(id)
	}
	async getSnapshot(id: string) {
		return this.require(id)
	}
	async recover() {
		for (const s of await this.persistence.scanRecoverable()) {
			this.snapshots.set(s.run.runId, s)
			for (const n of s.nodes)
				if (n.status === "running" && !this.handles.has(n.nodeId)) {
					const h = await this.executor.recover?.(s.run, n)
					if (h) {
						this.handles.set(n.nodeId, h)
						this.startWatchdog(s, n, h)
					} else
						await this.failNode(s, n, {
							code: "recovery_unavailable",
							message: "Child execution cannot be recovered",
							recoverable: true,
						})
				}
			await this.dispatch(s.run.runId)
		}
	}

	private startWatchdog(s: OrchestrationSnapshot, n: OrchestrationNode, handle: ExecutionHandle) {
		this.clearWatchdog(n.nodeId)
		const timeoutMs = s.run.settingsSnapshot.timeoutMs
		if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return
		const timer = setTimeout(async () => {
			this.watchdogs.delete(n.nodeId)
			if (n.status !== "running" || !s.run.activeNodeIds.includes(n.nodeId)) return
			try {
				await handle.cancel("orchestration timeout")
				this.handles.delete(n.nodeId)
				await this.failNode(s, n, {
					code: "timeout",
					message: `Node produced no child event within ${timeoutMs}ms`,
					recoverable: true,
				})
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
		this.watchdogs.set(n.nodeId, timer)
	}
	private clearWatchdog(nodeId: string) {
		const timer = this.watchdogs.get(nodeId)
		if (timer) clearTimeout(timer)
		this.watchdogs.delete(nodeId)
	}
	private async failNode(
		s: OrchestrationSnapshot,
		n: OrchestrationNode,
		error: OrchestrationNode["error"],
		releaseReservation = true,
	) {
		this.clearWatchdog(n.nodeId)
		n.status = "failed"
		n.error = error
		n.timestamps.failed = Date.now()
		s.run.activeNodeIds = s.run.activeNodeIds.filter((x) => x !== n.nodeId)
		if (releaseReservation) reconcileBudget(s.run.budget, n.inputContract.tokenBudget, 0, {})
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
				n.dependsOn.some(
					(d) =>
						s.nodes.find((x) => x.nodeId === d)?.status === "failed" ||
						s.nodes.find((x) => x.nodeId === d)?.status === "blocked",
				)
			) {
				n.status = "blocked"
				n.timestamps.blocked = Date.now()
			}
	}
	private async reviewNode(s: OrchestrationSnapshot, n: OrchestrationNode) {
		if (!this.adapters.review || !n.outputContract || s.run.settingsSnapshot.reviewPolicy === "off") return
		if (n.reviewRefs.some((ref) => ref.startsWith("finding:") && ref.includes(`:${n.nodeId}:`))) return
		if (s.run.status === "running") {
			assertRunTransition(s.run.status, "reviewing")
			s.run.status = "reviewing"
		}
		const artifacts = n.artifactRefs.map((ref) => ({ ref, path: ref, preserved: true }))
		const result = await this.adapters.review.review({
			run: s.run,
			node: n,
			result: n.outputContract,
			artifacts,
			idempotencyKey: `review:${s.run.runId}:${n.nodeId}:${n.attempt}`,
		})
		s.findings = [...(s.findings ?? []), ...result.findings]
		n.reviewRefs.push(...result.findings.map((f) => f.id))
		for (const finding of result.findings)
			await this.saveEvent(
				s,
				"reviewFinding",
				{ nodeId: n.nodeId, finding },
				`finding:${s.run.runId}:${n.nodeId}:${finding.id}`,
			)
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
		if (!s.nodes.length || !s.nodes.every((n) => n.status === "ready_to_integrate" || n.status === "integrated"))
			return
		if (s.run.status !== "integrating") {
			assertRunTransition(s.run.status, "integrating")
			s.run.status = "integrating"
		}
		if (this.adapters.integration) {
			for (const n of s.nodes.filter((x) => x.status === "ready_to_integrate")) {
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
		} else if (s.nodes.some((n) => n.status === "ready_to_integrate")) {
			if (s.run.settingsSnapshot.requireIntegrationApproval) {
				s.pendingApproval = "integration"
				return
			}
			throw new Error("No integration adapter is configured; artifacts were preserved")
		}
		assertRunTransition(s.run.status, "synthesizing")
		s.run.status = "synthesizing"
		s.synthesis = await synthesizeSnapshot(s, this.adapters.synthesis)
		if (s.synthesis.status !== "completed") {
			s.run.status = "failed"
			s.run.error = { code: "synthesis_failed", message: s.synthesis.summary, recoverable: true }
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
	private async require(id: string) {
		let s = this.snapshots.get(id)
		if (!s) {
			s = await this.persistence.load(id)
			if (s) this.snapshots.set(id, s)
		}
		if (!s) throw new Error("Unknown orchestration run")
		return s
	}
}
