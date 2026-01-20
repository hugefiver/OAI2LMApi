/**
 * Shared model metadata registry for the OpenCode provider.
 * Re-exports functionality from @oai2lmapi/model-metadata (bundled at build time).
 */

// Re-export the local ModelMetadata type for consumers
import type { ModelMetadata } from './types.js';
export type { ModelMetadata };

// Import runtime implementations from model-metadata (bundled by esbuild)
import {
  DEFAULT_MODEL_METADATA as _DEFAULT_MODEL_METADATA,
  MODEL_METADATA_REGISTRY as _MODEL_METADATA_REGISTRY,
  getModelMetadata as _getModelMetadata,
  getModelMetadataFromPatterns as _getModelMetadataFromPatterns,
  isLLMModel as _isLLMModel,
  mergeMetadata as _mergeMetadata,
  supportsToolCalling as _supportsToolCalling,
} from '@oai2lmapi/model-metadata';

// Re-export with explicit types to ensure declarations use local types
export const DEFAULT_MODEL_METADATA: ModelMetadata = _DEFAULT_MODEL_METADATA;
export const MODEL_METADATA_REGISTRY: Record<string, ModelMetadata> = _MODEL_METADATA_REGISTRY;
export const getModelMetadata: (modelId: string) => ModelMetadata = _getModelMetadata;
export const getModelMetadataFromPatterns: (modelId: string) => ModelMetadata = _getModelMetadataFromPatterns;
export const isLLMModel: (modelId: string) => boolean = _isLLMModel;
export const mergeMetadata: (
  apiMetadata: Partial<ModelMetadata> | undefined,
  patternMetadata: ModelMetadata
) => ModelMetadata = _mergeMetadata;
export const supportsToolCalling: (modelId: string) => boolean = _supportsToolCalling;
