/**
 * Model discovery: fetch and cache models from API
 */

import { ModelInfo, ModelsListResponse, ModelMetadata } from './types.js';
import { getModelMetadataFromPatterns, mergeMetadata } from './modelMetadata.js';

export class ModelDiscovery {
  private modelsCache: Map<string, ModelInfo> = new Map();
  private lastFetchTime: number = 0;
  private readonly cacheDuration = 5 * 60 * 1000; // 5 minutes

  constructor(
    private readonly baseURL: string,
    private readonly apiKey: string,
    private readonly headers: Record<string, string>,
    private readonly fetchFn: typeof fetch = fetch
  ) {}

  /**
   * Fetch models from API /models endpoint
   */
  async fetchModels(): Promise<ModelInfo[]> {
    const now = Date.now();
    if (this.modelsCache.size > 0 && now - this.lastFetchTime < this.cacheDuration) {
      return Array.from(this.modelsCache.values());
    }

    try {
      const url = `${this.baseURL}/models`;
      const response = await this.fetchFn(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          ...this.headers,
        },
      });

      if (!response.ok) {
        console.warn(`Failed to fetch models from ${url}: ${response.status} ${response.statusText}`);
        return [];
      }

      const data = (await response.json()) as ModelsListResponse;
      const models = data.data || [];

      // Enrich models with metadata
      for (const model of models) {
        const patternMetadata = getModelMetadataFromPatterns(model.id);
        const apiMetadata = this.extractMetadataFromModel(model);
        model.metadata = mergeMetadata(apiMetadata, patternMetadata);
        this.modelsCache.set(model.id, model);
      }

      this.lastFetchTime = now;
      return models;
    } catch (error) {
      console.error('Error fetching models:', error);
      return [];
    }
  }

  /**
   * Get metadata for a specific model
   */
  async getModelMetadata(modelId: string): Promise<ModelMetadata | undefined> {
    // Check cache first
    const cached = this.modelsCache.get(modelId);
    if (cached?.metadata) {
      return cached.metadata;
    }

    // Fetch models if not cached
    await this.fetchModels();
    const model = this.modelsCache.get(modelId);
    if (model?.metadata) {
      return model.metadata;
    }

    // Fallback to pattern matching
    return getModelMetadataFromPatterns(modelId);
  }

  /**
   * Extract metadata from model object returned by API
   */
  private extractMetadataFromModel(model: any): Partial<ModelMetadata> {
    const metadata: Partial<ModelMetadata> = {};

    // Try to extract from various API response formats
    // OpenAI format
    if (model.context_length) {
      metadata.maxInputTokens = model.context_length;
    }
    if (model.max_tokens) {
      metadata.maxOutputTokens = model.max_tokens;
    }

    // Anthropic/OpenRouter format
    if (model.max_input_tokens) {
      metadata.maxInputTokens = model.max_input_tokens;
    }
    if (model.max_output_tokens) {
      metadata.maxOutputTokens = model.max_output_tokens;
    }

    // Function calling support
    if (typeof model.function_call === 'boolean') {
      metadata.supportsToolCalling = model.function_call;
    } else if (typeof model.supports_function_calling === 'boolean') {
      metadata.supportsToolCalling = model.supports_function_calling;
    } else if (typeof model.supports_tools === 'boolean') {
      metadata.supportsToolCalling = model.supports_tools;
    }

    // Vision support
    if (typeof model.vision === 'boolean') {
      metadata.supportsImageInput = model.vision;
    } else if (typeof model.supports_vision === 'boolean') {
      metadata.supportsImageInput = model.supports_vision;
    } else if (model.modalities?.includes('vision')) {
      metadata.supportsImageInput = true;
    } else if (model.modalities?.includes('image')) {
      metadata.supportsImageInput = true;
    }

    return metadata;
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.modelsCache.clear();
    this.lastFetchTime = 0;
  }
}
