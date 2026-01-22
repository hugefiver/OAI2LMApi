/**
 * Enhanced Language Model wrapper that adds advanced features:
 * - Prompt-based tool calling (XML format)
 *
 * This wraps an AI SDK LanguageModelV2 to intercept and transform requests/responses.
 */

import type {
  LanguageModelV2,
  LanguageModelV2CallOptions,
  LanguageModelV2Content,
  LanguageModelV2FunctionTool,
  LanguageModelV2Message,
  LanguageModelV2StreamPart,
} from "@ai-sdk/provider";

import type { ModelOverride, ThinkingLevel } from "./config.js";
import {
  generateXmlToolPrompt,
  parseXmlToolCalls,
  type ToolDefinition,
} from "./xmlTools.js";

/**
 * Counter for generating unique IDs
 */
let idCounter = 0;
function generateId(): string {
  return `id_${Date.now()}_${++idCounter}`;
}

/**
 * Result of parsing thinking tags from text
 */
interface ThinkingParseResult {
  /** Text content with thinking tags removed */
  textContent: string;
  /** Extracted reasoning/thinking content */
  reasoningContent: string;
  /** Whether thinking content was found */
  hasThinking: boolean;
}

/**
 * Parse <think> (at start) and <thinking> (anywhere) tags from text.
 * Converts these to reasoning content for V2 stream.
 */
function parseThinkingTags(text: string): ThinkingParseResult {
  let reasoningContent = "";
  let textContent = text;

  // Parse <think>...</think> at the start of text (DeepSeek style)
  const thinkMatch = textContent.match(/^<think>([\s\S]*?)<\/think>/);
  if (thinkMatch) {
    reasoningContent += thinkMatch[1];
    textContent = textContent.slice(thinkMatch[0].length);
  }

  // Parse all <thinking>...</thinking> tags anywhere in text (Claude/general style)
  const thinkingRegex = /<thinking>([\s\S]*?)<\/thinking>/g;
  let match;
  while ((match = thinkingRegex.exec(textContent)) !== null) {
    reasoningContent += (reasoningContent ? "\n\n" : "") + match[1];
  }
  textContent = textContent.replace(thinkingRegex, "");

  return {
    textContent: textContent.trim(),
    reasoningContent: reasoningContent.trim(),
    hasThinking: reasoningContent.length > 0,
  };
}

/**
 * Enhanced Language Model that wraps a base model and adds advanced features.
 *
 * This class implements LanguageModelV2 and also proxies any additional
 * properties from the base model (like supportsStructuredOutputs) to ensure
 * compatibility with frameworks that may check for these properties.
 */
export class EnhancedLanguageModel implements LanguageModelV2 {
  readonly specificationVersion = "v2" as const;
  readonly modelId: string;

  private readonly baseModel: LanguageModelV2;
  private readonly override?: ModelOverride;

  /**
   * Proxy property: supportsStructuredOutputs from base model.
   * Some providers (like OpenAI-compatible) expose this property.
   */
  get supportsStructuredOutputs(): boolean {
    return (
      (this.baseModel as { supportsStructuredOutputs?: boolean })
        .supportsStructuredOutputs ?? false
    );
  }

  constructor(
    baseModel: LanguageModelV2,
    modelId: string,
    override?: ModelOverride,
  ) {
    this.baseModel = baseModel;
    this.modelId = modelId;
    this.override = override;

    // Proxy any additional properties from the base model
    // This ensures compatibility with frameworks that may access
    // provider-specific properties not defined in LanguageModelV2
    this.proxyAdditionalProperties();
  }

