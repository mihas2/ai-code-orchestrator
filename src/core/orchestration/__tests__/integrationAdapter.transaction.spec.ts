import { execFile } from "node:child_process"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { promisify } from "node:util"
import { afterEach, describe, expect, it } from "vitest"
import { GitIntegrationAdapter } from "../integrationAdapter"
import { coordinateIntegration } from "../reviewIntegration"
import type { OrchestrationNode, OrchestrationRun } from "../types"

const exec = promisify(execFile)
const directories: string[] = []

async function git(cwd: string, ...args: string[]) {
	return (await exec("git", args, { cwd })).stdout.trim()
}

async function fixture() {
	const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "integration-adapter-"))
	directories.push(cwd)
	await git(cwd, "init")
	await git(cwd, "config", "user.email", "test@example.com")
	await git(cwd, "config", "user.name", "Test")
	await fs.mkdir(path.join(cwd, "src"))
	await fs.writeFile(path.join(cwd, "src", "one.ts"), "export const one = 1\n")
	await fs.writeFile(path.join(cwd, "src", "two.ts"), "export const two = 2\n")
	await fs.writeFile(path.join(cwd, "README.md"), "safe\n")
	await git(cwd, "add", ".")
	await git(cwd, "commit", "-m", "base")
	return cwd
}

const run = { runId: "run", settingsSnapshot: { conflictPolicy: "serialized" } } as OrchestrationRun
const node = { nodeId: "node", inputContract: { fileScopes: { write: ["src"] } } } as OrchestrationNode

async function patch(cwd: string, name: string, file: string, content: string) {
	const original = await fs.readFile(path.join(cwd, file))
	await fs.writeFile(path.join(cwd, file), content)
	const contents = await git(cwd, "diff", "--", file)
	await fs.writeFile(path.join(cwd, file), original)
	const patchPath = path.join(cwd, name)
	await fs.writeFile(patchPath, `${contents}\n`)
	return patchPath
}

afterEach(async () => {
	await Promise.all(directories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })))
})

describe("GitIntegrationAdapter transaction", () => {
	it("rolls back index and worktree when the second patch conflicts", async () => {
		const cwd = await fixture()
		const first = await patch(cwd, "first.patch", "src/one.ts", "export const one = 10\n")
		const second = await patch(cwd, "second.patch", "src/two.ts", "export const two = 20\n")
		await fs.writeFile(path.join(cwd, "src/two.ts"), "local conflict\n")
		const adapter = new GitIntegrationAdapter(cwd)
		await expect(
			adapter.integrate({
				run,
				node,
				artifacts: [
					{ ref: path.basename(first), path: "src/one.ts", preserved: true },
					{ ref: path.basename(second), path: "src/two.ts", preserved: true },
				],
				idempotencyKey: "transaction",
			}),
		).rejects.toThrow()
		expect(await fs.readFile(path.join(cwd, "src/one.ts"), "utf8")).toBe("export const one = 1\n")
		expect(await git(cwd, "diff", "--cached")).toBe("")
	})

	it("rejects an artifact outside the node write scope before applying it", async () => {
		const cwd = await fixture()
		const artifact = await patch(cwd, "outside.patch", "README.md", "unsafe\n")
		const adapter = new GitIntegrationAdapter(cwd)
		const result = await coordinateIntegration({
			run,
			node,
			adapter,
			approved: true,
			artifacts: [{ ref: path.basename(artifact), path: "README.md", preserved: true }],
		})
		expect(result.status).toBe("blocked")
		expect(result.message).toContain("scope")
		expect(await fs.readFile(path.join(cwd, "README.md"), "utf8")).toBe("safe\n")
	})
})
