import { useEffect } from "react"
import { vscode } from "@src/utils/vscode"
import { useExtensionState } from "@src/context/ExtensionStateContext"

export function OrchestrationPanel({ runId }: { runId: string }) {
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
		return <div className="p-3 text-sm text-vscode-descriptionForeground">Loading orchestration run...</div>
	return (
		<section className="flex flex-col gap-3 p-3 min-w-0">
			<header className="flex flex-wrap items-center justify-between gap-2">
				<strong>{snapshot.run.goal}</strong>
				<span>{snapshot.run.status}</span>
			</header>
			<div className="flex flex-wrap gap-2">
				<button onClick={() => action("orchestrationPause")}>Pause</button>
				<button onClick={() => action("orchestrationResume")}>Resume</button>
				<button onClick={() => action("orchestrationCancel")}>Cancel</button>
				{snapshot.pendingApproval === "plan" && (
					<button onClick={() => action("orchestrationApprovePlan")}>Approve plan</button>
				)}
				{snapshot.pendingApproval === "integration" && (
					<button onClick={() => action("orchestrationApproveIntegration")}>Approve integration</button>
				)}
			</div>
			<div className="grid grid-cols-1 md:grid-cols-2 gap-2">
				{snapshot.nodes.map((node) => (
					<article key={node.nodeId} className="border border-vscode-panel-border rounded p-2 min-w-0">
						<div className="flex justify-between gap-2">
							<span className="truncate">{node.title}</span>
							<span>{node.status}</span>
						</div>
						<div className="text-xs text-vscode-descriptionForeground">
							Depends on: {node.dependsOn.join(", ") || "none"}
						</div>
						{node.outputContract?.summary && (
							<p className="text-sm break-words">{node.outputContract.summary}</p>
						)}
					</article>
				))}
			</div>
			{snapshot.findings?.length ? (
				<div className="text-sm">
					Review findings:{" "}
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
