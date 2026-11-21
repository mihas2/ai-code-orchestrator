import { unparsedNativeToolCallFallback } from "../Task"

describe("unparsedNativeToolCallFallback", () => {
	it("builds a minimal tool_use so a failed non-streaming parse still has a tool_result", () => {
		expect(unparsedNativeToolCallFallback("mystery_tool", "call_1")).toEqual({
			type: "tool_use",
			name: "mystery_tool",
			id: "call_1",
			params: {},
			partial: false,
			parseError:
				"Invalid tool call for 'mystery_tool': the arguments are not a valid JSON object. Retry the call with a single JSON object as arguments.",
		})
	})

	it("lists the expected parameters for a known tool", () => {
		const fallback = unparsedNativeToolCallFallback("read_file", "call_2")

		expect(fallback.parseError).toContain("Required parameters: path.")
		expect(fallback.parseError).toContain(
			"Optional parameters (omit when not needed): mode, offset, limit, indentation.",
		)
	})
})
