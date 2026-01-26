/**
 * API Adapters for different protocols.
 *
 * These adapters implement LanguageModelV2 for Gemini and Claude APIs,
 * allowing them to be used interchangeably with OpenAI-compatible providers.
 */

import type {
  LanguageModelV2,
  LanguageModelV2CallOptions,
  LanguageModelV2StreamPart,
} from "@ai-sdk/provider";

import type { ApiType, ModelOverride } from "./config.js";
import { GeminiClient } from "./clients/geminiClient.js";
import { ClaudeClient } from "./clients/claudeClient.js";

/**
 * Configuration for API adapters
 */
export interface ApiAdapterConfig {
  baseURL: string;
  apiKey: string;
  headers?: Record<string, string>;
}

/**
 * Gemini API Language Model adapter.
 *
 * Implements LanguageModelV2 using the Gemini API protocol.
 */
export class GeminiLanguageModel implements LanguageModelV2 {
  readonly specificationVersion = "v2" as const;
  readonly modelId: string;
  readonly provider = "gemini";

  private readonly client: GeminiClient;
  private readonly _override?: ModelOverride;

  constructor(
    modelId: string,
    config: ApiAdapterConfig,
    override?: ModelOverride,
  ) {
    this.modelId = modelId;
    this.client = new GeminiClient(config);
    this._override = override;
  }

  get supportsStructuredOutputs(): boolean {
    return true;
  }

  get supportedUrls(): Record<string, RegExp[]> {
    return {};
  }

  get defaultObjectGenerationMode(): "json" | "tool" | undefined {
    return "json";
  }

  async doGenerate(options: LanguageModelV2CallOptions) {
    const result = await this.client.doGenerate(this.modelId, options);

    return {
      content: result.content,
      finishReason: result.finishReason,
      usage: {
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        totalTokens:
          result.usage.inputTokens !== undefined &&
          result.usage.outputTokens !== undefined
            ? result.usage.inputTokens + result.usage.outputTokens
            : undefined,
      },
      rawCall: { rawPrompt: null, rawSettings: {} },
      rawResponse: { headers: {} },
      request: { body: JSON.stringify({}) },
      response: {
        id: `gemini_${Date.now()}`,
        timestamp: new Date(),
        modelId: this.modelId,
      },
      warnings: [],
    };
  }

  async doStream(options: LanguageModelV2CallOptions) {
    return this.client.doStream(this.modelId, options);
  }
}

/**
 * Claude API Language Model adapter.
 *
 * Implements LanguageModelV2 using the Anthropic Claude API protocol.
 */
export class ClaudeLanguageModel implements LanguageModelV2 {
  readonly specificationVersion = "v2" as const;
  readonly modelId: string;
  readonly provider = "claude";

  private readonly client: ClaudeClient;
  private readonly _override?: ModelOverride;

  constructor(
    modelId: string,
    config: ApiAdapterConfig,
    override?: ModelOverride,
  ) {
    this.modelId = modelId;
    this.client = new ClaudeClient(config);
    this._override = override;
  }

  get supportsStructuredOutputs(): boolean {
    return true;
  }

  get supportedUrls(): Record<string, RegExp[]> {
    return {};
  }

  get defaultObjectGenerationMode(): "json" | "tool" | undefined {
    return "tool";
  }

  async doGenerate(options: LanguageModelV2CallOptions) {
    const result = await this.client.doGenerate(this.modelId, options);

    return {
      content: result.content,
      finishReason: result.finishReason,
      usage: {
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        totalTokens:
          result.usage.inputTokens !== undefined &&
          result.usage.outputTokens !== undefined
            ? result.usage.inputTokens + result.usage.outputTokens
            : undefined,
      },
      rawCall: { rawPrompt: null, rawSettings: {} },
      rawResponse: { headers: {} },
      request: { body: JSON.stringify({}) },
      response: {
        id: `claude_${Date.now()}`,
        timestamp: new Date(),
        modelId: this.modelId,
      },
      warnings: [],
    };
  }

  async doStream(options: LanguageModelV2CallOptions) {
    return this.client.doStream(this.modelId, options);
  }
}

/**
 * Create a language model for the specified API type.
 *
 * @param apiType - The API type to use ('openai', 'gemini', or 'claude')
 * @param modelId - The model ID
 * @param config - API configuration (baseURL, apiKey, headers)
 * @param override - Optional model override configuration
 * @returns A LanguageModelV2 implementation for the specified API type, or undefined if openai
 */
export function getApiAdapter(
  apiType: ApiType | undefined,
  modelId: string,
  config: ApiAdapterConfig,
  override?: ModelOverride,
): LanguageModelV2 | undefined {
  switch (apiType) {
    case "gemini":
      return new GeminiLanguageModel(modelId, config, override);
    case "claude":
      return new ClaudeLanguageModel(modelId, config, override);
    case "openai":
    default:
      // Return undefined to indicate the caller should use the OpenAI-compatible base model
      return undefined;
  }
}
