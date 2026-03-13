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
 * Represents a thinking tag pair (start and end tags).
 */
interface ThinkingTagPair {
    tagName: 'think' | 'thinking';
    startTag: string;  // lowercase start tag, e.g., '<think>'
    endTag: string;    // lowercase end tag, e.g., '</think>'
    handling: 'thinking' | 'drop';
    onlyAtStart: boolean;  // if true, only match at the beginning of the stream (before any text emitted)
    onlyAtLineStart: boolean;  // if true, only match at line start (after \n or at position 0)
    requireNoThinking: boolean;  // if true, only match when no thinking content has been received yet
}

export interface ThinkTagStreamParserOptions {
    /**
     * How to handle `<think>...</think>` blocks (only matched at the beginning of the stream).
     * - 'thinking': forward the inner content to `onThinking`
     * - 'drop': strip the block from visible text and do NOT forward anywhere
     */
    thinkTagHandling?: 'thinking' | 'drop';
    /**
     * How to handle `<thinking>...</thinking>` blocks (matched at line start).
     */
    thinkingTagHandling?: 'thinking' | 'drop';
}

/**
 * Parses model output that embeds chain-of-thought inside thinking tags.
 *
 * Supported tag formats (case-insensitive):
 * - <think>...</think> - only matches at the beginning of the stream, and only when
 *   no thinking content has been received yet (via onThinking or reasoning_content)
 * - <thinking>...</thinking> - matches at line start (after \n or at position 0)
 *
 * Some OpenAI-compatible providers/models do not use a separate `reasoning_content` field,
 * and instead prepend the assistant content with thinking blocks.
 *
 * This parser is streaming-safe: tags may be split across chunks.
 *
 * Behavior:
 * - If `onThinking` is provided, content inside thinking tags is sent to `onThinking`
 *   and is NOT forwarded to `onText`.
 * - If `onThinking` is not provided, all input is forwarded to `onText` unchanged.
 * - Nested tags are NOT supported: inner tags are treated as literal text content.
 *   e.g., `<thinking><thinking></thinking>` -> thinking = "<thinking>", text = ""
 * - Unmatched closing tags are passed through as text.
 *   e.g., `<thinking></thinking></thinking>` -> thinking = "", text = "</thinking>"
 */
export class ThinkTagStreamParser {
    private carry = '';
    private inThink = false;
    private currentEndTag = '';  // The end tag we're looking for when inside a thinking block
    private currentHandling: 'thinking' | 'drop' = 'thinking';
    private hasEmittedText = false;  // Track if any text has been emitted (for onlyAtStart tags)
    private hasReceivedThinking = false;  // Track if any thinking content has been received

    private readonly tagPairs: ThinkingTagPair[];

    // Supported thinking tag pairs (order matters - longer tags should come first for proper matching)
    private static readonly thinkingTags: ThinkingTagPair[] = [
        { tagName: 'thinking', startTag: '<thinking>', endTag: '</thinking>', handling: 'thinking', onlyAtStart: false, onlyAtLineStart: true, requireNoThinking: false },
        { tagName: 'think', startTag: '<think>', endTag: '</think>', handling: 'thinking', onlyAtStart: true, onlyAtLineStart: false, requireNoThinking: true },
    ];

    // Longest possible start tag prefix for carry handling
    private static readonly maxStartTagLength = Math.max(
        ...ThinkTagStreamParser.thinkingTags.map(t => t.startTag.length)
    );

    constructor(
        private readonly handlers: {
            onText?: (chunk: string) => void;
            onThinking?: (chunk: string) => void;
        },
        options?: ThinkTagStreamParserOptions
    ) {
        // Apply per-tag handling overrides.
        this.tagPairs = ThinkTagStreamParser.thinkingTags.map((tp) => {
            if (tp.tagName === 'think' && options?.thinkTagHandling) {
                return { ...tp, handling: options.thinkTagHandling };
            }
            if (tp.tagName === 'thinking' && options?.thinkingTagHandling) {
                return { ...tp, handling: options.thinkingTagHandling };
            }
            return tp;
        });
    }

