import * as fs from "fs/promises"
import * as fsSync from "fs"
import * as path from "path"

import type { HistoryItem } from "@ai-code-orchestrator/types"

import { GlobalFileNames } from "../../shared/globalFileNames"
import { safeWriteJson } from "../../utils/safeWriteJson"
import { getStorageBasePath } from "../../utils/storage"

/**
 * Index file format for fast startup reads.
 */
interface HistoryIndex {
	version: number
	updatedAt: number
	entries: HistoryItem[]
}

/**
 * TaskHistoryStore encapsulates all task history persistence logic.
 *
 * Each task's HistoryItem is stored as an individual JSON file in its
 * existing task directory (`globalStorage/tasks/<taskId>/history_item.json`).
 * A single index file (`globalStorage/tasks/_index.json`) is maintained
 * as a cache for fast list reads at startup.
 *
 * Cross-process safety comes from `safeWriteJson`'s `proper-lockfile`
 * on per-task file writes. Within a single extension host process,
 * an in-process write lock serializes mutations.
 */
/**
 * Options for TaskHistoryStore constructor.
 */
export interface TaskHistoryStoreOptions {
	/**
	 * Optional callback invoked inside the write lock after each mutation
	 * (upsert, delete, deleteMany). Used for serialized write-through to
	 * globalState during the transition period.
	 */
	onWrite?: (items: HistoryItem[]) => Promise<void>
}

export class TaskHistoryStore {
	private readonly globalStoragePath: string
	private readonly onWrite?: (items: HistoryItem[]) => Promise<void>
	private cache: Map<string, HistoryItem> = new Map()
	private writeLock: Promise<void> = Promise.resolve()
	private indexWriteTimer: ReturnType<typeof setTimeout> | null = null
	private fsWatcher: fsSync.FSWatcher | null = null
	private reconcileTimer: ReturnType<typeof setTimeout> | null = null
	private disposed = false

	/**
	 * Promise that resolves when initialization is complete.
	 * Callers can await this to ensure the store is ready before reading.
	 */
	public readonly initialized: Promise<void>
	private resolveInitialized!: () => void

	/** Debounce window for index writes in milliseconds. */
	private static readonly INDEX_WRITE_DEBOUNCE_MS = 2000

	/** Periodic reconciliation interval in milliseconds. */
	private static readonly RECONCILE_INTERVAL_MS = 5 * 60 * 1000

	constructor(globalStoragePath: string, options?: TaskHistoryStoreOptions) {
		this.globalStoragePath = globalStoragePath
		this.onWrite = options?.onWrite
		this.initialized = new Promise<void>((resolve) => {
			this.resolveInitialized = resolve
		})
	}

	// ────────────────────────────── Lifecycle ──────────────────────────────

	/**
	 * Load index, reconcile if needed, start watchers.
	 */
	async initialize(): Promise<void> {
		if (this.disposed) {
			throw new Error("Cannot initialize disposed TaskHistoryStore")
		}

		// Prevent double initialization
		if (this.fsWatcher) {
			console.warn("TaskHistoryStore already initialized, skipping")
			return
		}

		try {
			const tasksDir = await this.getTasksDir()
			await fs.mkdir(tasksDir, { recursive: true })

			// 1. Load existing index into the cache
			await this.loadIndex()

			// 2. Reconcile cache against actual task directories on disk
			await this.reconcile()

			// 3. Start fs.watch for cross-instance reactivity
			await this.startWatcher()

			// 4. Start periodic reconciliation as a defensive fallback
			this.startPeriodicReconciliation()
		} finally {
			// Mark initialization as complete so callers awaiting `initialized` can proceed
			this.resolveInitialized()
		}
	}

	/**
	 * Stop watchers and clear timers.
	 */
	dispose(): void {
		this.disposed = true

		if (this.fsWatcher) {
			this.fsWatcher.close()
			console.log("TaskHistoryStore: File watcher closed successfully")
			this.fsWatcher = null
		}

		if (this.indexWriteTimer) {
			clearTimeout(this.indexWriteTimer)
			this.indexWriteTimer = null
		}

		if (this.reconcileTimer) {
			clearInterval(this.reconcileTimer)
			this.reconcileTimer = null
		}
	}

