import React, { useMemo, useState } from "react"
import { useExtensionState } from "@src/context/ExtensionStateContext"
import { vscode } from "@src/utils/vscode"
import { Button } from "@src/components/ui/button"

interface TaskNode {
	nodeId: string
	title?: string
	role?: string
	status?: string
	dependsOn?: string[]
	attempt?: number
	maxAttempts?: number
	inputContract?: { tokenBudget?: number }
	payload?: unknown
}

const roleStyles: Record<string, string> = {
	worker: "border-vscode-charts-blue text-vscode-charts-blue",
	orchestrator: "border-vscode-charts-purple text-vscode-charts-purple",
	reviewer: "border-vscode-charts-green text-vscode-charts-green",
}

const statusLabel = (status: string) => (status === "integrated" ? "completed" : status)
const formatPayload = (payload: unknown) => {
	try {
		return JSON.stringify(payload, null, 2) ?? String(payload)
	} catch {
		return String(payload)
	}
}
const truncatePayload = (payload: string) => (payload.length > 200 ? `${payload.slice(0, 200)}...` : payload)

const TaskRow = ({ node, runId, nodeTitles }: { node: TaskNode; runId: string; nodeTitles: Map<string, string> }) => {
	const [expanded, setExpanded] = useState(false)
	const status = statusLabel(node.status ?? "pending")
	const active = status === "running"
	const attempt = node.attempt ?? 0
	const maxAttempts = node.maxAttempts ?? 1
	const retrying = attempt > 1
	const role = node.role || "task"
	const budget = node.inputContract?.tokenBudget
	const dependencies = (node.dependsOn ?? []).map((id) => nodeTitles.get(id) || id)
	const payloadText = node.payload === undefined ? undefined : truncatePayload(formatPayload(node.payload))

	return (
		<li
			data-active={active}
			className={`flex flex-wrap items-center justify-between gap-2 rounded px-2 py-1.5 ${active ? "border border-vscode-focusBorder bg-vscode-list-activeSelectionBackground" : "bg-vscode-list-hoverBackground"} ${retrying ? "border-l-2 border-l-vscode-charts-yellow" : ""}`}>
			<span
				className="min-w-0 flex-1 truncate border-l-2 border-vscode-tree-indentGuidesStroke pl-2"
				style={{ paddingLeft: `${(node.dependsOn?.length ?? 0) * 16 + 8}px` }}>
				{active && (
					<span aria-label="Active subtask" className="mr-1">
						●
					</span>
				)}
				{node.title || node.nodeId}
			</span>
			<span
				aria-label={`Task role: ${role}`}
				className={`shrink-0 rounded border px-1.5 py-0.5 text-xs ${roleStyles[role] || "border-vscode-panel-border opacity-80"}`}>
				{role}
			</span>
			{budget !== undefined && (
				<span className="shrink-0 rounded bg-vscode-badge-background px-1.5 py-0.5 text-xs">
					Budget {budget}
				</span>
			)}
			<span className="shrink-0 rounded bg-vscode-badge-background px-1.5 py-0.5 text-xs">
				Max retries {Math.max(0, maxAttempts - 1)}
			</span>
			<span className="shrink-0 text-xs opacity-80">{status}</span>
			<span
				className={`shrink-0 text-xs ${retrying ? "font-semibold text-vscode-charts-yellow" : "opacity-70"}`}
				aria-label={retrying ? "Retrying task" : undefined}>
				Attempt {attempt}/{maxAttempts}
			</span>
			{payloadText !== undefined && (
				<Button
					variant="ghost"
					size="sm"
					aria-label={`${expanded ? "Hide" : "Show"} payload for ${node.title || node.nodeId}`}
					onClick={() => setExpanded((value) => !value)}>
					{expanded ? "Hide payload" : "Payload"}
				</Button>
			)}
			{active && (
				<Button
					variant="ghost"
					size="sm"
					aria-label={`Cancel ${node.title || node.nodeId}`}
					onClick={() =>
						vscode.postMessage({
							type: "orchestrationCancel",
							orchestrationRunId: runId,
							orchestrationNodeId: node.nodeId,
						})
					}>
					Cancel
				</Button>
			)}
			{dependencies.length > 0 && (
				<span className="basis-full pl-2 text-xs opacity-70">Depends on: {dependencies.join(", ")}</span>
			)}
			{expanded && payloadText !== undefined && (
				<pre className="basis-full whitespace-pre-wrap break-words text-xs opacity-80">{payloadText}</pre>
			)}
		</li>
	)
}

const OrchestrationPanel = () => {
	const { orchestrationSnapshot } = useExtensionState()
	const nodes = useMemo(() => orchestrationSnapshot?.nodes as TaskNode[] | undefined, [orchestrationSnapshot])
	if (!orchestrationSnapshot) return null
	const nodeTitles = new Map((nodes ?? []).map((node) => [node.nodeId, node.title || node.nodeId]))
	const children = new Set(nodes?.flatMap((node) => node.dependsOn ?? []) ?? [])
	const orderedNodes = [...(nodes ?? [])].sort(
		(a, b) => (children.has(a.nodeId) ? 1 : 0) - (children.has(b.nodeId) ? 1 : 0),
	)

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
					{orderedNodes.map((node) => (
						<TaskRow
							key={node.nodeId}
							node={node}
							runId={orchestrationSnapshot.run.runId}
							nodeTitles={nodeTitles}
						/>
					))}
				</ul>
			)}
		</section>
	)
}

export default OrchestrationPanel
export { OrchestrationPanel }
