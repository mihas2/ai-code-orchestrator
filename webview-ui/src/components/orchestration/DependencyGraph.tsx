import type { OrchestrationSnapshotState } from "@src/context/ExtensionStateContext"

const statusColor: Record<string, string> = {
	running: "#3794ff",
	integrated: "#73c991",
	failed: "#f14c4c",
	blocked: "#cccccc",
	awaiting_review: "#dcdcaa",
	needs_rework: "#ce9178",
	ready_to_integrate: "#4ec9b0",
}

export function DependencyGraph({ nodes, title }: { nodes: OrchestrationSnapshotState["nodes"]; title: string }) {
	const columns = nodes.reduce<Record<number, typeof nodes>>((acc, node) => {
		const level = node.dependsOn.reduce(
			(max, dep) => Math.max(max, (nodes.find((n) => n.nodeId === dep)?.dependsOn.length ?? 0) + 1),
			0,
		)
		;(acc[level] ??= []).push(node)
		return acc
	}, {})
	return (
		<div className="border border-vscode-panel-border rounded p-2 overflow-x-auto" data-testid="dependency-graph">
			<div className="text-sm font-medium mb-2">{title}</div>
			<div className="flex gap-6 items-start min-w-max">
				{Object.keys(columns)
					.sort((a, b) => Number(a) - Number(b))
					.map((level) => (
						<div key={level} className="flex flex-col gap-2 min-w-36">
							{columns[Number(level)].map((node) => (
								<div
									key={node.nodeId}
									className={`border rounded px-2 py-1 text-xs ${node.status === "running" ? "ring-2 ring-vscode-focusBorder" : ""}`}
									style={{ borderColor: statusColor[node.status] ?? "var(--vscode-panel-border)" }}>
									<div className="flex gap-1">
										<span style={{ color: statusColor[node.status] ?? "inherit" }}>●</span>
										<span className="truncate">{node.title}</span>
									</div>
									<div className="text-vscode-descriptionForeground">{node.status}</div>
									{node.dependsOn.length > 0 && (
										<div className="text-vscode-descriptionForeground">
											← {node.dependsOn.join(", ")}
										</div>
									)}
								</div>
							))}
						</div>
					))}
			</div>
		</div>
	)
}
