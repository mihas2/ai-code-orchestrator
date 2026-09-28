import type { ExtensionContext } from "vscode"

import { getModesSection } from "../modes"

vi.mock("../../../../utils/globalContext", () => ({
	ensureSettingsDirectoryExists: vi.fn().mockResolvedValue("/tmp/settings"),
}))

describe("getModesSection", () => {
	it("includes reviewer in the assembled MODES catalog", async () => {
		const context = {
			globalState: {
				get: vi.fn().mockResolvedValue(undefined),
			},
		} as unknown as ExtensionContext

		const section = await getModesSection(context)

		expect(section).toContain("MODES")
		expect(section).toContain("mode (reviewer)")
		expect(section).toContain("independent correctness, security, and regression review")
	})
})
