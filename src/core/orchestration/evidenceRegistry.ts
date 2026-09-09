import { createHash } from "node:crypto"
import type { OrchestrationSnapshot } from "./types"
import type { EvidenceRecord, EvidenceRegistry } from "./orchestratorDecisionService"

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex")
const id = (kind: string, value: unknown) => `${kind}:${hash(value).slice(0, 24)}`

/** Builds acceptance evidence from the complete persisted snapshot, never from a
 * presentation-only result string or lead-session side channel. */
export function buildEvidenceRegistry(
	snapshot: OrchestrationSnapshot,
	requestId: string,
	result: string,
	workspaceRevision: string,
): EvidenceRegistry {
	const records: EvidenceRecord[] = []
	for (const node of snapshot.nodes) {
		if (node.outputContract) {
			const resultHash = hash(node.outputContract)
			records.push({
				id: id("node-result", [node.nodeId, node.attempt, resultHash]),
				type: "node-result",
				nodeId: node.nodeId,
				resultHash,
				status: node.outputContract.status,
				provenance: { nodeId: node.nodeId, attempt: node.attempt },
			})
			for (const test of node.outputContract.tests)
				records.push({
					id: id("test", [node.nodeId, test]),
					type: "test",
					command: test.command,
					passed: test.passed,
					exitCode: test.exitCode,
					outputRef: test.outputRef,
					provenance: { nodeId: node.nodeId, attempt: node.attempt },
				})
		}
		for (const ref of node.artifactRefs) {
			const artifact = snapshot.artifacts?.find(
				(item) =>
					item.ref === ref &&
					((item.nodeId === node.nodeId && item.attempt === node.attempt) ||
						(item.nodeId === undefined && item.attempt === undefined)),
			)
			const available = !!artifact?.resultHash && artifact.preserved
			records.push({
				id: id("artifact", [node.nodeId, ref, artifact?.resultHash ?? "unavailable"]),
				type: "artifact",
				ref,
				...(available ? { hash: artifact.resultHash } : {}),
				status: available ? "available" : "unavailable",
				provenance: { nodeId: node.nodeId, attempt: node.attempt, path: artifact?.path },
			})
		}
	}
	for (const finding of snapshot.findings ?? []) {
		const node = snapshot.nodes.find((item) => item.nodeId === finding.nodeId)
		if (
			!node ||
			(finding.runId && finding.runId !== snapshot.run.runId) ||
			finding.provenance.attempt !== node.attempt
		)
			continue
		records.push({
			id: id("review", finding),
			type: "review",
			findingId: finding.id,
			status: finding.severity === "blocker" || finding.severity === "major" ? "blocking" : "clear",
			criterionId: finding.acceptanceCriterionRef,
			provenance: {
				nodeId: finding.nodeId,
				attempt: finding.provenance.attempt,
				eventId: snapshot.events.find(
					(event) => event.payload.finding && (event.payload.finding as { id?: string }).id === finding.id,
				)?.eventId,
			},
		})
	}
	for (const event of snapshot.events)
		records.push({
			id: `event:${event.eventId}`,
			type: "event",
			eventId: event.eventId,
			eventType: event.type,
			status: "recorded",
			provenance: { sequence: event.sequence, nodeId: event.nodeId },
		})
	return { requestId, originalGoal: snapshot.run.goal, resultHash: hash(result), workspaceRevision, records }
}

/** Builds root acceptance evidence from persisted ordinary task histories without a DAG. */
export function buildTaskEvidenceRegistry(input: {
	requestId: string
	originalGoal: string
	result: string
	workspaceRevision: string
	tasks: Array<{ taskId: string; role: string; history: unknown[] }>
}): EvidenceRegistry {
	const records: EvidenceRecord[] = []
	for (const task of input.tasks) {
		const contentHash = hash(task.history)
		records.push({
			id: id("task-history", [task.taskId, contentHash]),
			type: "task-history",
			taskId: task.taskId,
			role: task.role,
			contentHash,
			content: task.history,
			provenance: { taskId: task.taskId, source: "persisted-task-history" },
		})
		for (const message of task.history) {
			if (!message || typeof message !== "object") continue
			const item = message as { role?: string; content?: unknown }
			if (item.role !== "user" || !Array.isArray(item.content)) continue
			for (const block of item.content as Array<{ type?: string; content?: unknown; tool_use_id?: string }>) {
				if (block.type !== "tool_result") continue
				const blockHash = hash(block.content)
				records.push({
					id: id("tool-result", [task.taskId, block.tool_use_id, blockHash]),
					type: "tool-result",
					taskId: task.taskId,
					toolUseId: block.tool_use_id,
					contentHash: blockHash,
					content: block.content,
					provenance: { taskId: task.taskId, source: "persisted-tool-result" },
				})
			}
		}
	}
	return {
		requestId: input.requestId,
		originalGoal: input.originalGoal,
		resultHash: hash(input.result),
		workspaceRevision: input.workspaceRevision,
		records,
	}
}
