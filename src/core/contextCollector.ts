import * as vscode from 'vscode';
import { IContextCollector, VariableSnapshot, StackFrame, LogEntry, ConsoleMessage, ExceptionInfo, ExceptionData } from '../types/interfaces';

interface DebugVariable {
  name: string;
  value: string;
  type?: string;
  variablesReference: number;
  namedVariables?: number;
  indexedVariables?: number;
}

interface DebugStackFrame {
  id: number;
  name: string;
  source?: {
    name?: string;
    path?: string;
    sourceReference?: number;
  };
  line: number;
  column: number;
}

export class ContextCollector implements IContextCollector {
  private consoleOutputBuffer: LogEntry[] = [];
  private maxConsoleBufferSize = 1000;

  constructor(private outputChannel: vscode.LogOutputChannel) {}

  public async collectVariables(frame: vscode.DebugStackFrame): Promise<VariableSnapshot[]> {
    this.outputChannel.debug('Collecting variables from stack frame');
    
    try {
      // Since VSCode doesn't expose frame properties directly, we need to use the debug session
      const session = frame.session;
      if (!session) {
        this.outputChannel.warn('No debug session available for variable collection');
        return [];
      }

      // Get scopes for the frame
      const scopesResponse = await session.customRequest('scopes', {
        frameId: (frame as any).frameId || 0
      });

      const variables: VariableSnapshot[] = [];
      const scopes = scopesResponse?.scopes || [];

      // Collect variables from each scope
      for (const scope of scopes) {
        const scopeVariables = await this.collectScopeVariables(session, scope, scope.name);
        variables.push(...scopeVariables);
      }

      this.outputChannel.debug(`Collected ${variables.length} variables from ${scopes.length} scopes`);
      return variables;

    } catch (error) {
      this.outputChannel.error(`Error collecting variables: ${error}`);
      return [];
    }
  }

  private async collectScopeVariables(
    session: vscode.DebugSession,
    scope: any,
    scopeName: string
  ): Promise<VariableSnapshot[]> {
    try {
      const variablesResponse = await session.customRequest('variables', {
        variablesReference: scope.variablesReference,
        start: 0,
        count: 100 // Limit to prevent overwhelming data
      });

      const debugVariables: DebugVariable[] = variablesResponse?.variables || [];
      const variables: VariableSnapshot[] = [];

      for (const debugVar of debugVariables) {
        const variable = await this.processDebugVariable(session, debugVar, scopeName);
        if (variable) {
          variables.push(variable);
        }
      }

      return variables;
    } catch (error) {
      this.outputChannel.error(`Error collecting scope variables for ${scopeName}: ${error}`);
      return [];
    }
  }

  private async processDebugVariable(
    session: vscode.DebugSession,
    debugVar: DebugVariable,
    scopeName: string
  ): Promise<VariableSnapshot | null> {
    try {
      let processedValue = debugVar.value;
      let isRedacted = false;

      // Check if value should be redacted (contains sensitive patterns)
      if (this.shouldRedactValue(debugVar.name, debugVar.value)) {
        processedValue = '[REDACTED]';
        isRedacted = true;
      }

      // Handle complex objects (expand one level)
      if (debugVar.variablesReference > 0 && !isRedacted) {
        try {
          const childVariables = await session.customRequest('variables', {
            variablesReference: debugVar.variablesReference,
            start: 0,
            count: 10 // Limit child expansion
          });

          if (childVariables?.variables?.length > 0) {
            const childProps = childVariables.variables.map((child: DebugVariable) => 
              `${child.name}: ${child.value}`
            ).join(', ');
            processedValue = `{${childProps}}`;
          }
        } catch (childError) {
          // If we can't expand, keep the original value
          this.outputChannel.debug(`Could not expand variable ${debugVar.name}: ${childError}`);
        }
      }

      return {
        name: debugVar.name,
        value: processedValue,
        type: debugVar.type || this.inferType(debugVar.value),
        scope: this.mapScopeType(scopeName),
        isRedacted
      };

    } catch (error) {
      this.outputChannel.error(`Error processing variable ${debugVar.name}: ${error}`);
      return null;
    }
  }

  private shouldRedactValue(name: string, value: string): boolean {
    // Redact common sensitive patterns
    const sensitivePatterns = [
      /password/i,
      /secret/i,
      /token/i,
      /key/i,
      /auth/i,
      /credential/i,
      /api[_-]?key/i
    ];

    const sensitiveValuePatterns = [
      /^[A-Za-z0-9+/]{20,}={0,2}$/, // Base64-like strings
      /^[a-f0-9]{32,}$/i, // Hex strings (hashes, tokens)
      /^sk-[a-zA-Z0-9]{48}$/, // OpenAI API keys
      /^ghp_[a-zA-Z0-9]{36}$/, // GitHub tokens
    ];

    // Check variable name
    if (sensitivePatterns.some(pattern => pattern.test(name))) {
      return true;
    }

    // Check value patterns
    if (typeof value === 'string' && sensitiveValuePatterns.some(pattern => pattern.test(value))) {
      return true;
    }

    return false;
  }

