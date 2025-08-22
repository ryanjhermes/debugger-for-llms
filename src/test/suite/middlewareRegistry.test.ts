import * as assert from 'assert';
import * as vscode from 'vscode';
import { MiddlewareRegistry, AxiosMiddleware, FetchMiddleware, XHRMiddleware } from '../../core/middlewareRegistry';
import { IMiddleware, NetworkRequest, NetworkResponse } from '../../types/interfaces';

suite('MiddlewareRegistry Test Suite', () => {
    let middlewareRegistry: MiddlewareRegistry;
    let mockOutputChannel: vscode.LogOutputChannel;

    setup(() => {
        // Create mock output channel
        mockOutputChannel = {
            info: () => {},
            debug: () => {},
            error: () => {},
            warn: () => {},
            trace: () => {},
            dispose: () => {}
        } as any;

        middlewareRegistry = new MiddlewareRegistry(mockOutputChannel);
    });

    teardown(() => {
        middlewareRegistry.dispose();
    });

    suite('Middleware Registration', () => {
        test('Should register middleware successfully', () => {
            const mockMiddleware: IMiddleware = {
                name: 'test-middleware',
                instrument: () => {},
                uninstrument: () => {},
                onRequest: () => {},
                onResponse: () => {}
            };

            middlewareRegistry.registerMiddleware('test', mockMiddleware);
            
            const registered = middlewareRegistry.getRegisteredMiddleware();
            assert.ok(registered.includes('test'));
        });

        test('Should unregister middleware successfully', () => {
            const mockMiddleware: IMiddleware = {
                name: 'test-middleware',
                instrument: () => {},
                uninstrument: () => {},
                onRequest: () => {},
                onResponse: () => {}
            };

            middlewareRegistry.registerMiddleware('test', mockMiddleware);
            assert.ok(middlewareRegistry.getRegisteredMiddleware().includes('test'));

            middlewareRegistry.unregisterMiddleware('test');
            assert.ok(!middlewareRegistry.getRegisteredMiddleware().includes('test'));
        });

        test('Should handle middleware instrumentation errors gracefully', () => {
            const faultyMiddleware: IMiddleware = {
                name: 'faulty-middleware',
                instrument: () => { throw new Error('Instrumentation failed'); },
                uninstrument: () => {},
                onRequest: () => {},
                onResponse: () => {}
            };

            // Should not throw
            middlewareRegistry.registerMiddleware('faulty', faultyMiddleware);
            
            // Should not be registered due to instrumentation failure
            assert.ok(!middlewareRegistry.getRegisteredMiddleware().includes('faulty'));
        });
    });

    suite('Network Data Collection', () => {
        test('Should collect network data correctly', () => {
            const request: NetworkRequest = {
                method: 'POST',
                url: 'https://api.example.com/users',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer token123'
                },
                body: { name: 'John Doe', email: 'john@example.com' }
            };

            const response: NetworkResponse = {
                status: 201,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: { id: 1, name: 'John Doe', email: 'john@example.com' },
                duration: 150
            };

            const networkData = middlewareRegistry.collectNetworkData(request, response);

            assert.strictEqual(networkData.method, 'POST');
            assert.strictEqual(networkData.url, 'https://api.example.com/users');
            assert.strictEqual(networkData.responseStatus, 201);
            assert.strictEqual(networkData.duration, 150);
            assert.ok(networkData.timestamp > 0);
            assert.strictEqual(networkData.domain, 'api.example.com');
            assert.strictEqual(networkData.isExternal, true);
            assert.strictEqual(networkData.category, 'api');
        });

        test('Should redact sensitive headers', () => {
            const request: NetworkRequest = {
                method: 'GET',
                url: 'https://api.example.com/data',
                headers: {
                    'Authorization': 'Bearer secret-token',
                    'X-API-Key': 'api-key-123',
                    'Content-Type': 'application/json',
                    'User-Agent': 'MyApp/1.0'
                }
            };

            const response: NetworkResponse = {
                status: 200,
                headers: {},
                body: {},
                duration: 100
            };

            const networkData = middlewareRegistry.collectNetworkData(request, response);

            // Should redact sensitive headers
            assert.strictEqual(networkData.headers['Authorization'], '[REDACTED]');
            assert.strictEqual(networkData.headers['X-API-Key'], '[REDACTED]');
            
            // Should keep non-sensitive headers
            assert.strictEqual(networkData.headers['Content-Type'], 'application/json');
        });

        test('Should redact sensitive data in request body', () => {
            const request: NetworkRequest = {
                method: 'POST',
                url: 'https://api.example.com/login',
                headers: {},
                body: {
                    username: 'john@example.com',
                    password: 'secret123',
                    apiKey: 'key-456',
                    normalField: 'normal value'
                }
            };

            const response: NetworkResponse = {
                status: 200,
                headers: {},
                body: {},
                duration: 200
            };

            const networkData = middlewareRegistry.collectNetworkData(request, response);

            // Should redact sensitive fields
            assert.strictEqual(networkData.requestBody.password, '[REDACTED]');
            assert.strictEqual(networkData.requestBody.apiKey, '[REDACTED]');
            
            // Should keep non-sensitive fields
            assert.strictEqual(networkData.requestBody.username, 'john@example.com');
            assert.strictEqual(networkData.requestBody.normalField, 'normal value');
        });

        test('Should categorize requests correctly', () => {
            const testCases = [
                { url: 'https://api.example.com/users', expected: 'api' },
                { url: 'https://example.com/graphql', expected: 'graphql' },
                { url: 'https://example.com/auth/login', expected: 'authentication' },
                { url: 'https://example.com/upload/file', method: 'POST', expected: 'file_upload' },
                { url: 'https://example.com/static/app.js', method: 'GET', expected: 'static_resource' },
                { url: 'https://example.com/ws/chat', expected: 'websocket' },
                { url: 'https://example.com/other', expected: 'general' }
            ];

            testCases.forEach(testCase => {
                const request: NetworkRequest = {
                    method: testCase.method || 'GET',
                    url: testCase.url,
                    headers: {}
                };

                const response: NetworkResponse = {
                    status: 200,
                    headers: {},
                    body: {},
                    duration: 100
                };

                const networkData = middlewareRegistry.collectNetworkData(request, response);
                assert.strictEqual(networkData.category, testCase.expected, 
                    `URL ${testCase.url} should be categorized as ${testCase.expected}`);
            });
        });

        test('Should identify external vs internal requests', () => {
            const testCases = [
                { url: 'https://api.example.com/data', expected: true },
                { url: 'http://localhost:3000/api', expected: false },
                { url: 'http://127.0.0.1:8080/test', expected: false },
                { url: 'chrome-extension://abc123/page.html', expected: false },
                { url: 'vscode-webview://abc123', expected: false }
            ];

            testCases.forEach(testCase => {
                const request: NetworkRequest = {
                    method: 'GET',
                    url: testCase.url,
                    headers: {}
                };

                const response: NetworkResponse = {
                    status: 200,
                    headers: {},
                    body: {},
                    duration: 100
                };

                const networkData = middlewareRegistry.collectNetworkData(request, response);
                assert.strictEqual(networkData.isExternal, testCase.expected, 
                    `URL ${testCase.url} should be ${testCase.expected ? 'external' : 'internal'}`);
            });
        });
    });

    suite('Network Activity Buffer', () => {
        test('Should maintain network activity buffer', () => {
            const request: NetworkRequest = {
                method: 'GET',
                url: 'https://api.example.com/test',
                headers: {}
            };

            const response: NetworkResponse = {
                status: 200,
                headers: {},
                body: {},
                duration: 100
            };

            // Add some network data
            for (let i = 0; i < 5; i++) {
                middlewareRegistry.collectNetworkData(request, response);
            }

            const recentActivity = middlewareRegistry.getRecentNetworkActivity(3);
            assert.strictEqual(recentActivity.length, 3);
        });

        test('Should clear network buffer', () => {
            const request: NetworkRequest = {
                method: 'GET',
                url: 'https://api.example.com/test',
                headers: {}
            };

            const response: NetworkResponse = {
                status: 200,
                headers: {},
                body: {},
                duration: 100
            };

            middlewareRegistry.collectNetworkData(request, response);
            assert.strictEqual(middlewareRegistry.getRecentNetworkActivity().length, 1);

            middlewareRegistry.clearNetworkBuffer();
            assert.strictEqual(middlewareRegistry.getRecentNetworkActivity().length, 0);
        });
    });

    suite('Event Listeners', () => {
        test('Should notify event listeners on network activity', (done) => {
            let eventReceived = false;

            const listener = (event: any) => {
                eventReceived = true;
                assert.ok(event.request);
                assert.ok(event.response);
                assert.ok(event.timestamp > 0);
                done();
            };

            middlewareRegistry.addEventListener(listener);

            const request: NetworkRequest = {
                method: 'GET',
                url: 'https://api.example.com/test',
                headers: {}
            };

            const response: NetworkResponse = {
                status: 200,
                headers: {},
                body: {},
                duration: 100
            };

            middlewareRegistry.collectNetworkData(request, response);
        });

        test('Should remove event listeners', () => {
            let eventCount = 0;

            const listener = () => {
                eventCount++;
            };

            middlewareRegistry.addEventListener(listener);

            const request: NetworkRequest = {
                method: 'GET',
                url: 'https://api.example.com/test',
                headers: {}
            };

            const response: NetworkResponse = {
                status: 200,
                headers: {},
                body: {},
                duration: 100
            };

            middlewareRegistry.collectNetworkData(request, response);
            assert.strictEqual(eventCount, 1);

            middlewareRegistry.removeEventListener(listener);
            middlewareRegistry.collectNetworkData(request, response);
            assert.strictEqual(eventCount, 1); // Should not increment
        });
    });

    suite('Framework Instrumentation', () => {
        test('Should handle framework instrumentation requests', () => {
            // Should not throw for known frameworks
            middlewareRegistry.instrumentFramework('react');
            middlewareRegistry.instrumentFramework('angular');
            middlewareRegistry.instrumentFramework('vue');
            middlewareRegistry.instrumentFramework('express');
            middlewareRegistry.instrumentFramework('nextjs');
            
            // Should handle unknown frameworks gracefully
            middlewareRegistry.instrumentFramework('unknown-framework');
        });
    });
});

