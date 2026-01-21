#!/usr/bin/env node
/**
 * CLI tool to discover models from an OpenAI-compatible API
 * and generate opencode.json configuration.
 *
 * Usage:
 *   npx oai2lm-discover --baseURL https://api.example.com/v1 --apiKey sk-xxx
 *   npx oai2lm-discover --config  # Use settings from oai2lm.json
 */

import { loadConfig, resolveApiKey } from "./config.js";
import { discoverModels } from "./discover.js";
import { generateModelsConfig } from "./plugin.js";
import { getModelMetadataFromPatterns, mergeMetadata } from "./metadata.js";

interface CLIOptions {
  baseURL?: string;
  apiKey?: string;
  providerName?: string;
  filter?: string;
  output?: "json" | "table" | "config";
  useConfig?: boolean;
}

function parseArgs(args: string[]): CLIOptions {
  const options: CLIOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];

    switch (arg) {
      case "--baseURL":
      case "-b":
        options.baseURL = next;
        i++;
        break;
      case "--apiKey":
      case "-k":
        options.apiKey = next;
        i++;
        break;
      case "--provider":
      case "-p":
        options.providerName = next;
        i++;
        break;
      case "--filter":
      case "-f":
        options.filter = next;
        i++;
        break;
      case "--output":
      case "-o":
        options.output = next as "json" | "table" | "config";
        i++;
        break;
      case "--config":
      case "-c":
        options.useConfig = true;
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
    }
  }

  return options;
}

function printHelp(): void {
  console.log(`
oai2lm-discover - Discover models from OpenAI-compatible APIs

USAGE:
  oai2lm-discover [options]

OPTIONS:
  -b, --baseURL <url>     Base URL of the API (e.g., https://api.example.com/v1)
  -k, --apiKey <key>      API key for authentication
  -p, --provider <name>   Provider name for config (default: custom-provider)
  -f, --filter <regex>    Filter models by regex pattern
  -o, --output <format>   Output format: json, table, or config (default: config)
  -c, --config            Load settings from oai2lm.json
  -h, --help              Show this help message

EXAMPLES:
  # Discover models and generate opencode.json config
  oai2lm-discover -b https://api.example.com/v1 -k sk-xxx -p my-api

  # Use settings from oai2lm.json
  oai2lm-discover --config

  # Filter to specific models
  oai2lm-discover -b https://api.openai.com/v1 -k sk-xxx -f "gpt-4"

  # Output as JSON
  oai2lm-discover --config -o json
`);
}

function printTable(
  models: Array<{
    id: string;
    name?: string;
    context: number;
    output: number;
    tools: boolean;
    vision: boolean;
  }>,
): void {
  const headers = ["ID", "Name", "Context", "Output", "Tools", "Vision"];
  const rows = models.map((m) => [
    m.id,
    m.name || "-",
    m.context.toString(),
    m.output.toString(),
    m.tools ? "✓" : "-",
    m.vision ? "✓" : "-",
  ]);

  // Calculate column widths
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => r[i].length)),
  );

  // Print header
  const headerLine = headers.map((h, i) => h.padEnd(widths[i])).join(" | ");
  const separator = widths.map((w) => "-".repeat(w)).join("-+-");

  console.log(headerLine);
  console.log(separator);

  // Print rows
  for (const row of rows) {
    console.log(row.map((c, i) => c.padEnd(widths[i])).join(" | "));
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  // Load config if requested or no baseURL provided
  let config = options.useConfig ? loadConfig() : undefined;
  if (!options.baseURL && !config) {
    config = loadConfig();
  }

  // Resolve final options
  const baseURL = options.baseURL || config?.baseURL;
  const apiKey = options.apiKey || (config ? resolveApiKey(config) : undefined);
  const providerName =
    options.providerName || config?.name || "custom-provider";
  const filter = options.filter || config?.modelFilter;
  const output = options.output || "config";

  if (!baseURL) {
    console.error("Error: No baseURL provided.");
    console.error("Use --baseURL or create an oai2lm.json config file.");
    console.error("Run 'oai2lm-discover --help' for more information.");
    process.exit(1);
  }

  try {
    console.error(`Discovering models from ${baseURL}...`);

    let models = await discoverModels(baseURL, apiKey || "", config?.headers);

    // Apply filter
    if (filter) {
      const filterRegex = new RegExp(filter, "i");
      models = models.filter((m) => filterRegex.test(m.id));
    }

    if (models.length === 0) {
      console.error("No models found.");
      process.exit(1);
    }

    console.error(`Found ${models.length} models.\n`);

    // Enrich with metadata
    const enrichedModels = models.map((model) => {
      const metadata = getModelMetadataFromPatterns(model.id);
      const merged = mergeMetadata(model.metadata, metadata);
      return {
        id: model.id,
        name: model.name,
        context: merged.maxInputTokens || 128000,
        output: merged.maxOutputTokens || 16384,
        tools: merged.supportsToolCalling ?? true,
        vision: merged.supportsImageInput ?? false,
      };
    });

    switch (output) {
      case "json":
        console.log(JSON.stringify(enrichedModels, null, 2));
        break;

      case "table":
        printTable(enrichedModels);
        break;

      case "config":
      default:
        console.log(generateModelsConfig(models, providerName));
        break;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error: ${message}`);
    process.exit(1);
  }
}

main();
