import { describe, it, expect, vi, beforeEach } from "vitest"
import type { TFunction } from "i18next"
import { DEFAULT_MODES, type ModeConfig, type CustomModePrompts } from "@ai-code-orchestrator/types"

import {
	resolveModePresentationMetadata,
	resolveModeOperationalFields,
	getEffectiveOperationalFields,
} from "../mode-resolvers"

describe("mode-resolvers", () => {
	describe("resolveModePresentationMetadata", () => {
		let mockT: TFunction
		let mockTEn: TFunction

		beforeEach(() => {
			mockT = vi.fn((key: string, opts?: any) => {
				// Simulate Russian translations
				if (key === "reviewer.name") return "Рецензент"
				if (key === "reviewer.description") return "Проверка завершённой работы только для чтения"
				if (key === "reviewer.readOnlyNotice") return "Рецензент может читать файлы..."
				if (key === "reviewer.findingSeverities") return "Уровни замечаний: blocker, major, minor, note"
				if (key === "orchestrator.name") return "Оркестратор"
				if (key === "orchestrator.description") return "Координация задач между несколькими режимами"
				return opts?.defaultValue !== "__MISSING__" ? key : "__MISSING__"
			}) as unknown as TFunction

			mockTEn = vi.fn((key: string, opts?: any) => {
				// Simulate English translations
				if (key === "reviewer.name") return "Reviewer"
				if (key === "reviewer.description") return "Read-only quality review of completed work"
				if (key === "reviewer.readOnlyNotice")
					return "Reviewer can read files and run diagnostics, but cannot edit files or expand the declared scope."
				if (key === "reviewer.findingSeverities") return "Finding severities: blocker, major, minor, note"
				if (key === "orchestrator.name") return "Orchestrator"
				if (key === "orchestrator.description") return "Coordinate tasks across multiple modes"
				return opts?.defaultValue !== "__MISSING__" ? key : "__MISSING__"
			}) as unknown as TFunction
		})

		it("should resolve reviewer name and description with Russian locale", () => {
			const reviewerMode = DEFAULT_MODES.find((m) => m.slug === "reviewer")!
			const presentation = resolveModePresentationMetadata(reviewerMode, mockT, mockTEn)

			expect(presentation.displayName).toBe("Рецензент")
			expect(presentation.displayDescription).toBe("Проверка завершённой работы только для чтения")
			expect(presentation.notices).toHaveLength(2)
			expect(presentation.notices[0]).toBe("Рецензент может читать файлы...")
			expect(presentation.notices[1]).toBe("Уровни замечаний: blocker, major, minor, note")
		})

		it("should fall back to English when locale translation is missing", () => {
			const reviewerMode = DEFAULT_MODES.find((m) => m.slug === "reviewer")!

			// Mock missing Russian translations
			const mockTMissing = vi.fn((key: string, opts?: any) => {
				return opts?.defaultValue !== "__MISSING__" ? key : "__MISSING__"
			}) as unknown as TFunction

			const presentation = resolveModePresentationMetadata(reviewerMode, mockTMissing, mockTEn)

			expect(presentation.displayName).toBe("Reviewer")
			expect(presentation.displayDescription).toBe("Read-only quality review of completed work")
		})

		it("should fall back to canonical English when both locale and EN are missing", () => {
			const reviewerMode = DEFAULT_MODES.find((m) => m.slug === "reviewer")!

			const mockTMissing = vi.fn(() => "__MISSING__") as unknown as TFunction
			const mockTEnMissing = vi.fn(() => "__MISSING__") as unknown as TFunction

			const presentation = resolveModePresentationMetadata(reviewerMode, mockTMissing, mockTEnMissing)

			// Should fall back to canonical name from mode config
			expect(presentation.displayName).toBe(reviewerMode.name)
			expect(presentation.displayDescription).toBe(reviewerMode.description)
		})

		it("should filter out missing notice keys", () => {
			const reviewerMode = DEFAULT_MODES.find((m) => m.slug === "reviewer")!

			// Mock only one notice available (both current locale and English fallback)
			const mockTPartial = vi.fn((key: string, opts?: any) => {
				if (key === "reviewer.readOnlyNotice") return "Available notice"
				return opts?.defaultValue !== "__MISSING__" ? key : "__MISSING__"
			}) as unknown as TFunction

			const mockTEnPartial = vi.fn((key: string, opts?: any) => {
				if (key === "reviewer.readOnlyNotice") return "Available notice"
				return opts?.defaultValue !== "__MISSING__" ? key : "__MISSING__"
			}) as unknown as TFunction

			const presentation = resolveModePresentationMetadata(reviewerMode, mockTPartial, mockTEnPartial)

			// Should only include the available notice
			expect(presentation.notices).toHaveLength(1)
			expect(presentation.notices[0]).toBe("Available notice")
		})

		it.each(["reviewer", "orchestrator"])(
			"should localize cloned built-in %s metadata in built-in context",
			(slug) => {
				const canonical = DEFAULT_MODES.find((mode) => mode.slug === slug)!
				const clonedBuiltIn = structuredClone(canonical)

				const presentation = resolveModePresentationMetadata(clonedBuiltIn, mockT, mockTEn, undefined, {
					isCustomMode: false,
				})

				expect(presentation.displayName).toBe(slug === "reviewer" ? "Рецензент" : "Оркестратор")
				expect(presentation.displayDescription).toBe(
					slug === "reviewer"
						? "Проверка завершённой работы только для чтения"
						: "Координация задач между несколькими режимами",
				)
				if (slug === "reviewer") expect(presentation.notices).toHaveLength(2)
			},
		)

		it("should keep a genuine custom mode with a built-in slug literal", () => {
			const reviewer = DEFAULT_MODES.find((mode) => mode.slug === "reviewer")!
			const customCollision: ModeConfig = {
				...structuredClone(reviewer),
				name: "Literal Custom Reviewer",
				description: "Literal custom description",
				roleDefinition: "Custom role only",
				whenToUse: undefined,
				customInstructions: undefined,
			}

			const presentation = resolveModePresentationMetadata(customCollision, mockT, mockTEn, undefined, {
				isCustomMode: true,
			})
			const operational = getEffectiveOperationalFields("reviewer", [customCollision], {
				reviewer: { whenToUse: "Built-in override must not leak" },
			})

			expect(presentation).toEqual({
				displayName: "Literal Custom Reviewer",
				displayDescription: "Literal custom description",
				notices: [],
			})
			expect(operational).toEqual({
				roleDefinition: "Custom role only",
				whenToUse: "",
				customInstructions: "",
				description: "Literal custom description",
			})
		})

		it("should use literal name/description for custom modes", () => {
			const customMode: ModeConfig = {
				slug: "custom-analyzer",
				name: "Custom Analyzer",
				roleDefinition: "You are a custom analyzer",
				description: "My custom mode description",
				groups: ["read"],
			}

			const presentation = resolveModePresentationMetadata(customMode, mockT, mockTEn)

			expect(presentation.displayName).toBe("Custom Analyzer")
			expect(presentation.displayDescription).toBe("My custom mode description")
			expect(presentation.notices).toEqual([])
		})

		it("should use literal name/description for built-in modes without ui metadata", () => {
			const codeMode = DEFAULT_MODES.find((m) => m.slug === "code")!
			const presentation = resolveModePresentationMetadata(codeMode, mockT, mockTEn)

			// Code mode doesn't have ui metadata, should use literal values
			expect(presentation.displayName).toBe(codeMode.name)
			expect(presentation.displayDescription).toBe(codeMode.description)
			expect(presentation.notices).toEqual([])
		})

		it("should prioritize description override from customModePrompts", () => {
			const reviewerMode = DEFAULT_MODES.find((m) => m.slug === "reviewer")!
			const customPrompts: CustomModePrompts = {
				reviewer: {
					description: "Custom overridden description",
				},
			}

			const presentation = resolveModePresentationMetadata(reviewerMode, mockT, mockTEn, customPrompts)

			expect(presentation.displayDescription).toBe("Custom overridden description")
		})
	})

	describe("resolveModeOperationalFields", () => {
		it("should use custom mode fields entirely without inheritance", () => {
			const customMode: ModeConfig = {
				slug: "custom",
				name: "Custom",
				roleDefinition: "Custom role",
				whenToUse: "Custom when to use",
				customInstructions: "Custom instructions",
				description: "Custom description",
				groups: ["read"],
			}

			const operational = resolveModeOperationalFields(customMode, undefined, true)

			expect(operational.roleDefinition).toBe("Custom role")
			expect(operational.whenToUse).toBe("Custom when to use")
			expect(operational.customInstructions).toBe("Custom instructions")
			expect(operational.description).toBe("Custom description")
		})

		it("should not inherit from built-in for missing custom mode fields", () => {
			const customMode: ModeConfig = {
				slug: "code", // Same slug as built-in
				name: "Custom Code",
				roleDefinition: "Custom role",
				// Missing whenToUse, customInstructions, description
				groups: ["read"],
			}

			const operational = resolveModeOperationalFields(customMode, undefined, true)

			expect(operational.roleDefinition).toBe("Custom role")
			expect(operational.whenToUse).toBe("") // Empty, not inherited
			expect(operational.customInstructions).toBe("") // Empty, not inherited
			expect(operational.description).toBe("") // Empty, not inherited
		})

		it("should merge sparse overrides with built-in defaults", () => {
			const codeMode = DEFAULT_MODES.find((m) => m.slug === "code")!
			const customPrompts: CustomModePrompts = {
				code: {
					roleDefinition: "Overridden role",
					// Other fields not overridden
				},
			}

			const operational = resolveModeOperationalFields(codeMode, customPrompts, false)

			expect(operational.roleDefinition).toBe("Overridden role")
			expect(operational.whenToUse).toBe(codeMode.whenToUse)
			expect(operational.customInstructions).toBe(codeMode.customInstructions)
			expect(operational.description).toBe(codeMode.description)
		})

		it("should treat empty string override as fallback to default", () => {
			const codeMode = DEFAULT_MODES.find((m) => m.slug === "code")!
			const customPrompts: CustomModePrompts = {
				code: {
					roleDefinition: "", // Empty override
				},
			}

			const operational = resolveModeOperationalFields(codeMode, customPrompts, false)

			// Should fall back to default, not use empty string
			expect(operational.roleDefinition).toBe(codeMode.roleDefinition)
		})

		it("should handle whitespace-only override as fallback", () => {
			const codeMode = DEFAULT_MODES.find((m) => m.slug === "code")!
			const customPrompts: CustomModePrompts = {
				code: {
					roleDefinition: "   ", // Whitespace only
				},
			}

			const operational = resolveModeOperationalFields(codeMode, customPrompts, false)

			// Should fall back to default
			expect(operational.roleDefinition).toBe(codeMode.roleDefinition)
		})
	})

	describe("getEffectiveOperationalFields", () => {
		it("should return custom mode fields when custom mode exists", () => {
			const customModes: ModeConfig[] = [
				{
					slug: "custom",
					name: "Custom",
					roleDefinition: "Custom role",
					whenToUse: "Custom when",
					groups: ["read"],
				},
			]

			const operational = getEffectiveOperationalFields("custom", customModes, undefined)

			expect(operational.roleDefinition).toBe("Custom role")
			expect(operational.whenToUse).toBe("Custom when")
		})

		it("should return built-in with overrides when no custom mode", () => {
			const customPrompts: CustomModePrompts = {
				code: {
					roleDefinition: "Overridden role",
				},
			}

			const operational = getEffectiveOperationalFields("code", undefined, customPrompts)

			const codeMode = DEFAULT_MODES.find((m) => m.slug === "code")!
			expect(operational.roleDefinition).toBe("Overridden role")
			expect(operational.whenToUse).toBe(codeMode.whenToUse)
		})

		it("should preserve fallback behavior and ignore stale overrides for an unknown slug", () => {
			const operational = getEffectiveOperationalFields("unknown-mode", undefined, {
				"unknown-mode": { roleDefinition: "Stale unknown override" },
			})

			const firstMode = DEFAULT_MODES[0]
			expect(operational).toEqual(resolveModeOperationalFields(firstMode, undefined, false))
		})

		it("should prioritize custom mode over built-in with same slug", () => {
			const customModes: ModeConfig[] = [
				{
					slug: "code",
					name: "Overridden Code",
					roleDefinition: "Custom code role",
					groups: ["read"],
				},
			]

			const customPrompts: CustomModePrompts = {
				code: {
					roleDefinition: "This should be ignored",
				},
			}

			const operational = getEffectiveOperationalFields("code", customModes, customPrompts)

			// Should use custom mode, not built-in override
			expect(operational.roleDefinition).toBe("Custom code role")
		})
	})

	describe("Integration: all built-in modes", () => {
		it("should resolve all built-in modes without errors", () => {
			const mockT = vi.fn((key: string) => key) as unknown as TFunction
			const mockTEn = vi.fn((key: string) => key) as unknown as TFunction

			DEFAULT_MODES.forEach((mode) => {
				expect(() => {
					resolveModePresentationMetadata(mode, mockT, mockTEn)
					resolveModeOperationalFields(mode, undefined, false)
				}).not.toThrow()
			})
		})

		it("should have consistent operational fields across all locales", () => {
			DEFAULT_MODES.forEach((mode) => {
				const operational1 = resolveModeOperationalFields(mode, undefined, false)
				const operational2 = resolveModeOperationalFields(mode, undefined, false)

				expect(operational1).toEqual(operational2)
			})
		})
	})
})
