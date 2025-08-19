import { ChildProcess } from "child_process";
import { EventEmitter } from "events";
import {
  createMessageConnection,
  MessageConnection,
  NotificationType,
  RequestType,
  StreamMessageReader,
  StreamMessageWriter,
} from "vscode-jsonrpc/node";

import {
  CodeAction,
  CodeActionContext,
  CodeActionParams,
  CodeLens,
  CodeLensParams,
  Command,
  CompletionItem,
  CompletionList,
  CompletionParams,
  DeclarationParams,
  Diagnostic,
  DidChangeTextDocumentParams,
  DidCloseTextDocumentParams,
  DidOpenTextDocumentParams,
  DocumentFormattingParams,
  DocumentHighlight,
  DocumentHighlightParams,
  DocumentLink,
  DocumentLinkParams,
  DocumentOnTypeFormattingParams,
  DocumentRangeFormattingParams,
  DocumentSymbol,
  DocumentSymbolParams,
  ExecuteCommandParams,
  FoldingRange,
  FoldingRangeParams,
  FormattingOptions,
  Hover,
  HoverParams,
  ImplementationParams,
  InitializeParams,
  InitializeResult,
  Location,
  LocationLink,
  LogMessageNotification,
  Position,
  PrepareRenameParams,
  PublishDiagnosticsNotification,
  PublishDiagnosticsParams,
  Range,
  ReferenceParams,
  RenameParams,
  SelectionRange,
  SelectionRangeParams,
  SemanticTokens,
  SemanticTokensParams,
  ShowMessageNotification,
  SignatureHelp,
  SignatureHelpParams,
  SymbolInformation,
  TelemetryEventNotification,
  TextDocumentContentChangeEvent,
  TextDocumentIdentifier,
  TextDocumentItem,
  TextDocumentPositionParams,
  TextEdit,
  TypeDefinitionParams,
  VersionedTextDocumentIdentifier,
  WorkspaceEdit,
  WorkspaceSymbolParams,
  type LogMessageParams,
  type ShowMessageParams,
} from "vscode-languageserver-protocol";

/**
 * Enhanced strongly typed LSP client wrapper using vscode-jsonrpc directly
 * Provides comprehensive LSP protocol support with strong typing
 */
export class TypedLSPClient extends EventEmitter {
  private connection: MessageConnection | null = null;
  private diagnostics = new Map<string, Diagnostic[]>();
  private diagnosticCallbacks: ((
    uri: string,
    diagnostics: Diagnostic[],
  ) => void)[] = [];
  private process: ChildProcess;
  private pendingRequests = new Map<number, string>();
  private requestIdCounter = 0;
  private logger: Logger;
  private isInitialized = false;

  constructor(serverProcess: ChildProcess, options?: TypedLSPClientOptions) {
    super();

    if (!serverProcess.stdin || !serverProcess.stdout) {
      throw new Error("Server process must have stdin and stdout");
    }

    this.process = serverProcess;
    this.logger = new Logger(options?.logLevel || LogLevel.INFO);

    // Create message connection using vscode-jsonrpc
    const reader = new StreamMessageReader(serverProcess.stdout);
    const writer = new StreamMessageWriter(serverProcess.stdin);
    this.connection = createMessageConnection(reader, writer);

    // Set up error and close handlers
    this.connection.onError((error) => {
      this.logger.error("Connection error:", error);
      this.emit("error", error);
    });

    this.connection.onClose(() => {
      this.logger.info("Connection closed");
      this.emit("close");
    });

    // Set up notification handling
    this.setupNotificationHandling();

    // Start listening
    this.connection.listen();
  }

  private setupNotificationHandling() {
    if (!this.connection) return;

    // Handle diagnostics notifications
    this.connection.onNotification(
      PublishDiagnosticsNotification.type,
      (params: PublishDiagnosticsParams) => {
        this.logger.debug(`Received diagnostics for: ${params.uri}`);
        this.handlePublishDiagnostics(params);
      },
    );

    // Handle other common notifications
    this.connection.onNotification(
      ShowMessageNotification.type,
      (params: ShowMessageParams) => {
        this.logger.debug(`Received showMessage: ${params.message}`);
        this.emit("window/showMessage", params);
      },
    );

    this.connection.onNotification(
      LogMessageNotification.type,
      (params: LogMessageParams) => {
        this.logger.debug(`Received logMessage: ${params.message}`);
        this.emit("window/logMessage", params);
      },
    );

    this.connection.onNotification(
      TelemetryEventNotification.type,
      (params: any) => {
        this.emit("telemetry/event", params);
      },
    );

    this.connection.onNotification("$/progress", (params: any) => {
      this.emit("$/progress", params);
    });
  }

