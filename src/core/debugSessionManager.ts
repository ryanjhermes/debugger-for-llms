import * as vscode from 'vscode';
import { IDebugSessionManager, DebugBreakpointEvent, DebugExceptionEvent, DebugStepEvent, DebugContext } from '../types/interfaces';
import { ContextCollector } from './contextCollector';
import { DataProcessor } from './dataProcessor';
import { AIServiceClient } from './aiServiceClient';
import { UIController } from '../ui/uiController';

interface SessionData {
  session: vscode.DebugSession;
  sessionId: string;
  startTime: number;
  contextHistory: DebugContext[];
}

export class DebugSessionManager implements IDebugSessionManager {
  private activeSessions = new Map<string, SessionData>();
  private disposables: vscode.Disposable[] = [];
  private debugConsoleDisposables = new Map<string, vscode.Disposable[]>();

  constructor(
    private contextCollector: ContextCollector,
    private dataProcessor: DataProcessor,
    private aiServiceClient: AIServiceClient,
    private uiController: UIController,
    private outputChannel: vscode.LogOutputChannel
  ) {}

  public initialize(): void {
    // Register debug event listeners
    this.disposables.push(
      vscode.debug.onDidStartDebugSession(this.startSession.bind(this)),
      vscode.debug.onDidTerminateDebugSession(this.stopSession.bind(this)),
      vscode.debug.onDidChangeActiveDebugSession(this.onActiveSessionChange.bind(this))
    );
    
    // Register debug adapter tracker factory for all debug types
    this.registerDebugAdapterTrackers();
    
    this.outputChannel.info('Debug Session Manager initialized');
  }

  private registerDebugAdapterTrackers(): void {
    // Import here to avoid circular dependency
    const { DebugAdapterTrackerFactory } = require('./debugAdapterTrackerFactory');
    const trackerFactory = new DebugAdapterTrackerFactory(this, this.outputChannel);
    
    // Register for common debug types
    const debugTypes = ['node', 'python', 'java', 'cppdbg', 'coreclr', 'go', 'php'];
    
    for (const debugType of debugTypes) {
      const disposable = vscode.debug.registerDebugAdapterTrackerFactory(debugType, trackerFactory);
      this.disposables.push(disposable);
      this.outputChannel.debug(`Registered debug adapter tracker for type: ${debugType}`);
    }
    
    // Also register a catch-all for any debug type
    const catchAllDisposable = vscode.debug.registerDebugAdapterTrackerFactory('*', trackerFactory);
    this.disposables.push(catchAllDisposable);
    this.outputChannel.debug('Registered catch-all debug adapter tracker');
  }

  public startSession(session: vscode.DebugSession): void {
    this.outputChannel.info(`Debug session started: ${session.id} (${session.type})`);
    
    const sessionData: SessionData = {
      session,
      sessionId: session.id,
      startTime: Date.now(),
      contextHistory: []
    };
    
    this.activeSessions.set(session.id, sessionData);
    
    // Set up session-specific event listeners
    this.setupSessionEventListeners(sessionData);
    
    // Notify UI of new session
    this.uiController.updateStatus({
      aiModeEnabled: true,
      activeProvider: 'openai',
      lastAnalysis: new Date(),
      contextCount: 0
    });
  }

  public stopSession(session: vscode.DebugSession): void {
    this.outputChannel.info(`Debug session stopped: ${session.id}`);
    
    // Clean up session-specific resources
    this.cleanupSessionResources(session.id);
    
    // Remove from active sessions
    this.activeSessions.delete(session.id);
    
    // Update UI if no more active sessions
    if (this.activeSessions.size === 0) {
      this.uiController.updateStatus({
        aiModeEnabled: false,
        contextCount: 0
      });
    }
  }

  private setupSessionEventListeners(sessionData: SessionData): void {
    const session = sessionData.session;
    const sessionDisposables: vscode.Disposable[] = [];
    
    // Note: VSCode doesn't expose direct console output events
    // We'll implement console capture through middleware in Task 5
    this.outputChannel.debug(`Set up console monitoring for session ${session.id}`);
    
    // Store disposables for cleanup
    this.debugConsoleDisposables.set(session.id, sessionDisposables);
  }

  private cleanupSessionResources(sessionId: string): void {
    // Dispose session-specific event listeners
    const disposables = this.debugConsoleDisposables.get(sessionId);
    if (disposables) {
      disposables.forEach(d => d.dispose());
      this.debugConsoleDisposables.delete(sessionId);
    }
    
    this.outputChannel.debug(`Cleaned up resources for session ${sessionId}`);
  }

  private onActiveSessionChange(session: vscode.DebugSession | undefined): void {
    if (session) {
      this.outputChannel.debug(`Active debug session changed to: ${session.id}`);
    } else {
      this.outputChannel.debug('No active debug session');
    }
  }

  public async onBreakpoint(event: DebugBreakpointEvent): Promise<void> {
    this.outputChannel.debug(`Breakpoint hit in session ${event.session.id}`);
    
    try {
      // Collect context at breakpoint
      const context = await this.collectDebugContext(event.session, event.thread, event.stackFrame, 'breakpoint');
      
      // Process and analyze context
      await this.processAndAnalyzeContext(context, event.session.id);
      
    } catch (error) {
      this.outputChannel.error(`Error handling breakpoint: ${error}`);
    }
  }

