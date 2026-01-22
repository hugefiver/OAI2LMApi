# Changelog

All notable changes to the opencode-provider package will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.4] - 2026-01-22

### Fixed

- **OpenCode compatibility**: Fixed `TypeError: sdk.languageModel is not a function` when used with OpenCode
  - Renamed internal `createEnhancedModel` to `wrapWithEnhancements` to avoid conflict with OpenCode's `create*` pattern matching
  - Added `createOpenAICompatible` alias export for OpenCode provider discovery
  - Renamed `@ai-sdk/openai-compatible` import to `createBaseOpenAICompatible` to avoid naming conflicts

## [0.3.3] - 2026-01-22

### Changed

- **Upgrade to AI SDK V3**: Migrated from `LanguageModelV2` to `LanguageModelV3` interface for OpenCode compatibility
  - Updated `@ai-sdk/openai-compatible` to `^2.0.0`
  - Updated `@ai-sdk/provider` to `^3.0.0`
  - Updated peer dependency `ai` to `>=5.0.0`
- Updated `specificationVersion` from `"v2"` to `"v3"`
- `finishReason` now uses V3 object format: `{ unified: string, raw: string }`
- `usage` now uses V3 nested structure with `inputTokens` and `outputTokens` objects

### Added

- Local deployment script `scripts/deploy-local.ps1` for debugging with OpenCode

## [0.3.2] - 2026-01-22

### Added

- **Prompt-based tool calling implementation**: Added `EnhancedLanguageModel` wrapper that actually implements `usePromptBasedToolCalling` feature
  - Converts native tool calls to XML format in system prompt
  - Parses XML tool calls from model responses
  - Works with both streaming and non-streaming modes
- New `createEnhancedModel()` function for wrapping base models with advanced features

### Fixed

- Fix `usePromptBasedToolCalling` not being applied - now properly wraps models with `EnhancedLanguageModel`
- Provider's `languageModel()` and `chatModel()` methods now apply model overrides correctly

## [0.3.1] - 2026-01-21

### Fixed

- Fix `TypeError: fetch() URL is invalid` when baseURL is empty or undefined
- Add URL validation with helpful error messages in `discoverModels()`

## [0.3.0] - 2026-01-21

### Added

- **CLI Tool** (`oai2lm-discover`): Discover models and generate `opencode.json` configuration
  - `npx @oai2lmapi/opencode-provider -b <baseURL> -k <apiKey> -p <providerName>`
  - Supports `--filter` for regex model filtering
  - Supports `--output json|table|config` for different output formats
  - Supports `--config` to load settings from `oai2lm.json`
- **OpenCode Plugin**: Adds `oai2lm_discover` tool inside OpenCode
  - Use as plugin: `"plugin": ["@oai2lmapi/opencode-provider"]`
  - Run the tool to generate models configuration interactively
- `generateModelsConfig()` helper function for programmatic config generation
- `oai2lmPlugin` export for OpenCode plugin integration
- **Advanced Model Override Options**:
  - `temperature` - Default temperature for a model
  - `thinkingLevel` - Chain-of-thought reasoning level ('none'/'low'/'medium'/'high'/'auto' or token budget)
  - `suppressChainOfThought` - Hide thinking content in responses
  - `usePromptBasedToolCalling` - Use XML tools in system prompt (for models without native function calling)
  - `trimXmlToolParameterWhitespace` - Trim whitespace from XML tool parameter values
- **XML Tool Utilities** for custom middleware:
  - `generateXmlToolPrompt()` - Convert tool definitions to XML format system prompt
  - `parseXmlToolCalls()` - Parse XML tool calls from model response
  - `formatToolCallAsXml()` - Format a tool call as XML
  - `formatToolResultAsText()` - Format a tool result as XML
  - `findModelOverride()` - Find model override by wildcard pattern matching

### Changed

- Package now exports both AI SDK Provider and OpenCode Plugin functionality
- Updated documentation to explain OpenCode's model configuration requirements

## [0.2.1] - 2026-01-21

### Fixed

- Remove `@oai2lmapi/model-metadata` from dependencies (it's bundled via esbuild)
- Fix npm publish error: "Workspace dependency not found"

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
