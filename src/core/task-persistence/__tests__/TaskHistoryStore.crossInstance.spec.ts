// pnpm --filter ai-code-orchestrator test core/task-persistence/__tests__/TaskHistoryStore.crossInstance.spec.ts

import * as fs from "fs/promises"
import * as path from "path"
import * as os from "os"

import type { HistoryItem } from "@ai-code-orchestrator/types"

import { TaskHistoryStore } from "../TaskHistoryStore"
import { GlobalFileNames } from "../../../shared/globalFileNames"

vi.mock("../../../utils/storage", () => ({
	getStorageBasePath: vi.fn().mockImplementation((defaultPath: string) => defaultPath),
}))

// Mock safeWriteJson with rename semantics (temp file + rename), matching production atomic replace.
// A plain writeFile would keep the same inode and can fail to bump mtimeMs within the same millisecond.
vi.mock("../../../utils/safeWriteJson", () => ({
	safeWriteJson: vi.fn().mockImplementation(async (filePath: string, data: any) => {
		await fs.mkdir(path.dirname(filePath), { recursive: true })
		const tempPath = `${filePath}.new_${Date.now()}_${Math.random().toString(36).substring(2)}.tmp`
		await fs.writeFile(tempPath, JSON.stringify(data, null, "\t"), "utf8")
		await fs.rename(tempPath, filePath)
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

describe("TaskHistoryStore cross-instance safety", () => {
	let tmpDir: string
	let storeA: TaskHistoryStore
	let storeB: TaskHistoryStore

	beforeEach(async () => {
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "task-history-cross-"))
		// Two stores pointing at the same globalStoragePath (simulating two VS Code windows)
		storeA = new TaskHistoryStore(tmpDir)
		storeB = new TaskHistoryStore(tmpDir)
	})

	afterEach(async () => {
		storeA.dispose()
		storeB.dispose()
		await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
	})

	it("two instances can write different tasks without conflict", async () => {
		await storeA.initialize()
		await storeB.initialize()

		// Instance A writes task-a
		await storeA.upsert(makeHistoryItem({ id: "task-a", task: "Task from instance A" }))

		// Instance B writes task-b
		await storeB.upsert(makeHistoryItem({ id: "task-b", task: "Task from instance B" }))

		// Each instance sees its own task
		expect(storeA.get("task-a")).toBeDefined()
		expect(storeB.get("task-b")).toBeDefined()

		// After reconciliation, instance A should see task-b and vice versa
		await storeA.reconcile()
		await storeB.reconcile()

		expect(storeA.get("task-b")).toBeDefined()
		expect(storeB.get("task-a")).toBeDefined()

		expect(storeA.getAll()).toHaveLength(2)
		expect(storeB.getAll()).toHaveLength(2)
	})

	it("reconciliation in instance B detects a task created by instance A", async () => {
		await storeA.initialize()
		await storeB.initialize()

		// Instance A creates a task
		const item = makeHistoryItem({ id: "cross-task", task: "Created by A" })
		await storeA.upsert(item)

		// Instance B doesn't know about it yet
		expect(storeB.get("cross-task")).toBeUndefined()

		// Reconciliation picks it up
		await storeB.reconcile()

		expect(storeB.get("cross-task")).toBeDefined()
		expect(storeB.get("cross-task")!.task).toBe("Created by A")
	})

	it("delete by instance A is detected by instance B reconciliation", async () => {
		await storeA.initialize()
		await storeB.initialize()

		// Both instances have a task
		const item = makeHistoryItem({ id: "shared-task" })
		await storeA.upsert(item)
		await storeB.reconcile() // B picks it up

		expect(storeB.get("shared-task")).toBeDefined()

		// Instance A deletes the task (per-task file + directory would be removed)
		await storeA.delete("shared-task")

		// Remove the task directory to simulate full deletion (deleteTaskWithId removes the dir)
		const taskDir = path.join(tmpDir, "tasks", "shared-task")
		await fs.rm(taskDir, { recursive: true, force: true })

		// Instance B still has it in cache
		expect(storeB.get("shared-task")).toBeDefined()

		// After reconciliation, instance B sees it's gone
		await storeB.reconcile()
		expect(storeB.get("shared-task")).toBeUndefined()
	})

	it("per-task file updates by one instance are visible to another after reconcile without invalidate", async () => {
		await storeA.initialize()
		await storeB.initialize()

		const item = makeHistoryItem({ id: "reconcile-update", tokensIn: 100, task: "before" })
		await storeA.upsert(item)
		await storeB.reconcile()
		expect(storeB.get("reconcile-update")!.tokensIn).toBe(100)

		// Atomic replace (rename) must change mtime so B's reconcile re-reads the file.
		await storeA.upsert({ ...item, tokensIn: 900, task: "after atomic replace" })

		const invalidateSpy = vi.spyOn(storeB, "invalidate")
		await storeB.reconcile()

		expect(invalidateSpy).not.toHaveBeenCalled()
		expect(storeB.get("reconcile-update")!.tokensIn).toBe(900)
		expect(storeB.get("reconcile-update")!.task).toBe("after atomic replace")
		invalidateSpy.mockRestore()
	})

	it("detects an atomic replace when mtimeMs is forced to collide but size or inode differs", async () => {
		await storeA.initialize()
		await storeB.initialize()

		const item = makeHistoryItem({ id: "mtime-collision", tokensIn: 11, task: "v1" })
		await storeA.upsert(item)
		await storeB.reconcile()
		expect(storeB.get("mtime-collision")!.tokensIn).toBe(11)

		const filePath = path.join(tmpDir, "tasks", "mtime-collision", GlobalFileNames.historyItem)
		const before = await fs.stat(filePath)
		const requested = new Date(Math.floor(before.mtimeMs / 1000) * 1000)
		await fs.utimes(filePath, requested, requested)
		const frozenMs = (await fs.stat(filePath)).mtimeMs
		// Re-baseline B against the pinned timestamp before the colliding replace.
		await storeB.reconcile()

		await storeA.upsert({
			...item,
			tokensIn: 88,
			task: "v2 longer body so the replaced file cannot share size",
		})
		await fs.utimes(filePath, requested, requested)

		const after = await fs.stat(filePath)
		expect(after.mtimeMs).toBe(frozenMs)
		expect(after.size === before.size && after.ino === before.ino).toBe(false)

		await storeB.reconcile()
		expect(storeB.get("mtime-collision")!.tokensIn).toBe(88)
		expect(storeB.get("mtime-collision")!.task).toBe("v2 longer body so the replaced file cannot share size")
	})

	it("per-task file updates by one instance are visible to another after invalidation", async () => {
		await storeA.initialize()
		await storeB.initialize()

		// Instance A creates a task
		const item = makeHistoryItem({ id: "update-task", tokensIn: 100 })
		await storeA.upsert(item)

		// Instance B picks it up via reconciliation
		await storeB.reconcile()
		expect(storeB.get("update-task")!.tokensIn).toBe(100)

		// Instance A updates the task
		await storeA.upsert({ ...item, tokensIn: 500 })

		// Instance B invalidates and re-reads
		await storeB.invalidate("update-task")
		expect(storeB.get("update-task")!.tokensIn).toBe(500)
	})

	it("concurrent writes to different tasks from two instances produce correct final state", async () => {
		await storeA.initialize()
		await storeB.initialize()

		// Write alternating tasks from each instance
		const promises = []
		for (let i = 0; i < 5; i++) {
			promises.push(storeA.upsert(makeHistoryItem({ id: `a-task-${i}`, ts: 1000 + i })))
			promises.push(storeB.upsert(makeHistoryItem({ id: `b-task-${i}`, ts: 2000 + i })))
		}

		await Promise.all(promises)

		// After reconciliation, both should see all 10 tasks
		await storeA.reconcile()
		await storeB.reconcile()

		expect(storeA.getAll().length).toBe(10)
		expect(storeB.getAll().length).toBe(10)
	})
})
