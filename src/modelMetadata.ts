/**
 * Model metadata registry for LLM models.
 * This file contains pre-fetched model information from OpenRouter API.
 * Used as fallback when /v1/models API doesn't provide complete information.
 * 
 * Key features:
 * - Multi-level pattern matching for model family identification
 * - Regex-based parameter extraction for model variants
 * - Hierarchical matching: family -> subfamily -> variant
 */

export interface ModelMetadata {
    /** Maximum input tokens the model can accept */
    maxInputTokens: number;
    /** Maximum output tokens the model can generate */
    maxOutputTokens: number;
    /** Whether the model supports tool/function calling */
    supportsToolCalling: boolean;
    /** Whether the model supports image/vision input */
    supportsImageInput: boolean;
    /** Model type: 'llm', 'embedding', 'rerank', 'image', 'audio', 'other' */
    modelType: 'llm' | 'embedding' | 'rerank' | 'image' | 'audio' | 'other';
}

/**
 * Default metadata for unknown models.
 * Conservative defaults that assume basic LLM capabilities.
 */
export const DEFAULT_MODEL_METADATA: ModelMetadata = {
    maxInputTokens: 8192,
    maxOutputTokens: 4096,
    supportsToolCalling: false,
    supportsImageInput: false,
    modelType: 'llm'
};

/**
 * Model family pattern definition for hierarchical matching.
 * Patterns are matched in order of specificity (most specific first).
 */
interface ModelFamilyPattern {
    /** Pattern to match the model ID (regex or string prefix) */
    pattern: RegExp | string;
    /** Metadata for models matching this pattern */
    metadata: ModelMetadata;
    /** Optional sub-patterns for more specific matching */
    subPatterns?: ModelFamilyPattern[];
}

/**
 * Hierarchical model family patterns for efficient matching.
 * Order matters: more specific patterns should come first within subPatterns.
 * 
 * Matching algorithm:
 * 1. First, try to match subPatterns (most specific)
 * 2. If no subPattern matches, use the parent pattern's metadata
 * 3. Patterns support regex for flexible matching
 */
