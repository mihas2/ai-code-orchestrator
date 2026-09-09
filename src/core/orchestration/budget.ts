import type { BudgetLedger, BudgetUsage } from "./types"

export const FINAL_PHASE_RESERVE_RATIO = 0.1

export class BudgetExceededError extends Error {}

const invalidBudgetValue = (value: number): number => {
	if (!Number.isFinite(value) || value < 0) {
		console.warn({
			event: "budget_validation_failed",
			value,
			normalized: 0,
			reason: "NaN/Infinity/negative",
		})
		return 0
	}
	return value
}

export function validateUsage(value: number): number {
	return invalidBudgetValue(value)
}

export function validateBudget(value: number): number {
	return invalidBudgetValue(value)
}

export function allocateChildBudgets(
	maxRunTokens: number,
	childCount: number,
): {
	childBudget: number
	finalPhaseReserve: number
	error?: string
} {
	const limit = validateBudget(maxRunTokens)
	const count = Math.max(0, Math.floor(validateBudget(childCount)))
	if (limit === 0 || count === 0)
		return { childBudget: 0, finalPhaseReserve: limit * FINAL_PHASE_RESERVE_RATIO, error: "insufficient budget" }
	const finalPhaseReserve = limit * FINAL_PHASE_RESERVE_RATIO
	return { childBudget: (limit - finalPhaseReserve) / count, finalPhaseReserve }
}

const totalTokens = (u: Partial<BudgetUsage>) =>
	validateUsage(u.inputTokens ?? 0) +
	validateUsage(u.cachedInputTokens ?? 0) +
	validateUsage(u.outputTokens ?? 0) +
	validateUsage(u.reasoningTokens ?? 0)

export function createBudget(tokenLimit?: number, costLimit?: number, callLimit?: number): BudgetLedger {
	return {
		tokenLimit: tokenLimit === undefined ? undefined : validateBudget(tokenLimit),
		costLimit: costLimit === undefined ? undefined : validateBudget(costLimit),
		callLimit: callLimit === undefined ? undefined : validateBudget(callLimit),
		reservedTokens: 0,
		reservedCost: 0,
		reservedCalls: 0,
		used: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0 },
		usedCalls: 0,
		usageByIdempotencyKey: {},
		usageUnknown: false,
	}
}

/** Reserve a call once. The key is persisted with the run snapshot and makes retries harmless. */
export function reserveBudgetOnce(l: BudgetLedger, key: string, tokens = 0, cost = 0): boolean {
	if (l.usageUnknown) throw new BudgetExceededError("Budget usage is unknown; reconcile before reserving")
	const existing = l.usageByIdempotencyKey?.[key]
	if (existing) return false
	reserveBudget(l, tokens, cost, 1)
	l.usageByIdempotencyKey = {
		...(l.usageByIdempotencyKey ?? {}),
		[key]: {
			reservedTokens: validateBudget(tokens),
			reservedCost: validateBudget(cost),
			calls: 1,
			reconciled: false,
		},
	}
	return true
}

/** Release a reservation for a call that was never dispatched. */
export function releaseBudgetOnce(l: BudgetLedger, key: string): boolean {
	const entry = l.usageByIdempotencyKey?.[key]
	if (!entry || entry.reconciled) return false
	l.reservedTokens = Math.max(0, l.reservedTokens - entry.reservedTokens)
	l.reservedCost = Math.max(0, l.reservedCost - entry.reservedCost)
	l.reservedCalls = Math.max(0, l.reservedCalls - entry.calls)
	entry.reconciled = true
	return true
}

/** Reconcile a previously reserved call exactly once; unknown usage fails closed. */
export function reconcileBudgetOnce(
	l: BudgetLedger,
	key: string,
	usage: Partial<BudgetUsage> | undefined,
	usageKnown: boolean,
): boolean {
	const entry = l.usageByIdempotencyKey?.[key]
	if (!entry || entry.reconciled) return false
	if (!usageKnown) {
		l.usageUnknown = true
		return false
	}
	reconcileBudget(l, entry.reservedTokens, entry.reservedCost, usage ?? {}, entry.calls)
	entry.reconciled = true
	return true
}

export function reserveBudget(l: BudgetLedger, tokens = 0, cost = 0, calls = 0): void {
	tokens = validateBudget(tokens)
	cost = validateBudget(cost)
	calls = validateBudget(calls)
	if (l.usageUnknown) throw new BudgetExceededError("Budget usage is unknown; reconcile before reserving")
	if (l.tokenLimit !== undefined && totalTokens(l.used) + l.reservedTokens + tokens > l.tokenLimit)
		throw new BudgetExceededError("Token budget exceeded")
	if (l.costLimit !== undefined && (l.used.cost ?? 0) + l.reservedCost + cost > l.costLimit)
		throw new BudgetExceededError("Cost budget exceeded")
	if (l.callLimit !== undefined && l.usedCalls + l.reservedCalls + calls > l.callLimit)
		throw new BudgetExceededError("Call budget exceeded")
	l.reservedTokens += tokens
	l.reservedCost += cost
	l.reservedCalls += calls
}
export function reconcileBudget(
	l: BudgetLedger,
	reservedTokens: number,
	reservedCost: number,
	usage: Partial<BudgetUsage>,
	calls = 0,
): void {
	l.reservedTokens = Math.max(0, l.reservedTokens - validateBudget(reservedTokens))
	l.reservedCost = Math.max(0, l.reservedCost - validateBudget(reservedCost))
	l.reservedCalls = Math.max(0, l.reservedCalls - validateBudget(calls))
	l.usedCalls += validateUsage(calls)
	for (const k of ["inputTokens", "cachedInputTokens", "outputTokens", "reasoningTokens"] as const)
		l.used[k] += validateUsage(usage[k] ?? 0)
	if (usage.cost !== undefined) l.used.cost = (l.used.cost ?? 0) + validateUsage(usage.cost)
}
