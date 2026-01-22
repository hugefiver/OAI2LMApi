/**
 * @oai2lmapi/opencode-provider
 *
 * AI SDK Provider for OpenAI-compatible APIs with automatic model discovery.
 *
 * This provider:
 * 1. Reads configuration from oai2lm.json (baseURL, apiKey, etc.)
 * 2. Auto-discovers models from the /models endpoint
 * 3. Provides LanguageModelV2 instances for each discovered model
 *
 * Usage in opencode.json:
 *   {
 *     "provider": {
 *       "my-provider": {
 *         "npm": "@oai2lmapi/opencode-provider",
 *         "options": {
 *           "baseURL": "https://api.example.com/v1",
 *           "apiKey": "your-api-key"
 *         },
 *         "models": {
 *           "gpt-4": {
 *             "name": "GPT-4",
 *             "options": {
 *               "usePromptBasedToolCalling": true
 *             }
 *           }
 *         }
 *       }
 *     }
 *   }
 */

import {
  createOpenAICompatible,
  type OpenAICompatibleProvider,
} from "@ai-sdk/openai-compatible";
import {
  loadConfig,
  resolveApiKey,
  findModelOverride,
  type OAI2LMConfig,
  type ModelOverride,
  type ThinkingLevel,
} from "./config.js";
import { discoverModels, type DiscoveredModel } from "./discover.js";
import {
  getModelMetadataFromPatterns,
  mergeMetadata,
  type ModelMetadata,
} from "./metadata.js";

// Re-export for convenience
export {
  loadConfig,
  resolveApiKey,
  discoverModels,
  findModelOverride,
  type OAI2LMConfig,
  type ModelOverride,
  type ThinkingLevel,
  type DiscoveredModel,
  type ModelMetadata,
};

// Re-export XML tool utilities for custom middleware implementations
export {
  generateXmlToolPrompt,
  parseXmlToolCalls,
  formatToolCallAsXml,
  formatToolResultAsText,
  escapeXml,
  type ToolDefinition,
  type ParsedToolCall,
  type XmlToolParseOptions,
} from "./xmlTools.js";

// Re-export plugin for OpenCode integration
export { oai2lmPlugin, generateModelsConfig } from "./plugin.js";

// Import enhanced model for prompt-based tool calling
import { createEnhancedModel } from "./enhancedModel.js";

// Re-export enhanced model utilities
export { createEnhancedModel, EnhancedLanguageModel } from "./enhancedModel.js";

/**
 * Provider settings that extend OpenAI-compatible settings
 */
export interface Oai2lmProviderSettings {
  /**
   * Base URL for API calls.
   * If not provided, will try to load from oai2lm.json config file.
   * Example: "https://api.example.com/v1"
   */
  baseURL?: string;

  /**
   * API key for authentication.
   * If not provided, will try to load from config file or environment.
   */
  apiKey?: string;

  /**
   * Provider name (used for identification in logs).
   * Defaults to "oai2lm".
   */
  name?: string;

  /**
   * Custom headers to include in all requests.
   */
  headers?: Record<string, string>;

  /**
   * Model filter pattern (regex). Only models matching this pattern will be available.
   */
  modelFilter?: string;

  /**
   * Per-model configuration overrides.
   * Keys can use wildcards (e.g., "gpt-*", "claude-*").
   */
  modelOverrides?: Record<string, ModelOverride>;

  /**
   * Whether to use config file for additional settings.
   * If true, will merge settings from oai2lm.json.
   * @default true
   */
  useConfigFile?: boolean;

  /**
   * Per-model options from OpenCode config (provider.*.models.*.options).
   * This is populated by OpenCode when calling the provider.
   * @internal
   */
  models?: Record<string, { options?: ModelOverride;[key: string]: unknown }>;
}

/**
 * Extended provider interface with model discovery
 */
export interface Oai2lmProvider extends OpenAICompatibleProvider<
  string,
  string,
  string,
  string
