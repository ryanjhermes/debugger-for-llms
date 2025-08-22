import * as assert from 'assert';
import * as vscode from 'vscode';
import { DataProcessor } from '../../core/dataProcessor';
import { ConfigurationManager } from '../../core/configurationManager';
import { RawDebugContext, ProcessedContext, RetentionPolicy } from '../../types/interfaces';

suite('DataProcessor Test Suite', () => {
    let dataProcessor: DataProcessor;
    let mockConfigurationManager: ConfigurationManager;
    let mockContext: vscode.ExtensionContext;

    setup(() => {
        // Create mock extension context
        mockContext = {
            subscriptions: [],
            workspaceState: {
                get: () => undefined,
                update: () => Promise.resolve()
            },
            globalState: {
                get: () => undefined,
                update: () => Promise.resolve()
            },
            secrets: {
                get: () => Promise.resolve(undefined),
                store: () => Promise.resolve(),
                delete: () => Promise.resolve()
            }
        } as any;

        mockConfigurationManager = new ConfigurationManager(mockContext);
        dataProcessor = new DataProcessor(mockConfigurationManager);
    });

    suite('Context Processing', () => {
        test('Should process raw debug context with complete structure', () => {
            const rawContext: RawDebugContext = {
                sessionId: 'test-session',
                timestamp: Date.now(),
                eventType: 'breakpoint',
                sourceLocation: {
                    file: '/path/to/test.ts',
                    line: 10,
                    column: 5
                },
                variables: [
                    {
                        name: 'testVar',
                        value: 'testValue',
                        type: 'string',
                        scope: 'local',
                        isRedacted: false
                    }
                ],
                stackTrace: [
                    {
                        name: 'testFunction',
                        file: '/path/to/test.ts',
                        line: 10,
                        column: 5,
                        scope: 'user'
                    }
                ],
                consoleOutput: [
                    {
                        level: 'info',
                        message: 'Test message',
                        timestamp: Date.now(),
                        source: 'console'
                    }
                ],
                networkActivity: []
            };

            const processed = dataProcessor.processContext(rawContext);

            assert.strictEqual(processed.sessionId, 'test-session');
            assert.strictEqual(processed.eventType, 'breakpoint');
            assert.strictEqual(processed.variables.length, 1);
            assert.strictEqual(processed.stackTrace.length, 1);
            assert.strictEqual(processed.consoleOutput.length, 1);
        });

        test('Should handle incomplete raw context gracefully', () => {
            const rawContext: RawDebugContext = {
                sessionId: 'incomplete-session'
            };

            const processed = dataProcessor.processContext(rawContext);

            assert.strictEqual(processed.sessionId, 'incomplete-session');
            assert.ok(processed.timestamp > 0);
            assert.strictEqual(processed.eventType, 'breakpoint');
            assert.strictEqual(processed.sourceLocation.file, 'unknown');
            assert.strictEqual(processed.variables.length, 0);
            assert.strictEqual(processed.stackTrace.length, 0);
            assert.strictEqual(processed.consoleOutput.length, 0);
        });
    });

    suite('Privacy Filtering', () => {
        test('Should redact sensitive variables', () => {
            const context: ProcessedContext = {
                sessionId: 'test-session',
                timestamp: Date.now(),
                eventType: 'breakpoint',
                sourceLocation: { file: 'test.ts', line: 1, column: 1 },
                stackTrace: [],
                variables: [
                    {
                        name: 'password',
                        value: 'secret123',
                        type: 'string',
                        scope: 'local',
                        isRedacted: false
                    },
                    {
                        name: 'normalVar',
                        value: 'normal value',
                        type: 'string',
                        scope: 'local',
                        isRedacted: false
                    }
                ],
                consoleOutput: [],
                networkActivity: []
            };

            const filtered = dataProcessor.applyPrivacyFilters(context);

            const passwordVar = filtered.variables.find(v => v.name === 'password');
            const normalVar = filtered.variables.find(v => v.name === 'normalVar');

            assert.strictEqual(passwordVar?.value, '[REDACTED]');
            assert.strictEqual(passwordVar?.isRedacted, true);
            assert.strictEqual(normalVar?.value, 'normal value');
            assert.strictEqual(normalVar?.isRedacted, false);
        });

        test('Should sanitize console output', () => {
            const context: ProcessedContext = {
                sessionId: 'test-session',
                timestamp: Date.now(),
                eventType: 'breakpoint',
                sourceLocation: { file: 'test.ts', line: 1, column: 1 },
                stackTrace: [],
                variables: [],
                consoleOutput: [
                    {
                        level: 'debug',
                        message: 'Login attempt with password=secret123',
                        timestamp: Date.now(),
                        source: 'console'
                    },
                    {
                        level: 'info',
                        message: 'User successfully authenticated',
                        timestamp: Date.now(),
                        source: 'console'
                    }
                ],
                networkActivity: []
            };

            const filtered = dataProcessor.applyPrivacyFilters(context);

            const sensitiveLog = filtered.consoleOutput[0];
            const normalLog = filtered.consoleOutput[1];

            assert.ok(sensitiveLog.message.includes('[REDACTED]'));
            assert.ok(!sensitiveLog.message.includes('secret123'));
            assert.strictEqual(normalLog.message, 'User successfully authenticated');
        });
    });

    suite('AI Structure Generation', () => {
        test('Should generate comprehensive AI-ready context', () => {
            const context: ProcessedContext = {
                sessionId: 'test-session',
                timestamp: Date.now(),
                eventType: 'exception',
                sourceLocation: {
                    file: '/src/app.ts',
                    line: 25,
                    column: 10
                },
                stackTrace: [
                    {
                        name: 'processData',
                        file: '/src/app.ts',
                        line: 25,
                        column: 10,
                        scope: 'user'
                    }
                ],
                variables: [
                    {
                        name: 'data',
                        value: null,
                        type: 'null',
                        scope: 'local',
                        isRedacted: false
                    }
                ],
                consoleOutput: [
                    {
                        level: 'error',
                        message: 'Cannot read property of null',
                        timestamp: Date.now(),
                        source: 'console'
                    }
                ],
                networkActivity: [],
                exception: {
                    name: 'TypeError',
                    message: 'Cannot read property of null',
                    stack: 'TypeError: Cannot read property of null at processData (/src/app.ts:25:10)',
                    source: 'javascript'
                }
            };

            const aiReady = dataProcessor.structureForAI(context);

            assert.ok(aiReady.summary.includes('exception event'));
            assert.ok(aiReady.summary.includes('app.ts:25'));
            assert.strictEqual(aiReady.errorDescription, 'TypeError: Cannot read property of null');
            assert.strictEqual(aiReady.codeContext.language, 'typescript');
            assert.strictEqual(aiReady.runtimeState.variables.length, 1);
            assert.strictEqual(aiReady.runtimeState.stackTrace.length, 1);
            assert.ok(aiReady.userQuery?.includes('TypeError'));
        });

        test('Should detect programming language from file extension', () => {
            const testCases = [
                { file: 'app.ts', expected: 'typescript' },
                { file: 'script.js', expected: 'javascript' },
                { file: 'main.py', expected: 'python' },
                { file: 'unknown.xyz', expected: 'unknown' }
            ];

            testCases.forEach(testCase => {
                const context: ProcessedContext = {
                    sessionId: 'test-session',
                    timestamp: Date.now(),
                    eventType: 'breakpoint',
                    sourceLocation: { file: testCase.file, line: 1, column: 1 },
                    stackTrace: [],
                    variables: [],
                    consoleOutput: [],
                    networkActivity: []
                };

                const aiReady = dataProcessor.structureForAI(context);
                assert.strictEqual(aiReady.codeContext.language, testCase.expected);
            });
        });
    });

    suite('Data Cleanup and Retention', () => {
        test('Should clean up old data based on retention policy', () => {
            const oldTimestamp = Date.now() - 86400000; // 24 hours ago
            const recentTimestamp = Date.now() - 3600000; // 1 hour ago

            // Add some old contexts
            const oldContext: RawDebugContext = {
                sessionId: 'old-session',
                timestamp: oldTimestamp
            };

            const recentContext: RawDebugContext = {
                sessionId: 'recent-session',
                timestamp: recentTimestamp
            };

            dataProcessor.processContext(oldContext);
            dataProcessor.processContext(recentContext);

            // Verify contexts are stored
            assert.strictEqual(dataProcessor.getContextHistory('old-session').length, 1);
            assert.strictEqual(dataProcessor.getContextHistory('recent-session').length, 1);

            // Clean up data older than 2 hours
            const retentionPolicy: RetentionPolicy = {
                maxAge: 7200000, // 2 hours
                maxSize: 1000
            };

            dataProcessor.cleanupOldData(retentionPolicy);

            // Old context should be removed, recent should remain
            assert.strictEqual(dataProcessor.getContextHistory('old-session').length, 0);
            assert.strictEqual(dataProcessor.getContextHistory('recent-session').length, 1);
        });

        test('Should maintain context history per session', () => {
            const context1: RawDebugContext = {
                sessionId: 'session-1',
                timestamp: Date.now()
            };

            const context2: RawDebugContext = {
                sessionId: 'session-2',
                timestamp: Date.now()
            };

            const context3: RawDebugContext = {
                sessionId: 'session-1',
                timestamp: Date.now() + 1000
            };

            dataProcessor.processContext(context1);
            dataProcessor.processContext(context2);
            dataProcessor.processContext(context3);

            assert.strictEqual(dataProcessor.getContextHistory('session-1').length, 2);
            assert.strictEqual(dataProcessor.getContextHistory('session-2').length, 1);
            assert.strictEqual(dataProcessor.getContextHistory('nonexistent').length, 0);
        });

        test('Should clear context history', () => {
            const context: RawDebugContext = {
                sessionId: 'test-session',
                timestamp: Date.now()
            };

            dataProcessor.processContext(context);
            assert.strictEqual(dataProcessor.getContextHistory('test-session').length, 1);

            dataProcessor.clearContextHistory('test-session');
            assert.strictEqual(dataProcessor.getContextHistory('test-session').length, 0);
        });
    });
});