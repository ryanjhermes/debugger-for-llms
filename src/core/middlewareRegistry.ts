import { IMiddlewareRegistry, IMiddleware, NetworkRequest, NetworkResponse, NetworkData } from '../types/interfaces';
import * as vscode from 'vscode';

export interface MiddlewareConfig {
  enabled: boolean;
  captureRequestBody: boolean;
  captureResponseBody: boolean;
  maxBodySize: number;
  excludeUrls: string[];
  includeHeaders: string[];
}

export interface NetworkActivityEvent {
  request: NetworkRequest;
  response?: NetworkResponse;
  error?: Error;
  timestamp: number;
  duration?: number;
}

export class MiddlewareRegistry implements IMiddlewareRegistry {
  private middlewares = new Map<string, IMiddleware>();
  private networkActivityBuffer: NetworkData[] = [];
  private readonly maxBufferSize = 1000;
  private config: MiddlewareConfig;
  private eventListeners: ((event: NetworkActivityEvent) => void)[] = [];

  constructor(private outputChannel: vscode.LogOutputChannel) {
    this.config = this.getDefaultConfig();
  }

  public initialize(): void {
    this.outputChannel.info('Middleware Registry initialized');
    
    // Load configuration from VSCode settings
    this.loadConfiguration();
    
    // Auto-register common middleware
    this.autoRegisterMiddleware();
    
    // Set up configuration change listener
    vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration('debuggerForLLMs.middleware')) {
        this.loadConfiguration();
        this.outputChannel.debug('Middleware configuration updated');
      }
    });
  }

  private getDefaultConfig(): MiddlewareConfig {
    return {
      enabled: true,
      captureRequestBody: true,
      captureResponseBody: true,
      maxBodySize: 10000, // 10KB limit
      excludeUrls: [
        'chrome-extension://',
        'vscode-webview://',
        'data:',
        'blob:'
      ],
      includeHeaders: [
        'content-type',
        'authorization',
        'x-api-key',
        'user-agent'
      ]
    };
  }

  private loadConfiguration(): void {
    const config = vscode.workspace.getConfiguration('debuggerForLLMs.middleware');
    
    this.config = {
      enabled: config.get('enabled', this.config.enabled),
      captureRequestBody: config.get('captureRequestBody', this.config.captureRequestBody),
      captureResponseBody: config.get('captureResponseBody', this.config.captureResponseBody),
      maxBodySize: config.get('maxBodySize', this.config.maxBodySize),
      excludeUrls: config.get('excludeUrls', this.config.excludeUrls),
      includeHeaders: config.get('includeHeaders', this.config.includeHeaders)
    };
    
    this.outputChannel.debug(`Middleware configuration loaded: ${JSON.stringify(this.config)}`);
  }

  private autoRegisterMiddleware(): void {
    if (!this.config.enabled) {
      this.outputChannel.debug('Middleware disabled by configuration');
      return;
    }

    // Register Axios interceptor
    this.registerMiddleware('axios', new AxiosMiddleware(this.outputChannel, this));
    
    // Register Fetch API interceptor
    this.registerMiddleware('fetch', new FetchMiddleware(this.outputChannel, this));
    
    // Register XMLHttpRequest interceptor
    this.registerMiddleware('xhr', new XHRMiddleware(this.outputChannel, this));
    
    this.outputChannel.info('Auto-registered common HTTP middleware');
  }

  public registerMiddleware(name: string, middleware: IMiddleware): void {
    if (this.middlewares.has(name)) {
      this.outputChannel.warn(`Middleware ${name} already registered, replacing`);
      this.unregisterMiddleware(name);
    }

    this.middlewares.set(name, middleware);
    
    try {
      middleware.instrument();
      this.outputChannel.info(`Middleware registered and instrumented: ${name}`);
    } catch (error) {
      this.outputChannel.error(`Failed to instrument middleware ${name}: ${error}`);
      this.middlewares.delete(name);
    }
  }

  public unregisterMiddleware(name: string): void {
    const middleware = this.middlewares.get(name);
    if (middleware) {
      try {
        middleware.uninstrument();
        this.middlewares.delete(name);
        this.outputChannel.info(`Middleware unregistered: ${name}`);
      } catch (error) {
        this.outputChannel.error(`Failed to uninstrument middleware ${name}: ${error}`);
      }
    } else {
      this.outputChannel.warn(`Middleware ${name} not found for unregistration`);
    }
  }

  public instrumentFramework(framework: string): void {
    this.outputChannel.info(`Instrumenting framework: ${framework}`);
    
    const frameworkInstrumentors = {
      'react': () => this.instrumentReact(),
      'angular': () => this.instrumentAngular(),
      'vue': () => this.instrumentVue(),
      'express': () => this.instrumentExpress(),
      'nextjs': () => this.instrumentNextJS()
    };

    const instrumentor = frameworkInstrumentors[framework.toLowerCase() as keyof typeof frameworkInstrumentors];
    if (instrumentor) {
      try {
        instrumentor();
        this.outputChannel.info(`Successfully instrumented ${framework}`);
      } catch (error) {
        this.outputChannel.error(`Failed to instrument ${framework}: ${error}`);
      }
    } else {
      this.outputChannel.warn(`No instrumentor available for framework: ${framework}`);
    }
  }

  private instrumentReact(): void {
    // React-specific instrumentation
    this.outputChannel.debug('Setting up React instrumentation');
    // This would hook into React DevTools or component lifecycle
  }

  private instrumentAngular(): void {
    // Angular-specific instrumentation
    this.outputChannel.debug('Setting up Angular instrumentation');
    // This would hook into Angular's HTTP client
  }

  private instrumentVue(): void {
    // Vue.js-specific instrumentation
    this.outputChannel.debug('Setting up Vue.js instrumentation');
    // This would hook into Vue's HTTP libraries
  }

  private instrumentExpress(): void {
    // Express.js-specific instrumentation
    this.outputChannel.debug('Setting up Express.js instrumentation');
    // This would hook into Express middleware
  }

  private instrumentNextJS(): void {
    // Next.js-specific instrumentation
    this.outputChannel.debug('Setting up Next.js instrumentation');
    // This would hook into Next.js API routes and SSR
  }

  public collectNetworkData(request: NetworkRequest, response: NetworkResponse): NetworkData {
    const networkData: NetworkData = {
      method: request.method,
      url: request.url,
      headers: this.filterHeaders(request.headers),
      requestBody: this.filterBody(request.body, 'request'),
      responseStatus: response.status,
      responseBody: this.filterBody(response.body, 'response'),
      duration: response.duration,
      timestamp: Date.now(),
      domain: this.extractDomain(request.url),
      isExternal: this.isExternalRequest(request.url),
      category: this.categorizeRequest(request)
    };

    // Add to buffer
    this.addToBuffer(networkData);
    
    // Notify listeners
    this.notifyListeners({
      request,
      response,
      timestamp: networkData.timestamp,
      duration: response.duration
    });

    return networkData;
  }

  private filterHeaders(headers: Record<string, string>): Record<string, string> {
    const filtered: Record<string, string> = {};
    
    for (const [key, value] of Object.entries(headers)) {
      const lowerKey = key.toLowerCase();
      if (this.config.includeHeaders.includes(lowerKey)) {
        // Redact sensitive headers
        if (lowerKey.includes('authorization') || lowerKey.includes('key') || lowerKey.includes('token')) {
          filtered[key] = '[REDACTED]';
        } else {
          filtered[key] = value;
        }
      }
    }
    
    return filtered;
  }

  private filterBody(body: any, type: 'request' | 'response'): any {
    const shouldCapture = type === 'request' ? this.config.captureRequestBody : this.config.captureResponseBody;
    
    if (!shouldCapture || !body) {
      return undefined;
    }

    // Convert to string for size checking
    const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
    
    if (bodyStr.length > this.config.maxBodySize) {
      return `[TRUNCATED: Body too large (${bodyStr.length} bytes)]`;
    }

    // Redact sensitive data in body
    if (typeof body === 'object') {
      return this.redactSensitiveData(body);
    }

    return body;
  }

  private redactSensitiveData(obj: any): any {
    if (Array.isArray(obj)) {
      return obj.map(item => this.redactSensitiveData(item));
    }

    if (typeof obj === 'object' && obj !== null) {
      const redacted: any = {};
      for (const [key, value] of Object.entries(obj)) {
        const lowerKey = key.toLowerCase();
        if (lowerKey.includes('password') || lowerKey.includes('token') || 
            lowerKey.includes('secret') || lowerKey.includes('key')) {
          redacted[key] = '[REDACTED]';
        } else if (typeof value === 'object') {
          redacted[key] = this.redactSensitiveData(value);
        } else {
          redacted[key] = value;
        }
      }
      return redacted;
    }

    return obj;
  }

  private extractDomain(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return 'unknown';
    }
  }

  private isExternalRequest(url: string): boolean {
    // Check if URL should be excluded
    if (this.config.excludeUrls.some(pattern => url.startsWith(pattern))) {
      return false;
    }

    try {
      const urlObj = new URL(url);
      return !['localhost', '127.0.0.1', '0.0.0.0'].includes(urlObj.hostname);
    } catch {
      return false;
    }
  }

  private categorizeRequest(request: NetworkRequest): string {
    const url = request.url.toLowerCase();
    const method = request.method.toUpperCase();

    if (url.includes('/api/')) return 'api';
    if (url.includes('/graphql')) return 'graphql';
    if (url.includes('/auth') || url.includes('/login')) return 'authentication';
    if (method === 'POST' && url.includes('/upload')) return 'file_upload';
    if (method === 'GET' && (url.includes('.js') || url.includes('.css') || url.includes('.png'))) return 'static_resource';
    if (url.includes('/websocket') || url.includes('/ws/')) return 'websocket';

    return 'general';
  }

  private addToBuffer(networkData: NetworkData): void {
    this.networkActivityBuffer.push(networkData);
    
    // Maintain buffer size
    if (this.networkActivityBuffer.length > this.maxBufferSize) {
      this.networkActivityBuffer = this.networkActivityBuffer.slice(-this.maxBufferSize);
    }
  }

  private notifyListeners(event: NetworkActivityEvent): void {
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch (error) {
        this.outputChannel.error(`Error in network activity listener: ${error}`);
      }
    }
  }

  public addEventListener(listener: (event: NetworkActivityEvent) => void): void {
    this.eventListeners.push(listener);
  }

  public removeEventListener(listener: (event: NetworkActivityEvent) => void): void {
    const index = this.eventListeners.indexOf(listener);
    if (index > -1) {
      this.eventListeners.splice(index, 1);
    }
  }

  public getRecentNetworkActivity(count: number = 50): NetworkData[] {
    return this.networkActivityBuffer.slice(-count);
  }

  public clearNetworkBuffer(): void {
    this.networkActivityBuffer = [];
    this.outputChannel.debug('Network activity buffer cleared');
  }

  public getRegisteredMiddleware(): string[] {
    return Array.from(this.middlewares.keys());
  }

  public dispose(): void {
    // Uninstrument all middleware
    for (const [name, middleware] of this.middlewares) {
      try {
        middleware.uninstrument();
      } catch (error) {
        this.outputChannel.error(`Error uninstrumenting middleware ${name}: ${error}`);
      }
    }
    
    this.middlewares.clear();
    this.networkActivityBuffer = [];
    this.eventListeners = [];
    
    this.outputChannel.info('Middleware Registry disposed');
  }
}

