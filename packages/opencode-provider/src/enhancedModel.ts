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

import type { ModelOverride } from "./config.js";
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
 */
export class EnhancedLanguageModel implements LanguageModelV2 {
  readonly specificationVersion = "v2" as const;
  readonly modelId: string;

  private readonly baseModel: LanguageModelV2;
  private readonly override?: ModelOverride;

  constructor(
    baseModel: LanguageModelV2,
    modelId: string,
    override?: ModelOverride,
  ) {
    this.baseModel = baseModel;
    this.modelId = modelId;
    this.override = override;
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
    const result = await this.baseModel.doGenerate(modifiedOptions);

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
    const result = await this.baseModel.doStream(modifiedOptions);

    // If using prompt-based tool calling, we need to process the stream
    // to parse XML tool calls from the accumulated text
    if (this.override?.usePromptBasedToolCalling && toolNames.length > 0) {
      return this.processStreamForToolCalls(result, toolNames);
    }

    return result;
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
  // Only wrap if there are features to enable
  if (override?.usePromptBasedToolCalling) {
    return new EnhancedLanguageModel(baseModel, modelId, override);
  }

  // No enhancements needed, return base model
  return baseModel;
}
