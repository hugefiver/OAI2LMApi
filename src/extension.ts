import * as vscode from 'vscode';
import { OpenAILanguageModelProvider } from './languageModelProvider';

let languageModelProvider: OpenAILanguageModelProvider | undefined;

export async function activate(context: vscode.ExtensionContext) {
    console.log('OAI2LMApi extension is now active');

    // Create and register the language model provider
    languageModelProvider = new OpenAILanguageModelProvider(context);
    await languageModelProvider.initialize();

    // Watch for configuration changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(async (e) => {
            if (e.affectsConfiguration('oai2lmapi')) {
                console.log('OAI2LMApi configuration changed, reinitializing...');
                await languageModelProvider?.dispose();
                languageModelProvider = new OpenAILanguageModelProvider(context);
                await languageModelProvider.initialize();
            }
        })
    );

    // Register command to manually refresh models
    const refreshCommand = vscode.commands.registerCommand('oai2lmapi.refreshModels', async () => {
        await languageModelProvider?.loadModels();
        vscode.window.showInformationMessage('Models refreshed successfully');
    });

    context.subscriptions.push(refreshCommand);
}

export function deactivate() {
    if (languageModelProvider) {
        languageModelProvider.dispose();
        languageModelProvider = undefined;
    }
}
