---
description: Find answers to common questions about AI Code Orchestrator, including setup, usage, troubleshooting, and advanced features. Get help with API keys, modes, and more.
keywords:
    - AI Code Orchestrator FAQ
    - frequently asked questions
    - troubleshooting
    - API setup
    - custom modes
    - MCP
    - local models
---

import KangaaicoIcon from '@site/src/components/KangaaicoIcon';

# Frequently Asked Questions

This page answers some common questions about AI Code Orchestrator.

---

## General

### What is AI Code Orchestrator?

AI Code Orchestrator is an open-source AI coding agent for VS Code designed to take full advantage of advanced large-language models.

### How does AI Code Orchestrator work?

AI Code Orchestrator uses large language models (LLMs) to understand your requests and translate them into actions. It can:

- Read and write files in your project
- Execute shell commands
- Perform web browsing (if enabled)
- Use external tools via the Model Context Protocol (MCP)

You interact with AI Code Orchestrator through a chat interface in the extension.

### What can AI Code Orchestrator do?

AI Code Orchestrator can help with a variety of coding tasks, including:

- Generating code from natural language descriptions.
- Refactoring existing code.
- Fixing bugs.
- Writing documentation.
- Explaining code.
- Answering questions about your codebase.
- Automating repetitive tasks.
- Creating new files and projects.

### Is AI Code Orchestrator free to use?

