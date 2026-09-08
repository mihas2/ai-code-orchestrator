import { sanitizeErrorMessage } from "./validation-helpers"

export const INDEX_RETRY_BASE_DELAY_MS = 1_000
export const INDEX_RETRY_MAX_DELAY_MS = 5 * 60_000
export const INDEX_RETRY_JITTER_RATIO = 0.15

export interface IndexRetryNotice {
	attempt: number
	delayMs: number
	nextAttemptAt: number
	reason: string
}

function errorChain(error: unknown): any[] {
	const chain: any[] = []
	let current: any = error
	while (current && !chain.includes(current)) {
		chain.push(current)
		current = current.cause
	}
	return chain
}

export function getErrorStatus(error: unknown): number | undefined {
	for (const item of errorChain(error)) {
		const status = Number(item?.status ?? item?.statusCode ?? item?.response?.status)
		if (Number.isFinite(status) && status > 0) return status
	}
	return undefined
}

function retryAfterMs(error: unknown, now: number): number | undefined {
	for (const item of errorChain(error)) {
		const value =
			item?.headers?.get?.("retry-after") ??
			item?.headers?.["retry-after"] ??
			item?.response?.headers?.get?.("retry-after")
		if (value === undefined || value === null) continue
		const seconds = Number(value)
		if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000)
		const date = Date.parse(String(value))
		if (Number.isFinite(date)) return Math.max(0, date - now)
	}
	return undefined
}

export function isTransientIndexApiError(error: unknown): boolean {
	const status = getErrorStatus(error)
	if (status !== undefined) return status === 408 || status === 429 || status >= 500
	return errorChain(error).some((item) => {
		const code = String(item?.code ?? "").toUpperCase()
		const message = String(item?.message ?? "").toLowerCase()
		return (
			[
				"ECONNRESET",
				"ETIMEDOUT",
				"ECONNABORTED",
				"EAI_AGAIN",
				"ENETUNREACH",
				"EPIPE",
				"UND_ERR_CONNECT_TIMEOUT",
			].includes(code) || /network|socket hang up|connection reset|fetch failed|timed? out/.test(message)
		)
	})
}

function abortError(): DOMException {
	return new DOMException("Indexing aborted", "AbortError")
}

export async function abortableDelay(delayMs: number, signal?: AbortSignal): Promise<void> {
	if (signal?.aborted) throw abortError()
	await new Promise<void>((resolve, reject) => {
		const timer = setTimeout(done, delayMs)
		function done() {
			signal?.removeEventListener("abort", aborted)
			resolve()
		}
		function aborted() {
			clearTimeout(timer)
			reject(abortError())
		}
		signal?.addEventListener("abort", aborted, { once: true })
	})
}

export async function retryIndexApiOperation<T>(
	operation: () => Promise<T>,
	options: { signal?: AbortSignal; onRetry?: (notice: IndexRetryNotice) => void; random?: () => number } = {},
): Promise<T> {
	let failureCount = 0
	for (;;) {
		if (options.signal?.aborted) throw abortError()
		try {
			return await operation()
		} catch (error) {
			if (options.signal?.aborted) throw abortError()
			if (!isTransientIndexApiError(error)) throw error
			failureCount++
			const now = Date.now()
			const exponential = Math.min(INDEX_RETRY_BASE_DELAY_MS * 2 ** (failureCount - 1), INDEX_RETRY_MAX_DELAY_MS)
			const jitter = exponential * INDEX_RETRY_JITTER_RATIO * ((options.random ?? Math.random)() * 2 - 1)
			const delayMs = Math.min(
				INDEX_RETRY_MAX_DELAY_MS,
				Math.max(retryAfterMs(error, now) ?? 0, Math.round(exponential + jitter)),
			)
			const reason = sanitizeErrorMessage(error instanceof Error ? error.message : String(error))
			options.onRetry?.({ attempt: failureCount + 1, delayMs, nextAttemptAt: now + delayMs, reason })
			await abortableDelay(delayMs, options.signal)
		}
	}
}
