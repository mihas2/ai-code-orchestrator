import type { ApiHandler } from "../../api"
import type { LeadUsage } from "./leadSession"

export interface BoundedLeadRequest {
	requestId: string
	systemPrompt: string
	prompt: string
	signal: AbortSignal
	timeoutMs: number
	maxOutputCharacters: number
}
export interface BoundedLeadResult {
	text: string
	usage: LeadUsage
	modelId: string
}

/** Uses the selected route's streaming API so usage and cancellation stay observable. */
export class StreamingLeadProvider {
	constructor(private readonly api: ApiHandler) {}
	async complete(request: BoundedLeadRequest): Promise<BoundedLeadResult> {
		if (request.signal.aborted) throw new DOMException("Aborted", "AbortError")
		const controller = new AbortController()
		const abort = () => controller.abort()
		request.signal.addEventListener("abort", abort, { once: true })
		let stream: ReturnType<ApiHandler["createMessage"]>
		let iterator:
			| AsyncIterator<Awaited<ReturnType<ApiHandler["createMessage"]>> extends AsyncIterable<infer T> ? T : never>
			| undefined
		try {
			// Race acquisition as well as iteration; always clear the secondary timer
			// so a completed stream cannot later produce an unhandled rejection.
			let acquisitionTimer: ReturnType<typeof setTimeout> | undefined
			try {
				stream = await Promise.race([
					Promise.resolve(
						this.api.createMessage(request.systemPrompt, [{ role: "user", content: request.prompt }], {
							taskId: request.requestId,
							mode: "orchestrator",
							store: false,
							tools: [],
							tool_choice: "none",
							parallelToolCalls: false,
						}),
					),
					new Promise<never>((_, reject) => {
						acquisitionTimer = setTimeout(
							() => reject(new DOMException("Timed out", "TimeoutError")),
							request.timeoutMs,
						)
					}),
				])
			} finally {
				if (acquisitionTimer) clearTimeout(acquisitionTimer)
			}
		} catch (error) {
			controller.abort()
			throw error
		}
		let text = ""
		let usage: LeadUsage = { calls: 1, known: false }
		try {
			iterator = stream[Symbol.asyncIterator]()
			while (true) {
				const next = await nextWithTimeout(iterator, request.timeoutMs, controller.signal)
				if (next.done) break
				const chunk = next.value
				if (chunk.type === "error") throw new Error(chunk.message)
				if (chunk.type === "text") {
					text += chunk.text
					if (text.length > request.maxOutputCharacters) throw new Error("Lead output limit exceeded")
				}
				if (chunk.type === "usage")
					usage = {
						inputTokens: chunk.inputTokens,
						outputTokens: chunk.outputTokens,
						cost: chunk.totalCost,
						calls: 1,
						known: true,
					}
			}
			return { text, usage, modelId: this.api.getModel().id }
		} finally {
			controller.abort()
			await iterator?.return?.().catch(() => undefined)
			request.signal.removeEventListener("abort", abort)
		}
	}
}

async function nextWithTimeout<T>(iterator: AsyncIterator<T>, timeoutMs: number, signal: AbortSignal) {
	if (signal.aborted) throw new DOMException("Aborted", "AbortError")
	let timer: ReturnType<typeof setTimeout> | undefined
	try {
		return await Promise.race([
			iterator.next(),
			new Promise<never>((_, reject) => {
				timer = setTimeout(() => reject(new DOMException("Timed out", "TimeoutError")), timeoutMs)
			}),
			new Promise<never>((_, reject) =>
				signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), {
					once: true,
				}),
			),
		])
	} finally {
		if (timer) clearTimeout(timer)
	}
}
