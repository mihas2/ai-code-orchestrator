---
description: Learn how to use .aicoignore files to control AI Code Orchestrator's file access, protect sensitive information, and manage which files the AI can read or modify.
keywords:
    - aicoignore
    - file access control
    - sensitive data protection
    - gitignore syntax
    - file permissions
    - security
sidebar_label: .aicoignore
---

# Using .aicoignore to Control File Access

The `.aicoignore` file is a key feature for managing AI Code Orchestrator's interaction with your project files. It allows you to specify files and directories that AI Code Orchestrator should not access or modify, similar to how `.gitignore` works for Git.

---

## What is `.aicoignore`?

- **Purpose**: To protect sensitive information, prevent accidental changes to build artifacts or large assets, and generally define AI Code Orchestrator's operational scope within your workspace.
- **How to Use**: Create a file named `.aicoignore` in the root directory of your VS Code workspace. List patterns in this file to tell AI Code Orchestrator which files and directories to ignore.
- **Scope**: `.aicoignore` affects both AI Code Orchestrator's tools and context mentions (like `@directory` attachments).

AI Code Orchestrator actively monitors the `.aicoignore` file. Any changes you make are reloaded automatically, ensuring AI Code Orchestrator always uses the most current rules. The `.aicoignore` file itself is always implicitly ignored, so AI Code Orchestrator cannot change its own access rules.

---

## Pattern Syntax

The syntax for `.aicoignore` is identical to `.gitignore`. Here are common examples:

- `node_modules/`: Ignores the entire `node_modules` directory.
- `*.log`: Ignores all files ending in `.log`.
- `config/secrets.json`: Ignores a specific file.
- `!important.log`: An exception; AI Code Orchestrator will _not_ ignore this specific file, even if a broader pattern like `*.log` exists.
- `build/`: Ignores the `build` directory.
- `docs/**/*.md`: Ignores all Markdown files in the `docs` directory and its subdirectories.

For a comprehensive guide on syntax, refer to the [official Git documentation on .gitignore](https://git-scm.com/docs/gitignore).

---

## How AI Code Orchestrator Tools Interact with `.aicoignore`

`.aicoignore` rules are enforced across various AI Code Orchestrator tools:

### Strict Enforcement (Reads & Writes)

These tools directly check `.aicoignore` before any file operation. If a file is ignored, the operation is blocked:

- [`read_file`](/advanced-usage/available-tools/read-file): Will not read ignored files.
- [`write_to_file`](/advanced-usage/available-tools/write-to-file): Will not write to or create new ignored files.
- [`apply_diff`](/advanced-usage/available-tools/apply-diff): Will not apply diffs to ignored files.

### File Discovery and Listing

- **[`list_files`](/advanced-usage/available-tools/list-files) Tool & `@directory` Attachments**: When AI Code Orchestrator lists files or when you use `@directory` attachments, ignored files are omitted or marked with a 🔒 symbol (see "User Experience" below). Both use identical filtering logic.
- **Environment Details**: Information about your workspace (like open tabs and project structure) provided to AI Code Orchestrator is filtered to exclude or mark ignored items.

### Context Mentions

- **`@directory` Attachments**: Directory contents respect `.aicoignore` patterns. Ignored files are filtered out or marked with `[🔒]` prefix depending on the `showAicoIgnoredFiles` setting.
- **Single File Mentions**: Ignored files return "(File is ignored by .aicoignore)" instead of content.

### Command Execution

- **[`execute_command`](/advanced-usage/available-tools/execute-command) Tool**: This tool checks if a command (from a predefined list like `cat` or `grep`) targets an ignored file. If so, execution is blocked.

---

## Key Limitations and Scope

- **Workspace-Centric**: `.aicoignore` rules apply **only to files and directories within the current VS Code workspace root**. Files outside this scope are not affected.
- **[`execute_command`](/advanced-usage/available-tools/execute-command) Specificity**: Protection for `execute_command` is limited to a predefined list of file-reading commands. Custom scripts or uncommon utilities might not be caught.
- **Not a Full Sandbox**: `.aicoignore` is a powerful tool for controlling AI Code Orchestrator's file access via its tools, but it does not create a system-level sandbox.

---

## User Experience and Notifications

- **Visual Cue (🔒)**: In file listings and `@directory` attachments, files ignored by `.aicoignore` may be marked with a lock symbol (🔒), depending on the `showAicoIgnoredFiles` setting (defaults to `true`).
- **Ignore Messages**: Single file mentions return "(File is ignored by .aicoignore)" instead of content.
- **Error Messages**: If a tool operation is blocked, AI Code Orchestrator receives an error: `"Access to [file_path] is blocked by the .aicoignore file settings. You must try to continue in the task without using this file, or ask the user to update the .aicoignore file."`
- **Chat Notifications**: You will typically see a notification in the AI Code Orchestrator chat interface when an action is blocked due to `.aicoignore`.

This guide helps you understand the `.aicoignore` feature, its capabilities, and its current limitations, so you can effectively manage AI Code Orchestrator's interaction with your codebase.
