import { z } from "zod"
import type { OrchestrationEvent, OrchestrationSnapshot } from "./types"
export interface GlobalStateLike {
	get<T>(key: string, defaultValue?: T): T | undefined
	update(key: string, value: unknown): Thenable<void> | Promise<void>
}
export interface OrchestrationPersistence {
	load(runId: string): Promise<OrchestrationSnapshot | undefined>
	save(snapshot: OrchestrationSnapshot, event?: OrchestrationEvent): Promise<void>
	scanRecoverable(): Promise<OrchestrationSnapshot[]>
}
interface Store {
	schemaVersion: 1
	snapshots: Record<string, OrchestrationSnapshot>
}

const MAX_EVENTS = 1000
const snapshotSchema = z
	.object({
		run: z.object({ runId: z.string(), status: z.string(), eventSequence: z.number().finite() }),
		nodes: z.array(z.unknown()),
		events: z.array(z.unknown()),
		capturedAt: z.number().finite(),
	})
	.passthrough()
const storeSchema = z.object({ schemaVersion: z.literal(1), snapshots: z.record(z.unknown()) })
export class GlobalStateOrchestrationPersistence implements OrchestrationPersistence {
	static readonly KEY = "orchestration.runtime.v1"
	private queue: Promise<void> = Promise.resolve()
	constructor(private readonly state: GlobalStateLike) {}
	async load(id: string) {
		return this.read().snapshots[id]
	}
	async save(snapshot: OrchestrationSnapshot, event?: OrchestrationEvent): Promise<void> {
		this.queue = this.queue.then(async () => {
			const store = this.read(),
				current = store.snapshots[snapshot.run.runId]
			if (current && snapshot.run.eventSequence < current.run.eventSequence)
				throw new Error("Stale orchestration snapshot")
			const events = [...(current?.events ?? [])]
			if (event && !events.some((e) => e.idempotencyKey === event.idempotencyKey)) events.push(event)
			store.snapshots[snapshot.run.runId] = { ...snapshot, events: events.slice(-MAX_EVENTS) }
			await this.state.update(GlobalStateOrchestrationPersistence.KEY, store)
		})
		return this.queue
	}
	async scanRecoverable() {
		return Object.values(this.read().snapshots).filter(
			(s) => !["completed", "failed", "canceled"].includes(s.run.status),
		)
	}
	private read(): Store {
		const raw = this.state.get<unknown>(GlobalStateOrchestrationPersistence.KEY)
		const parsed = storeSchema.safeParse(raw)
		if (!parsed.success) return { schemaVersion: 1, snapshots: {} }

		const snapshots: Record<string, OrchestrationSnapshot> = {}
		for (const [id, value] of Object.entries(parsed.data.snapshots)) {
			const snapshot = snapshotSchema.safeParse(value)
			if (snapshot.success) {
				snapshots[id] = {
					...(snapshot.data as unknown as OrchestrationSnapshot),
					events: (snapshot.data.events as OrchestrationEvent[]).slice(-MAX_EVENTS),
				}
			}
		}
		return { schemaVersion: 1, snapshots }
	}
}
