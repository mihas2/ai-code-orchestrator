import type OpenAI from "openai"

const ASK_FOLLOWUP_QUESTION_DESCRIPTION = `Ask the user a question to gather additional information needed to complete the task. Use when you need clarification or more details to proceed effectively.

Parameters:
- question: (required) A clear, specific question addressing the information needed
- follow_up: (required) A list of 2-4 suggested answers. Suggestions must be complete, actionable answers without placeholders.

Example: Asking for file path
{ "question": "What is the path to the frontend-config.json file?", "follow_up": [{ "text": "./src/frontend-config.json" }, { "text": "./config/frontend-config.json" }, { "text": "./frontend-config.json" }] }`

const QUESTION_PARAMETER_DESCRIPTION = `Clear, specific question that captures the missing information you need`

const FOLLOW_UP_PARAMETER_DESCRIPTION = `Required list of 2-4 suggested responses; each suggestion must be a complete, actionable answer`

const FOLLOW_UP_TEXT_DESCRIPTION = `Suggested answer the user can pick`

export default {
	type: "function",
	function: {
		name: "ask_followup_question",
		description: ASK_FOLLOWUP_QUESTION_DESCRIPTION,
		strict: true,
		parameters: {
			type: "object",
			properties: {
				question: {
					type: "string",
					description: QUESTION_PARAMETER_DESCRIPTION,
				},
				follow_up: {
					type: "array",
					description: FOLLOW_UP_PARAMETER_DESCRIPTION,
					items: {
						type: "object",
						properties: {
							text: {
								type: "string",
								description: FOLLOW_UP_TEXT_DESCRIPTION,
							},
						},
						required: ["text"],
						additionalProperties: false,
					},
					minItems: 1,
					maxItems: 4,
				},
			},
			required: ["question", "follow_up"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool
