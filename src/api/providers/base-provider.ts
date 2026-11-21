import { Anthropic } from "@anthropic-ai/sdk"

import type { ModelInfo } from "@ai-code-orchestrator/types"

import type { ApiHandler, ApiHandlerCreateMessageMetadata, ProviderCapabilities } from "../index"
import { ApiStream } from "../transform/stream"
import { countTokens } from "../../utils/countTokens"
import { isMcpTool } from "../../utils/mcp-name"
import { normalizeToolSchema, prepareNativeToolSchema } from "../transform/tool-schema"

/**
 * Base class for API providers that implements common functionality.
 */
export abstract class BaseProvider implements ApiHandler {
	abstract createMessage(
		systemPrompt: string,
		messages: Anthropic.Messages.MessageParam[],
		metadata?: ApiHandlerCreateMessageMetadata,
	): ApiStream

	abstract getModel(): { id: string; info: ModelInfo }

	getCapabilities(): ProviderCapabilities {
		return { promptCaching: false, contextCaching: false, structuredOutput: false, toolCalling: true }
	}

	/**
	 * Prepares tools for OpenAI-style function calling.
	 *
	 * Built-in tools are normalized (additionalProperties: false, nullable unions collapsed)
	 * and sent with `strict: true` only when every parameter is required. Tools with optional
	 * parameters keep their authored `required` list and use `strict: false`, so the model can
	 * omit them instead of inventing values. MCP tools keep their server schema and `strict: false`.
	 */
	protected convertToolsForOpenAI(tools: any[] | undefined): any[] | undefined {
		if (!tools) {
			return undefined
		}

		return tools.map((tool) => {
			if (tool.type !== "function") {
				return tool
			}

			if (isMcpTool(tool.function.name)) {
				return { ...tool, function: { ...tool.function, strict: false } }
			}

			const prepared = prepareNativeToolSchema(tool.function.parameters)
			return {
				...tool,
				function: {
					...tool.function,
					strict: prepared.strict,
					parameters: prepared.parameters,
				},
			}
		})
	}

	/**
	 * Normalizes a tool parameter schema for OpenAI-style providers without forcing optional
	 * parameters into `required`. See {@link prepareNativeToolSchema}.
	 */
	protected convertToolSchemaForOpenAI(schema: any): any {
		return normalizeToolSchema(schema)
	}

	/**
	 * Default token counting implementation using tiktoken.
	 * Providers can override this to use their native token counting endpoints.
	 *
	 * @param content The content to count tokens for
	 * @returns A promise resolving to the token count
	 */
	async countTokens(content: Anthropic.Messages.ContentBlockParam[]): Promise<number> {
		if (content.length === 0) {
			return 0
		}

		return countTokens(content, { useWorker: true })
	}
}
