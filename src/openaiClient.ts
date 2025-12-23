import OpenAI from 'openai';

export interface OpenAIConfig {
    apiEndpoint: string;
    apiKey: string;
}

/**
 * Model information returned from the /v1/models API.
 * Extended with optional fields that some providers include.
 */
export interface APIModelInfo {
    id: string;
    object: string;
    created?: number;
    owned_by?: string;
    // Extended fields from some providers (e.g., OpenRouter)
    context_length?: number;
    max_completion_tokens?: number;
    capabilities?: {
        tool_calling?: boolean;
        vision?: boolean;
    };
}

/**
 * Normalizes the API endpoint URL by removing trailing slashes.
 * The OpenAI SDK expects baseURL to be the full path (e.g., https://api.openai.com/v1).
 * This function ensures trailing slashes are removed for consistent URL construction.
 * @param endpoint - The API endpoint URL (should include /v1 path for OpenAI-compatible APIs)
 * @returns The normalized endpoint URL without trailing slashes
 */
function normalizeApiEndpoint(endpoint: string): string {
    // Remove trailing slashes for consistent URL construction
    return endpoint.replace(/\/+$/, '');
}

/**
 * Represents a tool call made by the model
 */
export interface ToolCall {
    id: string;
    type: 'function';
    function: {
        name: string;
        arguments: string;
    };
}

/**
 * Represents a tool definition for the OpenAI API
 */
export interface ToolDefinition {
    type: 'function';
    function: {
        name: string;
        description?: string;
        parameters?: Record<string, unknown>;
    };
}

/**
 * Tool choice options for the OpenAI API
 */
export type ToolChoice = 'none' | 'auto' | 'required' | { type: 'function'; function: { name: string } };

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string | null;
    tool_calls?: ToolCall[];
    tool_call_id?: string;
}

// Type-safe message format for OpenAI API
interface OpenAIChatMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string | null;
    tool_calls?: ToolCall[];
    tool_call_id?: string;
}

/**
 * Represents a tool call chunk received during streaming
 */
export interface ToolCallChunk {
    id: string;
    name: string;
    arguments: string;
}

export interface StreamOptions {
    onChunk?: (chunk: string) => void;
    onToolCall?: (toolCall: ToolCallChunk) => void;
    signal?: AbortSignal;
    tools?: ToolDefinition[];
    toolChoice?: ToolChoice;
}

export class OpenAIClient {
    private client: OpenAI;
    private config: OpenAIConfig;

    constructor(config: OpenAIConfig) {
        this.config = config;
        const normalizedEndpoint = normalizeApiEndpoint(config.apiEndpoint);
        console.log(`OAI2LMApi: Initializing OpenAI client with endpoint: ${normalizedEndpoint}`);
        this.client = new OpenAI({
            apiKey: config.apiKey,
            baseURL: normalizedEndpoint,
            dangerouslyAllowBrowser: false
        });
    }

    async listModels(): Promise<APIModelInfo[]> {
        try {
            console.log('OAI2LMApi: Fetching models from API...');
            const response = await this.client.models.list();
            // Cast to APIModelInfo to preserve extended fields from some providers
            const models = response.data.map(model => model as unknown as APIModelInfo);
            console.log(`OAI2LMApi: Successfully fetched ${models.length} models`);
            return models;
        } catch (error) {
            console.error('OAI2LMApi: Failed to list models:', error);
            throw new Error(`Failed to fetch models from API: ${error}`);
        }
    }

    async createChatCompletion(
        messages: ChatMessage[],
        model: string,
        options?: {
            maxTokens?: number;
            temperature?: number;
            stream?: boolean;
        }
    ): Promise<string> {
        // Convert to OpenAI message format
        const openaiMessages = this.convertMessagesToOpenAIFormat(messages);

        try {
            const response = await this.client.chat.completions.create({
                model: model,
                messages: openaiMessages,
                max_tokens: options?.maxTokens,
                temperature: options?.temperature ?? 0.7,
                stream: false
            });

            return response.choices[0]?.message?.content || '';
        } catch (error) {
            console.error('Failed to create chat completion:', error);
            throw new Error(`Failed to create chat completion: ${error}`);
        }
    }

