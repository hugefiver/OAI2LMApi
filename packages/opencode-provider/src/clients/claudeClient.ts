/**
 * Claude API Client for AI SDK LanguageModelV2 integration.
 *
 * Implements Anthropic Claude API protocol for streaming text generation.
 * Reference: https://docs.anthropic.com/en/api/messages
 */

import type {
  LanguageModelV2CallOptions,
  LanguageModelV2FunctionTool,
  LanguageModelV2Message,
  LanguageModelV2StreamPart,
  LanguageModelV2FinishReason,
  LanguageModelV2Content,
} from "@ai-sdk/provider";

/**
 * Claude content block types
 */
export interface ClaudeTextBlock {
  type: "text";
  text: string;
}

export interface ClaudeImageBlock {
  type: "image";
  source: {
    type: "base64";
    media_type: string;
    data: string;
  };
}

export interface ClaudeToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ClaudeToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string | Array<ClaudeTextBlock | ClaudeImageBlock>;
  is_error?: boolean;
}

export interface ClaudeThinkingBlock {
  type: "thinking";
  thinking: string;
}

export type ClaudeContentBlock =
  | ClaudeTextBlock
  | ClaudeImageBlock
  | ClaudeToolUseBlock
  | ClaudeToolResultBlock
  | ClaudeThinkingBlock;

export interface ClaudeMessage {
  role: "user" | "assistant";
  content: string | ClaudeContentBlock[];
}

export interface ClaudeToolDefinition {
  name: string;
  description?: string;
  input_schema: Record<string, unknown>;
}

export interface ClaudeMessagesRequest {
  model: string;
  messages: ClaudeMessage[];
  max_tokens: number;
  system?: string | Array<{ type: "text"; text: string }>;
  tools?: ClaudeToolDefinition[];
  tool_choice?: { type: "auto" | "any" | "tool"; name?: string };
  temperature?: number;
  top_p?: number;
  top_k?: number;
  stop_sequences?: string[];
  stream?: boolean;
  thinking?: {
    type: "enabled";
    budget_tokens: number;
  };
}

