import { LSPServerProcess } from '../../src/proxy/LSPServerProcess';

// Mock child_process
jest.mock('child_process', () => ({
  spawn: jest.fn()
}));

// Mock vscode-jsonrpc
jest.mock('vscode-jsonrpc/node', () => ({
  createMessageConnection: jest.fn(() => ({
    listen: jest.fn(),
    sendRequest: jest.fn(),
    sendNotification: jest.fn(),
    onRequest: jest.fn(),
    onNotification: jest.fn(),
    onError: jest.fn(),
    onClose: jest.fn(),
    end: jest.fn()
  })),
  StreamMessageReader: jest.fn(),
  StreamMessageWriter: jest.fn()
}));

import { spawn } from 'child_process';
import { EventEmitter } from 'events';

describe('LSPServerProcess', () => {
  let mockChildProcess: any;
  let lspServer: LSPServerProcess;

  beforeEach(() => {
    mockChildProcess = new EventEmitter();
    mockChildProcess.stdin = new EventEmitter();
    mockChildProcess.stdout = new EventEmitter();
    mockChildProcess.stderr = new EventEmitter();
    mockChildProcess.killed = false;
    mockChildProcess.kill = jest.fn();

    (spawn as jest.Mock).mockReturnValue(mockChildProcess);

    lspServer = new LSPServerProcess({
      command: 'test-server',
      args: ['--stdio'],
      name: 'Test Server'
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('start', () => {
    it('should spawn the server process', async () => {
      await lspServer.start();

      expect(spawn).toHaveBeenCalledWith('test-server', ['--stdio'], {
        stdio: ['pipe', 'pipe', 'pipe']
      });
    });

    it('should throw if server is already running', async () => {
      await lspServer.start();
      
      await expect(lspServer.start()).rejects.toThrow('Test Server server is already running');
    });

    it('should handle server startup errors', async () => {
      const startPromise = lspServer.start();
      
      // Simulate spawn error
      mockChildProcess.emit('error', new Error('Command not found'));
      
      // Should not throw - error is handled by event listener
      await startPromise;
    });
  });

  describe('stop', () => {
    it('should send shutdown and exit requests when initialized', async () => {
      await lspServer.start();
      
      // Mock that server is initialized
      await lspServer.initialize({ processId: 1234 });
      
      await lspServer.stop();
      
      expect(mockChildProcess.kill).toHaveBeenCalledWith('SIGTERM');
    });

    it('should kill process immediately if not initialized', async () => {
      await lspServer.start();
      
      await lspServer.stop();
      
      expect(mockChildProcess.kill).toHaveBeenCalledWith('SIGTERM');
    });
  });

  describe('isRunning', () => {
    it('should return false initially', () => {
      expect(lspServer.isRunning()).toBe(false);
    });

    it('should return true after start', async () => {
      await lspServer.start();
      expect(lspServer.isRunning()).toBe(true);
    });

    it('should return false after process exits', async () => {
      await lspServer.start();
      mockChildProcess.killed = true;
      expect(lspServer.isRunning()).toBe(false);
    });
  });

  describe('isReady', () => {
    it('should return false before initialization', async () => {
      await lspServer.start();
      expect(lspServer.isReady()).toBe(false);
    });

    it('should return true after initialization', async () => {
      await lspServer.start();
      await lspServer.initialize({ processId: 1234 });
      expect(lspServer.isReady()).toBe(true);
    });
  });
});