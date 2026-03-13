import type * as vscode from 'vscode';
import { logger } from './logger';
import _Anthropic from '@anthropic-ai/sdk';

interface MessageStreamEvent {
    type: string;
    index?: number;
    content_block?: {
        type: string;
        text?: string;
        thinking?: string;
        id?: string;
        name?: string;
    };
    delta?: {
        type: string;
        text?: string;
        thinking?: string;
        partial_json?: string;
    };
}

const Anthropic = _Anthropic as unknown as {
    new (options: { apiKey: string; baseURL?: string; dangerouslyAllowBrowser?: boolean }): {
        models: {
            list(): AsyncIterable<ClaudeModelInfo> | Promise<AsyncIterable<ClaudeModelInfo>> | Promise<{ data: ClaudeModelInfo[] }> | { data: ClaudeModelInfo[] };
        };
        messages: {
            create(params: Record<string, unknown>): AsyncIterable<MessageStreamEvent> | Promise<AsyncIterable<MessageStreamEvent>>;
        };
    };
};

export type ClaudeRole = 'user' | 'assistant' | 'system';

export interface ClaudeTextBlockParam {
    type: 'text';
    text: string;
}

export interface ClaudeToolUseBlockParam {
    type: 'tool_use';
    id: string;
    name: string;
    input: unknown;
}

export interface ClaudeToolResultBlockParam {
    type: 'tool_result';
    tool_use_id: string;
    content?: string;
    is_error?: boolean;
}

export type ClaudeContentBlockParam =
    | ClaudeTextBlockParam
    | ClaudeToolUseBlockParam
    | ClaudeToolResultBlockParam;

export interface ClaudeMessageParam {
    role: 'user' | 'assistant';
    content: string | ClaudeContentBlockParam[];
}

export interface ClaudeToolDefinition {
    name: string;
    description?: string;
    input_schema: Record<string, unknown>;
}

export type ClaudeToolChoice = { type: 'auto' | 'any' | 'none' | 'tool'; name?: string };

export type ClaudeThinkingConfigParam =
    | { type: 'enabled'; budget_tokens: number }
    | { type: 'disabled' };

export interface ClaudeConfig {
    apiEndpoint: string;
    apiKey: string;
}

export interface ClaudeModelInfo {
    id: string;
    display_name?: string;
    created_at?: string;
    type?: string;
}

export interface ClaudeToolCall {
    id: string;
    name: string;
    input: string;
}

export interface ClaudeCompletedToolCall {
    id: string;
    name: string;
    arguments: string;
}

export interface ClaudeStreamOptions {
    onChunk?: (chunk: string) => void;
    onThinkingChunk?: (chunk: string) => void;
    onToolCallsComplete?: (toolCalls: ClaudeCompletedToolCall[]) => void;
    signal?: AbortSignal;
    tools?: ClaudeToolDefinition[];
    toolChoice?: 'auto' | 'required' | 'none' | { name: string };
    maxTokens?: number;
    temperature?: number;
    thinking?: number | string;
    suppressChainOfThought?: boolean;
}

interface ClaudeMessageConversionResult {
    messages: ClaudeMessageParam[];
    system?: string;
}

interface OpenAIModelListResponse {
    data?: Array<{ id?: string }>;
}

function isAsyncIterable<T>(value: unknown): value is AsyncIterable<T> {
    return !!value && typeof (value as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator] === 'function';
}

function normalizeApiEndpoint(endpoint: string): string {
    let normalized = endpoint.replace(/\/+$/, '');
    if (normalized.endsWith('/v1')) {
        normalized = normalized.slice(0, -3);
    }
    return normalized;
}

function buildToolChoice(toolChoice: ClaudeStreamOptions['toolChoice']): ClaudeToolChoice | undefined {
    if (!toolChoice) {
        return undefined;
    }
    if (typeof toolChoice === 'string') {
        if (toolChoice === 'required') {
            return { type: 'any' };
        }
        if (toolChoice === 'none') {
            return { type: 'none' };
        }
        return { type: 'auto' };
    }
    return { type: 'tool', name: toolChoice.name };
}

