// npx vitest run __tests__/delegation-events.spec.ts

import {
	AiCodeOrchestratorEventName,
	aiCodeOrchestratorEventsSchema,
	taskEventSchema,
} from "@ai-code-orchestrator/types"

describe("delegation event schemas", () => {
	test("aiCodeOrchestratorEventsSchema validates tuples", () => {
		expect(() =>
			(aiCodeOrchestratorEventsSchema.shape as any)[AiCodeOrchestratorEventName.TaskDelegated].parse(["p", "c"]),
		).not.toThrow()
		expect(() =>
			(aiCodeOrchestratorEventsSchema.shape as any)[AiCodeOrchestratorEventName.TaskDelegationCompleted].parse([
				"p",
				"c",
				"s",
			]),
		).not.toThrow()
		expect(() =>
			(aiCodeOrchestratorEventsSchema.shape as any)[AiCodeOrchestratorEventName.TaskDelegationResumed].parse([
				"p",
				"c",
			]),
		).not.toThrow()

		// invalid shapes
		expect(() =>
			(aiCodeOrchestratorEventsSchema.shape as any)[AiCodeOrchestratorEventName.TaskDelegated].parse(["p"]),
		).toThrow()
		expect(() =>
			(aiCodeOrchestratorEventsSchema.shape as any)[AiCodeOrchestratorEventName.TaskDelegationCompleted].parse([
				"p",
				"c",
			]),
		).toThrow()
		expect(() =>
			(aiCodeOrchestratorEventsSchema.shape as any)[AiCodeOrchestratorEventName.TaskDelegationResumed].parse([
				"p",
			]),
		).toThrow()
	})

	test("taskEventSchema discriminated union includes delegation events", () => {
		expect(() =>
			taskEventSchema.parse({
				eventName: AiCodeOrchestratorEventName.TaskDelegated,
				payload: ["p", "c"],
				taskId: 1,
			}),
		).not.toThrow()

		expect(() =>
			taskEventSchema.parse({
				eventName: AiCodeOrchestratorEventName.TaskDelegationCompleted,
				payload: ["p", "c", "s"],
				taskId: 1,
			}),
		).not.toThrow()

		expect(() =>
			taskEventSchema.parse({
				eventName: AiCodeOrchestratorEventName.TaskDelegationResumed,
				payload: ["p", "c"],
				taskId: 1,
			}),
		).not.toThrow()
	})
})