// Axios Middleware Implementation
export class AxiosMiddleware implements IMiddleware {
  public readonly name = 'axios';
  private originalAxios: any;
  private isInstrumented = false;

  constructor(
    private outputChannel: vscode.LogOutputChannel,
    private registry: MiddlewareRegistry
  ) {}

  public instrument(): void {
    if (this.isInstrumented) {
      return;
    }

    try {
      // Try to access axios from global scope or require it
      const axios = this.getAxiosInstance();
      if (!axios) {
        this.outputChannel.debug('Axios not found, skipping instrumentation');
        return;
      }

      this.originalAxios = axios;
      
      // Add request interceptor
      axios.interceptors.request.use(
        (config: any) => {
          config._debugStartTime = Date.now();
          return config;
        },
        (error: any) => {
          this.outputChannel.error(`Axios request error: ${error}`);
          return Promise.reject(error);
        }
      );

      // Add response interceptor
      axios.interceptors.response.use(
        (response: any) => {
          this.handleAxiosResponse(response);
          return response;
        },
        (error: any) => {
          this.handleAxiosError(error);
          return Promise.reject(error);
        }
      );

      this.isInstrumented = true;
      this.outputChannel.debug('Axios middleware instrumented successfully');
    } catch (error) {
      this.outputChannel.error(`Failed to instrument Axios: ${error}`);
    }
  }

