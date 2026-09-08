import { afterEach, describe, expect, it, vi } from "vitest"
import { retryIndexApiOperation } from "../api-retry"

function httpError(status: number, retryAfter?: string): Error & { status: number; headers?: Headers } {
	return Object.assign(new Error(`HTTP ${status}`), {
		status,
		headers: retryAfter ? new Headers({ "retry-after": retryAfter }) : undefined,
	})
}

describe("retryIndexApiOperation", () => {
	afterEach(() => {
		vi.useRealTimers()
		vi.restoreAllMocks()
	})

	it("retries 503 with exponentially increasing delays and resets for the next operation", async () => {
		vi.useFakeTimers()
		const operation = vi
			.fn()
			.mockRejectedValueOnce(httpError(503))
			.mockRejectedValueOnce(httpError(503))
			.mockResolvedValue("ok")
		const notices: number[] = []
		const promise = retryIndexApiOperation(operation, {
			random: () => 0.5,
			onRetry: (notice) => notices.push(notice.delayMs),
		})
		await vi.advanceTimersByTimeAsync(1_000)
		await vi.advanceTimersByTimeAsync(2_000)
		await expect(promise).resolves.toBe("ok")
		expect(notices).toEqual([1_000, 2_000])
		expect(operation).toHaveBeenCalledTimes(3)

		const nextNotices: number[] = []
		const next = vi.fn().mockRejectedValueOnce(httpError(503)).mockResolvedValue("next")
		const nextPromise = retryIndexApiOperation(next, {
			random: () => 0.5,
			onRetry: (notice) => nextNotices.push(notice.delayMs),
		})
		await vi.advanceTimersByTimeAsync(1_000)
		await expect(nextPromise).resolves.toBe("next")
		expect(nextNotices).toEqual([1_000])
	})

	it("honors Retry-After seconds", async () => {
		vi.useFakeTimers()
		const operation = vi.fn().mockRejectedValueOnce(httpError(429, "7")).mockResolvedValue("ok")
		const promise = retryIndexApiOperation(operation, { random: () => 0.5 })
		await vi.advanceTimersByTimeAsync(6_999)
		expect(operation).toHaveBeenCalledTimes(1)
		await vi.advanceTimersByTimeAsync(1)
		await expect(promise).resolves.toBe("ok")
	})

	it("retries an identified network failure", async () => {
		vi.useFakeTimers()
		const operation = vi
			.fn()
			.mockRejectedValueOnce(Object.assign(new Error("socket hang up"), { code: "ECONNRESET" }))
			.mockResolvedValue("ok")
		const promise = retryIndexApiOperation(operation, { random: () => 0.5 })
		await vi.advanceTimersByTimeAsync(1_000)
		await expect(promise).resolves.toBe("ok")
	})

	it.each([400, 401, 403])("does not retry HTTP %s", async (status) => {
		const operation = vi.fn().mockRejectedValue(httpError(status))
		await expect(retryIndexApiOperation(operation)).rejects.toMatchObject({ status })
		expect(operation).toHaveBeenCalledTimes(1)
	})

	it("aborts during backoff without another request", async () => {
		vi.useFakeTimers()
		const controller = new AbortController()
		const operation = vi.fn().mockRejectedValue(httpError(503))
		const promise = retryIndexApiOperation(operation, { signal: controller.signal, random: () => 0.5 })
		await Promise.resolve()
		controller.abort()
		await expect(promise).rejects.toMatchObject({ name: "AbortError" })
		await vi.runAllTimersAsync()
		expect(operation).toHaveBeenCalledTimes(1)
	})
})
