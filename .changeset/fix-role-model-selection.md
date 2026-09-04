---
"ai-code-orchestrator": patch
---

Fix role model selection priority

- Fixed OrchestrationSettings to follow Settings View Pattern (buffers changes until Save)
- Removed diagnostic console.log/model-debug messages left after debugging
- Fixed 13 failing tests in delegation and task creation suites
- Fixed critical bug: system now uses role-assigned models instead of profile models in both UI and backend
- Backend: createTask() now applies roleAssignments[role].modelId even without profileName
- UI: ChatTextArea now displays role-assigned model instead of profile model
