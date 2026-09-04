import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const REPOSITORY_ROOT = path.resolve(__dirname, "../..")
const PRODUCTION_ROOTS = ["src", "packages", "webview-ui", "apps"]
const FORBIDDEN_MODEL_PATTERN = /gemini-3\.7(?:-flash)?/i
const SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx"])

function isProductionSource(filePath: string): boolean {
	const normalized = filePath.split(path.sep).join("/")
	const fileName = path.basename(filePath)

	return (
		SOURCE_EXTENSIONS.has(path.extname(filePath)) &&
		!normalized.includes("/__tests__/") &&
		!/(?:^|\/)(?:mock|mocks)(?:\/|$)/i.test(normalized) &&
		!/(?:\.spec|\.test)\.[^.]+$/i.test(fileName)
	)
}

function collectProductionFiles(directory: string): string[] {
	return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const entryPath = path.join(directory, entry.name)
		if (entry.isDirectory()) {
			if (["node_modules", "dist", "out", ".turbo"].includes(entry.name)) return []
			return collectProductionFiles(entryPath)
		}
		return isProductionSource(entryPath) ? [entryPath] : []
	})
}

function findForbiddenModelReferences(text: string): number[] {
	return [...text.matchAll(new RegExp(FORBIDDEN_MODEL_PATTERN.source, "gi"))].map((match) => match.index ?? -1)
}

describe("production model hardcode guard", () => {
	it("does not contain the retired Gemini 3.7 model in production sources", () => {
		const matches = PRODUCTION_ROOTS.flatMap((root) =>
			collectProductionFiles(path.join(REPOSITORY_ROOT, root)).flatMap((filePath) => {
				const indexes = findForbiddenModelReferences(fs.readFileSync(filePath, "utf8"))
				return indexes.map((index) => `${path.relative(REPOSITORY_ROOT, filePath)}:${index + 1}`)
			}),
		)

		expect(matches, `Forbidden model reference(s): ${matches.join(", ")}`).toEqual([])
	})

	it("detects forbidden model references in an artificial sample", () => {
		const artificialSample = ["gemini-3", ".7-flash"].join("")

		expect(findForbiddenModelReferences(artificialSample)).toHaveLength(1)
		expect(findForbiddenModelReferences("gemini-3.7-preview")).toHaveLength(1)
	})
})
