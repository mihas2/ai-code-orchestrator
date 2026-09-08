import { listFiles } from "../../glob/list-files"
import { Ignore } from "ignore"
import { AicoIgnoreController } from "../../../core/ignore/AicoIgnoreController"
import { stat } from "fs/promises"
import * as path from "path"
import { generateNormalizedAbsolutePath, generateRelativeFilePath } from "../shared/get-relative-path"
import { getWorkspacePathForContext } from "../../../utils/path"
import { scannerExtensions } from "../shared/supported-extensions"
import * as vscode from "vscode"
import { CodeBlock, ICodeParser, IEmbedder, IVectorStore, IDirectoryScanner } from "../interfaces"
import { createHash } from "crypto"
import { v5 as uuidv5 } from "uuid"
import pLimit from "p-limit"
import { Mutex } from "async-mutex"
import { CacheManager } from "../cache-manager"
import { t } from "../../../i18n"
import {
	QDRANT_CODE_BLOCK_NAMESPACE,
	MAX_FILE_SIZE_BYTES,
	MAX_LIST_FILES_LIMIT_CODE_INDEX,
	BATCH_SEGMENT_THRESHOLD,
	PARSING_CONCURRENCY,
	BATCH_PROCESSING_CONCURRENCY,
	MAX_PENDING_BATCHES,
} from "../constants"
import { isPathInIgnoredDirectory } from "../../glob/ignore-utils"
import { retryIndexApiOperation } from "../shared/api-retry"
import { Package } from "../../../shared/package"

export class DirectoryScanner implements IDirectoryScanner {
	private readonly batchSegmentThreshold: number

	constructor(
		private readonly embedder: IEmbedder,
		private readonly qdrantClient: IVectorStore,
		private readonly codeParser: ICodeParser,
		private readonly cacheManager: CacheManager,
		private readonly ignoreInstance: Ignore,
		batchSegmentThreshold?: number,
	) {
		// Get the configurable batch size from VSCode settings, fallback to default
		// If not provided in constructor, try to get from VSCode settings
		if (batchSegmentThreshold !== undefined) {
			this.batchSegmentThreshold = batchSegmentThreshold
		} else {
			try {
				this.batchSegmentThreshold = vscode.workspace
					.getConfiguration(Package.name)
					.get<number>("codeIndex.embeddingBatchSize", BATCH_SEGMENT_THRESHOLD)
			} catch {
				// In test environment, vscode.workspace might not be available
				this.batchSegmentThreshold = BATCH_SEGMENT_THRESHOLD
			}
		}
	}

