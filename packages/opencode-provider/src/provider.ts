/**
 * Main provider implementation using @ai-sdk/openai-compatible as base
 * 
 * This provider is designed to be callable like standard AI SDK providers:
 *   const model = provider('model-id');  // Direct call
 *   const model = provider.languageModel('model-id');  // Method call
 */

import { createOpenAICompatible, type OpenAICompatibleProvider } from '@ai-sdk/openai-compatible';
import { OAI2LMProviderSettings, ModelOverride, ModelMetadata, ModelInfo } from './types.js';
import { ModelDiscovery } from './modelDiscovery.js';
import { findBestMatch } from './utils.js';
import { createSettingsFromConfig } from './config.js';

/**
 * Extended provider interface that includes model discovery and override features
 */
export interface OAI2LMProvider extends OpenAICompatibleProvider {
  /**
   * Discover available models from API
   */
  discoverModels(): Promise<ModelInfo[]>;

  /**
   * Get metadata for a specific model
   */
  getModelMetadata(modelId: string): Promise<ModelMetadata | undefined>;

  /**
   * Clear model cache
   */
  clearModelCache(): void;

  /**
   * Get the best matching override for a model
   */
  getModelOverride(modelId: string): ModelOverride | undefined;

  /**
   * The provider name
   */
  readonly providerName: string;
}

/**
 * Factory function to create a provider
 * 
 * This creates a callable provider that follows the AI SDK pattern:
 * - provider('model-id') returns a language model
 * - provider.languageModel('model-id') returns a language model
 * - provider.chatModel('model-id') returns a chat model
 * - provider.completionModel('model-id') returns a completion model
 * - provider.textEmbeddingModel('model-id') returns an embedding model
 * - provider.imageModel('model-id') returns an image model
 * 
 * Additionally, it provides:
 * - provider.discoverModels() fetches available models from API
 * - provider.getModelMetadata(modelId) gets metadata for a model
 * - provider.clearModelCache() clears the model cache
 * - provider.getModelOverride(modelId) gets override settings for a model
 */
export function createOAI2LMProvider(settings: OAI2LMProviderSettings): OAI2LMProvider {
  const providerName = settings.name || 'oai2lm';
  const modelOverrides = settings.modelOverrides || {};
  const fetchFn = settings.fetch || fetch;

  // Create base provider using openai-compatible
  const baseProvider = createOpenAICompatible({
    baseURL: settings.baseURL,
    name: providerName,
    apiKey: settings.apiKey,
    headers: settings.headers,
    fetch: fetchFn,
  });

  // Initialize model discovery
  const modelDiscovery = new ModelDiscovery(
    settings.baseURL,
    settings.apiKey,
    settings.headers || {},
    fetchFn
  );

  /**
   * Discover available models from API
   */
  async function discoverModels(): Promise<ModelInfo[]> {
    return modelDiscovery.fetchModels();
  }

  /**
   * Get metadata for a specific model
   */
  async function getModelMetadata(modelId: string): Promise<ModelMetadata | undefined> {
    return modelDiscovery.getModelMetadata(modelId);
  }

  /**
   * Clear model cache
   */
  function clearModelCache(): void {
    modelDiscovery.clearCache();
  }

  /**
   * Get the best matching override for a model
   */
  function getModelOverride(modelId: string): ModelOverride | undefined {
    const patterns = Object.keys(modelOverrides);
    const bestMatch = findBestMatch(modelId, patterns);
    return bestMatch ? modelOverrides[bestMatch] : undefined;
  }

  // Auto-discover models if enabled (trigger auto-discovery)
  if (settings.autoDiscoverModels !== false) {
    discoverModels().catch((err) => {
      console.warn('Failed to auto-discover models:', err);
    });
  }

  // Create the callable provider function
  // This follows the same pattern as createOpenAICompatible
  const provider = function (modelId: string) {
    return baseProvider.languageModel(modelId);
  } as OAI2LMProvider;

  // Attach all methods from the base provider
  provider.languageModel = baseProvider.languageModel.bind(baseProvider);
  provider.chatModel = baseProvider.chatModel.bind(baseProvider);
  provider.completionModel = baseProvider.completionModel.bind(baseProvider);
  provider.textEmbeddingModel = baseProvider.textEmbeddingModel.bind(baseProvider);
  provider.imageModel = baseProvider.imageModel.bind(baseProvider);

  // Attach custom methods
  provider.discoverModels = discoverModels;
  provider.getModelMetadata = getModelMetadata;
  provider.clearModelCache = clearModelCache;
  provider.getModelOverride = getModelOverride;

  // Attach read-only property
  Object.defineProperty(provider, 'providerName', {
    value: providerName,
    writable: false,
    enumerable: true,
  });

  return provider;
}

/**
 * Factory function to create a provider from config file
 * 
 * This is a convenience function that:
 * 1. Loads config from ~/.local/share/opencode/oai2lm.json
 * 2. Falls back to ~/.config/opencode/oai2lm.json
 * 3. Applies explicit overrides on top
 * 
 * @param overrides - Optional settings to override config file values
 * @throws Error if API key is not found
 */
export function createOAI2LMProviderFromConfig(
  overrides?: Partial<OAI2LMProviderSettings>
): OAI2LMProvider {
  const settings = createSettingsFromConfig(overrides);
  return createOAI2LMProvider(settings);
}
