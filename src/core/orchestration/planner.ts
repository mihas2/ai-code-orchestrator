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
export function parseAndValidatePlan(raw: string, limits: PlannerLimits): PlanNodeInput[] {
	let value: unknown
	try {
		value = JSON.parse(raw)
	} catch {
		throw new Error("Planner returned malformed JSON")
	}
	const parsed = planSchema.safeParse(value)
	if (!parsed.success)
		throw new Error(`Planner returned invalid plan: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`)
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
	if (issues.length) throw new Error(`Planner plan rejected: ${issues.join(", ")}`)
	return parsed.data.nodes.map(
		(n) =>
			({
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
			}) as PlanNodeInput,
	)
}
export function redactPlannerContext(text: string, maxChars = 12000) {
	return text.replace(/(?:api[_-]?key|token|secret|password)\s*[:=]\s*\S+/gi, "[REDACTED]").slice(0, maxChars)
}
