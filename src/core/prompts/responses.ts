import { Anthropic } from "@anthropic-ai/sdk"
import * as path from "path"
import * as diff from "diff"
import { AicoIgnoreController, LOCK_TEXT_SYMBOL } from "../ignore/AicoIgnoreController"
import { AicoProtectedController } from "../protect/AicoProtectedController"

export const formatResponse = {
	toolDenied: () =>
		JSON.stringify({
			status: "denied",
			message: "The user denied this operation.",
		}),

	toolDeniedWithFeedback: (feedback?: string) =>
		JSON.stringify({
			status: "denied",
			feedback,
		}),

	toolApprovedWithFeedback: (feedback?: string) =>
		JSON.stringify({
			status: "approved",
			feedback,
		}),

	toolError: (error?: string) =>
		JSON.stringify({
			status: "error",
			message: "The tool execution failed",
			error,
		}),

	aicoIgnoreError: (path: string) =>
		JSON.stringify({
			status: "error",
			type: "access_denied",
			message: "Access blocked by .aicoignore",
			path,
			suggestion: "Try to continue without this file, or ask the user to update the .aicoignore file",
		}),

	noToolsUsed: () => {
		const instructions = getToolInstructionsReminder()

		return `[ERROR] Your previous assistant response contained text/reasoning but no native tool call. Retry now and emit a tool call as the entire assistant action; do not explain the retry in prose.

${instructions}

# Choose the required tool now
- If the user's task is complete, call attempt_completion and put the final result in its parameters.
- If essential information is missing, call ask_followup_question and put the question and 2-4 actionable options in its parameters.
- Otherwise, call the most relevant inspection or execution tool for the next concrete step.

This is an automated message. Do not respond conversationally or return another text-only answer.`
	},

	tooManyMistakes: (feedback?: string) =>
		JSON.stringify({
			status: "guidance",
			feedback,
		}),

	missingToolParameterError: (paramName: string) => {
		const instructions = getToolInstructionsReminder()

		return `Missing value for required parameter '${paramName}'. Please retry with complete response.\n\n${instructions}`
	},

	invalidMcpToolArgumentError: (serverName: string, toolName: string) =>
		JSON.stringify({
			status: "error",
			type: "invalid_argument",
			message: "Invalid JSON argument",
			server: serverName,
			tool: toolName,
			suggestion: "Please retry with a properly formatted JSON argument",
		}),

	unknownMcpToolError: (serverName: string, toolName: string, availableTools: string[]) =>
		JSON.stringify({
			status: "error",
			type: "unknown_tool",
			message: "Tool does not exist on server",
			server: serverName,
			tool: toolName,
			available_tools: availableTools.length > 0 ? availableTools : [],
			suggestion: "Please use one of the available tools or check if the server is properly configured",
		}),

	unknownMcpServerError: (serverName: string, availableServers: string[]) =>
		JSON.stringify({
			status: "error",
			type: "unknown_server",
			message: "Server is not configured",
			server: serverName,
			available_servers: availableServers.length > 0 ? availableServers : [],
		}),

	toolResult: (
		text: string,
		images?: string[],
	): string | Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam> => {
		if (images && images.length > 0) {
			const textBlock: Anthropic.TextBlockParam = { type: "text", text }
			const imageBlocks: Anthropic.ImageBlockParam[] = formatImagesIntoBlocks(images)
			// Placing images after text leads to better results
			return [textBlock, ...imageBlocks]
		} else {
			return text
		}
	},

	imageBlocks: (images?: string[]): Anthropic.ImageBlockParam[] => {
		return formatImagesIntoBlocks(images)
	},

	formatFilesList: (
		absolutePath: string,
		files: string[],
		didHitLimit: boolean,
		aicoIgnoreController: AicoIgnoreController | undefined,
		showAicoIgnoredFiles: boolean,
		aicoProtectedController?: AicoProtectedController,
	): string => {
		const sorted = files
			.map((file) => {
				// convert absolute path to relative path
				const relativePath = path.relative(absolutePath, file).toPosix()
				return file.endsWith("/") ? relativePath + "/" : relativePath
			})
			// Sort so files are listed under their respective directories to make it clear what files are children of what directories. Since we build file list top down, even if file list is truncated it will show directories that cline can then explore further.
			.sort((a, b) => {
				const aParts = a.split("/") // only works if we use toPosix first
				const bParts = b.split("/")
				for (let i = 0; i < Math.min(aParts.length, bParts.length); i++) {
					if (aParts[i] !== bParts[i]) {
						// If one is a directory and the other isn't at this level, sort the directory first
						if (i + 1 === aParts.length && i + 1 < bParts.length) {
							return -1
						}
						if (i + 1 === bParts.length && i + 1 < aParts.length) {
							return 1
						}
						// Otherwise, sort alphabetically
						return aParts[i].localeCompare(bParts[i], undefined, { numeric: true, sensitivity: "base" })
					}
				}
				// If all parts are the same up to the length of the shorter path,
				// the shorter one comes first
				return aParts.length - bParts.length
			})

		let aicoIgnoreParsed: string[] = sorted

		if (aicoIgnoreController) {
			aicoIgnoreParsed = []
			for (const filePath of sorted) {
				// path is relative to absolute path, not cwd
				// validateAccess expects either path relative to cwd or absolute path
				// otherwise, for validating against ignore patterns like "assets/icons", we would end up with just "icons", which would result in the path not being ignored.
				const absoluteFilePath = path.resolve(absolutePath, filePath)
				const isIgnored = !aicoIgnoreController.validateAccess(absoluteFilePath)

				if (isIgnored) {
					// If file is ignored and we're not showing ignored files, skip it
					if (!showAicoIgnoredFiles) {
						continue
					}
					// Otherwise, mark it with a lock symbol
					aicoIgnoreParsed.push(LOCK_TEXT_SYMBOL + " " + filePath)
				} else {
					// Check if file is write-protected (only for non-ignored files)
					const isWriteProtected = aicoProtectedController?.isWriteProtected(absoluteFilePath) || false
					if (isWriteProtected) {
						aicoIgnoreParsed.push("🛡️ " + filePath)
					} else {
						aicoIgnoreParsed.push(filePath)
					}
				}
			}
		}
		if (didHitLimit) {
			return `${aicoIgnoreParsed.join(
				"\n",
			)}\n\n(File list truncated. Use list_files on specific subdirectories if you need to explore further.)`
		} else if (aicoIgnoreParsed.length === 0 || (aicoIgnoreParsed.length === 1 && aicoIgnoreParsed[0] === "")) {
			return "No files found."
		} else {
			return aicoIgnoreParsed.join("\n")
		}
	},

	createPrettyPatch: (filename = "file", oldStr?: string, newStr?: string) => {
		// strings cannot be undefined or diff throws exception
		const patch = diff.createPatch(filename.toPosix(), oldStr || "", newStr || "", undefined, undefined, {
			context: 3,
		})
		const lines = patch.split("\n")
		const prettyPatchLines = lines.slice(4)
		return prettyPatchLines.join("\n")
	},
}

// to avoid circular dependency
const formatImagesIntoBlocks = (images?: string[]): Anthropic.ImageBlockParam[] => {
	return images
		? images.map((dataUrl) => {
				// data:image/png;base64,base64string
				const [rest, base64] = dataUrl.split(",")
				const mimeType = rest.split(":")[1].split(";")[0]
				return {
					type: "image",
					source: { type: "base64", media_type: mimeType, data: base64 },
				} as Anthropic.ImageBlockParam
			})
		: []
}

const toolUseInstructionsReminderNative = `# Reminder: Instructions for Tool Use

Tools are invoked using the platform's native tool calling mechanism. A valid assistant turn must contain a native tool call, not a prose description of a call and not hidden XML. Choose the tool that performs the next concrete action. Use attempt_completion only after the user's task is fully complete, and use ask_followup_question only when essential information is missing. Put reasoning or progress context in the selected tool's parameters when supported.

Always ensure you provide all required parameters for the tool you wish to use.`

/**
 * Gets the tool use instructions reminder.
 */
function getToolInstructionsReminder(): string {
	return toolUseInstructionsReminderNative
}
