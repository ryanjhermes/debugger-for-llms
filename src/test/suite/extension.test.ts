import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Test Suite', () => {
  vscode.window.showInformationMessage('Start all tests.');

  test('Extension should be present', () => {
    assert.ok(vscode.extensions.getExtension('ryanjhermes.debugger-for-llms'));
  });

  test('Extension should activate', async () => {
    const extension = vscode.extensions.getExtension('ryanjhermes.debugger-for-llms');
    if (extension) {
      await extension.activate();
      assert.ok(extension.isActive);
    }
  });

  test('Commands should be registered', async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('debugger-for-llms.toggleAIMode'));
    assert.ok(commands.includes('debugger-for-llms.configure'));
    assert.ok(commands.includes('debugger-for-llms.showInsights'));
  });
});