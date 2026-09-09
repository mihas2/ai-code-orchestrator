import { randomUUID, createHash } from "node:crypto"
import {
	taskAcceptanceDecisionSchema,
	taskStrategyAssessmentSchema,
	type TaskAcceptanceDecision,
	type TaskStrategyRequest,
} from "@ai-code-orchestrator/types"
import type { BoundedLeadResult, StreamingLeadProvider } from "./leadProvider"
import type { RootBudgetRepository } from "./budgetRepository"
import { leadFingerprint, type LeadSession, type LeadSessionStore, type LeadUsage } from "./leadSession"

export interface LeadBudgetLedger {
	assessment: number
	repair: number
	acceptance: number
	execution: number
	rework: number
	actual: number
	calls: number
}

export interface LeadContext {
	rootTaskId: string
	request: TaskStrategyRequest
	configFingerprint: string
	workspaceFingerprint: string
	allowedRoles: string[]
	allowedModels: string[]
	allowedCapabilities?: string[]
	/** Canonical prompt generated for the existing orchestrator mode. */
	systemPrompt: string
	budget: {
		assessment: number
		execution: number
		acceptance: number
		repair?: number
		rework?: number
		calls?: number
	}
	budgetRepository?: RootBudgetRepository
	signal: AbortSignal
}

export type EvidenceRecord =
	| {
			id: string
			type: "task-history"
			taskId: string
			role: string
			contentHash: string
			content: unknown
			provenance?: Record<string, unknown>
	  }
	| {
			id: string
			type: "tool-result"
			taskId: string
			toolUseId?: string
			contentHash: string
			content: unknown
			provenance?: Record<string, unknown>
	  }
	| {
			id: string
			type: "node-result"
			nodeId: string
			resultHash: string
			status: string
			provenance?: Record<string, unknown>
	  }
	| {
			id: string
			type: "artifact"
			ref: string
			hash?: string
			status: "available" | "unavailable"
			provenance?: Record<string, unknown>
	  }
	| {
			id: string
			type: "test"
			command: string
			passed: boolean
			exitCode?: number
			outputRef?: string
			provenance?: Record<string, unknown>
	  }
	| {
			id: string
			type: "review"
			findingId: string
			eventId?: string
			status: string
			criterionId?: string
			provenance?: Record<string, unknown>
			attempt?: number
	  }
	| {
			id: string
			type: "event"
			eventId: string
			eventType: string
			status: string
			provenance?: Record<string, unknown>
	  }

export interface EvidenceRegistry {
	requestId: string
	originalGoal: string
	resultHash: string
	workspaceRevision: string
	records: EvidenceRecord[]
}

export interface LeadAcceptanceContext {
	rootTaskId: string
	requestId: string
	criteria: string[]
	result: string
	evidenceRegistry: EvidenceRegistry
	systemPrompt: string
	signal: AbortSignal
	budget: number
	attempt: number
	/** Durable identity allocated and persisted before this provider call. */
	attemptId: string
	budgetRepository?: RootBudgetRepository
	/** Persists the root run ledger after every reserve/reconcile boundary. */
	persistBudget?: () => Promise<void>
}

export class OrchestratorDecisionService {
	private readonly active = new Map<string, Promise<LeadSession>>()
	private readonly acceptanceActive = new Map<string, Promise<TaskAcceptanceDecision>>()
	constructor(
		private readonly provider: StreamingLeadProvider,
		private readonly store: LeadSessionStore,
		private readonly emit: (event: string, data: Record<string, unknown>) => void = () => {},
	) {}

	ensure(context: LeadContext): Promise<LeadSession> {
		const fingerprint = leadFingerprint(context.request, context.configFingerprint, context.workspaceFingerprint)
		const key = context.rootTaskId
		const running = this.active.get(key)
		if (running) return running
		const operation = this.ensureOnce(key, fingerprint, context).finally(() => this.active.delete(key))
		this.active.set(key, operation)
		return operation
	}

