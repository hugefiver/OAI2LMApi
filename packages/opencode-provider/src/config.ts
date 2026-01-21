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

import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, isAbsolute } from "node:path";

/**
 * Model override configuration.
 */
export interface ModelOverride {
  /** Max input tokens */
  maxInputTokens?: number;
  /** Max output tokens */
  maxOutputTokens?: number;
  /** Supports native tool/function calling */
  supportsToolCalling?: boolean;
  /** Supports image inputs */
  supportsImageInput?: boolean;
}

/**
 * Configuration file structure for oai2lm.json
 */
export interface OAI2LMConfig {
  /** API key for authentication (can also be read from env) */
  apiKey?: string;
  /** Base URL for API calls */
  baseURL?: string;
  /** Provider ID used in OpenCode (defaults to 'oai2lm') */
  name?: string;
  /** Display name shown in OpenCode UI */
  displayName?: string;
  /**
   * Custom headers applied to all requests.
   */
  headers?: Record<string, string>;
  /** Per-model configuration overrides (supports wildcards) */
  modelOverrides?: Record<string, ModelOverride>;
  /** Filter function pattern - only include models matching this pattern */
  modelFilter?: string;
}

/**
 * Get the OpenCode data directory path
 * Follows XDG Base Directory Specification
 */
export function getDataDir(): string {
  const xdgDataHome = process.env["XDG_DATA_HOME"];
  if (xdgDataHome && isAbsolute(xdgDataHome)) {
    return join(xdgDataHome, "opencode");
  }
  return join(homedir(), ".local", "share", "opencode");
}

/**
 * Get the OpenCode config directory path
 * Follows XDG Base Directory Specification
 */
export function getConfigDir(): string {
  const xdgConfigHome = process.env["XDG_CONFIG_HOME"];
  if (xdgConfigHome && isAbsolute(xdgConfigHome)) {
    return join(xdgConfigHome, "opencode");
  }
  return join(homedir(), ".config", "opencode");
}

/**
 * Config file name for this plugin
 */
export const CONFIG_FILENAME = "oai2lm.json";

/**
 * Try to read and parse a JSON file
 */
function readJsonFile<T>(filepath: string): T | undefined {
  try {
    if (!existsSync(filepath)) {
      return undefined;
    }
    const content = readFileSync(filepath, "utf-8");
    return JSON.parse(content) as T;
  } catch (error) {
    if (error instanceof SyntaxError) {
      console.warn(
        `Failed to parse JSON in config file ${filepath}: ${error.message}`,
      );
    } else {
      console.warn(`Failed to read config file ${filepath}:`, error);
    }
    return undefined;
  }
}

/**
 * Load configuration from oai2lm.json
 *
 * Search order (by precedence):
 * 1. ~/.local/share/opencode/oai2lm.json (data directory)
 * 2. ~/.config/opencode/oai2lm.json (config directory)
 *
 * @returns Merged configuration or undefined if no config found
 */
export function loadConfig(): OAI2LMConfig | undefined {
  const dataDir = getDataDir();
  const configDir = getConfigDir();

  // Try data directory first (higher precedence)
  const dataPath = join(dataDir, CONFIG_FILENAME);
  const dataConfig = readJsonFile<OAI2LMConfig>(dataPath);

  // Try config directory
  const configPath = join(configDir, CONFIG_FILENAME);
  const configDirConfig = readJsonFile<OAI2LMConfig>(configPath);

  // Merge configurations (data directory takes precedence)
  if (dataConfig && configDirConfig) {
    return {
      ...configDirConfig,
      ...dataConfig,
      headers: {
        ...configDirConfig.headers,
        ...dataConfig.headers,
      },
      modelOverrides: {
        ...configDirConfig.modelOverrides,
        ...dataConfig.modelOverrides,
      },
    };
  }

  return dataConfig || configDirConfig;
}

/**
 * Get the path to the configuration file if it exists.
 */
export function getConfigFilePath(): string | undefined {
  const dataPath = join(getDataDir(), CONFIG_FILENAME);
  if (existsSync(dataPath)) {
    return dataPath;
  }

  const configPath = join(getConfigDir(), CONFIG_FILENAME);
  if (existsSync(configPath)) {
    return configPath;
  }

  return undefined;
}

/**
 * Resolve API key from config or environment variable.
 * Supports {env:VAR} and {file:path} syntax.
 */
export function resolveApiKey(config: OAI2LMConfig): string | undefined {
  // First check config
  if (config.apiKey) {
    // Handle {env:VAR} syntax
    const envMatch = config.apiKey.match(/^\{env:(\w+)\}$/);
    if (envMatch) {
      return process.env[envMatch[1]];
    }
    // Handle {file:path} syntax
    const fileMatch = config.apiKey.match(/^\{file:(.+)\}$/);
    if (fileMatch) {
      try {
        let filePath = fileMatch[1];
        if (filePath.startsWith("~")) {
          filePath = join(homedir(), filePath.slice(1));
        }
        return readFileSync(filePath, "utf-8").trim();
      } catch {
        return undefined;
      }
    }
    return config.apiKey;
  }

  // Fall back to environment variable
  return process.env["OAI2LM_API_KEY"];
}
