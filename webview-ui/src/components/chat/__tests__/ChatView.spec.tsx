// pnpm --filter @ai-code-orchestrator/vscode-webview test src/components/chat/__tests__/ChatView.spec.tsx

import React from "react"
import { render, waitFor, act, fireEvent } from "@/utils/test-utils"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import { ExtensionStateContextProvider } from "@src/context/ExtensionStateContext"
import { vscode } from "@src/utils/vscode"

import ChatView, { ChatViewProps } from "../ChatView"

// Define minimal types needed for testing
interface ClineMessage {
	type: "say" | "ask"
	say?: string
	ask?: string
	ts: number
	text?: string
	partial?: boolean
}

interface ExtensionState {
	version: string
	clineMessages: ClineMessage[]
	taskHistory: any[]
	shouldShowAnnouncement: boolean
	allowedCommands: string[]
	alwaysAllowExecute: boolean
	[key: string]: any
}

// Mock vscode API
vi.mock("@src/utils/vscode", () => ({
	vscode: {
		postMessage: vi.fn(),
	},
}))

// Mock use-sound hook
const mockPlayFunction = vi.fn()
vi.mock("use-sound", () => ({
	default: vi.fn().mockImplementation(() => {
		return [mockPlayFunction]
	}),
}))

// Mock components that use ESM dependencies
vi.mock("../ChatRow", () => ({
	default: function MockChatRow({ message }: { message: ClineMessage }) {
		return <div data-testid="chat-row">{JSON.stringify(message)}</div>
	},
}))

vi.mock("../AutoApproveMenu", () => ({
	default: () => null,
}))

// Mock react-virtuoso to render items directly without virtualization
// This allows tests to verify items rendered in the chat list
vi.mock("react-virtuoso", () => ({
	Virtuoso: function MockVirtuoso({
		data,
		itemContent,
	}: {
		data: ClineMessage[]
		itemContent: (index: number, item: ClineMessage) => React.ReactNode
	}) {
		return (
			<div data-testid="virtuoso-item-list">
				{data.map((item, index) => (
					<div key={item.ts} data-testid={`virtuoso-item-${index}`}>
						{itemContent(index, item)}
					</div>
				))}
			</div>
		)
	},
}))

// Mock VersionIndicator - returns null by default to prevent rendering in tests
vi.mock("../../common/VersionIndicator", () => ({
	default: vi.fn(() => null),
}))

// Get the mock function after the module is mocked
const mockVersionIndicator = vi.mocked((await import("../../common/VersionIndicator")).default)

vi.mock("../Announcement", () => ({
	default: function MockAnnouncement({ hideAnnouncement }: { hideAnnouncement: () => void }) {
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const React = require("react")
		return React.createElement(
			"div",
			{ "data-testid": "announcement-modal" },
			React.createElement("div", null, "What's New"),
			React.createElement("button", { onClick: hideAnnouncement }, "Close"),
		)
	},
}))

// Mock DismissibleUpsell component
vi.mock("@/components/common/DismissibleUpsell", () => ({
	default: function MockDismissibleUpsell({ children }: { children: React.ReactNode }) {
		return <div data-testid="dismissible-upsell">{children}</div>
	},
}))

// Mock QueuedMessages component
vi.mock("../QueuedMessages", () => ({
	QueuedMessages: function MockQueuedMessages({
		queue = [],
		onRemove,
	}: {
		queue?: Array<{ id: string; text: string; images?: string[] }>
		onRemove?: (index: number) => void
		onUpdate?: (index: number, newText: string) => void
	}) {
		if (!queue || queue.length === 0) {
			return null
		}
		return (
			<div data-testid="queued-messages">
				{queue.map((msg, index) => (
					<div key={msg.id}>
						<span>{msg.text}</span>
						<button aria-label="Remove message" onClick={() => onRemove?.(index)}>
							Remove
						</button>
					</div>
				))}
			</div>
		)
	},
}))

// Mock AicoTips component
vi.mock("@src/components/welcome/AicoTips", () => ({
	default: function MockAicoTips() {
		return <div data-testid="aico-tips">Tips content</div>
	},
}))

// Mock AicoHero component
vi.mock("@src/components/welcome/AicoHero", () => ({
	default: function MockAicoHero() {
		return <div data-testid="aico-hero">Hero content</div>
	},
}))

// Mock i18n
vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string, options?: any) => {
			if (key === "chat:versionIndicator.ariaLabel" && options?.version) {
				return `Version ${options.version}`
			}
			return key
		},
	}),
	initReactI18next: {
		type: "3rdParty",
		init: () => {},
	},
	Trans: ({ i18nKey, children }: { i18nKey: string; children?: React.ReactNode }) => {
		return <>{children || i18nKey}</>
	},
}))

interface ChatTextAreaProps {
	onSend: () => void
	inputValue?: string
	setInputValue?: (value: string) => void
	sendingDisabled?: boolean
	placeholderText?: string
	selectedImages?: string[]
	shouldDisableImages?: boolean
}

const mockInputRef = React.createRef<HTMLInputElement>()
const mockFocus = vi.fn()

vi.mock("../ChatTextArea", () => {
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const mockReact = require("react")

	const ChatTextAreaComponent = mockReact.forwardRef(function MockChatTextArea(
		props: ChatTextAreaProps,
		ref: React.ForwardedRef<{ focus: () => void }>,
	) {
		// Use useImperativeHandle to expose the mock focus method
		mockReact.useImperativeHandle(ref, () => ({
			focus: mockFocus,
		}))

		return (
			<div data-testid="chat-textarea">
				<input
					ref={mockInputRef}
					type="text"
					value={props.inputValue || ""}
					onChange={(e) => {
						// Use parent's setInputValue if available
						if (props.setInputValue) {
							props.setInputValue(e.target.value)
						}
					}}
					onKeyDown={(e) => {
						// Only call onSend when Enter is pressed (simulating real behavior)
						if (e.key === "Enter" && !e.shiftKey) {
							e.preventDefault()
							props.onSend()
						}
					}}
					data-sending-disabled={props.sendingDisabled}
				/>
			</div>
		)
	})

	return {
		default: ChatTextAreaComponent,
		ChatTextArea: ChatTextAreaComponent, // Export as named export too
	}
})

// Mock VSCode components
vi.mock("@vscode/webview-ui-toolkit/react", () => ({
	VSCodeButton: function MockVSCodeButton({
		children,
		onClick,
		appearance,
	}: {
		children: React.ReactNode
		onClick?: () => void
		appearance?: string
	}) {
		return (
			<button onClick={onClick} data-appearance={appearance}>
				{children}
			</button>
		)
	},
	VSCodeTextField: function MockVSCodeTextField({
		value,
		onInput,
		placeholder,
	}: {
		value?: string
		onInput?: (e: { target: { value: string } }) => void
		placeholder?: string
	}) {
		return (
			<input
				type="text"
				value={value}
				onChange={(e) => onInput?.({ target: { value: e.target.value } })}
				placeholder={placeholder}
			/>
		)
	},
	VSCodeLink: function MockVSCodeLink({ children, href }: { children: React.ReactNode; href?: string }) {
		return <a href={href}>{children}</a>
	},
}))

// Mock window.postMessage to trigger state hydration
const mockPostMessage = (state: Partial<ExtensionState>) => {
	window.postMessage(
		{
			type: "state",
			state: {
				version: "1.0.0",
				clineMessages: [],
				taskHistory: [],
				shouldShowAnnouncement: false,
				allowedCommands: [],
				alwaysAllowExecute: false,
				cloudIsAuthenticated: false,
				...state,
			},
		},
		"*",
	)
}

const defaultProps: ChatViewProps = {
	isHidden: false,
	showAnnouncement: false,
	hideAnnouncement: () => {},
}

const queryClient = new QueryClient()

const renderChatView = (props: Partial<ChatViewProps> = {}) => {
	return render(
		<ExtensionStateContextProvider>
			<QueryClientProvider client={queryClient}>
				<ChatView {...defaultProps} {...props} />
			</QueryClientProvider>
		</ExtensionStateContextProvider>,
	)
}

describe("ChatView - Sound Playing Tests", () => {
	beforeEach(() => vi.clearAllMocks())

	it("plays celebration sound for completion results", async () => {
		renderChatView()

		// First hydrate state with initial task
		mockPostMessage({
			soundEnabled: true, // Enable sound
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: Date.now() - 2000,
					text: "Initial task",
				},
			],
		})

		// Clear any initial calls
		mockPlayFunction.mockClear()

		// Add completion result
		mockPostMessage({
			soundEnabled: true, // Enable sound
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: Date.now() - 2000,
					text: "Initial task",
				},
				{
					type: "ask",
					ask: "completion_result",
					ts: Date.now(),
					text: "Task completed successfully",
					partial: false, // Ensure it's not partial
				},
			],
		})

		// Wait for sound to be played
		await waitFor(() => {
			expect(mockPlayFunction).toHaveBeenCalled()
		})
	})

	it("plays progress_loop sound for api failures", async () => {
		renderChatView()

		// First hydrate state with initial task
		mockPostMessage({
			soundEnabled: true, // Enable sound
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: Date.now() - 2000,
					text: "Initial task",
				},
			],
		})

		// Clear any initial calls
		mockPlayFunction.mockClear()

		// Add API failure
		mockPostMessage({
			soundEnabled: true, // Enable sound
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: Date.now() - 2000,
					text: "Initial task",
				},
				{
					type: "ask",
					ask: "api_req_failed",
					ts: Date.now(),
					text: "API request failed",
					partial: false, // Ensure it's not partial
				},
			],
		})

		// Wait for sound to be played
		await waitFor(() => {
			expect(mockPlayFunction).toHaveBeenCalled()
		})
	})

	it("does not play sound when resuming a task from history", () => {
		renderChatView()

		// Clear any initial calls
		mockPlayFunction.mockClear()

		// Hydrate state with a task that has a resumeTaskId (indicating it's resumed from history)
		mockPostMessage({
			resumeTaskId: "task-123",
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: Date.now() - 2000,
					text: "Resumed task",
				},
				{
					type: "ask",
					ask: "tool",
					ts: Date.now(),
					text: JSON.stringify({ tool: "readFile", path: "test.txt" }),
				},
			],
		})

		// Should not play sound when resuming from history
		expect(mockPlayFunction).not.toHaveBeenCalled()
	})

	it("does not play sound when resuming a completed task from history", () => {
		renderChatView()

		// Clear any initial calls
		mockPlayFunction.mockClear()

		// Hydrate state with a completed task that has a resumeTaskId
		mockPostMessage({
			resumeTaskId: "task-123",
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: Date.now() - 2000,
					text: "Resumed task",
				},
				{
					type: "ask",
					ask: "completion_result",
					ts: Date.now(),
					text: "Task completed",
				},
			],
		})

		// Should not play sound for completion when resuming from history
		expect(mockPlayFunction).not.toHaveBeenCalled()
	})
})

