import { getRulesSection } from "../rules"

const baseSettings = {
	todoListEnabled: true,
	useAgentRules: true,
	newTaskRequireTodos: false,
}

describe("getRulesSection", () => {
	it("requires waiting for each tool result when parallel tool calls are disabled", () => {
		const rules = getRulesSection("/test/path", baseSettings)

		expect(rules).toContain("It is critical you wait for the result after each tool use")
		expect(rules).not.toContain("Independent calls may be issued together")
	})

	it("allows independent calls together when parallel tool calls are enabled", () => {
		const rules = getRulesSection("/test/path", { ...baseSettings, parallelToolCalls: true })

		expect(rules).toContain("Independent calls may be issued together in one response")
		expect(rules).not.toContain("It is critical you wait for the result after each tool use")
	})

	it("points to the execute_command cwd parameter instead of requiring cd", () => {
		const rules = getRulesSection("/test/path", baseSettings)

		expect(rules).toContain("execute_command `cwd` parameter")
	})
})