  private handlePublishDiagnostics(params: PublishDiagnosticsParams) {
    this.diagnostics.set(params.uri, params.diagnostics);
    this.diagnosticCallbacks.forEach((callback) =>
      callback(params.uri, params.diagnostics),
    );
    this.emit("textDocument/publishDiagnostics", params);
  }

  // ===== Request/Notification Helpers =====

  private async sendRequest<P, R>(method: string, params?: P): Promise<R> {
    if (!this.connection) {
      throw new Error("Connection not established");
    }

    const requestId = this.requestIdCounter++;
    this.pendingRequests.set(requestId, method);
    this.logger.debug(`Sending request #${requestId}: ${method}`);

    try {
      const requestType = new RequestType<P, R, any>(method);
      const result = await this.connection.sendRequest(requestType, params!);
      this.pendingRequests.delete(requestId);
      this.logger.debug(`Request #${requestId} completed: ${method}`);
      return result;
    } catch (error) {
      this.pendingRequests.delete(requestId);
      this.logger.error(`Request #${requestId} failed: ${method}`, error);
      throw error;
    }
  }

  private sendNotification<P>(method: string, params?: P): void {
    if (!this.connection) {
      this.logger.warn("Cannot send notification - no connection");
      return;
    }

    const notificationType = new NotificationType<P>(method);
    this.connection.sendNotification(notificationType, params!);
    this.logger.debug(`Sent notification: ${method}`);
  }

  // ===== Lifecycle Methods =====

  /**
   * Initialize the language server
   */
  async initialize(params: InitializeParams): Promise<InitializeResult> {
    this.logger.info("Initializing language server");
    const result = await this.sendRequest<InitializeParams, InitializeResult>(
      "initialize",
      params,
    );
    this.isInitialized = true;
    return result;
  }

  /**
   * Send initialized notification
   */
  initialized(): void {
    this.logger.info("Sending initialized notification");
    this.sendNotification("initialized", {});
  }

  /**
   * Shutdown the server
   */
  async shutdown(): Promise<void> {
    if (!this.connection) {
      this.logger.warn("Cannot shutdown - no connection");
      return;
    }
    this.logger.info("Shutting down language server");
    try {
      await this.sendRequest<void, void>("shutdown");
    } catch (error) {
      this.logger.error("Shutdown request failed", error);
    }
    this.isInitialized = false;
  }

  /**
   * Send exit notification
   */
  exit(): void {
    if (!this.connection) {
      this.logger.warn("Cannot send exit - no connection");
      return;
    }
    this.logger.info("Sending exit notification");
    try {
      this.sendNotification("exit");
    } catch (error) {
      this.logger.error("Exit notification failed", error);
    }
  }

  // ===== Document Synchronization =====

  /**
   * Open a text document
   */
  didOpen(params: DidOpenTextDocumentParams): void {
    this.logger.debug(`Opening document: ${params.textDocument.uri}`);
    this.sendNotification("textDocument/didOpen", params);
  }

  /**
   * Change a text document
   */
  didChange(params: DidChangeTextDocumentParams): void {
    this.logger.debug(`Changing document: ${params.textDocument.uri}`);
    this.sendNotification("textDocument/didChange", params);
  }

  /**
   * Save a text document
   */
  didSave(params: {
    textDocument: TextDocumentIdentifier;
    text?: string;
  }): void {
    this.logger.debug(`Saving document: ${params.textDocument.uri}`);
    this.sendNotification("textDocument/didSave", params);
  }

  /**
   * Close a text document
   */
  didClose(params: DidCloseTextDocumentParams): void {
    this.logger.debug(`Closing document: ${params.textDocument.uri}`);
    this.sendNotification("textDocument/didClose", params);
  }