	private async ensureOnce(key: string, fingerprint: string, context: LeadContext): Promise<LeadSession> {
		const existing = await this.store.load(key)
		if (existing?.fingerprint === fingerprint && existing.decision && existing.phase !== "assessing") {
			this.emit("lead.decision.reused", {
				sessionId: existing.sessionId,
				rootTaskId: key,
				version: existing.version,
			})
			return existing
		}
		if (existing?.fingerprint === fingerprint && existing.ambiguousRequest) {
			return { ...existing, phase: "blocked", version: existing.version + 1, updatedAt: Date.now() }
		}
		const now = Date.now(),
			requestId = context.request.requestId || randomUUID()
		let session: LeadSession = {
			schemaVersion: 1,
			sessionId: randomUUID(),
			requestId,
			rootTaskId: key,
			goal: context.request.goal,
			requestRevision: existing ? existing.requestRevision + 1 : 0,
			fingerprint,
			configFingerprint: context.configFingerprint,
			workspaceFingerprint: context.workspaceFingerprint,
			phase: "assessing",
			version: (existing?.version ?? 0) + 1,
			evidence: [],
			usage: { calls: 0, known: true },
			reservations: { ...context.budget, used: 0 },
			budget: context.budgetRepository?.getLedger(),
			ambiguousRequest: { requestId, operation: "assessment", startedAt: now },
			updatedAt: now,
		}
		const budgetKey = `lead:assessment:${session.sessionId}:${session.requestRevision}`
		const reserved = await context.budgetRepository?.reserve(budgetKey, "assessment", context.budget.assessment)
		if (reserved === false) throw new Error("Assessment attempt reservation already exists")
		// Persist the reservation and in-flight marker in the same session write
		// before the provider can consume any budget.
		session.budget = context.budgetRepository?.getLedger() as import("./types").BudgetLedger | undefined
		await this.store.save(key, session, existing?.version)
		this.emit("lead.call.started", { sessionId: session.sessionId, requestId, operation: "assessment" })
		let response: BoundedLeadResult
		try {
			response = await this.provider.complete({
				requestId,
				systemPrompt: context.systemPrompt,
				prompt: assessmentPrompt(context),
				signal: context.signal,
				timeoutMs: 30_000,
				maxOutputCharacters: 24_000,
			})
		} catch (error) {
			// A provider failure has unknown usage unless it supplied a response.
			await context.budgetRepository?.charge(budgetKey, undefined, false)
			session = {
				...session,
				phase: context.signal.aborted ? "canceled" : "blocked",
				budget: context.budgetRepository?.getLedger() as import("./types").BudgetLedger | undefined,
				version: session.version + 1,
				updatedAt: Date.now(),
			}
			await this.store.save(key, session, session.version - 1)
			this.emit("lead.call.failed", {
				sessionId: session.sessionId,
				requestId,
				reason: error instanceof Error ? error.name : "unknown",
			})
			return session
		}
		if (context.signal.aborted) {
			session = {
				...session,
				phase: "canceled",
				ambiguousRequest: undefined,
				version: session.version + 1,
				updatedAt: Date.now(),
			}
			await this.store.save(key, session, session.version - 1)
			return session
		}
		const parsed = parseJson(response.text)
		const decision = taskStrategyAssessmentSchema.safeParse(parsed)
		const authorized =
			decision.success &&
			decision.data.requestId === requestId &&
			decision.data.roles.every(
				(role) =>
					context.allowedRoles.includes(role.role) &&
					context.allowedModels.includes(role.model) &&
					role.capabilities.every((capability) => context.allowedCapabilities?.includes(capability) ?? false),
			)
		await context.budgetRepository?.charge(
			budgetKey,
			{
				inputTokens: response.usage.inputTokens,
				outputTokens: response.usage.outputTokens,
				cost: response.usage.cost,
			},
			response.usage.known,
		)
		const usage = mergeUsage(session.usage, response.usage)
		// Unknown provider usage cannot satisfy a hard budget reservation.
		const withinBudget =
			response.usage.known &&
			(response.usage.inputTokens ?? 0) + (response.usage.outputTokens ?? 0) <= context.budget.assessment &&
			(response.usage.calls ?? 1) <= (context.budget.calls ?? Number.POSITIVE_INFINITY)
		const used = response.usage.known ? (response.usage.inputTokens ?? 0) + (response.usage.outputTokens ?? 0) : 0
		session = {
			...session,
			decision: authorized && withinBudget ? decision.data : undefined,
			modelId: response.modelId,
			phase: authorized && withinBudget ? "executing" : "blocked",
			usage,
			budget: context.budgetRepository?.getLedger() as import("./types").BudgetLedger | undefined,
			reservations: { ...session.reservations, used },
			ambiguousRequest: undefined,
			version: session.version + 1,
			updatedAt: Date.now(),
		}
		await this.store.save(key, session, session.version - 1)
		this.emit("lead.decision", {
			sessionId: session.sessionId,
			requestId,
			decision: session.decision?.decision ?? "blocked",
			usageKnown: response.usage.known,
			used,
		})
		return session
	}
	async accept(context: LeadAcceptanceContext): Promise<TaskAcceptanceDecision> {
		const running = this.acceptanceActive.get(context.rootTaskId)
		if (running) return running
		const operation = this.acceptOnce(context).finally(() => this.acceptanceActive.delete(context.rootTaskId))
		this.acceptanceActive.set(context.rootTaskId, operation)
		return operation
	}
	private async acceptOnce(context: LeadAcceptanceContext): Promise<TaskAcceptanceDecision> {
		if (context.attempt > 2)
			return {
				schemaVersion: 1,
				requestId: context.requestId,
				outcome: "blocked",
				confidence: 0,
				rationale: "Acceptance repair limit exceeded",
				criteria: [],
			}
		const budgetKey = `lead:acceptance:${context.attemptId}`
		const reserved = await context.budgetRepository?.reserve(
			budgetKey,
			context.attempt > 1 ? "repair" : "acceptance",
			context.budget,
		)
		if (reserved === false) throw new Error("Acceptance attempt reservation already exists")
		await context.persistBudget?.()
		let response: BoundedLeadResult
		try {
			response = await this.provider.complete({
				requestId: context.requestId,
				systemPrompt: context.systemPrompt,
				prompt: acceptancePrompt(context),
				signal: context.signal,
				timeoutMs: 30_000,
				maxOutputCharacters: 16_000,
			})
		} catch (error) {
			await context.budgetRepository?.charge(budgetKey, undefined, false)
			await context.persistBudget?.()
			throw error
		}
		await context.budgetRepository?.charge(
			budgetKey,
			{
				inputTokens: response.usage.inputTokens,
				outputTokens: response.usage.outputTokens,
				cost: response.usage.cost,
			},
			response.usage.known,
		)
		await context.persistBudget?.()
		if (!response.usage.known) throw new Error("Acceptance provider usage is unknown")
		const used = (response.usage.inputTokens ?? 0) + (response.usage.outputTokens ?? 0)
		if (used > context.budget) throw new Error("Acceptance budget exceeded")
		const parsed = taskAcceptanceDecisionSchema.safeParse(parseJson(response.text))
		if (!parsed.success || parsed.data.requestId !== context.requestId)
			throw new Error("Invalid lead acceptance decision")
		const registry = new Map(context.evidenceRegistry.records.map((record) => [record.id, record]))
		const invalidEvidence = parsed.data.criteria.some((d, i) => {
			const criterionId = `REQ-${i + 1}`
			return (
				d.criterionId !== criterionId ||
				(d.status === "met" && d.evidenceRefs.length === 0) ||
				d.evidenceRefs.some((ref) => {
					const evidence = registry.get(ref)
					if (!evidence) return true
					if (evidence.type === "review" && evidence.criterionId && evidence.criterionId !== criterionId)
						return true
					if (evidence.type === "review" && evidence.status === "blocking") return true
					if (evidence.type === "artifact" && evidence.status !== "available") return true
					return (
						d.status === "met" &&
						((evidence.type === "test" && !evidence.passed) ||
							(evidence.type === "node-result" && evidence.status !== "completed"))
					)
				})
			)
		})
		const incomplete =
			parsed.data.criteria.length !== context.criteria.length ||
			parsed.data.criteria.some((d) => d.status !== "met")
		if (invalidEvidence || incomplete)
			return {
				...parsed.data,
				outcome: "rework",
				feedback:
					parsed.data.feedback ??
					"Provide actionable fixes and grounded evidence references for every unmet criterion.",
			}
		return parsed.data.outcome === "accepted" ? parsed.data : { ...parsed.data, outcome: "rework" }
	}
}

