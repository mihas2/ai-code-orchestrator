import { z } from "zod"

import { aiCodeOrchestratorSettingsSchema } from "./global-settings.js"

/**
 * AI Code Orchestrator CLI stdin commands
 */

export const aicoCliCommandNames = ["start", "message", "cancel", "ping", "shutdown"] as const

export const aicoCliCommandNameSchema = z.enum(aicoCliCommandNames)

export type AicoCliCommandName = z.infer<typeof aicoCliCommandNameSchema>

export const aicoCliCommandBaseSchema = z.object({
	command: aicoCliCommandNameSchema,
	requestId: z.string().min(1),
})

export type AicoCliCommandBase = z.infer<typeof aicoCliCommandBaseSchema>

const aicoCliSessionIdSchema = z
	.string()
	.trim()
	.regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)

export const aicoCliStartCommandSchema = aicoCliCommandBaseSchema.extend({
	command: z.literal("start"),
	prompt: z.string(),
	taskId: aicoCliSessionIdSchema.optional(),
	images: z.array(z.string()).optional(),
	configuration: aiCodeOrchestratorSettingsSchema.optional(),
})

export type AicoCliStartCommand = z.infer<typeof aicoCliStartCommandSchema>

export const aicoCliMessageCommandSchema = aicoCliCommandBaseSchema.extend({
	command: z.literal("message"),
	prompt: z.string(),
	images: z.array(z.string()).optional(),
})

export type AicoCliMessageCommand = z.infer<typeof aicoCliMessageCommandSchema>

export const aicoCliCancelCommandSchema = aicoCliCommandBaseSchema.extend({
	command: z.literal("cancel"),
})

export type AicoCliCancelCommand = z.infer<typeof aicoCliCancelCommandSchema>

export const aicoCliPingCommandSchema = aicoCliCommandBaseSchema.extend({
	command: z.literal("ping"),
})

export type AicoCliPingCommand = z.infer<typeof aicoCliPingCommandSchema>

export const aicoCliShutdownCommandSchema = aicoCliCommandBaseSchema.extend({
	command: z.literal("shutdown"),
})

export type AicoCliShutdownCommand = z.infer<typeof aicoCliShutdownCommandSchema>

export const aicoCliInputCommandSchema = z.discriminatedUnion("command", [
	aicoCliStartCommandSchema,
	aicoCliMessageCommandSchema,
	aicoCliCancelCommandSchema,
	aicoCliPingCommandSchema,
	aicoCliShutdownCommandSchema,
])

export type AicoCliInputCommand = z.infer<typeof aicoCliInputCommandSchema>

/**
 * AI Code Orchestrator CLI stream-json output
 */

export const aicoCliOutputFormats = ["text", "json", "stream-json"] as const

export const aicoCliOutputFormatSchema = z.enum(aicoCliOutputFormats)

export type AicoCliOutputFormat = z.infer<typeof aicoCliOutputFormatSchema>

export const aicoCliEventTypes = [
	"system",
	"control",
	"queue",
	"assistant",
	"user",
	"tool_use",
	"tool_result",
	"thinking",
	"error",
	"result",
] as const

export const aicoCliEventTypeSchema = z.enum(aicoCliEventTypes)

export type AicoCliEventType = z.infer<typeof aicoCliEventTypeSchema>

export const aicoCliControlSubtypes = ["ack", "done", "error"] as const

export const aicoCliControlSubtypeSchema = z.enum(aicoCliControlSubtypes)

export type AicoCliControlSubtype = z.infer<typeof aicoCliControlSubtypeSchema>

export const aicoCliQueueItemSchema = z.object({
	id: z.string().min(1),
	text: z.string().optional(),
	imageCount: z.number().optional(),
	timestamp: z.number().optional(),
})

export type AicoCliQueueItem = z.infer<typeof aicoCliQueueItemSchema>

export const aicoCliToolUseSchema = z.object({
	name: z.string(),
	input: z.record(z.unknown()).optional(),
})

export type AicoCliToolUse = z.infer<typeof aicoCliToolUseSchema>

export const aicoCliToolResultSchema = z.object({
	name: z.string(),
	output: z.string().optional(),
	error: z.string().optional(),
	exitCode: z.number().optional(),
})

export type AicoCliToolResult = z.infer<typeof aicoCliToolResultSchema>

export const aicoCliCostSchema = z.object({
	totalCost: z.number().optional(),
	inputTokens: z.number().optional(),
	outputTokens: z.number().optional(),
	cacheWrites: z.number().optional(),
	cacheReads: z.number().optional(),
})

export type AicoCliCost = z.infer<typeof aicoCliCostSchema>

export const aicoCliStreamEventSchema = z
	.object({
		type: aicoCliEventTypeSchema.optional(),
		subtype: z.string().optional(),
		requestId: z.string().optional(),
		command: aicoCliCommandNameSchema.optional(),
		taskId: z.string().optional(),
		code: z.string().optional(),
		content: z.string().optional(),
		success: z.boolean().optional(),
		id: z.number().optional(),
		done: z.boolean().optional(),
		queueDepth: z.number().optional(),
		queue: z.array(aicoCliQueueItemSchema).optional(),
		schemaVersion: z.number().optional(),
		protocol: z.string().optional(),
		capabilities: z.array(z.string()).optional(),
		tool_use: aicoCliToolUseSchema.optional(),
		tool_result: aicoCliToolResultSchema.optional(),
		cost: aicoCliCostSchema.optional(),
	})
	.passthrough()

export type AicoCliStreamEvent = z.infer<typeof aicoCliStreamEventSchema>

export const aicoCliControlEventSchema = aicoCliStreamEventSchema.extend({
	type: z.literal("control"),
	subtype: aicoCliControlSubtypeSchema,
	requestId: z.string().min(1),
})

export type AicoCliControlEvent = z.infer<typeof aicoCliControlEventSchema>

export const aicoCliFinalOutputSchema = z.object({
	type: z.literal("result"),
	success: z.boolean(),
	content: z.string().optional(),
	cost: aicoCliCostSchema.optional(),
	events: z.array(aicoCliStreamEventSchema),
})

export type AicoCliFinalOutput = z.infer<typeof aicoCliFinalOutputSchema>
