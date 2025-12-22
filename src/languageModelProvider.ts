import * as vscode from 'vscode';
import { OpenAIClient, ChatMessage, APIModelInfo } from './openaiClient';
import { API_KEY_SECRET_KEY } from './constants';
import { getModelMetadata, isLLMModel, supportsToolCalling, ModelMetadata } from './modelMetadata';

interface ModelInformation extends vscode.LanguageModelChatInformation {
    modelId: string;
}

export class OpenAILanguageModelProvider implements vscode.LanguageModelChatProvider<ModelInformation>, vscode.Disposable {
    private client: OpenAIClient | undefined;
    private disposables: vscode.Disposable[] = [];
    private modelList: ModelInformation[] = [];
    private _onDidChangeLanguageModelChatInformation = new vscode.EventEmitter<void>();
    
    readonly onDidChangeLanguageModelChatInformation = this._onDidChangeLanguageModelChatInformation.event;

    constructor(private context: vscode.ExtensionContext) {}

    async initialize() {
        const config = vscode.workspace.getConfiguration('oai2lmapi');
        const apiEndpoint = config.get<string>('apiEndpoint', 'https://api.openai.com/v1');
        
        // Retrieve API key from SecretStorage
        const apiKey = await this.context.secrets.get(API_KEY_SECRET_KEY);

        console.log(`OAI2LMApi: Initializing with endpoint: ${apiEndpoint}`);

        if (!apiKey) {
            console.warn('OAI2LMApi: API key not configured');
            vscode.window.showWarningMessage('OAI2LMApi: API key not configured. Use command "OAI2LMApi: Set API Key" to configure.');
            return;
        }

        this.client = new OpenAIClient({
            apiEndpoint,
            apiKey
        });

        // Register the provider
        console.log('OAI2LMApi: Registering language model provider');
        const disposable = vscode.lm.registerLanguageModelChatProvider('oai2lmapi', this);
        this.disposables.push(disposable);

        // Auto-load models if enabled
        const autoLoadModels = config.get<boolean>('autoLoadModels', true);
        if (autoLoadModels) {
            console.log('OAI2LMApi: Auto-loading models from API');
            await this.loadModels();
        } else {
            console.warn('OAI2LMApi: autoLoadModels is disabled; no models have been loaded automatically.');
            vscode.window.showWarningMessage(
                'OAI2LMApi: autoLoadModels is disabled. No models have been loaded automatically; enable autoLoadModels in settings or manually refresh models to use this provider.'
            );
        }
    }

    async loadModels() {
        if (!this.client) {
            console.warn('OAI2LMApi: OpenAI client not initialized');
            return;
        }

        const config = vscode.workspace.getConfiguration('oai2lmapi');
        const showModelsWithoutToolCalling = config.get<boolean>('showModelsWithoutToolCalling', false);

        try {
            const apiModels = await this.client.listModels();
            console.log(`OAI2LMApi: Loaded ${apiModels.length} models from API`);

            // Clear existing models
            this.modelList = [];

            // Filter and add models
            let addedCount = 0;
            let filteredCount = 0;
            for (const apiModel of apiModels) {
                // Filter out non-LLM models (embedding, rerank, image, audio, etc.)
                if (!isLLMModel(apiModel.id)) {
                    filteredCount++;
                    console.log(`OAI2LMApi: Filtered out non-LLM model: ${apiModel.id}`);
                    continue;
                }

                // Filter out models without tool calling support unless setting is enabled
                if (!showModelsWithoutToolCalling && !this.modelSupportsToolCalling(apiModel)) {
                    filteredCount++;
                    console.log(`OAI2LMApi: Filtered out model without tool calling: ${apiModel.id}`);
                    continue;
                }

                this.addModel(apiModel);
                addedCount++;
            }

            console.log(`OAI2LMApi: Added ${addedCount} models, filtered ${filteredCount} models`);

            // Notify listeners that models changed
            this._onDidChangeLanguageModelChatInformation.fire();
        } catch (error) {
            console.error('OAI2LMApi: Failed to load models:', error);
            vscode.window.showErrorMessage(`OAI2LMApi: Failed to load models from API. Please check your endpoint and API key. Error: ${error}`);
            this._onDidChangeLanguageModelChatInformation.fire();
        }
    }

    /**
     * Checks if a model supports tool calling.
     * First checks API response, then falls back to pre-fetched metadata.
     */
    private modelSupportsToolCalling(apiModel: APIModelInfo): boolean {
        // Check if API provides capability information
        if (apiModel.capabilities?.tool_calling !== undefined) {
            return apiModel.capabilities.tool_calling;
        }
        // Fall back to pre-fetched metadata
        return supportsToolCalling(apiModel.id);
    }