The AI Code Orchestrator extension is free and [open-source](https://github.com/AIOrchestrator/ai-code-orchestrator/).

AI Code Orchestrator relies on external LLM inference providers (like [Anthropic](providers/anthropic), [OpenAI](providers/openai), [OpenRouter](providers/openrouter), [Requesty](providers/requesty), etc.) for its AI capabilities.
These providers typically charge for API usage based on the number of tokens processed. You will need to create an account and obtain an API key from your chosen provider. Learn more [about providers and how to set them up](/providers/) for details.

### What are the risks of using AI Code Orchestrator?

AI Code Orchestrator is a powerful tool, and it's important to use it responsibly. Here are some things to keep in mind:

- **AI Code Orchestrator can make mistakes.** Always review AI Code Orchestrator's proposed changes carefully before approving them.
- **AI Code Orchestrator can execute commands.** Be very cautious about allowing AI Code Orchestrator to run commands, especially if you're using auto-approval.
- **AI Code Orchestrator can access the internet.** If you're using a provider that supports web browsing, be aware that AI Code Orchestrator could potentially access sensitive information.

---

## Setup & Installation

### How do I install AI Code Orchestrator?

See the [Installation Guide](/getting-started/installing) for detailed instructions.

### Which API providers are supported?

See the [full list here](/providers/).

### How do I get an API key?

Each API provider has its own process for obtaining an API key. See the [Setting Up Your First AI Provider](/getting-started/connecting-api-provider) for links to the relevant documentation for each provider.

### Can I use AI Code Orchestrator with local models?

Yes, AI Code Orchestrator supports running models locally using [Ollama](/providers/ollama) and [LM Studio](/providers/lmstudio). See [Using Local Models](/advanced-usage/local-models) for instructions.

---

## Extension Usage

### How do I start a new task?

Open the AI Code Orchestrator panel (<KangaaicoIcon />) and type your task in the chat box. Be clear and specific about what you want AI Code Orchestrator to do. See [Typing Your Requests](/basic-usage/typing-your-requests) for best practices.

### What are modes in AI Code Orchestrator?

[Modes](/basic-usage/using-modes) are different personas that AI Code Orchestrator can adopt, each with a specific focus and set of capabilities. The built-in modes are:

- **Code:** For general-purpose coding tasks.
- **Architect:** For planning and technical leadership.
- **Ask:** For answering questions and providing information.
- **Debug:** For systematic problem diagnosis.
- **Reviewer:** For independent quality validation and verification.
- **Orchestrator:** For coordinating complex workflows by delegating subtasks to specialized modes.

You can also create [Custom Modes](/features/custom-modes).

### How do I switch between modes?

Use the dropdown menu in the chat input area to select a different mode, or use the `/` command to switch to a specific mode.

### What are tools and how do I use them?

[Tools](/basic-usage/how-tools-work) are how AI Code Orchestrator interacts with your system. AI Code Orchestrator automatically selects and uses the appropriate tools to complete your tasks. You don't need to call tools directly. You will be prompted to approve or reject each tool use.

### What are context mentions?

[Context mentions](/basic-usage/context-mentions) are a way to provide AI Code Orchestrator with specific information about your project, such as files, folders, or problems. Use the "@" symbol followed by the item you want to mention (e.g., `@/src/file.ts`, `@problems`).

### Can AI Code Orchestrator access the internet?

Yes, if you are using a provider with a model that support web browsing. Be mindful of the security implications of allowing this.

### Can AI Code Orchestrator run commands in my terminal?

Yes, AI Code Orchestrator can execute commands in your VS Code terminal. You will be prompted to approve each command before it's executed, unless you've enabled auto-approval for commands. Be extremely cautious about auto-approving commands. If you're experiencing issues with terminal commands, see the [Shell Integration Guide](/features/shell-integration) for troubleshooting.

### How do I provide feedback to AI Code Orchestrator?

You can provide feedback by approving or rejecting AI Code Orchestrator's proposed actions. You can provide additional feedback by using the feedback field.

### Can I customize AI Code Orchestrator's behavior?

Yes, you can customize AI Code Orchestrator in several ways:

- **Custom Instructions:** Provide general instructions that apply to all modes, or mode-specific instructions.
- **Custom Modes:** Create your own modes with tailored prompts and some tool permissions.
- **`.aicorules` Files:** Create `.aicorules` files in your project to provide additional guidelines.
- **Settings:** Adjust various settings, such as auto-approval, diff editing, and more.

### Does AI Code Orchestrator have any auto approval settings?

Yes, AI Code Orchestrator has a few settings that when enabled will automatically approve actions. Find out more [here](/features/auto-approving-actions).

---

## Advanced Features

### Can I use AI Code Orchestrator offline?

Yes, if you use a [local model](/advanced-usage/local-models).

### What is MCP (Model Context Protocol)?

[MCP](/features/mcp/overview) is a protocol that allows AI Code Orchestrator to communicate with external servers, extending its capabilities with custom tools and resources.

### Can I create my own MCP servers?

Yes, you can create your own MCP servers to add custom functionality to AI Code Orchestrator. See the [MCP documentation](https://github.com/modelcontextprotocol) for details.

### What is Codebase Indexing?

[Codebase Indexing](/features/codebase-indexing) creates a semantic search index of your project using AI embeddings. This enables AI Code Orchestrator to better understand and navigate large codebases by finding relevant code based on meaning rather than just keywords.

### How much does Codebase Indexing cost?

Codebase Indexing requires an OpenAI API key for generating embeddings and a Qdrant vector database for storage. Costs depend on your project size and the embedding model used. Initial indexing is the most expensive part; subsequent updates are incremental and much cheaper.

---

## Troubleshooting

### AI Code Orchestrator isn't responding. What should I do?

- Make sure your API key is correct and hasn't expired.
- Check your internet connection.
- Check the status of your chosen API provider.
- Try restarting VS Code.

### I'm seeing an error message. What does it mean?

### AI Code Orchestrator made changes I didn't want. How do I undo them?

AI Code Orchestrator uses VS Code's built-in file editing capabilities. You can use the standard "Undo" command (Ctrl/Cmd + Z) to revert changes. Also, if experimental checkpoints are enabled, AI Code Orchestrator can revert changes made to a file.

### AI Code Orchestrator can't write to markdown files. What's wrong?

If AI Code Orchestrator fails to write to `.md` files with errors like "Failed to open diff editor" or "write_to_file tool failed", this is typically caused by VS Code extensions or settings that interfere with file editing:

**Common causes:**

- Extensions with "format on save" functionality
- VS Code settings that open markdown files in preview mode by default
- The Markdown Preview extension or similar markdown processing extensions

**Solutions:**

- Disable any extensions that automatically format files on save
- Remove these settings from your VS Code `settings.json`:
    ```json
    "markdown.preview.openMarkdownLinks": "inPreview",
    "workbench.editorAssociations": {
      "*.md": "vscode.markdown.preview.editor"
    }
    ```
- Temporarily disable markdown-related extensions to test if they're causing the issue
- Restart VS Code after making these changes

### How do I report a bug or suggest a feature?
