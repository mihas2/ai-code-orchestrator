import { z } from "zod"
import type { PlanNodeInput, ContextContract } from "./types"
import { validateDag } from "./dag"

const scope = z
	.object({
		include: z.array(z.string()),
		exclude: z.array(z.string()),
		write: z.array(z.string()).optional(),
		allowOverlapWith: z.array(z.string()).optional(),
	})
	.strict()
const node = z
	.object({
		id: z.string().min(1).max(100),
		role: z.string().min(1).max(100),
		mode: z.string().min(1).max(100),
		objective: z.string().min(1),
		acceptanceCriteria: z.array(z.string().min(1)),
		constraints: z.array(z.string()),
		fileScopes: scope,
		dependencies: z.array(z.string()),
		tokenBudget: z.number().int().positive(),
	})
	.strict()
const planSchema = z.object({ version: z.literal(1), nodes: z.array(node).min(1).max(64) }).strict()
export type PlannerPlan = z.infer<typeof planSchema>
export interface PlannerLimits {
	modes: readonly string[]
	allowedScopes: readonly string[]
	maxChildTokens?: number
	maxRunTokens?: number
}

const unsafe = /(^|[\\/])\.\.(?:[\\/]|$)|^(?:[a-zA-Z]:|[\\/]{2})|\0|(^|[\\/])\.git(?:[\\/]|$)/
function within(path: string, allowed: readonly string[]) {
	return allowed.some(
		(root) => root === "." || path === root || path.startsWith(root.endsWith("/") ? root : `${root}/`),
	)
}
function extractBalancedJson(raw: string, start: number): string | undefined {
	const stack: string[] = []
	let inString = false
	let escaped = false
	for (let i = start; i < raw.length; i++) {
		const char = raw[i]
		if (inString) {
			if (escaped) escaped = false
			else if (char === "\\") escaped = true
			else if (char === '"') inString = false
			continue
		}
		if (char === '"') {
			inString = true
			continue
		}
		if (char === "{" || char === "[") stack.push(char === "{" ? "}" : "]")
		else if (char === "}" || char === "]") {
			if (stack.at(-1) !== char) return undefined
			stack.pop()
			if (stack.length === 0) return raw.slice(start, i + 1)
		}
	}
	return undefined
}

function plannerJsonCandidates(raw: string): string[] {
	const candidates: string[] = []
	for (let i = 0; i < raw.length; i++) {
		if (raw[i] !== "{" && raw[i] !== "[") continue
		const candidate = extractBalancedJson(raw, i)
		if (candidate) {
			candidates.push(candidate)
			i += candidate.length - 1
		}
	}
	return candidates
}

export function extractPlannerJson(raw: string): string {
	const start = raw.search(/[\[{]/)
	if (start === -1) throw new Error("Planner returned malformed JSON: no JSON object or array found")
	const candidate = extractBalancedJson(raw, start)
	if (!candidate) throw new Error("Planner returned malformed JSON: incomplete JSON value")
	return candidate
}

export function parseAndValidatePlan(raw: string, limits: PlannerLimits): PlanNodeInput[] {
	const candidates = plannerJsonCandidates(raw)
	if (candidates.length === 0) {
		throw new Error(
			raw.search(/[\[{]/) === -1
				? "Planner returned malformed JSON: no JSON object or array found"
				: "Planner returned malformed JSON: incomplete JSON value",
		)
	}
	let lastError: Error | undefined
	for (const candidate of candidates) {
		let value: unknown
		try {
			value = JSON.parse(candidate)
		} catch {
			lastError = new Error("Planner returned malformed JSON: invalid JSON value")
			continue
		}
		const parsed = planSchema.safeParse(value)
		if (!parsed.success) {
			lastError = new Error(
				`Planner returned invalid plan: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`,
			)
			continue
		}
		const issues: string[] = []
		for (const n of parsed.data.nodes) {
			if (!limits.modes.includes(n.mode)) issues.push(`unsupported_mode:${n.mode}`)
			if (limits.maxChildTokens !== undefined && n.tokenBudget > limits.maxChildTokens)
				issues.push(`child_budget:${n.id}`)
			for (const p of [...n.fileScopes.include, ...(n.fileScopes.write ?? []), ...n.fileScopes.exclude]) {
				if (unsafe.test(p) || !within(p, limits.allowedScopes)) issues.push(`unsafe_scope:${n.id}:${p}`)
			}
		}
		if (
			limits.maxRunTokens !== undefined &&
			parsed.data.nodes.reduce((s, n) => s + n.tokenBudget, 0) > limits.maxRunTokens
		)
			issues.push("run_budget")
		const dag = validateDag(
			parsed.data.nodes.map((n) => ({
				nodeId: n.id,
				role: n.role,
				mode: n.mode,
				title: n.objective.slice(0, 120),
				objective: n.objective,
				dependsOn: n.dependencies,
				inputContract: { fileScopes: n.fileScopes } as ContextContract,
			})),
		)
		issues.push(...dag.map((i) => i.code))
		if (issues.length) {
			lastError = new Error(`Planner plan rejected: ${issues.join(", ")}`)
			continue
		}
		return parsed.data.nodes.map((n) => ({
			nodeId: n.id,
			role: n.role,
			mode: n.mode,
			title: n.objective.slice(0, 120),
			objective: n.objective,
			dependsOn: n.dependencies,
			inputContract: {
				contractVersion: 1,
				runId: "",
				nodeId: n.id,
				goal: "",
				objective: n.objective,
				acceptanceCriteria: n.acceptanceCriteria,
				constraints: n.constraints,
				mode: n.mode,
				fileScopes: n.fileScopes,
				dependencySummaries: [],
				relevantFacts: [],
				allowedTools: [],
				outputRequirements: ["Return a verified ResultContract"],
				tokenBudget: n.tokenBudget,
				parentContextDigest: "",
			},
		}))
	}
	throw lastError ?? new Error("Planner returned malformed JSON: invalid JSON value")
}
export function redactPlannerContext(text: string, maxChars = 12000) {
	return text.replace(/(?:api[_-]?key|token|secret|password)\s*[:=]\s*\S+/gi, "[REDACTED]").slice(0, maxChars)
}
