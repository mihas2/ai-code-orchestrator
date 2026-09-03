import { useCallback, useEffect, useMemo, useState } from "react"
import { useEvent } from "react-use"

import {
	type ExtensionMessage,
	type ModelInfo,
	type ModelRecord,
	type ProviderName,
	type ProviderSettings,
	openAiModelInfoSaneDefaults,
} from "@ai-code-orchestrator/types"

import { ModelPicker } from "@src/components/settings/ModelPicker"
import {
	getProviderServiceConfig,
	getStaticModelsForProvider,
} from "@src/components/settings/utils/providerModelConfig"
import { useRouterModels } from "@src/components/ui/hooks/useRouterModels"
import { useAppTranslation } from "@src/i18n/TranslationContext"
import { vscode } from "@src/utils/vscode"

type ModelIdKey =
	| "openRouterModelId"
	| "requestyModelId"
	| "unboundModelId"
	| "openAiModelId"
	| "litellmModelId"
	| "vercelAiGatewayModelId"
	| "apiModelId"
	| "ollamaModelId"
	| "lmStudioModelId"
	| "vsCodeLmModelSelector"

const getModelIdKey = (provider: ProviderName): ModelIdKey => {
	switch (provider) {
		case "openrouter":
			return "openRouterModelId"
		case "requesty":
			return "requestyModelId"
		case "unbound":
			return "unboundModelId"
		case "openai":
			return "openAiModelId"
		case "litellm":
			return "litellmModelId"
		case "vercel-ai-gateway":
			return "vercelAiGatewayModelId"
		case "ollama":
			return "ollamaModelId"
		case "lmstudio":
			return "lmStudioModelId"
		case "vscode-lm":
			return "vsCodeLmModelSelector"
		default:
			return "apiModelId"
	}
}

export interface RoleModelSelectorProps {
	provider?: ProviderName
	apiConfiguration: ProviderSettings
	primaryModel: string
	selectedModelId?: string
	profileName?: string
	onModelChange: (profileName: string | undefined, modelId: string | undefined) => void
}

export const RoleModelSelector = ({
	provider,
	apiConfiguration,
	primaryModel,
	selectedModelId: roleModelId,
	profileName,
	onModelChange,
}: RoleModelSelectorProps) => {
	const { t } = useAppTranslation()
	const [fetchedModels, setFetchedModels] = useState<ModelRecord>({})
	const routerProviders = [
		"openrouter",
		"vercel-ai-gateway",
		"litellm",
		"requesty",
		"unbound",
		"poe",
		"ollama",
		"lmstudio",
	]
	const usesRouterModels = !!provider && routerProviders.includes(provider)
	const { data: routerModels } = useRouterModels({ provider, enabled: usesRouterModels })

	const onMessage = useCallback(
		(event: MessageEvent) => {
			const message: ExtensionMessage = event.data
			switch (message.type) {
				case "openAiModels":
					if (provider === "openai") {
						setFetchedModels(
							Object.fromEntries(
								(message.openAiModels ?? []).map((modelId) => [modelId, openAiModelInfoSaneDefaults]),
							),
						)
					}
					break
				case "ollamaModels":
					if (provider === "ollama") setFetchedModels(message.ollamaModels ?? {})
					break
				case "lmStudioModels":
					if (provider === "lmstudio") setFetchedModels(message.lmStudioModels ?? {})
					break
				case "vsCodeLmModels":
					if (provider === "vscode-lm") {
						setFetchedModels(
							Object.fromEntries(
								(message.vsCodeLmModels ?? []).map((model) => [
									`${model.vendor}/${model.family}`,
									{
										maxTokens: 0,
										contextWindow: 0,
										supportsPromptCache: false,
										description: `${model.vendor} - ${model.family}`,
									} satisfies ModelInfo,
								]),
							),
						)
					}
					break
			}
		},
		[provider],
	)
	useEvent("message", onMessage)

	useEffect(() => {
		setFetchedModels({})
		if (provider === "openai") {
			vscode.postMessage({
				type: "requestOpenAiModels",
				values: {
					baseUrl: apiConfiguration.openAiBaseUrl,
					apiKey: apiConfiguration.openAiApiKey,
					customHeaders: {},
					openAiHeaders: apiConfiguration.openAiHeaders ?? {},
				},
			})
		} else if (provider === "ollama") {
			vscode.postMessage({ type: "requestOllamaModels" })
		} else if (provider === "lmstudio") {
			vscode.postMessage({ type: "requestLmStudioModels" })
		} else if (provider === "vscode-lm") {
			vscode.postMessage({ type: "requestVsCodeLmModels" })
		}
	}, [
		provider,
		apiConfiguration.openAiBaseUrl,
		apiConfiguration.openAiApiKey,
		apiConfiguration.openAiHeaders,
		apiConfiguration.ollamaBaseUrl,
		apiConfiguration.lmStudioBaseUrl,
	])

	const models = useMemo(() => {
		const staticModels = provider ? getStaticModelsForProvider(provider) : {}
		const dynamicModels = provider
			? ((routerModels as Record<string, Record<string, ModelInfo>> | undefined)?.[provider] ?? {})
			: {}
		const primary = primaryModel ? { [primaryModel]: {} as ModelInfo } : {}
		return { ...staticModels, ...dynamicModels, ...fetchedModels, ...primary }
	}, [fetchedModels, primaryModel, provider, routerModels])

	if (!provider) return null

	const modelIdKey = getModelIdKey(provider)
	const selectedModel = roleModelId ?? (apiConfiguration[modelIdKey] as string | undefined) ?? primaryModel
	const pickerConfiguration: ProviderSettings = {
		...apiConfiguration,
		apiProvider: provider,
		[modelIdKey]: selectedModel,
	}
	const service = getProviderServiceConfig(provider)
	const isVsCodeLm = provider === "vscode-lm"

	return (
		<ModelPicker
			models={models}
			apiConfiguration={pickerConfiguration}
			setApiConfigurationField={(_field, value) => {
				const modelId = isVsCodeLm
					? `${(value as { vendor?: string }).vendor}/${(value as { family?: string }).family}`
					: (value as string)
				onModelChange(profileName, modelId === primaryModel ? undefined : modelId)
			}}
			defaultModelId={primaryModel}
			modelIdKey={modelIdKey}
			serviceName={service.serviceName}
			serviceUrl={service.serviceUrl}
			label={t("settings:modelPicker.label")}
			simplifySettings
			valueTransform={
				isVsCodeLm
					? (modelId) => {
							const [vendor, family] = modelId.split("/")
							return { vendor, family }
						}
					: undefined
			}
			displayTransform={
				isVsCodeLm
					? (value) => {
							const selector = value as { vendor?: string; family?: string }
							return selector.vendor && selector.family ? `${selector.vendor}/${selector.family}` : ""
						}
					: undefined
			}
		/>
	)
}
