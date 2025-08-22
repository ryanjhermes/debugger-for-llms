import * as vscode from 'vscode';
import { DebugSessionManager } from './debugSessionManager';

export class DebugAdapterTracker implements vscode.DebugAdapterTracker {
  constructor(
    private session: vscode.DebugSession,
    private debugSessionManager: DebugSessionManager,
    private outputChannel: vscode.LogOutputChannel
  ) {}

  onWillReceiveMessage(message: any): void {
    // Log incoming messages for debugging
    this.outputChannel.trace(`[${this.session.id}] -> ${JSON.stringify(message)}`);
  }

  onDidSendMessage(message: any): void {
    // Handle debug adapter protocol messages
    this.outputChannel.trace(`[${this.session.id}] <- ${JSON.stringify(message)}`);
    
    try {
      this.handleDebugMessage(message);
    } catch (error) {
      this.outputChannel.error(`Error handling debug message: ${error}`);
    }
  }

  private async handleDebugMessage(message: any): Promise<void> {
    if (!message || !message.type) {
      return;
    }

    switch (message.type) {
      case 'event':
        await this.handleDebugEvent(message);
        break;
      case 'response':
        await this.handleDebugResponse(message);
        break;
    }
  }

  private async handleDebugEvent(message: any): Promise<void> {
    const { event, body } = message;

    switch (event) {
      case 'stopped':
        await this.handleStoppedEvent(body);
        break;
      case 'continued':
        this.outputChannel.debug(`[${this.session.id}] Execution continued`);
        break;
      case 'output':
        await this.handleOutputEvent(body);
        break;
      case 'exited':
        this.outputChannel.debug(`[${this.session.id}] Process exited with code ${body.exitCode}`);
        break;
      case 'terminated':
        this.outputChannel.debug(`[${this.session.id}] Debug session terminated`);
        break;
    }
  }

  private async handleStoppedEvent(body: any): Promise<void> {
    const { reason, threadId, text, allThreadsStopped } = body;
    
    this.outputChannel.debug(`[${this.session.id}] Stopped: ${reason} (thread: ${threadId})`);

    // Get thread information
    const thread = await this.getThread(threadId);
    if (!thread) {
      return;
    }

    switch (reason) {
      case 'breakpoint':
        await this.handleBreakpointStop(thread);
        break;
      case 'exception':
        await this.handleExceptionStop(thread, text);
        break;
      case 'step':
        await this.handleStepStop(thread);
        break;
      case 'pause':
        this.outputChannel.debug(`[${this.session.id}] Paused by user`);
        break;
    }
  }

  private async handleBreakpointStop(thread: vscode.DebugThread): Promise<void> {
    try {
      // VSCode doesn't expose thread.id directly, so we'll extract from the stopped event
      // For now, we'll pass undefined for stackFrame and let the debug session manager handle it
      await this.debugSessionManager.onBreakpoint({
        session: this.session,
        thread: thread,
        stackFrame: undefined as any // Will be resolved in the debug session manager
      });
    } catch (error) {
      this.outputChannel.error(`Error handling breakpoint stop: ${error}`);
    }
  }

  private async handleExceptionStop(thread: vscode.DebugThread, exceptionText?: string): Promise<void> {
    try {
      // Create exception info from available data
      const exception = {
        name: 'Exception',
        message: exceptionText || 'An exception occurred',
        stack: '', // Will be populated from stack trace
        source: this.session.type
      };

      await this.debugSessionManager.onException({
        session: this.session,
        thread: thread,
        exception: exception
      });
    } catch (error) {
      this.outputChannel.error(`Error handling exception stop: ${error}`);
    }
  }

  private async handleStepStop(thread: vscode.DebugThread): Promise<void> {
    try {
      await this.debugSessionManager.onStepComplete({
        session: this.session,
        thread: thread,
        stepType: 'stepOver' // Default, could be enhanced to track actual step type
      });
    } catch (error) {
      this.outputChannel.error(`Error handling step stop: ${error}`);
    }
  }

  private async handleOutputEvent(body: any): Promise<void> {
    const { category, output } = body;
    
    // Log console output for context collection
    this.outputChannel.debug(`[${this.session.id}] Output (${category}): ${output.trim()}`);
    
    // Forward to debug session manager for context collection
    if (output && output.trim()) {
      const consoleMessage = {
        level: category || 'log',
        text: output,
        timestamp: Date.now()
      };
      
      // We'll add a method to handle console output in the debug session manager
      if ((this.debugSessionManager as any).onConsoleOutput) {
        await (this.debugSessionManager as any).onConsoleOutput(this.session, consoleMessage);
      }
    }
  }

  private async handleDebugResponse(message: any): Promise<void> {
    // Handle responses to debug adapter requests
    const { command, success, body } = message;
    
    if (!success) {
      this.outputChannel.warn(`[${this.session.id}] Command ${command} failed: ${body?.error?.format || 'Unknown error'}`);
    }
  }

  private async getThread(threadId: number): Promise<vscode.DebugThread | undefined> {
    try {
      // Use custom request to get thread info
      const response = await this.session.customRequest('threads');
      const threads = response?.threads || [];
      
      return threads.find((t: any) => t.id === threadId);
    } catch (error) {
      this.outputChannel.error(`Error getting thread ${threadId}: ${error}`);
      return undefined;
    }
  }

  onWillStartSession(): void {
    this.outputChannel.debug(`[${this.session.id}] Debug adapter tracker started`);
  }

  onWillStopSession(): void {
    this.outputChannel.debug(`[${this.session.id}] Debug adapter tracker stopping`);
  }

  onError(error: Error): void {
    this.outputChannel.error(`[${this.session.id}] Debug adapter error: ${error.message}`);
  }

  onExit(code: number | undefined, signal: string | undefined): void {
    this.outputChannel.debug(`[${this.session.id}] Debug adapter exited (code: ${code}, signal: ${signal})`);
  }
}