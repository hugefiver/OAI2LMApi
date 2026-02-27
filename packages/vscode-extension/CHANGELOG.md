# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Corrected models.dev provider names in `FAMILY_PROVIDER_ENTRIES` to match actual API provider IDs:
  - Gemini/Gemma: `google-ai-studio` → `google`
  - Qwen/QwQ/QvQ: removed non-existent `qwen` provider, using `alibaba` only
  - Kimi: `moonshot` → `moonshotai`
  - Llama: `meta`/`together` → `llama`/`togetherai`
  - GLM: `zhipu`/`z-ai` → `zhipuai`/`zai`
  - Phi: `microsoft`/`azure` → `nvidia`
  - Seed: `bytedance`/`bytedance-seed` → `openrouter`
  - Removed non-existent `baidu` (Ernie) and `tencent` (Hunyuan) providers
  - Added `minimax`, `stepfun` (Step), `xiaomi` (MiMo), `nemotron` (NVIDIA) entries

### Changed

- Simplified models.dev resolve logging: each model match now prints only the match path and final metadata instead of verbose attempt traces.

## [0.3.1] - 2026-02-06

### Added

- OpenAI Responses API streaming support for the OpenAI channel, including text, reasoning parts, and tool calls.
- Configurable OpenAI Responses API mode (`oai2lmapi.openaiResponsesApiMode`) with per-model/channel override (`useResponsesApi`).

### Changed

- Comprehensive model metadata update from official provider data (models.dev):
  - **OpenAI**: Added GPT-5.3 Codex; corrected GPT-5-pro output (272K), GPT-5-chat (no tool calling, 400K context), GPT-4 output (8192); added codex-mini (200K/100K, no vision).
  - **Anthropic**: Added Claude Opus 4.6 (1M context/128K output); corrected Opus 4.5 output to 64K, Sonnet 4.5 context to 200K, Claude 3.7 Sonnet output to 64K.
  - **Google**: Added Gemini 3 Pro (1M/64K); corrected Gemini 2.5 Flash/Lite output to 65536.
  - **Alibaba/Qwen**: Full Qwen3 rewrite with coder-plus (1M), coder-480b, coder-flash (1M), coder-30b, VL variants; added Qwen generic family (plus/turbo/flash/vl-max/vl-plus); expanded Qwen2.5 with size variants; corrected QvQ tool calling.
  - **DeepSeek**: Added DeepSeek V3.2 variants (speciale, exp), V3.1 (terminus, nex-n1), R1-0528 variants; corrected context/output limits from OpenRouter data.
  - **Mistral**: Expanded pattern to include magistral/ministral/devstral; added devstral-medium, devstral-2, mistral-medium, magistral-medium/small, ministral; corrected mistral-large to 262K/262K with vision.
  - **xAI**: Added Grok 4.1 Fast (2M context), Grok 4 Fast, Grok Code Fast; corrected Grok 3/3-mini/3-fast output to 8K; corrected Grok 4 (256K/64K, no vision).
  - **Moonshot/Kimi**: Added k2-thinking-turbo, k2-thinking, k2-turbo variants.
  - **Amazon Nova**: Corrected Nova lite/micro/pro output to 8192; added Nova 2 Lite (128K/4K).
  - **Cohere**: Added Command A (256K/8K), Command A Reasoning (256K/32K), Command R7B.
  - **ZhipuAI/GLM**: Corrected GLM-4.6 output to 131K, GLM-4.6v context to 128K, GLM-4.5 output to 98K; added GLM-4.5 Air/Flash variants.
  - **MiniMax**: Expanded to sub-patterns: M2.1 (204K/131K), M2 (196K/128K), M1 (1M/40K), 01 (1M/1M).
  - **ByteDance Seed**: Added Seed 1.8 (256K/64K with vision); corrected Seed 1.6 to 256K/32K without vision.
  - **Xiaomi MiMo**: Corrected to 256K/32K from official Xiaomi data.
  - **Provider prefixes**: Added meta/, mistral/, xai/, zai/, zai-org/, moonshot/, stepfun/, bytedance-seed/, kuaishou/, volcengine/, inclusionai/, vercel/ to `normalizeModelId()`.

## [0.3.0] - 2026-02-03

### Added

- Claude channel support in the VSCode extension with API key management and model discovery
- Channel-specific model override configuration (`channelModelOverrides`) merged after global overrides
- Enhanced wildcard support for model override patterns (`?` matches single characters)

### Changed

- Apply model overrides to OpenAI model metadata and capability flags
- Use shared model metadata from `@oai2lmapi/model-metadata` to keep capability data aligned

## [0.2.6] - 2025-12-30

### Added

