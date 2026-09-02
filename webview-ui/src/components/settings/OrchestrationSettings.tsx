import { useEffect, useMemo, useState } from "react"
import {
	DEFAULT_ORCHESTRATION_SETTINGS,
	orchestrationSettingsSchema,
	type OrchestrationSettings,
	getModelId,
} from "@ai-code-orchestrator/types"
import { vscode } from "@src/utils/vscode"
import { useExtensionState } from "@src/context/ExtensionStateContext"
import { useAppTranslation } from "@src/i18n/TranslationContext"
import { SectionHeader } from "./SectionHeader"
import { Section } from "./Section"
import {
	Button,
	Checkbox,
	Input,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@src/components/ui"

export function OrchestrationSettings() {
	const { t } = useAppTranslation()
	const { orchestrationSettings, apiConfiguration, customModes, routerModels } = useExtensionState() as any
	const [value, setValue] = useState<OrchestrationSettings>(orchestrationSettings ?? DEFAULT_ORCHESTRATION_SETTINGS)
	useEffect(() => {
		if (orchestrationSettings) setValue(orchestrationSettings)
	}, [orchestrationSettings])
	const set = (key: keyof OrchestrationSettings, next: unknown) =>
		setValue((current) => ({ ...current, [key]: next }))
	const save = () => {
		const parsed = orchestrationSettingsSchema.safeParse(value)
		if (parsed.success)
			vscode.postMessage({ type: "updateOrchestrationSettings", orchestrationSettings: parsed.data })
	}
	const roleNames = [
		"orchestrator",
		"architect",
		"code",
		"debug",
		"reviewer",
		...(customModes ?? []).map((mode: { slug: string }) => mode.slug),
	]
	const roleModels = apiConfiguration?.profileRoleModelSettings?.roleModels ?? {}
	const primaryModel = getModelId(apiConfiguration ?? {}) ?? ""
	const modelOptions = useMemo(() => {
		const provider = apiConfiguration?.apiProvider
		const discovered = provider && routerModels?.[provider] ? Object.keys(routerModels[provider]) : []
		return Array.from(new Set([primaryModel, ...discovered].filter(Boolean))).sort()
	}, [apiConfiguration?.apiProvider, primaryModel, routerModels])
	const updateRoleModel = (role: string, modelId: string) => {
		vscode.postMessage({
			type: "upsertApiConfiguration",
			text: apiConfiguration?.name ?? "default",
			apiConfiguration: {
				...apiConfiguration,
				profileRoleModelSettings: {
					schemaVersion: 1,
					roleModels: { ...roleModels, [role]: { modelId: modelId || undefined, inheritPrimary: !modelId } },
				},
			},
		})
	}
	return (
		<div className="flex flex-col gap-2">
			<SectionHeader>{t("settings:roles.title")}</SectionHeader>
			<Section className="space-y-4">
				<div className="rounded border border-vscode-textSeparatorForeground p-3">
					<strong>{t("settings:roles.alwaysOn")}</strong>
					<p className="m-0 mt-1 text-sm text-vscode-descriptionForeground">{t("settings:roles.intro")}</p>
				</div>
				<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
					{(
						[
							["maxParallelWorkers", "maxParallelWorkers"],
							["maxDepth", "maxDepth"],
							["maxReworkAttempts", "maxReworkAttempts"],
							["timeoutMs", "timeoutMs"],
							["maxRunTokens", "maxRunTokens"],
							["maxRunCost", "maxRunCost"],
							["maxChildTokens", "maxChildTokens"],
							["maxChildCost", "maxChildCost"],
						] as const
					).map(([key, label]) => (
						<label key={key} className="flex flex-col gap-1">
							<span>{t(`settings:roles.fields.${label}`)}</span>
							<Input
								type="number"
								min={0}
								value={(value[key] as number | undefined) ?? ""}
								onChange={(e) => set(key, e.target.value === "" ? undefined : Number(e.target.value))}
							/>
						</label>
					))}
				</div>
				<div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
					<label>
						{t("settings:roles.fields.contextPolicy")}
						<select
							className="w-full"
							value={value.contextPolicy}
							onChange={(e) =>
								set("contextPolicy", e.target.value as OrchestrationSettings["contextPolicy"])
							}>
							<option>minimal</option>
							<option>balanced</option>
							<option>full</option>
						</select>
					</label>
					<label>
						{t("settings:roles.fields.conflictPolicy")}
						<select
							className="w-full"
							value={value.conflictPolicy}
							onChange={(e) =>
								set("conflictPolicy", e.target.value as OrchestrationSettings["conflictPolicy"])
							}>
							<option>isolated</option>
							<option>patch</option>
							<option>serialized</option>
							<option>stop</option>
						</select>
					</label>
					<label>
						{t("settings:roles.fields.reviewPolicy")}
						<select
							className="w-full"
							value={value.reviewPolicy}
							onChange={(e) =>
								set("reviewPolicy", e.target.value as OrchestrationSettings["reviewPolicy"])
							}>
							<option>off</option>
							<option>completion</option>
							<option>batch</option>
							<option>risk</option>
						</select>
					</label>
				</div>
				<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
					{[
						["requirePlanApproval", "requirePlanApproval"],
						["requireIntegrationApproval", "requireIntegrationApproval"],
						["allowWorkerCommands", "allowWorkerCommands"],
						["allowWorkerMcp", "allowWorkerMcp"],
						["persistTranscripts", "persistTranscripts"],
					].map(([key, label]) => (
						<label key={key} className="flex items-center gap-2">
							<Checkbox
								checked={Boolean(value[key as keyof OrchestrationSettings])}
								onCheckedChange={(checked) => set(key as keyof OrchestrationSettings, checked === true)}
							/>
							{t(`settings:roles.fields.${label}`)}
						</label>
					))}
				</div>
				<div className="space-y-3">
					<strong>{t("settings:roles.modelAssignments")}</strong>
					<p className="text-sm text-vscode-descriptionForeground">
						{t("settings:roles.modelHint", { model: primaryModel || t("settings:roles.notConfigured") })}
					</p>
					{roleNames.map((role) => {
						const selected =
							roleModels[role]?.inheritPrimary === false ? roleModels[role]?.modelId : "inherit"
						return (
							<div key={role} className="grid grid-cols-[minmax(7rem,10rem)_1fr] items-center gap-3">
								<span className="font-medium">{role}</span>
								<Select
									value={selected || "inherit"}
									onValueChange={(value) => updateRoleModel(role, value === "inherit" ? "" : value)}>
									<SelectTrigger className="w-full">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="inherit">{t("settings:roles.inheritPrimary")}</SelectItem>
										{modelOptions.map((model) => (
											<SelectItem key={model} value={model}>
												{model}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						)
					})}
				</div>
				<div className="flex flex-wrap gap-2">
					<Button onClick={save}>{t("settings:roles.save")}</Button>
					<Button variant="secondary" onClick={() => setValue(DEFAULT_ORCHESTRATION_SETTINGS)}>
						{t("settings:common.reset")}
					</Button>
				</div>
				{value.requireIntegrationApproval && (
					<p className="text-sm text-vscode-editorWarning-foreground">
						{t("settings:roles.integrationApproval")}
					</p>
				)}
			</Section>
		</div>
	)
}