> {
  /**
   * Get list of available models (discovered from API)
   */
  listModels(): Promise<DiscoveredModel[]>;

  /**
   * Get metadata for a specific model
   */
  getModelMetadata(modelId: string): Promise<ModelMetadata | undefined>;

  /**
   * Refresh the model list from the API
   */
  refreshModels(): Promise<void>;
}

// Cached models f{or each provider }instance
const modelCache = new WeakMap<
  object,
  {
    models: DiscoveredModel[];
    metadata: Map<string, ModelMetadata>;
    lastRefresh: number;
  }
>();



/**
 * Merge settings from config file with provided options.
 *
 * Priority order (highest to lowest):
 * 1. options passed to createOai2lm (from OpenCode provider config)
 * 2. oai2lm.json config file
 *
 * For model overrides, also merge options.models.*.options into modelOverrides.
 */
function mergeWithConfig(
  options: Oai2lmProviderSettings,
  config: OAI2LMConfig | undefined,
): Oai2lmProviderSettings {
  // Start with config file settings as base
  const baseModelOverrides = config?.modelOverrides ?? {};
  const optionModelOverrides = options.modelOverrides ?? {};

  // Extract model-level options from OpenCode's provider.*.models.*.options
  const modelLevelOverrides: Record<string, ModelOverride> = {};
  if (options.models) {
    for (const [modelId, modelConfig] of Object.entries(options.models)) {
      if (modelConfig.options) {
        modelLevelOverrides[modelId] = modelConfig.options;
      }
    }
  }

  // Merge all model overrides: config file < options.modelOverrides < options.models.*.options
  const mergedModelOverrides: Record<string, ModelOverride> = {
    ...baseModelOverrides,
    ...optionModelOverrides,
  };

  // Apply model-level overrides (these take highest priority for specific models)
  for (const [modelId, override] of Object.entries(modelLevelOverrides)) {
    mergedModelOverrides[modelId] = {
      ...mergedModelOverrides[modelId],
      ...override,
    };
  }

  // Resolve API key: options takes precedence over config
  let apiKey = options.apiKey;
  if (!apiKey && config) {
    apiKey = resolveApiKey(config);
  }

  return {
    // Options take precedence over config
    baseURL: options.baseURL || config?.baseURL || "",
    apiKey,
    name: options.name || config?.name,
    headers: {
      ...config?.headers,
      ...options.headers,
    },
    modelFilter: options.modelFilter || config?.modelFilter,
    modelOverrides: mergedModelOverrides,
    useConfigFile: options.useConfigFile,
    models: options.models,
  };
}

/**
 * Create an Oai2lm provider instance.
 *
 * This provider wraps @ai-sdk/openai-compatible and adds:
 * - Automatic model discovery from /models endpoint
 * - Configuration file support (oai2lm.json)
 * - Model metadata from pattern matching
 *
 * @example
 * ```typescript
 * import { createOai2lm } from "@oai2lmapi/opencode-provider";
 *
 * const provider = createOai2lm({
 *   baseURL: "https://api.example.com/v1",
 *   apiKey: "your-api-key",
 * });
 *
 * // Use any model
 * const model = provider.languageModel("gpt-4");
 * ```
 */
