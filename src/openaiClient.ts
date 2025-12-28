import OpenAI from 'openai';
import { logger } from './logger';

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

/**
 * Represents a complete tool call after streaming is finished
 */
export interface CompletedToolCall {
    id: string;
    name: string;
    arguments: string;
}

/**
 * Parses model output that embeds chain-of-thought inside <think>...</think> tags.
 *
 * Some OpenAI-compatible providers/models do not use a separate `reasoning_content` field,
 * and instead prepend the assistant content with <think> blocks.
 *
 * This parser is streaming-safe: tags may be split across chunks.
 *
 * Behavior:
 * - If `onThinking` is provided, content inside <think>...</think> is sent to `onThinking`
 *   and is NOT forwarded to `onText`.
 * - If `onThinking` is not provided, all input is forwarded to `onText` unchanged.
 */
export class ThinkTagStreamParser {
    private carry = '';
    private inThink = false;

    private readonly startTagLower = '<think>';
    private readonly endTagLower = '</think>';

    constructor(
        private readonly handlers: {
            onText?: (chunk: string) => void;
            onThinking?: (chunk: string) => void;
        }
    ) {}

    ingest(fragment: string): void {
        if (!fragment) {
            return;
        }

        // If the consumer doesn't support thinking parts, do not strip tags.
        if (!this.handlers.onThinking) {
            this.handlers.onText?.(fragment);
            return;
        }

        let text = this.carry + fragment;
        this.carry = '';

        while (text.length > 0) {
            const lower = text.toLowerCase();

            if (this.inThink) {
                const endIdx = lower.indexOf(this.endTagLower);
                if (endIdx === -1) {
                    const split = this.splitKeepingPossibleTagPrefix(text, this.endTagLower);
                    if (split.emit) {
                        this.handlers.onThinking?.(split.emit);
                    }
                    this.carry = split.carry;
                    return;
                }

                const thinkingPart = text.slice(0, endIdx);
                if (thinkingPart) {
                    this.handlers.onThinking?.(thinkingPart);
                }

                text = text.slice(endIdx + this.endTagLower.length);
                this.inThink = false;
                continue;
            }

            const startIdx = lower.indexOf(this.startTagLower);
            if (startIdx === -1) {
                const split = this.splitKeepingPossibleTagPrefix(text, this.startTagLower);
                if (split.emit) {
                    this.handlers.onText?.(split.emit);
                }
                this.carry = split.carry;
                return;
            }

            const visiblePart = text.slice(0, startIdx);
            if (visiblePart) {
                this.handlers.onText?.(visiblePart);
            }

            text = text.slice(startIdx + this.startTagLower.length);
            this.inThink = true;
        }
    }

    flush(): void {
        if (!this.carry) {
            return;
        }

        // If no thinking handler, carry would never be used, but be safe.
        if (!this.handlers.onThinking) {
            this.handlers.onText?.(this.carry);
            this.carry = '';
            return;
        }

        if (this.inThink) {
            this.handlers.onThinking?.(this.carry);
        } else {
            this.handlers.onText?.(this.carry);
        }
        this.carry = '';
    }

    private splitKeepingPossibleTagPrefix(text: string, tagLower: string): { emit: string; carry: string } {
        const lower = text.toLowerCase();
        const max = Math.min(tagLower.length - 1, text.length);

        for (let k = max; k > 0; k--) {
            if (tagLower.startsWith(lower.slice(-k))) {
                return {
                    emit: text.slice(0, text.length - k),
                    carry: text.slice(text.length - k)
                };
            }
        }

        return { emit: text, carry: '' };
    }
}

export interface StreamOptions {
    onChunk?: (chunk: string) => void;
    /**
     * Called when a thinking/reasoning content chunk is received.
     * Some models (e.g., DeepSeek) return chain-of-thought reasoning in a separate field.
     */
    onThinkingChunk?: (chunk: string) => void;
    /**
     * @deprecated Use onToolCallsComplete for batch reporting of all tool calls
     */
    onToolCall?: (toolCall: ToolCallChunk) => void;
    /**
     * Called once when streaming is complete with all tool calls from this response.
     * This is the preferred way to handle tool calls as it ensures all tool calls
     * are reported together in a single batch.
     */
    onToolCallsComplete?: (toolCalls: CompletedToolCall[]) => void;
    signal?: AbortSignal;
    tools?: ToolDefinition[];
    toolChoice?: ToolChoice;
    /** Optional max tokens for completion generation (mapped to OpenAI `max_tokens`). */
    maxTokens?: number;
}

