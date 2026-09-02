import { useEffect, useState } from "react"
import {
	DEFAULT_ORCHESTRATION_SETTINGS,
	orchestrationSettingsSchema,
	type OrchestrationSettings,
} from "@ai-code-orchestrator/types"
import { vscode } from "@src/utils/vscode"
import { useExtensionState } from "@src/context/ExtensionStateContext"
import { SectionHeader } from "./SectionHeader"
import { Section } from "./Section"
import { Button, Checkbox, Input } from "@src/components/ui"

export function OrchestrationSettings() {
	const { orchestrationSettings, apiConfiguration, customModes } = useExtensionState() as any
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
	return (
		<div className="flex flex-col gap-2">
			<SectionHeader>Orchestration</SectionHeader>
			<Section className="space-y-4">
				<label className="flex items-center gap-2">
					<Checkbox checked={value.enabled} onCheckedChange={(checked) => set("enabled", checked === true)} />{" "}
					Enable orchestration
				</label>
				<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
					{(
						[
							["maxParallelWorkers", "Max parallel workers"],
							["maxDepth", "Max depth"],
							["maxReworkAttempts", "Max rework attempts"],
							["timeoutMs", "Timeout (ms)"],
							["maxRunTokens", "Max run tokens"],
							["maxRunCost", "Max run cost"],
							["maxChildTokens", "Max child tokens"],
							["maxChildCost", "Max child cost"],
						] as const
					).map(([key, label]) => (
						<label key={key} className="flex flex-col gap-1">
							<span>{label}</span>
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
						Context
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
						Conflict
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
						Review
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
						["requirePlanApproval", "Require plan approval"],
						["requireIntegrationApproval", "Require integration approval"],
						["allowWorkerCommands", "Allow worker commands"],
						["allowWorkerMcp", "Allow worker MCP"],
						["persistTranscripts", "Persist transcripts"],
					].map(([key, label]) => (
						<label key={key} className="flex items-center gap-2">
							<Checkbox
								checked={Boolean(value[key as keyof OrchestrationSettings])}
								onCheckedChange={(checked) => set(key as keyof OrchestrationSettings, checked === true)}
							/>
							{label}
						</label>
					))}
				</div>
				<div className="space-y-2">
					<strong>Role models in the active profile</strong>
					<p className="text-sm text-vscode-descriptionForeground">
						Each role uses the active profile and inherits its primary model until you select a model.
					</p>
					{roleNames.map((role) => (
						<label key={role} className="flex items-center gap-2">
							<span className="w-28">{role}</span>
							<Input
								value={roleModels[role]?.modelId ?? ""}
								placeholder="inherit primary"
								onChange={(e) =>
									vscode.postMessage({
										type: "upsertApiConfiguration",
										text: apiConfiguration?.name ?? "default",
										apiConfiguration: {
											...apiConfiguration,
											profileRoleModelSettings: {
												schemaVersion: 1,
												roleModels: {
													...roleModels,
													[role]: {
														modelId: e.target.value || undefined,
														inheritPrimary: !e.target.value,
													},
												},
											},
										},
									})
								}
							/>
						</label>
					))}
				</div>
				<div className="flex flex-wrap gap-2">
					<Button onClick={save}>Save orchestration settings</Button>
					<Button variant="secondary" onClick={() => setValue(DEFAULT_ORCHESTRATION_SETTINGS)}>
						Reset
					</Button>
				</div>
				{value.enabled && value.requireIntegrationApproval && (
					<p className="text-sm text-vscode-editorWarning-foreground">
						Integration requires explicit approval. Unsupported backend operations remain blocked.
					</p>
				)}
			</Section>
		</div>
	)
}
