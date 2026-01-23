/**
 * Gemini API Client for AI SDK LanguageModelV2 integration.
 *
 * Implements Google Gemini API protocol for streaming text generation.
 * Reference: https://ai.google.dev/gemini-api/docs
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
 * Gemini content part types
 */
export interface GeminiTextPart {
  text: string;
}

export interface GeminiInlineDataPart {
  inlineData: {
    mimeType: string;
    data: string; // base64 encoded
  };
}

export interface GeminiFunctionCallPart {
  functionCall: {
    name: string;
    args: Record<string, unknown>;
  };
}

export interface GeminiFunctionResponsePart {
  functionResponse: {
    name: string;
    response: Record<string, unknown>;
  };
}

export interface GeminiThoughtPart {
  thought: boolean;
  text: string;
}

export type GeminiPart =
  | GeminiTextPart
  | GeminiInlineDataPart
  | GeminiFunctionCallPart
  | GeminiFunctionResponsePart
  | GeminiThoughtPart;

export interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

export interface GeminiFunctionDeclaration {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
}

export interface GeminiTool {
  functionDeclarations: GeminiFunctionDeclaration[];
}

export interface GeminiGenerationConfig {
  temperature?: number;
  topK?: number;
  topP?: number;
  maxOutputTokens?: number;
  stopSequences?: string[];
  thinkingConfig?: {
    thinkingBudget?: number;
    thinkingLevel?: "LOW" | "MEDIUM" | "HIGH" | "NONE";
    includeThoughts?: boolean;
  };
}

export interface GeminiGenerateContentRequest {
  contents: GeminiContent[];
  tools?: GeminiTool[];
  toolConfig?: {
    functionCallingConfig?: {
      mode: "AUTO" | "ANY" | "NONE";
      allowedFunctionNames?: string[];
    };
  };
  generationConfig?: GeminiGenerationConfig;
  systemInstruction?: {
    parts: GeminiTextPart[];
  };
}

export interface GeminiStreamChunk {
  candidates?: Array<{
    content?: {
      role?: string;
      parts?: Array<{
        text?: string;
        thought?: boolean;
        functionCall?: {
          name: string;
          args: Record<string, unknown>;
        };
      }>;
    };
    finishReason?: string;
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
    thoughtsTokenCount?: number;
  };
}

/**
 * Counter for generating unique IDs
 */
let idCounter = 0;
function generateId(): string {
  return `gemini_${Date.now()}_${++idCounter}`;
}

/**
 * Normalize API endpoint by removing trailing slashes and /v1 suffix.
 * Gemini API uses /v1beta path, not /v1.
 */
function normalizeGeminiEndpoint(endpoint: string): string {
  let normalized = endpoint.replace(/\/+$/, "");
  // Remove /v1 suffix if present (common in OpenAI-compatible configs)
  if (normalized.endsWith("/v1")) {
    normalized = normalized.slice(0, -3);
  }
  return normalized;
}

/**
 * Convert AI SDK messages to Gemini format
 */
function convertMessagesToGemini(
  messages: LanguageModelV2Message[],
): { contents: GeminiContent[]; systemInstruction?: string } {
  const contents: GeminiContent[] = [];
  let systemInstruction: string | undefined;

  for (const message of messages) {
    if (message.role === "system") {
      // V2: system message content is a string directly
      systemInstruction = (systemInstruction || "") + message.content;
    } else if (message.role === "user") {
      const parts: GeminiPart[] = [];
      for (const part of message.content) {
        if (part.type === "text") {
          parts.push({ text: part.text });
        } else if (part.type === "file") {
          // Handle file content (V2 uses file instead of image)
          const filePart = part;
          if (filePart.mediaType.startsWith("image/")) {
            if (typeof filePart.data === "string") {
              // Base64 or URL string
              if (filePart.data.startsWith("data:")) {
                // Data URL
                const match = filePart.data.match(/^data:([^;]+);base64,(.+)$/);
                if (match) {
                  parts.push({
                    inlineData: {
                      mimeType: match[1],
                      data: match[2],
                    },
                  });
                }
              } else if (filePart.data.startsWith("http")) {
                // URL - treat as text with note
                parts.push({ text: `[Image URL: ${filePart.data}]` });
              } else {
                // Assume base64 without data URL prefix
                parts.push({
                  inlineData: {
                    mimeType: filePart.mediaType,
                    data: filePart.data,
                  },
                });
              }
            } else if (filePart.data instanceof URL) {
              parts.push({ text: `[Image URL: ${filePart.data.toString()}]` });
            } else if (filePart.data instanceof Uint8Array) {
              // Binary data
              const base64 = Buffer.from(filePart.data).toString("base64");
              parts.push({
                inlineData: {
                  mimeType: filePart.mediaType,
                  data: base64,
                },
              });
            }
          }
        }
      }
      if (parts.length > 0) {
        contents.push({ role: "user", parts });
      }
    } else if (message.role === "assistant") {
      const parts: GeminiPart[] = [];
      for (const part of message.content) {
        if (part.type === "text") {
          parts.push({ text: part.text });
        } else if (part.type === "tool-call") {
          // V2: uses 'input' instead of 'args'
          const input = part.input as Record<string, unknown>;
          parts.push({
            functionCall: {
              name: part.toolName,
              args: input,
            },
          });
        }
      }
      if (parts.length > 0) {
        contents.push({ role: "model", parts });
      }
    } else if (message.role === "tool") {
      // Tool results in Gemini are sent as user messages with functionResponse
      const parts: GeminiPart[] = [];
      for (const part of message.content) {
        if (part.type === "tool-result") {
          // V2: uses 'output' with a specific structure
          let response: Record<string, unknown>;
          const output = part.output;
          if (output.type === "text" || output.type === "error-text") {
            response = { result: output.value };
          } else if (output.type === "json" || output.type === "error-json") {
            response = typeof output.value === "object" && output.value !== null
              ? (output.value as Record<string, unknown>)
              : { result: output.value };
          } else if (output.type === "content") {
            // Content array - convert to string
            const text = output.value.map((c: { type: string; text?: string }) => 
              c.type === "text" ? c.text : "[media]"
            ).join("\n");
            response = { result: text };
          } else {
            response = { result: String(output) };
          }
          parts.push({
            functionResponse: {
              name: part.toolName,
              response,
            },
          });
        }
      }
      if (parts.length > 0) {
        contents.push({ role: "user", parts });
      }
    }
  }

  return { contents, systemInstruction };
}