export class OpenAIClient {
    private client: OpenAI;
    private config: OpenAIConfig;

    private coerceThinkingText(value: unknown): string | undefined {
        if (typeof value === 'string') {
            return value;
        }
        if (Array.isArray(value) && value.every(v => typeof v === 'string')) {
            return (value as string[]).join('');
        }
        return undefined;
    }

    constructor(config: OpenAIConfig) {
        this.config = config;
        const normalizedEndpoint = normalizeApiEndpoint(config.apiEndpoint);
        this.client = new OpenAI({
            apiKey: config.apiKey,
            baseURL: normalizedEndpoint,
            dangerouslyAllowBrowser: false
        });
    }

    async listModels(): Promise<APIModelInfo[]> {
        try {
            const response = await this.client.models.list();
            // Cast to APIModelInfo to preserve extended fields from some providers
            const models = response.data.map(model => model as unknown as APIModelInfo);
            return models;
        } catch (error) {
            const e = error as Record<string, unknown>;
            logger.error('Failed to list models', error, 'OpenAI');
            logger.debug('listModels error details', {
                status: e?.status ?? (e?.response as Record<string, unknown>)?.status,
                code: e?.code ?? (e?.error as Record<string, unknown>)?.code,
                name: e?.name,
                message: (e?.error as Record<string, unknown>)?.message ?? e?.message
            }, 'OpenAI');
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
            const e = error as Record<string, unknown>;
            logger.error('Failed to create chat completion', error, 'OpenAI');
            logger.debug('createChatCompletion error details', {
                model,
                status: e?.status ?? (e?.response as Record<string, unknown>)?.status,
                code: e?.code ?? (e?.error as Record<string, unknown>)?.code,
                name: e?.name,
                message: (e?.error as Record<string, unknown>)?.message ?? e?.message
            }, 'OpenAI');
            throw new Error(`Failed to create chat completion: ${error}`);
        }
    }

