import { DEFAULT_MODES, modeConfigSchema } from "../mode.js"

const architect = DEFAULT_MODES.find((mode) => mode.slug === "architect")
const ask = DEFAULT_MODES.find((mode) => mode.slug === "ask")
const code = DEFAULT_MODES.find((mode) => mode.slug === "code")
const debug = DEFAULT_MODES.find((mode) => mode.slug === "debug")
const reviewer = DEFAULT_MODES.find((mode) => mode.slug === "reviewer")
const orchestrator = DEFAULT_MODES.find((mode) => mode.slug === "orchestrator")

describe("role prompts unification", () => {
	describe("canonical operational prompts", () => {
		it("all built-in modes have English operational prompts in DEFAULT_MODES", () => {
			for (const mode of DEFAULT_MODES) {
				expect(mode.roleDefinition).toBeTruthy()
				expect(mode.roleDefinition).toMatch(/^[a-zA-Z]/)
				expect(mode.roleDefinition).not.toMatch(/[а-яА-ЯёЁ\u4e00-\u9fff]/)
			}
		})

		it("orchestrator and reviewer have non-empty operational fields", () => {
			expect(orchestrator?.roleDefinition).toBeTruthy()
			expect(orchestrator?.whenToUse).toBeTruthy()
			expect(orchestrator?.customInstructions).toBeTruthy()

			expect(reviewer?.roleDefinition).toBeTruthy()
			expect(reviewer?.whenToUse).toBeTruthy()
			expect(reviewer?.customInstructions).toBeTruthy()
		})

		it("operational prompts contain English technical vocabulary", () => {
			expect(orchestrator?.roleDefinition).toContain("team lead")
			expect(orchestrator?.customInstructions).toContain("classify")
			expect(reviewer?.customInstructions?.toLowerCase()).toContain("acceptance criteria")
		})
	})

	describe("UI metadata schema", () => {
		it("ui metadata is optional in schema", () => {
			const modeWithoutUi = {
				slug: "test",
				name: "Test",
				roleDefinition: "Test role",
				groups: ["read"],
			}
			expect(() => modeConfigSchema.parse(modeWithoutUi)).not.toThrow()
		})

		it("ui metadata fields are all optional", () => {
			const modeWithPartialUi = {
				slug: "test",
				name: "Test",
				roleDefinition: "Test role",
				groups: ["read"],
				ui: { nameKey: "test.name" },
			}
			expect(() => modeConfigSchema.parse(modeWithPartialUi)).not.toThrow()
		})

		it("reviewer has UI metadata with notice keys", () => {
			expect(reviewer?.ui).toBeDefined()
			expect(reviewer?.ui?.nameKey).toBe("reviewer.name")
			expect(reviewer?.ui?.descriptionKey).toBe("reviewer.description")
			expect(reviewer?.ui?.noticeKeys).toEqual(["reviewer.readOnlyNotice", "reviewer.findingSeverities"])
		})

		it("orchestrator has UI metadata without notice keys", () => {
			expect(orchestrator?.ui).toBeDefined()
			expect(orchestrator?.ui?.nameKey).toBe("orchestrator.name")
			expect(orchestrator?.ui?.descriptionKey).toBe("orchestrator.description")
			expect(orchestrator?.ui?.noticeKeys).toBeUndefined()
		})

		it("other modes do not have UI metadata", () => {
			expect(code?.ui).toBeUndefined()
			expect(architect?.ui).toBeUndefined()
			expect(ask?.ui).toBeUndefined()
			expect(debug?.ui).toBeUndefined()
		})
	})

	describe("operational vs UI separation", () => {
		it("roleDefinition/whenToUse/customInstructions are operational, not UI keys", () => {
			// These are actual prompt content, not i18n keys
			expect(orchestrator?.roleDefinition).not.toMatch(/^[a-z]+\.[a-z]+$/)
			expect(orchestrator?.whenToUse).not.toMatch(/^[a-z]+\.[a-z]+$/)
			expect(orchestrator?.customInstructions).not.toMatch(/^[a-z]+\.[a-z]+$/)
		})

		it("ui metadata values are i18n keys, not operational content", () => {
			expect(reviewer?.ui?.nameKey).toMatch(/^[a-z]+\.[a-z]+$/)
			expect(reviewer?.ui?.descriptionKey).toMatch(/^[a-z]+\.[a-z]+$/)
			reviewer?.ui?.noticeKeys?.forEach((key) => {
				expect(key).toMatch(/^[a-z]+\.[a-zA-Z]+$/)
			})
		})
	})
})

