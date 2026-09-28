import * as fs from "fs/promises"
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
	/**
	 * Optional callback invoked after reconcile when an external change was
	 * actually applied (updated or removed task ids). Called outside the write
	 * lock. Exceptions are swallowed so a consumer cannot break reconcile.
	 */
	onExternalChange?: (changed: { updated: string[]; removed: string[] }) => void
	/**
	 * Periodic reconcile interval in milliseconds. Defaults to 10 seconds.
	 * Injected so tests can use a shorter interval with fake timers.
	 */
	reconcileIntervalMs?: number
}

/**
 * Cheap identity of a history_item.json taken from a single stat, without reading contents.
 * mtimeMs alone is not enough: filesystems with coarse mtime resolution can assign the same
 * timestamp to two atomic replaces in one quantum. size and ino distinguish those replaces
 * (atomic rename changes the inode). ctimeMs covers filesystems where ino is 0 or unstable
 * (Windows): atomic replace via temp + rename updates creation/inode-change time even when
 * mtimeMs, size, and ino do not.
 */
interface TaskFileSignature {
	mtimeMs: number
	size: number
	ino: number
	ctimeMs: number
}

export class TaskHistoryStore {
	private readonly globalStoragePath: string
	private readonly onWrite?: (items: HistoryItem[]) => Promise<void>
	private onExternalChange?: (changed: { updated: string[]; removed: string[] }) => void
	private readonly reconcileIntervalMs: number
	private cache: Map<string, HistoryItem> = new Map()
	/** Last observed stat signature of each task's history_item.json. Used to detect content changes without re-reading unchanged files. */
	private taskFileSignatures: Map<string, TaskFileSignature> = new Map()
	private writeLock: Promise<void> = Promise.resolve()
	private indexWriteTimer: ReturnType<typeof setTimeout> | null = null
	private reconcileTimer: ReturnType<typeof setInterval> | null = null
	/** Set at the start of initialize() so a second call is a no-op even without an fs watcher. */
	private initializeStarted = false
	private disposed = false
	/** True while a timer-driven reconcile is in flight. Ticks are skipped; explicit reconcile() is not. */
	private periodicReconcileRunning = false
	/** Reconcile passes started but not yet finished. Dispose must not flush over them. */
	private reconcileInFlight = 0

	/**
	 * Promise that resolves when initialization is complete.
	 * Callers can await this to ensure the store is ready before reading.
	 */
	public readonly initialized: Promise<void>
	private resolveInitialized!: () => void

	/** Debounce window for index writes in milliseconds. */
	private static readonly INDEX_WRITE_DEBOUNCE_MS = 2000

	/** Periodic reconciliation interval in milliseconds. */
	private static readonly RECONCILE_INTERVAL_MS = 10 * 1000

	constructor(globalStoragePath: string, options?: TaskHistoryStoreOptions) {
		this.globalStoragePath = globalStoragePath
		this.onWrite = options?.onWrite
		this.onExternalChange = options?.onExternalChange
		this.reconcileIntervalMs = options?.reconcileIntervalMs ?? TaskHistoryStore.RECONCILE_INTERVAL_MS
		this.initialized = new Promise<void>((resolve) => {
			this.resolveInitialized = resolve
		})
	}

	/**
	 * Drop the external-change subscription. Safe to call more than once.
	 * Does not dispose the store.
	 */
	clearExternalChangeListener(): void {
		this.onExternalChange = undefined
	}

	// ────────────────────────────── Lifecycle ──────────────────────────────

	/**
	 * Load index, reconcile if needed, start periodic reconciliation.
	 * Cross-instance changes are discovered by periodic reconcile, not fs.watch.
	 */
	async initialize(): Promise<void> {
		if (this.disposed) {
			throw new Error("Cannot initialize disposed TaskHistoryStore")
		}

		// Prevent double initialization. The flag is set before any side effects
		// so a concurrent second call cannot start a second reconcile timer.
		if (this.initializeStarted) {
			console.warn("TaskHistoryStore already initialized, skipping")
			return
		}
		this.initializeStarted = true

		try {
			const tasksDir = await this.getTasksDir()
			await fs.mkdir(tasksDir, { recursive: true })

			// 1. Load existing index into the cache
			await this.loadIndex()

			// 2. Reconcile cache against actual task directories on disk
			await this.reconcile()

			// 3. Start periodic reconciliation (sole cross-instance discovery path)
			this.startPeriodicReconciliation()
		} finally {
			// Mark initialization as complete so callers awaiting `initialized` can proceed
			this.resolveInitialized()
		}
	}