  /**
   * Will save a text document
   */
  willSave(params: {
    textDocument: TextDocumentIdentifier;
    reason: number;
  }): void {
    this.logger.debug(`Will save document: ${params.textDocument.uri}`);
    this.sendNotification("textDocument/willSave", params);
  }

  /**
   * Will save a text document and wait for edits
   */
  async willSaveWaitUntil(params: {
    textDocument: TextDocumentIdentifier;
    reason: number;
  }): Promise<TextEdit[] | null> {
    this.logger.debug(`Will save and wait: ${params.textDocument.uri}`);
    try {
      return await this.sendRequest<typeof params, TextEdit[]>(
        "textDocument/willSaveWaitUntil",
        params,
      );
    } catch (error) {
      this.logger.error("willSaveWaitUntil failed", error);
      return null;
    }
  }

  // ===== Language Features =====

  /**
   * Request hover information
   */
  async hover(params: HoverParams): Promise<Hover | null> {
    try {
      return await this.sendRequest<HoverParams, Hover>(
        "textDocument/hover",
        params,
      );
    } catch (error) {
      this.logger.error("Hover request failed", error);
      return null;
    }
  }

  /**
   * Request completion items
   */
  async completion(
    params: CompletionParams,
  ): Promise<CompletionItem[] | CompletionList | null> {
    try {
      return await this.sendRequest<
        CompletionParams,
        CompletionItem[] | CompletionList
      >("textDocument/completion", params);
    } catch (error) {
      this.logger.error("Completion request failed", error);
      return null;
    }
  }

  /**
   * Resolve a completion item
   */
  async completionItemResolve(
    item: CompletionItem,
  ): Promise<CompletionItem | null> {
    try {
      return await this.sendRequest<CompletionItem, CompletionItem>(
        "completionItem/resolve",
        item,
      );
    } catch (error) {
      this.logger.error("Completion item resolve failed", error);
      return null;
    }
  }

  /**
   * Request signature help
   */
  async signatureHelp(
    params: SignatureHelpParams,
  ): Promise<SignatureHelp | null> {
    try {
      return await this.sendRequest<SignatureHelpParams, SignatureHelp>(
        "textDocument/signatureHelp",
        params,
      );
    } catch (error) {
      this.logger.error("Signature help request failed", error);
      return null;
    }
  }

  /**
   * Request definition locations
   */
  async definition(
    params: TextDocumentPositionParams,
  ): Promise<Location | Location[] | LocationLink[] | null> {
    try {
      return await this.sendRequest<
        typeof params,
        Location | Location[] | LocationLink[]
      >("textDocument/definition", params);
    } catch (error) {
      this.logger.error("Definition request failed", error);
      return null;
    }
  }

  /**
   * Request type definition locations
   */
  async typeDefinition(
    params: TypeDefinitionParams,
  ): Promise<Location | Location[] | LocationLink[] | null> {
    try {
      return await this.sendRequest<
        TypeDefinitionParams,
        Location | Location[] | LocationLink[]
      >("textDocument/typeDefinition", params);
    } catch (error) {
      this.logger.error("Type definition request failed", error);
      return null;
    }
  }

  /**
   * Request implementation locations
   */
  async implementation(
    params: ImplementationParams,
  ): Promise<Location | Location[] | LocationLink[] | null> {
    try {
      return await this.sendRequest<
        ImplementationParams,
        Location | Location[] | LocationLink[]
      >("textDocument/implementation", params);
    } catch (error) {
      this.logger.error("Implementation request failed", error);
      return null;
    }
  }

  /**
   * Request declaration locations
   */
  async declaration(
    params: DeclarationParams,
  ): Promise<Location | Location[] | LocationLink[] | null> {
    try {
      return await this.sendRequest<
        DeclarationParams,
        Location | Location[] | LocationLink[]
      >("textDocument/declaration", params);
    } catch (error) {
      this.logger.error("Declaration request failed", error);
      return null;
    }
  }

  /**
   * Request references
   */
  async references(params: ReferenceParams): Promise<Location[] | null> {
    try {
      return await this.sendRequest<ReferenceParams, Location[]>(
        "textDocument/references",
        params,
      );
    } catch (error) {
      this.logger.error("References request failed", error);
      return null;
    }
  }

