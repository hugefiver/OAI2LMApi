/**
 * Gemini API Client
 * 
 * This client implements the Google Gemini API protocol with support for:
 * - Streaming chat completions
 * - Tool calling (function calling in Gemini terminology)
 * - Image input (inline data)
 * - Chain-of-thought thinking with thoughtSignature and thinkingLevel
 * 
 * Reference: https://ai.google.dev/gemini-api/docs
 */

export interface GeminiConfig {
    apiEndpoint: string;
    apiKey: string;
}

/**
 * Model information returned from the Gemini /models API
 */
export interface GeminiModelInfo {
    name: string;
    baseModelId?: string;
    version?: string;
    displayName: string;
    description?: string;
    inputTokenLimit?: number;
    outputTokenLimit?: number;
    supportedGenerationMethods: string[];
    /** Supported actions - used to determine function calling support */
    supportedActions?: string[];
}

/**
 * Gemini content part types
 */
export interface GeminiTextPart {
    text: string;
}

export interface GeminiInlineDataPart {
    inlineData: {
        mimeType: string;
        data: string; // base64 encoded
    };
}

export interface GeminiFunctionCallPart {
    functionCall: {
        name: string;
        args: Record<string, unknown>;
    };
}

export interface GeminiFunctionResponsePart {
    functionResponse: {
        name: string;
        response: Record<string, unknown>;
    };
}

export interface GeminiThoughtPart {
    thought: boolean;
    text: string;
}

export type GeminiPart = GeminiTextPart | GeminiInlineDataPart | GeminiFunctionCallPart | GeminiFunctionResponsePart | GeminiThoughtPart;

export interface GeminiContent {
    role: 'user' | 'model';
    parts: GeminiPart[];
}

/**
 * Gemini tool definition
 */
export interface GeminiFunctionDeclaration {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
}

export interface GeminiTool {
    functionDeclarations: GeminiFunctionDeclaration[];
}

/**
 * Gemini tool config
 */
export interface GeminiToolConfig {
    functionCallingConfig?: {
        mode: 'AUTO' | 'ANY' | 'NONE';
        allowedFunctionNames?: string[];
    };
}

/**
 * Gemini generation config
 */
export interface GeminiGenerationConfig {
    temperature?: number;
    topK?: number;
    topP?: number;
    maxOutputTokens?: number;
    stopSequences?: string[];
    responseMimeType?: string;
    responseSchema?: Record<string, unknown>;
    thinkingConfig?: {
        thinkingBudget?: number;
        thinkingLevel?: 'LOW' | 'MEDIUM' | 'HIGH' | 'NONE';
        includeThoughts?: boolean;
    };
}

/**
 * Gemini request for generateContent
 */
export interface GeminiGenerateContentRequest {
    contents: GeminiContent[];
    tools?: GeminiTool[];
    toolConfig?: GeminiToolConfig;
    generationConfig?: GeminiGenerationConfig;
    systemInstruction?: {
        parts: GeminiTextPart[];
    };
}

/**
 * Gemini response candidate
 */
export interface GeminiCandidate {
    content: GeminiContent;
    finishReason?: string;
    index?: number;
    safetyRatings?: Array<{
        category: string;
        probability: string;
    }>;
}

/**
 * Gemini response for generateContent
 */
export interface GeminiGenerateContentResponse {
    candidates?: GeminiCandidate[];
    promptFeedback?: {
        blockReason?: string;
        safetyRatings?: Array<{
            category: string;
            probability: string;
        }>;
    };
    usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        totalTokenCount?: number;
        thoughtsTokenCount?: number;
    };
    modelVersion?: string;
}

/**
 * Streaming chunk from Gemini streamGenerateContent
 */
export interface GeminiStreamChunk {
    candidates?: Array<{
        content?: {
            role?: string;
            parts?: Array<{
                text?: string;
                thought?: boolean;
                functionCall?: {
                    name: string;
                    args: Record<string, unknown>;
                };
            }>;
        };
        finishReason?: string;
    }>;
    usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        totalTokenCount?: number;
        thoughtsTokenCount?: number;
    };
    modelVersion?: string;
}

