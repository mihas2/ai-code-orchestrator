import axios from "axios"

import type { ModelInfo } from "@ai-code-orchestrator/types"

import { parseApiPrice } from "../../../shared/cost"

export class UnboundModelsResponseError extends Error {
	readonly status?: number

	constructor(message: string, status?: number) {
		super(message)
		this.name = "UnboundModelsResponseError"
		this.status = status
	}
}

type RawModel = Record<string, unknown>

function shapeDescription(value: unknown): string {
	if (Array.isArray(value)) return "array"
	if (value === null) return "null"
	if (typeof value === "object")
		return `object(keys=${
			Object.keys(value as object)
				.sort()
				.join(",") || "none"
		})`
	return typeof value
}

function extractRawModels(responseData: unknown): unknown {
	if (Array.isArray(responseData)) return responseData
	if (!responseData || typeof responseData !== "object") return responseData

	const envelope = responseData as Record<string, unknown>
	if (Array.isArray(envelope.data)) return envelope.data
	if (envelope.data && typeof envelope.data === "object") {
		const nested = envelope.data as Record<string, unknown>
		return nested.models ?? nested.items ?? nested.data
	}

	const objectMapModels = Object.entries(envelope)
		.filter(([, value]) => value !== null && typeof value === "object" && !Array.isArray(value))
		.map(([id, value]) => ({ ...(value as RawModel), id }))
	if (objectMapModels.length > 0) return objectMapModels

	return responseData
}

export function parseUnboundModelsResponse(responseData: unknown, status?: number): Record<string, ModelInfo> {
	const rawModels = extractRawModels(responseData)
	if (!Array.isArray(rawModels)) {
		throw new UnboundModelsResponseError(
			`Invalid Unbound models response: expected model array, received ${shapeDescription(responseData)}`,
			status,
		)
	}

	const models: Record<string, ModelInfo> = {}
	for (const rawModel of rawModels) {
		if (!rawModel || typeof rawModel !== "object" || typeof (rawModel as RawModel).id !== "string") continue
		const model = rawModel as RawModel
		models[model.id as string] = {
			maxTokens: typeof model.max_output_tokens === "number" ? model.max_output_tokens : 8192,
			contextWindow: typeof model.context_window === "number" ? model.context_window : 200_000,
			supportsPromptCache: model.supports_caching === true,
			supportsImages: model.supports_vision === true,
			inputPrice: parseApiPrice(model.input_price as string | number | undefined),
			outputPrice: parseApiPrice(model.output_price as string | number | undefined),
			description: typeof model.description === "string" ? model.description : undefined,
			cacheWritesPrice: parseApiPrice(model.caching_price as string | number | undefined),
			cacheReadsPrice: parseApiPrice(model.cached_price as string | number | undefined),
		}
	}
	if (rawModels.length > 0 && Object.keys(models).length === 0) {
		throw new UnboundModelsResponseError(
			"Invalid Unbound models response: model entries have no valid string id",
			status,
		)
	}
	return models
}

export async function getUnboundModels(apiKey?: string | null): Promise<Record<string, ModelInfo>> {
	const headers: Record<string, string> = {}
	if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`
	try {
		const response = await axios.get("https://api.getunbound.ai/models", { headers })
		return parseUnboundModelsResponse(response.data, response.status)
	} catch (error) {
		if (error instanceof UnboundModelsResponseError) throw error
		if (axios.isAxiosError(error)) {
			throw new UnboundModelsResponseError(
				`Unbound models request failed${error.response?.status ? ` (HTTP ${error.response.status})` : ""}`,
				error.response?.status,
			)
		}
		throw error
	}
}
