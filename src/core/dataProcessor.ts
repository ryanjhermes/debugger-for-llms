import { IDataProcessor, RawDebugContext, ProcessedContext, FilteredContext, AIReadyContext, RetentionPolicy, VariableSnapshot, LogEntry, NetworkData, StackFrame } from '../types/interfaces';
import { ConfigurationManager } from './configurationManager';
import * as vscode from 'vscode';

export interface PrivacySettings {
  redactSensitiveVariables: boolean;
  redactFileContents: boolean;
  redactNetworkData: boolean;
  maxVariableValueLength: number;
  maxStackFrames: number;
  maxConsoleEntries: number;
  sensitivityLevel: 'low' | 'medium' | 'high';
}

export interface DataAggregationStats {
  totalVariables: number;
  redactedVariables: number;
  stackFrameCount: number;
  consoleEntryCount: number;
  networkRequestCount: number;
  processingTime: number;
}

export class DataProcessor implements IDataProcessor {
  private contextHistory: Map<string, ProcessedContext[]> = new Map();
  private aggregationStats: DataAggregationStats[] = [];
  private readonly maxHistorySize = 100;

  constructor(private configurationManager: ConfigurationManager) {}

  public processContext(rawContext: RawDebugContext): ProcessedContext {
    const startTime = Date.now();
    
    // Ensure we have a complete context structure
    const processedContext: ProcessedContext = {
      sessionId: rawContext.sessionId || 'unknown',
      timestamp: rawContext.timestamp || Date.now(),
      eventType: rawContext.eventType || 'breakpoint',
      sourceLocation: rawContext.sourceLocation || {
        file: 'unknown',
        line: 0,
        column: 0
      },
      stackTrace: this.processStackTrace(rawContext.stackTrace || []),
      variables: this.processVariables(rawContext.variables || []),
      consoleOutput: this.processConsoleOutput(rawContext.consoleOutput || []),
      networkActivity: this.processNetworkActivity(rawContext.networkActivity || []),
      exception: rawContext.exception
    };

    // Add to context history for correlation
    this.addToHistory(processedContext);

    // Calculate aggregation stats
    const processingTime = Date.now() - startTime;
    this.recordAggregationStats(processedContext, processingTime);

    return processedContext;
  }

  private processStackTrace(stackTrace: StackFrame[]): StackFrame[] {
    // Sort by relevance (user code first, then libraries)
    const sortedFrames = [...stackTrace].sort((a, b) => {
      const aIsUserCode = this.isUserCode(a.file);
      const bIsUserCode = this.isUserCode(b.file);
      
      if (aIsUserCode && !bIsUserCode) return -1;
      if (!aIsUserCode && bIsUserCode) return 1;
      return 0;
    });

    // Enhance with additional context
    return sortedFrames.map(frame => ({
      ...frame,
      scope: this.enhanceFrameScope(frame)
    }));
  }

  private processVariables(variables: VariableSnapshot[]): VariableSnapshot[] {
    // Group variables by scope for better organization
    const scopeGroups = {
      local: variables.filter(v => v.scope === 'local'),
      closure: variables.filter(v => v.scope === 'closure'),
      global: variables.filter(v => v.scope === 'global')
    };

    // Process each group and flatten back
    const processedVariables: VariableSnapshot[] = [];
    
    Object.entries(scopeGroups).forEach(([scope, vars]) => {
      const processed = vars
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(variable => this.enhanceVariable(variable));
      processedVariables.push(...processed);
    });

    return processedVariables;
  }

  private processConsoleOutput(consoleOutput: LogEntry[]): LogEntry[] {
    // Sort by timestamp and add correlation IDs
    return consoleOutput
      .sort((a, b) => a.timestamp - b.timestamp)
      .map((entry, index) => ({
        ...entry,
        source: entry.source || 'console',
        correlationId: `console_${index}_${entry.timestamp}`
      }));
  }

  private processNetworkActivity(networkActivity: NetworkData[]): NetworkData[] {
    // Sort by timestamp and enhance with additional metadata
    return networkActivity
      .sort((a, b) => a.timestamp - b.timestamp)
      .map(activity => ({
        ...activity,
        domain: this.extractDomain(activity.url),
        isExternal: this.isExternalRequest(activity.url),
        category: this.categorizeNetworkRequest(activity)
      }));
  }

