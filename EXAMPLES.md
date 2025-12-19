# Example Configuration

This file shows example configurations for common OpenAI-compatible API providers.

## OpenAI

```json
{
  "oai2lmapi.apiEndpoint": "https://api.openai.com/v1",
  "oai2lmapi.apiKey": "sk-...",
  "oai2lmapi.defaultModel": "gpt-4",
  "oai2lmapi.modelFamily": "gpt-4",
  "oai2lmapi.maxTokens": 8192
}
```

## Azure OpenAI

```json
{
  "oai2lmapi.apiEndpoint": "https://YOUR-RESOURCE.openai.azure.com/openai/deployments/YOUR-DEPLOYMENT",
  "oai2lmapi.apiKey": "YOUR-API-KEY",
  "oai2lmapi.defaultModel": "gpt-4",
  "oai2lmapi.modelFamily": "gpt-4",
  "oai2lmapi.maxTokens": 8192
}
```

## LocalAI

```json
{
  "oai2lmapi.apiEndpoint": "http://localhost:8080/v1",
  "oai2lmapi.apiKey": "not-needed",
  "oai2lmapi.defaultModel": "gpt-3.5-turbo",
  "oai2lmapi.modelFamily": "local",
  "oai2lmapi.autoLoadModels": true,
  "oai2lmapi.maxTokens": 4096
}
```

## Ollama (with OpenAI compatibility)

```json
{
  "oai2lmapi.apiEndpoint": "http://localhost:11434/v1",
  "oai2lmapi.apiKey": "ollama",
  "oai2lmapi.defaultModel": "llama2",
  "oai2lmapi.modelFamily": "llama",
  "oai2lmapi.autoLoadModels": true,
  "oai2lmapi.maxTokens": 4096
}
```

## LM Studio

```json
{
  "oai2lmapi.apiEndpoint": "http://localhost:1234/v1",
  "oai2lmapi.apiKey": "lm-studio",
  "oai2lmapi.defaultModel": "local-model",
  "oai2lmapi.modelFamily": "local",
  "oai2lmapi.autoLoadModels": true,
  "oai2lmapi.maxTokens": 4096
}
```

## Text Generation WebUI

```json
{
  "oai2lmapi.apiEndpoint": "http://localhost:5000/v1",
  "oai2lmapi.apiKey": "not-needed",
  "oai2lmapi.defaultModel": "current-model",
  "oai2lmapi.modelFamily": "local",
  "oai2lmapi.autoLoadModels": false,
  "oai2lmapi.maxTokens": 4096
}
```

## Custom API

```json
{
  "oai2lmapi.apiEndpoint": "https://your-custom-api.com/v1",
  "oai2lmapi.apiKey": "your-api-key",
  "oai2lmapi.defaultModel": "your-model",
  "oai2lmapi.modelFamily": "custom",
  "oai2lmapi.autoLoadModels": true,
  "oai2lmapi.maxTokens": 4096
}
```

## Notes

- **apiEndpoint**: Should point to the base URL that supports OpenAI-compatible endpoints like `/chat/completions` and `/models`
- **apiKey**: Can be any string for local APIs that don't require authentication
- **autoLoadModels**: Set to `true` to automatically fetch available models from the API, or `false` to only use the default model
- **maxTokens**: Adjust based on your model's capabilities
