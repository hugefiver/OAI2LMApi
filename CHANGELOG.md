# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2025-12-22

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