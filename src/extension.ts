import * as vscode from 'vscode';
import { DebugSessionManager } from './core/debugSessionManager';
import { ContextCollector } from './core/contextCollector';
import { DataProcessor } from './core/dataProcessor';
import { MiddlewareRegistry } from './core/middlewareRegistry';
import { AIServiceClient } from './core/aiServiceClient';
import { UIController } from './ui/uiController';
import { ConfigurationManager } from './core/configurationManager';

export class ExtensionContext {
  private debugSessionManager: DebugSessionManager;
  private contextCollector: ContextCollector;
  private dataProcessor: DataProcessor;
  private middlewareRegistry: MiddlewareRegistry;
  private aiServiceClient: AIServiceClient;
  public uiController: UIController;
  private configurationManager: ConfigurationManager;
  private outputChannel: vscode.LogOutputChannel;

  constructor(context: vscode.ExtensionContext) {
    // Initialize output channel for internal logging
    this.outputChannel = vscode.window.createOutputChannel('AI Debugger (Internal)', { log: true });
    
    // Initialize configuration manager
    this.configurationManager = new ConfigurationManager(context);
    
    // Initialize core components
    this.contextCollector = new ContextCollector(this.outputChannel);
    this.dataProcessor = new DataProcessor(this.configurationManager);
    this.middlewareRegistry = new MiddlewareRegistry(this.outputChannel);
    this.aiServiceClient = new AIServiceClient(this.configurationManager, this.outputChannel);
    this.uiController = new UIController(context, this.outputChannel);
    
    // Initialize debug session manager with all dependencies
    this.debugSessionManager = new DebugSessionManager(
      this.contextCollector,
      this.dataProcessor,
      this.aiServiceClient,
      this.uiController,
      this.middlewareRegistry,
      this.outputChannel
    );
  }

  public activate(): void {
    this.outputChannel.info('AI Debugger extension activating...');
    
    // Start debug session monitoring
    this.debugSessionManager.initialize();
    
    // Initialize middleware registry
    this.middlewareRegistry.initialize();
    
    // Initialize UI
    this.uiController.initialize();
    
    this.outputChannel.info('AI Debugger extension activated successfully');
  }

  public deactivate(): void {
    this.outputChannel.info('AI Debugger extension deactivating...');
    
    // Cleanup resources
    this.debugSessionManager.dispose();
    this.middlewareRegistry.dispose();
    this.uiController.dispose();
    this.outputChannel.dispose();
  }
}

let extensionInstance: ExtensionContext;

export function activate(context: vscode.ExtensionContext) {
  try {
    extensionInstance = new ExtensionContext(context);
    
    // Register commands
    const toggleAIModeCommand = vscode.commands.registerCommand(
      'debugger-for-llms.toggleAIMode',
      () => extensionInstance.uiController.toggleAIMode()
    );
    
    const configureCommand = vscode.commands.registerCommand(
      'debugger-for-llms.configure',
      () => extensionInstance.uiController.showConfiguration()
    );
    
    const showInsightsCommand = vscode.commands.registerCommand(
      'debugger-for-llms.showInsights',
      () => extensionInstance.uiController.showInsightsPanel()
    );

    // Add commands to context subscriptions
    context.subscriptions.push(toggleAIModeCommand, configureCommand, showInsightsCommand);
    
    // Activate the extension
    extensionInstance.activate();
    
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to activate AI Debugger: ${error}`);
    console.error('Extension activation failed:', error);
  }
}

export function deactivate() {
  if (extensionInstance) {
    extensionInstance.deactivate();
  }
}