/**
 * Convert AI SDK tools to Gemini function declarations
 */
function convertToolsToGemini(
  tools: LanguageModelV2FunctionTool[] | undefined,
): GeminiFunctionDeclaration[] | undefined {
  if (!tools || tools.length === 0) {
    return undefined;
  }

  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.inputSchema as Record<string, unknown>,
  }));
}

/**
 * Map Gemini finish reason to AI SDK finish reason
 */
function mapFinishReason(
  geminiReason: string | undefined,
): LanguageModelV2FinishReason {
  switch (geminiReason) {
    case "STOP":
      return "stop";
    case "MAX_TOKENS":
      return "length";
    case "SAFETY":
    case "RECITATION":
    case "OTHER":
      return "content-filter";
    case "FUNCTION_CALL":
      return "tool-calls";
    default:
      return "stop";
  }
}

export interface GeminiClientConfig {
  baseURL: string;
  apiKey: string;
  headers?: Record<string, string>;
}

/**
 * Gemini API client for AI SDK integration
 */
export class GeminiClient {
  private readonly baseURL: string;
  private readonly apiKey: string;
  private readonly headers: Record<string, string>;

  constructor(config: GeminiClientConfig) {
    this.baseURL = normalizeGeminiEndpoint(config.baseURL);
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
    const { contents, systemInstruction } = convertMessagesToGemini(
      options.prompt,
    );
    const tools = convertToolsToGemini(
      options.tools?.filter(
        (t): t is LanguageModelV2FunctionTool => t.type === "function",
      ),
    );

    const modelPath = modelId.startsWith("models/")
      ? modelId
      : `models/${modelId}`;
    const url = `${this.baseURL}/v1beta/${modelPath}:generateContent`;

    const request: GeminiGenerateContentRequest = { contents };

    if (systemInstruction) {
      request.systemInstruction = { parts: [{ text: systemInstruction }] };
    }

    if (tools && tools.length > 0) {
      request.tools = [{ functionDeclarations: tools }];
      request.toolConfig = {
        functionCallingConfig: {
          mode:
            options.toolChoice?.type === "required"
              ? "ANY"
              : options.toolChoice?.type === "none"
                ? "NONE"
                : "AUTO",
        },
      };
    }

    const generationConfig: GeminiGenerationConfig = {};
    if (options.maxOutputTokens) {
      generationConfig.maxOutputTokens = options.maxOutputTokens;
    }
    if (options.temperature !== undefined) {
      generationConfig.temperature = options.temperature;
    }
    if (options.topP !== undefined) {
      generationConfig.topP = options.topP;
    }
    if (options.topK !== undefined) {
      generationConfig.topK = options.topK;
    }
    if (options.stopSequences && options.stopSequences.length > 0) {
      generationConfig.stopSequences = options.stopSequences;
    }

    if (Object.keys(generationConfig).length > 0) {
      request.generationConfig = generationConfig;
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": this.apiKey,
        ...this.headers,
      },
      body: JSON.stringify(request),
      signal: options.abortSignal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Gemini API error: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    const data = await response.json() as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string; thought?: boolean; functionCall?: { name: string; args: Record<string, unknown> } }> };
        finishReason?: string;
      }>;
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };
    const candidate = data.candidates?.[0];
    const parts = candidate?.content?.parts || [];

    const content: LanguageModelV2Content[] = [];
    for (const part of parts) {
      if (part.thought && part.text) {
        content.push({ type: "reasoning", text: part.text });
      } else if (part.text) {
        content.push({ type: "text", text: part.text });
      } else if (part.functionCall) {
        content.push({
          type: "tool-call",
          toolCallId: generateId(),
          toolName: part.functionCall.name,
          input: JSON.stringify(part.functionCall.args),
        });
      }
    }

    return {
      content,
      finishReason: mapFinishReason(candidate?.finishReason),
      usage: {
        inputTokens: data.usageMetadata?.promptTokenCount,
        outputTokens: data.usageMetadata?.candidatesTokenCount,
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
    const { contents, systemInstruction } = convertMessagesToGemini(
      options.prompt,
    );
    const tools = convertToolsToGemini(
      options.tools?.filter(
        (t): t is LanguageModelV2FunctionTool => t.type === "function",
      ),
    );

    const modelPath = modelId.startsWith("models/")
      ? modelId
      : `models/${modelId}`;
    const url = `${this.baseURL}/v1beta/${modelPath}:streamGenerateContent?alt=sse`;

    const request: GeminiGenerateContentRequest = { contents };

    if (systemInstruction) {
      request.systemInstruction = { parts: [{ text: systemInstruction }] };
    }

    if (tools && tools.length > 0) {
      request.tools = [{ functionDeclarations: tools }];
      request.toolConfig = {
        functionCallingConfig: {
          mode:
            options.toolChoice?.type === "required"
              ? "ANY"
              : options.toolChoice?.type === "none"
                ? "NONE"
                : "AUTO",
        },
      };
    }

    const generationConfig: GeminiGenerationConfig = {};
    if (options.maxOutputTokens) {
      generationConfig.maxOutputTokens = options.maxOutputTokens;
    }
    if (options.temperature !== undefined) {
      generationConfig.temperature = options.temperature;
    }
    if (options.topP !== undefined) {
      generationConfig.topP = options.topP;
    }
    if (options.topK !== undefined) {
      generationConfig.topK = options.topK;
    }
    if (options.stopSequences && options.stopSequences.length > 0) {
      generationConfig.stopSequences = options.stopSequences;
    }

    if (Object.keys(generationConfig).length > 0) {
      request.generationConfig = generationConfig;
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": this.apiKey,
        ...this.headers,
      },
      body: JSON.stringify(request),
      signal: options.abortSignal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Gemini API error: ${response.status} ${response.statusText} - ${errorText}`,
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
        const toolCalls: Array<{
          id: string;
          name: string;
          args: Record<string, unknown>;
        }> = [];
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
            const events = buffer.split(/\n\n/);
            buffer = events.pop() || "";

            for (const event of events) {
              const lines = event.split("\n");
              for (const line of lines) {
                if (line.startsWith("data: ")) {
                  const jsonStr = line.substring(6).trim();
                  if (!jsonStr || jsonStr === "[DONE]") {
                    continue;
                  }

                  try {
                    const chunk: GeminiStreamChunk = JSON.parse(jsonStr);
                    const candidate = chunk.candidates?.[0];
                    const parts = candidate?.content?.parts;

                    if (chunk.usageMetadata) {
                      usage = {
                        inputTokens: chunk.usageMetadata.promptTokenCount,
                        outputTokens: chunk.usageMetadata.candidatesTokenCount,
                      };
                    }

                    if (candidate?.finishReason) {
                      finishReason = mapFinishReason(candidate.finishReason);
                    }

                    if (parts) {
                      for (const part of parts) {
                        if (part.thought && part.text) {
                          // Reasoning content
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
                            delta: part.text,
                          });
                        } else if (part.text && !part.thought) {
                          // Regular text
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
                            delta: part.text,
                          });
                        } else if (part.functionCall) {
                          const callId = generateId();
                          toolCalls.push({
                            id: callId,
                            name: part.functionCall.name,
                            args: part.functionCall.args,
                          });
                        }
                      }
                    }
                  } catch {
                    // Ignore parse errors
                  }
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

          // Emit tool calls
          if (toolCalls.length > 0) {
            finishReason = "tool-calls";
            for (const tc of toolCalls) {
              const inputJson = JSON.stringify(tc.args);
              controller.enqueue({
                type: "tool-input-start",
                id: tc.id,
                toolName: tc.name,
              });
              controller.enqueue({
                type: "tool-input-delta",
                id: tc.id,
                delta: inputJson,
              });
              controller.enqueue({
                type: "tool-input-end",
                id: tc.id,
              });
              controller.enqueue({
                type: "tool-call",
                toolCallId: tc.id,
                toolName: tc.name,
                input: inputJson,
              });
            }
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
