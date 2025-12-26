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
import { getModelMetadata } from './modelMetadata';

/**
 * Model override configuration from user settings.
 *
 * Note:
 * - This interface mirrors the `oai2lmapi.modelOverrides` schema in package.json.
 * - The `temperature` and `thinkingLevel` properties are currently not applied by
 *   this provider's getModelOverride logic; they are exposed here to keep the
 *   Gemini configuration aligned with other providers and reserved for potential
 *   future use.
 */
interface ModelOverrideConfig {
    maxInputTokens?: number;
    maxOutputTokens?: number;
    supportsToolCalling?: boolean;
    supportsImageInput?: boolean;
    /**
     * Reserved for future use; currently not applied by getModelOverride.
     */
    temperature?: number;
    /**
     * Reserved for future use; currently not applied by getModelOverride.
     */
    thinkingLevel?: string | number;
}

interface GeminiModelInformation extends vscode.LanguageModelChatInformation {
    modelId: string;
}

export class GeminiLanguageModelProvider implements vscode.LanguageModelChatProvider<GeminiModelInformation>, vscode.Disposable {
    private client: GeminiClient | undefined;
    private disposables: vscode.Disposable[] = [];
    private modelList: GeminiModelInformation[] = [];
    private _onDidChangeLanguageModelChatInformation = new vscode.EventEmitter<void>();
    private _initialized = false;

    readonly onDidChangeLanguageModelChatInformation = this._onDidChangeLanguageModelChatInformation.event;

    constructor(private context: vscode.ExtensionContext) {}

    /**
     * Initialize the provider. Returns void for consistency with OpenAILanguageModelProvider.
     * The provider is not registered if no API key is configured.
     */
    async initialize(): Promise<void> {
        const config = vscode.workspace.getConfiguration('oai2lmapi');
        const apiEndpoint = config.get<string>('geminiApiEndpoint', 'https://generativelanguage.googleapis.com');

        // Retrieve Gemini API key from SecretStorage
        const apiKey = await this.context.secrets.get(GEMINI_API_KEY_SECRET_KEY);

        if (!apiKey) {
            console.log('GeminiProvider: API key not configured, provider will not be enabled');
            return;
        }

        console.log(`GeminiProvider: Initializing with endpoint: ${apiEndpoint}`);

        this.client = new GeminiClient({
            apiEndpoint,
            apiKey
        });

        // Register the provider with a unique ID
        console.log('GeminiProvider: Registering language model provider');
        const disposable = vscode.lm.registerLanguageModelChatProvider('gemini2lmapi', this);
        this.disposables.push(disposable);
        this._initialized = true;

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
    }

    /**
     * Check if the provider is initialized and active.
     */
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
            // Get model ID (falls back to displayName if name is missing)
            const modelId = getGeminiModelId(apiModel);
            
            // Filter out models with no identifiable name
            if (!modelId) {
                filteredCount++;
                console.log('GeminiProvider: Filtered out model with missing name', { 
                    displayName: apiModel.displayName,
                    baseModelId: apiModel.baseModelId
                });
                continue;
            }

            // Filter out non-text-generation models
            if (!supportsTextGeneration(apiModel)) {
                filteredCount++;
                console.log(`GeminiProvider: Filtered out non-text model: ${modelId}`);
                continue;
            }

            // Filter out models without function calling unless setting is enabled
            if (!showModelsWithoutToolCalling && !supportsGeminiFunctionCalling(apiModel)) {
                filteredCount++;
                console.log(`GeminiProvider: Filtered out model without function calling: ${modelId}`);
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
        
        // Common Gemini family patterns (version-specific first, then generic fallbacks)
        const patterns = [
            /^(gemini-3|gemini-2\.5|gemini-2\.0|gemini-1\.5|gemini-1\.0)/i,
            /^gemini/i, // Fallback for other Gemini versions
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
            console.log('GeminiProvider: Skipping model with no identifiable name');
            return;
        }
        
        const family = this.extractModelFamily(modelId);
        
        // Get metadata from the model metadata registry as fallback
        const registryMetadata = getModelMetadata(modelId);
        
        // Build model info with different priority orders:
        // - Numeric limits: API response > registry metadata > hardcoded defaults
        // - Boolean capabilities (supportsImageInput): explicit registry value > API heuristics
        //   This allows registry metadata to override potentially inaccurate name-based heuristics
        const apiToolCalling = supportsGeminiFunctionCalling(apiModel);
        const apiVision = this.supportsVision(modelId);
        
        let maxInputTokens = this.getValidNumber(apiModel.inputTokenLimit) 
            ?? registryMetadata.maxInputTokens 
            ?? 32768;
        let maxOutputTokens = this.getValidNumber(apiModel.outputTokenLimit) 
            ?? registryMetadata.maxOutputTokens 
            ?? 8192;
        let supportsToolCalling = apiToolCalling;
        // For image input, prefer explicit registry metadata over API name-based heuristics
        let supportsImageInput = typeof registryMetadata.supportsImageInput === 'boolean'
            ? registryMetadata.supportsImageInput
            : apiVision;

        // Apply user-configured model overrides
        const override = this.getModelOverride(modelId);
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
        console.log(`GeminiProvider: Added model: ${modelInfo.id} (family: ${family})${hasOverride}`);
    }