/**
 * Represents a completed tool call from Gemini
 */
export interface GeminiCompletedToolCall {
    id: string;
    name: string;
    arguments: string;
}

/**
 * Thinking configuration for Gemini API.
 * Supports both thinkingBudget (number of tokens) and thinkingLevel (low/medium/high/auto).
 */
export interface GeminiThinkingConfig {
    /** Number of tokens for thinking budget. If provided, takes precedence over thinkingLevel. */
    thinkingBudget?: number;
    /** Thinking level: 'low', 'medium', 'high', 'auto', or 'none' */
    thinkingLevel?: 'none' | 'low' | 'medium' | 'high' | 'auto';
    /** Whether to include thoughts in the response. */
    includeThoughts?: boolean;
}

/**
 * Stream options for Gemini streaming
 */
export interface GeminiStreamOptions {
    onChunk?: (chunk: string) => void;
    onThinkingChunk?: (chunk: string, thoughtSignature?: string) => void;
    onToolCallsComplete?: (toolCalls: GeminiCompletedToolCall[]) => void;
    signal?: AbortSignal;
    tools?: GeminiFunctionDeclaration[];
    toolMode?: 'auto' | 'required' | 'none';
    maxTokens?: number;
    /** Thinking configuration. Can be a budget number, a level string, or a full config object. */
    thinking?: number | string | GeminiThinkingConfig;
}

/**
 * Normalizes the API endpoint URL by removing trailing slashes.
 */
function normalizeApiEndpoint(endpoint: string): string {
    return endpoint.replace(/\/+$/, '');
}

/**
 * Parses model name from full resource path.
 * e.g., "models/gemini-2.0-flash" -> "gemini-2.0-flash"
 */
function parseModelName(fullName: string): string {
    if (fullName.startsWith('models/')) {
        return fullName.substring(7);
    }
    return fullName;
}

/**
 * Parses thinking configuration from various input formats.
 * 
 * @param thinking - Can be:
 *   - A number: Used as thinkingBudget directly
 *   - A string: 'low', 'medium', 'high', 'auto', or 'none' for thinkingLevel
 *   - An object: { thinkingBudget?: number, thinkingLevel?: string, includeThoughts?: boolean }
 * 
 * @returns The thinkingConfig object for Gemini API, or undefined if thinking is disabled.
 */
function parseThinkingConfig(thinking: number | string | GeminiThinkingConfig | undefined): GeminiGenerationConfig['thinkingConfig'] | undefined {
    if (thinking === undefined || thinking === null) {
        return undefined;
    }

    // If it's a number, use it as thinkingBudget
    if (typeof thinking === 'number') {
        if (thinking <= 0) {
            return undefined;
        }
        return {
            thinkingBudget: thinking,
            includeThoughts: true
        };
    }

    // If it's a string, map to thinkingLevel
    if (typeof thinking === 'string') {
        const level = thinking.toLowerCase();
        if (level === 'none' || level === '') {
            return undefined;
        }
        const levelMap: Record<string, 'LOW' | 'MEDIUM' | 'HIGH' | undefined> = {
            'low': 'LOW',
            'medium': 'MEDIUM',
            'high': 'HIGH',
            'auto': undefined // auto means let API decide
        };
        const mappedLevel = levelMap[level];
        if (level === 'auto') {
            return { includeThoughts: true };
        }
        if (mappedLevel) {
            return {
                thinkingLevel: mappedLevel,
                includeThoughts: true
            };
        }
        return undefined;
    }

    // If it's an object, process thinkingConfig
    if (typeof thinking === 'object') {
        const config = thinking as GeminiThinkingConfig;
        
        // If thinkingBudget is provided as a number, use it
        if (typeof config.thinkingBudget === 'number' && config.thinkingBudget > 0) {
            return {
                thinkingBudget: config.thinkingBudget,
                includeThoughts: config.includeThoughts ?? true
            };
        }

        // Otherwise, use thinkingLevel
        if (config.thinkingLevel && config.thinkingLevel !== 'none') {
            const levelMap: Record<string, 'LOW' | 'MEDIUM' | 'HIGH' | undefined> = {
                'low': 'LOW',
                'medium': 'MEDIUM',
                'high': 'HIGH',
                'auto': undefined
            };
            const mappedLevel = levelMap[config.thinkingLevel];
            if (config.thinkingLevel === 'auto') {
                return { includeThoughts: config.includeThoughts ?? true };
            }
            if (mappedLevel) {
                return {
                    thinkingLevel: mappedLevel,
                    includeThoughts: config.includeThoughts ?? true
                };
            }
        }
    }

    return undefined;
}

