// pnpm --filter ai-code-orchestrator test core/task-persistence/__tests__/TaskHistoryStore.spec.ts

import * as fs from "fs/promises"
import * as fsSync from "fs"
import * as path from "path"
import * as os from "os"

import type { HistoryItem } from "@ai-code-orchestrator/types"

import { TaskHistoryStore } from "../TaskHistoryStore"
import { GlobalFileNames } from "../../../shared/globalFileNames"

// ESM namespace exports are not configurable, so vi.spyOn(fs, ...) cannot wrap them.
// A partial mock keeps the real implementation and exposes a vi.fn we can assert on.
// If TaskHistoryStore calls fs.watch / fs.promises.readFile, these wrappers record it.
vi.mock("fs", async () => {
	const actual = await vi.importActual<typeof import("fs")>("fs")
	return {
		...actual,
		watch: vi.fn((...args: Parameters<typeof actual.watch>) => actual.watch(...args)),
	}
})

vi.mock("fs/promises", async () => {
	const actual = await vi.importActual<typeof import("fs/promises")>("fs/promises")
	return {
		...actual,
		readFile: vi.fn((...args: Parameters<typeof actual.readFile>) => actual.readFile(...args)),
		readdir: vi.fn((...args: Parameters<typeof actual.readdir>) => actual.readdir(...args)),
		stat: vi.fn((...args: Parameters<typeof actual.stat>) => actual.stat(...args)),
		writeFile: vi.fn((...args: Parameters<typeof actual.writeFile>) => actual.writeFile(...args)),
	}
})

vi.mock("../../../utils/storage", () => ({
	getStorageBasePath: vi.fn().mockImplementation((defaultPath: string) => defaultPath),
}))

// Mock safeWriteJson to use plain fs writes in tests (avoids proper-lockfile issues)
vi.mock("../../../utils/safeWriteJson", () => ({
	safeWriteJson: vi.fn().mockImplementation(async (filePath: string, data: any) => {
		await fs.mkdir(path.dirname(filePath), { recursive: true })
		await fs.writeFile(filePath, JSON.stringify(data, null, "\t"), "utf8")
	}),
}))

