import type { ModeConfig, PromptComponent, CustomModePrompts } from "@ai-code-orchestrator/types"
import type { TFunction } from "i18next"

import { DEFAULT_MODES } from "@ai-code-orchestrator/types"

/**
 * Presentation metadata for UI display.
 * This is derived from mode config and i18n translations, never included in system prompts.
 */
export interface ModePresentationMetadata {
	/** Display name for UI (localized if available) */
	displayName: string
	/** Display description for UI (localized if available) */
	displayDescription: string
	/** Localized notice texts (e.g., for reviewer) */
	notices: string[]
}

/**
 * Operational prompt fields for runtime system prompt.
 * These are always in English and never localized.
 */
export interface ModeOperationalFields {
	roleDefinition: string
	whenToUse: string
	customInstructions: string
	description: string
}

/**
 * Resolve presentation metadata for UI display.
 *
 * Precedence for built-in modes with ui metadata:
 * - name: locale translation -> en translation -> canonical name
 * - description: locale translation -> en translation -> canonical description
 * - notices: locale translations -> en translations -> empty array
 *
 * For custom modes or built-in modes without ui metadata:
 * - Use literal name and description from the mode config
 * - Custom mode names/descriptions are never auto-localized
 *
 * @param mode - The mode config
 * @param t - i18n translation function (current locale)
 * @param tEn - i18n translation function (English fallback)
 * @param customModePrompts - Optional prompt overrides (only description can be overridden for built-in)
 * @param context - Whether this mode belongs to the built-in mode collection
 * @returns Presentation metadata for UI display
 */
export function resolveModePresentationMetadata(
	mode: ModeConfig,
	t: TFunction,
	tEn?: TFunction,
	customModePrompts?: CustomModePrompts,
	context?: { isCustomMode?: boolean },
): ModePresentationMetadata {
	// Canonical slugs identify built-ins; explicit custom context protects a
	// genuine custom mode with a colliding slug from inheriting presentation.
	const isCanonicalBuiltInSlug = DEFAULT_MODES.some((builtIn) => builtIn.slug === mode.slug)
	const isBuiltIn = isCanonicalBuiltInSlug && context?.isCustomMode !== true
	const hasUiMetadata = mode.ui && (mode.ui.nameKey || mode.ui.descriptionKey || mode.ui.noticeKeys)

	// Custom modes (or built-in overridden as custom mode): use literal values
	if (!isBuiltIn) {
		return {
			displayName: mode.name,
			displayDescription: mode.description || "",
			notices: [],
		}
	}

	// Built-in mode without ui metadata: use literal values from defaults
	if (!hasUiMetadata) {
		// Check for description override in customModePrompts
		const descriptionOverride = customModePrompts?.[mode.slug]?.description
		return {
			displayName: mode.name,
			displayDescription: descriptionOverride?.trim() ? descriptionOverride : mode.description || "",
			notices: [],
		}
	}

	// Built-in mode with ui metadata: use i18n with fallback chain
	const displayName =
		(mode.ui?.nameKey ? resolveTranslationWithFallback(mode.ui.nameKey, mode.name, t, tEn) : null) || mode.name

	// Description: check override first, then i18n
	const descriptionOverride = customModePrompts?.[mode.slug]?.description
	const displayDescription =
		(descriptionOverride?.trim() ? descriptionOverride : null) ||
		(mode.ui?.descriptionKey
			? resolveTranslationWithFallback(mode.ui.descriptionKey, mode.description || "", t, tEn)
			: null) ||
		mode.description ||
		""

	// Notices: resolve all keys with fallback, filter out missing keys
	const notices = mode.ui?.noticeKeys
		? mode.ui.noticeKeys
				.map((key) => resolveTranslationWithFallback(key, null, t, tEn))
				.filter((notice): notice is string => notice !== null)
		: []

	return {
		displayName,
		displayDescription,
		notices,
	}
}

/**
 * Resolve a translation key with fallback chain.
 * Returns: locale translation -> en translation -> defaultValue -> null
 */
function resolveTranslationWithFallback(
	key: string,
	defaultValue: string | null,
	t: TFunction,
	tEn?: TFunction,
): string | null {
	// Try current locale
	const localeValue = t(key, { defaultValue: "__MISSING__" })
	if (localeValue !== "__MISSING__" && localeValue !== key) {
		return localeValue
	}

	// Try English fallback
	if (tEn) {
		const enValue = tEn(key, { defaultValue: "__MISSING__" })
		if (enValue !== "__MISSING__" && enValue !== key) {
			return enValue
		}
	}

	// Return default value or null if missing
	return defaultValue
}

/**
 * Resolve effective operational fields for a mode.
 * These fields are used for runtime system prompt construction.
 *
 * Precedence rules:
 * 1. Custom mode (full override): use mode config fields entirely, no inheritance from built-in
 * 2. Built-in with sparse override: merge override with defaults
 * 3. Empty string in override: fallback to default (not treated as explicit empty)
 * 4. Missing field in custom mode: do not inherit from built-in (use empty string)
 *
 * @param mode - The mode config (custom or built-in)
 * @param customModePrompts - Optional prompt component overrides for built-in modes
 * @param isCustomMode - Whether this is a custom mode (full config, not an override)
 * @returns Operational fields for system prompt
 */
export function resolveModeOperationalFields(
	mode: ModeConfig,
	customModePrompts?: CustomModePrompts,
	isCustomMode: boolean = false,
): ModeOperationalFields {
	// Custom mode: use its own fields, no inheritance
	if (isCustomMode) {
		return {
			roleDefinition: mode.roleDefinition || "",
			whenToUse: mode.whenToUse || "",
			customInstructions: mode.customInstructions || "",
			description: mode.description || "",
		}
	}

	// Built-in mode: check for overrides, fallback to defaults
	const promptOverride = customModePrompts?.[mode.slug]

	// Helper to resolve field: override (if truthy) -> default
	const resolveField = (overrideValue: string | undefined, defaultValue: string | undefined): string => {
		// Empty string in override is treated as "not set", fallback to default
		if (overrideValue && overrideValue.trim()) {
			return overrideValue
		}
		return defaultValue || ""
	}

	return {
		roleDefinition: resolveField(promptOverride?.roleDefinition, mode.roleDefinition),
		whenToUse: resolveField(promptOverride?.whenToUse, mode.whenToUse),
		customInstructions: resolveField(promptOverride?.customInstructions, mode.customInstructions),
		description: resolveField(promptOverride?.description, mode.description),
	}
}

/**
 * Get operational fields for system prompt construction.
 * This is the unified entry point for all runtime prompt building.
 *
 * @param modeSlug - The mode slug to resolve
 * @param customModes - Array of custom modes
 * @param customModePrompts - Prompt overrides for built-in modes
 * @returns Operational fields for system prompt
 */
export function getEffectiveOperationalFields(
	modeSlug: string,
	customModes?: ModeConfig[],
	customModePrompts?: CustomModePrompts,
): ModeOperationalFields {
	// Check if it's a custom mode
	const customMode = customModes?.find((m) => m.slug === modeSlug)
	if (customMode) {
		return resolveModeOperationalFields(customMode, undefined, true)
	}

	// Find built-in mode. Unknown slugs fall back to the first canonical mode,
	// but must not consume a stale override stored under the unknown slug.
	const builtInMode = DEFAULT_MODES.find((m) => m.slug === modeSlug)
	if (builtInMode) {
		return resolveModeOperationalFields(builtInMode, customModePrompts, false)
	}

	return resolveModeOperationalFields(DEFAULT_MODES[0], undefined, false)
}
