# Copilot Instructions for OAI2LMApi

## Project Overview

**OAI2LMApi** is a monorepo that includes a VSCode extension, an OpenCode provider, and a shared model metadata package. The VSCode extension bridges OpenAI-compatible APIs to VSCode's Language Model API for GitHub Copilot Chat and other AI-powered features.

### Technology Stack
- **Language**: TypeScript 5.9.3
- **Target Runtime**: Node.js 18+ (VSCode engine 1.107.0+)
- **Package Manager**: pnpm 10.x (REQUIRED - do not use npm or yarn)
- **Build Tool**: esbuild (via custom esbuild.js script)
- **Testing**: Mocha with @vscode/test-electron
- **Linting**: ESLint 9.x with TypeScript plugin

## Repository Structure

```
/
├── .github/workflows/          # CI/CD pipelines
│   ├── lint-test.yml           # Linting and testing workflow
│   ├── build-test-package.yml  # Build and package workflow
│   └── release.yml             # Release to marketplace workflow
├── .vscode/                    # VSCode workspace settings
│   ├── launch.json             # Debug configurations
│   ├── tasks.json              # Build tasks
│   └── extensions.json         # Recommended extensions
├── packages/                   # Workspace packages
│   ├── vscode-extension/       # VSCode extension package
│   │   ├── src/                # Extension source code
│   │   ├── out/                # Build output (generated, gitignored)
│   │   ├── esbuild.js          # Custom esbuild bundler
│   │   └── package.json        # Extension manifest and scripts
│   ├── opencode-provider/      # OpenCode provider package
│   │   ├── src/                # Provider source code
│   │   └── package.json        # Provider manifest and scripts
│   └── model-metadata/         # Shared model metadata package
│       ├── src/index.ts        # Shared model metadata registry
│       └── package.json        # Shared metadata manifest and scripts
├── package.json                # Root workspace scripts
├── pnpm-workspace.yaml         # Workspace configuration
└── README.workspace.md         # Monorepo overview
```

### Key Files
- **entry point**: `packages/vscode-extension/src/extension.ts` - exports `activate()` and `deactivate()`
- **extension manifest**: `packages/vscode-extension/package.json` - VSCode extension metadata, commands, and configuration
- **shared metadata**: `packages/model-metadata/src/index.ts` - model metadata registry used by all packages
- **esbuild.js**: `packages/vscode-extension/esbuild.js` bundles extension into `packages/vscode-extension/out/extension.js`
- **tsconfig.json**: `packages/vscode-extension/tsconfig.json` TypeScript compiler settings for the extension

## Build & Development Workflow

### Prerequisites
**CRITICAL**: This project REQUIRES pnpm. Install it globally before starting:
```bash
npm install -g pnpm@10
```

### Initial Setup
1. **Install dependencies** (ALWAYS use frozen lockfile in CI/scripts):
   ```bash
   pnpm install --frozen-lockfile
   ```
   - Time: ~5-10 seconds (with cache)
   - Creates `node_modules/` with 545 packages
   - You may see warnings about ignored build scripts (safe to ignore)

> **Monorepo note**: VSCode extension commands (`check-types`, `lint`, `compile`, `test`, `package`) are run from `packages/vscode-extension` (or via `pnpm --filter @oai2lmapi/vscode-extension`).

### Build Commands

#### Type Checking
```bash
pnpm run check-types
```
- Runs TypeScript compiler with `--noEmit` flag (no output, just validation)
- Time: ~2-3 seconds
- ALWAYS run this before committing code changes

#### Linting
```bash
pnpm run lint
```
- Runs ESLint on `src/**/*.ts`
- Time: ~1-2 seconds
- Must pass with zero errors before committing
- Key rules enforced:
  - TypeScript naming conventions (camelCase for variables, PascalCase for types)
  - Semicolons required
  - Curly braces for control statements
  - Strict equality (===)

#### Compile Extension
```bash
pnpm run compile
```
- Runs `check-types` then bundles with esbuild
- Output: `out/extension.js` (with source map)
- Time: ~2-3 seconds
- This is the primary build command for development
- **NOTE**: The compile step runs type checking first automatically

#### Compile Tests
```bash
pnpm run compile:tests
```
- Compiles TypeScript to JavaScript using tsc (not esbuild)
- Output: `out/**/*.js` including test files
- Time: ~2-3 seconds
- Required before running tests

