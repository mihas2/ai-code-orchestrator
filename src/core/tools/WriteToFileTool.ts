import path from "path"
import delay from "delay"
import fs from "fs/promises"

import { type ClineSayTool, DEFAULT_WRITE_DELAY_MS } from "@ai-code-orchestrator/types"

import { Task } from "../task/Task"
import { formatResponse } from "../prompts/responses"
import { RecordSource } from "../context-tracking/FileContextTrackerTypes"
import { fileExistsAtPath, createDirectoriesForFile } from "../../utils/fs"
import { stripLineNumbers, everyLineHasLineNumbers } from "../../integrations/misc/extract-text"
import { getReadablePath } from "../../utils/path"
import { isPathOutsideWorkspace } from "../../utils/pathUtils"
import { unescapeHtmlEntities } from "../../utils/text-normalization"
import { EXPERIMENT_IDS, experiments } from "../../shared/experiments"
import { convertNewFileToUnifiedDiff, computeDiffStats, sanitizeUnifiedDiff } from "../diff/stats"
import type { ToolUse } from "../../shared/tools"

import { BaseTool, ToolCallbacks } from "./BaseTool"

interface WriteToFileParams {
	path: string
	content: string
}

export class WriteToFileTool extends BaseTool<"write_to_file"> {
	readonly name = "write_to_file" as const