describe("ChatView - Focus Grabbing Tests", () => {
	beforeEach(() => vi.clearAllMocks())

	it("does not grab focus when follow-up question presented", async () => {
		const { getByTestId } = renderChatView()

		// First hydrate state with initial task
		mockPostMessage({
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: Date.now() - 2000,
					text: "Initial task",
				},
			],
		})

		// Wait for the component to fully render and settle before clearing mocks
		await waitFor(() => {
			expect(getByTestId("chat-textarea")).toBeInTheDocument()
		})

		// Wait for the debounced focus effect to fire (50ms debounce + buffer for CI variability)
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 100))
		})

		// Clear any initial calls after state has settled
		mockFocus.mockClear()

		// Add follow-up question
		mockPostMessage({
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: Date.now() - 2000,
					text: "Initial task",
				},
				{
					type: "ask",
					ask: "followup",
					ts: Date.now(),
					text: "Should I continue?",
				},
			],
		})

		// Wait for state update to complete
		await waitFor(() => {
			expect(getByTestId("chat-textarea")).toBeInTheDocument()
		})

		// Should not grab focus for follow-up questions
		expect(mockFocus).not.toHaveBeenCalled()
	})
})

describe("ChatView - Version Indicator Tests", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		// Reset the mock to return null by default
		mockVersionIndicator.mockReturnValue(null)
	})

	it("displays version indicator button", () => {
		// Mock VersionIndicator to return a button
		mockVersionIndicator.mockReturnValue(
			React.createElement("button", {
				"data-testid": "version-indicator",
				"aria-label": "Version 1.0.0",
				className: "version-indicator-button",
			}),
		)

		const { getByTestId } = renderChatView()

		// Hydrate state with no active task
		mockPostMessage({
			version: "1.0.0",
			clineMessages: [],
		})

		// Should display version indicator
		expect(getByTestId("version-indicator")).toBeInTheDocument()
	})

	it("opens announcement modal when version indicator is clicked", async () => {
		// Mock VersionIndicator to return a button with onClick
		mockVersionIndicator.mockImplementation(({ onClick }: { onClick?: () => void }) =>
			React.createElement("button", {
				"data-testid": "version-indicator",
				onClick,
			}),
		)

		const { getByTestId, queryByTestId } = renderChatView({ showAnnouncement: false })

		// Hydrate state
		mockPostMessage({
			version: "1.0.0",
			clineMessages: [],
		})

		// Wait for component to render
		await waitFor(() => {
			expect(getByTestId("version-indicator")).toBeInTheDocument()
		})

		// Click version indicator
		const versionIndicator = getByTestId("version-indicator")
		act(() => {
			versionIndicator.click()
		})

		// Wait for announcement modal to appear
		await waitFor(() => {
			expect(queryByTestId("announcement-modal")).toBeInTheDocument()
		})
	})

	it("version indicator has correct styling classes", () => {
		// Mock VersionIndicator to return a button with specific classes
		mockVersionIndicator.mockReturnValue(
			React.createElement("button", {
				"data-testid": "version-indicator",
				className: "version-indicator-button absolute top-2 right-2",
			}),
		)

		const { getByTestId } = renderChatView()

		// Hydrate state
		mockPostMessage({
			version: "1.0.0",
			clineMessages: [],
		})

		const versionIndicator = getByTestId("version-indicator")
		expect(versionIndicator.className).toContain("version-indicator-button")
		expect(versionIndicator.className).toContain("absolute")
		expect(versionIndicator.className).toContain("top-2")
		expect(versionIndicator.className).toContain("right-2")
	})

	it("version indicator has proper accessibility attributes", () => {
		// Mock VersionIndicator to return a button with aria-label
		mockVersionIndicator.mockReturnValue(
			React.createElement("button", {
				"data-testid": "version-indicator",
				"aria-label": "Version 1.0.0",
				role: "button",
			}),
		)

		const { getByTestId } = renderChatView()

		// Hydrate state
		mockPostMessage({
			version: "1.0.0",
			clineMessages: [],
		})

		const versionIndicator = getByTestId("version-indicator")
		expect(versionIndicator.getAttribute("aria-label")).toBe("Version 1.0.0")
		expect(versionIndicator.getAttribute("role")).toBe("button")
	})

	it("does not display version indicator when there is an active task", () => {
		// Mock VersionIndicator to return null (simulating hidden state)
		mockVersionIndicator.mockReturnValue(null)

		const { queryByTestId } = renderChatView()

		// Hydrate state with active task
		mockPostMessage({
			version: "1.0.0",
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: Date.now(),
					text: "Active task",
				},
			],
		})

		// Should not display version indicator during active task
		expect(queryByTestId("version-indicator")).not.toBeInTheDocument()
	})

	it("displays version indicator only on welcome screen (no task)", () => {
		// Mock VersionIndicator to return a button
		mockVersionIndicator.mockReturnValue(React.createElement("button", { "data-testid": "version-indicator" }))

		const { queryByTestId } = renderChatView()

		// Hydrate state with no active task
		mockPostMessage({
			version: "1.0.0",
			clineMessages: [],
		})

		// Should display version indicator on welcome screen
		expect(queryByTestId("version-indicator")).toBeInTheDocument()
	})
})

describe("ChatView - Welcome Content Display Tests", () => {
	beforeEach(() => vi.clearAllMocks())

	it("does not show removed cloud upsell for returning users", () => {
		const { queryByTestId } = renderChatView()

		mockPostMessage({
			taskHistory: [
				{ id: "1", ts: Date.now() - 3000 },
				{ id: "2", ts: Date.now() - 2000 },
				{ id: "3", ts: Date.now() - 1000 },
				{ id: "4", ts: Date.now() },
			],
			clineMessages: [], // No active task
		})

		expect(queryByTestId("dismissible-upsell")).not.toBeInTheDocument()
	})

	it("shows AicoTips when user has only run 3 tasks in their history", () => {
		const { queryByTestId } = renderChatView()

		mockPostMessage({
			taskHistory: [
				{ id: "1", ts: Date.now() - 2000 },
				{ id: "2", ts: Date.now() - 1000 },
				{ id: "3", ts: Date.now() },
			],
			clineMessages: [], // No active task
		})

		expect(queryByTestId("dismissible-upsell")).not.toBeInTheDocument()
		expect(queryByTestId("aico-tips")).toBeInTheDocument()
	})

	it("does not show removed cloud upsell when user has run 6 or more tasks", async () => {
		const { queryByTestId } = renderChatView()

		mockPostMessage({
			taskHistory: [
				{ id: "1", ts: Date.now() - 6000 },
				{ id: "2", ts: Date.now() - 5000 },
				{ id: "3", ts: Date.now() - 4000 },
				{ id: "4", ts: Date.now() - 3000 },
				{ id: "5", ts: Date.now() - 2000 },
				{ id: "6", ts: Date.now() - 1000 },
				{ id: "7", ts: Date.now() },
			],
			clineMessages: [], // No active task
		})

		await waitFor(() => {
			expect(queryByTestId("dismissible-upsell")).not.toBeInTheDocument()
			expect(queryByTestId("aico-tips")).not.toBeInTheDocument()
			expect(queryByTestId("aico-hero")).toBeInTheDocument()
		})
	})

	it("does not show welcome content when there is an active task", async () => {
		const { queryByTestId } = renderChatView()

		mockPostMessage({
			taskHistory: [
				{ id: "1", ts: Date.now() - 3000 },
				{ id: "2", ts: Date.now() - 2000 },
				{ id: "3", ts: Date.now() - 1000 },
				{ id: "4", ts: Date.now() },
			],
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: Date.now(),
					text: "Active task",
				},
			],
		})

		await waitFor(() => {
			expect(queryByTestId("dismissible-upsell")).not.toBeInTheDocument()
			expect(queryByTestId("aico-tips")).not.toBeInTheDocument()
			expect(queryByTestId("aico-hero")).not.toBeInTheDocument()
		})
	})

	it("shows AicoTips for newer users", () => {
		const { queryByTestId, getByTestId } = renderChatView()

		mockPostMessage({
			taskHistory: [
				{ id: "1", ts: Date.now() - 3000 },
				{ id: "2", ts: Date.now() - 2000 },
				{ id: "3", ts: Date.now() - 1000 },
				{ id: "4", ts: Date.now() },
			],
			clineMessages: [], // No active task
		})

		expect(queryByTestId("dismissible-upsell")).not.toBeInTheDocument()
		expect(getByTestId("aico-tips")).toBeInTheDocument()
	})

	it("shows AicoTips when user has fewer than 6 tasks", () => {
		const { queryByTestId, getByTestId } = renderChatView()

		mockPostMessage({
			taskHistory: [
				{ id: "1", ts: Date.now() - 2000 },
				{ id: "2", ts: Date.now() - 1000 },
				{ id: "3", ts: Date.now() },
			],
			clineMessages: [], // No active task
		})

		expect(queryByTestId("dismissible-upsell")).not.toBeInTheDocument()
		expect(getByTestId("aico-tips")).toBeInTheDocument()
	})
})

