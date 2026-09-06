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
	private readonly prunePromise: Promise<unknown>

	constructor(
		private readonly repository: string,
		root = path.join(os.tmpdir(), "aico-orchestration-workers"),
	) {
		this.root = root
		this.prunePromise = execFileAsync("git", ["worktree", "prune"], { cwd: this.repository }).catch(() => undefined)
	}

	async allocate(runId: string, nodeId: string, attempt: number): Promise<WorkerWorkspace> {
		const workerId = `${runId}-${nodeId}-${attempt}`.replace(/[^a-zA-Z0-9._-]/g, "_")
		const existing = this.workers.get(workerId)
		if (existing) return existing
		await this.prunePromise
		await fs.mkdir(this.root, { recursive: true })
		const worktreePath = path.join(this.root, workerId)
		let worktreeCreated = false
		try {
			const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: this.repository })
			const baseHash = stdout.trim()
			try {
				await execFileAsync("git", ["worktree", "add", "--detach", worktreePath, baseHash], {
					cwd: this.repository,
				})
				worktreeCreated = true
			} catch (error) {
				await execFileAsync("git", ["worktree", "remove", "--force", worktreePath], {
					cwd: this.repository,
				}).catch(() => undefined)
				throw error
			}
			const workspace = { workerId, path: worktreePath, baseHash }
			this.workers.set(workerId, workspace)
			return workspace
		} catch (error) {
			if (worktreeCreated)
				await execFileAsync("git", ["worktree", "remove", "--force", worktreePath], {
					cwd: this.repository,
				}).catch(() => undefined)
			throw error
		}
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