	async execute(params: WriteToFileParams, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const execId = Math.random().toString(36).substr(2, 6)
		console.log(`[WRITE_TIMING][${execId}] WriteToFileTool.execute START for path=${params.path}`)
		console.log(`[WRITE_STEP][${execId}] Step 1: Method entry, extracting callbacks`)
		const startTime = Date.now()

		const { pushToolResult, handleError, askApproval } = callbacks
		console.log(`[WRITE_STEP][${execId}] Step 2: Callbacks extracted, validating params path=${params.path}`)
		const relPath = params.path
		let newContent = params.content

		if (!relPath) {
			task.consecutiveMistakeCount++
			task.recordToolError("write_to_file")
			pushToolResult(await task.sayAndCreateMissingParamError("write_to_file", "path"))
			await task.diffViewProvider.reset()
			return
		}

		if (newContent === undefined) {
			task.consecutiveMistakeCount++
			task.recordToolError("write_to_file")
			pushToolResult(await task.sayAndCreateMissingParamError("write_to_file", "content"))
			await task.diffViewProvider.reset()
			return
		}

		console.log(`[WRITE_STEP][${execId}] Step 3: Params validated, checking access path=${relPath}`)
		const accessAllowed = task.aicoIgnoreController?.validateAccess(relPath)

		if (!accessAllowed) {
			await task.say("aicoignore_error", relPath)
			pushToolResult(formatResponse.aicoIgnoreError(relPath))
			return
		}

		console.log(`[WRITE_STEP][${execId}] Step 4: Access allowed, checking write protection`)
		const isWriteProtected = task.aicoProtectedController?.isWriteProtected(relPath) || false

		let fileExists: boolean
		const absolutePath = path.resolve(task.cwd, relPath)
		console.log(`[WRITE_STEP][${execId}] Step 5: Checking file existence for path=${absolutePath}`)

		if (task.diffViewProvider.editType !== undefined) {
			fileExists = task.diffViewProvider.editType === "modify"
		} else {
			fileExists = await fileExistsAtPath(absolutePath)
			task.diffViewProvider.editType = fileExists ? "modify" : "create"
		}
		console.log(
			`[WRITE_STEP][${execId}] Step 6: File exists=${fileExists}, editType=${task.diffViewProvider.editType}`,
		)

		// Create parent directories early for new files to prevent ENOENT errors
		// in subsequent operations (e.g., diffViewProvider.open, fs.readFile)
		if (!fileExists) {
			console.log(`[WRITE_STEP][${execId}] Step 7: Creating parent directories for new file path=${absolutePath}`)
			console.log(`[WRITE_STEP][${execId}] Step 7c: About to call createDirectoriesForFile`)
			const dirCreateStart = Date.now()
			await createDirectoriesForFile(absolutePath)
			console.log(
				`[WRITE_STEP][${execId}] Step 7c: createDirectoriesForFile completed in ${Date.now() - dirCreateStart}ms`,
			)
			console.log(`[WRITE_STEP][${execId}] Step 8: Parent directories created, moving to file content handling`)
		}

		console.log(`[WRITE_STEP][${execId}] Step 9: Processing content (length=${newContent.length})`)
		if (newContent.startsWith("```")) {
			newContent = newContent.split("\n").slice(1).join("\n")
		}

		if (newContent.endsWith("```")) {
			newContent = newContent.split("\n").slice(0, -1).join("\n")
		}

		if (!task.api.getModel().id.includes("claude")) {
			newContent = unescapeHtmlEntities(newContent)
		}
		console.log(`[WRITE_STEP][${execId}] Step 10: Content processed`)

		const fullPath = relPath ? path.resolve(task.cwd, relPath) : ""
		const isOutsideWorkspace = isPathOutsideWorkspace(fullPath)

		const sharedMessageProps: ClineSayTool = {
			tool: fileExists ? "editedExistingFile" : "newFileCreated",
			path: getReadablePath(task.cwd, relPath),
			content: newContent,
			isOutsideWorkspace,
			isProtected: isWriteProtected,
		}

		try {
			console.log(`[WRITE_STEP][${execId}] Step 11: Entering try block, getting provider state`)
			task.consecutiveMistakeCount = 0

			const provider = task.providerRef.deref()
			const state = await provider?.getState()
			console.log(`[WRITE_STEP][${execId}] Step 12: Provider state retrieved`)
			const diagnosticsEnabled = state?.diagnosticsEnabled ?? true
			const writeDelayMs = state?.writeDelayMs ?? DEFAULT_WRITE_DELAY_MS
			const isPreventFocusDisruptionEnabled = experiments.isEnabled(
				state?.experiments ?? {},
				EXPERIMENT_IDS.PREVENT_FOCUS_DISRUPTION,
			)

			console.log(
				`[WRITE_STEP][${execId}] Step 13: isPreventFocusDisruptionEnabled=${isPreventFocusDisruptionEnabled}`,
			)
			if (isPreventFocusDisruptionEnabled) {
				console.log(`[WRITE_TOOL_DEBUG][${execId}] Step 1: About to call askApproval`)
				console.log(
					`[WRITE_TOOL_DEBUG][${execId}] - isPreventFocusDisruptionEnabled=${isPreventFocusDisruptionEnabled}`,
				)
				console.log(`[WRITE_TOOL_DEBUG][${execId}] - isWriteProtected=${isWriteProtected}`)
				console.log(`[WRITE_TOOL_DEBUG][${execId}] - fileExists=${fileExists}`)

				console.log(`[WRITE_STEP][${execId}] Step 14: Reading original content for diff`)
				task.diffViewProvider.editType = fileExists ? "modify" : "create"
				if (fileExists) {
					const absolutePath = path.resolve(task.cwd, relPath)
					task.diffViewProvider.originalContent = await fs.readFile(absolutePath, "utf-8")
				} else {
					task.diffViewProvider.originalContent = ""
				}
				console.log(`[WRITE_STEP][${execId}] Step 15: Original content read, creating diff`)

				let unified = fileExists
					? formatResponse.createPrettyPatch(relPath, task.diffViewProvider.originalContent, newContent)
					: convertNewFileToUnifiedDiff(newContent, relPath)
				unified = sanitizeUnifiedDiff(unified)
				console.log(`[WRITE_STEP][${execId}] Step 16: Diff created, preparing approval message`)
				const completeMessage = JSON.stringify({
					...sharedMessageProps,
					content: unified,
					diffStats: computeDiffStats(unified) || undefined,
				} satisfies ClineSayTool)

				console.log(
					`[WRITE_TIMING][${execId}] About to call askApproval (elapsed: ${Date.now() - startTime}ms)`,
				)
				console.log(`[WRITE_STEP][${execId}] Step 17: CALLING askApproval - THIS IS WHERE HANG MAY OCCUR`)
				const approvalStart = Date.now()
				console.log(
					`[WRITE_TOOL_DEBUG][${execId}] Calling askApproval with type="tool", isProtected=${isWriteProtected}`,
				)
				const didApprove = await askApproval("tool", completeMessage, undefined, isWriteProtected)
				console.log(`[WRITE_STEP][${execId}] Step 18: askApproval RETURNED didApprove=${didApprove}`)
				console.log(
					`[WRITE_TIMING][${execId}] askApproval completed in ${Date.now() - approvalStart}ms, result=${didApprove}`,
				)
				console.log(`[WRITE_TOOL_DEBUG][${execId}] Step 2: askApproval completed, didApprove=${didApprove}`)

				if (!didApprove) {
					console.log(
						`[WRITE_TIMING][${execId}] WriteToFileTool.execute ABORTED (not approved) after ${Date.now() - startTime}ms`,
					)
					return
				}

				console.log(`[WRITE_STEP][${execId}] Step 19: Approval granted, calling saveDirectly`)
				console.log(
					`[WRITE_TIMING][${execId}] About to call saveDirectly (elapsed: ${Date.now() - startTime}ms)`,
				)
				const saveStart = Date.now()
				await task.diffViewProvider.saveDirectly(relPath, newContent, false, diagnosticsEnabled, writeDelayMs)
				console.log(`[WRITE_STEP][${execId}] Step 20: saveDirectly completed`)
				console.log(`[WRITE_TIMING][${execId}] saveDirectly completed in ${Date.now() - saveStart}ms`)
			} else {
				console.log(`[WRITE_STEP][${execId}] Step 14alt: Using alternative path (focus disruption disabled)`)
				if (!task.diffViewProvider.isEditing) {
					console.log(`[WRITE_STEP][${execId}] Step 15alt: Opening diff view`)
					const partialMessage = JSON.stringify(sharedMessageProps)
					await task.ask("tool", partialMessage, true).catch(() => {})
					await task.diffViewProvider.open(relPath)
					console.log(`[WRITE_STEP][${execId}] Step 16alt: Diff view opened`)
				}

				console.log(`[WRITE_STEP][${execId}] Step 17alt: Updating diff view`)
				await task.diffViewProvider.update(
					everyLineHasLineNumbers(newContent) ? stripLineNumbers(newContent) : newContent,
					true,
				)
				console.log(`[WRITE_STEP][${execId}] Step 18alt: Diff view updated, waiting 300ms`)

				await delay(300)
				task.diffViewProvider.scrollToFirstDiff()
				console.log(`[WRITE_STEP][${execId}] Step 19alt: Creating diff for approval`)

				let unified = fileExists
					? formatResponse.createPrettyPatch(relPath, task.diffViewProvider.originalContent, newContent)
					: convertNewFileToUnifiedDiff(newContent, relPath)
				unified = sanitizeUnifiedDiff(unified)
				const completeMessage = JSON.stringify({
					...sharedMessageProps,
					content: unified,
					diffStats: computeDiffStats(unified) || undefined,
				} satisfies ClineSayTool)

				console.log(
					`[WRITE_TIMING][${execId}] About to call askApproval (elapsed: ${Date.now() - startTime}ms)`,
				)
				console.log(`[WRITE_TOOL_DEBUG][${execId}] Step 1 (alt path): About to call askApproval`)
				console.log(`[WRITE_STEP][${execId}] Step 20alt: CALLING askApproval - THIS IS WHERE HANG MAY OCCUR`)
				const approvalStart = Date.now()
				const didApprove = await askApproval("tool", completeMessage, undefined, isWriteProtected)
				console.log(`[WRITE_STEP][${execId}] Step 21alt: askApproval RETURNED didApprove=${didApprove}`)
				console.log(
					`[WRITE_TIMING][${execId}] askApproval completed in ${Date.now() - approvalStart}ms, result=${didApprove}`,
				)
				console.log(
					`[WRITE_TOOL_DEBUG][${execId}] Step 2 (alt path): askApproval completed, didApprove=${didApprove}`,
				)

				if (!didApprove) {
					console.log(
						`[WRITE_TIMING][${execId}] WriteToFileTool.execute ABORTED (not approved) after ${Date.now() - startTime}ms`,
					)
					await task.diffViewProvider.revertChanges()
					return
				}

				console.log(`[WRITE_STEP][${execId}] Step 22alt: Approval granted, calling saveChanges`)
				console.log(
					`[WRITE_TIMING][${execId}] About to call saveChanges (elapsed: ${Date.now() - startTime}ms)`,
				)
				const saveStart = Date.now()
				await task.diffViewProvider.saveChanges(diagnosticsEnabled, writeDelayMs)
				console.log(`[WRITE_STEP][${execId}] Step 23alt: saveChanges completed`)
				console.log(`[WRITE_TIMING][${execId}] saveChanges completed in ${Date.now() - saveStart}ms`)
			}

			console.log(`[WRITE_STEP][${execId}] Step 21: File saved, tracking context`)
			if (relPath) {
				await task.fileContextTracker.trackFileContext(relPath, "aico_edited" as RecordSource)
			}

			task.didEditFile = true
			console.log(`[WRITE_STEP][${execId}] Step 22: Context tracked, pushing tool result`)

			const message = await task.diffViewProvider.pushToolWriteResult(task, task.cwd, !fileExists)

			pushToolResult(message)
			console.log(`[WRITE_STEP][${execId}] Step 23: Tool result pushed, resetting state`)

			await task.diffViewProvider.reset()
			this.resetPartialState()

			task.processQueuedMessages()
			console.log(`[WRITE_STEP][${execId}] Step 24: State reset complete, processing queued messages`)

			const totalElapsed = Date.now() - startTime
			console.log(`[WRITE_TIMING][${execId}] WriteToFileTool.execute COMPLETED successfully in ${totalElapsed}ms`)
			console.log(`[WRITE_STEP][${execId}] Step 25: FINAL - Method returning successfully`)
			return
		} catch (error) {
			const totalElapsed = Date.now() - startTime
			console.log(
				`[WRITE_TIMING][${execId}] WriteToFileTool.execute ERROR after ${totalElapsed}ms: ${error.message}`,
			)
			await handleError("writing file", error as Error)
			await task.diffViewProvider.reset()
			this.resetPartialState()
			return
		}
	}

