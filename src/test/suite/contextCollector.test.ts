import * as assert from 'assert';
import * as vscode from 'vscode';
import { ContextCollector } from '../../core/contextCollector';
import { ConsoleMessage, ExceptionInfo } from '../../types/interfaces';

suite('ContextCollector Test Suite', () => {
    let contextCollector: ContextCollector;
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

        contextCollector = new ContextCollector(mockOutputChannel);
    });

    test('Should collect console output correctly', () => {
        const consoleMessage: ConsoleMessage = {
            level: 'error',
            text: 'Test error message',
            timestamp: Date.now()
        };

        const logEntry = contextCollector.collectConsoleOutput(consoleMessage);

        assert.strictEqual(logEntry.level, 'error');
        assert.strictEqual(logEntry.message, 'Test error message');
        assert.strictEqual(logEntry.source, 'console');
        assert.ok(logEntry.timestamp > 0);
    });

    test('Should map log levels correctly', () => {
        const testCases = [
            { input: 'warning', expected: 'warn' },
            { input: 'WARN', expected: 'warn' },
            { input: 'error', expected: 'error' },
            { input: 'ERR', expected: 'error' },
            { input: 'information', expected: 'info' },
            { input: 'INFO', expected: 'info' },
            { input: 'debug', expected: 'debug' },
            { input: 'verbose', expected: 'debug' },
            { input: 'unknown', expected: 'log' }
        ];

        for (const testCase of testCases) {
            const consoleMessage: ConsoleMessage = {
                level: testCase.input,
                text: 'Test message',
                timestamp: Date.now()
            };

            const logEntry = contextCollector.collectConsoleOutput(consoleMessage);
            assert.strictEqual(logEntry.level, testCase.expected, 
                `Failed for input: ${testCase.input}`);
        }
    });

    test('Should redact sensitive information in console messages', () => {
        const sensitiveMessages = [
            'password=secret123',
            'token=abc123def456',
            'api_key=sk-1234567890abcdef',
            'authorization: bearer xyz789'
        ];

        for (const message of sensitiveMessages) {
            const consoleMessage: ConsoleMessage = {
                level: 'log',
                text: message,
                timestamp: Date.now()
            };

            const logEntry = contextCollector.collectConsoleOutput(consoleMessage);
            assert.ok(logEntry.message.includes('[REDACTED]'), 
                `Should redact: ${message}, got: ${logEntry.message}`);
        }
    });

    test('Should collect exception data correctly', () => {
        const exception: ExceptionInfo = {
            name: 'TypeError',
            message: 'Cannot read property of undefined',
            stack: 'TypeError: Cannot read property of undefined\n    at test.js:10:5',
            source: 'node'
        };

        const exceptionData = contextCollector.collectException(exception);

        assert.strictEqual(exceptionData.name, 'TypeError');
        assert.strictEqual(exceptionData.message, 'Cannot read property of undefined');
        assert.ok(exceptionData.stack.includes('TypeError'));
        assert.strictEqual(exceptionData.source, 'node');
    });

    test('Should sanitize stack traces', () => {
        const exception: ExceptionInfo = {
            name: 'Error',
            message: 'Test error',
            stack: 'Error: Test error\n    at /Users/johndoe/project/test.js:10:5\n    at C:\\Users\\janedoe\\project\\test.js:15:10',
            source: 'test'
        };

        const exceptionData = contextCollector.collectException(exception);

        assert.ok(exceptionData.stack.includes('/Users/[USER]'), 
            'Should sanitize Unix user paths');
        assert.ok(exceptionData.stack.includes('C:\\Users\\[USER]'), 
            'Should sanitize Windows user paths');
    });

    test('Should maintain console output buffer', () => {
        // Add multiple console messages
        for (let i = 0; i < 15; i++) {
            const consoleMessage: ConsoleMessage = {
                level: 'log',
                text: `Message ${i}`,
                timestamp: Date.now() + i
            };
            contextCollector.collectConsoleOutput(consoleMessage);
        }

        // Get recent output
        const recentOutput = contextCollector.getRecentConsoleOutput(10);
        assert.strictEqual(recentOutput.length, 10);
        
        // Should be the most recent messages
        assert.ok(recentOutput[9].message.includes('Message 14'));
        assert.ok(recentOutput[0].message.includes('Message 5'));
    });

    test('Should filter console output by timestamp', () => {
        const baseTime = Date.now();
        
        // Add messages with different timestamps
        for (let i = 0; i < 5; i++) {
            const consoleMessage: ConsoleMessage = {
                level: 'log',
                text: `Message ${i}`,
                timestamp: baseTime + (i * 1000) // 1 second apart
            };
            contextCollector.collectConsoleOutput(consoleMessage);
        }

        // Get messages since middle timestamp
        const filteredOutput = contextCollector.getConsoleOutputSince(baseTime + 2500);
        assert.strictEqual(filteredOutput.length, 2); // Messages 3 and 4
        assert.ok(filteredOutput[0].message.includes('Message 3'));
        assert.ok(filteredOutput[1].message.includes('Message 4'));
    });

    test('Should clear console buffer', () => {
        // Add some messages
        for (let i = 0; i < 5; i++) {
            const consoleMessage: ConsoleMessage = {
                level: 'log',
                text: `Message ${i}`,
                timestamp: Date.now()
            };
            contextCollector.collectConsoleOutput(consoleMessage);
        }

        // Verify messages exist
        let recentOutput = contextCollector.getRecentConsoleOutput();
        assert.ok(recentOutput.length > 0);

        // Clear buffer
        contextCollector.clearConsoleBuffer();

        // Verify buffer is empty
        recentOutput = contextCollector.getRecentConsoleOutput();
        assert.strictEqual(recentOutput.length, 0);
    });

    test('Should handle empty or invalid input gracefully', () => {
        // Test with empty console message
        const emptyMessage: ConsoleMessage = {
            level: '',
            text: '',
            timestamp: 0
        };

        const logEntry = contextCollector.collectConsoleOutput(emptyMessage);
        assert.strictEqual(logEntry.level, 'log'); // Default level
        assert.strictEqual(logEntry.message, '');
        assert.ok(logEntry.timestamp > 0); // Should use current time

        // Test with undefined exception
        const invalidException = {} as ExceptionInfo;
        const exceptionData = contextCollector.collectException(invalidException);
        
        assert.strictEqual(exceptionData.name, 'UnknownException');
        assert.strictEqual(exceptionData.message, 'No message provided');
        assert.strictEqual(exceptionData.source, 'unknown');
    });
});