function acceptancePrompt(context: LeadAcceptanceContext) {
	const schema = {
		schemaVersion: 1,
		requestId: "string",
		outcome: "accepted|rework|blocked",
		confidence: "number 0..1",
		rationale: "string",
		feedback: "optional string",
		criteria: [
			{
				criterionId: "REQ-n",
				status: "met|unmet|unknown",
				rationale: "string",
				evidenceRefs: ["evidence registry record id"],
			},
		],
	}
	return `Acceptance protocol schema: ${JSON.stringify(schema)}\nRequestId: ${JSON.stringify(context.requestId)}\nCriteria: ${JSON.stringify(context.criteria)}\nEvidence registry: ${JSON.stringify(context.evidenceRegistry)}\nCompletion claim: ${JSON.stringify(context.result).slice(0, 48_000)}`
}

export function sha256(value: string): string {
	return createHash("sha256").update(value).digest("hex")
}

function assessmentPrompt(context: LeadContext) {
	const schema = {
		schemaVersion: 1,
		requestId: "string",
		decision: "direct|delegated|orchestrated|clarification",
		phases: [{ id: "string", roles: ["authorized role"], dependsOn: ["phase id"], acceptance: ["criterion"] }],
		roles: [{ role: "authorized role", model: "authorized model", capabilities: ["authorized capability"] }],
		acceptance: ["criterion"],
	}
	return `Assessment protocol schema: ${JSON.stringify(schema)}\nRequestId: ${JSON.stringify(context.request.requestId)}\nOriginal goal: ${JSON.stringify(context.request.goal)}\nAllowed roles: ${JSON.stringify(context.allowedRoles)}\nAllowed models: ${JSON.stringify(context.allowedModels)}\nAllowed capabilities: ${JSON.stringify(context.allowedCapabilities ?? [])}`
}
function parseJson(text: string): unknown {
	try {
		return JSON.parse(text.trim().replace(/^```json\s*|\s*```$/g, ""))
	} catch {
		return undefined
	}
}
function mergeUsage(a: LeadUsage, b: LeadUsage): LeadUsage {
	return {
		inputTokens:
			a.inputTokens === undefined || b.inputTokens === undefined ? undefined : a.inputTokens + b.inputTokens,
		outputTokens:
			a.outputTokens === undefined || b.outputTokens === undefined ? undefined : a.outputTokens + b.outputTokens,
		cost: a.cost === undefined || b.cost === undefined ? undefined : a.cost + b.cost,
		calls: a.calls + b.calls,
		known: a.known && b.known,
	}
}