  private getAxiosInstance(): any {
    try {
      // Try different ways to access axios
      if (typeof globalThis !== 'undefined' && (globalThis as any).axios) {
        return (globalThis as any).axios;
      }
      
      // Try to require axios (Node.js environment)
      return require('axios');
    } catch {
      return null;
    }
  }

  private handleAxiosResponse(response: any): void {
    const config = response.config;
    const duration = Date.now() - (config._debugStartTime || Date.now());

    const request: NetworkRequest = {
      method: config.method?.toUpperCase() || 'GET',
      url: config.url || '',
      headers: config.headers || {},
      body: config.data
    };

    const networkResponse: NetworkResponse = {
      status: response.status,
      headers: response.headers || {},
      body: response.data,
      duration
    };

    this.registry.collectNetworkData(request, networkResponse);
  }

  private handleAxiosError(error: any): void {
    const config = error.config;
    if (!config) return;

    const duration = Date.now() - (config._debugStartTime || Date.now());

    const request: NetworkRequest = {
      method: config.method?.toUpperCase() || 'GET',
      url: config.url || '',
      headers: config.headers || {},
      body: config.data
    };

    const networkResponse: NetworkResponse = {
      status: error.response?.status || 0,
      headers: error.response?.headers || {},
      body: error.response?.data || error.message,
      duration
    };

    this.registry.collectNetworkData(request, networkResponse);
  }

