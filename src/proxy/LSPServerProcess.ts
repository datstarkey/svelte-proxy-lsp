import { ChildProcess, spawn } from "child_process";
import { NotificationType, RequestType } from "vscode-jsonrpc";
import {
  createMessageConnection,
  MessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
} from "vscode-jsonrpc/node";
import {
  PublishDiagnosticsNotification,
  type PublishDiagnosticsParams,
} from "vscode-languageserver";

export interface LSPServerConfig {
  command: string;
  args: string[];
  name: string;
}

export class LSPServerProcess {
  private childProcess: ChildProcess | null = null;
  private connection: MessageConnection | null = null;
  private config: LSPServerConfig;
  private isInitialized = false;

  constructor(config: LSPServerConfig) {
    this.config = config;
  }

  async start(): Promise<void> {
    if (this.childProcess) {
      throw new Error(`${this.config.name} server is already running`);
    }

    console.log(
      `Starting ${this.config.name} server: ${this.config.command} ${this.config.args.join(" ")}`,
    );

    this.childProcess = spawn(this.config.command, this.config.args, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    if (!this.childProcess.stdin || !this.childProcess.stdout) {
      throw new Error(
        `Failed to start ${this.config.name} server - missing stdio streams`,
      );
    }

    this.childProcess.on("error", (error) => {
      console.error(`${this.config.name} server error:`, error);
    });

    this.childProcess.on("exit", (code, signal) => {
      console.log(
        `${this.config.name} server exited with code ${code}, signal ${signal}`,
      );
      this.cleanup();
    });

    this.childProcess.stderr?.on("data", (data) => {
      console.error(`${this.config.name} server stderr:`, data.toString());
    });

    // Create JSON-RPC connection
    const reader = new StreamMessageReader(this.childProcess.stdout);
    const writer = new StreamMessageWriter(this.childProcess.stdin);
    this.connection = createMessageConnection(reader, writer);

    this.connection.onError((error) => {
      console.error(`${this.config.name} connection error:`, error);
    });

    this.connection.onClose(() => {
      console.log(`${this.config.name} connection closed`);
      this.cleanup();
    });

    this.connection.listen();
  }

  async initialize(params: any): Promise<any> {
    if (!this.connection) {
      throw new Error(`${this.config.name} server is not started`);
    }

    const initializeRequest = new RequestType<any, any, any>("initialize");
    const result = await this.connection.sendRequest(initializeRequest, params);

    // Send initialized notification
    const initializedNotification = new NotificationType<any>("initialized");
    this.connection.sendNotification(initializedNotification, {});

    this.isInitialized = true;
    return result;
  }

  async sendRequest<P, R>(method: string, params: P): Promise<R> {
    if (!this.connection) {
      throw new Error(`${this.config.name} server is not started`);
    }

    if (!this.isInitialized && method !== "initialize") {
      throw new Error(`${this.config.name} server is not initialized`);
    }

    console.log(`📤 Sending ${method} request to ${this.config.name} server`);
    const requestType = new RequestType<P, R, any>(method);

    try {
      const result = await this.connection.sendRequest(requestType, params);
      console.log(`📥 Got ${method} response from ${this.config.name} server`);
      return result;
    } catch (error) {
      console.error(
        `❌ ${method} request failed to ${this.config.name} server:`,
        error,
      );
      throw error;
    }
  }

  sendNotification<P>(method: string, params: P): void {
    if (!this.connection) {
      console.warn(
        `Cannot send notification to ${this.config.name} - server not started`,
      );
      return;
    }

    const notificationType = new NotificationType<P>(method);
    this.connection.sendNotification(notificationType, params);
  }

  onRequest<P, R>(
    method: string,
    handler: (params: P) => R | Promise<R>,
  ): void {
    if (!this.connection) {
      throw new Error(`${this.config.name} server is not started`);
    }

    const requestType = new RequestType<P, R, any>(method);
    this.connection.onRequest(requestType, handler);
  }

  onDiagnostic(handler: (params: PublishDiagnosticsParams) => void): void {
    if (!this.connection) {
      throw new Error(`${this.config.name} server is not started`);
    }

    // Listen for diagnostics
    this.connection.onNotification(
      PublishDiagnosticsNotification.type,
      (params) => {
        console.log(
          `Received diagnostics from ${this.config.name} for:`,
          params.uri,
        );
        console.log(`Diagnostic count: ${params.diagnostics.length}`);
        handler(params);
      },
    );
  }

  onNotification<P>(method: string, handler: (params: P) => void): void {
    if (!this.connection) {
      throw new Error(`${this.config.name} server is not started`);
    }

    const notificationType = new NotificationType<P>(method);
    this.connection.onNotification(notificationType, handler);
  }

  async stop(): Promise<void> {
    if (this.isInitialized && this.connection) {
      try {
        const shutdownRequest = new RequestType<void, void, any>("shutdown");
        await this.connection.sendRequest(shutdownRequest, undefined);

        const exitNotification = new NotificationType<any>("exit");
        this.connection.sendNotification(exitNotification, undefined);
      } catch (error) {
        console.error(
          `Error during ${this.config.name} server shutdown:`,
          error,
        );
      }
    }

    this.cleanup();
  }

  private cleanup(): void {
    if (this.connection) {
      this.connection.end();
      this.connection = null;
    }

    if (this.childProcess) {
      if (!this.childProcess.killed) {
        this.childProcess.kill("SIGTERM");

        // Force kill after 5 seconds
        setTimeout(() => {
          if (this.childProcess && !this.childProcess.killed) {
            this.childProcess.kill("SIGKILL");
          }
        }, 5000);
      }
      this.childProcess = null;
    }

    this.isInitialized = false;
  }

  isRunning(): boolean {
    return this.childProcess !== null && !this.childProcess.killed;
  }

  isReady(): boolean {
    return this.isRunning() && this.isInitialized;
  }
}
