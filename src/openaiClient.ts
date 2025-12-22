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

        console.log(`OAI2LMApi: streamChatCompletion called for model: ${model}`);
        console.log(`OAI2LMApi: Sending ${openaiMessages.length} messages`);
        openaiMessages.forEach((msg, i) => {
            console.log(`OAI2LMApi: Message ${i}: role=${msg.role}, content length=${msg.content.length}`);
        });

        try {
            console.log('OAI2LMApi: Creating streaming chat completion...');
            const stream = await this.client.chat.completions.create({
                model: model,
                messages: openaiMessages,
                stream: true,
                temperature: 0.7
            });

            console.log('OAI2LMApi: Stream created, starting to consume chunks...');
            let chunkIndex = 0;

            for await (const chunk of stream) {
                if (streamOptions.signal?.aborted) {
                    console.log('OAI2LMApi: Stream aborted by signal');
                    break;
                }

                chunkIndex++;
                // Log the raw chunk structure for debugging
                console.log(`OAI2LMApi: Chunk ${chunkIndex} raw:`, JSON.stringify(chunk, null, 2));

                const content = chunk.choices[0]?.delta?.content || '';
                if (content) {
                    fullContent += content;
                    console.log(`OAI2LMApi: Chunk ${chunkIndex} content: "${content}"`);
                    streamOptions.onChunk?.(content);
                } else {
                    console.log(`OAI2LMApi: Chunk ${chunkIndex} has no content (delta: ${JSON.stringify(chunk.choices[0]?.delta)})`);
                }
            }

            console.log(`OAI2LMApi: Stream finished. Total chunks: ${chunkIndex}, total content length: ${fullContent.length}`);
            return fullContent;
        } catch (error: any) {
            console.error('OAI2LMApi: Error in streamChatCompletion:', error);
            console.error('OAI2LMApi: Error name:', error?.name);
            console.error('OAI2LMApi: Error message:', error?.message);
            console.error('OAI2LMApi: Error stack:', error?.stack);
            
            if (error.name === 'AbortError' || streamOptions.signal?.aborted) {
                console.log('OAI2LMApi: Stream aborted by user');
                return fullContent;
            }
            throw new Error(`Failed to stream chat completion: ${error?.message || error}`);
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