  private isUserCode(filePath: string): boolean {
    const userCodePatterns = [
      /^(?!.*node_modules)/,
      /^(?!.*\.vscode)/,
      /^(?!.*internal)/
    ];
    
    return userCodePatterns.some(pattern => pattern.test(filePath));
  }

  private enhanceFrameScope(frame: StackFrame): string {
    if (frame.file.includes('node_modules')) {
      return 'external_library';
    } else if (frame.file.includes('internal') || frame.file.includes('builtin')) {
      return 'runtime_internal';
    } else if (this.isUserCode(frame.file)) {
      return 'user_code';
    }
    return frame.scope || 'unknown';
  }

  private enhanceVariable(variable: VariableSnapshot): VariableSnapshot {
    return {
      ...variable,
      valueType: this.determineValueType(variable.value),
      isComplex: this.isComplexValue(variable.value),
      size: this.calculateValueSize(variable.value)
    };
  }

  private determineValueType(value: any): string {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (Array.isArray(value)) return 'array';
    if (value instanceof Date) return 'date';
    if (value instanceof RegExp) return 'regexp';
    return typeof value;
  }

  private isComplexValue(value: any): boolean {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private calculateValueSize(value: any): number {
    try {
      return JSON.stringify(value).length;
    } catch {
      return String(value).length;
    }
  }

  private extractDomain(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return 'unknown';
    }
  }

  private isExternalRequest(url: string): boolean {
    const externalPatterns = [
      /^https?:\/\/(?!localhost|127\.0\.0\.1|0\.0\.0\.0)/,
      /^https?:\/\/.*\.com/,
      /^https?:\/\/.*\.org/,
      /^https?:\/\/.*\.net/
    ];
    
    return externalPatterns.some(pattern => pattern.test(url));
  }

  private categorizeNetworkRequest(activity: NetworkData): string {
    const url = activity.url.toLowerCase();
    
    if (url.includes('/api/')) return 'api';
    if (url.includes('/graphql')) return 'graphql';
    if (url.includes('/auth')) return 'authentication';
    if (url.includes('/upload') || url.includes('/download')) return 'file_transfer';
    if (activity.method === 'GET' && url.includes('/static/')) return 'static_resource';
    
    return 'general';
  }

  private addToHistory(context: ProcessedContext): void {
    const sessionHistory = this.contextHistory.get(context.sessionId) || [];
    sessionHistory.push(context);
    
    // Maintain history size limit
    if (sessionHistory.length > this.maxHistorySize) {
      sessionHistory.shift();
    }
    
    this.contextHistory.set(context.sessionId, sessionHistory);
  }

  private recordAggregationStats(context: ProcessedContext, processingTime: number): void {
    const stats: DataAggregationStats = {
      totalVariables: context.variables.length,
      redactedVariables: context.variables.filter(v => v.isRedacted).length,
      stackFrameCount: context.stackTrace.length,
      consoleEntryCount: context.consoleOutput.length,
      networkRequestCount: context.networkActivity.length,
      processingTime
    };
    
    this.aggregationStats.push(stats);
    
    // Keep only recent stats
    if (this.aggregationStats.length > 1000) {
      this.aggregationStats = this.aggregationStats.slice(-500);
    }
  }

  public applyPrivacyFilters(context: ProcessedContext): FilteredContext {
    const privacySettings = this.getPrivacySettings();
    
    const filteredContext: FilteredContext = {
      ...context,
      variables: this.filterVariables(context.variables, privacySettings),
      consoleOutput: this.filterConsoleOutput(context.consoleOutput, privacySettings),
      networkActivity: this.filterNetworkActivity(context.networkActivity, privacySettings),
      stackTrace: this.filterStackTrace(context.stackTrace, privacySettings),
      sourceLocation: this.filterSourceLocation(context.sourceLocation, privacySettings)
    };

    return filteredContext;
  }

  private getPrivacySettings(): PrivacySettings {
    // Get settings from configuration manager
    const config = vscode.workspace.getConfiguration('debuggerForLLMs');
    
    return {
      redactSensitiveVariables: config.get('privacy.redactSensitiveVariables', true),
      redactFileContents: config.get('privacy.redactFileContents', false),
      redactNetworkData: config.get('privacy.redactNetworkData', true),
      maxVariableValueLength: config.get('privacy.maxVariableValueLength', 1000),
      maxStackFrames: config.get('privacy.maxStackFrames', 20),
      maxConsoleEntries: config.get('privacy.maxConsoleEntries', 50),
      sensitivityLevel: config.get('privacy.sensitivityLevel', 'medium')
    };
  }

