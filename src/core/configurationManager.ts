import * as vscode from 'vscode';
import { AIProvider } from '../types/interfaces';

export class ConfigurationManager {
  constructor(private context: vscode.ExtensionContext) {}

  public getConfiguration(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration('debugger-for-llms');
  }

  public async getAIProvider(): Promise<AIProvider | undefined> {
    // TODO: Implement secure AI provider retrieval
    // This will be implemented in Task 7
    const config = this.getConfiguration();
    const providerName = config.get<string>('aiProvider', 'openai');
    
    // Placeholder - will implement secure key retrieval
    return {
      name: providerName,
      apiKey: 'placeholder-key'
    };
  }

  public async setAIProvider(provider: AIProvider): Promise<void> {
    // TODO: Implement secure AI provider storage
    // This will be implemented in Task 7
  }

  public getPrivacyLevel(): string {
    return this.getConfiguration().get<string>('privacyLevel', 'moderate');
  }

  public getMaxContextSize(): number {
    return this.getConfiguration().get<number>('maxContextSize', 10000);
  }

  public isAutoCollectionEnabled(): boolean {
    return this.getConfiguration().get<boolean>('enableAutoCollection', true);
  }
}