describe("ChatView - Message Queueing Tests", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		// Reset the mock to clear any initial calls
		vi.mocked(vscode.postMessage).mockClear()
	})

	it("shows sending is disabled when task is active", async () => {
		const { getByTestId } = renderChatView()

		// Hydrate state with active task that should disable sending
		mockPostMessage({
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: Date.now() - 1000,
					text: "Task in progress",
				},
				{
					type: "ask",
					ask: "tool",
					ts: Date.now(),
					text: JSON.stringify({ tool: "readFile", path: "test.txt" }),
					partial: true, // Partial messages disable sending
				},
			],
		})

		// Wait for state to be updated and check that sending is disabled
		await waitFor(() => {
			const chatTextArea = getByTestId("chat-textarea")
			const input = chatTextArea.querySelector("input")!
			expect(input.getAttribute("data-sending-disabled")).toBe("true")
		})
	})

	it("shows sending is enabled when no task is active", async () => {
		const { getByTestId } = renderChatView()

		// Hydrate state with completed task
		mockPostMessage({
			clineMessages: [
				{
					type: "ask",
					ask: "completion_result",
					ts: Date.now(),
					text: "Task completed",
					partial: false,
				},
			],
		})

		// Wait for state to be updated
		await waitFor(() => {
			expect(getByTestId("chat-textarea")).toBeInTheDocument()
		})

		// Check that sending is enabled
		const chatTextArea = getByTestId("chat-textarea")
		const input = chatTextArea.querySelector("input")!
		expect(input.getAttribute("data-sending-disabled")).toBe("false")
	})

	it("queues messages when API request is in progress (spinner visible)", async () => {
		const { getByTestId } = renderChatView()

		// First hydrate state with initial task
		mockPostMessage({
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: Date.now() - 2000,
					text: "Initial task",
				},
			],
		})

		// Clear any initial calls
		vi.mocked(vscode.postMessage).mockClear()

		// Add api_req_started without cost (spinner state - API request in progress)
		mockPostMessage({
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: Date.now() - 2000,
					text: "Initial task",
				},
				{
					type: "say",
					say: "api_req_started",
					ts: Date.now(),
					text: JSON.stringify({ apiProtocol: "anthropic" }), // No cost = still streaming
				},
			],
		})

		// Wait for state to be updated
		await waitFor(() => {
			expect(getByTestId("chat-textarea")).toBeInTheDocument()
		})

		// Clear message calls before simulating user input
		vi.mocked(vscode.postMessage).mockClear()

		// Simulate user typing and sending a message during the spinner
		const chatTextArea = getByTestId("chat-textarea")
		const input = chatTextArea.querySelector("input")! as HTMLInputElement

		// Trigger message send by simulating typing and Enter key press
		await act(async () => {
			// Use fireEvent to properly trigger React's onChange handler
			fireEvent.change(input, { target: { value: "follow-up question during spinner" } })

			// Simulate pressing Enter to send
			fireEvent.keyDown(input, { key: "Enter", code: "Enter" })
		})

		// Verify that the message was queued, not sent as askResponse
		await waitFor(() => {
			expect(vscode.postMessage).toHaveBeenCalledWith({
				type: "queueMessage",
				text: "follow-up question during spinner",
				images: [],
			})
		})

		// Verify it was NOT sent as a direct askResponse (which would get lost)
		expect(vscode.postMessage).not.toHaveBeenCalledWith(
			expect.objectContaining({
				type: "askResponse",
				askResponse: "messageResponse",
			}),
		)
	})

	it("sends messages normally when API request is complete (cost present)", async () => {
		const { getByTestId } = renderChatView()

		// Hydrate state with completed API request (cost present)
		mockPostMessage({
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: Date.now() - 2000,
					text: "Initial task",
				},
				{
					type: "say",
					say: "api_req_started",
					ts: Date.now(),
					text: JSON.stringify({
						apiProtocol: "anthropic",
						cost: 0.05, // Cost present = streaming complete
						tokensIn: 100,
						tokensOut: 50,
					}),
				},
				{
					type: "say",
					say: "text",
					ts: Date.now(),
					text: "Response from API",
				},
			],
		})

		// Wait for state to be updated
		await waitFor(() => {
			expect(getByTestId("chat-textarea")).toBeInTheDocument()
		})

		// Clear message calls before simulating user input
		vi.mocked(vscode.postMessage).mockClear()

		// Simulate user sending a message when API is done
		const chatTextArea = getByTestId("chat-textarea")
		const input = chatTextArea.querySelector("input")! as HTMLInputElement

		await act(async () => {
			// Use fireEvent to properly trigger React's onChange handler
			fireEvent.change(input, { target: { value: "follow-up after completion" } })

			// Simulate pressing Enter to send
			fireEvent.keyDown(input, { key: "Enter", code: "Enter" })
		})

		// Verify that the message was sent as askResponse, not queued
		await waitFor(() => {
			expect(vscode.postMessage).toHaveBeenCalledWith({
				type: "askResponse",
				askResponse: "messageResponse",
				text: "follow-up after completion",
				images: [],
			})
		})

		// Verify it was NOT queued
		expect(vscode.postMessage).not.toHaveBeenCalledWith(
			expect.objectContaining({
				type: "queueMessage",
			}),
		)
	})

	it("preserves message order when messages sent during queue drain", async () => {
		const { getByTestId } = renderChatView()

		// Hydrate state with API request in progress and existing queue
		mockPostMessage({
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: Date.now() - 2000,
					text: "Initial task",
				},
				{
					type: "say",
					say: "api_req_started",
					ts: Date.now(),
					text: JSON.stringify({ apiProtocol: "anthropic" }), // No cost = still streaming
				},
			],
			messageQueue: [
				{ id: "msg1", text: "queued message 1", images: [] },
				{ id: "msg2", text: "queued message 2", images: [] },
			],
		})

		// Wait for state to be updated
		await waitFor(() => {
			expect(getByTestId("chat-textarea")).toBeInTheDocument()
		})

		// Clear message calls before simulating user input
		vi.mocked(vscode.postMessage).mockClear()

		// Simulate user sending a new message while queue has items
		const chatTextArea = getByTestId("chat-textarea")
		const input = chatTextArea.querySelector("input")! as HTMLInputElement

		await act(async () => {
			fireEvent.change(input, { target: { value: "message during queue drain" } })
			fireEvent.keyDown(input, { key: "Enter", code: "Enter" })
		})

		// Verify that the new message was queued (not sent directly) to preserve order
		await waitFor(() => {
			expect(vscode.postMessage).toHaveBeenCalledWith({
				type: "queueMessage",
				text: "message during queue drain",
				images: [],
			})
		})

		// Verify it was NOT sent as askResponse (which would break ordering)
		expect(vscode.postMessage).not.toHaveBeenCalledWith(
			expect.objectContaining({
				type: "askResponse",
				askResponse: "messageResponse",
			}),
		)
	})

	it("queues messages during command_output state instead of losing them", async () => {
		const { getByTestId } = renderChatView()

		// Hydrate state with command_output ask (Proceed While Running state)
		mockPostMessage({
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: Date.now() - 2000,
					text: "Initial task",
				},
				{
					type: "ask",
					ask: "command_output",
					ts: Date.now(),
					text: "",
					partial: false, // Non-partial so buttons are enabled
				},
			],
		})

		// Wait for state to be updated - need to allow time for React effects to propagate
		// (clineAsk state update -> clineAskRef.current update)
		await waitFor(() => {
			expect(getByTestId("chat-textarea")).toBeInTheDocument()
		})

		// Allow React effects to complete (clineAsk -> clineAskRef sync)
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 50))
		})

		// Clear message calls before simulating user input
		vi.mocked(vscode.postMessage).mockClear()

		// Simulate user typing and sending a message during command execution
		const chatTextArea = getByTestId("chat-textarea")
		const input = chatTextArea.querySelector("input")! as HTMLInputElement

		await act(async () => {
			fireEvent.change(input, { target: { value: "message during command execution" } })
			fireEvent.keyDown(input, { key: "Enter", code: "Enter" })
		})

		// Verify that the message was queued (not lost via terminalOperation)
		await waitFor(() => {
			expect(vscode.postMessage).toHaveBeenCalledWith({
				type: "queueMessage",
				text: "message during command execution",
				images: [],
			})
		})

		// Verify it was NOT sent as terminalOperation (which would lose the message)
		expect(vscode.postMessage).not.toHaveBeenCalledWith(
			expect.objectContaining({
				type: "terminalOperation",
			}),
		)
	})
})

