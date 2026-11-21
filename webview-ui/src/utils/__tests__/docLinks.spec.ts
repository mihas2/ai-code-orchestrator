import { buildDocLink, DOCS_URL } from "../docLinks"

const FILE_URL = "https://github.com/mihas2/ai-code-orchestrator/blob/main/apps/docs"

describe("buildDocLink", () => {
	it("links to the docs root for an empty path", () => {
		expect(buildDocLink()).toBe(DOCS_URL)
		expect(buildDocLink("")).toBe("https://github.com/mihas2/ai-code-orchestrator/tree/main/apps/docs")
	})

	it("links to the Markdown file of a page", () => {
		expect(buildDocLink("features/checkpoints")).toBe(`${FILE_URL}/features/checkpoints.md`)
	})

	it("keeps the anchor after the file name", () => {
		expect(buildDocLink("features/shell-integration#terminal-command-delay")).toBe(
			`${FILE_URL}/features/shell-integration.md#terminal-command-delay`,
		)
	})

	it("tolerates leading/trailing slashes and an explicit .md extension", () => {
		expect(buildDocLink("/features/skills/")).toBe(`${FILE_URL}/features/skills.md`)
		expect(buildDocLink("features/skills.md")).toBe(`${FILE_URL}/features/skills.md`)
	})
})