const MODEL_FAMILY_PATTERNS: ModelFamilyPattern[] = [
    // ============== OpenAI GPT-5 Family ==============
    {
        pattern: /gpt-5/i,
        metadata: { maxInputTokens: 400000, maxOutputTokens: 128000, supportsToolCalling: true, supportsImageInput: true, modelType: 'llm' },
        subPatterns: [
            { pattern: /gpt-5\.2-pro/i, metadata: { maxInputTokens: 400000, maxOutputTokens: 128000, supportsToolCalling: true, supportsImageInput: true, modelType: 'llm' } },
            { pattern: /gpt-5\.2-chat/i, metadata: { maxInputTokens: 128000, maxOutputTokens: 16384, supportsToolCalling: true, supportsImageInput: true, modelType: 'llm' } },
            { pattern: /gpt-5\.1-codex/i, metadata: { maxInputTokens: 400000, maxOutputTokens: 128000, supportsToolCalling: true, supportsImageInput: true, modelType: 'llm' } },
            { pattern: /gpt-5-nano/i, metadata: { maxInputTokens: 400000, maxOutputTokens: 128000, supportsToolCalling: true, supportsImageInput: true, modelType: 'llm' } },
            { pattern: /gpt-5-mini/i, metadata: { maxInputTokens: 400000, maxOutputTokens: 128000, supportsToolCalling: true, supportsImageInput: true, modelType: 'llm' } },
            { pattern: /gpt-5-pro/i, metadata: { maxInputTokens: 400000, maxOutputTokens: 128000, supportsToolCalling: true, supportsImageInput: true, modelType: 'llm' } },
            { pattern: /gpt-5-codex/i, metadata: { maxInputTokens: 400000, maxOutputTokens: 128000, supportsToolCalling: true, supportsImageInput: true, modelType: 'llm' } }
        ]
    },

    // ============== OpenAI GPT-4.1 Family ==============
    {
        pattern: /gpt-4\.1/i,
        metadata: { maxInputTokens: 1047576, maxOutputTokens: 32768, supportsToolCalling: true, supportsImageInput: true, modelType: 'llm' },
        subPatterns: [
            { pattern: /gpt-4\.1-nano/i, metadata: { maxInputTokens: 1047576, maxOutputTokens: 32768, supportsToolCalling: true, supportsImageInput: true, modelType: 'llm' } },
            { pattern: /gpt-4\.1-mini/i, metadata: { maxInputTokens: 1047576, maxOutputTokens: 32768, supportsToolCalling: true, supportsImageInput: true, modelType: 'llm' } }
        ]
    },

    // ============== OpenAI o3/o4 Reasoning Models ==============
    {
        pattern: /\bo[34]\b/i,
        metadata: { maxInputTokens: 200000, maxOutputTokens: 100000, supportsToolCalling: true, supportsImageInput: true, modelType: 'llm' },
        subPatterns: [
            { pattern: /o4-mini/i, metadata: { maxInputTokens: 200000, maxOutputTokens: 100000, supportsToolCalling: true, supportsImageInput: true, modelType: 'llm' } },
            { pattern: /o3-pro/i, metadata: { maxInputTokens: 200000, maxOutputTokens: 100000, supportsToolCalling: true, supportsImageInput: true, modelType: 'llm' } },
            { pattern: /o3-mini/i, metadata: { maxInputTokens: 200000, maxOutputTokens: 100000, supportsToolCalling: true, supportsImageInput: false, modelType: 'llm' } }
        ]
    },

    // ============== OpenAI GPT-4o Family ==============
    {
        pattern: /gpt-4o/i,
        metadata: { maxInputTokens: 128000, maxOutputTokens: 16384, supportsToolCalling: true, supportsImageInput: true, modelType: 'llm' },
        subPatterns: [
            { pattern: /gpt-4o-mini/i, metadata: { maxInputTokens: 128000, maxOutputTokens: 16384, supportsToolCalling: true, supportsImageInput: true, modelType: 'llm' } }
        ]
    },

    // ============== OpenAI GPT-OSS Models ==============
    { pattern: /gpt-oss/i, metadata: { maxInputTokens: 131072, maxOutputTokens: 65536, supportsToolCalling: true, supportsImageInput: false, modelType: 'llm' } },

    // ============== Anthropic Claude 4 Family ==============
    {
        pattern: /claude-(opus|sonnet|haiku)-4/i,
        metadata: { maxInputTokens: 200000, maxOutputTokens: 64000, supportsToolCalling: true, supportsImageInput: true, modelType: 'llm' },
        subPatterns: [
            { pattern: /claude-opus-4\.5/i, metadata: { maxInputTokens: 200000, maxOutputTokens: 32000, supportsToolCalling: true, supportsImageInput: true, modelType: 'llm' } },
            { pattern: /claude-sonnet-4\.5/i, metadata: { maxInputTokens: 1000000, maxOutputTokens: 64000, supportsToolCalling: true, supportsImageInput: true, modelType: 'llm' } },
            { pattern: /claude-haiku-4\.5/i, metadata: { maxInputTokens: 200000, maxOutputTokens: 64000, supportsToolCalling: true, supportsImageInput: true, modelType: 'llm' } },
            { pattern: /claude-opus-4\.1/i, metadata: { maxInputTokens: 200000, maxOutputTokens: 32000, supportsToolCalling: true, supportsImageInput: true, modelType: 'llm' } },
            { pattern: /claude-opus-4(?![.\d])/i, metadata: { maxInputTokens: 200000, maxOutputTokens: 32000, supportsToolCalling: true, supportsImageInput: true, modelType: 'llm' } },
            { pattern: /claude-sonnet-4(?![.\d])/i, metadata: { maxInputTokens: 1000000, maxOutputTokens: 64000, supportsToolCalling: true, supportsImageInput: true, modelType: 'llm' } }
        ]
    },

    // ============== Anthropic Claude 3.x Family ==============
    {
        pattern: /claude-3/i,
        metadata: { maxInputTokens: 200000, maxOutputTokens: 8192, supportsToolCalling: true, supportsImageInput: true, modelType: 'llm' },
        subPatterns: [
            { pattern: /claude-3\.7-sonnet/i, metadata: { maxInputTokens: 200000, maxOutputTokens: 128000, supportsToolCalling: true, supportsImageInput: true, modelType: 'llm' } },
            { pattern: /claude-3\.5-(sonnet|haiku)/i, metadata: { maxInputTokens: 200000, maxOutputTokens: 8192, supportsToolCalling: true, supportsImageInput: true, modelType: 'llm' } },
            { pattern: /claude-3-opus/i, metadata: { maxInputTokens: 200000, maxOutputTokens: 4096, supportsToolCalling: true, supportsImageInput: true, modelType: 'llm' } }
        ]
    },

    // ============== Google Gemini 3 Family ==============
    {
        pattern: /gemini-3/i,
        metadata: { maxInputTokens: 1048576, maxOutputTokens: 65536, supportsToolCalling: true, supportsImageInput: true, modelType: 'llm' },
        subPatterns: [
            { pattern: /gemini-3-pro/i, metadata: { maxInputTokens: 1048576, maxOutputTokens: 65536, supportsToolCalling: true, supportsImageInput: true, modelType: 'llm' } },
            { pattern: /gemini-3-flash/i, metadata: { maxInputTokens: 1048576, maxOutputTokens: 65535, supportsToolCalling: true, supportsImageInput: true, modelType: 'llm' } }
        ]
    },

    // ============== Google Gemini 2.5 Family ==============
    {
        pattern: /gemini-2\.5/i,
        metadata: { maxInputTokens: 1048576, maxOutputTokens: 65536, supportsToolCalling: true, supportsImageInput: true, modelType: 'llm' },
        subPatterns: [
            { pattern: /gemini-2\.5-pro/i, metadata: { maxInputTokens: 1048576, maxOutputTokens: 65536, supportsToolCalling: true, supportsImageInput: true, modelType: 'llm' } },
            { pattern: /gemini-2\.5-flash-lite/i, metadata: { maxInputTokens: 1048576, maxOutputTokens: 65535, supportsToolCalling: true, supportsImageInput: true, modelType: 'llm' } },
            { pattern: /gemini-2\.5-flash/i, metadata: { maxInputTokens: 1048576, maxOutputTokens: 65535, supportsToolCalling: true, supportsImageInput: true, modelType: 'llm' } }
        ]
    },

    // ============== Google Gemini 2.0 Family ==============
    { pattern: /gemini-2\.0/i, metadata: { maxInputTokens: 1048576, maxOutputTokens: 8192, supportsToolCalling: true, supportsImageInput: true, modelType: 'llm' } },

    // ============== Google Gemma Family ==============
    {
        pattern: /gemma/i,
        metadata: { maxInputTokens: 32768, maxOutputTokens: 8192, supportsToolCalling: false, supportsImageInput: false, modelType: 'llm' },
        subPatterns: [
            { pattern: /gemma-3n/i, metadata: { maxInputTokens: 32768, maxOutputTokens: 8192, supportsToolCalling: false, supportsImageInput: false, modelType: 'llm' } }
        ]
    },

    // ============== Qwen3 Family ==============
    {
        pattern: /qwen3/i,
        metadata: { maxInputTokens: 131072, maxOutputTokens: 32768, supportsToolCalling: true, supportsImageInput: false, modelType: 'llm' },
        subPatterns: [
            { pattern: /qwen3-coder-(480b|plus)/i, metadata: { maxInputTokens: 262144, maxOutputTokens: 262144, supportsToolCalling: true, supportsImageInput: false, modelType: 'llm' } },
            { pattern: /qwen3-coder-(30b|flash)/i, metadata: { maxInputTokens: 160000, maxOutputTokens: 32768, supportsToolCalling: true, supportsImageInput: false, modelType: 'llm' } },
            { pattern: /qwen3-coder/i, metadata: { maxInputTokens: 128000, maxOutputTokens: 65536, supportsToolCalling: true, supportsImageInput: false, modelType: 'llm' } },
            { pattern: /qwen3-vl-235b/i, metadata: { maxInputTokens: 262144, maxOutputTokens: 262144, supportsToolCalling: true, supportsImageInput: true, modelType: 'llm' } },
            { pattern: /qwen3-vl-32b/i, metadata: { maxInputTokens: 262144, maxOutputTokens: 131072, supportsToolCalling: true, supportsImageInput: true, modelType: 'llm' } },
            { pattern: /qwen3-vl-30b/i, metadata: { maxInputTokens: 262144, maxOutputTokens: 131072, supportsToolCalling: true, supportsImageInput: true, modelType: 'llm' } },
            { pattern: /qwen3-vl-8b/i, metadata: { maxInputTokens: 256000, maxOutputTokens: 32768, supportsToolCalling: true, supportsImageInput: true, modelType: 'llm' } },
            { pattern: /qwen3-vl/i, metadata: { maxInputTokens: 131072, maxOutputTokens: 32768, supportsToolCalling: true, supportsImageInput: true, modelType: 'llm' } },
            { pattern: /qwen3-max/i, metadata: { maxInputTokens: 256000, maxOutputTokens: 32768, supportsToolCalling: true, supportsImageInput: false, modelType: 'llm' } },
            { pattern: /qwen3-next/i, metadata: { maxInputTokens: 262144, maxOutputTokens: 32768, supportsToolCalling: true, supportsImageInput: false, modelType: 'llm' } },
            { pattern: /qwen3-235b/i, metadata: { maxInputTokens: 262144, maxOutputTokens: 262144, supportsToolCalling: true, supportsImageInput: false, modelType: 'llm' } },
            { pattern: /qwen3-32b/i, metadata: { maxInputTokens: 40960, maxOutputTokens: 40960, supportsToolCalling: true, supportsImageInput: false, modelType: 'llm' } },
            { pattern: /qwen3-30b/i, metadata: { maxInputTokens: 40960, maxOutputTokens: 40960, supportsToolCalling: true, supportsImageInput: false, modelType: 'llm' } },
            { pattern: /qwen3-14b/i, metadata: { maxInputTokens: 40960, maxOutputTokens: 40960, supportsToolCalling: true, supportsImageInput: false, modelType: 'llm' } },
            { pattern: /qwen3-8b/i, metadata: { maxInputTokens: 128000, maxOutputTokens: 20000, supportsToolCalling: true, supportsImageInput: false, modelType: 'llm' } },
            { pattern: /qwen3-4b/i, metadata: { maxInputTokens: 40960, maxOutputTokens: 32768, supportsToolCalling: true, supportsImageInput: false, modelType: 'llm' } }
        ]
    },

    // ============== Qwen2.5 Family ==============
    {
        pattern: /qwen2\.5/i,
        metadata: { maxInputTokens: 131072, maxOutputTokens: 8192, supportsToolCalling: true, supportsImageInput: false, modelType: 'llm' },
        subPatterns: [
            { pattern: /qwen2\.5-coder-32b/i, metadata: { maxInputTokens: 131072, maxOutputTokens: 8192, supportsToolCalling: true, supportsImageInput: false, modelType: 'llm' } },
            { pattern: /qwen2\.5-coder-7b/i, metadata: { maxInputTokens: 32768, maxOutputTokens: 8192, supportsToolCalling: true, supportsImageInput: false, modelType: 'llm' } },
            { pattern: /qwen2\.5-coder/i, metadata: { maxInputTokens: 131072, maxOutputTokens: 8192, supportsToolCalling: true, supportsImageInput: false, modelType: 'llm' } },
            { pattern: /qwen2\.5-vl/i, metadata: { maxInputTokens: 131072, maxOutputTokens: 8192, supportsToolCalling: true, supportsImageInput: true, modelType: 'llm' } }
        ]
    },

    // ============== QwQ/QvQ Reasoning Models ==============
    { pattern: /qwq/i, metadata: { maxInputTokens: 131072, maxOutputTokens: 131072, supportsToolCalling: true, supportsImageInput: false, modelType: 'llm' } },
    { pattern: /qvq/i, metadata: { maxInputTokens: 131072, maxOutputTokens: 16384, supportsToolCalling: false, supportsImageInput: true, modelType: 'llm' } },

    // ============== DeepSeek Family ==============
    {
        pattern: /deepseek/i,
        metadata: { maxInputTokens: 163840, maxOutputTokens: 65536, supportsToolCalling: true, supportsImageInput: false, modelType: 'llm' },
        subPatterns: [
            { pattern: /deepseek-v3\.2/i, metadata: { maxInputTokens: 163840, maxOutputTokens: 163840, supportsToolCalling: true, supportsImageInput: false, modelType: 'llm' } },
            { pattern: /deepseek-(v3\.1|chat-v3\.1)/i, metadata: { maxInputTokens: 163840, maxOutputTokens: 65536, supportsToolCalling: true, supportsImageInput: false, modelType: 'llm' } },
            { pattern: /deepseek-r1-0528/i, metadata: { maxInputTokens: 163840, maxOutputTokens: 163840, supportsToolCalling: true, supportsImageInput: false, modelType: 'llm' } },
            { pattern: /deepseek-r1/i, metadata: { maxInputTokens: 163840, maxOutputTokens: 65536, supportsToolCalling: true, supportsImageInput: false, modelType: 'llm' } },
            { pattern: /deepseek-prover/i, metadata: { maxInputTokens: 163840, maxOutputTokens: 65536, supportsToolCalling: false, supportsImageInput: false, modelType: 'llm' } }
        ]
    },

    // ============== Meta Llama 4 Family ==============
    {
        pattern: /llama-4/i,
        metadata: { maxInputTokens: 1048576, maxOutputTokens: 131072, supportsToolCalling: true, supportsImageInput: true, modelType: 'llm' },
        subPatterns: [
            { pattern: /llama-4-maverick/i, metadata: { maxInputTokens: 1048576, maxOutputTokens: 16384, supportsToolCalling: true, supportsImageInput: true, modelType: 'llm' } },
            { pattern: /llama-4-scout/i, metadata: { maxInputTokens: 10000000, maxOutputTokens: 16384, supportsToolCalling: true, supportsImageInput: true, modelType: 'llm' } }
        ]
    },

    // ============== Meta Llama 3.x Family ==============
    {
        pattern: /llama-3\.[23]/i,
        metadata: { maxInputTokens: 131072, maxOutputTokens: 131072, supportsToolCalling: true, supportsImageInput: false, modelType: 'llm' },
        subPatterns: [
            { pattern: /llama-3\.3-nemotron/i, metadata: { maxInputTokens: 131072, maxOutputTokens: 131072, supportsToolCalling: true, supportsImageInput: false, modelType: 'llm' } },
            { pattern: /llama-3\.[23]-.*-(11b|90b)/i, metadata: { maxInputTokens: 131072, maxOutputTokens: 131072, supportsToolCalling: true, supportsImageInput: true, modelType: 'llm' } }
        ]
    },

    // ============== Mistral Family ==============
    {
        pattern: /mistral/i,
        metadata: { maxInputTokens: 131072, maxOutputTokens: 65536, supportsToolCalling: true, supportsImageInput: false, modelType: 'llm' },
        subPatterns: [
            { pattern: /mistral-large-2512/i, metadata: { maxInputTokens: 262144, maxOutputTokens: 65536, supportsToolCalling: true, supportsImageInput: true, modelType: 'llm' } },
            { pattern: /mistral-large/i, metadata: { maxInputTokens: 128000, maxOutputTokens: 128000, supportsToolCalling: true, supportsImageInput: false, modelType: 'llm' } },
            { pattern: /mistral-medium-3\.1/i, metadata: { maxInputTokens: 131072, maxOutputTokens: 65536, supportsToolCalling: true, supportsImageInput: true, modelType: 'llm' } },
            { pattern: /mistral-medium-3/i, metadata: { maxInputTokens: 131072, maxOutputTokens: 65536, supportsToolCalling: true, supportsImageInput: true, modelType: 'llm' } },
            { pattern: /mistral-small-3\.2/i, metadata: { maxInputTokens: 131072, maxOutputTokens: 131072, supportsToolCalling: true, supportsImageInput: true, modelType: 'llm' } },
            { pattern: /mistral-small/i, metadata: { maxInputTokens: 32768, maxOutputTokens: 32768, supportsToolCalling: true, supportsImageInput: false, modelType: 'llm' } }
        ]
    },

    // ============== Mistral Devstral/Codestral Family ==============
    {
        pattern: /(devstral|codestral)/i,
        metadata: { maxInputTokens: 262144, maxOutputTokens: 65536, supportsToolCalling: true, supportsImageInput: false, modelType: 'llm' },
        subPatterns: [
            { pattern: /devstral-2512/i, metadata: { maxInputTokens: 262144, maxOutputTokens: 65536, supportsToolCalling: true, supportsImageInput: false, modelType: 'llm' } },
            { pattern: /devstral-medium/i, metadata: { maxInputTokens: 131072, maxOutputTokens: 65536, supportsToolCalling: true, supportsImageInput: false, modelType: 'llm' } },
            { pattern: /devstral-small/i, metadata: { maxInputTokens: 128000, maxOutputTokens: 65536, supportsToolCalling: true, supportsImageInput: false, modelType: 'llm' } },
            { pattern: /codestral-2508/i, metadata: { maxInputTokens: 256000, maxOutputTokens: 65536, supportsToolCalling: true, supportsImageInput: false, modelType: 'llm' } },
            { pattern: /codestral/i, metadata: { maxInputTokens: 32768, maxOutputTokens: 32768, supportsToolCalling: true, supportsImageInput: false, modelType: 'llm' } }
        ]
    },

    // ============== Ministral Family ==============
    {
        pattern: /ministral/i,
        metadata: { maxInputTokens: 131072, maxOutputTokens: 65536, supportsToolCalling: true, supportsImageInput: true, modelType: 'llm' },
        subPatterns: [
            { pattern: /ministral-14b/i, metadata: { maxInputTokens: 262144, maxOutputTokens: 65536, supportsToolCalling: true, supportsImageInput: true, modelType: 'llm' } },
            { pattern: /ministral-8b/i, metadata: { maxInputTokens: 262144, maxOutputTokens: 65536, supportsToolCalling: true, supportsImageInput: true, modelType: 'llm' } },
            { pattern: /ministral-3b/i, metadata: { maxInputTokens: 131072, maxOutputTokens: 65536, supportsToolCalling: true, supportsImageInput: true, modelType: 'llm' } }
        ]
    },

    // ============== xAI Grok Family ==============
    {
        pattern: /grok/i,
        metadata: { maxInputTokens: 131072, maxOutputTokens: 65536, supportsToolCalling: true, supportsImageInput: false, modelType: 'llm' },
        subPatterns: [
            { pattern: /grok-4\.1-fast/i, metadata: { maxInputTokens: 2000000, maxOutputTokens: 30000, supportsToolCalling: true, supportsImageInput: true, modelType: 'llm' } },
            { pattern: /grok-4-fast/i, metadata: { maxInputTokens: 2000000, maxOutputTokens: 30000, supportsToolCalling: true, supportsImageInput: true, modelType: 'llm' } },
            { pattern: /grok-4/i, metadata: { maxInputTokens: 256000, maxOutputTokens: 65536, supportsToolCalling: true, supportsImageInput: true, modelType: 'llm' } },
            { pattern: /grok-3-mini/i, metadata: { maxInputTokens: 131072, maxOutputTokens: 65536, supportsToolCalling: true, supportsImageInput: false, modelType: 'llm' } },
            { pattern: /grok-3/i, metadata: { maxInputTokens: 131072, maxOutputTokens: 65536, supportsToolCalling: true, supportsImageInput: false, modelType: 'llm' } },
            { pattern: /grok-code-fast/i, metadata: { maxInputTokens: 256000, maxOutputTokens: 10000, supportsToolCalling: true, supportsImageInput: false, modelType: 'llm' } }
        ]
    },

    // ============== Amazon Nova Family ==============
    {
        pattern: /nova/i,
        metadata: { maxInputTokens: 1000000, maxOutputTokens: 65535, supportsToolCalling: true, supportsImageInput: true, modelType: 'llm' },
        subPatterns: [
            { pattern: /nova-premier/i, metadata: { maxInputTokens: 1000000, maxOutputTokens: 32000, supportsToolCalling: true, supportsImageInput: true, modelType: 'llm' } },
            { pattern: /nova-2-lite/i, metadata: { maxInputTokens: 1000000, maxOutputTokens: 65535, supportsToolCalling: true, supportsImageInput: true, modelType: 'llm' } }
        ]
    },

    // ============== Cohere Command Family ==============
    {
        pattern: /command/i,
        metadata: { maxInputTokens: 128000, maxOutputTokens: 4096, supportsToolCalling: true, supportsImageInput: false, modelType: 'llm' },
        subPatterns: [
            { pattern: /command-r-plus/i, metadata: { maxInputTokens: 128000, maxOutputTokens: 4096, supportsToolCalling: true, supportsImageInput: false, modelType: 'llm' } },
            { pattern: /command-r/i, metadata: { maxInputTokens: 128000, maxOutputTokens: 4096, supportsToolCalling: true, supportsImageInput: false, modelType: 'llm' } }
        ]
    },

    // ============== NVIDIA Nemotron Family ==============
    {
        pattern: /nemotron/i,
        metadata: { maxInputTokens: 131072, maxOutputTokens: 65536, supportsToolCalling: true, supportsImageInput: false, modelType: 'llm' },
        subPatterns: [
            { pattern: /nemotron-3-nano/i, metadata: { maxInputTokens: 262144, maxOutputTokens: 65536, supportsToolCalling: true, supportsImageInput: false, modelType: 'llm' } },
            { pattern: /nemotron-nano.*vl/i, metadata: { maxInputTokens: 131072, maxOutputTokens: 65536, supportsToolCalling: true, supportsImageInput: true, modelType: 'llm' } },
            { pattern: /nemotron-nano/i, metadata: { maxInputTokens: 131072, maxOutputTokens: 65536, supportsToolCalling: true, supportsImageInput: false, modelType: 'llm' } },
            { pattern: /llama.*nemotron/i, metadata: { maxInputTokens: 131072, maxOutputTokens: 65536, supportsToolCalling: true, supportsImageInput: false, modelType: 'llm' } }
        ]
    },

    // ============== MiniMax Family ==============
    { pattern: /minimax/i, metadata: { maxInputTokens: 1000000, maxOutputTokens: 131072, supportsToolCalling: true, supportsImageInput: false, modelType: 'llm' } },

    // ============== Moonshot/Kimi Family ==============
    {
        pattern: /kimi/i,
        metadata: { maxInputTokens: 262144, maxOutputTokens: 65535, supportsToolCalling: true, supportsImageInput: false, modelType: 'llm' },
        subPatterns: [
            { pattern: /kimi-k2-thinking/i, metadata: { maxInputTokens: 262144, maxOutputTokens: 65535, supportsToolCalling: true, supportsImageInput: false, modelType: 'llm' } },
            { pattern: /kimi-k2/i, metadata: { maxInputTokens: 262144, maxOutputTokens: 262144, supportsToolCalling: true, supportsImageInput: false, modelType: 'llm' } },
            { pattern: /kimi-dev/i, metadata: { maxInputTokens: 131072, maxOutputTokens: 131072, supportsToolCalling: true, supportsImageInput: false, modelType: 'llm' } }
        ]
    },

    // ============== Z.AI GLM Family ==============
    {
        pattern: /glm/i,
        metadata: { maxInputTokens: 131072, maxOutputTokens: 65536, supportsToolCalling: true, supportsImageInput: false, modelType: 'llm' },
        subPatterns: [
            { pattern: /glm-4\.6v/i, metadata: { maxInputTokens: 131072, maxOutputTokens: 24000, supportsToolCalling: true, supportsImageInput: true, modelType: 'llm' } },
            { pattern: /glm-4\.6/i, metadata: { maxInputTokens: 204800, maxOutputTokens: 204800, supportsToolCalling: true, supportsImageInput: false, modelType: 'llm' } },
            { pattern: /glm-4\.5v/i, metadata: { maxInputTokens: 65536, maxOutputTokens: 16384, supportsToolCalling: true, supportsImageInput: true, modelType: 'llm' } },
            { pattern: /glm-4\.5/i, metadata: { maxInputTokens: 131072, maxOutputTokens: 65536, supportsToolCalling: true, supportsImageInput: false, modelType: 'llm' } },
            { pattern: /glm-4/i, metadata: { maxInputTokens: 128000, maxOutputTokens: 65536, supportsToolCalling: true, supportsImageInput: false, modelType: 'llm' } }
        ]
    },

    // ============== THUDM GLM Family ==============
    // Note: This pattern is now subsumed by the Z.AI GLM pattern above

    // ============== Baidu ERNIE Family ==============
    { pattern: /ernie/i, metadata: { maxInputTokens: 131072, maxOutputTokens: 65536, supportsToolCalling: true, supportsImageInput: false, modelType: 'llm' } },

    // ============== Tencent Hunyuan Family ==============
    { pattern: /hunyuan/i, metadata: { maxInputTokens: 131072, maxOutputTokens: 131072, supportsToolCalling: true, supportsImageInput: false, modelType: 'llm' } },

    // ============== AI21 Jamba Family ==============
    { pattern: /jamba/i, metadata: { maxInputTokens: 256000, maxOutputTokens: 4096, supportsToolCalling: true, supportsImageInput: false, modelType: 'llm' } },

    // ============== Perplexity Sonar Family ==============
    { pattern: /sonar/i, metadata: { maxInputTokens: 200000, maxOutputTokens: 8000, supportsToolCalling: false, supportsImageInput: true, modelType: 'llm' } },

    // ============== Microsoft Phi Family ==============
    {
        pattern: /phi/i,
        metadata: { maxInputTokens: 32768, maxOutputTokens: 16384, supportsToolCalling: true, supportsImageInput: false, modelType: 'llm' },
        subPatterns: [
            { pattern: /phi-4-reasoning/i, metadata: { maxInputTokens: 32768, maxOutputTokens: 16384, supportsToolCalling: true, supportsImageInput: false, modelType: 'llm' } },
            { pattern: /phi-4/i, metadata: { maxInputTokens: 16384, maxOutputTokens: 16384, supportsToolCalling: true, supportsImageInput: false, modelType: 'llm' } }
        ]
    },

    // ============== IBM Granite Family ==============
    { pattern: /granite/i, metadata: { maxInputTokens: 131000, maxOutputTokens: 65536, supportsToolCalling: true, supportsImageInput: false, modelType: 'llm' } },

    // ============== Nous Research Hermes Family ==============
    { pattern: /hermes/i, metadata: { maxInputTokens: 131072, maxOutputTokens: 131072, supportsToolCalling: true, supportsImageInput: false, modelType: 'llm' } },
    { pattern: /deephermes/i, metadata: { maxInputTokens: 32768, maxOutputTokens: 32768, supportsToolCalling: true, supportsImageInput: false, modelType: 'llm' } },

    // ============== Inception Mercury Family ==============
    { pattern: /mercury/i, metadata: { maxInputTokens: 128000, maxOutputTokens: 16384, supportsToolCalling: true, supportsImageInput: false, modelType: 'llm' } },

    // ============== StepFun Step Family ==============
    { pattern: /step/i, metadata: { maxInputTokens: 65536, maxOutputTokens: 65536, supportsToolCalling: true, supportsImageInput: true, modelType: 'llm' } },

    // ============== Deep Cogito Family ==============
    { pattern: /cogito/i, metadata: { maxInputTokens: 128000, maxOutputTokens: 65536, supportsToolCalling: true, supportsImageInput: false, modelType: 'llm' } },

    // ============== Prime Intellect Family ==============
    { pattern: /intellect/i, metadata: { maxInputTokens: 131072, maxOutputTokens: 131072, supportsToolCalling: true, supportsImageInput: false, modelType: 'llm' } },

    // ============== AllenAI Olmo Family ==============
    { pattern: /olmo/i, metadata: { maxInputTokens: 65536, maxOutputTokens: 65536, supportsToolCalling: true, supportsImageInput: false, modelType: 'llm' } },

    // ============== Arcee AI Family ==============
    // Match model series names: trinity, virtuoso, coder, maestro, spotlight
    {
        pattern: /(trinity|virtuoso|maestro|spotlight)/i,
        metadata: { maxInputTokens: 131072, maxOutputTokens: 65536, supportsToolCalling: true, supportsImageInput: false, modelType: 'llm' },
        subPatterns: [
            { pattern: /virtuoso-large/i, metadata: { maxInputTokens: 131072, maxOutputTokens: 64000, supportsToolCalling: true, supportsImageInput: false, modelType: 'llm' } },
            { pattern: /maestro-reasoning/i, metadata: { maxInputTokens: 131072, maxOutputTokens: 32000, supportsToolCalling: true, supportsImageInput: false, modelType: 'llm' } },
            { pattern: /coder-large/i, metadata: { maxInputTokens: 32768, maxOutputTokens: 32768, supportsToolCalling: true, supportsImageInput: false, modelType: 'llm' } },
            { pattern: /spotlight/i, metadata: { maxInputTokens: 131072, maxOutputTokens: 65537, supportsToolCalling: false, supportsImageInput: true, modelType: 'llm' } },
            { pattern: /trinity-mini/i, metadata: { maxInputTokens: 131072, maxOutputTokens: 131072, supportsToolCalling: true, supportsImageInput: false, modelType: 'llm' } }
        ]
    },

    // ============== Meituan LongCat Family ==============
    { pattern: /longcat/i, metadata: { maxInputTokens: 131072, maxOutputTokens: 131072, supportsToolCalling: true, supportsImageInput: false, modelType: 'llm' } },

    // ============== Morph Family ==============
    { pattern: /morph/i, metadata: { maxInputTokens: 262144, maxOutputTokens: 131072, supportsToolCalling: false, supportsImageInput: false, modelType: 'llm' } },

    // ============== Relace Family ==============
    { pattern: /relace/i, metadata: { maxInputTokens: 256000, maxOutputTokens: 128000, supportsToolCalling: true, supportsImageInput: false, modelType: 'llm' } },

    // ============== TNG Chimera Family ==============
    { pattern: /tng.*chimera/i, metadata: { maxInputTokens: 163840, maxOutputTokens: 163840, supportsToolCalling: true, supportsImageInput: false, modelType: 'llm' } },

    // ============== Xiaomi MiMo Family ==============
    { pattern: /mimo/i, metadata: { maxInputTokens: 262144, maxOutputTokens: 65536, supportsToolCalling: true, supportsImageInput: false, modelType: 'llm' } },

    // ============== Alibaba Tongyi Family ==============
    { pattern: /tongyi/i, metadata: { maxInputTokens: 131072, maxOutputTokens: 131072, supportsToolCalling: true, supportsImageInput: false, modelType: 'llm' } },

    // ============== KwaiPilot KAT Family ==============
    { pattern: /(kwaipilot.*kat|kat-coder)/i, metadata: { maxInputTokens: 256000, maxOutputTokens: 32768, supportsToolCalling: true, supportsImageInput: false, modelType: 'llm' } },

    // ============== Liquid AI LFM Family ==============
    { pattern: /lfm/i, metadata: { maxInputTokens: 32768, maxOutputTokens: 32768, supportsToolCalling: false, supportsImageInput: false, modelType: 'llm' } },

    // ============== OpenGVLab InternVL Family ==============
    { pattern: /internvl/i, metadata: { maxInputTokens: 32768, maxOutputTokens: 32768, supportsToolCalling: false, supportsImageInput: true, modelType: 'llm' } },

    // ============== ByteDance UI-TARS Family ==============
    { pattern: /ui-tars/i, metadata: { maxInputTokens: 128000, maxOutputTokens: 2048, supportsToolCalling: false, supportsImageInput: true, modelType: 'llm' } },

    // ============== Aion Labs Family ==============
    { pattern: /aion/i, metadata: { maxInputTokens: 131072, maxOutputTokens: 32768, supportsToolCalling: true, supportsImageInput: false, modelType: 'llm' } },

    // ============== Essential AI Rnj Family ==============
    { pattern: /rnj/i, metadata: { maxInputTokens: 32768, maxOutputTokens: 16384, supportsToolCalling: true, supportsImageInput: false, modelType: 'llm' } },

    // ============== Switchpoint Router ==============
    { pattern: /switchpoint/i, metadata: { maxInputTokens: 131072, maxOutputTokens: 65536, supportsToolCalling: true, supportsImageInput: false, modelType: 'llm' } }
];

