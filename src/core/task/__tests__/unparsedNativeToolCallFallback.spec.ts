import { unparsedNativeToolCallFallback } from "../Task"

describe("unparsedNativeToolCallFallback", () => {
	it("builds a minimal tool_use so a failed non-streaming parse still has a tool_result", () => {
		expect(unparsedNativeToolCallFallback("mystery_tool", "call_1")).toEqual({
			type: "tool_use",
			name: "mystery_tool",
			id: "call_1",
			params: {},
			partial: false,
			parseError: "Invalid tool call for 'mystery_tool': arguments could not be parsed.",
		})
	})
})
