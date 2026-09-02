import { themes as prismThemes } from "prism-react-renderer"
import type { Config } from "@docusaurus/types"
import type * as Preset from "@docusaurus/preset-classic"
import {
	TWITTER_URL,
	BLUESKY_URL,
	GITHUB_MAIN_REPO_URL,
	GITHUB_ISSUES_MAIN_URL,
	VSCODE_MARKETPLACE_URL,
	OPEN_VSX_URL,
	EXTENSION_PRIVACY_URL,
	GITHUB_REPO_URL,
} from "./src/constants"

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

const config: Config = {
	title: "AI Code Orchestrator Documentation",
	tagline: "AI-powered autonomous coding agent for VS Code - Complete documentation, guides, and tutorials",
	favicon: "img/favicon.ico",

	// Set the production url of your site here
	url: "https://aiorchestrator.github.io",
	// Set the /<baseUrl>/ pathname under which your site is served
	// For GitHub pages deployment, it is often '/<projectName>/'
	baseUrl: "/AI Code Orchestrator-Code/",

	// GitHub pages deployment config (if needed)
	organizationName: "AIOrchestrator",
	projectName: "AI Code Orchestrator-Code",

	onBrokenLinks: "warn",
	markdown: {
		hooks: {
			onBrokenMarkdownLinks: "warn",
		},
	},

	// Even if you don't use internationalization, you can use this field to set
	// useful metadata like html lang. For example, if your site is Chinese, you
	// may want to replace "en" with "zh-Hans".
	i18n: {
		defaultLocale: "en",
		locales: ["en"],
	},

	clientModules: [require.resolve("./src/clientModules/scrollToAnchor.ts")],

	presets: [
		[
			"classic",
			{
				docs: {
					sidebarPath: "./sidebars.ts",
					routeBasePath: "/",
					editUrl: `${GITHUB_REPO_URL}/edit/main/apps/docs/`,
					showLastUpdateTime: true,
				},
				blog: false, // Disable blog feature
				theme: {
					customCss: "./src/css/custom.css",
				},
				sitemap: false, // Disable the built-in sitemap plugin to avoid conflicts
			} satisfies Preset.Options,
		],
	],

	themes: [
		[
			require.resolve("@easyops-cn/docusaurus-search-local"),
			{
				hashed: true,
				language: ["en"],
				highlightSearchTermsOnTargetPage: true,
				explicitSearchResultPath: true,
				docsRouteBasePath: "/",
				indexBlog: false,
				searchContextByPaths: [
					{ label: "Getting Started", path: "getting-started" },
					{ label: "Basic Usage", path: "basic-usage" },
					{ label: "Features", path: "features" },
					{ label: "Advanced Usage", path: "advanced-usage" },
					{ label: "Providers", path: "providers" },
					{ label: "Release Notes", path: "update-notes" },
				],
				useAllContextsWithNoSearchContext: true,
			},
		],
	],

	plugins: [
		[
			"@docusaurus/plugin-sitemap",
			{
				changefreq: "weekly",
				priority: 0.5,
				ignorePatterns: ["/tags/**"],
				filename: "sitemap.xml",
				createSitemapItems: async (params) => {
					const { defaultCreateSitemapItems, ...rest } = params
					const items = await defaultCreateSitemapItems(rest)
					return items.filter((item) => !item.url.includes("/page/"))
				},
			},
		],
		[
			"@docusaurus/plugin-client-redirects",
			{
				redirects: [
					// Files moved from advanced-usage to features
					{
						to: "/features/checkpoints",
						from: ["/advanced-usage/checkpoints"],
					},
					{
						to: "/features/code-actions",
						from: ["/advanced-usage/code-actions"],
					},
					{
						to: "/features/custom-instructions",
						from: ["/advanced-usage/custom-instructions"],
					},
					{
						to: "/features/custom-modes",
						from: ["/advanced-usage/custom-modes"],
					},
					{
						to: "/features/enhance-prompt",
						from: ["/advanced-usage/enhance-prompt"],
					},
					{
						to: "/features/experimental/experimental-features",
						from: ["/advanced-usage/experimental-features"],
					},
					{
						to: "/features/concurrent-file-reads",
						from: ["/features/experimental/concurrent-file-reads"],
					},
					{
						to: "/features/model-temperature",
						from: ["/advanced-usage/model-temperature"],
					},
					{
						to: "/features/auto-approving-actions",
						from: ["/advanced-usage/auto-approving-actions"],
					},
					{
						to: "/features/api-configuration-profiles",
						from: ["/advanced-usage/api-configuration-profiles"],
					},
					{
						to: "/features/intelligent-context-condensing",
						from: [
							"/features/experimental/intelligent-context-condensing",
							"/features/experimental/intelligent-context-condensation",
						],
					},
					{
						to: "/features/experimental/experimental-features",
						from: ["/features/experimental/power-steering"],
					},
					{
						to: "/features/codebase-indexing",
						from: ["/features/experimental/codebase-indexing"],
					},

					// MCP related redirects
					{
						to: "/features/mcp/overview",
						from: ["/advanced-usage/mcp", "/mcp/overview"],
					},
					{
						to: "/features/mcp/using-mcp-in-aico",
						from: ["/mcp/using-mcp-in-aico"],
					},
					{
						to: "/features/mcp/what-is-mcp",
						from: ["/mcp/what-is-mcp"],
					},
					{
						to: "/features/mcp/server-transports",
						from: ["/mcp/server-transports"],
					},
					{
						to: "/features/mcp/mcp-vs-api",
						from: ["/mcp/mcp-vs-api"],
					},
					{
						to: "/features/shell-integration",
						from: ["/troubleshooting/shell-integration"],
					},

					// Tools folder moved from features to advanced-usage
					{
						to: "/advanced-usage/available-tools/access-mcp-resource",
						from: ["/features/tools/access-mcp-resource"],
					},
					{
						to: "/advanced-usage/available-tools/apply-diff",
						from: ["/features/tools/apply-diff"],
					},
					{
						to: "/advanced-usage/available-tools/ask-followup-question",
						from: ["/features/tools/ask-followup-question"],
					},
					{
						to: "/advanced-usage/available-tools/attempt-completion",
						from: ["/features/tools/attempt-completion"],
					},
					{
						to: "/advanced-usage/available-tools/tool-use-overview",
						from: ["/features/tools/browser-action", "/advanced-usage/available-tools/browser-action"],
					},
					{
						to: "/advanced-usage/available-tools/execute-command",
						from: ["/features/tools/execute-command"],
					},
					{
						to: "/advanced-usage/available-tools/tool-use-overview",
						from: ["/features/tools/insert-content", "/advanced-usage/available-tools/insert-content"],
					},
					{
						to: "/advanced-usage/available-tools/tool-use-overview",
						from: [
							"/features/tools/list-code-definition-names",
							"/advanced-usage/available-tools/list-code-definition-names",
						],
					},
					{
						to: "/advanced-usage/available-tools/list-files",
						from: ["/features/tools/list-files"],
					},
					{
						to: "/advanced-usage/available-tools/new-task",
						from: ["/features/tools/new-task"],
					},
					{
						to: "/advanced-usage/available-tools/read-file",
						from: ["/features/tools/read-file"],
					},
					{
						to: "/advanced-usage/available-tools/search-files",
						from: ["/features/tools/search-files"],
					},
					{
						to: "/advanced-usage/available-tools/switch-mode",
						from: ["/features/tools/switch-mode"],
					},
					{
						to: "/advanced-usage/available-tools/tool-use-overview",
						from: ["/features/tools/tool-use-overview"],
					},
					{
						to: "/advanced-usage/available-tools/use-mcp-tool",
						from: ["/features/tools/use-mcp-tool"],
					},
					{
						to: "/advanced-usage/available-tools/write-to-file",
						from: ["/features/tools/write-to-file"],
					},
					{
						to: "/advanced-usage/aico-code-nightly",
						from: ["/advanced-usage/prerelease-build"],
					},
					// Redirect removed AI Code Orchestrator Router provider aliases
					{
						to: "/providers",
						from: ["/providers/aico"],
					},
					{
						to: "/providers",
						from: ["/providers/ai-code-orchestrator-cloud"],
					},
					{
						to: "/providers",
						from: ["/ai-code-orchestrator-provider", "/ai-code-orchestrator-provider/overview"],
					},
					// Redirect removed Cloud, Router, Credits, and billing pages
					{
						to: "/",
						from: [
							"/sunset",
							"/ai-code-orchestrator-cloud",
							"/ai-code-orchestrator-cloud/overview",
							"/ai-code-orchestrator-cloud/login",
							"/ai-code-orchestrator-cloud/connect",
							"/ai-code-orchestrator-cloud/cloud-agents",
							"/ai-code-orchestrator-cloud/environments",
							"/ai-code-orchestrator-cloud/task-sync",
							"/ai-code-orchestrator-cloud/task-sharing",
							"/ai-code-orchestrator-cloud/analytics",
							"/ai-code-orchestrator-cloud/github-integration",
							"/ai-code-orchestrator-cloud/slack-integration",
							"/ai-code-orchestrator-cloud/team-plan",
							"/ai-code-orchestrator-cloud/what-is-ai-code-orchestrator-cloud",
							"/ai-code-orchestrator-cloud/dashboard",
							"/ai-code-orchestrator-cloud/remote-control",
						],
					},
					{
						to: "/providers",
						from: [
							"/ai-code-orchestrator-router",
							"/ai-code-orchestrator-router/overview",
							"/providers/ai-code-orchestrator-router",
						],
					},
					{
						to: "/advanced-usage/rate-limits-costs",
						from: ["/credits", "/credits/overview", "/ai-code-orchestrator-cloud/billing-subscriptions"],
					},
					// Redirect removed Human Relay provider page
					{
						to: "/",
						from: ["/providers/human-relay"],
					},
					// Redirect removed Claude Code provider page
					{
						to: "/",
						from: ["/providers/claude-code"],
					},

					// Redirect removed Fast Edits feature page
					{
						to: "/",
						from: ["/features/fast-edits"],
					},
					// Redirect retired provider pages
					{
						to: "/providers",
						from: [
							"/providers/cerebras",
							"/providers/chutes",
							"/providers/deepinfra",
							"/providers/doubao",
							"/providers/featherless",
							"/providers/glama",
							"/providers/groq",
							"/providers/huggingface",
							"/providers/io-intelligence",
							"/providers/unbound",
						],
					},

					// Redirect removed browser-use feature page
					{
						to: "/features",
						from: ["/features/browser-use"],
					},
				],
			},
		],
	],

	themeConfig: {
		// SEO metadata
		metadata: [
			{
				name: "keywords",
				content:
					"AI Code Orchestrator, AI coding assistant, VS Code extension, autonomous coding agent, AI pair programmer, code generation, documentation",
			},
			{ name: "twitter:card", content: "summary_large_image" },
			{ name: "twitter:site", content: "@aicodeorchestrator" },
			{ name: "twitter:creator", content: "@aicodeorchestrator" },
			{ property: "og:type", content: "website" },
			{ property: "og:locale", content: "en_US" },
		],
		colorMode: {
			defaultMode: "dark",
			disableSwitch: false,
			respectPrefersColorScheme: false,
		},
		image: "/img/social-share.png", // Default Open Graph image
		navbar: {
			logo: {
				alt: "AI Code Orchestrator Logo",
				src: "img/ai-code-orchestrator-logo-dark.svg",
				srcDark: "img/ai-code-orchestrator-logo-white.svg",
			},
			items: [
				{
					type: "search",
					position: "left",
				},
			],
		},
		footer: {
			style: "dark",
			logo: {
				alt: "AI Code Orchestrator Logo",
				src: "img/ai-code-orchestrator-logo-dark.svg",
				srcDark: "img/ai-code-orchestrator-logo-white.svg",
				width: 120,
				height: 24,
			},
			links: [
				{
					title: "Social",
					items: [
						{
							label: "Twitter",
							href: TWITTER_URL,
						},
						{
							label: "Bluesky",
							href: BLUESKY_URL,
						},
						{
							label: "GitHub",
							href: GITHUB_MAIN_REPO_URL,
						},
					],
				},
				{
					title: "GitHub",
					items: [
						{
							label: "Issues",
							href: GITHUB_ISSUES_MAIN_URL,
						},
					],
				},
				{
					title: "Download",
					items: [
						{
							label: "VS Code Marketplace",
							href: VSCODE_MARKETPLACE_URL,
						},
						{
							label: "Open VSX Registry",
							href: OPEN_VSX_URL,
						},
					],
				},
				{
					title: "Privacy",
					items: [
						{
							label: "Extension Privacy Policy",
							href: EXTENSION_PRIVACY_URL,
						},
					],
				},
			],
		},
		prism: {
			theme: prismThemes.github,
			darkTheme: prismThemes.dracula,
		},
	} satisfies Preset.ThemeConfig,
}

export default config
