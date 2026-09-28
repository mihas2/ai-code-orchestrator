import { DEFAULT_MODES, modeConfigSchema } from "../mode.js"

const architect = DEFAULT_MODES.find((mode) => mode.slug === "architect")
const ask = DEFAULT_MODES.find((mode) => mode.slug === "ask")
const code = DEFAULT_MODES.find((mode) => mode.slug === "code")
const debug = DEFAULT_MODES.find((mode) => mode.slug === "debug")
const reviewer = DEFAULT_MODES.find((mode) => mode.slug === "reviewer")
const orchestrator = DEFAULT_MODES.find((mode) => mode.slug === "orchestrator")

describe("role prompts unification", () => {
	describe("canonical operational prompts", () => {
		it("all built-in modes have non-empty operational prompts", () => {
			for (const mode of DEFAULT_MODES) {
				expect(mode.roleDefinition.trim()).not.toHaveLength(0)
				expect(mode.whenToUse?.trim()).not.toHaveLength(0)
				expect(mode.customInstructions?.trim()).not.toHaveLength(0)
			}
		})

		it("operational fields contain no Cyrillic", () => {
			for (const mode of DEFAULT_MODES) {
				expect(mode.roleDefinition).not.toMatch(/[а-яА-ЯёЁ]/)
				expect(mode.whenToUse).not.toMatch(/[а-яА-ЯёЁ]/)
				expect(mode.description).not.toMatch(/[а-яА-ЯёЁ]/)
				expect(mode.customInstructions).not.toMatch(/[а-яА-ЯёЁ]/)
			}
		})
	})

	describe("role invariants", () => {
		it("Code stays a prepared, bounded implementation with tests and scope", () => {
			const instructions = code?.customInstructions ?? ""
			expect(code?.whenToUse).toContain("prepared")
			expect(instructions).toContain("requested behavior")
			expect(instructions).toContain("not automatically only the initially named files")
			expect(instructions).toContain("Necessary related callers, types, and tests")
			expect(instructions).toContain("explicit file allowlist or exclusions")
			expect(instructions).toContain("Never bypass an explicit scope")
			expect(instructions).toContain("Before editing, inspect the relevant implementation, callers, and tests")
			expect(instructions).toContain("avoid unrelated exploration")
			expect(instructions).toContain("routine reversible local decisions")
			expect(instructions).toContain("repository conventions")
			expect(instructions).toContain("without escalation")
			expect(instructions).toContain("Escalate only material uncertainty")
			expect(instructions).toContain("compact scope")
			expect(instructions).toContain("regression tests")
		})

		it("Architect stays planning only", () => {
			expect(architect?.customInstructions).toContain("planning, not implementation")
			expect(architect?.customInstructions).toContain("do not edit production code")
		})

		it("Ask stays read only", () => {
			expect(ask?.whenToUse).toContain("read-only")
			expect(ask?.customInstructions).toContain("without making changes")
		})

		it("Debug stays focused and confirms the diagnosis", () => {
			expect(debug?.whenToUse).toContain("focused diagnosis")
			expect(debug?.whenToUse).toContain("intermittent or unexplained failures")
			expect(debug?.whenToUse).toContain("obtaining a reproduction")
			expect(debug?.whenToUse).toContain("Absence of a reproduction is not a blocker")
			expect(debug?.customInstructions).toContain("confirm the diagnosis before fixing")
		})

		it("Reviewer keeps the checklist, read-only review, and contracts", () => {
			const instructions = reviewer?.customInstructions ?? ""
			expect(instructions).toContain("Use this checklist internally")
			expect(instructions).toContain("do not print it for a clean review")
			expect(instructions).toContain("do not print the checklist")
			expect(instructions).toContain("actionable, evidence-backed findings")
			expect(instructions).toContain("Do not invent findings")
			expect(instructions).toContain("Distinguish confirmed defects from unverified concerns")
			expect(instructions).toContain("map each supplied acceptance criterion to evidence")
			expect(instructions).toContain("edge cases and error handling")
			expect(instructions).toContain("actual test results and exit status")
			expect(instructions).toContain("secrets, privilege escalation, file scope, and unsafe commands")
			expect(instructions).toContain("Do not modify code")
			expect(instructions).toContain("ordinary review may proceed without a contract")
			expect(instructions).toContain("When the workflow requires it")
			expect(instructions).toContain("ResultContract")
		})

		it("Orchestrator keeps a minimal workflow, cohesive outcomes, and gates", () => {
			const instructions = orchestrator?.customInstructions ?? ""
			expect(instructions).toContain("smallest sufficient workflow")
			expect(instructions).toContain("effective instructions")
			expect(instructions).toContain("Keep tightly coupled implementation and tests together")
			expect(instructions).toContain("cohesive, independently verifiable outcomes")
			expect(instructions).toContain("separate outcome, uncertainty, or context burden")
			expect(instructions).toContain("not merely to involve roles")
			expect(instructions).toContain("Re-use accepted decisions")
			expect(instructions).toContain("file or line counts")
			expect(instructions).toContain("not into one whole-project Code task")
			expect(instructions).toContain("translation of text and documentation")
			expect(instructions).toContain("translation-only work to Translate")
			expect(instructions).toContain("Code handles technical i18n integration")
			expect(instructions).toContain("effective instructions")
			expect(instructions).toContain("acceptance criteria with corresponding checks proportionate to the task")
			expect(instructions).not.toContain("acceptance criteria or checks")
			expect(instructions).toContain("only necessary context")
			expect(instructions).toContain("prerequisites are verified")
			expect(instructions).toContain("verify every root acceptance criterion")
			expect(instructions).toContain("incomplete, not success")
			expect(instructions).not.toMatch(/simple[\s\S]*moderate[\s\S]*complex/)
			expect(instructions).not.toContain("STEP 1")
		})

		it("inspects with commands and MCP without treating tool access as execution", () => {
			const instructions = orchestrator?.customInstructions ?? ""
			expect(orchestrator?.roleDefinition).toContain(
				"You investigate, delegate, and verify outcomes; specialists perform implementation and operational work.",
			)
			expect(instructions).toContain(
				"Use read access, commands, and MCP only for bounded inspection of existing code, configuration, diffs, logs, and results",
			)
			expect(instructions).toContain("Tool access is not permission to execute the work yourself.")
			expect(instructions).not.toContain("Do not write code yourself.")
		})

		it("delegates tests, builds, commits, and other execution instead of switching into it", () => {
			const instructions = orchestrator?.customInstructions ?? ""
			expect(instructions).toContain(
				"builds and test execution, commits, deployments, and other state-changing operations",
			)
			expect(instructions).toContain("even when they seem trivial or can be done through a command or MCP")
			expect(instructions).toContain("Do not bypass delegation by switching yourself into an executor role.")
			expect(instructions).toContain("Delegate execution to the appropriate specialist.")
		})

		it("keeps accountability and read, command, and mcp access without edit", () => {
			const instructions = orchestrator?.customInstructions ?? ""
			expect(instructions).toContain(
				"Remain accountable for quality and completion; a worker report alone is not proof.",
			)
			expect(instructions).toContain("Check artifacts and evidence; worker completion is not proof.")
			expect(instructions).toContain("verify every root acceptance criterion")
			expect(orchestrator?.groups).toEqual(["read", "command", "mcp"])
			expect(orchestrator?.groups).not.toContain("edit")
		})

		it("routes independent review to reviewer without substituting Architect or Debug", () => {
			const instructions = orchestrator?.customInstructions ?? ""
			const roleMapEnd = instructions.indexOf("Role map:")
			const reviewRule = instructions.indexOf(
				"Route independent review of completed work and review-only requests",
			)
			expect(roleMapEnd).toBeGreaterThanOrEqual(0)
			expect(reviewRule).toBeGreaterThan(roleMapEnd)
			expect(instructions).toContain(
				"Route independent review of completed work and review-only requests to `reviewer`, not Architect or Debug as substitutes. Architect handles design decisions; Debug handles diagnosis. Use the current MODES catalog and exact slugs when delegating; tool parameter examples are not an exhaustive list. Do not claim a listed mode is unavailable without evidence from an actual tool failure. If a mode is genuinely unavailable or its effective instructions conflict with the requested review, report the blocker rather than silently substituting another role.",
			)
			expect(instructions).toContain("proportionate to risk")
			expect(instructions).not.toContain("review every")
			expect(instructions).not.toContain("always review")
		})
	})

	describe("UI metadata schema", () => {
		it("ui metadata is optional in schema", () => {
			const modeWithoutUi = {
				slug: "test",
				name: "Test",
				roleDefinition: "Test role",
				groups: ["read"],
			}
			expect(() => modeConfigSchema.parse(modeWithoutUi)).not.toThrow()
		})

		it("ui metadata fields are all optional", () => {
			const modeWithPartialUi = {
				slug: "test",
				name: "Test",
				roleDefinition: "Test role",
				groups: ["read"],
				ui: { nameKey: "test.name" },
			}
			expect(() => modeConfigSchema.parse(modeWithPartialUi)).not.toThrow()
		})

		it("reviewer has UI metadata with notice keys", () => {
			expect(reviewer?.ui).toBeDefined()
			expect(reviewer?.ui?.nameKey).toBe("reviewer.name")
			expect(reviewer?.ui?.descriptionKey).toBe("reviewer.description")
			expect(reviewer?.ui?.noticeKeys).toEqual(["reviewer.readOnlyNotice", "reviewer.findingSeverities"])
		})

		it("orchestrator has UI metadata without notice keys", () => {
			expect(orchestrator?.ui).toBeDefined()
			expect(orchestrator?.ui?.nameKey).toBe("orchestrator.name")
			expect(orchestrator?.ui?.descriptionKey).toBe("orchestrator.description")
			expect(orchestrator?.ui?.noticeKeys).toBeUndefined()
		})

		it("other modes do not have UI metadata", () => {
			expect(code?.ui).toBeUndefined()
			expect(architect?.ui).toBeUndefined()
			expect(ask?.ui).toBeUndefined()
			expect(debug?.ui).toBeUndefined()
			expect(DEFAULT_MODES.find((mode) => mode.slug === "translate")?.ui).toBeUndefined()
		})
	})

	describe("operational vs UI separation", () => {
		it("roleDefinition/whenToUse/customInstructions are operational, not UI keys", () => {
			// These are actual prompt content, not i18n keys
			expect(orchestrator?.roleDefinition).not.toMatch(/^[a-z]+\.[a-z]+$/)
			expect(orchestrator?.whenToUse).not.toMatch(/^[a-z]+\.[a-z]+$/)
			expect(orchestrator?.customInstructions).not.toMatch(/^[a-z]+\.[a-z]+$/)
		})

		it("ui metadata values are i18n keys, not operational content", () => {
			expect(reviewer?.ui?.nameKey).toMatch(/^[a-z]+\.[a-z]+$/)
			expect(reviewer?.ui?.descriptionKey).toMatch(/^[a-z]+\.[a-z]+$/)
			reviewer?.ui?.noticeKeys?.forEach((key) => {
				expect(key).toMatch(/^[a-z]+\.[a-zA-Z]+$/)
			})
		})
	})
})

