import fs from "fs/promises"
import crypto from "crypto"

/**
 * Represents a snapshot of a file's state at a specific point in time.
 * Used to detect concurrent modifications between read and write operations.
 */
export interface FileSnapshot {
	/** File path (relative or absolute) */
	path: string
	/** Modification time in milliseconds since epoch */
	mtime: number
	/** File size in bytes */
	size: number
	/** Content hash (SHA-256) for additional verification */
	contentHash: string
	/** Timestamp when snapshot was taken */
	capturedAt: number
}

/**
 * Creates a snapshot of a file's current state.
 * @param filePath Path to the file
 * @param content File content (if already read, to avoid re-reading)
 * @returns FileSnapshot object
 */
export async function captureFileSnapshot(filePath: string, content?: string): Promise<FileSnapshot> {
	const stats = await fs.stat(filePath)
	const fileContent = content ?? (await fs.readFile(filePath, "utf8"))
	const contentHash = crypto.createHash("sha256").update(fileContent, "utf8").digest("hex")

	return {
		path: filePath,
		mtime: stats.mtimeMs,
		size: stats.size,
		contentHash,
		capturedAt: Date.now(),
	}
}

/**
 * Verifies that a file hasn't been modified since the snapshot was taken.
 * @param snapshot The original snapshot to compare against
 * @param strictMode If true, also verifies content hash for absolute certainty
 * @returns Object with verification result and details
 */
export async function verifyFileSnapshot(
	snapshot: FileSnapshot,
	strictMode = false,
): Promise<{ isValid: boolean; reason?: string; details?: string }> {
	try {
		const currentStats = await fs.stat(snapshot.path)

		// Check modification time first (fastest check)
		if (currentStats.mtimeMs !== snapshot.mtime) {
			const timeDiff = currentStats.mtimeMs - snapshot.mtime
			return {
				isValid: false,
				reason: "File modification time changed",
				details: `File was modified ${timeDiff > 0 ? `${Math.round(timeDiff)}ms after` : `${Math.round(-timeDiff)}ms before`} snapshot was taken. Original mtime: ${new Date(snapshot.mtime).toISOString()}, Current mtime: ${new Date(currentStats.mtimeMs).toISOString()}`,
			}
		}

		// Check file size (also fast)
		if (currentStats.size !== snapshot.size) {
			return {
				isValid: false,
				reason: "File size changed",
				details: `Expected ${snapshot.size} bytes, found ${currentStats.size} bytes (diff: ${currentStats.size - snapshot.size} bytes)`,
			}
		}

		// If strict mode is enabled, verify content hash for absolute certainty
		if (strictMode) {
			const currentContent = await fs.readFile(snapshot.path, "utf8")
			const currentHash = crypto.createHash("sha256").update(currentContent, "utf8").digest("hex")

			if (currentHash !== snapshot.contentHash) {
				return {
					isValid: false,
					reason: "File content changed (hash mismatch)",
					details: `File content differs despite matching mtime and size. Expected hash: ${snapshot.contentHash.substring(0, 16)}..., Current hash: ${currentHash.substring(0, 16)}...`,
				}
			}
		}

		// If mtime and size are the same, file is likely unchanged
		return { isValid: true }
	} catch (error) {
		const errorMsg = error instanceof Error ? error.message : String(error)
		return {
			isValid: false,
			reason: "Failed to verify file state",
			details: `Error accessing file: ${errorMsg}`,
		}
	}
}

/**
 * Verifies file snapshot and returns a detailed error message if invalid.
 * @param snapshot The original snapshot
 * @param operationDescription Description of the operation being protected (e.g., "apply diff")
 * @returns null if valid, error message string if invalid
 */
export async function checkFileSnapshotOrGetError(
	snapshot: FileSnapshot,
	operationDescription: string,
): Promise<string | null> {
	const verification = await verifyFileSnapshot(snapshot)

	if (!verification.isValid) {
		const snapshotAge = Date.now() - snapshot.capturedAt
		return (
			`File was modified by another process before ${operationDescription} could complete.\n\n` +
			`<error_details>\n` +
			`Reason: ${verification.reason}\n` +
			`${verification.details ? `Details: ${verification.details}\n` : ""}` +
			`Snapshot age: ${snapshotAge}ms\n` +
			`File path: ${snapshot.path}\n\n` +
			`This indicates a race condition where the file changed between reading and writing.\n\n` +
			`Recovery suggestions:\n` +
			`1. Use read_file to get the current file contents\n` +
			`2. Retry the operation with the updated content\n` +
			`3. If this happens repeatedly, another process may be modifying the file\n` +
			`</error_details>`
		)
	}

	return null
}