  /**
   * Proxy additional properties from the base model that are not part of
   * the LanguageModelV2 interface but may be used by consuming frameworks.
   */
  private proxyAdditionalProperties(): void {
    // Get all property names from the base model's prototype chain
    const baseModelProto = Object.getPrototypeOf(this.baseModel);
    const baseModelKeys = new Set([
      ...Object.keys(this.baseModel),
      ...Object.getOwnPropertyNames(baseModelProto),
    ]);

    // List of properties we handle explicitly
    const handledProperties = new Set([
      "specificationVersion",
      "modelId",
      "provider",
      "supportsStructuredOutputs",
      "doGenerate",
      "doStream",
      "constructor",
    ]);

    // Proxy any additional properties
    for (const key of baseModelKeys) {
      if (handledProperties.has(key)) {
        continue;
      }
      if (key.startsWith("_")) {
        // Skip private properties
        continue;
      }

      const descriptor = Object.getOwnPropertyDescriptor(this.baseModel, key) ||
        Object.getOwnPropertyDescriptor(baseModelProto, key);

      if (descriptor && !Object.prototype.hasOwnProperty.call(this, key)) {
        if (typeof descriptor.get === "function") {
          // It's a getter, define a getter that proxies to base model
          Object.defineProperty(this, key, {
            get: () => (this.baseModel as Record<string, unknown>)[key],
            enumerable: descriptor.enumerable,
            configurable: true,
          });
        } else if (typeof descriptor.value !== "function") {
          // It's a value property (not a method), proxy it
          Object.defineProperty(this, key, {
            get: () => (this.baseModel as Record<string, unknown>)[key],
            enumerable: descriptor.enumerable,
            configurable: true,
          });
        }
      }
    }
  }

  get provider(): string {
    return this.baseModel.provider;
  }

  /**
   * V2 interface: supportedUrls for URL-based operations.
   */
  get supportedUrls(): PromiseLike<Record<string, RegExp[]>> | Record<string, RegExp[]> {
    return this.baseModel.supportedUrls;
  }

  /**
   * V2 interface: defaultObjectGenerationMode
   * Returns the mode for structured outputs.
   */
  get defaultObjectGenerationMode(): "json" | "tool" | undefined {
    return (this.baseModel as { defaultObjectGenerationMode?: "json" | "tool" | undefined }).defaultObjectGenerationMode;
  }

  /**
   * Generate text (non-streaming)
   */
  async doGenerate(options: LanguageModelV2CallOptions) {
    let modifiedOptions = { ...options };

    // Apply model-level overrides
    modifiedOptions = this.applyModelOverrides(modifiedOptions);

    // Collect tool names for later XML parsing
    const toolNames: string[] = [];

    // Apply prompt-based tool calling if enabled
    if (
      this.override?.usePromptBasedToolCalling &&
      options.tools &&
      options.tools.length > 0
    ) {
      const result = this.applyPromptBasedToolCalling(modifiedOptions);
      modifiedOptions = result.options;
      toolNames.push(...result.toolNames);
    }

    // Call base model
    let result = await this.baseModel.doGenerate(modifiedOptions);

    // Suppress chain-of-thought content if configured
    if (this.override?.suppressChainOfThought) {
      result = this.suppressReasoningContent(result);
    }

    // Parse thinking tags if enabled
    if (this.override?.parseThinkingTags) {
      result = this.processThinkingTagsInResult(result);
    }

    // Process result for tool calls if using prompt-based tool calling
    if (this.override?.usePromptBasedToolCalling && toolNames.length > 0) {
      return this.processResultForToolCalls(result, toolNames);
    }

    return result;
  }

  /**
   * Stream text
   */
  async doStream(options: LanguageModelV2CallOptions) {
    let modifiedOptions = { ...options };

    // Apply model-level overrides
    modifiedOptions = this.applyModelOverrides(modifiedOptions);

    // Collect tool names for later XML parsing
    const toolNames: string[] = [];

    // Apply prompt-based tool calling if enabled
    if (
      this.override?.usePromptBasedToolCalling &&
      options.tools &&
      options.tools.length > 0
    ) {
      const result = this.applyPromptBasedToolCalling(modifiedOptions);
      modifiedOptions = result.options;
      toolNames.push(...result.toolNames);
    }

    // Call base model
    let result = await this.baseModel.doStream(modifiedOptions);

    // Suppress chain-of-thought content in stream if configured
    if (this.override?.suppressChainOfThought) {
      result = this.suppressReasoningInStream(result);
    }

    // If using prompt-based tool calling, we need to process the stream
    // to parse XML tool calls from the accumulated text
    if (this.override?.usePromptBasedToolCalling && toolNames.length > 0) {
      return this.processStreamForToolCalls(result, toolNames);
    }

    // Parse thinking tags in stream if enabled (when not using tool calling)
    if (this.override?.parseThinkingTags) {
      return this.processThinkingTagsInStream(result);
    }

    return result;
  }

