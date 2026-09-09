import { describe, expect, it } from "vitest"
import { BudgetExceededError, createBudget } from "../budget"
import { PersistedRootBudgetRepository } from "../budgetRepository"

describe("persisted root budget repository", () => {
	it("reserves and charges each idempotency key exactly once", async () => {
		const ledger = createBudget(100, 10, 4)
		const repository = new PersistedRootBudgetRepository("root", "run", ledger)
		await repository.reserve("assessment", "assessment", 20, 1)
		await repository.reserve("assessment", "assessment", 20, 1)
		await repository.charge("assessment", { inputTokens: 5, outputTokens: 3, cost: 0.5 }, true)
		await repository.charge("assessment", { inputTokens: 5, outputTokens: 3, cost: 0.5 }, true)
		expect(ledger).toMatchObject({
			reservedTokens: 0,
			reservedCalls: 0,
			usedCalls: 1,
			used: { inputTokens: 5, outputTokens: 3, cost: 0.5 },
		})
	})

	it("fails closed when provider usage is unknown", async () => {
		const ledger = createBudget(100)
		const repository = new PersistedRootBudgetRepository("root", "run", ledger)
		repository.reserve("acceptance", "acceptance", 10)
		await repository.charge("acceptance", undefined, false)
		expect(ledger.usageUnknown).toBe(true)
		expect(ledger.reservedTokens).toBe(10)
	})
	it("serializes durable mutations and restores one total after restart", async () => {
		let durable = createBudget(100)
		const persist = async (ledger: typeof durable) => {
			await Promise.resolve()
			durable = structuredClone(ledger)
		}
		const first = new PersistedRootBudgetRepository("root", "run", durable, persist)
		await first.reserve("assessment-attempt", "assessment", 20)
		await first.charge("assessment-attempt", { inputTokens: 4 }, true)

		const restarted = new PersistedRootBudgetRepository("root", "run", structuredClone(durable), persist)
		await restarted.reserve("worker-attempt", "execution", 30)
		await restarted.charge("worker-attempt", { outputTokens: 7 }, true)
		await restarted.reserve("acceptance-attempt", "acceptance", 10)
		await Promise.all([
			restarted.charge("acceptance-attempt", { reasoningTokens: 3 }, true),
			restarted.charge("acceptance-attempt", { reasoningTokens: 3 }, true),
		])

		expect(durable).toMatchObject({
			reservedTokens: 0,
			usedCalls: 3,
			used: { inputTokens: 4, outputTokens: 7, reasoningTokens: 3 },
		})
	})

	it("durably retains an ambiguous acceptance reservation", async () => {
		let durable = createBudget(100)
		const repository = new PersistedRootBudgetRepository("root", "run", durable, async (ledger) => {
			durable = structuredClone(ledger)
		})
		await repository.reserve("acceptance-attempt", "acceptance", 10)
		await repository.charge("acceptance-attempt", undefined, false)

		const restarted = new PersistedRootBudgetRepository("root", "run", structuredClone(durable))
		expect(restarted.getLedger()).toMatchObject({ reservedTokens: 10, reservedCalls: 1, usageUnknown: true })
	})

	it("blocks every new reservation after unknown usage, including after restart", async () => {
		let durable = createBudget(100)
		const first = new PersistedRootBudgetRepository("root", "run", durable, async (ledger) => {
			durable = structuredClone(ledger)
		})
		await first.reserve("worker-1", "execution", 10)
		await first.charge("worker-1", undefined, false)

		const restarted = new PersistedRootBudgetRepository("root", "run", structuredClone(durable))
		await expect(restarted.reserve("worker-2", "execution", 10)).rejects.toBeInstanceOf(BudgetExceededError)
		expect(restarted.getLedger()).toMatchObject({ reservedTokens: 10, reservedCalls: 1, usageUnknown: true })
	})
})