	/**
	 * Recursively scans a directory for code blocks in supported files.
	 * @param directoryPath The directory to scan
	 * @param aicoIgnoreController Optional AicoIgnoreController instance for filtering
	 * @param context VS Code ExtensionContext for cache storage
	 * @param onError Optional error handler callback
	 * @returns Promise<{codeBlocks: CodeBlock[], stats: {processed: number, skipped: number}}> Array of parsed code blocks and processing stats
	 */
	public async scanDirectory(
		directory: string,
		onError?: (error: Error) => void,
		onBlocksIndexed?: (indexedCount: number) => void,
		onFileParsed?: (fileBlockCount: number) => void,
		signal?: AbortSignal,
	): Promise<{ stats: { processed: number; skipped: number }; totalBlockCount: number }> {
		const directoryPath = directory
		// Capture workspace context at scan start
		const scanWorkspace = getWorkspacePathForContext(directoryPath)

		// Get all files recursively (handles .gitignore automatically)
		const [allPaths, _] = await listFiles(directoryPath, true, MAX_LIST_FILES_LIMIT_CODE_INDEX)

		// Filter out directories (marked with trailing '/')
		const filePaths = allPaths.filter((p) => !p.endsWith("/"))

		// Initialize AicoIgnoreController if not provided
		const ignoreController = new AicoIgnoreController(directoryPath)

		await ignoreController.initialize()

		// Filter paths using .aicoignore
		const allowedPaths = ignoreController.filterPaths(filePaths)

		// Filter by supported extensions, ignore patterns, and excluded directories
		const supportedPaths = allowedPaths.filter((filePath) => {
			const ext = path.extname(filePath).toLowerCase()
			const relativeFilePath = generateRelativeFilePath(filePath, scanWorkspace)

			// Check if file is in an ignored directory using the shared helper
			// Use relative path to avoid matching parent directories outside the workspace
			if (isPathInIgnoredDirectory(relativeFilePath)) {
				return false
			}

			return scannerExtensions.includes(ext) && !this.ignoreInstance.ignores(relativeFilePath)
		})

		// Initialize tracking variables
		const processedFiles = new Set<string>()
		let processedCount = 0
		let skippedCount = 0

		// Initialize parallel processing tools
		const parseLimiter = pLimit(PARSING_CONCURRENCY) // Concurrency for file parsing
		const batchLimiter = pLimit(BATCH_PROCESSING_CONCURRENCY) // Concurrency for batch processing
		const mutex = new Mutex()

		// Shared batch accumulators (protected by mutex)
		let currentBatchBlocks: CodeBlock[] = []
		let currentBatchTexts: string[] = []
		let currentBatchFileInfos: { filePath: string; fileHash: string; isNew: boolean }[] = []
		const activeBatchPromises = new Set<Promise<void>>()
		let pendingBatchCount = 0

		// Initialize block counter
		let totalBlockCount = 0

		// Process all files in parallel with concurrency control
		const parsePromises = supportedPaths.map((filePath) =>
			parseLimiter(async () => {
				// Check abort signal before processing each file
				if (signal?.aborted) return

				try {
					// Check file size
					const stats = await stat(filePath)
					if (stats.size > MAX_FILE_SIZE_BYTES) {
						skippedCount++ // Skip large files
						return
					}

					// Read file content
					const content = await vscode.workspace.fs
						.readFile(vscode.Uri.file(filePath))
						.then((buffer) => Buffer.from(buffer).toString("utf-8"))

					// Calculate current hash
					const currentFileHash = createHash("sha256").update(content).digest("hex")
					processedFiles.add(filePath)

					// Check against cache
					const cachedFileHash = this.cacheManager.getHash(filePath)
					const isNewFile = !cachedFileHash
					if (cachedFileHash === currentFileHash) {
						// File is unchanged
						skippedCount++
						return
					}

					// File is new or changed - parse it using the injected parser function
					const blocks = await this.codeParser.parseFile(filePath, { content, fileHash: currentFileHash })
					const fileBlockCount = blocks.length
					onFileParsed?.(fileBlockCount)
					processedCount++

					// Process embeddings if configured
					if (this.embedder && this.qdrantClient && blocks.length > 0) {
						// Add to batch accumulators
						let addedBlocksFromFile = false
						for (const block of blocks) {
							const trimmedContent = block.content.trim()
							if (trimmedContent) {
								const release = await mutex.acquire()
								try {
									currentBatchBlocks.push(block)
									currentBatchTexts.push(trimmedContent)
									addedBlocksFromFile = true

									// Check if batch threshold is met
									// Check abort signal before dispatching batch
									if (signal?.aborted) {
										throw new DOMException("Indexing aborted", "AbortError")
									}

									if (currentBatchBlocks.length >= this.batchSegmentThreshold) {
										// Wait if we've reached the maximum pending batches
										while (pendingBatchCount >= MAX_PENDING_BATCHES) {
											if (signal?.aborted) {
												throw new DOMException("Indexing aborted", "AbortError")
											}
											await Promise.race(activeBatchPromises)
										}

										// Copy current batch data and clear accumulators
										const batchBlocks = [...currentBatchBlocks]
										const batchTexts = [...currentBatchTexts]
										const batchFileInfos = [...currentBatchFileInfos]
										currentBatchBlocks = []
										currentBatchTexts = []
										currentBatchFileInfos = []

										// Increment pending batch count
										pendingBatchCount++

										// Queue batch processing
										const batchPromise = batchLimiter(() =>
											this.processBatch(
												batchBlocks,
												batchTexts,
												batchFileInfos,
												scanWorkspace,
												onError,
												onBlocksIndexed,
												signal,
											),
										)
										activeBatchPromises.add(batchPromise)

										// Clean up completed promises to prevent memory accumulation
										batchPromise.finally(() => {
											activeBatchPromises.delete(batchPromise)
											pendingBatchCount--
										})
									}
								} finally {
									release()
								}
							}
						}

						// Add file info once per file (outside the block loop)
						if (addedBlocksFromFile) {
							const release = await mutex.acquire()
							try {
								totalBlockCount += fileBlockCount
								currentBatchFileInfos.push({
									filePath,
									fileHash: currentFileHash,
									isNew: isNewFile,
								})
							} finally {
								release()
							}
						}
					} else {
						// Only update hash if not being processed in a batch
						await this.cacheManager.updateHash(filePath, currentFileHash)
					}
				} catch (error) {
					// Re-throw AbortError — it's not a file processing error, just a user-initiated stop
					if (error instanceof DOMException && error.name === "AbortError") {
						throw error
					}
					console.error(`Error processing file ${filePath} in workspace ${scanWorkspace}:`, error)
					if (onError) {
						onError(
							error instanceof Error
								? new Error(`${error.message} (Workspace: ${scanWorkspace}, File: ${filePath})`)
								: new Error(
										t("embeddings:scanner.unknownErrorProcessingFile", { filePath }) +
											` (Workspace: ${scanWorkspace})`,
									),
						)
					}
				}
			}),
		)

		// Wait for all parsing to complete
		await Promise.all(parsePromises)

		// Check abort signal before processing remaining batch
		if (signal?.aborted) {
			return {
				stats: {
					processed: processedCount,
					skipped: skippedCount,
				},
				totalBlockCount,
			}
		}

		// Process any remaining items in batch
		if (currentBatchBlocks.length > 0) {
			const release = await mutex.acquire()
			try {
				// Copy current batch data and clear accumulators
				const batchBlocks = [...currentBatchBlocks]
				const batchTexts = [...currentBatchTexts]
				const batchFileInfos = [...currentBatchFileInfos]
				currentBatchBlocks = []
				currentBatchTexts = []
				currentBatchFileInfos = []

				// Increment pending batch count for final batch
				pendingBatchCount++

				// Queue final batch processing
				const batchPromise = batchLimiter(() =>
					this.processBatch(
						batchBlocks,
						batchTexts,
						batchFileInfos,
						scanWorkspace,
						onError,
						onBlocksIndexed,
						signal,
					),
				)
				activeBatchPromises.add(batchPromise)

				// Clean up completed promises to prevent memory accumulation
				batchPromise.finally(() => {
					activeBatchPromises.delete(batchPromise)
					pendingBatchCount--
				})
			} finally {
				release()
			}
		}

		// Wait for all batch processing to complete
		await Promise.all(activeBatchPromises)

		// Check abort signal before handling deleted files
		if (signal?.aborted) {
			return {
				stats: {
					processed: processedCount,
					skipped: skippedCount,
				},
				totalBlockCount,
			}
		}

		// Handle deleted files
		const oldHashes = this.cacheManager.getAllHashes()
		for (const cachedFilePath of Object.keys(oldHashes)) {
			if (!processedFiles.has(cachedFilePath)) {
				// File was deleted or is no longer supported/indexed
				if (this.qdrantClient) {
					try {
						await this.qdrantClient.deletePointsByFilePath(cachedFilePath)
						await this.cacheManager.deleteHash(cachedFilePath)
					} catch (error: any) {
						const errorMessage = error instanceof Error ? error.message : String(error)

						console.error(
							`[DirectoryScanner] Failed to delete points for ${cachedFilePath} in workspace ${scanWorkspace}:`,
							error,
						)

						if (onError) {
							onError(
								error instanceof Error
									? new Error(
											`${error.message} (Workspace: ${scanWorkspace}, File: ${cachedFilePath})`,
										)
									: new Error(
											t("embeddings:scanner.unknownErrorDeletingPoints", {
												filePath: cachedFilePath,
											}) + ` (Workspace: ${scanWorkspace})`,
										),
							)
						}
						// Log error and continue processing instead of re-throwing
						console.error(`Failed to delete points for removed file: ${cachedFilePath}`, errorMessage)
					}
				}
			}
		}

		return {
			stats: {
				processed: processedCount,
				skipped: skippedCount,
			},
			totalBlockCount,
		}
	}