suite('Axios Middleware Test Suite', () => {
    let axiosMiddleware: AxiosMiddleware;
    let mockOutputChannel: vscode.LogOutputChannel;
    let mockRegistry: MiddlewareRegistry;

    setup(() => {
        mockOutputChannel = {
            info: () => {},
            debug: () => {},
            error: () => {},
            warn: () => {},
            trace: () => {},
            dispose: () => {}
        } as any;

        mockRegistry = new MiddlewareRegistry(mockOutputChannel);
        axiosMiddleware = new AxiosMiddleware(mockOutputChannel, mockRegistry);
    });

    test('Should have correct name', () => {
        assert.strictEqual(axiosMiddleware.name, 'axios');
    });

    test('Should handle instrumentation when axios is not available', () => {
        // Should not throw when axios is not available
        axiosMiddleware.instrument();
        axiosMiddleware.uninstrument();
    });
});

suite('Fetch Middleware Test Suite', () => {
    let fetchMiddleware: FetchMiddleware;
    let mockOutputChannel: vscode.LogOutputChannel;
    let mockRegistry: MiddlewareRegistry;

    setup(() => {
        mockOutputChannel = {
            info: () => {},
            debug: () => {},
            error: () => {},
            warn: () => {},
            trace: () => {},
            dispose: () => {}
        } as any;

        mockRegistry = new MiddlewareRegistry(mockOutputChannel);
        fetchMiddleware = new FetchMiddleware(mockOutputChannel, mockRegistry);
    });

    test('Should have correct name', () => {
        assert.strictEqual(fetchMiddleware.name, 'fetch');
    });

    test('Should handle instrumentation when fetch is not available', () => {
        // Should not throw when fetch is not available
        fetchMiddleware.instrument();
        fetchMiddleware.uninstrument();
    });
});

suite('XHR Middleware Test Suite', () => {
    let xhrMiddleware: XHRMiddleware;
    let mockOutputChannel: vscode.LogOutputChannel;
    let mockRegistry: MiddlewareRegistry;

    setup(() => {
        mockOutputChannel = {
            info: () => {},
            debug: () => {},
            error: () => {},
            warn: () => {},
            trace: () => {},
            dispose: () => {}
        } as any;

        mockRegistry = new MiddlewareRegistry(mockOutputChannel);
        xhrMiddleware = new XHRMiddleware(mockOutputChannel, mockRegistry);
    });

    test('Should have correct name', () => {
        assert.strictEqual(xhrMiddleware.name, 'xhr');
    });

    test('Should handle instrumentation when XMLHttpRequest is not available', () => {
        // Should not throw when XMLHttpRequest is not available
        xhrMiddleware.instrument();
        xhrMiddleware.uninstrument();
    });
});