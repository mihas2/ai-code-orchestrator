# AI Code Orchestrator API

The AI Code Orchestrator extension exposes an API that can be used by other extensions.
To use this API in your extension:

1. Install `@AI Code Orchestrator/types` with npm, pnpm, or yarn.
2. Import the `AiCodeOrchestratorAPI` type.
3. Load the extension API.

```typescript
import { AiCodeOrchestratorAPI } from "@AI Code Orchestrator/types"

const extension = vscode.extensions.getExtension<AiCodeOrchestratorAPI>("mihas2.ai-code-orchestrator")

if (!extension?.isActive) {
	throw new Error("Extension is not activated")
}

const api = extension.exports

if (!api) {
	throw new Error("API is not available")
}

// Start a new task with an initial message.
await api.startNewTask("Hello, AI Code Orchestrator API! Let's make a new project...")

// Start a new task with an initial message and images.
await api.startNewTask("Use this design language", ["data:image/webp;base64,..."])

// Send a message to the current task.
await api.sendMessage("Can you fix the @problems?")

// Simulate pressing the primary button in the chat interface (e.g. 'Save' or 'Proceed While Running').
await api.pressPrimaryButton()

// Simulate pressing the secondary button in the chat interface (e.g. 'Reject').
await api.pressSecondaryButton()
```

**NOTE:** To ensure that the `mihas2.ai-code-orchestrator` extension is activated before your extension, add it to the `extensionDependencies` in your `package.json`:

```json
"extensionDependencies": ["mihas2.ai-code-orchestrator"]
```

For detailed information on the available methods and their usage, refer to the `AI Code Orchestrator.d.ts` file.
