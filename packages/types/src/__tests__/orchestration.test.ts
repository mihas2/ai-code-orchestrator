import { describe, expect, it } from "vitest"

import {
	DEFAULT_ORCHESTRATION_SETTINGS,
	orchestrationSettingsSchema,
	profileRoleModelSettingsSchema,
	resolveModelRoute,
} from "../orchestration.js"

describe("orchestration settings", () => {
	it("uses orchestration-first defaults and keeps orchestration active", () => {
		expect(DEFAULT_ORCHESTRATION_SETTINGS.enabled).toBe(true)
		expect(orchestrationSettingsSchema.parse({ enabled: false }).enabled).toBe(false)
		expect(DEFAULT_ORCHESTRATION_SETTINGS.maxParallelWorkers).toBe(4)
		expect(orchestrationSettingsSchema.parse({}).contextPolicy).toBe("balanced")
	})

	it("rejects unsafe settings bounds", () => {
		expect(() => orchestrationSettingsSchema.parse({ maxParallelWorkers: 33 })).toThrow()
		expect(() => orchestrationSettingsSchema.parse({ maxDepth: 0 })).toThrow()
	})

	it("validates role settings and defaults inheritance", () => {
		const settings = profileRoleModelSettingsSchema.parse({ roleModels: { code: {} } })
		expect(settings.roleModels.code?.inheritPrimary).toBe(true)
	})

	it("preserves orchestration defaults when settings are saved through the schema", () => {
		const saved = orchestrationSettingsSchema.parse({ maxParallelWorkers: 6, contextPolicy: "full" })
		expect(saved.maxParallelWorkers).toBe(6)
		expect(saved.maxDepth).toBe(DEFAULT_ORCHESTRATION_SETTINGS.maxDepth)
		expect(saved.reviewPolicy).toBe(DEFAULT_ORCHESTRATION_SETTINGS.reviewPolicy)
	})
})

describe("resolveModelRoute", () => {
	const base = {
		profileId: "profile-1",
		provider: "openrouter",
		primaryModelId: "primary",
		role: "code",
		resolvedAt: 123,
	}

	it("uses explicit, role, then primary model in that order", () => {
		expect(
			resolveModelRoute({
				...base,
				explicitModelId: "explicit",
				roleModels: { schemaVersion: 1, roleModels: { code: { modelId: "role", inheritPrimary: false } } },
			}),
		).toMatchObject({ modelId: "explicit", source: "explicit" })
		expect(
			resolveModelRoute({
				...base,
				roleModels: { schemaVersion: 1, roleModels: { code: { modelId: "role", inheritPrimary: false } } },
			}),
		).toMatchObject({ modelId: "role", source: "role" })
		expect(
			resolveModelRoute({
				...base,
				roleModels: { schemaVersion: 1, roleModels: { code: { modelId: "ignored", inheritPrimary: true } } },
			}),
		).toMatchObject({ modelId: "primary", source: "primary" })
	})

	it("distinguishes inherited and explicit role model overrides", () => {
		const inherited = resolveModelRoute({
			...base,
			roleModels: { schemaVersion: 1, roleModels: { code: { inheritPrimary: true } } },
		})
		const explicit = resolveModelRoute({
			...base,
			explicitModelId: "alternative",
		})
		expect(inherited).toMatchObject({ modelId: "primary", source: "primary" })
		expect(explicit).toMatchObject({ modelId: "alternative", source: "explicit" })
	})
})
