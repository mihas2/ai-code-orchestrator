import { render, screen, act, waitFor } from "@/utils/test-utils"

import {
	type ProviderSettings,
	type ExperimentId,
	type ExtensionState,
	type ClineMessage,
	DEFAULT_CHECKPOINT_TIMEOUT_SECONDS,
} from "@ai-code-orchestrator/types"

import { ExtensionStateContextProvider, useExtensionState, mergeExtensionState } from "../ExtensionStateContext"

const TestComponent = () => {
	const { allowedCommands, setAllowedCommands, soundEnabled, showAicoIgnoredFiles, setShowAicoIgnoredFiles } =
		useExtensionState()

	return (
		<div>
			<div data-testid="allowed-commands">{JSON.stringify(allowedCommands)}</div>
			<div data-testid="sound-enabled">{JSON.stringify(soundEnabled)}</div>
			<div data-testid="show-aicoignored-files">{JSON.stringify(showAicoIgnoredFiles)}</div>
			<button data-testid="update-button" onClick={() => setAllowedCommands(["npm install", "git status"])}>
				Update Commands
			</button>
			<button
				data-testid="toggle-aicoignore-button"
				onClick={() => setShowAicoIgnoredFiles(!showAicoIgnoredFiles)}>
				Update Commands
			</button>
		</div>
	)
}

const ApiConfigTestComponent = () => {
	const { apiConfiguration, setApiConfiguration } = useExtensionState()

	return (
		<div>
			<div data-testid="api-configuration">{JSON.stringify(apiConfiguration)}</div>
			<button
				data-testid="update-api-config-button"
				onClick={() => setApiConfiguration({ apiModelId: "new-model", apiProvider: "anthropic" })}>
				Update API Config
			</button>
			<button data-testid="partial-update-button" onClick={() => setApiConfiguration({ modelTemperature: 0.7 })}>
				Partial Update
			</button>
		</div>
	)
}

describe("ExtensionStateContext", () => {
	it("initializes with empty allowedCommands array", () => {
		render(
			<ExtensionStateContextProvider>
				<TestComponent />
			</ExtensionStateContextProvider>,
		)

		expect(JSON.parse(screen.getByTestId("allowed-commands").textContent!)).toEqual([])
	})

	it("initializes with soundEnabled set to false", () => {
		render(
			<ExtensionStateContextProvider>
				<TestComponent />
			</ExtensionStateContextProvider>,
		)

		expect(JSON.parse(screen.getByTestId("sound-enabled").textContent!)).toBe(false)
	})

	it("initializes with showAicoIgnoredFiles set to true", () => {
		render(
			<ExtensionStateContextProvider>
				<TestComponent />
			</ExtensionStateContextProvider>,
		)

		expect(JSON.parse(screen.getByTestId("show-aicoignored-files").textContent!)).toBe(true)
	})

	it("updates showAicoIgnoredFiles through setShowAicoIgnoredFiles", () => {
		render(
			<ExtensionStateContextProvider>
				<TestComponent />
			</ExtensionStateContextProvider>,
		)

		act(() => {
			screen.getByTestId("toggle-aicoignore-button").click()
		})

		expect(JSON.parse(screen.getByTestId("show-aicoignored-files").textContent!)).toBe(false)
	})

	it("updates allowedCommands through setAllowedCommands", () => {
		render(
			<ExtensionStateContextProvider>
				<TestComponent />
			</ExtensionStateContextProvider>,
		)

		act(() => {
			screen.getByTestId("update-button").click()
		})

		expect(JSON.parse(screen.getByTestId("allowed-commands").textContent!)).toEqual(["npm install", "git status"])
	})

	it("throws error when used outside provider", () => {
		// Suppress console.error for this test since we expect an error
		const consoleSpy = vi.spyOn(console, "error")
		consoleSpy.mockImplementation(() => {})

		expect(() => {
			render(<TestComponent />)
		}).toThrow("useExtensionState must be used within an ExtensionStateContextProvider")

		consoleSpy.mockRestore()
	})

	it("updates apiConfiguration through setApiConfiguration", () => {
		render(
			<ExtensionStateContextProvider>
				<ApiConfigTestComponent />
			</ExtensionStateContextProvider>,
		)

		const initialContent = screen.getByTestId("api-configuration").textContent!
		expect(initialContent).toBeDefined()

		act(() => {
			screen.getByTestId("update-api-config-button").click()
		})

		const updatedContent = screen.getByTestId("api-configuration").textContent!
		const updatedConfig = JSON.parse(updatedContent || "{}")

		expect(updatedConfig).toEqual(
			expect.objectContaining({
				apiModelId: "new-model",
				apiProvider: "anthropic",
			}),
		)
	})

	it("correctly merges partial updates to apiConfiguration", () => {
		render(
			<ExtensionStateContextProvider>
				<ApiConfigTestComponent />
			</ExtensionStateContextProvider>,
		)

		// First set the initial configuration
		act(() => {
			screen.getByTestId("update-api-config-button").click()
		})

		// Verify initial update
		const initialContent = screen.getByTestId("api-configuration").textContent!
		const initialConfig = JSON.parse(initialContent || "{}")
		expect(initialConfig).toEqual(
			expect.objectContaining({
				apiModelId: "new-model",
				apiProvider: "anthropic",
			}),
		)

		// Now perform a partial update
		act(() => {
			screen.getByTestId("partial-update-button").click()
		})

		// Verify that the partial update was merged with the existing configuration
		const updatedContent = screen.getByTestId("api-configuration").textContent!
		const updatedConfig = JSON.parse(updatedContent || "{}")
		expect(updatedConfig).toEqual(
			expect.objectContaining({
				apiModelId: "new-model", // Should retain this from previous update
				apiProvider: "anthropic", // Should retain this from previous update
				modelTemperature: 0.7, // Should add this from partial update
			}),
		)
	})
})

