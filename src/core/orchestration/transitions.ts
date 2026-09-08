import type { NodeStatus, RunStatus } from "./types"
const run: Record<RunStatus, readonly RunStatus[]> = {
	planning: ["planned", "failed", "canceled", "paused"],
	planned: ["dispatching", "canceled", "paused"],
	dispatching: ["running", "integrating", "failed", "canceled", "paused"],
	running: ["reviewing", "integrating", "synthesizing", "failed", "canceled", "paused"],
	reviewing: ["reworking", "integrating", "failed", "canceled", "paused"],
	reworking: ["running", "failed", "canceled", "paused"],
	integrating: ["dispatching", "synthesizing", "failed", "canceled", "paused"],
	synthesizing: ["reworking", "completed", "failed", "canceled", "paused"],
	paused: [
		"planning",
		"planned",
		"dispatching",
		"running",
		"reviewing",
		"reworking",
		"integrating",
		"synthesizing",
		"canceled",
	],
	completed: [],
	failed: [],
	canceled: [],
}
const node: Record<NodeStatus, readonly NodeStatus[]> = {
	planned: ["blocked", "running", "awaiting_review", "ready_to_integrate", "integrated", "canceled"],
	blocked: ["planned", "canceled"],
	running: ["awaiting_review", "ready_to_integrate", "integrated", "failed", "canceled"],
	awaiting_review: ["needs_rework", "ready_to_integrate", "canceled"],
	needs_rework: ["running", "canceled"],
	ready_to_integrate: ["needs_rework", "integrated", "failed", "canceled"],
	integrated: ["needs_rework", "failed"],
	failed: ["planned", "canceled"],
	canceled: [],
}
export function assertRunTransition(from: RunStatus, to: RunStatus): void {
	if (from !== to && !run[from].includes(to)) throw new Error(`Invalid run transition: ${from} -> ${to}`)
}
export function assertNodeTransition(from: NodeStatus, to: NodeStatus): void {
	if (from !== to && !node[from].includes(to)) throw new Error(`Invalid node transition: ${from} -> ${to}`)
}