/**
 * Patterns used to identify non-LLM model types by name.
 * These patterns help classify models even when not found in the registry.
 */
const NON_LLM_PATTERNS: { pattern: RegExp; modelType: ModelMetadata['modelType'] }[] = [
    // Embedding models
    { pattern: /embed(ding)?/i, modelType: 'embedding' },
    { pattern: /text-embed/i, modelType: 'embedding' },
    { pattern: /bge-/i, modelType: 'embedding' },
    { pattern: /e5-/i, modelType: 'embedding' },
    { pattern: /gte-/i, modelType: 'embedding' },
    { pattern: /sentence-/i, modelType: 'embedding' },
    { pattern: /all-minilm/i, modelType: 'embedding' },
    { pattern: /nomic-embed/i, modelType: 'embedding' },
    { pattern: /jina-embed/i, modelType: 'embedding' },
    { pattern: /voyage-/i, modelType: 'embedding' },
    
    // Rerank models
    { pattern: /rerank/i, modelType: 'rerank' },
    { pattern: /ranker/i, modelType: 'rerank' },
    { pattern: /jina-reranker/i, modelType: 'rerank' },
    
    // Image generation models
    { pattern: /dall-e/i, modelType: 'image' },
    { pattern: /stable-diffusion/i, modelType: 'image' },
    { pattern: /sdxl/i, modelType: 'image' },
    { pattern: /midjourney/i, modelType: 'image' },
    { pattern: /imagen/i, modelType: 'image' },
    { pattern: /flux-\d/i, modelType: 'image' },
    { pattern: /playground-v/i, modelType: 'image' },
    { pattern: /ideogram/i, modelType: 'image' },
    { pattern: /recraft/i, modelType: 'image' },
    
    // Audio models
    { pattern: /whisper/i, modelType: 'audio' },
    { pattern: /tts-/i, modelType: 'audio' },
    { pattern: /^speech[-_]/i, modelType: 'audio' },
    { pattern: /voxtral/i, modelType: 'audio' },
    
    // Moderation models
    { pattern: /moderation/i, modelType: 'other' },
    { pattern: /content-filter/i, modelType: 'other' },
    { pattern: /guard/i, modelType: 'other' },
    { pattern: /safeguard/i, modelType: 'other' }
];

