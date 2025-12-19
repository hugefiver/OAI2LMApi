import OpenAI from 'openai';
import * as vscode from 'vscode';

export interface OpenAIConfig {
    apiEndpoint: string;
    apiKey: string;
    defaultModel: string;
}

export interface ChatMessage {
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
        this.client = new OpenAI({
            apiKey: config.apiKey,
            baseURL: config.apiEndpoint,
            dangerouslyAllowBrowser: false
        });
    }

    async listModels(): Promise<string[]> {
        try {
            const response = await this.client.models.list();
            return response.data.map(model => model.id);
        } catch (error) {
            console.error('Failed to list models:', error);
            throw new Error(`Failed to fetch models from API: ${error}`);
        }
    }

    async createChatCompletion(
        messages: ChatMessage[],
        model?: string,
        options?: {
            maxTokens?: number;
            temperature?: number;
            stream?: boolean;
        }
    ): Promise<string> {
        const modelToUse = model || this.config.defaultModel;

        try {
            const response = await this.client.chat.completions.create({
                model: modelToUse,
                messages: messages as any,
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
        model: string | undefined,
        streamOptions: StreamOptions
    ): Promise<string> {
        const modelToUse = model || this.config.defaultModel;
        let fullContent = '';

        try {
            const stream = await this.client.chat.completions.create({
                model: modelToUse,
                messages: messages as any,
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
        this.client = new OpenAI({
            apiKey: config.apiKey,
            baseURL: config.apiEndpoint,
            dangerouslyAllowBrowser: false
        });
    }
}
