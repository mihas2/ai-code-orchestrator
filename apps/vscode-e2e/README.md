# VS Code E2E tests

These tests run inside an Extension Development Host and exercise the real extension API and webview bridge. By default they use the in-process `MockAIProvider`, so they make no HTTP requests and do not require provider credentials.

## Running role model assignment tests

These tests run in the Extension Development Host and cover profile/model routing, persistence across active-profile changes, webview-to-global-state saves, and independent orchestration child assignments. Use `TEST_FILE` to run the suite explicitly:

```bash
TEST_FILE=role-model-assignment.test pnpm --filter @ai-code-orchestrator/vscode-e2e test:run
```

The mock supports streaming chunks, deterministic tool calls, planner JSON, and configurable latency. Set `MOCK_AI_DELAY_MS=0` for the fastest run.

## Running orchestration flow tests

1. From the repository root, run:

```bash
pnpm --filter @ai-code-orchestrator/vscode-e2e test:ci
```

`test:ci` first builds the extension bundle and webview. The harness sets `AICO_E2E=1` so the Extension Development Host uses the built webview instead of requiring a Vite server on `localhost:5173`.

To run only the orchestration suite:

```bash
TEST_FILE=orchestration-flow.test pnpm --filter @ai-code-orchestrator/vscode-e2e test:run
```

The suite uses a serial worker configuration and explicit lifecycle events rather than fixed sleeps. The API provider is configured by `src/suite/index.ts`. To exercise deterministic failures, configure `MockAIProvider` with an `errorMatcher` in the harness. For manual testing with a real provider, temporarily replace the `fake-ai` configuration in that file with the provider settings and credentials appropriate for your environment.
