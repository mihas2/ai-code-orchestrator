import React from "react"

import { render, screen } from "@/utils/test-utils"

import Announcement from "../Announcement"

vi.mock("@aico/package", () => ({
	Package: {
		version: "1.1.2",
	},
}))

vi.mock("react-i18next", () => ({
	Trans: ({ i18nKey }: { i18nKey: string; components?: Record<string, React.ReactElement> }) => {
		if (i18nKey === "chat:announcement.finalRelease.intro") {
			return <span>AI Code Orchestrator 1.1.2 includes improved role model selection.</span>
		}

		if (i18nKey === "chat:announcement.finalRelease.alternatives") {
			return <span>Role model selection is now consistent from configuration to execution.</span>
		}

		return <span>{i18nKey}</span>
	},
}))

vi.mock("@src/i18n/TranslationContext", () => ({
	useAppTranslation: () => ({
		t: (key: string, options?: { version?: string }) => {
			const translations: Record<string, string> = {
				"chat:announcement.finalRelease.title": "AI Code Orchestrator {{version}}",
				"chat:announcement.finalRelease.continuity":
					"This release also fixes model selection when a role assignment is configured without a profile name.",
				"chat:announcement.finalRelease.signoff": "Happy coding!",
			}

			if (key === "chat:announcement.finalRelease.title") {
				return translations[key].replace("{{version}}", options?.version ?? "")
			}

			return translations[key] ?? key
		},
	}),
}))

describe("Announcement", () => {
	it("renders the final release announcement", () => {
		render(<Announcement hideAnnouncement={vi.fn()} />)

		expect(screen.getByText("AI Code Orchestrator 1.1.2")).toBeInTheDocument()
		expect(
			screen.getByText(/AI Code Orchestrator 1.1.2 includes improved role model selection/),
		).toBeInTheDocument()
		expect(
			screen.getByText(
				"This release also fixes model selection when a role assignment is configured without a profile name.",
			),
		).toBeInTheDocument()
		expect(screen.getByText("Happy coding!")).toBeInTheDocument()
	})

	it("does not render legacy release links", () => {
		render(<Announcement hideAnnouncement={vi.fn()} />)

		expect(screen.queryByRole("link")).not.toBeInTheDocument()
	})

	it("does not render corporate handoff links", () => {
		render(<Announcement hideAnnouncement={vi.fn()} />)

		expect(screen.queryByRole("listitem")).not.toBeInTheDocument()
		expect(screen.queryByText("chat:announcement.handoff.description")).not.toBeInTheDocument()
		expect(screen.queryByRole("link", { name: "X" })).not.toBeInTheDocument()
	})
})