  public uninstrument(): void {
    if (!this.isInstrumented || !this.originalAxios) {
      return;
    }

    try {
      // Clear interceptors
      this.originalAxios.interceptors.request.clear();
      this.originalAxios.interceptors.response.clear();
      
      this.isInstrumented = false;
      this.outputChannel.debug('Axios middleware uninstrumented');
    } catch (error) {
      this.outputChannel.error(`Failed to uninstrument Axios: ${error}`);
    }
  }

  public onRequest(request: NetworkRequest): void {
    // Implementation for custom request handling
  }

  public onResponse(response: NetworkResponse): void {
    // Implementation for custom response handling
  }
}

// Fetch API Middleware Implementation
export class FetchMiddleware implements IMiddleware {
  public readonly name = 'fetch';
  private originalFetch: any = null;
  private isInstrumented = false;

  constructor(
    private outputChannel: vscode.LogOutputChannel,
    private registry: MiddlewareRegistry
  ) {}

  public instrument(): void {
    if (this.isInstrumented || typeof (globalThis as any).fetch === 'undefined') {
      return;
    }

    try {
      this.originalFetch = (globalThis as any).fetch;
      
      // Override global fetch
      (globalThis as any).fetch = async (input: any, init?: any) => {
        const startTime = Date.now();
        
        try {
          const response = await this.originalFetch!(input, init);
          await this.handleFetchResponse(input, init, response, startTime);
          return response;
        } catch (error) {
          this.handleFetchError(input, init, error as Error, startTime);
          throw error;
        }
      };

      this.isInstrumented = true;
      this.outputChannel.debug('Fetch middleware instrumented successfully');
    } catch (error) {
      this.outputChannel.error(`Failed to instrument Fetch: ${error}`);
    }
  }

  private async handleFetchResponse(
    input: any, 
    init: any, 
    response: any, 
    startTime: number
  ): Promise<void> {
    const duration = Date.now() - startTime;
    const url = typeof input === 'string' ? input : input.toString();

    const request: NetworkRequest = {
      method: init?.method || 'GET',
      url,
      headers: this.headersToObject(init?.headers),
      body: init?.body
    };

    // Clone response to read body without consuming it
    const responseClone = response.clone();
    let responseBody;
    try {
      responseBody = await responseClone.text();
    } catch {
      responseBody = '[Unable to read response body]';
    }

    const networkResponse: NetworkResponse = {
      status: response.status,
      headers: this.headersToObject(response.headers),
      body: responseBody,
      duration
    };

    this.registry.collectNetworkData(request, networkResponse);
  }

