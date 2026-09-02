import { z } from "zod"

import { clineMessageSchema, queuedMessageSchema, tokenUsageSchema } from "./message.js"
import { modelInfoSchema } from "./model.js"
import { toolNamesSchema, toolUsageSchema } from "./tool.js"

/**
 * AiCodeOrchestratorEventName
 */

export enum AiCodeOrchestratorEventName {
	// Task Provider Lifecycle
	TaskCreated = "taskCreated",

	// Task Lifecycle
	TaskStarted = "taskStarted",
	TaskCompleted = "taskCompleted",
	TaskAborted = "taskAborted",
	TaskFocused = "taskFocused",
	TaskUnfocused = "taskUnfocused",
	TaskActive = "taskActive",
	TaskInteractive = "taskInteractive",
	TaskResumable = "taskResumable",
	TaskIdle = "taskIdle",

	// Subtask Lifecycle
	TaskPaused = "taskPaused",
	TaskUnpaused = "taskUnpaused",
	TaskSpawned = "taskSpawned",
	TaskDelegated = "taskDelegated",
	TaskDelegationCompleted = "taskDelegationCompleted",
	TaskDelegationResumed = "taskDelegationResumed",

	// Task Execution
	Message = "message",
	TaskModeSwitched = "taskModeSwitched",
	TaskAskResponded = "taskAskResponded",
	TaskUserMessage = "taskUserMessage",
	QueuedMessagesUpdated = "queuedMessagesUpdated",

	// Task Analytics
	TaskTokenUsageUpdated = "taskTokenUsageUpdated",
	TaskToolFailed = "taskToolFailed",

	// Configuration Changes
	ModeChanged = "modeChanged",
	ProviderProfileChanged = "providerProfileChanged",

	// Query Responses
	CommandsResponse = "commandsResponse",
	ModesResponse = "modesResponse",
	ModelsResponse = "modelsResponse",
}

/**
 * AiCodeOrchestratorEvents
 */

export const aiCodeOrchestratorEventsSchema = z.object({
	[AiCodeOrchestratorEventName.TaskCreated]: z.tuple([z.string()]),

	[AiCodeOrchestratorEventName.TaskStarted]: z.tuple([z.string()]),
	[AiCodeOrchestratorEventName.TaskCompleted]: z.tuple([
		z.string(),
		tokenUsageSchema,
		toolUsageSchema,
		z.object({
			isSubtask: z.boolean(),
		}),
	]),
	[AiCodeOrchestratorEventName.TaskAborted]: z.tuple([z.string()]),
	[AiCodeOrchestratorEventName.TaskFocused]: z.tuple([z.string()]),
	[AiCodeOrchestratorEventName.TaskUnfocused]: z.tuple([z.string()]),
	[AiCodeOrchestratorEventName.TaskActive]: z.tuple([z.string()]),
	[AiCodeOrchestratorEventName.TaskInteractive]: z.tuple([z.string()]),
	[AiCodeOrchestratorEventName.TaskResumable]: z.tuple([z.string()]),
	[AiCodeOrchestratorEventName.TaskIdle]: z.tuple([z.string()]),

	[AiCodeOrchestratorEventName.TaskPaused]: z.tuple([z.string()]),
	[AiCodeOrchestratorEventName.TaskUnpaused]: z.tuple([z.string()]),
	[AiCodeOrchestratorEventName.TaskSpawned]: z.tuple([z.string(), z.string()]),
	[AiCodeOrchestratorEventName.TaskDelegated]: z.tuple([
		z.string(), // parentTaskId
		z.string(), // childTaskId
	]),
	[AiCodeOrchestratorEventName.TaskDelegationCompleted]: z.tuple([
		z.string(), // parentTaskId
		z.string(), // childTaskId
		z.string(), // completionResultSummary
	]),
	[AiCodeOrchestratorEventName.TaskDelegationResumed]: z.tuple([
		z.string(), // parentTaskId
		z.string(), // childTaskId
	]),

	[AiCodeOrchestratorEventName.Message]: z.tuple([
		z.object({
			taskId: z.string(),
			action: z.union([z.literal("created"), z.literal("updated")]),
			message: clineMessageSchema,
		}),
	]),
	[AiCodeOrchestratorEventName.TaskModeSwitched]: z.tuple([z.string(), z.string()]),
	[AiCodeOrchestratorEventName.TaskAskResponded]: z.tuple([z.string()]),
	[AiCodeOrchestratorEventName.TaskUserMessage]: z.tuple([z.string()]),
	[AiCodeOrchestratorEventName.QueuedMessagesUpdated]: z.tuple([z.string(), z.array(queuedMessageSchema)]),

	[AiCodeOrchestratorEventName.TaskToolFailed]: z.tuple([z.string(), toolNamesSchema, z.string()]),
	[AiCodeOrchestratorEventName.TaskTokenUsageUpdated]: z.tuple([z.string(), tokenUsageSchema, toolUsageSchema]),

	[AiCodeOrchestratorEventName.ModeChanged]: z.tuple([z.string()]),
	[AiCodeOrchestratorEventName.ProviderProfileChanged]: z.tuple([
		z.object({ name: z.string(), provider: z.string() }),
	]),

	[AiCodeOrchestratorEventName.CommandsResponse]: z.tuple([
		z.array(
			z.object({
				name: z.string(),
				source: z.enum(["global", "project", "built-in"]),
				filePath: z.string().optional(),
				description: z.string().optional(),
				argumentHint: z.string().optional(),
			}),
		),
	]),
	[AiCodeOrchestratorEventName.ModesResponse]: z.tuple([z.array(z.object({ slug: z.string(), name: z.string() }))]),
	[AiCodeOrchestratorEventName.ModelsResponse]: z.tuple([z.record(z.string(), modelInfoSchema)]),
})

