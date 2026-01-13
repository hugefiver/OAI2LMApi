# @oai2lmapi/opencode-provider

OpenAI-compatible provider for [OpenCode](https://github.com/anomalyco/opencode), built with the Vercel AI SDK.

## Features

- **Auto-Discovery**: Automatically discovers models from your API's `/models` endpoint
- **Smart Configuration**: Automatically detects model capabilities (tool calling, vision, context limits)
- **Flexible Overrides**: Per-model configuration via OpenCode settings
- **Based on AI SDK**: Built on top of Vercel AI SDK's `@ai-sdk/openai-compatible`

> **Note**: Advanced features like chain-of-thought handling (`<think>` tags) and prompt-based tool calling are planned for future releases.

## Installation

```bash
npm install @oai2lmapi/opencode-provider
# or
pnpm add @oai2lmapi/opencode-provider
# or
yarn add @oai2lmapi/opencode-provider
```

## Usage

### Basic Setup

Create a provider configuration file for OpenCode (e.g., `opencode.config.ts`):

```typescript
import { createOAI2LMProvider } from '@oai2lmapi/opencode-provider';

export default {
  providers: {
    myapi: createOAI2LMProvider({
      apiKey: process.env.MY_API_KEY,
      baseURL: 'https://api.example.com/v1',
    }),
  },
};
```

### With Model Auto-Discovery

The provider will automatically fetch available models on initialization:

```typescript
import { createOAI2LMProvider } from '@oai2lmapi/opencode-provider';

const provider = await createOAI2LMProvider({
  apiKey: process.env.MY_API_KEY,
  baseURL: 'https://api.example.com/v1',
  autoDiscoverModels: true, // default
});

// Use with OpenCode
const result = await generateText({
  model: provider('gpt-4'),
  prompt: 'Hello, world!',
});
```

### Model Overrides

Configure per-model settings:

```typescript
const provider = createOAI2LMProvider({
  apiKey: process.env.MY_API_KEY,
  baseURL: 'https://api.example.com/v1',
  modelOverrides: {
    'deepseek-*': {
      // Use prompt-based tool calling for DeepSeek models
      usePromptBasedToolCalling: true,
      // Strip chain-of-thought tags
      suppressChainOfThought: true,
    },
    'o1-*': {
      // Enable reasoning capture for o1 models
      captureReasoning: true,
    },
    'gpt-4-vision': {
      // Override capabilities
      supportsImageInput: true,
      maxInputTokens: 128000,
    },
  },
});
```

### Chain-of-Thought Handling

For reasoning models that output `<think>` tags:

```typescript
const provider = createOAI2LMProvider({
  apiKey: process.env.MY_API_KEY,
  baseURL: 'https://api.example.com/v1',
  modelOverrides: {
    'reasoning-model-*': {
      // Capture and expose chain-of-thought
      captureReasoning: true,
      // Or suppress it from output
      suppressChainOfThought: false,
    },
  },
});

const result = await generateText({
  model: provider('reasoning-model-v1'),
  prompt: 'Solve this puzzle...',
});

// Access reasoning if captured
console.log(result.reasoning); // Chain-of-thought content
console.log(result.text); // Final answer without <think> tags
```

### Prompt-Based Tool Calling

For models without native function calling:

```typescript
const provider = createOAI2LMProvider({
  apiKey: process.env.MY_API_KEY,
  baseURL: 'https://api.example.com/v1',
  modelOverrides: {
    'legacy-model': {
      usePromptBasedToolCalling: true,
    },
  },
});

// Tools are automatically converted to XML format in system prompt
const result = await generateText({
  model: provider('legacy-model'),
  prompt: 'What is the weather in Tokyo?',
  tools: {
    getWeather: {
      description: 'Get current weather',
      parameters: z.object({
        location: z.string(),
      }),
      execute: async ({ location }) => {
        // ... fetch weather
      },
    },
  },
});
```

## Configuration Options

### Provider Settings

```typescript
interface OAI2LMProviderSettings {
  /** API key for authentication */
  apiKey: string;
  
  /** Base URL for API calls (e.g., 'https://api.example.com/v1') */
  baseURL: string;
  
  /** Provider name (defaults to 'oai2lm') */
  name?: string;
  
  /** Custom headers */
  headers?: Record<string, string>;
  
  /** Auto-discover models on initialization (default: true) */
  autoDiscoverModels?: boolean;
  
  /** Per-model configuration overrides */
  modelOverrides?: Record<string, ModelOverride>;
  
  /** Custom fetch implementation */
  fetch?: typeof fetch;
}
```

### Model Override Options

```typescript
interface ModelOverride {
  /** Max input tokens */
  maxInputTokens?: number;
  
  /** Max output tokens */
  maxOutputTokens?: number;
  
  /** Supports native tool/function calling */
  supportsToolCalling?: boolean;
  
  /** Supports image inputs */
  supportsImageInput?: boolean;
  
  /** Default temperature */
  temperature?: number;
  
  /** Use XML-based prompt engineering for tools */
  usePromptBasedToolCalling?: boolean;
  
  /** Strip <think>...</think> blocks from output */
  suppressChainOfThought?: boolean;
  
  /** Capture reasoning content separately */
  captureReasoning?: boolean;
  
  /** Thinking level: token budget or 'low'/'medium'/'high' */
  thinkingLevel?: number | 'low' | 'medium' | 'high' | 'auto';
}
```

## How It Works

1. **Model Discovery**: On initialization, the provider fetches the `/models` endpoint
2. **Capability Detection**: Analyzes model metadata to determine capabilities
3. **Metadata Caching**: Model info is cached to reduce API calls
4. **Override Application**: User-defined overrides are applied on top of discovered capabilities
5. **Request Translation**: Converts AI SDK requests to OpenAI-compatible format
6. **Response Parsing**: Handles special formats like `<think>` tags and XML tool calls

## Integration with OpenCode

This provider is designed to work seamlessly with OpenCode's configuration system:

```javascript
// ~/.opencode/config.js
export default {
  providers: {
    myapi: {
      type: '@oai2lmapi/opencode-provider',
      apiKey: process.env.MY_API_KEY,
      baseURL: 'https://api.example.com/v1',
      modelOverrides: {
        // Configure models as needed
      },
    },
  },
  models: {
    default: 'myapi:gpt-4',
  },
};
```

## Examples

### Using with Multiple Providers

```typescript
import { createOAI2LMProvider } from '@oai2lmapi/opencode-provider';

const openai = createOAI2LMProvider({
  name: 'openai',
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: 'https://api.openai.com/v1',
});

const deepseek = createOAI2LMProvider({
  name: 'deepseek',
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: 'https://api.deepseek.com/v1',
  modelOverrides: {
    '*': {
      usePromptBasedToolCalling: true,
    },
  },
});

// Use either provider
await generateText({ model: openai('gpt-4'), prompt: '...' });
await generateText({ model: deepseek('deepseek-chat'), prompt: '...' });
```

## License

MIT

## Contributing

Contributions are welcome! Please see the main repository for guidelines.