describe("ChatView - commandExecutionStatus executionId filtering", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("foreign started leaves three approval buttons; matching started hides them", async () => {
		// The command ask has ts=123, so pendingCommandExecutionId="123".
		// A commandExecutionStatus started with executionId="999" (foreign) must NOT hide
		// the approval buttons. A subsequent started with executionId="123" (matching) must
		// hide all three approval buttons (Run, Run-and-Allow, Reject).
		const { container } = renderChatView()

		// Hydrate with a command ask at ts=123
		mockPostMessage({
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: 1,
					text: "Initial task",
				},
				{
					type: "ask",
					ask: "command",
					ts: 123,
					text: "ls -la",
					partial: false,
				},
			],
		})

		// Wait for approval buttons to appear
		await waitFor(() => {
			const btns = Array.from(container.querySelectorAll("button")).map((b) => b.textContent?.trim())
			expect(btns).toContain("chat:runCommand.title")
			expect(btns).toContain("chat:runCommandAndAllow.title")
			expect(btns).toContain("chat:reject.title")
		})

		// Allow useEvent hook to register and effects to settle
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 20))
		})

		// Fire commandExecutionStatus with WRONG executionId (999 != 123) — buttons must stay
		await act(async () => {
			window.dispatchEvent(
				new MessageEvent("message", {
					data: {
						type: "commandExecutionStatus",
						text: JSON.stringify({ status: "started", executionId: "999" }),
					},
				}),
			)
			await new Promise((resolve) => setTimeout(resolve, 0))
		})

		// Buttons still present after foreign executionId
		await waitFor(() => {
			const btns = Array.from(container.querySelectorAll("button")).map((b) => b.textContent?.trim())
			expect(btns).toContain("chat:runCommand.title")
			expect(btns).toContain("chat:runCommandAndAllow.title")
			expect(btns).toContain("chat:reject.title")
		})

		// Fire commandExecutionStatus with CORRECT executionId (123) — buttons must disappear
		await act(async () => {
			window.dispatchEvent(
				new MessageEvent("message", {
					data: {
						type: "commandExecutionStatus",
						text: JSON.stringify({ status: "started", executionId: "123" }),
					},
				}),
			)
			await new Promise((resolve) => setTimeout(resolve, 0))
		})

		// All three approval buttons must be gone after matching started
		await waitFor(() => {
			const btns = Array.from(container.querySelectorAll("button")).map((b) => b.textContent?.trim())
			expect(btns).not.toContain("chat:runCommand.title")
			expect(btns).not.toContain("chat:runCommandAndAllow.title")
			expect(btns).not.toContain("chat:reject.title")
		})
	})

	it.each([{ statusKind: "started" as const }, { statusKind: "exited" as const }])(
		"Run-and-Allow → status($statusKind) → replay same command ts with changed secondLastMessage → buttons do not return and invoke primaryButtonClick sends no askResponse; new command ts shows buttons",
		async ({ statusKind }) => {
			// Scenario:
			//   1. Hydrate command ask ts=500 → buttons appear.
			//   2. Click "Run and Allow" → buttons hidden.
			//   3. commandExecutionStatus started/exited with matching executionId="500" arrives
			//      → commandExecutionStarted=true, lastStartedCommandRef set.
			//   4. Re-hydrate state with SAME command ts=500 but changed secondLastMessage
			//      → useDeepCompareEffect fires → lastStartedCommandRef guard skips UI restore
			//      → buttons stay hidden.
			//   5. invoke primaryButtonClick → no askResponse sent (clineAsk was cleared by status).
			//   6. Hydrate NEW command ts=600 → buttons appear again.

			const { container } = renderChatView()

			const TASK_ID = "task-status-guard"
			const INSTANCE_ID = "inst-status-guard"
			const CMD_TS = 500
			const CMD_TEXT = "echo hello"

			// Step 1: hydrate command ask
			mockPostMessage({
				currentTaskId: TASK_ID,
				currentTaskInstanceId: INSTANCE_ID,
				clineMessages: [
					{ type: "say", say: "task", ts: 1, text: "task" },
					{ type: "say", say: "text", ts: 2, text: "ctx-v1" },
					{ type: "ask", ask: "command", ts: CMD_TS, text: CMD_TEXT },
				],
			})

			// Wait for buttons
			await waitFor(() => {
				const btns = Array.from(container.querySelectorAll("button")).map((b) => b.textContent?.trim())
				expect(btns).toContain("chat:runCommandAndAllow.title")
			})

			await act(async () => {
				await new Promise((resolve) => setTimeout(resolve, 10))
			})

			// Step 2: click "Run and Allow"
			const runAndAllowBtn = Array.from(container.querySelectorAll("button")).find(
				(b) => b.textContent?.trim() === "chat:runCommandAndAllow.title",
			)!
			await act(async () => {
				fireEvent.click(runAndAllowBtn)
			})

			// Buttons gone after click
			await waitFor(() => {
				const btns = Array.from(container.querySelectorAll("button")).map((b) => b.textContent?.trim())
				expect(btns).not.toContain("chat:runCommandAndAllow.title")
			})

			// Step 3: commandExecutionStatus matching → hide buttons and set lastStartedCommandRef
			await act(async () => {
				window.dispatchEvent(
					new MessageEvent("message", {
						data: {
							type: "commandExecutionStatus",
							text: JSON.stringify({ status: statusKind, executionId: String(CMD_TS) }),
						},
					}),
				)
				await new Promise((resolve) => setTimeout(resolve, 0))
			})

			// Step 4: re-hydrate with SAME command ts but changed secondLastMessage
			vi.mocked(vscode.postMessage).mockClear()
			mockPostMessage({
				currentTaskId: TASK_ID,
				currentTaskInstanceId: INSTANCE_ID,
				clineMessages: [
					{ type: "say", say: "task", ts: 1, text: "task" },
					{ type: "say", say: "text", ts: 2, text: "ctx-v2-changed" },
					{ type: "ask", ask: "command", ts: CMD_TS, text: CMD_TEXT },
				],
			})
			await act(async () => {
				await new Promise((resolve) => setTimeout(resolve, 10))
			})

			// Approval buttons must still be absent (guard skipped restore)
			const btnsAfterReplay = Array.from(container.querySelectorAll("button")).map((b) => b.textContent?.trim())
			expect(btnsAfterReplay).not.toContain("chat:runCommand.title")
			expect(btnsAfterReplay).not.toContain("chat:runCommandAndAllow.title")
			expect(btnsAfterReplay).not.toContain("chat:reject.title")

			// Step 5: invoke primaryButtonClick → no askResponse (clineAsk was cleared)
			vi.mocked(vscode.postMessage).mockClear()
			await act(async () => {
				window.dispatchEvent(
					new MessageEvent("message", {
						data: { type: "invoke", invoke: "primaryButtonClick", text: "", images: [] },
					}),
				)
				await new Promise((resolve) => setTimeout(resolve, 0))
			})
			expect(
				vi.mocked(vscode.postMessage).mock.calls.find((c) => (c[0] as any)?.type === "askResponse"),
			).toBeFalsy()

			// Step 6: NEW command ts=600 must show buttons
			mockPostMessage({
				currentTaskId: TASK_ID,
				currentTaskInstanceId: INSTANCE_ID,
				clineMessages: [
					{ type: "say", say: "task", ts: 1, text: "task" },
					{ type: "say", say: "text", ts: 2, text: "ctx-v2-changed" },
					{ type: "ask", ask: "command", ts: 600, text: "new-cmd" },
				],
			})
			await waitFor(() => {
				const btns = Array.from(container.querySelectorAll("button")).map((b) => b.textContent?.trim())
				expect(btns).toContain("chat:runCommand.title")
				expect(btns).toContain("chat:runCommandAndAllow.title")
				expect(btns).toContain("chat:reject.title")
			})
		},
	)
})

describe("ChatView - Context Condensing Indicator Tests", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("should add a condensing message to groupedMessages when isCondensing is true", async () => {
		// This test verifies that when the condenseTaskContextStarted message is received,
		// the isCondensing state is set to true and a synthetic condensing message is added
		// to the grouped messages list
		const { getByTestId, container } = renderChatView()

		// First hydrate state with an active task
		mockPostMessage({
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: Date.now() - 2000,
					text: "Initial task",
				},
				{
					type: "say",
					say: "api_req_started",
					ts: Date.now() - 1000,
					text: JSON.stringify({ apiProtocol: "anthropic" }),
				},
			],
		})

		// Wait for component to render
		await waitFor(() => {
			expect(getByTestId("chat-view")).toBeInTheDocument()
		})

		// Allow time for useEvent hook to register message listener
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 10))
		})

		// Dispatch a MessageEvent directly to trigger the message handler
		// This simulates the VSCode extension sending a message to the webview
		await act(async () => {
			const event = new MessageEvent("message", {
				data: {
					type: "condenseTaskContextStarted",
					text: "test-task-id",
				},
			})
			window.dispatchEvent(event)
			// Wait for React state updates
			await new Promise((resolve) => setTimeout(resolve, 0))
		})

		// Check that groupedMessages now includes a condensing message
		// With Virtuoso mocked, items render directly and we can find the ChatRow with partial condense_context message
		await waitFor(
			() => {
				const rows = container.querySelectorAll('[data-testid="chat-row"]')
				// Check for the actual message structure: partial condense_context message
				const condensingRow = Array.from(rows).find((row) => {
					const text = row.textContent || ""
					return text.includes('"say":"condense_context"') && text.includes('"partial":true')
				})
				expect(condensingRow).toBeTruthy()
			},
			{ timeout: 2000 },
		)
	})
})

