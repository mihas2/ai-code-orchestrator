<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=AIOrchestrator.ai-orchestrator"><img src="https://img.shields.io/badge/VS_Code_Marketplace-007ACC?style=flat&logo=visualstudiocode&logoColor=white" alt="VS Code Marketplace"></a>
</p>

# AI Orchestrator

> Your AI-powered development team, right in your editor.

AI Orchestrator is a VS Code extension and CLI for planning, implementing, reviewing, and explaining software with configurable AI agents. It combines chat, code actions, terminal workflows, custom modes, MCP integrations, and multi-agent orchestration in one workspace.

## Capabilities

- Generate and modify code from natural-language requirements
- Plan architecture and break work into coordinated tasks
- Review changes, diagnose failures, and improve existing code
- Work with files, terminals, images, and external MCP tools
- Configure providers, models, permissions, and custom modes
- Continue tasks from the editor or the command line

## Modes

AI Orchestrator adapts to the work at hand:

- **Code** - implement changes and operate on project files
- **Architect** - design systems, specifications, and migrations
- **Ask** - answer questions and explain code
- **Debug** - isolate root causes and validate fixes
- **Custom** - create specialized workflows for a team

## Documentation

See the project documentation in `apps/docs` and the orchestration specification in `docs/`.

## Installation

Install the **AI Orchestrator** extension from the VS Code Marketplace, or build a VSIX locally:

```bash
pnpm install
pnpm vsix
```

The CLI is available from the monorepo during development:

```bash
pnpm --filter @AI Orchestrator/cli dev
```

The package scope and legacy command identifiers are retained for compatibility with existing integrations.

## Attribution

AI Orchestrator was created based on AI Orchestrator Code. The implementation retains selected compatible APIs and identifiers so existing integrations can continue to work.

## License

[Apache 2.0](./LICENSE)
