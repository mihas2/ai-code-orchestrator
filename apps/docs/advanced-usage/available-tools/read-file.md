# read_file

The `read_file` tool reads the contents of one file in your project and returns it with line numbers, so AI Code Orchestrator can understand code, configuration, and documentation, and reference exact lines in later edits.

Each call reads exactly **one** file. When the model needs several files, it issues several `read_file` calls: one per response by default, or several in one response when **Enable parallel tool calls** is on in the provider profile's Advanced settings (see [Parallel Tool Calls](../../providers/openai-compatible.md#parallel-tool-calls)).

---

## Parameters

- `path` (required): Path to the file, relative to the workspace.
- `mode` (optional): `"slice"` (default) or `"indentation"`.
- `offset` (optional, slice mode): 1-based line to start reading from. Default: `1` (`0` is treated as not set).
- `limit` (optional, slice mode): Maximum number of lines to return. Default: `2000` (`0` is treated as not set).
- `indentation` (optional, indentation mode): Options object, ignored in slice mode:
    - `anchor_line`: 1-based line to anchor the extraction. Required for useful results — without it only the file header (imports) is returned.
    - `max_levels`: How many indentation levels above the anchor to include. Default: `0` (unlimited).
    - `include_siblings`: Include sibling blocks at the same indentation level. Default: `false`.
    - `include_header`: Include the file header (imports, module comments). Default: `true`.
    - `max_lines`: Hard cap on lines returned in indentation mode.

> [!NOTE]
> There are no `start_line`/`end_line` or multi-file `args` parameters. Use `offset` and `limit` for ranges, and separate calls for separate files.

---

## Reading Modes

### Slice mode (default)

Reads lines sequentially from `offset`, up to `limit` lines. Best for first exploration of a file, configuration and data files, or a known line range.

### Indentation mode

Extracts the complete code block (function, method, class) that contains `anchor_line`, based on the indentation hierarchy. Preferred when the model already has a line number — from search results, an error stack trace, or [`codebase_search`](codebase-search.md) — because it never cuts a function in the middle.

---

## Output and Limits

- Every line is prefixed with its line number (`12 | const x = 1`).
- At most `2000` lines are returned per call by default; lines longer than 2000 characters are truncated.
- **PDF and DOCX** files are returned as extracted text.
- **Images** (PNG, JPG, JPEG, GIF, BMP, SVG, WEBP, ICO, AVIF) are returned for visual analysis when the selected model supports images.
- Other binary files are reported as binary and their content is not returned.

---

## Access Control and Approval

- Files matched by [`.aicoignore`](../../features/aicoignore.md) are blocked.
- Reading requires your approval unless **Read files and directories** is enabled in [Auto-Approve](../../features/auto-approving-actions.md). Reading files outside the workspace is approved separately.

---

## Examples

Read the beginning of a file:

```json
{ "path": "src/app.js" }
```

Read 23 lines starting at line 46:

```json
{ "path": "src/app.js", "offset": 46, "limit": 23 }
```

Extract the whole function that contains line 42, including sibling methods:

```json
{
	"path": "src/services/user.ts",
	"mode": "indentation",
	"indentation": { "anchor_line": 42, "include_siblings": true }
}
```

---

## Related Tools

- [`search_files`](search-files.md) — find the lines to read
- [`codebase_search`](codebase-search.md) — semantic search that returns line numbers usable as `anchor_line`
- [`list_files`](list-files.md) — discover file paths
