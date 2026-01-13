/**
 * Types for the OpenAI-compatible provider
 */

export interface ModelMetadata {
  /** Maximum input tokens the model can accept */
  maxInputTokens: number;
  /** Maximum output tokens the model can generate */
  maxOutputTokens: number;
  /** Whether the model supports tool/function calling */
  supportsToolCalling: boolean;
  /** Whether the model supports image/vision input */
  supportsImageInput: boolean;
}

export interface ModelOverride {
  /** Max input tokens */
  maxInputTokens?: number;
  /** Max output tokens */
  maxOutputTokens?: number;
  /** Supports native tool/function calling */
  supportsToolCalling?: boolean;
  /** Supports image inputs */
  supportsImageInput?: boolean;
  /** Default temperature */
  temperature?: number;
  /** Use XML-based prompt engineering for tools instead of native function calling */
  usePromptBasedToolCalling?: boolean;
  /** Strip <think>...</think> blocks from output */
  suppressChainOfThought?: boolean;
  /** Capture reasoning content separately */
  captureReasoning?: boolean;
  /** Thinking level: token budget or preset */
  thinkingLevel?: number | 'low' | 'medium' | 'high' | 'auto' | 'none';
  /** Trim XML tool parameter whitespace */
  trimXmlToolParameterWhitespace?: boolean;
}

export interface OAI2LMProviderSettings {
  /** API key for authentication */
  apiKey: string;
  /** Base URL for API calls (e.g., 'https://api.example.com/v1') */
  baseURL: string;
  /** Provider name (defaults to 'oai2lm') */
  name?: string;
  /** Custom headers */
  headers?: Record<string, string>;
  /** Auto-discover models on initialization (default: true) */
  autoDiscoverModels?: boolean;
  /** Per-model configuration overrides (supports wildcards) */
  modelOverrides?: Record<string, ModelOverride>;
  /** Custom fetch implementation */
  fetch?: typeof fetch;
}

export interface ModelInfo {
  id: string;
  object: string;
  created?: number;
  owned_by?: string;
  metadata?: ModelMetadata;
}

export interface ModelsListResponse {
  object: string;
  data: ModelInfo[];
}