	private async processBatch(
		batchBlocks: CodeBlock[],
		batchTexts: string[],
		batchFileInfos: { filePath: string; fileHash: string; isNew: boolean }[],
		scanWorkspace: string,
		onError?: (error: Error) => void,
		onBlocksIndexed?: (indexedCount: number) => void,
		signal?: AbortSignal,
	): Promise<void> {
		if (batchBlocks.length === 0) return

		try {
			await retryIndexApiOperation(
				async () => {
					const uniqueFilePaths = [
						...new Set(batchFileInfos.filter((info) => !info.isNew).map((info) => info.filePath)),
					]
					if (uniqueFilePaths.length > 0) {
						try {
							await this.qdrantClient.deletePointsByMultipleFilePaths(uniqueFilePaths)
						} catch (error) {
							throw new Error(`Failed to delete points in workspace ${scanWorkspace}`, { cause: error })
						}
					}

					const { embeddings } = await this.embedder.createEmbeddings(batchTexts)
					const points = batchBlocks.map((block, index) => {
						const normalizedAbsolutePath = generateNormalizedAbsolutePath(block.file_path, scanWorkspace)
						return {
							id: uuidv5(block.segmentHash, QDRANT_CODE_BLOCK_NAMESPACE),
							vector: embeddings[index],
							payload: {
								filePath: generateRelativeFilePath(normalizedAbsolutePath, scanWorkspace),
								codeChunk: block.content,
								startLine: block.start_line,
								endLine: block.end_line,
								segmentHash: block.segmentHash,
							},
						}
					})
					await this.qdrantClient.upsertPoints(points)
				},
				{
					signal,
					onRetry: ({ attempt, delayMs, reason }) =>
						console.warn(
							`[DirectoryScanner] Retry batch in ${Math.ceil(delayMs / 1000)}s (attempt ${attempt}): ${reason}`,
						),
				},
			)

			onBlocksIndexed?.(batchBlocks.length)
			for (const fileInfo of batchFileInfos)
				await this.cacheManager.updateHash(fileInfo.filePath, fileInfo.fileHash)
		} catch (error) {
			if (error instanceof DOMException && error.name === "AbortError") throw error
			const finalError = error instanceof Error ? error : new Error(String(error))
			console.error("[DirectoryScanner] Failed to process batch:", finalError)
			onError?.(finalError)
		}
	}
}
