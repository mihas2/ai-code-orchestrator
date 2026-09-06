import axios from "axios"
import { z } from "zod"

import type { ModelInfo } from "@ai-code-orchestrator/types"
import {
	VERCEL_AI_GATEWAY_VISION_ONLY_MODELS,
	VERCEL_AI_GATEWAY_VISION_AND_TOOLS_MODELS,
} from "@ai-code-orchestrator/types"

import type { ApiHandlerOptions } from "../../../shared/api"
import { parseApiPrice } from "../../../shared/cost"

/**
 * VercelAiGatewayPricing
 */

const vercelAiGatewayPricingSchema = z.object({
	input: z.string().optional(), // Image models don't have an input price.
	output: z.string().optional(), // Embedding and image models don't have an output price.
	input_cache_write: z.string().optional(),
	input_cache_read: z.string().optional(),
	image: z.string().optional(), // Only image models have an image price.
})

/**
 * VercelAiGatewayModel
 */

const vercelAiGatewayModelSchema = z.object({
	id: z.string(),
	object: z.string().optional(),
	created: z.number().optional(),
	owned_by: z.string().optional(),
	name: z.string().optional(),
	description: z.string().optional(),
	context_window: z.number().optional(),
	max_tokens: z.number().optional(),
	type: z.string(),
	pricing: vercelAiGatewayPricingSchema.optional(),
})

export type VercelAiGatewayModel = z.infer<typeof vercelAiGatewayModelSchema>

/**
 * VercelAiGatewayModelsResponse
 */

const vercelAiGatewayModelsResponseSchema = z.object({
	object: z.string().optional(),
	data: z.array(z.unknown()),
})

type VercelAiGatewayModelsResponse = z.infer<typeof vercelAiGatewayModelsResponseSchema>

/**
 * getVercelAiGatewayModels
 */

export async function getVercelAiGatewayModels(options?: ApiHandlerOptions): Promise<Record<string, ModelInfo>> {
	const models: Record<string, ModelInfo> = {}
	const baseURL = "https://ai-gateway.vercel.sh/v1"

	try {
		const response = await axios.get<unknown>(`${baseURL}/models`)
		const result = vercelAiGatewayModelsResponseSchema.safeParse(response.data)
		if (!result.success) {
			console.error("Vercel AI Gateway models response is invalid: expected a list of models")
			return models
		}

		let skipped = 0
		for (const rawModel of result.data.data) {
			const modelResult = vercelAiGatewayModelSchema.safeParse(rawModel)
			if (!modelResult.success) {
				skipped++
				continue
			}
			const model = modelResult.data
			const { id } = model

			// Only include language models for chat inference.
			// Embedding models are statically defined in embeddingModels.ts.
			if (model.type !== "language") {
				continue
			}

			models[id] = parseVercelAiGatewayModel({ id, model })
		}
		if (skipped > 0) {
			console.error(`Vercel AI Gateway skipped ${skipped} malformed model entr${skipped === 1 ? "y" : "ies"}`)
		}
	} catch (error) {
		console.error(
			`Error fetching Vercel AI Gateway models: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
		)
	}

	return models
}

/**
 * parseVercelAiGatewayModel
 */

export const parseVercelAiGatewayModel = ({ id, model }: { id: string; model: VercelAiGatewayModel }): ModelInfo => {
	const cacheWritesPrice = model.pricing?.input_cache_write
		? parseApiPrice(model.pricing?.input_cache_write)
		: undefined

	const cacheReadsPrice = model.pricing?.input_cache_read ? parseApiPrice(model.pricing?.input_cache_read) : undefined

	const supportsPromptCache = typeof cacheWritesPrice !== "undefined" && typeof cacheReadsPrice !== "undefined"
	const supportsImages =
		VERCEL_AI_GATEWAY_VISION_ONLY_MODELS.has(id) || VERCEL_AI_GATEWAY_VISION_AND_TOOLS_MODELS.has(id)

	const modelInfo: ModelInfo = {
		maxTokens: model.max_tokens ?? 8192,
		contextWindow: model.context_window ?? 200000,
		supportsImages,
		supportsPromptCache,
		inputPrice: parseApiPrice(model.pricing?.input),
		outputPrice: parseApiPrice(model.pricing?.output),
		cacheWritesPrice,
		cacheReadsPrice,
		description: model.description,
	}

	return modelInfo
}