  /**
   * Apply model-level overrides to call options.
   * Handles temperature and thinkingLevel configuration.
   */
  private applyModelOverrides(
    options: LanguageModelV2CallOptions,
  ): LanguageModelV2CallOptions {
    let modifiedOptions = { ...options };

    // Apply default temperature if configured and not already set
    if (
      this.override?.temperature !== undefined &&
      modifiedOptions.temperature === undefined
    ) {
      modifiedOptions.temperature = this.override.temperature;
    }

    // Apply thinking level via provider options
    if (this.override?.thinkingLevel !== undefined) {
      modifiedOptions = this.applyThinkingLevel(
        modifiedOptions,
        this.override.thinkingLevel,
      );
    }

    return modifiedOptions;
  }

  /**
   * Apply thinking level configuration via provider options.
   * Supports various providers that use different parameter names.
   */
  private applyThinkingLevel(
    options: LanguageModelV2CallOptions,
    thinkingLevel: ThinkingLevel,
  ): LanguageModelV2CallOptions {
    // Convert thinking level to token budget
    const budget = this.thinkingLevelToBudget(thinkingLevel);

    // If 'none', we don't add any thinking configuration
    if (budget === 0) {
      return options;
    }

    // Apply via providerOptions for various providers
    // Different providers use different parameter names
    const providerOptions = {
      ...options.providerOptions,
      // OpenAI-compatible (o1, o3 models)
      openai: {
        ...(options.providerOptions?.openai as Record<string, unknown>),
        reasoning_effort:
          thinkingLevel === "auto"
            ? "medium"
            : thinkingLevel === "high"
              ? "high"
              : thinkingLevel === "low"
                ? "low"
                : "medium",
      },
      // Anthropic (Claude 3.5+ with extended thinking)
      anthropic: {
        ...(options.providerOptions?.anthropic as Record<string, unknown>),
        thinking: {
          type: "enabled",
          budget_tokens: budget,
        },
      },
      // DeepSeek (reasoning models)
      deepseek: {
        ...(options.providerOptions?.deepseek as Record<string, unknown>),
        reasoning_effort:
          thinkingLevel === "auto"
            ? "medium"
            : thinkingLevel === "high"
              ? "high"
              : thinkingLevel === "low"
                ? "low"
                : "medium",
      },
    };

    return {
      ...options,
      providerOptions,
    };
  }

  /**
   * Convert thinking level to token budget.
   */
  private thinkingLevelToBudget(level: ThinkingLevel): number {
    if (typeof level === "number") {
      return level;
    }
    switch (level) {
      case "none":
        return 0;
      case "low":
        return 4096;
      case "medium":
        return 16384;
      case "high":
        return 65536;
      case "auto":
        return 16384; // Default to medium
      default:
        return 0;
    }
  }

  /**
   * Suppress reasoning content from non-streaming result.
   */
  private suppressReasoningContent<
    T extends Awaited<ReturnType<LanguageModelV2["doGenerate"]>>,
  >(result: T): T {
    const content = result.content as Array<{ type: string }>;
    const filteredContent = content.filter((c) => c.type !== "reasoning");

    return {
      ...result,
      content: filteredContent as T["content"],
    };
  }

