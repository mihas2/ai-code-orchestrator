import fs from "fs"
import path from "path"
import { z } from "zod"

import type { BudgetUsage, FileScopes, ResultContract } from "./types"

const testResultSchema = z
	.object({
		command: z.string().min(1),
		passed: z.boolean(),
		exitCode: z.number().int().optional(),
		outputRef: z.string().min(1).optional(),
	})
	.strict()

export const resultContractSchema = z
	.object({
		contractVersion: z.literal(1),
		status: z.enum(["completed", "partial", "failed"]),
		summary: z.string().min(1),
		filesRead: z.array(z.string()),
		filesChanged: z.array(z.string()),
		artifactRefs: z.array(z.string()),
		tests: z.array(testResultSchema),
		assumptions: z.array(z.string()),
		risks: z.array(z.string()),
		openQuestions: z.array(z.string()),
		nextActions: z.array(z.string()),
		findings: z
			.array(
				z
					.object({
						id: z.string().min(1),
						severity: z.enum(["blocker", "major", "minor", "note"]),
						message: z.string().min(1),
						title: z.string().min(1).optional(),
						file: z.string().min(1).optional(),
						line: z.number().int().positive().optional(),
						evidence: z.string().optional(),
						recommendation: z.string().optional(),
						acceptanceCriterionRef: z.string().optional(),
					})
					.strict(),
			)
			.optional(),
	})
	.strict()

export interface ResultContractExtraction {
	result: ResultContract
	rawTranscript?: string
	usage: Partial<BudgetUsage>
	route?: { provider?: string; modelId?: string; profileId?: string; role: string }
	artifactRefs: string[]
}