  private inferType(value: string): string {
    if (value === 'undefined') return 'undefined';
    if (value === 'null') return 'null';
    if (value === 'true' || value === 'false') return 'boolean';
    if (/^-?\d+$/.test(value)) return 'number';
    if (/^-?\d*\.\d+$/.test(value)) return 'number';
    if (value.startsWith('"') && value.endsWith('"')) return 'string';
    if (value.startsWith('[') && value.endsWith(']')) return 'array';
    if (value.startsWith('{') && value.endsWith('}')) return 'object';
    return 'unknown';
  }

  private mapScopeType(scopeName: string): 'local' | 'global' | 'closure' {
    const lowerScope = scopeName.toLowerCase();
    if (lowerScope.includes('local') || lowerScope.includes('arguments')) return 'local';
    if (lowerScope.includes('global') || lowerScope.includes('window')) return 'global';
    if (lowerScope.includes('closure') || lowerScope.includes('block')) return 'closure';
    return 'local'; // Default to local
  }

  public async collectStackTrace(thread: vscode.DebugThread): Promise<StackFrame[]> {
    this.outputChannel.debug('Collecting stack trace from thread');
    
    try {
      // Get the debug session from the thread
      const session = (thread as any).session;
      if (!session) {
        this.outputChannel.warn('No debug session available for stack trace collection');
        return [];
      }

      // Request stack trace from debug adapter
      const stackTraceResponse = await session.customRequest('stackTrace', {
        threadId: (thread as any).id || 1,
        startFrame: 0,
        levels: 20 // Collect up to 20 stack frames
      });

      const debugFrames: DebugStackFrame[] = stackTraceResponse?.stackFrames || [];
      const stackFrames: StackFrame[] = [];

      for (const debugFrame of debugFrames) {
        const frame: StackFrame = {
          name: debugFrame.name || 'anonymous',
          file: debugFrame.source?.path || debugFrame.source?.name || 'unknown',
          line: debugFrame.line || 0,
          column: debugFrame.column || 0,
          scope: this.determineFrameScope(debugFrame.name)
        };

        stackFrames.push(frame);
      }

      this.outputChannel.debug(`Collected ${stackFrames.length} stack frames`);
      return stackFrames;

    } catch (error) {
      this.outputChannel.error(`Error collecting stack trace: ${error}`);
      return [];
    }
  }

  private determineFrameScope(frameName: string): string {
    if (!frameName) return 'unknown';
    
    // Determine scope based on frame name patterns
    if (frameName.includes('anonymous') || frameName.includes('<anonymous>')) {
      return 'anonymous';
    }
    if (frameName.includes('.') || frameName.includes('::')) {
      return 'method';
    }
    if (frameName.startsWith('async ')) {
      return 'async';
    }
    
    return 'function';
  }

  public collectConsoleOutput(output: ConsoleMessage): LogEntry {
    this.outputChannel.debug(`Collecting console output: ${output.level}`);
    
    const logEntry: LogEntry = {
      level: this.mapLogLevel(output.level),
      message: this.sanitizeMessage(output.text),
      timestamp: output.timestamp || Date.now(),
      source: 'console'
    };

    // Add to buffer for context correlation
    this.addToConsoleBuffer(logEntry);

    return logEntry;
  }

  private mapLogLevel(level: string): 'log' | 'warn' | 'error' | 'info' | 'debug' {
    const lowerLevel = level.toLowerCase();
    switch (lowerLevel) {
      case 'warning':
      case 'warn':
        return 'warn';
      case 'error':
      case 'err':
        return 'error';
      case 'information':
      case 'info':
        return 'info';
      case 'debug':
      case 'verbose':
        return 'debug';
      default:
        return 'log';
    }
  }

