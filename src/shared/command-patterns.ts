import { parse } from "shell-quote"
import type { ShellToken } from "./parse-command"

/**
 * Shell control keywords and operators that should never be saved as allowed commands.
 */
const SHELL_CONTROL_KEYWORDS = new Set([
	"if",
	"then",
	"else",
	"elif",
	"fi",
	"for",
	"while",
	"until",
	"do",
	"done",
	"case",
	"esac",
	"in",
	"select",
	"function",
	"time",
	"!",
	"[[",
	"]]",
	"[",
	"]",
	"{",
	"}",
])

const SHELL_OPERATORS = new Set(["&&", "||", ";", "|", "&", ">>", ">", "<", "<<"])

/**
 * Extract meaningful command patterns from a command string for use in allowedCommands.
 * Only extracts primary commands and meaningful prefixes (up to 3 levels deep).
 * Skips shell control keywords, operators, subshell commands, numeric strings, etc.
 *
 * This is intentionally separate from parse-command.ts (which handles auto-approval parsing)
 * to avoid accidental breakage of security-relevant auto-approval logic.
 */
export function extractPatternsFromCommandText(command: string): string[] {
	if (!command?.trim()) return []

	const patterns = new Set<string>()

	// Split by newlines, process each line
	const lines = command.split(/\r\n|\r|\n/)
	for (const line of lines) {
		const trimmed = line.trim()
		if (trimmed) {
			extractFromLine(trimmed, patterns)
		}
	}

	return Array.from(patterns).sort()
}

function extractFromLine(line: string, patterns: Set<string>): void {
	let tokens: ShellToken[]
	try {
		tokens = parse(line) as ShellToken[]
	} catch {
		// Fallback: just take the first word
		const first = line.trim().split(/\s+/)[0]
		if (first && isValidCommandWord(first)) {
			patterns.add(first)
		}
		return
	}

	// Walk tokens, accumulate per-command token sequences split at operators
	let currentTokens: string[] = []

	for (const token of tokens) {
		if (typeof token === "object" && "op" in token) {
			// Operator — flush current command
			if (currentTokens.length > 0) {
				extractFromTokens(currentTokens, patterns)
				currentTokens = []
			}
		} else if (typeof token === "object" && "command" in token) {
			// Subshell / process substitution — flush current, do NOT save inner command
			if (currentTokens.length > 0) {
				extractFromTokens(currentTokens, patterns)
				currentTokens = []
			}
			// Do NOT recurse into subshell — we explicitly skip inner commands
		} else if (typeof token === "object" && "comment" in token) {
			// Skip comments
			continue
		} else if (typeof token === "string") {
			// Skip placeholder tokens from shell-quote substitutions
			if (/^__[A-Z]+_\d+__$/.test(token)) continue
			// Add token to current command sequence
			currentTokens.push(token)
		}
	}

	if (currentTokens.length > 0) {
		extractFromTokens(currentTokens, patterns)
	}
}

function extractFromTokens(tokens: string[], patterns: Set<string>): void {
	if (tokens.length === 0) return

	const mainCmd = tokens[0]
	if (!isValidCommandWord(mainCmd)) return

	patterns.add(mainCmd)

	// Breaking expressions — stop looking for subcommands
	const breakingExps = [/^-/, /[/:.~ ]/]

	const maxLevels = Math.min(tokens.length, 3)
	for (let i = 1; i < maxLevels; i++) {
		const arg = tokens[i]
		if (typeof arg !== "string" || !isValidCommandWord(arg)) break
		if (breakingExps.some((re) => re.test(arg))) break

		const pattern = tokens.slice(0, i + 1).join(" ")
		patterns.add(pattern.trim())
	}
}

/**
 * Returns true if the token is a valid command word that can be saved as an allowed command.
 * Rejects: shell control keywords, operators, numeric strings, empty strings.
 */
function isValidCommandWord(word: string): boolean {
	if (!word || !word.trim()) return false
	// Reject shell control keywords
	if (SHELL_CONTROL_KEYWORDS.has(word)) return false
	// Reject operators
	if (SHELL_OPERATORS.has(word)) return false
	// Reject purely numeric strings like "0"
	if (/^\d+$/.test(word)) return false
	// Reject subshell substitutions $(...) or backticks — these come as objects usually,
	// but guard against any string that starts with $( or `
	if (/^\$\(/.test(word) || /^`/.test(word)) return false
	return true
}
