import type { ModelInfo } from "@ai-code-orchestrator/types"

type StreamChunk =
	| { type: "text"; text: string }
	| { type: "usage"; inputTokens: number; outputTokens: number }
	| { type: "tool_call_partial"; index: number; id?: string; name?: string; arguments?: string }

type Message = { role: string; content: unknown }
type ToolDefinition = { function?: { name?: string } }

type MockOptions = {
	delayMs?: number
	chunkSize?: number
	errorMatcher?: RegExp
}

const sleep = (delayMs: number) => new Promise<void>((resolve) => setTimeout(resolve, delayMs))

function contentToText(content: unknown): string {
	if (typeof content === "string") return content
	if (!Array.isArray(content)) return ""
	return content
		.map((block) => {
			if (!block || typeof block !== "object") return ""
			const value = block as { text?: string; content?: unknown }
			return value.text ?? contentToText(value.content)
		})
		.join(" ")
}

/** Deterministic in-process AI used by the Extension Development Host. */
export class MockAIProvider {
	readonly id = `vscode-e2e-mock-${Date.now()}`
	private readonly delayMs: number
	private readonly chunkSize: number
	private readonly errorMatcher?: RegExp
	private readonly turns = new Map<string, number>()

	constructor(options: MockOptions = {}) {
		this.delayMs = options.delayMs ?? Number(process.env.MOCK_AI_DELAY_MS ?? 2)
		this.chunkSize = options.chunkSize ?? 24
		this.errorMatcher = options.errorMatcher
	}

	async *streamResponse(prompt: string): AsyncGenerator<string> {
		if (this.errorMatcher?.test(prompt)) throw new Error("Mock AI configured failure")
		const response = this.responseFor(prompt)
		for (let offset = 0; offset < response.length; offset += this.chunkSize) {
			if (this.delayMs > 0) await sleep(this.delayMs)
			yield response.slice(offset, offset + this.chunkSize)
		}
	}

	async *createMessage(
		_systemPrompt: string,
		messages: Message[],
		metadata?: { taskId?: string; tools?: ToolDefinition[] },
	): AsyncGenerator<StreamChunk> {
		const prompt = messages.map((message) => contentToText(message.content)).join("\n")
		if (this.errorMatcher?.test(prompt)) throw new Error("Mock AI configured failure")

		const taskId = metadata?.taskId ?? "completion"
		const turn = this.turns.get(taskId) ?? 0
		this.turns.set(taskId, turn + 1)
		const tool = this.nextTool(prompt, turn, metadata?.tools ?? [])

		if (tool) {
			const id = `mock-${taskId}-${turn}`
			const args = JSON.stringify(tool.arguments)
			yield { type: "tool_call_partial", index: 0, id, name: tool.name, arguments: args.slice(0, 20) }
			if (this.delayMs > 0) await sleep(this.delayMs)
			yield { type: "tool_call_partial", index: 0, arguments: args.slice(20) }
		} else {
			for await (const text of this.streamResponse(prompt)) yield { type: "text", text }
		}

		yield { type: "usage", inputTokens: Math.max(1, Math.ceil(prompt.length / 4)), outputTokens: 16 }
	}

	async completePrompt(prompt: string): Promise<string> {
		if (this.errorMatcher?.test(prompt)) throw new Error("Mock AI configured failure")
		if (/return only json plan/i.test(prompt)) return JSON.stringify(this.orchestrationPlan(prompt))
		let response = ""
		for await (const chunk of this.streamResponse(prompt)) response += chunk
		return response
	}

	getModel(): { id: string; info: ModelInfo } {
		return {
			id: "mock-e2e-model",
			info: { contextWindow: 128_000, maxTokens: 4_096, supportsImages: false, supportsPromptCache: false },
		}
	}

	async countTokens(content: unknown[]): Promise<number> {
		return Math.max(1, Math.ceil(contentToText(content).length / 4))
	}

	removeFromCache?: () => void

	private responseFor(prompt: string): string {
		if (/FRONTEND_RESULT/i.test(prompt)) return "FRONTEND_RESULT: frontend implementation completed."
		if (/BACKEND_RESULT/i.test(prompt)) return "BACKEND_RESULT: backend implementation completed."
		if (/INTEGRATION_RESULT/i.test(prompt)) return "INTEGRATION_RESULT: integration review completed."
		if (/CHILD_ROLE_MODEL_E2E/i.test(prompt)) return "CHILD_ROLE_MODEL_E2E"
		if (/ROLE_MODEL_E2E/i.test(prompt)) return "ROLE_MODEL_E2E"
		if (/simulate an API failure/i.test(prompt))
			return "Mock API failure reported; retry, skip, or abort. Selected skip."
		return "Mock AI completed the requested task successfully."
	}

	private nextTool(prompt: string, turn: number, tools: ToolDefinition[]) {
		const available = new Set(tools.map((tool) => tool.function?.name))
		const canCall = (name: string) => available.size === 0 || available.has(name)
		const completion = { name: "attempt_completion", arguments: { result: this.responseFor(prompt) } }

		if (/Delegate one code child/i.test(prompt) && turn === 0 && canCall("new_task")) {
			return {
				name: "new_task",
				arguments: { mode: "code", message: "Reply CHILD_ROLE_MODEL_E2E and complete." },
			}
		}
		if (/Delegate one child in orchestrator mode/i.test(prompt) && turn === 0 && canCall("new_task")) {
			return {
				name: "new_task",
				arguments: {
					mode: "orchestrator",
					message: "Delegate two grandchildren in code and architect, then synthesize them.",
				},
			}
		}
		if (/Delegate two grandchildren/i.test(prompt) && turn < 2 && canCall("new_task")) {
			return {
				name: "new_task",
				arguments: {
					mode: turn === 0 ? "code" : "architect",
					message: `Complete nested grandchild ${turn + 1}.`,
				},
			}
		}
		if (
			/exactly three sequential subtasks|Create three sequential subtasks/i.test(prompt) &&
			turn < 3 &&
			canCall("new_task")
		) {
			const requested = [
				"Implement the frontend portion of the todo app. Reply with FRONTEND_RESULT when complete.",
				/simulate an API failure/i.test(prompt)
					? "Simulate an API failure and report retry, skip, or abort."
					: /keep the second working/i.test(prompt)
						? "Keep working until cancelled."
						: "Design and implement the backend portion of the todo app. Reply with BACKEND_RESULT when complete.",
				"Review the frontend and backend integration. Reply with INTEGRATION_RESULT when complete.",
			]
			return {
				name: "new_task",
				arguments: { mode: ["code", "architect", "code"][turn], message: requested[turn] },
			}
		}
		if (/Keep working until cancelled/i.test(prompt)) {
			return undefined
		}
		return canCall("attempt_completion") ? completion : undefined
	}

	private orchestrationPlan(prompt: string) {
		const nested = /grandchildren|nested/i.test(prompt)
		const count = nested ? 2 : /three|exactly three/i.test(prompt) ? 3 : 1
		return {
			version: 1,
			nodes: Array.from({ length: count }, (_, index) => ({
				id: `n${index + 1}`,
				role: index === 0 && nested ? "orchestrator" : "worker",
				mode: index === 0 && nested ? "orchestrator" : index % 2 === 0 ? "code" : "architect",
				objective: `Complete deterministic E2E subtask ${index + 1}`,
				acceptanceCriteria: ["Return the expected mock result"],
				constraints: ["Do not access external services"],
				fileScopes: { include: ["apps/vscode-e2e"], exclude: [] },
				dependencies: index === 0 ? [] : [`n${index}`],
				tokenBudget: 256,
			})),
		}
	}
}
