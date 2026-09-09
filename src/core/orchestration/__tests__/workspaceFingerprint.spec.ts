import { afterEach, describe, expect, it } from "vitest"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fingerprintWorkspace } from "../workspaceFingerprint"

const exec = promisify(execFile)
const directories: string[] = []
async function git(cwd: string, ...args: string[]) {
	return exec("git", args, { cwd })
}
async function temporary() {
	const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "workspace-fingerprint-"))
	directories.push(cwd)
	return cwd
}
async function repository(commit = true) {
	const cwd = await temporary()
	await git(cwd, "init")
	await git(cwd, "config", "user.email", "test@example.com")
	await git(cwd, "config", "user.name", "Test")
	await fs.writeFile(path.join(cwd, ".gitignore"), "ignored.txt\nignored-dir/\n")
	await fs.writeFile(path.join(cwd, "tracked.txt"), "one\n")
	if (commit) {
		await git(cwd, "add", ".")
		await git(cwd, "commit", "-m", "base")
	}
	return cwd
}
afterEach(async () => Promise.all(directories.splice(0).map((cwd) => fs.rm(cwd, { recursive: true, force: true }))))

describe("fingerprintWorkspace", () => {
	it("tracks untracked contents, tracked worktree, and index changes", async () => {
		const cwd = await repository()
		const values = [await fingerprintWorkspace(cwd)]
		await fs.writeFile(path.join(cwd, "new.txt"), "one\n")
		values.push(await fingerprintWorkspace(cwd))
		await fs.writeFile(path.join(cwd, "new.txt"), "two\n")
		values.push(await fingerprintWorkspace(cwd))
		await fs.writeFile(path.join(cwd, "tracked.txt"), "two\n")
		values.push(await fingerprintWorkspace(cwd))
		await git(cwd, "add", "tracked.txt")
		values.push(await fingerprintWorkspace(cwd))
		expect(new Set(values)).toHaveLength(5)
	})

	it("is deterministic for non-git workspaces and tracks edit, new, and delete", async () => {
		const cwd = await temporary()
		await fs.writeFile(path.join(cwd, "a.txt"), "one")
		const initial = await fingerprintWorkspace(cwd)
		expect(await fingerprintWorkspace(cwd)).toBe(initial)
		await fs.writeFile(path.join(cwd, "a.txt"), "two")
		const edited = await fingerprintWorkspace(cwd)
		await fs.writeFile(path.join(cwd, "b.txt"), "new")
		const added = await fingerprintWorkspace(cwd)
		await fs.rm(path.join(cwd, "a.txt"))
		const deleted = await fingerprintWorkspace(cwd)
		expect(new Set([initial, edited, added, deleted])).toHaveLength(4)
	})

	it("is deterministic for an unborn HEAD", async () => {
		const cwd = await repository(false)
		const first = await fingerprintWorkspace(cwd)
		expect(await fingerprintWorkspace(cwd)).toBe(first)
		await fs.writeFile(path.join(cwd, "tracked.txt"), "changed")
		expect(await fingerprintWorkspace(cwd)).not.toBe(first)
	})

	it("honors ignore rules in content mode", async () => {
		const cwd = await temporary()
		await fs.writeFile(path.join(cwd, ".gitignore"), "ignored.txt\nignored-dir/\n")
		await fs.writeFile(path.join(cwd, "kept.txt"), "one")
		await fs.writeFile(path.join(cwd, "ignored.txt"), "one")
		await fs.mkdir(path.join(cwd, "ignored-dir"))
		await fs.writeFile(path.join(cwd, "ignored-dir", "value"), "one")
		const first = await fingerprintWorkspace(cwd)
		await fs.writeFile(path.join(cwd, "ignored.txt"), "two")
		await fs.writeFile(path.join(cwd, "ignored-dir", "value"), "two")
		expect(await fingerprintWorkspace(cwd)).toBe(first)
	})

	it("hashes symlink target text without reading an outside target", async () => {
		const cwd = await temporary()
		const outside = await temporary()
		const secret = path.join(outside, "secret")
		await fs.writeFile(secret, "one")
		await fs.symlink(secret, path.join(cwd, "link"))
		const first = await fingerprintWorkspace(cwd)
		await fs.writeFile(secret, "two")
		expect(await fingerprintWorkspace(cwd)).toBe(first)
		await fs.rm(path.join(cwd, "link"))
		await fs.symlink(`${secret}-different`, path.join(cwd, "link"))
		expect(await fingerprintWorkspace(cwd)).not.toBe(first)
	})

	it("aborts and exposes failures and limits instead of producing an acceptable hash", async () => {
		const cwd = await temporary()
		const controller = new AbortController()
		controller.abort()
		await expect(fingerprintWorkspace(cwd, controller.signal)).rejects.toMatchObject({ name: "AbortError" })
		await expect(fingerprintWorkspace(path.join(cwd, "missing"))).rejects.toThrow(
			"Workspace fingerprint unavailable",
		)
		for (let index = 0; index <= 4096; index++) await fs.writeFile(path.join(cwd, `f-${index}`), "")
		await expect(fingerprintWorkspace(cwd)).rejects.toThrow("file limit exceeded")
	})
})
