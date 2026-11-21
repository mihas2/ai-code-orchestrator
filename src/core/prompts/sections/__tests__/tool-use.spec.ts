import { getSharedToolUseSection } from "../tool-use"

describe("getSharedToolUseSection", () => {
	it("should include native tool-calling instructions", () => {
		const section = getSharedToolUseSection()

		expect(section).toContain("provider-native tool-calling mechanism")
		expect(section).toContain("Do not include XML markup or examples")
	})

	it("should require one tool per response when parallel tool calls are disabled (default)", () => {
		const section = getSharedToolUseSection()

		expect(section).toContain("You must call at least one tool per assistant response")
		expect(section).toContain("Call exactly one tool per response")
		expect(section).not.toContain("You may call several tools in a single response")
	})

	it("should allow several independent tools when parallel tool calls are enabled", () => {
		const section = getSharedToolUseSection(true)

		expect(section).toContain("You may call several tools in a single response")
		expect(section).not.toContain("Call exactly one tool per response")
	})

	it("should not ask for reasoning in tool parameters or advertise providers", () => {
		for (const section of [getSharedToolUseSection(), getSharedToolUseSection(true)]) {
			expect(section).not.toContain("in the tool's parameters")
			expect(section).not.toMatch(/anymodel/i)
			expect(section).toContain("omit optional parameters")
		}
	})

	it("should NOT include single tool per message restriction", () => {
		const section = getSharedToolUseSection()

		expect(section).not.toContain("You must use exactly one tool call per assistant response")
		expect(section).not.toContain("Do not call zero tools or more than one tool")
	})

	it("should NOT include XML formatting instructions", () => {
		const section = getSharedToolUseSection()

		expect(section).not.toContain("<actual_tool_name>")
		expect(section).not.toContain("</actual_tool_name>")
	})
})
