import { modeConfigSchema, type ModeConfig } from "@ai-code-orchestrator/types"
import type { ZodError } from "zod"

/**
 * Result of parsing mode config with unknown field preservation
 */
export interface ParsedModeConfig {
	/** Validated known fields */
	validated: ModeConfig
	/** Original parsed object including unknown fields */
	raw: Record<string, unknown>
	/** Unknown fields that were not in schema */
	unknownFields: Record<string, unknown>
}

/**
 * Result of validation
 */
export interface ValidationResult {
	success: boolean
	data?: ParsedModeConfig
	error?: {
		message: string
		details?: ZodError
	}
}

/**
 * Parse and validate mode config while preserving unknown fields.
 *
 * This enables lossless roundtrip: load -> edit -> save -> export -> import
 * without losing user's custom fields that are not in the current schema.
 *
 * @param raw - Raw parsed object (e.g., from YAML or JSON)
 * @returns Validation result with validated data and preserved unknown fields
 */
export function parseWithUnknownFields(raw: unknown): ValidationResult {
	if (!raw || typeof raw !== "object") {
		return {
			success: false,
			error: { message: "Invalid input: expected object" },
		}
	}

	// Validate known fields
	const validationResult = modeConfigSchema.safeParse(raw)

	if (!validationResult.success) {
		return {
			success: false,
			error: {
				message: "Validation failed",
				details: validationResult.error,
			},
		}
	}

	const validated = validationResult.data

	// Extract unknown fields by comparing raw and validated. Preserve unknown
	// nested UI metadata separately while keeping validated UI keys authoritative.
	const knownKeys = new Set(Object.keys(validated))
	const unknownFields: Record<string, unknown> = {}

	for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
		if (!knownKeys.has(key)) {
			unknownFields[key] = value
		}
	}

	const rawUi = (raw as Record<string, unknown>).ui
	if (rawUi && typeof rawUi === "object" && !Array.isArray(rawUi)) {
		const validatedUi = validated.ui ?? {}
		const unknownUi = Object.fromEntries(
			Object.entries(rawUi as Record<string, unknown>).filter(([key]) => !(key in validatedUi)),
		)
		if (Object.keys(unknownUi).length > 0) unknownFields.ui = unknownUi
	}

	return {
		success: true,
		data: {
			validated: validationResult.data,
			raw: raw as Record<string, unknown>,
			unknownFields,
		},
	}
}

/**
 * Merge validated mode config with unknown fields for export/save.
 *
 * This ensures unknown fields are preserved during roundtrip operations.
 *
 * @param validated - Validated mode config (known fields only)
 * @param unknownFields - Unknown fields to preserve
 * @returns Complete config object with both known and unknown fields
 */
export function mergeWithUnknownFields(
	validated: ModeConfig,
	unknownFields: Record<string, unknown> = {},
): Record<string, unknown> {
	const { ui: unknownUi, ...unknownTopLevel } = unknownFields
	return {
		...unknownTopLevel,
		...validated,
		...(unknownUi && typeof unknownUi === "object"
			? { ui: { ...(unknownUi as Record<string, unknown>), ...validated.ui } }
			: {}),
	}
}

/**
 * Safely extract mode config for processing while preserving unknown fields.
 *
 * Use this pattern:
 * 1. Parse with `parseWithUnknownFields()`
 * 2. Work with `validated` for type-safe operations
 * 3. When saving/exporting, use `mergeWithUnknownFields()` to restore unknown fields
 *
 * @param raw - Raw mode config object
 * @returns Tuple of [validated config, unknown fields] or null if invalid
 */
export function extractModeConfig(raw: unknown): [ModeConfig, Record<string, unknown>] | null {
	const result = parseWithUnknownFields(raw)

	if (!result.success || !result.data) {
		return null
	}

	return [result.data.validated, result.data.unknownFields]
}
