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
		const timer = setTimeout(abort, request.timeoutMs)
		let stream: ReturnType<ApiHandler["createMessage"]>
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
			for await (const chunk of stream) {
				if (controller.signal.aborted) {
					await stream.return(undefined)
					throw new DOMException("Aborted", "AbortError")
				}
				if (chunk.type === "error") throw new Error(chunk.message)
				if (chunk.type === "text") {
					text += chunk.text
					if (text.length > request.maxOutputCharacters) {
						await stream.return(undefined)
						throw new Error("Lead output limit exceeded")
					}
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
			if (!usage.known) usage = { calls: 1, known: false }
			return { text, usage, modelId: this.api.getModel().id }
		} finally {
			clearTimeout(timer)
			request.signal.removeEventListener("abort", abort)
		}
	}
}
