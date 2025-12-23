# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.3] - 2025-12-23

### Changed

- Version bump to 0.1.3

## [0.1.2] - 2025-12-23

### Added

- Model caching functionality to store loaded models in VSCode's GlobalState
- Automatic loading of cached models on startup when auto-load is disabled
- Comprehensive `.github/copilot-instructions.md` documentation for AI agents and developers
- Prerelease workflow for automatic publishing from main branch to VS Code Marketplace preview channel
- CI/CD optimizations with pnpm caching for faster builds

### Changed

- Refactored model filtering logic into dedicated `updateModelList` method
- Improved model loading performance with caching support
- Enhanced release workflow with proper cleanup of existing releases and tags

### Fixed

- Prerelease versioning strategy to ensure unique version numbers with timestamp suffixes
- Prerelease workflow to properly delete and recreate releases and tags
- Added `--pre-release` flag when packaging for VS Code Marketplace preview channel

## [0.1.1] - 2025-12-22

### Added

- Initial release
- Full OpenAI API compatibility with any OpenAI-compatible endpoint
- VSCode Language Model API integration for use with GitHub Copilot Chat and other AI extensions
- Streaming response support for real-time token output
- Automatic model loading from API endpoint on startup
- Secure API key storage using VSCode's SecretStorage
- Commands for managing the extension:
  - `OAI2LMApi: Set API Key` - Securely store API key
  - `OAI2LMApi: Clear API Key` - Remove stored API key
  - `OAI2LMApi: Refresh Models` - Manually reload available models
  - `OAI2LMApi: Manage Provider Settings` - Open extension settings
- Configurable settings:
  - API endpoint URL
  - Auto-load models on startup
  - Filter models by tool calling support
- Support for multiple OpenAI-compatible backends:
  - OpenAI API
  - Azure OpenAI
  - LocalAI
  - Ollama (with OpenAI compatibility layer)
  - LM Studio
  - Text Generation WebUI
  - Any custom OpenAI-compatible implementation
