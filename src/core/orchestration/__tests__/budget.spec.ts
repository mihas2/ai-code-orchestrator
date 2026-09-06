import { describe, expect, it, vi } from "vitest"
import {
	FINAL_PHASE_RESERVE_RATIO,
	allocateChildBudgets,
	createBudget,
	reconcileBudget,
	validateBudget,
	validateUsage,
} from "../budget"

describe("orchestration budget safety", () => {
	it("normalizes NaN usage and emits a structured warning", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
		expect(validateUsage(Number.parseFloat("invalid"))).toBe(0)
		expect(warn).toHaveBeenCalledWith({
			event: "budget_validation_failed",
			value: Number.NaN,
			normalized: 0,
			reason: "NaN/Infinity/negative",
		})
		warn.mockRestore()
	})

	it("normalizes Infinity budget values and emits a warning", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
		expect(validateBudget(Number.POSITIVE_INFINITY)).toBe(0)
		expect(warn).toHaveBeenCalledWith(expect.objectContaining({ value: Number.POSITIVE_INFINITY }))
		warn.mockRestore()
	})

	it("normalizes negative usage to zero", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
		expect(validateUsage(-1)).toBe(0)
		expect(warn).toHaveBeenCalledWith(expect.objectContaining({ value: -1, normalized: 0 }))
		warn.mockRestore()
	})

	it("reserves ten percent for the final phase when allocating children", () => {
		const allocation = allocateChildBudgets(1000, 2)
		expect(FINAL_PHASE_RESERVE_RATIO).toBe(0.1)
		expect(allocation.childBudget).toBe(450)
		expect(allocation.finalPhaseReserve).toBe(100)
	})

	it("reconciles cascading child usage against the parent budget", () => {
		const parent = createBudget(1000)
		reconcileBudget(parent, 500, 0, {
			inputTokens: 300,
			cachedInputTokens: 0,
			outputTokens: 0,
			reasoningTokens: 0,
		})
		expect(parent.used.inputTokens).toBe(300)
		expect(parent.tokenLimit! - parent.used.inputTokens).toBe(700)
	})

	it("reports an insufficient budget allocation for a zero budget", () => {
		const allocation = allocateChildBudgets(0, 2)
		expect(allocation.childBudget).toBe(0)
		expect(allocation.finalPhaseReserve).toBe(0)
		expect(allocation.error).toBe("insufficient budget")
	})
})
