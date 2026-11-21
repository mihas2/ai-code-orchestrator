import type OpenAI from "openai"

import { getNativeTools } from "../prompts/tools/native-tools/get-native-tools"

/**
 * Model-facing hints for malformed native tool calls.
 *
 * When a call cannot be executed, the model only sees the tool_result we send back.
 * A generic "could not be parsed" makes it repeat the same mistake, so these helpers
 * describe what the tool's schema actually expects.
 */

interface ToolParameterInfo {
	required: string[]
	optional: string[]
}

let cachedParameterInfo: Map<string, ToolParameterInfo> | undefined

function getParameterInfo(): Map<string, ToolParameterInfo> {
	if (!cachedParameterInfo) {
		cachedParameterInfo = new Map()
		for (const tool of getNativeTools() as OpenAI.Chat.ChatCompletionFunctionTool[]) {
			const schema = (tool.function.parameters ?? {}) as {
				properties?: Record<string, unknown>
				required?: string[]
			}
			const all = Object.keys(schema.properties ?? {})
			const required = (schema.required ?? []).filter((name) => all.includes(name))
			cachedParameterInfo.set(tool.function.name, {
				required,
				optional: all.filter((name) => !required.includes(name)),
			})
		}
	}
	return cachedParameterInfo
}

/** Parameter names declared by a built-in tool's schema, or undefined for unknown/custom tools. */
export function getToolParameterNames(toolName: string): string[] | undefined {
	const info = getParameterInfo().get(toolName)
	return info ? [...info.required, ...info.optional] : undefined
}

/**
 * Human-readable parameter summary, e.g.
 * "Required parameters: path. Optional parameters: mode, offset, limit, indentation."
 */
export function describeToolParameters(toolName: string): string | undefined {
	const info = getParameterInfo().get(toolName)
	if (!info) {
		return undefined
	}
	const parts = [`Required parameters: ${info.required.length ? info.required.join(", ") : "none"}.`]
	if (info.optional.length) {
		parts.push(`Optional parameters (omit when not needed): ${info.optional.join(", ")}.`)
	}
	return parts.join(" ")
}

/**
 * Lists required parameters that are missing or null in the received arguments.
 */
export function findMissingRequiredParameters(toolName: string, args: Record<string, unknown>): string[] {
	const info = getParameterInfo().get(toolName)
	if (!info) {
		return []
	}
	return info.required.filter((name) => args[name] === undefined || args[name] === null || args[name] === "")
}

function summarizeReceivedKeys(args: Record<string, unknown>): string {
	const keys = Object.keys(args)
	if (keys.length === 0) {
		return "no parameters"
	}
	const shown = keys.slice(0, 10).join(", ")
	return keys.length > 10 ? `${shown}, … (${keys.length} total)` : shown
}

/**
 * Error for a call whose JSON parsed but does not satisfy the tool schema.
 */
export function formatInvalidToolArgumentsError(toolName: string, args: Record<string, unknown>): string {
	const missing = findMissingRequiredParameters(toolName, args)
	const problem = missing.length
		? `missing required parameter(s): ${missing.join(", ")}`
		: "one or more parameters have an invalid value or type"
	const hint = describeToolParameters(toolName)
	return [
		`Invalid arguments for tool '${toolName}': ${problem}. Received: ${summarizeReceivedKeys(args)}.`,
		hint,
		"Retry the call with arguments that match the tool schema.",
	]
		.filter(Boolean)
		.join(" ")
}

/**
 * Error for a call whose arguments are not valid JSON.
 */
export function formatUnparsableToolArgumentsError(toolName: string): string {
	const hint = describeToolParameters(toolName)
	return [
		`Invalid tool call for '${toolName}': the arguments are not a valid JSON object.`,
		hint,
		"Retry the call with a single JSON object as arguments.",
	]
		.filter(Boolean)
		.join(" ")
}

/**
 * Note appended to a tool result when the call contained parameters the tool does not define.
 */
export function formatIgnoredParametersNote(toolName: string, ignored: string[]): string {
	const valid = getToolParameterNames(toolName)
	return (
		`Note: the following parameter(s) are not defined for '${toolName}' and were ignored: ${ignored.join(", ")}.` +
		(valid ? ` Valid parameters: ${valid.join(", ")}.` : "")
	)
}
