import { fireEvent, render, screen } from "@/utils/test-utils"
import { describe, expect, it, vi } from "vitest"

import { ExtensionStateContextProvider } from "@src/context/ExtensionStateContext"
import { createRoleAssignmentMessage, getRoleModelOptions, RoleModelPicker, default as ModesView } from "../ModesView"

describe("role model options", () => {
	it("includes every provider model and the profile primary model without duplicates", () => {
		expect(
			getRoleModelOptions("primary", "openrouter", {
				openrouter: { primary: {}, alternative: {}, "third-model": {} },
			}),
		).toEqual(["alternative", "primary", "third-model"])
	})

	it("uses models from provider profile metadata when the catalog has not loaded yet", () => {
		const models = getRoleModelOptions("claude-opus-4-8", "anthropic", {}, ["claude-sonnet-4-6"])
		expect(models).toContain("claude-opus-4-8")
		expect(models).toContain("claude-sonnet-4-6")
		expect(models.length).toBeGreaterThan(1)
	})

	it("renders profile models delivered through the real extension message state", async () => {
		render(
			<ExtensionStateContextProvider>
				<ModesView />
			</ExtensionStateContextProvider>,
		)

		window.dispatchEvent(
			new MessageEvent("message", {
				data: {
					type: "state",
					state: {
						apiConfiguration: { apiProvider: "anthropic", apiModelId: "claude-opus-4-8" },
						currentApiConfigName: "Primary",
						mode: "code",
						customModes: [],
						customModePrompts: {},
						customSupportPrompts: {},
						roleAssignments: { schemaVersion: 1, roles: {} },
					},
				},
			}),
		)
		window.dispatchEvent(
			new MessageEvent("message", {
				data: {
					type: "listApiConfig",
					listApiConfig: [
						{ id: "1", name: "Primary", apiProvider: "anthropic", modelId: "claude-opus-4-8" },
						{ id: "2", name: "Fallback", apiProvider: "anthropic", modelId: "claude-sonnet-4-6" },
					],
				},
			}),
		)

		fireEvent.click(await screen.findByTestId("model-picker-button"))
		expect(await screen.findByText("claude-sonnet-4-6")).toBeInTheDocument()
	})

	it("passes multiple models through the searchable picker and selects an alternative", () => {
		const onChange = vi.fn()
		render(
			<RoleModelPicker
				models={["primary", "alternative", "third-model"]}
				value="primary"
				onChange={onChange}
				placeholder="Select"
				searchPlaceholder="Search models"
				noModelsFound="No models"
				customModelLabel={(model) => `Use ${model}`}
			/>,
		)

		fireEvent.click(screen.getByTestId("role-model-select"))
		expect(screen.getByText("alternative")).toBeInTheDocument()
		expect(screen.getByText("third-model")).toBeInTheDocument()
		fireEvent.change(screen.getByPlaceholderText("Search models"), { target: { value: "alternative" } })
		expect(screen.getByText("alternative")).toBeInTheDocument()
		expect(screen.queryByText("third-model")).not.toBeInTheDocument()
		fireEvent.click(screen.getByText("alternative"))

		expect(onChange).toHaveBeenCalledWith("alternative")
		expect(createRoleAssignmentMessage("code", "OpenRouter", "alternative")).toEqual({
			type: "updateRoleAssignment",
			role: "code",
			roleAssignment: {
				profileName: "OpenRouter",
				modelId: "alternative",
				inheritPrimary: false,
			},
		})
	})
})
