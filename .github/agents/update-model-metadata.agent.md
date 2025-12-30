# Copilot Agent: Update Model Metadata

## Overview

This agent is designed to update the `src/modelMetadata.ts` file with the latest model information from external data sources. The goal is to keep the model registry up-to-date with accurate capabilities for various LLM providers.

## Data Sources

This agent uses a tiered data source strategy with the following priority:

| Priority | Source | URL | Description |
| -------- | ------ | --- | ----------- |
| 1 (Highest) | Official Provider in models.dev | `https://models.dev/api.json` | Official data from providers like `openai`, `anthropic`, `qwen`, etc. |
| 2 | OpenRouter in models.dev | `https://models.dev/api.json` | OpenRouter aggregated data within models.dev |
| 3 (Fallback) | OpenRouter API | `https://openrouter.ai/api/v1/models` | Direct OpenRouter API as final fallback |

## Workflow

### Step 1: Fetch Model Data

#### Primary Source: models.dev

Fetch the JSON data from `https://models.dev/api.json`. This file contains model information in the following structure:

```json
{
  "providers": {
    "<provider_id>": {
      "name": "<Provider Name>",
      "models": {
        "<model_id>": {
          "name": "<Model Display Name>",
          "context_length": <number>,
          "max_output_tokens": <number>,
          "supports_tools": <boolean>,
          "supports_vision": <boolean>,
          ...
        }
      }
    }
  }
}
```

#### Fallback Source: OpenRouter API

If a model is not found in models.dev, fetch from `https://openrouter.ai/api/v1/models`. This API returns:

```json
{
  "data": [
    {
      "id": "<provider>/<model-id>",
      "name": "<Model Display Name>",
      "context_length": <number>,
      "top_provider": {
        "max_completion_tokens": <number>
      },
      "architecture": {
        "modality": "text->text" | "text+image->text" | ...,
        "input_modalities": ["text", "image", ...],
        "output_modalities": ["text", ...]
      },
      "supported_parameters": ["tools", "temperature", ...]
    }
  ]
}
```

**Mapping OpenRouter fields to ModelMetadata:**
- `context_length` → `maxInputTokens`
- `top_provider.max_completion_tokens` → `maxOutputTokens`
- `"tools" in supported_parameters` → `supportsToolCalling`
- `"image" in architecture.input_modalities` or `modality` contains `image` → `supportsImageInput`

### Step 2: Provider Priority Rules

When the same model is available from multiple providers, **prioritize official provider data**:

| Model Family | Preferred Provider ID | Fallback 1 (models.dev) | Fallback 2 (API) |
| ------------- | ---------------------- | ----------------------- | ---------------- |
| GPT / o1 / o3 / o4 / Codex | `openai` | `openrouter` in models.dev | openrouter.ai API |
| Claude | `anthropic` | `openrouter` in models.dev | openrouter.ai API |
| Gemini / Gemma | `google-vertex` or `google-ai-studio` | `openrouter` in models.dev | openrouter.ai API |
| Qwen / Qwen3 | `qwen` or `alibaba` | `openrouter` in models.dev | openrouter.ai API |
| Kimi | `moonshot` | `openrouter` in models.dev | openrouter.ai API |
| DeepSeek | `deepseek` | `openrouter` in models.dev | openrouter.ai API |
| Llama | `meta` or `together` | `openrouter` in models.dev | openrouter.ai API |
| Mistral / Codestral / Pixtral | `mistral` | `openrouter` in models.dev | openrouter.ai API |
| Grok | `xai` | `openrouter` in models.dev | openrouter.ai API |
| Nova | `amazon-bedrock` | `openrouter` in models.dev | openrouter.ai API |
| Command | `cohere` | `openrouter` in models.dev | openrouter.ai API |
| GLM | `zhipu` or `z-ai` | `openrouter` in models.dev | openrouter.ai API |
| Ernie | `baidu` | `openrouter` in models.dev | openrouter.ai API |
| Hunyuan | `tencent` | `openrouter` in models.dev | openrouter.ai API |
| Phi | `microsoft` or `azure` | `openrouter` in models.dev | openrouter.ai API |
| Others | Provider-specific | `openrouter` in models.dev | openrouter.ai API |

### Step 3: Model Selection Criteria

Only select **high-capability models** based on these criteria:

1. **Tool Calling Support** (Priority: HIGH)
   - Models with `supports_tools: true` should be prioritized
   - These are most useful for agentic workflows

2. **Recency** (Priority: HIGH)
   - Prefer models released in 2025 or later
   - Look for version indicators: 4.x, 3.x, latest, 2025/2026 dates

3. **Context Window** (Priority: MEDIUM)
   - Prefer models with larger context windows (≥32K tokens)
   - Models with 100K+ context are especially valuable

4. **Vision/Image Input** (Priority: MEDIUM)
   - Note multimodal capabilities when available

5. **Exclude**:
   - Embedding models (unless updating embedding section)
   - Image generation models
   - Audio/Speech models
   - Moderation/Guard models (unless specialized)
   - Very old models (e.g., GPT-3, Claude 1.x)
   - Models without tool calling unless they have other strong capabilities

### Step 4: Pattern Optimization

**Goal**: Use the minimum number of patterns while maintaining accuracy.

#### Rules for Pattern Consolidation

