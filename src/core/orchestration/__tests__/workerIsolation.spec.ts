import { EventEmitter } from "node:events"
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

	it("allocates workspace in main repository", async () => {
		respond(null, "abc123def456\n")
		const registry = new GitWorkerWorkspaceRegistry("/repo")

		const workspace = await registry.allocate("run1", "node1", 1)

		expect(workspace.workerId).toBe("run1-node1-1")
		expect(workspace.path).toBe("/repo") // Main repository, not /tmp
		expect(workspace.baseHash).toBe("abc123def456")
		expect(execFile.mock.calls[0][1]).toEqual(["rev-parse", "HEAD"])
	})

	it("returns same workspace for duplicate allocation", async () => {
		respond(null, "abc123\n")
		const registry = new GitWorkerWorkspaceRegistry("/repo")

		const ws1 = await registry.allocate("run1", "node1", 1)
		const ws2 = await registry.allocate("run1", "node1", 1)

		expect(ws1).toBe(ws2)
		expect(execFile).toHaveBeenCalledTimes(1) // Only one git call
	})

	it("sanitizes worker IDs by replacing special characters", async () => {
		respond(null, "hash\n")
		const registry = new GitWorkerWorkspaceRegistry("/repo")

		const workspace = await registry.allocate("run@123", "node/456", 1)

		expect(workspace.workerId).toBe("run_123-node_456-1")
	})

	it("release is no-op and does not call git", async () => {
		respond(null, "hash\n")
		const registry = new GitWorkerWorkspaceRegistry("/repo")

		await registry.allocate("run1", "node1", 1)
		await registry.release("run1-node1-1")

		expect(execFile).toHaveBeenCalledTimes(1) // Only allocate call
		expect(registry.get("run1-node1-1")).toBeUndefined()
	})

	it("get returns undefined for non-existent worker", () => {
		const registry = new GitWorkerWorkspaceRegistry("/repo")

		expect(registry.get("nonexistent")).toBeUndefined()
	})
})
