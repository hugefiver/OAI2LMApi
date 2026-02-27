# AGENTS.md — OAI2LMApi

VSCode extension monorepo that bridges OpenAI-compatible APIs to the VSCode Language Model API.
Supports OpenAI, Gemini, and Claude channels with streaming, tool calling, and thinking/reasoning.

## Project Structure

```
packages/
  vscode-extension/   # Main VSCode extension (CommonJS, Mocha tests)
  opencode-provider/   # AI SDK provider + OpenCode plugin (ESM, esbuild)
  model-metadata/      # Shared model metadata registry (dual CJS+ESM)
```

## Tech Stack

- **TypeScript 5.9.3** with strict mode enabled everywhere
- **Node ≥18**, **pnpm ≥10** (monorepo with `pnpm-workspace.yaml`)
- **esbuild** for bundling (vscode-extension + opencode-provider)
- **ESLint 9.x** flat config (`eslint.config.mjs` per package)
- **Mocha + @vscode/test-electron** for vscode-extension tests
- **node:test** (built-in) for model-metadata tests

## Build & Run Commands

### Root-level (all packages)

```bash
pnpm run build          # Build all packages
pnpm run lint           # Lint all packages
pnpm run test           # Test all packages
pnpm run clean          # Clean all packages
```

### vscode-extension

```bash
pnpm --filter oai2lmapi run compile        # Full build (esbuild + type check)
pnpm --filter oai2lmapi run compile:tests  # Compile test files (tsc)
pnpm --filter oai2lmapi run check-types    # Type check only (tsc --noEmit)
pnpm --filter oai2lmapi run lint           # ESLint src/
pnpm --filter oai2lmapi run test           # Run Mocha tests (auto-runs pretest)
pnpm --filter oai2lmapi run package        # vsce package --no-dependencies
pnpm --filter oai2lmapi run watch          # Watch mode (esbuild + tsc parallel)
```

### opencode-provider

```bash
pnpm --filter @oai2lmapi/opencode-provider run build        # esbuild + tsc declarations
pnpm --filter @oai2lmapi/opencode-provider run check-types  # tsc --noEmit
pnpm --filter @oai2lmapi/opencode-provider run lint         # ESLint src/
```

### model-metadata

```bash
pnpm --filter @oai2lmapi/model-metadata run build  # Dual CJS+ESM build
pnpm --filter @oai2lmapi/model-metadata run test   # node --test (builds first)
pnpm --filter @oai2lmapi/model-metadata run lint   # ESLint src/
```

### Running a Single Test

**vscode-extension** (Mocha): Tests run inside an Electron host. You cannot easily filter
individual tests from the CLI — the test runner is `out/test/runTest.js`. To run specific
tests, use Mocha's `--grep` by editing `src/test/suite/index.ts` or using `.only`:

```typescript
// Add .only to isolate a test
test.only('should resolve model metadata', async () => { ... });
```

Then: `pnpm --filter oai2lmapi run test`

**model-metadata** (node:test): Use `--test-name-pattern`:

```bash
node --test --test-name-pattern="pattern" packages/model-metadata/test/
```

### Validation Checklist (run before any PR)

```bash
pnpm run lint && pnpm run build && pnpm run test
```

On Linux, wrap test with: `xvfb-run -a pnpm run test`

## Code Style

### Naming Conventions (enforced by ESLint)

| Element            | Convention    | Example                          |
|--------------------|---------------|----------------------------------|
| Variables/functions | camelCase     | `getModelMetadata`, `apiKey`     |
| Constants          | UPPER_CASE    | `DEFAULT_MODEL_METADATA`         |
| Types/interfaces   | PascalCase    | `ModelOverrideConfig`, `LogLevel`|
| Unused params      | `_` prefix    | `_unused`                        |
| Object literal keys| any (for APIs)| `max_tokens`, `content_type`     |

### TypeScript Rules

- **Strict mode** is on in all packages — do not weaken (`noImplicitAny`, `strictNullChecks`, etc.)
- Never use `as any`, `@ts-ignore`, or `@ts-expect-error`
- Use `interface` for object shapes; `type` for unions/aliases (`type LogLevel = 'info' | 'warn'`)
- Prefer `export interface` / `export type` — avoid `export default`
- Use `unknown` over `any` for error catching: `catch (e: unknown)`

### Imports

- Use **named imports**: `import { foo } from './bar';`
- Use `node:` protocol for Node builtins: `import { readFileSync } from 'node:fs';`
- Group logically: external libs → workspace packages → relative imports
- vscode-extension uses CommonJS module resolution; opencode-provider uses ESM (bundler resolution)

### Formatting

- **Semicolons**: required (ESLint `semi` rule)
- **Curly braces**: always required for blocks (ESLint `curly` rule)
- **Strict equality**: `===` / `!==` only (ESLint `eqeqeq` rule)
- **No throw literals**: always throw `Error` objects, not strings/numbers

### Error Handling

- Use `try/catch` with `instanceof` checks for typed error handling
- Handle `unknown` error type safely: check `instanceof Error`, then `Record<string, unknown>`, then `String()` fallback
- Use `console.warn` for non-fatal issues, return `undefined` for missing optional data
- Never leave empty catch blocks

### Patterns Used

- **Singleton**: class + exported const instance (`export const logger = new Logger()`)
- **Disposable**: VSCode subscriptions pushed to `context.subscriptions` in `activate()`
- **Factory functions**: small helpers like `md()` for building typed objects
- **JSDoc**: all public functions and interface fields should have JSDoc comments with `@param`/`@returns`
- **Pure functions**: prefer stateless module-scoped helpers over class methods

### Testing Patterns

**vscode-extension (Mocha BDD)**:
```typescript
import * as assert from 'assert';
suite('FeatureName', () => {
  test('should do something', async () => {
    assert.strictEqual(actual, expected);
  });
});
```

**model-metadata (node:test)**:
```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
describe('feature', () => {
  it('should work', () => {
    assert.deepStrictEqual(actual, expected);
  });
});
```

## Secrets & Configuration

- **API keys**: stored via `context.secrets` (VSCode SecretStorage). Never hardcode.
- **Settings**: accessed via `vscode.workspace.getConfiguration('oai2lmapi')`
- **Environment variables**: accessed via `process.env['KEY']` (bracket notation)

## Additional Context

- Copilot agent instructions for model metadata updates: `.github/agents/update-model-metadata.agent.md`
- Full contributor guidelines: `.github/copilot-instructions.md`
- Model metadata is sourced from `models.dev/api.json` — see the agent doc for update procedures