    /**
     * Gets a valid number from a potentially null/undefined value.
     */
    private getValidNumber(value: number | null | undefined): number | undefined {
        return typeof value === 'number' && Number.isFinite(value) && value > 0 
            ? value 
            : undefined;
    }

    /**
     * Gets model override configuration for a given model ID.
     * Supports wildcard patterns like 'gemini-*' with case-insensitive matching.
     */
    private getModelOverride(modelId: string): ModelOverrideConfig | undefined {
        const config = vscode.workspace.getConfiguration('oai2lmapi');
        const overrides = config.get<Record<string, ModelOverrideConfig>>('modelOverrides', {});
        
        // Check for exact match first
        if (overrides[modelId]) {
            return overrides[modelId];
        }
        
        // Check for wildcard patterns (case-insensitive)
        for (const pattern of Object.keys(overrides)) {
            if (pattern.includes('*')) {
                // Convert wildcard pattern to regex; 'i' flag below handles case-insensitive matching
                const regexPattern = pattern
                    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // Escape special chars
                    .replace(/\\\*/g, '.*'); // Convert \* back to .*
                const regex = new RegExp(`^${regexPattern}$`, 'i');
                if (regex.test(modelId)) {
                    return overrides[pattern];
                }
            }
        }
        
        return undefined;
    }

