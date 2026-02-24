import * as vscode from 'vscode';
import { ClaudeClient, ClaudeModelInfo, ClaudeToolDefinition, ClaudeCompletedToolCall, convertVscodeMessagesToClaude } from './claudeClient';
import { CLAUDE_API_KEY_SECRET_KEY, CLAUDE_CACHED_MODELS_KEY } from './constants';
import { getModelMetadata, isLLMModel, ModelMetadata } from './modelMetadata';
import { generateXmlToolPrompt, formatToolCallAsXml, formatToolResultAsText, XmlToolCallStreamParser, XmlToolParseOptions } from './xmlToolPrompt';
import { getModelOverride } from './configUtils';
import { logger } from './logger';
import { modelsDevRegistry } from './modelsDevClient';

interface ClaudeModelInformation extends vscode.LanguageModelChatInformation {
    modelId: string;
}

export class ClaudeLanguageModelProvider implements vscode.LanguageModelChatProvider<ClaudeModelInformation>, vscode.Disposable {
    private client: ClaudeClient | undefined;
    private disposables: vscode.Disposable[] = [];
    private modelList: ClaudeModelInformation[] = [];
    private _onDidChangeLanguageModelChatInformation = new vscode.EventEmitter<void>();
    private _initialized = false;

    readonly onDidChangeLanguageModelChatInformation = this._onDidChangeLanguageModelChatInformation.event;

    constructor(private context: vscode.ExtensionContext) {}

    async initialize(): Promise<void> {
        const config = vscode.workspace.getConfiguration('oai2lmapi');
        const defaultOpenAiEndpoint = 'https://api.openai.com/v1';
        const openAiEndpoint = config.get<string>('apiEndpoint', defaultOpenAiEndpoint);
        const defaultClaudeEndpoint = openAiEndpoint === defaultOpenAiEndpoint
            ? 'https://api.anthropic.com/v1'
            : openAiEndpoint;
        const apiEndpoint = config.get<string>('claudeApiEndpoint', defaultClaudeEndpoint) || defaultClaudeEndpoint;

        const apiKey = await this.context.secrets.get(CLAUDE_API_KEY_SECRET_KEY);
        if (!apiKey) {
            logger.debug('API key not configured, provider will not be enabled', undefined, 'Claude');
            return;
        }

        logger.info(`Initializing with endpoint: ${apiEndpoint}`, 'Claude');

        this.client = new ClaudeClient({
            apiEndpoint,
            apiKey
        });

        logger.info('Registering language model provider', 'Claude');
        const disposable = vscode.lm.registerLanguageModelChatProvider('claude2lmapi', this);
        this.disposables.push(disposable);
        this._initialized = true;

        const cachedModels = this.context.globalState.get<ClaudeModelInfo[]>(CLAUDE_CACHED_MODELS_KEY);
        if (cachedModels && cachedModels.length > 0) {
            logger.info(`Loading ${cachedModels.length} models from cache`, 'Claude');
            this.updateModelList(cachedModels);
        }

        const autoLoadModels = config.get<boolean>('autoLoadModels', true);
        if (autoLoadModels) {
            logger.info('Auto-loading models from API', 'Claude');
            await this.loadModels();
        } else {
            logger.warn('autoLoadModels is disabled', 'Claude');
            if (!cachedModels || cachedModels.length === 0) {
                vscode.window.showWarningMessage(
                    'ClaudeProvider: autoLoadModels is disabled. No models have been loaded.'
                );
            }
        }
    }

    get isInitialized(): boolean {
        return this._initialized;
    }

    private updateModelList(apiModels: ClaudeModelInfo[]) {
        const config = vscode.workspace.getConfiguration('oai2lmapi');
        const showModelsWithoutToolCalling = config.get<boolean>('showModelsWithoutToolCalling', false);

        this.modelList = [];

        let addedCount = 0;
        let filteredCount = 0;
        for (const apiModel of apiModels) {
            const modelId = apiModel.id;
            if (!isLLMModel(modelId)) {
                filteredCount++;
                logger.debug(`Filtered out non-LLM model: ${modelId}`, undefined, 'Claude');
                continue;
            }

            if (!showModelsWithoutToolCalling && !this.modelSupportsToolCalling(modelId)) {
                filteredCount++;
                logger.debug(`Filtered out model without tool calling: ${modelId}`, undefined, 'Claude');
                continue;
            }

            this.addModel(apiModel);
            addedCount++;
        }

        logger.info(`Added ${addedCount} models, filtered ${filteredCount} models`, 'Claude');
        this._onDidChangeLanguageModelChatInformation.fire();
    }

