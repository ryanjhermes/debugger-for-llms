import * as vscode from 'vscode';
import { IContextCollector, VariableSnapshot, StackFrame, LogEntry, ConsoleMessage, ExceptionInfo, ExceptionData } from '../types/interfaces';

export class ContextCollector implements IContextCollector {
  constructor(private outputChannel: vscode.LogOutputChannel) {}

  public async collectVariables(frame: vscode.DebugStackFrame): Promise<VariableSnapshot[]> {
    // TODO: Implement variable collection from debug stack frame
    // This will be implemented in Task 3
    this.outputChannel.debug('Collecting variables from stack frame');
    return [];
  }

  public async collectStackTrace(thread: vscode.DebugThread): Promise<StackFrame[]> {
    // TODO: Implement stack trace collection
    // This will be implemented in Task 3
    this.outputChannel.debug('Collecting stack trace from thread');
    return [];
  }

  public collectConsoleOutput(output: ConsoleMessage): LogEntry {
    // TODO: Implement console output collection
    // This will be implemented in Task 3
    this.outputChannel.debug('Collecting console output');
    return {
      level: output.level as any,
      message: output.text,
      timestamp: output.timestamp,
      source: 'console'
    };
  }

  public collectException(exception: ExceptionInfo): ExceptionData {
    // TODO: Implement exception data collection
    // This will be implemented in Task 3
    this.outputChannel.debug('Collecting exception data');
    return {
      name: exception.name,
      message: exception.message,
      stack: exception.stack,
      source: exception.source
    };
  }
}