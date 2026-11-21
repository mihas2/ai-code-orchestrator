export function getToolUseGuidelinesSection(parallelToolCalls = false): string {
	const multipleActions = parallelToolCalls
		? "3. If multiple actions are needed, you may call several independent tools in one response, or use tools iteratively across responses. Each tool use should be informed by the results of previous tool uses. Do not assume the outcome of any tool use. Each step must be informed by the previous step's result."
		: "3. If multiple actions are needed, use one tool per response to accomplish the task iteratively, with each tool use informed by the result of the previous one. Do not assume the outcome of any tool use. Each step must be informed by the previous step's result."

	return `# Tool Use Guidelines

1. Assess what information you already have and what information you need to proceed with the task.
2. Choose the most appropriate tool based on the task and the tool descriptions provided. Assess if you need additional information to proceed, and which of the available tools would be most effective for gathering this information. For example using the list_files tool is more effective than running a command like \`ls\` in the terminal. It's critical that you think about each available tool and use the one that best fits the current step in the task.
${multipleActions}

By carefully considering the user's response after tool executions, you can react accordingly and make informed decisions about how to proceed with the task. This iterative process helps ensure the overall success and accuracy of your work.`
}