  /**
   * Request document highlights
   */
  async documentHighlight(
    params: DocumentHighlightParams,
  ): Promise<DocumentHighlight[] | null> {
    try {
      return await this.sendRequest<
        DocumentHighlightParams,
        DocumentHighlight[]
      >("textDocument/documentHighlight", params);
    } catch (error) {
      this.logger.error("Document highlight request failed", error);
      return null;
    }
  }

  /**
   * Request document symbols
   */
  async documentSymbol(
    params: DocumentSymbolParams,
  ): Promise<DocumentSymbol[] | SymbolInformation[] | null> {
    try {
      return await this.sendRequest<
        DocumentSymbolParams,
        DocumentSymbol[] | SymbolInformation[]
      >("textDocument/documentSymbol", params);
    } catch (error) {
      this.logger.error("Document symbol request failed", error);
      return null;
    }
  }

  /**
   * Request workspace symbols
   */
  async workspaceSymbol(
    params: WorkspaceSymbolParams,
  ): Promise<SymbolInformation[] | null> {
    try {
      return await this.sendRequest<WorkspaceSymbolParams, SymbolInformation[]>(
        "workspace/symbol",
        params,
      );
    } catch (error) {
      this.logger.error("Workspace symbol request failed", error);
      return null;
    }
  }

  /**
   * Request code actions
   */
  async codeAction(
    params: CodeActionParams,
  ): Promise<(Command | CodeAction)[] | null> {
    try {
      return await this.sendRequest<CodeActionParams, (Command | CodeAction)[]>(
        "textDocument/codeAction",
        params,
      );
    } catch (error) {
      this.logger.error("Code action request failed", error);
      return null;
    }
  }

  /**
   * Resolve a code action
   */
  async codeActionResolve(codeAction: CodeAction): Promise<CodeAction | null> {
    try {
      return await this.sendRequest<CodeAction, CodeAction>(
        "codeAction/resolve",
        codeAction,
      );
    } catch (error) {
      this.logger.error("Code action resolve failed", error);
      return null;
    }
  }

  /**
   * Request code lens
   */
  async codeLens(params: CodeLensParams): Promise<CodeLens[] | null> {
    try {
      return await this.sendRequest<CodeLensParams, CodeLens[]>(
        "textDocument/codeLens",
        params,
      );
    } catch (error) {
      this.logger.error("Code lens request failed", error);
      return null;
    }
  }

  /**
   * Resolve a code lens
   */
  async codeLensResolve(codeLens: CodeLens): Promise<CodeLens | null> {
    try {
      return await this.sendRequest<CodeLens, CodeLens>(
        "codeLens/resolve",
        codeLens,
      );
    } catch (error) {
      this.logger.error("Code lens resolve failed", error);
      return null;
    }
  }

  /**
   * Request document links
   */
  async documentLink(
    params: DocumentLinkParams,
  ): Promise<DocumentLink[] | null> {
    try {
      return await this.sendRequest<DocumentLinkParams, DocumentLink[]>(
        "textDocument/documentLink",
        params,
      );
    } catch (error) {
      this.logger.error("Document link request failed", error);
      return null;
    }
  }

  /**
   * Resolve a document link
   */
  async documentLinkResolve(
    documentLink: DocumentLink,
  ): Promise<DocumentLink | null> {
    try {
      return await this.sendRequest<DocumentLink, DocumentLink>(
        "documentLink/resolve",
        documentLink,
      );
    } catch (error) {
      this.logger.error("Document link resolve failed", error);
      return null;
    }
  }

  /**
   * Request document formatting
   */
  async documentFormatting(
    params: DocumentFormattingParams,
  ): Promise<TextEdit[] | null> {
    try {
      return await this.sendRequest<DocumentFormattingParams, TextEdit[]>(
        "textDocument/formatting",
        params,
      );
    } catch (error) {
      this.logger.error("Document formatting request failed", error);
      return null;
    }
  }

