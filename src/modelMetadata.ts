/**
 * Shared model metadata registry for the extension.
 *
 * Wraps @oai2lmapi/model-metadata with an additional models.dev lookup layer.
 * When the models.dev registry is enabled, model metadata is first resolved
 * from the cached models.dev data before falling back to static pattern matching.
 *
 * Matching rules (id→id, name→name — no cross-matching):
 *   1. Try models.dev registry (by ID, then by display name)
 *   2. Fall back to static pattern matching from @oai2lmapi/model-metadata
 */

import {
    DEFAULT_MODEL_METADATA,
    MODEL_METADATA_REGISTRY,
    getModelMetadata as getStaticModelMetadata,
    getModelMetadataFromPatterns,
    mergeMetadata,
    type ModelMetadata
} from '@oai2lmapi/model-metadata';
import { modelsDevRegistry } from './modelsDevClient';

export type { ModelMetadata };
export { DEFAULT_MODEL_METADATA, MODEL_METADATA_REGISTRY, getModelMetadataFromPatterns, mergeMetadata };

/**
 * Gets metadata for a model.
 *
 * Resolution order:
 *   1. models.dev registry (if enabled): ID→ID matching, then Name→Name matching
 *   2. Static pattern matching from @oai2lmapi/model-metadata
 *
 * @param modelId     The model identifier
 * @param displayName Optional display name for name-based matching against models.dev
 * @returns ModelMetadata — always returns a value (falls back to defaults for unknown models)
 */
export function getModelMetadata(modelId: unknown, displayName?: string): ModelMetadata {
    if (typeof modelId === 'string' && modelId) {
        const devResult = modelsDevRegistry.resolve(modelId, displayName);
        if (devResult) {
            return devResult;
        }
    }
    return getStaticModelMetadata(modelId);
}

/**
 * Checks if a model is an LLM (language model) based on its ID.
 */
export function isLLMModel(modelId: string, displayName?: string): boolean {
    const metadata = getModelMetadata(modelId, displayName);
    return metadata.modelType === 'llm';
}

/**
 * Checks if a model supports tool calling.
 */
export function supportsToolCalling(modelId: string, displayName?: string): boolean {
    const metadata = getModelMetadata(modelId, displayName);
    return metadata.supportsToolCalling;
}
