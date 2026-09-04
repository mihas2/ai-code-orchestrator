import { DEFAULT_ORCHESTRATION_SETTINGS, type OrchestrationSettings } from "@ai-code-orchestrator/types"
import { useAppTranslation } from "@src/i18n/TranslationContext"
import { SectionHeader } from "./SectionHeader"
import { Section } from "./Section"
import { Checkbox, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@src/components/ui"

export function OrchestrationSettings({
	value = DEFAULT_ORCHESTRATION_SETTINGS,
	onChange,
}: {
	value?: OrchestrationSettings
	onChange?: (value: OrchestrationSettings) => void
}) {
	const { t } = useAppTranslation()
	const set = (key: keyof OrchestrationSettings, next: unknown) => onChange?.({ ...value, [key]: next })
	return (
		<div className="flex flex-col gap-2">
			<SectionHeader>{t("settings:roles.title")}</SectionHeader>
			<Section className="space-y-4">
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
					{(
						[
							["contextPolicy", ["minimal", "balanced", "full"]],
							["conflictPolicy", ["isolated", "patch", "serialized", "stop"]],
							["reviewPolicy", ["off", "completion", "batch", "risk"]],
						] as const
					).map(([key, options]) => (
						<label key={key} className="flex flex-col gap-1">
							<span>{t(`settings:roles.fields.${key}`)}</span>
							<Select value={value[key]} onValueChange={(next) => set(key, next)}>
								<SelectTrigger className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{options.map((option) => (
										<SelectItem key={option} value={option}>
											{option}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</label>
					))}
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
			</Section>
		</div>
	)
}
