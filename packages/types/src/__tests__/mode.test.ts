import { DEFAULT_MODES } from "../mode.js"

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