  /**
   * Request document range formatting
   */
  async documentRangeFormatting(
    params: DocumentRangeFormattingParams,
  ): Promise<TextEdit[] | null> {
    try {
      return await this.sendRequest<DocumentRangeFormattingParams, TextEdit[]>(
        "textDocument/rangeFormatting",
        params,
      );
    } catch (error) {
      this.logger.error("Document range formatting request failed", error);
      return null;
    }
  }

  /**
   * Request document on type formatting
   */
  async documentOnTypeFormatting(
    params: DocumentOnTypeFormattingParams,
  ): Promise<TextEdit[] | null> {
    try {
      return await this.sendRequest<DocumentOnTypeFormattingParams, TextEdit[]>(
        "textDocument/onTypeFormatting",
        params,
      );
    } catch (error) {
      this.logger.error("Document on type formatting request failed", error);
      return null;
    }
  }

  /**
   * Request rename
   */
  async rename(params: RenameParams): Promise<WorkspaceEdit | null> {
    try {
      return await this.sendRequest<RenameParams, WorkspaceEdit>(
        "textDocument/rename",
        params,
      );
    } catch (error) {
      this.logger.error("Rename request failed", error);
      return null;
    }
  }

  /**
   * Prepare rename
   */
  async prepareRename(
    params: PrepareRenameParams,
  ): Promise<Range | { range: Range; placeholder: string } | null> {
    try {
      return await this.sendRequest<
        PrepareRenameParams,
        Range | { range: Range; placeholder: string }
      >("textDocument/prepareRename", params);
    } catch (error) {
      this.logger.error("Prepare rename request failed", error);
      return null;
    }
  }

  /**
   * Request folding ranges
   */
  async foldingRange(
    params: FoldingRangeParams,
  ): Promise<FoldingRange[] | null> {
    try {
      return await this.sendRequest<FoldingRangeParams, FoldingRange[]>(
        "textDocument/foldingRange",
        params,
      );
    } catch (error) {
      this.logger.error("Folding range request failed", error);
      return null;
    }
  }

  /**
   * Request selection ranges
   */
  async selectionRange(
    params: SelectionRangeParams,
  ): Promise<SelectionRange[] | null> {
    try {
      return await this.sendRequest<SelectionRangeParams, SelectionRange[]>(
        "textDocument/selectionRange",
        params,
      );
    } catch (error) {
      this.logger.error("Selection range request failed", error);
      return null;
    }
  }

  /**
   * Request semantic tokens
   */
  async semanticTokensFull(
    params: SemanticTokensParams,
  ): Promise<SemanticTokens | null> {
    try {
      return await this.sendRequest<SemanticTokensParams, SemanticTokens>(
        "textDocument/semanticTokens/full",
        params,
      );
    } catch (error) {
      this.logger.error("Semantic tokens request failed", error);
      return null;
    }
  }

  /**
   * Execute a command
   */
  async executeCommand(params: ExecuteCommandParams): Promise<any> {
    try {
      return await this.sendRequest<ExecuteCommandParams, any>(
        "workspace/executeCommand",
        params,
      );
    } catch (error) {
      this.logger.error("Execute command failed", error);
      return null;
    }
  }

  // ===== Workspace Methods =====

  /**
   * Apply a workspace edit
   */
  async applyEdit(params: { edit: WorkspaceEdit; label?: string }): Promise<{
    applied: boolean;
  } | null> {
    try {
      return await this.sendRequest<typeof params, { applied: boolean }>(
        "workspace/applyEdit",
        params,
      );
    } catch (error) {
      this.logger.error("Apply edit failed", error);
      return null;
    }
  }

  // ===== Diagnostic Management =====

  /**
   * Get diagnostics for a specific document URI
   */
  getDiagnostics(uri: string): Diagnostic[] | undefined {
    return this.diagnostics.get(uri);
  }