/**
 * Normalizes a model ID by removing common prefixes and suffixes.
 * This helps match models with different naming conventions.
 */
function normalizeModelId(modelId: string): string {
    return modelId
        .toLowerCase()
        // Remove provider prefixes
        .replace(/^(openai\/|anthropic\/|google\/|meta-llama\/|mistralai\/|cohere\/|qwen\/|deepseek\/|deepseek-ai\/|microsoft\/|nvidia\/|x-ai\/|amazon\/|ai21\/|perplexity\/|ibm-granite\/|z-ai\/|thudm\/|baidu\/|tencent\/|moonshotai\/|stepfun-ai\/|nousresearch\/|prime-intellect\/|allenai\/|arcee-ai\/|meituan\/|morph\/|relace\/|inception\/|minimax\/|opengvlab\/|bytedance\/|liquid\/|tngtech\/|xiaomi\/|alibaba\/|kwaipilot\/|deepcogito\/|essentialai\/)/, '')
        // Remove common suffixes
        .replace(/-instruct$/, '')
        .replace(/-chat$/, '')
        .replace(/-preview$/, '')
        .replace(/-latest$/, '')
        .replace(/:free$/, '')
        .replace(/:extended$/, '')
        .replace(/:exacto$/, '')
        .replace(/:thinking$/, '')
        .replace(/@\d{4}-\d{2}-\d{2}$/, '')
        .replace(/[-_](\d{8})$/, '');
}

