import { useEffect } from "react"
import { vscode } from "@src/utils/vscode"
import { useExtensionState } from "@src/context/ExtensionStateContext"
import { DependencyGraph } from "./DependencyGraph"
import { NodeCard } from "./NodeCard"
import { useTranslation } from "react-i18next"

export function OrchestrationPanel({ runId }: { runId: string }) {
	const { t } = useTranslation("orchestration")
	const { orchestrationSnapshot: snapshot, orchestrationEvents } = useExtensionState()
	useEffect(() => {
		vscode.postMessage({ type: "orchestrationSnapshot", orchestrationRunId: runId })
	}, [runId, orchestrationEvents.length])
	const action = (
		type:
			| "orchestrationPause"
			| "orchestrationResume"
			| "orchestrationCancel"
			| "orchestrationApprovePlan"
			| "orchestrationApproveIntegration",
	) => vscode.postMessage({ type, orchestrationRunId: runId })
	if (!snapshot || snapshot.run.runId !== runId)
		return <div className="p-3 text-sm text-vscode-descriptionForeground">{t("loading")}</div>
	return (
		<section className="flex flex-col gap-3 p-3 min-w-0">
			<header className="flex flex-wrap items-center justify-between gap-2">
				<strong>{snapshot.run.goal}</strong>
				<span>{snapshot.run.status}</span>
			</header>
			<div className="flex flex-wrap gap-2">
				<button onClick={() => action("orchestrationPause")}>{t("actions.pause")}</button>
				<button onClick={() => action("orchestrationResume")}>{t("actions.resume")}</button>
				<button onClick={() => action("orchestrationCancel")}>{t("actions.cancel")}</button>
				{snapshot.pendingApproval === "plan" && (
					<button onClick={() => action("orchestrationApprovePlan")}>{t("actions.approvePlan")}</button>
				)}
				{snapshot.pendingApproval === "integration" && (
					<button onClick={() => action("orchestrationApproveIntegration")}>
						{t("actions.approveIntegration")}
					</button>
				)}
			</div>
			<DependencyGraph nodes={snapshot.nodes} title={t("dependencyGraph")} />
			<div className="grid grid-cols-1 md:grid-cols-2 gap-2">
				{snapshot.nodes.map((node) => (
					<NodeCard key={node.nodeId} node={node} runId={runId} />
				))}
			</div>
			{snapshot.findings?.length ? (
				<div className="text-sm">
					{t("findings")}:{" "}
					{snapshot.findings.map((finding) => (
						<div key={finding.id} className="break-words">
							[{finding.severity}] {finding.message}
						</div>
					))}
				</div>
			) : null}
		</section>
	)
}
