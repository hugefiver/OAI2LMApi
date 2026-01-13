/**
 * Model metadata registry for fallback when API doesn't provide complete info
 */

import { ModelMetadata } from './types.js';

export const DEFAULT_MODEL_METADATA: ModelMetadata = {
  maxInputTokens: 8192,
  maxOutputTokens: 4096,
  supportsToolCalling: false,
  supportsImageInput: false,
};

interface ModelPattern {
  pattern: RegExp | string;
  metadata: ModelMetadata;
  subPatterns?: ModelPattern[];
}

const md = (
  maxInputTokens: number,
  maxOutputTokens: number,
  supportsToolCalling: boolean,
  supportsImageInput: boolean
): ModelMetadata => ({
  maxInputTokens,
  maxOutputTokens,
  supportsToolCalling,
  supportsImageInput,
});

/**
 * Hierarchical model patterns for capability detection
 * Based on known model families and their characteristics
 */
const MODEL_PATTERNS: ModelPattern[] = [
  // OpenAI GPT-5
  {
    pattern: /gpt-5/i,
    metadata: md(400000, 128000, true, true),
    subPatterns: [
      { pattern: /gpt-5-nano/i, metadata: md(262144, 65536, true, false) },
      { pattern: /gpt-5-mini/i, metadata: md(262144, 65536, true, true) },
      { pattern: /gpt-5-pro/i, metadata: md(400000, 128000, true, true) },
    ],
  },
  // OpenAI GPT-4
  {
    pattern: /gpt-4/i,
    metadata: md(128000, 16384, true, true),
    subPatterns: [
      { pattern: /gpt-4o/i, metadata: md(128000, 16384, true, true) },
      { pattern: /gpt-4-turbo/i, metadata: md(128000, 4096, true, true) },
      { pattern: /gpt-4-vision/i, metadata: md(128000, 4096, true, true) },
    ],
  },
  // OpenAI o-series (reasoning models)
  {
    pattern: /^o[1-4]/i,
    metadata: md(200000, 100000, true, false),
    subPatterns: [
      { pattern: /o3-mini/i, metadata: md(200000, 100000, true, false) },
      { pattern: /o1/i, metadata: md(200000, 100000, true, false) },
    ],
  },
  // Claude
  {
    pattern: /claude/i,
    metadata: md(200000, 8192, true, true),
    subPatterns: [
      { pattern: /claude-3\.7-sonnet/i, metadata: md(200000, 64000, true, true) },
      { pattern: /claude-3\.5-sonnet/i, metadata: md(200000, 8192, true, true) },
      { pattern: /claude-3-opus/i, metadata: md(200000, 4096, true, true) },
    ],
  },
  // Gemini
  {
    pattern: /gemini/i,
    metadata: md(1000000, 8192, true, true),
    subPatterns: [
      { pattern: /gemini-2\.0-flash-thinking/i, metadata: md(1000000, 65536, true, true) },
      { pattern: /gemini-2\.0-flash/i, metadata: md(1000000, 8192, true, true) },
      { pattern: /gemini-exp/i, metadata: md(2097152, 8192, true, true) },
    ],
  },
  // DeepSeek
  {
    pattern: /deepseek/i,
    metadata: md(64000, 8192, false, false),
    subPatterns: [
      { pattern: /deepseek-v3/i, metadata: md(64000, 8192, false, false) },
      { pattern: /deepseek-r1/i, metadata: md(64000, 8192, false, false) },
    ],
  },
  // Qwen
  {
    pattern: /qwen/i,
    metadata: md(128000, 8192, true, true),
    subPatterns: [
      { pattern: /qwq/i, metadata: md(32768, 32768, false, false) },
      { pattern: /qwen-3/i, metadata: md(1000000, 131072, true, true) },
      { pattern: /qwen-2\.5/i, metadata: md(128000, 8192, true, true) },
    ],
  },
  // Llama
  {
    pattern: /llama/i,
    metadata: md(128000, 8192, true, false),
    subPatterns: [
      { pattern: /llama-3\.3/i, metadata: md(128000, 8192, true, false) },
      { pattern: /llama-3\.2-vision/i, metadata: md(128000, 8192, true, true) },
    ],
  },
  // GLM (Zhipu)
  {
    pattern: /glm/i,
    metadata: md(128000, 8192, true, true),
  },
];

/**
 * Get metadata for a model by matching against known patterns
 */
export function getModelMetadataFromPatterns(modelId: string): ModelMetadata {
  for (const family of MODEL_PATTERNS) {
    if (matchesPattern(modelId, family.pattern)) {
      // Check sub-patterns first (more specific)
      if (family.subPatterns) {
        for (const sub of family.subPatterns) {
          if (matchesPattern(modelId, sub.pattern)) {
            return sub.metadata;
          }
        }
      }
      return family.metadata;
    }
  }
  return DEFAULT_MODEL_METADATA;
}

function matchesPattern(modelId: string, pattern: RegExp | string): boolean {
  if (typeof pattern === 'string') {
    return modelId.toLowerCase().includes(pattern.toLowerCase());
  }
  return pattern.test(modelId);
}

/**
 * Merge API metadata with pattern-based metadata
 */
export function mergeMetadata(
  apiMetadata: Partial<ModelMetadata> | undefined,
  patternMetadata: ModelMetadata
): ModelMetadata {
  return {
    maxInputTokens: apiMetadata?.maxInputTokens ?? patternMetadata.maxInputTokens,
    maxOutputTokens: apiMetadata?.maxOutputTokens ?? patternMetadata.maxOutputTokens,
    supportsToolCalling: apiMetadata?.supportsToolCalling ?? patternMetadata.supportsToolCalling,
    supportsImageInput: apiMetadata?.supportsImageInput ?? patternMetadata.supportsImageInput,
  };
}
