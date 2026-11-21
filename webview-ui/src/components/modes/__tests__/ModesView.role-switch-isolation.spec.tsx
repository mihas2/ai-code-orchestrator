import { fireEvent, render, screen } from "@/utils/test-utils"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ExtensionStateContext } from "@src/context/ExtensionStateContext"
import { vscode } from "@src/utils/vscode"
import { defaultModeSlug, getAllModes } from "@aico/modes"
import ModesView, { resetLastEditedRoleForTests } from "../ModesView"

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
	beforeEach(() => {
		vi.clearAllMocks()
		resetLastEditedRoleForTests()
	})

	const renderView = (state: Record<string, unknown> = {}) =>
		render(
			<ExtensionStateContext.Provider value={{ ...extensionState, ...state } as any}>
				<ModesView />
			</ExtensionStateContext.Provider>,
		)

	it("does not preselect the chat's active mode", () => {
		const defaultMode = getAllModes([]).find((m) => m.slug === defaultModeSlug)!
		renderView({ mode: "debug" })
		expect(screen.getByTestId("mode-select-trigger")).toHaveTextContent(defaultMode.name)
	})

	it("keeps the edited role across remounts and ignores chat mode changes", () => {
		const first = renderView({ mode: "code" })
		fireEvent.click(screen.getByTestId("mode-select-trigger"))
		fireEvent.click(screen.getByTestId("mode-option-architect"))
		first.unmount()

		// The chat switched to another mode while the Roles tab was closed.
		const second = renderView({ mode: "debug" })
		expect(screen.getByTestId("mode-select-trigger")).toHaveTextContent("Architect")

		// A live chat mode change must not move the settings selection either.
		second.rerender(
			<ExtensionStateContext.Provider value={{ ...extensionState, mode: "ask" } as any}>
				<ModesView />
			</ExtensionStateContext.Provider>,
		)
		expect(screen.getByTestId("mode-select-trigger")).toHaveTextContent("Architect")
	})

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
