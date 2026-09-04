import { fireEvent, render, screen } from "@/utils/test-utils"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ExtensionStateContext } from "@src/context/ExtensionStateContext"
import { vscode } from "@src/utils/vscode"
import ModesView from "../ModesView"

vi.mock("@src/utils/vscode", () => ({ vscode: { postMessage: vi.fn() } }))

const state = {
	customModePrompts: {},
	listApiConfigMeta: [{ id: "primary", name: "Primary", apiProvider: "openrouter", modelId: "primary" }],
	currentApiConfigName: "Primary",
	apiConfiguration: { apiProvider: "openrouter", openRouterModelId: "primary" },
	roleAssignments: { schemaVersion: 1, roles: {} },
	mode: "code",
	customInstructions: "",
	setCustomInstructions: vi.fn(),
	customModes: [],
}

describe("ModesView role model cached state", () => {
	beforeEach(() => vi.clearAllMocks())

	it("updates SettingsView's cached role assignments without posting or rendering a second Save", async () => {
		const setCachedStateField = vi.fn()
		render(
			<ExtensionStateContext.Provider value={state as any}>
				<ModesView setCachedStateField={setCachedStateField as any} />
			</ExtensionStateContext.Provider>,
		)
		fireEvent.click(await screen.findByTestId("model-picker-button"))
		fireEvent.click(await screen.findByText("primary"))

		expect(setCachedStateField).toHaveBeenCalledWith("roleAssignments", {
			schemaVersion: 1,
			roles: { code: { profileName: "Primary", modelId: undefined, inheritPrimary: true } },
		})
		expect(vscode.postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: "updateRoleAssignment" }))
		expect(screen.queryByTestId("save-role-assignment")).not.toBeInTheDocument()
	})
})