describe("built-in mode list", () => {
	it("pins the exact DEFAULT_MODES slug order", () => {
		expect(DEFAULT_MODES.map((mode) => mode.slug)).toEqual([
			"architect",
			"code",
			"ask",
			"debug",
			"reviewer",
			"orchestrator",
			"translate",
		])
	})

	it("translate preserves meaning and format without becoming Code", () => {
		const translate = DEFAULT_MODES.find((mode) => mode.slug === "translate")
		const instructions = translate?.customInstructions ?? ""
		expect(translate?.name).toBe("🌐 Translate")
		expect(translate?.roleDefinition).toContain("accurate translation")
		expect(translate?.roleDefinition).toContain("Do not implement features")
		expect(translate?.whenToUse).toContain("preserving meaning and format")
		expect(translate?.whenToUse).toContain("Not for feature implementation")
		expect(translate?.description).toBe("Translate text, documentation, and localization")
		expect(translate?.groups).toEqual(["read", "edit", "command", "mcp"])
		expect(translate?.groups.some((group) => Array.isArray(group) && group[1]?.fileRegex)).toBe(false)
		expect(instructions).toContain("src/i18n/locales/")
		expect(instructions).toContain("{{variable}}")
		expect(instructions).toContain("hidden keys")
		expect(instructions).toContain("State genuine ambiguities explicitly")
		expect(instructions).toContain("Be concise when the request asks for brevity")
		expect(instructions).toContain("never omit translated content")
		expect(instructions).toContain("translation, not Code")
		expect(instructions).toContain("not to standalone text or document translation")
		expect(instructions).toContain("Change only the requested locales and entries")
		expect(instructions).toContain("preserve the English source")
		expect(instructions).toContain("outside the authorized scope")
		expect(instructions).not.toContain(".aico/rules-translate")
	})
})

describe("default mode permissions", () => {
	it("keeps read access and edit restrictions", () => {
		expect(orchestrator?.groups).toContain("read")
		expect(orchestrator?.groups).not.toContain("edit")
		expect(reviewer?.groups).toContain("read")
		expect(reviewer?.groups).not.toContain("edit")
		expect(ask?.groups).toContain("read")
		expect(ask?.groups).not.toContain("edit")

		expect(code?.groups).toEqual(["read", "edit", "command", "mcp"])
		expect(debug?.groups).toEqual(["read", "edit", "command", "mcp"])
		expect(architect?.groups).toEqual([
			"read",
			["edit", { fileRegex: "\\.md$", description: "Markdown files only" }],
			"command",
			"mcp",
		])
	})
})