  private filterVariables(variables: VariableSnapshot[], settings: PrivacySettings): VariableSnapshot[] {
    if (!settings.redactSensitiveVariables) {
      return variables;
    }

    return variables.map(variable => {
      const filtered = { ...variable };
      
      // Apply sensitive data patterns
      if (this.isSensitiveVariable(variable.name, variable.value, settings.sensitivityLevel)) {
        filtered.value = '[REDACTED]';
        filtered.isRedacted = true;
      }
      
      // Truncate long values
      if (typeof filtered.value === 'string' && filtered.value.length > settings.maxVariableValueLength) {
        filtered.value = filtered.value.substring(0, settings.maxVariableValueLength) + '... [TRUNCATED]';
      }
      
      // Handle complex objects
      if (this.isComplexValue(filtered.value) && !filtered.isRedacted) {
        filtered.value = this.sanitizeComplexValue(filtered.value, settings);
      }
      
      return filtered;
    });
  }

  private isSensitiveVariable(name: string, value: any, sensitivityLevel: string): boolean {
    const sensitivePatterns = this.getSensitivePatterns(sensitivityLevel);
    
    // Check variable name
    const nameIsSensitive = sensitivePatterns.some(pattern => pattern.test(name));
    
    // Check variable value if it's a string
    const valueIsSensitive = typeof value === 'string' && 
      sensitivePatterns.some(pattern => pattern.test(value));
    
    return nameIsSensitive || valueIsSensitive;
  }

  private getSensitivePatterns(sensitivityLevel: string): RegExp[] {
    const basePatterns = [
      /password/i,
      /secret/i,
      /token/i,
      /key/i,
      /auth/i,
      /credential/i,
      /api[_-]?key/i
    ];

    const mediumPatterns = [
      ...basePatterns,
      /email/i,
      /phone/i,
      /ssn/i,
      /social/i
    ];

    const highPatterns = [
      ...mediumPatterns,
      /name/i,
      /address/i,
      /id/i,
      /user/i,
      /account/i
    ];

    switch (sensitivityLevel) {
      case 'high': return highPatterns;
      case 'medium': return mediumPatterns;
      case 'low': return basePatterns;
      default: return mediumPatterns;
    }
  }

  private sanitizeComplexValue(value: any, settings: PrivacySettings): any {
    if (Array.isArray(value)) {
      return value.slice(0, 10).map(item => 
        typeof item === 'object' ? this.sanitizeComplexValue(item, settings) : item
      );
    }
    
    if (typeof value === 'object' && value !== null) {
      const sanitized: any = {};
      const keys = Object.keys(value).slice(0, 20); // Limit object keys
      
      for (const key of keys) {
        if (this.isSensitiveVariable(key, value[key], settings.sensitivityLevel)) {
          sanitized[key] = '[REDACTED]';
        } else {
          sanitized[key] = value[key];
        }
      }
      
      return sanitized;
    }
    
    return value;
  }

  private filterConsoleOutput(consoleOutput: LogEntry[], settings: PrivacySettings): LogEntry[] {
    const filtered = consoleOutput.slice(-settings.maxConsoleEntries);
    
    return filtered.map(entry => ({
      ...entry,
      message: this.sanitizeLogMessage(entry.message, settings)
    }));
  }

  private sanitizeLogMessage(message: string, settings: PrivacySettings): string {
    if (!settings.redactSensitiveVariables) {
      return message;
    }

    const sensitivePatterns = this.getSensitivePatterns(settings.sensitivityLevel);
    let sanitized = message;
    
    // Replace sensitive patterns in log messages
    for (const pattern of sensitivePatterns) {
      sanitized = sanitized.replace(new RegExp(`(${pattern.source})[=:]\\s*[^\\s]+`, 'gi'), '$1=[REDACTED]');
    }
    
    return sanitized;
  }