function parseThinkingConfig(thinking: number | string | undefined): ClaudeThinkingConfigParam | undefined {
    if (thinking === undefined || thinking === null) {
        return undefined;
    }
    if (typeof thinking === 'number') {
        if (!Number.isFinite(thinking) || thinking <= 0) {
            return undefined;
        }
        return { type: 'enabled', budget_tokens: Math.max(1024, Math.floor(thinking)) };
    }
    if (typeof thinking === 'string') {
        const level = thinking.toLowerCase();
        if (level === 'none' || level === 'disabled') {
            return { type: 'disabled' };
        }
        if (level === 'low') {
            return { type: 'enabled', budget_tokens: 2048 };
        }
        if (level === 'medium') {
            return { type: 'enabled', budget_tokens: 4096 };
        }
        if (level === 'high') {
            return { type: 'enabled', budget_tokens: 8192 };
        }
        if (level === 'auto') {
            return { type: 'enabled', budget_tokens: 4096 };
        }
    }
    return undefined;
}

export class ClaudeClient {
    private client: InstanceType<typeof Anthropic>;
    private config: ClaudeConfig;

    constructor(config: ClaudeConfig) {
        this.config = config;
        const normalizedEndpoint = normalizeApiEndpoint(config.apiEndpoint);
        this.client = new Anthropic({
            apiKey: config.apiKey,
            baseURL: normalizedEndpoint,
            dangerouslyAllowBrowser: false
        });
    }

    updateConfig(config: ClaudeConfig) {
        this.config = config;
        const normalizedEndpoint = normalizeApiEndpoint(config.apiEndpoint);
        this.client = new Anthropic({
            apiKey: config.apiKey,
            baseURL: normalizedEndpoint,
            dangerouslyAllowBrowser: false
        });
    }

    private normalizeEndpointForOpenAI(apiEndpoint: string): string {
        const normalized = normalizeApiEndpoint(apiEndpoint);
        if (normalized.endsWith('/v1')) {
            return normalized;
        }
        return `${normalized}/v1`;
    }

