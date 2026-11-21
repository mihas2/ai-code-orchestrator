import type { ClineMessage } from "@ai-code-orchestrator/types"

/**
 * Task ids are UUIDv7: the first 48 bits are the creation time in ms.
 * Returns undefined for ids that are not UUIDv7 (e.g. legacy v4 ids).
 */
export function getTaskCreationTime(taskId: string): number | undefined {
	const hex = taskId.replace(/-/g, "")
	if (!/^[0-9a-f]{32}$/i.test(hex) || hex[12] !== "7") {
		return undefined
	}
	return parseInt(hex.slice(0, 12), 16)
}

export function isNewTaskToolAsk(message: ClineMessage): boolean {
	if (message.type !== "ask" || message.ask !== "tool" || !message.text) {
		return false
	}
	try {
		return JSON.parse(message.text)?.tool === "newTask"
	} catch {
		return false
	}
}

/**
 * Maps the ts of every `newTask` tool ask and `subtask_result` say in a parent
 * task to the id of the child task it belongs to.
 *
 * Messages persisted by current versions carry `childTaskId` explicitly. For
 * older history it is reconstructed from the child ids' UUIDv7 creation times,
 * because mapping by index is wrong: the parent's ui_messages frequently miss
 * a `newTask` ask (e.g. the first one), which shifted every link to the
 * previous child and left the first subtask without a link.
 */
export function resolveSubtaskChildIds(messages: ClineMessage[], childIds: string[] = []): Map<number, string> {
	const result = new Map<number, string>()
	const known = new Set(childIds)
	const events = messages.filter((m) => m.say === "subtask_result" || isNewTaskToolAsk(m))

	const children = childIds.map((id) => ({ id, createdAt: getTaskCreationTime(id) }))
	const canUseTime = children.length > 0 && children.every((c) => c.createdAt !== undefined)

	if (!canUseTime) {
		// Legacy ids without timestamps: best effort index mapping of newTask asks.
		let index = 0
		for (const event of events) {
			if (event.childTaskId) {
				result.set(event.ts, event.childTaskId)
			} else if (isNewTaskToolAsk(event) && index < childIds.length) {
				result.set(event.ts, childIds[index])
			}
			if (isNewTaskToolAsk(event)) index++
		}
		return result
	}

	const sorted = [...children].sort((a, b) => a.createdAt! - b.createdAt!)

	// Delegation is sequential, so a result belongs to the newest child created before it.
	const childForResult = (ts: number) => sorted.filter((c) => c.createdAt! <= ts).at(-1)?.id

	for (const event of events) {
		if (event.say === "subtask_result") {
			const id = event.childTaskId ?? childForResult(event.ts)
			if (id && (event.childTaskId || known.has(id))) result.set(event.ts, id)
		}
	}

	events.forEach((event, index) => {
		if (!isNewTaskToolAsk(event)) return
		if (event.childTaskId) {
			result.set(event.ts, event.childTaskId)
			return
		}
		// The child spawned by this ask is the one whose result comes next.
		const next = events[index + 1]
		if (next?.say === "subtask_result") {
			const id = result.get(next.ts)
			if (id) result.set(event.ts, id)
			return
		}
		// No result (child still running, stopped or rejected): pick the child created
		// closest to this ask, between the surrounding subtask events.
		const prevTs = index > 0 ? events[index - 1].ts : -Infinity
		const nextTs = next ? next.ts : Infinity
		const candidates = sorted.filter((c) => c.createdAt! > prevTs && c.createdAt! < nextTs)
		const closest = candidates.sort(
			(a, b) => Math.abs(a.createdAt! - event.ts) - Math.abs(b.createdAt! - event.ts),
		)[0]
		if (closest) result.set(event.ts, closest.id)
	})

	return result
}
