# attempt_completion

The `attempt_completion` tool signals that AI Code Orchestrator believes a task is complete and presents a final summary of the work. You can accept the result or reply with feedback, and AI Code Orchestrator continues the task based on it.

---

## Parameters

- `result` (required): The final result of the task — what was done, written so that it needs no further input from you.

---

## What It Does

The result is shown in a distinct "Task Completed" block in the chat. From there you can:

- accept it and start a new task, or
- reply with feedback; AI Code Orchestrator continues the same task and calls `attempt_completion` again when it is done.

In a **subtask** created with [`new_task`](new-task.md), the result is what the parent task receives: it becomes the summary the Orchestrator uses to verify the work and decide on the next step.

---

## When is it used?

- When every part of the request has been addressed
- After the results of previous tool calls have been confirmed as successful
- When a subtask has finished and needs to report back to its parent

The model is instructed not to call it while earlier tool results are still unknown, and not to end the result with questions or offers of further help.

---

## Limitations and Settings

- Only one result message per call; there is no option to run a demonstration command.
- If the `ai-code-orchestrator.preventCompletionWithOpenTodos` VS Code setting is enabled, completion is rejected while the task's [todo list](../../features/task-todo-list.md) still has open items.
- In a subtask the result goes to the parent task, so it should contain the evidence the parent needs (files changed, checks run, open issues).

---

## Result Formatting Guidelines

- Clearly state what was accomplished and how it was verified
- Be concise but complete
- Avoid filler text and closing questions
- Present information in a way that is easy to scan

---

## Usage Examples

Completing a task:

```json
{
	"result": "I've updated the CSS for the navigation bar to match the design mockup. The changes include:\n1. Updated color scheme to use the new brand colors\n2. Added responsive behavior for mobile devices\n3. Fixed the alignment issues in the dropdown menus"
}
```

Reporting back from a subtask:

```json
{
	"result": "Implemented password reset in src/auth/reset.ts and added tests in src/auth/__tests__/reset.spec.ts. `npm test -- reset` passes (6 tests). Email sending is stubbed; a real SMTP transport is still required."
}
```
