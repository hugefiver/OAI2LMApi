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
 * Thinking level configuration for models that support chain-of-thought reasoning.
 * Can be a string preset or a numeric token budget.
 */
export type ThinkingLevel =
  | "none"
  | "low"
  | "medium"
  | "high"
  | "auto"
  | number;

/**
 * Model override configuration.
 *
 * Supports advanced features like prompt-based tool calling and thinking tags.
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

  // Advanced features

  /**
   * Default temperature for this model.
   * Range: 0.0-2.0 (model dependent)
   */
  temperature?: number;

  /**
   * Thinking level for models that support chain-of-thought reasoning.
   * - 'none': Disable thinking
   * - 'low'/'medium'/'high': Preset token budgets
   * - 'auto': Let the model decide
   * - number: Explicit token budget for thinking
   *
   * Used for models like Claude 3.7, DeepSeek-R1, o1, etc.
   */
  thinkingLevel?: ThinkingLevel;

  /**
   * Whether to suppress chain-of-thought output in the response.
   * When true, thinking content is not included in the final output.
   */
  suppressChainOfThought?: boolean;

  /**
   * Use prompt-based tool calling instead of native function calling.
   * Converts tools to XML format in the system prompt.
   *
   * Useful for models that don't support native function calling
   * but can follow structured instructions (e.g., QwQ, older models).
   */
  usePromptBasedToolCalling?: boolean;

  /**
   * Trim leading/trailing whitespace from XML tool parameter values.
   * Only applies when usePromptBasedToolCalling is true.
   */
  trimXmlToolParameterWhitespace?: boolean;
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
 *
 * Uses $XDG_DATA_HOME/opencode or ~/.local/share/opencode on all platforms
 */
export function getDataDir(): string {
  // Check XDG_DATA_HOME first (works on all platforms if set)
  const xdgDataHome = process.env["XDG_DATA_HOME"];
  if (xdgDataHome && isAbsolute(xdgDataHome)) {
    return join(xdgDataHome, "opencode");
  }

  // Use ~/.local/share/opencode on all platforms
  return join(homedir(), ".local", "share", "opencode");
}

/**
 * Get the OpenCode config directory path
 *
 * Uses $XDG_CONFIG_HOME/opencode or ~/.config/opencode on all platforms
 */
export function getConfigDir(): string {
  // Check XDG_CONFIG_HOME first (works on all platforms if set)
  const xdgConfigHome = process.env["XDG_CONFIG_HOME"];
  if (xdgConfigHome && isAbsolute(xdgConfigHome)) {
    return join(xdgConfigHome, "opencode");
  }

  // Use ~/.config/opencode on all platforms
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