export function createOai2lm(options: Oai2lmProviderSettings = {}): Oai2lmProvider {
  try {
    // Load config file if enabled (default: true)
    const config = options.useConfigFile !== false ? loadConfig() : undefined;
    const mergedOptions = mergeWithConfig(options, config);

    // Validate required settings
    if (!mergedOptions.baseURL) {
      throw new Error(
        "baseURL is required. Provide it in options or in oai2lm.json config file.",
      );
    }

    // Store validated baseURL for use in closures (TypeScript narrowing)
    const baseURL = mergedOptions.baseURL;

    // Create the underlying OpenAI-compatible provider
    const baseProvider = createOpenAICompatible({
      baseURL: baseURL.replace(/\/+$/, ""),
      name: mergedOptions.name || "oai2lm",
      apiKey: mergedOptions.apiKey,
      headers: mergedOptions.headers,
    });

    // Cache key for this provider instance
    const cacheKey = {};

    /**
     * Discover models from API and build metadata
     */
    async function discoverAndCache(): Promise<void> {
      const apiKey = mergedOptions.apiKey || "";
      const models = await discoverModels(
        baseURL,
        apiKey,
        mergedOptions.headers,
      );

      // Apply filter if configured
      let filteredModels = models;
      if (mergedOptions.modelFilter) {
        const filterRegex = new RegExp(mergedOptions.modelFilter);
        filteredModels = models.filter((m) => filterRegex.test(m.id));
      }

      // Build metadata map
      const metadataMap = new Map<string, ModelMetadata>();
      for (const model of filteredModels) {
        // Get metadata from pattern matching
        const patternMetadata = getModelMetadataFromPatterns(model.id);
        // Merge with API-returned metadata
        const metadata = mergeMetadata(model.metadata, patternMetadata);
        // Apply any model overrides
        const override = findModelOverride(
          model.id,
          mergedOptions.modelOverrides,
        );

        if (override) {
          if (override.maxInputTokens !== undefined) {
            metadata.maxInputTokens = override.maxInputTokens;
          }
          if (override.maxOutputTokens !== undefined) {
            metadata.maxOutputTokens = override.maxOutputTokens;
          }
          if (override.supportsToolCalling !== undefined) {
            metadata.supportsToolCalling = override.supportsToolCalling;
          }
          if (override.supportsImageInput !== undefined) {
            metadata.supportsImageInput = override.supportsImageInput;
          }
        }

        metadataMap.set(model.id, metadata);
      }

      modelCache.set(cacheKey, {
        models: filteredModels,
        metadata: metadataMap,
        lastRefresh: Date.now(),
      });
    }

    /**
     * Get cached data, discovering if necessary
     */
    async function getCache() {
      let cache = modelCache.get(cacheKey);
      if (!cache) {
        await discoverAndCache();
        cache = modelCache.get(cacheKey)!;
      }
      return cache;
    }

    /**
     * Get model override for a specific model ID
     */
    function getOverride(modelId: string): ModelOverride | undefined {
      return findModelOverride(modelId, mergedOptions.modelOverrides);
    }

    // Create the extended provider
    const provider = function (modelId: string) {
      const baseModel = baseProvider(modelId);
      const override = getOverride(modelId);
      return createEnhancedModel(baseModel, modelId, override);
    } as Oai2lmProvider;

    // Copy all methods from base provider (V2 interface) with enhancement
    provider.languageModel = (modelId: string) => {
      const baseModel = baseProvider.languageModel(modelId);
      const override = getOverride(modelId);
      return createEnhancedModel(baseModel, modelId, override);
    };
    provider.chatModel = (modelId: string) => {
      const baseModel = baseProvider.chatModel(modelId);
      const override = getOverride(modelId);
      return createEnhancedModel(baseModel, modelId, override);
    };
    provider.completionModel = (modelId: string) =>
      baseProvider.completionModel(modelId);
    provider.textEmbeddingModel = (modelId: string) =>
      baseProvider.textEmbeddingModel(modelId);
    provider.imageModel = (modelId: string) => baseProvider.imageModel(modelId);

    // Add discovery methods
    provider.listModels = async () => {
      const cache = await getCache();
      return cache.models;
    };

    provider.getModelMetadata = async (modelId: string) => {
      const cache = await getCache();
      return cache.metadata.get(modelId);
    };

    provider.refreshModels = async () => {
      await discoverAndCache();
    };

    return provider;
  } catch (error) {
    // Re-throw with more context for debugging
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[oai2lm] Provider initialization failed: ${message}`);
  }
}

// Default export for convenience
export default createOai2lm;
