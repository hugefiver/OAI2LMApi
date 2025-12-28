import * as vscode from 'vscode';
import { OpenAILanguageModelProvider } from './languageModelProvider';
import { GeminiLanguageModelProvider } from './geminiLanguageModelProvider';
import { API_KEY_SECRET_KEY, GEMINI_API_KEY_SECRET_KEY } from './constants';
import { logger } from './logger';

let languageModelProvider: OpenAILanguageModelProvider | undefined;
let geminiProvider: GeminiLanguageModelProvider | undefined;

export function activate(context: vscode.ExtensionContext) {
    // Initialize the logger first
    logger.initialize(context);
    logger.info('Extension is now active');

    // Register commands FIRST to ensure they are always available
    // This prevents "command not found" errors even if initialization fails
    const refreshCommand = vscode.commands.registerCommand('oai2lmapi.refreshModels', async () => {
        let refreshed = false;
        if (languageModelProvider) {
            await languageModelProvider.loadModels();
            refreshed = true;
        }
        if (geminiProvider) {
            await geminiProvider.loadModels();
            refreshed = true;
        }
        if (refreshed) {
            vscode.window.showInformationMessage('Models refreshed successfully');
        } else {
            vscode.window.showWarningMessage('OAI2LMApi: No providers initialized. Please configure API keys first.');
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

    // Gemini-specific commands
    const setGeminiApiKeyCommand = vscode.commands.registerCommand('oai2lmapi.setGeminiApiKey', async () => {
        const apiKey = await vscode.window.showInputBox({
            prompt: 'Enter your Google Gemini API key',
            password: true,
            ignoreFocusOut: true,
            placeHolder: 'AIza...'
        });
        
        if (apiKey !== undefined) {
            await context.secrets.store(GEMINI_API_KEY_SECRET_KEY, apiKey);
            vscode.window.showInformationMessage('Gemini API key saved securely');
            
            // Reinitialize the Gemini provider with the new key
            await reinitializeGeminiProvider(context);
        }
    });

    const clearGeminiApiKeyCommand = vscode.commands.registerCommand('oai2lmapi.clearGeminiApiKey', async () => {
        const confirm = await vscode.window.showWarningMessage(
            'Are you sure you want to clear the Gemini API key?',
            { modal: true },
            'Yes'
        );
        
        if (confirm === 'Yes') {
            await context.secrets.delete(GEMINI_API_KEY_SECRET_KEY);
            vscode.window.showInformationMessage('Gemini API key cleared');
            
            // Dispose the Gemini provider
            if (geminiProvider) {
                geminiProvider.dispose();
                geminiProvider = undefined;
            }
        }
    });

    context.subscriptions.push(refreshCommand, manageCommand, setApiKeyCommand, clearApiKeyCommand, setGeminiApiKeyCommand, clearGeminiApiKeyCommand);

    // Watch for configuration changes (excluding apiKey which is now in SecretStorage)
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(async (e) => {
            if (e.affectsConfiguration('oai2lmapi')) {
                logger.info('Configuration changed, reinitializing providers...');
                await reinitializeAllProviders(context);
            }
        })
    );

    // Perform async initialization in the background to avoid blocking activation
    // This prevents the extension from staying in "activating" state if API calls hang
    initializeAsync(context);
}

/**
 * Performs async initialization operations in the background.
 * This function is intentionally not awaited to avoid blocking extension activation.
 * Any errors are logged and handled gracefully without affecting extension availability.
 */
async function initializeAsync(context: vscode.ExtensionContext): Promise<void> {
    try {
        // Migrate plaintext API key to SecretStorage if exists
        await migrateApiKeyToSecretStorage(context);

        // Create and register the OpenAI-compatible language model provider
        await initializeProvider(context);

        // Create and register the Gemini language model provider
        // This will only be enabled if a Gemini API key is configured
        await initializeGeminiProvider(context);
    } catch (error) {
        logger.error('Background initialization failed', error);
        // Surface critical initialization failures to the user
        vscode.window.showErrorMessage('OAI2LMApi: Background initialization failed. Check the Output panel for details.');
    }
}

async function migrateApiKeyToSecretStorage(context: vscode.ExtensionContext): Promise<void> {
    const config = vscode.workspace.getConfiguration('oai2lmapi');
    const plaintextKey = config.get<string>('apiKey', '');
    
    if (plaintextKey) {
        logger.info('Migrating API key from settings to SecretStorage');
        
        // Store in SecretStorage
        await context.secrets.store(API_KEY_SECRET_KEY, plaintextKey);
        
        // Clear the plaintext key from settings
        try {
            await config.update('apiKey', undefined, vscode.ConfigurationTarget.Global);
            await config.update('apiKey', undefined, vscode.ConfigurationTarget.Workspace);
        } catch (error) {
            logger.warn('Could not clear plaintext API key from settings');
        }
        
        vscode.window.showInformationMessage('OAI2LMApi: API key has been migrated to secure storage');
    }
}

async function initializeProvider(context: vscode.ExtensionContext): Promise<void> {
    try {
        languageModelProvider = new OpenAILanguageModelProvider(context);
        await languageModelProvider.initialize();
    } catch (error) {
        logger.error('Failed to initialize OpenAI provider', error, 'OpenAI');
        // Show a generic message to avoid exposing sensitive information
        vscode.window.showErrorMessage('OAI2LMApi: Failed to initialize. Check the Output panel for details.');
    }
}

async function initializeGeminiProvider(context: vscode.ExtensionContext, isReinitialize = false): Promise<void> {
    // Check if Gemini channel is enabled in settings
    const config = vscode.workspace.getConfiguration('oai2lmapi');
    const enableGeminiChannel = config.get<boolean>('enableGeminiChannel', false);
    
    if (!enableGeminiChannel) {
        if (isReinitialize) {
            logger.info('Gemini channel disabled by configuration change', 'Gemini');
        } else {
            logger.debug('Gemini channel is disabled in settings', undefined, 'Gemini');
        }
        return;
    }

    try {
        geminiProvider = new GeminiLanguageModelProvider(context);
        await geminiProvider.initialize();
        // Check if provider is actually initialized (has API key)
        if (!geminiProvider.isInitialized) {
            geminiProvider.dispose();
            geminiProvider = undefined;
            logger.debug('Gemini provider not initialized (no API key configured)', undefined, 'Gemini');
        }
    } catch (error) {
        logger.error('Failed to initialize Gemini provider', error, 'Gemini');
        if (geminiProvider) {
            geminiProvider.dispose();
            geminiProvider = undefined;
        }
    }
}

/**
 * Reinitialize all providers. Used when configuration changes.
 */
async function reinitializeAllProviders(context: vscode.ExtensionContext): Promise<void> {
    await reinitializeProvider(context);
    await reinitializeGeminiProvider(context);
}

async function reinitializeProvider(context: vscode.ExtensionContext): Promise<void> {
    if (languageModelProvider) {
        languageModelProvider.dispose();
        languageModelProvider = undefined;
    }
    await initializeProvider(context);
}

async function reinitializeGeminiProvider(context: vscode.ExtensionContext): Promise<void> {
    if (geminiProvider) {
        geminiProvider.dispose();
        geminiProvider = undefined;
    }
    await initializeGeminiProvider(context, true);
}

export function deactivate() {
    if (languageModelProvider) {
        languageModelProvider.dispose();
        languageModelProvider = undefined;
    }
    if (geminiProvider) {
        geminiProvider.dispose();
        geminiProvider = undefined;
    }
}