describe("orchestration event consumer", () => {
	const event = {
		eventId: "event-1",
		idempotencyKey: "run-1:started",
		runId: "run-1",
		sequence: 1,
		timestamp: 100,
		type: "orchestrationStarted",
		payload: { status: "planned" },
	}

	it("stores orchestration events and snapshots received from the extension", async () => {
		const Consumer = () => {
			const { orchestrationEvents, orchestrationSnapshot } = useExtensionState()
			return (
				<div data-testid="orchestration-state">
					{JSON.stringify({ orchestrationEvents, orchestrationSnapshot })}
				</div>
			)
		}

		render(
			<ExtensionStateContextProvider>
				<Consumer />
			</ExtensionStateContextProvider>,
		)

		act(() => {
			window.postMessage({ type: "orchestrationEvent", payload: event }, "*")
			window.postMessage(
				{
					type: "orchestrationSnapshot",
					payload: {
						run: { runId: "run-1", status: "planned" },
						nodes: [],
						events: [event],
						capturedAt: 100,
					},
				},
				"*",
			)
		})

		await waitFor(() => {
			const state = JSON.parse(screen.getByTestId("orchestration-state").textContent!)
			expect(state.orchestrationEvents).toEqual([event])
			expect(state.orchestrationSnapshot.run.runId).toBe("run-1")
		})
	})
})