  private filterNetworkActivity(networkActivity: NetworkData[], settings: PrivacySettings): NetworkData[] {
    if (!settings.redactNetworkData) {
      return networkActivity;
    }

    return networkActivity.map(activity => ({
      ...activity,
      headers: this.sanitizeHeaders(activity.headers),
      requestBody: this.sanitizeRequestBody(activity.requestBody),
      responseBody: this.sanitizeResponseBody(activity.responseBody)
    }));
  }

  private sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
    const sanitized: Record<string, string> = {};
    const sensitiveHeaderPatterns = [
      /authorization/i,
      /cookie/i,
      /x-api-key/i,
      /x-auth/i,
      /bearer/i
    ];
    
    for (const [key, value] of Object.entries(headers)) {
      const isSensitive = sensitiveHeaderPatterns.some(pattern => pattern.test(key));
      sanitized[key] = isSensitive ? '[REDACTED]' : value;
    }
    
    return sanitized;
  }

  private sanitizeRequestBody(body: any): any {
    if (!body) return body;
    
    if (typeof body === 'object') {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(body)) {
        if (this.isSensitiveVariable(key, value, 'medium')) {
          sanitized[key] = '[REDACTED]';
        } else {
          sanitized[key] = value;
        }
      }
      return sanitized;
    }
    
    return body;
  }

  private sanitizeResponseBody(body: any): any {
    // Similar to request body but more permissive
    if (!body) return body;
    
    if (typeof body === 'object' && body.token) {
      return { ...body, token: '[REDACTED]' };
    }
    
    return body;
  }

  private filterStackTrace(stackTrace: StackFrame[], settings: PrivacySettings): StackFrame[] {
    const filtered = stackTrace.slice(0, settings.maxStackFrames);
    
    if (!settings.redactFileContents) {
      return filtered;
    }
    
    return filtered.map(frame => ({
      ...frame,
      file: this.sanitizeFilePath(frame.file)
    }));
  }

  private sanitizeFilePath(filePath: string): string {
    // Replace user-specific paths with generic ones
    return filePath
      .replace(/\/Users\/[^\/]+/g, '/Users/[USER]')
      .replace(/\/home\/[^\/]+/g, '/home/[USER]')
      .replace(/C:\\Users\\[^\\]+/g, 'C:\\Users\\[USER]');
  }

  private filterSourceLocation(sourceLocation: any, settings: PrivacySettings): any {
    if (!settings.redactFileContents) {
      return sourceLocation;
    }
    
    return {
      ...sourceLocation,
      file: this.sanitizeFilePath(sourceLocation.file)
    };
  }

  public structureForAI(context: FilteredContext): AIReadyContext {
    const language = this.detectLanguage(context.sourceLocation.file);
    const framework = this.detectFramework(context);
    
    return {
      summary: this.generateContextSummary(context),
      errorDescription: this.generateErrorDescription(context),
      codeContext: {
        language,
        framework,
        relevantCode: this.extractRelevantCode(context)
      },
      runtimeState: {
        variables: this.prioritizeVariables(context.variables),
        stackTrace: this.prioritizeStackFrames(context.stackTrace),
        networkActivity: this.prioritizeNetworkActivity(context.networkActivity)
      },
      userQuery: this.generateImplicitQuery(context)
    };
  }

  private generateContextSummary(context: FilteredContext): string {
    const parts = [];
    
    parts.push(`${context.eventType} event in ${context.sourceLocation.file}:${context.sourceLocation.line}`);
    
    if (context.exception) {
      parts.push(`Exception: ${context.exception.name} - ${context.exception.message}`);
    }
    
    if (context.variables.length > 0) {
      parts.push(`${context.variables.length} variables captured`);
    }
    
    if (context.networkActivity.length > 0) {
      parts.push(`${context.networkActivity.length} network requests`);
    }
    
    return parts.join('. ');
  }

  private generateErrorDescription(context: FilteredContext): string | undefined {
    if (context.exception) {
      return `${context.exception.name}: ${context.exception.message}`;
    }
    
    // Look for error patterns in console output
    const errorLogs = context.consoleOutput.filter(log => log.level === 'error');
    if (errorLogs.length > 0) {
      return errorLogs[0].message;
    }
    
    return undefined;
  }

  private detectLanguage(filePath: string): string {
    const extension = filePath.split('.').pop()?.toLowerCase();
    
    const languageMap: Record<string, string> = {
      'ts': 'typescript',
      'js': 'javascript',
      'py': 'python',
      'java': 'java',
      'cs': 'csharp',
      'cpp': 'cpp',
      'c': 'c',
      'go': 'go',
      'rs': 'rust',
      'php': 'php',
      'rb': 'ruby'
    };
    
    return languageMap[extension || ''] || 'unknown';
  }

  private detectFramework(context: FilteredContext): string | undefined {
    // Analyze stack trace and network activity to detect framework
    const stackFiles = context.stackTrace.map(frame => frame.file.toLowerCase());
    const networkUrls = context.networkActivity.map(activity => activity.url.toLowerCase());
    
    // Check for common frameworks
    if (stackFiles.some(file => file.includes('react'))) return 'React';
    if (stackFiles.some(file => file.includes('angular'))) return 'Angular';
    if (stackFiles.some(file => file.includes('vue'))) return 'Vue.js';
    if (stackFiles.some(file => file.includes('express'))) return 'Express.js';
    if (stackFiles.some(file => file.includes('next'))) return 'Next.js';
    if (networkUrls.some(url => url.includes('graphql'))) return 'GraphQL';
    
    return undefined;
  }

  private extractRelevantCode(context: FilteredContext): string[] {
    // This would typically read source files around the error location
    // For now, return stack trace information as code context
    return context.stackTrace.slice(0, 5).map(frame => 
      `${frame.name} at ${frame.file}:${frame.line}:${frame.column}`
    );
  }

  private prioritizeVariables(variables: VariableSnapshot[]): VariableSnapshot[] {
    // Sort variables by relevance: local first, then by name
    return variables
      .sort((a, b) => {
        if (a.scope === 'local' && b.scope !== 'local') return -1;
        if (a.scope !== 'local' && b.scope === 'local') return 1;
        return a.name.localeCompare(b.name);
      })
      .slice(0, 20); // Limit for AI processing
  }

  private prioritizeStackFrames(stackTrace: StackFrame[]): StackFrame[] {
    // User code frames first, then libraries
    return stackTrace
      .sort((a, b) => {
        const aIsUser = this.isUserCode(a.file);
        const bIsUser = this.isUserCode(b.file);
        
        if (aIsUser && !bIsUser) return -1;
        if (!aIsUser && bIsUser) return 1;
        return 0;
      })
      .slice(0, 10); // Limit for AI processing
  }

  private prioritizeNetworkActivity(networkActivity: NetworkData[]): NetworkData[] {
    // Sort by relevance: errors first, then by recency
    return networkActivity
      .sort((a, b) => {
        if (a.responseStatus >= 400 && b.responseStatus < 400) return -1;
        if (a.responseStatus < 400 && b.responseStatus >= 400) return 1;
        return b.timestamp - a.timestamp;
      })
      .slice(0, 5); // Limit for AI processing
  }

  private generateImplicitQuery(context: FilteredContext): string | undefined {
    if (context.exception) {
      return `How can I fix this ${context.exception.name}: ${context.exception.message}?`;
    }
    
    if (context.eventType === 'breakpoint') {
      return 'What might be causing issues at this breakpoint?';
    }
    
    return undefined;
  }

  public cleanupOldData(retentionPolicy: RetentionPolicy): void {
    const cutoffTime = Date.now() - retentionPolicy.maxAge;
    
    // Clean up context history
    for (const [sessionId, contexts] of this.contextHistory.entries()) {
      const filteredContexts = contexts.filter(context => context.timestamp > cutoffTime);
      
      if (filteredContexts.length === 0) {
        this.contextHistory.delete(sessionId);
      } else {
        // Also apply size limit
        const sizeLimit = Math.floor(retentionPolicy.maxSize / this.contextHistory.size);
        this.contextHistory.set(sessionId, filteredContexts.slice(-sizeLimit));
      }
    }
    
    // Clean up aggregation stats
    this.aggregationStats = this.aggregationStats.filter(stat => 
      Date.now() - stat.processingTime < retentionPolicy.maxAge
    );
  }

  public getAggregationStats(): DataAggregationStats[] {
    return [...this.aggregationStats];
  }

  public getContextHistory(sessionId: string): ProcessedContext[] {
    return this.contextHistory.get(sessionId) || [];
  }

  public clearContextHistory(sessionId?: string): void {
    if (sessionId) {
      this.contextHistory.delete(sessionId);
    } else {
      this.contextHistory.clear();
    }
  }
}