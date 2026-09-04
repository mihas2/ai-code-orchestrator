# AI Code Orchestrator

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

- Исправлены критические проблемы в orchestration и delegation flow:
- Исправлена ошибка, из-за которой роли использовали модели активного профиля вместо назначенных им моделей.
- Исправлен бесконечный цикл при создании дочерних задач оркестратором.
- Устранена race condition между подтверждением действий в UI и делегированием задач.
- Добавлены тесты и инфраструктура для повышения надежности:
- Добавлены 6 integration-тестов delegation flow в `src/core/webview/__tests__/ClineProvider.delegation.spec.ts`.
- Добавлены 4 E2E-теста orchestration flow в `apps/vscode-e2e/src/suite/orchestration-flow.test.ts`.
- Добавлены 5 E2E-тестов назначения моделей ролям в `apps/vscode-e2e/src/suite/role-model-assignment.test.ts`.
- Создан полнофункциональный mock AI provider со streaming-поддержкой в `apps/vscode-e2e/src/suite/mock-provider.ts`.
- Mock provider интегрирован в E2E harness с автоматической настройкой.
- Обновлена документация E2E-тестов в `apps/vscode-e2e/README.md`.
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
