# Changelog

All notable changes to the opencode-provider package will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.14] - 2026-01-26

### Fixed

- **OpenCode compatibility**: Renamed internal `createApiAdapter` to `getApiAdapter` to avoid `create*` export scanning pitfalls
  - Prevents OpenCode from accidentally selecting the wrong factory when resolving the provider

## [0.3.13] - 2026-01-26

### Fixed

- **OpenCode compatibility**: Fixed `TypeError: undefined is not an object (evaluating 'sdk.languageModel')` when used with OpenCode
  - Removed `createApiAdapter` from public exports to avoid conflict with OpenCode's `create*` pattern matching
  - OpenCode scans for `create*` exports and may incorrectly call `createApiAdapter` instead of `createOai2lm`/`createOpenAICompatible`
  - `createApiAdapter` is now only used internally; `GeminiLanguageModel` and `ClaudeLanguageModel` classes remain exported for advanced use cases

## [0.3.12] - 2026-01-23

### Added

- **Gemini and Claude API protocol support**: Added `apiType` configuration option to use different API protocols
  - `apiType: "gemini"` - Use Google Gemini API protocol (uses `X-Goog-Api-Key` header, `/v1beta` path)
  - `apiType: "claude"` - Use Anthropic Claude API protocol (uses `x-api-key` header, `anthropic-version` header)
  - `apiType: "openai"` - Default OpenAI-compatible protocol
  - Configurable via `modelOverrides` in `oai2lm.json` or per-model `options` in `opencode.json` (higher priority)
  - Automatically handles `/v1` suffix removal from baseURL for non-OpenAI protocols

- **New API client modules**: Added `clients/geminiClient.ts` and `clients/claudeClient.ts` implementing AI SDK LanguageModelV2 interface
  - Full streaming and non-streaming support
  - Tool calling support
  - Image/file input support
  - Reasoning/thinking content support

- **API adapters**: Added `apiAdapters.ts` with `GeminiLanguageModel` and `ClaudeLanguageModel` classes
  - `createApiAdapter()` factory function for easy integration
  - Re-exported from main entry point

## [0.3.11] - 2026-01-23

### Changed

- **Incremental streaming for thinking tags**: `processThinkingTagsInStream` now uses a state machine for real-time incremental parsing
  - Previously buffered entire stream content before parsing
  - Now outputs text/reasoning content immediately as it arrives
  - Provides better user experience with instant feedback

- **Incremental streaming for XML tool calls**: `processStreamForToolCalls` now outputs text in real-time
  - Text before tool call tags is emitted immediately
  - Only buffers when a potential tool call tag is detected
  - Maintains correct XML tool call parsing while improving responsiveness

## [0.3.10] - 2026-01-22

### Documentation

- **OpenCode modelOverrides configuration**: Clarified that model-specific options (e.g., `usePromptBasedToolCalling`) must be configured in `provider.*.options.modelOverrides`, not in `provider.*.models.*.options`
  - OpenCode passes `provider.options` to SDK, but stores `models.*.options` on the Model object without passing it to SDK creation
  - Added detailed configuration example in README showing correct usage
  - This explains why `models.*.options` settings were not being applied

## [0.3.9] - 2026-01-22

### Fixed

- **Prompt-based tool calling message history**: Fixed `tool_use.id: Field required` error
  - When `usePromptBasedToolCalling: true`, now properly converts `tool-call` content in assistant messages to XML text format
  - Converts `tool-result` messages (role: "tool") to user messages with text content
  - This ensures the API doesn't receive native tool format when using prompt-based tool calling

## [0.3.8] - 2026-01-22

### Fixed

- **XML tool calls not showing in OpenCode**: Fixed tool calls not appearing in OpenCode UI
  - OpenCode's processor requires `tool-input-start` → `tool-input-delta` → `tool-input-end` → `tool-call` lifecycle
  - Previously only sent `tool-call` directly, which OpenCode ignored because `toolcalls[id]` was undefined
  - Now properly emits the full lifecycle: `tool-input-start` (registers pending tool), `tool-input-delta` (streams input), `tool-input-end`, then `tool-call` (triggers execution)

## [0.3.7] - 2026-01-22

### Added

- **Thinking tags parsing**: New `parseThinkingTags` option to convert `<think>` and `<thinking>` XML tags to V2 reasoning content
  - `<think>...</think>` at the start of response (DeepSeek style)
  - `<thinking>...</thinking>` anywhere in response (Claude/general style)
  - Works in both streaming and non-streaming modes
  - Integrates with XML tool calling

## [0.3.6] - 2026-01-22

### Fixed

- **Stream text lifecycle**: Fixed `text part id_xxx not found` error
  - V2 requires complete text lifecycle: `text-start` → `text-delta` → `text-end` with same id
  - Added proper `text-start` and `text-end` events when emitting cleaned text in XML tool call processing

## [0.3.5] - 2026-01-22

### Fixed

- **OpenCode V2/V3 compatibility**: Fixed Zod validation error `reason: expected string, received object`
  - OpenCode internally uses `LanguageModelV2` interface, not V3
  - Reverted to V2 dependencies: `@ai-sdk/openai-compatible@^1.0.31`, `@ai-sdk/provider@^2.0.1`
  - Updated `specificationVersion` back to `"v2"`
  - `finishReason` now returns V2 string format (`"stop"`, `"tool-calls"`, etc.) instead of V3 object
  - `usage` now uses V2 flat format: `{ inputTokens, outputTokens, totalTokens }`
  - Fixed tool-call content format to use `input` field correctly

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