#### Production Build
```bash
pnpm run vscode:prepublish
```
- Runs `check-types` + esbuild with `--production` flag
- Minified output, no source maps
- Removes console.log and debugger statements
- Automatically run by `pnpm run package`

### Testing

**IMPORTANT**: Tests require a display server (xvfb) because they launch VSCode.

#### Run All Tests
```bash
xvfb-run -a pnpm test
```
- On Linux CI: MUST use `xvfb-run -a` prefix
- On macOS/Windows: Can run `pnpm test` directly
- Runs pretest (compile:tests + lint) automatically
- Downloads VSCode 1.107.0 on first run (cached afterward)
- Time: ~20-30 seconds first run, ~10-15 seconds cached

#### Pretest
```bash
pnpm run pretest
```
- Runs `compile:tests` then `lint`
- Automatically executed before `pnpm test`

### Packaging

```bash
pnpm run package
```
- Creates `.vsix` file for distribution: `oai2lmapi-{version}.vsix`
- Runs `vscode:prepublish` automatically
- Uses `vsce package --no-dependencies` (dependencies bundled by esbuild)
- Output: ~52KB VSIX file
- Time: ~3-4 seconds

### Development Commands

#### Watch Mode
```bash
pnpm run watch
```
- Runs esbuild and tsc in watch mode (parallel)
- Rebuilds on file changes
- Use for active development in VSCode

#### Debug Extension
- Press F5 in VSCode (requires `pnpm run compile` first)
- Uses `.vscode/launch.json` configuration
- Opens Extension Development Host window

## CI/CD Workflows

### lint-test.yml
Runs on all branches and PRs. Steps:
1. Setup Node.js 20 + pnpm 10
2. `pnpm install --frozen-lockfile`
3. `pnpm run lint`
4. `pnpm run compile`
5. `xvfb-run -a pnpm test`

### build-test-package.yml
Runs on all branches and PRs. Steps:
1. Setup Node.js 20 + pnpm 10
2. `pnpm install --frozen-lockfile`
3. `pnpm run compile`
4. `pnpm run package`
5. Upload VSIX artifact

### release.yml
Runs on version tags (v*). Publishes to VS Code Marketplace.

## Common Pitfalls & Solutions

### Issue: "pnpm: command not found"
**Solution**: Install pnpm globally: `npm install -g pnpm@10`

### Issue: Tests fail with "Cannot find module"
**Solution**: Run `pnpm run compile:tests` before `pnpm test`

### Issue: Build warnings about "Ignored build scripts"
**Status**: Safe to ignore. These are from dependencies with postinstall scripts.

### Issue: Type errors during development
**Solution**: Run `pnpm run check-types` to see all type errors. VSCode may not show all errors immediately.

### Issue: Linting failures
**Common causes**:
- Missing semicolons
- Using `==` instead of `===`
- Missing curly braces in if/for statements
- Incorrect naming conventions (use camelCase for variables, PascalCase for types)

**Solution**: Run `pnpm run lint` and fix errors before committing.

### Issue: Package.json scripts fail
**Cause**: Using npm instead of pnpm
**Solution**: Always use pnpm for this project due to workspace configuration in `.npmrc`

## Code Style & Conventions

### TypeScript Guidelines
- **Strict mode enabled**: All strict TypeScript checks active
- **Naming**: camelCase for variables/functions, PascalCase for classes/types/interfaces
- **Imports**: Use named imports from vscode, group imports logically
- **Async/Await**: Prefer async/await over promises

### VSCode Extension Patterns
- Store secrets in `context.secrets` (SecretStorage API)
- Store persistent data in `context.globalState`
- Register all commands in `activate()` function
- Dispose resources in `deactivate()` and via Disposable pattern

### Known TODOs
- `packages/vscode-extension/src/openaiClient.ts:195`: Chain-of-thought (reasoning_content) transmission not implemented

# Model Sync Rule

When adding new models to `packages/model-metadata/src/index.ts`, follow these guidelines:

## Primary Data Source

Fetch model data from `https://models.dev/api.json`. This aggregated source contains information from multiple providers.

## Provider Priority

**Always prefer official provider data over aggregator data:**

