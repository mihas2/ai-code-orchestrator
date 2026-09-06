import * as path from "path"
import * as os from "os"
import * as fs from "fs/promises"

import { runTests } from "@vscode/test-electron"

async function main() {
	let testWorkspace: string | undefined

	try {
		// The folder containing the Extension Manifest package.json
		// Passed to `--extensionDevelopmentPath`
		const extensionDevelopmentPath = path.resolve(__dirname, "../../../src")

		// The path to the extension test script
		// Passed to --extensionTestsPath
		const extensionTestsPath = path.resolve(__dirname, "./suite/index")

		// Create a temporary workspace folder for tests
		testWorkspace = await fs.mkdtemp(path.join(os.tmpdir(), "aico-test-workspace-"))

		// Get test filter from command line arguments or environment variable
		const testGrep = process.argv.find((arg, i) => process.argv[i - 1] === "--grep") || process.env.TEST_GREP
		const testFile = process.argv.find((arg, i) => process.argv[i - 1] === "--file") || process.env.TEST_FILE

		const extensionTestsEnv = {
			...process.env,
			AICO_E2E: "1",
			// Codex/VS Code terminals can export this flag, which makes the Electron
			// executable treat the workspace path as a Node entry module.
			ELECTRON_RUN_AS_NODE: undefined,
			...(testGrep && { TEST_GREP: testGrep }),
			...(testFile && { TEST_FILE: testFile }),
		}

		await runTests({
			extensionDevelopmentPath,
			extensionTestsPath,
			launchArgs: [testWorkspace],
			extensionTestsEnv,
			version: process.env.VSCODE_VERSION || "1.101.2",
		})
	} catch (error) {
		console.error("Failed to run tests", error)
		process.exitCode = 1
	} finally {
		if (testWorkspace) {
			await fs.rm(testWorkspace, { recursive: true, force: true })
		}
	}
}

main()
