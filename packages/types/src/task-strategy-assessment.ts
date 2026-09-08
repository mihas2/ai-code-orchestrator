import { z } from "zod"

export const taskStrategySchemaVersion = 1 as const
export const taskInquiryDecisionSchema = z.enum(["direct", "delegated", "orchestrated", "clarification"])
export type TaskInquiryDecision = z.infer<typeof taskInquiryDecisionSchema>

const budgetSchema = z.object({
	tokens: z.number().int().nonnegative(),
	cost: z.number().nonnegative(),
	calls: z.number().int().nonnegative(),
})
const requirementSchema = z.object({
	role: z.string().min(1),
	model: z.string().min(1),
	capabilities: z.array(z.string().min(1)).default([]),
	budget: budgetSchema,
})
const phaseSchema = z.object({
	id: z.string().min(1),
	summary: z.string().min(1),
	dependsOn: z.array(z.string()).default([]),
	roles: z.array(z.string()).default([]),
	acceptance: z.array(z.string().min(1)).min(1),
})

export const taskStrategyAssessmentSchema = z.object({
	schemaVersion: z.literal(taskStrategySchemaVersion),
	requestId: z.string().min(1),
	task: z.object({ summary: z.string().min(1), goal: z.string().min(1) }),
	decision: taskInquiryDecisionSchema,
	judgment: z.object({
		label: z.enum(["low", "medium", "high"]),
		confidence: z.number().min(0).max(1),
		rationale: z.string().min(1),
	}),
	phases: z.array(phaseSchema),
	dependencies: z.array(z.object({ from: z.string(), to: z.string() })),
	roles: z.array(requirementSchema),
	acceptance: z.array(z.string().min(1)),
	evidence: z.array(z.string()),
	checkpoints: z.array(z.string()),
	estimates: z.object({ durationMs: z.number().int().nonnegative(), budget: budgetSchema }),
	hardBudget: budgetSchema,
	nonGoals: z.array(z.string()),
	risks: z.array(z.string()),
	policyConstraints: z.array(z.string()),
})

export const taskAcceptanceDecisionSchema = z.object({
	schemaVersion: z.literal(1),
	requestId: z.string().min(1),
	outcome: z.enum(["accepted", "rework", "blocked"]),
	confidence: z.number().min(0).max(1),
	rationale: z.string().min(1),
	criteria: z.array(
		z.object({
			criterionId: z.string().min(1),
			status: z.enum(["met", "unmet", "missing", "blocked"]),
			evidenceRefs: z.array(z.string()),
			rationale: z.string().min(1),
		}),
	),
	feedback: z.string().optional(),
})
export type TaskStrategyAssessment = z.infer<typeof taskStrategyAssessmentSchema>
export type TaskAcceptanceDecision = z.infer<typeof taskAcceptanceDecisionSchema>
export type TaskStrategyRequest = { requestId: string; summary: string; goal: string; context?: unknown }
