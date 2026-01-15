/**
 * Shared model metadata registry for LLM models.
 * This file contains pre-fetched model information from OpenRouter API.
 * Used as fallback when /v1/models API doesn't provide complete information.
 *
 * Key features:
 * - Multi-level pattern matching for model family identification
 * - Regex-based parameter extraction for model variants
 * - Hierarchical matching: family -> subfamily -> variant
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
    /** Model type: 'llm', 'embedding', 'rerank', 'image', 'audio', 'other' */
    modelType?: 'llm' | 'embedding' | 'rerank' | 'image' | 'audio' | 'other';
}
/**
 * Default metadata for unknown models.
 * Conservative defaults that assume basic LLM capabilities.
 */
export declare const DEFAULT_MODEL_METADATA: ModelMetadata;
/**
 * Gets metadata for a model using multi-level pattern matching.
 *
 * Matching strategy:
 * 1. Try hierarchical pattern matching on original model ID
 * 2. Try hierarchical pattern matching on normalized model ID
 * 3. Check for non-LLM patterns (embedding, image, audio, etc.)
 * 4. Return default metadata for unknown models
 */
export declare function getModelMetadata(modelId: string): ModelMetadata;
/**
 * Compatibility helper for packages that only need pattern-based lookup.
 */
export declare function getModelMetadataFromPatterns(modelId: string): ModelMetadata;
/**
 * Checks if a model is an LLM (language model) based on its ID.
 */
export declare function isLLMModel(modelId: string): boolean;
/**
 * Checks if a model supports tool calling.
 */
export declare function supportsToolCalling(modelId: string): boolean;
/**
 * Merge API metadata with pattern-based metadata.
 */
export declare function mergeMetadata(apiMetadata: Partial<ModelMetadata> | undefined, patternMetadata: ModelMetadata): ModelMetadata;
/**
 * Legacy compatibility: MODEL_METADATA_REGISTRY as a flat object.
 * This is kept for backwards compatibility but getModelMetadata() should be preferred.
 */
export declare const MODEL_METADATA_REGISTRY: Record<string, ModelMetadata>;
//# sourceMappingURL=index.d.ts.map