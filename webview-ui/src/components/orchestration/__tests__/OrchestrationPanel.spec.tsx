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
		{
			nodeId: "parent",
			title: "Main task",
			status: "completed",
			dependsOn: [],
			attempt: 1,
			maxAttempts: 3,
			payload: { input: "value" },
		},
		{
			nodeId: "child",
			title: "Active subtask",
			status: "running",
			dependsOn: ["parent"],
			attempt: 2,
			maxAttempts: 3,
		},
		{ nodeId: "failed", title: "Failed task", status: "failed", dependsOn: [], attempt: 1, maxAttempts: 1 },
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

	it("shows attempts and expands task payload", () => {
		vi.mocked(useExtensionState).mockReturnValue({ orchestrationSnapshot: snapshot } as never)
		render(<OrchestrationPanel />)
		expect(screen.getByText("Attempt 2/3")).toBeInTheDocument()
		expect(screen.getByLabelText("Retrying task")).toBeInTheDocument()
		expect(screen.queryByText(/"input": "value"/)).not.toBeInTheDocument()
		fireEvent.click(screen.getByRole("button", { name: /show payload for main task/i }))
		expect(screen.getByText(/"input": "value"/)).toBeInTheDocument()
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
