/**
 * Gemini API Client
 * 
 * Uses @ai-sdk/google for chat completions (streaming and non-streaming).
 * Model listing and token counting still use direct API calls since the SDK
 * doesn't expose these endpoints.
 * 
 * Reference: https://ai.google.dev/gemini-api/docs
 */

import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { GoogleGenerativeAIProvider } from '@ai-sdk/google';
import type { LanguageModelV2 } from '@ai-sdk/provider';
import { logger } from './logger';

export interface GeminiConfig {
    apiEndpoint: string;
    apiKey: string;
}

/**
 * Model information returned from the Gemini /models API.
 * Note: Some Gemini endpoints may return null or missing values for many fields.
 */
export interface GeminiModelInfo {
    /** Model resource name (e.g., "models/gemini-2.0-flash"). May be null in some API responses. */
    name?: string | null;
    baseModelId?: string | null;
    version?: string | null;
    /** Display name for the model. May be null in some API responses. */
    displayName?: string | null;
    description?: string | null;
    inputTokenLimit?: number | null;
    outputTokenLimit?: number | null;
    /** Supported generation methods. May be null in some API responses. */
    supportedGenerationMethods?: string[] | null;
    /** Supported actions - used to determine function calling support */
    supportedActions?: string[] | null;
}

/**
 * Normalizes the API endpoint URL by removing trailing slashes.
 */
function normalizeApiEndpoint(endpoint: string): string {
    return endpoint.replace(/\/+$/, '');
}

const V1BETA_PATTERN = /\/v1beta(?:\/|$)/;
const V1_PATTERN = /\/v1(?:\/|$)/;

function hasVersionPath(endpoint: string): boolean {
    return V1BETA_PATTERN.test(endpoint) || V1_PATTERN.test(endpoint);
}

function getV1BetaBaseUrl(endpoint: string): string {
    const normalized = normalizeApiEndpoint(endpoint);
    if (V1BETA_PATTERN.test(normalized)) {
        return normalized;
    }
    if (V1_PATTERN.test(normalized)) {
        return normalized.replace(/\/v1(?=\/|$)/, '/v1beta');
    }
    return `${normalized}/v1beta`;
}

/**
 * Parses model name from full resource path.
 * e.g., "models/gemini-2.0-flash" -> "gemini-2.0-flash"
 */
function parseModelName(fullName: string | null | undefined): string {
    if (!fullName) {
        return '';
    }
    if (fullName.startsWith('models/')) {
        return fullName.substring(7);
    }
    return fullName;
}

type GeminiCountTokensPart =
    | { text: string }
    | { inlineData: { mimeType: string; data: string } }
    | { functionCall: { name: string; args: Record<string, unknown> } };

export interface GeminiCountTokensContent {
    role: string;
    parts: GeminiCountTokensPart[];
}

export class GeminiClient {
    private config: GeminiConfig;
    private provider: GoogleGenerativeAIProvider;

    constructor(config: GeminiConfig) {
        this.config = config;
        this.provider = createGoogleGenerativeAI({
            apiKey: config.apiKey,
            baseURL: getV1BetaBaseUrl(config.apiEndpoint),
        });
    }

    /**
     * Get an AI SDK language model instance for the given model ID.
     * The returned model can be used with doStream() and doGenerate().
     */
    getModel(modelId: string): LanguageModelV2 {
        return this.provider(modelId);
    }

    /**
     * List available models from the Gemini API.
     * First tries /v1beta/models, then falls back to /v1/models (OpenAI compatible).
     * 
     * Note: Model listing is not available through the AI SDK, so we use direct API calls.
     */
    async listModels(): Promise<GeminiModelInfo[]> {
        const endpoint = normalizeApiEndpoint(this.config.apiEndpoint);
        const v1betaBase = getV1BetaBaseUrl(endpoint);
        const v1betaUrl = `${v1betaBase}/models`;
        
        try {
            const response = await fetch(v1betaUrl, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Goog-Api-Key': this.config.apiKey
                }
            });

            if (response.ok) {
                const data = await response.json() as { models: GeminiModelInfo[] };
                return data.models || [];
            }
            
