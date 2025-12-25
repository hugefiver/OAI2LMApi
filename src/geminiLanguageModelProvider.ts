import * as vscode from 'vscode';
import { 
    GeminiClient, 
    GeminiModelInfo, 
    GeminiContent, 
    GeminiPart,
    GeminiFunctionDeclaration,
    GeminiCompletedToolCall,
    getGeminiModelId,
    supportsTextGeneration,
    supportsGeminiFunctionCalling
} from './geminiClient';
import { GEMINI_API_KEY_SECRET_KEY, GEMINI_CACHED_MODELS_KEY } from './constants';

interface GeminiModelInformation extends vscode.LanguageModelChatInformation {
    modelId: string;
}

export class GeminiLanguageModelProvider implements vscode.LanguageModelChatProvider<GeminiModelInformation>, vscode.Disposable {
    private client: GeminiClient | undefined;
    private disposables: vscode.Disposable[] = [];
    private modelList: GeminiModelInformation[] = [];
    private _onDidChangeLanguageModelChatInformation = new vscode.EventEmitter<void>();

    readonly onDidChangeLanguageModelChatInformation = this._onDidChangeLanguageModelChatInformation.event;

    constructor(private context: vscode.ExtensionContext) {}

    async initialize(): Promise<boolean> {
        const config = vscode.workspace.getConfiguration('oai2lmapi');
        const apiEndpoint = config.get<string>('geminiApiEndpoint', 'https://generativelanguage.googleapis.com/v1beta');

        // Retrieve Gemini API key from SecretStorage
        const apiKey = await this.context.secrets.get(GEMINI_API_KEY_SECRET_KEY);

        if (!apiKey) {
            console.log('GeminiProvider: API key not configured, provider will not be enabled');
            return false;
        }

        console.log(`GeminiProvider: Initializing with endpoint: ${apiEndpoint}`);

        this.client = new GeminiClient({
            apiEndpoint,
            apiKey
        });

        // Register the provider with a unique ID
        console.log('GeminiProvider: Registering language model provider');
        const disposable = vscode.lm.registerLanguageModelChatProvider('gemini', this);
        this.disposables.push(disposable);

        // Try to load cached models first
        const cachedModels = this.context.globalState.get<GeminiModelInfo[]>(GEMINI_CACHED_MODELS_KEY);
        if (cachedModels && cachedModels.length > 0) {
            console.log(`GeminiProvider: Loading ${cachedModels.length} models from cache`);
            this.updateModelList(cachedModels);
        }

        // Auto-load models if enabled
        const autoLoadModels = config.get<boolean>('autoLoadModels', true);
        if (autoLoadModels) {
            console.log('GeminiProvider: Auto-loading models from API');
            await this.loadModels();
        } else {
            console.warn('GeminiProvider: autoLoadModels is disabled');
            if (!cachedModels || cachedModels.length === 0) {
                vscode.window.showWarningMessage(
                    'GeminiProvider: autoLoadModels is disabled. No models have been loaded.'
                );
            }
        }

        return true;
    }

    private updateModelList(apiModels: GeminiModelInfo[]) {
        const config = vscode.workspace.getConfiguration('oai2lmapi');
        const showModelsWithoutToolCalling = config.get<boolean>('showModelsWithoutToolCalling', false);

        this.modelList = [];

        let addedCount = 0;
        let filteredCount = 0;
        for (const apiModel of apiModels) {
            // Filter out non-text-generation models
            if (!supportsTextGeneration(apiModel)) {
                filteredCount++;
                console.log(`GeminiProvider: Filtered out non-text model: ${apiModel.name}`);
                continue;
            }

            // Filter out models without function calling unless setting is enabled
            if (!showModelsWithoutToolCalling && !supportsGeminiFunctionCalling(apiModel)) {
                filteredCount++;
                console.log(`GeminiProvider: Filtered out model without function calling: ${apiModel.name}`);
                continue;
            }

            this.addModel(apiModel);
            addedCount++;
        }

        console.log(`GeminiProvider: Added ${addedCount} models, filtered ${filteredCount} models`);
        this._onDidChangeLanguageModelChatInformation.fire();
    }

    async loadModels(): Promise<void> {
        if (!this.client) {
            console.warn('GeminiProvider: Client not initialized');
            return;
        }

        try {
            const apiModels = await this.client.listModels();
            console.log(`GeminiProvider: Loaded ${apiModels.length} models from API`);

            this.updateModelList(apiModels);

            // Cache the models
            await this.context.globalState.update(GEMINI_CACHED_MODELS_KEY, apiModels);
        } catch (error) {
            console.error('GeminiProvider: Failed to load models:', error);
            vscode.window.showErrorMessage(`GeminiProvider: Failed to load models. Error: ${error}`);
            this._onDidChangeLanguageModelChatInformation.fire();
        }
    }

