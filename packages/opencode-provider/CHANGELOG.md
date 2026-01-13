# Changelog

All notable changes to the opencode-provider package will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