	/**
	 * Stop timers. Flushes the index file before disposing.
	 * The reconcile interval is cleared synchronously so no new disk scan is scheduled.
	 * A reconcile already inside the write lock may finish its current pass, but it
	 * re-checks `disposed` before touching the cache or scheduling further writes.
	 */
	dispose(): void {
		this.disposed = true
		this.onExternalChange = undefined

		if (this.indexWriteTimer) {
			clearTimeout(this.indexWriteTimer)
			this.indexWriteTimer = null
		}

		if (this.reconcileTimer) {
			clearInterval(this.reconcileTimer)
			this.reconcileTimer = null
		}

		// Flush index file on dispose (fire-and-forget). This is the only disk
		// access dispose itself starts; periodic reconcile cannot schedule another.
		// If initialization never completed, there is nothing to flush.
		// Skip the flush while a reconcile pass is in flight: that pass re-checks
		// `disposed` and must not be raced by an index write of a partial cache.
		if (this.initializeStarted && this.reconcileInFlight === 0) {
			this.writeIndex().catch(() => {
				// Non-fatal: best-effort flush
			})
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
	 * Get all tasks' history items, sorted by timestamp descending (newest first).
	 */
	getAll(): HistoryItem[] {
		return Array.from(this.cache.values()).sort((a, b) => b.ts - a.ts)
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
			await this.rememberTaskFileSignature(merged.id)

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

			await Promise.all([this.rememberTaskFileSignature(parentId), this.rememberTaskFileSignature(childId)])

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
			this.taskFileSignatures.delete(taskId)

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
				this.taskFileSignatures.delete(taskId)

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
	 * - Tasks present in both: re-read only when history_item.json signature changed
	 *   (mtimeMs + size + ino + ctimeMs). mtimeMs alone can collide on coarse filesystems;
	 *   ctimeMs covers filesystems where ino is unreliable.
	 *
	 * Unchanged files are identified by `stat` and are not read.
	 * `onExternalChange` is invoked only when something actually changed, and only
	 * after the write lock is released.
	 */
	async reconcile(): Promise<void> {
		if (this.disposed) {
			return
		}

		// Count the pass before awaiting the lock so dispose() during an in-flight
		// reconcile does not flush the index over a pass that will abort.
		this.reconcileInFlight += 1
		let externalChange: { updated: string[]; removed: string[] } | undefined
		try {
			externalChange = await this.withLock(() => this.reconcileLocked())
		} finally {
			this.reconcileInFlight -= 1
		}

		this.notifyExternalChange(externalChange)
	}

	private async reconcileLocked(): Promise<{ updated: string[]; removed: string[] } | undefined> {
		if (this.disposed) {
			return undefined
		}

		const tasksDir = await this.getTasksDir()

		let dirEntries: string[]
		try {
			dirEntries = await fs.readdir(tasksDir)
		} catch {
			return undefined // tasks dir doesn't exist yet
		}

		if (this.disposed) {
			return undefined
		}

		// Filter out the index file and hidden files
		const taskDirNames = dirEntries.filter((name) => !name.startsWith("_") && !name.startsWith("."))

		const onDiskIds = new Set(taskDirNames)
		const cacheIds = new Set(this.cache.keys())
		const updated: string[] = []
		const removed: string[] = []

		for (const taskId of onDiskIds) {
			if (this.disposed) {
				return undefined
			}

			const filePath = path.join(tasksDir, taskId, GlobalFileNames.historyItem)
			let signature: TaskFileSignature
			try {
				signature = this.signatureFromStats(await fs.stat(filePath))
			} catch {
				// Directory without a readable history_item.json (or a race with delete).
				// A cached entry whose file disappeared is dropped below if the dir is gone;
				// a dir that still exists but has no file is left alone until the dir goes away.
				continue
			}

			const knownSignature = this.taskFileSignatures.get(taskId)
			const isNew = !cacheIds.has(taskId)
			// Missing baseline (loaded from index, never stat'd) is treated as changed
			// so the first reconcile after startup establishes both content and signature.
			const signatureChanged = knownSignature === undefined || !this.signaturesEqual(knownSignature, signature)
			if (!isNew && !signatureChanged) {
				continue
			}

			try {
				const item = await this.readTaskFile(taskId)
				if (this.disposed) {
					return undefined
				}
				if (item) {
					this.cache.set(taskId, item)
					this.taskFileSignatures.set(taskId, signature)
					updated.push(taskId)
				}
			} catch {
				// Corrupted or missing file, skip
			}
		}

		// Tasks in cache but not on disk: remove from cache
		for (const taskId of cacheIds) {
			if (!onDiskIds.has(taskId)) {
				this.cache.delete(taskId)
				this.taskFileSignatures.delete(taskId)
				removed.push(taskId)
			}
		}

		if (this.disposed) {
			return undefined
		}

		const changed = updated.length > 0 || removed.length > 0
		if (changed) {
			this.scheduleIndexWrite()
		}

		return changed ? { updated, removed } : undefined
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
				await this.rememberTaskFileSignature(taskId)
			} else {
				this.cache.delete(taskId)
				this.taskFileSignatures.delete(taskId)
			}
		} catch {
			this.cache.delete(taskId)
			this.taskFileSignatures.delete(taskId)
		}
	}

	/**
	 * Clear all in-memory cache and reload from index.
	 */
	invalidateAll(): void {
		this.cache.clear()
		this.taskFileSignatures.clear()
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
	 * Record the current stat signature of a task file after a local write or read,
	 * so the next reconcile does not treat our own write as an external change.
	 * Best-effort: a missing file simply drops the baseline.
	 */
	private async rememberTaskFileSignature(taskId: string): Promise<void> {
		try {
			const filePath = await this.getTaskFilePath(taskId)
			const stats = await fs.stat(filePath)
			this.taskFileSignatures.set(taskId, this.signatureFromStats(stats))
		} catch {
			this.taskFileSignatures.delete(taskId)
		}
	}

	private signatureFromStats(stats: {
		mtimeMs: number
		size: number
		ino: number
		ctimeMs: number
	}): TaskFileSignature {
		return { mtimeMs: stats.mtimeMs, size: stats.size, ino: stats.ino, ctimeMs: stats.ctimeMs }
	}

	private signaturesEqual(a: TaskFileSignature, b: TaskFileSignature): boolean {
		return a.mtimeMs === b.mtimeMs && a.size === b.size && a.ino === b.ino && a.ctimeMs === b.ctimeMs
	}

	/**
	 * Notify consumers of an external change. Must not run under the write lock.
	 * A throwing callback is swallowed so reconcile itself still succeeds.
	 */
	private notifyExternalChange(changed: { updated: string[]; removed: string[] } | undefined): void {
		if (!changed || this.disposed) {
			return
		}

		const listener = this.onExternalChange
		if (!listener) {
			return
		}

		try {
			listener(changed)
		} catch {
			// Consumer errors must not fail reconcile.
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
		if (this.disposed) {
			return
		}

		if (this.indexWriteTimer) {
			clearTimeout(this.indexWriteTimer)
		}

		this.indexWriteTimer = setTimeout(() => {
			this.indexWriteTimer = null
			if (this.disposed) {
				return
			}
			this.writeIndex().catch(() => {
				// Non-fatal: index is just a cache
			})
		}, TaskHistoryStore.INDEX_WRITE_DEBOUNCE_MS)
	}

	/**
	 * Start periodic reconciliation. This is the only cross-instance discovery path:
	 * recursive fs.watch is intentionally not used (it exhausts inotify watches).
	 */
	private startPeriodicReconciliation(): void {
		if (this.disposed) return
		if (this.reconcileTimer) return

		this.reconcileTimer = setInterval(() => {
			if (this.disposed) return
			// Skip overlapping timer ticks. An explicit reconcile() is not gated by this flag.
			if (this.periodicReconcileRunning) return
			this.periodicReconcileRunning = true
			this.reconcile()
				.catch(() => {
					// Non-fatal
				})
				.finally(() => {
					this.periodicReconcileRunning = false
				})
		}, this.reconcileIntervalMs)
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
