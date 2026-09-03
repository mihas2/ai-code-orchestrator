// npx vitest run src/services/ripgrep/__tests__/index.spec.ts

import { getBinPath, truncateLine } from "../index"

describe("Ripgrep line truncation", () => {
	// The default MAX_LINE_LENGTH is 500 in the implementation
	const MAX_LINE_LENGTH = 500

	it("should truncate lines longer than MAX_LINE_LENGTH", () => {
		const longLine = "a".repeat(600) // Line longer than MAX_LINE_LENGTH
		const truncated = truncateLine(longLine)

		expect(truncated).toContain("[truncated...]")
		expect(truncated.length).toBeLessThan(longLine.length)
		expect(truncated.length).toEqual(MAX_LINE_LENGTH + " [truncated...]".length)
	})

	it("should not truncate lines shorter than MAX_LINE_LENGTH", () => {
		const shortLine = "Short line of text"
		const truncated = truncateLine(shortLine)

		expect(truncated).toEqual(shortLine)
		expect(truncated).not.toContain("[truncated...]")
	})

	it("should correctly truncate a line at exactly MAX_LINE_LENGTH characters", () => {
		const exactLine = "a".repeat(MAX_LINE_LENGTH)
		const exactPlusOne = exactLine + "x"

		// Should not truncate when exactly MAX_LINE_LENGTH
		expect(truncateLine(exactLine)).toEqual(exactLine)

		// Should truncate when exceeding MAX_LINE_LENGTH by even 1 character
		expect(truncateLine(exactPlusOne)).toContain("[truncated...]")
	})

	it("should handle empty lines without errors", () => {
		expect(truncateLine("")).toEqual("")
	})

	it("should allow custom maximum length", () => {
		const customLength = 100
		const line = "a".repeat(customLength + 50)

		const truncated = truncateLine(line, customLength)

		expect(truncated.length).toEqual(customLength + " [truncated...]".length)
		expect(truncated).toContain("[truncated...]")
	})
})

describe("Ripgrep binary resolution", () => {
	it("uses the package resolver before appRoot fallbacks", async () => {
		const resolved = await getBinPath(
			"/vscode",
			() => "/workspace/package/lib/index.js",
			(candidate) => candidate.endsWith("/bin/rg"),
		)
		expect(resolved).toBe("/workspace/package/bin/rg")
	})

	it("logs every checked path when no binary exists", async () => {
		const error = vi.spyOn(console, "error").mockImplementation(() => undefined)
		await getBinPath(
			"/vscode",
			() => {
				throw new Error("missing")
			},
			() => false,
		)
		expect(error).toHaveBeenCalledWith(expect.stringContaining("Checked paths:"))
		error.mockRestore()
	})
})
