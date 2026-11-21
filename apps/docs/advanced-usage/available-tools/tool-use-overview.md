# Tool Use Overview

AI Code Orchestrator implements a sophisticated tool system that allows AI models to interact with your development environment in a controlled and secure manner. This document explains how tools work, when they're called, and how they're managed.

---

## Core Concepts

### Tool Groups

A mode's tool access is defined by the groups listed in its `groups` setting (see [Custom Modes](../../features/custom-modes.md)):

| Group         | Tools                                                                                                                                                                                                                                                 | Common Use                     |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| **`read`**    | [read_file](read-file.md), [search_files](search-files.md), [list_files](list-files.md), [codebase_search](codebase-search.md)                                                                                                                        | Code exploration and analysis  |
| **`edit`**    | [apply_diff](apply-diff.md), [write_to_file](write-to-file.md), [generate_image](generate-image.md), and the model-specific edit tools [edit](edit.md), [edit_file](edit-file.md), [search_replace](search-replace.md), [apply_patch](apply-patch.md) | Code changes and file creation |
| **`command`** | [execute_command](execute-command.md), [read_command_output](read-command-output.md)                                                                                                                                                                  | Running scripts, builds, tests |
| **`mcp`**     | [use_mcp_tool](use-mcp-tool.md), [access_mcp_resource](access-mcp-resource.md)                                                                                                                                                                        | External tools through MCP     |

Which edit tool a model gets depends on the model: some models are offered `edit`, `edit_file`, `search_replace`, or `apply_patch` in place of `apply_diff`. [generate_image](generate-image.md) additionally requires its experimental setting.

### Always Available Tools

These tools are available in every mode, regardless of its groups:

- [ask_followup_question](ask-followup-question.md): Gather additional information from users
- [attempt_completion](attempt-completion.md): Signal task completion
- [new_task](new-task.md): Create subtasks, each in the mode best suited for it
- [update_todo_list](update-todo-list.md): Maintain the task's todo list
- [skill](skill.md): Load a skill's instructions
- [run_slash_command](run-slash-command.md): Run a slash command _(experimental, requires enablement)_

> [!NOTE]
> There is no `switch_mode` tool. The model cannot change the mode of the current task; work that needs another mode is delegated to a subtask with [new_task](new-task.md). You change the mode of a task yourself from the mode selector under the chat.

---

## Available Tools

### Read Tools

These tools help AI Code Orchestrator understand your code and project:

- [read_file](read-file.md) - Examines the contents of files
- [list_files](list-files.md) - Maps your project's file structure
- [read_command_output](read-command-output.md) - Retrieves full output from truncated commands

### Search Tools

These tools help AI Code Orchestrator find patterns and functionality across your codebase:

- [search_files](search-files.md) - Finds patterns across multiple files using regex
- [codebase_search](codebase-search.md) - Performs semantic searches across your indexed codebase

### Edit Tools

These tools help AI Code Orchestrator make changes to your code:

- [apply_diff](apply-diff.md) - Makes precise, surgical changes to your code
- [apply_patch](apply-patch.md) - Applies multi-file unified diff patches
- [edit](edit.md) - Search-and-replace editing (first occurrence by default)
- [edit_file](edit-file.md) - Search-and-replace editing (all occurrences with count validation)
- [search_replace](search-replace.md) - Simple search-and-replace (all occurrences)
- [write_to_file](write-to-file.md) - Creates new files or completely rewrites existing ones

### Image Tools

These tools help AI Code Orchestrator generate and edit images:

- [generate_image](generate-image.md) - Generates AI-powered images from text prompts

### Command Tools

These tools help AI Code Orchestrator execute commands:

- [execute_command](execute-command.md) - Runs system commands and programs
- [run_slash_command](run-slash-command.md) - Executes predefined slash commands for templated instructions _(Experimental - requires enablement)_

### MCP Tools

These tools help AI Code Orchestrator connect with external services:

- [use_mcp_tool](use-mcp-tool.md) - Uses specialized external tools
- [access_mcp_resource](access-mcp-resource.md) - Accesses external data sources

### Workflow Tools

These tools help manage the conversation and task flow:

