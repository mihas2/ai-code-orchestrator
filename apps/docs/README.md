# AI Code Orchestrator Docs

AI Code Orchestrator is an open-source AI coding agent for VS Code designed to take full advantage of advanced large-language models and change how you create software at a fundamental level. It's powerful, customizable, and model-agnostic, with actual file system access, terminal control, and multi-step workflows.

AI Code Orchestrator's approach is to trade tokens for quality. If you want the best and most effective AI coding experience available, this is it.

The AI Code Orchestrator VS Code extension works locally in your IDE and gives you full control over your coding experience. It's great for deep or highly iterative development work, and it fits into your existing workflow.

## What can AI Code Orchestrator do for you

- Generate Code from natural language descriptions and specs
- Refactor & debug existing code
- Write & update documentation
- Answer questions about your codebase
- Automate repetitive tasks
- Utilize MCP Servers

## A mindset for success

The most successful AI Code Orchestrator users tend to embrace the following ideas:

- **Leverage model agnosticism:** AI Code Orchestrator isn't an LLM model, it needs an [LLM provider](providers/README.md) to work. But it's compatible with dozens of providers and hundreds of models, so you're free to experiment, optimize and switch around, by design. No lock-ins in a world where "the best model" changes every other week.
- **Don't skimp on tokens:** expensive state-of-the-art models with lots of tokens will almost always beat cheap models using few tokens. Pay attention to your budget, but embrace the fact that tokens are cheaper than developer time.
- **Trust roles:** The extension's customizable Modes (Architect, Code, etc) keep the models on track and focused on the task at hand, without stepping outside of their boundaries. Lean on them depending on the task you're working on.
- **Be ambitious:** AI Code Orchestrator works best the more you trust it. Out-of-the-box, the extension will ask for your permission to do everything, but as you become more comfortable and enable [Auto-Approve](features/auto-approving-actions.md), you'll see it work for long periods on its own without getting stuck or making bad decisions. Once ready, throw large, complex projects at the [Orchestrator](basic-usage/using-modes.md#orchestrator-mode-aka-boomerang-mode), who will coordinate tasks across Modes.

## Getting Started

- [Install the Extension](getting-started/installing.md)
- [Connect an LLM Provider](getting-started/connecting-api-provider.md)

## Contents

### Getting Started & Basic Usage

- [Installing AI Code Orchestrator](getting-started/installing.md)
- [Connecting Your First LLM Provider](getting-started/connecting-api-provider.md)
- [Your first task](getting-started/your-first-task.md)
- [The Chat Interface](basic-usage/the-chat-interface.md)
- [Typing Your Requests](basic-usage/typing-your-requests.md)
- [How Tools Work](basic-usage/how-tools-work.md)
- [Context Mentions](basic-usage/context-mentions.md)
- [Using Modes](basic-usage/using-modes.md)
- [Tips & Tricks](tips-and-tricks.md)
- [Reporting Errors](reporting-errors.md)

### Features

- [API Configuration Profiles](features/api-configuration-profiles.md)
- [Auto-Approving Actions](features/auto-approving-actions.md)
- [Boomerang Tasks: Orchestrate Complex Workflows](features/boomerang-tasks.md)
- [Checkpoints](features/checkpoints.md)
- [Code Actions](features/code-actions.md)
- [Codebase Indexing](features/codebase-indexing.md)
- [Custom Instructions](features/custom-instructions.md)
- [Diagnostics Integration](features/diagnostics-integration.md)
- [Customizing Modes](features/custom-modes.md)
- [Enhance Prompt](features/enhance-prompt.md)
- [Import, Export, and Reset Settings](features/settings-management.md)
- [Intelligent Context Condensing](features/intelligent-context-condensing.md)
- [Keyboard Navigation](features/keyboard-shortcuts.md)
- [Message Queueing](features/message-queueing.md)
- [Model Temperature](features/model-temperature.md)
- [Using .aicoignore to Control File Access](features/aicoignore.md)
- [Skills](features/skills.md)
- [Slash Commands](features/slash-commands.md)
- [Suggested Responses](features/suggested-responses.md)
- [Task Todo List](features/task-todo-list.md)
- [Worktrees](features/worktrees.md)
- [Terminal Shell Integration](features/shell-integration.md)
- [Additional Features](features/more-features.md)

### MCP

- [MCP Overview](features/mcp/overview.md)
- [Using MCP in AI Code Orchestrator](features/mcp/using-mcp-in-aico.md)
- [What is MCP?](features/mcp/what-is-mcp.md)
- [MCP Server Transports: STDIO, Streamable HTTP & SSE](features/mcp/server-transports.md)
- [MCP vs REST APIs: A Fundamental Distinction](features/mcp/mcp-vs-api.md)
- [Recommended MCP Servers](features/mcp/recommended-mcp-servers.md)

