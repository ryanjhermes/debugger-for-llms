import * as vscode from 'vscode';
import { IUIController, DiagnosticInsights, ExtensionStatus } from '../types/interfaces';

export class UIController implements IUIController {
  private statusBarItem: vscode.StatusBarItem;
  private aiModeEnabled = false;

  constructor(
    private context: vscode.ExtensionContext,
    private outputChannel: vscode.LogOutputChannel
  ) {
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  }

  public initialize(): void {
    // Initialize status bar
    this.statusBarItem.text = '$(debug-alt) AI Debug: Off';
    this.statusBarItem.command = 'debugger-for-llms.toggleAIMode';
    this.statusBarItem.tooltip = 'Toggle AI Debug Mode';
    this.statusBarItem.show();
    
    this.outputChannel.info('UI Controller initialized');
  }

  public showInsights(insights: DiagnosticInsights): void {
    // TODO: Implement insights display in side panel
    // This will be implemented in Task 8
    this.outputChannel.info('Showing AI insights');
  }

  public updateStatus(status: ExtensionStatus): void {
    // TODO: Implement status updates
    // This will be implemented in Task 8
    this.aiModeEnabled = status.aiModeEnabled;
    this.statusBarItem.text = `$(debug-alt) AI Debug: ${status.aiModeEnabled ? 'On' : 'Off'}`;
  }

  public showConfiguration(): void {
    // TODO: Implement configuration UI
    // This will be implemented in Task 8
    vscode.window.showInformationMessage('Configuration UI - Coming soon!');
  }

  public toggleAIMode(): void {
    this.aiModeEnabled = !this.aiModeEnabled;
    this.statusBarItem.text = `$(debug-alt) AI Debug: ${this.aiModeEnabled ? 'On' : 'Off'}`;
    
    // Set context for conditional UI elements
    vscode.commands.executeCommand('setContext', 'debugger-for-llms.aiModeEnabled', this.aiModeEnabled);
    
    this.outputChannel.info(`AI Mode ${this.aiModeEnabled ? 'enabled' : 'disabled'}`);
    vscode.window.showInformationMessage(`AI Debug Mode ${this.aiModeEnabled ? 'enabled' : 'disabled'}`);
  }

  public showInsightsPanel(): void {
    // TODO: Implement insights panel
    // This will be implemented in Task 8
    vscode.window.showInformationMessage('AI Insights Panel - Coming soon!');
  }

  public dispose(): void {
    this.statusBarItem.dispose();
    this.outputChannel.info('UI Controller disposed');
  }
}