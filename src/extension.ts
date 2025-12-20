import * as vscode from 'vscode';
import { OpenAILanguageModelProvider } from './languageModelProvider';

const API_KEY_SECRET_KEY = 'oai2lmapi.apiKey';

let languageModelProvider: OpenAILanguageModelProvider | undefined;

export async function activate(context: vscode.ExtensionContext) {
    console.log('OAI2LMApi extension is now active');

    // Register commands FIRST to ensure they are always available
    // This prevents "command not found" errors even if initialization fails
    const refreshCommand = vscode.commands.registerCommand('oai2lmapi.refreshModels', async () => {
        if (languageModelProvider) {
            await languageModelProvider.loadModels();
            vscode.window.showInformationMessage('Models refreshed successfully');
        } else {
            vscode.window.showWarningMessage('OAI2LMApi: Provider not initialized. Please configure API key first.');
        }
    });

    const manageCommand = vscode.commands.registerCommand('oai2lmapi.manage', async () => {
        await vscode.commands.executeCommand('workbench.action.openSettings', 'oai2lmapi');
    });

    const setApiKeyCommand = vscode.commands.registerCommand('oai2lmapi.setApiKey', async () => {
        const apiKey = await vscode.window.showInputBox({
            prompt: 'Enter your OpenAI-compatible API key',
            password: true,
            ignoreFocusOut: true,
            placeHolder: 'sk-...'
        });
        
        if (apiKey !== undefined) {
            await context.secrets.store(API_KEY_SECRET_KEY, apiKey);
            vscode.window.showInformationMessage('API key saved securely');
            
            // Reinitialize the provider with the new key
            await reinitializeProvider(context);
        }
    });

    const clearApiKeyCommand = vscode.commands.registerCommand('oai2lmapi.clearApiKey', async () => {
        const confirm = await vscode.window.showWarningMessage(
            'Are you sure you want to clear the API key?',
            { modal: true },
            'Yes'
        );
        
        if (confirm === 'Yes') {
            await context.secrets.delete(API_KEY_SECRET_KEY);
            vscode.window.showInformationMessage('API key cleared');
            
            // Dispose the current provider
            if (languageModelProvider) {
                languageModelProvider.dispose();
                languageModelProvider = undefined;
            }
        }
    });

    context.subscriptions.push(refreshCommand, manageCommand, setApiKeyCommand, clearApiKeyCommand);

    // Migrate plaintext API key to SecretStorage if exists
    await migrateApiKeyToSecretStorage(context);

    // Create and register the language model provider
    await initializeProvider(context);

    // Watch for configuration changes (excluding apiKey which is now in SecretStorage)
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(async (e) => {
            if (e.affectsConfiguration('oai2lmapi')) {
                console.log('OAI2LMApi configuration changed, reinitializing...');
                await reinitializeProvider(context);
            }
        })
    );
}

async function migrateApiKeyToSecretStorage(context: vscode.ExtensionContext): Promise<void> {
    const config = vscode.workspace.getConfiguration('oai2lmapi');
    const plaintextKey = config.get<string>('apiKey', '');
    
    if (plaintextKey) {
        console.log('OAI2LMApi: Migrating API key from settings to SecretStorage');
        
        // Store in SecretStorage
        await context.secrets.store(API_KEY_SECRET_KEY, plaintextKey);
        
        // Clear the plaintext key from settings
        try {
            await config.update('apiKey', undefined, vscode.ConfigurationTarget.Global);
            await config.update('apiKey', undefined, vscode.ConfigurationTarget.Workspace);
        } catch (error) {
            console.warn('OAI2LMApi: Could not clear plaintext API key from settings:', error);
        }
        
        vscode.window.showInformationMessage('OAI2LMApi: API key has been migrated to secure storage');
    }
}

async function initializeProvider(context: vscode.ExtensionContext): Promise<void> {
    try {
        languageModelProvider = new OpenAILanguageModelProvider(context);
        await languageModelProvider.initialize();
    } catch (error) {
        console.error('OAI2LMApi: Failed to initialize provider:', error);
        vscode.window.showErrorMessage(`OAI2LMApi: Failed to initialize: ${error}`);
    }
}

async function reinitializeProvider(context: vscode.ExtensionContext): Promise<void> {
    if (languageModelProvider) {
        languageModelProvider.dispose();
        languageModelProvider = undefined;
    }
    await initializeProvider(context);
}

export function deactivate() {
    if (languageModelProvider) {
        languageModelProvider.dispose();
        languageModelProvider = undefined;
    }
}
