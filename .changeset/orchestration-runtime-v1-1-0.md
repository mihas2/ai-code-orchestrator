---
"ai-code-orchestrator": minor
---

**Features**

- Added reviewer role with specialized prompts for code review workflow
- Updated orchestrator mode prompts for team-lead protocol
- Added float encoding support for OpenAI-compatible embeddings with UI toggle
- Implemented orchestration runtime UI panel with DAG visualization and task cards
- Added context optimization infrastructure (content-digest cache, deduplication, stable prefixes)
- Added provider capabilities interface for feature detection

**Bug Fixes**

- Fixed float encoding checkbox state persistence after save

**Tests**

- Added comprehensive orchestration test coverage (14 new tests: UI, integration, performance)

**Documentation**

- Updated orchestration specification and implementation references
