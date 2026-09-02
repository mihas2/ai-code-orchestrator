import { execFile } from "node:child_process"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

export interface WorkerWorkspace {
	workerId: string
	path: string
	baseHash: string
}

/** Real git worktree allocator. A worker never receives the orchestration cwd. */
export class GitWorkerWorkspaceRegistry {
	private readonly workers = new Map<string, WorkerWorkspace>()
	private readonly root: string

	constructor(
		private readonly repository: string,
		root = path.join(os.tmpdir(), "aico-orchestration-workers"),
	) {
		this.root = root
	}

	async allocate(runId: string, nodeId: string, attempt: number): Promise<WorkerWorkspace> {
		const workerId = `${runId}-${nodeId}-${attempt}`.replace(/[^a-zA-Z0-9._-]/g, "_")
		const existing = this.workers.get(workerId)
		if (existing) return existing
		await fs.mkdir(this.root, { recursive: true })
		const worktreePath = path.join(this.root, workerId)
		const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: this.repository })
		const baseHash = stdout.trim()
		await execFileAsync("git", ["worktree", "add", "--detach", worktreePath, baseHash], { cwd: this.repository })
		const workspace = { workerId, path: worktreePath, baseHash }
		this.workers.set(workerId, workspace)
		return workspace
	}

	async release(workerId: string, force = false): Promise<void> {
		const worker = this.workers.get(workerId)
		if (!worker) return
		await execFileAsync("git", ["worktree", "remove", ...(force ? ["--force"] : []), worker.path], {
			cwd: this.repository,
		})
		this.workers.delete(workerId)
	}

	get(workerId: string): WorkerWorkspace | undefined {
		return this.workers.get(workerId)
	}
}
