import { render, screen } from "@/utils/test-utils"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ExtensionStateContext } from "@src/context/ExtensionStateContext"
import { defaultModeSlug } from "@aico/modes"
import ModesView, { resetLastEditedRoleForTests } from "../ModesView"

const { postMessage, useRouterModels } = vi.hoisted(() => ({
	postMessage: vi.fn(),
	useRouterModels: vi.fn(() => ({ data: {} })),
}))

vi.mock("@src/utils/vscode", () => ({ vscode: { postMessage } }))
vi.mock("@src/components/ui/hooks/useRouterModels", () => ({ useRouterModels }))

Element.prototype.scrollIntoView = vi.fn()

const baseState = {
	customModePrompts: {},
	listApiConfigMeta: [
		{ id: "1", name: "default", apiProvider: "openrouter", modelId: "router/model" },
		{ id: "2", name: "local", apiProvider: "ollama", modelId: "llama3" },
	],
	// The Providers page has "default" selected.
	currentApiConfigName: "default",
	apiConfiguration: { apiProvider: "openrouter", openRouterModelId: "router/model" },
	mode: "code",
	customInstructions: "",
	setCustomInstructions: vi.fn(),
	customModes: [],
}

const renderWithRoles = (roles: Record<string, unknown>) =>
	render(
		<ExtensionStateContext.Provider value={baseState as any}>
			<ModesView roleAssignments={{ schemaVersion: 1, roles } as any} setCachedStateField={vi.fn() as any} />
		</ExtensionStateContext.Provider>,
	)

describe("ModesView role profile model catalog", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		resetLastEditedRoleForTests()
	})

	it("loads models from the profile assigned to the role, not the active Providers profile", () => {
		renderWithRoles({ [defaultModeSlug]: { profileName: "local", inheritPrimary: true } })

		expect(postMessage).toHaveBeenCalledWith({ type: "requestOllamaModels", values: { profileName: "local" } })
		expect(useRouterModels).not.toHaveBeenCalledWith(expect.objectContaining({ provider: "openrouter" }))
		expect(screen.getByTestId("effective-role-model")).toHaveTextContent("local (ollama) / llama3")
	})

	it("falls back to the active profile only for a role without an assignment", () => {
		renderWithRoles({})

		expect(useRouterModels).toHaveBeenCalledWith(
			expect.objectContaining({ provider: "openrouter", profileName: "default", enabled: true }),
		)
		expect(screen.getByTestId("effective-role-model")).toHaveTextContent("default (openrouter) / router/model")
	})
})
