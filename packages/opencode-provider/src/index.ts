/**
 * @oai2lmapi/opencode-provider
 * 
 * OpenAI-compatible provider for OpenCode with auto-discovery and advanced features
 * 
 * Main exports:
 * - createOAI2LMProvider: Factory function to create a callable provider
 * - createOAI2LMProviderFromConfig: Factory function to create provider from config file
 * 
 * For configuration utilities, import from './config.js'
 */

// Main provider exports - these are the primary API
export {
  createOAI2LMProvider,
  createOAI2LMProviderFromConfig,
  type OAI2LMProvider,
} from './provider.js';

// Type exports
export type {
  OAI2LMProviderSettings,
  ModelOverride,
  ModelMetadata,
  ModelInfo,
} from './types.js';

// Model metadata utilities (functions only, no constants that could be mistaken for plugins)
export { getModelMetadataFromPatterns } from './modelMetadata.js';

// Model discovery class
export { ModelDiscovery } from './modelDiscovery.js';

// Configuration utilities - export functions only from main entry
// Constants are available via direct import from './config.js'
export {
  loadConfig,
  createSettingsFromConfig,
  getConfigFilePath,
  getDataDir,
  getConfigDir,
  resolveApiKey,
  resolveBaseURL,
} from './config.js';

export type { OAI2LMConfig } from './config.js';

// Re-export DEFAULT_MODEL_METADATA for convenience, but note this is an object not a function
// Users who need CONFIG_FILENAME should import directly from './config.js'
export { DEFAULT_MODEL_METADATA } from './modelMetadata.js';
