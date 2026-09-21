/**
 * Explicit task completion state to prevent resurrection after attempt_completion.
 *
 * @see docs/plans/attempt-completion-resurrection-analysis.md
 */
export enum TaskCompletionStatus {
	/** Task is actively running */
	RUNNING = "running",

	/** attempt_completion tool was called, waiting for user confirmation */
	COMPLETING = "completing",

	/** User confirmed completion, task should terminate */
	COMPLETED = "completed",

	/** User rejected completion with feedback, continue execution */
	REJECTED = "rejected",
}

export function isTerminalStatus(status: TaskCompletionStatus): boolean {
	return status === TaskCompletionStatus.COMPLETED
}
