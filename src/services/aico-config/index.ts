import * as path from "path"
import * as os from "os"
import fs from "fs/promises"

/**
 * Gets the global .ai-code-orchestrator directory path based on the current platform
 *
 * @returns The absolute path to the global .ai-code-orchestrator directory
 *
 * @example Platform-specific paths:
 * ```
 * // macOS/Linux: ~/.ai-code-orchestrator/
 * // Example: /Users/john/.ai-code-orchestrator
 *
 * // Windows: %USERPROFILE%\.ai-code-orchestrator\
 * // Example: C:\Users\john\.ai-code-orchestrator
 * ```
 *
 * @example Usage:
 * ```typescript
 * const globalDir = getGlobalAicoDirectory()
 * // Returns: "/Users/john/.ai-code-orchestrator" (on macOS/Linux)
 * // Returns: "C:\\Users\\john\\.ai-code-orchestrator" (on Windows)
 * ```
 */
export function getGlobalAicoDirectory(): string {
	const homeDir = os.homedir()
	return path.join(homeDir, ".ai-code-orchestrator")
}

/**
 * Gets the global .agents directory path based on the current platform.
 * This is a shared directory for agent skills across different AI coding tools.
 *
 * @returns The absolute path to the global .agents directory
 *
 * @example Platform-specific paths:
 * ```
 * // macOS/Linux: ~/.agents/
 * // Example: /Users/john/.agents
 *
 * // Windows: %USERPROFILE%\.agents\
 * // Example: C:\Users\john\.agents
 * ```
 *
 * @example Usage:
 * ```typescript
 * const globalAgentsDir = getGlobalAgentsDirectory()
 * // Returns: "/Users/john/.agents" (on macOS/Linux)
 * // Returns: "C:\\Users\\john\\.agents" (on Windows)
 * ```
 */
export function getGlobalAgentsDirectory(): string {
	const homeDir = os.homedir()
	return path.join(homeDir, ".agents")
}

/**
 * Gets the project-local .agents directory path for a given cwd.
 * This is a shared directory for agent skills across different AI coding tools.
 *
 * @param cwd - Current working directory (project path)
 * @returns The absolute path to the project-local .agents directory
 *
 * @example
 * ```typescript
 * const projectAgentsDir = getProjectAgentsDirectoryForCwd('/Users/john/my-project')
 * // Returns: "/Users/john/my-project/.agents"
 * ```
 */
export function getProjectAgentsDirectoryForCwd(cwd: string): string {
	return path.join(cwd, ".agents")
}

/**
 * Gets the project-local .ai-code-orchestrator directory path for a given cwd
 *
 * @param cwd - Current working directory (project path)
 * @returns The absolute path to the project-local .ai-code-orchestrator directory
 *
 * @example
 * ```typescript
 * const projectDir = getProjectAicoDirectoryForCwd('/Users/john/my-project')
 * // Returns: "/Users/john/my-project/.ai-code-orchestrator"
 *
 * const windowsProjectDir = getProjectAicoDirectoryForCwd('C:\\Users\\john\\my-project')
 * // Returns: "C:\\Users\\john\\my-project\\.ai-code-orchestrator"
 * ```
 *
 * @example Directory structure:
 * ```
 * /Users/john/my-project/
 * ├── .ai-code-orchestrator/                    # Project-local configuration directory
 * │   ├── rules/
 * │   │   └── rules.md
 * │   ├── custom-instructions.md
 * │   └── config/
 * │       └── settings.json
 * ├── src/
 * │   └── index.ts
 * └── package.json
 * ```
 */
export function getProjectAicoDirectoryForCwd(cwd: string): string {
	return path.join(cwd, ".ai-code-orchestrator")
}

/**
 * Checks if a directory exists
 */
export async function directoryExists(dirPath: string): Promise<boolean> {
	try {
		const stat = await fs.stat(dirPath)
		return stat.isDirectory()
	} catch (error: any) {
		// Only catch expected "not found" errors
		if (error.code === "ENOENT" || error.code === "ENOTDIR") {
			return false
		}
		// Re-throw unexpected errors (permission, I/O, etc.)
		throw error
	}
}

/**
 * Checks if a file exists
 */
export async function fileExists(filePath: string): Promise<boolean> {
	try {
		const stat = await fs.stat(filePath)
		return stat.isFile()
	} catch (error: any) {
		// Only catch expected "not found" errors
		if (error.code === "ENOENT" || error.code === "ENOTDIR") {
			return false
		}
		// Re-throw unexpected errors (permission, I/O, etc.)
		throw error
	}
}

/**
 * Reads a file safely, returning null if it doesn't exist
 */
export async function readFileIfExists(filePath: string): Promise<string | null> {
	try {
		return await fs.readFile(filePath, "utf-8")
	} catch (error: any) {
		// Only catch expected "not found" errors
		if (error.code === "ENOENT" || error.code === "ENOTDIR" || error.code === "EISDIR") {
			return null
		}
		// Re-throw unexpected errors (permission, I/O, etc.)
		throw error
	}
}

