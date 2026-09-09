import { createHash } from "node:crypto"
import { z } from "zod"
import { createBudget } from "./budget"
import type { TaskAcceptanceDecision, TaskStrategyAssessment, TaskStrategyRequest } from "@ai-code-orchestrator/types"
import type { BudgetLedger } from "./types"
import { taskAcceptanceDecisionSchema, taskStrategyAssessmentSchema } from "@ai-code-orchestrator/types"

export type LeadPhase = "assessing" | "executing" | "accepting" | "rework" | "completed" | "blocked" | "canceled"
export type AcceptanceOutcome = "accepted" | "rework" | "clarification" | "blocked"
export type LeadUsage = { inputTokens?: number; outputTokens?: number; cost?: number; calls: number; known: boolean }
export type LeadEvidence = { criterionId: string; status: "met" | "unmet" | "unknown"; source: string; detail: string }
export type LeadAcceptance = TaskAcceptanceDecision & { attempt: number; serviceAttemptId?: string }

export interface LeadSession {
	schemaVersion: 1
	sessionId: string
	requestId: string
	rootTaskId: string
	goal: string
	requestRevision: number
	fingerprint: string
	configFingerprint: string
	workspaceFingerprint: string
	phase: LeadPhase
	version: number
	decision?: TaskStrategyAssessment
	/** Model used for the bounded decision call; persisted for restart diagnostics. */
	modelId?: string
	evidence: LeadEvidence[]
	usage: LeadUsage
	reservations: { assessment: number; execution: number; acceptance: number; used: number }
	/** Number of acceptance calls allocated, including malformed responses. */
	acceptanceAttempt?: number
	/** Canonical persisted root ledger, created before the first lead call. */
	budget?: BudgetLedger
	acceptance?: LeadAcceptance
	acceptedResultHash?: string
	acceptedWorkspaceRevision?: string
	accepting?: {
		/** Attempt number is allocated durably before the provider call. */
		attempt: number
		attemptId: string
		requestId: string
		expiresAt: number
		resultHash: string
		workspaceRevision: string
		requestRevision: number
		startedAt: number
	}
	ambiguousRequest?: { requestId: string; operation: "assessment" | "acceptance"; startedAt: number }
	/** Durable clarification boundary; an empty/canceled response remains pending. */
	pendingClarification?: { question: string; response?: string; requestedAt: number }
	updatedAt: number
}

export interface LeadSessionStore {
	load(key: string): Promise<LeadSession | undefined>
	save(key: string, session: LeadSession, expectedVersion?: number): Promise<void>
}

const sessionSchema = z.object({
	schemaVersion: z.literal(1),
	sessionId: z.string(),
	requestId: z.string(),
	rootTaskId: z.string(),
	goal: z.string(),
	requestRevision: z.number().int().nonnegative(),
	fingerprint: z.string(),
	configFingerprint: z.string(),
	workspaceFingerprint: z.string(),
	phase: z.enum(["assessing", "executing", "accepting", "rework", "completed", "blocked", "canceled"]),
	version: z.number().int().nonnegative(),
	decision: taskStrategyAssessmentSchema.optional(),
	modelId: z.string().optional(),
	evidence: z.array(
		z.object({
			criterionId: z.string(),
			status: z.enum(["met", "unmet", "unknown"]),
			source: z.string(),
			detail: z.string(),
		}),
	),
	usage: z.object({
		inputTokens: z.number().int().nonnegative().optional(),
		outputTokens: z.number().int().nonnegative().optional(),
		cost: z.number().nonnegative().optional(),
		calls: z.number().int().nonnegative(),
		known: z.boolean(),
	}),
	reservations: z.object({
		assessment: z.number().nonnegative(),
		execution: z.number().nonnegative(),
		acceptance: z.number().nonnegative(),
		used: z.number().nonnegative(),
	}),
	acceptanceAttempt: z.number().int().nonnegative().default(0),
	budget: z
		.object({
			tokenLimit: z.number().nonnegative().optional(),
			costLimit: z.number().nonnegative().optional(),
			callLimit: z.number().nonnegative().optional(),
			reservedTokens: z.number().nonnegative(),
			reservedCost: z.number().nonnegative(),
			reservedCalls: z.number().nonnegative(),
			used: z.object({
				inputTokens: z.number().nonnegative(),
				cachedInputTokens: z.number().nonnegative(),
				outputTokens: z.number().nonnegative(),
				reasoningTokens: z.number().nonnegative(),
				cost: z.number().nonnegative().optional(),
			}),
			usedCalls: z.number().nonnegative(),
			usageByIdempotencyKey: z
				.record(
					z.object({
						reservedTokens: z.number().nonnegative(),
						reservedCost: z.number().nonnegative(),
						calls: z.number().nonnegative(),
						reconciled: z.boolean(),
					}),
				)
				.optional(),
			usageUnknown: z.boolean().optional(),
		})
		.optional(),
	acceptance: taskAcceptanceDecisionSchema
		.extend({
			attempt: z.number().int().nonnegative(),
			serviceAttemptId: z.string().optional(),
		})
		.optional(),
	acceptedResultHash: z.string().optional(),
	acceptedWorkspaceRevision: z.string().optional(),
	accepting: z
		.object({
			attempt: z.number().int().positive().optional(),
			attemptId: z.string(),
			requestId: z.string(),
			expiresAt: z.number().finite(),
			resultHash: z.string(),
			workspaceRevision: z.string(),
			requestRevision: z.number().int().nonnegative(),
			startedAt: z.number().finite(),
		})
		.optional(),
	ambiguousRequest: z
		.object({ requestId: z.string(), operation: z.enum(["assessment", "acceptance"]), startedAt: z.number() })
		.optional(),
	pendingClarification: z
		.object({ question: z.string(), response: z.string().optional(), requestedAt: z.number() })
		.optional(),
	updatedAt: z.number(),
})

