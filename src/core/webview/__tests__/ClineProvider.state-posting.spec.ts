import { describe, expect, it, vi } from "vitest"

import { ClineProvider } from "../ClineProvider"

describe("ClineProvider state posting", () => {
	it("coalesces rapid full-state posts and delivers the latest state after 32ms", async () => {
		vi.useFakeTimers()
		const provider = Object.create(ClineProvider.prototype) as ClineProvider
		;(provider as any).clineMessagesSeq = 0
		const getState = vi.spyOn(provider, "getStateToPostToWebview").mockResolvedValue({ mode: "code" } as never)
		const postMessage = vi.spyOn(provider, "postMessageToWebview").mockResolvedValue(undefined)

		const posts = Array.from({ length: 10 }, () => provider.postStateToWebview())
		expect(postMessage).not.toHaveBeenCalled()

		await vi.advanceTimersByTimeAsync(32)
		await Promise.all(posts)

		expect(getState).toHaveBeenCalledTimes(1)
		expect(postMessage).toHaveBeenCalledTimes(1)
		expect(postMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				type: "state",
				state: expect.objectContaining({ mode: "code", clineMessagesSeq: 1 }),
			}),
		)
		vi.useRealTimers()
	})

	it("requests state without building task history for incremental posts", async () => {
		const provider = Object.create(ClineProvider.prototype) as ClineProvider
		const getState = vi.spyOn(provider, "getStateToPostToWebview").mockResolvedValue({ taskHistory: [] } as never)
		const postMessage = vi.spyOn(provider, "postMessageToWebview").mockResolvedValue(undefined)

		await provider.postStateToWebviewWithoutTaskHistory()

		expect(getState).toHaveBeenCalledWith({ includeTaskHistory: false })
		expect(postMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				type: "state",
				state: expect.not.objectContaining({ taskHistory: expect.anything() }),
			}),
		)
	})
})
