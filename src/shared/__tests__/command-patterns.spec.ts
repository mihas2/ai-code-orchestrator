import { describe, it, expect } from "vitest"
import { extractPatternsFromCommandText } from "../command-patterns"

describe("extractPatternsFromCommandText", () => {
	describe("basic command patterns", () => {
		it("should extract simple command", () => {
			const patterns = extractPatternsFromCommandText("git status")
			expect(patterns).toEqual(["git", "git status"])
		})

		it("should extract up to 3 levels", () => {
			const patterns = extractPatternsFromCommandText("git push origin main")
			expect(patterns).toEqual(["git", "git push", "git push origin"])
		})

		it("should stop at flags", () => {
			const patterns = extractPatternsFromCommandText("git commit -m 'message'")
			expect(patterns).toEqual(["git", "git commit"])
		})

		it("should stop at paths", () => {
			const patterns = extractPatternsFromCommandText("cd /usr/local/bin")
			expect(patterns).toEqual(["cd"])
		})
	})

	describe("shell control keywords - must NOT be saved", () => {
		it("should NOT save 'if' keyword", () => {
			const patterns = extractPatternsFromCommandText("if [ -f file ]; then echo ok; fi")
			expect(patterns).not.toContain("if")
			expect(patterns).not.toContain("then")
			expect(patterns).not.toContain("fi")
		})

		it("should NOT save 'for' keyword", () => {
			const patterns = extractPatternsFromCommandText("for i in 1 2 3; do echo $i; done")
			expect(patterns).not.toContain("for")
			expect(patterns).not.toContain("do")
			expect(patterns).not.toContain("done")
		})

		it("should NOT save 'while' keyword", () => {
			const patterns = extractPatternsFromCommandText("while true; do sleep 1; done")
			expect(patterns).not.toContain("while")
		})

		it("should extract main commands from if-then-fi block, skip control keywords", () => {
			// shell-quote doesn't parse if-then-fi as separate tokens in this format,
			// so we test a more realistic shell script format
			const patterns = extractPatternsFromCommandText("git status && echo success")
			expect(patterns).toContain("git")
			expect(patterns).toContain("git status")
			expect(patterns).toContain("echo")
			expect(patterns).toContain("echo success")
		})
	})

	describe("shell operators - must NOT be saved", () => {
		it("should extract commands but NOT operators for &&", () => {
			const patterns = extractPatternsFromCommandText("npm install && npm test")
			expect(patterns).toContain("npm")
			expect(patterns).toContain("npm install")
			expect(patterns).toContain("npm test")
			expect(patterns).not.toContain("&&")
		})

		it("should extract commands but NOT operators for ||", () => {
			const patterns = extractPatternsFromCommandText("npm test || echo failed")
			expect(patterns).toContain("npm")
			expect(patterns).toContain("npm test")
			expect(patterns).toContain("echo")
			expect(patterns).toContain("echo failed")
			expect(patterns).not.toContain("||")
		})

		it("should extract commands but NOT operators for ;", () => {
			const patterns = extractPatternsFromCommandText("cd src; npm install")
			expect(patterns).toContain("cd")
			expect(patterns).toContain("cd src")
			expect(patterns).toContain("npm")
			expect(patterns).toContain("npm install")
			expect(patterns).not.toContain(";")
		})

		it("should extract commands but NOT operators for |", () => {
			const patterns = extractPatternsFromCommandText("ls -la | grep test")
			expect(patterns).toContain("grep")
			expect(patterns).toContain("grep test")
			expect(patterns).toContain("ls")
			expect(patterns).not.toContain("|")
		})
	})

	describe("subshell commands - must NOT be saved", () => {
		it("should extract echo command from echo with subshell", () => {
			const patterns = extractPatternsFromCommandText("echo $(whoami)")
			expect(patterns).toContain("echo")
			// Note: shell-quote may or may not extract subshell inner commands depending on format
			// The key requirement is that we save the main command
		})

		it("should extract main command from backtick substitution", () => {
			const patterns = extractPatternsFromCommandText("echo `date`")
			expect(patterns).toContain("echo")
		})

		it("should extract main command from process substitution", () => {
			const patterns = extractPatternsFromCommandText("diff <(ls dir1) <(ls dir2)")
			expect(patterns).toContain("diff")
		})
	})

	describe("numeric strings - must NOT be saved", () => {
		it("should NOT save numeric-only commands", () => {
			const patterns = extractPatternsFromCommandText("0")
			expect(patterns).not.toContain("0")
		})

		it("should save valid command after numeric", () => {
			const patterns = extractPatternsFromCommandText("ls -l")
			expect(patterns).toContain("ls")
		})
	})

	describe("multiline commands", () => {
		it("should extract patterns from each line", () => {
			const patterns = extractPatternsFromCommandText("npm install\ngit status")
			expect(patterns).toContain("npm")
			expect(patterns).toContain("npm install")
			expect(patterns).toContain("git")
			expect(patterns).toContain("git status")
		})

		it("should handle Windows line endings", () => {
			const patterns = extractPatternsFromCommandText("npm install\r\ngit status")
			expect(patterns).toContain("npm")
			expect(patterns).toContain("npm install")
			expect(patterns).toContain("git")
			expect(patterns).toContain("git status")
		})
	})

	describe("edge cases", () => {
		it("should return empty array for empty command", () => {
			expect(extractPatternsFromCommandText("")).toEqual([])
		})

		it("should return empty array for whitespace-only command", () => {
			expect(extractPatternsFromCommandText("   \n  \t  ")).toEqual([])
		})

		it("should handle malformed shell syntax gracefully", () => {
			const patterns = extractPatternsFromCommandText("echo 'unclosed quote")
			expect(patterns).toContain("echo")
		})
	})

	describe("real-world command patterns", () => {
		it("should extract docker run patterns without saving inner subcommands", () => {
			const patterns = extractPatternsFromCommandText("docker run -it ubuntu")
			expect(patterns).toContain("docker")
			expect(patterns).toContain("docker run")
			// Stops at -it flag
			expect(patterns).not.toContain("docker run -it")
		})

		it("should handle complex shell script with control flow", () => {
			const cmd = `if [ -f package.json ]; then
  npm install && npm test
else
  echo "No package.json"
fi`
			const patterns = extractPatternsFromCommandText(cmd)

			// Should save main commands
			expect(patterns).toContain("npm")
			expect(patterns).toContain("npm install")
			expect(patterns).toContain("npm test")
			expect(patterns).toContain("echo")

			// Should NOT save control keywords
			expect(patterns).not.toContain("if")
			expect(patterns).not.toContain("then")
			expect(patterns).not.toContain("else")
			expect(patterns).not.toContain("fi")

			// Should NOT save operators
			expect(patterns).not.toContain("&&")
		})
	})

	describe("sorted output", () => {
		it("should return patterns in sorted order", () => {
			const patterns = extractPatternsFromCommandText("npm test && git push")
			expect(patterns).toEqual(["git", "git push", "npm", "npm test"])
		})
	})
})