/**
 * Discovers all .ai-code-orchestrator directories in subdirectories of the workspace
 *
 * @param cwd - Current working directory (workspace root)
 * @returns Array of absolute paths to .ai-code-orchestrator directories found in subdirectories,
 *          sorted alphabetically. Does not include the root .ai-code-orchestrator directory.
 *
 * @example
 * ```typescript
 * const subfolderRoos = await discoverSubfolderAicoDirectories('/Users/john/monorepo')
 * // Returns:
 * // [
 * //   '/Users/john/monorepo/package-a/.ai-code-orchestrator',
 * //   '/Users/john/monorepo/package-b/.ai-code-orchestrator',
 * //   '/Users/john/monorepo/packages/shared/.ai-code-orchestrator'
 * // ]
 * ```
 *
 * @example Directory structure:
 * ```
 * /Users/john/monorepo/
 * ├── .ai-code-orchestrator/                    # Root .ai-code-orchestrator (NOT included - use getProjectAicoDirectoryForCwd)
 * ├── package-a/
 * │   └── .ai-code-orchestrator/                # Included
 * │       └── rules/
 * ├── package-b/
 * │   └── .ai-code-orchestrator/                # Included
 * │       └── rules-code/
 * └── packages/
 *     └── shared/
 *         └── .ai-code-orchestrator/            # Included (nested)
 *             └── rules/
 * ```
 */
export async function discoverSubfolderAicoDirectories(cwd: string): Promise<string[]> {
	try {
		// Dynamic import to avoid vscode dependency at module load time
		// This is necessary because file-search.ts imports vscode, which is not
		// available in the webview context
		const { executeRipgrep } = await import("../search/file-search")

		// Use ripgrep to find any file inside any .ai-code-orchestrator directory
		// This efficiently discovers all .ai-code-orchestrator folders regardless of their content
		const args = [
			"--files",
			"--hidden",
			"--follow",
			"-g",
			"**/.ai-code-orchestrator/**",
			"-g",
			"!node_modules/**",
			"-g",
			"!.git/**",
			cwd,
		]

		const results = await executeRipgrep({ args, workspacePath: cwd })

		// Extract unique .ai-code-orchestrator directory paths
		const aicoDirs = new Set<string>()
		const rootAicoDir = path.join(cwd, ".ai-code-orchestrator")

		for (const result of results) {
			// Match paths like "subfolder/.ai-code-orchestrator/anything" or "subfolder/nested/.ai-code-orchestrator/anything"
			// Handle both forward slashes (Unix) and backslashes (Windows)
			const match = result.path.match(/^(.+?)[/\\]\.ai-code-orchestrator[/\\]/)
			if (match) {
				const aicoDir = path.join(cwd, match[1], ".ai-code-orchestrator")
				// Exclude the root .ai-code-orchestrator directory (already handled by getProjectAicoDirectoryForCwd)
				if (aicoDir !== rootAicoDir) {
					aicoDirs.add(aicoDir)
				}
			}
		}

		// Return sorted alphabetically
		return Array.from(aicoDirs).sort()
	} catch (error) {
		// If discovery fails (e.g., ripgrep not available), return empty array
		return []
	}
}

/**
 * Gets the ordered list of .ai-code-orchestrator directories to check (global first, then project-local)
 *
 * @param cwd - Current working directory (project path)
 * @returns Array of directory paths to check in order [global, project-local]
 *
 * @example
 * ```typescript
 * // For a project at /Users/john/my-project
 * const directories = getAicoDirectoriesForCwd('/Users/john/my-project')
 * // Returns:
 * // [
 * //   '/Users/john/.ai-code-orchestrator',           // Global directory
 * //   '/Users/john/my-project/.ai-code-orchestrator' // Project-local directory
 * // ]
 * ```
 *
 * @example Directory structure:
 * ```
 * /Users/john/
 * ├── .ai-code-orchestrator/                    # Global configuration
 * │   ├── rules/
 * │   │   └── rules.md
 * │   └── custom-instructions.md
 * └── my-project/
 *     ├── .ai-code-orchestrator/                # Project-specific configuration
 *     │   ├── rules/
 *     │   │   └── rules.md     # Overrides global rules
 *     │   └── project-notes.md
 *     └── src/
 *         └── index.ts
 * ```
 */
export function getAicoDirectoriesForCwd(cwd: string): string[] {
	const directories: string[] = []

	// Add global directory first
	directories.push(getGlobalAicoDirectory())

	// Add project-local directory second
	directories.push(getProjectAicoDirectoryForCwd(cwd))

	return directories
}

