/**
 * Model metadata registry for LLM models.
 * This file contains pre-fetched model information from OpenRouter and HuggingFace Model Cards.
 * Used as fallback when /v1/models API doesn't provide complete information.
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
    maxInputTokens: 4096,
    maxOutputTokens: 4096,
    supportsToolCalling: false,
    supportsImageInput: false,
    modelType: 'llm'
};

/**
 * Pre-fetched model metadata registry.
 * Data sourced from OpenRouter API and HuggingFace Model Cards.
 * 
 * Note: Model IDs may vary between providers. This registry uses common naming patterns
 * and attempts to match by prefix for flexibility.
 */
export const MODEL_METADATA_REGISTRY: Record<string, ModelMetadata> = {
    // OpenAI GPT-4 family
    'gpt-4': {
        maxInputTokens: 8192,
        maxOutputTokens: 8192,
        supportsToolCalling: true,
        supportsImageInput: false,
        modelType: 'llm'
    },
    'gpt-4-32k': {
        maxInputTokens: 32768,
        maxOutputTokens: 32768,
        supportsToolCalling: true,
        supportsImageInput: false,
        modelType: 'llm'
    },
    'gpt-4-turbo': {
        maxInputTokens: 128000,
        maxOutputTokens: 4096,
        supportsToolCalling: true,
        supportsImageInput: true,
        modelType: 'llm'
    },
    'gpt-4-turbo-preview': {
        maxInputTokens: 128000,
        maxOutputTokens: 4096,
        supportsToolCalling: true,
        supportsImageInput: false,
        modelType: 'llm'
    },
    'gpt-4-vision-preview': {
        maxInputTokens: 128000,
        maxOutputTokens: 4096,
        supportsToolCalling: false,
        supportsImageInput: true,
        modelType: 'llm'
    },
    'gpt-4o': {
        maxInputTokens: 128000,
        maxOutputTokens: 16384,
        supportsToolCalling: true,
        supportsImageInput: true,
        modelType: 'llm'
    },
    'gpt-4o-mini': {
        maxInputTokens: 128000,
        maxOutputTokens: 16384,
        supportsToolCalling: true,
        supportsImageInput: true,
        modelType: 'llm'
    },
    'gpt-4.1': {
        maxInputTokens: 1047576,
        maxOutputTokens: 32768,
        supportsToolCalling: true,
        supportsImageInput: true,
        modelType: 'llm'
    },
    'gpt-4.1-mini': {
        maxInputTokens: 1047576,
        maxOutputTokens: 32768,
        supportsToolCalling: true,
        supportsImageInput: true,
        modelType: 'llm'
    },
    'gpt-4.1-nano': {
        maxInputTokens: 1047576,
        maxOutputTokens: 32768,
        supportsToolCalling: true,
        supportsImageInput: true,
        modelType: 'llm'
    },

    // OpenAI GPT-3.5 family
    'gpt-3.5-turbo': {
        maxInputTokens: 16385,
        maxOutputTokens: 4096,
        supportsToolCalling: true,
        supportsImageInput: false,
        modelType: 'llm'
    },
    'gpt-3.5-turbo-16k': {
        maxInputTokens: 16385,
        maxOutputTokens: 4096,
        supportsToolCalling: true,
        supportsImageInput: false,
        modelType: 'llm'
    },

    // OpenAI o1/o3 reasoning models
    'o1': {
        maxInputTokens: 200000,
        maxOutputTokens: 100000,
        supportsToolCalling: true,
        supportsImageInput: true,
        modelType: 'llm'
    },
    'o1-preview': {
        maxInputTokens: 128000,
        maxOutputTokens: 32768,
        supportsToolCalling: false,
        supportsImageInput: false,
        modelType: 'llm'
    },
    'o1-mini': {
        maxInputTokens: 128000,
        maxOutputTokens: 65536,
        supportsToolCalling: false,
        supportsImageInput: false,
        modelType: 'llm'
    },
    'o3': {
        maxInputTokens: 200000,
        maxOutputTokens: 100000,
        supportsToolCalling: true,
        supportsImageInput: true,
        modelType: 'llm'
    },
    'o3-mini': {
        maxInputTokens: 200000,
        maxOutputTokens: 100000,
        supportsToolCalling: true,
        supportsImageInput: false,
        modelType: 'llm'
    },
    'o4-mini': {
        maxInputTokens: 200000,
        maxOutputTokens: 100000,
        supportsToolCalling: true,
        supportsImageInput: true,
        modelType: 'llm'
    },

    // Anthropic Claude family
    'claude-3-opus': {
        maxInputTokens: 200000,
        maxOutputTokens: 4096,
        supportsToolCalling: true,
        supportsImageInput: true,
        modelType: 'llm'
    },
    'claude-3-sonnet': {
        maxInputTokens: 200000,
        maxOutputTokens: 4096,
        supportsToolCalling: true,
        supportsImageInput: true,
        modelType: 'llm'
    },
    'claude-3-haiku': {
        maxInputTokens: 200000,
        maxOutputTokens: 4096,
        supportsToolCalling: true,
        supportsImageInput: true,
        modelType: 'llm'
    },
    'claude-3.5-sonnet': {
        maxInputTokens: 200000,
        maxOutputTokens: 8192,
        supportsToolCalling: true,
        supportsImageInput: true,
        modelType: 'llm'
    },
    'claude-3.5-haiku': {
        maxInputTokens: 200000,
        maxOutputTokens: 8192,
        supportsToolCalling: true,
        supportsImageInput: true,
        modelType: 'llm'
    },
    'claude-3.7-sonnet': {
        maxInputTokens: 200000,
        maxOutputTokens: 128000,
        supportsToolCalling: true,
        supportsImageInput: true,
        modelType: 'llm'
    },
    'claude-sonnet-4': {
        maxInputTokens: 200000,
        maxOutputTokens: 64000,
        supportsToolCalling: true,
        supportsImageInput: true,
        modelType: 'llm'
    },
    'claude-2': {
        maxInputTokens: 100000,
        maxOutputTokens: 4096,
        supportsToolCalling: false,
        supportsImageInput: false,
        modelType: 'llm'
    },
    'claude-2.1': {
        maxInputTokens: 200000,
        maxOutputTokens: 4096,
        supportsToolCalling: true,
        supportsImageInput: false,
        modelType: 'llm'
    },
    'claude-instant': {
        maxInputTokens: 100000,
        maxOutputTokens: 4096,
        supportsToolCalling: false,
        supportsImageInput: false,
        modelType: 'llm'
    },

    // Google Gemini family
    'gemini-pro': {
        maxInputTokens: 32760,
        maxOutputTokens: 8192,
        supportsToolCalling: true,
        supportsImageInput: false,
        modelType: 'llm'
    },
    'gemini-pro-vision': {
        maxInputTokens: 16384,
        maxOutputTokens: 2048,
        supportsToolCalling: false,
        supportsImageInput: true,
        modelType: 'llm'
    },
    'gemini-1.5-pro': {
        maxInputTokens: 1048576,
        maxOutputTokens: 8192,
        supportsToolCalling: true,
        supportsImageInput: true,
        modelType: 'llm'
    },
    'gemini-1.5-flash': {
        maxInputTokens: 1048576,
        maxOutputTokens: 8192,
        supportsToolCalling: true,
        supportsImageInput: true,
        modelType: 'llm'
    },
    'gemini-2.0-flash': {
        maxInputTokens: 1048576,
        maxOutputTokens: 8192,
        supportsToolCalling: true,
        supportsImageInput: true,
        modelType: 'llm'
    },
    'gemini-2.5-pro': {
        maxInputTokens: 1048576,
        maxOutputTokens: 65536,
        supportsToolCalling: true,
        supportsImageInput: true,
        modelType: 'llm'
    },
    'gemini-2.5-flash': {
        maxInputTokens: 1048576,
        maxOutputTokens: 65536,
        supportsToolCalling: true,
        supportsImageInput: true,
        modelType: 'llm'
    },

    // Meta Llama family
    'llama-2-7b': {
        maxInputTokens: 4096,
        maxOutputTokens: 4096,
        supportsToolCalling: false,
        supportsImageInput: false,
        modelType: 'llm'
    },
    'llama-2-13b': {
        maxInputTokens: 4096,
        maxOutputTokens: 4096,
        supportsToolCalling: false,
        supportsImageInput: false,
        modelType: 'llm'
    },
    'llama-2-70b': {
        maxInputTokens: 4096,
        maxOutputTokens: 4096,
        supportsToolCalling: false,
        supportsImageInput: false,
        modelType: 'llm'
    },
    'llama-3-8b': {
        maxInputTokens: 8192,
        maxOutputTokens: 8192,
        supportsToolCalling: false,
        supportsImageInput: false,
        modelType: 'llm'
    },
    'llama-3-70b': {
        maxInputTokens: 8192,
        maxOutputTokens: 8192,
        supportsToolCalling: false,
        supportsImageInput: false,
        modelType: 'llm'
    },
    'llama-3.1-8b': {
        maxInputTokens: 131072,
        maxOutputTokens: 131072,
        supportsToolCalling: true,
        supportsImageInput: false,
        modelType: 'llm'
    },
    'llama-3.1-70b': {
        maxInputTokens: 131072,
        maxOutputTokens: 131072,
        supportsToolCalling: true,
        supportsImageInput: false,
        modelType: 'llm'
    },
    'llama-3.1-405b': {
        maxInputTokens: 131072,
        maxOutputTokens: 131072,
        supportsToolCalling: true,
        supportsImageInput: false,
        modelType: 'llm'
    },
    'llama-3.2-1b': {
        maxInputTokens: 131072,
        maxOutputTokens: 131072,
        supportsToolCalling: true,
        supportsImageInput: false,
        modelType: 'llm'
    },
    'llama-3.2-3b': {
        maxInputTokens: 131072,
        maxOutputTokens: 131072,
        supportsToolCalling: true,
        supportsImageInput: false,
        modelType: 'llm'
    },
    'llama-3.2-11b': {
        maxInputTokens: 131072,
        maxOutputTokens: 131072,
        supportsToolCalling: true,
        supportsImageInput: true,
        modelType: 'llm'
    },
    'llama-3.2-90b': {
        maxInputTokens: 131072,
        maxOutputTokens: 131072,
        supportsToolCalling: true,
        supportsImageInput: true,
        modelType: 'llm'
    },
    'llama-3.3-70b': {
        maxInputTokens: 131072,
        maxOutputTokens: 131072,
        supportsToolCalling: true,
        supportsImageInput: false,
        modelType: 'llm'
    },
    'llama-4-scout': {
        maxInputTokens: 524288,
        maxOutputTokens: 131072,
        supportsToolCalling: true,
        supportsImageInput: true,
        modelType: 'llm'
    },
    'llama-4-maverick': {
        maxInputTokens: 1048576,
        maxOutputTokens: 131072,
        supportsToolCalling: true,
        supportsImageInput: true,
        modelType: 'llm'
    },

    // Mistral family
    'mistral-7b': {
        maxInputTokens: 32768,
        maxOutputTokens: 32768,
        supportsToolCalling: false,
        supportsImageInput: false,
        modelType: 'llm'
    },
    'mistral-small': {
        maxInputTokens: 32768,
        maxOutputTokens: 32768,
        supportsToolCalling: true,
        supportsImageInput: false,
        modelType: 'llm'
    },
    'mistral-medium': {
        maxInputTokens: 32768,
        maxOutputTokens: 32768,
        supportsToolCalling: true,
        supportsImageInput: false,
        modelType: 'llm'
    },
    'mistral-large': {
        maxInputTokens: 128000,
        maxOutputTokens: 128000,
        supportsToolCalling: true,
        supportsImageInput: false,
        modelType: 'llm'
    },
    'mixtral-8x7b': {
        maxInputTokens: 32768,
        maxOutputTokens: 32768,
        supportsToolCalling: true,
        supportsImageInput: false,
        modelType: 'llm'
    },
    'mixtral-8x22b': {
        maxInputTokens: 65536,
        maxOutputTokens: 65536,
        supportsToolCalling: true,
        supportsImageInput: false,
        modelType: 'llm'
    },
    'codestral': {
        maxInputTokens: 32768,
        maxOutputTokens: 32768,
        supportsToolCalling: true,
        supportsImageInput: false,
        modelType: 'llm'
    },
    'pixtral': {
        maxInputTokens: 128000,
        maxOutputTokens: 128000,
        supportsToolCalling: true,
        supportsImageInput: true,
        modelType: 'llm'
    },

    // Cohere family
    'command': {
        maxInputTokens: 4096,
        maxOutputTokens: 4096,
        supportsToolCalling: false,
        supportsImageInput: false,
        modelType: 'llm'
    },
    'command-light': {
        maxInputTokens: 4096,
        maxOutputTokens: 4096,
        supportsToolCalling: false,
        supportsImageInput: false,
        modelType: 'llm'
    },
    'command-r': {
        maxInputTokens: 128000,
        maxOutputTokens: 4096,
        supportsToolCalling: true,
        supportsImageInput: false,
        modelType: 'llm'
    },
    'command-r-plus': {
        maxInputTokens: 128000,
        maxOutputTokens: 4096,
        supportsToolCalling: true,
        supportsImageInput: false,
        modelType: 'llm'
    },

    // Qwen family
    'qwen-7b': {
        maxInputTokens: 32768,
        maxOutputTokens: 32768,
        supportsToolCalling: false,
        supportsImageInput: false,
        modelType: 'llm'
    },
    'qwen-14b': {
        maxInputTokens: 32768,
        maxOutputTokens: 32768,
        supportsToolCalling: false,
        supportsImageInput: false,
        modelType: 'llm'
    },
    'qwen-72b': {
        maxInputTokens: 32768,
        maxOutputTokens: 32768,
        supportsToolCalling: false,
        supportsImageInput: false,
        modelType: 'llm'
    },
    'qwen-1.5-7b': {
        maxInputTokens: 32768,
        maxOutputTokens: 32768,
        supportsToolCalling: false,
        supportsImageInput: false,
        modelType: 'llm'
    },
    'qwen-1.5-14b': {
        maxInputTokens: 32768,
        maxOutputTokens: 32768,
        supportsToolCalling: false,
        supportsImageInput: false,
        modelType: 'llm'
    },
    'qwen-1.5-72b': {
        maxInputTokens: 32768,
        maxOutputTokens: 32768,
        supportsToolCalling: false,
        supportsImageInput: false,
        modelType: 'llm'
    },
    'qwen-2-7b': {
        maxInputTokens: 131072,
        maxOutputTokens: 131072,
        supportsToolCalling: true,
        supportsImageInput: false,
        modelType: 'llm'
    },
    'qwen-2-72b': {
        maxInputTokens: 131072,
        maxOutputTokens: 131072,
        supportsToolCalling: true,
        supportsImageInput: false,
        modelType: 'llm'
    },
    'qwen-2.5-7b': {
        maxInputTokens: 131072,
        maxOutputTokens: 8192,
        supportsToolCalling: true,
        supportsImageInput: false,
        modelType: 'llm'
    },
    'qwen-2.5-14b': {
        maxInputTokens: 131072,
        maxOutputTokens: 8192,
        supportsToolCalling: true,
        supportsImageInput: false,
        modelType: 'llm'
    },
    'qwen-2.5-32b': {
        maxInputTokens: 131072,
        maxOutputTokens: 8192,
        supportsToolCalling: true,
        supportsImageInput: false,
        modelType: 'llm'
    },
    'qwen-2.5-72b': {
        maxInputTokens: 131072,
        maxOutputTokens: 8192,
        supportsToolCalling: true,
        supportsImageInput: false,
        modelType: 'llm'
    },
    'qwen-2.5-coder-7b': {
        maxInputTokens: 131072,
        maxOutputTokens: 8192,
        supportsToolCalling: true,
        supportsImageInput: false,
        modelType: 'llm'
    },
    'qwen-2.5-coder-32b': {
        maxInputTokens: 131072,
        maxOutputTokens: 8192,
        supportsToolCalling: true,
        supportsImageInput: false,
        modelType: 'llm'
    },
    'qwen-3-8b': {
        maxInputTokens: 131072,
        maxOutputTokens: 8192,
        supportsToolCalling: true,
        supportsImageInput: false,
        modelType: 'llm'
    },
    'qwen-3-14b': {
        maxInputTokens: 131072,
        maxOutputTokens: 8192,
        supportsToolCalling: true,
        supportsImageInput: false,
        modelType: 'llm'
    },
    'qwen-3-32b': {
        maxInputTokens: 131072,
        maxOutputTokens: 8192,
        supportsToolCalling: true,
        supportsImageInput: false,
        modelType: 'llm'
    },
    'qwen-3-235b': {
        maxInputTokens: 131072,
        maxOutputTokens: 8192,
        supportsToolCalling: true,
        supportsImageInput: false,
        modelType: 'llm'
    },
    'qwq-32b': {
        maxInputTokens: 131072,
        maxOutputTokens: 131072,
        supportsToolCalling: true,
        supportsImageInput: false,
        modelType: 'llm'
    },
    'qvq-72b': {
        maxInputTokens: 131072,
        maxOutputTokens: 16384,
        supportsToolCalling: false,
        supportsImageInput: true,
        modelType: 'llm'
    },

    // DeepSeek family
    'deepseek-chat': {
        maxInputTokens: 65536,
        maxOutputTokens: 8192,
        supportsToolCalling: true,
        supportsImageInput: false,
        modelType: 'llm'
    },
    'deepseek-coder': {
        maxInputTokens: 65536,
        maxOutputTokens: 8192,
        supportsToolCalling: true,
        supportsImageInput: false,
        modelType: 'llm'
    },
    'deepseek-v2': {
        maxInputTokens: 65536,
        maxOutputTokens: 8192,
        supportsToolCalling: true,
        supportsImageInput: false,
        modelType: 'llm'
    },
    'deepseek-v2.5': {
        maxInputTokens: 65536,
        maxOutputTokens: 8192,
        supportsToolCalling: true,
        supportsImageInput: false,
        modelType: 'llm'
    },
    'deepseek-v3': {
        maxInputTokens: 65536,
        maxOutputTokens: 8192,
        supportsToolCalling: true,
        supportsImageInput: false,
        modelType: 'llm'
    },
    'deepseek-r1': {
        maxInputTokens: 65536,
        maxOutputTokens: 8192,
        supportsToolCalling: true,
        supportsImageInput: false,
        modelType: 'llm'
    },

    // Yi family
    'yi-34b': {
        maxInputTokens: 4096,
        maxOutputTokens: 4096,
        supportsToolCalling: false,
        supportsImageInput: false,
        modelType: 'llm'
    },
    'yi-large': {
        maxInputTokens: 32768,
        maxOutputTokens: 4096,
        supportsToolCalling: true,
        supportsImageInput: false,
        modelType: 'llm'
    },
    'yi-lightning': {
        maxInputTokens: 16384,
        maxOutputTokens: 4096,
        supportsToolCalling: true,
        supportsImageInput: false,
        modelType: 'llm'
    },

    // Phi family (Microsoft)
    'phi-2': {
        maxInputTokens: 2048,
        maxOutputTokens: 2048,
        supportsToolCalling: false,
        supportsImageInput: false,
        modelType: 'llm'
    },
    'phi-3-mini': {
        maxInputTokens: 128000,
        maxOutputTokens: 4096,
        supportsToolCalling: false,
        supportsImageInput: false,
        modelType: 'llm'
    },
    'phi-3-medium': {
        maxInputTokens: 128000,
        maxOutputTokens: 4096,
        supportsToolCalling: false,
        supportsImageInput: false,
        modelType: 'llm'
    },
    'phi-3.5-mini': {
        maxInputTokens: 128000,
        maxOutputTokens: 4096,
        supportsToolCalling: false,
        supportsImageInput: false,
        modelType: 'llm'
    },
    'phi-4': {
        maxInputTokens: 16384,
        maxOutputTokens: 16384,
        supportsToolCalling: true,
        supportsImageInput: false,
        modelType: 'llm'
    },

    // Embedding models (for filtering)
    'text-embedding-ada-002': {
        maxInputTokens: 8191,
        maxOutputTokens: 0,
        supportsToolCalling: false,
        supportsImageInput: false,
        modelType: 'embedding'
    },
    'text-embedding-3-small': {
        maxInputTokens: 8191,
        maxOutputTokens: 0,
        supportsToolCalling: false,
        supportsImageInput: false,
        modelType: 'embedding'
    },
    'text-embedding-3-large': {
        maxInputTokens: 8191,
        maxOutputTokens: 0,
        supportsToolCalling: false,
        supportsImageInput: false,
        modelType: 'embedding'
    },
    'embed-english-v3.0': {
        maxInputTokens: 512,
        maxOutputTokens: 0,
        supportsToolCalling: false,
        supportsImageInput: false,
        modelType: 'embedding'
    },
    'embed-multilingual-v3.0': {
        maxInputTokens: 512,
        maxOutputTokens: 0,
        supportsToolCalling: false,
        supportsImageInput: false,
        modelType: 'embedding'
    },

    // Rerank models (for filtering)
    'rerank-english-v3.0': {
        maxInputTokens: 4096,
        maxOutputTokens: 0,
        supportsToolCalling: false,
        supportsImageInput: false,
        modelType: 'rerank'
    },
    'rerank-multilingual-v3.0': {
        maxInputTokens: 4096,
        maxOutputTokens: 0,
        supportsToolCalling: false,
        supportsImageInput: false,
        modelType: 'rerank'
    },

    // Image generation models (for filtering)
    'dall-e-2': {
        maxInputTokens: 0,
        maxOutputTokens: 0,
        supportsToolCalling: false,
        supportsImageInput: false,
        modelType: 'image'
    },
    'dall-e-3': {
        maxInputTokens: 0,
        maxOutputTokens: 0,
        supportsToolCalling: false,
        supportsImageInput: false,
        modelType: 'image'
    },
    'stable-diffusion': {
        maxInputTokens: 0,
        maxOutputTokens: 0,
        supportsToolCalling: false,
        supportsImageInput: false,
        modelType: 'image'
    },
    'midjourney': {
        maxInputTokens: 0,
        maxOutputTokens: 0,
        supportsToolCalling: false,
        supportsImageInput: false,
        modelType: 'image'
    },

    // Audio models (for filtering)
    'whisper-1': {
        maxInputTokens: 0,
        maxOutputTokens: 0,
        supportsToolCalling: false,
        supportsImageInput: false,
        modelType: 'audio'
    },
    'tts-1': {
        maxInputTokens: 4096,
        maxOutputTokens: 0,
        supportsToolCalling: false,
        supportsImageInput: false,
        modelType: 'audio'
    },
    'tts-1-hd': {
        maxInputTokens: 4096,
        maxOutputTokens: 0,
        supportsToolCalling: false,
        supportsImageInput: false,
        modelType: 'audio'
    }
};

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
    { pattern: /flux/i, modelType: 'image' },
    { pattern: /playground-v/i, modelType: 'image' },
    { pattern: /ideogram/i, modelType: 'image' },
    { pattern: /recraft/i, modelType: 'image' },
    
    // Audio models
    { pattern: /whisper/i, modelType: 'audio' },
    { pattern: /tts-/i, modelType: 'audio' },
    { pattern: /speech/i, modelType: 'audio' },
    { pattern: /audio/i, modelType: 'audio' },
    { pattern: /voice/i, modelType: 'audio' },
    
    // Moderation models
    { pattern: /moderation/i, modelType: 'other' },
    { pattern: /content-filter/i, modelType: 'other' },
    
    // Instruct/base variants - these are typically still LLM, so not included
];

