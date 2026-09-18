import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import * as fs from "fs/promises"
import * as path from "path"
import { TaskHistoryStore } from "../TaskHistoryStore"
import type { HistoryItem } from "@ai-code-orchestrator/types"

describe("TaskHistoryStore - Atomic Parent-Child Links", () => {
	let store: TaskHistoryStore
	let tempDir: string

	beforeEach(async () => {
		tempDir = path.join(process.cwd(), "test-temp", `store-${Date.now()}-${Math.random()}`)
		await fs.mkdir(tempDir, { recursive: true })
		store = new TaskHistoryStore(tempDir)
		await store.initialize()
	})

	afterEach(async () => {
		store.dispose()
		// Wait a bit to ensure all async file operations complete
		await new Promise((resolve) => setTimeout(resolve, 50))
		await fs.rm(tempDir, { recursive: true, force: true }).catch((err) => {
			console.warn(`Failed to clean up test directory ${tempDir}:`, err)
		})
	})

	describe("updateParentChildLinks", () => {
		it("atomically updates both parent and child history items", async () => {
			const parentItem: HistoryItem = {
				id: "parent-1",
				number: 1,
				ts: Date.now(),
				task: "Parent task",
				tokensIn: 0,
				tokensOut: 0,
				cacheWrites: 0,
				cacheReads: 0,
				totalCost: 0,
				status: "active",
				childIds: [],
			}

			const childItem: HistoryItem = {
				id: "child-1",
				number: 2,
				ts: Date.now(),
				task: "Child task",
				tokensIn: 0,
				tokensOut: 0,
				cacheWrites: 0,
				cacheReads: 0,
				totalCost: 0,
				status: "active",
			}

			await store.upsert(parentItem)
			await store.upsert(childItem)

			// Perform atomic update
			await store.updateParentChildLinks({
				parentId: "parent-1",
				parentUpdate: {
					status: "delegated",
					delegatedToId: "child-1",
					awaitingChildId: "child-1",
					childIds: ["child-1"],
				},
				childId: "child-1",
				childUpdate: {
					parentTaskId: "parent-1",
				},
			})

			// Verify both were updated
			const updatedParent = store.get("parent-1")
			const updatedChild = store.get("child-1")

			expect(updatedParent?.status).toBe("delegated")
			expect(updatedParent?.delegatedToId).toBe("child-1")
			expect(updatedParent?.awaitingChildId).toBe("child-1")
			expect(updatedParent?.childIds).toEqual(["child-1"])

			expect(updatedChild?.parentTaskId).toBe("parent-1")
		})

		it("rolls back both updates if parent write fails", async () => {
			const parentItem: HistoryItem = {
				id: "parent-1",
				number: 1,
				ts: Date.now(),
				task: "Parent task",
				tokensIn: 0,
				tokensOut: 0,
				cacheWrites: 0,
				cacheReads: 0,
				totalCost: 0,
				status: "active",
				childIds: [],
			}

			const childItem: HistoryItem = {
				id: "child-1",
				number: 2,
				ts: Date.now(),
				task: "Child task",
				tokensIn: 0,
				tokensOut: 0,
				cacheWrites: 0,
				cacheReads: 0,
				totalCost: 0,
				status: "active",
			}

			await store.upsert(parentItem)
			await store.upsert(childItem)

			// Mock writeTaskFile to fail on parent
			const writeTaskFileSpy = vi.spyOn(store as any, "writeTaskFile")
			writeTaskFileSpy.mockImplementation(async (item: any) => {
				if (item.id === "parent-1") {
					throw new Error("Parent write failed")
				}
			})

			// Attempt atomic update
			await expect(
				store.updateParentChildLinks({
					parentId: "parent-1",
					parentUpdate: {
						status: "delegated",
						delegatedToId: "child-1",
						awaitingChildId: "child-1",
						childIds: ["child-1"],
					},
					childId: "child-1",
					childUpdate: {
						parentTaskId: "parent-1",
					},
				}),
			).rejects.toThrow("Failed to write parent-child link updates")

			// Verify neither was updated in cache
			const parent = store.get("parent-1")
			const child = store.get("child-1")

			expect(parent?.status).toBe("active")
			expect(parent?.delegatedToId).toBeUndefined()
			expect(parent?.childIds).toEqual([])

			expect(child?.parentTaskId).toBeUndefined()

			writeTaskFileSpy.mockRestore()
		})

		it("rolls back both updates if child write fails", async () => {
			const parentItem: HistoryItem = {
				id: "parent-1",
				number: 1,
				ts: Date.now(),
				task: "Parent task",
				tokensIn: 0,
				tokensOut: 0,
				cacheWrites: 0,
				cacheReads: 0,
				totalCost: 0,
				status: "active",
				childIds: [],
			}

			const childItem: HistoryItem = {
				id: "child-1",
				number: 2,
				ts: Date.now(),
				task: "Child task",
				tokensIn: 0,
				tokensOut: 0,
				cacheWrites: 0,
				cacheReads: 0,
				totalCost: 0,
				status: "active",
			}

			await store.upsert(parentItem)
			await store.upsert(childItem)

			// Mock writeTaskFile to fail on child
			const writeTaskFileSpy = vi.spyOn(store as any, "writeTaskFile")
			writeTaskFileSpy.mockImplementation(async (item: any) => {
				if (item.id === "child-1") {
					throw new Error("Child write failed")
				}
			})

			// Attempt atomic update
			await expect(
				store.updateParentChildLinks({
					parentId: "parent-1",
					parentUpdate: {
						status: "delegated",
						delegatedToId: "child-1",
						awaitingChildId: "child-1",
						childIds: ["child-1"],
					},
					childId: "child-1",
					childUpdate: {
						parentTaskId: "parent-1",
					},
				}),
			).rejects.toThrow("Failed to write parent-child link updates")

			// Verify neither was updated in cache
			const parent = store.get("parent-1")
			const child = store.get("child-1")

			expect(parent?.status).toBe("active")
			expect(parent?.delegatedToId).toBeUndefined()
			expect(parent?.childIds).toEqual([])

			expect(child?.parentTaskId).toBeUndefined()

			writeTaskFileSpy.mockRestore()
		})

		it("throws error if parent task not found", async () => {
			const childItem: HistoryItem = {
				id: "child-1",
				number: 1,
				ts: Date.now(),
				task: "Child task",
				tokensIn: 0,
				tokensOut: 0,
				cacheWrites: 0,
				cacheReads: 0,
				totalCost: 0,
				status: "active",
			}

			await store.upsert(childItem)

			await expect(
				store.updateParentChildLinks({
					parentId: "nonexistent-parent",
					parentUpdate: {
						status: "delegated",
						delegatedToId: "child-1",
						awaitingChildId: "child-1",
						childIds: ["child-1"],
					},
					childId: "child-1",
					childUpdate: {
						parentTaskId: "nonexistent-parent",
					},
				}),
			).rejects.toThrow("Parent task nonexistent-parent not found in history")
		})

		it("throws error if child task not found", async () => {
			const parentItem: HistoryItem = {
				id: "parent-1",
				number: 1,
				ts: Date.now(),
				task: "Parent task",
				tokensIn: 0,
				tokensOut: 0,
				cacheWrites: 0,
				cacheReads: 0,
				totalCost: 0,
				status: "active",
				childIds: [],
			}

			await store.upsert(parentItem)

			await expect(
				store.updateParentChildLinks({
					parentId: "parent-1",
					parentUpdate: {
						status: "delegated",
						delegatedToId: "nonexistent-child",
						awaitingChildId: "nonexistent-child",
						childIds: ["nonexistent-child"],
					},
					childId: "nonexistent-child",
					childUpdate: {
						parentTaskId: "parent-1",
					},
				}),
			).rejects.toThrow("Child task nonexistent-child not found in history")
		})

		it("persists atomic updates to disk", async () => {
			const parentItem: HistoryItem = {
				id: "parent-1",
				number: 1,
				ts: Date.now(),
				task: "Parent task",
				tokensIn: 0,
				tokensOut: 0,
				cacheWrites: 0,
				cacheReads: 0,
				totalCost: 0,
				status: "active",
				childIds: [],
			}

			const childItem: HistoryItem = {
				id: "child-1",
				number: 2,
				ts: Date.now(),
				task: "Child task",
				tokensIn: 0,
				tokensOut: 0,
				cacheWrites: 0,
				cacheReads: 0,
				totalCost: 0,
				status: "active",
			}

			await store.upsert(parentItem)
			await store.upsert(childItem)

			// Perform atomic update
			await store.updateParentChildLinks({
				parentId: "parent-1",
				parentUpdate: {
					status: "delegated",
					delegatedToId: "child-1",
					awaitingChildId: "child-1",
					childIds: ["child-1"],
				},
				childId: "child-1",
				childUpdate: {
					parentTaskId: "parent-1",
				},
			})

			// Create a new store instance to verify persistence
			const newStore = new TaskHistoryStore(tempDir)
			await newStore.initialize()

			const persistedParent = newStore.get("parent-1")
			const persistedChild = newStore.get("child-1")

			expect(persistedParent?.status).toBe("delegated")
			expect(persistedParent?.delegatedToId).toBe("child-1")
			expect(persistedParent?.awaitingChildId).toBe("child-1")
			expect(persistedParent?.childIds).toEqual(["child-1"])

			expect(persistedChild?.parentTaskId).toBe("parent-1")

			newStore.dispose()
		})

		it("serializes concurrent atomic updates through write lock", async () => {
			const parentItem: HistoryItem = {
				id: "parent-1",
				number: 1,
				ts: Date.now(),
				task: "Parent task",
				tokensIn: 0,
				tokensOut: 0,
				cacheWrites: 0,
				cacheReads: 0,
				totalCost: 0,
				status: "active",
				childIds: [],
			}

			const child1Item: HistoryItem = {
				id: "child-1",
				number: 2,
				ts: Date.now(),
				task: "Child 1 task",
				tokensIn: 0,
				tokensOut: 0,
				cacheWrites: 0,
				cacheReads: 0,
				totalCost: 0,
				status: "active",
			}

			const child2Item: HistoryItem = {
				id: "child-2",
				number: 3,
				ts: Date.now(),
				task: "Child 2 task",
				tokensIn: 0,
				tokensOut: 0,
				cacheWrites: 0,
				cacheReads: 0,
				totalCost: 0,
				status: "active",
			}

			await store.upsert(parentItem)
			await store.upsert(child1Item)
			await store.upsert(child2Item)

			// Fire two concurrent atomic updates
			const update1 = store.updateParentChildLinks({
				parentId: "parent-1",
				parentUpdate: {
					status: "delegated",
					delegatedToId: "child-1",
					awaitingChildId: "child-1",
					childIds: ["child-1"],
				},
				childId: "child-1",
				childUpdate: {
					parentTaskId: "parent-1",
				},
			})

			const update2 = store.updateParentChildLinks({
				parentId: "parent-1",
				parentUpdate: {
					status: "delegated",
					delegatedToId: "child-2",
					awaitingChildId: "child-2",
					childIds: ["child-1", "child-2"],
				},
				childId: "child-2",
				childUpdate: {
					parentTaskId: "parent-1",
				},
			})

			await Promise.all([update1, update2])

			// Verify final state is consistent (last update wins)
			const parent = store.get("parent-1")
			const child1 = store.get("child-1")
			const child2 = store.get("child-2")

			expect(parent?.status).toBe("delegated")
			expect(parent?.childIds).toContain("child-1")
			expect(parent?.childIds).toContain("child-2")

			expect(child1?.parentTaskId).toBe("parent-1")
			expect(child2?.parentTaskId).toBe("parent-1")
		})
	})
})
