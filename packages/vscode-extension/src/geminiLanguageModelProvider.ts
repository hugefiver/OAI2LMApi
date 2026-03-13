import * as vscode from 'vscode';
import type {
    JSONValue,
    LanguageModelV2,
    LanguageModelV2FunctionTool,
    LanguageModelV2Message,
    LanguageModelV2StreamPart,
    LanguageModelV2ToolChoice
} from '@ai-sdk/provider';
import type { GoogleGenerativeAIProviderOptions } from '@ai-sdk/google';
import {
    GeminiClient,
    GeminiCountTokensContent,
    GeminiModelInfo,
    getGeminiModelId,
    supportsTextGeneration,
    supportsGeminiFunctionCalling
} from './geminiClient';
import { GEMINI_API_KEY_SECRET_KEY, GEMINI_CACHED_MODELS_KEY } from './constants';
import { getModelMetadata } from './modelMetadata';
import { stripSchemaField } from './schemaUtils';
import { generateXmlToolPrompt, formatToolCallAsXml, formatToolResultAsText, XmlToolCallStreamParser, XmlToolParseOptions } from './xmlToolPrompt';
import { getModelOverride } from './configUtils';
import { logger } from './logger';
import { modelsDevRegistry } from './modelsDevClient';

interface GeminiModelInformation extends vscode.LanguageModelChatInformation {
    modelId: string;
}

type UserMessageContentPart =
    | { type: 'text'; text: string }
    | { type: 'file'; mediaType: string; data: string };

type AssistantMessageContentPart =
    | { type: 'text'; text: string }
    | { type: 'tool-call'; toolCallId: string; toolName: string; input: unknown };

type ToolMessageContentPart = {
    type: 'tool-result';
    toolCallId: string;
    toolName: string;
    output: { type: 'text'; value: string };
};

type GeminiThinkingLevel = 'minimal' | 'low' | 'medium' | 'high';

export class GeminiLanguageModelProvider implements vscode.LanguageModelChatProvider<GeminiModelInformation>, vscode.Disposable {
    private client: GeminiClient | undefined;
    private disposables: vscode.Disposable[] = [];
    private modelList: GeminiModelInformation[] = [];
    private _onDidChangeLanguageModelChatInformation = new vscode.EventEmitter<void>();
    private _initialized = false;

    readonly onDidChangeLanguageModelChatInformation = this._onDidChangeLanguageModelChatInformation.event;

    constructor(private context: vscode.ExtensionContext) {}

    async initialize(): Promise<void> {
        const config = vscode.workspace.getConfiguration('oai2lmapi');
        const apiEndpoint = config.get<string>('geminiApiEndpoint', 'https://generativelanguage.googleapis.com');

        const apiKey = await this.context.secrets.get(GEMINI_API_KEY_SECRET_KEY);

        if (!apiKey) {
            logger.debug('API key not configured, provider will not be enabled', undefined, 'Gemini');
            return;
        }

        logger.info(`Initializing with endpoint: ${apiEndpoint}`, 'Gemini');

        this.client = new GeminiClient({
            apiEndpoint,
            apiKey
        });

        logger.info('Registering language model provider', 'Gemini');
        const disposable = vscode.lm.registerLanguageModelChatProvider('gemini2lmapi', this);
        this.disposables.push(disposable);
        this._initialized = true;

        const cachedModels = this.context.globalState.get<GeminiModelInfo[]>(GEMINI_CACHED_MODELS_KEY);
        if (cachedModels && cachedModels.length > 0) {
            logger.info(`Loading ${cachedModels.length} models from cache`, 'Gemini');
            this.updateModelList(cachedModels);
        }

        const autoLoadModels = config.get<boolean>('autoLoadModels', true);
        if (autoLoadModels) {
            logger.info('Auto-loading models from API', 'Gemini');
            await this.loadModels();
        } else {
            logger.warn('autoLoadModels is disabled', 'Gemini');
            if (!cachedModels || cachedModels.length === 0) {
                vscode.window.showWarningMessage(
                    'GeminiProvider: autoLoadModels is disabled. No models have been loaded.'
                );
            }
        }
    }

    get isInitialized(): boolean {
        return this._initialized;
    }