    /**
     * Gets model metadata, preferring API response over pre-fetched data.
     */
    private getModelInfo(apiModel: APIModelInfo): { metadata: ModelMetadata; fromApi: boolean } {
        const registryMetadata = getModelMetadata(apiModel.id);
        
        // Start with registry metadata as base
        const metadata: ModelMetadata = { ...registryMetadata };
        let fromApi = false;

        // Override with API-provided values if available
        if (apiModel.context_length !== undefined) {
            metadata.maxInputTokens = apiModel.context_length;
            fromApi = true;
        }
        if (apiModel.max_completion_tokens !== undefined) {
            metadata.maxOutputTokens = apiModel.max_completion_tokens;
            fromApi = true;
        }
        if (apiModel.capabilities?.tool_calling !== undefined) {
            metadata.supportsToolCalling = apiModel.capabilities.tool_calling;
            fromApi = true;
        }
        if (apiModel.capabilities?.vision !== undefined) {
            metadata.supportsImageInput = apiModel.capabilities.vision;
            fromApi = true;
        }

        return { metadata, fromApi };
    }

    /**
     * Extracts model family from model ID.
     * Examples: 'gpt-4o-mini' -> 'gpt-4o', 'claude-3.5-sonnet' -> 'claude-3.5'
     */
    private extractModelFamily(modelId: string): string {
        // Remove provider prefix if present
        const nameWithoutPrefix = modelId.replace(/^[^/]+\//, '');
        
        // Common patterns for model families
        const patterns = [
            // OpenAI patterns
            /^(gpt-4\.1|gpt-4o|gpt-4-turbo|gpt-4|gpt-3\.5-turbo|o1|o3|o4)(?=$|\b|[-_])/i,
            // Anthropic patterns
            /^(claude-sonnet-4|claude-3\.7|claude-3\.5|claude-3|claude-2\.1|claude-2|claude-instant)/i,
            // Google patterns
            /^(gemini-2\.5|gemini-2\.0|gemini-1\.5|gemini)/i,
            // Meta patterns
            /^(llama-4|llama-3\.3|llama-3\.2|llama-3\.1|llama-3|llama-2)/i,
            // Mistral patterns
            /^(mistral-large|mistral-medium|mistral-small|mixtral-8x22b|mixtral-8x7b|mistral|codestral|pixtral)/i,
            // Qwen patterns
            /^(qwq|qvq|qwen-3|qwen-2\.5|qwen-2|qwen-1\.5|qwen)/i,
            // DeepSeek patterns
            /^(deepseek-r1|deepseek-v3|deepseek-v2\.5|deepseek-v2|deepseek)/i,
        ];

        for (const pattern of patterns) {
            const match = nameWithoutPrefix.match(pattern);
            if (match) {
                return match[1].toLowerCase();
            }
        }

        // Fallback: use the model ID as-is for the family
        // This ensures unknown models are at least grouped consistently
        return nameWithoutPrefix.toLowerCase();
    }

    private addModel(apiModel: APIModelInfo) {
        const { metadata, fromApi } = this.getModelInfo(apiModel);
        const family = this.extractModelFamily(apiModel.id);

        const modelInfo: ModelInformation = {
            modelId: apiModel.id,
            id: `oai2lmapi-${apiModel.id}`,
            family: family,
            name: apiModel.id,
            version: '1.0',
            maxInputTokens: metadata.maxInputTokens,
            maxOutputTokens: metadata.maxOutputTokens,
            capabilities: {
                toolCalling: metadata.supportsToolCalling,
                imageInput: metadata.supportsImageInput
            }
        };

        this.modelList.push(modelInfo);
        const source = fromApi ? 'API' : 'registry';
        console.log(`OAI2LMApi: Added model: ${modelInfo.id} (family: ${family}, source: ${source})`);
    }

    async provideLanguageModelChatInformation(
        options: vscode.PrepareLanguageModelChatModelOptions,
        token: vscode.CancellationToken
    ): Promise<ModelInformation[]> {
        console.log(`OAI2LMApi: Providing ${this.modelList.length} models to VSCode`);
        return this.modelList;
    }

    async provideLanguageModelChatResponse(
        model: ModelInformation,
        messages: readonly vscode.LanguageModelChatRequestMessage[],
        options: vscode.ProvideLanguageModelChatResponseOptions,
        progress: vscode.Progress<vscode.LanguageModelResponsePart>,
        token: vscode.CancellationToken
    ): Promise<void> {
        console.log(`OAI2LMApi: provideLanguageModelChatResponse called for model: ${model.modelId}`);
        console.log(`OAI2LMApi: Received ${messages.length} messages`);

        if (!this.client) {
            console.error('OAI2LMApi: OpenAI client not initialized');
            throw new Error('OpenAI client not initialized');
        }

        // Convert VSCode messages to OpenAI format
        const chatMessages: ChatMessage[] = messages.map((msg, index) => {
            let content = '';
            
            console.log(`OAI2LMApi: Processing message ${index}, role: ${msg.role}, content type: ${typeof msg.content}`);
            
            if (typeof msg.content === 'string') {
                // Plain string content
                content = msg.content;
                console.log(`OAI2LMApi: Message ${index} is plain string, length: ${content.length}`);
            } else if (Array.isArray(msg.content)) {
                // Array of content parts
                console.log(`OAI2LMApi: Message ${index} is array with ${msg.content.length} parts`);
                content = msg.content.map((part, partIndex) => {
                    const extracted = this.extractTextFromPart(part);
                    console.log(`OAI2LMApi: Message ${index} part ${partIndex}: extracted ${extracted.length} chars`);
                    return extracted;
                }).join('');
            } else if (msg.content && typeof msg.content === 'object') {
                // Single content part object (e.g., LanguageModelTextPart)
                console.log(`OAI2LMApi: Message ${index} is single object`);
                content = this.extractTextFromPart(msg.content);
            } else {
                console.warn(`OAI2LMApi: Message ${index} has unknown content type: ${msg.content}`);
            }

            const mappedRole = this.mapRole(msg.role);
            console.log(`OAI2LMApi: Message ${index} final - role: ${mappedRole}, content length: ${content.length}`);
            
            if (content.length === 0) {
                console.warn(`OAI2LMApi: WARNING - Message ${index} has empty content!`);
            }

            return {
                role: mappedRole,
                content
            };
        });

        // Log the final messages being sent
        console.log(`OAI2LMApi: Sending ${chatMessages.length} messages to API`);
        chatMessages.forEach((msg, i) => {
            console.log(`OAI2LMApi: Final message ${i}: role=${msg.role}, content preview: "${msg.content.substring(0, 100)}${msg.content.length > 100 ? '...' : ''}"`);
        });

        // Create abort controller from cancellation token
        const abortController = new AbortController();
        if (token) {
            token.onCancellationRequested(() => {
                console.log('OAI2LMApi: Cancellation requested');
                abortController.abort();
            });
        }

        // Track chunks received
        let chunkCount = 0;
        let totalContentLength = 0;

        try {
            // Stream the response
            const result = await this.client.streamChatCompletion(
                chatMessages,
                model.modelId,
                {
                    onChunk: (chunk) => {
                        chunkCount++;
                        totalContentLength += chunk.length;
                        console.log(`OAI2LMApi: Received chunk ${chunkCount}, length: ${chunk.length}`);
                        progress.report(new vscode.LanguageModelTextPart(chunk));
                    },
                    signal: abortController.signal
                }
            );

            console.log(`OAI2LMApi: Stream completed. Total chunks: ${chunkCount}, total content length: ${totalContentLength}`);
            console.log(`OAI2LMApi: streamChatCompletion returned: "${result.substring(0, 100)}${result.length > 100 ? '...' : ''}"`);

            if (chunkCount === 0) {
                console.error('OAI2LMApi: ERROR - No chunks were received from the API!');
            }
            if (totalContentLength === 0) {
                console.error('OAI2LMApi: ERROR - Total content length is 0!');
            }
        } catch (error) {
            console.error('OAI2LMApi: Error during streaming:', error);
            throw error;
        }
    }

    async provideTokenCount(
        model: ModelInformation,
        text: string | vscode.LanguageModelChatRequestMessage,
        token: vscode.CancellationToken
    ): Promise<number> {
        // Simple estimation: ~4 characters per token
        // NOTE: This is a very rough approximation and may be significantly inaccurate
        // Different models use different tokenization schemes:
        // - GPT models use tiktoken (BPE-based)
        // - Other models may use SentencePiece or other tokenizers
        // - Non-English text typically requires more tokens per character
        // For production use, consider integrating a proper tokenizer library
        let textContent: string;
        
        if (typeof text === 'string') {
            textContent = text;
        } else {
            if (typeof text.content === 'string') {
                // Plain string content
                textContent = text.content;
            } else if (Array.isArray(text.content)) {
                // Array of content parts
                textContent = text.content.map(part => this.extractTextFromPart(part)).join('');
            } else if (text.content && typeof text.content === 'object') {
                // Single content part object
                textContent = this.extractTextFromPart(text.content);
            } else {
                textContent = '';
            }
        }
        
        return Math.ceil(textContent.length / 4);
    }

    /**
     * Extracts text content from a LanguageModel content part.
     * Handles LanguageModelTextPart, LanguageModelToolResultPart, and other part types.
     */
    private extractTextFromPart(part: unknown): string {
        if (!part || typeof part !== 'object') {
            return '';
        }
        
        // LanguageModelTextPart has a 'text' property
        if ('text' in part && typeof (part as { text: unknown }).text === 'string') {
            return (part as { text: string }).text;
        }
        
        // LanguageModelToolResultPart has a 'content' property which is an array
        if ('content' in part && Array.isArray((part as { content: unknown }).content)) {
            const contentArray = (part as { content: unknown[] }).content;
            return contentArray.map(subPart => this.extractTextFromPart(subPart)).join('');
        }
        
        // LanguageModelToolCallPart - serialize tool call info for context
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

    private mapRole(role: vscode.LanguageModelChatMessageRole): 'system' | 'user' | 'assistant' {
        switch (role) {
            case vscode.LanguageModelChatMessageRole.User:
                return 'user';
            case vscode.LanguageModelChatMessageRole.Assistant:
                return 'assistant';
            // System role may not be directly exposed in LanguageModelChatMessageRole enum
            // but we handle it as a fallback
            default:
                // Default to 'user' for safety, though ideally we'd have explicit System handling
                return 'user';
        }
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
