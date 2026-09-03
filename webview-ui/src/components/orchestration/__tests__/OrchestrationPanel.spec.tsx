import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { OrchestrationPanel } from "../OrchestrationPanel"
import { vscode } from "@src/utils/vscode"
import { useExtensionState } from "@src/context/ExtensionStateContext"

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock("@src/utils/vscode", () => ({ vscode: { postMessage: vi.fn() } }))
vi.mock("@src/context/ExtensionStateContext", () => ({ useExtensionState: vi.fn() }))

const makeNode = (nodeId: string, status: string, extra = {}) => ({
	nodeId,
	taskId: `task-${nodeId}`,
	title: `Task ${nodeId}`,
	role: "code",
	status,
	dependsOn: nodeId === "b" ? ["a"] : [],
	route: { profileId: "fast", provider: "openrouter", modelId: "model-1" },
	timestamps: { running: 1_000, integrated: 3_000 },
	artifactRefs: [],
	outputContract: {
		summary: `Result ${nodeId}`,
		filesChanged: [`src/${nodeId}.ts`],
		tests: [{ command: `test-${nodeId}`, passed: true }],
	},
	...extra,
})

const renderPanel = (nodes = [makeNode("a", "awaiting_review"), makeNode("b", "needs_rework")]) => {
	vi.mocked(useExtensionState).mockReturnValue({
		orchestrationSnapshot: {
			run: { runId: "run-1", goal: "Ship orchestration", status: "running" },
			nodes,
			pendingApproval: "plan",
		},
		orchestrationEvents: [],
	} as unknown as ReturnType<typeof useExtensionState>)
	return render(<OrchestrationPanel runId="run-1" />)
}

describe("OrchestrationPanel", () => {
	beforeEach(() => vi.clearAllMocks())

	it("renders the dependency graph and task cards with metadata", () => {
		renderPanel()
		expect(screen.getByTestId("dependency-graph")).toHaveTextContent("Task a")
		expect(screen.getByTestId("dependency-graph")).toHaveTextContent("← a")
		expect(screen.getByTestId("orchestration-node-a")).toHaveTextContent("fast · openrouter/model-1")
		expect(screen.getByTestId("orchestration-node-a")).toHaveTextContent("src/a.ts")
		expect(screen.getByTestId("orchestration-node-a")).toHaveTextContent("✓ test-a")
	})

	it.each([
		["awaiting_review", "actions.review", "orchestrationReview"],
		["needs_rework", "actions.rework", "orchestrationRetry"],
		["failed", "actions.retry", "orchestrationRetry"],
		["integrated", "actions.openTask", "orchestrationOpenTask"],
	])("sends the %s node action", (status, label, type) => {
		renderPanel([makeNode("a", status)])
		fireEvent.click(screen.getByText(label))
		expect(vscode.postMessage).toHaveBeenCalledWith({
			type,
			orchestrationRunId: "run-1",
			orchestrationNodeId: "a",
		})
	})

	it("requests a fresh snapshot on mount and after an orchestration event", async () => {
		const state = {
			orchestrationSnapshot: {
				run: { runId: "run-1", goal: "Ship orchestration", status: "running" },
				nodes: [makeNode("a", "running")],
			},
			orchestrationEvents: [] as unknown[],
		}
		vi.mocked(useExtensionState).mockImplementation(() => state as unknown as ReturnType<typeof useExtensionState>)
		const view = render(<OrchestrationPanel runId="run-1" />)
		await waitFor(() =>
			expect(vscode.postMessage).toHaveBeenCalledWith({
				type: "orchestrationSnapshot",
				orchestrationRunId: "run-1",
			}),
		)
		vi.mocked(vscode.postMessage).mockClear()
		state.orchestrationEvents.push({ type: "nodeStatusChanged" })
		view.rerender(<OrchestrationPanel runId="run-1" />)
		await waitFor(() => expect(vscode.postMessage).toHaveBeenCalledTimes(1))
	})
})