  /**
   * Request diagnostics using pull-based diagnostics (LSP 3.17+)
   * This is the newer way to get diagnostics on-demand
   */
  async pullDiagnostics(uri: string): Promise<Diagnostic[] | null> {
    try {
      this.logger.debug(`Pulling diagnostics for: ${uri}`);
      const result = await this.sendRequest<any, any>(
        "textDocument/diagnostic",
        {
          textDocument: { uri },
        },
      );

      if (result && typeof result === "object") {
        // Handle full document diagnostic report
        if ("kind" in result && result.kind === "full" && "items" in result) {
          return result.items as Diagnostic[];
        }
        // Handle unchanged report
        if ("kind" in result && result.kind === "unchanged") {
          return this.diagnostics.get(uri) || [];
        }
        // Handle workspace diagnostic report (might be returned in some cases)
        if ("items" in result && Array.isArray(result.items)) {
          return result.items as Diagnostic[];
        }
      }
      return null;
    } catch (error: any) {
      // Server might not support pull-based diagnostics
      if (error?.code === -32601) {
        // Method not found
        this.logger.debug("Server does not support pull-based diagnostics");
      } else {
        this.logger.error("Pull diagnostics failed", error);
      }
      return null;
    }
  }

  /**
   * Wait for diagnostics to be received for a specific URI
   * First tries to wait for push-based diagnostics, then falls back to pull-based
   */
  async waitForDiagnostics(
    uri: string,
    timeout: number = 5000,
  ): Promise<Diagnostic[]> {
    // Check if we already have diagnostics
    const existing = this.diagnostics.get(uri);
    if (existing !== undefined) {
      return existing;
    }

    // Try to set up push-based diagnostic waiting with a shorter timeout
    const pushTimeout = Math.min(timeout / 2, 2000);

    try {
      return await new Promise<Diagnostic[]>((resolve, reject) => {
        // Set up callback to wait for push diagnostics
        const callback = (receivedUri: string, diagnostics: Diagnostic[]) => {
          if (receivedUri === uri) {
            this.diagnosticCallbacks = this.diagnosticCallbacks.filter(
              (cb) => cb !== callback,
            );
            resolve(diagnostics);
          }
        };

        this.diagnosticCallbacks.push(callback);

        // Set timeout for push-based
        setTimeout(() => {
          this.diagnosticCallbacks = this.diagnosticCallbacks.filter(
            (cb) => cb !== callback,
          );
          reject(new Error(`Push-based diagnostic timeout`));
        }, pushTimeout);
      });
    } catch (pushError) {
      // Push-based failed, try pull-based
      this.logger.debug(
        `Push-based diagnostics timed out, trying pull-based for ${uri}`,
      );

      // Try pull-based diagnostics
      const pullResult = await this.pullDiagnostics(uri);
      if (pullResult !== null) {
        // Store the diagnostics for future use
        this.diagnostics.set(uri, pullResult);
        return pullResult;
      }

      // If pull-based also failed, wait a bit more for push-based
      const remainingTimeout = timeout - pushTimeout;
      if (remainingTimeout > 0) {
        return new Promise<Diagnostic[]>((resolve, reject) => {
          const callback = (receivedUri: string, diagnostics: Diagnostic[]) => {
            if (receivedUri === uri) {
              this.diagnosticCallbacks = this.diagnosticCallbacks.filter(
                (cb) => cb !== callback,
              );
              resolve(diagnostics);
            }
          };

          this.diagnosticCallbacks.push(callback);

          setTimeout(() => {
            this.diagnosticCallbacks = this.diagnosticCallbacks.filter(
              (cb) => cb !== callback,
            );
            // Final check of stored diagnostics
            const stored = this.diagnostics.get(uri);
            if (stored !== undefined) {
              resolve(stored);
            } else {
              reject(new Error(`Timeout waiting for diagnostics for ${uri}`));
            }
          }, remainingTimeout);
        });
      }

      throw new Error(`Timeout waiting for diagnostics for ${uri}`);
    }
  }

  /**
   * Clear all stored diagnostics
   */
  clearDiagnostics(): void {
    this.diagnostics.clear();
  }

  // ===== Utility Methods =====

  /**
   * Check if the server process is still alive
   */
  isProcessAlive(): boolean {
    return this.process && !this.process.killed;
  }

  /**
   * Get the number of pending requests
   */
  getPendingRequestCount(): number {
    return this.pendingRequests.size;
  }

  /**
   * Get list of pending request methods
   */
  getPendingRequests(): string[] {
    return Array.from(this.pendingRequests.values());
  }