### Experimental

- [Experimental Features](features/experimental/experimental-features.md)
- [Custom Tools](features/experimental/custom-tools.md)
- [Background Editing](features/experimental/background-editing.md)
- [Image Generation](features/image-generation.md)
- [run_slash_command](advanced-usage/available-tools/run-slash-command.md)

### Advanced Usage

- [Context Poisoning](advanced-usage/context-poisoning.md)
- [Working with Large Projects](advanced-usage/large-projects.md)
- [Using Local Models](advanced-usage/local-models.md)
- [Prompt Engineering Tips](advanced-usage/prompt-engineering.md)
- [Prompt Structure](advanced-usage/prompt-structure.md)
- [Rate Limits and Costs](advanced-usage/rate-limits-costs.md)
- [AI Code Orchestrator Nightly](advanced-usage/aico-code-nightly.md)

### Available Tools

- [Tool Use Overview](advanced-usage/available-tools/tool-use-overview.md)
- [access_mcp_resource](advanced-usage/available-tools/access-mcp-resource.md)
- [apply_diff](advanced-usage/available-tools/apply-diff.md)
- [apply_patch](advanced-usage/available-tools/apply-patch.md)
- [ask_followup_question](advanced-usage/available-tools/ask-followup-question.md)
- [attempt_completion](advanced-usage/available-tools/attempt-completion.md)
- [codebase_search](advanced-usage/available-tools/codebase-search.md)
- [edit](advanced-usage/available-tools/edit.md)
- [edit_file](advanced-usage/available-tools/edit-file.md)
- [execute_command](advanced-usage/available-tools/execute-command.md)
- [generate_image](advanced-usage/available-tools/generate-image.md)
- [list_files](advanced-usage/available-tools/list-files.md)
- [new_task](advanced-usage/available-tools/new-task.md)
- [read_command_output](advanced-usage/available-tools/read-command-output.md)
- [read_file](advanced-usage/available-tools/read-file.md)
- [run_slash_command](advanced-usage/available-tools/run-slash-command.md)
- [search_files](advanced-usage/available-tools/search-files.md)
- [search_replace](advanced-usage/available-tools/search-replace.md)
- [skill](advanced-usage/available-tools/skill.md)
- [update_todo_list](advanced-usage/available-tools/update-todo-list.md)
- [use_mcp_tool](advanced-usage/available-tools/use-mcp-tool.md)
- [write_to_file](advanced-usage/available-tools/write-to-file.md)

### Model Providers

- [About Model Providers](providers/README.md)
- [Anthropic](providers/anthropic.md)
- [AnyModel](providers/anymodel.md)
- [ChatGPT Plus/Pro](providers/openai-chatgpt-plus-pro.md)
- [AWS Bedrock](providers/bedrock.md)
- [Baseten](providers/baseten.md)
- [DeepSeek](providers/deepseek.md)
- [Fireworks AI](providers/fireworks.md)
- [Google Gemini](providers/gemini.md)
- [LM Studio](providers/lmstudio.md)
- [LiteLLM](providers/litellm.md)
- [MiniMax](providers/minimax.md)
- [Mistral AI](providers/mistral.md)
- [Moonshot](providers/moonshot.md)
- [Ollama](providers/ollama.md)
- [OpenAI](providers/openai.md)
- [OpenAI Compatible](providers/openai-compatible.md)
- [OpenRouter](providers/openrouter.md)
- [Qwen Code CLI](providers/qwen-code.md)
- [Requesty](providers/requesty.md)
- [SambaNova](providers/sambanova.md)
- [Vercel AI Gateway](providers/vercel-ai-gateway.md)
- [GCP Vertex AI](providers/vertex.md)
- [VS Code Language Model API](providers/vscode-lm.md)
- [xAI (Grok)](providers/xai.md)
- [Z AI](providers/zai.md)

### Release Notes

- [All release notes](update-notes/README.md)
- [1.3.5](update-notes/v1.3.5.md)
- [1.3.2](update-notes/v1.3.2.md)
- [1.3.1](update-notes/v1.3.1.md)
- [1.3.0](update-notes/v1.3.0.md)
- [1.2.2](update-notes/v1.2.2.md)
- [1.2.1](update-notes/v1.2.1.md)
- [1.2.0](update-notes/v1.2.0.md)
- [1.1.4](update-notes/v1.1.4.md)
- [1.1.2](update-notes/v1.1.2.md)
- [1.1.1](update-notes/v1.1.1.md)
- [1.1.0](update-notes/v1.1.0.md)
- [1.0.0](update-notes/v1.0.0.md)

### Other

- [FAQ](faq.md)

## Additional Resources

- [GitHub Issues](https://github.com/mihas2/ai-code-orchestrator/issues): Report bugs and track development.
