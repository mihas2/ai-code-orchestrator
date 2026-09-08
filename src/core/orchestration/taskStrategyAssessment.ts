import { createHash } from "node:crypto"
import {
	taskStrategyAssessmentSchema,
	type TaskStrategyAssessment,
	type TaskStrategyRequest,
} from "@ai-code-orchestrator/types"

export type AssessmentStatus = "approved" | "needs_clarification" | "blocked" | "aborted" | "timeout"
export interface AssessmentUsage {
	inputTokens: number
	outputTokens: number
	cost: number
	calls: number
}
export interface AssessmentBudget {
	tokens: number
	cost: number
	calls: number
}
export interface AssessmentPolicy {
	roles: string[]
	models: string[]
	capabilities?: string[]
	ceiling: AssessmentBudget
}
export interface AssessmentRecord {
	schemaVersion: 1
	requestFingerprint: string
	requestId: string
	status: AssessmentStatus
	assessment?: TaskStrategyAssessment
	attempts: number
	usage: AssessmentUsage
	budget: { reserved: AssessmentBudget; actual: AssessmentBudget; remaining: AssessmentBudget }
	diagnostics: string[]
}
export interface AssessmentRepository {
	load(fingerprint: string): Promise<AssessmentRecord | undefined>
	save(record: AssessmentRecord): Promise<void>
}
export interface AssessmentOptions {
	assess: (request: TaskStrategyRequest, signal: AbortSignal) => Promise<unknown>
	repair?: (invalid: unknown, request: TaskStrategyRequest, signal: AbortSignal) => Promise<unknown>
	clock?: () => number
	fingerprint?: (request: TaskStrategyRequest) => string
	repository?: AssessmentRepository
	policy: AssessmentPolicy
	reservation: AssessmentBudget
	timeoutMs: number
	isRoot?: boolean
}
const zero = (): AssessmentBudget => ({ tokens: 0, cost: 0, calls: 0 })
const stable = (value: unknown): string =>
	JSON.stringify(value, (_, v) =>
		v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort()) : v,
	)
export const taskStrategyFingerprint = (request: TaskStrategyRequest) =>
	createHash("sha256")
		.update(
			stable({
				requestId: request.requestId,
				summary: request.summary.trim(),
				goal: request.goal.trim(),
				context: request.context,
			}),
		)
		.digest("hex")
const remaining = (ceiling: AssessmentBudget, used: AssessmentBudget): AssessmentBudget => ({
	tokens: ceiling.tokens - used.tokens,
	cost: ceiling.cost - used.cost,
	calls: ceiling.calls - used.calls,
})
const over = (a: AssessmentBudget, b: AssessmentBudget) => a.tokens > b.tokens || a.cost > b.cost || a.calls > b.calls
export const reuseTaskStrategyAssessment = async (repository: AssessmentRepository, fingerprint: string) =>
	repository.load(fingerprint)

