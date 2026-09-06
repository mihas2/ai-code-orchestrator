import { createHash } from "crypto"
import { execFile } from "child_process"
import fs from "fs/promises"
import path from "path"
import { promisify } from "util"

import type { ArtifactDescriptor, IntegrationAdapter, OrchestrationRun } from "./types"

const execFileAsync = promisify(execFile)
const unsafePath = /(^|[\\/])\.\.(?:[\\/]|$)|^(?:[a-zA-Z]:|[\\/]{2})|\0|(^|[\\/])\.git(?:[\\/]|$)/

interface PreparedArtifact {
	artifact: ArtifactDescriptor
	patchPath: string
	hash: string
	paths: string[]
}

/** Applies immutable patch artifacts after checking their recorded git base and touched paths. */
export class GitIntegrationAdapter implements IntegrationAdapter {
	private readonly bases = new Map<string, string>()
	private readonly integratedPaths = new Map<string, Set<string>>()
	private readonly completed = new Map<string, string[]>()
	private serialized: Promise<void> = Promise.resolve()

	constructor(private readonly cwd: string) {}

	async captureBase(run: Readonly<OrchestrationRun>): Promise<string> {
		const existing = this.bases.get(run.runId)
		if (existing) return existing
		const base = await this.git(["rev-parse", "HEAD"])
		this.bases.set(run.runId, base)
		return base
	}

	async check(input: {
		run: Readonly<OrchestrationRun>
		node?: Readonly<import("./types").OrchestrationNode>
		artifacts: readonly ArtifactDescriptor[]
		parentArtifacts?: readonly ArtifactDescriptor[]
		parentNodeId?: string
		childNodeId?: string
	}): Promise<{ safe: boolean; conflicts: string[]; currentBaseHash?: string }> {
		const base = await this.captureBase(input.run)
		const current = await this.git(["rev-parse", "HEAD"])
		const conflicts = new Set<string>()
		if (current !== base) conflicts.add("base_revision")

		const prepared = await Promise.all(input.artifacts.map((artifact) => this.prepare(artifact)))
		const parentPrepared = await Promise.all(
			(input.parentArtifacts ?? []).map((artifact) => this.prepare(artifact)),
		)
		const writeScopes = input.node?.inputContract.fileScopes.write ?? input.node?.inputContract.fileScopes.include
		const seen = new Set<string>()
		const integrated = this.integratedPaths.get(input.run.runId) ?? new Set<string>()
		for (const item of prepared) {
			if (item.artifact.baseHash && item.artifact.baseHash !== base) conflicts.add(`base:${item.artifact.ref}`)
			for (const changedPath of item.paths) {
				if (
					writeScopes &&
					!writeScopes.some(
						(scope) =>
							scope === "." ||
							scope === changedPath ||
							changedPath.startsWith(`${scope.replace(/\/$/, "")}/`),
					)
				)
					conflicts.add(`scope:${changedPath}`)
				if (seen.has(changedPath) || integrated.has(changedPath)) conflicts.add(`path:${changedPath}`)
				seen.add(changedPath)
			}
			if (item.paths.length) {
				try {
					await this.git(["apply", "--check", "--whitespace=error-all", item.patchPath])
				} catch {
					conflicts.add(`patch:${item.artifact.ref}`)
				}
			}
		}
		const parentPaths = new Set(parentPrepared.flatMap((item) => item.paths))
		const conflictingPaths = [
			...new Set(prepared.flatMap((item) => item.paths.filter((changedPath) => parentPaths.has(changedPath)))),
		]
		if (conflictingPaths.length) {
			console.warn("Conflicting artifacts detected", {
				parentNodeId: input.parentNodeId,
				childNodeId: input.childNodeId ?? input.node?.nodeId,
				conflictingPaths,
			})
			for (const changedPath of conflictingPaths) conflicts.add(`parent_child:${changedPath}`)
		}
		return { safe: conflicts.size === 0, conflicts: [...conflicts], currentBaseHash: current }
	}

	async integrate(input: {
		run: Readonly<OrchestrationRun>
		node: Readonly<import("./types").OrchestrationNode>
		artifacts: readonly ArtifactDescriptor[]
		parentArtifacts?: readonly ArtifactDescriptor[]
		parentNodeId?: string
		childNodeId?: string
		idempotencyKey: string
	}): Promise<{ artifactRefs: string[] }> {
		const previous = this.completed.get(input.idempotencyKey)
		if (previous) return { artifactRefs: [...previous] }
		const operation = async () => {
			const checked = await this.check(input)
			if (!checked.safe) throw new Error(`Unsafe integration: ${checked.conflicts.join(", ")}`)
			const prepared = await Promise.all(input.artifacts.map((artifact) => this.prepare(artifact)))
			const nonEmpty = prepared.filter((item) => item.paths.length > 0)
			if (nonEmpty.length)
				await this.git([
					"apply",
					"--index",
					"--whitespace=error-all",
					...nonEmpty.map((item) => item.patchPath),
				])
			const paths = this.integratedPaths.get(input.run.runId) ?? new Set<string>()
			for (const item of prepared) for (const changedPath of item.paths) paths.add(changedPath)
			this.integratedPaths.set(input.run.runId, paths)
			const refs = prepared.filter((item) => item.paths.length > 0).map((item) => item.artifact.ref)
			this.completed.set(input.idempotencyKey, refs)
			return { artifactRefs: refs }
		}
		if (input.run.settingsSnapshot.conflictPolicy !== "serialized") return operation()
		const result = this.serialized.then(operation, operation)
		this.serialized = result.then(
			() => undefined,
			() => undefined,
		)
		return result
	}

	private async prepare(artifact: ArtifactDescriptor): Promise<PreparedArtifact> {
		if (!artifact.preserved) throw new Error(`Artifact is not preserved: ${artifact.ref}`)
		const patchPath = path.resolve(this.cwd, artifact.ref)
		const relativePatchPath = path.relative(this.cwd, patchPath)
		if (!relativePatchPath || relativePatchPath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePatchPath))
			throw new Error(`Unsafe artifact reference: ${artifact.ref}`)
		const stat = await fs.stat(patchPath)
		if (!stat.isFile()) throw new Error(`Artifact is not a file: ${artifact.ref}`)
		const contents = await fs.readFile(patchPath)
		const hash = createHash("sha256").update(contents).digest("hex")
		if (artifact.resultHash && artifact.resultHash !== hash)
			throw new Error(`Artifact hash mismatch: ${artifact.ref}`)
		const output = contents.length ? await this.git(["apply", "--numstat", patchPath]) : ""
		const paths = output
			.split("\n")
			.map((line) => line.split("\t").at(-1)?.trim())
			.filter((value): value is string => Boolean(value))
		for (const changedPath of paths)
			if (unsafePath.test(changedPath) || path.isAbsolute(changedPath))
				throw new Error(`Unsafe artifact path: ${changedPath}`)
		return { artifact, patchPath, hash, paths: [...new Set(paths)] }
	}

	private async git(args: string[]): Promise<string> {
		const { stdout } = await execFileAsync("git", args, { cwd: this.cwd, maxBuffer: 10 * 1024 * 1024 })
		return stdout.trim()
	}
}
