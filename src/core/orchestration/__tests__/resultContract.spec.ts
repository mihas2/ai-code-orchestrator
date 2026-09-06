import { describe, expect, it } from "vitest"

import { extractResultContract } from "../resultContract"

const valid = {
	contractVersion: 1,
	status: "completed",
	summary: "Implemented safely",
	filesRead: ["src/a.ts"],
	filesChanged: ["src/a.ts"],
	artifactRefs: ["artifact:test-output"],
	tests: [{ command: "pnpm vitest", passed: true, exitCode: 0, outputRef: "artifact:test-output" }],
	assumptions: [],
	risks: [],
	openQuestions: [],
	nextActions: [],
}

const extract = (text: string, options: { persistTranscript?: boolean; write?: string[] } = {}) =>
	extractResultContract({
		completionMessages: [{ type: "ask", ask: "completion_result", text }],
		fileScopes: { include: ["src"], exclude: ["src/private"], write: options.write ?? ["src"] },
		cwd: "/workspace",
		persistTranscript: options.persistTranscript ?? false,
		usage: { inputTokens: 10, outputTokens: 5 },
		route: { provider: "test", modelId: "model", profileId: "profile", role: "worker" },
	})

describe("ResultContract extraction", () => {
	it("extracts a valid contract and snapshots metadata", () => {
		const output = extract(JSON.stringify(valid))
		expect(output.result).toEqual(valid)
		expect(output.artifactRefs).toEqual(["artifact:test-output"])
		expect(output.usage).toEqual({ inputTokens: 10, outputTokens: 5 })
		expect(output.route?.modelId).toBe("model")
		expect(output.rawTranscript).toBeUndefined()
	})

	it("handles fenced JSON surrounded by prose", () => {
		const output = extract(`Done.\n\n\`\`\`json\n${JSON.stringify(valid)}\n\`\`\`\nThanks.`)
		expect(output.result.summary).toBe("Implemented safely")
	})

	it("rejects malformed or missing contracts", () => {
		expect(() => extract("not json")).toThrow("result_contract_invalid")
		expect(() =>
			extractResultContract({
				completionMessages: [],
				fileScopes: { include: ["src"], exclude: [] },
				cwd: "/workspace",
				persistTranscript: false,
			}),
		).toThrow("result_contract_missing")
	})

	it("rejects read, write, exclusion, and traversal scope violations", () => {
		expect(() => extract(JSON.stringify({ ...valid, filesChanged: ["docs/a.md"] }))).toThrow("scope_violation")
		expect(() => extract(JSON.stringify({ ...valid, filesChanged: ["src/private/key.ts"] }))).toThrow(
			"scope_violation",
		)
		expect(() => extract(JSON.stringify({ ...valid, filesRead: ["../secret"] }))).toThrow("scope_violation")
		expect(() => extract(JSON.stringify(valid), { write: ["src/generated"] })).toThrow("scope_violation")
	})

	it("redacts secrets in contracts and optional raw transcripts", () => {
		const secret = { ...valid, summary: "api_key=sk-live-secret" }
		const output = extract(`Bearer abc123\n${JSON.stringify(secret)}`, { persistTranscript: true })
		expect(output.result.summary).toContain("[REDACTED]")
		expect(output.rawTranscript).not.toContain("abc123")
		expect(output.rawTranscript).not.toContain("sk-live-secret")
	})

	it("uses the actual assistant history when completion messages are unavailable", () => {
		const output = extractResultContract({
			completionMessages: [],
			apiHistory: [{ role: "assistant", content: [{ type: "text", text: JSON.stringify(valid) }] }],
			fileScopes: { include: ["src"], exclude: [] },
			cwd: "/workspace",
			persistTranscript: false,
		})
		expect(output.result.status).toBe("completed")
	})
})
