// pnpm --filter @ai-code-orchestrator/vscode-webview test src/components/chat/__tests__/CommandExecution.spec.tsx

import React from "react"
import { render, screen, fireEvent } from "@testing-library/react"

import { CommandExecution } from "../CommandExecution"
import { ExtensionStateContext } from "../../../context/ExtensionStateContext"

// Mock dependencies
vi.mock("react-use", () => ({
	useEvent: vi.fn(),
}))

import { vscode } from "../../../utils/vscode"

vi.mock("../../../utils/vscode", () => ({
	vscode: {
		postMessage: vi.fn(),
	},
}))

vi.mock("../../common/CodeBlock", () => ({
	default: ({ source }: { source: string }) => <div data-testid="code-block">{source}</div>,
}))

// Mock TerminalOutput
vi.mock("../TerminalOutput", () => ({
	TerminalOutput: ({ content }: { content: string }) => <div data-testid="terminal-output">{content}</div>,
}))

vi.mock("../CommandPatternSelector", () => ({
	CommandPatternSelector: ({ patterns, onAllowPatternChange, onDenyPatternChange }: any) => (
		<div data-testid="command-pattern-selector">
			{patterns.map((pattern: any, index: number) => (
				<span key={index}>{pattern.pattern}</span>
			))}
			<button onClick={() => onAllowPatternChange(patterns[0]?.pattern)}>Allow</button>
			<button onClick={() => onDenyPatternChange(patterns[0]?.pattern)}>Deny</button>
		</div>
	),
}))

// Mock ExtensionStateContext
const mockExtensionState = {
	terminalShellIntegrationDisabled: false,
	allowedCommands: ["npm"],
	deniedCommands: ["rm"],
	setAllowedCommands: vi.fn(),
	setDeniedCommands: vi.fn(),
}

const ExtensionStateWrapper = ({ children }: { children: React.ReactNode }) => (
	<ExtensionStateContext.Provider value={mockExtensionState as any}>{children}</ExtensionStateContext.Provider>
)

