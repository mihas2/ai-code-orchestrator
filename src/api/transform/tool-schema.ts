/**
 * Shared preparation of native tool schemas for OpenAI-style function calling
 * (Chat Completions and the Responses API).
 *
 * OpenAI strict mode requires every property to be listed in `required`.
 * Forcing that on tools with optional parameters makes the model invent values
 * for parameters it does not need (a timeout for every command, an indentation
 * anchor for every slice read, ...). Instead:
 *
 * - A tool whose schema already requires every property (recursively) is sent
 *   with `strict: true`, unchanged apart from normalization.
 * - A tool with optional parameters keeps its authored `required` list and is
 *   sent with `strict: false`, so optional parameters can simply be omitted.
 *
 * Normalization applies in both cases:
 * - `additionalProperties: false` on every object schema (Responses API requirement)
 * - nullable unions such as `["string", "null"]` are collapsed to the non-null
 *   type, because several OpenAI-compatible backends reject type arrays. Optional
 *   parameters are expressed by omission rather than by `null`.
 */

type JsonSchema = Record<string, any>

export interface PreparedToolSchema {
	parameters: JsonSchema
	strict: boolean
}

function isObjectSchema(schema: unknown): schema is JsonSchema {
	return !!schema && typeof schema === "object" && (schema as JsonSchema).type === "object"
}

function collapseNullableType(prop: JsonSchema): JsonSchema {
	if (prop && Array.isArray(prop.type) && prop.type.includes("null")) {
		const nonNullTypes = prop.type.filter((t: string) => t !== "null")
		return { ...prop, type: nonNullTypes.length === 1 ? nonNullTypes[0] : nonNullTypes }
	}
	return prop
}

/**
 * True when every object schema in the tree lists all of its properties in `required`.
 */
export function requiresAllProperties(schema: unknown): boolean {
	if (!isObjectSchema(schema)) {
		return true
	}

	const properties: JsonSchema = schema.properties ?? {}
	const required = new Set<string>(Array.isArray(schema.required) ? schema.required : [])

	for (const [key, rawProp] of Object.entries(properties)) {
		if (!required.has(key)) {
			return false
		}
		const prop: any = rawProp
		if (isObjectSchema(prop) && !requiresAllProperties(prop)) {
			return false
		}
		if (prop?.type === "array" && isObjectSchema(prop.items) && !requiresAllProperties(prop.items)) {
			return false
		}
	}

	return true
}

/**
 * Recursively adds `additionalProperties: false` and collapses nullable unions,
 * without touching `required`.
 */
export function normalizeToolSchema(schema: unknown): any {
	if (!isObjectSchema(schema)) {
		return schema
	}

	const result: JsonSchema = { ...schema }

	if (result.additionalProperties !== false) {
		result.additionalProperties = false
	}

	if (result.properties) {
		const newProps: JsonSchema = {}
		for (const [key, rawProp] of Object.entries(result.properties as JsonSchema)) {
			let prop: any = collapseNullableType(rawProp as JsonSchema)
			if (isObjectSchema(prop)) {
				prop = normalizeToolSchema(prop)
			} else if (prop?.type === "array" && isObjectSchema(prop.items)) {
				prop = { ...prop, items: normalizeToolSchema(prop.items) }
			}
			newProps[key] = prop
		}
		result.properties = newProps
	}

	return result
}

/**
 * Prepares a built-in (non-MCP) tool schema for OpenAI-style providers and decides
 * whether the tool can be sent in strict mode.
 */
export function prepareNativeToolSchema(parameters: unknown): PreparedToolSchema {
	return {
		parameters: normalizeToolSchema(parameters),
		strict: requiresAllProperties(parameters),
	}
}
