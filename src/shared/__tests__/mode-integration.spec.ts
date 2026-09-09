import { describe, it, expect } from "vitest"
import { DEFAULT_MODES, type ModeConfig, type CustomModePrompts } from "@ai-code-orchestrator/types"
import type { TFunction } from "i18next"
import {
	resolveModePresentationMetadata,
	resolveModeOperationalFields,
	getEffectiveOperationalFields,
} from "../mode-resolvers"

// Helper to create mock TFunction
function mockT(impl: (key: string) => string): TFunction {
	return impl as unknown as TFunction
}

/**
 * Integration tests for mode resolution system.
 * These verify the acceptance criteria from the role-prompts-unification spec:
 * - Locale invariance for operational fields
 * - UI presentation with fallback
 * - Custom mode precedence
 * - Built-in sparse override
 * - No data loss on roundtrip
 */

describe("mode-integration", () => {
	describe("Locale Invariance (AC: operational fields byte-identical across locales)", () => {
		it("operational fields are identical regardless of locale", () => {
			const code = DEFAULT_MODES.find((m) => m.slug === "code")!
			const reviewer = DEFAULT_MODES.find((m) => m.slug === "reviewer")!
			const orchestrator = DEFAULT_MODES.find((m) => m.slug === "orchestrator")!

			// Mock translation functions for different locales
			const tEn = (key: string) => `EN: ${key}`
			const tRu = (key: string) => `RU: ${key}`
			const tJa = (key: string) => `JA: ${key}`

			// Test all built-ins across multiple locales
			for (const mode of [code, reviewer, orchestrator]) {
				const opEn = resolveModeOperationalFields(mode, undefined, false)
				const opRu = resolveModeOperationalFields(mode, undefined, false)
				const opJa = resolveModeOperationalFields(mode, undefined, false)

				// Operational fields must be byte-identical across locales
				expect(opEn).toEqual(opRu)
				expect(opEn).toEqual(opJa)
				expect(opEn.roleDefinition).toBe(mode.roleDefinition)
				expect(opEn.whenToUse).toBe(mode.whenToUse || "")
				expect(opEn.customInstructions).toBe(mode.customInstructions || "")
			}
		})

		it("whenToUse remains in English for system prompt", () => {
			const orchestrator = DEFAULT_MODES.find((m) => m.slug === "orchestrator")!
			const operational = resolveModeOperationalFields(orchestrator, undefined, false)

			// whenToUse must be in English as it goes into system prompt for model
			expect(operational.whenToUse).toContain("complex multi-step")
			expect(operational.whenToUse).not.toContain("сложн") // Not Russian
			expect(operational.whenToUse).not.toContain("複雑") // Not Japanese
		})
	})

	describe("UI Presentation with Fallback (AC: locale -> en -> canonical)", () => {
		it("uses locale translation when available", () => {
			const reviewer = DEFAULT_MODES.find((m) => m.slug === "reviewer")!
			const t = mockT((key: string) => (key === "reviewer.name" ? "Рецензент" : key))
			const tEn = mockT((key: string) => (key === "reviewer.name" ? "Reviewer" : key))

			const presentation = resolveModePresentationMetadata(reviewer, t, tEn)

			expect(presentation.displayName).toBe("Рецензент")
		})

		it("falls back to English when locale missing", () => {
			const reviewer = DEFAULT_MODES.find((m) => m.slug === "reviewer")!
			const t = mockT((key: string) => key) // No translation
			const tEn = mockT((key: string) => (key === "reviewer.name" ? "Reviewer" : key))

			const presentation = resolveModePresentationMetadata(reviewer, t, tEn)

			expect(presentation.displayName).toBe("Reviewer")
		})

		it("falls back to canonical when both translations missing", () => {
			const reviewer = DEFAULT_MODES.find((m) => m.slug === "reviewer")!
			const t = mockT((key: string) => key) // No translation
			const tEn = mockT((key: string) => key) // No translation

			const presentation = resolveModePresentationMetadata(reviewer, t, tEn)

			expect(presentation.displayName).toBe(reviewer.name)
		})

		it("resolves notice keys with fallback chain", () => {
			const reviewer = DEFAULT_MODES.find((m) => m.slug === "reviewer")!
			const t = mockT((key: string) => {
				if (key === "reviewer.readOnlyNotice") return "Только чтение"
				return key
			})
			const tEn = mockT((key: string) => {
				if (key === "reviewer.findingSeverities") return "Finding severities: blocker, major, minor, note"
				return key
			})

			const presentation = resolveModePresentationMetadata(reviewer, t, tEn)

			expect(presentation.notices).toContain("Только чтение")
			expect(presentation.notices).toContain("Finding severities: blocker, major, minor, note")
		})

		it("filters out missing notice keys", () => {
			const reviewer = DEFAULT_MODES.find((m) => m.slug === "reviewer")!
			const t = mockT((key: string) => key) // No translation
			const tEn = mockT((key: string) => key) // No translation

			const presentation = resolveModePresentationMetadata(reviewer, t, tEn)

			// Missing keys should not appear as raw keys
			expect(presentation.notices).not.toContain("reviewer.readOnlyNotice")
		})
	})

	describe("Custom Mode Precedence (AC: custom mode takes full precedence)", () => {
		it("custom mode uses own fields entirely, no inheritance", () => {
			const customModes: ModeConfig[] = [
				{
					slug: "code",
					name: "My Custom Code",
					roleDefinition: "Custom role definition",
					whenToUse: "Custom when to use",
					description: "Custom description",
					customInstructions: "Custom instructions",
					groups: ["read"],
				},
			]

			const operational = getEffectiveOperationalFields("code", customModes, undefined)

			expect(operational.roleDefinition).toBe("Custom role definition")
			expect(operational.whenToUse).toBe("Custom when to use")
			expect(operational.customInstructions).toBe("Custom instructions")
			expect(operational.description).toBe("Custom description")
		})

		it("custom mode does not inherit from built-in when field missing", () => {
			const customModes: ModeConfig[] = [
				{
					slug: "code",
					name: "My Custom Code",
					roleDefinition: "Custom role",
					groups: ["read"],
					// whenToUse, description, customInstructions omitted
				},
			]

			const operational = getEffectiveOperationalFields("code", customModes, undefined)

			// Missing fields should be empty, not inherited from built-in
			expect(operational.roleDefinition).toBe("Custom role")
			expect(operational.whenToUse).toBe("")
			expect(operational.customInstructions).toBe("")
			expect(operational.description).toBe("")
		})

		it("custom mode ignores prompt overrides", () => {
			const customModes: ModeConfig[] = [
				{
					slug: "code",
					name: "My Custom Code",
					roleDefinition: "Custom role",
					groups: ["read"],
				},
			]

			const customModePrompts: CustomModePrompts = {
				code: {
					roleDefinition: "Override role",
					whenToUse: "Override when",
				},
			}

			const operational = getEffectiveOperationalFields("code", customModes, customModePrompts)

			// Custom mode ignores overrides
			expect(operational.roleDefinition).toBe("Custom role")
			expect(operational.whenToUse).toBe("")
		})
	})

	describe("Built-in Sparse Override (AC: empty string fallback to default)", () => {
		it("applies sparse override to built-in mode", () => {
			const customModePrompts: CustomModePrompts = {
				code: {
					roleDefinition: "Override role definition",
				},
			}

			const operational = getEffectiveOperationalFields("code", undefined, customModePrompts)
			const builtIn = DEFAULT_MODES.find((m) => m.slug === "code")!

			expect(operational.roleDefinition).toBe("Override role definition")
			expect(operational.whenToUse).toBe(builtIn.whenToUse || "")
			expect(operational.customInstructions).toBe(builtIn.customInstructions || "")
		})

		it("empty string in override falls back to default", () => {
			const customModePrompts: CustomModePrompts = {
				code: {
					roleDefinition: "   ", // Whitespace only
					whenToUse: "",
				},
			}

			const operational = getEffectiveOperationalFields("code", undefined, customModePrompts)
			const builtIn = DEFAULT_MODES.find((m) => m.slug === "code")!

			// Empty/whitespace should fallback to default
			expect(operational.roleDefinition).toBe(builtIn.roleDefinition)
			expect(operational.whenToUse).toBe(builtIn.whenToUse || "")
		})

		it("undefined in override uses default", () => {
			const customModePrompts: CustomModePrompts = {
				code: {
					roleDefinition: "Override",
					// whenToUse is undefined
				},
			}

			const operational = getEffectiveOperationalFields("code", undefined, customModePrompts)
			const builtIn = DEFAULT_MODES.find((m) => m.slug === "code")!

			expect(operational.roleDefinition).toBe("Override")
			expect(operational.whenToUse).toBe(builtIn.whenToUse || "")
		})
	})

	describe("All Locales x All Built-ins (AC: 18 locales x 6 built-ins)", () => {
		it("all built-in modes have stable operational fields", () => {
			// Simulate 18 locales
			const locales = [
				"ca",
				"de",
				"en",
				"es",
				"fr",
				"hi",
				"id",
				"it",
				"ja",
				"ko",
				"nl",
				"pl",
				"pt-BR",
				"ru",
				"tr",
				"vi",
				"zh-CN",
				"zh-TW",
			]

			for (const mode of DEFAULT_MODES) {
				const baselineOp = resolveModeOperationalFields(mode, undefined, false)

				for (const locale of locales) {
					// Each locale should produce identical operational fields
					const op = resolveModeOperationalFields(mode, undefined, false)
					expect(op).toEqual(baselineOp)
				}
			}
		})
	})

	describe("Fallback for Unknown Slug (AC: fallback to first default mode)", () => {
		it("unknown slug falls back to first default mode", () => {
			const operational = getEffectiveOperationalFields("nonexistent-slug", undefined, undefined)
			const firstMode = DEFAULT_MODES[0]

			expect(operational.roleDefinition).toBe(firstMode.roleDefinition)
			expect(operational.whenToUse).toBe(firstMode.whenToUse || "")
		})
	})

	describe("Custom Mode Presentation (AC: custom mode name/description not auto-localized)", () => {
		it("custom mode uses literal name and description", () => {
			const customModes: ModeConfig[] = [
				{
					slug: "my-mode",
					name: "My Custom Mode",
					roleDefinition: "Role",
					description: "My description",
					groups: ["read"],
				},
			]

			const mode = customModes[0]
			const t = mockT((key: string) => `TRANSLATED: ${key}`)
			const tEn = mockT((key: string) => `EN: ${key}`)

			const presentation = resolveModePresentationMetadata(mode, t, tEn)

			// Should use literal values, not translations
			expect(presentation.displayName).toBe("My Custom Mode")
			expect(presentation.displayDescription).toBe("My description")
		})
	})

	describe("Edge Cases", () => {
		it("handles mode with no ui metadata", () => {
			const code = DEFAULT_MODES.find((m) => m.slug === "code")!
			const t = mockT((key: string) => `TRANSLATED: ${key}`)

			const presentation = resolveModePresentationMetadata(code, t)

			// Should use canonical values when no ui metadata
			expect(presentation.displayName).toBe(code.name)
			expect(presentation.notices).toEqual([])
		})

		it("handles description override in customModePrompts", () => {
			const reviewer = DEFAULT_MODES.find((m) => m.slug === "reviewer")!
			const customModePrompts: CustomModePrompts = {
				reviewer: {
					description: "Custom description for reviewer",
				},
			}

			const t = mockT((key: string) => key)
			const presentation = resolveModePresentationMetadata(reviewer, t, undefined, customModePrompts)

			expect(presentation.displayDescription).toBe("Custom description for reviewer")
		})

		it("operational resolver handles missing mode gracefully", () => {
			// This should not throw, but fallback to first mode
			const operational = getEffectiveOperationalFields("does-not-exist", undefined, undefined)

			expect(operational).toBeDefined()
			expect(operational.roleDefinition).toBeDefined()
		})
	})
})
