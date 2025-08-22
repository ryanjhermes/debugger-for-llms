import { IMiddlewareRegistry, IMiddleware, NetworkRequest, NetworkResponse, NetworkData } from '../types/interfaces';
import * as vscode from 'vscode';

export class MiddlewareRegistry implements IMiddlewareRegistry {
  private middlewares = new Map<string, IMiddleware>();

  constructor(private outputChannel: vscode.LogOutputChannel) {}

  public initialize(): void {
    this.outputChannel.info('Middleware Registry initialized');
    // TODO: Auto-register common middleware (Axios, Fetch)
    // This will be implemented in Task 5
  }

  public registerMiddleware(name: string, middleware: IMiddleware): void {
    // TODO: Implement middleware registration
    // This will be implemented in Task 5
    this.middlewares.set(name, middleware);
    this.outputChannel.info(`Middleware registered: ${name}`);
  }

  public unregisterMiddleware(name: string): void {
    // TODO: Implement middleware unregistration
    // This will be implemented in Task 5
    const middleware = this.middlewares.get(name);
    if (middleware) {
      middleware.uninstrument();
      this.middlewares.delete(name);
      this.outputChannel.info(`Middleware unregistered: ${name}`);
    }
  }

  public instrumentFramework(framework: string): void {
    // TODO: Implement framework-specific instrumentation
    // This will be implemented in Task 5
    this.outputChannel.info(`Instrumenting framework: ${framework}`);
  }

  public collectNetworkData(request: NetworkRequest, response: NetworkResponse): NetworkData {
    // TODO: Implement network data collection
    // This will be implemented in Task 5
    return {
      method: request.method,
      url: request.url,
      headers: request.headers,
      requestBody: request.body,
      responseStatus: response.status,
      responseBody: response.body,
      duration: response.duration,
      timestamp: Date.now()
    };
  }

  public dispose(): void {
    // Uninstrument all middleware
    for (const [name, middleware] of this.middlewares) {
      middleware.uninstrument();
    }
    this.middlewares.clear();
    this.outputChannel.info('Middleware Registry disposed');
  }
}