/**
 * Gets the ordered list of all .ai-code-orchestrator directories including subdirectories
 *
 * @param cwd - Current working directory (project path)
 * @returns Array of directory paths in order: [global, project-local, ...subfolders (alphabetically)]
 *
 * @example
 * ```typescript
 * // For a monorepo at /Users/john/monorepo with .ai-code-orchestrator in subfolders
 * const directories = await getAllAicoDirectoriesForCwd('/Users/john/monorepo')
 * // Returns:
 * // [
 * //   '/Users/john/.ai-code-orchestrator',                    // Global directory
 * //   '/Users/john/monorepo/.ai-code-orchestrator',           // Project-local directory
 * //   '/Users/john/monorepo/package-a/.ai-code-orchestrator', // Subfolder (alphabetical)
 * //   '/Users/john/monorepo/package-b/.ai-code-orchestrator'  // Subfolder (alphabetical)
 * // ]
 * ```
 */
export async function getAllAicoDirectoriesForCwd(cwd: string): Promise<string[]> {
	const directories: string[] = []

	// Add global directory first
	directories.push(getGlobalAicoDirectory())

	// Add project-local directory second
	directories.push(getProjectAicoDirectoryForCwd(cwd))

	// Discover and add subfolder .ai-code-orchestrator directories
	const subfolderDirs = await discoverSubfolderAicoDirectories(cwd)
	directories.push(...subfolderDirs)

	return directories
}

/**
 * Gets parent directories containing .ai-code-orchestrator folders, in order from root to subfolders
 *
 * @param cwd - Current working directory (project path)
 * @returns Array of parent directory paths (not .ai-code-orchestrator paths) containing AGENTS.md or .ai-code-orchestrator
 *
 * @example
 * ```typescript
 * const dirs = await getAgentsDirectoriesForCwd('/Users/john/monorepo')
 * // Returns: ['/Users/john/monorepo', '/Users/john/monorepo/package-a', ...]
 * ```
 */
export async function getAgentsDirectoriesForCwd(cwd: string): Promise<string[]> {
	const directories: string[] = []

	// Always include the root directory
	directories.push(cwd)

	// Get all subfolder .ai-code-orchestrator directories
	const subfolderAicoDirs = await discoverSubfolderAicoDirectories(cwd)

	// Extract parent directories (remove .ai-code-orchestrator from path)
	for (const aicoDir of subfolderAicoDirs) {
		const parentDir = path.dirname(aicoDir)
		directories.push(parentDir)
	}

	return directories
}

/**
 * Loads configuration from multiple .ai-code-orchestrator directories with project overriding global
 *
 * @param relativePath - The relative path within each .ai-code-orchestrator directory (e.g., 'rules/rules.md')
 * @param cwd - Current working directory (project path)
 * @returns Object with global and project content, plus merged content
 *
 * @example
 * ```typescript
 * // Load rules configuration for a project
 * const config = await loadConfiguration('rules/rules.md', '/Users/john/my-project')
 *
 * // Returns:
 * // {
 * //   global: "Global rules content...",     // From ~/.ai-code-orchestrator/rules/rules.md
 * //   project: "Project rules content...",   // From /Users/john/my-project/.ai-code-orchestrator/rules/rules.md
 * //   merged: "Global rules content...\n\n# Project-specific rules (override global):\n\nProject rules content..."
 * // }
 * ```
 *
 * @example File paths resolved:
 * ```
 * relativePath: 'rules/rules.md'
 * cwd: '/Users/john/my-project'
 *
 * Reads from:
 * - Global: /Users/john/.ai-code-orchestrator/rules/rules.md
 * - Project: /Users/john/my-project/.ai-code-orchestrator/rules/rules.md
 *
 * Other common relativePath examples:
 * - 'custom-instructions.md'
 * - 'config/settings.json'
 * - 'templates/component.tsx'
 * ```
 *
 * @example Merging behavior:
 * ```
 * // If only global exists:
 * { global: "content", project: null, merged: "content" }
 *
 * // If only project exists:
 * { global: null, project: "content", merged: "content" }
 *
 * // If both exist:
 * {
 *   global: "global content",
 *   project: "project content",
 *   merged: "global content\n\n# Project-specific rules (override global):\n\nproject content"
 * }
 * ```
 */
export async function loadConfiguration(
	relativePath: string,
	cwd: string,
): Promise<{
	global: string | null
	project: string | null
	merged: string
}> {
	const globalDir = getGlobalAicoDirectory()
	const projectDir = getProjectAicoDirectoryForCwd(cwd)

	const globalFilePath = path.join(globalDir, relativePath)
	const projectFilePath = path.join(projectDir, relativePath)

	// Read global configuration
	const globalContent = await readFileIfExists(globalFilePath)

	// Read project-local configuration
	const projectContent = await readFileIfExists(projectFilePath)

	// Merge configurations - project overrides global
	let merged = ""

	if (globalContent) {
		merged += globalContent
	}

	if (projectContent) {
		if (merged) {
			merged += "\n\n# Project-specific rules (override global):\n\n"
		}
		merged += projectContent
	}

	return {
		global: globalContent,
		project: projectContent,
		merged: merged || "",
	}
}

// Export with backward compatibility alias
export const loadAicoConfiguration: typeof loadConfiguration = loadConfiguration
