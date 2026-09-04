import { fireEvent, render, screen } from "@/utils/test-utils"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ExtensionStateContext } from "@src/context/ExtensionStateContext"
import { vscode } from "@src/utils/vscode"
import ModesView from "../ModesView"

vi.mock("@src/utils/vscode", () => ({ vscode: { postMessage: vi.fn() } }))

Element.prototype.scrollIntoView = vi.fn()

const extensionState = {
	customModePrompts: {},
	listApiConfigMeta: [],
	currentApiConfigName: "",
	apiConfiguration: {},
	roleAssignments: { schemaVersion: 1, roles: {} },
	mode: "code",
	customInstructions: "",
	setCustomInstructions: vi.fn(),
	customModes: [],
}

describe("ModesView role navigation isolation", () => {
	beforeEach(() => vi.clearAllMocks())

	it("selects a role for editing without switching the active task mode", () => {
		render(
			<ExtensionStateContext.Provider value={extensionState as any}>
				<ModesView />
			</ExtensionStateContext.Provider>,
		)

		const trigger = screen.getByTestId("mode-select-trigger")
		fireEvent.click(trigger)
		fireEvent.click(screen.getByTestId("mode-option-architect"))

		expect(trigger).toHaveTextContent("Architect")
		expect(vscode.postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: "mode" }))
	})
})
