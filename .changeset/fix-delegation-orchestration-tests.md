---
"ai-code-orchestrator": patch
---

Исправлены критические проблемы в orchestration и delegation flow:

- Исправлена ошибка, из-за которой роли использовали модели активного профиля вместо назначенных им моделей.
- Исправлен бесконечный цикл при создании дочерних задач оркестратором.
- Устранена race condition между подтверждением действий в UI и делегированием задач.

Добавлены тесты и инфраструктура для повышения надежности:

- Добавлены 6 integration-тестов delegation flow в `src/core/webview/__tests__/ClineProvider.delegation.spec.ts`.
- Добавлены 4 E2E-теста orchestration flow в `apps/vscode-e2e/src/suite/orchestration-flow.test.ts`.
- Добавлены 5 E2E-тестов назначения моделей ролям в `apps/vscode-e2e/src/suite/role-model-assignment.test.ts`.
- Создан полнофункциональный mock AI provider со streaming-поддержкой в `apps/vscode-e2e/src/suite/mock-provider.ts`.
- Mock provider интегрирован в E2E harness с автоматической настройкой.
- Обновлена документация E2E-тестов в `apps/vscode-e2e/README.md`.
