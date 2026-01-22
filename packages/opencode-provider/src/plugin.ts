/**
 * OpenCode Plugin for oai2lm
 *
 * This plugin provides:
 * 1. A custom tool "oai2lm_discover" to fetch and display available models
 * 2. Configuration loader for oai2lm.json
 *
 * Usage in opencode.json:
 *   {
 *     "plugin": ["@oai2lmapi/opencode-provider"]
 *   }
 *
 * The plugin will automatically read configuration from oai2lm.json.
 */

import {
  loadConfig,
  resolveApiKey,
  findModelOverride,
  type OAI2LMConfig,
  type ModelOverride,
} from "./config.js";
import { discoverModels, type DiscoveredModel } from "./discover.js";
import {
  getModelMetadataFromPatterns,
  mergeMetadata,
} from "./metadata.js";

// OpenCode Plugin types (simplified from @opencode-ai/plugin)
interface PluginInput {
  client: unknown;
  project: unknown;
  directory: string;
  worktree: string;
  serverUrl: URL;
  $: unknown;
}

interface ToolDefinition {
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<string>;
}

interface Hooks {
  tool?: Record<string, ToolDefinition>;
}

/**
 * Generate OpenCode-compatible model configuration from discovered models
 *
 * @param models - Discovered models from API
 * @param providerName - Name for the provider in opencode.json
 * @param config - Optional config to use for baseURL and apiKey
 * @param modelOverrides - Optional model overrides from config
 */
export function generateModelsConfig(
  models: DiscoveredModel[],
  providerName: string = "custom-provider",
  config?: OAI2LMConfig,
  modelOverrides?: Record<string, ModelOverride>,
): string {
  const modelsConfig: Record<string, unknown> = {};

  for (const model of models) {
    const patternMetadata = getModelMetadataFromPatterns(model.id);
    const metadata = mergeMetadata(model.metadata, patternMetadata);

    // Apply model overrides if available
    const override = findModelOverride(model.id, modelOverrides);
    if (override) {
      if (override.maxInputTokens !== undefined) {
        metadata.maxInputTokens = override.maxInputTokens;
      }
      if (override.maxOutputTokens !== undefined) {
        metadata.maxOutputTokens = override.maxOutputTokens;
      }
      if (override.supportsToolCalling !== undefined) {
        metadata.supportsToolCalling = override.supportsToolCalling;
      }
      if (override.supportsImageInput !== undefined) {
        metadata.supportsImageInput = override.supportsImageInput;
      }
    }

    // Build model config
    const modelConfig: Record<string, unknown> = {
      name: model.name || model.id,
      tool_call: metadata.supportsToolCalling ?? true,
      attachment: metadata.supportsImageInput ?? false,
      limit: {
        context: metadata.maxInputTokens || 128000,
        output: metadata.maxOutputTokens || 16384,
      },
    };

    // Add model-level options if there are advanced overrides
    if (override) {
      const options: Record<string, unknown> = {};
      if (override.usePromptBasedToolCalling !== undefined) {
        options.usePromptBasedToolCalling = override.usePromptBasedToolCalling;
      }
      if (override.trimXmlToolParameterWhitespace !== undefined) {
        options.trimXmlToolParameterWhitespace =
          override.trimXmlToolParameterWhitespace;
      }
      if (override.thinkingLevel !== undefined) {
        options.thinkingLevel = override.thinkingLevel;
      }
      if (override.temperature !== undefined) {
        options.temperature = override.temperature;
      }
      if (override.suppressChainOfThought !== undefined) {
        options.suppressChainOfThought = override.suppressChainOfThought;
      }
      if (Object.keys(options).length > 0) {
        modelConfig.options = options;
      }
    }

    modelsConfig[model.id] = modelConfig;
  }

  // Build provider options
  const providerOptions: Record<string, unknown> = {};
  if (config?.baseURL) {
    providerOptions.baseURL = config.baseURL;
  } else {
    providerOptions.baseURL = "YOUR_API_BASE_URL";
  }
  if (config?.apiKey) {
    // Keep the original format if it's an env reference
    if (config.apiKey.startsWith("{env:")) {
      providerOptions.apiKey = config.apiKey;
    } else {
      providerOptions.apiKey = "{env:YOUR_API_KEY_ENV}";
    }
  } else {
    providerOptions.apiKey = "{env:YOUR_API_KEY_ENV}";
  }
  if (config?.headers && Object.keys(config.headers).length > 0) {
    providerOptions.headers = config.headers;
  }

  const outputConfig = {
    provider: {
      [providerName]: {
        name: config?.displayName || providerName,
        npm: "@oai2lmapi/opencode-provider",
        options: providerOptions,
        models: modelsConfig,
      },
    },
  };

  return JSON.stringify(outputConfig, null, 2);
}

/**
 * Format discovered models for display
 */