export interface ClaudeMessagesResponse {
  id: string;
  type: "message";
  role: "assistant";
  content: ClaudeContentBlock[];
  model: string;
  stop_reason: "end_turn" | "max_tokens" | "stop_sequence" | "tool_use" | null;
  stop_sequence: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

/**
 * Claude streaming event types
 */
export interface ClaudeStreamEvent {
  type: string;
  index?: number;
  content_block?: ClaudeContentBlock;
  delta?: {
    type?: string;
    text?: string;
    thinking?: string;
    partial_json?: string;
  };
  message?: ClaudeMessagesResponse;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}

/**
 * Counter for generating unique IDs
 */
let idCounter = 0;
function generateId(): string {
  return `claude_${Date.now()}_${++idCounter}`;
}

/**
 * Normalize API endpoint by removing trailing slashes and /v1 suffix.
 */
function normalizeClaudeEndpoint(endpoint: string): string {
  let normalized = endpoint.replace(/\/+$/, "");
  // Remove /v1 suffix if present (common in OpenAI-compatible configs)
  if (normalized.endsWith("/v1")) {
    normalized = normalized.slice(0, -3);
  }
  return normalized;
}

/**
 * Convert AI SDK messages to Claude format
 */
function convertMessagesToClaude(
  messages: LanguageModelV2Message[],
): { messages: ClaudeMessage[]; system?: string } {
  const claudeMessages: ClaudeMessage[] = [];
  let systemContent: string | undefined;

  for (const message of messages) {
    if (message.role === "system") {
      // V2: system message content is a string directly
      systemContent = (systemContent || "") + message.content;
    } else if (message.role === "user") {
      const content: ClaudeContentBlock[] = [];
      for (const part of message.content) {
        if (part.type === "text") {
          content.push({ type: "text", text: part.text });
        } else if (part.type === "file") {
          // Handle file content (V2 uses file instead of image)
          const filePart = part;
          if (filePart.mediaType.startsWith("image/")) {
            if (typeof filePart.data === "string") {
              if (filePart.data.startsWith("data:")) {
                // Data URL
                const match = filePart.data.match(/^data:([^;]+);base64,(.+)$/);
                if (match) {
                  content.push({
                    type: "image",
                    source: {
                      type: "base64",
                      media_type: match[1],
                      data: match[2],
                    },
                  });
                }
              } else {
                // Assume base64 without data URL prefix
                content.push({
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: filePart.mediaType,
                    data: filePart.data,
                  },
                });
              }
            } else if (filePart.data instanceof Uint8Array) {
              // Binary data
              const base64 = Buffer.from(filePart.data).toString("base64");
              content.push({
                type: "image",
                source: {
                  type: "base64",
                  media_type: filePart.mediaType,
                  data: base64,
                },
              });
            }
          }
        }
      }
      if (content.length > 0) {
        claudeMessages.push({
          role: "user",
          content: content.length === 1 && content[0].type === "text"
            ? content[0].text
            : content,
        });
      }
    } else if (message.role === "assistant") {
      const content: ClaudeContentBlock[] = [];
      for (const part of message.content) {
        if (part.type === "text") {
          content.push({ type: "text", text: part.text });
        } else if (part.type === "reasoning") {
          content.push({ type: "thinking", thinking: part.text });
        } else if (part.type === "tool-call") {
          // V2: uses 'input' instead of 'args'
          const input = part.input as Record<string, unknown>;
          content.push({
            type: "tool_use",
            id: part.toolCallId,
            name: part.toolName,
            input,
          });
        }
      }
      if (content.length > 0) {
        claudeMessages.push({ role: "assistant", content });
      }
    } else if (message.role === "tool") {
      // Tool results in Claude are sent as user messages
      const content: ClaudeContentBlock[] = [];
      for (const part of message.content) {
        if (part.type === "tool-result") {
          // V2: uses 'output' with a specific structure
          let resultContent: string;
          const output = part.output;
          if (output.type === "text" || output.type === "error-text") {
            resultContent = output.value;
          } else if (output.type === "json" || output.type === "error-json") {
            resultContent = JSON.stringify(output.value);
          } else if (output.type === "content") {
            // Content array - convert to string
            resultContent = output.value.map((c: { type: string; text?: string }) => 
              c.type === "text" ? c.text : "[media]"
            ).join("\n");
          } else {
            resultContent = String(output);
          }
          const isError = output.type === "error-text" || output.type === "error-json";
          content.push({
            type: "tool_result",
            tool_use_id: part.toolCallId,
            content: resultContent,
            is_error: isError,
          });
        }
      }
      if (content.length > 0) {
        claudeMessages.push({ role: "user", content });
      }
    }
  }

  return { messages: claudeMessages, system: systemContent };
}

/**
 * Convert AI SDK tools to Claude tool definitions
 */
function convertToolsToClaude(
  tools: LanguageModelV2FunctionTool[] | undefined,
): ClaudeToolDefinition[] | undefined {
  if (!tools || tools.length === 0) {
    return undefined;
  }

  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema as Record<string, unknown>,
  }));
}

/**
 * Map Claude stop reason to AI SDK finish reason
 */
function mapFinishReason(
  claudeReason: string | null | undefined,
): LanguageModelV2FinishReason {
  switch (claudeReason) {
    case "end_turn":
    case "stop_sequence":
      return "stop";
    case "max_tokens":
      return "length";
    case "tool_use":
      return "tool-calls";
    default:
      return "stop";
  }
}

export interface ClaudeClientConfig {
  baseURL: string;
  apiKey: string;
  headers?: Record<string, string>;
}

/**
 * Claude API client for AI SDK integration
 */
export class ClaudeClient {
  private readonly baseURL: string;
  private readonly apiKey: string;
  private readonly headers: Record<string, string>;

  constructor(config: ClaudeClientConfig) {
    this.baseURL = normalizeClaudeEndpoint(config.baseURL);
    this.apiKey = config.apiKey;
    this.headers = config.headers || {};
  }

