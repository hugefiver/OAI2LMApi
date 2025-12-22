# OAI2LMApi - OpenAI to Language Model API Bridge

A VSCode extension that connects OpenAI-compatible APIs to VSCode's Language Model API, enabling integration with GitHub Copilot Chat and other AI-powered features in VSCode.

## Features

- ✅ **Full OpenAI API Compatibility**: Works with any OpenAI-compatible API endpoint
- ✅ **VSCode Language Model API Integration**: Seamlessly integrates with VSCode's built-in language model features
- ✅ **Streaming Support**: Real-time streaming responses for better user experience
- ✅ **Automatic Model Loading**: Fetches available models from the API endpoint on startup
- ✅ **Secure API Key Storage**: API keys are stored securely using VSCode's SecretStorage
- ✅ **Tool Calling Filter**: Optionally filter models by tool/function calling support
- ✅ **Easy Configuration**: Simple setup through VSCode settings and commands

## Requirements

- VSCode version 1.107.0 or higher
- An OpenAI-compatible API endpoint
- API key for authentication

## Installation

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
| `OAI2LMApi: Set API Key` | Securely store your API key |
| `OAI2LMApi: Clear API Key` | Remove the stored API key |
| `OAI2LMApi: Refresh Models` | Manually reload available models from the API |
| `OAI2LMApi: Manage Provider Settings` | Open extension settings |

## Configuration

Configure the extension through VSCode settings (`Ctrl+,` or `Cmd+,`):

| Setting | Default | Description |
|---------|---------|-------------|
| `oai2lmapi.apiEndpoint` | `https://api.openai.com/v1` | OpenAI-compatible API endpoint URL |
| `oai2lmapi.autoLoadModels` | `true` | Automatically load models from API on startup |
| `oai2lmapi.showModelsWithoutToolCalling` | `false` | Show models that do not support tool/function calling |

### Example Configuration

```json
{
  "oai2lmapi.apiEndpoint": "https://api.openai.com/v1",
  "oai2lmapi.autoLoadModels": true,
  "oai2lmapi.showModelsWithoutToolCalling": false
}
```

### API Key Storage

The API key is stored securely using VSCode's built-in SecretStorage. Use the **OAI2LMApi: Set API Key** command to set your key.

> **Note**: If you previously stored an API key in settings (the deprecated `oai2lmapi.apiKey` setting), it will be automatically migrated to secure storage.

## Supported APIs

This extension works with any API that implements the OpenAI chat completions format:

- OpenAI API
- Azure OpenAI
- LocalAI
- Ollama (with OpenAI compatibility layer)
- LM Studio
- Text Generation WebUI (with OpenAI extension)
- Any custom OpenAI-compatible implementation

## Troubleshooting

### Extension doesn't activate

- Ensure you're using VSCode 1.107.0 or higher
- Verify the extension is enabled in the Extensions view

### Models not loading

- Run **OAI2LMApi: Set API Key** to ensure your API key is configured
- Verify your API endpoint is correct and accessible
- Check the VSCode Developer Console (`Help > Toggle Developer Tools`) for errors
- Try **OAI2LMApi: Refresh Models** to manually reload

### API errors

- Ensure your API endpoint supports `/v1/models` and `/v1/chat/completions`
- Verify network connectivity to the API endpoint

## License

MIT - See [LICENSE](LICENSE) for details.

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests on [GitHub](https://github.com/hugefiver/OAI2LMApi).