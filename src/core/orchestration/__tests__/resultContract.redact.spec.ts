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

const extract = (summary: string, persistTranscript = true) =>
	extractResultContract({
		completionMessages: [
			{
				type: "ask",
				ask: "completion_result",
				text: JSON.stringify({ ...valid, summary }),
			},
		],
		fileScopes: { include: ["src"], exclude: [], write: ["src"] },
		cwd: "/workspace",
		persistTranscript,
	})

describe("ResultContract secret redaction", () => {
	it.each([
		["PEM private keys", "key=-----BEGIN RSA PRIVATE KEY-----\\nprivate-material\\n-----END RSA PRIVATE KEY-----"],
		["secret .env values", "DATABASE_PASSWORD=env-secret-value"],
		["JWTs", "token=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.signature-value"],
		["Bearer headers", "Authorization: Bearer bearer-secret-value"],
		["x-api-key query parameters", "https://example.test/callback?x-api-key=query-secret"],
		["api_key query parameters", "https://example.test/callback?api_key=another-secret"],
	])("redacts %s from result and raw transcript", (_name, secret) => {
		const output = extract(secret)

		expect(output.result.summary).not.toContain(secret)
		expect(output.result.summary).toContain("[REDACTED]")
		expect(output.rawTranscript).not.toContain(secret)
		expect(output.rawTranscript).toContain("[REDACTED]")
	})

	it("does not persist a raw transcript when persistence is disabled", () => {
		expect(extract("api_key=secret", false).rawTranscript).toBeUndefined()
	})
})
