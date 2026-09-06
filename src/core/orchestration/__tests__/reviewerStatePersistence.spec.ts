import { describe, expect, it, vi } from "vitest"
import { REVIEWER_STATE_KEY, ReviewerAdapter } from "../reviewerAdapter"
import type { ReviewerState } from "../reviewerAdapter"

type StateStore = {
	get: ReturnType<typeof vi.fn>
	update: ReturnType<typeof vi.fn>
}

type TestContext = {
	globalState: StateStore
	workspaceState: StateStore
}

const createStore = (value?: unknown): StateStore => ({
	get: vi.fn(() => value),
	update: vi.fn(async () => undefined),
})

const createContext = (globalValue?: unknown, workspaceValue?: unknown): TestContext => ({
	globalState: createStore(globalValue),
	workspaceState: createStore(workspaceValue),
})

const defaultState: ReviewerState = { enabled: false, prompt: null }

describe("ReviewerAdapter state persistence", () => {
	it("saves reviewer settings when they change", async () => {
		const context = createContext()
		const reviewer = new ReviewerAdapter(undefined, context as never)

		await reviewer.saveState({ enabled: true, prompt: "custom" })

		expect(context.globalState.update).toHaveBeenCalledWith(
			REVIEWER_STATE_KEY,
			JSON.stringify({
				version: 1,
				enabled: true,
				prompt: "custom",
			}),
		)
	})

	it("restores state from globalState during activation", async () => {
		const context = createContext({ version: 1, enabled: true, prompt: "restored" })
		const reviewer = new ReviewerAdapter()

		const restored = await reviewer.restoreState(context as never)

		expect(restored).toEqual({ enabled: true, prompt: "restored" })
		expect(reviewer.getState()).toEqual(restored)
	})

	it("uses the default state when no persisted state exists", async () => {
		const reviewer = new ReviewerAdapter()

		expect(await reviewer.restoreState(createContext() as never)).toEqual(defaultState)
	})

	it("uses workspaceState for workspace-specific reviewer policy", async () => {
		const context = createContext(undefined, { version: 1, enabled: true, prompt: "workspace" })
		const reviewer = new ReviewerAdapter(undefined, context as never, { scope: "workspace" })

		await reviewer.restoreState(context as never)
		await reviewer.saveState({ enabled: false, prompt: null })

		expect(context.workspaceState.get).toHaveBeenCalledWith(REVIEWER_STATE_KEY)
		expect(context.workspaceState.update).toHaveBeenCalledWith(
			REVIEWER_STATE_KEY,
			JSON.stringify({
				version: 1,
				enabled: false,
				prompt: null,
			}),
		)
		expect(context.globalState.update).not.toHaveBeenCalled()
	})

	it("migrates an older persisted format and writes it back", async () => {
		const context = createContext({ version: 0, enabled: true })
		const reviewer = new ReviewerAdapter()

		expect(await reviewer.restoreState(context as never)).toEqual({ enabled: true, prompt: null })
		expect(context.globalState.update).toHaveBeenCalledWith(
			REVIEWER_STATE_KEY,
			JSON.stringify({
				version: 1,
				enabled: true,
				prompt: null,
			}),
		)
	})

	it("falls back and warns when persisted state is invalid", async () => {
		const context = createContext("{broken-json")
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
		const reviewer = new ReviewerAdapter()

		expect(await reviewer.restoreState(context as never)).toEqual(defaultState)
		expect(warn).toHaveBeenCalled()
		warn.mockRestore()
	})
})