    async streamChatCompletion(
        messages: ChatMessage[],
        model: string,
        streamOptions: StreamOptions
    ): Promise<string> {
        let fullContent = '';
        let thinkingChars = 0;

        const thinkTagParser = new ThinkTagStreamParser({
            onText: (chunk) => {
                fullContent += chunk;
                streamOptions.onChunk?.(chunk);
            },
            onThinking: streamOptions.onThinkingChunk
                ? (chunk) => {
                    thinkingChars += chunk.length;
                    streamOptions.onThinkingChunk?.(chunk);
                }
                : undefined
        });

        // Convert to OpenAI message format
        const openaiMessages = this.convertMessagesToOpenAIFormat(messages);

        try {
            const maxTokens = (typeof streamOptions.maxTokens === 'number' && streamOptions.maxTokens > 0)
                ? streamOptions.maxTokens
                : 2048;

            // Build request options
            const requestOptions: OpenAI.Chat.ChatCompletionCreateParamsStreaming = {
                model: model,
                messages: openaiMessages,
                stream: true,
                temperature: 1.0,
                max_tokens: maxTokens
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

            let chunkCount = 0;
            let finishReason: string | null = null;

            for await (const chunk of stream) {
                chunkCount++;
                if (streamOptions.signal?.aborted) {
                    break;
                }

                const choice0 = chunk.choices[0];
                finishReason = (choice0 as any)?.finish_reason ?? finishReason;
                const delta = choice0?.delta;

                // Some gateways put fields on `choices[0].message` instead of `delta`.
                const messageAny = (choice0 as any)?.message as Record<string, unknown> | undefined;
                const messageContent = messageAny?.content;
                if (typeof messageContent === 'string' && messageContent.length > 0) {
                    thinkTagParser.ingest(messageContent);
                }

                const messageReasoningRaw = (messageAny as any)?.reasoning_content ?? (messageAny as any)?.reasoning ?? (messageAny as any)?.thinking;
                const messageReasoning = this.coerceThinkingText(messageReasoningRaw);
                if (messageReasoning && messageReasoning.length > 0) {
                    thinkingChars += messageReasoning.length;
                    streamOptions.onThinkingChunk?.(messageReasoning);
                }

                const messageToolCalls = messageAny?.tool_calls;
                if (Array.isArray(messageToolCalls) && messageToolCalls.length > 0) {
                    for (let i = 0; i < messageToolCalls.length; i++) {
                        const tc: any = messageToolCalls[i];
                        const index = i;
                        let toolCall = toolCallsInProgress.get(index);
                        if (!toolCall) {
                            toolCall = {
                                id: tc?.id || '',
                                name: tc?.function?.name || '',
                                arguments: ''
                            };
                            toolCallsInProgress.set(index, toolCall);
                        }
                        if (tc?.id) {
                            toolCall.id = tc.id;
                        }
                        if (tc?.function?.name) {
                            toolCall.name = tc.function.name;
                        }
                        if (typeof tc?.function?.arguments === 'string') {
                            toolCall.arguments = tc.function.arguments;
                        }
                    }
                }

                // Handle thinking/reasoning content (chain-of-thought)
                // Some models (e.g., DeepSeek) return reasoning in a separate `reasoning_content` field
                const deltaAny = delta as Record<string, unknown> | undefined;
                const reasoningRaw = (deltaAny as any)?.reasoning_content ?? (deltaAny as any)?.reasoning ?? (deltaAny as any)?.thinking;
                const reasoningContent = this.coerceThinkingText(reasoningRaw);
                if (reasoningContent && reasoningContent.length > 0) {
                    thinkingChars += reasoningContent.length;
                    streamOptions.onThinkingChunk?.(reasoningContent);
                }

                // Handle text content
                const content = delta?.content || '';
                if (content) {
                    // Some models embed thinking in <think>...</think> inside the normal content stream.
                    // Parse and route those parts to onThinkingChunk when available.
                    thinkTagParser.ingest(content);
                }

                // Handle tool calls in streaming response
                if (delta?.tool_calls) {
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

                        // Legacy: Report incremental updates if onToolCall is provided
                        if (streamOptions.onToolCall) {
                            streamOptions.onToolCall({
                                id: toolCall.id,
                                name: toolCall.name,
                                arguments: toolCall.arguments
                            });
                        }
                    }
                }
            }

            // Flush any pending partial tag/text at end of stream.
            thinkTagParser.flush();

            // Report all completed tool calls at once after streaming is done
            const completedToolCalls: CompletedToolCall[] = [];
            if (toolCallsInProgress.size > 0) {
                const seenIds = new Set<string>();
                // Sort by index to maintain order
                const sortedEntries = Array.from(toolCallsInProgress.entries()).sort((a, b) => a[0] - b[0]);
                for (const [, toolCall] of sortedEntries) {
                    // Deduplicate by tool call ID to prevent duplicate reporting
                    if (toolCall.id && toolCall.name && !seenIds.has(toolCall.id)) {
                        seenIds.add(toolCall.id);
                        completedToolCalls.push({
                            id: toolCall.id,
                            name: toolCall.name,
                            arguments: toolCall.arguments
                        });
                    }
                }
            }
            if (streamOptions.onToolCallsComplete && completedToolCalls.length > 0) {
                streamOptions.onToolCallsComplete(completedToolCalls);
            }

            // If the stream produced nothing at all (no text/thinking/tool calls), fall back to non-streaming once.
            if (fullContent.length === 0 && thinkingChars === 0 && completedToolCalls.length === 0 && !streamOptions.signal?.aborted) {
                logger.debug('Empty streaming response detected; falling back to non-streaming', {
                    model,
                    chunkCount,
                    finishReason
                }, 'OpenAI');

                const response = await this.client.chat.completions.create({
                    model: model,
                    messages: openaiMessages,
                    temperature: 0.7,
                    max_tokens: maxTokens,
                    stream: false,
                    ...(streamOptions.tools && streamOptions.tools.length > 0 ? { tools: streamOptions.tools } : {}),
                    ...(streamOptions.toolChoice ? { tool_choice: streamOptions.toolChoice } : {})
                }) as OpenAI.Chat.ChatCompletion;

                const msgAny = response.choices?.[0]?.message as unknown as Record<string, unknown> | undefined;
                const nonStreamContent = msgAny?.content;
                if (typeof nonStreamContent === 'string' && nonStreamContent.length > 0) {
                    thinkTagParser.ingest(nonStreamContent);
                }

                const nonStreamReasoningRaw = (msgAny as Record<string, unknown>)?.reasoning_content ?? (msgAny as Record<string, unknown>)?.reasoning ?? (msgAny as Record<string, unknown>)?.thinking;
                const nonStreamReasoning = this.coerceThinkingText(nonStreamReasoningRaw);
                if (nonStreamReasoning && nonStreamReasoning.length > 0) {
                    thinkingChars += nonStreamReasoning.length;
                    streamOptions.onThinkingChunk?.(nonStreamReasoning);
                }

                const nonStreamToolCalls = msgAny?.tool_calls;
                if (Array.isArray(nonStreamToolCalls) && nonStreamToolCalls.length > 0 && streamOptions.onToolCallsComplete) {
                    const mapped: CompletedToolCall[] = nonStreamToolCalls
                        .map((tc: Record<string, unknown>) => ({
                            id: (tc?.id as string) || '',
                            name: ((tc?.function as Record<string, unknown>)?.name as string) || '',
                            arguments: typeof (tc?.function as Record<string, unknown>)?.arguments === 'string' ? (tc?.function as Record<string, unknown>)?.arguments as string : ''
                        }))
                        .filter((tc: CompletedToolCall) => tc.id && tc.name);
                    if (mapped.length > 0) {
                        streamOptions.onToolCallsComplete(mapped);
                    }
                }

                thinkTagParser.flush();
            }

            return fullContent;
        } catch (error: unknown) {
            const err = error as Record<string, unknown>;
            if (err?.name === 'AbortError' || streamOptions.signal?.aborted) {
                thinkTagParser.flush();
                return fullContent;
            }

            logger.error('streamChatCompletion failed', error, 'OpenAI');
            logger.debug('streamChatCompletion error details', {
                model,
                messageCount: openaiMessages.length,
                toolsCount: streamOptions.tools?.length ?? 0,
                toolChoice: streamOptions.toolChoice ?? undefined,
                status: err?.status ?? (err?.response as Record<string, unknown>)?.status,
                code: err?.code ?? (err?.error as Record<string, unknown>)?.code,
                name: err?.name,
                message: (err?.error as Record<string, unknown>)?.message ?? err?.message
            }, 'OpenAI');

            throw new Error(`Failed to stream chat completion: ${error}`);
        }
    }

