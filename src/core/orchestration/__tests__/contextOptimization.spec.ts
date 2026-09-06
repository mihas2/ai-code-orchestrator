import { describe, expect, it, vi } from "vitest"
import {
	ContentDigestCache,
	ContextOptimizationMetricsCollector,
	SentFileTracker,
	buildStablePrefixPrompt,
	deduplicateContext,
	digest,
} from "../contextOptimization"

describe("context optimization", () => {
	it("caches derived values by digest and misses after content changes", () => {
		const cache = new ContentDigestCache()
		const compute = vi.fn(() => ({ symbols: ["a"] }))
		expect(cache.getOrCompute("symbols", "const a=1", compute).hit).toBe(false)
		expect(cache.getOrCompute("symbols", "const a=1", compute).hit).toBe(true)
		expect(cache.getOrCompute("symbols", "const a=2", compute).hit).toBe(false)
		expect(compute).toHaveBeenCalledTimes(2)
		expect(digest("a")).toHaveLength(64)
	})

	it("deduplicates optional content but preserves required contract blocks", () => {
		const result = deduplicateContext([
			{ id: "system", content: "same" },
			{ id: "tool", content: "same" },
			{ id: "criterion", content: "same", required: true },
		])
		expect(result[1].content).toBe("@ref:system")
		expect(result[2].content).toBe("same")
	})

	it("places stable policy before variable context", () => {
		expect(buildStablePrefixPrompt({ stablePrefix: "POLICY", variableContext: "TASK" }, true)).toBe(
			"POLICY\n\nTASK",
		)
	})

	it("does not resend unchanged file representations", () => {
		const tracker = new SentFileTracker()
		expect(tracker.shouldSend("a.ts", "one")).toBe(true)
		expect(tracker.shouldSend("a.ts", "one")).toBe(false)
		expect(tracker.shouldSend("a.ts", "one", "lines:1-2")).toBe(true)
		expect(tracker.shouldSend("a.ts", "two")).toBe(true)
	})

	it("publishes only structured numeric metrics", () => {
		const collector = new ContextOptimizationMetricsCollector()
		collector.record({ inputTokens: 10, outputTokens: 3, cachedTokens: 4, contextSize: 100 })
		collector.increment("cacheHits")
		const publish = vi.fn()
		collector.publish(publish)
		expect(publish).toHaveBeenCalledWith({
			type: "contextOptimization",
			metrics: expect.objectContaining({ cacheHits: 1 }),
		})
	})
})
