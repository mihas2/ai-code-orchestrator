import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync, rmSync } from "fs"
import os from "os"
import path from "path"
import { afterEach, describe, expect, it } from "vitest"

import { extractResultContract } from "../resultContract"

const tempDirectories: string[] = []

const valid = {
	contractVersion: 1 as const,
	status: "completed" as const,
	summary: "Scope test",
	filesRead: ["src/a/generated.ts"],
	filesChanged: ["src/a/generated.ts"],
	artifactRefs: [],
	tests: [],
	assumptions: [],
	risks: [],
	openQuestions: [],
	nextActions: [],
}

const extract = (cwd: string, result: typeof valid, include: string[], write = include) =>
	extractResultContract({
		completionMessages: [{ type: "ask", ask: "completion_result", text: JSON.stringify(result) }],
		fileScopes: { include, exclude: [], write },
		cwd,
		persistTranscript: false,
	})

afterEach(() => {
	for (const directory of tempDirectories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe("ResultContract scope enforcement", () => {
	it("uses glob semantics instead of treating ** as a directory prefix", () => {
		expect(() =>
			extract("/workspace", { ...valid, filesRead: ["src/private/secret.ts"] }, ["src/**/generated.ts"]),
		).toThrow("scope_violation")
		expect(extract("/workspace", valid, ["src/**/generated.ts"]).result.filesRead).toEqual(["src/a/generated.ts"])
	})

	it("rejects a path whose realpath escapes the workspace through a symlink", () => {
		const cwd = mkdtempSync(path.join(os.tmpdir(), "result-contract-scope-"))
		tempDirectories.push(cwd)
		const outside = mkdtempSync(path.join(os.tmpdir(), "result-contract-outside-"))
		tempDirectories.push(outside)
		mkdirSync(path.join(cwd, "src"))
		writeFileSync(path.join(outside, "secret.ts"), "secret")
		symlinkSync(outside, path.join(cwd, "src", "linked"), "junction")

		expect(() => extract(cwd, { ...valid, filesRead: ["src/linked/secret.ts"] }, ["."])).toThrow("scope_violation")
	})

	it("handles workspace root, nesting, and traversal boundaries", () => {
		const cwd = mkdtempSync(path.join(os.tmpdir(), "result-contract-scope-"))
		tempDirectories.push(cwd)
		mkdirSync(path.join(cwd, "src"))
		writeFileSync(path.join(cwd, "src", "file.ts"), "ok")

		expect(() => extract(cwd, { ...valid, filesRead: ["."] }, ["."])).toThrow("scope_violation")
		expect(extract(cwd, { ...valid, filesRead: ["src/file.ts"] }, ["."]).result.filesRead).toEqual(["src/file.ts"])
		expect(() => extract(cwd, { ...valid, filesRead: ["../outside.ts"] }, ["."])).toThrow("scope_violation")
	})
})