export class GeminiClient {
    private config: GeminiConfig;

    constructor(config: GeminiConfig) {
        this.config = config;
    }

    /**
     * List available models from the Gemini API.
     * First tries /v1beta/models, then falls back to /v1/models (OpenAI compatible).
     */
    async listModels(): Promise<GeminiModelInfo[]> {
        const endpoint = normalizeApiEndpoint(this.config.apiEndpoint);
        
        // Try v1beta first (Gemini native)
        const v1betaUrl = endpoint.includes('/v1beta') 
            ? `${endpoint}/models` 
            : `${endpoint}/v1beta/models`;
        
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
            console.log('GeminiClient: v1beta/models failed, trying v1/models fallback');
        } catch (error) {
            console.debug('GeminiClient: v1beta/models request failed:', error);
        }

        // Fallback to /v1/models (OpenAI compatible)
        const v1Url = `${endpoint}/v1/models`;
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
            console.error('GeminiClient: Failed to list models from both endpoints:', error);
            throw error;
        }
    }

    /**
     * Stream chat completion from Gemini API.
     * Uses X-Goog-Api-Key header for authentication (more secure than URL query parameter).
     */
    async streamChatCompletion(
        contents: GeminiContent[],
        model: string,
        systemInstruction: string | undefined,
        options: GeminiStreamOptions
    ): Promise<string> {
        const endpoint = normalizeApiEndpoint(this.config.apiEndpoint);
        const modelPath = model.startsWith('models/') ? model : `models/${model}`;
        
        // Build URL - use v1beta if not already specified in endpoint
        const baseUrl = endpoint.includes('/v1beta') ? endpoint : `${endpoint}/v1beta`;
        const url = `${baseUrl}/${modelPath}:streamGenerateContent?alt=sse`;

        const request: GeminiGenerateContentRequest = {
            contents
        };

        // Add system instruction if provided
        if (systemInstruction) {
            request.systemInstruction = {
                parts: [{ text: systemInstruction }]
            };
        }

        // Add tools if provided
        if (options.tools && options.tools.length > 0) {
            request.tools = [{
                functionDeclarations: options.tools
            }];

            // Add tool config based on mode
            if (options.toolMode) {
                let mode: 'AUTO' | 'ANY' | 'NONE' = 'AUTO';
                switch (options.toolMode) {
                    case 'auto':
                        mode = 'AUTO';
                        break;
                    case 'required':
                        mode = 'ANY';
                        break;
                    case 'none':
                        mode = 'NONE';
                        break;
                }
                request.toolConfig = {
                    functionCallingConfig: { mode }
                };
            }
        }

        // Add generation config
        const generationConfig: GeminiGenerationConfig = {};
        if (options.maxTokens) {
            generationConfig.maxOutputTokens = options.maxTokens;
        }

        // Add thinking config
        const thinkingConfig = parseThinkingConfig(options.thinking);
        if (thinkingConfig) {
            generationConfig.thinkingConfig = thinkingConfig;
        }

        if (Object.keys(generationConfig).length > 0) {
            request.generationConfig = generationConfig;
        }

        let fullContent = '';
        const toolCalls: GeminiCompletedToolCall[] = [];
        let toolCallIndex = 0;
        let currentThoughtSignature: string | undefined;

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Goog-Api-Key': this.config.apiKey
                },
                body: JSON.stringify(request),
                signal: options.signal
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Gemini API error: ${response.status} ${response.statusText} - ${errorText}`);
            }

            if (!response.body) {
                throw new Error('Response body is null');
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                if (options.signal?.aborted) {
                    break;
                }

                const { done, value } = await reader.read();
                if (done) {
                    break;
                }

                buffer += decoder.decode(value, { stream: true });

                // Process SSE events - handle double-newline event separators
                // SSE format: events separated by double newlines, each line can be "data: ..."
                const events = buffer.split(/\n\n/);
                buffer = events.pop() || ''; // Keep incomplete event in buffer

                for (const event of events) {
                    const lines = event.split('\n');
                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            const jsonStr = line.substring(6).trim();
                            if (!jsonStr || jsonStr === '[DONE]') {
                                continue;
                            }

                            try {
                                const chunk: GeminiStreamChunk = JSON.parse(jsonStr);
                                const candidate = chunk.candidates?.[0];
                                const parts = candidate?.content?.parts;

                                // Extract thoughtSignature from chunk metadata if available
                                const chunkAny = chunk as Record<string, unknown>;
                                if (chunkAny.thoughtSignature && typeof chunkAny.thoughtSignature === 'string') {
                                    currentThoughtSignature = chunkAny.thoughtSignature;
                                }

                                if (parts) {
                                    for (const part of parts) {
                                        if (part.thought && part.text) {
                                            // This is thinking/reasoning content
                                            options.onThinkingChunk?.(part.text, currentThoughtSignature);
                                        } else if (part.text && !part.thought) {
                                            // Regular text content
                                            fullContent += part.text;
                                            options.onChunk?.(part.text);
                                        } else if (part.functionCall) {
                                            // Tool/function call
                                            const funcCall = part.functionCall;
                                            const callId = `gemini_call_${Date.now()}_${toolCallIndex++}_${Math.random().toString(36).slice(2, 8)}`;
                                            toolCalls.push({
                                                id: callId,
                                                name: funcCall.name,
                                                arguments: JSON.stringify(funcCall.args)
                                            });
                                        }
                                    }
                                }
                            } catch (parseError) {
                                // Log parse errors - could indicate API response format issues
                                console.warn('GeminiClient: Failed to parse chunk:', parseError);
                            }
                        }
                    }
                }
            }

            // Report completed tool calls
            if (toolCalls.length > 0 && options.onToolCallsComplete) {
                options.onToolCallsComplete(toolCalls);
            }

            return fullContent;
        } catch (error: unknown) {
            if ((error as Error)?.name === 'AbortError' || options.signal?.aborted) {
                return fullContent;
            }

            console.error('GeminiClient: Stream error:', error);
            throw error;
        }
    }

    /**
     * Non-streaming chat completion.
     * Uses X-Goog-Api-Key header for authentication (more secure than URL query parameter).
     */
    async generateContent(
        contents: GeminiContent[],
        model: string,
        systemInstruction: string | undefined,
        options?: {
            tools?: GeminiFunctionDeclaration[];
            toolMode?: 'auto' | 'required' | 'none';
            maxTokens?: number;
            thinking?: number | string | GeminiThinkingConfig;
        }
    ): Promise<GeminiGenerateContentResponse> {
        const endpoint = normalizeApiEndpoint(this.config.apiEndpoint);
        const modelPath = model.startsWith('models/') ? model : `models/${model}`;
        
        // Build URL - use v1beta if not already specified in endpoint
        const baseUrl = endpoint.includes('/v1beta') ? endpoint : `${endpoint}/v1beta`;
        const url = `${baseUrl}/${modelPath}:generateContent`;

        const request: GeminiGenerateContentRequest = {
            contents
        };

        if (systemInstruction) {
            request.systemInstruction = {
                parts: [{ text: systemInstruction }]
            };
        }

        if (options?.tools && options.tools.length > 0) {
            request.tools = [{
                functionDeclarations: options.tools
            }];

            if (options.toolMode) {
                let mode: 'AUTO' | 'ANY' | 'NONE' = 'AUTO';
                switch (options.toolMode) {
                    case 'auto':
                        mode = 'AUTO';
                        break;
                    case 'required':
                        mode = 'ANY';
                        break;
                    case 'none':
                        mode = 'NONE';
                        break;
                }
                request.toolConfig = {
                    functionCallingConfig: { mode }
                };
            }
        }

        const generationConfig: GeminiGenerationConfig = {};
        if (options?.maxTokens) {
            generationConfig.maxOutputTokens = options.maxTokens;
        }

        const thinkingConfig = parseThinkingConfig(options?.thinking);
        if (thinkingConfig) {
            generationConfig.thinkingConfig = thinkingConfig;
        }

        if (Object.keys(generationConfig).length > 0) {
            request.generationConfig = generationConfig;
        }

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': this.config.apiKey
            },
            body: JSON.stringify(request)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Gemini API error: ${response.status} ${response.statusText} - ${errorText}`);
        }

        return await response.json() as GeminiGenerateContentResponse;
    }

    /**
     * Count tokens using Gemini's countTokens API.
     */
    async countTokens(
        contents: GeminiContent[],
        model: string,
        systemInstruction?: string
    ): Promise<number> {
        const endpoint = normalizeApiEndpoint(this.config.apiEndpoint);
        const modelPath = model.startsWith('models/') ? model : `models/${model}`;
        
        // Build URL - use v1beta if not already specified in endpoint
        const baseUrl = endpoint.includes('/v1beta') ? endpoint : `${endpoint}/v1beta`;
        const url = `${baseUrl}/${modelPath}:countTokens`;

        const request: { contents: GeminiContent[]; systemInstruction?: { parts: GeminiTextPart[] } } = {
            contents
        };

        if (systemInstruction) {
            request.systemInstruction = {
                parts: [{ text: systemInstruction }]
            };
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
                // Fall back to estimation if API fails
                console.warn('GeminiClient: countTokens API failed, using estimation');
                return this.estimateTokens(contents);
            }

            const data = await response.json() as { totalTokens: number };
            return data.totalTokens || 0;
        } catch (error) {
            console.warn('GeminiClient: countTokens request failed:', error);
            return this.estimateTokens(contents);
        }
    }

    /**
     * Estimate token count based on text length.
     * Fallback when countTokens API is unavailable.
     */
    private estimateTokens(contents: GeminiContent[]): number {
        let totalChars = 0;
        for (const content of contents) {
            for (const part of content.parts) {
                if ('text' in part && typeof part.text === 'string') {
                    totalChars += part.text.length;
                }
            }
        }
        // Rough estimation: ~3 characters per token (compromise between English and CJK)
        return Math.ceil(totalChars / 3);
    }

    updateConfig(config: GeminiConfig): void {
        this.config = config;
    }
}

/**
 * Helper function to extract model ID from Gemini model info
 */
export function getGeminiModelId(model: GeminiModelInfo): string {
    return parseModelName(model.name);
}

/**
 * Helper function to check if a Gemini model supports text generation
 */
export function supportsTextGeneration(model: GeminiModelInfo): boolean {
    return model.supportedGenerationMethods.includes('generateContent');
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
    if (model.supportedActions && model.supportedActions.length > 0) {
        return model.supportedActions.some(action => 
            action.toLowerCase().includes('function') || 
            action.toLowerCase().includes('tool')
        );
    }

    // Fall back to heuristics based on model name and generation methods
    const modelId = getGeminiModelId(model).toLowerCase();
    
    // Models that don't support function calling
    const nonFunctionCallingPatterns = [
        'embedding',
        'aqa',
        'imagen',
        'veo',
        'musicfx'
    ];
    
    const isExcluded = nonFunctionCallingPatterns.some(pattern => 
        modelId.includes(pattern)
    );

    return model.supportedGenerationMethods.includes('generateContent') && !isExcluded;
}