    private extractModelFamily(modelId: string): string {
        // Remove 'models/' prefix if present
        const name = modelId.replace(/^models\//, '');
        
        // Common Gemini family patterns
        const patterns = [
            /^(gemini-2\.5|gemini-2\.0|gemini-1\.5|gemini-1\.0|gemini)/i,
            /^(gemma-3|gemma-2|gemma)/i,
        ];

        for (const pattern of patterns) {
            const match = name.match(pattern);
            if (match) {
                return match[1].toLowerCase();
            }
        }

        return name.toLowerCase();
    }

    private addModel(apiModel: GeminiModelInfo) {
        const modelId = getGeminiModelId(apiModel);
        const family = this.extractModelFamily(modelId);

        const modelInfo: GeminiModelInformation = {
            modelId: modelId,
            id: `gemini-${modelId}`,
            family: family,
            name: apiModel.displayName || modelId,
            version: apiModel.version || '1.0',
            maxInputTokens: apiModel.inputTokenLimit || 32768,
            maxOutputTokens: apiModel.outputTokenLimit || 8192,
            capabilities: {
                toolCalling: supportsGeminiFunctionCalling(apiModel),
                imageInput: this.supportsVision(modelId)
            }
        };

        this.modelList.push(modelInfo);
        console.log(`GeminiProvider: Added model: ${modelInfo.id} (family: ${family})`);
    }

    private supportsVision(modelId: string): boolean {
        // Most Gemini models support vision
        const visionModels = [
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
        console.log(`GeminiProvider: Providing ${this.modelList.length} models to VSCode`);
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

        // Convert VSCode messages to Gemini format
        const { contents, systemInstruction } = this.convertMessages(messages);

        // Convert VSCode tools to Gemini format
        const tools = this.convertTools(options.tools);
        const toolMode = this.convertToolMode(options.toolMode);

        // Get thinking level from configuration
        const config = vscode.workspace.getConfiguration('oai2lmapi');
        const thinkingLevel = config.get<'none' | 'low' | 'medium' | 'high'>('geminiThinkingLevel', 'none');

        // Get maxTokens
        const optionsAny = options as any;
        const budgetFromOptions: unknown = optionsAny?.tokenBudget ?? optionsAny?.maxTokens ?? optionsAny?.maxOutputTokens;
        const budgetNumber = typeof budgetFromOptions === 'number' && Number.isFinite(budgetFromOptions) ? budgetFromOptions : undefined;
        const modelBudget = typeof model.maxOutputTokens === 'number' && Number.isFinite(model.maxOutputTokens) ? model.maxOutputTokens : 8192;
        const maxTokens = budgetNumber ?? modelBudget;

        // Create abort controller from cancellation token
        const abortController = new AbortController();
        if (token) {
            token.onCancellationRequested(() => {
                abortController.abort();
            });
        }

        // Track reported tool call IDs
        const reportedToolCallIds = new Set<string>();

        await this.client.streamChatCompletion(
            contents,
            model.modelId,
            systemInstruction,
            {
                onChunk: (chunk) => {
                    progress.report(new vscode.LanguageModelTextPart(chunk));
                },
                onThinkingChunk: (chunk, thoughtSignature) => {
                    // Report thinking content
                    const metadata = thoughtSignature ? { thoughtSignature } : undefined;
                    progress.report(new vscode.LanguageModelThinkingPart(chunk, undefined, metadata));
                },
                onToolCallsComplete: (toolCalls: GeminiCompletedToolCall[]) => {
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
                            console.warn(`GeminiProvider: Failed to parse tool call arguments for ${toolCall.name}`);
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
                toolMode,
                maxTokens,
                thinkingLevel
            }
        );
    }

    /**
     * Converts VSCode messages to Gemini format.
     * Gemini uses a different structure with 'user' and 'model' roles.
     * System instructions are handled separately.
     */
    private convertMessages(messages: readonly vscode.LanguageModelChatRequestMessage[]): {
        contents: GeminiContent[];
        systemInstruction: string | undefined;
    } {
        const contents: GeminiContent[] = [];
        let systemInstruction: string | undefined;

        for (const msg of messages) {
            const role = this.mapRole(msg.role);

            // Handle system messages separately
            if (role === 'system') {
                const text = this.extractTextContent(msg);
                if (text) {
                    systemInstruction = systemInstruction ? `${systemInstruction}\n${text}` : text;
                }
                continue;
            }

            const geminiRole = role === 'assistant' ? 'model' : 'user';
            const parts = this.convertContentParts(msg);

            if (parts.length > 0) {
                contents.push({
                    role: geminiRole,
                    parts
                });
            }
        }

        return { contents, systemInstruction };
    }

    /**
     * Convert message content to Gemini parts
     */
    private convertContentParts(msg: vscode.LanguageModelChatRequestMessage): GeminiPart[] {
        const parts: GeminiPart[] = [];

        if (typeof msg.content === 'string') {
            parts.push({ text: msg.content });
        } else if (Array.isArray(msg.content)) {
            for (const part of msg.content) {
                const converted = this.convertPart(part);
                if (converted) {
                    parts.push(converted);
                }
            }
        } else if (msg.content && typeof msg.content === 'object') {
            const converted = this.convertPart(msg.content);
            if (converted) {
                parts.push(converted);
            }
        }

        return parts;
    }

    /**
     * Convert a single content part to Gemini format
     */
    private convertPart(part: unknown): GeminiPart | null {
        if (!part || typeof part !== 'object') {
            return null;
        }

        const partObj = part as Record<string, unknown>;

        // Text part
        if ('value' in partObj && typeof partObj.value === 'string') {
            return { text: partObj.value };
        }

        if ('text' in partObj && typeof partObj.text === 'string') {
            return { text: partObj.text };
        }

        // Tool call part (from assistant)
        if ('callId' in partObj && 'name' in partObj && 'input' in partObj) {
            return {
                functionCall: {
                    name: partObj.name as string,
                    args: partObj.input as Record<string, unknown>
                }
            };
        }

        // Tool result part (user providing function response)
        if ('callId' in partObj && 'content' in partObj && !('name' in partObj)) {
            const resultContent = this.extractToolResultContent(partObj);
            // For Gemini, we need to provide a functionResponse
            // The name needs to be retrieved from context, but we use a placeholder
            return {
                functionResponse: {
                    name: 'function_response',
                    response: { result: resultContent }
                }
            };
        }

        // Image/data part
        if ('uri' in partObj && typeof partObj.uri === 'string') {
            const uri = partObj.uri as string;
            const mimeType = (partObj.mimeType as string) || this.guessMimeType(uri);
            
            // Handle base64 data URIs
            if (uri.startsWith('data:')) {
                const matches = uri.match(/^data:([^;]+);base64,(.+)$/);
                if (matches) {
                    return {
                        inlineData: {
                            mimeType: matches[1],
                            data: matches[2]
                        }
                    };
                }
            }
            
            // For non-base64 URIs, we can't directly use them in Gemini
            // Would need to fetch and convert to base64
            console.warn('GeminiProvider: Non-base64 image URIs are not supported');
            return null;
        }

        return null;
    }

    private guessMimeType(uri: string): string {
        const lower = uri.toLowerCase();
        if (lower.endsWith('.png')) {
            return 'image/png';
        }
        if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) {
            return 'image/jpeg';
        }
        if (lower.endsWith('.gif')) {
            return 'image/gif';
        }
        if (lower.endsWith('.webp')) {
            return 'image/webp';
        }
        return 'application/octet-stream';
    }

    private extractToolResultContent(part: Record<string, unknown>): string {
        const content = part.content;
        if (Array.isArray(content)) {
            return content.map(c => this.extractTextFromPart(c)).join('');
        }
        if (typeof content === 'string') {
            return content;
        }
        return '';
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

    /**
     * Convert VSCode tools to Gemini function declarations
     */
    private convertTools(tools: readonly vscode.LanguageModelChatTool[] | undefined): GeminiFunctionDeclaration[] | undefined {
        if (!tools || tools.length === 0) {
            return undefined;
        }

        const converted: GeminiFunctionDeclaration[] = [];

        for (const tool of tools) {
            const name = (tool.name ?? '').trim();
            if (!name) {
                continue;
            }

            let parameters = tool.inputSchema as Record<string, unknown> | undefined;
            
            // Ensure parameters has proper structure
            if (!parameters || Object.keys(parameters).length === 0) {
                parameters = { type: 'object', properties: {} };
            } else {
                if (!('type' in parameters)) {
                    parameters = { ...parameters, type: 'object' };
                }
                if ((parameters as any).type === 'object' && !('properties' in parameters)) {
                    parameters = { ...parameters, properties: {} };
                }
            }

            converted.push({
                name,
                description: (tool.description ?? '').trim() || undefined,
                parameters
            });
        }

        return converted.length > 0 ? converted : undefined;
    }

    /**
     * Convert VSCode tool mode to Gemini format
     */
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

    private mapRole(role: vscode.LanguageModelChatMessageRole): 'system' | 'user' | 'assistant' {
        switch (role) {
            case vscode.LanguageModelChatMessageRole.User:
                return 'user';
            case vscode.LanguageModelChatMessageRole.Assistant:
                return 'assistant';
            default:
                // Treat unknown roles as system for safety
                return 'system';
        }
    }

    async provideTokenCount(
        model: GeminiModelInformation,
        text: string | vscode.LanguageModelChatRequestMessage,
        token: vscode.CancellationToken
    ): Promise<number> {
        // Simple estimation: ~4 characters per token
        let textContent: string;

        if (typeof text === 'string') {
            textContent = text;
        } else {
            textContent = this.extractTextContent(text);
        }

        return Math.ceil(textContent.length / 4);
    }

    dispose(): void {
        this._onDidChangeLanguageModelChatInformation.dispose();
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        this.disposables = [];
        this.modelList = [];
    }
}