const pemPrivateKeyPattern = /-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/gi
const envSecretPattern =
	/\b([A-Z][A-Z0-9_]*(?:API[_-]?KEY|ACCESS[_-]?TOKEN|AUTH[_-]?TOKEN|SECRET|PASSWORD|PRIVATE[_-]?KEY)[A-Z0-9_]*)([ \t]*=[ \t]*)[^\r\n",}]*/g
const namedSecretPattern = /\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|secret|password)\b\s*[:=]\s*([^\s,;"']+)/gi
const bearerPattern = /\bBearer\s+([^\s,;"']+)/gi
const querySecretPattern = /([?&](?:x-api-key|api_key)=)([^&#\s]+)/gi
const jwtPattern = /\b(?:eyJ[A-Za-z0-9_-]{8,}|[A-Za-z0-9_-]{16,})\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g

export function redactResultSecrets(value: string): string {
	return value
		.replace(pemPrivateKeyPattern, "[REDACTED]")
		.replace(envSecretPattern, (_match, key: string, separator: string) => `${key}${separator}[REDACTED]`)
		.replace(namedSecretPattern, "[REDACTED]")
		.replace(bearerPattern, (_match, secret: string) => `Bearer [REDACTED]`)
		.replace(querySecretPattern, (_match, prefix: string) => `${prefix}[REDACTED]`)
		.replace(jwtPattern, "[REDACTED]")
}

function candidateJson(text: string): string[] {
	const fenced = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map((match) => match[1].trim())
	const candidates = [...fenced]
	for (let start = text.indexOf("{"); start >= 0; start = text.indexOf("{", start + 1)) {
		let depth = 0
		let quoted = false
		let escaped = false
		for (let index = start; index < text.length; index++) {
			const char = text[index]
			if (quoted) {
				if (escaped) escaped = false
				else if (char === "\\") escaped = true
				else if (char === '"') quoted = false
				continue
			}
			if (char === '"') quoted = true
			else if (char === "{") depth++
			else if (char === "}" && --depth === 0) {
				candidates.push(text.slice(start, index + 1))
				break
			}
		}
	}
	return [...new Set(candidates)]
}

function realpathWithMissingLeaf(file: string): string {
	let current = file
	const suffix: string[] = []
	while (!fs.existsSync(current)) {
		const parent = path.dirname(current)
		if (parent === current) throw new Error(`scope_violation: ${file}`)
		suffix.unshift(path.basename(current))
		current = parent
	}
	return path.join(fs.realpathSync.native(current), ...suffix)
}

function normalizeRelative(file: string, cwd: string): string {
	const workspace = fs.existsSync(cwd) ? fs.realpathSync.native(cwd) : path.resolve(cwd)
	const absolute = path.resolve(cwd, file)
	const relative = path.relative(cwd, absolute).split(path.sep).join("/")
	if (!relative || relative === "." || relative.startsWith("../") || path.isAbsolute(relative))
		throw new Error(`scope_violation: ${file}`)
	const real = realpathWithMissingLeaf(absolute)
	const realRelative = path.relative(workspace, real)
	if (
		!realRelative ||
		realRelative === "." ||
		realRelative.startsWith(`..${path.sep}`) ||
		path.isAbsolute(realRelative)
	)
		throw new Error(`scope_violation: ${file}`)
	return relative
}

function matchesScope(file: string, scope: string): boolean {
	const normalized = scope.replace(/^\.\//, "").replace(/\\/g, "/").replace(/\/$/, "")
	if (scope === "." || normalized === "") return true
	if (/[!*?\[\]{}()]/.test(normalized)) return path.matchesGlob(file, normalized)
	return file === normalized || file.startsWith(`${normalized}/`)
}

function enforceScopes(result: ResultContract, scopes: FileScopes, cwd: string): ResultContract {
	const normalize = (file: string) => normalizeRelative(file, cwd)
	const filesRead = result.filesRead.map(normalize)
	const filesChanged = result.filesChanged.map(normalize)
	const allowedRead = scopes.include.length ? scopes.include : ["."]
	const allowedWrite = scopes.write?.length ? scopes.write : allowedRead
	for (const file of filesRead)
		if (
			!allowedRead.some((scope) => matchesScope(file, scope)) ||
			scopes.exclude.some((scope) => matchesScope(file, scope))
		)
			throw new Error(`scope_violation: ${file}`)
	for (const file of filesChanged)
		if (
			!allowedWrite.some((scope) => matchesScope(file, scope)) ||
			scopes.exclude.some((scope) => matchesScope(file, scope))
		)
			throw new Error(`scope_violation: ${file}`)
	return { ...result, filesRead, filesChanged }
}

function redactContract(result: ResultContract): ResultContract {
	return JSON.parse(redactResultSecrets(JSON.stringify(result))) as ResultContract
}

export function extractResultContract(input: {
	completionMessages: ReadonlyArray<{ type?: string; ask?: string; say?: string; text?: string; partial?: boolean }>
	apiHistory?: ReadonlyArray<{ role?: string; content?: unknown }>
	fileScopes: FileScopes
	cwd: string
	persistTranscript: boolean
	usage?: Partial<BudgetUsage>
	route?: ResultContractExtraction["route"]
}): ResultContractExtraction {
	const completion = [...input.completionMessages]
		.reverse()
		.find(
			(message) =>
				message.text &&
				!message.partial &&
				((message.type === "ask" && message.ask === "completion_result") ||
					(message.type === "say" && message.say === "completion_result")),
		)
	const assistant = [...(input.apiHistory ?? [])].reverse().find((message) => message.role === "assistant")
	const assistantText =
		typeof assistant?.content === "string"
			? assistant.content
			: Array.isArray(assistant?.content)
				? assistant.content.map((block: any) => (block?.type === "text" ? block.text : "")).join("\n")
				: ""
	const transcripts = [completion?.text, assistantText].filter((text): text is string => !!text)
	if (!transcripts.length) throw new Error("result_contract_missing: completed Task has no final completion response")
	let validationError = ""
	for (const transcript of transcripts)
		for (const candidate of candidateJson(transcript)) {
			try {
				const parsed = resultContractSchema.safeParse(JSON.parse(candidate))
				if (!parsed.success) {
					validationError = parsed.error.message
					continue
				}
				const result = redactContract(enforceScopes(parsed.data, input.fileScopes, input.cwd))
				return {
					result,
					rawTranscript: input.persistTranscript ? redactResultSecrets(transcripts.join("\n\n")) : undefined,
					usage: input.usage ?? {},
					route: input.route,
					artifactRefs: result.artifactRefs,
				}
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error)
				if (message.startsWith("scope_violation:")) throw error
				validationError = message
			}
		}
	throw new Error(`result_contract_invalid: ${validationError || "no valid JSON object found"}`)
}

export const RESULT_CONTRACT_INSTRUCTION = `Begin work immediately by calling the most relevant native inspection or execution tool; do not reply with a text-only plan or reasoning. Every assistant turn must contain a native tool call. Use attempt_completion only after the objective is complete. Your final attempt_completion response MUST end with one JSON ResultContract object (plain or fenced JSON) with exactly these fields: contractVersion=1; status (completed|partial|failed); summary; filesRead; filesChanged; artifactRefs; tests [{command,passed,exitCode?,outputRef?}]; assumptions; risks; openQuestions; nextActions; optional findings [{id,severity,message,title?,file?,line?,evidence?,recommendation?,acceptanceCriterionRef?}] for reviewer-role workers. Report workspace-relative paths only and only within the declared file scopes. Do not include credentials, tokens, passwords, or secret values. Missing or invalid JSON makes the worker result fail.`
