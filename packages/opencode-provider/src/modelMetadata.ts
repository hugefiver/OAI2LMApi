/**
 * Shared model metadata registry for the OpenCode provider.
 * Delegates to @oai2lmapi/model-metadata to keep metadata in sync.
 */

export {
  DEFAULT_MODEL_METADATA,
  MODEL_METADATA_REGISTRY,
  getModelMetadata,
  getModelMetadataFromPatterns,
  isLLMModel,
  mergeMetadata,
  supportsToolCalling,
  type ModelMetadata
} from '@oai2lmapi/model-metadata';
