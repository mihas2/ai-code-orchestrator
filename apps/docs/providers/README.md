# Model Providers

The AI Code Orchestrator VS Code extension is a capable coding agent, but it depends on LLM providers for the inference needed to complete tasks.

Other tools are intrinsically bound by design to a specific provider, forcing you to stick with them irrespective of how the landscape changes. AI Code Orchestrator is **model-agnostic**, allowing you to choose the model that best fits your needs, according to your budget, skill profile, codebase, and more.

AI Code Orchestrator supports connecting to a wide range of model providers, giving you flexibility in how you access AI models.

Learn how to set up your provider in [the AI Code Orchestrator VS Code extension here](../getting-started/connecting-api-provider.md).

## Provider Comparison

Here's every provider currently documented for the extension. Click for detailed instructions.

| Provider                                       | VS Code Extension |
| ---------------------------------------------- | :---------------: |
| [Anthropic](anthropic.md)                      |        ✅         |
| [AnyModel](anymodel.md)                        |        ✅         |
| [ChatGPT Plus/Pro](openai-chatgpt-plus-pro.md) |        ✅         |
| [AWS Bedrock](bedrock.md)                      |        ✅         |
| [Baseten](baseten.md)                          |        ✅         |
| [DeepSeek](deepseek.md)                        |        ✅         |
| [Fireworks AI](fireworks.md)                   |        ✅         |
| [Google Gemini](gemini.md)                     |        ✅         |
| [LM Studio](lmstudio.md)                       |        ✅         |
| [LiteLLM](litellm.md)                          |        ✅         |
| [MiniMax](minimax.md)                          |        ✅         |
| [Mistral AI](mistral.md)                       |        ✅         |
| [Moonshot](moonshot.md)                        |        ✅         |
| [Ollama](ollama.md)                            |        ✅         |
| [OpenAI](openai.md)                            |        ✅         |
| [OpenAI Compatible](openai-compatible.md)      |        ✅         |
| [OpenRouter](openrouter.md)                    |        ✅         |
| [Qwen Code CLI](qwen-code.md)                  |        ✅         |
| [Requesty](requesty.md)                        |        ✅         |
| [SambaNova](sambanova.md)                      |        ✅         |
| [Vercel AI Gateway](vercel-ai-gateway.md)      |        ✅         |
| [GCP Vertex AI](vertex.md)                     |        ✅         |
| [VS Code Language Model API](vscode-lm.md)     |        ✅         |
| [xAI (Grok)](xai.md)                           |        ✅         |
| [Z AI](zai.md)                                 |        ✅         |

## Overwhelmed by choice?

Yeah, it's a lot.

- **Want access to many models?** Try [OpenRouter](openrouter.md) for a single API to 100+ models or [AnyModel](anymodel.md) with 5 million free tokens for new users
- **Want to optimize for specific models?** Use the first-party provider for each of them (Anthropic, OpenAI, etc)
- **Looking for local/offline models?** Check out [Ollama](ollama.md) or [LM Studio](lmstudio.md)
