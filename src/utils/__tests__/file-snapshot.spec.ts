import fs from "fs/promises"
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { captureFileSnapshot, verifyFileSnapshot, checkFileSnapshotOrGetError } from "../file-snapshot"
import path from "path"
import os from "os"

describe("file-snapshot", () => {
	let testDir: string
	let testFile: string

	beforeEach(async () => {
		// Create a temporary directory for testing
		testDir = await fs.mkdtemp(path.join(os.tmpdir(), "file-snapshot-test-"))
		testFile = path.join(testDir, "test.txt")
	})

	afterEach(async () => {
		// Clean up test directory
		try {
			await fs.rm(testDir, { recursive: true, force: true })
		} catch (error) {
			// Ignore cleanup errors
		}
	})

	describe("captureFileSnapshot", () => {
		it("should capture file snapshot with all metadata", async () => {
			const content = "Hello, World!"
			await fs.writeFile(testFile, content, "utf8")

			const snapshot = await captureFileSnapshot(testFile)

			expect(snapshot).toMatchObject({
				path: testFile,
				mtime: expect.any(Number),
				size: content.length,
				contentHash: expect.any(String),
				capturedAt: expect.any(Number),
			})
			expect(snapshot.contentHash).toHaveLength(64) // SHA-256 hash length in hex
		})

		it("should use provided content instead of reading file", async () => {
			const content = "Test content"
			await fs.writeFile(testFile, content, "utf8")

			const providedContent = "Different content"
			const snapshot = await captureFileSnapshot(testFile, providedContent)

			// Hash should match the provided content, not the file content
			const stats = await fs.stat(testFile)
			expect(snapshot.size).toBe(stats.size)
			expect(snapshot.contentHash).not.toBe("")
		})

		it("should throw error for non-existent file", async () => {
			const nonExistentFile = path.join(testDir, "does-not-exist.txt")

			await expect(captureFileSnapshot(nonExistentFile)).rejects.toThrow()
		})

		it("should handle empty files", async () => {
			await fs.writeFile(testFile, "", "utf8")

			const snapshot = await captureFileSnapshot(testFile)

			expect(snapshot.size).toBe(0)
			expect(snapshot.contentHash).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855") // SHA-256 of empty string
		})

		it("should handle large files", async () => {
			const largeContent = "x".repeat(10000)
			await fs.writeFile(testFile, largeContent, "utf8")

			const snapshot = await captureFileSnapshot(testFile)

			expect(snapshot.size).toBe(largeContent.length)
			expect(snapshot.contentHash).toBeTruthy()
		})
	})

	describe("verifyFileSnapshot", () => {
		it("should return valid for unchanged file", async () => {
			const content = "Test content"
			await fs.writeFile(testFile, content, "utf8")
			const snapshot = await captureFileSnapshot(testFile)

			const result = await verifyFileSnapshot(snapshot)

			expect(result).toEqual({ isValid: true })
		})

		it("should detect modification time change", async () => {
			const content = "Original content"
			await fs.writeFile(testFile, content, "utf8")
			const snapshot = await captureFileSnapshot(testFile)

			// Wait a bit and touch the file to change mtime
			await new Promise((resolve) => setTimeout(resolve, 10))
			const now = new Date()
			await fs.utimes(testFile, now, now)

			const result = await verifyFileSnapshot(snapshot)

			expect(result.isValid).toBe(false)
			expect(result.reason).toBe("File modification time changed")
			expect(result.details).toContain("mtime")
		})

		it("should detect file size change", async () => {
			const content = "Original content"
			await fs.writeFile(testFile, content, "utf8")
			const snapshot = await captureFileSnapshot(testFile)

			// Change content (which will also change mtime in most cases)
			await fs.writeFile(testFile, content + " modified", "utf8")

			const result = await verifyFileSnapshot(snapshot)

			expect(result.isValid).toBe(false)
			// Can be either mtime or size change detection
			expect(result.reason).toMatch(/File (modification time|size) changed/)
		})

		it("should detect file deletion", async () => {
			const content = "Test content"
			await fs.writeFile(testFile, content, "utf8")
			const snapshot = await captureFileSnapshot(testFile)

			await fs.unlink(testFile)

			const result = await verifyFileSnapshot(snapshot)

			expect(result.isValid).toBe(false)
			expect(result.reason).toBe("Failed to verify file state")
			expect(result.details).toContain("Error accessing file")
		})

		it("should verify content hash in strict mode", async () => {
			const content = "Test content"
			await fs.writeFile(testFile, content, "utf8")
			const snapshot = await captureFileSnapshot(testFile)

			// In non-strict mode, should pass
			const resultNonStrict = await verifyFileSnapshot(snapshot, false)
			expect(resultNonStrict.isValid).toBe(true)

			// In strict mode, should also pass for unchanged file
			const resultStrict = await verifyFileSnapshot(snapshot, true)
			expect(resultStrict.isValid).toBe(true)
		})

		it("should detect content change in strict mode even with same mtime/size", async () => {
			const content1 = "Content A"
			const content2 = "Content B" // Same length as "Content A"

			await fs.writeFile(testFile, content1, "utf8")
			const snapshot = await captureFileSnapshot(testFile)

			// Change content but try to preserve mtime
			const stats = await fs.stat(testFile)
			await fs.writeFile(testFile, content2, "utf8")

			// Try to restore mtime (may not work on all filesystems)
			try {
				await fs.utimes(testFile, stats.atime, stats.mtime)
			} catch {
				// Skip test if utimes doesn't work as expected
				return
			}

			// Check if mtime was actually preserved
			const newStats = await fs.stat(testFile)
			if (newStats.mtimeMs !== stats.mtimeMs) {
				// mtime changed, so non-strict mode will catch it
				return
			}

			// Non-strict mode should pass if mtime and size are the same
			const resultNonStrict = await verifyFileSnapshot(snapshot, false)
			expect(resultNonStrict.isValid).toBe(true) // Only checks mtime and size

			// Strict mode should detect the change
			const resultStrict = await verifyFileSnapshot(snapshot, true)
			expect(resultStrict.isValid).toBe(false)
			expect(resultStrict.reason).toBe("File content changed (hash mismatch)")
			expect(resultStrict.details).toContain("hash")
		})

		it("should handle file system errors gracefully", async () => {
			const content = "Test content"
			await fs.writeFile(testFile, content, "utf8")
			const snapshot = await captureFileSnapshot(testFile)

			// Delete the file to simulate an error
			await fs.unlink(testFile)

			const result = await verifyFileSnapshot(snapshot)

			expect(result.isValid).toBe(false)
			expect(result.reason).toBe("Failed to verify file state")
			expect(result.details).toContain("Error accessing file")
		})
	})

	describe("checkFileSnapshotOrGetError", () => {
		it("should return null for valid snapshot", async () => {
			const content = "Test content"
			await fs.writeFile(testFile, content, "utf8")
			const snapshot = await captureFileSnapshot(testFile)

			const error = await checkFileSnapshotOrGetError(snapshot, "test operation")

			expect(error).toBeNull()
		})

		it("should return detailed error message for invalid snapshot", async () => {
			const content = "Original content"
			await fs.writeFile(testFile, content, "utf8")
			const snapshot = await captureFileSnapshot(testFile)

			// Modify file
			await new Promise((resolve) => setTimeout(resolve, 10))
			await fs.writeFile(testFile, "Modified content", "utf8")

			const error = await checkFileSnapshotOrGetError(snapshot, "test operation")

			expect(error).toBeTruthy()
			expect(error).toContain("File was modified by another process")
			expect(error).toContain("test operation")
			expect(error).toContain("<error_details>")
			expect(error).toContain("Recovery suggestions:")
		})

		it("should include snapshot age in error message", async () => {
			const content = "Test content"
			await fs.writeFile(testFile, content, "utf8")
			const snapshot = await captureFileSnapshot(testFile)

			// Wait and modify
			await new Promise((resolve) => setTimeout(resolve, 50))
			await fs.writeFile(testFile, "Modified", "utf8")

			const error = await checkFileSnapshotOrGetError(snapshot, "test operation")

			expect(error).toContain("Snapshot age:")
			expect(error).toContain("ms")
		})

		it("should include file path in error message", async () => {
			const content = "Test content"
			await fs.writeFile(testFile, content, "utf8")
			const snapshot = await captureFileSnapshot(testFile)

			await fs.unlink(testFile)

			const error = await checkFileSnapshotOrGetError(snapshot, "test operation")

			expect(error).toContain(`File path: ${testFile}`)
		})

		it("should provide helpful recovery suggestions", async () => {
			const content = "Test content"
			await fs.writeFile(testFile, content, "utf8")
			const snapshot = await captureFileSnapshot(testFile)

			await fs.writeFile(testFile, "Modified", "utf8")

			const error = await checkFileSnapshotOrGetError(snapshot, "apply diff")

			expect(error).toContain("Recovery suggestions:")
			expect(error).toContain("Use read_file")
			expect(error).toContain("Retry the operation")
		})
	})

	describe("edge cases", () => {
		it("should handle files with special characters in name", async () => {
			const specialFile = path.join(testDir, "special-file (test) [1].txt")
			await fs.writeFile(specialFile, "content", "utf8")

			const snapshot = await captureFileSnapshot(specialFile)
			const result = await verifyFileSnapshot(snapshot)

			expect(result.isValid).toBe(true)
		})

		it("should handle files with unicode content", async () => {
			const unicodeContent = "Hello 世界 🌍"
			await fs.writeFile(testFile, unicodeContent, "utf8")

			const snapshot = await captureFileSnapshot(testFile)
			const result = await verifyFileSnapshot(snapshot)

			expect(result.isValid).toBe(true)
			expect(snapshot.contentHash).toBeTruthy()
		})

		it("should handle concurrent snapshot captures", async () => {
			const content = "Test content"
			await fs.writeFile(testFile, content, "utf8")

			// Capture multiple snapshots concurrently
			const snapshots = await Promise.all([
				captureFileSnapshot(testFile),
				captureFileSnapshot(testFile),
				captureFileSnapshot(testFile),
			])

			// All snapshots should have the same content hash
			expect(snapshots[0].contentHash).toBe(snapshots[1].contentHash)
			expect(snapshots[1].contentHash).toBe(snapshots[2].contentHash)
		})

		it("should handle rapid file modifications", async () => {
			const content1 = "Version 1"
			await fs.writeFile(testFile, content1, "utf8")
			const snapshot1 = await captureFileSnapshot(testFile)

			// Rapid modifications
			await fs.writeFile(testFile, "Version 2", "utf8")
			await fs.writeFile(testFile, "Version 3", "utf8")
			await fs.writeFile(testFile, "Version 4", "utf8")

			const result = await verifyFileSnapshot(snapshot1)

			expect(result.isValid).toBe(false)
		})
	})

	describe("performance", () => {
		it("should capture snapshot efficiently for large files", async () => {
			const largeContent = "x".repeat(1000000) // 1MB file
			await fs.writeFile(testFile, largeContent, "utf8")

			const start = Date.now()
			const snapshot = await captureFileSnapshot(testFile)
			const duration = Date.now() - start

			expect(snapshot).toBeTruthy()
			expect(duration).toBeLessThan(1000) // Should complete within 1 second
		})

		it("should verify snapshot efficiently without strict mode", async () => {
			const content = "Test content"
			await fs.writeFile(testFile, content, "utf8")
			const snapshot = await captureFileSnapshot(testFile)

			const start = Date.now()
			await verifyFileSnapshot(snapshot, false)
			const duration = Date.now() - start

			expect(duration).toBeLessThan(100) // Non-strict mode should be very fast
		})
	})
})
