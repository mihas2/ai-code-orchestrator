import type OpenAI from "openai"

import { describeModeSlugParameter } from "./mode-slug-description"

const SWITCH_MODE_DESCRIPTION = `Request to switch to a different mode. This tool allows modes to request switching to another mode when needed, such as switching to Code mode to make code changes. The user must approve the mode switch.`

const MODE_SLUG_PARAMETER_DESCRIPTION = describeModeSlugParameter("switch to")

const REASON_PARAMETER_DESCRIPTION = `Explanation for why the mode switch is needed`

export default {
	type: "function",
	function: {
		name: "switch_mode",
		description: SWITCH_MODE_DESCRIPTION,
		strict: true,
		parameters: {
			type: "object",
			properties: {
				mode_slug: {
					type: "string",
					description: MODE_SLUG_PARAMETER_DESCRIPTION,
				},
				reason: {
					type: "string",
					description: REASON_PARAMETER_DESCRIPTION,
				},
			},
			required: ["mode_slug", "reason"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool
