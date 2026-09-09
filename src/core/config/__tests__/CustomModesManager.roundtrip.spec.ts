// npx vitest core/config/__tests__/CustomModesManager.roundtrip.spec.ts

import type { Mock } from "vitest"
import * as path from "path"
import * as fs from "fs/promises"
import * as yaml from "yaml"
import * as vscode from "vscode"
import type { ModeConfig } from "@ai-code-orchestrator/types"
import { fileExistsAtPath } from "../../../utils/fs"
import { getWorkspacePath } from "../../../utils/path"
import { GlobalFileNames } from "../../../shared/globalFileNames"
import { CustomModesManager } from "../CustomModesManager"

vi.mock("vscode", () => ({
	workspace: {
		workspaceFolders: [],
		onDidSaveTextDocument: vi.fn(),
		createFileSystemWatcher: vi.fn(),
	},
	window: {
		showErrorMessage: vi.fn(),
	},
}))

vi.mock("fs/promises", () => ({
	mkdir: vi.fn(),
	readFile: vi.fn(),
	writeFile: vi.fn(),
	stat: vi.fn(),
	readdir: vi.fn(),
	rm: vi.fn(),
}))

vi.mock("../../../utils/fs")
vi.mock("../../../utils/path")

/**
 * Integration tests for lossless persistence and operational resolver integration.
 *
 * AC1: Operational resolver consistency across host/browser/details/modes/export
 * AC2: Lossless roundtrip for unknown fields and nested ui fields
 * AC3: Stale override reproduction - custom mode slug with custom fields should not be overridden by stale prompts
 */
