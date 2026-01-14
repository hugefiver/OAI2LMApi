/**
 * Configuration loading for OpenCode plugin
 * 
 * Reads configuration from:
 * 1. ~/.local/share/opencode/oai2lm.json (primary config file)
 * 2. ~/.config/opencode/oai2lm.json (alternative config location)
 * 
 * This follows OpenCode's convention where:
 * - ~/.local/share/opencode/ contains data files (auth.json, etc.)
 * - ~/.config/opencode/ contains user configuration
 */

import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, isAbsolute } from 'node:path';
import { OAI2LMProviderSettings, ModelOverride } from './types.js';

/**
 * Configuration file structure for oai2lm.json
 */
export interface OAI2LMConfig {
  /** API key for authentication (can also be read from env) */
  apiKey?: string;
  /** Base URL for API calls */
  baseURL?: string;
  /** Provider name (defaults to 'oai2lm') */
  name?: string;
  /**
   * Custom headers applied to all requests.
   * 
   * When combined with override headers (e.g. from model overrides or
   * runtime settings), config file headers are applied first and then
   * override headers are spread on top. This means any override header
   * with the same key will replace the corresponding config file value.
   */
  headers?: Record<string, string>;
  /** Auto-discover models on initialization (default: true) */
  autoDiscoverModels?: boolean;
  /** Per-model configuration overrides (supports wildcards) */
  modelOverrides?: Record<string, ModelOverride>;
}

/**
 * Get the OpenCode data directory path
 * Follows XDG Base Directory Specification
 * Note: XDG spec requires absolute paths; relative paths are ignored
 */
export function getDataDir(): string {
  const xdgDataHome = process.env['XDG_DATA_HOME'];
  if (xdgDataHome && isAbsolute(xdgDataHome)) {
    return join(xdgDataHome, 'opencode');
  }
  return join(homedir(), '.local', 'share', 'opencode');
}

/**
 * Get the OpenCode config directory path
 * Follows XDG Base Directory Specification
 * Note: XDG spec requires absolute paths; relative paths are ignored
 */
export function getConfigDir(): string {
  const xdgConfigHome = process.env['XDG_CONFIG_HOME'];
  if (xdgConfigHome && isAbsolute(xdgConfigHome)) {
    return join(xdgConfigHome, 'opencode');
  }
  return join(homedir(), '.config', 'opencode');
}

/**
 * Config file name for this plugin
 */
export const CONFIG_FILENAME = 'oai2lm.json';

/**
 * Try to read and parse a JSON file
 */
function readJsonFile<T>(filepath: string): T | undefined {
  try {
    if (!existsSync(filepath)) {
      return undefined;
    }
    const content = readFileSync(filepath, 'utf-8');
    return JSON.parse(content) as T;
  } catch (error) {
    if (error instanceof SyntaxError) {
      const message = (error as SyntaxError).message ?? 'Unknown JSON parse error';
      console.warn(`Failed to parse JSON in config file ${filepath}: ${message}`);
    } else {
      console.warn(`Failed to read config file ${filepath}:`, error);
    }
    return undefined;
  }
}

/**
 * Load configuration from oai2lm.json
 * 
 * Search order:
 * 1. ~/.local/share/opencode/oai2lm.json
 * 2. ~/.config/opencode/oai2lm.json
 * 
 * First found file wins.
 */
export function loadConfig(): OAI2LMConfig | undefined {
  const paths = [
    join(getDataDir(), CONFIG_FILENAME),
    join(getConfigDir(), CONFIG_FILENAME),
  ];

  for (const configPath of paths) {
    const config = readJsonFile<OAI2LMConfig>(configPath);
    if (config) {
      return config;
    }
  }

  return undefined;
}

/**
 * Load API key from environment or config
 * 
 * Priority:
 * 1. Explicit apiKey in settings
 * 2. Environment variable OAI2LM_API_KEY
 * 3. Config file apiKey
 */
export function resolveApiKey(
  explicitKey?: string,
  config?: OAI2LMConfig
): string | undefined {
  if (explicitKey) {
    return explicitKey;
  }
  
  const envKey = process.env['OAI2LM_API_KEY'];
  if (envKey) {
    return envKey;
  }
  
  return config?.apiKey;
}

/**
 * Load base URL from environment or config
 * 
 * Priority:
 * 1. Explicit baseURL in settings
 * 2. Environment variable OAI2LM_BASE_URL
 * 3. Config file baseURL
 * 4. Default: https://api.openai.com/v1
 */
export function resolveBaseURL(
  explicitURL?: string,
  config?: OAI2LMConfig
): string {
  if (explicitURL) {
    return explicitURL;
  }
  
  const envURL = process.env['OAI2LM_BASE_URL'];
  if (envURL) {
    return envURL;
  }
  
  return config?.baseURL ?? 'https://api.openai.com/v1';
}

/**
 * Create provider settings from config file and overrides
 * 
 * This is a convenience function that:
 * 1. Loads config from oai2lm.json
 * 2. Applies explicit settings as overrides
 * 3. Returns complete settings ready for provider creation
 */
export function createSettingsFromConfig(
  overrides?: Partial<OAI2LMProviderSettings>
): OAI2LMProviderSettings {
  const config = loadConfig();
  
  const apiKey = resolveApiKey(overrides?.apiKey, config);
  if (!apiKey) {
    throw new Error(
      'API key not found. Please set OAI2LM_API_KEY environment variable, ' +
      'or add apiKey to ' + getConfigFilePath() + ', ' +
      'or pass apiKey in settings.'
    );
  }
  
  const baseURL = resolveBaseURL(overrides?.baseURL, config);
  
  // Merge model overrides: config < explicit overrides
  const modelOverrides: Record<string, ModelOverride> = {
    ...(config?.modelOverrides ?? {}),
    ...(overrides?.modelOverrides ?? {}),
  };
  
  return {
    apiKey,
    baseURL,
    name: overrides?.name ?? config?.name ?? 'oai2lm',
    headers: {
      ...(config?.headers ?? {}),
      ...(overrides?.headers ?? {}),
    },
    autoDiscoverModels: overrides?.autoDiscoverModels ?? config?.autoDiscoverModels ?? true,
    modelOverrides: Object.keys(modelOverrides).length > 0 ? modelOverrides : undefined,
    fetch: overrides?.fetch,
  };
}

/**
 * Get the path to the config file (for user guidance)
 */
export function getConfigFilePath(): string {
  return join(getDataDir(), CONFIG_FILENAME);
}
