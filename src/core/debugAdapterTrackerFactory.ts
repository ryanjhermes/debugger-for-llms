import * as vscode from 'vscode';
import { DebugAdapterTracker } from './debugAdapterTracker';
import { DebugSessionManager } from './debugSessionManager';

export class DebugAdapterTrackerFactory implements vscode.DebugAdapterTrackerFactory {
  constructor(
    private debugSessionManager: DebugSessionManager,
    private outputChannel: vscode.LogOutputChannel
  ) {}

  createDebugAdapterTracker(session: vscode.DebugSession): vscode.ProviderResult<vscode.DebugAdapterTracker> {
    this.outputChannel.debug(`Creating debug adapter tracker for session ${session.id} (${session.type})`);
    
    return new DebugAdapterTracker(session, this.debugSessionManager, this.outputChannel);
  }
}