function makeHistoryItem(overrides: Partial<HistoryItem> = {}): HistoryItem {
	return {
		id: `task-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
		number: 1,
		ts: Date.now(),
		task: "Test task",
		tokensIn: 100,
		tokensOut: 50,
		totalCost: 0.01,
		workspace: "/test/workspace",
		...overrides,
	}
}

describe("TaskHistoryStore", () => {
	let tmpDir: string
	let store: TaskHistoryStore

	beforeEach(async () => {
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "task-history-test-"))
		store = new TaskHistoryStore(tmpDir)
	})

	afterEach(async () => {
		store.dispose()
		await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
	})

	describe("initialize()", () => {
		it("does not call fs.watch (recursive watcher regression)", async () => {
			const watchMock = fsSync.watch as unknown as ReturnType<typeof vi.fn>
			watchMock.mockClear()

			await store.initialize()

			expect(watchMock).not.toHaveBeenCalled()
		})

		it("skips a second initialize without side effects", async () => {
			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

			await store.initialize()
			await store.initialize()

			expect(warnSpy).toHaveBeenCalledWith("TaskHistoryStore already initialized, skipping")
			expect(store.getAll()).toEqual([])
			warnSpy.mockRestore()
		})

		it("initializes from empty state (no index, no task dirs)", async () => {
			await store.initialize()
			expect(store.getAll()).toEqual([])
		})

		it("initializes from existing index file", async () => {
			const tasksDir = path.join(tmpDir, "tasks")
			await fs.mkdir(tasksDir, { recursive: true })

			const item1 = makeHistoryItem({ id: "task-1", ts: 1000 })
			const item2 = makeHistoryItem({ id: "task-2", ts: 2000 })

			// Create task directories so reconciliation doesn't remove them
			await fs.mkdir(path.join(tasksDir, "task-1"), { recursive: true })
			await fs.mkdir(path.join(tasksDir, "task-2"), { recursive: true })

			// Write per-task files
			await fs.writeFile(path.join(tasksDir, "task-1", GlobalFileNames.historyItem), JSON.stringify(item1))
			await fs.writeFile(path.join(tasksDir, "task-2", GlobalFileNames.historyItem), JSON.stringify(item2))

			// Write index
			const index = {
				version: 1,
				updatedAt: Date.now(),
				entries: [item1, item2],
			}
			await fs.writeFile(path.join(tasksDir, GlobalFileNames.historyIndex), JSON.stringify(index))

			await store.initialize()

			expect(store.getAll()).toHaveLength(2)
			expect(store.get("task-1")).toBeDefined()
			expect(store.get("task-2")).toBeDefined()
		})
	})

	describe("get()", () => {
		it("returns undefined for non-existent task", async () => {
			await store.initialize()
			expect(store.get("non-existent")).toBeUndefined()
		})

		it("returns the item after upsert", async () => {
			await store.initialize()
			const item = makeHistoryItem({ id: "task-get" })
			await store.upsert(item)
			expect(store.get("task-get")).toMatchObject({ id: "task-get" })
		})
	})

	describe("getAll()", () => {
		it("returns items sorted by ts descending", async () => {
			await store.initialize()

			await store.upsert(makeHistoryItem({ id: "old", ts: 1000 }))
			await store.upsert(makeHistoryItem({ id: "mid", ts: 2000 }))
			await store.upsert(makeHistoryItem({ id: "new", ts: 3000 }))

			const all = store.getAll()
			expect(all).toHaveLength(3)
			expect(all[0].id).toBe("new")
			expect(all[1].id).toBe("mid")
			expect(all[2].id).toBe("old")
		})
	})

	describe("getAll() filtering by workspace", () => {
		it("filters by workspace path", async () => {
			await store.initialize()

			await store.upsert(makeHistoryItem({ id: "ws-a-1", workspace: "/workspace-a" }))
			await store.upsert(makeHistoryItem({ id: "ws-a-2", workspace: "/workspace-a" }))
			await store.upsert(makeHistoryItem({ id: "ws-b-1", workspace: "/workspace-b" }))

			const wsA = store.getAll().filter((item) => item.workspace === "/workspace-a")
			expect(wsA).toHaveLength(2)
			expect(wsA.every((item) => item.workspace === "/workspace-a")).toBe(true)

			const wsB = store.getAll().filter((item) => item.workspace === "/workspace-b")
			expect(wsB).toHaveLength(1)
			expect(wsB[0].id).toBe("ws-b-1")
		})
	})

	describe("upsert()", () => {
		it("writes per-task file and updates cache", async () => {
			await store.initialize()

			const item = makeHistoryItem({ id: "upsert-task" })
			const result = await store.upsert(item)

			// Cache should be updated
			expect(store.get("upsert-task")).toBeDefined()
			expect(result.length).toBe(1)

			// Per-task file should exist
			const filePath = path.join(tmpDir, "tasks", "upsert-task", GlobalFileNames.historyItem)
			const raw = await fs.readFile(filePath, "utf8")
			const written = JSON.parse(raw)
			expect(written.id).toBe("upsert-task")
		})

		it("preserves existing metadata on partial updates (delegation fields)", async () => {
			await store.initialize()

			const original = makeHistoryItem({
				id: "delegate-task",
				status: "delegated",
				delegatedToId: "child-1",
				awaitingChildId: "child-1",
				childIds: ["child-1"],
			})
			await store.upsert(original)

			// Partial update that doesn't include delegation fields
			const partialUpdate: HistoryItem = makeHistoryItem({
				id: "delegate-task",
				tokensIn: 500,
				tokensOut: 200,
			})
			await store.upsert(partialUpdate)

			const result = store.get("delegate-task")!
			expect(result.status).toBe("delegated")
			expect(result.delegatedToId).toBe("child-1")
			expect(result.awaitingChildId).toBe("child-1")
			expect(result.childIds).toEqual(["child-1"])
			expect(result.tokensIn).toBe(500)
			expect(result.tokensOut).toBe(200)
		})

		it("returns updated task history array", async () => {
			await store.initialize()

			const item1 = makeHistoryItem({ id: "item-1", ts: 1000 })
			const item2 = makeHistoryItem({ id: "item-2", ts: 2000 })

			await store.upsert(item1)
			const result = await store.upsert(item2)

			expect(result).toHaveLength(2)
			// Should be sorted by ts descending
			expect(result[0].id).toBe("item-2")
			expect(result[1].id).toBe("item-1")
		})
	})

	describe("delete()", () => {
		it("removes per-task file and updates cache", async () => {
			await store.initialize()

			const item = makeHistoryItem({ id: "del-task" })
			await store.upsert(item)
			expect(store.get("del-task")).toBeDefined()

			await store.delete("del-task")
			expect(store.get("del-task")).toBeUndefined()
			expect(store.getAll()).toHaveLength(0)
		})

		it("handles deleting non-existent task gracefully", async () => {
			await store.initialize()
			await expect(store.delete("non-existent")).resolves.not.toThrow()
		})
	})

	describe("deleteMany()", () => {
		it("removes multiple tasks in batch", async () => {
			await store.initialize()

			await store.upsert(makeHistoryItem({ id: "batch-1" }))
			await store.upsert(makeHistoryItem({ id: "batch-2" }))
			await store.upsert(makeHistoryItem({ id: "batch-3" }))
			expect(store.getAll()).toHaveLength(3)

			await store.deleteMany(["batch-1", "batch-3"])
			expect(store.getAll()).toHaveLength(1)
			expect(store.get("batch-2")).toBeDefined()
		})
	})

	describe("reconcile()", () => {
		it("re-reads an existing history_item.json when its mtime changes and skips unchanged files", async () => {
			await store.initialize()

			const item = makeHistoryItem({ id: "mtime-task", tokensIn: 10, task: "original" })
			await store.upsert(item)

			const filePath = path.join(tmpDir, "tasks", "mtime-task", GlobalFileNames.historyItem)
			const unchangedPath = path.join(tmpDir, "tasks", "stable-task", GlobalFileNames.historyItem)
			await store.upsert(makeHistoryItem({ id: "stable-task", tokensIn: 1, task: "stable" }))

			const readFileMock = fs.readFile as unknown as ReturnType<typeof vi.fn>
			readFileMock.mockClear()

			// Same mtime: content change must not be picked up, and the file must not be read.
			await store.reconcile()
			expect(store.get("mtime-task")!.tokensIn).toBe(10)
			expect(readFileMock.mock.calls.some((call) => call[0] === filePath)).toBe(false)
			expect(readFileMock.mock.calls.some((call) => call[0] === unchangedPath)).toBe(false)

			readFileMock.mockClear()

			const updated = { ...store.get("mtime-task")!, tokensIn: 777, task: "externally updated" }
			await fs.writeFile(filePath, JSON.stringify(updated))
			const bumped = new Date(Date.now() + 5_000)
			await fs.utimes(filePath, bumped, bumped)

			await store.reconcile()

			expect(store.get("mtime-task")!.tokensIn).toBe(777)
			expect(store.get("mtime-task")!.task).toBe("externally updated")
			expect(store.get("stable-task")!.task).toBe("stable")
			expect(readFileMock.mock.calls.filter((call) => call[0] === filePath)).toHaveLength(1)
			expect(readFileMock.mock.calls.some((call) => call[0] === unchangedPath)).toBe(false)
		})

		it("detects tasks on disk missing from index", async () => {
			await store.initialize()

			// Manually create a task directory with history_item.json
			const tasksDir = path.join(tmpDir, "tasks")
			const taskDir = path.join(tasksDir, "orphan-task")
			await fs.mkdir(taskDir, { recursive: true })

			const item = makeHistoryItem({ id: "orphan-task" })
			await fs.writeFile(path.join(taskDir, GlobalFileNames.historyItem), JSON.stringify(item))

			// Reconcile should pick it up
			await store.reconcile()

			expect(store.get("orphan-task")).toBeDefined()
			expect(store.get("orphan-task")!.id).toBe("orphan-task")
		})

		it("removes tasks from cache that no longer exist on disk", async () => {
			await store.initialize()

			const item = makeHistoryItem({ id: "removed-task" })
			await store.upsert(item)
			expect(store.get("removed-task")).toBeDefined()

			// Remove the task directory from disk
			const taskDir = path.join(tmpDir, "tasks", "removed-task")
			await fs.rm(taskDir, { recursive: true, force: true })

			// Reconcile should remove it from cache
			await store.reconcile()

			expect(store.get("removed-task")).toBeUndefined()
		})

		it("detects a content change when mtimeMs collides but size or inode differs", async () => {
			await store.initialize()

			const item = makeHistoryItem({ id: "collision-task", tokensIn: 10, task: "short" })
			await store.upsert(item)

			const filePath = path.join(tmpDir, "tasks", "collision-task", GlobalFileNames.historyItem)
			const before = await fs.stat(filePath)
			const requested = new Date(Math.floor(before.mtimeMs / 1000) * 1000)

			// Force the baseline onto a coarse timestamp, then replace the file with different
			// contents while pinning mtime back to that same quantum. utimes resolution is
			// filesystem-dependent, so the collision is the timestamp stat actually stored.
			await fs.utimes(filePath, requested, requested)
			const frozenMs = (await fs.stat(filePath)).mtimeMs
			await store.reconcile()
			expect(store.get("collision-task")!.tokensIn).toBe(10)

			const updated = {
				...store.get("collision-task")!,
				tokensIn: 4242,
				task: "replaced with a longer payload so size cannot match",
			}
			const tempPath = `${filePath}.collision.tmp`
			await fs.writeFile(tempPath, JSON.stringify(updated))
			await fs.rename(tempPath, filePath)
			await fs.utimes(filePath, requested, requested)

			const after = await fs.stat(filePath)
			expect(after.mtimeMs).toBe(frozenMs)
			expect(after.size === before.size && after.ino === before.ino).toBe(false)

			await store.reconcile()

			expect(store.get("collision-task")!.tokensIn).toBe(4242)
			expect(store.get("collision-task")!.task).toBe("replaced with a longer payload so size cannot match")
		})

		it("detects a content change when only ctimeMs differs (ino unreliable)", async () => {
			await store.initialize()

			const item = makeHistoryItem({ id: "ctime-task", tokensIn: 10, task: "same-size" })
			await store.upsert(item)

			const filePath = path.join(tmpDir, "tasks", "ctime-task", GlobalFileNames.historyItem)
			const before = await fs.stat(filePath)
			// Re-baseline against the real stat so the next reconcile has a known signature.
			await store.reconcile()
			expect(store.get("ctime-task")!.tokensIn).toBe(10)

			// Pad the task text so the replacement has the same byte length. size and ino must
			// stay equal to the baseline; only ctimeMs is allowed to distinguish the replace.
			// A real filesystem cannot change ctimeMs while keeping mtimeMs, size, and ino fixed
			// (atomic rename also changes ino on Unix), so fs.stat is mocked for this file only.
			const base = { ...store.get("ctime-task")!, tokensIn: 9090, task: "ctime-only" }
			const encoded = (task: string) => Buffer.byteLength(JSON.stringify({ ...base, task }))
			let taskText = base.task
			while (encoded(taskText) < before.size) {
				taskText += "x"
			}
			expect(encoded(taskText)).toBe(before.size)
			const payload = JSON.stringify({ ...base, task: taskText })

			const statMock = fs.stat as unknown as ReturnType<typeof vi.fn>
			statMock.mockImplementation(async (target: fsSync.PathLike, options?: fsSync.StatOptions) => {
				const stats = await fsSync.promises.stat(target, options)
				if (String(target) !== filePath) {
					return stats
				}
				return Object.assign(stats, {
					mtimeMs: before.mtimeMs,
					size: before.size,
					ino: before.ino,
					ctimeMs: before.ctimeMs + 1,
				})
			})

			try {
				await fs.writeFile(filePath, payload)
				await store.reconcile()
			} finally {
				statMock.mockImplementation((...args: Parameters<typeof fsSync.promises.stat>) =>
					fsSync.promises.stat(...args),
				)
			}

			expect(store.getAll().find((entry) => entry.id === "ctime-task")).toEqual({ ...base, task: taskText })
		})

		it("notifies onExternalChange only for real changes, outside the write lock, and survives a throwing callback", async () => {
			const events: Array<{ updated: string[]; removed: string[]; lockHeld: boolean }> = []
			let lockHeld = false
			const onExternalChange = vi.fn((changed: { updated: string[]; removed: string[] }) => {
				events.push({ ...changed, lockHeld })
				if (changed.updated.includes("throw-task")) {
					throw new Error("consumer failed")
				}
			})

			const notifyingStore = new TaskHistoryStore(tmpDir, { onExternalChange })
			const originalWithLock = (
				notifyingStore as unknown as { withLock: (fn: () => Promise<unknown>) => Promise<unknown> }
			).withLock.bind(notifyingStore)
			;(notifyingStore as unknown as { withLock: (fn: () => Promise<unknown>) => Promise<unknown> }).withLock =
				async (fn) => {
					lockHeld = true
					try {
						return await originalWithLock(fn)
					} finally {
						lockHeld = false
					}
				}

			await notifyingStore.initialize()
			// Startup reconcile of an empty tree is not a change.
			expect(onExternalChange).not.toHaveBeenCalled()

			const tasksDir = path.join(tmpDir, "tasks")
			const taskDir = path.join(tasksDir, "external-task")
			await fs.mkdir(taskDir, { recursive: true })
			await fs.writeFile(
				path.join(taskDir, GlobalFileNames.historyItem),
				JSON.stringify(makeHistoryItem({ id: "external-task", tokensIn: 1 })),
			)

			await notifyingStore.reconcile()
			expect(events).toEqual([{ updated: ["external-task"], removed: [], lockHeld: false }])
			expect(notifyingStore.get("external-task")!.tokensIn).toBe(1)

			onExternalChange.mockClear()
			events.length = 0
			await notifyingStore.reconcile()
			expect(onExternalChange).not.toHaveBeenCalled()

			const throwDir = path.join(tasksDir, "throw-task")
			await fs.mkdir(throwDir, { recursive: true })
			await fs.writeFile(
				path.join(throwDir, GlobalFileNames.historyItem),
				JSON.stringify(makeHistoryItem({ id: "throw-task", tokensIn: 7 })),
			)

			await expect(notifyingStore.reconcile()).resolves.toBeUndefined()
			expect(notifyingStore.get("throw-task")!.tokensIn).toBe(7)
			expect(events.some((event) => event.updated.includes("throw-task") && event.lockHeld === false)).toBe(true)

			notifyingStore.dispose()
		})
	})

	describe("concurrent upsert() calls are serialized", () => {
		it("serializes concurrent writes so no entries are lost", async () => {
			await store.initialize()

			// Fire 5 concurrent upserts
			const promises = Array.from({ length: 5 }, (_, i) =>
				store.upsert(makeHistoryItem({ id: `concurrent-${i}`, ts: 1000 + i })),
			)

			await Promise.all(promises)

			const all = store.getAll()
			expect(all).toHaveLength(5)
			const ids = all.map((h) => h.id)
			for (let i = 0; i < 5; i++) {
				expect(ids).toContain(`concurrent-${i}`)
			}
		})

		it("serializes interleaved upsert and delete", async () => {
			await store.initialize()

			const item = makeHistoryItem({ id: "interleave-test", ts: 1000 })
			await store.upsert(item)

			// Concurrent update and delete of different items
			const promise1 = store.upsert(makeHistoryItem({ id: "survivor", ts: 2000 }))
			const promise2 = store.delete("interleave-test")

			await Promise.all([promise1, promise2])

			expect(store.get("interleave-test")).toBeUndefined()
			expect(store.get("survivor")).toBeDefined()
		})
	})

	describe("migrateFromGlobalState()", () => {
		it("writes history_item.json for tasks with existing directories", async () => {
			await store.initialize()

			const tasksDir = path.join(tmpDir, "tasks")

			// Create task directories (simulating existing tasks)
			await fs.mkdir(path.join(tasksDir, "legacy-1"), { recursive: true })
			await fs.mkdir(path.join(tasksDir, "legacy-2"), { recursive: true })

			const items = [
				makeHistoryItem({ id: "legacy-1", task: "Legacy task 1" }),
				makeHistoryItem({ id: "legacy-2", task: "Legacy task 2" }),
				makeHistoryItem({ id: "legacy-orphan", task: "Orphaned task" }), // No directory
			]

			await store.migrateFromGlobalState(items)

			// Should have migrated 2 items (skipping orphan)
			expect(store.get("legacy-1")).toBeDefined()
			expect(store.get("legacy-2")).toBeDefined()
			expect(store.get("legacy-orphan")).toBeUndefined()
		})

		it("does not overwrite existing per-task files", async () => {
			await store.initialize()

			const tasksDir = path.join(tmpDir, "tasks")
			const taskDir = path.join(tasksDir, "existing-task")
			await fs.mkdir(taskDir, { recursive: true })

			// Write an existing history_item.json with specific data
			const existingItem = makeHistoryItem({
				id: "existing-task",
				task: "Original task text",
				tokensIn: 999,
			})
			await fs.writeFile(path.join(taskDir, GlobalFileNames.historyItem), JSON.stringify(existingItem))

			// Try to migrate with different data
			const migratedItem = makeHistoryItem({
				id: "existing-task",
				task: "Different task text",
				tokensIn: 1,
			})
			await store.migrateFromGlobalState([migratedItem])

			// Existing file should not be overwritten
			const raw = await fs.readFile(path.join(taskDir, GlobalFileNames.historyItem), "utf8")
			const persisted = JSON.parse(raw)
			expect(persisted.task).toBe("Original task text")
			expect(persisted.tokensIn).toBe(999)
		})

		it("is idempotent (can be called multiple times safely)", async () => {
			await store.initialize()

			const tasksDir = path.join(tmpDir, "tasks")
			await fs.mkdir(path.join(tasksDir, "idem-task"), { recursive: true })

			const item = makeHistoryItem({ id: "idem-task" })

			await store.migrateFromGlobalState([item])
			await store.migrateFromGlobalState([item]) // Second call

			expect(store.get("idem-task")).toBeDefined()
		})
	})

	describe("index persistence", () => {
		it("writes index to disk after upsert", async () => {
			await store.initialize()

			await store.upsert(makeHistoryItem({ id: "flush-task" }))

			// Index is written automatically with debounce, wait for it
			await new Promise((resolve) => setTimeout(resolve, 2500))

			const indexPath = path.join(tmpDir, "tasks", GlobalFileNames.historyIndex)
			const raw = await fs.readFile(indexPath, "utf8")
			const index = JSON.parse(raw)

			expect(index.version).toBe(1)
			expect(index.entries).toHaveLength(1)
			expect(index.entries[0].id).toBe("flush-task")
		})
	})

	describe("periodic reconcile", () => {
		afterEach(() => {
			vi.useRealTimers()
		})

		it("calls reconcile on the injected interval and stops after dispose", async () => {
			vi.useFakeTimers()

			const periodicStore = new TaskHistoryStore(tmpDir, { reconcileIntervalMs: 50 })
			await periodicStore.initialize()
			const reconcileSpy = vi.spyOn(periodicStore, "reconcile").mockResolvedValue(undefined)
			// initialize() itself reconciles once before the timer starts; the spy
			// is installed afterwards and resolves immediately so ticks are not skipped.
			expect(reconcileSpy).toHaveBeenCalledTimes(0)

			await vi.advanceTimersByTimeAsync(50)
			expect(reconcileSpy).toHaveBeenCalledTimes(1)

			await vi.advanceTimersByTimeAsync(100)
			expect(reconcileSpy).toHaveBeenCalledTimes(3)

			periodicStore.dispose()
			const callsAtDispose = reconcileSpy.mock.calls.length

			await vi.advanceTimersByTimeAsync(500)
			expect(reconcileSpy).toHaveBeenCalledTimes(callsAtDispose)

			reconcileSpy.mockRestore()
		})

		it("does not touch the disk after dispose once the in-flight flush settles", async () => {
			vi.useFakeTimers()

			const periodicStore = new TaskHistoryStore(tmpDir, { reconcileIntervalMs: 20 })
			await periodicStore.initialize()
			await periodicStore.upsert(makeHistoryItem({ id: "timer-task" }))

			const readdirMock = fs.readdir as unknown as ReturnType<typeof vi.fn>
			const readFileMock = fs.readFile as unknown as ReturnType<typeof vi.fn>
			const statMock = fs.stat as unknown as ReturnType<typeof vi.fn>
			const writeFileMock = fs.writeFile as unknown as ReturnType<typeof vi.fn>

			periodicStore.dispose()
			// Dispose starts one index flush. The upsert debounce (2s) must not
			// schedule a second write, and the reconcile interval must not scan again.
			await vi.advanceTimersByTimeAsync(5_000)

			readdirMock.mockClear()
			readFileMock.mockClear()
			statMock.mockClear()
			writeFileMock.mockClear()

			await vi.advanceTimersByTimeAsync(10_000)

			expect(readdirMock).not.toHaveBeenCalled()
			expect(readFileMock).not.toHaveBeenCalled()
			expect(statMock).not.toHaveBeenCalled()
			expect(writeFileMock).not.toHaveBeenCalled()
		})

		it("skips overlapping periodic ticks but still runs an explicit reconcile", async () => {
			vi.useFakeTimers()

			const periodicStore = new TaskHistoryStore(tmpDir, { reconcileIntervalMs: 50 })
			await periodicStore.initialize()

			let releaseTick!: () => void
			const tickGate = new Promise<void>((resolve) => {
				releaseTick = resolve
			})
			let entered = 0
			const reconcileSpy = vi.spyOn(periodicStore, "reconcile").mockImplementation(async () => {
				entered += 1
				await tickGate
			})

			await vi.advanceTimersByTimeAsync(50)
			expect(entered).toBe(1)

			await vi.advanceTimersByTimeAsync(150)
			expect(entered).toBe(1)

			const explicit = periodicStore.reconcile()
			expect(entered).toBe(2)

			releaseTick()
			await explicit

			periodicStore.dispose()
			reconcileSpy.mockRestore()
		})
	})

	describe("dispose()", () => {
		it("does not reject or write the index when disposed during an in-flight reconcile", async () => {
			await store.initialize()
			await store.upsert(makeHistoryItem({ id: "inflight-task", tokensIn: 1 }))

			const indexPath = path.join(tmpDir, "tasks", GlobalFileNames.historyIndex)
			await fs.writeFile(indexPath, JSON.stringify({ version: 1, updatedAt: 1, entries: [] }))

			const writeFileMock = fs.writeFile as unknown as ReturnType<typeof vi.fn>
			writeFileMock.mockClear()

			let releaseStat!: () => void
			const statGate = new Promise<void>((resolve) => {
				releaseStat = resolve
			})
			const statMock = fs.stat as unknown as ReturnType<typeof vi.fn>
			statMock.mockImplementation(async (...args: Parameters<typeof fs.stat>) => {
				const target = String(args[0])
				if (target.endsWith(GlobalFileNames.historyItem)) {
					await statGate
				}
				return fsSync.promises.stat(...args)
			})

			const unhandled: unknown[] = []
			const onUnhandled = (reason: unknown) => {
				unhandled.push(reason)
			}
			process.on("unhandledRejection", onUnhandled)

			try {
				const inFlight = store.reconcile()
				store.dispose()
				releaseStat()
				await expect(inFlight).resolves.toBeUndefined()
				await new Promise((resolve) => setTimeout(resolve, 50))
			} finally {
				process.off("unhandledRejection", onUnhandled)
				statMock.mockImplementation((...args: Parameters<typeof fs.stat>) => fsSync.promises.stat(...args))
			}

			expect(unhandled).toEqual([])
			const writesAfterDispose = writeFileMock.mock.calls.filter((call) => call[0] === indexPath)
			expect(writesAfterDispose).toHaveLength(0)

			const raw = await fsSync.promises.readFile(indexPath, "utf8")
			expect(JSON.parse(raw).entries).toEqual([])
		})

		it("flushes index on dispose", async () => {
			await store.initialize()

			await store.upsert(makeHistoryItem({ id: "dispose-task" }))
			store.dispose()

			// Give the flush a moment to complete
			await new Promise((resolve) => setTimeout(resolve, 100))

			const indexPath = path.join(tmpDir, "tasks", GlobalFileNames.historyIndex)
			const raw = await fs.readFile(indexPath, "utf8")
			const index = JSON.parse(raw)
			expect(index.entries).toHaveLength(1)
		})
	})

	describe("invalidate()", () => {
		it("re-reads a task from disk", async () => {
			await store.initialize()

			const item = makeHistoryItem({ id: "invalidate-task", tokensIn: 100 })
			await store.upsert(item)

			// Manually update the file on disk
			const filePath = path.join(tmpDir, "tasks", "invalidate-task", GlobalFileNames.historyItem)
			const updated = { ...item, tokensIn: 999 }
			await fs.writeFile(filePath, JSON.stringify(updated))

			await store.invalidate("invalidate-task")

			expect(store.get("invalidate-task")!.tokensIn).toBe(999)
		})

		it("removes item from cache if file no longer exists", async () => {
			await store.initialize()

			const item = makeHistoryItem({ id: "gone-task" })
			await store.upsert(item)

			// Delete the file
			const filePath = path.join(tmpDir, "tasks", "gone-task", GlobalFileNames.historyItem)
			await fs.unlink(filePath)

			await store.invalidate("gone-task")

			expect(store.get("gone-task")).toBeUndefined()
		})
	})
})
