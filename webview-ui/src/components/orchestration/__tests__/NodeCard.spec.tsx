import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { NodeCard } from "../NodeCard"
import { vscode } from "@src/utils/vscode"

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock("@src/utils/vscode", () => ({ vscode: { postMessage: vi.fn() } }))

const node = (status: string, extra = {}) => ({
	nodeId: "node-1",
	taskId: "task-1",
	title: "Implement UI",
	role: "code",
	status,
	dependsOn: ["plan"],
	route: { profileId: "fast", provider: "openrouter", modelId: "model" },
	timestamps: { running: 1000, failed: 2000 },
	artifactRefs: ["diff:node-1"],
	outputContract: { summary: "Done", filesChanged: ["src/ui.tsx"], tests: [{ command: "pnpm test", passed: true }] },
	...extra,
})

describe("NodeCard", () => {
	it("renders node metrics, files, and tests", () => {
		render(<NodeCard node={node("integrated")} runId="run-1" />)
		expect(screen.getByText(/fast · openrouter\/model/)).toBeInTheDocument()
		expect(screen.getByText("src/ui.tsx")).toBeInTheDocument()
		expect(screen.getByText("✓ pnpm test")).toBeInTheDocument()
	})

	it.each([
		["failed", "actions.retry"],
		["needs_rework", "actions.rework"],
		["awaiting_review", "actions.review"],
	])("shows the valid action for %s", (status, label) => {
		render(<NodeCard node={node(status)} runId="run-1" />)
		fireEvent.click(screen.getByText(label))
		expect(vscode.postMessage).toHaveBeenCalledWith(
			expect.objectContaining({ orchestrationRunId: "run-1", orchestrationNodeId: "node-1" }),
		)
	})
})