export async function assessTaskStrategy(
	request: TaskStrategyRequest,
	options: AssessmentOptions,
): Promise<AssessmentRecord> {
	const fingerprint = (options.fingerprint ?? taskStrategyFingerprint)(request)
	if (options.isRoot === false)
		return {
			schemaVersion: 1,
			requestFingerprint: fingerprint,
			requestId: request.requestId,
			status: "blocked",
			attempts: 0,
			usage: { inputTokens: 0, outputTokens: 0, cost: 0, calls: 0 },
			budget: { reserved: zero(), actual: zero(), remaining: options.policy.ceiling },
			diagnostics: ["assessment is root-only"],
		}
	const persisted = options.repository && (await options.repository.load(fingerprint))
	if (persisted?.status === "approved") return persisted
	if (over(options.reservation, options.policy.ceiling))
		return blocked(fingerprint, request, options, "reservation exceeds hard budget")
	const controller = new AbortController(),
		timer = setTimeout(() => controller.abort(), options.timeoutMs)
	let attempts = 0,
		raw: unknown,
		diagnostics: string[] = []
	try {
		raw = await options.assess(request, controller.signal)
		attempts++
		let parsed = taskStrategyAssessmentSchema.safeParse(raw)
		if (!parsed.success && options.repair) {
			raw = await options.repair(raw, request, controller.signal)
			attempts++
			parsed = taskStrategyAssessmentSchema.safeParse(raw)
		}
		if (!parsed.success) return blocked(fingerprint, request, options, "invalid assessment", attempts)
		const a = parsed.data,
			usage = usageOf(raw)
		const actual = { tokens: usage.inputTokens + usage.outputTokens, cost: usage.cost, calls: usage.calls }
		if (over(actual, options.policy.ceiling) || over(a.hardBudget, options.policy.ceiling))
			return blocked(fingerprint, request, options, "assessment exceeds hard budget", attempts, usage)
		if (a.judgment.confidence < 0.5)
			return finish(fingerprint, request, options, "needs_clarification", a, attempts, usage, ["low confidence"])
		const allowed = new Set(options.policy.roles),
			models = new Set(options.policy.models)
		const capabilities = new Set(options.policy.capabilities ?? [])
		if (
			a.roles.some(
				(r) => !allowed.has(r.role) || !models.has(r.model) || r.capabilities.some((c) => !capabilities.has(c)),
			)
		)
			return blocked(fingerprint, request, options, "role, model, or capability unavailable", attempts, usage)
		const phaseIds = new Set(a.phases.map((phase) => phase.id))
		if (
			phaseIds.size !== a.phases.length ||
			a.dependencies.some((edge) => !phaseIds.has(edge.from) || !phaseIds.has(edge.to)) ||
			hasCycle(a.dependencies)
		)
			return blocked(fingerprint, request, options, "invalid dependency graph", attempts, usage)
		const record = finish(fingerprint, request, options, "approved", a, attempts, usage, diagnostics)
		await options.repository?.save(record)
		return record
	} catch (error) {
		return finish(
			fingerprint,
			request,
			options,
			controller.signal.aborted ? "timeout" : "aborted",
			undefined,
			attempts,
			usageOf(raw),
			[error instanceof Error ? error.name : "assessment failed"],
		)
	} finally {
		clearTimeout(timer)
	}
}
const usageOf = (raw: unknown): AssessmentUsage => {
	const u = (raw as { usage?: Partial<AssessmentUsage> } | undefined)?.usage
	return {
		inputTokens: u?.inputTokens ?? 0,
		outputTokens: u?.outputTokens ?? 0,
		cost: u?.cost ?? 0,
		calls: u?.calls ?? 1,
	}
}
function finish(
	fingerprint: string,
	request: TaskStrategyRequest,
	options: AssessmentOptions,
	status: AssessmentStatus,
	assessment: TaskStrategyAssessment | undefined,
	attempts: number,
	usage: AssessmentUsage,
	diagnostics: string[],
): AssessmentRecord {
	const actual = { tokens: usage.inputTokens + usage.outputTokens, cost: usage.cost, calls: usage.calls }
	return {
		schemaVersion: 1,
		requestFingerprint: fingerprint,
		requestId: request.requestId,
		status,
		assessment,
		attempts,
		usage,
		budget: { reserved: options.reservation, actual, remaining: remaining(options.policy.ceiling, actual) },
		diagnostics: diagnostics.map((d) => d.slice(0, 200)),
	}
}
function blocked(
	fingerprint: string,
	request: TaskStrategyRequest,
	options: AssessmentOptions,
	reason: string,
	attempts = 0,
	usage: AssessmentUsage = { inputTokens: 0, outputTokens: 0, cost: 0, calls: 0 },
) {
	return finish(fingerprint, request, options, "blocked", undefined, attempts, usage, [reason])
}
function hasCycle(edges: Array<{ from: string; to: string }>): boolean {
	const graph = new Map<string, string[]>()
	for (const edge of edges) graph.set(edge.from, [...(graph.get(edge.from) ?? []), edge.to])
	const visiting = new Set<string>(),
		visited = new Set<string>()
	const visit = (id: string): boolean => {
		if (visiting.has(id)) return true
		if (visited.has(id)) return false
		visiting.add(id)
		if ((graph.get(id) ?? []).some(visit)) return true
		visiting.delete(id)
		visited.add(id)
		return false
	}
	return [...graph.keys()].some(visit)
}