	// ────────────────────────────── Reads ──────────────────────────────

	/**
	 * Get a single task's history item.
	 */
	get(taskId: string): HistoryItem | undefined {
		return this.cache.get(taskId)
	}

	/**
	 * Get all tasks' history items.
	 */
	getAll(): HistoryItem[] {
		return Array.from(this.cache.values())
	}

	// ────────────────────────────── Mutations ──────────────────────────────

	/**
	 * Insert or update a history item.
	 *
	 * Writes the per-task file immediately (source of truth),
	 * updates the in-memory Map, and schedules a debounced index write.
	 */
	async upsert(item: HistoryItem): Promise<HistoryItem[]> {
		return this.withLock(async () => {
			const existing = this.cache.get(item.id)

			// Merge: preserve existing metadata unless explicitly overwritten
			const merged = existing ? { ...existing, ...item } : item

			// Write per-task file (source of truth)
			await this.writeTaskFile(merged)

			// Update in-memory cache
			this.cache.set(merged.id, merged)

			// Schedule debounced index write
			this.scheduleIndexWrite()

			const all = this.getAll()

			// Call onWrite callback inside the lock for serialized write-through
			if (this.onWrite) {
				await this.onWrite(all)
			}

			return all
		})
	}

	/**
	 * Atomically update parent-child links.
	 * Ensures both parent and child history items are updated together or both fail.
	 */
	async updateParentChildLinks(updates: {
		parentId: string
		parentUpdate: Partial<HistoryItem>
		childId: string
		childUpdate: Partial<HistoryItem>
	}): Promise<void> {
		return this.withLock(async () => {
			const { parentId, parentUpdate, childId, childUpdate } = updates

			// 1. Read current state
			const parentItem = this.cache.get(parentId)
			const childItem = this.cache.get(childId)

			if (!parentItem) {
				throw new Error(`Parent task ${parentId} not found in history`)
			}
			if (!childItem) {
				throw new Error(`Child task ${childId} not found in history`)
			}

			// 2. Prepare merged updates
			const mergedParent = { ...parentItem, ...parentUpdate }
			const mergedChild = { ...childItem, ...childUpdate }

			// 3. Write both files (if either fails, both fail)
			try {
				await Promise.all([this.writeTaskFile(mergedParent), this.writeTaskFile(mergedChild)])
			} catch (err) {
				throw new Error(`Failed to write parent-child link updates: ${(err as Error)?.message ?? String(err)}`)
			}

			// 4. Update in-memory cache only after successful writes
			this.cache.set(parentId, mergedParent)
			this.cache.set(childId, mergedChild)

			// 5. Schedule debounced index write
			this.scheduleIndexWrite()

			// 6. Call onWrite callback inside the lock for serialized write-through
			if (this.onWrite) {
				await this.onWrite(this.getAll())
			}
		})
	}

	/**
	 * Delete a single task's history item.
	 */
	async delete(taskId: string): Promise<void> {
		return this.withLock(async () => {
			this.cache.delete(taskId)

			// Remove per-task file (best-effort)
			try {
				const filePath = await this.getTaskFilePath(taskId)
				await fs.unlink(filePath)
			} catch {
				// File may already be deleted
			}

			this.scheduleIndexWrite()

			// Call onWrite callback inside the lock for serialized write-through
			if (this.onWrite) {
				await this.onWrite(this.getAll())
			}
		})
	}

	/**
	 * Delete multiple tasks' history items in a batch.
	 */
	async deleteMany(taskIds: string[]): Promise<void> {
		return this.withLock(async () => {
			for (const taskId of taskIds) {
				this.cache.delete(taskId)

				try {
					const filePath = await this.getTaskFilePath(taskId)
					await fs.unlink(filePath)
				} catch {
					// File may already be deleted
				}
			}

			this.scheduleIndexWrite()

			// Call onWrite callback inside the lock for serialized write-through
			if (this.onWrite) {
				await this.onWrite(this.getAll())
			}
		})
	}

