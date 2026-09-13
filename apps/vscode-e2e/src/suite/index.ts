import * as path from "path"
import Mocha from "mocha"
import { glob } from "glob"
import * as vscode from "vscode"

import type { AiCodeOrchestratorAPI } from "@ai-code-orchestrator/types"

import { MockAIProvider } from "./mock-provider"
import { waitFor } from "./utils"

export async function run() {
	const extension = vscode.extensions.getExtension<AiCodeOrchestratorAPI>("mihas2.ai-code-orchestrator")

	if (!extension) {
		throw new Error("Extension not found")
	}

	const api = extension.isActive ? extension.exports : await extension.activate()
	const mockProvider = new MockAIProvider()

	await api.setConfiguration({
		apiProvider: "fake-ai" as const,
		apiModelId: "mock-e2e-model",
		fakeAi: mockProvider,
	})

	await vscode.commands.executeCommand("ai-code-orchestrator.SidebarProvider.focus")
	await waitFor(() => api.isReady(), { timeout: 120_000 })

	globalThis.api = api

	const mochaOptions: Mocha.MochaOptions = {
		ui: "tdd",
		timeout: 20 * 60 * 1_000, // 20m
	}

	if (process.env.TEST_GREP) {
		mochaOptions.grep = process.env.TEST_GREP
		console.log(`Running tests matching pattern: ${process.env.TEST_GREP}`)
	}

	const mocha = new Mocha(mochaOptions)
	const cwd = path.resolve(__dirname, "..")

	let testFiles: string[]

	if (process.env.TEST_FILE) {
		const specificFile = process.env.TEST_FILE.endsWith(".js")
			? process.env.TEST_FILE
			: `${process.env.TEST_FILE}.js`

		testFiles = await glob(`**/${specificFile}`, { cwd })
		console.log(`Running specific test file: ${specificFile}`)
	} else {
		testFiles = await glob("**/**.test.js", { cwd })
	}

	if (testFiles.length === 0) {
		throw new Error(`No test files found matching criteria: ${process.env.TEST_FILE || "all tests"}`)
	}

	testFiles.forEach((testFile) => mocha.addFile(path.resolve(cwd, testFile)))

	return new Promise<void>((resolve, reject) =>
		mocha.run((failures) => (failures === 0 ? resolve() : reject(new Error(`${failures} tests failed.`)))),
	)
}
