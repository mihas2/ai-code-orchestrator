import { execFile } from "node:child_process"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { promisify } from "node:util"
import { afterEach, describe, expect, it, vi } from "vitest"
import { GitIntegrationAdapter } from "../integrationAdapter"
import { coordinateIntegration } from "../reviewIntegration"
import type { ArtifactDescriptor, OrchestrationNode, OrchestrationRun } from "../types"

const exec = promisify(execFile)
const directories: string[] = []

async function git(cwd: string, ...args: string[]) {
	return (await exec("git", args, { cwd })).stdout.trim()
}

async function fixture() {
	const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "integration-conflict-"))
	directories.push(cwd)
	await git(cwd, "init")
	await git(cwd, "config", "user.email", "test@example.com")
	await git(cwd, "config", "user.name", "Test")
	for (const file of ["fileA.ts", "fileB.ts", "shared.ts", "common.ts", "utils.ts", "index.ts"])
		await fs.writeFile(path.join(cwd, file), `export const value = "${file}"\n`)
	await git(cwd, "add", ".")
	await git(cwd, "commit", "-m", "base")
	return cwd
}

async function patch(
	cwd: string,
	name: string,
	files: string[],
	content: (file: string) => string = (file) => `changed ${file}\n`,
): Promise<ArtifactDescriptor> {
	const originals = new Map<string, Buffer>()
	for (const file of files) {
		originals.set(file, await fs.readFile(path.join(cwd, file)))
		await fs.writeFile(path.join(cwd, file), content(file))
	}
	const contents = await git(cwd, "diff")
	for (const file of files) await fs.writeFile(path.join(cwd, file), originals.get(file)!)
	await fs.writeFile(path.join(cwd, name), `${contents}\n`)
	return { ref: name, path: files[0] ?? "", preserved: true }
}

const run = { runId: "run", settingsSnapshot: { conflictPolicy: "serialized" } } as OrchestrationRun
const node = {
	nodeId: "child",
	inputContract: {
		fileScopes: { write: ["", "fileA.ts", "fileB.ts", "shared.ts", "common.ts", "utils.ts", "index.ts"] },
	},
} as OrchestrationNode

async function integrate(cwd: string, parentArtifacts: ArtifactDescriptor[], childArtifacts: ArtifactDescriptor[]) {
	return coordinateIntegration({
		run,
		node,
		adapter: new GitIntegrationAdapter(cwd),
		approved: true,
		artifacts: childArtifacts,
		parentArtifacts,
		parentNodeId: "parent",
		childNodeId: "child",
	})
}

afterEach(async () => {
	vi.restoreAllMocks()
	await Promise.all(directories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })))
})