export const leadFingerprint = (request: TaskStrategyRequest, configFingerprint = "", workspaceFingerprint = "") =>
	createHash("sha256")
		.update(
			JSON.stringify({
				summary: request.summary.trim(),
				goal: request.goal.trim(),
				context: request.context,
				configFingerprint,
				workspaceFingerprint,
			}),
		)
		.digest("hex")

const storeLocks = new WeakMap<object, Map<string, Promise<void>>>()

export class VersionedLeadSessionStore implements LeadSessionStore {
	private readonly writes: Map<string, Promise<void>>
	constructor(
		private readonly state: {
			get<T>(key: string): T | undefined
			update(key: string, value: unknown): Thenable<void> | Promise<void>
		},
		private readonly key = "orchestration.lead-sessions.v1",
	) {
		let locks = storeLocks.get(state as object)
		if (!locks) {
			locks = new Map()
			storeLocks.set(state as object, locks)
		}
		this.writes = locks
	}
	async load(key: string) {
		const raw = this.state.get<unknown>(this.key)
		const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>)[key] : undefined
		const parsed = sessionSchema.safeParse(value)
		if (!parsed.success) return undefined
		const session = parsed.data as LeadSession
		if (!session.budget) session.budget = createBudget()
		return session
	}
	async save(key: string, session: LeadSession, expectedVersion?: number) {
		if (!session.budget) session.budget = createBudget()
		const parsed = sessionSchema.safeParse(session)
		if (!parsed.success) throw new Error("Invalid lead session")
		const prior = this.writes.get(key) ?? Promise.resolve()
		const next = prior.then(async () => {
			const current = await this.load(key)
			if (expectedVersion !== undefined && current?.version !== expectedVersion)
				throw new Error("Stale lead session version")
			const raw = this.state.get<Record<string, unknown>>(this.key) ?? {}
			await this.state.update(this.key, { ...raw, [key]: session })
		})
		this.writes.set(
			key,
			next.catch(() => undefined),
		)
		await next
	}
}

export function assertCurrentSession(session: LeadSession, requestId: string, fingerprint: string, version: number) {
	if (session.requestId !== requestId || session.fingerprint !== fingerprint || session.version !== version)
		throw new Error("Stale lead callback")
}

export function acceptanceGate(
	session: LeadSession,
	criteria: string[],
	evidence: LeadEvidence[],
	attempt: number,
): LeadAcceptance {
	const decisions = criteria.map((criterion, index) => {
		const item = evidence.find((entry) => entry.criterionId === `REQ-${index + 1}`)
		return {
			criterionId: `REQ-${index + 1}`,
			status:
				item?.status === "met"
					? ("met" as const)
					: item?.status === "unmet"
						? ("unmet" as const)
						: ("missing" as const),
			evidenceRefs: item ? [item.source] : [],
			rationale: item?.detail ?? `${criterion}: missing evidence`,
		}
	})
	// Fail-closed: canceled phase or missing evidence cannot return accepted
	if (session.phase === "canceled")
		return {
			schemaVersion: 1,
			requestId: session.requestId,
			outcome: "blocked",
			confidence: 0,
			rationale: "Canceled task cannot be accepted",
			criteria: decisions,
			attempt,
		}
	// Fail-closed: if no evidence was provided at all, reject with blocked
	if (evidence.length === 0 && criteria.length > 0)
		return {
			schemaVersion: 1,
			requestId: session.requestId,
			outcome: "blocked",
			confidence: 0,
			rationale: "No evidence provided for acceptance criteria",
			criteria: decisions,
			attempt,
		}
	const outcome = decisions.some((item) => item.status === "unmet")
		? ("rework" as const)
		: decisions.some((item) => item.status !== "met")
			? ("clarification" as const)
			: ("accepted" as const)
	return {
		schemaVersion: 1,
		requestId: session.requestId,
		outcome: outcome === "clarification" ? "blocked" : outcome,
		confidence: outcome === "accepted" ? 1 : 0,
		rationale:
			outcome === "accepted"
				? "All required criteria have evidence"
				: outcome === "rework"
					? "Required criteria remain unmet"
					: "Required evidence is missing or unknown",
		criteria: decisions,
		attempt,
	}
}
