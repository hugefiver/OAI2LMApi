/**
 * Model metadata utilities
 *
 * Re-exports from @oai2lmapi/model-metadata with local type definitions
 */

import {
  DEFAULT_MODEL_METADATA as _DEFAULT_MODEL_METADATA,
  getModelMetadataFromPatterns as _getModelMetadataFromPatterns,
} from "@oai2lmapi/model-metadata";

import type { PartialModelMetadata } from "./discover.js";

/**
 * Metadata for a model, describing its capabilities and limits.
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
  /** Model type */
  modelType: "llm" | "embedding" | "rerank" | "image" | "audio" | "other";
}

/**
 * Default model metadata used as fallback
 */
export const DEFAULT_MODEL_METADATA: ModelMetadata = _DEFAULT_MODEL_METADATA;

/**
 * Get model metadata from pattern matching registry
 */
export function getModelMetadataFromPatterns(modelId: string): ModelMetadata {
  return _getModelMetadataFromPatterns(modelId);
}

/**
 * Merge API-returned metadata with pattern-matched metadata
 *
 * API metadata takes precedence when available
 */
export function mergeMetadata(
  apiMetadata: PartialModelMetadata | undefined,
  patternMetadata: ModelMetadata,
): ModelMetadata {
  if (!apiMetadata) {
    return patternMetadata;
  }

  return {
    maxInputTokens:
      apiMetadata.maxInputTokens ?? patternMetadata.maxInputTokens,
    maxOutputTokens:
      apiMetadata.maxOutputTokens ?? patternMetadata.maxOutputTokens,
    supportsToolCalling:
      apiMetadata.supportsToolCalling ?? patternMetadata.supportsToolCalling,
    supportsImageInput:
      apiMetadata.supportsImageInput ?? patternMetadata.supportsImageInput,
    modelType: patternMetadata.modelType,
  };
}
