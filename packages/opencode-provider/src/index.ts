/**
 * @oai2lmapi/opencode-provider
 * 
 * OpenAI-compatible provider for OpenCode with auto-discovery and advanced features
 */

export { createOAI2LMProvider, OAI2LMProvider } from './provider.js';
export type {
  OAI2LMProviderSettings,
  ModelOverride,
  ModelMetadata,
  ModelInfo,
} from './types.js';
export { getModelMetadataFromPatterns, DEFAULT_MODEL_METADATA } from './modelMetadata.js';
export { ModelDiscovery } from './modelDiscovery.js';