  private handleFetchError(
    input: any, 
    init: any, 
    error: Error, 
    startTime: number
  ): void {
    const duration = Date.now() - startTime;
    const url = typeof input === 'string' ? input : input.toString();

    const request: NetworkRequest = {
      method: init?.method || 'GET',
      url,
      headers: this.headersToObject(init?.headers),
      body: init?.body
    };

    const networkResponse: NetworkResponse = {
      status: 0,
      headers: {},
      body: error.message,
      duration
    };

    this.registry.collectNetworkData(request, networkResponse);
  }

  private headersToObject(headers: any): Record<string, string> {
    if (!headers) return {};

    if (headers && typeof headers.forEach === 'function') {
      const obj: Record<string, string> = {};
      headers.forEach((value: string, key: string) => {
        obj[key] = value;
      });
      return obj;
    }

    if (Array.isArray(headers)) {
      const obj: Record<string, string> = {};
      headers.forEach(([key, value]) => {
        obj[key] = value;
      });
      return obj;
    }

    return headers as Record<string, string>;
  }

  public uninstrument(): void {
    if (!this.isInstrumented || !this.originalFetch) {
      return;
    }

    try {
      (globalThis as any).fetch = this.originalFetch;
      this.isInstrumented = false;
      this.outputChannel.debug('Fetch middleware uninstrumented');
    } catch (error) {
      this.outputChannel.error(`Failed to uninstrument Fetch: ${error}`);
    }
  }

  public onRequest(request: NetworkRequest): void {
    // Implementation for custom request handling
  }

  public onResponse(response: NetworkResponse): void {
    // Implementation for custom response handling
  }
}

// XMLHttpRequest Middleware Implementation
export class XHRMiddleware implements IMiddleware {
  public readonly name = 'xhr';
  private originalXHR: any = null;
  private isInstrumented = false;

  constructor(
    private outputChannel: vscode.LogOutputChannel,
    private registry: MiddlewareRegistry
  ) {}

  public instrument(): void {
    if (this.isInstrumented || typeof (globalThis as any).XMLHttpRequest === 'undefined') {
      return;
    }

    try {
      this.originalXHR = (globalThis as any).XMLHttpRequest;
      const registry = this.registry;
      const outputChannel = this.outputChannel;

      // Override XMLHttpRequest
      (globalThis as any).XMLHttpRequest = function() {
        const xhr = new (XHRMiddleware.prototype.originalXHR as any)();
        const originalOpen = xhr.open;
        const originalSend = xhr.send;
        let requestData: any = null;
        let startTime: number;
        let method: string;
        let url: string;

        xhr.open = function(this: any, ...args: any[]) {
          method = args[0];
          url = args[1];
          return originalOpen.apply(this, args);
        };

        xhr.send = function(this: any, data?: any) {
          requestData = data;
          startTime = Date.now();
          return originalSend.call(this, data);
        };

        xhr.addEventListener('loadend', function() {
          const duration = Date.now() - startTime;

          const request: NetworkRequest = {
            method: method || 'GET',
            url: url || '',
            headers: {},
            body: requestData
          };

          const networkResponse: NetworkResponse = {
            status: xhr.status,
            headers: {},
            body: xhr.responseText,
            duration
          };

          registry.collectNetworkData(request, networkResponse);
        });

        return xhr;
      };

      this.isInstrumented = true;
      this.outputChannel.debug('XMLHttpRequest middleware instrumented successfully');
    } catch (error) {
      this.outputChannel.error(`Failed to instrument XMLHttpRequest: ${error}`);
    }
  }

  public uninstrument(): void {
    if (!this.isInstrumented || !this.originalXHR) {
      return;
    }

    try {
      (globalThis as any).XMLHttpRequest = this.originalXHR;
      this.isInstrumented = false;
      this.outputChannel.debug('XMLHttpRequest middleware uninstrumented');
    } catch (error) {
      this.outputChannel.error(`Failed to uninstrument XMLHttpRequest: ${error}`);
    }
  }

  public onRequest(request: NetworkRequest): void {
    // Implementation for custom request handling
  }

  public onResponse(response: NetworkResponse): void {
    // Implementation for custom response handling
  }
}