# AI Code Orchestrator

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
