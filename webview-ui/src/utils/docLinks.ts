/**
 * Links to the extension documentation.
 *
 * The docs are plain Markdown files kept in the repository under `apps/docs`
 * and read directly on GitHub — there is no separate docs site.
 */
const REPO_URL = "https://github.com/mihas2/ai-code-orchestrator"

/** Docs root (renders `apps/docs/README.md`). */
export const DOCS_URL = `${REPO_URL}/tree/main/apps/docs`

const DOCS_FILE_URL = `${REPO_URL}/blob/main/apps/docs`

/**
 * Build a link to a docs page.
 *
 * @param path Page path relative to `apps/docs`, without the `.md` extension,
 * optionally followed by `#anchor` (e.g. `"features/shell-integration#terminal-command-delay"`).
 * An empty path links to the docs root.
 */
export function buildDocLink(path = ""): string {
	const [page = "", anchor] = path.split("#", 2)
	const file = page.replace(/^\/+|\/+$/g, "").replace(/\.md$/, "")
	const hash = anchor ? `#${anchor}` : ""

	if (!file) {
		return hash ? `${DOCS_FILE_URL}/README.md${hash}` : DOCS_URL
	}

	return `${DOCS_FILE_URL}/${file}.md${hash}`
}