export type AiCodeOrchestratorEvents = z.infer<typeof aiCodeOrchestratorEventsSchema>

/**
 * TaskEvent
 */

export const taskEventSchema = z.discriminatedUnion("eventName", [
	// Task Provider Lifecycle
	z.object({
		eventName: z.literal(AiCodeOrchestratorEventName.TaskCreated),
		payload: aiCodeOrchestratorEventsSchema.shape[AiCodeOrchestratorEventName.TaskCreated],
		taskId: z.number().optional(),
	}),

	// Task Lifecycle
	z.object({
		eventName: z.literal(AiCodeOrchestratorEventName.TaskStarted),
		payload: aiCodeOrchestratorEventsSchema.shape[AiCodeOrchestratorEventName.TaskStarted],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(AiCodeOrchestratorEventName.TaskCompleted),
		payload: aiCodeOrchestratorEventsSchema.shape[AiCodeOrchestratorEventName.TaskCompleted],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(AiCodeOrchestratorEventName.TaskAborted),
		payload: aiCodeOrchestratorEventsSchema.shape[AiCodeOrchestratorEventName.TaskAborted],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(AiCodeOrchestratorEventName.TaskFocused),
		payload: aiCodeOrchestratorEventsSchema.shape[AiCodeOrchestratorEventName.TaskFocused],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(AiCodeOrchestratorEventName.TaskUnfocused),
		payload: aiCodeOrchestratorEventsSchema.shape[AiCodeOrchestratorEventName.TaskUnfocused],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(AiCodeOrchestratorEventName.TaskActive),
		payload: aiCodeOrchestratorEventsSchema.shape[AiCodeOrchestratorEventName.TaskActive],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(AiCodeOrchestratorEventName.TaskInteractive),
		payload: aiCodeOrchestratorEventsSchema.shape[AiCodeOrchestratorEventName.TaskInteractive],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(AiCodeOrchestratorEventName.TaskResumable),
		payload: aiCodeOrchestratorEventsSchema.shape[AiCodeOrchestratorEventName.TaskResumable],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(AiCodeOrchestratorEventName.TaskIdle),
		payload: aiCodeOrchestratorEventsSchema.shape[AiCodeOrchestratorEventName.TaskIdle],
		taskId: z.number().optional(),
	}),

	// Subtask Lifecycle
	z.object({
		eventName: z.literal(AiCodeOrchestratorEventName.TaskPaused),
		payload: aiCodeOrchestratorEventsSchema.shape[AiCodeOrchestratorEventName.TaskPaused],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(AiCodeOrchestratorEventName.TaskUnpaused),
		payload: aiCodeOrchestratorEventsSchema.shape[AiCodeOrchestratorEventName.TaskUnpaused],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(AiCodeOrchestratorEventName.TaskSpawned),
		payload: aiCodeOrchestratorEventsSchema.shape[AiCodeOrchestratorEventName.TaskSpawned],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(AiCodeOrchestratorEventName.TaskDelegated),
		payload: aiCodeOrchestratorEventsSchema.shape[AiCodeOrchestratorEventName.TaskDelegated],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(AiCodeOrchestratorEventName.TaskDelegationCompleted),
		payload: aiCodeOrchestratorEventsSchema.shape[AiCodeOrchestratorEventName.TaskDelegationCompleted],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(AiCodeOrchestratorEventName.TaskDelegationResumed),
		payload: aiCodeOrchestratorEventsSchema.shape[AiCodeOrchestratorEventName.TaskDelegationResumed],
		taskId: z.number().optional(),
	}),

	// Task Execution
	z.object({
		eventName: z.literal(AiCodeOrchestratorEventName.Message),
		payload: aiCodeOrchestratorEventsSchema.shape[AiCodeOrchestratorEventName.Message],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(AiCodeOrchestratorEventName.TaskModeSwitched),
		payload: aiCodeOrchestratorEventsSchema.shape[AiCodeOrchestratorEventName.TaskModeSwitched],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(AiCodeOrchestratorEventName.TaskAskResponded),
		payload: aiCodeOrchestratorEventsSchema.shape[AiCodeOrchestratorEventName.TaskAskResponded],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(AiCodeOrchestratorEventName.QueuedMessagesUpdated),
		payload: aiCodeOrchestratorEventsSchema.shape[AiCodeOrchestratorEventName.QueuedMessagesUpdated],
		taskId: z.number().optional(),
	}),

	// Task Analytics
	z.object({
		eventName: z.literal(AiCodeOrchestratorEventName.TaskToolFailed),
		payload: aiCodeOrchestratorEventsSchema.shape[AiCodeOrchestratorEventName.TaskToolFailed],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(AiCodeOrchestratorEventName.TaskTokenUsageUpdated),
		payload: aiCodeOrchestratorEventsSchema.shape[AiCodeOrchestratorEventName.TaskTokenUsageUpdated],
		taskId: z.number().optional(),
	}),

	// Query Responses
	z.object({
		eventName: z.literal(AiCodeOrchestratorEventName.CommandsResponse),
		payload: aiCodeOrchestratorEventsSchema.shape[AiCodeOrchestratorEventName.CommandsResponse],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(AiCodeOrchestratorEventName.ModesResponse),
		payload: aiCodeOrchestratorEventsSchema.shape[AiCodeOrchestratorEventName.ModesResponse],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(AiCodeOrchestratorEventName.ModelsResponse),
		payload: aiCodeOrchestratorEventsSchema.shape[AiCodeOrchestratorEventName.ModelsResponse],
		taskId: z.number().optional(),
	}),
])

export type TaskEvent = z.infer<typeof taskEventSchema>