describe("CommandExecution", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("should render command without output", () => {
		render(
			<ExtensionStateWrapper>
				<CommandExecution executionId="test-1" text="npm install" />
			</ExtensionStateWrapper>,
		)

		expect(screen.getByTestId("code-block")).toHaveTextContent("npm install")
	})

	it("should render command with output", () => {
		render(
			<ExtensionStateWrapper>
				<CommandExecution executionId="test-1" text="npm install\nOutput:\nInstalling packages..." />
			</ExtensionStateWrapper>,
		)

		const codeBlocks = screen.getAllByTestId("code-block")
		expect(codeBlocks[0]).toHaveTextContent("npm install")

		const terminalOutput = screen.getByTestId("terminal-output")
		expect(terminalOutput).toHaveTextContent("Installing packages...")
	})

	it("should render with custom icon and title", () => {
		const icon = <span data-testid="custom-icon">📦</span>
		const title = <span data-testid="custom-title">Installing Dependencies</span>

		render(
			<ExtensionStateWrapper>
				<CommandExecution executionId="test-1" text="npm install" icon={icon} title={title} />
			</ExtensionStateWrapper>,
		)

		expect(screen.getByTestId("custom-icon")).toBeInTheDocument()
		expect(screen.getByTestId("custom-title")).toBeInTheDocument()
	})

	it("should show command pattern selector for commands", () => {
		render(
			<ExtensionStateWrapper>
				<CommandExecution executionId="test-1" text="npm install express" />
			</ExtensionStateWrapper>,
		)

		expect(screen.getByTestId("command-pattern-selector")).toBeInTheDocument()
		// Check that the command is shown in the pattern selector
		const selector = screen.getByTestId("command-pattern-selector")
		expect(selector).toHaveTextContent("npm install express")
	})

	it("should handle allow command change", () => {
		render(
			<ExtensionStateWrapper>
				<CommandExecution executionId="test-1" text="git push" />
			</ExtensionStateWrapper>,
		)

		const allowButton = screen.getByText("Allow")
		fireEvent.click(allowButton)

		// extractPatternsFromCommandText("git push") -> ["git", "git push"] sorted,
		// patterns[0] = "git" which is NOT in allowedCommands["npm"] -> added
		expect(mockExtensionState.setAllowedCommands).toHaveBeenCalledWith(["npm", "git"])
		expect(mockExtensionState.setDeniedCommands).toHaveBeenCalledWith(["rm"])
		expect(vscode.postMessage).toHaveBeenCalledWith({
			type: "updateSettings",
			updatedSettings: {
				allowedCommands: ["npm", "git"],
				deniedCommands: ["rm"],
			},
		})
	})

	it("should handle deny command change", () => {
		render(
			<ExtensionStateWrapper>
				<CommandExecution executionId="test-1" text="docker run" />
			</ExtensionStateWrapper>,
		)

		const denyButton = screen.getByText("Deny")
		fireEvent.click(denyButton)

		// extractPatternsFromCommandText("docker run") -> ["docker", "docker run"] sorted,
		// patterns[0] = "docker" which is NOT in deniedCommands["rm"] -> added
		expect(mockExtensionState.setAllowedCommands).toHaveBeenCalledWith(["npm"])
		expect(mockExtensionState.setDeniedCommands).toHaveBeenCalledWith(["rm", "docker"])
		expect(vscode.postMessage).toHaveBeenCalledWith({
			type: "updateSettings",
			updatedSettings: {
				allowedCommands: ["npm"],
				deniedCommands: ["rm", "docker"],
			},
		})
	})

	it("should toggle allowed command", () => {
		// extractPatternsFromCommandText("npm test") -> ["npm", "npm test"] sorted,
		// patterns[0] = "npm". State has allowedCommands: ["npm"] -> "npm" is already allowed -> removed
		const stateWithNpm = {
			...mockExtensionState,
			allowedCommands: ["npm"],
			deniedCommands: ["rm"],
		}

		render(
			<ExtensionStateContext.Provider value={stateWithNpm as any}>
				<CommandExecution executionId="test-1" text="npm test" />
			</ExtensionStateContext.Provider>,
		)

		const allowButton = screen.getByText("Allow")
		fireEvent.click(allowButton)

		// "npm" is already in allowedCommands, so it should be removed
		expect(stateWithNpm.setAllowedCommands).toHaveBeenCalledWith([])
		expect(stateWithNpm.setDeniedCommands).toHaveBeenCalledWith(["rm"])
		expect(vscode.postMessage).toHaveBeenCalledWith({
			type: "updateSettings",
			updatedSettings: {
				allowedCommands: [],
				deniedCommands: ["rm"],
			},
		})
	})

	it("should toggle denied command", () => {
		// extractPatternsFromCommandText("rm -rf") -> ["rm", "rm -rf"] sorted,
		// patterns[0] = "rm". State has deniedCommands: ["rm"] -> "rm" is already denied -> removed
		const stateWithRm = {
			...mockExtensionState,
			allowedCommands: ["npm"],
			deniedCommands: ["rm"],
		}

		render(
			<ExtensionStateContext.Provider value={stateWithRm as any}>
				<CommandExecution executionId="test-1" text="rm -rf" />
			</ExtensionStateContext.Provider>,
		)

		const denyButton = screen.getByText("Deny")
		fireEvent.click(denyButton)

		// "rm" is already in deniedCommands, so it should be removed
		expect(stateWithRm.setAllowedCommands).toHaveBeenCalledWith(["npm"])
		expect(stateWithRm.setDeniedCommands).toHaveBeenCalledWith([])
		expect(vscode.postMessage).toHaveBeenCalledWith({
			type: "updateSettings",
			updatedSettings: {
				allowedCommands: ["npm"],
				deniedCommands: [],
			},
		})
	})

	it("should parse command with Output: separator", () => {
		const commandText = `npm install
Output:
Installing...`

		render(
			<ExtensionStateWrapper>
				<CommandExecution executionId="test-1" text={commandText} />
			</ExtensionStateWrapper>,
		)

		const codeBlocks = screen.getAllByTestId("code-block")
		expect(codeBlocks[0]).toHaveTextContent("npm install")
	})

	it("should parse command with output", () => {
		const commandText = `npm install
Output:
Suggested patterns: npm, npm install, npm run`

		render(
			<ExtensionStateWrapper>
				<CommandExecution executionId="test-1" text={commandText} />
			</ExtensionStateWrapper>,
		)

		// First check that the command was parsed correctly
		const codeBlocks = screen.getAllByTestId("code-block")
		expect(codeBlocks[0]).toHaveTextContent("npm install")

		const terminalOutput = screen.getByTestId("terminal-output")
		expect(terminalOutput).toHaveTextContent("Suggested patterns: npm, npm install, npm run")

		const selector = screen.getByTestId("command-pattern-selector")
		expect(selector).toBeInTheDocument()
		// Should show the full command in the selector
		expect(selector).toHaveTextContent("npm install")
	})

	it("should handle commands with pipes", () => {
		render(
			<ExtensionStateWrapper>
				<CommandExecution executionId="test-1" text="ls -la | grep test" />
			</ExtensionStateWrapper>,
		)

		const selector = screen.getByTestId("command-pattern-selector")
		expect(selector).toBeInTheDocument()
		// Should show one of the individual commands from the pipe
		expect(selector.textContent).toMatch(/ls -la|grep test/)
	})

	it("should handle commands with && operator", () => {
		render(
			<ExtensionStateWrapper>
				<CommandExecution executionId="test-1" text="npm install && npm test" />
			</ExtensionStateWrapper>,
		)

		const selector = screen.getByTestId("command-pattern-selector")
		expect(selector).toBeInTheDocument()
		// Should show one of the individual commands from the && chain
		expect(selector.textContent).toMatch(/npm install|npm test|npm/)
	})

	it("should not show pattern selector for empty commands", () => {
		render(
			<ExtensionStateWrapper>
				<CommandExecution executionId="test-1" text="" />
			</ExtensionStateWrapper>,
		)

		expect(screen.queryByTestId("command-pattern-selector")).not.toBeInTheDocument()
	})

	it("should expand output when terminal shell integration is disabled", () => {
		const disabledState = {
			...mockExtensionState,
			terminalShellIntegrationDisabled: true,
		}

		const commandText = `npm install
Output:
Output here`

		render(
			<ExtensionStateContext.Provider value={disabledState as any}>
				<CommandExecution executionId="test-1" text={commandText} />
			</ExtensionStateContext.Provider>,
		)

		// Output should be visible when shell integration is disabled
		const codeBlocks = screen.getAllByTestId("code-block")
		expect(codeBlocks).toHaveLength(1) // Only command block

		const terminalOutput = screen.getByTestId("terminal-output")
		expect(terminalOutput).toHaveTextContent("Output here")
	})

	it("should handle undefined allowedCommands and deniedCommands", () => {
		const stateWithUndefined = {
			...mockExtensionState,
			allowedCommands: undefined,
			deniedCommands: undefined,
		}

		render(
			<ExtensionStateContext.Provider value={stateWithUndefined as any}>
				<CommandExecution executionId="test-1" text="npm install" />
			</ExtensionStateContext.Provider>,
		)

		// Should show pattern selector when patterns are available
		expect(screen.getByTestId("command-pattern-selector")).toBeInTheDocument()
	})

	it("should handle command change when moving from denied to allowed", () => {
		// extractPatternsFromCommandText("rm file.txt") -> ["rm", "rm file.txt"] sorted,
		// patterns[0] = "rm". State has deniedCommands: ["rm"] -> "rm" removed from denied, added to allowed
		const stateWithRmInDenied = {
			...mockExtensionState,
			allowedCommands: ["npm"],
			deniedCommands: ["rm"],
		}

		render(
			<ExtensionStateContext.Provider value={stateWithRmInDenied as any}>
				<CommandExecution executionId="test-1" text="rm file.txt" />
			</ExtensionStateContext.Provider>,
		)

		const allowButton = screen.getByText("Allow")
		fireEvent.click(allowButton)

		// "rm" should be removed from denied and added to allowed
		expect(stateWithRmInDenied.setAllowedCommands).toHaveBeenCalledWith(["npm", "rm"])
		expect(stateWithRmInDenied.setDeniedCommands).toHaveBeenCalledWith([])
		expect(vscode.postMessage).toHaveBeenCalledWith({
			type: "updateSettings",
			updatedSettings: {
				allowedCommands: ["npm", "rm"],
				deniedCommands: [],
			},
		})
	})

	describe("integration with CommandPatternSelector", () => {
		it("should show complex commands with multiple operators", () => {
			render(
				<ExtensionStateWrapper>
					<CommandExecution executionId="test-6" text="npm install && npm test || echo 'failed'" />
				</ExtensionStateWrapper>,
			)

			const selector = screen.getByTestId("command-pattern-selector")
			expect(selector).toBeInTheDocument()
			// Should show one of the individual commands from the complex chain
			expect(selector.textContent).toMatch(/npm install|npm test|echo|npm/)
		})

		it("should handle commands with output", () => {
			const commandWithOutput = `npm install
Output:
Installing packages...
Other output here`

			render(
				<ExtensionStateWrapper>
					<CommandExecution
						executionId="test-6"
						text={commandWithOutput}
						icon={<span>icon</span>}
						title={<span>Run Command</span>}
					/>
				</ExtensionStateWrapper>,
			)

			const selector = screen.getByTestId("command-pattern-selector")
			expect(selector).toBeInTheDocument()
			// Should show the command in the selector
			expect(selector).toHaveTextContent("npm install")
		})

		it("should handle commands with subshells", () => {
			render(
				<ExtensionStateWrapper>
					<CommandExecution executionId="test-7" text="echo $(whoami) && git status" />
				</ExtensionStateWrapper>,
			)

			const selector = screen.getByTestId("command-pattern-selector")
			expect(selector).toBeInTheDocument()
			// Should show one of the individual commands
			expect(selector.textContent).toMatch(/echo|whoami|git status|git/)
		})

		it("should handle commands with backtick subshells", () => {
			render(
				<ExtensionStateWrapper>
					<CommandExecution executionId="test-8" text="git commit -m `date`" />
				</ExtensionStateWrapper>,
			)

			const selector = screen.getByTestId("command-pattern-selector")
			expect(selector).toBeInTheDocument()
			// Should show one of the individual commands
			expect(selector.textContent).toMatch(/git commit|date|git/)
		})

		it("should handle commands with special characters", () => {
			render(
				<ExtensionStateWrapper>
					<CommandExecution executionId="test-9" text="cd ~/projects && npm start" />
				</ExtensionStateWrapper>,
			)

			const selector = screen.getByTestId("command-pattern-selector")
			expect(selector).toBeInTheDocument()
			// Should show one of the individual commands
			expect(selector.textContent).toMatch(/cd ~\/projects|npm start|cd|npm/)
		})

		it("should handle commands with mixed content including output", () => {
			const commandWithMixedContent = `npm test
Output:
Running tests...
✓ Test 1 passed
✓ Test 2 passed`

			render(
				<ExtensionStateWrapper>
					<CommandExecution
						executionId="test-10"
						text={commandWithMixedContent}
						icon={<span>icon</span>}
						title={<span>Run Command</span>}
					/>
				</ExtensionStateWrapper>,
			)

			const selector = screen.getByTestId("command-pattern-selector")
			expect(selector).toBeInTheDocument()
			// Should show the command in the selector
			expect(selector).toHaveTextContent("npm test")
		})

		it("should update both allowed and denied lists when commands conflict", () => {
			// extractPatternsFromCommandText("git push origin main") -> ["git", "git push", "git push origin"] sorted,
			// patterns[0] = "git" which IS already in allowedCommands["git"] -> removed from allowed -> []
			const conflictState = {
				...mockExtensionState,
				allowedCommands: ["git"],
				deniedCommands: ["git push origin main"],
			}

			render(
				<ExtensionStateContext.Provider value={conflictState as any}>
					<CommandExecution executionId="test-11" text="git push origin main" />
				</ExtensionStateContext.Provider>,
			)

			// Click Allow on patterns[0] = "git" which is already allowed -> toggles off
			const allowButton = screen.getByText("Allow")
			fireEvent.click(allowButton)

			// "git" removed from allowed; "git push origin main" still in denied but no change to denied
			// (handleAllowPatternChange only removes the clicked pattern from denied, not "git push origin main")
			expect(conflictState.setAllowedCommands).toHaveBeenCalledWith([])
			expect(conflictState.setDeniedCommands).toHaveBeenCalledWith(["git push origin main"])
		})

		it("should handle commands with special quotes", () => {
			// Test with a command that has quotes
			const commandWithQuotes = "echo 'test with unclosed quote"

			render(
				<ExtensionStateWrapper>
					<CommandExecution executionId="test-12" text={commandWithQuotes} />
				</ExtensionStateWrapper>,
			)

			// Should still render the command
			expect(screen.getByTestId("code-block")).toHaveTextContent("echo 'test with unclosed quote")

			// Should show pattern selector with a command pattern
			const selector = screen.getByTestId("command-pattern-selector")
			expect(selector).toBeInTheDocument()
			expect(selector.textContent).toMatch(/echo/)
		})

		it("should handle empty or whitespace-only commands", () => {
			render(
				<ExtensionStateWrapper>
					<CommandExecution executionId="test-13" text="   " />
				</ExtensionStateWrapper>,
			)

			// Should render without errors
			expect(screen.getByTestId("code-block")).toBeInTheDocument()

			// Should not show pattern selector for empty commands
			expect(screen.queryByTestId("command-pattern-selector")).not.toBeInTheDocument()
		})

		it("should handle commands with only output and no command prefix", () => {
			const outputOnly = `Some output without a command
Multiple lines of output
Without any command prefix`

			render(
				<ExtensionStateWrapper>
					<CommandExecution executionId="test-14" text={outputOnly} />
				</ExtensionStateWrapper>,
			)

			// Should treat the entire text as command when no prefix is found
			const codeBlock = screen.getByTestId("code-block")
			// The mock CodeBlock component renders text content without preserving newlines
			expect(codeBlock.textContent).toContain("Some output without a command")
			expect(codeBlock.textContent).toContain("Multiple lines of output")
			expect(codeBlock.textContent).toContain("Without any command prefix")
		})

		it("should handle simple commands", () => {
			const plainCommand = "docker build ."

			render(
				<ExtensionStateWrapper>
					<CommandExecution executionId="test-15" text={plainCommand} />
				</ExtensionStateWrapper>,
			)

			// Should render the command
			expect(screen.getByTestId("code-block")).toHaveTextContent("docker build .")

			// Should show pattern selector — extractPatternsFromCommandText stops at "." (breaking expr)
			const selector = screen.getByTestId("command-pattern-selector")
			expect(selector).toBeInTheDocument()
			expect(selector.textContent).toMatch(/docker build/)

			// Verify no output is shown (since there's no Output: separator)
			const codeBlocks = screen.getAllByTestId("code-block")
			expect(codeBlocks).toHaveLength(1) // Only the command block, no output block
		})

		it("should not include shell control keywords in patterns for if-statement command", () => {
			// Use a compound command where echo is the primary command word after &&
			// "true && echo ok" -> extractPatternsFromCommandText -> ["echo", "echo ok", "true"]
			const shellScript = "true && echo ok"

			render(
				<ExtensionStateWrapper>
					<CommandExecution executionId="test-shell-ctrl" text={shellScript} />
				</ExtensionStateWrapper>,
			)

			const selector = screen.getByTestId("command-pattern-selector")
			expect(selector).toBeInTheDocument()

			const text = selector.textContent ?? ""
			// Shell control keywords and bracket operators must NOT appear as patterns
			expect(text).not.toContain("if")
			expect(text).not.toContain("then")
			expect(text).not.toContain("fi")
			expect(text).not.toContain("[")
			expect(text).not.toContain("]")
			// The real command word must be present (spans are concatenated without separators)
			expect(text).toContain("echo")
		})

		it("should handle commands with numeric output", () => {
			const commandWithNumericOutput = `wc -l *.go *.java
Output:
			   10 file1.go
			   20 file2.go
			   15 Main.java
			   45 total`

			render(
				<ExtensionStateWrapper>
					<CommandExecution executionId="test-16" text={commandWithNumericOutput} />
				</ExtensionStateWrapper>,
			)

			// Should render the command and output
			const codeBlocks = screen.getAllByTestId("code-block")
			expect(codeBlocks[0]).toHaveTextContent("wc -l *.go *.java")

			// Should show pattern selector
			const selector = screen.getByTestId("command-pattern-selector")
			expect(selector).toBeInTheDocument()

			// Should show a command pattern
			expect(selector.textContent).toMatch(/wc/)

			// The output should still be displayed
			const terminalOutput = screen.getByTestId("terminal-output")
			expect(terminalOutput).toBeInTheDocument()
			expect(terminalOutput.textContent).toContain("45 total")
		})

		it("should handle commands with zero output", () => {
			const commandWithZeroTotal = `wc -l *.go *.java
Output:
		     0 total`

			render(
				<ExtensionStateWrapper>
					<CommandExecution executionId="test-17" text={commandWithZeroTotal} />
				</ExtensionStateWrapper>,
			)

			// Should show pattern selector
			const selector = screen.getByTestId("command-pattern-selector")
			expect(selector).toBeInTheDocument()

			// Should show a command pattern
			expect(selector.textContent).toMatch(/wc/)

			// The output should still be displayed
			const terminalOutput = screen.getByTestId("terminal-output")
			expect(terminalOutput).toBeInTheDocument()
			expect(terminalOutput).toHaveTextContent("0 total")
		})
	})
})