    private supportsVision(modelId: string | null | undefined): boolean {
        if (!modelId) {
            return false;
        }
        // Most Gemini models support vision by default
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
        const { contents, systemInstruction, toolCallNames } = this.convertMessages(messages);

        // Convert VSCode tools to Gemini format
        const tools = this.convertTools(options.tools);
        const toolMode = this.convertToolMode(options.toolMode);

        // Get maxTokens from options
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

        // Create abort controller from cancellation token
        const abortController = new AbortController();
        if (token) {
            token.onCancellationRequested(() => {
                abortController.abort();
            });
        }

        // Track reported tool call IDs
        const reportedToolCallIds = new Set<string>();

        // Store tool call names for function response lookup
        // Clear previous state to avoid persistence across requests
        this._toolCallNames.clear();
        for (const [id, name] of toolCallNames) {
            this._toolCallNames.set(id, name);
        }

        await this.client.streamChatCompletion(
            contents,
            model.modelId,
            systemInstruction,
            {
                onChunk: (chunk) => {
                    progress.report(new vscode.LanguageModelTextPart(chunk));
                },
                onThinkingChunk: (chunk, thoughtSignature) => {
                    // Report thinking content with optional signature
                    const metadata = thoughtSignature ? { thoughtSignature } : undefined;
                    progress.report(new vscode.LanguageModelThinkingPart(chunk, undefined, metadata));
                },
                onToolCallsComplete: (toolCalls: GeminiCompletedToolCall[]) => {
                    for (const toolCall of toolCalls) {
                        if (reportedToolCallIds.has(toolCall.id)) {
                            console.warn(`GeminiProvider: Duplicate tool call id '${toolCall.id}' for tool '${toolCall.name}', ignoring subsequent occurrence.`);
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
                        } catch (error) {
                            console.warn(`GeminiProvider: Failed to parse tool call arguments for ${toolCall.name}:`, error);
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
                maxTokens
            }
        );
    }

    // Map of tool call IDs to function names, used for function responses
    private _toolCallNames: Map<string, string> = new Map();

    /**
     * Converts VSCode messages to Gemini format.
     * Gemini uses a different structure with 'user' and 'model' roles.
     * System instructions are handled separately.
     * Also extracts tool call IDs to function name mappings for function responses.
     */
    private convertMessages(messages: readonly vscode.LanguageModelChatRequestMessage[]): {
        contents: GeminiContent[];
        systemInstruction: string | undefined;
        toolCallNames: Map<string, string>;
    } {
        const contents: GeminiContent[] = [];
        let systemInstruction: string | undefined;
        const toolCallNames = new Map<string, string>();

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
            const parts = this.convertContentParts(msg, toolCallNames);

            if (parts.length > 0) {
                contents.push({
                    role: geminiRole,
                    parts
                });
            }
        }

        return { contents, systemInstruction, toolCallNames };
    }

    /**
     * Convert message content to Gemini parts
     */
    private convertContentParts(msg: vscode.LanguageModelChatRequestMessage, toolCallNames: Map<string, string>): GeminiPart[] {
        const parts: GeminiPart[] = [];

        if (typeof msg.content === 'string') {
            parts.push({ text: msg.content });
        } else if (Array.isArray(msg.content)) {
            for (const part of msg.content) {
                const converted = this.convertPart(part, toolCallNames);
                if (converted) {
                    parts.push(converted);
                }
            }
        } else if (msg.content && typeof msg.content === 'object') {
            const converted = this.convertPart(msg.content, toolCallNames);
            if (converted) {
                parts.push(converted);
            }
        }

        return parts;
    }

    /**
     * Convert a single content part to Gemini format.
     * 
     * Note: For tool result parts, we attempt to look up the original function name
     * from the toolCallNames map using the callId. If not found, we use the callId
     * as the function name, which may cause issues with Gemini's function response
     * matching. Ensure that tool calls are properly tracked in the conversation.
     */
    private convertPart(part: unknown, toolCallNames: Map<string, string>): GeminiPart | null {
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

        // Tool call part (from assistant) - record the callId -> name mapping
        if ('callId' in partObj && 'name' in partObj && 'input' in partObj) {
            const callId = partObj.callId as string;
            const name = partObj.name as string;
            toolCallNames.set(callId, name);
            return {
                functionCall: {
                    name: name,
                    args: partObj.input as Record<string, unknown>
                }
            };
        }

        // Tool result part (user providing function response)
        if ('callId' in partObj && 'content' in partObj && !('name' in partObj)) {
            const callId = partObj.callId as string;
            const resultContent = this.extractToolResultContent(partObj);
            // Look up the function name from our stored mappings or instance map
            const functionName = toolCallNames.get(callId) || this._toolCallNames.get(callId) || callId;
            return {
                functionResponse: {
                    name: functionName,
                    response: { result: resultContent }
                }
            };
        }

        // Image/data part
        if ('uri' in partObj && typeof partObj.uri === 'string') {
            const uri = partObj.uri as string;
            
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
                console.warn('GeminiProvider: Skipping tool with invalid name (empty or whitespace only).', {
                    originalName: tool.name,
                    description: tool.description
                });
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
                if ((parameters as Record<string, unknown>).type === 'object' && !('properties' in parameters)) {
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

    /**
     * Count tokens using Gemini's countTokens API.
     * Falls back to approximate token counting based on text length if the API is unavailable.
     */
    async provideTokenCount(
        model: GeminiModelInformation,
        text: string | vscode.LanguageModelChatRequestMessage,
        token: vscode.CancellationToken
    ): Promise<number> {
        if (!this.client) {
            return this.estimateTokens(text);
        }

        // Convert to Gemini content format
        let contents: GeminiContent[];
        if (typeof text === 'string') {
            contents = [{ role: 'user', parts: [{ text }] }];
        } else {
            const { contents: convertedContents } = this.convertMessages([text]);
            contents = convertedContents;
        }

        try {
            const count = await this.client.countTokens(contents, model.modelId);
            return count;
        } catch (error) {
            console.error('[GeminiLanguageModelProvider] Failed to count tokens via Gemini API, falling back to estimation.', {
                modelId: model.modelId,
                inputType: typeof text,
                error
            });
            // Fall back to estimation
            return this.estimateTokens(text);
        }
    }

    /**
     * Estimate token count based on text length.
     * Uses ~3 characters per token as a rough approximation.
     */
    private estimateTokens(text: string | vscode.LanguageModelChatRequestMessage): number {
        let textContent: string;
        if (typeof text === 'string') {
            textContent = text;
        } else {
            textContent = this.extractTextContent(text);
        }
        // Rough estimation: ~3 characters per token (compromise between English and CJK)
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