    async streamChatCompletion(
        messages: ChatMessage[],
        model: string,
        streamOptions: StreamOptions
    ): Promise<string> {
        let fullContent = '';

        // Convert to OpenAI message format
        const openaiMessages = this.convertMessagesToOpenAIFormat(messages);

        try {
            // Build request options
            const requestOptions: OpenAI.Chat.ChatCompletionCreateParamsStreaming = {
                model: model,
                messages: openaiMessages,
                stream: true,
                temperature: 0.7
            };

            // Add tools if provided
            if (streamOptions.tools && streamOptions.tools.length > 0) {
                requestOptions.tools = streamOptions.tools;
                if (streamOptions.toolChoice) {
                    requestOptions.tool_choice = streamOptions.toolChoice;
                }
            }

            const stream = await this.client.chat.completions.create(requestOptions);

            // Track tool calls being assembled from streamed chunks
            const toolCallsInProgress: Map<number, { id: string; name: string; arguments: string }> = new Map();

            for await (const chunk of stream) {
                if (streamOptions.signal?.aborted) {
                    break;
                }

                const delta = chunk.choices[0]?.delta;
                
                // TODO: Investigate how to properly transmit chain-of-thought (reasoning_content)
                // via VSCode LM API. Some models (e.g., DeepSeek) return reasoning in a separate
                // `reasoning_content` field, but it's unclear how VSCode LM API handles this.
                // For now, we only process the standard `content` field.
                
                // Handle text content
                const content = delta?.content || '';
                if (content) {
                    fullContent += content;
                    streamOptions.onChunk?.(content);
                }

                // Handle tool calls in streaming response
                if (delta?.tool_calls && streamOptions.onToolCall) {
                    for (const toolCallDelta of delta.tool_calls) {
                        const index = toolCallDelta.index;
                        
                        // Get or create the tool call being assembled
                        let toolCall = toolCallsInProgress.get(index);
                        if (!toolCall) {
                            toolCall = {
                                id: toolCallDelta.id || '',
                                name: toolCallDelta.function?.name || '',
                                arguments: ''
                            };
                            toolCallsInProgress.set(index, toolCall);
                        }

                        // Update with new data from this chunk
                        if (toolCallDelta.id) {
                            toolCall.id = toolCallDelta.id;
                        }
                        if (toolCallDelta.function?.name) {
                            toolCall.name = toolCallDelta.function.name;
                        }
                        if (toolCallDelta.function?.arguments) {
                            toolCall.arguments += toolCallDelta.function.arguments;
                        }

                        // Report the current state of the tool call
                        streamOptions.onToolCall({
                            id: toolCall.id,
                            name: toolCall.name,
                            arguments: toolCall.arguments
                        });
                    }
                }
            }

            return fullContent;
        } catch (error: any) {
            if (error.name === 'AbortError' || streamOptions.signal?.aborted) {
                console.log('Stream aborted by user');
                return fullContent;
            }
            console.error('Failed to stream chat completion:', error);
            throw new Error(`Failed to stream chat completion: ${error}`);
        }
    }

    updateConfig(config: OpenAIConfig) {
        this.config = config;
        const normalizedEndpoint = normalizeApiEndpoint(config.apiEndpoint);
        console.log(`OAI2LMApi: Updating OpenAI client with endpoint: ${normalizedEndpoint}`);
        this.client = new OpenAI({
            apiKey: config.apiKey,
            baseURL: normalizedEndpoint,
            dangerouslyAllowBrowser: false
        });
    }

    /**
     * Converts ChatMessage array to OpenAI ChatCompletionMessageParam format.
     * Handles different message roles with their specific type requirements.
     */
    private convertMessagesToOpenAIFormat(messages: ChatMessage[]): OpenAI.Chat.ChatCompletionMessageParam[] {
        return messages.map(msg => {
            switch (msg.role) {
                case 'system':
                    return {
                        role: 'system' as const,
                        content: msg.content || ''
                    };
                case 'user':
                    return {
                        role: 'user' as const,
                        content: msg.content || ''
                    };
                case 'assistant':
                    // Assistant messages can have tool_calls
                    if (msg.tool_calls && msg.tool_calls.length > 0) {
                        return {
                            role: 'assistant' as const,
                            content: msg.content,
                            tool_calls: msg.tool_calls.map(tc => ({
                                id: tc.id,
                                type: 'function' as const,
                                function: {
                                    name: tc.function.name,
                                    arguments: tc.function.arguments
                                }
                            }))
                        };
                    }
                    return {
                        role: 'assistant' as const,
                        content: msg.content || ''
                    };
                case 'tool':
                    // Tool messages must have content (not null) and tool_call_id
                    return {
                        role: 'tool' as const,
                        content: msg.content || '',
                        tool_call_id: msg.tool_call_id || ''
                    };
                default:
                    // Fallback to user role
                    return {
                        role: 'user' as const,
                        content: msg.content || ''
                    };
            }
        });
    }
}
