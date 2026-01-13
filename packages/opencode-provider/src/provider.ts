/**
 * Main provider implementation using @ai-sdk/openai-compatible as base
 */

import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { OAI2LMProviderSettings, ModelOverride, ModelMetadata } from './types.js';
import { ModelDiscovery } from './modelDiscovery.js';
import { findBestMatch } from './utils.js';

export class OAI2LMProvider {
  private baseProvider: ReturnType<typeof createOpenAICompatible>;
  private modelDiscovery: ModelDiscovery;
  private modelOverrides: Record<string, ModelOverride>;
  private providerName: string;
  private fetchFn: typeof fetch;

  constructor(settings: OAI2LMProviderSettings) {
    this.providerName = settings.name || 'oai2lm';
    this.modelOverrides = settings.modelOverrides || {};
    this.fetchFn = settings.fetch || fetch;

    // Create base provider using openai-compatible
    this.baseProvider = createOpenAICompatible({
      baseURL: settings.baseURL,
      name: this.providerName,
      apiKey: settings.apiKey,
      headers: settings.headers,
      fetch: this.fetchFn,
    });

    // Initialize model discovery
    this.modelDiscovery = new ModelDiscovery(
      settings.baseURL,
      settings.apiKey,
      settings.headers || {},
      this.fetchFn
    );

    // Auto-discover models if enabled
    if (settings.autoDiscoverModels !== false) {
      this.discoverModels().catch((err) => {
        console.warn('Failed to auto-discover models:', err);
      });
    }
  }

  /**
   * Create a language model instance
   */
  languageModel(modelId: string): ReturnType<ReturnType<typeof createOpenAICompatible>['languageModel']> {
    // Return the base model
    return this.baseProvider.languageModel(modelId);
  }

  /**
   * Alias for languageModel (matches AI SDK convention)
   */
  chatModel(modelId: string): ReturnType<ReturnType<typeof createOpenAICompatible>['languageModel']> {
    return this.languageModel(modelId);
  }

  /**
   * Call operator: provider('model-id')
   */
  call(modelId: string): ReturnType<ReturnType<typeof createOpenAICompatible>['languageModel']> {
    return this.languageModel(modelId);
  }

  /**
   * Discover available models from API
   */
  async discoverModels() {
    return await this.modelDiscovery.fetchModels();
  }

  /**
   * Get metadata for a specific model
   */
  async getModelMetadata(modelId: string): Promise<ModelMetadata | undefined> {
    return await this.modelDiscovery.getModelMetadata(modelId);
  }

  /**
   * Clear model cache
   */
  clearModelCache(): void {
    this.modelDiscovery.clearCache();
  }

  /**
   * Get the best matching override for a model
   */
  getModelOverride(modelId: string): ModelOverride | undefined {
    const patterns = Object.keys(this.modelOverrides);
    const bestMatch = findBestMatch(modelId, patterns);
    return bestMatch ? this.modelOverrides[bestMatch] : undefined;
  }
}

/**
 * Factory function to create a provider
 */
export function createOAI2LMProvider(settings: OAI2LMProviderSettings): OAI2LMProvider {
  return new OAI2LMProvider(settings);
}