| Model Family | Preferred Provider | Fallback |
|-------------|-------------------|----------|
| GPT / o1-o4 / Codex | `openai` | `openrouter` |
| Claude | `anthropic` | `openrouter` |
| Gemini / Gemma | `google-vertex` / `google-ai-studio` | `openrouter` |
| Qwen / Qwen3 | `qwen` / `alibaba` | `openrouter` |
| Kimi | `moonshot` | `openrouter` |
| DeepSeek | `deepseek` | `openrouter` |
| Llama | `meta` / `together` | `openrouter` |
| Mistral | `mistral` | `openrouter` |
| Grok | `xai` | `openrouter` |
| GLM | `zhipu` | `openrouter` |

## Update Process

1. **Fetch data** from `https://models.dev/api.json`
2. **Filter for high-capability models**: Prioritize models with:
   - Tool calling support (`supports_tools: true`)
   - Recent release dates (2024-2025)
   - Large context windows (≥32K tokens)
3. **Update `packages/model-metadata/src/index.ts`**:
   - Add new `ModelFamilyPattern` entries for new model families
   - Update existing patterns if capabilities have changed
   - Ensure `maxInputTokens`, `maxOutputTokens`, `supportsToolCalling`, `supportsImageInput` are accurate
4. **Optimize patterns**: Use minimal patterns - consolidate models with identical parameters
5. **Maintain hierarchy**: Place specific patterns before general ones in `subPatterns`

## Copilot Agent

For automated updates, refer to the detailed agent instructions at:
`.github/agents/update-model-metadata.agent.md`

## Validation Checklist

Before submitting a PR, ensure:
1. ✅ `pnpm run check-types` passes (no TypeScript errors)
2. ✅ `pnpm run lint` passes (no ESLint errors)
3. ✅ `pnpm run compile` succeeds
4. ✅ `pnpm run compile:tests` succeeds
5. ✅ `xvfb-run -a pnpm test` passes (on Linux) or `pnpm test` (on macOS/Windows)
6. ✅ `pnpm run package` creates VSIX successfully
7. ✅ Manual test: Install VSIX in VSCode and verify functionality

## Release Process

To publish a new version (e.g., `0.2.3`):

### 1. Update CHANGELOG.md
- Review git log since last release: `git log --oneline <last-tag>..HEAD`
- Add new version section at the top following [Keep a Changelog](https://keepachangelog.com/) format
- Group changes under: Added, Changed, Fixed, Removed, Deprecated, Security

### 2. Update Version in package.json
- Change `"version"` field to the new version number

### 3. Commit Changes
```bash
git add CHANGELOG.md package.json
git commit -S -m "chore(release): v0.2.3"
```
- Use `-S` flag for GPG-signed commit

### 4. Create Signed Tag
```bash
git tag -s v0.2.3 -m "Release v0.2.3"
```
- Use `-s` flag for GPG-signed tag
- Tag format: `v{major}.{minor}.{patch}`

### 5. Push to Remote
```bash
git push origin main
git push origin v0.2.3
```
- The `release.yml` workflow will automatically publish to VS Code Marketplace when a version tag is pushed

### GPG Signing Requirements
- Ensure GPG key is configured: `git config --global user.signingkey <KEY_ID>`
- For automatic signing: `git config --global commit.gpgsign true`
- Verify signing works: `git log --show-signature -1`

## Quick Reference

### Most Common Commands (in order)
```bash
# First time setup
npm install -g pnpm@10
pnpm install --frozen-lockfile

# Development cycle
pnpm run check-types    # Validate TypeScript
pnpm run lint           # Check code style
pnpm run compile        # Build extension

# Testing
pnpm run compile:tests  # Compile tests
xvfb-run -a pnpm test   # Run tests (Linux)

# Release
pnpm run package        # Create VSIX
```

### File Size Reference
- Source code: ~2,300 lines TypeScript
- Built extension.js: ~310KB (dev), ~135KB (production)
- VSIX package: ~52KB (minified + tree-shaken)

## Trust These Instructions

These instructions have been validated by running all commands successfully. If you encounter issues not documented here:
1. Check that you're using pnpm (not npm/yarn)
2. Verify Node.js version is 20+
3. Ensure `pnpm install --frozen-lockfile` completed successfully
4. Check for typos in command names

Only search the codebase or experiment if the instructions are incomplete or you find an error in the documented steps.
