<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=mihas2.ai-code-orchestrator"><img src="https://img.shields.io/badge/VS_Code_Marketplace-007ACC?style=flat&logo=visualstudiocode&logoColor=white" alt="VS Code Marketplace"></a>
</p>

# AI Code Orchestrator

> Your AI-powered development team, right in your editor.

AI Code Orchestrator is a VS Code extension and CLI for planning, implementing, reviewing, and explaining software with configurable AI agents. It combines chat, code actions, terminal workflows, custom roles, MCP integrations, and multi-agent orchestration in one workspace.

## Capabilities

- Generate and modify code from natural-language requirements
- Plan architecture and break work into coordinated tasks
- Orchestrate work as a dependency-aware DAG with parallel executors, review stages, budgets, and controlled integration
- **Context optimization** - intelligent context management reduces token usage and costs while maintaining effectiveness
- Review changes, diagnose failures, and improve existing code
- Work with files, terminals, images, and external MCP tools
- Configure providers including Vercel AI Gateway and Unbound, models, permissions, and custom roles
- Assign models to individual roles, with automatic inheritance from the primary model when no override is configured
- Continue tasks from the editor or the command line

## Roles

AI Code Orchestrator adapts to the work at hand:

- **Code** - implement changes and operate on project files
- **Architect** - design systems, specifications, and migrations
- **Ask** - answer questions and explain code
- **Debug** - isolate root causes and validate fixes
- **Reviewer** - validate changes, identify issues, and ensure quality
- **Orchestrator** - coordinate dependency-aware task graphs and parallel agents; this is the default role
- **Translate** - translate and manage localization files
- **Custom** - create specialized workflows for a team

Each role can use its own model configuration. When no role-specific model is assigned, it inherits the primary model, making it easy to balance capability, speed, and cost across a workflow.

## Documentation

See the project documentation, including the orchestration specification, in [`apps/docs`](./apps/docs).

## Installation

Install the **AI Code Orchestrator** extension from the VS Code Marketplace, or rebuild a fresh VSIX locally:

```bash
pnpm install
pnpm rebuild:vsix
```

To rebuild and then install it interactively, run `pnpm install:vsix`. This explicitly rebuilds the webview before bundling and packaging the extension. A normal `pnpm install` only installs dependencies.

The CLI is available from the monorepo during development:

```bash
pnpm --filter @ai-code-orchestrator/cli dev
```

The package scope and legacy command identifiers are retained for compatibility with existing integrations.

## Attribution

AI Code Orchestrator is based on [Roo Code](https://github.com/RooCodeInc/Roo-Code). The implementation retains selected compatible APIs and identifiers so existing integrations can continue to work.

## License

[Apache 2.0](./LICENSE)