describe("GitIntegrationAdapter conflict detection", () => {
	it("integrates disjoint parent and child paths", async () => {
		const cwd = await fixture()
		const parent = await patch(cwd, "parent.patch", ["fileA.ts"])
		const child = await patch(cwd, "child.patch", ["fileB.ts"])
		const result = await integrate(cwd, [parent], [child])
		expect(result.status).toBe("integrated")
		expect(result.artifactRefs).toEqual(["child.patch"])
	})

	it("blocks a child patch that overlaps the parent", async () => {
		const cwd = await fixture()
		const parent = await patch(cwd, "parent.patch", ["shared.ts"])
		const child = await patch(cwd, "child.patch", ["shared.ts"])
		const applyPatch = vi.spyOn(GitIntegrationAdapter.prototype as never, "git" as never)
		const result = await integrate(cwd, [parent], [child])
		expect(result).toMatchObject({ status: "blocked", message: "Conflicting artifacts detected: shared.ts" })
		expect(applyPatch).not.toHaveBeenCalledWith(["apply", "--index", expect.anything()])
	})

	it("blocks when any path in a multi-file patch overlaps", async () => {
		const cwd = await fixture()
		const parent = await patch(cwd, "parent.patch", ["common.ts", "utils.ts"])
		const child = await patch(cwd, "child.patch", ["utils.ts", "index.ts"])
		const result = await integrate(cwd, [parent], [child])
		expect(result.status).toBe("blocked")
		expect(result.message).toContain("utils.ts")
	})

	it("does not block on an empty parent patch", async () => {
		const cwd = await fixture()
		await fs.writeFile(path.join(cwd, "parent.patch"), "")
		const child = await patch(cwd, "child.patch", ["fileB.ts"])
		const result = await integrate(cwd, [{ ref: "parent.patch", path: "", preserved: true }], [child])
		expect(result.status).toBe("integrated")
	})

	it("succeeds without applying an empty child patch", async () => {
		const cwd = await fixture()
		const parent = await patch(cwd, "parent.patch", ["fileA.ts"])
		await fs.writeFile(path.join(cwd, "child.patch"), "")
		const result = await integrate(cwd, [parent], [{ ref: "child.patch", path: "", preserved: true }])
		expect(result).toMatchObject({ status: "integrated", artifactRefs: [] })
	})
	it("allows a newer attempt by the same node without weakening ownership or safety checks", async () => {
		const cwd = await fixture()
		const adapter = new GitIntegrationAdapter(cwd)
		const nodeA1 = { ...node, nodeId: "a", attempt: 1 } as OrchestrationNode
		const nodeA2 = { ...node, nodeId: "a", attempt: 2 } as OrchestrationNode
		const nodeB = { ...node, nodeId: "b", attempt: 1 } as OrchestrationNode
		const first = await patch(cwd, "a-1.patch", ["fileA.ts"])
		first.baseHash = await git(cwd, "rev-parse", "HEAD")

		await expect(
			adapter.integrate({ run, node: nodeA1, artifacts: [first], idempotencyKey: "integration:run:a:1" }),
		).resolves.toEqual({ artifactRefs: ["a-1.patch"] })
		expect(await fs.readFile(path.join(cwd, "fileA.ts"), "utf8")).toBe("changed fileA.ts\n")

		const second = await patch(cwd, "a-2.patch", ["fileA.ts"], () => "changed again fileA.ts\n")
		second.baseHash = first.baseHash
		await expect(
			adapter.integrate({ run, node: nodeA2, artifacts: [second], idempotencyKey: "integration:run:a:2" }),
		).resolves.toEqual({ artifactRefs: ["a-2.patch"] })
		const afterSecond = await fs.readFile(path.join(cwd, "fileA.ts"), "utf8")
		await expect(
			adapter.integrate({ run, node: nodeA2, artifacts: [second], idempotencyKey: "integration:run:a:2" }),
		).resolves.toEqual({ artifactRefs: ["a-2.patch"] })
		expect(await fs.readFile(path.join(cwd, "fileA.ts"), "utf8")).toBe(afterSecond)

		const overwrite = await patch(cwd, "b.patch", ["fileA.ts"], () => "node b overwrite\n")
		overwrite.baseHash = first.baseHash
		await expect(
			adapter.integrate({ run, node: nodeB, artifacts: [overwrite], idempotencyKey: "integration:run:b:1" }),
		).rejects.toThrow("path:fileA.ts")

		const stale = await patch(cwd, "stale.patch", ["fileB.ts"])
		stale.baseHash = "stale"
		await expect(
			adapter.integrate({ run, node: nodeA2, artifacts: [stale], idempotencyKey: "integration:run:a:stale" }),
		).rejects.toThrow("base:stale.patch")

		const outside = await patch(cwd, "outside.patch", ["fileB.ts"])
		await expect(
			adapter.integrate({
				run,
				node: { ...nodeA2, inputContract: { fileScopes: { write: ["fileA.ts"] } } } as OrchestrationNode,
				artifacts: [outside],
				idempotencyKey: "integration:run:a:outside",
			}),
		).rejects.toThrow("scope:fileB.ts")
	})
})