	// ────────────────────────────── Reconciliation ──────────────────────────────

	/**
	 * Scan task directories vs index and fix any drift.
	 *
	 * - Tasks on disk but missing from cache: read and add
	 * - Tasks in cache but missing from disk: remove
	 */
	async reconcile(): Promise<void> {
		// Run through the write lock to prevent interleaving with upsert/delete
		return this.withLock(async () => {
			const tasksDir = await this.getTasksDir()

			let dirEntries: string[]
			try {
				dirEntries = await fs.readdir(tasksDir)
			} catch {
				return // tasks dir doesn't exist yet
			}

			// Filter out the index file and hidden files
			const taskDirNames = dirEntries.filter((name) => !name.startsWith("_") && !name.startsWith("."))

			const onDiskIds = new Set(taskDirNames)
			const cacheIds = new Set(this.cache.keys())
			let changed = false

			// Tasks on disk but not in cache: read their history_item.json
			for (const taskId of onDiskIds) {
				if (!cacheIds.has(taskId)) {
					try {
						const item = await this.readTaskFile(taskId)
						if (item) {
							this.cache.set(taskId, item)
							changed = true
						}
					} catch {
						// Corrupted or missing file, skip
					}
				}
			}

			// Tasks in cache but not on disk: remove from cache
			for (const taskId of cacheIds) {
				if (!onDiskIds.has(taskId)) {
					this.cache.delete(taskId)
					changed = true
				}
			}

			if (changed) {
				this.scheduleIndexWrite()
			}
		})
	}

	// ────────────────────────────── Cache invalidation ──────────────────────────────

	/**
	 * Invalidate a single task's cache entry (re-read from disk on next access).
	 */
	async invalidate(taskId: string): Promise<void> {
		try {
			const item = await this.readTaskFile(taskId)
			if (item) {
				this.cache.set(taskId, item)
			} else {
				this.cache.delete(taskId)
			}
		} catch {
			this.cache.delete(taskId)
		}
	}

	/**
	 * Clear all in-memory cache and reload from index.
	 */
	invalidateAll(): void {
		this.cache.clear()
	}

	// ────────────────────────────── Migration ──────────────────────────────

	/**
	 * Migrate from globalState taskHistory array to per-task files.
	 *
	 * For each entry in the globalState array, writes a `history_item.json`
	 * file if one doesn't already exist. This is idempotent and safe to re-run.
	 */
	async migrateFromGlobalState(taskHistoryEntries: HistoryItem[]): Promise<void> {
		if (!taskHistoryEntries || taskHistoryEntries.length === 0) {
			return
		}

		for (const item of taskHistoryEntries) {
			if (!item.id) {
				continue
			}

			// Check if task directory exists on disk
			const tasksDir = await this.getTasksDir()
			const taskDir = path.join(tasksDir, item.id)

			try {
				await fs.access(taskDir)
			} catch {
				// Task directory doesn't exist; skip this entry as it's orphaned in globalState
				continue
			}

			// Write history_item.json if it doesn't exist yet
			const filePath = path.join(taskDir, GlobalFileNames.historyItem)
			try {
				await fs.access(filePath)
				// File already exists; skip
			} catch {
				// File doesn't exist; write it
				await safeWriteJson(filePath, item)
			}
		}

		// After migration, reconcile to update cache
		await this.reconcile()
	}

	// ────────────────────────────── Helpers ──────────────────────────────

	private async getTasksDir(): Promise<string> {
		const base = await getStorageBasePath(this.globalStoragePath)
		return path.join(base, "tasks")
	}

	private async getTaskFilePath(taskId: string): Promise<string> {
		const tasksDir = await this.getTasksDir()
		return path.join(tasksDir, taskId, GlobalFileNames.historyItem)
	}