- [ask_followup_question](ask-followup-question.md) - Gets additional information from you
- [attempt_completion](attempt-completion.md) - Presents final results
- [new_task](new-task.md) - Creates a new subtask
- [update_todo_list](update-todo-list.md) - Updates task checklist progress
- [skill](skill.md) - Loads and executes predefined skill instructions

---

## Tool Calling Mechanism

### When Tools Are Called

Tools are invoked under specific conditions:

1. **Direct Task Requirements**

    - When specific actions are needed to complete a task as decided by the LLM
    - In response to user requests
    - During automated workflows

2. **Mode-Based Availability**

    - Different modes enable different tool sets
    - Changing the mode (by you, or by starting a subtask in another mode) changes the available tools
    - Some tools are restricted to specific modes

3. **Context-Dependent Calls**
    - Based on the current state of the workspace
    - In response to system events
    - During error handling and recovery

### Decision Process

The system uses a multi-step process to determine tool availability:

1. **Mode Validation**

    ```typescript
    isToolAllowedForMode(
        tool: string,
        modeSlug: string,
        customModes: ModeConfig[],
        toolRequirements?: Record<string, boolean>,
        toolParams?: Record<string, any>
    )
    ```

2. **Requirement Checking**

    - System capability verification
    - Resource availability
    - Permission validation

3. **Parameter Validation**
    - Required parameter presence
    - Parameter type checking
    - Value validation

---

## Technical Implementation

### Tool Call Processing

1. **Initialization**

    - Tool name and parameters are validated
    - Mode compatibility is checked
    - Requirements are verified

2. **Execution**

    ```typescript
    const toolCall = {
    	type: "tool_call",
    	name: chunk.name,
    	arguments: chunk.input,
    	callId: chunk.callId,
    }
    ```

3. **Result Handling**
    - Success/failure determination
    - Result formatting
    - Error handling

### Security and Permissions

1. **Access Control**

    - File system restrictions
    - Command execution limitations
    - Network access controls

2. **Validation Layers**
    - Tool-specific validation
    - Mode-based restrictions
    - System-level checks

---

## Mode Integration

### Mode-Based Tool Access

Tools are made available based on the current mode:

- **Code, Debug, Translate**: `read`, `edit`, `command`, `mcp`
- **Architect**: `read`, `command`, `mcp`, and `edit` restricted to Markdown files
- **Ask, Reviewer, Orchestrator**: `read`, `command`, `mcp` — no file edits
- **Custom Modes**: Any combination of groups, optionally with file restrictions for `edit`

See [Using Modes](../../basic-usage/using-modes.md) for details.

### Changing Modes

1. **Who changes the mode**

    - You, with the mode selector under the chat, a slash command, or the keyboard shortcut
    - The model never switches the mode of the running task; it delegates work to another mode with [new_task](new-task.md)

2. **Impact on Tools**
    - Tool set changes
    - Permission adjustments
    - A subtask has its own conversation history; only its result returns to the parent

---

## Best Practices

### Tool Usage Guidelines

1. **Efficiency**

    - Use the most specific tool for the task
    - Avoid redundant tool calls
    - Batch operations when possible

2. **Security**

    - Validate inputs before tool calls
    - Use minimum required permissions
    - Follow security best practices

3. **Error Handling**
    - Implement proper error checking
    - Provide meaningful error messages
    - Handle failures gracefully

### Common Patterns

1. **Information Gathering**

    [ask_followup_question](ask-followup-question.md) → [read_file](read-file.md) → [codebase_search](codebase-search.md)

2. **Code Modification**

    [read_file](read-file.md) → [apply_diff](apply-diff.md) → [attempt_completion](attempt-completion.md)

3. **Task Management**
   [update_todo_list](update-todo-list.md) → [new_task](new-task.md) → [attempt_completion](attempt-completion.md)

---

## Error Handling and Recovery

### Error Types

1. **Tool-Specific Errors**

    - Parameter validation failures
    - Execution errors
    - Resource access issues

2. **System Errors**

    - Permission denied
    - Resource unavailable
    - Network failures

3. **Context Errors**
    - Invalid mode for tool
    - Missing requirements
    - State inconsistencies

### Recovery Strategies

1. **Automatic Recovery**

    - Retry mechanisms
    - Fallback options
    - State restoration

2. **User Intervention**
    - Error notifications
    - Recovery suggestions
    - Manual intervention options