/**
 * Normalizes a model ID to match registry entries.
 * Handles common naming variations across providers.
 */
function normalizeModelId(modelId: string): string {
    return modelId
        .toLowerCase()
        .replace(/^(openai\/|anthropic\/|google\/|meta-llama\/|mistralai\/|cohere\/|qwen\/|deepseek-ai\/|microsoft\/|01-ai\/)/, '')
        .replace(/-instruct$/, '')
        .replace(/-chat$/, '')
        .replace(/-preview$/, '')
        .replace(/-latest$/, '')
        .replace(/:free$/, '')
        .replace(/:extended$/, '')
        .replace(/@\d{4}-\d{2}-\d{2}$/, '')
        .replace(/[-_](\d{8})$/, '');
}

/**
 * Gets metadata for a model, first trying exact match, then normalized match,
 * then pattern matching for known model families.
 */
export function getModelMetadata(modelId: string): ModelMetadata {
    // Try exact match first
    if (MODEL_METADATA_REGISTRY[modelId]) {
        return MODEL_METADATA_REGISTRY[modelId];
    }

    // Try normalized match
    const normalized = normalizeModelId(modelId);
    if (MODEL_METADATA_REGISTRY[normalized]) {
        return MODEL_METADATA_REGISTRY[normalized];
    }

    // Try prefix matching for model families
    for (const [key, metadata] of Object.entries(MODEL_METADATA_REGISTRY)) {
        if (normalized.startsWith(key) || normalized.includes(key)) {
            return metadata;
        }
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
