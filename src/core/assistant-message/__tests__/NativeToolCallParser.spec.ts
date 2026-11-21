import { vi } from "vitest"

import { customToolRegistry } from "@ai-code-orchestrator/core"

import { NativeToolCallParser } from "../NativeToolCallParser"

describe("NativeToolCallParser", () => {
	beforeEach(() => {
		NativeToolCallParser.clearAllStreamingToolCalls()
		NativeToolCallParser.clearRawChunkState()
	})

	describe("parseToolCall", () => {
		describe("read_file tool", () => {
			it("should parse minimal single-file read_file args", () => {
				const toolCall = {
					id: "toolu_123",
					name: "read_file" as const,
					arguments: JSON.stringify({
						path: "src/core/task/Task.ts",
					}),
				}

				const result = NativeToolCallParser.parseToolCall(toolCall)

				expect(result).not.toBeNull()
				expect(result?.type).toBe("tool_use")
				if (result?.type === "tool_use") {
					expect(result.nativeArgs).toBeDefined()
					const nativeArgs = result.nativeArgs as { path: string }
					expect(nativeArgs.path).toBe("src/core/task/Task.ts")
				}
			})

			it("should normalize the provider file_path alias into nativeArgs.path", () => {
				const result = NativeToolCallParser.parseToolCall({
					id: "toolu_file_path_alias",
					name: "read_file",
					arguments: JSON.stringify({
						file_path: "src/core/webview/__tests__/webviewMessageHandler.spec.ts",
					}),
				})

				expect(result?.type).toBe("tool_use")
				if (result?.type === "tool_use") {
					expect(result.nativeArgs).toEqual({
						path: "src/core/webview/__tests__/webviewMessageHandler.spec.ts",
						mode: undefined,
						offset: undefined,
						limit: undefined,
						indentation: undefined,
					})
				}
			})

			it("should parse slice-mode params", () => {
				const toolCall = {
					id: "toolu_123",
					name: "read_file" as const,
					arguments: JSON.stringify({
						path: "src/core/task/Task.ts",
						mode: "slice",
						offset: 10,
						limit: 20,
					}),
				}

				const result = NativeToolCallParser.parseToolCall(toolCall)

				expect(result).not.toBeNull()
				expect(result?.type).toBe("tool_use")
				if (result?.type === "tool_use") {
					const nativeArgs = result.nativeArgs as {
						path: string
						mode?: string
						offset?: number
						limit?: number
					}
					expect(nativeArgs.path).toBe("src/core/task/Task.ts")
					expect(nativeArgs.mode).toBe("slice")
					expect(nativeArgs.offset).toBe(10)
					expect(nativeArgs.limit).toBe(20)
				}
			})

			it("should parse indentation-mode params", () => {
				const toolCall = {
					id: "toolu_123",
					name: "read_file" as const,
					arguments: JSON.stringify({
						path: "src/utils.ts",
						mode: "indentation",
						indentation: {
							anchor_line: 123,
							max_levels: 2,
							include_siblings: true,
							include_header: false,
						},
					}),
				}

				const result = NativeToolCallParser.parseToolCall(toolCall)

				expect(result).not.toBeNull()
				expect(result?.type).toBe("tool_use")
				if (result?.type === "tool_use") {
					const nativeArgs = result.nativeArgs as {
						path: string
						mode?: string
						indentation?: {
							anchor_line?: number
							max_levels?: number
							include_siblings?: boolean
							include_header?: boolean
						}
					}
					expect(nativeArgs.path).toBe("src/utils.ts")
					expect(nativeArgs.mode).toBe("indentation")
					expect(nativeArgs.indentation?.anchor_line).toBe(123)
					expect(nativeArgs.indentation?.include_siblings).toBe(true)
					expect(nativeArgs.indentation?.include_header).toBe(false)
				}
			})

			// Legacy format backward compatibility tests
			describe("legacy format backward compatibility", () => {
				it("should parse legacy files array format with single file", () => {
					const toolCall = {
						id: "toolu_legacy_1",
						name: "read_file" as const,
						arguments: JSON.stringify({
							files: [{ path: "src/legacy/file.ts" }],
						}),
					}

					const result = NativeToolCallParser.parseToolCall(toolCall)

					expect(result).not.toBeNull()
					expect(result?.type).toBe("tool_use")
					if (result?.type === "tool_use") {
						expect(result.usedLegacyFormat).toBe(true)
						const nativeArgs = result.nativeArgs as { files: Array<{ path: string }>; _legacyFormat: true }
						expect(nativeArgs._legacyFormat).toBe(true)
						expect(nativeArgs.files).toHaveLength(1)
						expect(nativeArgs.files[0].path).toBe("src/legacy/file.ts")
					}
				})

				it("should parse legacy files array format with multiple files", () => {
					const toolCall = {
						id: "toolu_legacy_2",
						name: "read_file" as const,
						arguments: JSON.stringify({
							files: [{ path: "src/file1.ts" }, { path: "src/file2.ts" }, { path: "src/file3.ts" }],
						}),
					}

					const result = NativeToolCallParser.parseToolCall(toolCall)

					expect(result).not.toBeNull()
					expect(result?.type).toBe("tool_use")
					if (result?.type === "tool_use") {
						expect(result.usedLegacyFormat).toBe(true)
						const nativeArgs = result.nativeArgs as { files: Array<{ path: string }>; _legacyFormat: true }
						expect(nativeArgs.files).toHaveLength(3)
						expect(nativeArgs.files[0].path).toBe("src/file1.ts")
						expect(nativeArgs.files[1].path).toBe("src/file2.ts")
						expect(nativeArgs.files[2].path).toBe("src/file3.ts")
					}
				})

				it("should parse legacy line_ranges as tuples", () => {
					const toolCall = {
						id: "toolu_legacy_3",
						name: "read_file" as const,
						arguments: JSON.stringify({
							files: [
								{
									path: "src/task.ts",
									line_ranges: [
										[1, 50],
										[100, 150],
									],
								},
							],
						}),
					}

					const result = NativeToolCallParser.parseToolCall(toolCall)

					expect(result).not.toBeNull()
					expect(result?.type).toBe("tool_use")
					if (result?.type === "tool_use") {
						expect(result.usedLegacyFormat).toBe(true)
						const nativeArgs = result.nativeArgs as {
							files: Array<{ path: string; lineRanges?: Array<{ start: number; end: number }> }>
							_legacyFormat: true
						}
						expect(nativeArgs.files[0].lineRanges).toHaveLength(2)
						expect(nativeArgs.files[0].lineRanges?.[0]).toEqual({ start: 1, end: 50 })
						expect(nativeArgs.files[0].lineRanges?.[1]).toEqual({ start: 100, end: 150 })
					}
				})

				it("should parse legacy line_ranges as objects", () => {
					const toolCall = {
						id: "toolu_legacy_4",
						name: "read_file" as const,
						arguments: JSON.stringify({
							files: [
								{
									path: "src/task.ts",
									line_ranges: [
										{ start: 10, end: 20 },
										{ start: 30, end: 40 },
									],
								},
							],
						}),
					}

					const result = NativeToolCallParser.parseToolCall(toolCall)

					expect(result).not.toBeNull()
					expect(result?.type).toBe("tool_use")
					if (result?.type === "tool_use") {
						expect(result.usedLegacyFormat).toBe(true)
						const nativeArgs = result.nativeArgs as {
							files: Array<{ path: string; lineRanges?: Array<{ start: number; end: number }> }>
						}
						expect(nativeArgs.files[0].lineRanges).toHaveLength(2)
						expect(nativeArgs.files[0].lineRanges?.[0]).toEqual({ start: 10, end: 20 })
						expect(nativeArgs.files[0].lineRanges?.[1]).toEqual({ start: 30, end: 40 })
					}
				})

				it("should parse legacy line_ranges as strings", () => {
					const toolCall = {
						id: "toolu_legacy_5",
						name: "read_file" as const,
						arguments: JSON.stringify({
							files: [
								{
									path: "src/task.ts",
									line_ranges: ["1-50", "100-150"],
								},
							],
						}),
					}

					const result = NativeToolCallParser.parseToolCall(toolCall)

					expect(result).not.toBeNull()
					expect(result?.type).toBe("tool_use")
					if (result?.type === "tool_use") {
						expect(result.usedLegacyFormat).toBe(true)
						const nativeArgs = result.nativeArgs as {
							files: Array<{ path: string; lineRanges?: Array<{ start: number; end: number }> }>
						}
						expect(nativeArgs.files[0].lineRanges).toHaveLength(2)
						expect(nativeArgs.files[0].lineRanges?.[0]).toEqual({ start: 1, end: 50 })
						expect(nativeArgs.files[0].lineRanges?.[1]).toEqual({ start: 100, end: 150 })
					}
				})

				it("should parse double-stringified files array (model quirk)", () => {
					// This tests the real-world case where some models double-stringify the files array
					// e.g., { files: "[{\"path\": \"...\"}]" } instead of { files: [{path: "..."}] }
					const toolCall = {
						id: "toolu_double_stringify",
						name: "read_file" as const,
						arguments: JSON.stringify({
							files: JSON.stringify([
								{ path: "src/services/example/service.ts" },
								{ path: "src/services/mcp/McpServerManager.ts" },
							]),
						}),
					}

					const result = NativeToolCallParser.parseToolCall(toolCall)

					expect(result).not.toBeNull()
					expect(result?.type).toBe("tool_use")
					if (result?.type === "tool_use") {
						expect(result.usedLegacyFormat).toBe(true)
						const nativeArgs = result.nativeArgs as {
							files: Array<{ path: string }>
							_legacyFormat: true
						}
						expect(nativeArgs._legacyFormat).toBe(true)
						expect(nativeArgs.files).toHaveLength(2)
						expect(nativeArgs.files[0].path).toBe("src/services/example/service.ts")
						expect(nativeArgs.files[1].path).toBe("src/services/mcp/McpServerManager.ts")
					}
				})

				it("should NOT set usedLegacyFormat for new format", () => {
					const toolCall = {
						id: "toolu_new",
						name: "read_file" as const,
						arguments: JSON.stringify({
							path: "src/new/format.ts",
							mode: "slice",
							offset: 1,
							limit: 100,
						}),
					}

					const result = NativeToolCallParser.parseToolCall(toolCall)

					expect(result).not.toBeNull()
					expect(result?.type).toBe("tool_use")
					if (result?.type === "tool_use") {
						expect(result.usedLegacyFormat).toBeUndefined()
					}
				})
			})
		})
	})

	describe("actionable errors for malformed calls", () => {
		it("builds args for the removed switch_mode tool even when incomplete", () => {
			const result = NativeToolCallParser.parseToolCall({
				id: "call_switch",
				name: "switch_mode" as any,
				arguments: JSON.stringify({ mode_slug: "code" }),
			}) as any

			// No parse error: validateToolUse must get the chance to explain the removal.
			expect(result.parseError).toBeUndefined()
			expect(result.nativeArgs).toEqual({ mode_slug: "code", reason: undefined })
		})

		it("reports missing required parameters with the expected schema", () => {
			const result = NativeToolCallParser.parseToolCall({
				id: "call_missing",
				name: "read_file" as any,
				arguments: JSON.stringify({ paths: ["a.ts", "b.ts"] }),
			}) as any

			expect(result).not.toBeNull()
			expect(result.nativeArgs).toBeUndefined()
			expect(result.parseError).toContain("missing required parameter(s): path")
			expect(result.parseError).toContain("Received: paths")
			expect(result.parseError).toContain("Required parameters: path.")
		})

		it("reports arguments that are not a JSON object", () => {
			const result = NativeToolCallParser.parseToolCall({
				id: "call_bad_json",
				name: "execute_command" as any,
				arguments: '{"command": "ls"',
			}) as any

			expect(result).not.toBeNull()
			expect(result.parseError).toContain("not a valid JSON object")
			expect(result.parseError).toContain("Required parameters: command.")
		})

		it("records parameters the tool does not define as ignored", () => {
			const result = NativeToolCallParser.parseToolCall({
				id: "call_extra",
				name: "write_to_file" as any,
				arguments: JSON.stringify({ path: "a.txt", content: "x", line_count: 1 }),
			}) as any

			expect(result.nativeArgs).toEqual({ path: "a.txt", content: "x" })
			expect(result.parseError).toBeUndefined()
			expect(result.ignoredParams).toEqual(["line_count"])
		})

		it("does not report accepted legacy read_file parameters as ignored", () => {
			const result = NativeToolCallParser.parseToolCall({
				id: "call_legacy",
				name: "read_file" as any,
				arguments: JSON.stringify({ files: [{ path: "a.ts" }] }),
			}) as any

			expect(result.ignoredParams).toBeUndefined()
		})

		it("accepts omitted optional parameters", () => {
			const result = NativeToolCallParser.parseToolCall({
				id: "call_optional",
				name: "execute_command" as any,
				arguments: JSON.stringify({ command: "npm test" }),
			}) as any

			expect(result.parseError).toBeUndefined()
			expect(result.nativeArgs).toEqual({ command: "npm test", cwd: undefined, timeout: undefined })
		})
	})

	describe("empty tool arguments", () => {
		const expectedMessage = NativeToolCallParser.missingToolArgumentsMessage("read_file")

		it.each(["", "   ", "\n\t"])(
			"returns a non-executable block when core tool arguments were not received for %j",
			(argumentsValue) => {
				const result = NativeToolCallParser.parseToolCall({
					id: "toolu_empty",
					name: "read_file",
					arguments: argumentsValue,
				})

				expect(result).toMatchObject({
					type: "tool_use",
					name: "read_file",
					params: {},
					partial: false,
					parseError: expectedMessage,
				})
				if (result?.type === "tool_use") {
					expect(result.nativeArgs).toBeUndefined()
				}
			},
		)

		it("returns a parseError block for execute_command with empty arguments", () => {
			const result = NativeToolCallParser.parseToolCall({
				id: "toolu_empty_cmd",
				name: "execute_command",
				arguments: "",
			})

			expect(result).toMatchObject({
				type: "tool_use",
				name: "execute_command",
				params: {},
				partial: false,
				parseError: NativeToolCallParser.missingToolArgumentsMessage("execute_command"),
			})
			if (result?.type === "tool_use") {
				expect(result.nativeArgs).toBeUndefined()
			}
		})

		it("treats empty arguments as {} for a custom tool with an empty schema", () => {
			customToolRegistry.register({
				name: "empty_schema_tool",
				description: "No required parameters",
				execute: async () => "ok",
			})

			try {
				const result = NativeToolCallParser.parseToolCall({
					id: "toolu_custom_empty",
					name: "empty_schema_tool" as "read_file",
					arguments: "",
				})

				expect(result).toMatchObject({
					type: "tool_use",
					name: "empty_schema_tool",
					params: {},
					partial: false,
					nativeArgs: {},
				})
				if (result?.type === "tool_use") {
					expect(result.parseError).toBeUndefined()
				}
			} finally {
				customToolRegistry.unregister("empty_schema_tool")
			}
		})

		it("parses dynamic MCP tools with empty arguments as {}", () => {
			const result = NativeToolCallParser.parseToolCall({
				id: "toolu_mcp_empty",
				name: "mcp--srv--tool" as "read_file",
				arguments: "",
			})

			expect(result).toMatchObject({
				type: "mcp_tool_use",
				name: "mcp--srv--tool",
				serverName: "srv",
				toolName: "tool",
				arguments: {},
				partial: false,
			})
		})

		it("keeps parseError on both blocks when streaming state is cleared between parses", () => {
			const first = NativeToolCallParser.parseToolCall({
				id: "toolu_parallel_a",
				name: "read_file",
				arguments: "",
			})
			NativeToolCallParser.clearAllStreamingToolCalls()
			const second = NativeToolCallParser.parseToolCall({
				id: "toolu_parallel_b",
				name: "execute_command",
				arguments: "   ",
			})

			expect(first?.type === "tool_use" && first.parseError).toBe(
				NativeToolCallParser.missingToolArgumentsMessage("read_file"),
			)
			expect(second?.type === "tool_use" && second.parseError).toBe(
				NativeToolCallParser.missingToolArgumentsMessage("execute_command"),
			)
		})

		it("preserves the alias as originalName when empty arguments cannot build nativeArgs", () => {
			const result = NativeToolCallParser.parseToolCall({
				id: "toolu_alias_empty",
				name: "write_file" as "read_file",
				arguments: "",
			})

			expect(result).toMatchObject({
				type: "tool_use",
				name: "write_to_file",
				originalName: "write_file",
				params: {},
				partial: false,
				parseError: NativeToolCallParser.missingToolArgumentsMessage("write_to_file"),
			})
		})

		it("reports malformed JSON as a parse error distinct from empty arguments", () => {
			const result = NativeToolCallParser.parseToolCall({
				id: "toolu_bad_json",
				name: "read_file",
				arguments: "{",
			}) as any

			expect(result).not.toBeNull()
			expect(result.parseError).toContain("not a valid JSON object")
			expect(result.parseError).not.toContain("was called with empty arguments")
		})

		it("reports a schema mismatch with the missing required parameters", () => {
			const result = NativeToolCallParser.parseToolCall({
				id: "toolu_schema",
				name: "read_file",
				arguments: "{}",
			}) as any

			expect(result).not.toBeNull()
			expect(result.parseError).toContain(
				"Invalid arguments for tool 'read_file': missing required parameter(s): path",
			)
			expect(result.parseError).not.toContain("was called with empty arguments")
		})
	})

	describe("processStreamingChunk", () => {
		describe("read_file tool", () => {
			it("should emit a partial ToolUse with nativeArgs.path during streaming", () => {
				const id = "toolu_streaming_123"
				NativeToolCallParser.startStreamingToolCall(id, "read_file")

				// Simulate streaming chunks
				const fullArgs = JSON.stringify({ path: "src/test.ts" })

				// Process the complete args as a single chunk for simplicity
				const result = NativeToolCallParser.processStreamingChunk(id, fullArgs)

				expect(result).not.toBeNull()
				expect(result?.nativeArgs).toBeDefined()
				const nativeArgs = result?.nativeArgs as { path: string }
				expect(nativeArgs.path).toBe("src/test.ts")
			})

			it("should expose file_path as nativeArgs.path during streaming", () => {
				const id = "toolu_streaming_file_path_alias"
				NativeToolCallParser.startStreamingToolCall(id, "read_file")

				const result = NativeToolCallParser.processStreamingChunk(
					id,
					JSON.stringify({ file_path: "src/core/webview/__tests__/webviewMessageHandler.spec.ts" }),
				)

				expect(result?.nativeArgs).toEqual(
					expect.objectContaining({
						path: "src/core/webview/__tests__/webviewMessageHandler.spec.ts",
					}),
				)
			})
		})

		describe("new_task tool", () => {
			it("grows params.message when a JSON string is split across chunks", () => {
				const id = "toolu_new_task_stream"
				NativeToolCallParser.startStreamingToolCall(id, "new_task")
				const first = NativeToolCallParser.processStreamingChunk(id, '{"mode":"code","message":"Write a long')
				const second = NativeToolCallParser.processStreamingChunk(id, ' task brief incrementally"}')
				expect(first?.params.message).toBe("Write a long")
				expect(second?.params.message).toBe("Write a long task brief incrementally")
				expect(second?.params.message?.startsWith(first?.params.message ?? "")).toBe(true)
			})
		})
	})

	describe("processRawChunk", () => {
		it("warns and drops an arguments chunk whose index was never opened", () => {
			const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
			try {
				const events = NativeToolCallParser.processRawChunk({
					index: 3,
					arguments: '{"path":"lost.ts"}',
				})

				expect(events).toEqual([])
				expect(warn).toHaveBeenCalledWith(
					expect.stringContaining("[NativeToolCallParser] dropping tool call chunk with no tracked index"),
				)
				expect(warn).toHaveBeenCalledWith(expect.stringContaining("index=3"))
				expect(warn).toHaveBeenCalledWith(
					expect.stringContaining(`argumentsLength=${'{"path":"lost.ts"}'.length}`),
				)
			} finally {
				warn.mockRestore()
			}
		})
	})

	describe("finalizeStreamingToolCall", () => {
		describe("read_file tool", () => {
			it("should parse read_file args on finalize", () => {
				const id = "toolu_finalize_123"
				NativeToolCallParser.startStreamingToolCall(id, "read_file")

				// Add the complete arguments
				NativeToolCallParser.processStreamingChunk(
					id,
					JSON.stringify({
						path: "finalized.ts",
						mode: "slice",
						offset: 1,
						limit: 10,
					}),
				)

				const result = NativeToolCallParser.finalizeStreamingToolCall(id)

				expect(result).not.toBeNull()
				expect(result?.type).toBe("tool_use")
				if (result?.type === "tool_use") {
					const nativeArgs = result.nativeArgs as { path: string; offset?: number; limit?: number }
					expect(nativeArgs.path).toBe("finalized.ts")
					expect(nativeArgs.offset).toBe(1)
					expect(nativeArgs.limit).toBe(10)
				}
			})
		})
	})
})
