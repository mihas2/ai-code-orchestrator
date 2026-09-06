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

export function createBudget(tokenLimit?: number, costLimit?: number): BudgetLedger {
	return {
		tokenLimit: tokenLimit === undefined ? undefined : validateBudget(tokenLimit),
		costLimit: costLimit === undefined ? undefined : validateBudget(costLimit),
		reservedTokens: 0,
		reservedCost: 0,
		used: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0 },
	}
}
export function reserveBudget(l: BudgetLedger, tokens = 0, cost = 0): void {
	tokens = validateBudget(tokens)
	cost = validateBudget(cost)
	if (l.tokenLimit !== undefined && totalTokens(l.used) + l.reservedTokens + tokens > l.tokenLimit)
		throw new BudgetExceededError("Token budget exceeded")
	if (l.costLimit !== undefined && (l.used.cost ?? 0) + l.reservedCost + cost > l.costLimit)
		throw new BudgetExceededError("Cost budget exceeded")
	l.reservedTokens += tokens
	l.reservedCost += cost
}
export function reconcileBudget(
	l: BudgetLedger,
	reservedTokens: number,
	reservedCost: number,
	usage: Partial<BudgetUsage>,
): void {
	l.reservedTokens = Math.max(0, l.reservedTokens - validateBudget(reservedTokens))
	l.reservedCost = Math.max(0, l.reservedCost - validateBudget(reservedCost))
	for (const k of ["inputTokens", "cachedInputTokens", "outputTokens", "reasoningTokens"] as const)
		l.used[k] += validateUsage(usage[k] ?? 0)
	if (usage.cost !== undefined) l.used.cost = (l.used.cost ?? 0) + validateUsage(usage.cost)
}
