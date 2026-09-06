import { EventEmitter } from "node:events"
import os from "node:os"
import path from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"

const execFile = vi.hoisted(() => vi.fn())

vi.mock("node:child_process", () => ({ execFile }))

import { GitWorkerWorkspaceRegistry } from "../workerIsolation"

function respond(error: Error | null, stdout = "") {
	execFile.mockImplementationOnce((_file, _args, ...rest) => {
		const callback = rest.at(-1)
		if (typeof callback === "function") callback(error, { stdout, stderr: "" })
		return new EventEmitter()
	})
}

describe("GitWorkerWorkspaceRegistry", () => {
	beforeEach(() => execFile.mockReset())

	it("prunes stale worktree metadata before its first allocation", async () => {
		respond(null)
		respond(null, "base-hash\n")
		respond(null)
		const registry = new GitWorkerWorkspaceRegistry("/repo", path.join(os.tmpdir(), "aico-test-workers-prune"))

		await registry.allocate("run", "node", 1)

		expect(execFile.mock.calls[0][1]).toEqual(["worktree", "prune"])
		expect(execFile.mock.calls[1][1]).toEqual(["rev-parse", "HEAD"])
	})

	it("removes an orphan when setup fails after git worktree add", async () => {
		respond(null)
		respond(null, "base-hash\n")
		respond(new Error("setup failed"))
		respond(null)
		const registry = new GitWorkerWorkspaceRegistry("/repo", path.join(os.tmpdir(), "aico-test-workers"))

		await expect(registry.allocate("run", "node", 1)).rejects.toThrow("setup failed")

		expect(execFile.mock.calls.at(-1)?.[1]).toEqual([
			"worktree",
			"remove",
			"--force",
			path.join(os.tmpdir(), "aico-test-workers", "run-node-1"),
		])
		expect(registry.get("run-node-1")).toBeUndefined()
	})
})
