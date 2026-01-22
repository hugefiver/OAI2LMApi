# @oai2lmapi/opencode-provider

AI SDK Provider and OpenCode Plugin for **OpenAI-compatible APIs** with **automatic model discovery**.

Use this package to connect [OpenCode](https://opencode.ai) or any Vercel AI SDK application to any OpenAI-compatible API endpoint. It automatically discovers all available models from your API's `/models` endpoint.

## Features

- **CLI Tool**: Generate `opencode.json` model configuration automatically
- **OpenCode Plugin**: Adds `oai2lm_discover` tool inside OpenCode
- **AI SDK Provider**: Native provider for Vercel AI SDK and OpenCode
- **Auto-discovery**: Fetches models from `$baseURL/models`
- **Metadata enrichment**: Merges API metadata with `@oai2lmapi/model-metadata` registry

## Quick Start

### Option 1: CLI Tool (Recommended)

Generate model configuration for your `opencode.json`:

```bash
# Discover models and output opencode.json config
npx @oai2lmapi/opencode-provider --baseURL https://api.example.com/v1 --apiKey sk-xxx --provider my-api
```

This outputs ready-to-use configuration:

```json
{
  "provider": {
    "my-api": {
      "name": "my-api",
      "npm": "@oai2lmapi/opencode-provider",
      "options": {
        "baseURL": "YOUR_API_BASE_URL",
        "apiKey": "{env:YOUR_API_KEY_ENV}"
      },
      "models": {
        "gpt-4o": {
          "name": "gpt-4o",
          "tool_call": true,
          "attachment": true,
          "limit": { "context": 128000, "output": 16384 }
        }
      }
    }
  }
}
```

Copy this into your `opencode.json` and adjust the `baseURL` and `apiKey`.

### Option 2: OpenCode Plugin

Add as a plugin to get the `oai2lm_discover` tool inside OpenCode:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@oai2lmapi/opencode-provider"]
}
```

Then in OpenCode, use the tool:

```
/tool oai2lm_discover baseURL=https://api.example.com/v1 apiKey=sk-xxx
```

The tool will output the configuration you need.

### Option 3: Manual Configuration with npm Provider

Once you have your model list (from CLI or Plugin), add to `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "my-api": {
      "npm": "@oai2lmapi/opencode-provider",
      "options": {
        "baseURL": "https://api.example.com/v1",
        "apiKey": "{env:MY_API_KEY}"
      },
      "models": {
        "gpt-4o": {
          "name": "GPT-4o",
          "tool_call": true,
          "limit": { "context": 128000, "output": 16384 }
        },
        "claude-sonnet-4-20250514": {
          "name": "Claude Sonnet 4",
          "tool_call": true,
          "limit": { "context": 200000, "output": 64000 }
        }
      }
    }
  }
}
```

> **Note**: OpenCode requires the `models` field to know which models are available. The CLI and Plugin tools help you generate this automatically.

### Configuring Model Overrides in OpenCode

**Important**: Due to how OpenCode passes options to SDK providers, model-specific settings like `usePromptBasedToolCalling` must be configured in `provider.*.options.modelOverrides`, **not** in `provider.*.models.*.options`.

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "my-api": {
      "npm": "@oai2lmapi/opencode-provider",
      "options": {
        "baseURL": "https://api.example.com/v1",
        "apiKey": "{env:MY_API_KEY}",
        "modelOverrides": {
          "qwq-*": {
            "usePromptBasedToolCalling": true,
            "trimXmlToolParameterWhitespace": true
          },
          "deepseek-r1*": {
            "thinkingLevel": "medium",
            "suppressChainOfThought": true
          }
        }
      },
      "models": {
        "qwq-32b": {
          "name": "QwQ 32B",
          "tool_call": false,
          "limit": { "context": 131072, "output": 65536 }
        },
        "deepseek-r1": {
          "name": "DeepSeek R1",
          "tool_call": true,
          "limit": { "context": 65536, "output": 8192 }
        }
      }
    }
  }
}
```

> **Why not `models.*.options`?** OpenCode stores `models.*.options` on the Model object, but only passes `provider.options` to the SDK's creation function. Therefore, `modelOverrides` inside `provider.options` is the correct place to configure advanced model features.

## CLI Reference

```bash
oai2lm-discover [options]

OPTIONS:
  -b, --baseURL <url>     Base URL of the API (e.g., https://api.example.com/v1)
  -k, --apiKey <key>      API key for authentication
  -p, --provider <name>   Provider name for config (default: custom-provider)
  -f, --filter <regex>    Filter models by regex pattern
  -o, --output <format>   Output format: json, table, or config (default: config)
  -c, --config            Load settings from oai2lm.json
  -h, --help              Show help
```

### Examples

```bash
# Discover all models and output config
npx @oai2lmapi/opencode-provider -b https://api.example.com/v1 -k sk-xxx -p my-api

# Filter to specific models
npx @oai2lmapi/opencode-provider -b https://api.example.com/v1 -k sk-xxx -f "gpt-4|claude"

# Output as table for review
npx @oai2lmapi/opencode-provider -b https://api.example.com/v1 -k sk-xxx -o table

# Use settings from oai2lm.json config file
npx @oai2lmapi/opencode-provider --config
```

## Programmatic Usage (AI SDK)

For use in your own applications with Vercel AI SDK:

```typescript
import { createOai2lm } from "@oai2lmapi/opencode-provider";
import { streamText } from "ai";

// Create provider
const provider = createOai2lm({
  baseURL: "https://api.example.com/v1",
  apiKey: "your-api-key",
});

// List discovered models
const models = await provider.listModels();
console.log(models);

// Use a model
const model = provider.languageModel("gpt-4");
const result = await streamText({
  model,
  messages: [{ role: "user", content: "Hello!" }],
});
```

