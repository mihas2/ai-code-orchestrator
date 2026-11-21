/**
 * Shared TOOL USE section of the system prompt.
 *
 * @param parallelToolCalls Whether the provider accepts several tool calls in one response
 * (the user's "parallel tool calls" setting). The instruction must match what the API allows,
 * otherwise the model tries to pack several operations into one call.
 */
export function getSharedToolUseSection(parallelToolCalls = false): string {
	const callCountRule = parallelToolCalls
		? "You may call several tools in a single response when they are independent of each other; a call that depends on another call's result must wait for that result."
		: "Call exactly one tool per response and wait for its result before choosing the next step."

	return `====

TOOL USE

You have access to a set of tools that are executed upon the user's approval. Use the provider-native tool-calling mechanism. Do not include XML markup or examples. You must call at least one tool per assistant response; do not send a text-only response or put a proposed tool call in prose. Tools accept only the parameters defined in their schemas: omit optional parameters you do not need instead of inventing placeholder values, and keep any short explanation of the current step in plain text next to the tool call. Use attempt_completion only when the task is fully complete, ask_followup_question only when required information is genuinely missing, and otherwise call the most relevant execution or inspection tool immediately. ${callCountRule}`
}
