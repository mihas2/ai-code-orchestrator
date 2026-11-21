# use_mcp_tool

The `use_mcp_tool` tool enables interaction with external tools provided by connected Model Context Protocol (MCP) servers. It extends AI Code Orchestrator's capabilities with domain-specific functionality through a standardized protocol.

---

## Parameters

Each tool of a connected MCP server is offered to the model as a separate native tool named `mcp--<server_name>--<tool_name>`, whose parameters are exactly that tool's input schema. `use_mcp_tool` is the internal name under which these calls are shown, approved, and auto-approved.

The call carries:

- `server_name`: The MCP server providing the tool (encoded in the tool name)
- `tool_name`: The tool to execute (encoded in the tool name)
- `arguments`: The tool's input, following its input schema. May be empty for tools that take no input.

> [!NOTE]
> Hyphens and underscores are normalized when names are matched, so `my-server` and `my_server` refer to the same server.

---

## What It Does

This tool allows AI Code Orchestrator to access specialized functionality provided by external MCP servers. Each MCP server can offer multiple tools with unique capabilities, extending AI Code Orchestrator beyond its built-in functionality. The system validates arguments against schemas, manages server connections, and processes responses of various content types (text, image, resource).

---

## When is it used?

- When specialized functionality not available in core tools is needed
- When domain-specific operations are required
- When integration with external systems or services is needed
- When working with data that requires specific processing or analysis
- When accessing proprietary tools through a standardized interface

---

## Key Features

- Uses the standardized MCP protocol via the `@modelcontextprotocol/sdk` library
- Supports multiple transport mechanisms (StdioClientTransport, StreamableHTTPClientTransport and SSEClientTransport)
- Validates arguments using Zod schema validation on both client and server sides
- Processes multiple response content types: text, image, and resource references
- Manages server lifecycle with automatic restarts when server code changes
- Provides an "always allow" mechanism to bypass approval for trusted tools
- Works with the companion `access_mcp_resource` tool for resource retrieval
- Maintains proper error tracking and handling for failed operations
- Supports configurable timeouts (1-3600 seconds, default: 60 seconds)
- Allows file watchers to automatically detect and reload server changes

---

## Limitations

- Depends on external MCP servers being available and connected
- Limited to the tools provided by connected servers
- Tool capabilities vary between different MCP servers
- Network issues can affect reliability and performance
- Requires user approval before execution (unless in the "always allow" list)
- Cannot execute multiple MCP tool operations simultaneously

---

## Server Configuration

MCP servers can be configured globally or at the project level:

- **Global Configuration**: Managed through the AI Code Orchestrator extension settings in VS Code. These apply across all projects unless overridden.
- **Project-level Configuration**: Defined in a `.ai-code-orchestrator/mcp.json` file within your project's root directory.
- This allows project-specific server setups.
- Project-level servers take precedence over global servers if they share the same name.
- Since `.ai-code-orchestrator/mcp.json` can be committed to version control, it simplifies sharing configurations with your team.

---

## How It Works

When the `use_mcp_tool` tool is invoked, it follows this process:

1. **Initialization and Validation**:

    - The system verifies that the MCP hub is available
    - Confirms the specified server exists and is connected
    - Validates the requested tool exists on the server
    - Arguments are validated against the tool's schema definition
    - Timeout settings are extracted from server configuration (default: 60 seconds)

2. **Execution and Communication**:

    - The system selects the appropriate transport mechanism:
        - `StdioClientTransport`: For communicating with local processes via standard I/O
        - `SSEClientTransport`: For communicating with HTTP servers via Server-Sent Events
        - `StreamableHTTPClientTransport`: For communicating with HTTP servers via Streamable HTTP Events
    - A request is sent with validated server name, tool name, and arguments
    - Communication uses the `@modelcontextprotocol/sdk` library for standardized interactions
    - Request execution is tracked with timeout handling to prevent hanging operations

3. **Response Processing**:

    - Responses can include multiple content types:
        - Text content: Plain text responses
        - Image content: Binary image data with MIME type information
        - Resource references: URIs to access server resources (works with `access_mcp_resource`)
    - The system checks the `isError` flag to determine if error handling is needed
    - Results are formatted for display in the AI Code Orchestrator interface

4. **Resource and Error Handling**:
    - The system uses WeakRef patterns to prevent memory leaks
    - A consecutive mistake counter tracks and manages errors
    - File watchers monitor for server code changes and trigger automatic restarts
    - The security model requires approval for tool execution unless in the "always allow" list

---

## Security and Permissions

The MCP architecture provides several security features:

- Users must approve tool usage before execution (by default)
- Specific tools can be marked for automatic approval in the "always allow" list
- Server configurations are validated with Zod schemas for integrity
- Configurable timeouts prevent hanging operations (1-3600 seconds)
- Server connections can be enabled or disabled through the UI

---

## Examples When Used

- Analyzing specialized data formats using server-side processing tools
- Generating images or other media through AI models hosted on external servers
- Executing complex domain-specific calculations without local implementation
- Accessing proprietary APIs or services through a controlled interface
- Retrieving data from specialized databases or data sources

---

## Usage Examples

Requesting weather forecast data with text response:

Tool `mcp--weather-server--get_forecast`, arguments:

```json
{
	"city": "San Francisco",
	"days": 5,
	"format": "text"
}
```

Analyzing source code with a specialized tool that returns JSON:

Tool `mcp--code-analysis--complexity_metrics`, arguments:

```json
{
	"language": "typescript",
	"file_path": "src/app.ts",
	"include_functions": true,
	"metrics": ["cyclomatic", "cognitive"]
}
```

Generating an image with specific parameters:

Tool `mcp--image-generation--create_image`, arguments:

```json
{
	"prompt": "A futuristic city with flying cars",
	"style": "photorealistic",
	"dimensions": {
		"width": 1024,
		"height": 768
	},
	"format": "webp"
}
```

Accessing a resource through a tool that returns a resource reference:

Tool `mcp--database-connector--query_and_store`, arguments:

```json
{
	"database": "users",
	"type": "select",
	"fields": ["name", "email", "last_login"],
	"where": {
		"status": "active"
	},
	"store_as": "active_users"
}
```

Tool with no required arguments:

Tool `mcp--system-monitor--get_current_status`, arguments:

```json
{}
```
