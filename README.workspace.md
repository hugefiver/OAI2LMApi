# OpenAI2LMApi - Monorepo

This is a monorepo containing multiple packages for bridging OpenAI-compatible APIs to various platforms.

## Packages

### @oai2lmapi/vscode-extension

VSCode extension that bridges OpenAI-compatible APIs to VSCode's Language Model API for GitHub Copilot and other AI-powered features.

[View README](./README.md)

### @oai2lmapi/opencode-provider

AI SDK Provider for [OpenCode](https://github.com/anomalyco/opencode), featuring:

- Native AI SDK provider interface (`createOai2lm`)
- Automatic model discovery from API `/models` endpoint
- Model metadata enrichment from `@oai2lmapi/model-metadata`
- Configurable model overrides with wildcard patterns

[View README](./packages/opencode-provider/README.md)

### @oai2lmapi/model-metadata

Shared model metadata registry used by both the VSCode extension and the OpenCode provider.

[View README](./packages/model-metadata/README.md)

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

# Shared Model Metadata
pnpm --filter @oai2lmapi/model-metadata run build
```

### Testing

```bash
pnpm run test
```

## License

MIT
