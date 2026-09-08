import { randomUUID } from "node:crypto"
import {
	taskAcceptanceDecisionSchema,
	taskStrategyAssessmentSchema,
	type TaskAcceptanceDecision,
	type TaskStrategyRequest,
} from "@ai-code-orchestrator/types"
import type { BoundedLeadResult, StreamingLeadProvider } from "./leadProvider"
import { leadFingerprint, type LeadSession, type LeadSessionStore, type LeadUsage } from "./leadSession"

export interface LeadContext {
	rootTaskId: string
	request: TaskStrategyRequest
	configFingerprint: string
	workspaceFingerprint: string
	allowedRoles: string[]
	allowedModels: string[]
	budget: { assessment: number; execution: number; acceptance: number }
	signal: AbortSignal
}

const systemPrompt = `You are the selected team lead. Understand the request before execution and return only JSON matching the supplied schema. Choose the smallest sufficient team. A short task may still be complex and a long task may be simple. If facts are missing, choose clarification or a bounded research phase; do not invent architecture. Preserve every requirement. Reserve acceptance resources. Worker claims are not evidence.`

export interface LeadAcceptanceContext {
	rootTaskId: string
	requestId: string
	criteria: string[]
	result: string
	context?: unknown
	signal: AbortSignal
	budget: number
	attempt: number
}

export class LeadCoordinator {
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
			ambiguousRequest: { requestId, operation: "assessment", startedAt: now },
			updatedAt: now,
		}
		await this.store.save(key, session, existing?.version)
		this.emit("lead.call.started", { sessionId: session.sessionId, requestId, operation: "assessment" })
		let response: BoundedLeadResult
		try {
			response = await this.provider.complete({
				requestId,
				systemPrompt,
				prompt: assessmentPrompt(context),
				signal: context.signal,
				timeoutMs: 30_000,
				maxOutputCharacters: 24_000,
			})
		} catch (error) {
			session = {
				...session,
				phase: context.signal.aborted ? "canceled" : "blocked",
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
				(role) => context.allowedRoles.includes(role.role) && context.allowedModels.includes(role.model),
			)
		const usage = mergeUsage(session.usage, response.usage)
		// Unknown provider usage cannot satisfy a hard budget reservation.
		const withinBudget =
			response.usage.known &&
			(response.usage.inputTokens ?? 0) + (response.usage.outputTokens ?? 0) <= context.budget.assessment
		const used = response.usage.known ? (response.usage.inputTokens ?? 0) + (response.usage.outputTokens ?? 0) : 0
		session = {
			...session,
			decision: authorized && withinBudget ? decision.data : undefined,
			phase: authorized && withinBudget ? "executing" : "blocked",
			usage,
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
		const response = await this.provider.complete({
			requestId: context.requestId,
			systemPrompt,
			prompt: acceptancePrompt(context),
			signal: context.signal,
			timeoutMs: 30_000,
			maxOutputCharacters: 16_000,
		})
		if (!response.usage.known) throw new Error("Acceptance provider usage is unknown")
		const used = (response.usage.inputTokens ?? 0) + (response.usage.outputTokens ?? 0)
		if (used > context.budget) throw new Error("Acceptance budget exceeded")
		const parsed = taskAcceptanceDecisionSchema.safeParse(parseJson(response.text))
		if (!parsed.success || parsed.data.requestId !== context.requestId)
			throw new Error("Invalid lead acceptance decision")
		const evidenceText = JSON.stringify({ result: context.result, context: context.context })
		const invalidEvidence = parsed.data.criteria.some(
			(d, i) =>
				d.criterionId !== `REQ-${i + 1}` ||
				d.evidenceRefs.length === 0 ||
				d.evidenceRefs.some((ref) => typeof ref !== "string" || !evidenceText.includes(ref)),
		)
		const incomplete =
			parsed.data.criteria.length !== context.criteria.length ||
			parsed.data.criteria.some((d) => d.status !== "met")
		if (invalidEvidence || incomplete)
			return {
				...parsed.data,
				outcome: parsed.data.outcome === "blocked" ? "blocked" : "rework",
				feedback:
					parsed.data.feedback ??
					"Provide actionable fixes and grounded evidence references for every unmet criterion.",
			}
		return parsed.data.outcome === "accepted" ? parsed.data : { ...parsed.data, outcome: "rework" }
	}
}

function acceptancePrompt(context: LeadAcceptanceContext) {
	return `Return only JSON matching this schema: {schemaVersion:1,requestId:string,outcome:"accepted|rework|blocked",confidence:number,rationale:string,criteria:[{criterionId:string,status:"met|unmet|missing|blocked",evidenceRefs:string[],rationale:string}],feedback?:string}. Map every criterion to concrete evidence refs. Missing, failed, or partial evidence cannot be accepted. Criteria: ${JSON.stringify(context.criteria)} Result/artifacts/tests context: ${JSON.stringify({ result: context.result, context: context.context }).slice(0, 48_000)}`
}

function assessmentPrompt(context: LeadContext) {
	return `Schema: ${JSON.stringify({ schemaVersion: 1, requestId: context.request.requestId, task: { summary: "string", goal: "string" }, decision: "direct|delegated|orchestrated|clarification", judgment: { label: "low|medium|high", confidence: 1, rationale: "string" }, phases: [], dependencies: [], roles: [], acceptance: [], evidence: [], checkpoints: [], estimates: { durationMs: 0, budget: { tokens: 0, cost: 0, calls: 0 } }, hardBudget: { tokens: 0, cost: 0, calls: 0 }, nonGoals: [], risks: [], policyConstraints: [] })}\nAllowed roles: ${context.allowedRoles.join(", ")}\nAllowed models: ${context.allowedModels.join(", ")}\nRequest: ${JSON.stringify(context.request).slice(0, 48_000)}`
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
