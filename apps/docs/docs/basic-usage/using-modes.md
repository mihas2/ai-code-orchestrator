---
description: Learn how to use AI Code Orchestrator's specialized modes for different tasks. Switch between Code, Ask, Architect, Debug, Reviewer, and Orchestrator modes for optimal AI assistance.
keywords:
    - AI Code Orchestrator modes
    - Code mode
    - Ask mode
    - Architect mode
    - Debug mode
    - Reviewer mode
    - Orchestrator mode
    - AI assistant modes
    - mode switching
---

# Using Modes

Modes in AI Code Orchestrator are specialized personas that tailor the assistant's behavior to your current task. Each mode offers different capabilities, expertise, and access levels to help you accomplish specific goals.

:::info Models per Role & Mode Persistence
Assign each role its own provider profile and model in Settings (gear icon) → **Roles** (e.g., a Gemini profile for `🏗️ Architect`, a local model for `💻 Code`). Tasks and subtasks running in that role use this profile and model. A role without an assignment uses the profile selected in Settings → **Providers**. See [Linking Profiles to Roles](/features/api-configuration-profiles#linking-profiles-to-roles).

Choosing a role in Settings → Roles only opens it for editing: it does not change the mode of the current chat, and changing the chat's mode does not change which role is open in Settings.

Your selected mode persists between sessions—AI Code Orchestrator remembers which mode you were using when you return.
:::

---

## Why Use Different Modes?

- **Task specialization:** Get precisely the type of assistance you need for your current task
- **Safety controls:** Prevent unintended file modifications when focusing on planning or learning
- **Focused interactions:** Receive responses optimized for your current activity
- **Workflow optimization:** Seamlessly transition between planning, implementing, debugging, and learning

---

## Switching Between Modes

Three ways to switch modes:

1. **Dropdown menu:** Click the selector to the left of the chat input

 <img src="/img/using-modes/using-modes.png" alt="Using the dropdown menu to switch modes" width="400" />

2. **Slash command:** Type `/architect`, `/ask`, `/debug`, `/code`, or `/orchestrator` at the beginning of your message. This will switch to that mode and clear the input field.

 <img src="/img/using-modes/using-modes-1.png" alt="Using slash commands to switch modes" width="400" />

3. **Toggle command/Keyboard shortcut:** Use the keyboard shortcut below, applicable to your operating system. Each press cycles through the available modes in sequence, wrapping back to the first mode after reaching the end.

    | Operating System | Shortcut |
    | ---------------- | -------- |
    | macOS            | ⌘ + .    |
    | Windows          | Ctrl + . |
    | Linux            | Ctrl + . |

The model itself cannot switch the mode of a running task. When work needs another mode, it is delegated to a subtask in that mode with [`new_task`](/advanced-usage/available-tools/new-task), and the parent task keeps its own mode.

---

## Built-in Modes

### Code Mode (Default)

| Aspect               | Details                                                                                                  |
| -------------------- | -------------------------------------------------------------------------------------------------------- |
| **Name**             | `💻 Code`                                                                                                |
| **Description**      | A skilled software engineer with expertise in programming languages, design patterns, and best practices |
| **Tool Access**      | Full access to all tool groups: `read`, `edit`, `command`, `mcp`                                         |
| **Ideal For**        | Writing code, implementing features, debugging, and general development                                  |
| **Special Features** | No tool restrictions—full flexibility for all coding tasks                                               |

### Ask Mode

| Aspect               | Details                                                                                                                                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Name**             | `❓ Ask`                                                                                                                                                                                                      |
| **Description**      | A knowledgeable technical assistant focused on providing thorough and complete answers. It's less inclined to switch to implementing code unless explicitly requested and may use diagrams for clarification. |
| **Tool Access**      | Limited access: `read`, `mcp` only (cannot edit files or run commands)                                                                                                                                        |
| **Ideal For**        | Code explanation, concept exploration, and technical learning                                                                                                                                                 |
| **Special Features** | Optimized for detailed, informative responses, often using diagrams for clarity, without modifying your project.                                                                                              |

### Architect Mode

| Aspect               | Details                                                                                              |
| -------------------- | ---------------------------------------------------------------------------------------------------- |
| **Name**             | `🏗️ Architect`                                                                                       |
| **Description**      | An experienced technical leader and planner who helps design systems and create implementation plans |
| **Tool Access**      | Access to `read`, `mcp`, and restricted `edit` (markdown files only)                                 |
| **Ideal For**        | System design, high-level planning, and architecture discussions                                     |
| **Special Features** | Follows a structured approach from information gathering to detailed planning                        |

### Debug Mode

| Aspect               | Details                                                                                                                                                                                   |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Name**             | `🪲 Debug`                                                                                                                                                                                |
| **Description**      | An expert problem solver specializing in systematic troubleshooting and diagnostics                                                                                                       |
| **Tool Access**      | Full access to all tool groups: `read`, `edit`, `command`, `mcp`                                                                                                                          |
| **Ideal For**        | Tracking down bugs, diagnosing errors, and resolving complex issues                                                                                                                       |
| **Special Features** | Uses a methodical approach of analyzing, narrowing possibilities, and fixing issues. Includes custom instructions to reflect, distill possibilities, add logs, and confirm before fixing. |

### Orchestrator Mode (aka Boomerang Mode)

| Aspect               | Details                                                                                                                                                                                       |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Name**             | `🪃 Orchestrator`                                                                                                                                                                             |
| **Description**      | A strategic workflow orchestrator (aka Boomerang Mode) that breaks down complex tasks and delegates them to specialized modes. Learn more about [Boomerang Tasks](/features/boomerang-tasks). |
| **Tool Access**      | Limited access: `read` group access only (uses `new_task` tool to delegate work to other modes)                                                                                               |
| **Ideal For**        | Managing multi-step projects, coordinating work across different modes, and automating complex workflows                                                                                      |
| **Special Features** | Uses the [`new_task`](/advanced-usage/available-tools/new-task) tool to delegate subtasks to other modes.                                                                                     |

### Reviewer Mode

| Aspect               | Details                                                                                                                       |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Name**             | `🔍 Reviewer`                                                                                                                 |
| **Description**      | An independent quality validator focused on verifying correctness, test coverage, security, and absence of regressions       |
| **Tool Access**      | Limited access: `read`, `mcp` only (cannot edit files or run commands)                                                        |
| **Ideal For**        | Post-implementation quality assurance, validating acceptance criteria, security review, and regression testing                |
| **Special Features** | Validates work against acceptance criteria with evidence, identifies issues without modifying code, prepares validation reports |

---

## Customizing Modes

Tailor AI Code Orchestrator's behavior by customizing existing modes or creating new specialized assistants. Define tool access, file permissions, and behavior instructions to enforce team standards or create purpose-specific assistants. See [Custom Modes documentation](/features/custom-modes) for setup instructions.

### Understanding Tool Groups

Each tool group provides specific capabilities:

- **`read`**: File reading, listing, and searching capabilities
- **`edit`**: File modification and creation capabilities
- **`command`**: Terminal command execution
- **`mcp`**: Model Context Protocol server interactions

For detailed information about available tools, see the [Available Tools documentation](/advanced-usage/available-tools/tool-use-overview).