  private sanitizeMessage(message: string): string {
    // Remove ANSI color codes and other control characters
    const sanitized = message.replace(/\x1b\[[0-9;]*m/g, '').trim();
    
    // Redact potential sensitive information in log messages
    return this.redactSensitiveLogContent(sanitized);
  }

  private redactSensitiveLogContent(message: string): string {
    // Patterns for sensitive data in logs
    const patterns = [
      { pattern: /password[=:]\s*[^\s]+/gi, replacement: 'password=[REDACTED]' },
      { pattern: /token[=:]\s*[^\s]+/gi, replacement: 'token=[REDACTED]' },
      { pattern: /key[=:]\s*[^\s]+/gi, replacement: 'key=[REDACTED]' },
      { pattern: /authorization:\s*bearer\s+[^\s]+/gi, replacement: 'authorization: bearer [REDACTED]' },
      { pattern: /api[_-]?key[=:]\s*[^\s]+/gi, replacement: 'api_key=[REDACTED]' }
    ];

    let redactedMessage = message;
    for (const { pattern, replacement } of patterns) {
      redactedMessage = redactedMessage.replace(pattern, replacement);
    }

    return redactedMessage;
  }

  private addToConsoleBuffer(logEntry: LogEntry): void {
    this.consoleOutputBuffer.push(logEntry);
    
    // Maintain buffer size
    if (this.consoleOutputBuffer.length > this.maxConsoleBufferSize) {
      this.consoleOutputBuffer = this.consoleOutputBuffer.slice(-this.maxConsoleBufferSize);
    }
  }

  public collectException(exception: ExceptionInfo): ExceptionData {
    this.outputChannel.debug(`Collecting exception data: ${exception.name}`);
    
    const exceptionData: ExceptionData = {
      name: exception.name || 'UnknownException',
      message: this.sanitizeMessage(exception.message || 'No message provided'),
      stack: this.processStackTrace(exception.stack || ''),
      source: exception.source || 'unknown'
    };

    return exceptionData;
  }

  private processStackTrace(stack: string): string {
    if (!stack) return '';

    // Split stack trace into lines and process each
    const lines = stack.split('\n');
    const processedLines = lines.map(line => {
      // Remove file paths that might contain sensitive information
      const sanitizedLine = line.replace(/\/Users\/[^\/]+/g, '/Users/[USER]')
                               .replace(/C:\\Users\\[^\\]+/g, 'C:\\Users\\[USER]');
      return sanitizedLine;
    });

    return processedLines.join('\n');
  }

  // Utility methods for context correlation
  public getRecentConsoleOutput(maxEntries: number = 10): LogEntry[] {
    return this.consoleOutputBuffer.slice(-maxEntries);
  }

  public clearConsoleBuffer(): void {
    this.consoleOutputBuffer = [];
    this.outputChannel.debug('Console output buffer cleared');
  }

  public getConsoleOutputSince(timestamp: number): LogEntry[] {
    return this.consoleOutputBuffer.filter(entry => entry.timestamp >= timestamp);
  }

  // Source code reference collection
  public async collectSourceReferences(
    session: vscode.DebugSession,
    stackFrames: StackFrame[]
  ): Promise<string[]> {
    const sourceReferences: string[] = [];

    for (const frame of stackFrames.slice(0, 5)) { // Limit to top 5 frames
      try {
        if (frame.file && frame.file !== 'unknown') {
          const sourceContent = await this.getSourceContent(session, frame.file, frame.line);
          if (sourceContent) {
            sourceReferences.push(sourceContent);
          }
        }
      } catch (error) {
        this.outputChannel.debug(`Could not get source for ${frame.file}:${frame.line}: ${error}`);
      }
    }

    return sourceReferences;
  }

  private async getSourceContent(
    session: vscode.DebugSession,
    filePath: string,
    lineNumber: number
  ): Promise<string | null> {
    try {
      // Try to get source content from VSCode workspace
      const uri = vscode.Uri.file(filePath);
      const document = await vscode.workspace.openTextDocument(uri);
      
      // Get context around the line (5 lines before and after)
      const startLine = Math.max(0, lineNumber - 6);
      const endLine = Math.min(document.lineCount - 1, lineNumber + 4);
      
      const lines: string[] = [];
      for (let i = startLine; i <= endLine; i++) {
        const line = document.lineAt(i);
        const marker = i === lineNumber - 1 ? '>>> ' : '    ';
        lines.push(`${marker}${i + 1}: ${line.text}`);
      }
      
      return lines.join('\n');
      
    } catch (error) {
      // If we can't get from workspace, try debug adapter
      try {
        const sourceResponse = await session.customRequest('source', {
          sourceReference: 0,
          source: { path: filePath }
        });
        
        if (sourceResponse?.content) {
          const lines = sourceResponse.content.split('\n');
          const startLine = Math.max(0, lineNumber - 6);
          const endLine = Math.min(lines.length - 1, lineNumber + 4);
          
          const contextLines: string[] = [];
          for (let i = startLine; i <= endLine; i++) {
            const marker = i === lineNumber - 1 ? '>>> ' : '    ';
            contextLines.push(`${marker}${i + 1}: ${lines[i] || ''}`);
          }
          
          return contextLines.join('\n');
        }
      } catch (debugError) {
        this.outputChannel.debug(`Debug adapter source request failed: ${debugError}`);
      }
      
      return null;
    }
  }

  public async collectSourceCodeReference(file: string, line: number, contextLines: number = 5): Promise<string[]> {
    try {
      const document = await vscode.workspace.openTextDocument(file);
      const totalLines = document.lineCount;
      
      const startLine = Math.max(0, line - contextLines - 1);
      const endLine = Math.min(totalLines - 1, line + contextLines - 1);
      
      const codeLines: string[] = [];
      for (let i = startLine; i <= endLine; i++) {
        const lineText = document.lineAt(i).text;
        const lineNumber = i + 1;
        const marker = lineNumber === line ? '>>> ' : '    ';
        codeLines.push(`${marker}${lineNumber}: ${lineText}`);
      }
      
      this.outputChannel.debug(`Collected ${codeLines.length} lines of source context for ${file}:${line}`);
      return codeLines;
      
    } catch (error) {
      this.outputChannel.error(`Error collecting source code reference: ${error}`);
      return [`Error reading source file: ${file}`];
    }
  }

  public getBufferSize(): number {
    return this.consoleOutputBuffer.length;
  }
}