    /**
     * Notify the parser that thinking content has been received from an external source
     * (e.g., reasoning_content field). This disables <think> tag matching.
     */
    notifyThinkingReceived(): void {
        this.hasReceivedThinking = true;
    }

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
                // Looking for the matching end tag
                const endIdx = lower.indexOf(this.currentEndTag);
                if (endIdx === -1) {
                    const split = this.splitKeepingPossibleTagPrefix(text, this.currentEndTag);
                    if (split.emit) {
                        if (this.currentHandling === 'thinking') {
                            this.handlers.onThinking?.(split.emit);
                        }
                        // If currentHandling === 'drop', we intentionally discard it.
                        this.hasReceivedThinking = true;
                    }
                    this.carry = split.carry;
                    return;
                }

                const thinkingPart = text.slice(0, endIdx);
                if (thinkingPart) {
                    if (this.currentHandling === 'thinking') {
                        this.handlers.onThinking?.(thinkingPart);
                    }
                    this.hasReceivedThinking = true;
                }

                text = text.slice(endIdx + this.currentEndTag.length);
                this.inThink = false;
                this.currentEndTag = '';
                this.currentHandling = 'thinking';
                continue;
            }

            // Look for any start tag, find the earliest one
            // Note: <think> only matches at position 0 when no text emitted and no thinking received
            // <thinking> matches at line start (after \n or at position 0)
            let earliestIdx = -1;
            let matchedTag: ThinkingTagPair | null = null;

            for (const tagPair of this.tagPairs) {
                // Skip onlyAtStart tags if we've already emitted text
                if (tagPair.onlyAtStart && this.hasEmittedText) {
                    continue;
                }

                // Skip requireNoThinking tags if thinking content has already been received
                if (tagPair.requireNoThinking && this.hasReceivedThinking) {
                    continue;
                }

                // Find all occurrences and check position constraints
                let searchStart = 0;
                while (searchStart < lower.length) {
                    const idx = lower.indexOf(tagPair.startTag, searchStart);
                    if (idx === -1) {
                        break;
                    }

                    // For onlyAtStart tags, only match at position 0
                    if (tagPair.onlyAtStart && idx !== 0) {
                        break;  // No point searching further
                    }

                    // For onlyAtLineStart tags, check if at line start
                    if (tagPair.onlyAtLineStart && idx !== 0) {
                        // Must be preceded by a newline
                        if (text[idx - 1] !== '\n') {
                            searchStart = idx + 1;
                            continue;
                        }
                    }

                    // Valid match found
                    if (earliestIdx === -1 || idx < earliestIdx) {
                        earliestIdx = idx;
                        matchedTag = tagPair;
                    }
                    break;
                }
            }

            if (earliestIdx === -1 || !matchedTag) {
                // No start tag found, but keep potential partial tag in carry
                const split = this.splitKeepingPossibleStartTagPrefix(text);
                if (split.emit) {
                    this.handlers.onText?.(split.emit);
                    this.hasEmittedText = true;
                }
                this.carry = split.carry;
                return;
            }

            const visiblePart = text.slice(0, earliestIdx);
            if (visiblePart) {
                this.handlers.onText?.(visiblePart);
                this.hasEmittedText = true;
            }

            text = text.slice(earliestIdx + matchedTag.startTag.length);
            this.inThink = true;
            this.currentEndTag = matchedTag.endTag;
            this.currentHandling = matchedTag.handling;
        }
    }

    flush(): void {
        if (!this.carry) {
            return;
        }

        // If no thinking handler, carry would never be used, but be safe.
        if (!this.handlers.onThinking) {
            this.handlers.onText?.(this.carry);
            this.hasEmittedText = true;
            this.carry = '';
            return;
        }

        if (this.inThink) {
            if (this.currentHandling === 'thinking') {
                this.handlers.onThinking?.(this.carry);
            }
            this.hasReceivedThinking = true;
        } else {
            this.handlers.onText?.(this.carry);
            this.hasEmittedText = true;
        }
        this.carry = '';
    }

    /**
     * Checks if text ends with a possible prefix of any applicable start tag.
     * Returns the split point to keep potential partial tags in carry.
     * Only considers tags that are still applicable (e.g., onlyAtStart tags
     * are skipped if text has already been emitted).
     */
    private splitKeepingPossibleStartTagPrefix(text: string): { emit: string; carry: string } {
        const lower = text.toLowerCase();
        const maxPrefixLen = Math.min(ThinkTagStreamParser.maxStartTagLength - 1, text.length);

        for (let k = maxPrefixLen; k > 0; k--) {
            const suffix = lower.slice(-k);
            // Check if this suffix is a prefix of any applicable start tag
            for (const tagPair of this.tagPairs) {
                // Skip onlyAtStart tags if we've already emitted text
                if (tagPair.onlyAtStart && this.hasEmittedText) {
                    continue;
                }
                // Skip requireNoThinking tags if thinking content has already been received
                if (tagPair.requireNoThinking && this.hasReceivedThinking) {
                    continue;
                }
                if (tagPair.startTag.startsWith(suffix)) {
                    return {
                        emit: text.slice(0, text.length - k),
                        carry: text.slice(text.length - k)
                    };
                }
            }
        }

        return { emit: text, carry: '' };
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
    /**
     * When true, use the OpenAI Responses API instead of Chat Completions.
     */
    useResponsesApi?: boolean;
    /**
     * When enabled, suppress chain-of-thought transmission:
     * - strips leading `<think>...</think>` blocks from visible output (does not forward them)
     * - does NOT forward `reasoning_content`/`reasoning`/`thinking` fields
     *
     * Note: `<thinking>...</thinking>` blocks are still forwarded as thinking content.
     */
    suppressChainOfThought?: boolean;
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
        if (streamOptions.useResponsesApi) {
            return this.streamResponsesCompletion(messages, model, streamOptions);
        }

        let fullContent = '';
        let thinkingChars = 0;
        let sawAnyModelOutput = false;

        const thinkTagParser = new ThinkTagStreamParser(
            {
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
            },
            {
                thinkTagHandling: streamOptions.suppressChainOfThought ? 'drop' : 'thinking'
            }
        );

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
                    sawAnyModelOutput = true;
                    thinkTagParser.ingest(messageContent);
                }

                const messageReasoningRaw = (messageAny as any)?.reasoning_content ?? (messageAny as any)?.reasoning ?? (messageAny as any)?.thinking;
                const messageReasoning = this.coerceThinkingText(messageReasoningRaw);
                if (messageReasoning && messageReasoning.length > 0) {
                    sawAnyModelOutput = true;
                    if (!streamOptions.suppressChainOfThought) {
                        thinkingChars += messageReasoning.length;
                        thinkTagParser.notifyThinkingReceived();
                        streamOptions.onThinkingChunk?.(messageReasoning);
                    }
                }

                const messageToolCalls = messageAny?.tool_calls;
                if (Array.isArray(messageToolCalls) && messageToolCalls.length > 0) {
                    sawAnyModelOutput = true;
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
                    sawAnyModelOutput = true;
                    if (!streamOptions.suppressChainOfThought) {
                        thinkingChars += reasoningContent.length;
                        thinkTagParser.notifyThinkingReceived();
                        streamOptions.onThinkingChunk?.(reasoningContent);
                    }
                }

                // Handle text content
                const content = delta?.content || '';
                if (content) {
                    sawAnyModelOutput = true;
                    // Some models embed thinking in <think>...</think> inside the normal content stream.
                    // Parse and route those parts to onThinkingChunk when available.
                    thinkTagParser.ingest(content);
                }

                // Handle tool calls in streaming response
                if (delta?.tool_calls) {
                    if (delta.tool_calls.length > 0) {
                        sawAnyModelOutput = true;
                    }
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
            if (!sawAnyModelOutput && completedToolCalls.length === 0 && !streamOptions.signal?.aborted) {
                logger.warn('Empty streaming response detected; falling back to non-streaming', 'OpenAI');
                logger.debug('Empty streaming response details', {
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
                    sawAnyModelOutput = true;
                    thinkTagParser.ingest(nonStreamContent);
                }

                const nonStreamReasoningRaw = msgAny?.reasoning_content ?? msgAny?.reasoning ?? msgAny?.thinking;
                const nonStreamReasoning = this.coerceThinkingText(nonStreamReasoningRaw);
                if (nonStreamReasoning && nonStreamReasoning.length > 0) {
                    sawAnyModelOutput = true;
                    if (!streamOptions.suppressChainOfThought) {
                        thinkingChars += nonStreamReasoning.length;
                        streamOptions.onThinkingChunk?.(nonStreamReasoning);
                    }
                }

                const nonStreamToolCalls = msgAny?.tool_calls;
                if (Array.isArray(nonStreamToolCalls) && nonStreamToolCalls.length > 0 && streamOptions.onToolCallsComplete) {
                    sawAnyModelOutput = true;
                    const mapped: CompletedToolCall[] = nonStreamToolCalls
                        .map((tc: Record<string, unknown>) => {
                            const tcFunction = tc?.function as Record<string, unknown> | undefined;
                            return {
                                id: (tc?.id as string) || '',
                                name: (tcFunction?.name as string) || '',
                                arguments: typeof tcFunction?.arguments === 'string' ? tcFunction.arguments : ''
                            };
                        })
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
                message: (err?.error as Record<string, unknown>)?.message ?? err?.message,
                responseData: (err?.response as Record<string, unknown> | undefined)?.data,
                errorDetails: err?.error as Record<string, unknown> | undefined
            }, 'OpenAI');

            throw new Error(`Failed to stream chat completion: ${error}`);
        }
    }

    private async streamResponsesCompletion(
        messages: ChatMessage[],
        model: string,
        streamOptions: StreamOptions
    ): Promise<string> {
        let fullContent = '';
        let sawAnyModelOutput = false;

        const thinkTagParser = new ThinkTagStreamParser(
            {
                onText: (chunk) => {
                    fullContent += chunk;
                    streamOptions.onChunk?.(chunk);
                },
                onThinking: streamOptions.onThinkingChunk
                    ? (chunk) => {
                        streamOptions.onThinkingChunk?.(chunk);
                    }
                    : undefined
            },
            {
                thinkTagHandling: streamOptions.suppressChainOfThought ? 'drop' : 'thinking'
            }
        );

        const responseInput = this.convertMessagesToResponsesInput(messages);
        const responseTools = this.convertToolsToResponsesTools(streamOptions.tools);
        const responseToolChoice = responseTools && responseTools.length > 0
            ? this.convertToolChoiceToResponsesToolChoice(streamOptions.toolChoice)
            : undefined;

        const maxTokens = (typeof streamOptions.maxTokens === 'number' && streamOptions.maxTokens > 0)
            ? streamOptions.maxTokens
            : 2048;

        const requestOptions: OpenAI.Responses.ResponseCreateParamsStreaming = {
            model,
            input: responseInput,
            stream: true,
            temperature: 1.0,
            max_output_tokens: maxTokens
        };

        if (responseTools && responseTools.length > 0) {
            requestOptions.tools = responseTools;
            if (responseToolChoice) {
                requestOptions.tool_choice = responseToolChoice;
            }
        }

        const toolCallsById = new Map<string, { id: string; name: string; arguments: string }>();
        const itemIdToCallId = new Map<string, string>();
        const textDeltaItemIds = new Set<string>();
        const refusalDeltaItemIds = new Set<string>();
        const reasoningDeltaItemIds = new Set<string>();

        const getOrCreateToolCall = (callId: string) => {
            let toolCall = toolCallsById.get(callId);
            if (!toolCall) {
                toolCall = { id: callId, name: '', arguments: '' };
                toolCallsById.set(callId, toolCall);
            }
            return toolCall;
        };

        const moveToolCall = (fromId: string, toId: string) => {
            if (fromId === toId) {
                return;
            }
            const existing = toolCallsById.get(fromId);
            if (!existing) {
                return;
            }
            toolCallsById.delete(fromId);
            toolCallsById.set(toId, { ...existing, id: toId });
        };

        const updateToolCallFromItem = (item: OpenAI.Responses.ResponseFunctionToolCall) => {
            const callId = item.call_id || item.id || '';
            if (!callId) {
                return;
            }

            if (item.id) {
                const previous = itemIdToCallId.get(item.id);
                itemIdToCallId.set(item.id, callId);
                if (previous && previous !== callId) {
                    moveToolCall(previous, callId);
                } else if (item.id !== callId) {
                    moveToolCall(item.id, callId);
                }
            }

            const toolCall = getOrCreateToolCall(callId);
            if (item.name) {
                toolCall.name = item.name;
            }
            if (typeof item.arguments === 'string') {
                toolCall.arguments = item.arguments;
            }

            if (streamOptions.onToolCall && toolCall.name) {
                streamOptions.onToolCall({
                    id: toolCall.id,
                    name: toolCall.name,
                    arguments: toolCall.arguments
                });
            }
            sawAnyModelOutput = true;
        };

        let chunkCount = 0;

        try {
            const stream = await this.client.responses.create(requestOptions);

            for await (const event of stream as AsyncIterable<OpenAI.Responses.ResponseStreamEvent>) {
                chunkCount++;
                if (streamOptions.signal?.aborted) {
                    break;
                }

                switch (event.type) {
                    case 'response.output_text.delta': {
                        if (event.delta) {
                            sawAnyModelOutput = true;
                            textDeltaItemIds.add(event.item_id);
                            thinkTagParser.ingest(event.delta);
                        }
                        break;
                    }
                    case 'response.output_text.done': {
                        if (!textDeltaItemIds.has(event.item_id) && event.text) {
                            sawAnyModelOutput = true;
                            thinkTagParser.ingest(event.text);
                        }
                        break;
                    }
                    case 'response.refusal.delta': {
                        if (event.delta) {
                            sawAnyModelOutput = true;
                            refusalDeltaItemIds.add(event.item_id);
                            thinkTagParser.ingest(event.delta);
                        }
                        break;
                    }
                    case 'response.refusal.done': {
                        if (!refusalDeltaItemIds.has(event.item_id) && event.refusal) {
                            sawAnyModelOutput = true;
                            thinkTagParser.ingest(event.refusal);
                        }
                        break;
                    }
                    case 'response.reasoning_text.delta': {
                        sawAnyModelOutput = true;
                        if (!streamOptions.suppressChainOfThought && event.delta) {
                            reasoningDeltaItemIds.add(event.item_id);
                            thinkTagParser.notifyThinkingReceived();
                            streamOptions.onThinkingChunk?.(event.delta);
                        }
                        break;
                    }
                    case 'response.reasoning_text.done': {
                        sawAnyModelOutput = true;
                        if (!streamOptions.suppressChainOfThought && event.text && !reasoningDeltaItemIds.has(event.item_id)) {
                            thinkTagParser.notifyThinkingReceived();
                            streamOptions.onThinkingChunk?.(event.text);
                        }
                        break;
                    }
                    case 'response.output_item.added':
                    case 'response.output_item.done': {
                        const outputItem = event.item;
                        if (outputItem?.type === 'function_call') {
                            updateToolCallFromItem(outputItem as OpenAI.Responses.ResponseFunctionToolCall);
                        }
                        break;
                    }
                    case 'response.function_call_arguments.delta': {
                        sawAnyModelOutput = true;
                        const callId = itemIdToCallId.get(event.item_id) ?? event.item_id;
                        if (callId !== event.item_id) {
                            moveToolCall(event.item_id, callId);
                        }
                        const toolCall = getOrCreateToolCall(callId);
                        toolCall.arguments += event.delta ?? '';
                        if (streamOptions.onToolCall && toolCall.name) {
                            streamOptions.onToolCall({
                                id: toolCall.id,
                                name: toolCall.name,
                                arguments: toolCall.arguments
                            });
                        }
                        break;
                    }
                    case 'response.function_call_arguments.done': {
                        sawAnyModelOutput = true;
                        const callId = itemIdToCallId.get(event.item_id) ?? event.item_id;
                        if (callId !== event.item_id) {
                            moveToolCall(event.item_id, callId);
                        }
                        const toolCall = getOrCreateToolCall(callId);
                        if (event.name) {
                            toolCall.name = event.name;
                        }
                        if (typeof event.arguments === 'string') {
                            toolCall.arguments = event.arguments;
                        }
                        if (streamOptions.onToolCall && toolCall.name) {
                            streamOptions.onToolCall({
                                id: toolCall.id,
                                name: toolCall.name,
                                arguments: toolCall.arguments
                            });
                        }
                        break;
                    }
                }
            }

            thinkTagParser.flush();

            const completedToolCalls: CompletedToolCall[] = Array.from(toolCallsById.values())
                .filter(tc => tc.id && tc.name)
                .map(tc => ({
                    id: tc.id,
                    name: tc.name,
                    arguments: tc.arguments
                }));

            if (streamOptions.onToolCallsComplete && completedToolCalls.length > 0) {
                streamOptions.onToolCallsComplete(completedToolCalls);
            }

            if (!sawAnyModelOutput && completedToolCalls.length === 0 && !streamOptions.signal?.aborted) {
                logger.warn('Empty responses stream detected; falling back to non-streaming', 'OpenAI');
                logger.debug('Empty responses stream details', {
                    model,
                    chunkCount
                }, 'OpenAI');

                const fallbackRequest: OpenAI.Responses.ResponseCreateParamsNonStreaming = {
                    model,
                    input: responseInput,
                    stream: false,
                    temperature: 0.7,
                    max_output_tokens: maxTokens
                };

                if (responseTools && responseTools.length > 0) {
                    fallbackRequest.tools = responseTools;
                    if (responseToolChoice) {
                        fallbackRequest.tool_choice = responseToolChoice;
                    }
                }

                const response = await this.client.responses.create(fallbackRequest) as OpenAI.Responses.Response;

                const nonStreamContent = response?.output_text;
                if (typeof nonStreamContent === 'string' && nonStreamContent.length > 0) {
                    sawAnyModelOutput = true;
                    thinkTagParser.ingest(nonStreamContent);
                }

                const nonStreamToolCalls: CompletedToolCall[] = [];
                const seenToolCallIds = new Set<string>();
                if (Array.isArray(response?.output)) {
                    for (const item of response.output) {
                        if (item?.type === 'function_call') {
                            const toolItem = item as OpenAI.Responses.ResponseFunctionToolCall;
                            const callId = toolItem.call_id || toolItem.id || '';
                            if (!callId || !toolItem.name || seenToolCallIds.has(callId)) {
                                continue;
                            }
                            seenToolCallIds.add(callId);
                            nonStreamToolCalls.push({
                                id: callId,
                                name: toolItem.name,
                                arguments: typeof toolItem.arguments === 'string' ? toolItem.arguments : ''
                            });
                        }
                    }
                }

                if (nonStreamToolCalls.length > 0) {
                    sawAnyModelOutput = true;
                    if (streamOptions.onToolCallsComplete) {
                        streamOptions.onToolCallsComplete(nonStreamToolCalls);
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

            logger.error('streamResponsesCompletion failed', error, 'OpenAI');
            logger.debug('streamResponsesCompletion error details', {
                model,
                messageCount: responseInput.length,
                toolsCount: responseTools?.length ?? 0,
                toolChoice: responseToolChoice ?? undefined,
                status: err?.status ?? (err?.response as Record<string, unknown>)?.status,
                code: err?.code ?? (err?.error as Record<string, unknown>)?.code,
                name: err?.name,
                message: (err?.error as Record<string, unknown>)?.message ?? err?.message,
                responseData: (err?.response as Record<string, unknown> | undefined)?.data,
                errorDetails: err?.error as Record<string, unknown> | undefined
            }, 'OpenAI');

            throw new Error(`Failed to stream responses completion: ${error}`);
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
                        logger.warn('Tool message missing valid tool_call_id, using fallback', 'OpenAI');
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

    private convertMessagesToResponsesInput(messages: ChatMessage[]): OpenAI.Responses.ResponseInputItem[] {
        const inputItems: OpenAI.Responses.ResponseInputItem[] = [];
        let fallbackIdCounter = 0;

        const ensureCallId = (value: unknown, context: string): string => {
            if (typeof value === 'string' && value.trim().length > 0) {
                return value;
            }
            logger.warn(`${context} missing valid call_id, using fallback`, 'OpenAI');
            return `call_fallback_${Date.now()}_${fallbackIdCounter++}_${Math.random().toString(36).slice(2, 9)}`;
        };

        for (const msg of messages) {
            if (msg.role === 'tool') {
                const callId = ensureCallId(msg.tool_call_id, 'Tool message');
                inputItems.push({
                    type: 'function_call_output',
                    call_id: callId,
                    output: msg.content ?? ''
                });
                continue;
            }

            if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
                if (typeof msg.content === 'string' && msg.content.length > 0) {
                    inputItems.push({
                        role: 'assistant',
                        content: msg.content,
                        type: 'message'
                    });
                }

                for (const toolCall of msg.tool_calls) {
                    const callId = ensureCallId(toolCall.id, `Tool call (${toolCall.function?.name ?? 'unknown'})`);
                    const name = toolCall.function?.name;
                    if (!name) {
                        continue;
                    }
                    inputItems.push({
                        type: 'function_call',
                        call_id: callId,
                        name,
                        arguments: toolCall.function.arguments ?? ''
                    });
                }
                continue;
            }

            const content = msg.content ?? '';
            if (!content) {
                continue;
            }

            const role = msg.role === 'system'
                ? 'system'
                : msg.role === 'assistant'
                    ? 'assistant'
                    : 'user';

            inputItems.push({
                role,
                content,
                type: 'message'
            });
        }

        return inputItems;
    }

    private convertToolsToResponsesTools(tools: ToolDefinition[] | undefined): OpenAI.Responses.Tool[] | undefined {
        if (!tools || tools.length === 0) {
            return undefined;
        }

        const converted: OpenAI.Responses.Tool[] = [];
        for (const tool of tools) {
            if (tool.type !== 'function') {
                continue;
            }
            const name = tool.function?.name?.trim();
            if (!name) {
                continue;
            }
            const parameters = tool.function.parameters ?? { type: 'object', properties: {} };
            converted.push({
                type: 'function',
                name,
                description: tool.function.description ?? undefined,
                parameters,
                strict: true
            });
        }

        return converted.length > 0 ? converted : undefined;
    }

    private convertToolChoiceToResponsesToolChoice(toolChoice: ToolChoice | undefined): OpenAI.Responses.ToolChoiceOptions | OpenAI.Responses.ToolChoiceFunction | undefined {
        if (!toolChoice) {
            return undefined;
        }
        if (toolChoice === 'none' || toolChoice === 'auto' || toolChoice === 'required') {
            return toolChoice;
        }
        const name = toolChoice.function?.name;
        if (!name) {
            return undefined;
        }
        return {
            type: 'function',
            name
        };
    }
}