    async loadModels(): Promise<void> {
        if (!this.client) {
            logger.warn('Claude client not initialized', 'Claude');
            return;
        }

        try {
            const apiModels = await this.client.listModels();
            logger.info(`Loaded ${apiModels.length} models from API`, 'Claude');
            this.updateModelList(apiModels);
            await this.context.globalState.update(CLAUDE_CACHED_MODELS_KEY, apiModels);

            // Notify models.dev registry of loaded model IDs for new-model detection
            await modelsDevRegistry.onModelsLoaded(apiModels.map(m => m.id));
        } catch (error) {
            logger.error('Failed to load models from API', error, 'Claude');
            vscode.window.showErrorMessage('ClaudeProvider: Failed to load models.');
            this._onDidChangeLanguageModelChatInformation.fire();
        }
    }

    private modelSupportsToolCalling(modelId: string): boolean {
        return getModelMetadata(modelId).supportsToolCalling;
    }

    private getModelInfo(modelId: string, displayName?: string): { metadata: ModelMetadata } {
        const registryMetadata = getModelMetadata(modelId, displayName);
        const metadata: ModelMetadata = { ...registryMetadata };
        return { metadata };
    }

    private extractModelFamily(modelId: string): string {
        const nameWithoutPrefix = modelId.replace(/^[^/]+\//, '');
        const patterns = [
            /^(claude-sonnet-4|claude-4|claude-3\.7|claude-3\.5|claude-3|claude-2\.1|claude-2|claude-instant)/i
        ];
        for (const pattern of patterns) {
            const match = nameWithoutPrefix.match(pattern);
            if (match) {
                return match[1].toLowerCase();
            }
        }
        return nameWithoutPrefix.toLowerCase();
    }

    private addModel(apiModel: ClaudeModelInfo) {
        const modelId = apiModel.id;
        const { metadata } = this.getModelInfo(modelId, apiModel.display_name);
        const family = this.extractModelFamily(modelId);

        let maxInputTokens = metadata.maxInputTokens;
        let maxOutputTokens = metadata.maxOutputTokens;
        let supportsToolCalling = metadata.supportsToolCalling;
        let supportsImageInput = metadata.supportsImageInput;

        const override = getModelOverride(modelId, 'claude');
        if (override) {
            if (typeof override.maxInputTokens === 'number' && Number.isFinite(override.maxInputTokens)) {
                maxInputTokens = override.maxInputTokens;
            }
            if (typeof override.maxOutputTokens === 'number' && Number.isFinite(override.maxOutputTokens)) {
                maxOutputTokens = override.maxOutputTokens;
            }
            if (typeof override.supportsToolCalling === 'boolean') {
                supportsToolCalling = override.supportsToolCalling;
            }
            if (typeof override.supportsImageInput === 'boolean') {
                supportsImageInput = override.supportsImageInput;
            }
        }

        const modelInfo: ClaudeModelInformation = {
            modelId: modelId,
            id: `claude-${modelId}`,
            family: family,
            name: apiModel.display_name || modelId,
            version: apiModel.created_at || '1.0',
            maxInputTokens,
            maxOutputTokens,
            capabilities: {
                toolCalling: supportsToolCalling,
                imageInput: supportsImageInput
            }
        };

        this.modelList.push(modelInfo);
        const hasOverride = override ? ' (with overrides)' : '';
        logger.debug(`Added model: ${modelInfo.id} (family: ${family})${hasOverride}`, undefined, 'Claude');
    }

    async provideLanguageModelChatInformation(
        options: vscode.PrepareLanguageModelChatModelOptions,
        token: vscode.CancellationToken
    ): Promise<ClaudeModelInformation[]> {
        logger.debug(`Providing ${this.modelList.length} models to VSCode`, undefined, 'Claude');
        return this.modelList;
    }

    async provideLanguageModelChatResponse(
        model: ClaudeModelInformation,
        messages: readonly vscode.LanguageModelChatRequestMessage[],
        options: vscode.ProvideLanguageModelChatResponseOptions,
        progress: vscode.Progress<vscode.ExLanguageModelResponsePart>,
        token: vscode.CancellationToken
    ): Promise<void> {
        if (!this.client) {
            throw new Error('Claude client not initialized');
        }

        const modelOverride = getModelOverride(model.modelId, 'claude');
        const usePromptBasedToolCalling = modelOverride?.usePromptBasedToolCalling === true;

        const config = vscode.workspace.getConfiguration('oai2lmapi');
        const globalSuppressChainOfThought = config.get<boolean>('suppressChainOfThought', false);
        const suppressChainOfThought = modelOverride?.suppressChainOfThought ?? globalSuppressChainOfThought;

        const globalTrimXmlToolParameterWhitespace = config.get<boolean>('trimXmlToolParameterWhitespace', false);
        const trimXmlToolParameterWhitespace = modelOverride?.trimXmlToolParameterWhitespace ?? globalTrimXmlToolParameterWhitespace;
        const xmlParseOptions: XmlToolParseOptions = {
            trimParameterWhitespace: trimXmlToolParameterWhitespace
        };

        const { messages: claudeMessages, system } = convertVscodeMessagesToClaude(
            messages,
            usePromptBasedToolCalling,
            formatToolCallAsXml,
            formatToolResultAsText,
            this.extractTextFromPart.bind(this),
            this.getToolNameFromResult.bind(this),
            this.ensureToolCallId.bind(this),
            this.mapRole.bind(this)
        );

        const availableToolNames = options.tools?.map(t => t.name).filter((n): n is string => !!n) ?? [];

        let tools: ClaudeToolDefinition[] | undefined;
        let toolChoice: 'auto' | 'required' | 'none' | { name: string } | undefined;

        let effectiveSystem = system;
        if (usePromptBasedToolCalling && options.tools && options.tools.length > 0) {
            const xmlToolPrompt = generateXmlToolPrompt(options.tools);
            effectiveSystem = effectiveSystem ? `${effectiveSystem}\n\n${xmlToolPrompt}` : xmlToolPrompt;
            tools = undefined;
            toolChoice = undefined;
            logger.debug(`Using prompt-based tool calling for model ${model.modelId}`, undefined, 'Claude');
        } else {
            tools = this.convertTools(options.tools);
            toolChoice = this.convertToolMode(options.toolMode);
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
        const maxTokens = Math.max(1, Math.min(budgetNumber ?? modelBudget, 8192));

        const abortController = new AbortController();
        if (token) {
            token.onCancellationRequested(() => {
                abortController.abort();
            });
        }

        const reportedToolCallIds = new Set<string>();
        const streamParser = usePromptBasedToolCalling && availableToolNames.length > 0
            ? new XmlToolCallStreamParser(availableToolNames, xmlParseOptions)
            : null;

        await this.client.streamChatCompletion(
            claudeMessages,
            model.modelId,
            effectiveSystem,
            {
                onChunk: (chunk) => {
                    if (streamParser) {
                        const newToolCalls = streamParser.addChunk(chunk);
                        for (const toolCall of newToolCalls) {
                            if (reportedToolCallIds.has(toolCall.id)) {
                                continue;
                            }
                            reportedToolCallIds.add(toolCall.id);
                            progress.report(new vscode.LanguageModelToolCallPart(
                                toolCall.id,
                                toolCall.name,
                                toolCall.arguments
                            ));
                            logger.debug(`Streaming XML tool call detected: ${toolCall.name}`, undefined, 'Claude');
                        }
                    } else {
                        progress.report(new vscode.LanguageModelTextPart(chunk));
                    }
                },
                onThinkingChunk: (chunk) => {
                    if (!suppressChainOfThought) {
                        progress.report(new vscode.LanguageModelThinkingPart(chunk));
                    }
                },
                suppressChainOfThought,
                onToolCallsComplete: (toolCalls: ClaudeCompletedToolCall[]) => {
                    for (const toolCall of toolCalls) {
                        if (reportedToolCallIds.has(toolCall.id)) {
                            continue;
                        }
                        reportedToolCallIds.add(toolCall.id);
                        try {
                            const parsedArgs = JSON.parse(toolCall.arguments);
                            progress.report(new vscode.LanguageModelToolCallPart(
                                toolCall.id,
                                toolCall.name,
                                parsedArgs
                            ));
                        } catch {
                            logger.debug(`Failed to parse tool call arguments for ${toolCall.name}: ${toolCall.arguments}`, undefined, 'Claude');
                            progress.report(new vscode.LanguageModelToolCallPart(
                                toolCall.id,
                                toolCall.name,
                                {}
                            ));
                        }
                    }
                },
                signal: abortController.signal,
                tools,
                toolChoice,
                maxTokens,
                temperature: modelOverride?.temperature,
                thinking: modelOverride?.thinkingLevel
            }
        );

        if (streamParser) {
            const remainingToolCalls = streamParser.finalize();
            for (const toolCall of remainingToolCalls) {
                if (reportedToolCallIds.has(toolCall.id)) {
                    continue;
                }
                reportedToolCallIds.add(toolCall.id);
                progress.report(new vscode.LanguageModelToolCallPart(
                    toolCall.id,
                    toolCall.name,
                    toolCall.arguments
                ));
                logger.debug(`Finalized XML tool call: ${toolCall.name}`, undefined, 'Claude');
            }

            const nonToolCallText = streamParser.getNonToolCallText();
            if (nonToolCallText) {
                progress.report(new vscode.LanguageModelTextPart(nonToolCallText));
            }
        }
    }

    private convertTools(tools: readonly vscode.LanguageModelChatTool[] | undefined): ClaudeToolDefinition[] | undefined {
        if (!tools || tools.length === 0) {
            return undefined;
        }

        const converted: ClaudeToolDefinition[] = [];
        for (const tool of tools) {
            const name = (tool.name ?? '').trim();
            if (!name) {
                continue;
            }
            let parameters: Record<string, unknown> | undefined = tool.inputSchema as Record<string, unknown> | undefined;
            const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

            if (!isPlainObject(parameters) || Object.keys(parameters).length === 0) {
                parameters = { type: 'object', properties: {} };
            } else {
                if (!('type' in parameters)) {
                    parameters = { ...parameters, type: 'object' };
                }
                if ((parameters as Record<string, unknown>).type === 'object' && !('properties' in parameters)) {
                    parameters = { ...parameters, properties: {} };
                }
            }

            converted.push({
                name,
                description: (tool.description ?? '').trim() || undefined,
                input_schema: parameters
            });
        }

        return converted.length > 0 ? converted : undefined;
    }

    private convertToolMode(toolMode: vscode.LanguageModelChatToolMode | undefined): 'auto' | 'required' | 'none' | undefined {
        if (!toolMode) {
            return undefined;
        }

        switch (toolMode) {
            case vscode.LanguageModelChatToolMode.Auto:
                return 'auto';
            case vscode.LanguageModelChatToolMode.Required:
                return 'required';
            default:
                return 'auto';
        }
    }

    private mapRole(role: vscode.LanguageModelChatMessageRole): 'user' | 'assistant' | 'system' {
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
        model: ClaudeModelInformation,
        text: string | vscode.LanguageModelChatRequestMessage,
        token: vscode.CancellationToken
    ): Promise<number> {
        let textContent: string;
        if (typeof text === 'string') {
            textContent = text;
        } else {
            if (typeof text.content === 'string') {
                textContent = text.content;
            } else if (Array.isArray(text.content)) {
                textContent = text.content.map(part => this.extractTextFromPart(part)).join('');
            } else if (text.content && typeof text.content === 'object') {
                textContent = this.extractTextFromPart(text.content);
            } else {
                textContent = '';
            }
        }
        return Math.ceil(textContent.length / 4);
    }

    private extractTextFromPart(part: unknown): string {
        if (!part || typeof part !== 'object') {
            return '';
        }
        if ('value' in part && typeof (part as { value: unknown }).value === 'string') {
            return (part as { value: string }).value;
        }
        if ('text' in part && typeof (part as { text: unknown }).text === 'string') {
            return (part as { text: string }).text;
        }
        if ('content' in part && Array.isArray((part as { content: unknown }).content)) {
            const contentArray = (part as { content: unknown[] }).content;
            return contentArray.map(subPart => this.extractTextFromPart(subPart)).join('');
        }
        if ('toolName' in part && 'parameters' in part) {
            const toolPart = part as { toolName: string; parameters: unknown };
            try {
                return `[Tool Call: ${toolPart.toolName}(${JSON.stringify(toolPart.parameters)})]`;
            } catch {
                return `[Tool Call: ${toolPart.toolName}]`;
            }
        }
        return '';
    }

    private getToolNameFromResult(part: unknown): string | undefined {
        if (!part || typeof part !== 'object') {
            return undefined;
        }
        const candidate = (part as { toolName?: unknown }).toolName;
        if (typeof candidate === 'string') {
            return candidate;
        }
        return undefined;
    }

    private ensureToolCallId(callId: unknown, name: string, index: number): string {
        if (typeof callId === 'string' && callId.trim().length > 0) {
            return callId;
        }
        return `call_fallback_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 9)}`;
    }

    dispose() {
        this._onDidChangeLanguageModelChatInformation.dispose();
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        this.disposables = [];
        this.modelList = [];
    }
}
