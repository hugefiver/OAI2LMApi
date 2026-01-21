# @oai2lmapi/opencode-provider

AI SDK Provider for **OpenAI-compatible APIs** with **automatic model discovery**.

Use this provider in [OpenCode](https://opencode.ai) to connect to any OpenAI-compatible API endpoint. Unlike static configurations, this provider automatically discovers all available models from your API's `/models` endpoint.

## Features

- **AI SDK Provider**: Native provider for OpenCode and Vercel AI SDK
- **Auto-discovery**: Automatically fetches models from `$baseURL/models`
- **Zero model configuration**: No need to manually list each model
- **Metadata enrichment**: Merges API-returned metadata with `@oai2lmapi/model-metadata` registry
- **Wildcard overrides**: Apply settings to multiple models using patterns like `gpt-4*`
- **Config file support**: Optional `oai2lm.json` for persistent configuration

## Installation

```bash
npm install @oai2lmapi/opencode-provider
# or
pnpm add @oai2lmapi/opencode-provider
```

## Usage with OpenCode

Add to your `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "my-api": {
      "npm": "@oai2lmapi/opencode-provider",
      "options": {
        "baseURL": "https://api.example.com/v1",
        "apiKey": "your-api-key"
      }
    }
  }
}
```

That's it! OpenCode will automatically discover all available models from your API.

### Using environment variables

```json
{
  "provider": {
    "my-api": {
      "npm": "@oai2lmapi/opencode-provider",
      "env": ["MY_API_KEY"],
      "options": {
        "baseURL": "https://api.example.com/v1"
      }
    }
  }
}
```

Set `MY_API_KEY` in your environment:

```bash
export MY_API_KEY=your-api-key
```

## Programmatic Usage

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

## Provider Options

| Option           | Type      | Required | Description                                                 |
| ---------------- | --------- | -------- | ----------------------------------------------------------- |
| `baseURL`        | `string`  | Yes      | Base URL for API calls (e.g., `https://api.example.com/v1`) |
| `apiKey`         | `string`  | No       | API key for authentication                                  |
| `name`           | `string`  | No       | Provider name (default: `"oai2lm"`)                         |
| `headers`        | `object`  | No       | Custom headers for all requests                             |
| `modelFilter`    | `string`  | No       | Regex pattern to filter models                              |
| `modelOverrides` | `object`  | No       | Per-model configuration overrides (supports wildcards)      |
| `useConfigFile`  | `boolean` | No       | Merge settings from `oai2lm.json` (default: `true`)         |

## Config File

For persistent configuration, create `oai2lm.json` in one of these locations:

1. `~/.local/share/opencode/oai2lm.json`
2. `~/.config/opencode/oai2lm.json`

```jsonc
{
  // Base URL for your OpenAI-compatible API
  "baseURL": "https://api.example.com/v1",

  // API key (supports variable substitution)
  "apiKey": "{env:MY_API_KEY}",

  // Provider ID
  "name": "myapi",

  // Display name
  "displayName": "My API",

  // Custom headers
  "headers": {
    "X-Custom-Header": "value",
  },

  // Filter models by regex
  "modelFilter": "^(gpt-|claude-)",

  // Override model metadata (supports wildcards)
  "modelOverrides": {
    "gpt-4*": {
      "maxInputTokens": 128000,
      "supportsImageInput": true,
    },
  },
}
```

### Variable substitution

The `apiKey` field supports:

- `{env:VAR_NAME}` - Read from environment variable
- `{file:/path/to/file}` - Read from file

## Extended API

### `provider.listModels()`

Returns a list of discovered models with metadata:

```typescript
const models = await provider.listModels();
// [{ id: "gpt-4", name: "GPT-4", object: "model", ... }]
```

### `provider.getModelMetadata(modelId)`

Returns enriched metadata for a specific model:

```typescript
const metadata = await provider.getModelMetadata("gpt-4");
// { maxInputTokens: 128000, maxOutputTokens: 4096, supportsToolCalling: true, ... }
```

### `provider.refreshModels()`

Force refresh the model list from the API:

```typescript
await provider.refreshModels();
```

## Example Configurations

### OpenRouter

```json
{
  "provider": {
    "openrouter": {
      "npm": "@oai2lmapi/opencode-provider",
      "env": ["OPENROUTER_API_KEY"],
      "options": {
        "baseURL": "https://openrouter.ai/api/v1"
      }
    }
  }
}
```

### Local Ollama

```json
{
  "provider": {
    "ollama": {
      "npm": "@oai2lmapi/opencode-provider",
      "options": {
        "baseURL": "http://localhost:11434/v1",
        "apiKey": "ollama"
      }
    }
  }
}
```

### Together AI

```json
{
  "provider": {
    "together": {
      "npm": "@oai2lmapi/opencode-provider",
      "env": ["TOGETHER_API_KEY"],
      "options": {
        "baseURL": "https://api.together.xyz/v1"
      }
    }
  }
}
```

## How It Works

1. When loaded, the provider creates an `@ai-sdk/openai-compatible` instance
2. On first model request or `listModels()` call, it fetches `/models` from your API
3. Each model is enriched with metadata from:
   - API response (context_length, max_tokens, etc.)
   - `@oai2lmapi/model-metadata` pattern matching
   - Your config file overrides
4. The provider then works like any standard AI SDK provider

## License

MIT