  /**
   * Process thinking tags (<think>, <thinking>) in non-streaming result.
   * Converts to reasoning content.
   */
  private processThinkingTagsInResult<
    T extends Awaited<ReturnType<LanguageModelV2["doGenerate"]>>,
  >(result: T): T {
    const newContent: LanguageModelV2Content[] = [];

    for (const item of result.content) {
      if (item.type === "text") {
        const textItem = item as { type: "text"; text: string };
        const parsed = parseThinkingTags(textItem.text);

        // Add reasoning content if found
        if (parsed.hasThinking) {
          newContent.push({
            type: "reasoning",
            text: parsed.reasoningContent,
          });
        }

        // Add remaining text content if any
        if (parsed.textContent) {
          newContent.push({
            type: "text",
            text: parsed.textContent,
          });
        }
      } else {
        newContent.push(item);
      }
    }

    return {
      ...result,
      content: newContent as T["content"],
    };
  }

  /**
   * Process thinking tags (<think>, <thinking>) in streaming result.
   * Buffers content and parses at the end.
   */
  private processThinkingTagsInStream<
    T extends { stream: ReadableStream<LanguageModelV2StreamPart> },
  >(result: T): T {
    const originalStream = result.stream;

    const transformedStream = new ReadableStream<LanguageModelV2StreamPart>({
      async start(controller) {
        let accumulatedText = "";
        const bufferedParts: LanguageModelV2StreamPart[] = [];
        let currentTextId: string | undefined;

        try {
          const reader = originalStream.getReader();

          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              break;
            }

            const part = value;

            // Track text content
            if (part.type === "text-start") {
              currentTextId = part.id;
            } else if (part.type === "text-delta") {
              accumulatedText += part.delta;
            }

            bufferedParts.push(part);
          }

          // Parse thinking tags from accumulated text
          const parsed = parseThinkingTags(accumulatedText);

          // Emit reasoning content if found
          if (parsed.hasThinking) {
            const reasoningId = generateId();
            controller.enqueue({
              type: "reasoning-start",
              id: reasoningId,
            });
            controller.enqueue({
              type: "reasoning-delta",
              id: reasoningId,
              delta: parsed.reasoningContent,
            });
            controller.enqueue({
              type: "reasoning-end",
              id: reasoningId,
            });
          }

          // Emit cleaned text content
          if (parsed.textContent) {
            const textId = generateId();
            controller.enqueue({
              type: "text-start",
              id: textId,
            });
            controller.enqueue({
              type: "text-delta",
              id: textId,
              delta: parsed.textContent,
            });
            controller.enqueue({
              type: "text-end",
              id: textId,
            });
          }

          // Forward non-text parts (finish, response-metadata, etc.)
          for (const part of bufferedParts) {
            if (
              part.type !== "text-start" &&
              part.type !== "text-delta" &&
              part.type !== "text-end"
            ) {
              controller.enqueue(part);
            }
          }

          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });

    return {
      ...result,
      stream: transformedStream,
    };
  }

  /**
   * Suppress reasoning content from streaming result.
   */
  private suppressReasoningInStream<
    T extends { stream: ReadableStream<LanguageModelV2StreamPart> },
  >(result: T): T {
    const originalStream = result.stream;

    const transformedStream = new ReadableStream<LanguageModelV2StreamPart>({
      async start(controller) {
        const reader = originalStream.getReader();

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              break;
            }

            // Filter out reasoning-related stream parts
            const partType = value.type;
            if (
              partType === "reasoning-start" ||
              partType === "reasoning-delta" ||
              partType === "reasoning-end"
            ) {
              // Skip reasoning parts
              continue;
            }

            controller.enqueue(value);
          }
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });

