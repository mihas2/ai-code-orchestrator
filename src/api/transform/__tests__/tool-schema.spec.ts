import type OpenAI from "openai"

import { getNativeTools } from "../../../core/prompts/tools/native-tools"
import { normalizeToolSchema, prepareNativeToolSchema, requiresAllProperties } from "../tool-schema"

type FunctionTool = OpenAI.Chat.ChatCompletionFunctionTool

function collectObjectSchemas(schema: any, out: any[] = []): any[] {
	if (!schema || typeof schema !== "object") return out
	if (schema.type === "object") {
		out.push(schema)
		for (const prop of Object.values(schema.properties ?? {})) collectObjectSchemas(prop, out)
	}
	if (schema.type === "array") collectObjectSchemas(schema.items, out)
	return out
}

describe("tool-schema", () => {
	describe("requiresAllProperties", () => {
		it("is true when every property is required, recursively", () => {
			expect(
				requiresAllProperties({
					type: "object",
					properties: {
						a: { type: "string" },
						b: {
							type: "array",
							items: { type: "object", properties: { c: { type: "string" } }, required: ["c"] },
						},
					},
					required: ["a", "b"],
				}),
			).toBe(true)
		})

		it("is false when a top-level or nested property is optional", () => {
			expect(requiresAllProperties({ type: "object", properties: { a: { type: "string" } }, required: [] })).toBe(
				false,
			)
			expect(
				requiresAllProperties({
					type: "object",
					properties: { o: { type: "object", properties: { x: { type: "number" } }, required: [] } },
					required: ["o"],
				}),
			).toBe(false)
		})
	})

	describe("normalizeToolSchema", () => {
		it("collapses nullable unions and adds additionalProperties: false recursively", () => {
			const result = normalizeToolSchema({
				type: "object",
				properties: {
					cwd: { type: ["string", "null"] },
					nested: { type: "object", properties: { n: { type: ["number", "null"] } } },
				},
				required: [],
			})

			expect(result.additionalProperties).toBe(false)
			expect(result.properties.cwd.type).toBe("string")
			expect(result.properties.nested.additionalProperties).toBe(false)
			expect(result.properties.nested.properties.n.type).toBe("number")
			expect(result.required).toEqual([])
		})
	})

	// Contract test: what every OpenAI-style provider sends for the built-in tools.
	describe("built-in tools contract", () => {
		const tools = getNativeTools({ supportsImages: true }) as FunctionTool[]

		it.each(tools.map((t) => [t.function.name, t] as const))("%s is prepared consistently", (_name, tool) => {
			const authored = tool.function.parameters as any
			const prepared = prepareNativeToolSchema(authored)

			// Authored required list is never widened
			expect(prepared.parameters.required).toEqual(authored.required)

			// Strict only when nothing is optional
			expect(prepared.strict).toBe(requiresAllProperties(authored))
			if (prepared.strict) {
				for (const obj of collectObjectSchemas(prepared.parameters)) {
					expect([...(obj.required ?? [])].sort()).toEqual(Object.keys(obj.properties ?? {}).sort())
				}
			}

			// No nullable unions and no open objects reach the provider
			for (const obj of collectObjectSchemas(prepared.parameters)) {
				expect(obj.additionalProperties).toBe(false)
				for (const prop of Object.values(obj.properties ?? {}) as any[]) {
					expect(Array.isArray(prop.type) && prop.type.includes("null")).toBe(false)
				}
			}

			// The authored strict flag agrees with the schema
			if (tool.function.strict !== undefined) {
				expect(tool.function.strict).toBe(prepared.strict)
			}
		})

		it("keeps optional parameters of commonly misused tools optional", () => {
			const byName = Object.fromEntries(tools.map((t) => [t.function.name, t.function.parameters as any]))

			expect(byName.read_file.required).toEqual(["path"])
			expect(byName.execute_command.required).toEqual(["command"])
			expect(byName.search_files.required).toEqual(["path", "regex"])
			expect(byName.new_task.required).toEqual(["mode", "message"])
		})
	})
})
