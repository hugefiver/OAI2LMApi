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
    thinkingLevel?: 'none' | 'low' | 'medium' | 'high';
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
 * Maps thinkingLevel to thinkingBudget tokens.
 * Reference: https://ai.google.dev/gemini-api/docs/thinking
 */
function getThinkingBudget(level: 'none' | 'low' | 'medium' | 'high' | undefined): number | undefined {
    if (!level || level === 'none') {
        return undefined;
    }
    switch (level) {
        case 'low':
            return 1024;
        case 'medium':
            return 8192;
        case 'high':
            return 24576;
        default:
            return undefined;
    }
}

export class GeminiClient {
    private config: GeminiConfig;

    constructor(config: GeminiConfig) {
        this.config = config;
    }

    /**
     * List available models from the Gemini API
     */
    async listModels(): Promise<GeminiModelInfo[]> {
        const endpoint = normalizeApiEndpoint(this.config.apiEndpoint);
        const url = `${endpoint}/models?key=${this.config.apiKey}`;

        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Failed to list models: ${response.status} ${response.statusText} - ${errorText}`);
            }

            const data = await response.json() as { models: GeminiModelInfo[] };
            return data.models || [];
        } catch (error) {
            console.error('GeminiClient: Failed to list models:', error);
            throw error;
        }
    }

    /**
     * Stream chat completion from Gemini API
     */
    async streamChatCompletion(
        contents: GeminiContent[],
        model: string,
        systemInstruction: string | undefined,
        options: GeminiStreamOptions
    ): Promise<string> {
        const endpoint = normalizeApiEndpoint(this.config.apiEndpoint);
        const modelPath = model.startsWith('models/') ? model : `models/${model}`;
        const url = `${endpoint}/${modelPath}:streamGenerateContent?key=${this.config.apiKey}&alt=sse`;

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

        // Add thinking config if thinkingLevel is specified
        const thinkingBudget = getThinkingBudget(options.thinkingLevel);
        if (thinkingBudget !== undefined) {
            generationConfig.thinkingConfig = {
                thinkingBudget,
                includeThoughts: true
            };
        }

        if (Object.keys(generationConfig).length > 0) {
            request.generationConfig = generationConfig;
        }

        let fullContent = '';
        const toolCalls: GeminiCompletedToolCall[] = [];
        let toolCallIndex = 0;

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
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

                // Process SSE events
                const lines = buffer.split('\n');
                buffer = lines.pop() || ''; // Keep incomplete line in buffer

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

                            if (parts) {
                                for (const part of parts) {
                                    if (part.thought && part.text) {
                                        // This is thinking/reasoning content
                                        options.onThinkingChunk?.(part.text, undefined);
                                    } else if (part.text && !part.thought) {
                                        // Regular text content
                                        fullContent += part.text;
                                        options.onChunk?.(part.text);
                                    } else if (part.functionCall) {
                                        // Tool/function call
                                        const funcCall = part.functionCall;
                                        const callId = `gemini_call_${toolCallIndex++}`;
                                        toolCalls.push({
                                            id: callId,
                                            name: funcCall.name,
                                            arguments: JSON.stringify(funcCall.args)
                                        });
                                    }
                                }
                            }
                        } catch (parseError) {
                            // Ignore parse errors for incomplete JSON
                            console.debug('GeminiClient: Failed to parse chunk:', parseError);
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
     * Non-streaming chat completion (fallback)
     */
    async generateContent(
        contents: GeminiContent[],
        model: string,
        systemInstruction: string | undefined,
        options?: {
            tools?: GeminiFunctionDeclaration[];
            toolMode?: 'auto' | 'required' | 'none';
            maxTokens?: number;
            thinkingLevel?: 'none' | 'low' | 'medium' | 'high';
        }
    ): Promise<GeminiGenerateContentResponse> {
        const endpoint = normalizeApiEndpoint(this.config.apiEndpoint);
        const modelPath = model.startsWith('models/') ? model : `models/${model}`;
        const url = `${endpoint}/${modelPath}:generateContent?key=${this.config.apiKey}`;

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

        const thinkingBudget = getThinkingBudget(options?.thinkingLevel);
        if (thinkingBudget !== undefined) {
            generationConfig.thinkingConfig = {
                thinkingBudget,
                includeThoughts: true
            };
        }

        if (Object.keys(generationConfig).length > 0) {
            request.generationConfig = generationConfig;
        }

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(request)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Gemini API error: ${response.status} ${response.statusText} - ${errorText}`);
        }

        return await response.json() as GeminiGenerateContentResponse;
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
 * Helper function to check if a Gemini model supports function calling
 */
export function supportsGeminiFunctionCalling(model: GeminiModelInfo): boolean {
    // Models that support generateContent typically support function calling
    // We can refine this based on model name patterns
    const modelId = getGeminiModelId(model);
    return model.supportedGenerationMethods.includes('generateContent') &&
           !modelId.includes('embedding') &&
           !modelId.includes('aqa');
}
