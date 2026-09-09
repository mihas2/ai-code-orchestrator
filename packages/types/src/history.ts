import { z } from "zod"

/**
 * HistoryItem
 */

/**
 * Authoritative parent snapshot captured at delegation time.
 * Used to restore exact parent state, overriding stale global state or history.
 */
export const parentDelegationSnapshotSchema = z.object({
	mode: z.string(),
	apiConfigName: z.string().optional(),
	modelId: z.string().optional(),
	/** Timestamp when snapshot was captured */
	capturedAt: z.number(),
})

export type ParentDelegationSnapshot = z.infer<typeof parentDelegationSnapshotSchema>

export const historyItemSchema = z.object({
	id: z.string(),
	rootTaskId: z.string().optional(),
	parentTaskId: z.string().optional(),
	number: z.number(),
	ts: z.number(),
	task: z.string(),
	tokensIn: z.number(),
	tokensOut: z.number(),
	cacheWrites: z.number().optional(),
	cacheReads: z.number().optional(),
	totalCost: z.number(),
	size: z.number().optional(),
	workspace: z.string().optional(),
	mode: z.string().optional(),
	/** Model resolved for this task at runtime. Absent on legacy history records. */
	modelId: z.string().optional(),
	apiConfigName: z.string().optional(), // Provider profile name for sticky profile feature
	status: z.enum(["active", "completed", "delegated"]).optional(),
	delegatedToId: z.string().optional(), // Last child this parent delegated to
	childIds: z.array(z.string()).optional(), // All children spawned by this task
	awaitingChildId: z.string().optional(), // Child currently awaited (set when delegated)
	completedByChildId: z.string().optional(), // Child whose durable result was committed
	completionResultSummary: z.string().optional(), // Summary from completed child
	/** Durable recovery phase for parent delegation completion. */
	delegationResumePhase: z.enum(["pending", "resuming", "resumed"]).optional(),
	/** Authoritative parent snapshot for delegation restoration */
	parentSnapshot: parentDelegationSnapshotSchema.optional(),
})

export type HistoryItem = z.infer<typeof historyItemSchema>
