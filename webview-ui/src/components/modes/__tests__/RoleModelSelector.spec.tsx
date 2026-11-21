import { fireEvent, render, screen, waitFor } from "@/utils/test-utils"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { ProviderSettings } from "@ai-code-orchestrator/types"
import { RoleModelSelector } from "../RoleModelSelector"

const { postMessage, routerCatalog } = vi.hoisted(() => ({
	postMessage: vi.fn(),
	routerCatalog: {} as Record<string, Record<string, object>>,
}))

vi.mock("@src/utils/vscode", () => ({ vscode: { postMessage } }))
vi.mock("@src/components/ui/hooks/useRouterModels", () => ({
	useRouterModels: () => ({ data: routerCatalog }),
}))

const renderSelector = (provider: "openai" | "openrouter", configuration: ProviderSettings) => {
	const onModelChange = vi.fn()
	render(
		<RoleModelSelector
			provider={provider}
			apiConfiguration={configuration}
			primaryModel="primary-model"
			profileName="Primary"
			onModelChange={onModelChange}
		/>,
	)
	return onModelChange
}

describe("RoleModelSelector", () => {
	beforeEach(() => {
		postMessage.mockClear()
		for (const provider of Object.keys(routerCatalog)) delete routerCatalog[provider]
	})

	it("requests and renders OpenAI Compatible models delivered by the extension message flow", async () => {
		const onModelChange = renderSelector("openai", {
			apiProvider: "openai",
			openAiBaseUrl: "https://compatible.example/v1",
			openAiApiKey: "secret",
			openAiModelId: "primary-model",
		})

		// The extension resolves the endpoint and key of the role's own profile.
		expect(postMessage).toHaveBeenCalledWith({
			type: "requestOpenAiModels",
			values: { profileName: "Primary" },
		})

		window.dispatchEvent(
			new MessageEvent("message", {
				data: {
					type: "openAiModels",
					openAiModels: ["ag/gemini-2.5-flash"],
					values: { profileName: "Primary" },
				},
			}),
		)
		fireEvent.click(screen.getByTestId("model-picker-button"))
		expect(await screen.findByText("ag/gemini-2.5-flash")).toBeInTheDocument()
		expect(screen.queryByText("apiConfiguration.model")).not.toBeInTheDocument()

		fireEvent.click(screen.getByText("ag/gemini-2.5-flash"))
		expect(onModelChange).toHaveBeenCalledWith("Primary", "ag/gemini-2.5-flash")
	})

	it("renders router models and clears the override when the primary model is selected", async () => {
		routerCatalog.openrouter = { "primary-model": {}, "router-alternative": {} }
		const onModelChange = renderSelector("openrouter", {
			apiProvider: "openrouter",
			openRouterModelId: "router-alternative",
		})

		await waitFor(() => expect(screen.getByTestId("model-picker-button")).toBeInTheDocument())
		fireEvent.click(screen.getByTestId("model-picker-button"))
		expect(screen.getByText("router-alternative")).toBeInTheDocument()
		fireEvent.click(screen.getByText("primary-model"))
		expect(onModelChange).toHaveBeenCalledWith("Primary", undefined)
	})

	it("ignores catalogs that were fetched for a different profile", async () => {
		renderSelector("openai", { apiProvider: "openai", openAiModelId: "primary-model" })

		window.dispatchEvent(
			new MessageEvent("message", {
				data: { type: "openAiModels", openAiModels: ["foreign-model"], values: { profileName: "Other" } },
			}),
		)
		window.dispatchEvent(
			new MessageEvent("message", { data: { type: "openAiModels", openAiModels: ["active-profile-model"] } }),
		)
		fireEvent.click(screen.getByTestId("model-picker-button"))
		expect(screen.queryByText("foreign-model")).not.toBeInTheDocument()
		expect(screen.queryByText("active-profile-model")).not.toBeInTheDocument()
	})

	it("requests local provider catalogs for the role's profile", () => {
		render(
			<RoleModelSelector
				provider="ollama"
				apiConfiguration={{ apiProvider: "ollama" }}
				primaryModel="llama3"
				profileName="local"
				onModelChange={vi.fn()}
			/>,
		)
		expect(postMessage).toHaveBeenCalledWith({ type: "requestOllamaModels", values: { profileName: "local" } })
	})
})
