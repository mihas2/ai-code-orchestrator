import { describe, expect, it } from "vitest"

import { UnboundModelsResponseError, parseUnboundModelsResponse } from "../unbound"

const model = { id: "provider/model", max_output_tokens: 4096, context_window: 128000 }

const objectMapFixture = {
	"anthropic/claude-opus-4-5": { max_output_tokens: 8192, context_window: 200000, supports_vision: true },
	"openai/gpt-5": { max_output_tokens: 16384, context_window: 400000 },
	"x-ai/grok-4": { max_output_tokens: 8192, context_window: 131072, supports_caching: true },
}

describe("parseUnboundModelsResponse", () => {
	it.each([
		["top-level array", [model]],
		["data envelope", { data: [model] }],
		["nested models envelope", { data: { models: [model] } }],
		["nested items envelope", { data: { items: [model] } }],
		["nested data envelope", { data: { data: [model] } }],
	])("accepts %s", (_name, payload) => {
		expect(parseUnboundModelsResponse(payload, 200)["provider/model"]).toMatchObject({
			maxTokens: 4096,
			contextWindow: 128000,
		})
	})

	it("normalizes the confirmed Unbound object-map response", () => {
		const models = parseUnboundModelsResponse(objectMapFixture, 200)

		expect(Object.keys(models)).toEqual(Object.keys(objectMapFixture))
		expect(models["anthropic/claude-opus-4-5"]).toMatchObject({ supportsImages: true, contextWindow: 200000 })
		expect(models["openai/gpt-5"]).toMatchObject({ maxTokens: 16384 })
		expect(models["x-ai/grok-4"]).toMatchObject({ supportsPromptCache: true })
	})

	it.each([null, {}, { data: null }, { data: { models: null } }, "not-json", { invalid: null }])(
		"rejects malformed shape %j",
		(payload) => {
			expect(() => parseUnboundModelsResponse(payload, 502)).toThrow(UnboundModelsResponseError)
			try {
				parseUnboundModelsResponse(payload, 502)
			} catch (error) {
				expect(error).toMatchObject({ status: 502 })
				expect((error as Error).message).not.toContain("secret")
			}
		},
	)

	it("ignores null and invalid entries but requires a valid catalog", () => {
		expect(parseUnboundModelsResponse([null, { id: "valid" }, {}])).toHaveProperty("valid")
		expect(() => parseUnboundModelsResponse([null, {}])).toThrow("valid string id")
	})
})
