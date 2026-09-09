import { createHash } from "node:crypto"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import fs from "node:fs/promises"
import path from "node:path"

const execFileAsync = promisify(execFile)
const MAX_OUTPUT = 32 * 1024 * 1024
const MAX_FILES = 4096
const MAX_BYTES = 64 * 1024 * 1024

function abortError(): DOMException {
	return new DOMException("Operation aborted", "AbortError")
}

function isInside(root: string, candidate: string): boolean {
	return candidate === root || candidate.startsWith(`${root}${path.sep}`)
}

function ignored(relative: string, patterns: string[]): boolean {
	const normalized = relative.split(path.sep).join("/")
	return patterns.some((raw) => {
		const pattern = raw.trim()
		if (!pattern || pattern.startsWith("#") || pattern.startsWith("!")) return false
		const value = pattern.replace(/\/$/, "")
		if (value.startsWith("/")) return normalized === value.slice(1) || normalized.startsWith(`${value.slice(1)}/`)
		if (value.includes("/"))
			return normalized === value || normalized.endsWith(`/${value}`) || normalized.startsWith(`${value}/`)
		return normalized.split("/").includes(value)
	})
}

async function contentFingerprint(cwd: string, signal?: AbortSignal): Promise<string> {
	const root = await fs.realpath(cwd)
	const digest = createHash("sha256").update("workspace-content-v1\0")
	const patterns = await fs
		.readFile(path.join(root, ".gitignore"), "utf8")
		.then((value) => value.split(/\r?\n/))
		.catch((error: NodeJS.ErrnoException) => (error.code === "ENOENT" ? [] : Promise.reject(error)))
	let files = 0
	let bytes = 0
	const visit = async (directory: string): Promise<void> => {
		if (signal?.aborted) throw abortError()
		const entries = (await fs.readdir(directory, { withFileTypes: true })).sort((a, b) =>
			a.name.localeCompare(b.name),
		)
		for (const entry of entries) {
			if (signal?.aborted) throw abortError()
			const absolute = path.join(directory, entry.name)
			const relative = path.relative(root, absolute)
			if (entry.name === ".git" || ignored(relative, patterns)) continue
			if (entry.isDirectory()) {
				await visit(absolute)
				continue
			}
			files++
			if (files > MAX_FILES) throw new Error("workspace fingerprint file limit exceeded")
			if (entry.isSymbolicLink()) {
				const target = await fs.readlink(absolute)
				digest.update(`L\0${relative}\0${target}\0`)
				continue
			}
			if (!entry.isFile()) continue
			const stat = await fs.stat(absolute)
			bytes += stat.size
			if (bytes > MAX_BYTES) throw new Error("workspace fingerprint byte limit exceeded")
			digest
				.update(`F\0${relative}\0`)
				.update(await fs.readFile(absolute))
				.update("\0")
		}
	}
	await visit(root)
	return digest.digest("hex")
}

/** Stable git fingerprint with a content-based fallback for non-git and unborn repositories. */
export async function fingerprintWorkspace(cwd: string, signal?: AbortSignal): Promise<string> {
	const check = () => {
		if (signal?.aborted) throw abortError()
	}
	try {
		check()
		const [head, status, diff, untracked] = await Promise.all([
			execFileAsync("git", ["rev-parse", "HEAD"], { cwd, maxBuffer: MAX_OUTPUT }),
			execFileAsync("git", ["status", "--porcelain=v1", "--untracked-files=all"], { cwd, maxBuffer: MAX_OUTPUT }),
			execFileAsync("git", ["diff", "--no-ext-diff", "--binary", "HEAD"], { cwd, maxBuffer: MAX_OUTPUT }),
			execFileAsync("git", ["ls-files", "--others", "--exclude-standard", "-z"], { cwd, maxBuffer: MAX_OUTPUT }),
		])
		check()
		const digest = createHash("sha256")
		digest.update(`HEAD\0${head.stdout}\0STATUS\0${status.stdout}\0DIFF\0${diff.stdout}\0UNTRACKED\0`)
		const files = untracked.stdout.split("\0").filter(Boolean).sort()
		let bytes = 0
		for (const relative of files) {
			check()
			const absolute = path.resolve(cwd, relative)
			const root = await fs.realpath(cwd)
			const stat = await fs.lstat(absolute)
			if (stat.isSymbolicLink()) {
				digest.update(`L\0${relative}\0${await fs.readlink(absolute)}\0`)
				continue
			}
			if (!stat.isFile()) continue
			bytes += stat.size
			if (bytes > MAX_BYTES) throw new Error("untracked content exceeds fingerprint limit")
			if (!isInside(root, await fs.realpath(absolute)))
				throw new Error(`untracked path escapes workspace: ${relative}`)
			digest
				.update(relative)
				.update("\0")
				.update(await fs.readFile(absolute))
				.update("\0")
		}
		return digest.digest("hex")
	} catch (error) {
		check()
		const detail =
			error && typeof error === "object"
				? `${String((error as { message?: unknown }).message)} ${(error as { stderr?: unknown }).stderr ?? ""}`
				: String(error)
		if (
			detail.includes("not a git repository") ||
			detail.includes("ambiguous argument 'HEAD'") ||
			detail.includes("Needed a single revision")
		)
			return contentFingerprint(cwd, signal)
		throw new Error(`Workspace fingerprint unavailable: ${detail}`, { cause: error })
	}
}
