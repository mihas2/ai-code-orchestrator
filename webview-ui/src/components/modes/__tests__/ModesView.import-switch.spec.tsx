// npx vitest src/components/modes/__tests__/ModesView.import-switch.spec.tsx

import { render, screen, waitFor } from "@/utils/test-utils"
import ModesView, { resetLastEditedRoleForTests } from "../ModesView"
import { ExtensionStateContext } from "@src/context/ExtensionStateContext"
import { vscode } from "@src/utils/vscode"
import { defaultModeSlug, getAllModes } from "@aico/modes"

// Mock vscode API
vitest.mock("@src/utils/vscode", () => ({
	vscode: {
		postMessage: vitest.fn(),
	},
}))

const mockExtensionState = {
	customModePrompts: {},
	listApiConfigMeta: [
		{ id: "config1", name: "Config 1" },
		{ id: "config2", name: "Config 2" },
	],
	enhancementApiConfigId: "",
	setEnhancementApiConfigId: vitest.fn(),
	mode: "code",
	customModes: [],
	customSupportPrompts: [],
	currentApiConfigName: "",
	customInstructions: "",
	setCustomInstructions: vitest.fn(),
}

const renderModesView = (props = {}) => {
	return render(
		<ExtensionStateContext.Provider value={{ ...mockExtensionState, ...props } as any}>
			<ModesView />
		</ExtensionStateContext.Provider>,
	)
}

Element.prototype.scrollIntoView = vitest.fn()

describe("ModesView Import Auto-Switch", () => {
	beforeEach(() => {
		vitest.clearAllMocks()
		resetLastEditedRoleForTests()
	})

	it("selects the imported role for editing without switching the chat mode", async () => {
		const importedModeSlug = "custom-test-mode"
		const customModes = [
			{
				slug: importedModeSlug,
				name: "Custom Test Mode",
				roleDefinition: "Test role",
				groups: [],
			},
		]

		renderModesView({ customModes })

		// Simulate successful import message with the mode already in state
		const importMessage = {
			data: {
				type: "importModeResult",
				success: true,
				slug: importedModeSlug,
			},
		}

		window.dispatchEvent(new MessageEvent("message", importMessage))

		await waitFor(() => {
			expect(screen.getByTestId("mode-select-trigger")).toHaveTextContent("Custom Test Mode")
		})
		expect(vscode.postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: "mode" }))
	})

	it("falls back to the default role for editing when the imported slug is not in state yet", async () => {
		const importedModeSlug = "custom-new-mode"

		// Render without the imported mode in customModes (simulating race condition)
		renderModesView({ customModes: [] })

		// Simulate successful import message but mode not yet in state
		const importMessage = {
			data: {
				type: "importModeResult",
				success: true,
				slug: importedModeSlug,
			},
		}

		window.dispatchEvent(new MessageEvent("message", importMessage))

		await new Promise((resolve) => setTimeout(resolve, 50))
		const defaultMode = getAllModes([]).find((m) => m.slug === defaultModeSlug)!
		expect(screen.getByTestId("mode-select-trigger")).toHaveTextContent(defaultMode.name)
		expect(vscode.postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: "mode" }))
	})

	it("should not switch modes on import failure", async () => {
		renderModesView()

		// Simulate failed import message
		const importMessage = {
			data: {
				type: "importModeResult",
				success: false,
				error: "Import failed",
			},
		}

		window.dispatchEvent(new MessageEvent("message", importMessage))

		// Wait a bit to ensure no mode switch happens
		await new Promise((resolve) => setTimeout(resolve, 100))

		// Verify no mode switch message was sent
		expect(vscode.postMessage).not.toHaveBeenCalledWith(
			expect.objectContaining({
				type: "mode",
			}),
		)
	})

	it("should not switch modes on cancelled import", async () => {
		renderModesView()

		// Simulate cancelled import message
		const importMessage = {
			data: {
				type: "importModeResult",
				success: false,
				error: "cancelled",
			},
		}

		window.dispatchEvent(new MessageEvent("message", importMessage))

		// Wait a bit to ensure no mode switch happens
		await new Promise((resolve) => setTimeout(resolve, 100))

		// Verify no mode switch message was sent
		expect(vscode.postMessage).not.toHaveBeenCalledWith(
			expect.objectContaining({
				type: "mode",
			}),
		)
	})
})
