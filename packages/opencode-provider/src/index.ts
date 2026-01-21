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

// Import original functions from provider and config modules
import {
  createOAI2LMProvider as _createOAI2LMProvider,
  createOAI2LMProviderFromConfig as _createOAI2LMProviderFromConfig,
  type OAI2LMProvider,
} from './provider.js';

import {
  loadConfig as _loadConfig,
  createSettingsFromConfig as _createSettingsFromConfig,
  getConfigFilePath as _getConfigFilePath,
  getDataDir as _getDataDir,
  getConfigDir as _getConfigDir,
  resolveApiKey as _resolveApiKey,
  resolveBaseURL as _resolveBaseURL,
  type OAI2LMConfig,
} from './config.js';

import { getModelMetadataFromPatterns as _getModelMetadataFromPatterns } from './modelMetadata.js';

// Re-export types
export type { OAI2LMProvider };
export type {
  OAI2LMProviderSettings,
  ModelOverride,
  ModelMetadata,
  ModelInfo,
} from './types.js';
export type { OAI2LMConfig };
export type { ModelDiscovery } from './modelDiscovery.js';

/**
 * Detects if the first argument looks like OpenCode's PluginInput.
 * OpenCode's plugin loader calls every export as a function with PluginInput,
 * which has a `client` property. If detected, we return an empty hooks object
 * to prevent crashes in the plugin loader.
 */
function isPluginInput(arg: unknown): boolean {
  return (
    typeof arg === 'object' &&
    arg !== null &&
    'client' in arg
  );
}

/**
 * Empty hooks object returned when functions are mistakenly called as plugin factories.
 * This prevents OpenCode's plugin loader from crashing when iterating over exports.
 */
const EMPTY_HOOKS = Object.freeze({});

/**
 * Wraps a function to guard against being called as an OpenCode plugin factory.
 * If called with PluginInput, returns an empty hooks object instead of the normal result.
 */
function guardPluginCall<T extends (...args: any[]) => any>(fn: T): T {
  return ((...args: any[]) => {
    if (args.length > 0 && isPluginInput(args[0])) {
      return EMPTY_HOOKS;
    }
    return fn(...args);
  }) as T;
}

// Wrapped exports that are safe to call as plugin factories
// These return empty hooks when called with PluginInput instead of crashing

export const createOAI2LMProvider = guardPluginCall(_createOAI2LMProvider);
export const createOAI2LMProviderFromConfig = guardPluginCall(_createOAI2LMProviderFromConfig);
export const loadConfig = guardPluginCall(_loadConfig);
export const createSettingsFromConfig = guardPluginCall(_createSettingsFromConfig);
export const getConfigFilePath = guardPluginCall(_getConfigFilePath);
export const getDataDir = guardPluginCall(_getDataDir);
export const getConfigDir = guardPluginCall(_getConfigDir);
export const resolveApiKey = guardPluginCall(_resolveApiKey);
export const resolveBaseURL = guardPluginCall(_resolveBaseURL);
export const getModelMetadataFromPatterns = guardPluginCall(_getModelMetadataFromPatterns);

// DEFAULT_MODEL_METADATA is intentionally not exported from the main entry point
// to avoid OpenCode's plugin loader attempting to call it as a function.
// Users who need DEFAULT_MODEL_METADATA should import directly from './modelMetadata.js'
