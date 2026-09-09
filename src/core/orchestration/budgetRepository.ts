import type { BudgetLedger, BudgetUsage } from "./types"
import { reconcileBudgetOnce, releaseBudgetOnce, reserveBudgetOnce } from "./budget"

export type BudgetOperation = "assessment" | "repair" | "acceptance" | "execution" | "rework"

export interface RootBudgetRepository {
	readonly rootTaskId: string
	readonly runId: string
	getLedger(): Readonly<BudgetLedger>
	reserve(key: string, operation: BudgetOperation, tokens: number, cost?: number): Promise<boolean>
	charge(key: string, usage: Partial<BudgetUsage> | undefined, usageKnown: boolean): Promise<void>
	release(key: string): Promise<void>
}

const rootQueues = new Map<string, Promise<void>>()

/** Serialized boundary for the one persisted root ledger. The save hook must reload
 * the current run before writing, so a captured orchestration snapshot cannot win. */
export class PersistedRootBudgetRepository implements RootBudgetRepository {
	constructor(
		public readonly rootTaskId: string,
		public readonly runId: string,
		private readonly ledger: BudgetLedger,
		private readonly persist?: (ledger: BudgetLedger) => Promise<void>,
		private readonly refresh?: (ledger: BudgetLedger) => Promise<void>,
	) {}

	getLedger(): Readonly<BudgetLedger> {
		return this.ledger
	}

	private mutate(operation: () => void): Promise<void> {
		const lockKey = `${this.rootTaskId}:${this.runId}`
		const prior = rootQueues.get(lockKey) ?? Promise.resolve()
		const next = prior
			.catch(() => undefined)
			.then(async () => {
				await this.refresh?.(this.ledger)
				operation()
				await this.persist?.(this.ledger)
			})
		rootQueues.set(
			lockKey,
			next.catch(() => undefined),
		)
		return next
	}

	reserve(key: string, _operation: BudgetOperation, tokens: number, cost = 0): Promise<boolean> {
		let reserved = false
		return this.mutate(() => {
			reserved = reserveBudgetOnce(this.ledger, `${this.runId}:${key}`, tokens, cost)
		}).then(() => reserved)
	}

	charge(key: string, usage: Partial<BudgetUsage> | undefined, usageKnown: boolean): Promise<void> {
		return this.mutate(() => {
			reconcileBudgetOnce(this.ledger, `${this.runId}:${key}`, usage, usageKnown)
		})
	}

	release(key: string): Promise<void> {
		return this.mutate(() => {
			releaseBudgetOnce(this.ledger, `${this.runId}:${key}`)
		})
	}
}
