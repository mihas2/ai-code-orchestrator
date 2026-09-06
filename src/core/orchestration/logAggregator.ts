import type { NodeLog } from "./types"

const MAX_LOG_LENGTH = 10 * 1024
const TRUNCATION_SUFFIX = "... (truncated)"

function truncate(value: string | undefined): string | undefined {
	if (value === undefined || value.length <= MAX_LOG_LENGTH) return value
	return value.slice(0, MAX_LOG_LENGTH - TRUNCATION_SUFFIX.length) + TRUNCATION_SUFFIX
}

export class LogAggregator {
	private readonly logs: NodeLog[] = []

	constructor(private readonly dagId = "") {}

	addNodeLog(nodeId: string, log: NodeLog): void {
		this.logs.push({
			...log,
			nodeId,
			stdout: truncate(log.stdout),
			stderr: truncate(log.stderr),
		})
	}

	getNodeLogs(dagId: string): NodeLog[] {
		return dagId === this.dagId ? this.logs.map((log) => ({ ...log })) : []
	}

	exportLogs(dagId: string): { dagId: string; nodes: NodeLog[] } {
		return { dagId, nodes: this.getNodeLogs(dagId) }
	}
}
