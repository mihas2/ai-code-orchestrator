import React from "react"

import { render, screen } from "@/utils/test-utils"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ExtensionStateContextProvider } from "@src/context/ExtensionStateContext"
import { ChatRowContent } from "../ChatRow"

// Mock i18n
vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => {
			const map: Record<string, string> = {
				"chat:apiRequest.rateLimitWait": "Rate limiting",
				"chat:apiRequest.failed": "API Request Failed",
				"chat:apiRequest.errorTitle": "Provider Error",
				"chat:apiRequest.errorMessage.unknown": "Unknown API error. Please report this on GitHub.",
				"chat:apiRequest.errorMessage.docs": "Docs",
			}
			return map[key] ?? key
		},
		i18n: {
			exists: () => false,
		},
	}),
	Trans: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
	initReactI18next: { type: "3rdParty", init: () => {} },
}))

const queryClient = new QueryClient()

function renderChatRow(message: any) {
	return render(
		<ExtensionStateContextProvider>
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
			</QueryClientProvider>
		</ExtensionStateContextProvider>,
	)
}

describe("ChatRow - rate limit wait", () => {
	it("renders a non-error progress row for api_req_rate_limit_wait", () => {
		const message: any = {
			type: "say",
			say: "api_req_rate_limit_wait",
			ts: Date.now(),
			partial: true,
			text: JSON.stringify({ seconds: 1 }),
		}

		renderChatRow(message)

		expect(screen.getByText("Rate limiting")).toBeInTheDocument()
		// Should show countdown, but should NOT show the error-details affordance.
		expect(screen.getByText("1s")).toBeInTheDocument()
		expect(screen.queryByText("Details")).toBeNull()
	})

	it("renders nothing when rate limit wait is complete", () => {
		const message: any = {
			type: "say",
			say: "api_req_rate_limit_wait",
			ts: Date.now(),
			partial: false,
			text: undefined,
		}

		const { container } = renderChatRow(message)

		// The row should be hidden when rate limiting is complete
		expect(screen.queryByText("Rate limiting")).toBeNull()
		// Nothing should be rendered
		expect(container.firstChild).toBeNull()
	})

	it("renders the concrete provider error instead of replacing it with a GitHub prompt", () => {
		const message: any = {
			type: "say",
			say: "api_req_retry_delayed",
			ts: Date.now(),
			text: "503\nOpenAI completion error: 503 The selected model is temporarily unavailable. Try again later. Retry in 60s.",
		}

		renderChatRow(message)

		expect(
			screen.getByText(
				"OpenAI completion error: 503 The selected model is temporarily unavailable. Try again later. Retry in 60s.",
			),
		).toBeInTheDocument()
		expect(screen.queryByText("Unknown API error. Please report this on GitHub.")).not.toBeInTheDocument()
		expect(screen.queryByRole("link", { name: /Docs/ })).not.toBeInTheDocument()
	})

	it("uses the generic fallback only when error details are absent", () => {
		renderChatRow({ type: "say", say: "api_req_retry_delayed", ts: Date.now(), text: "" })

		expect(screen.getByText("Unknown API error. Please report this on GitHub.")).toBeInTheDocument()
	})
})
