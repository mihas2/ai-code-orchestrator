import fs from "fs/promises"
import * as path from "path"

/**
 * Asynchronously creates all non-existing subdirectories for a given file path
 * and collects them in an array for later deletion.
 *
 * @param filePath - The full path to a file.
 * @returns A promise that resolves to an array of newly created directories.
 */
export async function createDirectoriesForFile(filePath: string): Promise<string[]> {
	const execId = Math.random().toString(36).substr(2, 6)

	// Timeout to detect hangs
	const timeoutId = setTimeout(() => {
		console.error(`[DIR_CREATE][${execId}] ⚠️ TIMEOUT WARNING: Function running for more than 5 seconds!`)
		console.error(`[DIR_CREATE][${execId}] This suggests a hang in fs operations`)
	}, 5000)

	try {
		const newDirectories: string[] = []
		const normalizedFilePath = path.normalize(filePath) // Normalize path for cross-platform compatibility
		const directoryPath = path.dirname(normalizedFilePath)

		let currentPath = directoryPath
		const dirsToCreate: string[] = []

		// Traverse up the directory tree and collect missing directories
		let loopIteration = 0
		while (true) {
			loopIteration++

			const exists = await fileExistsAtPath(currentPath, execId, loopIteration)

			if (exists) {
				break
			}

			dirsToCreate.push(currentPath)

			const previousPath = currentPath
			currentPath = path.dirname(currentPath)

			// Protection against infinite loop
			if (previousPath === currentPath) {
				console.error(
					`[DIR_CREATE][${execId}] Step 7a.5.${loopIteration}.CRITICAL: Infinite loop detected! path.dirname returned same path`,
				)
				console.error(`[DIR_CREATE][${execId}] Breaking loop to prevent hang`)
				break
			}
		}

		// Create directories from the topmost missing one down to the target directory
		for (let i = dirsToCreate.length - 1; i >= 0; i--) {
			try {
				await fs.mkdir(dirsToCreate[i])
				newDirectories.push(dirsToCreate[i])
			} catch (error) {
				const errorMsg = error instanceof Error ? error.message : String(error)
				const errorStack = error instanceof Error ? error.stack : "no stack"
				console.error(
					`[DIR_CREATE][${execId}] Step 7a.7.${i}.ERROR: Failed to create directory ${dirsToCreate[i]}: ${errorMsg}`,
				)
				console.error(`[DIR_CREATE][${execId}] Step 7a.7.${i}.STACK: ${errorStack}`)
				throw error
			}
		}

		return newDirectories
	} catch (error) {
		const errorMsg = error instanceof Error ? error.message : String(error)
		const errorStack = error instanceof Error ? error.stack : "no stack"
		console.error(`[DIR_CREATE][${execId}] Step 7a.CRITICAL_ERROR: ${errorMsg}`)
		console.error(`[DIR_CREATE][${execId}] Step 7a.STACK: ${errorStack}`)
		throw error
	} finally {
		clearTimeout(timeoutId)
	}
}

/**
 * Checks if a file or directory exists at the given path.
 *
 * @param filePath - The path to check.
 * @returns A promise that resolves to true if a file or directory exists at the path, false otherwise.
 */
export async function fileExistsAtPath(filePath: string, execId?: string, iteration?: number): Promise<boolean> {
	try {
		const stats = await fs.stat(filePath)
		return stats.isFile() || stats.isDirectory()
	} catch (error) {
		return false
	}
}
