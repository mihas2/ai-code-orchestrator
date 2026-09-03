import { defineConfig } from "tsup"

export default defineConfig({
	entry: ["src/index.ts"],
	format: ["cjs", "esm"],
	dts: true,
	splitting: false,
	sourcemap: true,
	clean: true,
	outDir: "dist",
	// ai-sdk-provider-poe exposes ./code only for ESM. Bundle it so the CJS
	// artifact does not emit a runtime require for that subpath.
	noExternal: ["ai-sdk-provider-poe"],
})