    updateConfig(config: OpenAIConfig) {
        this.config = config;
        const normalizedEndpoint = normalizeApiEndpoint(config.apiEndpoint);
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
        let fallbackIdCounter = 0;
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
                        // Filter out tool calls without valid IDs to prevent API errors
                        const validToolCalls = msg.tool_calls.filter(tc => 
                            tc.id && typeof tc.id === 'string' && tc.id.trim().length > 0
                        );
                        if (validToolCalls.length > 0) {
                            return {
                                role: 'assistant' as const,
                                content: msg.content,
                                tool_calls: validToolCalls.map(tc => ({
                                    id: tc.id,
                                    type: 'function' as const,
                                    function: {
                                        name: tc.function.name,
                                        arguments: tc.function.arguments
                                    }
                                }))
                            };
                        }
                    }
                    return {
                        role: 'assistant' as const,
                        content: msg.content || ''
                    };
                case 'tool':
                    // Tool messages must have content (not null) and a valid tool_call_id
                    // Some APIs (e.g., Claude via OpenAI-compatible proxies) require non-empty tool_call_id
                    let toolCallId = msg.tool_call_id;
                    if (!toolCallId || typeof toolCallId !== 'string' || toolCallId.trim().length === 0) {
                        // Log warning as this may cause issues with some API providers
                        logger.debug('Tool message missing valid tool_call_id, using fallback', undefined, 'OpenAI');
                        // Generate a fallback ID using counter + timestamp + random component for uniqueness
                        // Random component ensures uniqueness even if called multiple times in same millisecond
                        toolCallId = `call_fallback_${Date.now()}_${fallbackIdCounter++}_${Math.random().toString(36).slice(2, 9)}`;
                    }
                    return {
                        role: 'tool' as const,
                        content: msg.content || '',
                        tool_call_id: toolCallId
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