    private updateModelList(apiModels: GeminiModelInfo[]) {
        const config = vscode.workspace.getConfiguration('oai2lmapi');
        const showModelsWithoutToolCalling = config.get<boolean>('showModelsWithoutToolCalling', false);

        this.modelList = [];

        let addedCount = 0;
        let filteredCount = 0;
        for (const apiModel of apiModels) {
            const modelId = getGeminiModelId(apiModel);

            if (!modelId) {
                filteredCount++;
                logger.debug('Filtered out model with missing name', {
                    displayName: apiModel.displayName,
                    baseModelId: apiModel.baseModelId
                }, 'Gemini');
                continue;
            }

            if (!supportsTextGeneration(apiModel)) {
                filteredCount++;
                logger.debug(`Filtered out non-text model: ${modelId}`, undefined, 'Gemini');
                continue;
            }

            if (!showModelsWithoutToolCalling && !supportsGeminiFunctionCalling(apiModel)) {
                filteredCount++;
                logger.debug(`Filtered out model without function calling: ${modelId}`, undefined, 'Gemini');
                continue;
            }

            this.addModel(apiModel);
            addedCount++;
        }

        logger.info(`Added ${addedCount} models, filtered ${filteredCount} models`, 'Gemini');
        this._onDidChangeLanguageModelChatInformation.fire();
    }

    async loadModels(): Promise<void> {
        if (!this.client) {
            logger.warn('Client not initialized', 'Gemini');
            return;
        }

        try {
            const apiModels = await this.client.listModels();
            logger.info(`Loaded ${apiModels.length} models from API`, 'Gemini');

            this.updateModelList(apiModels);

            await this.context.globalState.update(GEMINI_CACHED_MODELS_KEY, apiModels);

            modelsDevRegistry.onModelsLoaded(
                apiModels.map(m => getGeminiModelId(m)).filter((id): id is string => !!id)
            );
        } catch (error) {
            logger.error('Failed to load models', error, 'Gemini');
            vscode.window.showErrorMessage('GeminiProvider: Failed to load models.');
            this._onDidChangeLanguageModelChatInformation.fire();
        }
    }

