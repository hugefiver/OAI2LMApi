# OpenAI2LMApi - Monorepo

This is a monorepo containing multiple packages for bridging OpenAI-compatible APIs to various platforms.

## Packages

### @oai2lmapi/vscode-extension

VSCode extension that bridges OpenAI-compatible APIs to VSCode's Language Model API for GitHub Copilot and other AI-powered features.

[View README](./README.md)

### @oai2lmapi/opencode-provider

OpenAI-compatible provider plugin for [OpenCode](https://github.com/anomalyco/opencode), featuring:

- Automatic model discovery from API `/models` endpoint
- Support for chain-of-thought via `<think>` tags
- Prompt-based tool calling for models without native function calling
- Configurable model overrides

[View README](./packages/opencode-provider/README.md)

## Development

This project uses pnpm workspaces.

### Prerequisites

```bash
npm install -g pnpm@10
```

### Installation

```bash
pnpm install --frozen-lockfile
```

### Build All Packages

```bash
pnpm run build
```

### Build Specific Package

```bash
# VSCode Extension
pnpm run vscode:compile

# OpenCode Provider
pnpm run opencode:build
```

### Testing

```bash
pnpm run test
```

## License

MIT
