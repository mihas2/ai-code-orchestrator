import { createHash } from "crypto"
import { execFile } from "child_process"
import fs from "fs/promises"
import path from "path"
import { promisify } from "util"

import type { ArtifactDescriptor, IntegrationAdapter, OrchestrationRun } from "./types"
import type { IntegrationProvenanceRecord, IntegrationProvenanceStore } from "./persistence"

const execFileAsync = promisify(execFile)
const unsafePath = /(^|[\\/])\.\.(?:[\\/]|$)|^(?:[a-zA-Z]:|[\\/]{2})|\0|(^|[\\/])\.git(?:[\\/]|$)/

interface PreparedArtifact {
	artifact: ArtifactDescriptor
	patchPath: string
	hash: string
	paths: string[]
}

interface PathProvenance {
	nodeId: string
	attempt: number
	idempotencyKey: string
	artifactHash: string
}

/** Applies immutable patch artifacts after checking their recorded git base and touched paths. */
export class GitIntegrationAdapter implements IntegrationAdapter {
	private readonly bases = new Map<string, string>()
	private readonly pathProvenance = new Map<string, Map<string, PathProvenance>>()
	private readonly completed = new Map<string, string[]>()
	private readonly ambiguous = new Set<string>()
	private serialized: Promise<void> = Promise.resolve()

	constructor(
		private readonly cwd: string,
		private readonly persistence?: IntegrationProvenanceStore,
	) {}

	private async restore(runId: string): Promise<void> {
		if (!this.persistence || this.pathProvenance.has(runId)) return
		const provenance = new Map<string, PathProvenance>()
		for (const record of await this.persistence.loadIntegrationProvenance(runId)) {
			// A pending mutation has an ambiguous crash boundary; never reapply it.
			if (record.state === "pending") this.ambiguous.add(record.key)
			if (record.state === "applied") {
				this.completed.set(record.key, record.artifactRefs)
				for (const changedPath of record.paths)
					provenance.set(changedPath, {
						nodeId: record.nodeId,
						attempt: record.attempt,
						idempotencyKey: record.key,
						artifactHash: record.artifactHash,
					})
			}
		}
		this.pathProvenance.set(runId, provenance)
	}

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
		idempotencyKey?: string
	}): Promise<{ safe: boolean; conflicts: string[]; currentBaseHash?: string }> {
		await this.restore(input.run.runId)
		if (input.idempotencyKey && this.ambiguous.has(input.idempotencyKey))
			return {
				safe: false,
				conflicts: ["ambiguous_integration"],
				currentBaseHash: await this.git(["rev-parse", "HEAD"]),
			}
		if (input.idempotencyKey && this.completed.has(input.idempotencyKey))
			return { safe: true, conflicts: [], currentBaseHash: await this.git(["rev-parse", "HEAD"]) }
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
		const provenance = this.pathProvenance.get(input.run.runId) ?? new Map<string, PathProvenance>()
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
				const owner = provenance.get(changedPath)
				const isNewerOwnerAttempt =
					owner && owner.nodeId === input.node?.nodeId && input.node.attempt > owner.attempt
				if (seen.has(changedPath) || (owner && !isNewerOwnerAttempt)) conflicts.add(`path:${changedPath}`)
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
		await this.restore(input.run.runId)
		if (this.ambiguous.has(input.idempotencyKey))
			throw new Error("Ambiguous persisted integration; refusing to reapply")
		const previous = this.completed.get(input.idempotencyKey)
		if (previous) return { artifactRefs: [...previous] }
		const operation = async () => {
			const checked = await this.check(input)
			if (!checked.safe) throw new Error(`Unsafe integration: ${checked.conflicts.join(", ")}`)
			const prepared = await Promise.all(input.artifacts.map((artifact) => this.prepare(artifact)))
			const nonEmpty = prepared.filter((item) => item.paths.length > 0)
			const refs = nonEmpty.map((item) => item.artifact.ref)
			const record: IntegrationProvenanceRecord = {
				key: input.idempotencyKey,
				runId: input.run.runId,
				nodeId: input.node.nodeId,
				attempt: input.node.attempt,
				artifactHash: createHash("sha256")
					.update(prepared.map((item) => item.hash).join(":"))
					.digest("hex"),
				paths: [...new Set(nonEmpty.flatMap((item) => item.paths))],
				state: "pending",
				artifactRefs: refs,
			}
			if (this.persistence) await this.persistence.saveIntegrationProvenance(record)
			if (nonEmpty.length)
				await this.git([
					"apply",
					"--index",
					"--whitespace=error-all",
					...nonEmpty.map((item) => item.patchPath),
				])
			const provenance = this.pathProvenance.get(input.run.runId) ?? new Map<string, PathProvenance>()
			for (const item of prepared)
				for (const changedPath of item.paths)
					provenance.set(changedPath, {
						nodeId: input.node.nodeId,
						attempt: input.node.attempt,
						idempotencyKey: input.idempotencyKey,
						artifactHash: item.hash,
					})
			this.pathProvenance.set(input.run.runId, provenance)
			if (this.persistence) await this.persistence.saveIntegrationProvenance({ ...record, state: "applied" })
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