    private extractModelFamily(modelId: string): string {
        const name = modelId.replace(/^models\//, '');

        const patterns = [
            /^(gemini-3|gemini-2\.5|gemini-2\.0|gemini-1\.5|gemini-1\.0)/i,
            /^gemini/i,
        ];

        for (const pattern of patterns) {
            const match = name.match(pattern);
            if (match) {
                return match[1] ? match[1].toLowerCase() : 'gemini';
            }
        }

        return name.toLowerCase();
    }

    private addModel(apiModel: GeminiModelInfo) {
        const modelId = getGeminiModelId(apiModel);
        if (!modelId) {
            logger.debug('Skipping model with no identifiable name', undefined, 'Gemini');
            return;
        }

        const family = this.extractModelFamily(modelId);
        const registryMetadata = getModelMetadata(modelId, apiModel.displayName ?? undefined);
        const apiToolCalling = supportsGeminiFunctionCalling(apiModel);
        const apiVision = this.supportsVision(modelId);

        let maxInputTokens = this.getValidNumber(apiModel.inputTokenLimit)
            ?? registryMetadata.maxInputTokens
            ?? 32768;
        let maxOutputTokens = this.getValidNumber(apiModel.outputTokenLimit)
            ?? registryMetadata.maxOutputTokens
            ?? 8192;
        let supportsToolCalling = apiToolCalling;
        let supportsImageInput = typeof registryMetadata.supportsImageInput === 'boolean'
            ? registryMetadata.supportsImageInput
            : apiVision;

        const override = getModelOverride(modelId, 'gemini');
        if (override) {
            const validInputTokens = this.getValidNumber(override.maxInputTokens);
            if (validInputTokens !== undefined) {
                maxInputTokens = validInputTokens;
            }
            const validOutputTokens = this.getValidNumber(override.maxOutputTokens);
            if (validOutputTokens !== undefined) {
                maxOutputTokens = validOutputTokens;
            }
            if (typeof override.supportsToolCalling === 'boolean') {
                supportsToolCalling = override.supportsToolCalling;
            }
            if (typeof override.supportsImageInput === 'boolean') {
                supportsImageInput = override.supportsImageInput;
            }
        }

        const modelInfo: GeminiModelInformation = {
            modelId: modelId,
            id: `gemini-${modelId}`,
            family: family,
            name: apiModel.displayName || modelId,
            version: apiModel.version || '1.0',
            maxInputTokens,
            maxOutputTokens,
            capabilities: {
                toolCalling: supportsToolCalling,
                imageInput: supportsImageInput
            }
        };

        this.modelList.push(modelInfo);
        const hasOverride = override ? ' (with overrides)' : '';
        logger.debug(`Added model: ${modelInfo.id} (family: ${family})${hasOverride}`, undefined, 'Gemini');
    }

    private getValidNumber(value: number | null | undefined): number | undefined {
        return typeof value === 'number' && Number.isFinite(value) && value > 0
            ? value
            : undefined;
    }

    private supportsVision(modelId: string | null | undefined): boolean {
        if (!modelId) {
            return false;
        }
        const visionModels = [
            'gemini-3',
            'gemini-2.5',
            'gemini-2.0',
            'gemini-1.5',
            'gemini-pro-vision'
        ];
        const lowerModelId = modelId.toLowerCase();
        return visionModels.some(prefix => lowerModelId.includes(prefix)) ||
               lowerModelId.includes('vision');
    }

    async provideLanguageModelChatInformation(
        options: vscode.PrepareLanguageModelChatModelOptions,
        token: vscode.CancellationToken
    ): Promise<GeminiModelInformation[]> {
        logger.debug(`Providing ${this.modelList.length} models to VSCode`, undefined, 'Gemini');
        return this.modelList;
    }

    async provideLanguageModelChatResponse(
        model: GeminiModelInformation,
        messages: readonly vscode.LanguageModelChatRequestMessage[],
        options: vscode.ProvideLanguageModelChatResponseOptions,
        progress: vscode.Progress<vscode.ExLanguageModelResponsePart>,
        token: vscode.CancellationToken
    ): Promise<void> {
        if (!this.client) {
            throw new Error('Gemini client not initialized');
        }

        const modelOverride = getModelOverride(model.modelId, 'gemini');
        const usePromptBasedToolCalling = modelOverride?.usePromptBasedToolCalling === true;

        const config = vscode.workspace.getConfiguration('oai2lmapi');
        const globalTrimXmlToolParameterWhitespace = config.get<boolean>('trimXmlToolParameterWhitespace', false);
        const trimXmlToolParameterWhitespace = modelOverride?.trimXmlToolParameterWhitespace ?? globalTrimXmlToolParameterWhitespace;
        const xmlParseOptions: XmlToolParseOptions = {
            trimParameterWhitespace: trimXmlToolParameterWhitespace
        };

        const { messages: convertedMessages, toolCallNames } = this.convertMessages(messages);
        let aiMessages = convertedMessages;

        const availableToolNames = options.tools?.map(t => t.name).filter((n): n is string => !!n) ?? [];

        let aiTools: LanguageModelV2FunctionTool[] | undefined;
        let aiToolChoice: LanguageModelV2ToolChoice | undefined;

        if (usePromptBasedToolCalling && options.tools && options.tools.length > 0) {
            const xmlToolPrompt = generateXmlToolPrompt(options.tools);
            aiMessages = this.applyPromptBasedToolCalling(this.appendSystemPrompt(aiMessages, xmlToolPrompt));
            aiTools = undefined;
            aiToolChoice = undefined;
            logger.debug(`Using prompt-based tool calling for model ${model.modelId}`, undefined, 'Gemini');
        } else {
            aiTools = this.convertTools(options.tools);
            aiToolChoice = aiTools && aiTools.length > 0 ? this.convertToolMode(options.toolMode) : undefined;
        }

        type TokenBudgetOptions = {
            tokenBudget?: number;
            maxTokens?: number;
            maxOutputTokens?: number;
        };
        const optionsWithBudget = options as Partial<TokenBudgetOptions>;
        const budgetFromOptions: unknown =
            optionsWithBudget.tokenBudget ??
            optionsWithBudget.maxTokens ??
            optionsWithBudget.maxOutputTokens;
        const budgetNumber = typeof budgetFromOptions === 'number' && Number.isFinite(budgetFromOptions) ? budgetFromOptions : undefined;
        const modelBudget = typeof model.maxOutputTokens === 'number' && Number.isFinite(model.maxOutputTokens) ? model.maxOutputTokens : 8192;
        const maxTokens = budgetNumber ?? modelBudget;

        const abortController = new AbortController();
        if (token) {
            token.onCancellationRequested(() => {
                abortController.abort();
            });
        }

        const reportedToolCallIds = new Set<string>();
        const reasoningSignatures = new Map<string, string>();

        this._toolCallNames.clear();
        for (const [id, name] of toolCallNames) {
            this._toolCallNames.set(id, name);
        }

        const streamParser = usePromptBasedToolCalling && availableToolNames.length > 0
            ? new XmlToolCallStreamParser(availableToolNames, xmlParseOptions)
            : null;

        const aiModel = this.client.getModel(model.modelId);
        const googleProviderOptions = this.buildGoogleProviderOptions(model.modelId);
        const providerOptions = Object.keys(googleProviderOptions).length > 0
            ? { google: googleProviderOptions as Record<string, JSONValue> }
            : undefined;

        const { stream } = await aiModel.doStream({
            prompt: aiMessages,
            tools: aiTools,
            toolChoice: aiToolChoice,
            maxOutputTokens: maxTokens,
            temperature: typeof modelOverride?.temperature === 'number' ? modelOverride.temperature : undefined,
            providerOptions,
            abortSignal: abortController.signal,
        });

        const reader = stream.getReader();
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    break;
                }

                this.processStreamPart(value, progress, streamParser, reportedToolCallIds, reasoningSignatures);
            }
        } finally {
            reader.releaseLock();
        }

        if (streamParser) {
            const remainingToolCalls = streamParser.finalize();
            for (const toolCall of remainingToolCalls) {
                if (reportedToolCallIds.has(toolCall.id)) {
                    continue;
                }
                reportedToolCallIds.add(toolCall.id);
                this._toolCallNames.set(toolCall.id, toolCall.name);

                progress.report(new vscode.LanguageModelToolCallPart(
                    toolCall.id,
                    toolCall.name,
                    toolCall.arguments
                ));
                logger.debug(`Finalized XML tool call: ${toolCall.name}`, undefined, 'Gemini');
            }

            const nonToolCallText = streamParser.getNonToolCallText();
            if (nonToolCallText) {
                progress.report(new vscode.LanguageModelTextPart(nonToolCallText));
            }
        }
    }

    private _toolCallNames: Map<string, string> = new Map();

    private convertMessages(messages: readonly vscode.LanguageModelChatRequestMessage[]): {
        messages: LanguageModelV2Message[];
        toolCallNames: Map<string, string>;
    } {
        const aiMessages: LanguageModelV2Message[] = [];
        const toolCallNames = new Map<string, string>();
        let systemContent: string | undefined;

        for (const msg of messages) {
            const role = this.mapRole(msg.role);

            if (role === 'system') {
                const text = this.extractTextContent(msg);
                if (text) {
                    systemContent = systemContent ? `${systemContent}\n${text}` : text;
                }
                continue;
            }

            const parts = this.normalizeMessageParts(msg.content);
            aiMessages.push(...this.convertNativeMessage(role, parts, toolCallNames));
        }

        if (systemContent) {
            aiMessages.unshift({ role: 'system', content: systemContent });
        }

        return { messages: aiMessages, toolCallNames };
    }

    private convertNativeMessage(
        role: 'user' | 'assistant',
        parts: unknown[],
        toolCallNames: Map<string, string>
    ): LanguageModelV2Message[] {
        const converted: LanguageModelV2Message[] = [];
        const userContent: UserMessageContentPart[] = [];
        const assistantContent: AssistantMessageContentPart[] = [];
        const toolContent: ToolMessageContentPart[] = [];

        for (const part of parts) {
            if (this.isToolCallPart(part)) {
                toolCallNames.set(part.callId, part.name);
                if (role === 'assistant') {
                    assistantContent.push({
                        type: 'tool-call',
                        toolCallId: part.callId,
                        toolName: part.name,
                        input: part.input
                    });
                }
                continue;
            }

            if (this.isToolResultPart(part)) {
                toolContent.push({
                    type: 'tool-result',
                    toolCallId: part.callId,
                    toolName: this.resolveToolName(part.callId, toolCallNames, part),
                    output: {
                        type: 'text',
                        value: this.extractToolResultContent(part)
                    }
                });
                continue;
            }

            if (role === 'user') {
                const filePart = this.convertFilePart(part);
                if (filePart) {
                    userContent.push(filePart);
                    continue;
                }

                const text = this.extractTextFromPart(part);
                if (text) {
                    userContent.push({ type: 'text', text });
                }
                continue;
            }

            const filePart = this.convertFilePart(part);
            if (filePart) {
                logger.debug('File/data parts in assistant messages are not supported by AI SDK, skipping', undefined, 'Gemini');
                continue;
            }

            const text = this.extractTextFromPart(part);
            if (text) {
                assistantContent.push({ type: 'text', text });
            }
        }

        if (toolContent.length > 0) {
            converted.push({ role: 'tool', content: toolContent });
        }

        if (role === 'user' && userContent.length > 0) {
            converted.push({ role: 'user', content: userContent });
        }

        if (role === 'assistant' && assistantContent.length > 0) {
            converted.push({ role: 'assistant', content: assistantContent });
        }

        return converted;
    }

    private applyPromptBasedToolCalling(messages: LanguageModelV2Message[]): LanguageModelV2Message[] {
        const converted: LanguageModelV2Message[] = [];

        for (const message of messages) {
            if (message.role === 'system' || message.role === 'user') {
                converted.push(message);
                continue;
            }

            if (message.role === 'tool') {
                const toolResultContent: Array<{ type: 'text'; text: string }> = [];
                for (const part of message.content) {
                    toolResultContent.push({
                        type: 'text',
                        text: formatToolResultAsText(part.toolName, this.stringifyToolResultOutput(part.output))
                    });
                }

                if (toolResultContent.length > 0) {
                    converted.push({ role: 'user', content: toolResultContent });
                }
                continue;
            }

            const assistantContent: Array<{ type: 'text'; text: string }> = [];
            for (const part of message.content) {
                if (part.type === 'text') {
                    assistantContent.push({ type: 'text', text: part.text });
                    continue;
                }

                if (part.type === 'tool-call') {
                    assistantContent.push({
                        type: 'text',
                        text: formatToolCallAsXml(part.toolName, this.normalizeToolCallInput(part.input))
                    });
                }
            }

            if (assistantContent.length > 0) {
                converted.push({ role: 'assistant', content: assistantContent });
            }
        }

        return converted;
    }

    private normalizeMessageParts(content: unknown): unknown[] {
        if (typeof content === 'string') {
            return [{ value: content }];
        }

        if (Array.isArray(content)) {
            return content;
        }

        if (content && typeof content === 'object') {
            return [content];
        }

        return [];
    }

    private convertFilePart(part: unknown): { type: 'file'; mediaType: string; data: string } | undefined {
        if (!this.isRecord(part) || typeof part.uri !== 'string') {
            return undefined;
        }

        if (!part.uri.startsWith('data:')) {
            logger.debug('Non-base64 image URIs are not supported', undefined, 'Gemini');
            return undefined;
        }

        const matches = part.uri.match(/^data:([^;]+);base64,(.+)$/);
        if (!matches) {
            return undefined;
        }

        return {
            type: 'file',
            mediaType: matches[1],
            data: matches[2]
        };
    }

    private isToolCallPart(part: unknown): part is { callId: string; name: string; input: unknown } {
        return this.isRecord(part)
            && typeof part.callId === 'string'
            && typeof part.name === 'string'
            && 'input' in part;
    }

    private isToolResultPart(part: unknown): part is { callId: string; content: unknown } {
        return this.isRecord(part)
            && typeof part.callId === 'string'
            && 'content' in part
            && !('name' in part);
    }

    private isRecord(value: unknown): value is Record<string, unknown> {
        return typeof value === 'object' && value !== null && !Array.isArray(value);
    }

    private normalizeToolCallInput(input: unknown): Record<string, unknown> {
        if (this.isRecord(input)) {
            return input;
        }

        if (typeof input === 'string') {
            try {
                const parsed = JSON.parse(input) as unknown;
                if (this.isRecord(parsed)) {
                    return parsed;
                }
            } catch {
                logger.debug('Failed to parse tool call input as JSON for XML conversion', undefined, 'Gemini');
            }
        }

        return {};
    }

    private resolveToolName(callId: string, toolCallNames: Map<string, string>, part?: unknown): string {
        const explicitToolName = this.getToolNameFromResult(part);
        if (explicitToolName) {
            return explicitToolName;
        }

        return toolCallNames.get(callId) || this._toolCallNames.get(callId) || callId;
    }

    private getToolNameFromResult(part: unknown): string | undefined {
        if (!this.isRecord(part)) {
            return undefined;
        }

        const toolName = part.toolName;
        return typeof toolName === 'string' ? toolName : undefined;
    }

    private appendSystemPrompt(messages: LanguageModelV2Message[], systemPrompt: string): LanguageModelV2Message[] {
        if (!systemPrompt.trim()) {
            return messages;
        }

        const updatedMessages = [...messages];
        for (let i = 0; i < updatedMessages.length; i++) {
            const message = updatedMessages[i];
            if (message.role === 'system') {
                updatedMessages[i] = {
                    role: 'system',
                    content: message.content ? `${message.content}\n\n${systemPrompt}` : systemPrompt
                };
                return updatedMessages;
            }
        }

        updatedMessages.unshift({ role: 'system', content: systemPrompt });
        return updatedMessages;
    }

    private extractToolResultContent(part: { callId: string; content: unknown }): string {
        const content = part.content;
        if (Array.isArray(content)) {
            return content.map(c => this.extractTextFromPart(c)).join('');
        }
        if (typeof content === 'string') {
            return content;
        }
        return '';
    }

    private stringifyToolResultOutput(output: { type: string; value: unknown }): string {
        switch (output.type) {
            case 'text':
            case 'error-text':
                return typeof output.value === 'string' ? output.value : String(output.value);
            case 'content':
                if (Array.isArray(output.value)) {
                    return output.value.map(item => {
                        if (this.isRecord(item) && item.type === 'text' && typeof item.text === 'string') {
                            return item.text;
                        }
                        return '[media]';
                    }).join('\n');
                }
                return '';
            case 'json':
            case 'error-json':
            default:
                try {
                    return JSON.stringify(output.value);
                } catch {
                    return String(output.value);
                }
        }
    }

    private extractTextContent(msg: vscode.LanguageModelChatRequestMessage): string {
        if (typeof msg.content === 'string') {
            return msg.content;
        }
        if (Array.isArray(msg.content)) {
            return msg.content.map(part => this.extractTextFromPart(part)).join('');
        }
        if (msg.content && typeof msg.content === 'object') {
            return this.extractTextFromPart(msg.content);
        }
        return '';
    }

    private extractTextFromPart(part: unknown): string {
        if (!part || typeof part !== 'object') {
            return '';
        }

        if ('value' in part && typeof (part as Record<string, unknown>).value === 'string') {
            return (part as { value: string }).value;
        }

        if ('text' in part && typeof (part as Record<string, unknown>).text === 'string') {
            return (part as { text: string }).text;
        }

        if ('content' in part && Array.isArray((part as Record<string, unknown>).content)) {
            const contentArray = (part as { content: unknown[] }).content;
            return contentArray.map(subPart => this.extractTextFromPart(subPart)).join('');
        }

        return '';
    }

    private convertTools(tools: readonly vscode.LanguageModelChatTool[] | undefined): LanguageModelV2FunctionTool[] | undefined {
        if (!tools || tools.length === 0) {
            return undefined;
        }

        const converted: LanguageModelV2FunctionTool[] = [];

        for (const tool of tools) {
            const name = (tool.name ?? '').trim();
            if (!name) {
                logger.debug('Skipping tool with invalid name (empty or whitespace only)', {
                    originalName: tool.name,
                    description: tool.description
                }, 'Gemini');
                continue;
            }

            let inputSchema: Record<string, unknown>;
            if (!this.isRecord(tool.inputSchema) || Object.keys(tool.inputSchema).length === 0) {
                inputSchema = { type: 'object', properties: {} };
            } else {
                inputSchema = stripSchemaField(tool.inputSchema);
                if (!('type' in inputSchema)) {
                    inputSchema = { ...inputSchema, type: 'object' };
                }
                if (inputSchema.type === 'object' && !('properties' in inputSchema)) {
                    inputSchema = { ...inputSchema, properties: {} };
                }
            }

            converted.push({
                type: 'function',
                name,
                description: (tool.description ?? '').trim() || undefined,
                inputSchema
            });
        }

        return converted.length > 0 ? converted : undefined;
    }

    private convertToolMode(toolMode: vscode.LanguageModelChatToolMode | undefined): LanguageModelV2ToolChoice {
        switch (toolMode) {
            case vscode.LanguageModelChatToolMode.Required:
                return { type: 'required' };
            case vscode.LanguageModelChatToolMode.Auto:
            default:
                return { type: 'auto' };
        }
    }

    private buildGoogleProviderOptions(modelId: string): GoogleGenerativeAIProviderOptions {
        const providerOptions: GoogleGenerativeAIProviderOptions = {};
        const override = getModelOverride(modelId, 'gemini');
        const thinking = override ? (override as { thinkingLevel?: unknown }).thinkingLevel : undefined;
        const thinkingConfig = this.normalizeThinkingConfig(thinking);

        if (thinkingConfig) {
            providerOptions.thinkingConfig = thinkingConfig;
        }

        return providerOptions;
    }

    private normalizeThinkingConfig(thinking: unknown): {
        thinkingBudget?: number;
        includeThoughts: true;
        thinkingLevel?: GeminiThinkingLevel;
    } | undefined {
        if (typeof thinking === 'number' && Number.isFinite(thinking)) {
            return {
                thinkingBudget: thinking,
                includeThoughts: true
            };
        }

        if (typeof thinking === 'string') {
            const normalized = thinking.trim().toLowerCase();
            if (!normalized || normalized === 'none') {
                return undefined;
            }
            if (normalized === 'auto') {
                return { includeThoughts: true };
            }
            if (this.isGeminiThinkingLevel(normalized)) {
                return {
                    thinkingLevel: normalized,
                    includeThoughts: true
                };
            }
            return undefined;
        }

        if (!this.isRecord(thinking)) {
            return undefined;
        }

        const thinkingBudget = typeof thinking.thinkingBudget === 'number' && Number.isFinite(thinking.thinkingBudget)
            ? thinking.thinkingBudget
            : undefined;

        const thinkingLevelValue = typeof thinking.thinkingLevel === 'string'
            ? thinking.thinkingLevel.trim().toLowerCase()
            : undefined;

        if (thinkingLevelValue === 'none') {
            return undefined;
        }

        if (thinkingBudget !== undefined) {
            return {
                thinkingBudget,
                includeThoughts: true
            };
        }

        if (!thinkingLevelValue) {
            return undefined;
        }

        if (thinkingLevelValue === 'auto') {
            return { includeThoughts: true };
        }

        if (this.isGeminiThinkingLevel(thinkingLevelValue)) {
            return {
                thinkingLevel: thinkingLevelValue,
                includeThoughts: true
            };
        }

        return undefined;
    }

    private isGeminiThinkingLevel(value: string): value is GeminiThinkingLevel {
        return value === 'minimal' || value === 'low' || value === 'medium' || value === 'high';
    }

    private processStreamPart(
        part: LanguageModelV2StreamPart,
        progress: vscode.Progress<vscode.ExLanguageModelResponsePart>,
        streamParser: XmlToolCallStreamParser | null,
        reportedToolCallIds: Set<string>,
        reasoningSignatures: Map<string, string>
    ): void {
        switch (part.type) {
            case 'text-delta': {
                if (streamParser) {
                    const newToolCalls = streamParser.addChunk(part.delta);
                    for (const toolCall of newToolCalls) {
                        if (reportedToolCallIds.has(toolCall.id)) {
                            continue;
                        }
                        reportedToolCallIds.add(toolCall.id);
                        this._toolCallNames.set(toolCall.id, toolCall.name);

                        progress.report(new vscode.LanguageModelToolCallPart(
                            toolCall.id,
                            toolCall.name,
                            toolCall.arguments
                        ));
                        logger.debug(`Streaming XML tool call detected: ${toolCall.name}`, undefined, 'Gemini');
                    }
                } else {
                    progress.report(new vscode.LanguageModelTextPart(part.delta));
                }
                return;
            }

            case 'reasoning-start': {
                const thoughtSignature = this.getThoughtSignature(part.providerMetadata);
                if (thoughtSignature) {
                    reasoningSignatures.set(part.id, thoughtSignature);
                }
                return;
            }

            case 'reasoning-delta': {
                const thoughtSignature = this.getThoughtSignature(part.providerMetadata);
                if (thoughtSignature) {
                    reasoningSignatures.set(part.id, thoughtSignature);
                }
                if (part.delta) {
                    progress.report(new vscode.LanguageModelThinkingPart(part.delta));
                }
                return;
            }

            case 'reasoning-end': {
                const signature = reasoningSignatures.get(part.id) ?? this.getThoughtSignature(part.providerMetadata);
                reasoningSignatures.delete(part.id);
                if (signature) {
                    progress.report(new vscode.LanguageModelThinkingPart('', undefined, { thoughtSignature: signature }));
                }
                return;
            }

            case 'tool-call': {
                if (reportedToolCallIds.has(part.toolCallId)) {
                    logger.warn(`Duplicate tool call id '${part.toolCallId}' for tool '${part.toolName}', ignoring`, 'Gemini');
                    return;
                }
                reportedToolCallIds.add(part.toolCallId);
                this._toolCallNames.set(part.toolCallId, part.toolName);

                progress.report(new vscode.LanguageModelToolCallPart(
                    part.toolCallId,
                    part.toolName,
                    this.parseStreamToolInput(part.input, part.toolName)
                ));
                return;
            }

            case 'error': {
                const errorDetail = (part as { error?: unknown }).error ?? part;
                logger.error('Gemini AI SDK stream error', errorDetail, 'Gemini');
                const errorMessage = errorDetail instanceof Error
                    ? errorDetail.message
                    : typeof errorDetail === 'string'
                        ? errorDetail
                        : 'Gemini streaming error';
                throw new Error(errorMessage);
            }

            default:
                return;
        }
    }

    private getThoughtSignature(providerMetadata: unknown): string | undefined {
        if (!this.isRecord(providerMetadata)) {
            return undefined;
        }

        const googleMetadata = providerMetadata.google;
        if (!this.isRecord(googleMetadata)) {
            return undefined;
        }

        const thoughtSignature = googleMetadata.thoughtSignature;
        return typeof thoughtSignature === 'string' && thoughtSignature.length > 0 ? thoughtSignature : undefined;
    }

    private parseStreamToolInput(input: unknown, toolName: string): Record<string, unknown> {
        if (typeof input === 'string') {
            try {
                const parsed = JSON.parse(input) as unknown;
                return this.isRecord(parsed) ? parsed : {};
            } catch {
                logger.debug(`Failed to parse tool call arguments for ${toolName}`, undefined, 'Gemini');
                return {};
            }
        }

        return this.isRecord(input) ? input : {};
    }

    private mapRole(role: vscode.LanguageModelChatMessageRole): 'system' | 'user' | 'assistant' {
        switch (role) {
            case vscode.LanguageModelChatMessageRole.User:
                return 'user';
            case vscode.LanguageModelChatMessageRole.Assistant:
                return 'assistant';
            default:
                return 'system';
        }
    }

    async provideTokenCount(
        model: GeminiModelInformation,
        text: string | vscode.LanguageModelChatRequestMessage,
        token: vscode.CancellationToken
    ): Promise<number> {
        if (!this.client) {
            return this.estimateTokens(text);
        }

        if (typeof text === 'string') {
            try {
                return await this.client.countTokens(text, model.modelId);
            } catch {
                return this.estimateTokens(text);
            }
        }

        const contents = this.buildCountTokensContents(text);
        try {
            return await this.client.countTokens(contents, model.modelId);
        } catch {
            return this.estimateTokens(text);
        }
    }

    private buildCountTokensContents(msg: vscode.LanguageModelChatRequestMessage): GeminiCountTokensContent[] {
        const role = this.mapRole(msg.role);
        const geminiRole = role === 'assistant' ? 'model' : role === 'system' ? 'user' : 'user';
        const parts: GeminiCountTokensContent['parts'] = [];

        if (typeof msg.content === 'string') {
            parts.push({ text: msg.content });
        } else if (Array.isArray(msg.content)) {
            for (const part of msg.content) {
                if (this.isToolCallPart(part)) {
                    parts.push({
                        functionCall: {
                            name: part.name,
                            args: this.normalizeToolCallInput(part.input)
                        }
                    });
                    continue;
                }

                const filePart = this.convertFilePart(part);
                if (filePart) {
                    parts.push({ inlineData: { mimeType: filePart.mediaType, data: filePart.data } });
                    continue;
                }

                const partText = this.extractTextFromPart(part);
                if (partText) {
                    parts.push({ text: partText });
                }
            }
        } else if (msg.content && typeof msg.content === 'object') {
            if (this.isToolCallPart(msg.content)) {
                parts.push({
                    functionCall: {
                        name: msg.content.name,
                        args: this.normalizeToolCallInput(msg.content.input)
                    }
                });
            } else {
                const filePart = this.convertFilePart(msg.content);
                if (filePart) {
                    parts.push({ inlineData: { mimeType: filePart.mediaType, data: filePart.data } });
                } else {
                    const partText = this.extractTextFromPart(msg.content);
                    if (partText) {
                        parts.push({ text: partText });
                    }
                }
            }
        }

        if (parts.length === 0) {
            parts.push({ text: '' });
        }

        return [{ role: geminiRole, parts }];
    }

    private estimateTokens(text: string | vscode.LanguageModelChatRequestMessage): number {
        let textContent: string;
        if (typeof text === 'string') {
            textContent = text;
        } else {
            textContent = this.extractTextContent(text);
        }
        return Math.ceil(textContent.length / 3);
    }

    dispose(): void {
        this._onDidChangeLanguageModelChatInformation.dispose();
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        this.disposables = [];
        this.modelList = [];
        this._initialized = false;
    }
}
