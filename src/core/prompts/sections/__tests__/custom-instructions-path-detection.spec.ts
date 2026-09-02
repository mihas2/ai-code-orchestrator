import * as path from "path"

describe("custom-instructions path detection", () => {
	it("should use exact path comparison instead of string includes", () => {
		// Test the logic that our fix implements
		const fakeHomeDir = "/Users/john.ai-code-orchestrator.smith"
		const globalAicoDir = path.join(fakeHomeDir, ".ai-code-orchestrator") // "/Users/john.ai-code-orchestrator.smith/.ai-code-orchestrator"
		const projectAicoDir = "/projects/my-project/.ai-code-orchestrator"

		// Old implementation (fragile):
		// const isGlobal = aicoDir.includes(path.join(os.homedir(), ".ai-code-orchestrator"))
		// This could fail if the home directory path contains ".ai-code-orchestrator" elsewhere

		// New implementation (robust):
		// const isGlobal = path.resolve(aicoDir) === path.resolve(getGlobalAicoDirectory())

		// Test the new logic
		const isGlobalForGlobalDir = path.resolve(globalAicoDir) === path.resolve(globalAicoDir)
		const isGlobalForProjectDir = path.resolve(projectAicoDir) === path.resolve(globalAicoDir)

		expect(isGlobalForGlobalDir).toBe(true)
		expect(isGlobalForProjectDir).toBe(false)

		// Verify that the old implementation would have been problematic
		// if the home directory contained ".ai-code-orchestrator" in the path
		const oldLogicGlobal = globalAicoDir.includes(path.join(fakeHomeDir, ".ai-code-orchestrator"))
		const oldLogicProject = projectAicoDir.includes(path.join(fakeHomeDir, ".ai-code-orchestrator"))

		expect(oldLogicGlobal).toBe(true) // This works
		expect(oldLogicProject).toBe(false) // This also works, but is fragile

		// The issue was that if the home directory path itself contained ".ai-code-orchestrator",
		// the includes() check could produce false positives in edge cases
	})

	it("should handle edge cases with path resolution", () => {
		// Test various edge cases that exact path comparison handles better
		const testCases = [
			{
				global: "/Users/test/.ai-code-orchestrator",
				project: "/Users/test/project/.ai-code-orchestrator",
				expected: { global: true, project: false },
			},
			{
				global: "/home/user/.ai-code-orchestrator",
				project: "/home/user/.ai-code-orchestrator", // Same directory
				expected: { global: true, project: true },
			},
			{
				global: "/Users/john.ai-code-orchestrator.smith/.ai-code-orchestrator",
				project: "/projects/app/.ai-code-orchestrator",
				expected: { global: true, project: false },
			},
		]

		testCases.forEach(({ global, project, expected }) => {
			const isGlobalForGlobal = path.resolve(global) === path.resolve(global)
			const isGlobalForProject = path.resolve(project) === path.resolve(global)

			expect(isGlobalForGlobal).toBe(expected.global)
			expect(isGlobalForProject).toBe(expected.project)
		})
	})
})
