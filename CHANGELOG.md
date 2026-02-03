# Changelog

All notable changes to the OAI2LMApi monorepo will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.0] - 2026-02-03

### Added
- Claude channel support in the VSCode extension with API key management and model discovery
- Channel-specific model override configuration (`channelModelOverrides`) merged after global overrides
- Enhanced wildcard support for model override patterns (`?` matches single characters)

### Changed
- OpenAI provider now applies model overrides to model metadata and capability flags

## [0.2.6] - 2025-01-17

### VSCode Extension
See [packages/vscode-extension/CHANGELOG.md](./packages/vscode-extension/CHANGELOG.md) for previous versions.
