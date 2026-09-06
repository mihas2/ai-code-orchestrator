import React, { useMemo } from "react"
import { useExtensionState } from "@src/context/ExtensionStateContext"
import { vscode } from "@src/utils/vscode"
import { Button } from "@src/components/ui/button"

interface TaskNode {
	nodeId: string
	title?: string
	status?: string
	dependsOn?: string[]
}

const statusLabel = (status: string) => (status === "integrated" ? "completed" : status)

const OrchestrationPanel = () => {
	const { orchestrationSnapshot } = useExtensionState()

	const nodes = useMemo(() => orchestrationSnapshot?.nodes as TaskNode[] | undefined, [orchestrationSnapshot])
	if (!orchestrationSnapshot) return null

	const children = new Set(nodes?.flatMap((node) => node.dependsOn ?? []) ?? [])
	const orderedNodes = [...(nodes ?? [])].sort((a, b) => {
		const aChild = children.has(a.nodeId) ? 1 : 0
		const bChild = children.has(b.nodeId) ? 1 : 0
		return aChild - bChild
	})

	return (
		<section
			className="mx-3 my-2 rounded border border-vscode-panel-border bg-vscode-editor-background p-3"
			aria-label="Orchestration">
			<header className="mb-2 flex items-center justify-between gap-2">
				<div>
					<h2 className="text-base font-semibold">Orchestration</h2>
					<p className="text-xs opacity-70">
						Run {orchestrationSnapshot.run.runId} · {orchestrationSnapshot.run.status}
					</p>
				</div>
				<Button
					variant="destructive"
					size="sm"
					aria-label="Cancel orchestration"
					onClick={() =>
						vscode.postMessage({
							type: "orchestrationCancel",
							orchestrationRunId: orchestrationSnapshot.run.runId,
						})
					}>
					Cancel run
				</Button>
			</header>
			{orderedNodes.length === 0 ? (
				<p className="text-sm opacity-70">No tasks</p>
			) : (
				<ul className="m-0 flex list-none flex-col gap-1 p-0">
					{orderedNodes.map((node) => {
						const status = statusLabel(node.status ?? "pending")
						const active = status === "running"
						return (
							<li
								key={node.nodeId}
								data-active={active}
								className={`flex items-center justify-between gap-2 rounded px-2 py-1.5 ${active ? "border border-vscode-focusBorder bg-vscode-list-activeSelectionBackground" : "bg-vscode-list-hoverBackground"}`}>
								<span
									className="min-w-0 flex-1 truncate"
									style={{ paddingLeft: `${(node.dependsOn?.length ?? 0) * 16}px` }}>
									{active && (
										<span aria-label="Active subtask" className="mr-1">
											●
										</span>
									)}
									{node.title || node.nodeId}
								</span>
								<span className="shrink-0 text-xs opacity-80">{status}</span>
								{active && (
									<Button
										variant="ghost"
										size="sm"
										aria-label={`Cancel ${node.title || node.nodeId}`}
										onClick={() =>
											vscode.postMessage({
												type: "orchestrationCancel",
												orchestrationRunId: orchestrationSnapshot.run.runId,
												orchestrationNodeId: node.nodeId,
											})
										}>
										Cancel
									</Button>
								)}
							</li>
						)
					})}
				</ul>
			)}
		</section>
	)
}

export default OrchestrationPanel
export { OrchestrationPanel }
