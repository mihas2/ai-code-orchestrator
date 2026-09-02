import { z } from "zod"

export const orchestrationSchemaVersion = 1 as const

export const profileRoleModelSettingSchema = z.object({
	modelId: z.string().min(1).optional(),
	inheritPrimary: z.boolean().default(true),
})

export const profileRoleModelSettingsSchema = z.object({
	schemaVersion: z.literal(orchestrationSchemaVersion).default(orchestrationSchemaVersion),
	roleModels: z.record(z.string(), profileRoleModelSettingSchema).default({}),
})

export type ProfileRoleModelSettings = z.infer<typeof profileRoleModelSettingsSchema>

export const orchestrationContextPolicySchema = z.enum(["minimal", "balanced", "full"])
export const orchestrationConflictPolicySchema = z.enum(["isolated", "patch", "serialized", "stop"])
export const orchestrationReviewPolicySchema = z.enum(["off", "completion", "batch", "risk"])

export const orchestrationSettingsSchema = z.object({
	schemaVersion: z.literal(orchestrationSchemaVersion).default(orchestrationSchemaVersion),
	enabled: z.boolean().default(true),
	orchestratorModeSlug: z.string().default("orchestrator"),
	maxParallelWorkers: z.number().int().min(1).max(32).default(4),
	maxDepth: z.number().int().min(1).max(8).default(3),
	maxRunTokens: z.number().int().positive().optional(),
	maxRunCost: z.number().nonnegative().optional(),
	maxChildTokens: z.number().int().positive().optional(),
	maxChildCost: z.number().nonnegative().optional(),
	timeoutMs: z
		.number()
		.int()
		.positive()
		.default(30 * 60 * 1000),
	maxReworkAttempts: z.number().int().min(0).default(2),
	contextPolicy: orchestrationContextPolicySchema.default("balanced"),
	conflictPolicy: orchestrationConflictPolicySchema.default("stop"),
	reviewPolicy: orchestrationReviewPolicySchema.default("completion"),
	requirePlanApproval: z.boolean().default(false),
	requireIntegrationApproval: z.boolean().default(true),
	allowWorkerCommands: z.boolean().default(false),
	allowWorkerMcp: z.boolean().default(false),
	persistTranscripts: z.boolean().default(false),
})

export type OrchestrationSettings = z.infer<typeof orchestrationSettingsSchema>

export interface ModelRoute {
	profileId: string
	provider: string
	modelId: string
	role: string
	source: "explicit" | "role" | "primary"
	contextWindow?: number
	maxOutputTokens?: number
	reasoningEffort?: string
	resolvedAt: number
}

export interface ResolveModelRouteInput {
	profileId: string
	provider: string
	primaryModelId: string
	role: string
	explicitModelId?: string
	roleModels?: ProfileRoleModelSettings
	resolvedAt?: number
}

/** Resolves only within the already-selected provider profile. */
export function resolveModelRoute(input: ResolveModelRouteInput): ModelRoute {
	const roleSetting = input.roleModels?.roleModels[input.role]
	const roleModelId = roleSetting?.inheritPrimary === false ? roleSetting.modelId : undefined
	const modelId = input.explicitModelId ?? roleModelId ?? input.primaryModelId
	if (!modelId) throw new Error("Unable to resolve model route: profile has no primary model")
	return {
		profileId: input.profileId,
		provider: input.provider,
		modelId,
		role: input.role,
		source: input.explicitModelId ? "explicit" : roleModelId ? "role" : "primary",
		resolvedAt: input.resolvedAt ?? Date.now(),
	}
}

export const DEFAULT_ORCHESTRATION_SETTINGS: OrchestrationSettings = orchestrationSettingsSchema.parse({})
export const DEFAULT_PROFILE_ROLE_MODEL_SETTINGS: ProfileRoleModelSettings = profileRoleModelSettingsSchema.parse({})
