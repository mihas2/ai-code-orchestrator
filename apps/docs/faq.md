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
- Delegate parts of a task to specialized modes (orchestration)
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

The AI Code Orchestrator extension is free and [open-source](https://github.com/mihas2/ai-code-orchestrator/).

AI Code Orchestrator relies on external LLM inference providers (like [Anthropic](providers/anthropic.md), [OpenAI](providers/openai.md), [OpenRouter](providers/openrouter.md), [Requesty](providers/requesty.md), etc.) for its AI capabilities.
These providers typically charge for API usage based on the number of tokens processed. You will need to create an account and obtain an API key from your chosen provider. Learn more [about providers and how to set them up](providers/README.md) for details.

### What are the risks of using AI Code Orchestrator?

AI Code Orchestrator is a powerful tool, and it's important to use it responsibly. Here are some things to keep in mind:

- **AI Code Orchestrator can make mistakes.** Always review AI Code Orchestrator's proposed changes carefully before approving them.
- **AI Code Orchestrator can execute commands.** Be very cautious about allowing AI Code Orchestrator to run commands, especially if you're using auto-approval.
- **AI Code Orchestrator can reach the network.** Commands and MCP servers it runs can access the internet; review them before approving.

---

## Setup & Installation

### How do I install AI Code Orchestrator?

See the [Installation Guide](getting-started/installing.md) for detailed instructions.

### Which API providers are supported?

See the [full list here](providers/README.md).

### How do I get an API key?

Each API provider has its own process for obtaining an API key. See the [Setting Up Your First AI Provider](getting-started/connecting-api-provider.md) for links to the relevant documentation for each provider.

### Can I use AI Code Orchestrator with local models?

Yes, AI Code Orchestrator supports running models locally using [Ollama](providers/ollama.md) and [LM Studio](providers/lmstudio.md). See [Using Local Models](advanced-usage/local-models.md) for instructions.

---

## Extension Usage

### How do I start a new task?

Open the AI Code Orchestrator panel and type your task in the chat box. Be clear and specific about what you want AI Code Orchestrator to do. See [Typing Your Requests](basic-usage/typing-your-requests.md) for best practices.

### What are modes in AI Code Orchestrator?

[Modes](basic-usage/using-modes.md) are different personas that AI Code Orchestrator can adopt, each with a specific focus and set of capabilities. The built-in modes are:

- **Orchestrator** (default): For coordinating complex workflows by delegating subtasks to specialized modes.
- **Code:** For general-purpose coding tasks.
- **Architect:** For planning and technical leadership.
- **Ask:** For answering questions and providing information.
- **Debug:** For systematic problem diagnosis.
- **Reviewer:** For independent quality validation and verification.
- **Translate:** For translating text, documentation, and localization files.

You can also create [Custom Modes](features/custom-modes.md).

### How do I switch between modes?

Use the dropdown menu in the chat input area, type a slash command such as `/code` at the start of your message, or press `Cmd/Ctrl + .` to cycle through modes.

### What are tools and how do I use them?

[Tools](basic-usage/how-tools-work.md) are how AI Code Orchestrator interacts with your system. AI Code Orchestrator automatically selects and uses the appropriate tools to complete your tasks. You don't need to call tools directly. You will be prompted to approve or reject each tool use.

### What are context mentions?

[Context mentions](basic-usage/context-mentions.md) are a way to provide AI Code Orchestrator with specific information about your project, such as files, folders, or problems. Use the "@" symbol followed by the item you want to mention (e.g., `@/src/file.ts`, `@problems`).

### Can AI Code Orchestrator access the internet?

There is no built-in browser tool. AI Code Orchestrator reaches the network only through commands it runs (with your approval) and through [MCP servers](features/mcp/overview.md) you connect, for example a server that fetches web pages. A URL [mention](basic-usage/context-mentions.md) is passed to the model as text and is not downloaded.

### Can AI Code Orchestrator run commands in my terminal?

Yes, AI Code Orchestrator can execute commands in your VS Code terminal. You will be prompted to approve each command before it's executed, unless you've enabled auto-approval for commands. Be extremely cautious about auto-approving commands. If you're experiencing issues with terminal commands, see the [Shell Integration Guide](features/shell-integration.md) for troubleshooting.

### How do I provide feedback to AI Code Orchestrator?

You can provide feedback by approving or rejecting AI Code Orchestrator's proposed actions. You can provide additional feedback by using the feedback field.

### Can I customize AI Code Orchestrator's behavior?

Yes, you can customize AI Code Orchestrator in several ways:

- **Custom Instructions:** Provide general instructions that apply to all modes, or mode-specific instructions.
- **Custom Modes:** Create your own modes with tailored prompts and some tool permissions.
- **`.aicorules` Files:** Create `.aicorules` files in your project to provide additional guidelines.
- **Settings:** Adjust various settings, such as auto-approval, checkpoints, terminal behavior, and more.

### Does AI Code Orchestrator have any auto approval settings?

Yes, AI Code Orchestrator has a few settings that when enabled will automatically approve actions. Find out more [here](features/auto-approving-actions.md).

---

## Advanced Features

### Can I use AI Code Orchestrator offline?

Yes, if you use a [local model](advanced-usage/local-models.md).

### What is MCP (Model Context Protocol)?

[MCP](features/mcp/overview.md) is a protocol that allows AI Code Orchestrator to communicate with external servers, extending its capabilities with custom tools and resources.

### Can I create my own MCP servers?

Yes, you can create your own MCP servers to add custom functionality to AI Code Orchestrator. See the [MCP documentation](https://github.com/modelcontextprotocol) for details.

### What is Codebase Indexing?

[Codebase Indexing](features/codebase-indexing.md) creates a semantic search index of your project using AI embeddings. This enables AI Code Orchestrator to better understand and navigate large codebases by finding relevant code based on meaning rather than just keywords.

### How much does Codebase Indexing cost?

Codebase Indexing requires an embedding provider (OpenAI, OpenAI-compatible, Gemini, Mistral, Ollama, OpenRouter, Vercel AI Gateway, or AWS Bedrock) and a Qdrant vector database for storage. Local Ollama embeddings and a local Qdrant cost nothing. Costs depend on your project size and the embedding model used. Initial indexing is the most expensive part; subsequent updates are incremental and much cheaper.

---

## Troubleshooting

### AI Code Orchestrator isn't responding. What should I do?

- Make sure your API key is correct and hasn't expired.
- Check your internet connection.
- Check the status of your chosen API provider.
- Try restarting VS Code.

### I'm seeing an error message. What does it mean?

Click **Details** on the error in the chat to see the full message and copy diagnostic information. See [Reporting Errors](reporting-errors.md).

### AI Code Orchestrator made changes I didn't want. How do I undo them?

AI Code Orchestrator uses VS Code's built-in file editing capabilities. You can use the standard "Undo" command (Ctrl/Cmd + Z) to revert changes. Also, [checkpoints](features/checkpoints.md) (enabled by default) let you restore the workspace to the state before a change.

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

Open an issue on [GitHub Issues](https://github.com/mihas2/ai-code-orchestrator/issues). For bugs, include the steps to reproduce and the diagnostic information from the error's **Details** view.