	/**
	 * Read a single task's history_item.json from disk.
	 */
	private async readTaskFile(taskId: string): Promise<HistoryItem | null> {
		const filePath = await this.getTaskFilePath(taskId)
		try {
			const content = await fs.readFile(filePath, "utf-8")
			return JSON.parse(content) as HistoryItem
		} catch {
			return null
		}
	}

	/**
	 * Write a single task's history_item.json to disk using safeWriteJson.
	 */
	private async writeTaskFile(item: HistoryItem): Promise<void> {
		const filePath = await this.getTaskFilePath(item.id)
		await safeWriteJson(filePath, item)
	}

	/**
	 * Load the index file into cache.
	 */
	private async loadIndex(): Promise<void> {
		const tasksDir = await this.getTasksDir()
		const indexPath = path.join(tasksDir, "_index.json")

		try {
			const content = await fs.readFile(indexPath, "utf-8")
			const index = JSON.parse(content) as HistoryIndex
			this.cache = new Map(index.entries.map((item) => [item.id, item]))
		} catch {
			// Index doesn't exist or is corrupted; start with empty cache
			this.cache = new Map()
		}
	}

	/**
	 * Write the index file from current cache.
	 */
	private async writeIndex(): Promise<void> {
		const tasksDir = await this.getTasksDir()
		const indexPath = path.join(tasksDir, "_index.json")

		const index: HistoryIndex = {
			version: 1,
			updatedAt: Date.now(),
			entries: this.getAll(),
		}

		await safeWriteJson(indexPath, index)
	}

	/**
	 * Schedule a debounced index write.
	 */
	private scheduleIndexWrite(): void {
		if (this.indexWriteTimer) {
			clearTimeout(this.indexWriteTimer)
		}

		this.indexWriteTimer = setTimeout(() => {
			this.indexWriteTimer = null
			this.writeIndex().catch(() => {
				// Non-fatal: index is just a cache
			})
		}, TaskHistoryStore.INDEX_WRITE_DEBOUNCE_MS)
	}

	/**
	 * Start watching the tasks directory for external changes.
	 */
	private async startWatcher(): Promise<void> {
		if (this.disposed) {
			console.warn("TaskHistoryStore: Cannot start watcher on disposed instance")
			return
		}

		// Check for existing watcher leak
		if (this.fsWatcher) {
			console.error("TaskHistoryStore: Watcher already exists! Closing old watcher to prevent leak.")
			this.fsWatcher.close()
			this.fsWatcher = null
		}

		const tasksDir = await this.getTasksDir()

		try {
			this.fsWatcher = fsSync.watch(
				tasksDir,
				{ recursive: true },
				(eventType: string, filename: string | null) => {
					if (this.disposed) return
					if (!filename) return

					// Only react to changes in history_item.json files
					if (filename.endsWith(GlobalFileNames.historyItem)) {
						const taskId = path.dirname(filename)
						// Debounce invalidation to avoid thrashing
						setTimeout(() => {
							if (!this.disposed) {
								this.invalidate(taskId).catch(() => {
									// Non-fatal
								})
							}
						}, 100)
					}
				},
			)
			console.log(`TaskHistoryStore: Started watching ${tasksDir}`)
		} catch {
			// fs.watch may not be available on all platforms
		}
	}

	/**
	 * Start periodic reconciliation as a defensive fallback.
	 */
	private startPeriodicReconciliation(): void {
		if (this.disposed) return

		this.reconcileTimer = setInterval(() => {
			if (!this.disposed) {
				this.reconcile().catch(() => {
					// Non-fatal
				})
			}
		}, TaskHistoryStore.RECONCILE_INTERVAL_MS)
	}

	/**
	 * Run a function inside the write lock.
	 */
	private async withLock<T>(fn: () => Promise<T>): Promise<T> {
		const previous = this.writeLock
		let resolve!: () => void
		this.writeLock = new Promise<void>((r) => {
			resolve = r
		})

		try {
			await previous
			return await fn()
		} finally {
			resolve()
		}
	}
}
