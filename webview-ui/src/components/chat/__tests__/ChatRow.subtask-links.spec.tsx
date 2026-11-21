import React from "react"
import { render, screen, fireEvent } from "@/utils/test-utils"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ChatRowContent } from "../ChatRow"
import type { HistoryItem, ClineMessage } from "@ai-code-orchestrator/types"

// Mock vscode API
const mockPostMessage = vi.fn()
vi.mock("@src/utils/vscode", () => ({
	vscode: {
		postMessage: (msg: unknown) => mockPostMessage(msg),
	},
}))

// Mock i18n
vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => {
			const map: Record<string, string> = {
				"chat:subtasks.wantsToCreate": "AI Code Orchestrator wants to create a new subtask",
				"chat:subtasks.resultContent": "Task result",
				"chat:subtasks.goToSubtask": "Go to subtask",
			}
			return map[key] ?? key
		},
		i18n: { exists: () => true },
	}),
	Trans: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
	initReactI18next: { type: "3rdParty", init: () => {} },
}))

// Mock extension state context
let mockCurrentTaskItem: Partial<HistoryItem> | undefined = undefined
let mockClineMessages: ClineMessage[] = []

vi.mock("@src/context/ExtensionStateContext", () => ({
	useExtensionState: () => ({
		mcpServers: [],
		alwaysAllowMcp: false,
		currentCheckpoint: null,
		mode: "code",
		apiConfiguration: {},
		clineMessages: mockClineMessages,
		currentTaskItem: mockCurrentTaskItem,
	}),
}))

// Mock useSelectedModel hook
vi.mock("@src/components/ui/hooks/useSelectedModel", () => ({
	useSelectedModel: () => ({ info: { supportsImages: true } }),
}))

const queryClient = new QueryClient()

function renderChatRow(message: any, currentTaskItem?: Partial<HistoryItem>, clineMessages?: ClineMessage[]) {
	mockCurrentTaskItem = currentTaskItem
	mockClineMessages = clineMessages || [message]

	return render(
		<QueryClientProvider client={queryClient}>
			<ChatRowContent
				message={message}
				isExpanded={false}
				isLast={false}
				isStreaming={false}
				onToggleExpand={() => {}}
				onSuggestionClick={() => {}}
				onBatchFileResponse={() => {}}
				onFollowUpUnmount={() => {}}
				isFollowUpAnswered={false}
			/>
		</QueryClientProvider>,
	)
}

