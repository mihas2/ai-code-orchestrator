import { describe, expect, it, vi } from "vitest"
import { ExtensionHost } from "../extension-host.js"

describe("CLI orchestration entrypoints", () => {
	it("dispatches new and resumed tasks through the extension message boundary", async () => {
		const host = Object.create(ExtensionHost.prototype) as ExtensionHost
		const sendToExtension = vi.fn()
		const waitForTaskCompletion = vi.fn(async () => undefined)
		Reflect.set(host, "sendToExtension", sendToExtension)
		Reflect.set(host, "waitForTaskCompletion", waitForTaskCompletion)

		await host.runTask("orchestrate this", "root-task")
		expect(sendToExtension).toHaveBeenCalledWith(
			expect.objectContaining({ type: "newTask", text: "orchestrate this", taskId: "root-task" }),
		)

		await host.resumeTask("root-task")
		expect(sendToExtension).toHaveBeenCalledWith({ type: "showTaskWithId", text: "root-task" })
		expect(waitForTaskCompletion).toHaveBeenCalledTimes(2)
	})
})