function formatModelsForDisplay(
  models: DiscoveredModel[],
  providerName: string,
  config?: OAI2LMConfig,
): string {
  const lines: string[] = [
    `# Discovered ${models.length} models`,
    "",
  ];

  // Show config source info
  if (config?.baseURL) {
    lines.push(`**API Endpoint**: ${config.baseURL}`);
    lines.push("");
  }

  lines.push("## Quick Setup");
  lines.push("");
  lines.push("Add the following to your opencode.json:");
  lines.push("");
  lines.push("```json");
  lines.push(
    generateModelsConfig(models, providerName, config, config?.modelOverrides),
  );
  lines.push("```");
  lines.push("");
  lines.push("## Model Details");
  lines.push("");

  for (const model of models) {
    const patternMetadata = getModelMetadataFromPatterns(model.id);
    const metadata = mergeMetadata(model.metadata, patternMetadata);

    // Apply model overrides if available
    const override = findModelOverride(model.id, config?.modelOverrides);
    if (override) {
      if (override.maxInputTokens !== undefined) {
        metadata.maxInputTokens = override.maxInputTokens;
      }
      if (override.maxOutputTokens !== undefined) {
        metadata.maxOutputTokens = override.maxOutputTokens;
      }
      if (override.supportsToolCalling !== undefined) {
        metadata.supportsToolCalling = override.supportsToolCalling;
      }
      if (override.supportsImageInput !== undefined) {
        metadata.supportsImageInput = override.supportsImageInput;
      }
    }

    lines.push(`### ${model.id}`);
    if (model.name && model.name !== model.id) {
      lines.push(`- Name: ${model.name}`);
    }
    lines.push(`- Context: ${metadata.maxInputTokens || "unknown"} tokens`);
    lines.push(`- Output: ${metadata.maxOutputTokens || "unknown"} tokens`);
    lines.push(`- Tool Calling: ${metadata.supportsToolCalling ? "Yes" : "No"}`);
    lines.push(`- Vision: ${metadata.supportsImageInput ? "Yes" : "No"}`);
    if (override?.usePromptBasedToolCalling) {
      lines.push(`- Uses Prompt-Based Tool Calling: Yes`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * OpenCode Plugin entry point
 *
 * This plugin adds a tool to discover models from an OpenAI-compatible API
 * and generate the configuration needed for opencode.json.
 *
 * The plugin automatically reads configuration from oai2lm.json, so you can:
 * 1. Configure your API in oai2lm.json (baseURL, apiKey, modelOverrides)
 * 2. Use the oai2lm_discover tool without any arguments
 * 3. Get a complete opencode.json provider configuration
 */
export async function oai2lmPlugin(_input: PluginInput): Promise<Hooks> {
  // Load config at plugin initialization for quick access
  const savedConfig = loadConfig();

  return {
    tool: {
      oai2lm_discover: {
        description: `Discover available models from an OpenAI-compatible API and generate opencode.json configuration.

This tool will:
1. Connect to the specified API endpoint (or use oai2lm.json config)
2. Fetch all available models
3. Enrich them with metadata (token limits, capabilities)
4. Apply any model overrides from oai2lm.json
5. Generate ready-to-use opencode.json configuration

Configuration from oai2lm.json (~/.local/share/opencode/oai2lm.json) is automatically loaded.
You only need to provide arguments if you want to override the config file settings.`,
        parameters: {
          type: "object",
          properties: {
            baseURL: {
              type: "string",
              description:
                "Base URL of the OpenAI-compatible API (e.g., https://api.example.com/v1). If not provided, uses oai2lm.json config.",
            },
            apiKey: {
              type: "string",
              description:
                "API key for authentication. If not provided, uses oai2lm.json config or environment.",
            },
            providerName: {
              type: "string",
              description:
                "Name for the provider in opencode.json (e.g., 'my-api'). Defaults to config name or 'custom-provider'.",
            },
            filter: {
              type: "string",
              description:
                "Optional regex pattern to filter models (e.g., 'gpt|claude').",
            },
          },
          required: [],
        },
        execute: async (args: Record<string, unknown>): Promise<string> => {
          try {
            // Reload config in case it changed
            const config = loadConfig() || savedConfig;

            // Resolve parameters (args take precedence over config)
            const baseURL = (args.baseURL as string) || config?.baseURL || "";
            const apiKey =
              (args.apiKey as string) ||
              (config ? resolveApiKey(config) : "") ||
              "";
            const providerName =
              (args.providerName as string) ||
              config?.name ||
              "custom-provider";
            const filter = (args.filter as string) || config?.modelFilter;

            if (!baseURL) {
              return `Error: No baseURL provided. Either:
1. Pass it as an argument: oai2lm_discover(baseURL: "https://api.example.com/v1")
2. Or create an oai2lm.json config file at ~/.local/share/opencode/oai2lm.json

Example oai2lm.json:
{
  "baseURL": "https://api.example.com/v1",
  "apiKey": "{env:MY_API_KEY}",
  "name": "my-api",
  "modelOverrides": {
    "gpt-4*": {
      "supportsImageInput": true
    }
  }
}`;
            }

            // Discover models
            let models = await discoverModels(baseURL, apiKey, config?.headers);

            // Apply filter if specified
            if (filter) {
              const filterRegex = new RegExp(filter, "i");
              models = models.filter((m) => filterRegex.test(m.id));
            }

            if (models.length === 0) {
              return `No models found at ${baseURL}/models. Check your API key and endpoint.`;
            }

            return formatModelsForDisplay(models, providerName, config);
          } catch (error) {
            const message =
              error instanceof Error ? error.message : String(error);
            return `Error discovering models: ${message}`;
          }
        },
      },
    },
  };
}

// Default export for OpenCode plugin loading
export default oai2lmPlugin;