- Add `oai2lmapi.suppressChainOfThought` option to strip leading `<think>...</think>` blocks and avoid forwarding `reasoning_content`/`reasoning`/`thinking` fields, with per-model overrides.
- Add automated model metadata update agent docs and provider-priority guidance for maintainers.

### Changed

- Expand firewall allowlist for model metadata sources used by maintenance workflows.
- Update README with VS Code Marketplace installation instructions.

## [0.2.5] - 2025-12-29

### Added

- XML entity unescaping support with comprehensive tests
- Advanced thinking tag support in ThinkTagStreamParser (nested tags, attributes, variations)

### Changed

- Improved pre-release version calculation in CI workflow

## [0.2.4] - 2025-12-29

### Added

- Optional `callId` parameter support for XML tool calls

### Changed

- Updated tool result format to XML structure for better compatibility

## [0.2.3] - 2025-12-29

### Added

- Centralized logging system with Output Channel for users and debug console for developers (#27)
- XML-based tool calling support for Gemini channel (#26)
- Gemini channel toggle configuration

### Changed

- Updated tool use guidelines from `<thinking>` to reasoning chains
- Refactored logging infrastructure for better debugging experience

### Fixed

- Fixed missing `tool_use.id` when using OpenAI-compatible APIs with Claude models (#24, #25)
- Fixed Gemini API error by stripping `$schema` field from tool parameters (#22)
- Fixed Gemini API responses with null/missing model fields (#20)
- Fixed GeminiProvider null reference error when loading models (#19)
- Fixed Gemini vendor registration conflict (#18)

## [0.2.2] - 2025-12-25

### Added

- Streaming-safe `<think>...</think>` parser to route embedded reasoning content to thinking parts when supported.
- `maxTokens` support for streaming chat completions (mapped to OpenAI `max_tokens`).

### Changed

- Improved streaming compatibility with gateways that emit fields on `choices[0].message` instead of `delta`.
- Refined tool call aggregation during streaming and reporting at completion.

### Fixed

- Fall back to a single non-streaming request when a streaming response unexpectedly returns no content.

## [0.2.1] - 2025-12-25

### Fixed

- Bump version to fix marketplace versioning issue

## [0.1.4] - 2025-12-25

### Added

- Support for thinking/reasoning content in chat responses
- Streaming support for reasoning content from OpenAI-compatible APIs
- Integration with VSCode's Language Model API for reasoning/thinking parts

### Changed

- Updated README documentation with Model Caching and Tool Calling features

## [0.1.3] - 2025-12-23

### Changed

- Refactored tool call handling to use batch completion instead of incremental reporting
- Improved tool call reliability by collecting all tool calls during streaming and reporting them together at the end

### Fixed

- Prevented duplicate tool call reporting in streaming responses
- Added tracking mechanisms to ensure each tool call is only processed once

## [0.1.2] - 2025-12-23

### Added

- Model caching functionality to store loaded models in VSCode's GlobalState
- Automatic loading of cached models on startup when auto-load is disabled
- Comprehensive `.github/copilot-instructions.md` documentation for AI agents and developers
- Prerelease workflow for automatic publishing from main branch to VS Code Marketplace preview channel
- CI/CD optimizations with pnpm caching for faster builds

### Changed

- Refactored model filtering logic into dedicated `updateModelList` method
- Improved model loading performance with caching support
- Enhanced release workflow with proper cleanup of existing releases and tags

### Fixed

- Prerelease versioning strategy to ensure unique version numbers with timestamp suffixes
- Prerelease workflow to properly delete and recreate releases and tags
- Added `--pre-release` flag when packaging for VS Code Marketplace preview channel

## [0.1.1] - 2025-12-22

### Added

- Initial release
- Full OpenAI API compatibility with any OpenAI-compatible endpoint
- VSCode Language Model API integration for use with GitHub Copilot Chat and other AI extensions
- Streaming response support for real-time token output
- Automatic model loading from API endpoint on startup
- Secure API key storage using VSCode's SecretStorage
- Commands for managing the extension:
  - `OAI2LMApi: Set API Key` - Securely store API key
  - `OAI2LMApi: Clear API Key` - Remove stored API key
  - `OAI2LMApi: Refresh Models` - Manually reload available models
  - `OAI2LMApi: Manage Provider Settings` - Open extension settings
- Configurable settings:
  - API endpoint URL
  - Auto-load models on startup
  - Filter models by tool calling support
- Support for multiple OpenAI-compatible backends:
  - OpenAI API
  - Azure OpenAI
  - LocalAI
  - Ollama (with OpenAI compatibility layer)
  - LM Studio
  - Text Generation WebUI
  - Any custom OpenAI-compatible implementation
