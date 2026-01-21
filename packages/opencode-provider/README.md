# @oai2lmapi/opencode-provider

OpenAI-compatible provider for [OpenCode](https://github.com/anomalyco/opencode), built on top of the Vercel AI SDK.

This package focuses on **connection + model discovery + metadata enrichment**, so you can point OpenCode (or any Vercel AI SDK based app) to an OpenAI-compatible endpoint.

## Features

- **OpenAI-compatible transport** via `@ai-sdk/openai-compatible`
- **Model discovery**: fetches `$baseURL/models`
- **Metadata enrichment**: merges API-returned hints + `@oai2lmapi/model-metadata` registry
- **Config file support**: optional `oai2lm.json` with env override support

> Note: Some fields in `ModelOverride` (e.g. reasoning / prompt-based tool calling) are currently **reserved for forward compatibility**. The current provider exposes overrides via `provider.getModelOverride(modelId)` but does not automatically rewrite prompts or strip `<think>` output.

## Installation

```bash
pnpm add @oai2lmapi/opencode-provider
```

## Usage

### Recommended: OpenCode native JSON/JSONC config (`opencode.json` / `opencode.jsonc`)

OpenCode supports **JSON and JSONC** (JSON with comments) natively and provides an official schema:

- `$schema`: `https://opencode.ai/config.json`

If your goal is simply “use an OpenAI-compatible endpoint in OpenCode”, you typically **do not need a TS/JS config file**. Use OpenCode’s custom provider configuration directly.

Create `opencode.jsonc` in your project root (or global `~/.config/opencode/opencode.json`):

```jsonc
{
  "$schema": "https://opencode.ai/config.json",

  // Your own provider id (used by the `model` field)
  "provider": {
    "my-oai2lm": {
      // OpenCode uses AI SDK provider packages; use this for OpenAI-compatible endpoints
      "npm": "@ai-sdk/openai-compatible",
      "name": "My OpenAI-Compatible",
      "options": {
        "baseURL": "https://api.example.com/v1",

        // Recommended: variable substitution
        // 1) env:  {env:VAR}
        // 2) file: {file:path}
        "apiKey": "{env:OAI2LM_API_KEY}",

        // Optional: add headers to every request
        "headers": {
          "X-Trace": "true",
        },
      },

      // Optional: list common models and provide token limits (helps OpenCode estimate budget)
      "models": {
        "gpt-4o": {
          "name": "gpt-4o",
          "limit": { "context": 128000, "output": 16384 },
        },
      },
    },
  },

  // Choose default model: providerID/modelID
  "model": "my-oai2lm/gpt-4o",
}
```

For config locations, precedence, and variable substitution, see the official docs:

- <https://opencode.ai/docs/config/>
- <https://opencode.ai/docs/providers/>

### Code usage (when you want to reuse this provider in your JS/TS app)

In your `opencode.config.ts` (or similar):

```ts
import { createOAI2LMProvider } from "@oai2lmapi/opencode-provider";

export default {
  providers: {
    myapi: createOAI2LMProvider({
      apiKey: process.env.OAI2LM_API_KEY!,
      baseURL: "https://api.example.com/v1",
    }),
  },
};
```

### Using `oai2lm.json` (recommended)

If you prefer not to hard-code settings in your config, use:

```ts
import { createOAI2LMProviderFromConfig } from "@oai2lmapi/opencode-provider";

export default {
  providers: {
    myapi: createOAI2LMProviderFromConfig(),
  },
};
```

You can still override specific fields:

```ts
import { createOAI2LMProviderFromConfig } from "@oai2lmapi/opencode-provider";

const provider = createOAI2LMProviderFromConfig({
  baseURL: "https://api.custom.com/v1",
  headers: { "X-My-Header": "demo" },
});
```

## Config file (`oai2lm.json`)

This package looks for `oai2lm.json` in the following order (first match wins):

1. `$XDG_DATA_HOME/opencode/oai2lm.json` (default: `~/.local/share/opencode/oai2lm.json`)
2. `$XDG_CONFIG_HOME/opencode/oai2lm.json` (default: `~/.config/opencode/oai2lm.json`)

On Windows, the default paths become:

- `%USERPROFILE%\.local\share\opencode\oai2lm.json`
- `%USERPROFILE%\.config\opencode\oai2lm.json`

### Priority order

Highest → lowest:

1. Explicit overrides passed to `createOAI2LMProviderFromConfig({ ... })`
2. Environment variables (`OAI2LM_API_KEY`, `OAI2LM_BASE_URL`)
3. `oai2lm.json`

### This package's `oai2lm.json` (package-level JSON config)

If you are using `@oai2lmapi/opencode-provider` inside **your own JS/TS app** (instead of only configuring OpenCode), put connection settings in `oai2lm.json` and call `createOAI2LMProviderFromConfig()` in code.

> Important: this `oai2lm.json` is read by **this package**, and is separate from OpenCode’s `opencode.json`.

#### JSON Schema（补全与校验）

We ship a schema file at `@oai2lmapi/opencode-provider/oai2lm.schema.json`.

You can reference it in your config:

```json
{
  "$schema": "https://unpkg.com/@oai2lmapi/opencode-provider/oai2lm.schema.json",
  "baseURL": "https://api.example.com/v1",
  "name": "myapi",
  "headers": {
    "X-Trace": "true"
  },
  "autoDiscoverModels": true,
  "modelOverrides": {
    "gpt-4o*": {
      "maxInputTokens": 128000,
      "supportsImageInput": true
    }
  }
}
```

If you prefer a local schema reference (no network dependency), use:

- `./node_modules/@oai2lmapi/opencode-provider/oai2lm.schema.json`

URL-based schema (works well for most editors):

- `https://unpkg.com/@oai2lmapi/opencode-provider/oai2lm.schema.json`

### Config fields

- `apiKey` (string, optional): can be omitted if you use `OAI2LM_API_KEY`.
- `baseURL` (string, optional): defaults to `https://api.openai.com/v1` if not set.
- `name` (string, optional): provider name, defaults to `oai2lm`.
- `headers` (object, optional): extra headers added to every request.
- `autoDiscoverModels` (boolean, optional): defaults to `true`.
- `modelOverrides` (object, optional): per-model overrides keyed by wildcard patterns (`*` / `?`).

## How it works (high level)

1. Creates an OpenAI-compatible provider using `@ai-sdk/openai-compatible`.
2. Optionally fetches `$baseURL/models` and caches results for 5 minutes.
3. Enriches each model with best-effort metadata (context length / tool calling / vision), plus fallback patterns from `@oai2lmapi/model-metadata`.

## License

MIT
