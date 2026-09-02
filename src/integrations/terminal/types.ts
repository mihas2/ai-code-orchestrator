import EventEmitter from "events"

export type AicoTerminalProvider = "vscode" | "execa"

export interface AicoTerminal {
	provider: AicoTerminalProvider
	id: number
	busy: boolean
	running: boolean
	taskId?: string
	process?: AicoTerminalProcess
	getCurrentWorkingDirectory(): string
	isClosed: () => boolean
	runCommand: (command: string, callbacks: AicoTerminalCallbacks) => AicoTerminalProcessResultPromise
	setActiveStream(stream: AsyncIterable<string> | undefined, pid?: number): void
	shellExecutionComplete(exitDetails: ExitCodeDetails): void
	getProcessesWithOutput(): AicoTerminalProcess[]
	getUnretrievedOutput(): string
	getLastCommand(): string
	cleanCompletedProcessQueue(): void
}

export interface AicoTerminalCallbacks {
	onLine: (line: string, process: AicoTerminalProcess) => void
	onCompleted: (output: string | undefined, process: AicoTerminalProcess) => void | Promise<void>
	onShellExecutionStarted: (pid: number | undefined, process: AicoTerminalProcess) => void
	onShellExecutionComplete: (details: ExitCodeDetails, process: AicoTerminalProcess) => void
	onNoShellIntegration?: (message: string, process: AicoTerminalProcess) => void
}

export interface AicoTerminalProcess extends EventEmitter<AicoTerminalProcessEvents> {
	command: string
	isHot: boolean
	run: (command: string) => Promise<void>
	continue: () => void
	abort: () => void
	hasUnretrievedOutput: () => boolean
	getUnretrievedOutput: () => string
	trimRetrievedOutput: () => void
}

export type AicoTerminalProcessResultPromise = AicoTerminalProcess & Promise<void>

export interface AicoTerminalProcessEvents {
	line: [line: string]
	continue: []
	completed: [output?: string]
	stream_available: [stream: AsyncIterable<string>]
	shell_execution_started: [pid: number | undefined]
	shell_execution_complete: [exitDetails: ExitCodeDetails]
	error: [error: Error]
	no_shell_integration: [message: string]
}

export interface ExitCodeDetails {
	exitCode: number | undefined
	signal?: number | undefined
	signalName?: string
	coreDumpPossible?: boolean
}
