import React from "react"
import { describe, expect, it, vi, beforeEach } from "vitest"
import { fireEvent, render, screen } from "@/utils/test-utils"

const { postMessage } = vi.hoisted(() => ({ postMessage: vi.fn() }))
vi.mock("@src/utils/vscode", () => ({ vscode: { postMessage } }))

vi.mock("@src/context/ExtensionStateContext", () => ({
	useExtensionState: vi.fn(),
}))

import { useExtensionState } from "@src/context/ExtensionStateContext"
import OrchestrationPanel from "../OrchestrationPanel"

const snapshot = {
	run: { runId: "run-1", status: "running" },
	nodes: [
		{ nodeId: "parent", title: "Main task", status: "completed", dependsOn: [] },
		{ nodeId: "child", title: "Active subtask", status: "running", dependsOn: ["parent"] },
		{ nodeId: "failed", title: "Failed task", status: "failed", dependsOn: [] },
	],
	events: [],
	capturedAt: 1,
}

beforeEach(() => postMessage.mockClear())

describe("OrchestrationPanel", () => {
	it("does not show tasks without a snapshot", () => {
		vi.mocked(useExtensionState).mockReturnValue({ orchestrationSnapshot: undefined } as never)
		render(<OrchestrationPanel />)
		expect(screen.queryByRole("heading", { name: /orchestration/i })).not.toBeInTheDocument()
	})

	it("renders tasks and their statuses", () => {
		vi.mocked(useExtensionState).mockReturnValue({ orchestrationSnapshot: snapshot } as never)
		render(<OrchestrationPanel />)
		expect(screen.getByText("Main task")).toBeInTheDocument()
		expect(screen.getByText("Active subtask")).toBeInTheDocument()
		expect(screen.getByText("running")).toBeInTheDocument()
		expect(screen.getByText("Active subtask").closest("li")).toHaveAttribute("data-active", "true")
	})

	it("sends a cancel command for a running task", () => {
		vi.mocked(useExtensionState).mockReturnValue({ orchestrationSnapshot: snapshot } as never)
		render(<OrchestrationPanel />)
		fireEvent.click(screen.getByRole("button", { name: /cancel active subtask/i }))
		expect(postMessage).toHaveBeenCalledWith({
			type: "orchestrationCancel",
			orchestrationRunId: "run-1",
			orchestrationNodeId: "child",
		})
	})
})