describe("default orchestrator mode", () => {
	it("has read tools available", () => {
		expect(orchestrator).toBeDefined()
		expect(orchestrator?.groups).toContain("read")
	})

	it("references improver and integrator as delegated roles", () => {
		expect(orchestrator).toBeDefined()
		// The protocol allows mentioning them as "when needed" roles
		expect(orchestrator?.roleDefinition).toMatch(/\b(improver|integrator)\b/)
		expect(orchestrator?.customInstructions).not.toContain("you are an improver")
		expect(orchestrator?.customInstructions).not.toContain("you are an integrator")
	})

	it("contains enhanced protocol content", () => {
		const instructions = orchestrator?.customInstructions?.toLowerCase() ?? ""
		expect(instructions).toMatch(/simple[\s\S]*moderate[\s\S]*complex/)
		expect(instructions).toContain("stage gate")
		expect(instructions).toContain("mini-spec")
		expect(instructions).toContain("evidence")
	})
})

describe("default reviewer mode", () => {
	it("has no Cyrillic text in its role definition", () => {
		expect(reviewer).toBeDefined()
		expect(reviewer?.roleDefinition).not.toMatch(/[а-яА-ЯёЁ]/)
	})

	it("has no Cyrillic text in its custom instructions", () => {
		expect(reviewer).toBeDefined()
		expect(reviewer?.customInstructions).not.toMatch(/[а-яА-ЯёЁ]/)
	})

	it("does not duplicate reviewer restrictions across prompt fields", () => {
		expect(reviewer).toBeDefined()
		const roleDefinition = reviewer?.roleDefinition ?? ""
		const customInstructions = reviewer?.customInstructions ?? ""
		const restrictions = [
			"do not modify code",
			"do not request or use data outside the declared contract",
			"express every proposed change as a finding recommendation",
		]

		for (const restriction of restrictions) {
			expect(roleDefinition.toLowerCase()).not.toContain(restriction)
			expect(customInstructions.toLowerCase()).toContain(restriction)
		}
	})
})

describe("default implementation and planning mode contracts", () => {
	it("code has boundary and result-format instructions", () => {
		expect(code).toBeDefined()
		expect(code?.customInstructions).toBeTruthy()
		expect(code?.customInstructions).toMatch(/boundary/i)
		expect(code?.customInstructions).toMatch(/format/i)
	})

	it("debug has result-format and unavailable-user instructions", () => {
		expect(debug).toBeDefined()
		expect(debug?.customInstructions).toMatch(/format/i)
		expect(debug?.customInstructions).toMatch(/unavailable/i)
	})

	it("ask keeps its constraints out of the role definition", () => {
		expect(ask).toBeDefined()
		const roleDefinition = ask?.roleDefinition.toLowerCase() ?? ""
		const customInstructions = ask?.customInstructions?.toLowerCase() ?? ""
		const constraints = ["do not switch", "without making changes"]

		for (const constraint of constraints) {
			expect(customInstructions).toContain(constraint)
			expect(roleDefinition).not.toContain(constraint)
		}
	})

	it("architect instructions remain planning-only", () => {
		expect(architect).toBeDefined()
		const instructions = architect?.customInstructions ?? ""
		expect(instructions).toMatch(/plan|planning/i)
		expect(instructions).not.toMatch(/implement the solution|write code|modify code/i)
	})
})
