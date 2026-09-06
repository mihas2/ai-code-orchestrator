import { describe, expect, it } from "vitest"
import { LogAggregator } from "../logAggregator"
import type { NodeLog } from "../types"

const completed = (nodeId: string, timestamp = 100): NodeLog => ({
	nodeId,
	status: "completed",
	stdout: "stdout",
	stderr: "stderr",
	timestamp,
})

describe("LogAggregator", () => {
	it("collects logs from a completed node", () => {
		const aggregator = new LogAggregator("dag-1")
		aggregator.addNodeLog("a", completed("a"))

		expect(aggregator.getNodeLogs("dag-1")).toEqual([completed("a")])
	})

	it("preserves failed node error and output", () => {
		const aggregator = new LogAggregator("dag-1")
		const log: NodeLog = {
			nodeId: "failed",
			status: "failed",
			error: "command failed",
			stdout: "partial output",
			stderr: "failure output",
			timestamp: 200,
		}
		aggregator.addNodeLog("failed", log)

		expect(aggregator.getNodeLogs("dag-1")).toEqual([log])
	})

	it("preserves rejected node reason", () => {
		const aggregator = new LogAggregator("dag-1")
		const log: NodeLog = {
			nodeId: "rejected",
			status: "rejected",
			reason: "conflicting artifacts",
			timestamp: 300,
		}
		aggregator.addNodeLog("rejected", log)

		expect(aggregator.getNodeLogs("dag-1")).toEqual([log])
	})

	it("returns every node log in execution order", () => {
		const aggregator = new LogAggregator("dag-1")
		aggregator.addNodeLog("a", completed("a", 1))
		aggregator.addNodeLog("b", completed("b", 2))
		aggregator.addNodeLog("c", {
			nodeId: "c",
			status: "failed",
			error: "boom",
			timestamp: 3,
		})

		expect(aggregator.getNodeLogs("dag-1").map((log) => log.nodeId)).toEqual(["a", "b", "c"])
	})

	it("exports a complete DAG log as JSON structure", () => {
		const aggregator = new LogAggregator("dag-1")
		const log = completed("a")
		aggregator.addNodeLog("a", log)

		expect(aggregator.exportLogs("dag-1")).toEqual({ dagId: "dag-1", nodes: [log] })
	})

	it("handles an empty DAG", () => {
		expect(new LogAggregator("empty-dag").getNodeLogs("empty-dag")).toEqual([])
	})
})