	override async handlePartial(task: Task, block: ToolUse<"write_to_file">): Promise<void> {
		const relPath: string | undefined = block.params.path
		let newContent: string | undefined = block.params.content

		if (!relPath || newContent === undefined) {
			return
		}

		const provider = task.providerRef.deref()
		const state = await provider?.getState()
		const isPreventFocusDisruptionEnabled = experiments.isEnabled(
			state?.experiments ?? {},
			EXPERIMENT_IDS.PREVENT_FOCUS_DISRUPTION,
		)

		// relPath is guaranteed non-null after hasPathStabilized
		let fileExists: boolean
		const absolutePath = path.resolve(task.cwd, relPath!)

		if (task.diffViewProvider.editType !== undefined) {
			fileExists = task.diffViewProvider.editType === "modify"
		} else {
			fileExists = await fileExistsAtPath(absolutePath)
			task.diffViewProvider.editType = fileExists ? "modify" : "create"
		}

		// Create parent directories early for new files to prevent ENOENT errors
		// in subsequent operations (e.g., diffViewProvider.open)
		if (!fileExists) {
			await createDirectoriesForFile(absolutePath)
		}

		const isWriteProtected = task.aicoProtectedController?.isWriteProtected(relPath!) || false
		const isOutsideWorkspace = isPathOutsideWorkspace(absolutePath)

		const sharedMessageProps: ClineSayTool = {
			tool: fileExists ? "editedExistingFile" : "newFileCreated",
			path: getReadablePath(task.cwd, relPath!),
			content: newContent || "",
			isOutsideWorkspace,
			isProtected: isWriteProtected,
		}

		const toolProgressStatus = {
			icon: "pencil",
			text: `Writing ${newContent.length} chars`,
		}
		const partialMessage = JSON.stringify(sharedMessageProps)
		await task.ask("tool", partialMessage, block.partial, toolProgressStatus).catch(() => {})

		if (newContent && !isPreventFocusDisruptionEnabled) {
			if (!task.diffViewProvider.isEditing) {
				await task.diffViewProvider.open(relPath!)
			}

			await task.diffViewProvider.update(
				everyLineHasLineNumbers(newContent) ? stripLineNumbers(newContent) : newContent,
				false,
			)
		}
	}
}

export const writeToFileTool = new WriteToFileTool()
