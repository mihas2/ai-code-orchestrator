import { fireEvent, render, screen, waitFor } from "@/utils/test-utils"
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

	it("buffers model changes until Save", async () => {
		render(
			<ExtensionStateContext.Provider value={state as any}>
				<ModesView />
			</ExtensionStateContext.Provider>,
		)
		fireEvent.click(await screen.findByTestId("model-picker-button"))
		fireEvent.click(await screen.findByText("primary"))
		expect(vscode.postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: "updateRoleAssignment" }))
		fireEvent.click(screen.getByTestId("save-role-assignment"))
		await waitFor(() =>
			expect(vscode.postMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					type: "updateRoleAssignment",
					role: "code",
				}),
			),
		)
	})
})