    return {
      ...result,
      stream: transformedStream,
    };
  }

  /**
   * Apply prompt-based tool calling by converting tools to system prompt
   * and converting tool-call/tool-result in message history to text format
   */
  private applyPromptBasedToolCalling(
    options: LanguageModelV2CallOptions,
  ): { options: LanguageModelV2CallOptions; toolNames: string[] } {
    if (!options.tools || options.tools.length === 0) {
      return { options, toolNames: [] };
    }

    // Filter to function tools only (not provider-defined tools)
    const functionTools = options.tools.filter(
      (tool: LanguageModelV2FunctionTool | { type: string }): tool is LanguageModelV2FunctionTool => tool.type === "function",
    );

    if (functionTools.length === 0) {
      return { options, toolNames: [] };
    }

    // Convert AI SDK tools to our ToolDefinition format
    const toolDefinitions: ToolDefinition[] = functionTools.map((tool: LanguageModelV2FunctionTool) => ({
      type: "function",
      name: tool.name,
      description: tool.description,
      // V2 uses inputSchema
      parameters: tool.inputSchema as Record<string, unknown>,
    }));

    const toolNames = toolDefinitions.map((t) => t.name);

    // Generate XML tool prompt
    const toolPrompt = generateXmlToolPrompt(toolDefinitions);

    // Convert message history: transform tool-call and tool-result to text format
    // This is necessary because when using prompt-based tool calling, we remove
    // native tools from the request, but the API still requires proper formatting
    // of any tool-call/tool-result content in the message history
    const modifiedPrompt = options.prompt.map((msg: LanguageModelV2Message) => {
      if (msg.role === "system") {
        const content = msg.content;
        return {
          ...msg,
          content: content + "\n\n" + toolPrompt,
        };
      }

      // Convert assistant messages with tool-call content to text
      if (msg.role === "assistant" && Array.isArray(msg.content)) {
        const newContent: LanguageModelV2Content[] = [];
        let hasToolCalls = false;

        for (const part of msg.content) {
          if (part.type === "tool-call") {
            hasToolCalls = true;
            // Convert tool-call to XML text format
            const toolCall = part as { toolName: string; input: unknown };
            const inputStr = typeof toolCall.input === "string"
              ? toolCall.input
              : JSON.stringify(toolCall.input, null, 2);

            // Format as XML tool call
            const xmlToolCall = `<${toolCall.toolName}>\n${inputStr}\n</${toolCall.toolName}>`;
            newContent.push({
              type: "text" as const,
              text: xmlToolCall,
            });
          } else if (part.type === "text") {
            newContent.push(part as { type: "text"; text: string });
          } else if (part.type === "reasoning") {
            newContent.push(part as { type: "reasoning"; text: string });
          }
          // Skip other types like file parts, tool-result in assistant messages
        }

        if (hasToolCalls) {
          return {
            ...msg,
            content: newContent,
          } as LanguageModelV2Message;
        }
      }

      // Convert tool role messages to user messages with text content
      if (msg.role === "tool" && Array.isArray(msg.content)) {
        const textParts: Array<{ type: "text"; text: string }> = [];

        for (const part of msg.content) {
          if (part.type === "tool-result") {
            const toolResult = part as { toolName: string; toolCallId: string; output: unknown };
            // Format tool result as text
            let outputStr: string;
            if (typeof toolResult.output === "string") {
              outputStr = toolResult.output;
            } else if (toolResult.output && typeof toolResult.output === "object") {
              const output = toolResult.output as { type?: string; value?: string };
              if (output.type === "text" && typeof output.value === "string") {
                outputStr = output.value;
              } else {
                outputStr = JSON.stringify(toolResult.output, null, 2);
              }
            } else {
              outputStr = String(toolResult.output);
            }

            textParts.push({
              type: "text",
              text: `[Tool Result for ${toolResult.toolName}]:\n${outputStr}`,
            });
          }
        }

        if (textParts.length > 0) {
          // Convert tool message to user message with text content
          return {
            role: "user" as const,
            content: textParts,
          } as LanguageModelV2Message;
        }
      }

      return msg;
    }) as LanguageModelV2Message[];

    // If no system message exists, prepend one
    const hasSystemMessage = modifiedPrompt.some((m) => m.role === "system");
    if (!hasSystemMessage) {
      modifiedPrompt.unshift({
        role: "system" as const,
        content: toolPrompt,
      });
    }

    // Remove native tools from options (we're using prompt-based instead)
    return {
      options: {
        ...options,
        prompt: modifiedPrompt as LanguageModelV2Message[],
        tools: undefined,
        toolChoice: undefined,
      },
      toolNames,
    };
  }

  /**
   * Process non-streaming result for XML tool calls
   */
  private processResultForToolCalls(
    result: Awaited<ReturnType<LanguageModelV2["doGenerate"]>>,
    toolNames: string[],
  ): Awaited<ReturnType<LanguageModelV2["doGenerate"]>> {
    // Find text content in the response
    const content = result.content as Array<{ type: string; text?: string }>;
    const textContentIndex = content.findIndex((c) => c.type === "text");

    if (textContentIndex === -1 || !content[textContentIndex].text) {
      return result;
    }

    const text = content[textContentIndex].text as string;

    // Parse XML tool calls
    const xmlToolCalls = parseXmlToolCalls(text, toolNames, {
      trimParameterWhitespace:
        this.override?.trimXmlToolParameterWhitespace ?? false,
    });

    if (xmlToolCalls.length === 0) {
      return result;
    }

    // Remove XML tool calls from text
    let cleanedText = this.removeXmlToolCallsFromText(text, toolNames);

    // Build new content array
    const newContent: LanguageModelV2Content[] = [];

    // Parse and add reasoning content if parseThinkingTags is enabled
    if (this.override?.parseThinkingTags) {
      const parsed = parseThinkingTags(cleanedText);
      cleanedText = parsed.textContent;

      if (parsed.hasThinking) {
        newContent.push({
          type: "reasoning" as const,
          text: parsed.reasoningContent,
        });
      }
    }

    // Add cleaned text if any remains
    if (cleanedText.trim()) {
      newContent.push({
        type: "text" as const,
        text: cleanedText,
      });
    }

    // Add tool calls (V2 uses 'input')
    for (const tc of xmlToolCalls) {
      newContent.push({
        type: "tool-call" as const,
        toolCallId: tc.id,
        toolName: tc.name,
        input: JSON.stringify(tc.arguments),
      });
    }

    // Add any non-text content from original result
    for (const c of content) {
      if (c.type !== "text") {
        newContent.push(c as LanguageModelV2Content);
      }
    }

    return {
      ...result,
      content: newContent,
      finishReason: "tool-calls" as const,
    };
  }

  /**
   * Process streaming result for XML tool calls
   *
   * This wraps the stream to accumulate text and parse tool calls at the end.
   */
  private processStreamForToolCalls<T extends { stream: ReadableStream<LanguageModelV2StreamPart> }>(
    result: T,
    toolNames: string[],
  ): T {
    const originalStream = result.stream;
    const override = this.override;
    const self = this;

    const transformedStream = new ReadableStream<LanguageModelV2StreamPart>({
      async start(controller) {
        let accumulatedText = "";
        const bufferedParts: LanguageModelV2StreamPart[] = [];

        try {
          const reader = originalStream.getReader();

          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              break;
            }

            const part = value;

            // Accumulate text for tool call parsing (V2 uses 'delta')
            if (part.type === "text-delta") {
              accumulatedText += part.delta;
            }

            // Buffer all parts
            bufferedParts.push(part);
          }

          // Now we have all parts, check for tool calls
          const xmlToolCalls = parseXmlToolCalls(accumulatedText, toolNames, {
            trimParameterWhitespace:
              override?.trimXmlToolParameterWhitespace ?? false,
          });

          if (xmlToolCalls.length > 0) {
            // Found tool calls - emit cleaned text and tool calls
            let cleanedText = self.removeXmlToolCallsFromText(
              accumulatedText,
              toolNames,
            );

            // Parse thinking tags and emit as reasoning content (if enabled)
            if (override?.parseThinkingTags) {
              const thinkingResult = parseThinkingTags(cleanedText);
              cleanedText = thinkingResult.textContent;

              // Emit reasoning content if found
              if (thinkingResult.hasThinking) {
                const reasoningId = generateId();
                controller.enqueue({
                  type: "reasoning-start",
                  id: reasoningId,
                });
                controller.enqueue({
                  type: "reasoning-delta",
                  id: reasoningId,
                  delta: thinkingResult.reasoningContent,
                });
                controller.enqueue({
                  type: "reasoning-end",
                  id: reasoningId,
                });
              }
            }

            // Emit cleaned text with proper V2 text lifecycle (start -> delta -> end)
            if (cleanedText.trim()) {
              const textId = generateId();
              controller.enqueue({
                type: "text-start",
                id: textId,
              });
              controller.enqueue({
                type: "text-delta",
                id: textId,
                delta: cleanedText,
              });
              controller.enqueue({
                type: "text-end",
                id: textId,
              });
            }

            // Emit tool calls with proper V2 lifecycle:
            // tool-input-start -> tool-input-delta -> tool-input-end -> tool-call
            // OpenCode's processor.ts requires tool-input-start to register the tool
            // in toolcalls map before tool-call can update it to "running" status
            for (const tc of xmlToolCalls) {
              const inputJson = JSON.stringify(tc.arguments);

              // 1. tool-input-start: Creates pending tool part in OpenCode
              controller.enqueue({
                type: "tool-input-start",
                id: tc.id,
                toolName: tc.name,
              });

              // 2. tool-input-delta: Stream the input (optional but matches native behavior)
              controller.enqueue({
                type: "tool-input-delta",
                id: tc.id,
                delta: inputJson,
              });

              // 3. tool-input-end: Mark input streaming complete
              controller.enqueue({
                type: "tool-input-end",
                id: tc.id,
              });

              // 4. tool-call: Trigger execution with full input
              controller.enqueue({
                type: "tool-call",
                toolCallId: tc.id,
                toolName: tc.name,
                input: inputJson,
              });
            }

            // Emit finish with tool-calls reason (V2 format)
            controller.enqueue({
              type: "finish",
              finishReason: "tool-calls",
              usage: {
                inputTokens: undefined,
                outputTokens: undefined,
                totalTokens: undefined,
              },
            });
          } else {
            // No tool calls found, emit all buffered parts as-is
            for (const part of bufferedParts) {
              controller.enqueue(part);
            }
          }

          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });

    return {
      ...result,
      stream: transformedStream,
    };
  }

  /**
   * Remove XML tool call blocks from text
   */
  private removeXmlToolCallsFromText(text: string, toolNames: string[]): string {
    let result = text;
    for (const toolName of toolNames) {
      const regex = new RegExp(
        `<${this.escapeRegex(toolName)}>[\\s\\S]*?<\\/${this.escapeRegex(toolName)}>`,
        "g",
      );
      result = result.replace(regex, "");
    }
    return result.trim();
  }

  /**
   * Escape special regex characters
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}

/**
 * Create an enhanced language model with advanced features.
 *
 * @param baseModel - The base AI SDK language model to wrap
 * @param modelId - The model ID
 * @param override - Optional model override configuration
 * @returns Enhanced language model with additional features
 */
export function wrapWithEnhancements(
  baseModel: LanguageModelV2,
  modelId: string,
  override?: ModelOverride,
): LanguageModelV2 {
  // DEBUG: Temporarily bypass EnhancedLanguageModel to diagnose ProviderInitError
  // Uncomment the following line to test if the issue is with EnhancedLanguageModel
  // return baseModel;

  // Only wrap if there are features to enable
  if (
    override?.usePromptBasedToolCalling ||
    override?.temperature !== undefined ||
    override?.thinkingLevel !== undefined ||
    override?.suppressChainOfThought !== undefined ||
    override?.parseThinkingTags
  ) {
    return new EnhancedLanguageModel(baseModel, modelId, override);
  }

  // No enhancements needed, return base model
  return baseModel;
}
