import { randomUUID } from "node:crypto"
import { z } from "zod"
import type { OrchestrationEvent, OrchestrationSnapshot } from "./types"

export interface IntegrationProvenanceRecord {
	key: string
	runId: string
	nodeId: string
	attempt: number
	artifactHash: string
	paths: string[]
	state: "pending" | "applied"
	artifactRefs: string[]
}
export interface IntegrationProvenanceStore {
	loadIntegrationProvenance(runId: string): Promise<IntegrationProvenanceRecord[]>
	saveIntegrationProvenance(record: IntegrationProvenanceRecord): Promise<void>
}
export interface GlobalStateLike {
	get<T>(key: string, defaultValue?: T): T | undefined
	update(key: string, value: unknown): Thenable<void> | Promise<void>
}
export interface OrchestrationPersistence {
	load(runId: string): Promise<OrchestrationSnapshot | undefined>
	save(snapshot: OrchestrationSnapshot, event?: OrchestrationEvent): Promise<void>
	scanRecoverable(): Promise<OrchestrationSnapshot[]>
	acquireLease?(runId: string, ttlMs?: number): Promise<string>
	releaseLease?(runId: string, token: string): Promise<void>
}
interface Store {
	schemaVersion: 1
	snapshots: Record<string, OrchestrationSnapshot>
	leases?: Record<string, { token: string; expiresAt: number }>
	integrations?: Record<string, IntegrationProvenanceRecord>
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
const storeSchema = z.object({
	schemaVersion: z.literal(1),
	snapshots: z.record(z.unknown()),
	leases: z.record(z.object({ token: z.string(), expiresAt: z.number() })).optional(),
	integrations: z.record(z.unknown()).optional(),
})
export class GlobalStateOrchestrationPersistence implements OrchestrationPersistence {
	static readonly KEY = "orchestration.runtime.v1"
	private queue: Promise<void> = Promise.resolve()
	constructor(private readonly state: GlobalStateLike) {}
	/** globalState has no atomic CAS; leases provide detectable ownership, not linearizable cross-process locking. */
	async acquireLease(runId: string, ttlMs = 30_000): Promise<string> {
		const token = randomUUID()
		const operation = this.queue
			.catch(() => undefined)
			.then(async () => {
				const store = this.read()
				const current = store.leases?.[runId]
				if (current && current.expiresAt > Date.now())
					throw new Error("Orchestration run is owned by another lease")
				store.leases = { ...(store.leases ?? {}), [runId]: { token, expiresAt: Date.now() + ttlMs } }
				await this.state.update(GlobalStateOrchestrationPersistence.KEY, store)
				const persisted = this.read().leases?.[runId]
				if (persisted?.token !== token) throw new Error("Orchestration lease acquisition conflicted")
			})
		this.queue = operation.catch(() => undefined)
		await operation
		return token
	}
	async releaseLease(runId: string, token: string): Promise<void> {
		const operation = this.queue
			.catch(() => undefined)
			.then(async () => {
				const store = this.read()
				if (store.leases?.[runId]?.token !== token) throw new Error("Stale orchestration lease")
				const leases = { ...(store.leases ?? {}) }
				delete leases[runId]
				store.leases = leases
				await this.state.update(GlobalStateOrchestrationPersistence.KEY, store)
			})
		this.queue = operation.catch(() => undefined)
		return operation
	}
	async load(id: string) {
		return this.read().snapshots[id]
	}
	async save(snapshot: OrchestrationSnapshot, event?: OrchestrationEvent): Promise<void> {
		this.queue = this.queue
			.catch(() => undefined)
			.then(async () => {
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
	async loadIntegrationProvenance(runId: string): Promise<IntegrationProvenanceRecord[]> {
		return Object.values(this.read().integrations ?? {}).filter((record) => record.runId === runId)
	}
	async saveIntegrationProvenance(record: IntegrationProvenanceRecord): Promise<void> {
		const operation = this.queue
			.catch(() => undefined)
			.then(async () => {
				const store = this.read()
				store.integrations = { ...(store.integrations ?? {}), [record.key]: record }
				await this.state.update(GlobalStateOrchestrationPersistence.KEY, store)
				const persisted = this.read().integrations?.[record.key]
				if (!persisted || persisted.state !== record.state)
					throw new Error("Integration provenance persistence conflicted")
			})
		this.queue = operation.catch(() => undefined)
		return operation
	}
	async scanRecoverable() {
		return Object.values(this.read().snapshots).filter(
			(s) => !["completed", "failed", "canceled"].includes(s.run.status),
		)
	}
	private read(): Store {
		const raw = this.state.get<unknown>(GlobalStateOrchestrationPersistence.KEY)
		const parsed = storeSchema.safeParse(raw)
		if (!parsed.success) return { schemaVersion: 1, snapshots: {}, leases: {} }

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
		const integrations: Record<string, IntegrationProvenanceRecord> = {}
		for (const [key, value] of Object.entries(parsed.data.integrations ?? {})) {
			if (value && typeof value === "object" && (value as IntegrationProvenanceRecord).key === key)
				integrations[key] = value as IntegrationProvenanceRecord
		}
		return { schemaVersion: 1, snapshots, leases: parsed.data.leases ?? {}, integrations }
	}
}
