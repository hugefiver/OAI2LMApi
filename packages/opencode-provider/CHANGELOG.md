# Changelog

All notable changes to the opencode-provider package will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-01-21

### Changed

- **BREAKING**: Complete refactor to AI SDK Provider

### Added

- AI SDK Provider interface compatible with OpenCode and Vercel AI SDK
- `createOai2lm()` function that creates a provider instance
- Automatic model discovery from `/models` endpoint at runtime
- `provider.listModels()` - list all discovered models
- `provider.getModelMetadata(id)` - get enriched metadata for a model
- `provider.refreshModels()` - force refresh model cache
- Support for `@ai-sdk/openai-compatible` as the underlying provider

### How to use in OpenCode

```json
{
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

## [0.1.0] - 2026-01-13

### Added

- Initial release of @oai2lmapi/opencode-provider
- Auto-discovery of models from API `/models` endpoint
- Smart capability detection (tool calling, vision, context limits)
- Chain-of-thought support via `<think>` tags
- Prompt-based tool calling for models without native function calling
- Per-model configuration overrides with wildcard pattern matching
- Based on Vercel AI SDK's `@ai-sdk/openai-compatible` package
- Comprehensive TypeScript types and documentation