            // If v1beta fails, try v1/models (OpenAI compatible format)
            logger.debug('v1beta/models failed, trying v1/models fallback', undefined, 'Gemini');
        } catch (error) {
            logger.debug('v1beta/models request failed', undefined, 'Gemini');
        }

        // Fallback to /v1/models (OpenAI compatible)
        const baseEndpoint = endpoint.replace(/\/v1(?:beta)?$/, '');
        const v1Url = `${baseEndpoint}/v1/models`;
        try {
            const response = await fetch(v1Url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.config.apiKey}`
                }
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Failed to list models: ${response.status} ${response.statusText} - ${errorText}`);
            }

            // OpenAI format response
            const data = await response.json() as { data: Array<{ id: string; object: string }> };
            // Convert to GeminiModelInfo format
            return (data.data || []).map(m => ({
                name: `models/${m.id}`,
                displayName: m.id,
                supportedGenerationMethods: ['generateContent']
            }));
        } catch (error) {
            logger.error('Failed to list models from both endpoints', error, 'Gemini');
            throw error;
        }
    }

    /**
     * Count tokens using Gemini's countTokens API.
     * Falls back to estimation if the API is unavailable.
     * 
     * Note: Token counting is not available through the AI SDK, so we use direct API calls.
     * 
     * @param text - Text content to count tokens for
     * @param model - Model ID (without "models/" prefix)
     * @param systemInstruction - Optional system instruction
     */
    async countTokens(
        textOrContents: string | GeminiCountTokensContent[],
        model: string,
        systemInstruction?: string
    ): Promise<number> {
        const endpoint = normalizeApiEndpoint(this.config.apiEndpoint);
        const modelPath = model.startsWith('models/') ? model : `models/${model}`;
        
        const baseUrl = getV1BetaBaseUrl(endpoint);
        const url = `${baseUrl}/${modelPath}:countTokens`;

        const contents = typeof textOrContents === 'string'
            ? [{ role: 'user', parts: [{ text: textOrContents }] }]
            : textOrContents;

        const request: Record<string, unknown> = { contents };

        if (systemInstruction) {
            request.systemInstruction = { parts: [{ text: systemInstruction }] };
        }

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Goog-Api-Key': this.config.apiKey
                },
                body: JSON.stringify(request)
            });

            if (!response.ok) {
                logger.debug('countTokens API failed, using estimation', undefined, 'Gemini');
                return this.estimateTokensFromContents(contents);
            }

            const data = await response.json() as { totalTokens: number };
            return data.totalTokens || 0;
        } catch (error) {
            logger.debug('countTokens request failed', undefined, 'Gemini');
            return this.estimateTokensFromContents(contents);
        }
    }

    private estimateTokensFromContents(contents: GeminiCountTokensContent[]): number {
        let totalText = '';
        for (const content of contents) {
            for (const part of content.parts) {
                if ('text' in part) {
                    totalText += part.text;
                }
            }
        }
        return this.estimateTokens(totalText);
    }

    /**
     * Estimate token count based on text length.
     * Fallback when countTokens API is unavailable.
     */
    private estimateTokens(text: string): number {
        // Rough estimation: ~3 characters per token (compromise between English and CJK)
        return Math.ceil(text.length / 3);
    }

    updateConfig(config: GeminiConfig): void {
        this.config = config;
        this.provider = createGoogleGenerativeAI({
            apiKey: config.apiKey,
            baseURL: getV1BetaBaseUrl(config.apiEndpoint),
        });
    }
}

/**
 * Helper function to extract model ID from Gemini model info.
 * Falls back to displayName if name is missing or empty.
 */
export function getGeminiModelId(model: GeminiModelInfo): string {
    // Try name first
    const nameFromName = parseModelName(model.name);
    if (nameFromName) {
        return nameFromName;
    }
    // Fall back to displayName
    return parseModelName(model.displayName);
}

/**
 * Helper function to check if a Gemini model supports text generation.
 * If supportedGenerationMethods is null/undefined, uses model name heuristics.
 */
export function supportsTextGeneration(model: GeminiModelInfo): boolean {
    // If the API provides supportedGenerationMethods, use it
    if (Array.isArray(model.supportedGenerationMethods)) {
        return model.supportedGenerationMethods.includes('generateContent');
    }
    
    // If supportedGenerationMethods is null/undefined, use name-based heuristics
    const modelId = getGeminiModelId(model);
    if (!modelId) {
        return false;
    }
    
    const lowerModelId = modelId.toLowerCase();
    
    // Known non-text-generation model patterns
    const nonTextPatterns = [
        'embedding',
        'aqa',
        'imagen',
        'veo',
        'musicfx'
    ];
    
    const isExcluded = nonTextPatterns.some(pattern => lowerModelId.includes(pattern));
    
    // Assume Gemini models support text generation unless excluded, but log that this is heuristic
    const inferredSupportsText = lowerModelId.includes('gemini') && !isExcluded;
    logger.debug(
        `supportsTextGeneration falling back to heuristic for model ${modelId} - inferred supports text = ${inferredSupportsText}`,
        undefined,
        'Gemini'
    );
    return inferredSupportsText;
}

/**
 * Helper function to check if a Gemini model supports function calling.
 * 
 * Checks in order:
 * 1. If API provides supportedActions, look for 'functionCalling' or 'tools'
 * 2. If model supports generateContent, assume function calling is supported
 *    (except for known non-function-calling models like embedding, aqa, imagen)
 */
export function supportsGeminiFunctionCalling(model: GeminiModelInfo): boolean {
    // Check if API explicitly provides function calling capability
    if (Array.isArray(model.supportedActions) && model.supportedActions.length > 0) {
        return model.supportedActions.some(action => 
            action.toLowerCase().includes('function') || 
            action.toLowerCase().includes('tool')
        );
    }

    // Fall back to heuristics based on model name and generation methods
    const modelId = getGeminiModelId(model);
    if (!modelId) {
        return false;
    }
    const lowerModelId = modelId.toLowerCase();
    
    // Models that don't support function calling
    const nonFunctionCallingPatterns = [
        'embedding',
        'aqa',
        'imagen',
        'veo',
        'musicfx'
    ];
    
    const isExcluded = nonFunctionCallingPatterns.some(pattern => 
        lowerModelId.includes(pattern)
    );

    return supportsTextGeneration(model) && !isExcluded;
}
