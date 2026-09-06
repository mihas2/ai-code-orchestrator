/**
 * Builds the Zod schema for .agent-modes configuration files and converts it
 * to JSON Schema (draft-07). This module is the single source of truth for
 * both the generator script (scripts/generate-agent-modes-schema.ts) and the
 * drift-detection test.
 */

import { z } from "zod"
import { zodToJsonSchema } from "zod-to-json-schema"

import { toolGroups, deprecatedToolGroups } from "./tool.js"
import { groupOptionsSchema, modeConfigSchema } from "./mode.js"

// Build a ToolGroup enum that includes deprecated groups so existing configs
// still validate.
const allToolGroups = [...toolGroups, ...deprecatedToolGroups] as [string, ...string[]]
const allToolGroupsSchema = z.enum(allToolGroups)

// Build a GroupEntry schema that uses the extended tool group list.
const groupEntrySchema = z.union([allToolGroupsSchema, z.tuple([allToolGroupsSchema, groupOptionsSchema])])

// Build an extended ModeConfig schema that uses the extended groups (with
// deprecated entries). All other fields, including rulesFiles, come from the
// runtime mode schema.
const exportedModeConfigSchema = modeConfigSchema.omit({ groups: true }).extend({
	groups: z.array(groupEntrySchema),
})

// Build the top-level .agent-modes schema.
const agentModesZodSchema = z
	.object({
		customModes: z.array(exportedModeConfigSchema),
	})
	.strict()

/**
 * Generates the JSON Schema object for .agent-modes configuration files.
 * Includes metadata fields ($id, title, description).
 */
export function generateAgentModesJsonSchema(): Record<string, unknown> {
	const jsonSchema = zodToJsonSchema(agentModesZodSchema, {
		$refStrategy: "none",
		target: "jsonSchema7",
	}) as Record<string, unknown>

	jsonSchema["$id"] = "https://github.com/AIOrchestrator/ai-code-orchestrator/blob/main/schemas/agent-modes.json"
	jsonSchema["title"] = "AI Code Orchestrator Custom Modes"
	jsonSchema["description"] =
		"Schema for .agent-modes configuration files used by AI Code Orchestrator to define custom modes."

	return jsonSchema
}
