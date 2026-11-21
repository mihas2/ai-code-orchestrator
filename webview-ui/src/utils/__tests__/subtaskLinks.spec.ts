import type { ClineMessage } from "@ai-code-orchestrator/types"

import { getTaskCreationTime, resolveSubtaskChildIds } from "../subtaskLinks"

// Build a UUIDv7-shaped id whose embedded creation time is `ms`.
const v7 = (ms: number, suffix = "0") =>
	`${ms
		.toString(16)
		.padStart(12, "0")
		.replace(/^(.{8})(.{4})$/, "$1-$2")}-7000-8000-${suffix.padStart(12, "0")}`

const newTask = (ts: number, extra: Partial<ClineMessage> = {}): ClineMessage => ({
	type: "ask",
	ask: "tool",
	ts,
	text: JSON.stringify({ tool: "newTask", mode: "code", content: "do it" }),
	...extra,
})
const result = (ts: number, extra: Partial<ClineMessage> = {}): ClineMessage => ({
	type: "say",
	say: "subtask_result",
	ts,
	text: "done",
	...extra,
})
const text = (ts: number): ClineMessage => ({ type: "say", say: "text", ts, text: "..." })

describe("getTaskCreationTime", () => {
	it("decodes the UUIDv7 timestamp", () => {
		expect(getTaskCreationTime("01a13c65-cd59-713b-bbc8-3f676c42299c")).toBe(1792014667097)
	})

	it("returns undefined for non-v7 ids", () => {
		expect(getTaskCreationTime("9b2c7a4e-1d2f-4c3b-8a9d-0e1f2a3b4c5d")).toBeUndefined()
		expect(getTaskCreationTime("not-a-uuid")).toBeUndefined()
	})
})

describe("resolveSubtaskChildIds", () => {
	const c1 = v7(1_000, "1")
	const c2 = v7(2_000, "2")
	const c3 = v7(3_000, "3")

	it("links each newTask and result to its own child", () => {
		const messages = [newTask(990), result(1_500), text(1_600), newTask(1_990), result(2_500), newTask(2_990)]
		const map = resolveSubtaskChildIds(messages, [c1, c2, c3])

		expect(map.get(990)).toBe(c1)
		expect(map.get(1_500)).toBe(c1)
		expect(map.get(1_990)).toBe(c2)
		expect(map.get(2_500)).toBe(c2)
		// Last child is still running (no result yet).
		expect(map.get(2_990)).toBe(c3)
	})

	it("does not shift links when the first newTask ask is missing from history", () => {
		// Real-world case: first child spawned, but its newTask ask was never persisted.
		const messages = [text(900), result(1_500), newTask(1_990), result(2_500)]
		const map = resolveSubtaskChildIds(messages, [c1, c2])

		expect(map.get(1_500)).toBe(c1) // first subtask still has a link
		expect(map.get(1_990)).toBe(c2) // and the next one is not shifted to the previous child
		expect(map.get(2_500)).toBe(c2)
	})

	it("handles a newTask ask whose ts was refreshed after the child was created", () => {
		const messages = [newTask(1_003), result(1_500)]
		expect(resolveSubtaskChildIds(messages, [c1]).get(1_003)).toBe(c1)
	})

	it("does not link a rejected newTask ask to an unrelated child", () => {
		const messages = [newTask(500), text(600), result(1_500), newTask(1_700), text(1_800)]
		const map = resolveSubtaskChildIds(messages, [c1])

		expect(map.get(500)).toBe(c1)
		expect(map.has(1_700)).toBe(false)
	})

	it("prefers explicit childTaskId over inference", () => {
		const messages = [newTask(990, { childTaskId: c2 }), result(1_500, { childTaskId: c2 })]
		const map = resolveSubtaskChildIds(messages, [c1, c2])

		expect(map.get(990)).toBe(c2)
		expect(map.get(1_500)).toBe(c2)
	})

	it("returns an empty map when there are no subtasks", () => {
		expect(resolveSubtaskChildIds([text(1)], []).size).toBe(0)
	})

	it("falls back to index mapping for legacy non-v7 ids", () => {
		const legacy = ["9b2c7a4e-1d2f-4c3b-8a9d-0e1f2a3b4c5d", "1b2c7a4e-1d2f-4c3b-8a9d-0e1f2a3b4c5d"]
		const map = resolveSubtaskChildIds([newTask(1), result(2), newTask(3)], legacy)

		expect(map.get(1)).toBe(legacy[0])
		expect(map.get(3)).toBe(legacy[1])
	})
})