    private async listModelsOpenAICompatible(): Promise<ClaudeModelInfo[]> {
        const baseUrl = this.normalizeEndpointForOpenAI(this.config.apiEndpoint);
        const url = `${baseUrl}/models`;

        const response = await fetch(url, {
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

        const data = await response.json() as OpenAIModelListResponse;
        const models = (data.data ?? []).map(model => ({
            id: typeof model.id === 'string' ? model.id : ''
        })).filter(model => model.id.length > 0);

        return models;
    }

    private async listModelsWithTimeout(timeoutMs: number): Promise<ClaudeModelInfo[]> {
        const timeoutPromise = new Promise<ClaudeModelInfo[]>((_, reject) => {
            const timer = setTimeout(() => {
                clearTimeout(timer);
                reject(new Error(`Claude models.list timed out after ${timeoutMs}ms`));
            }, timeoutMs);
        });

        return Promise.race([this.listModelsViaSdk(), timeoutPromise]);
    }

    private async listModelsViaSdk(): Promise<ClaudeModelInfo[]> {
        const page = this.client.models.list();
        const models: ClaudeModelInfo[] = [];
        const pushModel = (model: ClaudeModelInfo) => {
            models.push({
                id: model.id,
                display_name: model.display_name,
                created_at: model.created_at,
                type: model.type
            });
        };

        if (isAsyncIterable<ClaudeModelInfo>(page)) {
            for await (const model of page) {
                pushModel(model);
            }
            return models;
        }

        const resolved = await page;
        if (isAsyncIterable<ClaudeModelInfo>(resolved)) {
            for await (const model of resolved) {
                pushModel(model);
            }
        } else if (resolved && typeof (resolved as { data?: unknown }).data === 'object' && Array.isArray((resolved as { data?: unknown }).data)) {
            for (const model of (resolved as { data: ClaudeModelInfo[] }).data) {
                pushModel(model);
            }
        } else if (Array.isArray(resolved)) {
            for (const model of resolved as ClaudeModelInfo[]) {
                pushModel(model);
            }
        }
        return models;
    }


    async listModels(): Promise<ClaudeModelInfo[]> {
        try {
            const models = await this.listModelsWithTimeout(5000);
            if (models.length === 0) {
                logger.warn('Claude model list returned empty, trying OpenAI-compatible fallback', 'Claude');
                return await this.listModelsOpenAICompatible();
            }
            return models;
        } catch (error) {
            logger.error('Failed to list models', error, 'Claude');
            try {
                logger.warn('Falling back to OpenAI-compatible model list', 'Claude');
                return await this.listModelsOpenAICompatible();
            } catch (fallbackError) {
                logger.error('OpenAI-compatible model list fallback failed', fallbackError, 'Claude');
                throw new Error(`Failed to fetch models from Claude API: ${error}`);
            }
        }
    }

    async streamChatCompletion(
        messages: ClaudeMessageParam[],
        model: string,
        system: string | undefined,
        options: ClaudeStreamOptions
    ): Promise<string> {
        let fullContent = '';
        const toolCalls: ClaudeCompletedToolCall[] = [];
        const toolCallsInProgress = new Map<number, ClaudeToolCall>();
        let activeTextIndex: number | null = null;

        const thinkingConfig = parseThinkingConfig(options.thinking);
        const request = {
            model,
            messages,
            max_tokens: options.maxTokens ?? 2048,
            stream: true,
            ...(system ? { system } : {}),
            ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
            ...(options.tools && options.tools.length > 0 ? { tools: options.tools } : {}),
            ...(options.toolChoice ? { tool_choice: buildToolChoice(options.toolChoice) } : {}),
            ...(thinkingConfig ? { thinking: thinkingConfig } : {})
        } as const;

        try {
            const stream = await this.client.messages.create(request);

            for await (const event of stream as AsyncIterable<MessageStreamEvent>) {
                if (options.signal?.aborted) {
                    break;
                }

                const eventIndex = typeof event.index === 'number' ? event.index : null;

                switch (event.type) {
                    case 'content_block_start': {
                        if ('content_block' in event) {
                            const block = event.content_block as { type: string; text?: string; thinking?: string; id?: string; name?: string };
                            if (block.type === 'text') {
                                activeTextIndex = eventIndex;
                            } else if (block.type === 'thinking') {
                                if (!options.suppressChainOfThought) {
                                    options.onThinkingChunk?.(block.thinking ?? '');
                                }
                            } else if (block.type === 'tool_use') {
                                if (eventIndex !== null) {
                                    toolCallsInProgress.set(eventIndex, {
                                        id: block.id ?? '',
                                        name: block.name ?? '',
                                        input: ''
                                    });
                                }
                            }
                        }
                        break;
                    }
                    case 'content_block_delta': {
                        if ('delta' in event) {
                            const delta = event.delta as { type: string; text?: string; thinking?: string; partial_json?: string };
                            if (delta.type === 'text_delta' && activeTextIndex === eventIndex && delta.text) {
                                fullContent += delta.text;
                                options.onChunk?.(delta.text);
                            } else if (delta.type === 'thinking_delta' && !options.suppressChainOfThought && delta.thinking) {
                                options.onThinkingChunk?.(delta.thinking);
                            } else if (delta.type === 'input_json_delta' && delta.partial_json !== undefined) {
                                const toolCall = eventIndex !== null ? toolCallsInProgress.get(eventIndex) : undefined;
                                if (toolCall) {
                                    toolCall.input += delta.partial_json;
                                }
                            }
                        }
                        break;
                    }
                    case 'content_block_stop': {
                        if (eventIndex !== null) {
                            const toolCall = toolCallsInProgress.get(eventIndex);
                            if (toolCall) {
                                toolCalls.push({
                                    id: toolCall.id,
                                    name: toolCall.name,
                                    arguments: toolCall.input
                                });
                                toolCallsInProgress.delete(eventIndex);
                            }
                            if (activeTextIndex === eventIndex) {
                                activeTextIndex = null;
                            }
                        }
                        break;
                    }
                    case 'message_delta': {
                        void event;
                        break;
                    }
                }
            }

            if (toolCalls.length > 0) {
                options.onToolCallsComplete?.(toolCalls);
            }

            return fullContent;
        } catch (error: unknown) {
            const err = error as Record<string, unknown>;
            if (err?.name === 'AbortError' || options.signal?.aborted) {
                return fullContent;
            }
            logger.error('streamChatCompletion failed', error, 'Claude');
            logger.debug('streamChatCompletion error details', {
                model,
                messageCount: messages.length,
                toolsCount: options.tools?.length ?? 0,
                status: err?.status ?? (err?.response as Record<string, unknown>)?.status,
                name: err?.name,
                message: (err?.error as Record<string, unknown>)?.message ?? err?.message
            }, 'Claude');
            throw new Error(`Failed to stream chat completion: ${error}`);
        }
    }
}

export function convertVscodeMessagesToClaude(
    messages: readonly vscode.LanguageModelChatRequestMessage[],
    usePromptBasedToolCalling: boolean,
    formatToolCallAsXml: (toolName: string, args: Record<string, unknown>) => string,
    formatToolResultAsText: (toolName: string, result: string) => string,
    extractTextFromPart: (part: unknown) => string,
    getToolNameFromResult: (part: unknown) => string | undefined,
    ensureToolCallId: (callId: unknown, name: string, index: number) => string,
    roleMapper: (role: vscode.LanguageModelChatMessageRole) => ClaudeRole
): ClaudeMessageConversionResult {
    const claudeMessages: ClaudeMessageParam[] = [];
    let systemContent: string | undefined;
    const processedToolCallIds = new Set<string>();
    let toolCallIndex = 0;

    for (const msg of messages) {
        const role = roleMapper(msg.role);

        const contentParts: ClaudeContentBlockParam[] = [];
        let textContent = '';

        if (Array.isArray(msg.content)) {
            for (const part of msg.content) {
                if (part && typeof part === 'object' && 'callId' in part && 'name' in part && 'input' in part) {
                    const callId = ensureToolCallId((part as { callId: unknown }).callId, (part as { name: string }).name, toolCallIndex++);
                    if (processedToolCallIds.has(callId)) {
                        continue;
                    }
                    processedToolCallIds.add(callId);
                    if (usePromptBasedToolCalling) {
                        const args = typeof (part as { input: unknown }).input === 'object' && (part as { input: unknown }).input !== null
                            ? (part as { input: Record<string, unknown> }).input
                            : {};
                        textContent += formatToolCallAsXml((part as { name: string }).name, args) + '\n';
                    } else {
                        contentParts.push({
                            type: 'tool_use',
                            id: callId,
                            name: (part as { name: string }).name,
                            input: (part as { input: unknown }).input
                        });
                    }
                } else if (part && typeof part === 'object' && 'callId' in part && 'content' in part && !('name' in part)) {
                    const toolCallId = ensureToolCallId((part as { callId: unknown }).callId, 'result', toolCallIndex++);
                    const resultContent = extractTextFromPart(part);
                    const toolName = getToolNameFromResult(part) ?? 'Tool';
                    if (usePromptBasedToolCalling) {
                        textContent += formatToolResultAsText(toolName, resultContent) + '\n';
                    } else {
                        contentParts.push({
                            type: 'tool_result',
                            tool_use_id: toolCallId,
                            content: resultContent
                        });
                    }
                } else {
                    textContent += extractTextFromPart(part);
                }
            }
        } else if (typeof msg.content === 'string') {
            textContent = msg.content;
        } else if (msg.content && typeof msg.content === 'object') {
            textContent = extractTextFromPart(msg.content);
        }

        if (role === 'user') {
            if (textContent) {
                contentParts.push({ type: 'text', text: textContent });
            }
        }

        if (role === 'assistant') {
            if (textContent) {
                contentParts.unshift({ type: 'text', text: textContent });
            }
        }

        if (role === 'assistant' && contentParts.length === 0 && textContent) {
            contentParts.push({ type: 'text', text: textContent });
        }

        if (role === 'user' && contentParts.length === 0 && textContent) {
            contentParts.push({ type: 'text', text: textContent });
        }

        if (role === 'system') {
            if (textContent) {
                systemContent = systemContent ? `${systemContent}\n${textContent}` : textContent;
            }
            continue;
        }

        if (contentParts.length > 0) {
            claudeMessages.push({
                role,
                content: contentParts.length === 1 && contentParts[0].type === 'text'
                    ? (contentParts[0] as { text: string }).text
                    : contentParts
            });
        } else if (textContent) {
            claudeMessages.push({
                role,
                content: textContent
            });
        }
    }

    return { messages: claudeMessages, system: systemContent };
}