describe("ChatView - commandApprovalError handling", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("ignores a commandApprovalError with a foreign requestId — does NOT restore buttons", async () => {
		const { container } = renderChatView()

		const TASK_ID = "task-foreign"
		const INSTANCE_ID = "inst-foreign"
		const CMD_TEXT = "ls -la"

		// Hydrate with an active task and a pending command ask
		mockPostMessage({
			currentTaskId: TASK_ID,
			currentTaskInstanceId: INSTANCE_ID,
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: 1,
					text: "test task",
				},
				{
					type: "ask",
					ask: "command",
					ts: 1000,
					text: CMD_TEXT,
				},
			],
		})

		await waitFor(() => {
			expect(container.querySelector('[data-testid="chat-view"]')).toBeInTheDocument()
		})

		// Allow useEvent listener to register
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 10))
		})

		// Click "Run and Allow" to start an attempt; this sets activeAttemptRef with a UUID
		const runAndAllowBtn = await waitFor(() => {
			const btn = Array.from(container.querySelectorAll("button")).find(
				(b) => b.textContent?.trim() === "chat:runCommandAndAllow.title",
			)
			expect(btn).toBeTruthy()
			return btn!
		})

		await act(async () => {
			fireEvent.click(runAndAllowBtn)
		})

		// After click, buttons disappear and sendingDisabled=true
		await waitFor(() => {
			const btn = Array.from(container.querySelectorAll("button")).find(
				(b) => b.textContent?.trim() === "chat:runCommandAndAllow.title",
			)
			expect(btn).toBeFalsy()
		})

		const textarea = container.querySelector('[data-testid="chat-textarea"] input')
		expect(textarea?.getAttribute("data-sending-disabled")).toBe("true")

		// Fire a commandApprovalError with a DIFFERENT requestId — must NOT restore buttons
		await act(async () => {
			const event = new MessageEvent("message", {
				data: {
					type: "commandApprovalError",
					taskId: TASK_ID,
					instanceId: INSTANCE_ID,
					requestId: "FOREIGN-UUID-THAT-DOES-NOT-MATCH",
					error: "save failed",
				},
			})
			window.dispatchEvent(event)
			await new Promise((resolve) => setTimeout(resolve, 0))
		})

		// Component still mounted
		expect(container.querySelector('[data-testid="chat-view"]')).toBeInTheDocument()

		// Buttons must still be absent (foreign error must not restore UI)
		const runAllowBtnAfter = Array.from(container.querySelectorAll("button")).find(
			(b) => b.textContent?.trim() === "chat:runCommandAndAllow.title",
		)
		expect(runAllowBtnAfter).toBeFalsy()

		// sendingDisabled still true
		expect(textarea?.getAttribute("data-sending-disabled")).toBe("true")
	})

	it("restores approval buttons and allows retry after commandApprovalError", async () => {
		const { container } = renderChatView()

		const TASK_ID = "task-retry"
		const INSTANCE_ID = "inst-retry"
		const CMD_TS = 5000
		const CMD_TEXT = "echo hello"

		// 1. Hydrate with active task + command ask
		mockPostMessage({
			currentTaskId: TASK_ID,
			currentTaskInstanceId: INSTANCE_ID,
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: 1,
					text: "test task",
				},
				{
					type: "ask",
					ask: "command",
					ts: CMD_TS,
					text: CMD_TEXT,
				},
			],
		})

		await waitFor(() => {
			expect(container.querySelector('[data-testid="chat-view"]')).toBeInTheDocument()
		})

		// Allow useEvent listener to register
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 10))
		})

		// 2. Find and click "Run and Allow" button
		const runAndAllowBtn = await waitFor(() => {
			const btn = Array.from(container.querySelectorAll("button")).find(
				(b) => b.textContent?.trim() === "chat:runCommandAndAllow.title",
			)
			expect(btn).toBeTruthy()
			return btn!
		})

		vi.mocked(vscode.postMessage).mockClear()

		await act(async () => {
			fireEvent.click(runAndAllowBtn)
		})

		// 3. Capture the requestId from the outgoing message (UUID generated per click)
		const firstCall = vi
			.mocked(vscode.postMessage)
			.mock.calls.find(
				(call) =>
					(call[0] as any)?.type === "askResponse" &&
					(call[0] as any)?.askResponse === "yesAndAllowButtonClicked",
			)
		expect(firstCall).toBeTruthy()
		const firstRequestId = (firstCall![0] as any).requestId as string
		expect(firstRequestId).toBeTruthy()
		expect(typeof firstRequestId).toBe("string")

		// Verify commandText and messageTs (= command ask ts) are preserved in outgoing message
		expect(firstCall![0]).toMatchObject({
			type: "askResponse",
			askResponse: "yesAndAllowButtonClicked",
			taskId: TASK_ID,
			instanceId: INSTANCE_ID,
			commandText: CMD_TEXT,
			requestId: firstRequestId,
			messageTs: CMD_TS,
		})

		// 4. After clicking, approval buttons should be gone
		await waitFor(() => {
			const btn = Array.from(container.querySelectorAll("button")).find(
				(b) => b.textContent?.trim() === "chat:runCommandAndAllow.title",
			)
			expect(btn).toBeFalsy()
		})

		const textarea = container.querySelector('[data-testid="chat-textarea"] input')
		expect(textarea?.getAttribute("data-sending-disabled")).toBe("true")

		// 5. Backend sends commandApprovalError with matching requestId → restore UI
		await act(async () => {
			const event = new MessageEvent("message", {
				data: {
					type: "commandApprovalError",
					taskId: TASK_ID,
					instanceId: INSTANCE_ID,
					requestId: firstRequestId,
					error: "save failed",
				},
			})
			window.dispatchEvent(event)
			await new Promise((resolve) => setTimeout(resolve, 0))
		})

		// 6. All three approval buttons must be enabled again
		await waitFor(() => {
			const runBtn = Array.from(container.querySelectorAll("button")).find(
				(b) => b.textContent?.trim() === "chat:runCommand.title",
			)
			const runAllowBtn = Array.from(container.querySelectorAll("button")).find(
				(b) => b.textContent?.trim() === "chat:runCommandAndAllow.title",
			)
			const rejectBtn = Array.from(container.querySelectorAll("button")).find(
				(b) => b.textContent?.trim() === "chat:reject.title",
			)
			expect(runBtn).toBeTruthy()
			expect(runAllowBtn).toBeTruthy()
			expect(rejectBtn).toBeTruthy()
			expect(runBtn?.hasAttribute("disabled")).toBe(false)
			expect(runAllowBtn?.hasAttribute("disabled")).toBe(false)
			expect(rejectBtn?.hasAttribute("disabled")).toBe(false)
		})

		// sendingDisabled should be restored to false
		expect(textarea?.getAttribute("data-sending-disabled")).toBe("false")

		// 7. Click "Run and Allow" again — must send NEW requestId (UUID is regenerated per click)
		//    and same commandText (restored from snapshot)
		const runAndAllowBtn2 = Array.from(container.querySelectorAll("button")).find(
			(b) => b.textContent?.trim() === "chat:runCommandAndAllow.title",
		)!

		vi.mocked(vscode.postMessage).mockClear()

		await act(async () => {
			fireEvent.click(runAndAllowBtn2)
		})

		const secondCall = vi
			.mocked(vscode.postMessage)
			.mock.calls.find(
				(call) =>
					(call[0] as any)?.type === "askResponse" &&
					(call[0] as any)?.askResponse === "yesAndAllowButtonClicked",
			)
		expect(secondCall).toBeTruthy()
		const secondRequestId = (secondCall![0] as any).requestId as string

		// New requestId must be different (UUID regenerated per click)
		expect(secondRequestId).toBeTruthy()
		expect(secondRequestId).not.toBe(firstRequestId)

		// commandText and messageTs preserved from snapshot; requestId must differ between attempts
		expect(secondCall![0]).toMatchObject({
			type: "askResponse",
			askResponse: "yesAndAllowButtonClicked",
			taskId: TASK_ID,
			instanceId: INSTANCE_ID,
			commandText: CMD_TEXT,
			requestId: secondRequestId,
			messageTs: CMD_TS,
		})

		// requestId must differ between the two clicks (UUID regenerated per attempt)
		expect(firstRequestId).not.toBe(secondRequestId)
	})

	it("second attempt's error restores UI; replayed first error does not", async () => {
		const { container } = renderChatView()

		const TASK_ID = "task-double"
		const INSTANCE_ID = "inst-double"
		const CMD_TEXT = "npm test"

		// Hydrate with active task + command ask
		mockPostMessage({
			currentTaskId: TASK_ID,
			currentTaskInstanceId: INSTANCE_ID,
			clineMessages: [
				{ type: "say", say: "task", ts: 1, text: "test task" },
				{ type: "ask", ask: "command", ts: 9000, text: CMD_TEXT },
			],
		})

		await waitFor(() => {
			expect(container.querySelector('[data-testid="chat-view"]')).toBeInTheDocument()
		})
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 10))
		})

		// === ATTEMPT 1 ===
		const btn1 = await waitFor(() => {
			const b = Array.from(container.querySelectorAll("button")).find(
				(b) => b.textContent?.trim() === "chat:runCommandAndAllow.title",
			)
			expect(b).toBeTruthy()
			return b!
		})

		vi.mocked(vscode.postMessage).mockClear()
		await act(async () => {
			fireEvent.click(btn1)
		})

		// Capture first requestId
		const firstMsg = vi
			.mocked(vscode.postMessage)
			.mock.calls.find((c) => (c[0] as any)?.askResponse === "yesAndAllowButtonClicked")
		const requestId1 = (firstMsg![0] as any).requestId as string
		expect(requestId1).toBeTruthy()

		// Buttons gone
		await waitFor(() => {
			expect(
				Array.from(container.querySelectorAll("button")).find(
					(b) => b.textContent?.trim() === "chat:runCommandAndAllow.title",
				),
			).toBeFalsy()
		})

		// Error 1 arrives → restore UI (ref is consumed)
		await act(async () => {
			window.dispatchEvent(
				new MessageEvent("message", {
					data: {
						type: "commandApprovalError",
						taskId: TASK_ID,
						instanceId: INSTANCE_ID,
						requestId: requestId1,
						error: "err1",
					},
				}),
			)
			await new Promise((r) => setTimeout(r, 0))
		})

		await waitFor(() => {
			expect(
				Array.from(container.querySelectorAll("button")).find(
					(b) => b.textContent?.trim() === "chat:runCommandAndAllow.title",
				),
			).toBeTruthy()
		})

		// === ATTEMPT 2 ===
		const btn2 = Array.from(container.querySelectorAll("button")).find(
			(b) => b.textContent?.trim() === "chat:runCommandAndAllow.title",
		)!

		vi.mocked(vscode.postMessage).mockClear()
		await act(async () => {
			fireEvent.click(btn2)
		})

		const secondMsg = vi
			.mocked(vscode.postMessage)
			.mock.calls.find((c) => (c[0] as any)?.askResponse === "yesAndAllowButtonClicked")
		const requestId2 = (secondMsg![0] as any).requestId as string
		expect(requestId2).toBeTruthy()
		expect(requestId2).not.toBe(requestId1)

		// Buttons gone again
		await waitFor(() => {
			expect(
				Array.from(container.querySelectorAll("button")).find(
					(b) => b.textContent?.trim() === "chat:runCommandAndAllow.title",
				),
			).toBeFalsy()
		})

		const textarea = container.querySelector('[data-testid="chat-textarea"] input')

		// Replay first error → must NOT restore buttons (ref was already consumed/replaced)
		await act(async () => {
			window.dispatchEvent(
				new MessageEvent("message", {
					data: {
						type: "commandApprovalError",
						taskId: TASK_ID,
						instanceId: INSTANCE_ID,
						requestId: requestId1,
						error: "err1-replay",
					},
				}),
			)
			await new Promise((r) => setTimeout(r, 0))
		})

		// Buttons must still be absent after stale error
		await waitFor(() => {
			const btn = Array.from(container.querySelectorAll("button")).find(
				(b) => b.textContent?.trim() === "chat:runCommandAndAllow.title",
			)
			expect(btn).toBeFalsy()
		})
		expect(textarea?.getAttribute("data-sending-disabled")).toBe("true")

		// Error 2 arrives with correct second requestId → restore UI
		await act(async () => {
			window.dispatchEvent(
				new MessageEvent("message", {
					data: {
						type: "commandApprovalError",
						taskId: TASK_ID,
						instanceId: INSTANCE_ID,
						requestId: requestId2,
						error: "err2",
					},
				}),
			)
			await new Promise((r) => setTimeout(r, 0))
		})

		await waitFor(() => {
			expect(
				Array.from(container.querySelectorAll("button")).find(
					(b) => b.textContent?.trim() === "chat:runCommandAndAllow.title",
				),
			).toBeTruthy()
		})
		expect(textarea?.getAttribute("data-sending-disabled")).toBe("false")
	})
})

