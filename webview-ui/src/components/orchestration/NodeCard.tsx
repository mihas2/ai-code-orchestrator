import { useTranslation } from "react-i18next"
import type { OrchestrationSnapshotState } from "@src/context/ExtensionStateContext"
import { vscode } from "@src/utils/vscode"

type Node = OrchestrationSnapshotState["nodes"][number]

function elapsed(node: Node) {
	const start = node.timestamps?.running
	if (!start) return undefined
	const end = Math.max(
		...Object.entries(node.timestamps ?? {})
			.filter(([key]) => key !== "running")
			.map(([, value]) => value),
		0,
	)
	return Math.max(0, (end || Date.now()) - start)
}

function formatDuration(ms?: number) {
	if (ms === undefined) return undefined
	const seconds = Math.floor(ms / 1000)
	return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

export function NodeCard({ node, runId }: { node: Node; runId: string }) {
	const { t } = useTranslation("orchestration")
	const send = (
		type: "orchestrationRetry" | "orchestrationReview" | "orchestrationOpenTask" | "orchestrationViewDiff",
	) => vscode.postMessage({ type, orchestrationRunId: runId, orchestrationNodeId: node.nodeId })
	const files = node.outputContract?.filesChanged ?? []
	const tests = node.outputContract?.tests ?? []
	return (
		<article
			className="border border-vscode-panel-border rounded p-3 min-w-0"
			data-testid={`orchestration-node-${node.nodeId}`}>
			<div className="flex justify-between gap-2">
				<strong className="truncate">{node.title}</strong>
				<span>{t(`statuses.${node.status}`, { defaultValue: node.status })}</span>
			</div>
			<div className="text-xs text-vscode-descriptionForeground">
				{node.role} · {t("dependsOn")}: {node.dependsOn.join(", ") || t("none")}
			</div>
			<dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-xs mt-2">
				<dt>{t("modelProfile")}</dt>
				<dd className="truncate">
					{node.route
						? `${node.route.profileId} · ${node.route.provider}/${node.route.modelId}`
						: t("unavailable")}
				</dd>
				<dt>{t("elapsed")}</dt>
				<dd>{formatDuration(elapsed(node)) ?? t("unavailable")}</dd>
				{/* TODO: persist per-node usage; the current ledger only provides run totals. */}
				<dt>{t("tokensCost")}</dt>
				<dd>
					{node.usage
						? `${Object.values(node.usage)
								.filter((value) => typeof value === "number")
								.reduce(
									(sum, value) => sum + value,
									0,
								)}${node.usage.cost !== undefined ? ` · $${node.usage.cost}` : ""}`
						: t("unavailable")}
				</dd>
				<dt>{t("changedFiles")}</dt>
				<dd>{files.length ? files.join(", ") : t("none")}</dd>
				<dt>{t("tests")}</dt>
				<dd>
					{tests.length
						? tests.map((test) => `${test.passed ? "✓" : "✗"} ${test.command}`).join(", ")
						: t("unavailable")}
				</dd>
			</dl>
			{node.outputContract?.summary && <p className="text-sm break-words">{node.outputContract.summary}</p>}
			<div className="flex flex-wrap gap-1 mt-2">
				{node.status === "failed" && (
					<button onClick={() => send("orchestrationRetry")}>{t("actions.retry")}</button>
				)}
				{node.status === "needs_rework" && (
					<button onClick={() => send("orchestrationRetry")}>{t("actions.rework")}</button>
				)}
				{node.status === "awaiting_review" && (
					<button onClick={() => send("orchestrationReview")}>{t("actions.review")}</button>
				)}
				{node.taskId && <button onClick={() => send("orchestrationOpenTask")}>{t("actions.openTask")}</button>}
				{(files.length > 0 || (node.artifactRefs?.length ?? 0) > 0) && (
					<button onClick={() => send("orchestrationViewDiff")}>{t("actions.viewDiff")}</button>
				)}
			</div>
		</article>
	)
}
