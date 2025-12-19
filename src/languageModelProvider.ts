import * as vscode from 'vscode';
import { OpenAIClient, ChatMessage } from './openaiClient';

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
        const apiKey = config.get<string>('apiKey', '');
        const defaultModel = config.get<string>('defaultModel', 'gpt-3.5-turbo');

        if (!apiKey) {
            vscode.window.showWarningMessage('OAI2LMApi: API key not configured. Please set oai2lmapi.apiKey in settings.');
            return;
        }

        this.client = new OpenAIClient({
            apiEndpoint,
            apiKey,
            defaultModel
        });

        // Register the provider
        const disposable = vscode.lm.registerLanguageModelChatProvider('oai2lmapi', this);
        this.disposables.push(disposable);

        // Auto-load models if enabled
        const autoLoadModels = config.get<boolean>('autoLoadModels', true);
        if (autoLoadModels) {
            await this.loadModels();
        } else {
            // At least add the default model
            this.addModel(defaultModel);
        }
    }

    async loadModels() {
        if (!this.client) {
            console.warn('OpenAI client not initialized');
            return;
        }

        try {
            const models = await this.client.listModels();
            console.log(`Loaded ${models.length} models from API`);

            // Clear existing models
            this.modelList = [];

            // Add all models
            for (const modelId of models) {
                this.addModel(modelId);
            }

            // If no models loaded, add default model
            if (models.length === 0) {
                const config = vscode.workspace.getConfiguration('oai2lmapi');
                const defaultModel = config.get<string>('defaultModel', 'gpt-3.5-turbo');
                this.addModel(defaultModel);
            }

            // Notify listeners that models changed
            this._onDidChangeLanguageModelChatInformation.fire();
        } catch (error) {
            console.error('Failed to load models:', error);
            vscode.window.showErrorMessage(`Failed to load models: ${error}`);
            
            // Fallback to default model
            const config = vscode.workspace.getConfiguration('oai2lmapi');
            const defaultModel = config.get<string>('defaultModel', 'gpt-3.5-turbo');
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
        console.log(`Added language model: ${modelInfo.id}`);
    }

    async provideLanguageModelChatInformation(
        options: vscode.PrepareLanguageModelChatModelOptions,
        token: vscode.CancellationToken
    ): Promise<ModelInformation[]> {
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
        // This is a rough approximation; a proper implementation would use tiktoken or similar
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
            default:
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
