# Change Log

All notable changes to the "oai2lmapi" extension will be documented in this file.

## [0.2.0] - Secure API Key Storage

### Fixed
- Fixed "command 'oai2lmapi.refreshModels' not found" error by registering commands before async initialization

### Changed
- **BREAKING**: API key is now stored securely using VSCode's SecretStorage instead of plaintext in settings
- The `oai2lmapi.apiKey` setting is now deprecated; existing keys are automatically migrated to secure storage
- Commands are now registered immediately on extension activation to prevent "command not found" errors

### Added
- New command "OAI2LMApi: Set API Key" for securely entering the API key via password input
- New command "OAI2LMApi: Clear API Key" for removing the stored API key
- Automatic migration of API keys from plaintext settings to secure storage

## [0.1.0] - Initial Release

### Added
- Initial implementation of OpenAI to Language Model API bridge
- Support for OpenAI-compatible API endpoints
- Streaming response support
- Automatic model loading from API
- VSCode Language Model API integration
- Configuration options for API endpoint, key, and model settings
- Manual model refresh command
- Support for multiple models
- Comprehensive error handling and logging

### Features
- Connect any OpenAI-compatible API to VSCode's Language Model API
- Enable GitHub Copilot and other extensions to use custom language models
- Real-time streaming responses
- Automatic model discovery and registration
- Configurable model parameters
