import type { BudgetLedger, BudgetUsage } from "./types"
export class BudgetExceededError extends Error {}
const totalTokens = (u: Partial<BudgetUsage>) =>
	(u.inputTokens ?? 0) + (u.cachedInputTokens ?? 0) + (u.outputTokens ?? 0) + (u.reasoningTokens ?? 0)
export function createBudget(tokenLimit?: number, costLimit?: number): BudgetLedger {
	return {
		tokenLimit,
		costLimit,
		reservedTokens: 0,
		reservedCost: 0,
		used: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0 },
	}
}
export function reserveBudget(l: BudgetLedger, tokens = 0, cost = 0): void {
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
	l.reservedTokens = Math.max(0, l.reservedTokens - reservedTokens)
	l.reservedCost = Math.max(0, l.reservedCost - reservedCost)
	for (const k of ["inputTokens", "cachedInputTokens", "outputTokens", "reasoningTokens"] as const)
		l.used[k] += usage[k] ?? 0
	if (usage.cost !== undefined) l.used.cost = (l.used.cost ?? 0) + usage.cost
}
