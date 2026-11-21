import type OpenAI from "openai"
import { DEFAULT_MODES } from "@ai-code-orchestrator/types"

import newTask from "../new_task"
import { getNativeTools } from "../index"

type FunctionTool = OpenAI.Chat.ChatCompletionTool & { type: "function" }

const getFunctionDef = (tool: OpenAI.Chat.ChatCompletionTool) => (tool as FunctionTool).function

describe("mode selection native tool descriptions", () => {
	it.each([["new_task", newTask, "mode"]] as const)(
		"%s lists every built-in slug, points at MODES, and keeps mode as an open string",
		(_name, tool, parameter) => {
			const definition = getFunctionDef(tool)
			const schema = definition.parameters as {
				properties: Record<string, { type?: unknown; description?: string; enum?: unknown }>
			}
			const modeParameter = schema.properties[parameter]

			expect(modeParameter.type).toBe("string")
			expect(modeParameter).not.toHaveProperty("enum")

			const description = modeParameter.description ?? ""
			for (const mode of DEFAULT_MODES) {
				expect(description).toContain(mode.slug)
			}
			expect(description).toContain("MODES")
			expect(description).toContain("custom modes")
			expect(description).not.toMatch(/\(e\.g\.,/)
		},
	)

	it("does not offer the removed switch_mode tool to the model", () => {
		const names = getNativeTools().map((tool) => getFunctionDef(tool).name)
		expect(names).not.toContain("switch_mode")
		expect(names).toContain("new_task")
	})
})