  /**
   * Generate content (non-streaming)
   */
  async doGenerate(
    modelId: string,
    options: LanguageModelV2CallOptions,
  ): Promise<{
    content: LanguageModelV2Content[];
    finishReason: LanguageModelV2FinishReason;
    usage: {
      inputTokens: number | undefined;
      outputTokens: number | undefined;
    };
  }> {
    const { messages, system } = convertMessagesToClaude(options.prompt);
    const tools = convertToolsToClaude(
      options.tools?.filter(
        (t): t is LanguageModelV2FunctionTool => t.type === "function",
      ),
    );

    const url = `${this.baseURL}/v1/messages`;

    const request: ClaudeMessagesRequest = {
      model: modelId,
      messages,
      max_tokens: options.maxOutputTokens || 8192,
      stream: false,
    };

    if (system) {
      request.system = system;
    }

    if (tools && tools.length > 0) {
      request.tools = tools;
      if (options.toolChoice?.type === "required") {
        request.tool_choice = { type: "any" };
      } else if (options.toolChoice?.type === "none") {
        // Claude doesn't have a "none" tool choice, just don't send tools
        delete request.tools;
      } else if (options.toolChoice?.type === "tool") {
        request.tool_choice = {
          type: "tool",
          name: options.toolChoice.toolName,
        };
      } else {
        request.tool_choice = { type: "auto" };
      }
    }

    if (options.temperature !== undefined) {
      request.temperature = options.temperature;
    }
    if (options.topP !== undefined) {
      request.top_p = options.topP;
    }
    if (options.topK !== undefined) {
      request.top_k = options.topK;
    }
    if (options.stopSequences && options.stopSequences.length > 0) {
      request.stop_sequences = options.stopSequences;
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
        ...this.headers,
      },
      body: JSON.stringify(request),
      signal: options.abortSignal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Claude API error: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    const data = await response.json() as ClaudeMessagesResponse;

    const content: LanguageModelV2Content[] = [];
    for (const block of data.content) {
      if (block.type === "text") {
        content.push({ type: "text", text: block.text });
      } else if (block.type === "thinking") {
        content.push({ type: "reasoning", text: block.thinking });
      } else if (block.type === "tool_use") {
        content.push({
          type: "tool-call",
          toolCallId: block.id,
          toolName: block.name,
          input: JSON.stringify(block.input),
        });
      }
    }

    return {
      content,
      finishReason: mapFinishReason(data.stop_reason),
      usage: {
        inputTokens: data.usage?.input_tokens,
        outputTokens: data.usage?.output_tokens,
      },
    };
  }

