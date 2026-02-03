# OAI2LMApi - OpenAI to Language Model API Bridge

[![Build Status](https://github.com/hugefiver/OAI2LMApi/actions/workflows/build-test-package.yml/badge.svg)](https://github.com/hugefiver/OAI2LMApi/actions/workflows/build-test-package.yml)
[![Version](https://img.shields.io/visual-studio-marketplace/v/oai2lmapi.oai2lmapi)](https://marketplace.visualstudio.com/items?itemName=oai2lmapi.oai2lmapi)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/oai2lmapi.oai2lmapi)](https://marketplace.visualstudio.com/items?itemName=oai2lmapi.oai2lmapi)
[![Rating](https://img.shields.io/visual-studio-marketplace/r/oai2lmapi.oai2lmapi)](https://marketplace.visualstudio.com/items?itemName=oai2lmapi.oai2lmapi)
[![VS Code Marketplace](https://img.shields.io/badge/VS%20Code%20Marketplace-Install-blue?logo=visual-studio-code)](https://marketplace.visualstudio.com/items?itemName=oai2lmapi.oai2lmapi)
[![License](https://img.shields.io/github/license/hugefiver/OAI2LMApi)](https://github.com/hugefiver/OAI2LMApi/blob/main/LICENSE)

A VSCode extension that connects OpenAI-compatible APIs to VSCode's Language Model API, enabling integration with GitHub Copilot Chat and other AI-powered features in VSCode.

## Features

- ✅ **Full OpenAI API Compatibility**: Works with any OpenAI-compatible API endpoint
- ✅ **Google Gemini Support**: Native support for Google Gemini API with dedicated channel
- ✅ **VSCode Language Model API Integration**: Seamlessly integrates with VSCode's built-in language model features
- ✅ **Streaming Support**: Real-time streaming responses for better user experience
- ✅ **Thinking/Reasoning Support**: Stream reasoning content from models that support it (e.g., o1, Claude with thinking)
- ✅ **Automatic Model Loading**: Fetches available models from the API endpoint on startup
- ✅ **Model Caching**: Loaded models are cached locally for faster startup times
- ✅ **Secure API Key Storage**: API keys are stored securely using VSCode's SecretStorage
- ✅ **Tool Calling Support**: Full support for tool/function calling with improved reliability
- ✅ **XML-based Tool Calling**: Fallback prompt-based tool calling for models without native support
- ✅ **Tool Calling Filter**: Optionally filter models by tool/function calling support
- ✅ **Per-Model Configuration**: Customize token limits, temperature, and capabilities per model
- ✅ **Easy Configuration**: Simple setup through VSCode settings and commands

## Requirements

- VSCode version 1.107.0 or higher
- An OpenAI-compatible API endpoint
- API key for authentication

## Installation

### From VS Code Marketplace (Recommended)

1. Open VSCode
2. Go to Extensions view (`Ctrl+Shift+X` / `Cmd+Shift+X`)
3. Search for "OAI2LMApi"
4. Click **Install**

Or install directly via [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=oai2lmapi.oai2lmapi).

### From VSIX

1. Download the `.vsix` file from the [Releases](https://github.com/hugefiver/OAI2LMApi/releases) page
2. In VSCode, open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
3. Run "Extensions: Install from VSIX..." and select the downloaded file

### From Source

1. Clone this repository
2. Run `pnpm install` to install dependencies
3. Run `pnpm run compile` to build the extension
4. Press `F5` in VSCode to run the extension in debug mode

## Quick Start

1. Install the extension
2. Open Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
3. Run **OAI2LMApi: Set API Key** and enter your API key
4. (Optional) Configure the API endpoint in settings if not using OpenAI
5. Models will be automatically loaded and available in GitHub Copilot Chat

## Commands

| Command | Description |
|---------|-------------|
| `OAI2LMApi: Set API Key` | Securely store your OpenAI-compatible API key |
| `OAI2LMApi: Clear API Key` | Remove the stored OpenAI-compatible API key |
| `OAI2LMApi: Set Gemini API Key` | Securely store your Google Gemini API key |
| `OAI2LMApi: Clear Gemini API Key` | Remove the stored Gemini API key |
| `OAI2LMApi: Set Claude API Key` | Securely store your Claude API key |
| `OAI2LMApi: Clear Claude API Key` | Remove the stored Claude API key |
| `OAI2LMApi: Refresh Models` | Manually reload available models from all providers |
| `OAI2LMApi: Manage Provider Settings` | Open extension settings |

## Configuration

Configure the extension through VSCode settings (`Ctrl+,` or `Cmd+,`):

### Basic Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `oai2lmapi.apiEndpoint` | `https://api.openai.com/v1` | OpenAI-compatible API endpoint URL |
| `oai2lmapi.autoLoadModels` | `true` | Automatically load models from API on startup |
| `oai2lmapi.showModelsWithoutToolCalling` | `false` | Show models that do not support tool/function calling |

### Gemini Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `oai2lmapi.enableGeminiChannel` | `false` | Enable the Gemini channel provider |
| `oai2lmapi.geminiApiEndpoint` | `https://generativelanguage.googleapis.com` | Google Gemini API endpoint URL |

### Claude Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `oai2lmapi.enableClaudeChannel` | `false` | Enable the Claude channel provider |
| `oai2lmapi.claudeApiEndpoint` | `https://api.anthropic.com/v1` | Anthropic Claude API endpoint URL. If left at default and the OpenAI endpoint is set to a custom OpenAI-compatible API, that endpoint is used for Claude requests. |

### Model Overrides

The `oai2lmapi.modelOverrides` setting allows per-model configuration. Keys are model name patterns (supports wildcards like `gemini-*`), values are configuration objects.

The `oai2lmapi.channelModelOverrides` setting allows per-channel configuration. Keys are channel names (e.g. `openai`, `gemini`, `claude`) and values are objects mapping model patterns to override objects. Matching overrides are merged in order: global `modelOverrides` then channel overrides.

| Property | Type | Description |
|----------|------|-------------|
| `maxInputTokens` | number | Override max input tokens |
| `maxOutputTokens` | number | Override max output tokens |
| `supportsToolCalling` | boolean | Override tool calling support |
| `supportsImageInput` | boolean | Override image input support |
| `temperature` | number | Default temperature for the model |
| `thinkingLevel` | string/number | Thinking level: token budget number, or `'low'`/`'medium'`/`'high'`/`'auto'`/`'none'` |
| `usePromptBasedToolCalling` | boolean | Use XML-based prompt tool calling instead of native function calling |

### Example Configuration

```json
{
  "oai2lmapi.apiEndpoint": "https://api.openai.com/v1",
  "oai2lmapi.autoLoadModels": true,
  "oai2lmapi.showModelsWithoutToolCalling": false,
  "oai2lmapi.enableGeminiChannel": true,
  "oai2lmapi.geminiApiEndpoint": "https://generativelanguage.googleapis.com",
  "oai2lmapi.enableClaudeChannel": true,
  "oai2lmapi.claudeApiEndpoint": "https://api.anthropic.com/v1",
  "oai2lmapi.modelOverrides": {
    "gemini-2.0-flash-thinking-exp": {
      "thinkingLevel": "auto",
      "usePromptBasedToolCalling": true
    },
    "claude-*": {
      "maxOutputTokens": 8192
    }
  },
  "oai2lmapi.channelModelOverrides": {
    "openai": {
      "gpt-4o": {
        "temperature": 0.7
      }
    },
    "claude": {
      "claude-3.7*": {
        "thinkingLevel": "high"
      }
    }
  }
}
```

### API Key Storage

The API key is stored securely using VSCode's built-in SecretStorage. Use the **OAI2LMApi: Set API Key** command to set your key.

> **Note**: If you previously stored an API key in settings (the deprecated `oai2lmapi.apiKey` setting), it will be automatically migrated to secure storage.

## Supported APIs

This extension works with any API that implements the OpenAI chat completions format:

- OpenAI API
- Azure OpenAI
- Google Gemini API (native support via Gemini channel)
- Anthropic Claude (native Claude channel via @anthropic-ai/sdk)
- LocalAI
- Ollama (with OpenAI compatibility layer)
- LM Studio
- vLLM
- liteLM (transfer from other APIs)
- OpenRouter
- Any custom OpenAI-compatible implementation

## Troubleshooting

### Extension doesn't activate

- Ensure you're using VSCode 1.107.0 or higher
- Verify the extension is enabled in the Extensions view

### Models not loading

- Run **OAI2LMApi: Set API Key** to ensure your API key is configured
- For Gemini: Enable `oai2lmapi.enableGeminiChannel` and run **OAI2LMApi: Set Gemini API Key**
- For Claude: Enable `oai2lmapi.enableClaudeChannel` and run **OAI2LMApi: Set Claude API Key**
- Verify your API endpoint is correct and accessible
- Check the **OAI2LMApi** Output Channel (`View > Output`, select "OAI2LMApi") for detailed logs
- Try **OAI2LMApi: Refresh Models** to manually reload

### API errors

- Ensure your API endpoint supports `/v1/models` and `/v1/chat/completions`
- For Gemini: The extension uses the native Gemini API format, not OpenAI compatibility
- Verify network connectivity to the API endpoint

### Tool calling issues

- Some models don't support native function calling
- Use `usePromptBasedToolCalling: true` in model overrides for XML-based fallback
- Check model capabilities in the Output Channel logs

## Development Notes

- Model metadata patterns are maintained in `@oai2lmapi/model-metadata` (`packages/model-metadata/src/index.ts`) and shared across all packages.

## License

MIT - See [LICENSE](LICENSE) for details.

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests on [GitHub](https://github.com/hugefiver/OAI2LMApi).
