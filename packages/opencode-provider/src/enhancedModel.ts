/**
 * Enhanced Language Model wrapper that adds advanced features:
 * - Prompt-based tool calling (XML format)
 *
 * This wraps an AI SDK LanguageModelV2 to intercept and transform requests/responses.
 */

import type {
  LanguageModelV2,
  LanguageModelV2CallOptions,
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
      "supportedUrls",
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

  get supportedUrls(): PromiseLike<Record<string, RegExp[]>> | Record<string, RegExp[]> {
    return this.baseModel.supportedUrls;
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
    T extends { content: unknown[]; finishReason: string },
  >(result: T): T {
    const content = result.content as Array<{ type: string }>;
    const filteredContent = content.filter((c) => c.type !== "reasoning");

    return {
      ...result,
      content: filteredContent,
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
      // V2 uses inputSchema instead of parameters
      parameters: tool.inputSchema as Record<string, unknown>,
    }));

    const toolNames = toolDefinitions.map((t) => t.name);

    // Generate XML tool prompt
    const toolPrompt = generateXmlToolPrompt(toolDefinitions);

    // Add to system prompt
    const modifiedPrompt = options.prompt.map((msg: LanguageModelV2Message) => {
      if (msg.role === "system") {
        const content = msg.content;
        return {
          ...msg,
          content: content + "\n\n" + toolPrompt,
        };
      }
      return msg;
    });

    // If no system message exists, prepend one
    const hasSystemMessage = modifiedPrompt.some((m: LanguageModelV2Message) => m.role === "system");
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
        prompt: modifiedPrompt,
        tools: undefined,
        toolChoice: undefined,
      },
      toolNames,
    };
  }

  /**
   * Process non-streaming result for XML tool calls
   */
  private processResultForToolCalls<T extends { content: unknown[]; finishReason: string }>(
    result: T,
    toolNames: string[],
  ): T {
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
    const cleanedText = this.removeXmlToolCallsFromText(text, toolNames);

    // Build new content array
    const newContent: unknown[] = [];

    // Add cleaned text if any remains
    if (cleanedText.trim()) {
      newContent.push({
        type: "text",
        text: cleanedText,
      });
    }

    // Add tool calls (V2 uses 'input' instead of 'args')
    for (const tc of xmlToolCalls) {
      newContent.push({
        type: "tool-call",
        toolCallId: tc.id,
        toolName: tc.name,
        input: JSON.stringify(tc.arguments),
      });
    }

    // Add any non-text content from original result
    for (const c of content) {
      if (c.type !== "text") {
        newContent.push(c);
      }
    }

    return {
      ...result,
      content: newContent,
      finishReason: "tool-calls",
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
            const cleanedText = self.removeXmlToolCallsFromText(
              accumulatedText,
              toolNames,
            );

            // Emit cleaned text as a single delta (V2 requires id)
            if (cleanedText.trim()) {
              controller.enqueue({
                type: "text-delta",
                id: generateId(),
                delta: cleanedText,
              });
            }

            // Emit tool calls (V2 uses 'input' instead of 'args')
            for (const tc of xmlToolCalls) {
              controller.enqueue({
                type: "tool-call",
                toolCallId: tc.id,
                toolName: tc.name,
                input: JSON.stringify(tc.arguments),
              } as LanguageModelV2StreamPart);
            }

            // Emit finish with tool-calls reason (V2 uses inputTokens/outputTokens)
            controller.enqueue({
              type: "finish",
              finishReason: "tool-calls",
              usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
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
export function createEnhancedModel(
  baseModel: LanguageModelV2,
  modelId: string,
  override?: ModelOverride,
): LanguageModelV2 {
  // DEBUG: Temporarily bypass EnhancedLanguageModel to diagnose ProviderInitError
  // Uncomment the following line to test if the issue is with EnhancedLanguageModel
  return baseModel;

}
