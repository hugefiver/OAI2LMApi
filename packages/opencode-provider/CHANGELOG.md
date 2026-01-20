# Changelog

All notable changes to the opencode-provider package will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- Consume shared metadata from `@oai2lmapi/model-metadata` for pattern-based capabilities.
- **BREAKING**: Converted `OAI2LMProvider` from a class to a callable function factory pattern following AI SDK conventions. Use `createOAI2LMProvider()` to create provider instances.
- **BREAKING**: Removed `CONFIG_FILENAME` constant from main entry point exports. Import directly from `'@oai2lmapi/opencode-provider/config.js'` if needed.
- **BREAKING**: Removed `DEFAULT_MODEL_METADATA` object from main entry point exports. Import directly from `'@oai2lmapi/opencode-provider/modelMetadata.js'` if needed.
- **BREAKING**: Changed `ModelDiscovery` to type-only export from main entry point. Import directly from `'@oai2lmapi/opencode-provider/modelDiscovery.js'` for runtime class.

### Fixed
- Fixed OpenCode plugin loader crash caused by non-function exports being called as functions.

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