describe("ChatView - commandApprovalError cross-task and same-task followup isolation", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("error from task A does NOT restore command buttons after switching to task B with followup", async () => {
		// Scenario:
		//   1. Task A has a command ask; user clicks "Run and Allow" → snapshot stored with taskId=A
		//   2. Extension switches to task B (new taskId/instanceId) with a followup ask
		//   3. A late commandApprovalError arrives with taskId=A and the matching requestId
		// Expected: buttons for task B must NOT be restored (no command buttons appear)

		const { container } = renderChatView()

		const TASK_A_ID = "task-A-cross"
		const TASK_A_INST = "inst-A-cross"
		const CMD_TEXT_A = "make build"

		// Step 1: Hydrate task A with command ask
		mockPostMessage({
			currentTaskId: TASK_A_ID,
			currentTaskInstanceId: TASK_A_INST,
			clineMessages: [
				{ type: "say", say: "task", ts: 1, text: "task A" },
				{ type: "ask", ask: "command", ts: 2000, text: CMD_TEXT_A },
			],
		})

		await waitFor(() => {
			expect(container.querySelector('[data-testid="chat-view"]')).toBeInTheDocument()
		})

		// Allow useEvent listener to register
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 10))
		})

		// Step 2: Click "Run and Allow" in task A
		const runAndAllowBtnA = await waitFor(() => {
			const btn = Array.from(container.querySelectorAll("button")).find(
				(b) => b.textContent?.trim() === "chat:runCommandAndAllow.title",
			)
			expect(btn).toBeTruthy()
			return btn!
		})

		vi.mocked(vscode.postMessage).mockClear()

		await act(async () => {
			fireEvent.click(runAndAllowBtnA)
		})

		// Capture requestId from outgoing message
		const callA = vi
			.mocked(vscode.postMessage)
			.mock.calls.find((c) => (c[0] as any)?.askResponse === "yesAndAllowButtonClicked")
		expect(callA).toBeTruthy()
		const requestIdA = (callA![0] as any).requestId as string
		expect(requestIdA).toBeTruthy()

		// Buttons are gone after click
		await waitFor(() => {
			expect(
				Array.from(container.querySelectorAll("button")).find(
					(b) => b.textContent?.trim() === "chat:runCommandAndAllow.title",
				),
			).toBeFalsy()
		})

		// Step 3: Switch to task B — different taskId and instanceId — with a followup ask
		mockPostMessage({
			currentTaskId: "task-B-cross",
			currentTaskInstanceId: "inst-B-cross",
			clineMessages: [
				{ type: "say", say: "task", ts: 100, text: "task B" },
				{ type: "ask", ask: "followup", ts: 101, text: "Shall I proceed?" },
			],
		})

		await waitFor(() => {
			// Task B has no command buttons — verify chat-view is still mounted
			expect(container.querySelector('[data-testid="chat-view"]')).toBeInTheDocument()
		})

		// Allow effects to process (task identity change → activeAttemptRef cleared)
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 20))
		})

		// Step 4: Late commandApprovalError from task A arrives with matching requestId
		await act(async () => {
			window.dispatchEvent(
				new MessageEvent("message", {
					data: {
						type: "commandApprovalError",
						taskId: TASK_A_ID,
						instanceId: TASK_A_INST,
						requestId: requestIdA,
						error: "save failed - late delivery",
					},
				}),
			)
			await new Promise((resolve) => setTimeout(resolve, 0))
		})

		// Must NOT restore command buttons in task B
		const runAllowAfter = Array.from(container.querySelectorAll("button")).find(
			(b) => b.textContent?.trim() === "chat:runCommandAndAllow.title",
		)
		expect(runAllowAfter).toBeFalsy()

		const runAfter = Array.from(container.querySelectorAll("button")).find(
			(b) => b.textContent?.trim() === "chat:runCommand.title",
		)
		expect(runAfter).toBeFalsy()

		// sendingDisabled must NOT be reset to false by the stale error
		// In task B with a followup ask, sendingDisabled = false (followup enables input).
		// The key assertion: no command approval buttons appeared. This proves the stale
		// error did not call the restore path (setClineAsk("command") etc.).
		expect(container.querySelector('[data-testid="chat-view"]')).toBeInTheDocument()
	})

	it("new followup in SAME task/instance invalidates old command snapshot; stale error does not restore buttons", async () => {
		// Scenario:
		//   1. Task X has a command ask; user clicks "Run and Allow" → snapshot stored
		//   2. SAME task gets a new followup ask (not a command) → snapshot must be cleared
		//   3. A late commandApprovalError with the original requestId arrives
		// Expected: no command buttons appear; input state unchanged

		const { container } = renderChatView()

		const TASK_X_ID = "task-X-same"
		const TASK_X_INST = "inst-X-same"
		const CMD_TEXT_X = "npm run lint"

		// Step 1: Hydrate task X with command ask
		mockPostMessage({
			currentTaskId: TASK_X_ID,
			currentTaskInstanceId: TASK_X_INST,
			clineMessages: [
				{ type: "say", say: "task", ts: 1, text: "task X" },
				{ type: "ask", ask: "command", ts: 3000, text: CMD_TEXT_X },
			],
		})

		await waitFor(() => {
			expect(container.querySelector('[data-testid="chat-view"]')).toBeInTheDocument()
		})

		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 10))
		})

		// Step 2: Click "Run and Allow" in task X
		const runAndAllowBtnX = await waitFor(() => {
			const btn = Array.from(container.querySelectorAll("button")).find(
				(b) => b.textContent?.trim() === "chat:runCommandAndAllow.title",
			)
			expect(btn).toBeTruthy()
			return btn!
		})

		vi.mocked(vscode.postMessage).mockClear()

		await act(async () => {
			fireEvent.click(runAndAllowBtnX)
		})

		// Capture requestId
		const callX = vi
			.mocked(vscode.postMessage)
			.mock.calls.find((c) => (c[0] as any)?.askResponse === "yesAndAllowButtonClicked")
		expect(callX).toBeTruthy()
		const requestIdX = (callX![0] as any).requestId as string
		expect(requestIdX).toBeTruthy()

		// Buttons gone
		await waitFor(() => {
			expect(
				Array.from(container.querySelectorAll("button")).find(
					(b) => b.textContent?.trim() === "chat:runCommandAndAllow.title",
				),
			).toBeFalsy()
		})

		// Step 3: SAME task/instance now emits a followup ask (different ask type)
		// This should clear the snapshot (non-command ask invalidates it)
		mockPostMessage({
			currentTaskId: TASK_X_ID,
			currentTaskInstanceId: TASK_X_INST,
			clineMessages: [
				{ type: "say", say: "task", ts: 1, text: "task X" },
				{ type: "ask", ask: "followup", ts: 4000, text: "Continue with next step?" },
			],
		})

		await waitFor(() => {
			expect(container.querySelector('[data-testid="chat-view"]')).toBeInTheDocument()
		})

		// Allow useDeepCompareEffect and useEffect to settle
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 20))
		})

		// Step 4: Stale commandApprovalError with original requestId arrives
		await act(async () => {
			window.dispatchEvent(
				new MessageEvent("message", {
					data: {
						type: "commandApprovalError",
						taskId: TASK_X_ID,
						instanceId: TASK_X_INST,
						requestId: requestIdX,
						error: "save failed - stale",
					},
				}),
			)
			await new Promise((resolve) => setTimeout(resolve, 0))
		})

		// Must NOT restore command buttons
		const runAllowBtnAfter = Array.from(container.querySelectorAll("button")).find(
			(b) => b.textContent?.trim() === "chat:runCommandAndAllow.title",
		)
		expect(runAllowBtnAfter).toBeFalsy()

		const runBtnAfter = Array.from(container.querySelectorAll("button")).find(
			(b) => b.textContent?.trim() === "chat:runCommand.title",
		)
		expect(runBtnAfter).toBeFalsy()

		// Component still mounted (no crash)
		expect(container.querySelector('[data-testid="chat-view"]')).toBeInTheDocument()
	})

	it("invoke newChat after Run-and-Allow clears snapshot; matching save error does NOT restore buttons and sends no extra approval", async () => {
		// Scenario:
		//   1. Command ask active; user clicks "Run and Allow" → snapshot stored, buttons hidden.
		//   2. Extension invokes "newChat" (handleChatReset) → activeAttemptRef cleared synchronously.
		//   3. A commandApprovalError with the MATCHING requestId arrives.
		// Expected: no command buttons appear; no extra askResponse emitted.

		const { container } = renderChatView()

		const TASK_ID = "task-newchat-reset"
		const INSTANCE_ID = "inst-newchat-reset"
		const CMD_TEXT = "git status"

		mockPostMessage({
			currentTaskId: TASK_ID,
			currentTaskInstanceId: INSTANCE_ID,
			clineMessages: [
				{ type: "say", say: "task", ts: 1, text: "task newchat" },
				{ type: "ask", ask: "command", ts: 6000, text: CMD_TEXT },
			],
		})

		await waitFor(() => {
			expect(container.querySelector('[data-testid="chat-view"]')).toBeInTheDocument()
		})
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 10))
		})

		// Click "Run and Allow"
		const runAndAllowBtn = await waitFor(() => {
			const btn = Array.from(container.querySelectorAll("button")).find(
				(b) => b.textContent?.trim() === "chat:runCommandAndAllow.title",
			)
			expect(btn).toBeTruthy()
			return btn!
		})

		vi.mocked(vscode.postMessage).mockClear()
		await act(async () => {
			fireEvent.click(runAndAllowBtn)
		})

		const clickCall = vi
			.mocked(vscode.postMessage)
			.mock.calls.find((c) => (c[0] as any)?.askResponse === "yesAndAllowButtonClicked")
		expect(clickCall).toBeTruthy()
		const requestId = (clickCall![0] as any).requestId as string
		expect(requestId).toBeTruthy()

		// Buttons gone after click
		await waitFor(() => {
			expect(
				Array.from(container.querySelectorAll("button")).find(
					(b) => b.textContent?.trim() === "chat:runCommandAndAllow.title",
				),
			).toBeFalsy()
		})

		// Extension invokes "newChat" — triggers handleChatReset, clears activeAttemptRef
		vi.mocked(vscode.postMessage).mockClear()
		await act(async () => {
			window.dispatchEvent(
				new MessageEvent("message", {
					data: { type: "invoke", invoke: "newChat" },
				}),
			)
			await new Promise((resolve) => setTimeout(resolve, 10))
		})

		// Matching commandApprovalError arrives — snapshot was cleared by reset
		await act(async () => {
			window.dispatchEvent(
				new MessageEvent("message", {
					data: {
						type: "commandApprovalError",
						taskId: TASK_ID,
						instanceId: INSTANCE_ID,
						requestId,
						error: "save failed - after newChat",
					},
				}),
			)
			await new Promise((resolve) => setTimeout(resolve, 0))
		})

		// Must NOT restore command buttons
		expect(
			Array.from(container.querySelectorAll("button")).find(
				(b) => b.textContent?.trim() === "chat:runCommandAndAllow.title",
			),
		).toBeFalsy()
		expect(
			Array.from(container.querySelectorAll("button")).find(
				(b) => b.textContent?.trim() === "chat:runCommand.title",
			),
		).toBeFalsy()

		// No approval message sent after newChat reset
		expect(
			vi
				.mocked(vscode.postMessage)
				.mock.calls.find((c) => (c[0] as any)?.askResponse === "yesAndAllowButtonClicked"),
		).toBeFalsy()

		expect(container.querySelector('[data-testid="chat-view"]')).toBeInTheDocument()
	})

	it("invoke sendMessage (queued path) after Run-and-Allow keeps snapshot; matching save error restores buttons without extra askResponse", async () => {
		// Scenario:
		//   1. Command ask active; user clicks "Run and Allow" → snapshot stored, sendingDisabled=true.
		//   2. Extension invokes "sendMessage" while sendingDisabled=true → queueMessage path (early return),
		//      handleChatReset NOT called, snapshot remains intact.
		//   3. Matching commandApprovalError arrives → must restore all three approval buttons.
		// Verify: queueMessage called; no additional askResponse emitted.

		const { container } = renderChatView()

		const TASK_ID = "task-queued-send"
		const INSTANCE_ID = "inst-queued-send"
		const CMD_TEXT = "make test"

		mockPostMessage({
			currentTaskId: TASK_ID,
			currentTaskInstanceId: INSTANCE_ID,
			clineMessages: [
				{ type: "say", say: "task", ts: 1, text: "task queued" },
				{ type: "ask", ask: "command", ts: 7000, text: CMD_TEXT },
			],
		})

		await waitFor(() => {
			expect(container.querySelector('[data-testid="chat-view"]')).toBeInTheDocument()
		})
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 10))
		})

		// Click "Run and Allow" — snapshot recorded, sendingDisabled=true
		const runAndAllowBtn = await waitFor(() => {
			const btn = Array.from(container.querySelectorAll("button")).find(
				(b) => b.textContent?.trim() === "chat:runCommandAndAllow.title",
			)
			expect(btn).toBeTruthy()
			return btn!
		})

		vi.mocked(vscode.postMessage).mockClear()
		await act(async () => {
			fireEvent.click(runAndAllowBtn)
		})

		const clickCall = vi
			.mocked(vscode.postMessage)
			.mock.calls.find((c) => (c[0] as any)?.askResponse === "yesAndAllowButtonClicked")
		expect(clickCall).toBeTruthy()
		const requestId = (clickCall![0] as any).requestId as string
		expect(requestId).toBeTruthy()

		// Buttons gone
		await waitFor(() => {
			expect(
				Array.from(container.querySelectorAll("button")).find(
					(b) => b.textContent?.trim() === "chat:runCommandAndAllow.title",
				),
			).toBeFalsy()
		})

		const textarea = container.querySelector('[data-testid="chat-textarea"] input')
		expect(textarea?.getAttribute("data-sending-disabled")).toBe("true")

		// Extension invokes "sendMessage" while sendingDisabled=true → queued path
		vi.mocked(vscode.postMessage).mockClear()
		await act(async () => {
			window.dispatchEvent(
				new MessageEvent("message", {
					data: { type: "invoke", invoke: "sendMessage", text: "queued followup" },
				}),
			)
			await new Promise((resolve) => setTimeout(resolve, 10))
		})

		// Must have called queueMessage (not askResponse)
		const queueCall = vi.mocked(vscode.postMessage).mock.calls.find((c) => (c[0] as any)?.type === "queueMessage")
		expect(queueCall).toBeTruthy()
		expect((queueCall![0] as any).text).toBe("queued followup")

		// No askResponse emitted (snapshot intact, not consumed)
		expect(vi.mocked(vscode.postMessage).mock.calls.find((c) => (c[0] as any)?.type === "askResponse")).toBeFalsy()

		// Matching commandApprovalError arrives — snapshot still intact → restore buttons
		vi.mocked(vscode.postMessage).mockClear()
		await act(async () => {
			window.dispatchEvent(
				new MessageEvent("message", {
					data: {
						type: "commandApprovalError",
						taskId: TASK_ID,
						instanceId: INSTANCE_ID,
						requestId,
						error: "save failed - queued path",
					},
				}),
			)
			await new Promise((resolve) => setTimeout(resolve, 0))
		})

		// All three approval buttons must be restored
		await waitFor(() => {
			expect(
				Array.from(container.querySelectorAll("button")).find(
					(b) => b.textContent?.trim() === "chat:runCommand.title",
				),
			).toBeTruthy()
			expect(
				Array.from(container.querySelectorAll("button")).find(
					(b) => b.textContent?.trim() === "chat:runCommandAndAllow.title",
				),
			).toBeTruthy()
			expect(
				Array.from(container.querySelectorAll("button")).find(
					(b) => b.textContent?.trim() === "chat:reject.title",
				),
			).toBeTruthy()
		})

		expect(textarea?.getAttribute("data-sending-disabled")).toBe("false")

		// No extra askResponse emitted during error handling
		expect(vi.mocked(vscode.postMessage).mock.calls.find((c) => (c[0] as any)?.type === "askResponse")).toBeFalsy()

		expect(container.querySelector('[data-testid="chat-view"]')).toBeInTheDocument()
	})

	it("pending-save replay: deep-effect with same command ts during activeAttempt keeps UI frozen; matching error restores buttons; retry sends original commandText", async () => {
		// Scenario:
		//   1. Hydrate full (non-partial) command ask — buttons appear.
		//   2. Click "Run and Allow" → activeAttemptRef set, buttons hidden, sendingDisabled=true.
		//      Save outgoing requestId.
		//   3. Re-hydrate state with SAME command ts but changed secondLastMessage.text so
		//      useDeepCompareEffect fires again — this is the "pending-save replay".
		//      Guard must detect activeAttempt matches (taskId/instanceId/executionId) and
		//      skip all state mutations: buttons stay hidden, sendingDisabled stays true,
		//      exactly one askResponse was sent (no duplicate).
		//   4. Matching commandApprovalError arrives → all three approval buttons restored,
		//      sendingDisabled=false.
		//   5. Click "Run and Allow" again → new requestId, same original commandText.

		const { container } = renderChatView()

		const TASK_ID = "task-pending-save"
		const INSTANCE_ID = "inst-pending-save"
		const CMD_TS = 42000
		const CMD_TEXT = "make build"

		// Step 1: hydrate full command ask
		mockPostMessage({
			currentTaskId: TASK_ID,
			currentTaskInstanceId: INSTANCE_ID,
			clineMessages: [
				{ type: "say", say: "task", ts: 1, text: "task text" },
				{ type: "say", say: "text", ts: 2, text: "first context" },
				{ type: "ask", ask: "command", ts: CMD_TS, text: CMD_TEXT },
			],
		})

		await waitFor(() => {
			expect(container.querySelector('[data-testid="chat-view"]')).toBeInTheDocument()
		})
		// Allow useEvent listener to register
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 10))
		})

		// Step 2: click "Run and Allow"
		const runAndAllowBtn = await waitFor(() => {
			const btn = Array.from(container.querySelectorAll("button")).find(
				(b) => b.textContent?.trim() === "chat:runCommandAndAllow.title",
			)
			expect(btn).toBeTruthy()
			return btn!
		})

		vi.mocked(vscode.postMessage).mockClear()
		await act(async () => {
			fireEvent.click(runAndAllowBtn)
		})

		// Capture outgoing requestId
		const clickCall = vi
			.mocked(vscode.postMessage)
			.mock.calls.find((c) => (c[0] as any)?.askResponse === "yesAndAllowButtonClicked")
		expect(clickCall).toBeTruthy()
		const outgoingRequestId = (clickCall![0] as any).requestId as string
		expect(outgoingRequestId).toBeTruthy()

		// Buttons gone, sendingDisabled=true
		await waitFor(() => {
			expect(
				Array.from(container.querySelectorAll("button")).find(
					(b) => b.textContent?.trim() === "chat:runCommandAndAllow.title",
				),
			).toBeFalsy()
		})
		const textarea = container.querySelector('[data-testid="chat-textarea"] input')
		expect(textarea?.getAttribute("data-sending-disabled")).toBe("true")

		// Step 3: re-hydrate with SAME command ts but changed secondLastMessage.text
		// This triggers useDeepCompareEffect (deep comparison detects difference in secondLastMessage).
		vi.mocked(vscode.postMessage).mockClear()
		mockPostMessage({
			currentTaskId: TASK_ID,
			currentTaskInstanceId: INSTANCE_ID,
			clineMessages: [
				{ type: "say", say: "task", ts: 1, text: "task text" },
				{ type: "say", say: "text", ts: 2, text: "CHANGED context — triggers deep-effect" },
				{ type: "ask", ask: "command", ts: CMD_TS, text: CMD_TEXT },
			],
		})
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 10))
		})

		// Assert: all three approval buttons still absent (UI still frozen)
		expect(
			Array.from(container.querySelectorAll("button")).find(
				(b) => b.textContent?.trim() === "chat:runCommand.title",
			),
		).toBeFalsy()
		expect(
			Array.from(container.querySelectorAll("button")).find(
				(b) => b.textContent?.trim() === "chat:runCommandAndAllow.title",
			),
		).toBeFalsy()
		expect(
			Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.trim() === "chat:reject.title"),
		).toBeFalsy()
		// sendingDisabled still true
		expect(textarea?.getAttribute("data-sending-disabled")).toBe("true")
		// Exactly zero additional askResponse messages sent during replay
		expect(vi.mocked(vscode.postMessage).mock.calls.find((c) => (c[0] as any)?.type === "askResponse")).toBeFalsy()

		// Step 4: matching commandApprovalError → restore all three approval buttons
		vi.mocked(vscode.postMessage).mockClear()
		await act(async () => {
			window.dispatchEvent(
				new MessageEvent("message", {
					data: {
						type: "commandApprovalError",
						taskId: TASK_ID,
						instanceId: INSTANCE_ID,
						requestId: outgoingRequestId,
						error: "pending-save failed",
					},
				}),
			)
			await new Promise((resolve) => setTimeout(resolve, 0))
		})

		await waitFor(() => {
			expect(
				Array.from(container.querySelectorAll("button")).find(
					(b) => b.textContent?.trim() === "chat:runCommand.title",
				),
			).toBeTruthy()
			expect(
				Array.from(container.querySelectorAll("button")).find(
					(b) => b.textContent?.trim() === "chat:runCommandAndAllow.title",
				),
			).toBeTruthy()
			expect(
				Array.from(container.querySelectorAll("button")).find(
					(b) => b.textContent?.trim() === "chat:reject.title",
				),
			).toBeTruthy()
		})
		expect(textarea?.getAttribute("data-sending-disabled")).toBe("false")

		// Step 5: click "Run and Allow" again → new requestId, same original commandText
		const retryBtn = Array.from(container.querySelectorAll("button")).find(
			(b) => b.textContent?.trim() === "chat:runCommandAndAllow.title",
		)!
		vi.mocked(vscode.postMessage).mockClear()
		await act(async () => {
			fireEvent.click(retryBtn)
		})

		const retryCall = vi
			.mocked(vscode.postMessage)
			.mock.calls.find((c) => (c[0] as any)?.askResponse === "yesAndAllowButtonClicked")
		expect(retryCall).toBeTruthy()
		const retryRequestId = (retryCall![0] as any).requestId as string
		// New requestId (regenerated per click)
		expect(retryRequestId).toBeTruthy()
		expect(retryRequestId).not.toBe(outgoingRequestId)
		// Original commandText preserved from snapshot
		expect(retryCall![0]).toMatchObject({
			type: "askResponse",
			askResponse: "yesAndAllowButtonClicked",
			taskId: TASK_ID,
			instanceId: INSTANCE_ID,
			commandText: CMD_TEXT,
			requestId: retryRequestId,
		})
	})
})