  /**
   * Stream content generation
   */
  async doStream(
    modelId: string,
    options: LanguageModelV2CallOptions,
  ): Promise<{
    stream: ReadableStream<LanguageModelV2StreamPart>;
  }> {
    const { messages, system } = convertMessagesToClaude(options.prompt);
    const tools = convertToolsToClaude(
      options.tools?.filter(
        (t): t is LanguageModelV2FunctionTool => t.type === "function",
      ),
    );

    const url = `${this.baseURL}/v1/messages`;

    const request: ClaudeMessagesRequest = {
      model: modelId,
      messages,
      max_tokens: options.maxOutputTokens || 8192,
      stream: true,
    };

    if (system) {
      request.system = system;
    }

    if (tools && tools.length > 0) {
      request.tools = tools;
      if (options.toolChoice?.type === "required") {
        request.tool_choice = { type: "any" };
      } else if (options.toolChoice?.type === "none") {
        delete request.tools;
      } else if (options.toolChoice?.type === "tool") {
        request.tool_choice = {
          type: "tool",
          name: options.toolChoice.toolName,
        };
      } else {
        request.tool_choice = { type: "auto" };
      }
    }

    if (options.temperature !== undefined) {
      request.temperature = options.temperature;
    }
    if (options.topP !== undefined) {
      request.top_p = options.topP;
    }
    if (options.topK !== undefined) {
      request.top_k = options.topK;
    }
    if (options.stopSequences && options.stopSequences.length > 0) {
      request.stop_sequences = options.stopSequences;
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
        ...this.headers,
      },
      body: JSON.stringify(request),
      signal: options.abortSignal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Claude API error: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    if (!response.body) {
      throw new Error("Response body is null");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    const stream = new ReadableStream<LanguageModelV2StreamPart>({
      async start(controller) {
        let buffer = "";
        let textId: string | undefined;
        let reasoningId: string | undefined;
        let hasEmittedTextStart = false;
        let hasEmittedReasoningStart = false;

        // Track current tool call being streamed
        const toolCalls: Map<
          number,
          { id: string; name: string; inputJson: string }
        > = new Map();

        let finishReason: LanguageModelV2FinishReason = "stop";
        let usage: {
          inputTokens: number | undefined;
          outputTokens: number | undefined;
        } = { inputTokens: undefined, outputTokens: undefined };

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              break;
            }

            buffer += decoder.decode(value, { stream: true });

            // Process SSE events
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (line.startsWith("data: ")) {
                const jsonStr = line.substring(6).trim();
                if (!jsonStr || jsonStr === "[DONE]") {
                  continue;
                }

                try {
                  const event: ClaudeStreamEvent = JSON.parse(jsonStr);

                  // Handle different event types
                  switch (event.type) {
                    case "message_start":
                      if (event.message?.usage) {
                        usage.inputTokens = event.message.usage.input_tokens;
                      }
                      break;

                    case "content_block_start":
                      if (event.content_block) {
                        if (event.content_block.type === "text") {
                          if (!hasEmittedTextStart) {
                            textId = generateId();
                            controller.enqueue({
                              type: "text-start",
                              id: textId,
                            });
                            hasEmittedTextStart = true;
                          }
                        } else if (event.content_block.type === "thinking") {
                          if (!hasEmittedReasoningStart) {
                            reasoningId = generateId();
                            controller.enqueue({
                              type: "reasoning-start",
                              id: reasoningId,
                            });
                            hasEmittedReasoningStart = true;
                          }
                        } else if (event.content_block.type === "tool_use") {
                          const block = event.content_block as ClaudeToolUseBlock;
                          toolCalls.set(event.index!, {
                            id: block.id,
                            name: block.name,
                            inputJson: "",
                          });
                          controller.enqueue({
                            type: "tool-input-start",
                            id: block.id,
                            toolName: block.name,
                          });
                        }
                      }
                      break;

                    case "content_block_delta":
                      if (event.delta) {
                        if (event.delta.type === "text_delta" && event.delta.text) {
                          if (!hasEmittedTextStart) {
                            textId = generateId();
                            controller.enqueue({
                              type: "text-start",
                              id: textId,
                            });
                            hasEmittedTextStart = true;
                          }
                          controller.enqueue({
                            type: "text-delta",
                            id: textId!,
                            delta: event.delta.text,
                          });
                        } else if (
                          event.delta.type === "thinking_delta" &&
                          event.delta.thinking
                        ) {
                          if (!hasEmittedReasoningStart) {
                            reasoningId = generateId();
                            controller.enqueue({
                              type: "reasoning-start",
                              id: reasoningId,
                            });
                            hasEmittedReasoningStart = true;
                          }
                          controller.enqueue({
                            type: "reasoning-delta",
                            id: reasoningId!,
                            delta: event.delta.thinking,
                          });
                        } else if (
                          event.delta.type === "input_json_delta" &&
                          event.delta.partial_json !== undefined
                        ) {
                          const tc = toolCalls.get(event.index!);
                          if (tc) {
                            tc.inputJson += event.delta.partial_json;
                            controller.enqueue({
                              type: "tool-input-delta",
                              id: tc.id,
                              delta: event.delta.partial_json,
                            });
                          }
                        }
                      }
                      break;

                    case "content_block_stop":
                      // Check if this is a tool use block ending
                      const tc = toolCalls.get(event.index!);
                      if (tc) {
                        controller.enqueue({
                          type: "tool-input-end",
                          id: tc.id,
                        });
                        controller.enqueue({
                          type: "tool-call",
                          toolCallId: tc.id,
                          toolName: tc.name,
                          input: tc.inputJson,
                        });
                      }
                      break;

                    case "message_delta":
                      if (event.delta && "stop_reason" in event.delta) {
                        finishReason = mapFinishReason(
                          (event.delta as { stop_reason?: string }).stop_reason,
                        );
                      }
                      if (event.usage) {
                        usage.outputTokens = event.usage.output_tokens;
                      }
                      break;

                    case "message_stop":
                      // Message complete
                      break;
                  }
                } catch {
                  // Ignore parse errors
                }
              }
            }
          }

          // End reasoning stream if started
          if (hasEmittedReasoningStart && reasoningId) {
            controller.enqueue({ type: "reasoning-end", id: reasoningId });
          }

          // End text stream if started
          if (hasEmittedTextStart && textId) {
            controller.enqueue({ type: "text-end", id: textId });
          }

          // Emit finish
          controller.enqueue({
            type: "finish",
            finishReason,
            usage: {
              inputTokens: usage.inputTokens,
              outputTokens: usage.outputTokens,
              totalTokens:
                usage.inputTokens !== undefined &&
                usage.outputTokens !== undefined
                  ? usage.inputTokens + usage.outputTokens
                  : undefined,
            },
          });

          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });

    return { stream };
  }
}
