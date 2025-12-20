# OAI2LMApi - OpenAI to Language Model API Bridge

A VSCode extension that connects OpenAI-compatible APIs to VSCode's Language Model API, enabling integration with GitHub Copilot and other AI-powered features in VSCode.

## Features

- ✅ **Full OpenAI API Compatibility**: Works with any OpenAI-compatible API endpoint
- ✅ **Streaming Support**: Real-time streaming responses for better user experience
- ✅ **Automatic Model Loading**: Fetches available models from the API endpoint
- ✅ **VSCode Language Model API Integration**: Seamlessly integrates with VSCode's built-in language model features
- ✅ **Configurable**: Easy configuration through VSCode settings

## Requirements

- VSCode version 1.85.0 or higher
- An OpenAI-compatible API endpoint
- API key for authentication

## Installation

### From Source

1. Clone this repository
2. Run `npm install` to install dependencies
3. Run `npm run compile` to build the extension
4. Press F5 in VSCode to run the extension in debug mode

### From VSIX

1. Package the extension: `npx vsce package`
2. Install the `.vsix` file in VSCode

## Configuration

### Setting Up the API Key (Secure Storage)

The API key is stored securely using VSCode's built-in SecretStorage. To set your API key:

1. Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
2. Type "OAI2LMApi: Set API Key" and select the command
3. Enter your API key in the password input field
4. The key will be stored securely and the extension will initialize automatically

To clear your API key:

1. Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
2. Type "OAI2LMApi: Clear API Key" and select the command
3. Confirm when prompted

**Note**: If you have previously stored an API key in settings (the deprecated `oai2lmapi.apiKey` setting), it will be automatically migrated to secure storage on the next extension activation.

### Other Settings

Configure other extension options through VSCode settings (`settings.json` or UI):

```json
{
  "oai2lmapi.apiEndpoint": "https://api.openai.com/v1",
  "oai2lmapi.defaultModel": "gpt-3.5-turbo",
  "oai2lmapi.modelFamily": "gpt-3.5-turbo",
  "oai2lmapi.modelVendor": "openai",
  "oai2lmapi.maxTokens": 4096,
  "oai2lmapi.autoLoadModels": true
}
```

### Configuration Options

- **apiEndpoint**: The base URL of your OpenAI-compatible API (e.g., `https://api.openai.com/v1`)
- **defaultModel**: The default model to use if none is specified
- **modelFamily**: Model family identifier for VSCode Language Model API
- **modelVendor**: Vendor identifier (e.g., "openai", "custom")
- **maxTokens**: Maximum number of tokens the model can handle
- **autoLoadModels**: Automatically fetch and register all available models from the API

### Available Commands

- **OAI2LMApi: Set API Key**: Securely store your API key
- **OAI2LMApi: Clear API Key**: Remove the stored API key
- **OAI2LMApi: Refresh Models**: Manually refresh the list of available models
- **OAI2LMApi: Manage Provider Settings**: Open extension settings

## Usage

Once configured, the extension automatically registers available models with VSCode's Language Model API. These models can then be used by:

- GitHub Copilot Chat
- Other extensions that use the VSCode Language Model API
- Custom implementations using `vscode.lm` API

### Manual Model Refresh

You can manually refresh the available models using the command palette:

1. Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
2. Type "Refresh Models" and select the command
3. Models will be reloaded from the API

## Supported APIs

This extension works with any API that implements the OpenAI chat completions format, including:

- OpenAI API
- Azure OpenAI
- LocalAI
- Ollama (with OpenAI compatibility layer)
- LM Studio
- Text Generation WebUI (with OpenAI extension)
- Any custom implementation following the OpenAI API specification

## Development

### Building

```bash
npm install
npm run compile
```

### Watching for Changes

```bash
npm run watch
```

### Linting

```bash
npm run lint
```

## Architecture

The extension consists of three main components:

1. **Extension Host** (`extension.ts`): Manages extension lifecycle and configuration
2. **OpenAI Client** (`openaiClient.ts`): Handles communication with OpenAI-compatible APIs
3. **Language Model Provider** (`languageModelProvider.ts`): Implements VSCode's Language Model API

### Flow

1. Extension activates on VSCode startup
2. Reads configuration from VSCode settings
3. Initializes OpenAI client with configured endpoint and API key
4. Fetches available models from the API (if `autoLoadModels` is enabled)
5. Registers each model with VSCode's Language Model API
6. Handles chat requests by converting VSCode messages to OpenAI format
7. Streams responses back to the caller

## References

This project was inspired by:

- [vscode-lm-proxy](https://github.com/ryonakae/vscode-lm-proxy/)
- [new-api](https://github.com/QuantumNous/new-api)

## License

See LICENSE file for details.

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## Troubleshooting

### Extension doesn't activate

- Check that you're using VSCode 1.85.0 or higher
- Verify the extension is enabled in the Extensions view

### Models not loading

- Use the "OAI2LMApi: Set API Key" command to ensure your API key is properly configured
- Verify your API endpoint is correct and accessible
- Check that your API key is valid
- Look at the VSCode Developer Console (Help > Toggle Developer Tools) for error messages
- Try manually refreshing models with the "OAI2LMApi: Refresh Models" command

### API errors

- Ensure your API endpoint is fully OpenAI-compatible
- Check that the endpoint supports the `/v1/models` and `/v1/chat/completions` endpoints
- Verify network connectivity to the API endpoint

## Support

For issues and feature requests, please use the GitHub issue tracker.