/**
 * Matches a model ID against a pattern (regex or string).
 */
function matchPattern(modelId: string, pattern: RegExp | string): boolean {
    if (pattern instanceof RegExp) {
        return pattern.test(modelId);
    }
    return modelId.toLowerCase().startsWith(pattern.toLowerCase());
}

/**
 * Recursively matches a model ID against hierarchical patterns.
 * First tries subPatterns for more specific matches, then falls back to parent.
 */
function matchHierarchicalPattern(modelId: string, patterns: ModelFamilyPattern[]): ModelMetadata | null {
    for (const familyPattern of patterns) {
        if (matchPattern(modelId, familyPattern.pattern)) {
            // Try sub-patterns first (more specific)
            if (familyPattern.subPatterns) {
                for (const subPattern of familyPattern.subPatterns) {
                    if (matchPattern(modelId, subPattern.pattern)) {
                        // Recursively check sub-patterns
                        if (subPattern.subPatterns) {
                            const deepMatch = matchHierarchicalPattern(modelId, [subPattern]);
                            if (deepMatch) {
                                return deepMatch;
                            }
                        }
                        return subPattern.metadata;
                    }
                }
            }
            // No sub-pattern matched, use parent metadata
            return familyPattern.metadata;
        }
    }
    return null;
}

/**
 * Gets metadata for a model using multi-level pattern matching.
 *
 * Matching strategy:
 * 1. Try hierarchical pattern matching on original model ID
 * 2. Try hierarchical pattern matching on normalized model ID
 * 3. Check for non-LLM patterns (embedding, image, audio, etc.)
 * 4. Return default metadata for unknown models
 */
