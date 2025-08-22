import * as assert from 'assert';
import * as vscode from 'vscode';
import { DebugSessionManager } from '../../core/debugSessionManager';
import { ContextCollector } from '../../core/contextCollector';
import { DataProcessor } from '../../core/dataProcessor';
import { AIServiceClient } from '../../core/aiServiceClient';
import { UIController } from '../../ui/uiController';
import { ConfigurationManager } from '../../core/configurationManager';
import { MiddlewareRegistry } from '../../core/middlewareRegistry';

suite('DebugSessionManager Test Suite', () => {
    let debugSessionManager: DebugSessionManager;
    let mockOutputChannel: vscode.LogOutputChannel;
    let mockContext: vscode.ExtensionContext;

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

        // Create component instances
        const configManager = new ConfigurationManager(mockContext);
        const contextCollector = new ContextCollector(mockOutputChannel);
        const dataProcessor = new DataProcessor(configManager);
        const aiServiceClient = new AIServiceClient(configManager, mockOutputChannel);
        const uiController = new UIController(mockContext, mockOutputChannel);
        const middlewareRegistry = new MiddlewareRegistry(mockOutputChannel);

        debugSessionManager = new DebugSessionManager(
            contextCollector,
            dataProcessor,
            aiServiceClient,
            uiController,
            middlewareRegistry,
            mockOutputChannel
        );
    });

    test('Should initialize without errors', () => {
        assert.doesNotThrow(() => {
            debugSessionManager.initialize();
        });
    });

    test('Should track active sessions', () => {
        debugSessionManager.initialize();
        
        const mockSession = {
            id: 'test-session-1',
            type: 'node',
            name: 'Test Session'
        } as vscode.DebugSession;

        // Start session
        debugSessionManager.startSession(mockSession);
        assert.strictEqual(debugSessionManager.getActiveSessionCount(), 1);

        // Stop session
        debugSessionManager.stopSession(mockSession);
        assert.strictEqual(debugSessionManager.getActiveSessionCount(), 0);
    });

    test('Should handle multiple sessions', () => {
        debugSessionManager.initialize();
        
        const session1 = { id: 'session-1', type: 'node', name: 'Session 1' } as vscode.DebugSession;
        const session2 = { id: 'session-2', type: 'python', name: 'Session 2' } as vscode.DebugSession;

        debugSessionManager.startSession(session1);
        debugSessionManager.startSession(session2);
        
        assert.strictEqual(debugSessionManager.getActiveSessionCount(), 2);

        debugSessionManager.stopSession(session1);
        assert.strictEqual(debugSessionManager.getActiveSessionCount(), 1);

        debugSessionManager.stopSession(session2);
        assert.strictEqual(debugSessionManager.getActiveSessionCount(), 0);
    });

    test('Should maintain session history', () => {
        debugSessionManager.initialize();
        
        const mockSession = {
            id: 'test-session-history',
            type: 'node',
            name: 'History Test'
        } as vscode.DebugSession;

        debugSessionManager.startSession(mockSession);
        
        // Initially no history
        const initialHistory = debugSessionManager.getSessionHistory(mockSession.id);
        assert.strictEqual(initialHistory.length, 0);

        // History should be available after session starts
        const history = debugSessionManager.getSessionHistory(mockSession.id);
        assert.ok(Array.isArray(history));
    });

    test('Should dispose cleanly', () => {
        debugSessionManager.initialize();
        
        const mockSession = {
            id: 'dispose-test',
            type: 'node',
            name: 'Dispose Test'
        } as vscode.DebugSession;

        debugSessionManager.startSession(mockSession);
        
        assert.doesNotThrow(() => {
            debugSessionManager.dispose();
        });
        
        // Should have no active sessions after dispose
        assert.strictEqual(debugSessionManager.getActiveSessionCount(), 0);
    });
});