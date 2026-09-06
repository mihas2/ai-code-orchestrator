import { DEFAULT_MODES } from "../mode.js"

const architect = DEFAULT_MODES.find((mode) => mode.slug === "architect")
const ask = DEFAULT_MODES.find((mode) => mode.slug === "ask")
const code = DEFAULT_MODES.find((mode) => mode.slug === "code")
const debug = DEFAULT_MODES.find((mode) => mode.slug === "debug")
const reviewer = DEFAULT_MODES.find((mode) => mode.slug === "reviewer")

describe("default orchestrator mode", () => {
	const orchestrator = DEFAULT_MODES.find((mode) => mode.slug === "orchestrator")

	it("has read tools available", () => {
		expect(orchestrator).toBeDefined()
		expect(orchestrator?.groups).toContain("read")
	})

	it("does not reference nonexistent improver or integrator roles", () => {
		expect(orchestrator).toBeDefined()
		expect(orchestrator?.roleDefinition).not.toMatch(/\b(improver|integrator)\b/)
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
