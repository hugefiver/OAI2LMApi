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

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

// Type-safe message format for OpenAI API
interface OpenAIChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface StreamOptions {
    onChunk?: (chunk: string) => void;
    signal?: AbortSignal;
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
        const openaiMessages: OpenAIChatMessage[] = messages.map(msg => ({
            role: msg.role,
            content: msg.content
        }));

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
        const openaiMessages: OpenAIChatMessage[] = messages.map(msg => ({
            role: msg.role,
            content: msg.content
        }));

        try {
            const stream = await this.client.chat.completions.create({
                model: model,
                messages: openaiMessages,
                stream: true,
                temperature: 0.7
            });

            for await (const chunk of stream) {
                if (streamOptions.signal?.aborted) {
                    break;
                }

                const content = chunk.choices[0]?.delta?.content || '';
                if (content) {
                    fullContent += content;
                    streamOptions.onChunk?.(content);
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
}