## Config File (oai2lm.json)

For persistent configuration, create `oai2lm.json` in:

- `~/.local/share/opencode/oai2lm.json` (Linux)
- `~/.config/opencode/oai2lm.json` (Linux/macOS)

```json
{
  "$schema": "https://raw.githubusercontent.com/hugefiver/OAI2LMApi/main/packages/opencode-provider/oai2lm.schema.json",
  "baseURL": "https://api.example.com/v1",
  "apiKey": "{env:MY_API_KEY}",
  "name": "my-api",
  "modelFilter": "^(gpt-|claude-)",
  "modelOverrides": {
    "gpt-4*": {
      "maxInputTokens": 128000,
      "supportsImageInput": true
    }
  }
}
```

Then just run:

```bash
npx @oai2lmapi/opencode-provider --config
```

## Provider Options

| Option           | Type      | Required | Description                                            |
| ---------------- | --------- | -------- | ------------------------------------------------------ |
| `baseURL`        | `string`  | Yes      | Base URL for API calls                                 |
| `apiKey`         | `string`  | No       | API key for authentication                             |
| `name`           | `string`  | No       | Provider name (default: `"oai2lm"`)                    |
| `headers`        | `object`  | No       | Custom headers for all requests                        |
| `modelFilter`    | `string`  | No       | Regex pattern to filter models                         |
| `modelOverrides` | `object`  | No       | Per-model configuration overrides (supports wildcards) |
| `useConfigFile`  | `boolean` | No       | Merge settings from `oai2lm.json` (default: `true`)    |

### Model Override Options

The `modelOverrides` object supports wildcard patterns (`*` and `?`) to match model IDs:

| Option                           | Type                | Description                          |
| -------------------------------- | ------------------- | ------------------------------------ |
| `maxInputTokens`                 | `number`            | Maximum input tokens                 |
| `maxOutputTokens`                | `number`            | Maximum output tokens                |
| `supportsToolCalling`            | `boolean`           | Native tool/function calling support |
| `supportsImageInput`             | `boolean`           | Image/vision input support           |
| `temperature`                    | `number`            | Default temperature (0.0-2.0)        |
| `thinkingLevel`                  | `string` / `number` | CoT thinking level (see below)       |
| `suppressChainOfThought`         | `boolean`           | Hide thinking content in response    |
| `usePromptBasedToolCalling`      | `boolean`           | Use XML tools in system prompt       |
| `trimXmlToolParameterWhitespace` | `boolean`           | Trim XML parameter whitespace        |

#### Thinking Level

For models that support chain-of-thought reasoning (Claude 3.7, DeepSeek-R1, o1, etc.):

- `"none"` - Disable thinking
- `"low"` / `"medium"` / `"high"` - Preset token budgets
- `"auto"` - Let the model decide
- `number` - Explicit token budget (e.g., `8000`)

#### Prompt-Based Tool Calling

For models without native function calling support:

```json
{
  "modelOverrides": {
    "qwq-*": {
      "usePromptBasedToolCalling": true,
      "trimXmlToolParameterWhitespace": true,
      "supportsToolCalling": false
    }
  }
}
```

This converts tools to XML format in the system prompt, allowing models to use structured tool calls.

## Example Configurations

### OpenRouter

```bash
npx @oai2lmapi/opencode-provider -b https://openrouter.ai/api/v1 -k $OPENROUTER_API_KEY -p openrouter
```

### Together AI

```bash
npx @oai2lmapi/opencode-provider -b https://api.together.xyz/v1 -k $TOGETHER_API_KEY -p together
```

### Local Ollama

```bash
npx @oai2lmapi/opencode-provider -b http://localhost:11434/v1 -k ollama -p ollama
```

## Why Models Must Be Configured?

OpenCode loads provider configurations at startup and needs to know:

- Which models are available
- Token limits for each model
- Model capabilities (tool calling, vision, etc.)

Since OpenCode doesn't call our provider's dynamic model discovery at startup, we provide the CLI/Plugin tools to help you generate this configuration once, which you then add to your `opencode.json`.

## XML Tool Utilities

For advanced use cases like building custom middleware, this package exports XML tool utilities:

```typescript
import {
  generateXmlToolPrompt,
  parseXmlToolCalls,
  formatToolCallAsXml,
  formatToolResultAsText,
  findModelOverride,
  createEnhancedModel,
  EnhancedLanguageModel,
} from "@oai2lmapi/opencode-provider";

// Generate XML tool prompt from tool definitions
const xmlPrompt = generateXmlToolPrompt([
  {
    type: "function",
    name: "search",
    description: "Search the web",
    parameters: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
  },
]);

// Parse XML tool calls from model response
const toolCalls = parseXmlToolCalls(responseText, ["search", "read_file"], {
  trimParameterWhitespace: true,
});

// Format a tool call as XML
const xml = formatToolCallAsXml("search", { query: "hello world" });

// Format a tool result as XML
const result = formatToolResultAsText("search", "Found 10 results...");

// Find model override by pattern matching
const override = findModelOverride("qwq-32b", {
  "qwq-*": { usePromptBasedToolCalling: true },
});

// Wrap a base model with enhanced features (prompt-based tool calling)
const enhancedModel = createEnhancedModel(baseModel, "model-id", {
  usePromptBasedToolCalling: true,
  trimXmlToolParameterWhitespace: true,
});
```

For models without native function calling, consider using:

- **[@ai-sdk-tool/parser](https://github.com/minpeter/ai-sdk-tool-call-middleware)**: Community middleware for AI SDK
- **hermesToolMiddleware**: For Hermes & Qwen format function calls
- **gemmaToolMiddleware**: For Gemma 3 model series

## License

MIT
