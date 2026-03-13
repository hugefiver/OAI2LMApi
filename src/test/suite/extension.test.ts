import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('Extension should be present', () => {
		assert.ok(vscode.extensions.getExtension('oai2lmapi.oai2lmapi'));
	});

	test('Extension should activate', async () => {
		const ext = vscode.extensions.getExtension('oai2lmapi.oai2lmapi');
		assert.ok(ext);
		await ext?.activate();
		assert.strictEqual(ext?.isActive, true);
	});

	test('Should register refresh models command', async () => {
		const commands = await vscode.commands.getCommands(true);
		assert.ok(commands.includes('oai2lmapi.refreshModels'));
	});

	test('Should register manage command', async () => {
		const commands = await vscode.commands.getCommands(true);
		assert.ok(commands.includes('oai2lmapi.manage'));
	});

	test('Should register set API key command', async () => {
		const commands = await vscode.commands.getCommands(true);
		assert.ok(commands.includes('oai2lmapi.setApiKey'));
	});

	test('Should register clear API key command', async () => {
		const commands = await vscode.commands.getCommands(true);
		assert.ok(commands.includes('oai2lmapi.clearApiKey'));
	});
});
