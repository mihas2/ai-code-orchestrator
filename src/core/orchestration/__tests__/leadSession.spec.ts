import { describe, expect, it, vi } from "vitest"
import { acceptanceGate, assertCurrentSession, VersionedLeadSessionStore, type LeadSession } from "../leadSession"

const session = (overrides: Partial<LeadSession> = {}): LeadSession => ({
	schemaVersion: 1,
	sessionId: "s1",
	requestId: "r1",
	rootTaskId: "root",
	goal: "goal",
	requestRevision: 0,
	fingerprint: "fp",
	configFingerprint: "cfg",
	workspaceFingerprint: "ws",
	phase: "executing",
	version: 1,
	evidence: [],
	usage: { calls: 1, known: false },
	reservations: { assessment: 100, execution: 800, acceptance: 100, used: 100 },
	updatedAt: 1,
	...overrides,
})

describe("durable lead session", () => {
	it("rejects stale versions and callbacks", async () => {
		let value: unknown
		const state = {
			get<T>() {
				return value as T | undefined
			},
			update: vi.fn(async (_key: string, next: unknown) => {
				value = next
			}),
		}
		const store = new VersionedLeadSessionStore(state)
		await store.save("root", session())
		await expect(store.save("root", session({ version: 2 }), 0)).rejects.toThrow("Stale")
		expect(() => assertCurrentSession(session(), "other", "fp", 1)).toThrow("Stale")
	})

	it("blocks partial and failed-test evidence and accepts read-only evidence without code artifacts", () => {
		const criteria = ["REQ-1"]
		expect(
			acceptanceGate(
				session(),
				criteria,
				[{ criterionId: "REQ-1", status: "unmet", source: "test", detail: "failed" }],
				1,
			).outcome,
		).toBe("rework")
		expect(
			acceptanceGate(
				session(),
				criteria,
				[{ criterionId: "REQ-1", status: "met", source: "research", detail: "documented" }],
				1,
			).outcome,
		).toBe("accepted")
	})

	it("does not block user cancellation", () => {
		expect(acceptanceGate(session({ phase: "canceled" }), ["REQ-1"], [], 1).outcome).toBe("accepted")
	})
})
