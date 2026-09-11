# AI Code Orchestrator

## [1.3.2] - 2026-09-11

### Changed

- Updated project version to 1.3.2.

## [1.3.1] - 2026-09-10

### Added

- Added "Run and Allow" button for commands in webview for faster approval workflow.
- Added translations for `runCommandAndAllow` across 16 locales.

### Changed

- Updated AI Code Orchestrator icons based on the official AIco reference logo.
- Refactored i18n text keys: shortened `text.aicoSaid` to "AIco <verb>" format across all 17 languages.

### Fixed

- Fixed race condition in auto-approval orchestration tests.
- Fixed auto-approval settings inheritance in orchestrator workers.
- Fixed file operation race conditions with proper protection mechanisms.
- Fixed role assignment issues in orchestrator mode.
- Fixed delegation race condition in `reopenParentFromDelegation`.
- Fixed path normalization in read-file provider argument.
- Fixed workspace isolation preservation for child tasks.
- Replaced incorrect "Ru said" with "AIco said" in Russian localization.
- Fixed critical orchestrator prompt architecture issues.

## [1.3.0] - 2026-09-09

### Changed

- Improved orchestrator to team-lead behavior: the orchestrator now acts as a persistent team lead, maintaining role context across delegated subtasks and restoring the parent role reliably after each delegation.
- Unified role prompts and metadata across all orchestration modes, ensuring consistent system prompt generation and mode-to-role mapping for delegated agents.

### Fixed

- Reliably restores the parent role after delegated tasks complete, preventing role bleed-through between subtask boundaries.

## [1.2.2] - 2026-09-08

### Changed

- Completed the AI Code Orchestrator branding and identifier migration across extension manifests, localizations, documentation, and webview surfaces.
- Rebuilt the webview before VSIX packaging and added a reproducible `install:vsix` workflow.
- Simplified orchestration UI state and task presentation by removing the obsolete panel and noisy task details while retaining useful delegation context.
- Improved delegated task context so child tasks receive the relevant orchestration and parent-task details.

### Fixed

- Corrected reviewer delegation so reviewer tasks use the intended reviewer flow and context.
- Preserved provider error details in chat, including model information and readable overflow handling.
- Added retries with bounded backoff for transient code indexer API failures.

### Validation

- Added and updated focused tests for orchestration planning/delegation, provider errors, task UI, and indexer retries.
- Release validation covers formatting, linting, type checks, tests, and builds; environment-dependent VSIX installation and end-to-end checks may require a local VS Code host.

## [1.2.1] - 2026-09-07

### Fixed

- Removed the duplicate model name from the task card header; the active model remains visible in the selector below the chat.

## [1.2.0] - 2026-09-07

### Added

- Added the orchestration runtime with DAG-based task decomposition, delegation, parallel execution, retries, watchdogs, worker isolation, and configurable budget limits.
- Added reviewer integration with persistent reviewer state and specialized reviewer role support.
- Added transactional integration with rollback, write-scope and conflict detection, secret redaction, and run ownership checks.
- Added orchestration runtime UI with DAG visualization, task hierarchy, retry and payload details, controls, and accessibility improvements.
- Added comprehensive unit, integration, and end-to-end test coverage for orchestration, role assignment, persistence, security, and UI behavior.

### Changed

- Unified role configuration schemas and validation, including role-specific model assignment and prompt contracts.
- Improved planner JSON parsing, persistence migration and event compaction, log aggregation, and orchestration diagnostics.

### Fixed

- Fixed orchestration recovery, timeout cleanup, invalid tool-use handling, and fail-closed profile behavior.
- Fixed snapshot and delegation-related test regressions.

## 1.1.4

### Patch Changes

- Fixed: Could not find ripgrep binary error — ripgrep binary is now copied to dist during build
- Chore: version synchronization across all monorepo manifests

## 1.1.2

### Patch Changes

- Fix role model selection priority
- Fixed OrchestrationSettings to follow Settings View Pattern (buffers changes until Save)
- Removed diagnostic console.log/model-debug messages left after debugging
- Fixed 13 failing tests in delegation and task creation suites
- Fixed critical bug: system now uses role-assigned models instead of profile models in both UI and backend
- Backend: createTask() now applies roleAssignments[role].modelId even without profileName
- UI: ChatTextArea now displays role-assigned model instead of profile model

## 1.1.1

### Minor Changes

- **Features**
- Added reviewer role with specialized prompts for code review workflow
- Updated orchestrator mode prompts for team-lead protocol
- Added float encoding support for OpenAI-compatible embeddings with UI toggle
- Implemented orchestration runtime UI panel with DAG visualization and task cards
- Added context optimization infrastructure (content-digest cache, deduplication, stable prefixes)
- Added provider capabilities interface for feature detection
- **Bug Fixes**
- Fixed float encoding checkbox state persistence after save
- **Tests**
- Added comprehensive orchestration test coverage (14 new tests: UI, integration, performance)
- **Documentation**
- Updated orchestration specification and implementation references

### Patch Changes

- Fixed critical issues in orchestration and delegation flow:
- Fixed bug where roles used active profile models instead of their assigned models.
- Fixed infinite loop when orchestrator creates child tasks.
- Eliminated race condition between UI action confirmation and task delegation.
- Added tests and infrastructure for improved reliability:
- Added 6 delegation flow integration tests in `src/core/webview/__tests__/ClineProvider.delegation.spec.ts`.
- Added 4 orchestration flow E2E tests in `apps/vscode-e2e/src/suite/orchestration-flow.test.ts`.
- Added 5 role model assignment E2E tests in `apps/vscode-e2e/src/suite/role-model-assignment.test.ts`.
- Created full-featured mock AI provider with streaming support in `apps/vscode-e2e/src/suite/mock-provider.ts`.
- Mock provider integrated into E2E harness with automatic setup.
- Updated E2E test documentation in `apps/vscode-e2e/README.md`.
- Update all documentation for the first release:
- Rename terminology from "Modes" to "Roles"
- Add Reviewer role documentation
- Expand orchestration and role model descriptions
- Add Vercel AI Gateway and Unbound provider documentation
- Add context optimization documentation
- Update all 8 localized READMEs
- Update package descriptions and keywords

## [1.1.0] - 2026-09-03

### Features

- Made Orchestrator the default mode for coordinating complex development tasks
- Added full orchestration: task decomposition and delegation, parallel execution, depth/cost/token limits, context and conflict policies, review policies, plan confirmations, and integration hooks
- Added role models: assign dedicated models to roles while inheriting the primary model when no role-specific model is configured
- Added Vercel AI Gateway and Unbound providers
- Added reviewer role with specialized prompts for code review workflow
- Updated orchestrator mode prompts for team-lead protocol
- Added float encoding support for OpenAI-compatible embeddings with UI toggle
- Implemented orchestration runtime UI panel with DAG visualization and task cards
- Added context optimization infrastructure (content-digest cache, deduplication, stable prefixes)
- Added provider capabilities interface for feature detection

### Bug Fixes

- Fixed float encoding checkbox state persistence after save

### Tests

- Added comprehensive orchestration test coverage (14 new tests: UI, integration, performance)

### Documentation

- Updated orchestration specification and implementation references

## [1.0.0]

- Initial release
