---
description: Learn how suggested responses in AI Code Orchestrator help you quickly answer follow-up questions with pre-formulated options, speeding up your workflow.
keywords:
    - suggested responses
    - follow-up questions
    - quick answers
    - workflow optimization
    - ask_followup_question tool
sidebar_label: Suggested Responses
---

import Codicon from '@site/src/components/Codicon';

# Suggested Responses

When AI Code Orchestrator needs more information to complete a task, it uses the [`ask_followup_question` tool](/advanced-usage/available-tools/ask-followup-question). To make responding easier and faster, AI Code Orchestrator often provides suggested answers alongside the question.

---

## Overview

Suggested Responses appear as clickable buttons directly below AI Code Orchestrator's question in the chat interface. They offer pre-formulated answers relevant to the question, helping you provide input quickly.

<img src="/img/suggested-responses/suggested-responses.png" alt="Example of AI Code Orchestrator asking a question with suggested response buttons below it" width="500" />

---

## How It Works

1.  **Question Appears**: AI Code Orchestrator asks a question using the `ask_followup_question` tool.
2.  **Suggestions Displayed**: If suggestions are provided by AI Code Orchestrator, they appear as buttons below the question.
3.  **Interaction**: You can interact with these suggestions in two ways.

---

## Interacting with Suggestions

You have three options for using suggested responses:

1.  **Direct Selection**:

    - **Action**: Simply click the button containing the answer you want to provide.
    - **Result**: The selected answer is immediately sent back to AI Code Orchestrator as your response. This is the quickest way to reply if one of the suggestions perfectly matches your intent.

2.  **Keyboard Shortcut**:

    - **Action**: Use the `aico.acceptInput` command with your configured keyboard shortcut.
    - **Result**: The primary (first) suggestion button is automatically selected.
    - **Note**: For setup details, see [Keyboard Shortcuts](/features/keyboard-shortcuts).

3.  **Edit Before Sending**:
    - **Action**:
        - Hold down `Shift` and click the suggestion button.
        - _Alternatively_, hover over the suggestion button and click the pencil icon (<Codicon name="edit" />) that appears.
    - **Result**: The text of the suggestion is copied into the chat input box. You can then modify the text as needed before pressing Enter to send your customized response. This is useful when a suggestion is close but needs minor adjustments.

<img src="/img/suggested-responses/suggested-responses-1.png" alt="Chat input box showing text copied from a suggested response, ready for editing" width="600" />

---

## Benefits

- **Speed**: Quickly respond without typing full answers.
- **Clarity**: Suggestions often clarify the type of information AI Code Orchestrator needs.
- **Flexibility**: Edit suggestions to provide precise, customized answers when needed.

This feature streamlines the interaction when AI Code Orchestrator requires clarification, allowing you to guide the task effectively with minimal effort.
