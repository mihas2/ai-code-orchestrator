# ask_followup_question

The `ask_followup_question` tool enables interactive communication by asking specific questions to gather additional information needed to complete tasks effectively.

---

## Parameters

The tool accepts these parameters:

- `question` (required): The specific question to ask the user
- `follow_up` (required): A list of 2-4 suggested answers, each an object `{ "text": "..." }`. Each suggestion must be a complete, actionable answer without placeholders.

---

## What It Does

This tool creates a conversational interface between AI Code Orchestrator and the user, allowing for gathering clarification, additional details, or user preferences when facing ambiguities or decision points. Each question can include suggested responses to streamline the interaction.

---

## When is it used?

- When critical information is missing from the original request
- When AI Code Orchestrator needs to choose between multiple valid implementation approaches
- When technical details or preferences are required to proceed
- When AI Code Orchestrator encounters ambiguities that need resolution
- When additional context would significantly improve the solution quality

---

## Key Features

- Provides a structured way to gather specific information without breaking workflow
- Includes suggested answers to reduce user typing and guide responses
- Maintains conversation history and context across interactions
- Supports responses containing images and code snippets
- Available in all modes as part of the "always available" tool set
- Enables direct user guidance on implementation decisions
- Resets consecutive error counter when used successfully

---

## Limitations

- Limited to asking one specific question per tool use
- Presents suggestions as selectable options in the UI
- Cannot force structured responses – users can still respond freely
- Excessive use can slow down task completion and create a fragmented experience
- Suggested answers must be complete, with no placeholders requiring user edits
- No built-in validation for user responses
- Contains no mechanism to enforce specific answer formats

---

## How It Works

1. **Validation**: The `question` and `follow_up` arguments are validated against the tool schema; a missing question is reported back to the model as an error.
2. **UI**: The question is shown in the chat with the suggestions as clickable buttons. You can click a suggestion, edit it before sending, or type your own answer (images can be attached).
3. **Response**: Your answer is returned to the model as the tool result and the task continues.
4. **Auto-approval**: If **Answer follow-up questions** is enabled in [Auto-Approve](../../features/auto-approving-actions.md), the first suggestion is selected automatically after the configured timeout.

---

## Workflow Sequence

The question-answer cycle follows this sequence:

1. **Information Gap Recognition**: AI Code Orchestrator identifies missing information needed to proceed
2. **Specific Question Creation**: AI Code Orchestrator formulates a clear, targeted question
3. **Suggestion Development**: AI Code Orchestrator creates 2-4 suggested answers (required)
4. **Tool Invocation**: Assistant invokes the tool with the question and suggestions
5. **UI Presentation**: Question and suggestions are displayed to the user as interactive elements
6. **User Response**: The user selects a suggestion or provides a custom answer
7. **Message Handling**: System handles both partial and complete messages
    - For streaming responses, processes chunks as they arrive
    - For complete messages, processes the entire response at once
    - Maintains state consistency regardless of message chunking
8. **Response Processing**: The answer is returned as the tool result, wrapped in `<user_message>` tags, together with any attached images
9. **Context Integration**: Response is added to the conversation history
10. **Task Continuation**: AI Code Orchestrator proceeds with the task using the new information

---

## Examples When Used

- When developing a web application, AI Code Orchestrator might ask about preferred styling frameworks (Bootstrap, Tailwind, custom CSS)
- When creating an API, AI Code Orchestrator might ask about authentication methods (JWT, OAuth, API keys)
- When refactoring code, AI Code Orchestrator might ask about prioritizing performance vs. readability
- When setting up a database, AI Code Orchestrator might ask about specific schema design preferences
- When creating a custom feature, AI Code Orchestrator might ask about specific behavior expectations
- When troubleshooting errors, AI Code Orchestrator might ask about specific environment details

---

## Response Format

When a user responds to a question, the answer is returned to the model as the tool result, wrapped in `<user_message>` tags. This format helps clearly separate the user's answer from other conversation elements.

Example response format:

```
<user_message>
Use Tailwind CSS for utility-first styling with maximum flexibility
</user_message>
```

Key characteristics of the response format:

- Surrounded by `<user_message>` tags
- Preserves formatting of the original response
- Maintains images if included in the response
- Returns the complete text, even for long responses

---

## Usage Examples

Asking about implementation preferences:

```json
{
	"question": "Which styling approach would you prefer for this web application?",
	"follow_up": [
		{ "text": "Use Bootstrap for rapid development with consistent components" },
		{ "text": "Use Tailwind CSS for utility-first styling with maximum flexibility" },
		{ "text": "Use vanilla CSS with custom styling for complete control and minimal dependencies" }
	]
}
```

Requesting technical clarification:

```json
{
	"question": "What database should this application use for storing user data?",
	"follow_up": [
		{ "text": "MongoDB for flexible schema and document-based storage" },
		{ "text": "PostgreSQL for relational data with strong consistency guarantees" },
		{ "text": "Firebase for real-time updates and simplified backend management" },
		{ "text": "SQLite for lightweight local storage without external dependencies" }
	]
}
```

Addressing ambiguity in requirements:

```json
{
	"question": "How should the application handle user authentication?",
	"follow_up": [
		{ "text": "Implement email/password authentication with account verification" },
		{ "text": "Use social login providers (Google, GitHub, etc.) for quick signup" },
		{ "text": "Implement both email/password and social login options" }
	]
}
```
