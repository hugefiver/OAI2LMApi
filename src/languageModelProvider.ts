import * as vscode from 'vscode';
import { OpenAIClient, ChatMessage } from './openaiClient';
import { API_KEY_SECRET_KEY } from './constants';

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
        const defaultModel = config.get<string>('defaultModel', 'gpt-3.5-turbo');
        
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
            apiKey,
            defaultModel
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
            // At least add the default model
            console.log(`OAI2LMApi: Using default model: ${defaultModel}`);
            this.addModel(defaultModel);
        }
    }

    async loadModels() {
        if (!this.client) {
            console.warn('OAI2LMApi: OpenAI client not initialized');
            return;
        }

        try {
            const models = await this.client.listModels();
            console.log(`OAI2LMApi: Loaded ${models.length} models from API`);

            // Clear existing models
            this.modelList = [];

            // Add all models
            for (const modelId of models) {
                this.addModel(modelId);
            }

            // If no models loaded, add default model
            if (models.length === 0) {
                console.log('OAI2LMApi: No models returned from API, using default model');
                const config = vscode.workspace.getConfiguration('oai2lmapi');
                const defaultModel = config.get<string>('defaultModel', 'gpt-3.5-turbo');
                this.addModel(defaultModel);
            }

            // Notify listeners that models changed
            this._onDidChangeLanguageModelChatInformation.fire();
        } catch (error) {
            console.error('OAI2LMApi: Failed to load models:', error);
            vscode.window.showErrorMessage(`OAI2LMApi: Failed to load models from API. Please check your endpoint and API key. Error: ${error}`);
            
            // Fallback to default model
            const config = vscode.workspace.getConfiguration('oai2lmapi');
            const defaultModel = config.get<string>('defaultModel', 'gpt-3.5-turbo');
            console.log(`OAI2LMApi: Falling back to default model: ${defaultModel}`);
            this.addModel(defaultModel);
            this._onDidChangeLanguageModelChatInformation.fire();
        }
    }

    private addModel(modelId: string) {
        const config = vscode.workspace.getConfiguration('oai2lmapi');
        const modelFamily = config.get<string>('modelFamily', 'gpt-3.5-turbo');
        const maxTokens = config.get<number>('maxTokens', 4096);

        const modelInfo: ModelInformation = {
            modelId: modelId,
            id: `oai2lmapi-${modelId}`,
            family: modelFamily,
            name: modelId,
            version: '1.0',
            maxInputTokens: maxTokens,
            maxOutputTokens: maxTokens,
            capabilities: {
                toolCalling: false,
                imageInput: false
            }
        };

        this.modelList.push(modelInfo);
        console.log(`OAI2LMApi: Added language model: ${modelInfo.id}`);
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
        if (!this.client) {
            throw new Error('OpenAI client not initialized');
        }

        // Convert VSCode messages to OpenAI format
        const chatMessages: ChatMessage[] = messages.map(msg => {
            let content = '';
            
            if (typeof msg.content === 'string') {
                content = msg.content;
            } else if (Array.isArray(msg.content)) {
                content = msg.content.map(part => {
                    if ('text' in part) {
                        return part.text;
                    }
                    return '';
                }).join('');
            }

            return {
                role: this.mapRole(msg.role),
                content
            };
        });

        // Create abort controller from cancellation token
        const abortController = new AbortController();
        if (token) {
            token.onCancellationRequested(() => {
                abortController.abort();
            });
        }

        // Stream the response
        await this.client.streamChatCompletion(
            chatMessages,
            model.modelId,
            {
                onChunk: (chunk) => {
                    progress.report(new vscode.LanguageModelTextPart(chunk));
                },
                signal: abortController.signal
            }
        );
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
                textContent = text.content;
            } else if (Array.isArray(text.content)) {
                textContent = text.content.map(part => {
                    if ('text' in part) {
                        return part.text;
                    }
                    return '';
                }).join('');
            } else {
                textContent = '';
            }
        }
        
        return Math.ceil(textContent.length / 4);
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
