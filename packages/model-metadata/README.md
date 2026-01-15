# @oai2lmapi/model-metadata

Shared model metadata registry used by the VSCode extension and OpenCode provider.

## Usage

```ts
import { getModelMetadata, getModelMetadataFromPatterns, mergeMetadata } from '@oai2lmapi/model-metadata';

const metadata = getModelMetadata('gpt-4o');
const merged = mergeMetadata({ maxOutputTokens: 8192 }, metadata);
```

## Development

```bash
pnpm --filter @oai2lmapi/model-metadata run build
```