  /**
   * Dispose of the client and close connections
   */
  dispose(): void {
    // Clear all callbacks
    this.diagnosticCallbacks = [];
    this.removeAllListeners();

    // Close the connection if it exists
    if (this.connection) {
      try {
        this.connection.end();
        this.connection.dispose();
      } catch (error) {
        this.logger.error("Error disposing connection", error);
      }
      this.connection = null;
    }

    // Kill the process if it's still running
    if (this.process && !this.process.killed) {
      try {
        this.process.kill();
      } catch (error) {
        this.logger.error("Error killing process", error);
      }
    }
  }
}

// ===== Logger Implementation =====

enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4,
}

class Logger {
  constructor(private level: LogLevel) {}

  debug(message: string, ...args: any[]): void {
    if (this.level <= LogLevel.DEBUG) {
      console.debug(`[DEBUG] ${message}`, ...args);
    }
  }

  info(message: string, ...args: any[]): void {
    if (this.level <= LogLevel.INFO) {
      console.info(`[INFO] ${message}`, ...args);
    }
  }

  warn(message: string, ...args: any[]): void {
    if (this.level <= LogLevel.WARN) {
      console.warn(`[WARN] ${message}`, ...args);
    }
  }

  error(message: string, ...args: any[]): void {
    if (this.level <= LogLevel.ERROR) {
      console.error(`[ERROR] ${message}`, ...args);
    }
  }
}

// ===== Type Definitions =====

export interface TypedLSPClientOptions {
  logLevel?: LogLevel;
}

// ===== Helper Functions =====

/**
 * Helper to create position
 */
export function createPosition(line: number, character: number): Position {
  return { line, character };
}

/**
 * Helper to create range
 */
export function createRange(
  startLine: number,
  startChar: number,
  endLine: number,
  endChar: number,
): Range {
  return {
    start: createPosition(startLine, startChar),
    end: createPosition(endLine, endChar),
  };
}

/**
 * Helper to create text document identifier
 */
export function createTextDocumentIdentifier(
  uri: string,
): TextDocumentIdentifier {
  return { uri };
}

/**
 * Helper to create versioned text document identifier
 */
export function createVersionedTextDocumentIdentifier(
  uri: string,
  version: number,
): VersionedTextDocumentIdentifier {
  return { uri, version };
}

/**
 * Helper to create text document item
 */
export function createTextDocumentItem(
  uri: string,
  languageId: string,
  version: number,
  text: string,
): TextDocumentItem {
  return {
    uri,
    languageId,
    version,
    text,
  };
}

/**
 * Helper to create DidOpenTextDocumentParams
 */
export function createDidOpenParams(
  uri: string,
  languageId: string,
  version: number,
  text: string,
): DidOpenTextDocumentParams {
  return {
    textDocument: createTextDocumentItem(uri, languageId, version, text),
  };
}

/**
 * Helper to create DidChangeTextDocumentParams
 */
export function createDidChangeParams(
  uri: string,
  version: number,
  changes: TextDocumentContentChangeEvent[],
): DidChangeTextDocumentParams {
  return {
    textDocument: createVersionedTextDocumentIdentifier(uri, version),
    contentChanges: changes,
  };
}

/**
 * Helper to create DidCloseTextDocumentParams
 */
export function createDidCloseParams(uri: string): DidCloseTextDocumentParams {
  return {
    textDocument: createTextDocumentIdentifier(uri),
  };
}

/**
 * Helper to create TextDocumentPositionParams
 */
export function createTextDocumentPositionParams(
  uri: string,
  line: number,
  character: number,
): TextDocumentPositionParams {
  return {
    textDocument: createTextDocumentIdentifier(uri),
    position: createPosition(line, character),
  };
}

/**
 * Helper to create CodeActionContext
 */
export function createCodeActionContext(
  diagnostics: Diagnostic[],
  only?: string[],
): CodeActionContext {
  return {
    diagnostics,
    only,
  };
}

/**
 * Helper to create FormattingOptions
 */
export function createFormattingOptions(
  tabSize: number = 2,
  insertSpaces: boolean = true,
): FormattingOptions {
  return {
    tabSize,
    insertSpaces,
  };
}

// Re-export LogLevel for external use
export { LogLevel };
