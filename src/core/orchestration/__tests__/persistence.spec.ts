import { describe, expect, it } from "vitest"
import { GlobalStateOrchestrationPersistence } from "../persistence"

function stateWith(value: unknown) {
	const data: Record<string, unknown> = { [GlobalStateOrchestrationPersistence.KEY]: value }
	return {
		get: <T>(key: string) => data[key] as T | undefined,
		update: async (key: string, next: unknown) => {
			data[key] = next
		},
		data,
	}
}

const snapshot = (runId = "run-1"): any => ({
	run: { runId, status: "running", eventSequence: 0 },
	nodes: [],
	events: [],
	capturedAt: 1,
})

const event = (sequence: number): any => ({
	eventId: `event-${sequence}`,
	idempotencyKey: `key-${sequence}`,
	runId: "run-1",
	sequence,
	timestamp: sequence,
	type: "nodeReport",
	payload: {},
})

describe("GlobalStateOrchestrationPersistence", () => {
	it("safely ignores malformed state during load and recovery scan", async () => {
		const state = stateWith({ schemaVersion: 1, snapshots: { broken: { nope: true } } })
		const persistence = new GlobalStateOrchestrationPersistence(state)

		expect(await persistence.load("broken")).toBeUndefined()
		expect(await persistence.scanRecoverable()).toEqual([])
	})

	it("safely falls back for an unsupported schema version", async () => {
		const state = stateWith({ schemaVersion: 99, snapshots: { run: snapshot() } })
		const persistence = new GlobalStateOrchestrationPersistence(state)

		expect(await persistence.load("run")).toBeUndefined()
		expect(await persistence.scanRecoverable()).toEqual([])
	})

	it("keeps only the newest events when compacting history", async () => {
		const state = stateWith(undefined)
		const persistence = new GlobalStateOrchestrationPersistence(state)
		for (let sequence = 0; sequence < 1100; sequence++) {
			await persistence.save({ ...snapshot(), events: [] }, event(sequence))
		}

		const stored = (state.data[GlobalStateOrchestrationPersistence.KEY] as any).snapshots["run-1"]
		expect(stored.events.length).toBeLessThanOrEqual(1000)
		expect(stored.events[0].sequence).toBe(100)
		expect(stored.events.at(-1).sequence).toBe(1099)
	})
})
