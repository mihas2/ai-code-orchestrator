import { execFile } from "node:child_process"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

export interface WorkerWorkspace {
	workerId: string
	path: string
	baseHash: string
}

/**
 * Worker workspace registry that allocates workers in the main repository.
 * Workers are isolated logically through fileScopes coordination in OrchestrationService,
 * not through physical git worktrees. This allows workers to benefit from auto-approval
 * and have their changes immediately visible in the main repository.
 */
export class GitWorkerWorkspaceRegistry {
	private readonly workers = new Map<string, WorkerWorkspace>()

	constructor(private readonly repository: string) {}

	async allocate(runId: string, nodeId: string, attempt: number): Promise<WorkerWorkspace> {
		const workerId = `${runId}-${nodeId}-${attempt}`.replace(/[^a-zA-Z0-9._-]/g, "_")
		const existing = this.workers.get(workerId)
		if (existing) return existing

		// Get current HEAD hash for tracking base revision
		const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: this.repository })
		const baseHash = stdout.trim()

		// Return main repository path instead of creating a worktree
		const workspace = { workerId, path: this.repository, baseHash }
		this.workers.set(workerId, workspace)
		return workspace
	}

	async release(workerId: string, force = false): Promise<void> {
		// No worktree to remove, just clean up the registry
		this.workers.delete(workerId)
	}

	get(workerId: string): WorkerWorkspace | undefined {
		return this.workers.get(workerId)
	}
}
