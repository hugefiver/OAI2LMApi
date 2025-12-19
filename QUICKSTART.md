# Quick Start Guide

Get started with OAI2LMApi in just a few minutes!

## 1. Installation

### Option A: Install from Source

```bash
git clone https://github.com/hugefiver/OAI2LMApi.git
cd OAI2LMApi
npm install
npm run compile
```

Then press `F5` in VSCode to run the extension in debug mode.

### Option B: Install from VSIX (when available)

1. Download the `.vsix` file from releases
2. Open VSCode
3. Go to Extensions (Ctrl+Shift+X)
4. Click the "..." menu → "Install from VSIX..."
5. Select the downloaded file

## 2. Configure Your API

Open VSCode settings (Ctrl+,) and configure:

### For OpenAI:

```json
{
  "oai2lmapi.apiEndpoint": "https://api.openai.com/v1",
  "oai2lmapi.apiKey": "sk-your-api-key-here",
  "oai2lmapi.defaultModel": "gpt-4"
}
```

### For Local APIs (e.g., Ollama):

```json
{
  "oai2lmapi.apiEndpoint": "http://localhost:11434/v1",
  "oai2lmapi.apiKey": "any-value",
  "oai2lmapi.defaultModel": "llama2",
  "oai2lmapi.autoLoadModels": true
}
```

See [EXAMPLES.md](EXAMPLES.md) for more configuration examples.

## 3. Verify Installation

1. Open the Command Palette (Ctrl+Shift+P)
2. Type "OAI2LMApi: Refresh Models"
3. You should see a success message

## 4. Use with GitHub Copilot Chat

Once configured, the models will be available to:
- GitHub Copilot Chat
- Any extension that uses VSCode's Language Model API

## 5. Troubleshooting

### Extension not loading?

- Check VSCode version (must be 1.85.0+)
- Look for errors in: Help → Toggle Developer Tools → Console

### Models not appearing?

- Verify API endpoint is correct
- Check API key is valid
- Try manually refreshing with "OAI2LMApi: Refresh Models"
- Check the console for error messages

### API connection errors?

- Ensure the API endpoint is accessible
- For local APIs, make sure the server is running
- Check firewall settings

## 6. Next Steps

- Read the full [README.md](README.md) for detailed documentation
- Check [EXAMPLES.md](EXAMPLES.md) for more configuration examples
- Report issues on GitHub

## Need Help?

Open an issue on GitHub with:
- Your VSCode version
- Your configuration (without the API key!)
- Error messages from the Developer Console
