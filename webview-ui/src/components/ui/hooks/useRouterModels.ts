import { useQuery } from "@tanstack/react-query"

import { type RouterModels, type ExtensionMessage } from "@ai-code-orchestrator/types"

import { vscode } from "@src/utils/vscode"

type UseRouterModelsOptions = {
	provider?: string // single provider filter (e.g. "openrouter")
	enabled?: boolean // gate fetching entirely
	profileName?: string // load the catalog with this provider profile's credentials instead of the active one
}

const getRouterModels = async (provider?: string, profileName?: string) =>
	new Promise<RouterModels>((resolve, reject) => {
		const cleanup = () => {
			if (typeof window !== "undefined") {
				window.removeEventListener("message", handler)
			}
		}

		const timeout = setTimeout(() => {
			cleanup()
			reject(new Error("Router models request timed out"))
		}, 10000)

		const handler = (event: MessageEvent) => {
			const message: ExtensionMessage = event.data

			if (message.type === "routerModels") {
				const msgProvider = message?.values?.provider as string | undefined
				const msgProfileName = message?.values?.profileName as string | undefined

				// Verify response matches request
				if (provider !== msgProvider || profileName !== msgProfileName) {
					// Not our response; ignore and wait for the matching one
					return
				}

				clearTimeout(timeout)
				cleanup()

				if (message.routerModels) {
					resolve(message.routerModels)
				} else {
					reject(new Error("No router models in response"))
				}
			}
		}

		window.addEventListener("message", handler)
		if (provider || profileName) {
			vscode.postMessage({
				type: "requestRouterModels",
				values: profileName ? { provider, profileName } : { provider },
			})
		} else {
			vscode.postMessage({ type: "requestRouterModels" })
		}
	})

export const useRouterModels = (opts: UseRouterModelsOptions = {}) => {
	const provider = opts.provider || undefined
	const profileName = opts.profileName || undefined
	return useQuery({
		queryKey: profileName
			? ["routerModels", provider || "all", "profile", profileName]
			: ["routerModels", provider || "all"],
		queryFn: () => getRouterModels(provider, profileName),
		enabled: opts.enabled !== false,
	})
}
