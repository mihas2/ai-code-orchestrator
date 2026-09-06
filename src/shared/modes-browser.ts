import {
	type GroupEntry,
	type ModeConfig,
	type CustomModePrompts,
	type ToolGroup,
	type PromptComponent,
	DEFAULT_MODES,
} from "@ai-code-orchestrator/types"

import { TOOL_GROUPS, ALWAYS_AVAILABLE_TOOLS } from "./tools"

export type Mode = string

export function getGroupName(group: GroupEntry): ToolGroup {
	return typeof group === "string" ? group : group[0]
}

export function getToolsForMode(groups: readonly GroupEntry[]): string[] {
	const tools = new Set<string>()
	groups.forEach((group) => {
		const groupConfig = TOOL_GROUPS[getGroupName(group)]
		groupConfig.tools.forEach((tool: string) => tools.add(tool))
	})
	ALWAYS_AVAILABLE_TOOLS.forEach((tool) => tools.add(tool))
	return Array.from(tools)
}

export const modes = DEFAULT_MODES
export const defaultModeSlug = "orchestrator"

export function getModeBySlug(slug: string, customModes?: ModeConfig[]): ModeConfig | undefined {
	return customModes?.find((mode) => mode.slug === slug) || modes.find((mode) => mode.slug === slug)
}

export function getModeConfig(slug: string, customModes?: ModeConfig[]): ModeConfig {
	const mode = getModeBySlug(slug, customModes)
	if (!mode) throw new Error(`No mode found for slug: ${slug}`)
	return mode
}

export function getAllModes(customModes?: ModeConfig[]): ModeConfig[] {
	if (!customModes?.length) return [...modes]
	const allModes = [...modes]
	customModes.forEach((customMode) => {
		const index = allModes.findIndex((mode) => mode.slug === customMode.slug)
		if (index !== -1) allModes[index] = customMode
		else allModes.push(customMode)
	})
	return allModes
}

export function isCustomMode(slug: string, customModes?: ModeConfig[]): boolean {
	return !!customModes?.some((mode) => mode.slug === slug)
}

export function findModeBySlug(
	slug: string,
	availableModes: readonly ModeConfig[] | undefined,
): ModeConfig | undefined {
	return availableModes?.find((mode) => mode.slug === slug)
}

export function getModeSelection(mode: string, promptComponent?: PromptComponent, customModes?: ModeConfig[]) {
	const customMode = findModeBySlug(mode, customModes)
	const builtInMode = findModeBySlug(mode, modes)
	if (customMode) {
		return {
			roleDefinition: customMode.roleDefinition || "",
			baseInstructions: customMode.customInstructions || "",
			description: customMode.description || "",
		}
	}
	const baseMode = builtInMode || modes[0]
	return {
		roleDefinition: promptComponent?.roleDefinition || baseMode.roleDefinition || "",
		baseInstructions: promptComponent?.customInstructions || baseMode.customInstructions || "",
		description: baseMode.description || "",
	}
}

export function getRoleDefinition(modeSlug: string, customModes?: ModeConfig[]): string {
	return getModeBySlug(modeSlug, customModes)?.roleDefinition || ""
}

export function getDescription(modeSlug: string, customModes?: ModeConfig[]): string {
	return getModeBySlug(modeSlug, customModes)?.description || ""
}

export function getWhenToUse(modeSlug: string, customModes?: ModeConfig[]): string {
	return getModeBySlug(modeSlug, customModes)?.whenToUse || ""
}

export function getCustomInstructions(modeSlug: string, customModes?: ModeConfig[]): string {
	return getModeBySlug(modeSlug, customModes)?.customInstructions || ""
}

export class FileRestrictionError extends Error {
	constructor(mode: string, pattern: string, description: string | undefined, filePath: string, tool?: string) {
		const toolInfo = tool ? `Tool '${tool}' in mode '${mode}'` : `This mode (${mode})`
		super(
			`${toolInfo} can only edit files matching pattern: ${pattern}${description ? ` (${description})` : ""}. Got: ${filePath}`,
		)
		this.name = "FileRestrictionError"
	}
}

export const defaultPrompts: Readonly<CustomModePrompts> = Object.freeze(
	Object.fromEntries(
		modes.map((mode) => [
			mode.slug,
			{
				roleDefinition: mode.roleDefinition,
				whenToUse: mode.whenToUse,
				customInstructions: mode.customInstructions,
				description: mode.description,
			},
		]),
	),
)
