import path from "path"
import { AicoProtectedController } from "../AicoProtectedController"

describe("AicoProtectedController", () => {
	const TEST_CWD = "/test/workspace"
	let controller: AicoProtectedController

	beforeEach(() => {
		controller = new AicoProtectedController(TEST_CWD)
	})

	describe("isWriteProtected", () => {
		it("should protect .aicoignore file", () => {
			expect(controller.isWriteProtected(".aicoignore")).toBe(true)
		})

		it("should protect files in .ai-code-orchestrator directory", () => {
			expect(controller.isWriteProtected(".ai-code-orchestrator/config.json")).toBe(true)
			expect(controller.isWriteProtected(".ai-code-orchestrator/settings/user.json")).toBe(true)
			expect(controller.isWriteProtected(".ai-code-orchestrator/modes/custom.json")).toBe(true)
		})

		it("should protect .aicoprotected file", () => {
			expect(controller.isWriteProtected(".aicoprotected")).toBe(true)
		})

		it("should protect .agent-modes files", () => {
			expect(controller.isWriteProtected(".agent-modes")).toBe(true)
		})

		it("should protect .aicorules* files", () => {
			expect(controller.isWriteProtected(".aicorules")).toBe(true)
			expect(controller.isWriteProtected(".aicorules.md")).toBe(true)
		})

		it("should protect .clinerules* files", () => {
			expect(controller.isWriteProtected(".clinerules")).toBe(true)
			expect(controller.isWriteProtected(".clinerules.md")).toBe(true)
		})

		it("should protect files in .vscode directory", () => {
			expect(controller.isWriteProtected(".vscode/settings.json")).toBe(true)
			expect(controller.isWriteProtected(".vscode/launch.json")).toBe(true)
			expect(controller.isWriteProtected(".vscode/tasks.json")).toBe(true)
		})

		it("should protect .code-workspace files", () => {
			expect(controller.isWriteProtected("myproject.code-workspace")).toBe(true)
			expect(controller.isWriteProtected("pentest.code-workspace")).toBe(true)
			expect(controller.isWriteProtected(".code-workspace")).toBe(true)
			expect(controller.isWriteProtected("folder/workspace.code-workspace")).toBe(true)
		})

		it("should protect AGENTS.md file", () => {
			expect(controller.isWriteProtected("AGENTS.md")).toBe(true)
		})

		it("should protect AGENT.md file", () => {
			expect(controller.isWriteProtected("AGENT.md")).toBe(true)
		})

		it("should not protect other files starting with .ai-code-orchestrator", () => {
			expect(controller.isWriteProtected(".legacysettings")).toBe(false)
			expect(controller.isWriteProtected(".legacyconfig")).toBe(false)
		})

		it("should not protect regular files", () => {
			expect(controller.isWriteProtected("src/index.ts")).toBe(false)
			expect(controller.isWriteProtected("package.json")).toBe(false)
			expect(controller.isWriteProtected("README.md")).toBe(false)
		})

		it("should not protect files that contain 'aico' but don't start with .ai-code-orchestrator", () => {
			expect(controller.isWriteProtected("src/aico-utils.ts")).toBe(false)
			expect(controller.isWriteProtected("config/aico.config.js")).toBe(false)
		})

		it("should handle nested paths correctly", () => {
			expect(controller.isWriteProtected(".ai-code-orchestrator/config.json")).toBe(true) // .ai-code-orchestrator/** matches at root
			expect(controller.isWriteProtected("nested/.aicoignore")).toBe(true) // .aicoignore matches anywhere by default
			expect(controller.isWriteProtected("nested/.agent-modes")).toBe(true) // .agent-modes matches anywhere by default
			expect(controller.isWriteProtected("nested/.aicorules.md")).toBe(true) // .aicorules* matches anywhere by default
		})

		it("should handle absolute paths by converting to relative", () => {
			const absolutePath = path.join(TEST_CWD, ".aicoignore")
			expect(controller.isWriteProtected(absolutePath)).toBe(true)
		})

		it("should handle paths with different separators", () => {
			expect(controller.isWriteProtected(".ai-code-orchestrator\\config.json")).toBe(true)
			expect(controller.isWriteProtected(".ai-code-orchestrator/config.json")).toBe(true)
		})

		it("should not throw for absolute paths outside cwd", () => {
			expect(controller.isWriteProtected("/tmp/comment-2-pr63.json")).toBe(false)
			expect(controller.isWriteProtected("/etc/passwd")).toBe(false)
		})
	})

	describe("getProtectedFiles", () => {
		it("should return set of protected files from a list", () => {
			const files = [
				"src/index.ts",
				".aicoignore",
				"package.json",
				".ai-code-orchestrator/config.json",
				"README.md",
			]

			const protectedFiles = controller.getProtectedFiles(files)

			expect(protectedFiles).toEqual(new Set([".aicoignore", ".ai-code-orchestrator/config.json"]))
		})

		it("should return empty set when no files are protected", () => {
			const files = ["src/index.ts", "package.json", "README.md"]

			const protectedFiles = controller.getProtectedFiles(files)

			expect(protectedFiles).toEqual(new Set())
		})
	})

	describe("annotatePathsWithProtection", () => {
		it("should annotate paths with protection status", () => {
			const files = ["src/index.ts", ".aicoignore", ".ai-code-orchestrator/config.json", "package.json"]

			const annotated = controller.annotatePathsWithProtection(files)

			expect(annotated).toEqual([
				{ path: "src/index.ts", isProtected: false },
				{ path: ".aicoignore", isProtected: true },
				{ path: ".ai-code-orchestrator/config.json", isProtected: true },
				{ path: "package.json", isProtected: false },
			])
		})
	})

	describe("getProtectionMessage", () => {
		it("should return appropriate protection message", () => {
			const message = controller.getProtectionMessage()
			expect(message).toBe(
				"This is a AI Code Orchestrator configuration file and requires approval for modifications",
			)
		})
	})

	describe("getInstructions", () => {
		it("should return formatted instructions about protected files", () => {
			const instructions = controller.getInstructions()

			expect(instructions).toContain("# Protected Files")
			expect(instructions).toContain("write-protected")
			expect(instructions).toContain(".aicoignore")
			expect(instructions).toContain(".ai-code-orchestrator/**")
			expect(instructions).toContain("\u{1F6E1}") // Shield symbol
		})
	})

	describe("getProtectedPatterns", () => {
		it("should return the list of protected patterns", () => {
			const patterns = AicoProtectedController.getProtectedPatterns()

			expect(patterns).toEqual([
				".aicoignore",
				".agent-modes",
				".aicorules*",
				".clinerules*",
				".ai-code-orchestrator/**",
				".vscode/**",
				"*.code-workspace",
				".aicoprotected",
				"AGENTS.md",
				"AGENT.md",
			])
		})
	})
})