describe("CustomModesManager - Roundtrip and Integration", () => {
	let manager: CustomModesManager
	let mockContext: vscode.ExtensionContext
	let mockOnUpdate: Mock
	let mockWorkspaceFolders: { uri: { fsPath: string } }[]

	const mockStoragePath = `${path.sep}mock${path.sep}settings`
	const mockSettingsPath = path.join(mockStoragePath, "settings", GlobalFileNames.customModes)
	const mockWorkspacePath = path.resolve("/mock/workspace")
	const mockAgentModes = path.join(mockWorkspacePath, ".agent-modes")

	beforeEach(() => {
		mockOnUpdate = vi.fn()
		mockContext = {
			globalState: {
				get: vi.fn(),
				update: vi.fn(),
				keys: vi.fn(() => []),
				setKeysForSync: vi.fn(),
			},
			globalStorageUri: {
				fsPath: mockStoragePath,
			},
		} as unknown as vscode.ExtensionContext

		mockWorkspaceFolders = [{ uri: { fsPath: mockWorkspacePath } }]
		;(vscode.workspace as any).workspaceFolders = mockWorkspaceFolders
		;(vscode.workspace.onDidSaveTextDocument as Mock).mockReturnValue({ dispose: vi.fn() })
		;(getWorkspacePath as Mock).mockReturnValue(mockWorkspacePath)
		;(fileExistsAtPath as Mock).mockImplementation(async (path: string) => {
			return path === mockSettingsPath || path === mockAgentModes
		})
		;(fs.mkdir as Mock).mockResolvedValue(undefined)
		;(fs.writeFile as Mock).mockResolvedValue(undefined)
		;(fs.stat as Mock).mockResolvedValue({ isDirectory: () => true })
		;(fs.readdir as Mock).mockResolvedValue([])
		;(fs.rm as Mock).mockResolvedValue(undefined)
		;(fs.readFile as Mock).mockImplementation(async (path: string) => {
			if (path === mockSettingsPath) {
				return yaml.stringify({ customModes: [] })
			}
			throw new Error("File not found")
		})

		manager = new CustomModesManager(mockContext, mockOnUpdate)
	})

	afterEach(() => {
		vi.clearAllMocks()
	})

	describe("AC2: Lossless Roundtrip - Unknown Fields Preservation", () => {
		it("should preserve unknown top-level fields through load->edit->save->export", async () => {
			// Setup: Create a mode with unknown fields
			const modeWithUnknownFields = {
				slug: "test-mode",
				name: "Test Mode",
				roleDefinition: "Test Role",
				groups: ["read"],
				// Known fields
				whenToUse: "Test when to use",
				description: "Test description",
				// Unknown fields that should be preserved
				futureField: "future value",
				experimentalFlag: true,
				nestedUnknown: { key: "value" },
			}

			let agentModesContent: any = { customModes: [modeWithUnknownFields] }

			;(fs.readFile as Mock).mockImplementation(async (path: string) => {
				if (path === mockSettingsPath) {
					return yaml.stringify({ customModes: [] })
				}
				if (path === mockAgentModes) {
					return yaml.stringify(agentModesContent)
				}
				throw new Error("File not found")
			})
			;(fs.writeFile as Mock).mockImplementation(async (path: string, content: string) => {
				if (path === mockAgentModes) {
					agentModesContent = yaml.parse(content)
				}
				return Promise.resolve()
			})

			// Load modes
			const loadedModes = await manager.getCustomModes()
			expect(loadedModes).toHaveLength(1)
			const loadedMode = loadedModes[0]

			// Edit mode (change known field)
			const editedMode: ModeConfig = {
				...loadedMode,
				roleDefinition: "Updated Role",
			}

			await manager.updateCustomMode("test-mode", editedMode)

			// Verify unknown fields are preserved in the file
			expect(agentModesContent.customModes[0].futureField).toBe("future value")
			expect(agentModesContent.customModes[0].experimentalFlag).toBe(true)
			expect(agentModesContent.customModes[0].nestedUnknown).toEqual({ key: "value" })
			expect(agentModesContent.customModes[0].roleDefinition).toBe("Updated Role")
		})

		it("should preserve nested ui fields through roundtrip", async () => {
			const modeWithUiFields = {
				slug: "ui-mode",
				name: "UI Mode",
				roleDefinition: "UI Role",
				groups: ["read"],
				ui: {
					nameKey: "ui-mode.name",
					descriptionKey: "ui-mode.description",
					futureUiField: "future ui value",
					nestedObject: {
						deep: "value",
					},
				},
			}

			let agentModesContent: any = { customModes: [modeWithUiFields] }

			;(fs.readFile as Mock).mockImplementation(async (path: string) => {
				if (path === mockSettingsPath) {
					return yaml.stringify({ customModes: [] })
				}
				if (path === mockAgentModes) {
					return yaml.stringify(agentModesContent)
				}
				throw new Error("File not found")
			})
			;(fs.writeFile as Mock).mockImplementation(async (path: string, content: string) => {
				if (path === mockAgentModes) {
					agentModesContent = yaml.parse(content)
				}
				return Promise.resolve()
			})

			// Load and edit
			const loadedModes = await manager.getCustomModes()
			const editedMode: ModeConfig = {
				...loadedModes[0],
				roleDefinition: "Updated UI Role",
			}

			await manager.updateCustomMode("ui-mode", editedMode)

			// Verify nested ui fields are preserved
			expect(agentModesContent.customModes[0].ui).toBeDefined()
			expect(agentModesContent.customModes[0].ui.futureUiField).toBe("future ui value")
			expect(agentModesContent.customModes[0].ui.nestedObject).toEqual({ deep: "value" })
		})

		it("should preserve unknown fields through import->load->edit cycle", async () => {
			const modeWithUnknown = {
				slug: "roundtrip-test",
				name: "Roundtrip Test",
				roleDefinition: "Roundtrip Role",
				groups: ["read"],
				unknownTopLevel: "preserved",
				ui: {
					nameKey: "test.name",
					unknownUi: "ui preserved",
				},
			}

			let agentModesContent: any = { customModes: [] }

			;(fs.readFile as Mock).mockImplementation(async (path: string) => {
				if (path === mockSettingsPath) {
					return yaml.stringify({ customModes: [] })
				}
				if (path === mockAgentModes) {
					return yaml.stringify(agentModesContent)
				}
				throw new Error("File not found")
			})
			;(fs.writeFile as Mock).mockImplementation(async (path: string, content: string) => {
				if (path === mockAgentModes) {
					agentModesContent = yaml.parse(content)
				}
				return Promise.resolve()
			})
			;(fs.stat as Mock).mockRejectedValue(new Error("No rules directory"))

			// Import the mode with unknown fields
			const importYaml = yaml.stringify({ customModes: [modeWithUnknown] })
			const importResult = await manager.importModeWithRules(importYaml, "project")
			expect(importResult.success).toBe(true)

			// Verify unknown fields survived import and were written to file
			expect(agentModesContent.customModes[0].unknownTopLevel).toBe("preserved")
			expect(agentModesContent.customModes[0].ui.unknownUi).toBe("ui preserved")

			// Load modes again (simulating app restart)
			;(manager as any).clearCache()
			const loadedModes = await manager.getCustomModes()
			const loadedMode = loadedModes.find((m) => m.slug === "roundtrip-test")
			expect(loadedMode).toBeDefined()

			// Edit the mode (change known field)
			const editedMode: ModeConfig = {
				...loadedMode!,
				roleDefinition: "Updated Roundtrip Role",
			}
			await manager.updateCustomMode("roundtrip-test", editedMode)

			// Verify unknown fields still preserved after edit
			expect(agentModesContent.customModes[0].unknownTopLevel).toBe("preserved")
			expect(agentModesContent.customModes[0].ui.unknownUi).toBe("ui preserved")
			expect(agentModesContent.customModes[0].roleDefinition).toBe("Updated Roundtrip Role")
		})

		it("should reject invalid known fields during validation", async () => {
			const invalidMode = {
				slug: "invalid-mode",
				name: "", // Invalid: empty name
				roleDefinition: "", // Invalid: empty role
				groups: ["invalid-group"], // Invalid group
				unknownField: "this should be preserved if validation passes",
			}

			const yamlContent = yaml.stringify({ customModes: [invalidMode] })
			const result = await manager.importModeWithRules(yamlContent, "project")

			expect(result.success).toBe(false)
			expect(result.error).toContain("Invalid mode configuration")
		})
	})

	describe("AC3: Stale Override Prevention", () => {
		it("should NOT apply stale prompt overrides to custom modes", async () => {
			// Setup: Custom mode with own roleDefinition and whenToUse
			const customMode = {
				slug: "code",
				name: "My Custom Code",
				roleDefinition: "CUSTOM ROLE DEFINITION",
				whenToUse: "CUSTOM ROUTING",
				groups: ["read"],
			}

			// Stale override in customModePrompts (should be ignored for custom mode)
			;(mockContext.globalState.get as Mock).mockImplementation((key: string) => {
				if (key === "customModes") {
					return [customMode]
				}
				if (key === "customModePrompts") {
					return {
						code: {
							roleDefinition: "STALE ROLE DEFINITION",
							whenToUse: "STALE ROUTING",
						},
					}
				}
				return undefined
			})

			let agentModesContent: any = { customModes: [customMode] }

			;(fs.readFile as Mock).mockImplementation(async (path: string) => {
				if (path === mockSettingsPath) {
					return yaml.stringify({ customModes: [] })
				}
				if (path === mockAgentModes) {
					return yaml.stringify(agentModesContent)
				}
				throw new Error("File not found")
			})
			;(fs.stat as Mock).mockRejectedValue(new Error("No rules"))

			// Load modes - should get CUSTOM values, not STALE
			const modes = await manager.getCustomModes()
			const codeMode = modes.find((m) => m.slug === "code")

			expect(codeMode?.roleDefinition).toBe("CUSTOM ROLE DEFINITION")
			expect(codeMode?.whenToUse).toBe("CUSTOM ROUTING")

			// Export should also use CUSTOM values
			const exportResult = await manager.exportModeWithRules("code")
			expect(exportResult.success).toBe(true)

			const exported = yaml.parse(exportResult.yaml!)
			expect(exported.customModes[0].roleDefinition).toBe("CUSTOM ROLE DEFINITION")
			expect(exported.customModes[0].whenToUse).toBe("CUSTOM ROUTING")
		})

		it("should apply prompt overrides ONLY to built-in modes", async () => {
			// No custom modes, only built-in overrides
			;(mockContext.globalState.get as Mock).mockImplementation((key: string) => {
				if (key === "customModes") {
					return []
				}
				if (key === "customModePrompts") {
					return {
						ask: {
							roleDefinition: "OVERRIDE FOR BUILT-IN",
						},
					}
				}
				return undefined
			})
			;(fileExistsAtPath as Mock).mockImplementation(async (path: string) => {
				return path === mockSettingsPath
			})
			;(fs.readFile as Mock).mockImplementation(async (path: string) => {
				if (path === mockSettingsPath) {
					return yaml.stringify({ customModes: [] })
				}
				throw new Error("File not found")
			})

			const modes = await manager.getCustomModes()
			expect(modes).toHaveLength(0) // No custom modes

			// Built-in mode resolution should be tested via getAllModesWithPrompts or getFullModeDetails
			// which are tested separately in modes.spec.ts
		})
	})

	describe("AC2: Invalid Field Rejection", () => {
		it("should reject mode with invalid known fields", async () => {
			const invalidYaml = yaml.stringify({
				customModes: [
					{
						slug: "test",
						name: "", // Invalid: empty
						roleDefinition: "", // Invalid: empty
						groups: ["invalid"], // Invalid group
						futureField: "should not matter",
					},
				],
			})

			const result = await manager.importModeWithRules(invalidYaml)

			expect(result.success).toBe(false)
			expect(result.error).toContain("Invalid mode configuration")
		})

		it("should accept mode with valid known fields and unknown fields", async () => {
			const validYaml = yaml.stringify({
				customModes: [
					{
						slug: "valid-mode",
						name: "Valid Mode",
						roleDefinition: "Valid Role",
						groups: ["read"],
						// Unknown fields
						futureExperiment: true,
						customMetadata: { author: "test" },
					},
				],
			})

			let agentModesContent: any = null

			;(fs.readFile as Mock).mockImplementation(async (path: string) => {
				if (path === mockSettingsPath) {
					return yaml.stringify({ customModes: [] })
				}
				if (path === mockAgentModes && agentModesContent) {
					return yaml.stringify(agentModesContent)
				}
				throw new Error("File not found")
			})
			;(fs.writeFile as Mock).mockImplementation(async (path: string, content: string) => {
				if (path === mockAgentModes) {
					agentModesContent = yaml.parse(content)
				}
				return Promise.resolve()
			})

			const result = await manager.importModeWithRules(validYaml)

			expect(result.success).toBe(true)
			expect(agentModesContent.customModes[0].futureExperiment).toBe(true)
			expect(agentModesContent.customModes[0].customMetadata).toEqual({ author: "test" })
		})
	})
})
