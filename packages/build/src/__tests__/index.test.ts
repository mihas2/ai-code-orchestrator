// npx vitest run src/__tests__/index.test.ts

import { generatePackageJson } from "../index.js"

describe("generatePackageJson", () => {
	it("should be a test", () => {
		const generatedPackageJson = generatePackageJson({
			packageJson: {
				name: "ai-code-orchestrator",
				displayName: "%extension.displayName%",
				description: "%extension.description%",
				publisher: "AicoVeterinaryInc",
				version: "1.0.0",
				icon: "assets/icons/icon.png",
				contributes: {
					viewsContainers: {
						activitybar: [
							{
								id: "ai-code-orchestrator-ActivityBar",
								title: "%views.activitybar.title%",
								icon: "assets/icons/icon.svg",
							},
						],
					},
					views: {
						"ai-code-orchestrator-ActivityBar": [
							{
								type: "webview",
								id: "ai-code-orchestrator.SidebarProvider",
								name: "",
							},
						],
					},
					commands: [
						{
							command: "ai-code-orchestrator.plusButtonClicked",
							title: "%command.newTask.title%",
							icon: "$(edit)",
						},
						{
							command: "ai-code-orchestrator.openInNewTab",
							title: "%command.openInNewTab.title%",
							category: "%configuration.title%",
						},
					],
					menus: {
						"editor/context": [
							{
								submenu: "ai-code-orchestrator.contextMenu",
								group: "navigation",
							},
						],
						"ai-code-orchestrator.contextMenu": [
							{
								command: "ai-code-orchestrator.addToContext",
								group: "1_actions@1",
							},
						],
						"editor/title": [
							{
								command: "ai-code-orchestrator.plusButtonClicked",
								group: "navigation@1",
								when: "activeWebviewPanelId == ai-code-orchestrator.TabPanelProvider",
							},
							{
								command: "ai-code-orchestrator.settingsButtonClicked",
								group: "navigation@6",
								when: "activeWebviewPanelId == ai-code-orchestrator.TabPanelProvider",
							},
							{
								command: "ai-code-orchestrator.accountButtonClicked",
								group: "navigation@6",
								when: "activeWebviewPanelId == ai-code-orchestrator.TabPanelProvider",
							},
						],
					},
					submenus: [
						{
							id: "ai-code-orchestrator.contextMenu",
							label: "%views.contextMenu.label%",
						},
						{
							id: "ai-code-orchestrator.terminalMenu",
							label: "%views.terminalMenu.label%",
						},
					],
					configuration: {
						title: "%configuration.title%",
						properties: {
							"ai-code-orchestrator.allowedCommands": {
								type: "array",
								items: {
									type: "string",
								},
								default: ["npm test", "npm install", "tsc", "git log", "git diff", "git show"],
								description: "%commands.allowedCommands.description%",
							},
							"ai-code-orchestrator.customStoragePath": {
								type: "string",
								default: "",
								description: "%settings.customStoragePath.description%",
							},
						},
					},
				},
				scripts: {
					lint: "eslint **/*.ts",
				},
			},
			overrideJson: {
				name: "ai-code-orchestrator-nightly",
				displayName: "AI Code Orchestrator Nightly",
				publisher: "AicoVeterinaryInc",
				version: "1.0.0",
				icon: "assets/icons/icon-nightly.png",
				scripts: {},
			},
			substitution: ["ai-code-orchestrator", "ai-code-orchestrator-nightly"],
		})

		expect(generatedPackageJson).toStrictEqual({
			name: "ai-code-orchestrator-nightly",
			displayName: "AI Code Orchestrator Nightly",
			description: "%extension.description%",
			publisher: "AicoVeterinaryInc",
			version: "1.0.0",
			icon: "assets/icons/icon-nightly.png",
			contributes: {
				viewsContainers: {
					activitybar: [
						{
							id: "ai-code-orchestrator-nightly-ActivityBar",
							title: "%views.activitybar.title%",
							icon: "assets/icons/icon.svg",
						},
					],
				},
				views: {
					"ai-code-orchestrator-nightly-ActivityBar": [
						{
							type: "webview",
							id: "ai-code-orchestrator-nightly.SidebarProvider",
							name: "",
						},
					],
				},
				commands: [
					{
						command: "ai-code-orchestrator-nightly.plusButtonClicked",
						title: "%command.newTask.title%",
						icon: "$(edit)",
					},
					{
						command: "ai-code-orchestrator-nightly.openInNewTab",
						title: "%command.openInNewTab.title%",
						category: "%configuration.title%",
					},
				],
				menus: {
					"editor/context": [
						{
							submenu: "ai-code-orchestrator-nightly.contextMenu",
							group: "navigation",
						},
					],
					"ai-code-orchestrator-nightly.contextMenu": [
						{
							command: "ai-code-orchestrator-nightly.addToContext",
							group: "1_actions@1",
						},
					],
					"editor/title": [
						{
							command: "ai-code-orchestrator-nightly.plusButtonClicked",
							group: "navigation@1",
							when: "activeWebviewPanelId == ai-code-orchestrator-nightly.TabPanelProvider",
						},
						{
							command: "ai-code-orchestrator-nightly.settingsButtonClicked",
							group: "navigation@6",
							when: "activeWebviewPanelId == ai-code-orchestrator-nightly.TabPanelProvider",
						},
						{
							command: "ai-code-orchestrator-nightly.accountButtonClicked",
							group: "navigation@6",
							when: "activeWebviewPanelId == ai-code-orchestrator-nightly.TabPanelProvider",
						},
					],
				},
				submenus: [
					{
						id: "ai-code-orchestrator-nightly.contextMenu",
						label: "%views.contextMenu.label%",
					},
					{
						id: "ai-code-orchestrator-nightly.terminalMenu",
						label: "%views.terminalMenu.label%",
					},
				],
				configuration: {
					title: "%configuration.title%",
					properties: {
						"ai-code-orchestrator-nightly.allowedCommands": {
							type: "array",
							items: {
								type: "string",
							},
							default: ["npm test", "npm install", "tsc", "git log", "git diff", "git show"],
							description: "%commands.allowedCommands.description%",
						},
						"ai-code-orchestrator-nightly.customStoragePath": {
							type: "string",
							default: "",
							description: "%settings.customStoragePath.description%",
						},
					},
				},
			},
			scripts: {},
		})
	})
})
