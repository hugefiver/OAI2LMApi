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
 */

import { loadConfig, resolveApiKey, type OAI2LMConfig } from "./config.js";
import { discoverModels, type DiscoveredModel } from "./discover.js";
import {
  getModelMetadataFromPatterns,
  mergeMetadata,
  type ModelMetadata,
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
 */
export function generateModelsConfig(
  models: DiscoveredModel[],
  providerName: string = "custom-provider",
): string {
  const modelsConfig: Record<string, unknown> = {};

  for (const model of models) {
    const metadata = getModelMetadataFromPatterns(model.id);
    const merged = mergeMetadata(model.metadata, metadata);

    modelsConfig[model.id] = {
      name: model.name || model.id,
      tool_call: merged.supportsToolCalling ?? true,
      attachment: merged.supportsImageInput ?? false,
      limit: {
        context: merged.maxInputTokens || 128000,
        output: merged.maxOutputTokens || 16384,
      },
    };
  }

  const config = {
    provider: {
      [providerName]: {
        name: providerName,
        npm: "@oai2lmapi/opencode-provider",
        options: {
          baseURL: "YOUR_API_BASE_URL",
          apiKey: "{env:YOUR_API_KEY_ENV}",
        },
        models: modelsConfig,
      },
    },
  };

  return JSON.stringify(config, null, 2);
}

/**
 * Format discovered models for display
 */
function formatModelsForDisplay(
  models: DiscoveredModel[],
  providerName: string,
): string {
  const lines: string[] = [
    `# Discovered ${models.length} models`,
    "",
    "## Quick Setup",
    "",
    "Add the following to your opencode.json:",
    "",
    "```json",
    generateModelsConfig(models, providerName),
    "```",
    "",
    "## Model Details",
    "",
  ];

  for (const model of models) {
    const metadata = getModelMetadataFromPatterns(model.id);
    const merged = mergeMetadata(model.metadata, metadata);

    lines.push(`### ${model.id}`);
    if (model.name && model.name !== model.id) {
      lines.push(`- Name: ${model.name}`);
    }
    lines.push(`- Context: ${merged.maxInputTokens || "unknown"} tokens`);
    lines.push(`- Output: ${merged.maxOutputTokens || "unknown"} tokens`);
    lines.push(`- Tool Calling: ${merged.supportsToolCalling ? "Yes" : "No"}`);
    lines.push(`- Vision: ${merged.supportsImageInput ? "Yes" : "No"}`);
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * OpenCode Plugin entry point
 *
 * This plugin adds a tool to discover models from an OpenAI-compatible API
 * and generate the configuration needed for opencode.json
 */
export async function oai2lmPlugin(_input: PluginInput): Promise<Hooks> {
  return {
    tool: {
      oai2lm_discover: {
        description: `Discover available models from an OpenAI-compatible API and generate opencode.json configuration.

This tool will:
1. Connect to the specified API endpoint
2. Fetch all available models
3. Enrich them with metadata (token limits, capabilities)
4. Generate ready-to-use opencode.json configuration

Use this when you want to add a new OpenAI-compatible provider to OpenCode.`,
        parameters: {
          type: "object",
          properties: {
            baseURL: {
              type: "string",
              description:
                "Base URL of the OpenAI-compatible API (e.g., https://api.example.com/v1). If not provided, will try to load from oai2lm.json config.",
            },
            apiKey: {
              type: "string",
              description:
                "API key for authentication. If not provided, will try to load from config or environment.",
            },
            providerName: {
              type: "string",
              description:
                "Name for the provider in opencode.json (e.g., 'my-api'). Defaults to 'custom-provider'.",
            },
            filter: {
              type: "string",
              description:
                "Optional regex pattern to filter models (e.g., 'gpt|claude')",
            },
          },
          required: [],
        },
        execute: async (args: Record<string, unknown>): Promise<string> => {
          try {
            // Load config file
            const config = loadConfig();

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
2. Or create an oai2lm.json config file with baseURL

Example oai2lm.json:
{
  "baseURL": "https://api.example.com/v1",
  "apiKey": "your-api-key"
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

            return formatModelsForDisplay(models, providerName);
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
