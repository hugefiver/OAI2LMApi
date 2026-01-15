# Changelog

All notable changes to the OAI2LMApi monorepo will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Converted project to pnpm workspace monorepo structure
- New package: `@oai2lmapi/opencode-provider` - OpenCode provider plugin
  - Auto-discovery of models from API `/models` endpoint
  - Smart capability detection for tool calling, vision, and context limits
  - Chain-of-thought support via `<think>` tags
  - Prompt-based tool calling for models without native function calling
  - Per-model configuration overrides with wildcard pattern matching
  - Based on Vercel AI SDK's `@ai-sdk/openai-compatible`
- New package: `@oai2lmapi/model-metadata` - shared model metadata registry for all packages

### Changed
- Restructured VSCode extension into `packages/vscode-extension`
- Updated build scripts to support workspace structure
- Renamed VSCode extension package to `@oai2lmapi/vscode-extension`
- Centralized model metadata lookups in the shared metadata package

## [0.2.6] - 2025-01-XX

### VSCode Extension
See [packages/vscode-extension/CHANGELOG.md](./packages/vscode-extension/CHANGELOG.md) for previous versions.
