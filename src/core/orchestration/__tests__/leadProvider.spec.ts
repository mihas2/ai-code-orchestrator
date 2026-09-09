import { describe, expect, it, vi } from "vitest"
import type { ApiHandler } from "../../../api"
import { StreamingLeadProvider } from "../leadProvider"

function request(timeoutMs = 10) {
	return {
		requestId: "request-1",
		systemPrompt: "system",
		prompt: "prompt",
		signal: new AbortController().signal,
		timeoutMs,
		maxOutputCharacters: 1000,
	}
}

describe("StreamingLeadProvider", () => {
	it("times out a hung iterator.next and closes the iterator", async () => {
		const returnIterator = vi.fn(async () => ({ done: true as const, value: undefined }))
		const stream = {
			[Symbol.asyncIterator]() {
				return {
					next: () => new Promise<IteratorResult<never>>(() => undefined),
					return: returnIterator,
				}
			},
		}
		const api = {
			createMessage: vi.fn(() => stream),
			getModel: vi.fn(() => ({ id: "test-model" })),
		} as unknown as ApiHandler

		await expect(new StreamingLeadProvider(api).complete(request())).rejects.toMatchObject({
			name: "TimeoutError",
		})
		expect(returnIterator).toHaveBeenCalledTimes(1)
	})

	it("cleans up the iterator when the caller aborts", async () => {
		const controller = new AbortController()
		const returnIterator = vi.fn(async () => ({ done: true as const, value: undefined }))
		const stream = {
			[Symbol.asyncIterator]() {
				return {
					next: () => new Promise<IteratorResult<never>>(() => undefined),
					return: returnIterator,
				}
			},
		}
		const api = {
			createMessage: vi.fn(() => stream),
			getModel: vi.fn(() => ({ id: "test-model" })),
		} as unknown as ApiHandler

		const completion = new StreamingLeadProvider(api).complete({ ...request(1000), signal: controller.signal })
		controller.abort()
		await expect(completion).rejects.toMatchObject({ name: "AbortError" })
		expect(returnIterator).toHaveBeenCalledTimes(1)
	})
})
