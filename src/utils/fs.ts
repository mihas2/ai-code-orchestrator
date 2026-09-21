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

	// Timeout для обнаружения зависаний
	const timeoutId = setTimeout(() => {
		console.error(`[DIR_CREATE][${execId}] ⚠️ TIMEOUT WARNING: Function running for more than 5 seconds!`)
		console.error(`[DIR_CREATE][${execId}] This suggests a hang in fs operations`)
	}, 5000)

	try {
		console.log(`[DIR_CREATE][${execId}] Step 7a: About to create directories for filePath=${filePath}`)

		const newDirectories: string[] = []
		const normalizedFilePath = path.normalize(filePath) // Normalize path for cross-platform compatibility
		const directoryPath = path.dirname(normalizedFilePath)
		console.log(
			`[DIR_CREATE][${execId}] Step 7a.1: normalizedFilePath=${normalizedFilePath}, directoryPath=${directoryPath}`,
		)

		let currentPath = directoryPath
		const dirsToCreate: string[] = []

		// Traverse up the directory tree and collect missing directories
		console.log(`[DIR_CREATE][${execId}] Step 7a.2: Checking which directories need to be created`)

		console.log(`[DIR_CREATE][${execId}] Step 7a.3: Starting directory existence check loop`)
		console.log(
			`[DIR_CREATE][${execId}] Step 7a.3.data: directoryPath="${directoryPath}", starting currentPath="${currentPath}"`,
		)

		let loopIteration = 0
		while (true) {
			loopIteration++
			console.log(
				`[DIR_CREATE][${execId}] Step 7a.4.${loopIteration}: Loop iteration ${loopIteration}, checking path="${currentPath}"`,
			)
			console.log(
				`[DIR_CREATE][${execId}] Step 7a.4.${loopIteration}.before: About to call fileExistsAtPath("${currentPath}")`,
			)

			const exists = await fileExistsAtPath(currentPath, execId, loopIteration)

			console.log(`[DIR_CREATE][${execId}] Step 7a.4.${loopIteration}.after: fileExistsAtPath returned ${exists}`)

			if (exists) {
				console.log(`[DIR_CREATE][${execId}] Step 7a.4.${loopIteration}.exists: Path exists, breaking loop`)
				break
			}

			console.log(
				`[DIR_CREATE][${execId}] Step 7a.5.${loopIteration}: Directory does not exist, adding to list: "${currentPath}"`,
			)
			dirsToCreate.push(currentPath)
			console.log(
				`[DIR_CREATE][${execId}] Step 7a.5.${loopIteration}.added: dirsToCreate now has ${dirsToCreate.length} entries`,
			)

			const previousPath = currentPath
			currentPath = path.dirname(currentPath)
			console.log(
				`[DIR_CREATE][${execId}] Step 7a.5.${loopIteration}.next: Moving up from "${previousPath}" to "${currentPath}"`,
			)

			// Защита от бесконечного цикла
			if (previousPath === currentPath) {
				console.error(
					`[DIR_CREATE][${execId}] Step 7a.5.${loopIteration}.CRITICAL: Infinite loop detected! path.dirname returned same path`,
				)
				console.error(`[DIR_CREATE][${execId}] Breaking loop to prevent hang`)
				break
			}
		}

		console.log(
			`[DIR_CREATE][${execId}] Step 7a.6: Finished existence check, total directories to create: ${dirsToCreate.length}`,
		)
		console.log(`[DIR_CREATE][${execId}] Step 7a.6.list: ${JSON.stringify(dirsToCreate)}`)

		// Create directories from the topmost missing one down to the target directory
		for (let i = dirsToCreate.length - 1; i >= 0; i--) {
			console.log(
				`[DIR_CREATE][${execId}] Step 7a.7.${i}: Creating directory ${dirsToCreate.length - i}/${dirsToCreate.length}: "${dirsToCreate[i]}"`,
			)
			console.log(`[DIR_CREATE][${execId}] Step 7a.7.${i}.before: About to call fs.mkdir`)

			try {
				await fs.mkdir(dirsToCreate[i])
				console.log(`[DIR_CREATE][${execId}] Step 7a.7.${i}.after: fs.mkdir completed successfully`)
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

		console.log(
			`[DIR_CREATE][${execId}] Step 7b: All directories created successfully, total: ${newDirectories.length}`,
		)
		return newDirectories
	} catch (error) {
		const errorMsg = error instanceof Error ? error.message : String(error)
		const errorStack = error instanceof Error ? error.stack : "no stack"
		console.error(`[DIR_CREATE][${execId}] Step 7a.CRITICAL_ERROR: ${errorMsg}`)
		console.error(`[DIR_CREATE][${execId}] Step 7a.STACK: ${errorStack}`)
		throw error
	} finally {
		clearTimeout(timeoutId)
		console.log(`[DIR_CREATE][${execId}] Step 7c: Function completed, timeout cleared`)
	}
}

/**
 * Checks if a file or directory exists at the given path.
 *
 * @param filePath - The path to check.
 * @returns A promise that resolves to true if a file or directory exists at the path, false otherwise.
 */
export async function fileExistsAtPath(filePath: string, execId?: string, iteration?: number): Promise<boolean> {
	const logPrefix = execId ? `[FILE_EXISTS][${execId}]${iteration ? `.${iteration}` : ""}` : "[FILE_EXISTS]"

	console.log(`${logPrefix} Checking path: "${filePath}"`)
	console.log(`${logPrefix} Before fs.stat call`)

	try {
		const stats = await fs.stat(filePath)
		console.log(
			`${logPrefix} After fs.stat, got stats: isFile=${stats.isFile()}, isDirectory=${stats.isDirectory()}`,
		)
		const result = stats.isFile() || stats.isDirectory()
		console.log(`${logPrefix} Returning: ${result}`)
		return result
	} catch (error) {
		const errorMsg = error instanceof Error ? error.message : String(error)
		console.log(`${logPrefix} fs.stat threw error: ${errorMsg}`)
		console.log(`${logPrefix} Returning: false`)
		return false
	}
}