describe("ChatView - commandExecutionStatus scope guard", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("command ask → matching started → command_output ask → Continue/Kill enabled; repeated started does not remove them; Kill sends terminalOperation abort", async () => {
		// Scenario:
		//   1. Hydrate with command ask ts=700  → approval buttons appear.
		//   2. commandExecutionStatus started executionId=700 → approval buttons disappear (clineAsk cleared).
		//   3. Backend hydrates command_output ask → Continue ("chat:proceedWhileRunning.title") and
		//      Kill ("chat:killCommand.title") appear.
		//   4. A second commandExecutionStatus started executionId=700 arrives (late duplicate) →
		//      Continue/Kill must NOT disappear (clineAsk is now "command_output", not "command").
		//   5. Click Kill → postMessage receives terminalOperation abort.

		const { container } = renderChatView()

		const TASK_ID = "task-scope-1"
		const INSTANCE_ID = "inst-scope-1"
		const CMD_TS = 700

		// Step 1: hydrate command ask
		mockPostMessage({
			currentTaskId: TASK_ID,
			currentTaskInstanceId: INSTANCE_ID,
			clineMessages: [
				{ type: "say", say: "task", ts: 1, text: "do task" },
				{ type: "ask", ask: "command", ts: CMD_TS, text: "ls -la", partial: false },
			],
		})

		// Wait for approval buttons
		await waitFor(() => {
			const btns = Array.from(container.querySelectorAll("button")).map((b) => b.textContent?.trim())
			expect(btns).toContain("chat:runCommand.title")
		})

		// Allow event listener to settle
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 20))
		})

		// Step 2: matching commandExecutionStatus started → approval buttons disappear
		await act(async () => {
			window.dispatchEvent(
				new MessageEvent("message", {
					data: {
						type: "commandExecutionStatus",
						text: JSON.stringify({ status: "started", executionId: String(CMD_TS) }),
					},
				}),
			)
			await new Promise((resolve) => setTimeout(resolve, 0))
		})

		await waitFor(() => {
			const btns = Array.from(container.querySelectorAll("button")).map((b) => b.textContent?.trim())
			expect(btns).not.toContain("chat:runCommand.title")
			expect(btns).not.toContain("chat:reject.title")
		})

		// Step 3: backend sends command_output ask → Continue + Kill should appear
		mockPostMessage({
			currentTaskId: TASK_ID,
			currentTaskInstanceId: INSTANCE_ID,
			clineMessages: [
				{ type: "say", say: "task", ts: 1, text: "do task" },
				{ type: "ask", ask: "command", ts: CMD_TS, text: "ls -la", partial: false },
				{ type: "ask", ask: "command_output", ts: CMD_TS + 1, text: "some output", partial: false },
			],
		})

		await waitFor(() => {
			const btns = Array.from(container.querySelectorAll("button")).map((b) => b.textContent?.trim())
			expect(btns).toContain("chat:proceedWhileRunning.title")
			expect(btns).toContain("chat:killCommand.title")
		})

		// Step 4: duplicate matching started arrives → Continue/Kill must NOT disappear
		await act(async () => {
			window.dispatchEvent(
				new MessageEvent("message", {
					data: {
						type: "commandExecutionStatus",
						text: JSON.stringify({ status: "started", executionId: String(CMD_TS) }),
					},
				}),
			)
			await new Promise((resolve) => setTimeout(resolve, 10))
		})

		// Continue and Kill must still be present
		await waitFor(() => {
			const btns = Array.from(container.querySelectorAll("button")).map((b) => b.textContent?.trim())
			expect(btns).toContain("chat:proceedWhileRunning.title")
			expect(btns).toContain("chat:killCommand.title")
		})

		// Step 5: click Kill → must send terminalOperation abort
		vi.mocked(vscode.postMessage).mockClear()
		const killBtn = Array.from(container.querySelectorAll("button")).find(
			(b) => b.textContent?.trim() === "chat:killCommand.title",
		)!
		expect(killBtn).toBeTruthy()

		await act(async () => {
			fireEvent.click(killBtn)
		})

		const abortCall = vi
			.mocked(vscode.postMessage)
			.mock.calls.find(
				(c) => (c[0] as any)?.type === "terminalOperation" && (c[0] as any)?.terminalOperation === "abort",
			)
		expect(abortCall).toBeTruthy()
	})

	it("command → followup → late matching commandExecutionStatus does not remove followup UI (input enabled, no command buttons)", async () => {
		// Scenario:
		//   1. Hydrate command ask ts=800 → approval buttons.
		//   2. Backend advances to followup ask → no approval buttons, input enabled.
		//   3. Late commandExecutionStatus started executionId=800 arrives →
		//      followup UI must be preserved (no command buttons appear, input stays enabled).

		const { container } = renderChatView()

		const TASK_ID = "task-scope-2"
		const INSTANCE_ID = "inst-scope-2"
		const CMD_TS = 800

		// Step 1: hydrate command ask
		mockPostMessage({
			currentTaskId: TASK_ID,
			currentTaskInstanceId: INSTANCE_ID,
			clineMessages: [
				{ type: "say", say: "task", ts: 1, text: "task" },
				{ type: "ask", ask: "command", ts: CMD_TS, text: "echo hi", partial: false },
			],
		})

		await waitFor(() => {
			const btns = Array.from(container.querySelectorAll("button")).map((b) => b.textContent?.trim())
			expect(btns).toContain("chat:runCommand.title")
		})

		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 20))
		})

		// Step 2: backend advances to followup ask (command already approved/ran, AI asks next step)
		mockPostMessage({
			currentTaskId: TASK_ID,
			currentTaskInstanceId: INSTANCE_ID,
			clineMessages: [
				{ type: "say", say: "task", ts: 1, text: "task" },
				{ type: "ask", ask: "command", ts: CMD_TS, text: "echo hi", partial: false },
				{ type: "ask", ask: "followup", ts: CMD_TS + 100, text: "Continue with next step?", partial: false },
			],
		})

		// Followup ask: no command approval buttons, input not disabled
		await waitFor(() => {
			const btns = Array.from(container.querySelectorAll("button")).map((b) => b.textContent?.trim())
			expect(btns).not.toContain("chat:runCommand.title")
			expect(btns).not.toContain("chat:runCommandAndAllow.title")
			expect(btns).not.toContain("chat:reject.title")
		})

		const textarea = container.querySelector("[data-sending-disabled]")
		expect(textarea?.getAttribute("data-sending-disabled")).toBe("false")

		// Step 3: late commandExecutionStatus started for the original command executionId
		await act(async () => {
			window.dispatchEvent(
				new MessageEvent("message", {
					data: {
						type: "commandExecutionStatus",
						text: JSON.stringify({ status: "started", executionId: String(CMD_TS) }),
					},
				}),
			)
			await new Promise((resolve) => setTimeout(resolve, 10))
		})

		// Followup UI must be intact: no command buttons, input still enabled
		const btnsAfterLateStatus = Array.from(container.querySelectorAll("button")).map((b) => b.textContent?.trim())
		expect(btnsAfterLateStatus).not.toContain("chat:runCommand.title")
		expect(btnsAfterLateStatus).not.toContain("chat:runCommandAndAllow.title")
		expect(btnsAfterLateStatus).not.toContain("chat:reject.title")
		// Input must remain enabled (sendingDisabled=false for followup)
		expect(textarea?.getAttribute("data-sending-disabled")).toBe("false")
	})
})