  public async onException(event: DebugExceptionEvent): Promise<void> {
    this.outputChannel.debug(`Exception in session ${event.session.id}: ${event.exception.name}`);
    
    try {
      // Collect context for exception
      const context = await this.collectDebugContext(event.session, event.thread, undefined, 'exception', event.exception);
      
      // Process and analyze context with high priority for exceptions
      await this.processAndAnalyzeContext(context, event.session.id, true);
      
    } catch (error) {
      this.outputChannel.error(`Error handling exception: ${error}`);
    }
  }

  public async onStepComplete(event: DebugStepEvent): Promise<void> {
    this.outputChannel.debug(`Step ${event.stepType} completed in session ${event.session.id}`);
    
    try {
      // Only collect context for certain step types to avoid noise
      if (event.stepType === 'stepIn' || event.stepType === 'stepOver') {
        const context = await this.collectDebugContext(event.session, event.thread, undefined, 'step');
        await this.processAndAnalyzeContext(context, event.session.id);
      }
      
    } catch (error) {
      this.outputChannel.error(`Error handling step completion: ${error}`);
    }
  }

  private async collectDebugContext(
    session: vscode.DebugSession,
    thread: vscode.DebugThread,
    stackFrame?: vscode.DebugStackFrame,
    eventType: 'breakpoint' | 'exception' | 'step' | 'console' = 'breakpoint',
    exception?: any
  ): Promise<DebugContext> {
    const timestamp = Date.now();
    
    // Get current stack trace
    const stackTrace = await this.contextCollector.collectStackTrace(thread);
    
    // Get variables if we have a stack frame
    const variables = stackFrame ? await this.contextCollector.collectVariables(stackFrame) : [];
    
    // Build source location
    const sourceLocation = stackFrame ? {
      file: (stackFrame as any).source?.path || 'unknown',
      line: (stackFrame as any).line || 0,
      column: (stackFrame as any).column || 0
    } : {
      file: 'unknown',
      line: 0,
      column: 0
    };
    
    const context: DebugContext = {
      sessionId: session.id,
      timestamp,
      eventType,
      sourceLocation,
      stackTrace,
      variables,
      consoleOutput: [], // Will be populated by middleware
      networkActivity: [], // Will be populated by middleware
      exception: exception ? this.contextCollector.collectException(exception) : undefined
    };
    
    return context;
  }

  private async processAndAnalyzeContext(context: DebugContext, sessionId: string, highPriority = false): Promise<void> {
    const sessionData = this.activeSessions.get(sessionId);
    if (!sessionData) {
      return;
    }
    
    // Add to session history
    sessionData.contextHistory.push(context);
    
    // Keep only recent context (last 50 entries)
    if (sessionData.contextHistory.length > 50) {
      sessionData.contextHistory = sessionData.contextHistory.slice(-50);
    }
    
    // Process context through data processor
    const processedContext = this.dataProcessor.processContext(context);
    const filteredContext = this.dataProcessor.applyPrivacyFilters(processedContext);
    const aiReadyContext = this.dataProcessor.structureForAI(filteredContext);
    
    // Send to AI for analysis if enabled and we have meaningful context
    if (this.shouldAnalyzeContext(context, highPriority)) {
      try {
        const provider = await this.getConfiguredAIProvider();
        if (provider) {
          const insights = await this.aiServiceClient.sendDiagnosticRequest(aiReadyContext, provider);
          this.uiController.showInsights(insights);
        }
      } catch (error) {
        this.outputChannel.error(`AI analysis failed: ${error}`);
      }
    }
    
    // Update UI with context count
    this.uiController.updateStatus({
      aiModeEnabled: true,
      activeProvider: 'openai',
      lastAnalysis: new Date(),
      contextCount: sessionData.contextHistory.length
    });
  }

  private shouldAnalyzeContext(context: DebugContext, highPriority: boolean): boolean {
    // Always analyze exceptions
    if (context.eventType === 'exception' || highPriority) {
      return true;
    }
    
    // Analyze breakpoints if they have meaningful context
    if (context.eventType === 'breakpoint' && (context.variables.length > 0 || context.exception)) {
      return true;
    }
    
    // Skip step events unless they reveal errors
    if (context.eventType === 'step') {
      return context.exception !== undefined;
    }
    
    return false;
  }

  private async getConfiguredAIProvider(): Promise<any> {
    // This will be implemented properly in Task 6
    // For now, return a placeholder
    return {
      name: 'openai',
      apiKey: 'placeholder'
    };
  }

  public getActiveSessionCount(): number {
    return this.activeSessions.size;
  }

  public getSessionHistory(sessionId: string): DebugContext[] {
    const sessionData = this.activeSessions.get(sessionId);
    return sessionData ? [...sessionData.contextHistory] : [];
  }

  public dispose(): void {
    // Clean up all session resources
    for (const sessionId of this.activeSessions.keys()) {
      this.cleanupSessionResources(sessionId);
    }
    
    // Dispose main event listeners
    this.disposables.forEach(d => d.dispose());
    this.activeSessions.clear();
    this.debugConsoleDisposables.clear();
    
    this.outputChannel.info('Debug Session Manager disposed');
  }
}