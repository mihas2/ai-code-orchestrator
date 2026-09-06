import { DEFAULT_MODES } from "../mode.js"

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