describe("mergeExtensionState", () => {
	it("should correctly merge extension states", () => {
		const baseState: ExtensionState = {
			version: "",
			mcpEnabled: false,
			clineMessages: [],
			taskHistory: [],
			shouldShowAnnouncement: false,
			enableCheckpoints: true,
			writeDelayMs: 1000,
			mode: "default",
			experiments: {} as Record<ExperimentId, boolean>,
			customModes: [],
			maxOpenTabsContext: 20,
			maxWorkspaceFiles: 100,
			apiConfiguration: { providerId: "openrouter" } as ProviderSettings,
			showAicoIgnoredFiles: true,
			enableSubfolderRules: false,
			renderContext: "sidebar",
			organizationAllowList: { allowAll: true, providers: {} },
			autoCondenseContext: true,
			autoCondenseContextPercent: 100,
			profileThresholds: {},
			hasOpenedModeSelector: false, // Add the new required property
			maxImageFileSize: 5,
			maxTotalImageSize: 20,
			checkpointTimeout: DEFAULT_CHECKPOINT_TIMEOUT_SECONDS, // Add the checkpoint timeout property
			maxReadFileLine: -1,
		}

		const prevState: ExtensionState = {
			...baseState,
			apiConfiguration: { modelMaxTokens: 1234, modelMaxThinkingTokens: 123 },
			experiments: {} as Record<ExperimentId, boolean>,
			checkpointTimeout: DEFAULT_CHECKPOINT_TIMEOUT_SECONDS - 5,
		}

		const newState: ExtensionState = {
			...baseState,
			apiConfiguration: { modelMaxThinkingTokens: 456, modelTemperature: 0.3 },
			experiments: {
				preventFocusDisruption: false,
				imageGeneration: false,
				runSlashCommand: false,
				customTools: false,
			} as Record<ExperimentId, boolean>,
			checkpointTimeout: DEFAULT_CHECKPOINT_TIMEOUT_SECONDS + 5,
		}

		const result = mergeExtensionState(prevState, newState)

		expect(result.apiConfiguration).toEqual({
			modelMaxThinkingTokens: 456,
			modelTemperature: 0.3,
		})

		expect(result.experiments).toEqual({
			preventFocusDisruption: false,
			imageGeneration: false,
			runSlashCommand: false,
			customTools: false,
		})
	})

	describe("clineMessagesSeq protection", () => {
		const baseState: ExtensionState = {
			version: "",
			mcpEnabled: false,
			clineMessages: [],
			taskHistory: [],
			shouldShowAnnouncement: false,
			enableCheckpoints: true,
			writeDelayMs: 1000,
			mode: "default",
			experiments: {} as Record<ExperimentId, boolean>,
			customModes: [],
			maxOpenTabsContext: 20,
			maxWorkspaceFiles: 100,
			apiConfiguration: {},
			showAicoIgnoredFiles: true,
			enableSubfolderRules: false,
			renderContext: "sidebar",
			organizationAllowList: { allowAll: true, providers: {} },
			autoCondenseContext: true,
			autoCondenseContextPercent: 100,
			profileThresholds: {},
			hasOpenedModeSelector: false,
			maxImageFileSize: 5,
			maxTotalImageSize: 20,
			checkpointTimeout: DEFAULT_CHECKPOINT_TIMEOUT_SECONDS,
			maxReadFileLine: -1,
		}

		const makeMessage = (ts: number, text: string): ClineMessage =>
			({ ts, type: "say", say: "text", text }) as ClineMessage

		it("rejects stale clineMessages when seq is not newer", () => {
			const newerMessages = [makeMessage(1, "hello"), makeMessage(2, "world")]
			const staleMessages = [makeMessage(1, "hello")]

			const prevState: ExtensionState = {
				...baseState,
				clineMessages: newerMessages,
				clineMessagesSeq: 5,
			}

			const result = mergeExtensionState(prevState, {
				clineMessages: staleMessages,
				clineMessagesSeq: 3, // stale seq
			})

			// Should keep the newer messages
			expect(result.clineMessages).toBe(newerMessages)
			expect(result.clineMessagesSeq).toBe(5)
		})

		it("rejects clineMessages when seq equals current (not strictly greater)", () => {
			const currentMessages = [makeMessage(1, "hello"), makeMessage(2, "world")]
			const sameSeqMessages = [makeMessage(1, "hello")]

			const prevState: ExtensionState = {
				...baseState,
				clineMessages: currentMessages,
				clineMessagesSeq: 5,
			}

			const result = mergeExtensionState(prevState, {
				clineMessages: sameSeqMessages,
				clineMessagesSeq: 5, // same seq, not strictly greater
			})

			expect(result.clineMessages).toBe(currentMessages)
			expect(result.clineMessagesSeq).toBe(5)
		})

		it("accepts clineMessages when seq is strictly greater", () => {
			const oldMessages = [makeMessage(1, "hello")]
			const newMessages = [makeMessage(1, "hello"), makeMessage(2, "world")]

			const prevState: ExtensionState = {
				...baseState,
				clineMessages: oldMessages,
				clineMessagesSeq: 3,
			}

			const result = mergeExtensionState(prevState, {
				clineMessages: newMessages,
				clineMessagesSeq: 4, // newer seq
			})

			expect(result.clineMessages).toBe(newMessages)
			expect(result.clineMessagesSeq).toBe(4)
		})

		it("preserves clineMessages when newState does not include them", () => {
			const existingMessages = [makeMessage(1, "hello"), makeMessage(2, "world")]

			const prevState: ExtensionState = {
				...baseState,
				clineMessages: existingMessages,
				clineMessagesSeq: 5,
			}

			const result = mergeExtensionState(prevState, {
				currentApiConfigName: "updated",
			})

			expect(result.clineMessages).toBe(existingMessages)
			expect(result.clineMessagesSeq).toBe(5)
		})

		it("applies clineMessages normally when neither state has seq (backward compat)", () => {
			const oldMessages = [makeMessage(1, "hello")]
			const newMessages = [makeMessage(1, "hello"), makeMessage(2, "world")]

			const prevState: ExtensionState = {
				...baseState,
				clineMessages: oldMessages,
			}

			const result = mergeExtensionState(prevState, {
				clineMessages: newMessages,
			})

			expect(result.clineMessages).toBe(newMessages)
		})

		it("applies clineMessages when prevState has no seq but newState does (first push)", () => {
			const prevState: ExtensionState = {
				...baseState,
				clineMessages: [],
			}

			const newMessages = [makeMessage(1, "hello")]
			const result = mergeExtensionState(prevState, {
				clineMessages: newMessages,
				clineMessagesSeq: 1,
			})

			expect(result.clineMessages).toBe(newMessages)
			expect(result.clineMessagesSeq).toBe(1)
		})
	})
})
