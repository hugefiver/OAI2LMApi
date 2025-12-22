# Copilot Instructions for OAI2LMApi

## Project Overview

**OAI2LMApi** is a VSCode extension that bridges OpenAI-compatible APIs to VSCode's Language Model API, enabling integration with GitHub Copilot Chat and other AI-powered features. This is a TypeScript-based VSCode extension (~2,300 lines of code) that uses esbuild for bundling.

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
├── .github/workflows/      # CI/CD pipelines
│   ├── lint-test.yml       # Linting and testing workflow
│   ├── build-test-package.yml  # Build and package workflow
│   └── release.yml         # Release to marketplace workflow
├── .vscode/                # VSCode workspace settings
│   ├── launch.json         # Debug configurations
│   ├── tasks.json          # Build tasks
│   └── extensions.json     # Recommended extensions
├── src/                    # Source code
│   ├── extension.ts        # Main extension entry point
│   ├── languageModelProvider.ts  # VSCode LM API provider implementation
│   ├── openaiClient.ts     # OpenAI API client wrapper
│   ├── modelMetadata.ts    # Model metadata and capabilities
│   ├── constants.ts        # Shared constants
│   └── test/               # Test suite
│       ├── runTest.ts      # Test runner entry point
│       └── suite/          # Test suites
├── out/                    # Build output (generated, gitignored)
├── package.json            # Project manifest and scripts
├── tsconfig.json           # TypeScript configuration
├── eslint.config.mjs       # ESLint configuration
├── esbuild.js              # Custom esbuild bundler
└── .mocharc.json           # Mocha test configuration
```

### Key Files
- **entry point**: `src/extension.ts` - exports `activate()` and `deactivate()`
- **package.json**: defines VSCode extension metadata, commands, and configuration
- **esbuild.js**: bundles extension into single `out/extension.js` file
- **tsconfig.json**: TypeScript compiler settings (ES2020 target, strict mode)

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
- `src/openaiClient.ts:195`: Chain-of-thought (reasoning_content) transmission not implemented

## Validation Checklist

Before submitting a PR, ensure:
1. ✅ `pnpm run check-types` passes (no TypeScript errors)
2. ✅ `pnpm run lint` passes (no ESLint errors)
3. ✅ `pnpm run compile` succeeds
4. ✅ `pnpm run compile:tests` succeeds
5. ✅ `xvfb-run -a pnpm test` passes (on Linux) or `pnpm test` (on macOS/Windows)
6. ✅ `pnpm run package` creates VSIX successfully
7. ✅ Manual test: Install VSIX in VSCode and verify functionality

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