describe("ChatRow - subtask links", () => {
	beforeEach(() => {
		mockPostMessage.mockClear()
	})

	describe("newTask tool", () => {
		it("should display 'Go to subtask' link when currentTaskItem has childIds", () => {
			const message = {
				ts: Date.now(),
				type: "ask" as const,
				ask: "tool" as const,
				text: JSON.stringify({
					tool: "newTask",
					mode: "code",
					content: "Implement feature X",
				}),
			}

			// childIds maps by index to newTask messages - first newTask gets childIds[0]
			renderChatRow(message, {
				childIds: ["child-task-123"],
			})

			const goToSubtaskButton = screen.getByText("Go to subtask")
			expect(goToSubtaskButton).toBeInTheDocument()

			fireEvent.click(goToSubtaskButton)

			expect(mockPostMessage).toHaveBeenCalledWith({
				type: "showTaskWithId",
				text: "child-task-123",
			})
		})

		it("should display 'Go to subtask' link using index-matched childId for multiple newTasks", () => {
			const message = {
				ts: Date.now(),
				type: "ask" as const,
				ask: "tool" as const,
				text: JSON.stringify({
					tool: "newTask",
					mode: "architect",
					content: "Design system architecture",
				}),
			}

			// The implementation maps newTask messages to childIds by index
			// Since this is the first (and only) newTask message, it gets childIds[0]
			renderChatRow(message, {
				childIds: ["first-child", "second-child"],
			})

			const goToSubtaskButton = screen.getByText("Go to subtask")
			expect(goToSubtaskButton).toBeInTheDocument()

			fireEvent.click(goToSubtaskButton)

			// First newTask message maps to first childId
			expect(mockPostMessage).toHaveBeenCalledWith({
				type: "showTaskWithId",
				text: "first-child",
			})
		})

		it("should not display 'Go to subtask' link when no child task exists", () => {
			const message = {
				ts: Date.now(),
				type: "ask" as const,
				ask: "tool" as const,
				text: JSON.stringify({
					tool: "newTask",
					mode: "code",
					content: "Implement feature X",
				}),
			}

			renderChatRow(message, undefined)

			const goToSubtaskButton = screen.queryByText("Go to subtask")
			expect(goToSubtaskButton).toBeNull()
		})

		it("should not display 'Go to subtask' link when directly followed by subtask_result", () => {
			const newTaskMessage = {
				ts: 1000,
				type: "ask" as const,
				ask: "tool" as const,
				text: JSON.stringify({
					tool: "newTask",
					mode: "code",
					content: "Implement feature X",
				}),
			}

			const subtaskResultMessage = {
				ts: 1001,
				type: "say" as const,
				say: "subtask_result" as const,
				text: "The subtask has been completed successfully.",
			}

			// Pass both messages in the clineMessages array
			renderChatRow(newTaskMessage, { delegatedToId: "child-task-123" }, [
				newTaskMessage,
				subtaskResultMessage,
			] as ClineMessage[])

			// Button should be hidden because next message is subtask_result
			const goToSubtaskButton = screen.queryByText("Go to subtask")
			expect(goToSubtaskButton).toBeNull()
		})
	})

	describe("subtask_result say message", () => {
		it("links each subtask_result to its own child, not the last completed one", () => {
			const first = {
				ts: 1000,
				type: "say" as const,
				say: "subtask_result" as const,
				text: "first",
				childTaskId: "child-1",
			}
			const second = {
				ts: 2000,
				type: "say" as const,
				say: "subtask_result" as const,
				text: "second",
				childTaskId: "child-2",
			}
			const item = { childIds: ["child-1", "child-2"], completedByChildId: "child-2" }

			renderChatRow(first, item, [first, second] as ClineMessage[])
			fireEvent.click(screen.getByText("Go to subtask"))

			expect(mockPostMessage).toHaveBeenCalledWith({ type: "showTaskWithId", text: "child-1" })
		})

		it("links legacy results (no childTaskId) by child creation time, including the first one", () => {
			// UUIDv7 ids created at ms 1000 and 2000; the first newTask ask is missing from history.
			const child1 = "00000000-03e8-7000-8000-000000000001"
			const child2 = "00000000-07d0-7000-8000-000000000002"
			const firstResult = { ts: 1500, type: "say" as const, say: "subtask_result" as const, text: "first" }
			const secondNewTask = {
				ts: 1990,
				type: "ask" as const,
				ask: "tool" as const,
				text: JSON.stringify({ tool: "newTask", mode: "code", content: "second" }),
			}
			const secondResult = { ts: 2500, type: "say" as const, say: "subtask_result" as const, text: "second" }
			const messages = [firstResult, secondNewTask, secondResult] as ClineMessage[]
			const item = { childIds: [child1, child2], completedByChildId: child2 }

			const { unmount } = renderChatRow(firstResult, item, messages)
			fireEvent.click(screen.getByText("Go to subtask"))
			expect(mockPostMessage).toHaveBeenLastCalledWith({ type: "showTaskWithId", text: child1 })
			unmount()

			renderChatRow(secondResult, item, messages)
			fireEvent.click(screen.getByText("Go to subtask"))
			expect(mockPostMessage).toHaveBeenLastCalledWith({ type: "showTaskWithId", text: child2 })
		})

		it("should not display 'Go to subtask' link when the child is unknown", () => {
			const message = {
				ts: Date.now(),
				type: "say" as const,
				say: "subtask_result" as const,
				text: "The subtask has been completed successfully.",
			}

			renderChatRow(message, undefined)

			const goToSubtaskButton = screen.queryByText("Go to subtask")
			expect(goToSubtaskButton).toBeNull()
		})
	})
})