export function getModelMetadata(modelId: string): ModelMetadata {
    // Try matching with original ID
    const directMatch = matchHierarchicalPattern(modelId, MODEL_FAMILY_PATTERNS);
    if (directMatch) {
        return directMatch;
    }

    // Try matching with normalized ID
    const normalizedId = normalizeModelId(modelId);
    const normalizedMatch = matchHierarchicalPattern(normalizedId, MODEL_FAMILY_PATTERNS);
    if (normalizedMatch) {
        return normalizedMatch;
    }

    // Check non-LLM patterns
    for (const { pattern, modelType } of NON_LLM_PATTERNS) {
        if (pattern.test(modelId)) {
            return {
                ...DEFAULT_MODEL_METADATA,
                modelType
            };
        }
    }

    // Return default metadata for unknown models
    return DEFAULT_MODEL_METADATA;
}

/**
 * Checks if a model is an LLM (language model) based on its ID.
 */
export function isLLMModel(modelId: string): boolean {
    const metadata = getModelMetadata(modelId);
    return metadata.modelType === 'llm';
}

/**
 * Checks if a model supports tool calling.
 */
export function supportsToolCalling(modelId: string): boolean {
    const metadata = getModelMetadata(modelId);
    return metadata.supportsToolCalling;
}

/**
 * Legacy compatibility: MODEL_METADATA_REGISTRY as a flat object.
 * This is kept for backwards compatibility but getModelMetadata() should be preferred.
 */
export const MODEL_METADATA_REGISTRY: Record<string, ModelMetadata> = {
    // This is now deprecated in favor of the hierarchical pattern matching.
    // The getModelMetadata() function provides more flexible matching.
};
