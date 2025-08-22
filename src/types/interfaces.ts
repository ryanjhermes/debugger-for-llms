import * as vscode from 'vscode';

// Core Debug Context Types
export interface DebugContext {
  sessionId: string;
  timestamp: number;
  eventType: 'breakpoint' | 'exception' | 'step' | 'console';
  sourceLocation: {
    file: string;
    line: number;
    column: number;
  };
  stackTrace: StackFrame[];
  variables: VariableSnapshot[];
  consoleOutput: LogEntry[];
  networkActivity: NetworkData[];
  exception?: ExceptionInfo;
}

export interface StackFrame {
  name: string;
  file: string;
  line: number;
  column: number;
  scope: string;
}

export interface VariableSnapshot {
  name: string;
  value: any;
  type: string;
  scope: 'local' | 'global' | 'closure';
  isRedacted: boolean;
  valueType?: string;
  isComplex?: boolean;
  size?: number;
}

export interface LogEntry {
  level: 'log' | 'warn' | 'error' | 'info' | 'debug';
  message: string;
  timestamp: number;
  source?: string;
  correlationId?: string;
}

export interface NetworkData {
  method: string;
  url: string;
  headers: Record<string, string>;
  requestBody?: any;
  responseStatus: number;
  responseBody?: any;
  duration: number;
  timestamp: number;
  domain?: string;
  isExternal?: boolean;
  category?: string;
}

export interface ExceptionInfo {
  name: string;
  message: string;
  stack: string;
  source?: string;
}

// AI Integration Types
export interface AIReadyContext {
  summary: string;
  errorDescription?: string;
  codeContext: {
    language: string;
    framework?: string;
    relevantCode: string[];
  };
  runtimeState: {
    variables: VariableSnapshot[];
    stackTrace: StackFrame[];
    networkActivity: NetworkData[];
  };
  userQuery?: string;
}

export interface DiagnosticResponse {
  analysis: string;
  suggestedFixes: string[];
  confidence: number;
  relatedDocumentation: string[];
  followUpQuestions: string[];
}

export interface AIProvider {
  name: string;
  apiKey: string;
  baseUrl?: string;
  model?: string;
}

// Component Interfaces
export interface IDebugSessionManager {
  startSession(session: vscode.DebugSession): void;
  stopSession(session: vscode.DebugSession): void;
  onBreakpoint(event: DebugBreakpointEvent): Promise<void>;
  onException(event: DebugExceptionEvent): Promise<void>;
  onStepComplete(event: DebugStepEvent): Promise<void>;
}

export interface IContextCollector {
  collectVariables(frame: vscode.DebugStackFrame): Promise<VariableSnapshot[]>;
  collectStackTrace(thread: vscode.DebugThread): Promise<StackFrame[]>;
  collectConsoleOutput(output: ConsoleMessage): LogEntry;
  collectException(exception: ExceptionInfo): ExceptionData;
}

export interface IMiddlewareRegistry {
  registerMiddleware(name: string, middleware: IMiddleware): void;
  unregisterMiddleware(name: string): void;
  instrumentFramework(framework: string): void;
  collectNetworkData(request: NetworkRequest, response: NetworkResponse): NetworkData;
}

export interface IDataProcessor {
  processContext(rawContext: RawDebugContext): ProcessedContext;
  applyPrivacyFilters(context: ProcessedContext): FilteredContext;
  structureForAI(context: FilteredContext): AIReadyContext;
  cleanupOldData(retentionPolicy: RetentionPolicy): void;
  getContextHistory(sessionId: string): ProcessedContext[];
  clearContextHistory(sessionId?: string): void;
}

export interface IAIServiceClient {
  sendDiagnosticRequest(context: AIReadyContext, provider: AIProvider): Promise<DiagnosticResponse>;
  configureProvider(provider: AIProvider, config: ProviderConfig): void;
  testConnection(provider: AIProvider): Promise<boolean>;
}

export interface IUIController {
  showInsights(insights: DiagnosticInsights): void;
  updateStatus(status: ExtensionStatus): void;
  showConfiguration(): void;
  toggleAIMode(enabled: boolean): void;
}

// Event Types
export interface DebugBreakpointEvent {
  session: vscode.DebugSession;
  thread: vscode.DebugThread;
  stackFrame?: vscode.DebugStackFrame;
}

export interface DebugExceptionEvent {
  session: vscode.DebugSession;
  thread: vscode.DebugThread;
  exception: ExceptionInfo;
}

export interface DebugStepEvent {
  session: vscode.DebugSession;
  thread: vscode.DebugThread;
  stepType: 'stepIn' | 'stepOut' | 'stepOver' | 'continue';
}

// Utility Types
export interface ConsoleMessage {
  level: string;
  text: string;
  timestamp: number;
}

export interface NetworkRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: any;
}

export interface NetworkResponse {
  status: number;
  headers: Record<string, string>;
  body?: any;
  duration: number;
}

export interface RawDebugContext extends Partial<DebugContext> {}
export interface ProcessedContext extends DebugContext {}
export interface FilteredContext extends DebugContext {}
export interface ExceptionData extends ExceptionInfo {}
export interface DiagnosticInsights extends DiagnosticResponse {}

export interface RetentionPolicy {
  maxAge: number;
  maxSize: number;
}

export interface ProviderConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  timeout?: number;
}

export interface ExtensionStatus {
  aiModeEnabled: boolean;
  activeProvider?: string;
  lastAnalysis?: Date;
  contextCount: number;
}

export interface IMiddleware {
  name: string;
  instrument(): void;
  uninstrument(): void;
  onRequest(request: NetworkRequest): void;
  onResponse(response: NetworkResponse): void;
}