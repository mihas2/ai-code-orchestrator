import {
	aicoCliControlEventSchema,
	aicoCliFinalOutputSchema,
	aicoCliInputCommandSchema,
	aicoCliStreamEventSchema,
} from "../cli.js"

describe("CLI types", () => {
	describe("aicoCliInputCommandSchema", () => {
		it("validates a start command", () => {
			const result = aicoCliInputCommandSchema.safeParse({
				command: "start",
				requestId: "req-1",
				prompt: "hello",
				taskId: "018f7fc8-7c96-7f7c-98aa-2ec4ff7f6d87",
				images: ["data:image/png;base64,abc"],
				configuration: {},
			})

			expect(result.success).toBe(true)
		})

		it("validates a message command with images", () => {
			const result = aicoCliInputCommandSchema.safeParse({
				command: "message",
				requestId: "req-2a",
				prompt: "follow up",
				images: ["data:image/png;base64,xyz"],
			})

			expect(result.success).toBe(true)
		})

		it("rejects a message command without prompt", () => {
			const result = aicoCliInputCommandSchema.safeParse({
				command: "message",
				requestId: "req-2",
			})

			expect(result.success).toBe(false)
		})

		it("rejects a start command with invalid taskId format", () => {
			const result = aicoCliInputCommandSchema.safeParse({
				command: "start",
				requestId: "req-invalid-task-id",
				prompt: "hello",
				taskId: "task-123",
			})

			expect(result.success).toBe(false)
		})
	})

	describe("aicoCliControlEventSchema", () => {
		it("validates a control done event", () => {
			const result = aicoCliControlEventSchema.safeParse({
				type: "control",
				subtype: "done",
				requestId: "req-3",
				command: "start",
				success: true,
				code: "task_completed",
			})

			expect(result.success).toBe(true)
		})

		it("rejects control event without requestId", () => {
			const result = aicoCliControlEventSchema.safeParse({
				type: "control",
				subtype: "ack",
			})

			expect(result.success).toBe(false)
		})
	})

	describe("aicoCliStreamEventSchema", () => {
		it("accepts passthrough fields for forward compatibility", () => {
			const result = aicoCliStreamEventSchema.safeParse({
				type: "assistant",
				id: 42,
				content: "partial",
				customField: "future",
			})

			expect(result.success).toBe(true)
		})
	})

	describe("aicoCliFinalOutputSchema", () => {
		it("validates final json output shape", () => {
			const result = aicoCliFinalOutputSchema.safeParse({
				type: "result",
				success: true,
				content: "done",
				events: [],
			})

			expect(result.success).toBe(true)
		})
	})
})