1. **Same Family, Same Parameters**: If multiple models in a family have identical parameters, use one pattern:

   ```typescript
   // BAD: Separate patterns for identical params
   { pattern: /gpt-4o-2024-05-13/i, metadata: md(128000, 16384, true, true) },
   { pattern: /gpt-4o-2024-08-06/i, metadata: md(128000, 16384, true, true) },
   
   // GOOD: Single family pattern
   { pattern: /gpt-4o/i, metadata: md(128000, 16384, true, true) },
   ```

2. **Different Parameters**: Only create sub-patterns when capabilities differ:

   ```typescript
   {
       pattern: /gpt-4o/i,
       metadata: md(128000, 16384, true, true),  // Default for family
       subPatterns: [
           { pattern: /gpt-4o-mini/i, metadata: md(128000, 16384, true, true) },  // Different output limit
       ]
   }
   ```

3. **Regex Efficiency**: Use regex alternation for related patterns:

   ```typescript
   // GOOD: Combined pattern
   { pattern: /(doubao-)?seed/i, metadata: md(262144, 32768, true, true) }
   
   // GOOD: Size variants
   { pattern: /qwen3-coder-(480b|plus)/i, metadata: md(262144, 262144, true, true) }
   ```

4. **Pattern Specificity**: More specific patterns MUST come before general ones:

   ```typescript
   subPatterns: [
       { pattern: /gpt-4-turbo-preview/i, ... },  // Most specific first
       { pattern: /gpt-4-turbo/i, ... },          // Then general
   ]
   ```

### Step 5: Code Modification Rules

**CRITICAL**: Only make these types of changes:

#### ALLOWED Changes

1. **Add new model families** not currently in the registry
2. **Add new sub-patterns** for new model variants within existing families
3. **Correct errors** in existing metadata (wrong token counts, incorrect capability flags)
4. **Update values** when official sources show different values

#### FORBIDDEN Changes

1. Do NOT remove any existing patterns unless they are demonstrably incorrect
2. Do NOT modify the code structure (interfaces, functions, exports)
3. Do NOT change pattern names arbitrarily
4. Do NOT add models without tool calling unless they have exceptional other capabilities
5. Do NOT add deprecated or discontinued models

### Step 6: Metadata Format

Use the helper function `md()` for concise metadata:

```typescript
// Helper function signature:
const md = (
    maxInputTokens: number,
    maxOutputTokens: number,
    supportsToolCalling: boolean,
    supportsImageInput: boolean,
    modelType: 'llm' | 'embedding' | 'rerank' | 'image' | 'audio' | 'other' = 'llm'
): ModelMetadata
```

Example usages:

```typescript
// Standard LLM with tools and vision
md(128000, 16384, true, true)

// LLM with tools only (no vision)
md(128000, 16384, true, false)

// Full object form (for complex cases or clarity)
{ maxInputTokens: 200000, maxOutputTokens: 64000, supportsToolCalling: true, supportsImageInput: true, modelType: 'llm' }
```

### Step 7: Validation Checklist

Before finalizing changes, verify:

- [ ] All added patterns are case-insensitive (`/i` flag)
- [ ] Sub-patterns are ordered from most specific to least specific
- [ ] Token counts match official documentation
- [ ] Tool calling flag is accurate (verify with official API docs)
- [ ] Vision/image support flag is accurate
- [ ] No duplicate patterns exist
- [ ] Patterns don't accidentally match unintended models
- [ ] Use negative lookahead `(?![.\d])` when needed to prevent partial matches

## Example Update

### Adding a New Model Family

```typescript
// ============== New Provider Family ==============
{
    pattern: /newmodel/i,
    metadata: md(128000, 8192, true, false),
    subPatterns: [
        { pattern: /newmodel-large/i, metadata: md(128000, 16384, true, true) },
        { pattern: /newmodel-small/i, metadata: md(32768, 4096, true, false) }
    ]
}
```

### Updating an Existing Family

```typescript
// Find the existing family pattern and add new sub-patterns:
{
    pattern: /existingfamily/i,
    metadata: md(128000, 8192, true, false),
    subPatterns: [
        // NEW: Add this pattern for new variant
        { pattern: /existingfamily-newvariant/i, metadata: md(256000, 32768, true, true) },
        // Existing patterns remain unchanged
        { pattern: /existingfamily-oldvariant/i, metadata: md(128000, 8192, true, false) }
    ]
}
```

## Output Format

When reporting changes, provide:

1. **Summary**: List of model families added/updated
2. **Changes**: Specific patterns added with their metadata
3. **Data Sources**: Which provider's data was used for each model
4. **Verification Notes**: Any uncertainties or conflicts found in data sources

## Common Provider Mappings in models.dev

| Provider ID in API | Display Name |
| ------------------- | -------------- |
| `openai` | OpenAI |
| `anthropic` | Anthropic |
| `google-vertex` | Google Vertex AI |
| `google-ai-studio` | Google AI Studio |
| `qwen` | Qwen (Alibaba) |
| `deepseek` | DeepSeek |
| `moonshot` | Moonshot/Kimi |
| `mistral` | Mistral AI |
| `xai` | xAI |
| `cohere` | Cohere |
| `amazon-bedrock` | Amazon Bedrock |
| `zhipu` | Zhipu AI (GLM) |
| `openrouter` | OpenRouter (Aggregator) |
