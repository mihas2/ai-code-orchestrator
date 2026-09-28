import { DEFAULT_MODES } from "@ai-code-orchestrator/types"

const builtInModeSlugs = DEFAULT_MODES.map((mode) => mode.slug).join(", ")

/**
 * Open-string description for a mode-selection parameter.
 * Built-in slugs come from DEFAULT_MODES; custom slugs stay valid because the schema is not an enum.
 * The live catalog, including custom modes and effective instructions, is the MODES section.
 */
export function describeModeSlugParameter(action: string): string {
	return `Slug of the mode to ${action}. Built-in slugs: ${builtInModeSlugs}. Additional custom modes and their current instructions are in the MODES section. This list is not exhaustive and the parameter remains an open string.`
}
