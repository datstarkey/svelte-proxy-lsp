import { ChildProcess } from "child_process";
import { EventEmitter } from "events";
import {
  createMessageConnection,
  MessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
} from "vscode-jsonrpc/node";

import {
  ApplyWorkspaceEditParams,
  ApplyWorkspaceEditRequest,
  CodeAction,
  CodeActionContext,
  CodeActionParams,
  CodeActionRequest,
  CodeActionResolveRequest,
  CodeLens,
  CodeLensParams,
  CodeLensRequest,
  CodeLensResolveRequest,
  Command,
  CompletionItem,
  CompletionList,
  CompletionParams,
  CompletionRequest,
  CompletionResolveRequest,
  DeclarationParams,
  DeclarationRequest,
  DefinitionRequest,
  Diagnostic,
  DidChangeTextDocumentNotification,
  DidChangeTextDocumentParams,
  DidCloseTextDocumentNotification,
  DidCloseTextDocumentParams,
  DidOpenTextDocumentNotification,
  DidOpenTextDocumentParams,
  DidSaveTextDocumentNotification,
  DocumentFormattingParams,
  DocumentFormattingRequest,
  DocumentHighlight,
  DocumentHighlightParams,
  DocumentHighlightRequest,
  DocumentLink,
  DocumentLinkParams,
  DocumentLinkRequest,
  DocumentLinkResolveRequest,
  DocumentOnTypeFormattingParams,
  DocumentOnTypeFormattingRequest,
  DocumentRangeFormattingParams,
  DocumentRangeFormattingRequest,
  DocumentSymbol,
  DocumentSymbolParams,
  DocumentSymbolRequest,
  ExecuteCommandParams,
  ExecuteCommandRequest,
  ExitNotification,
  FoldingRange,
  FoldingRangeParams,
  FoldingRangeRequest,
  FormattingOptions,
  Hover,
  HoverParams,
  HoverRequest,
  ImplementationParams,
  ImplementationRequest,
  InitializeParams,
  InitializeRequest,
  InitializeResult,
  InitializedNotification,
  Location,
  LocationLink,
  LogMessageNotification,
  Position,
  PrepareRenameParams,
  PrepareRenameRequest,
  PublishDiagnosticsNotification,
  PublishDiagnosticsParams,
  Range,
  ReferenceParams,
  ReferencesRequest,
  RenameParams,
  RenameRequest,
  SelectionRange,
  SelectionRangeParams,
  SelectionRangeRequest,
  SemanticTokens,
  SemanticTokensParams,
  SemanticTokensRequest,
  ShowMessageNotification,
  ShutdownRequest,
  SignatureHelp,
  SignatureHelpParams,
  SignatureHelpRequest,
  SymbolInformation,
  TelemetryEventNotification,
  TextDocumentContentChangeEvent,
  TextDocumentIdentifier,
  TextDocumentItem,
  TextDocumentPositionParams,
  TextEdit,
  TypeDefinitionParams,
  TypeDefinitionRequest,
  VersionedTextDocumentIdentifier,
  WillSaveTextDocumentNotification,
  WillSaveTextDocumentWaitUntilRequest,
  WorkspaceEdit,
  WorkspaceSymbolParams,
  WorkspaceSymbolRequest,
  type LogMessageParams,
  type ShowMessageParams,
  type WorkspaceSymbol,
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

  // ===== Helper Methods =====

  // ===== Lifecycle Methods =====

  /**
   * Initialize the language server
   */
  async initialize(params: InitializeParams): Promise<InitializeResult> {
    if (!this.connection) {
      throw new Error("Connection not established");
    }
    this.logger.info("Initializing language server");
    const result = await this.connection.sendRequest(
      InitializeRequest.type,
      params,
    );
    this.isInitialized = true;
    return result;
  }

  /**
   * Send initialized notification
   */
  initialized(): void {
    if (!this.connection) {
      this.logger.warn("Cannot send initialized - no connection");
      return;
    }
    this.logger.info("Sending initialized notification");
    this.connection.sendNotification(InitializedNotification.type, {});
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
      await this.connection.sendRequest(ShutdownRequest.type);
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
      this.connection.sendNotification(ExitNotification.type);
    } catch (error) {
      this.logger.error("Exit notification failed", error);
    }
  }

  // ===== Document Synchronization =====

  /**
   * Open a text document
   */
  didOpen(params: DidOpenTextDocumentParams): void {
    if (!this.connection) {
      this.logger.warn("Cannot send didOpen - no connection");
      return;
    }
    this.logger.debug(`Opening document: ${params.textDocument.uri}`);
    this.connection.sendNotification(DidOpenTextDocumentNotification.type, params);
  }

  /**
   * Change a text document
   */
  didChange(params: DidChangeTextDocumentParams): void {
    if (!this.connection) {
      this.logger.warn("Cannot send didChange - no connection");
      return;
    }
    this.logger.debug(`Changing document: ${params.textDocument.uri}`);
    this.connection.sendNotification(DidChangeTextDocumentNotification.type, params);
  }

  /**
   * Save a text document
   */
  didSave(params: {
    textDocument: TextDocumentIdentifier;
    text?: string;
  }): void {
    if (!this.connection) {
      this.logger.warn("Cannot send didSave - no connection");
      return;
    }
    this.logger.debug(`Saving document: ${params.textDocument.uri}`);
    this.connection.sendNotification(DidSaveTextDocumentNotification.type, params);
  }

  /**
   * Close a text document
   */
  didClose(params: DidCloseTextDocumentParams): void {
    if (!this.connection) {
      this.logger.warn("Cannot send didClose - no connection");
      return;
    }
    this.logger.debug(`Closing document: ${params.textDocument.uri}`);
    this.connection.sendNotification(DidCloseTextDocumentNotification.type, params);
  }

  /**
   * Will save a text document
   */
  willSave(params: {
    textDocument: TextDocumentIdentifier;
    reason: number;
  }): void {
    if (!this.connection) {
      this.logger.warn("Cannot send willSave - no connection");
      return;
    }
    this.logger.debug(`Will save document: ${params.textDocument.uri}`);
    this.connection.sendNotification(WillSaveTextDocumentNotification.type, params);
  }

  /**
   * Will save a text document and wait for edits
   */
  async willSaveWaitUntil(params: {
    textDocument: TextDocumentIdentifier;
    reason: number;
  }): Promise<TextEdit[] | null> {
    if (!this.connection) {
      this.logger.warn("Cannot send willSaveWaitUntil - no connection");
      return null;
    }
    this.logger.debug(`Will save and wait: ${params.textDocument.uri}`);
    try {
      const result = await this.connection.sendRequest(
        WillSaveTextDocumentWaitUntilRequest.type,
        params,
      );
      return result || null;
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
      const result = await this.connection?.sendRequest(
        HoverRequest.type,
        params,
      );
      return result || null;
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
      const result = await this.connection?.sendRequest(
        CompletionRequest.type,
        params,
      );
      return result || null;
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
      const result = await this.connection?.sendRequest(
        CompletionResolveRequest.type,
        item,
      );
      return result || null;
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
      const result = await this.connection?.sendRequest(
        SignatureHelpRequest.type,
        params,
      );
      return result || null;
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
      const result = await this.connection?.sendRequest(
        DefinitionRequest.type,
        params,
      );
      return result || null;
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
      const result = await this.connection?.sendRequest(
        TypeDefinitionRequest.type,
        params,
      );
      return result || null;
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
      const result = await this.connection?.sendRequest(
        ImplementationRequest.type,
        params,
      );
      return result || null;
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
      const result = await this.connection?.sendRequest(
        DeclarationRequest.type,
        params,
      );
      return result || null;
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
      const result = await this.connection?.sendRequest(
        ReferencesRequest.type,
        params,
      );
      return result || null;
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
      const result = await this.connection?.sendRequest(
        DocumentHighlightRequest.type,
        params,
      );
      return result || null;
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
      const result = await this.connection?.sendRequest(
        DocumentSymbolRequest.type,
        params,
      );
      // Some servers return null instead of empty array
      return result || [];
    } catch (error) {
      this.logger.error("Document symbol request failed", error);
      return [];
    }
  }

  /**
   * Request workspace symbols
   */
  async workspaceSymbol(
    params: WorkspaceSymbolParams,
  ): Promise<SymbolInformation[] | WorkspaceSymbol[]> {
    try {
      // WRONG
      // const result = await this.sendRequest<SymbolInformation[] | null>(
      //   "workspace/symbol",
      //   params,
      // );
      // Some servers return null instead of empty array

      //Right
      const result = await this.connection?.sendRequest(
        WorkspaceSymbolRequest.type,
        params,
      );
      return result || [];
    } catch (error) {
      this.logger.error("Workspace symbol request failed", error);
      // Return empty array instead of null for consistency
      return [];
    }
  }

  /**
   * Request code actions
   */
  async codeAction(
    params: CodeActionParams,
  ): Promise<(Command | CodeAction)[] | null> {
    try {
      const result = await this.connection?.sendRequest(
        CodeActionRequest.type,
        params,
      );
      return result || null;
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
      const result = await this.connection?.sendRequest(
        CodeActionResolveRequest.type,
        codeAction,
      );
      return result || null;
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
      const result = await this.connection?.sendRequest(
        CodeLensRequest.type,
        params,
      );
      return result || null;
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
      const result = await this.connection?.sendRequest(
        CodeLensResolveRequest.type,
        codeLens,
      );
      return result || null;
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
      const result = await this.connection?.sendRequest(
        DocumentLinkRequest.type,
        params,
      );
      return result || null;
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
      const result = await this.connection?.sendRequest(
        DocumentLinkResolveRequest.type,
        documentLink,
      );
      return result || null;
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
      const result = await this.connection?.sendRequest(
        DocumentFormattingRequest.type,
        params,
      );
      return result || null;
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
      const result = await this.connection?.sendRequest(
        DocumentRangeFormattingRequest.type,
        params,
      );
      return result || null;
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
      const result = await this.connection?.sendRequest(
        DocumentOnTypeFormattingRequest.type,
        params,
      );
      return result || null;
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
      const result = await this.connection?.sendRequest(
        RenameRequest.type,
        params,
      );
      return result || null;
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
  ): Promise<Range | { range: Range; placeholder: string } | { defaultBehavior: boolean } | null> {
    try {
      const result = await this.connection?.sendRequest(
        PrepareRenameRequest.type,
        params,
      );
      return result || null;
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
      const result = await this.connection?.sendRequest(
        FoldingRangeRequest.type,
        params,
      );
      return result || null;
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
      const result = await this.connection?.sendRequest(
        SelectionRangeRequest.type,
        params,
      );
      return result || null;
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
      const result = await this.connection?.sendRequest(
        SemanticTokensRequest.type,
        params,
      );
      return result || null;
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
      const result = await this.connection?.sendRequest(
        ExecuteCommandRequest.type,
        params,
      );
      return result || null;
    } catch (error) {
      this.logger.error("Execute command failed", error);
      return null;
    }
  }

  // ===== Workspace Methods =====

  /**
   * Apply a workspace edit
   */
  async applyEdit(params: ApplyWorkspaceEditParams): Promise<{
    applied: boolean;
  } | null> {
    try {
      const result = await this.connection?.sendRequest(
        ApplyWorkspaceEditRequest.type,
        params,
      );
      return result || null;
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
      // Note: There's no standard type for pull diagnostics in vscode-languageserver-protocol yet
      // This is a newer LSP 3.17+ feature, so we'll use direct string method for now
      const result = await this.connection?.sendRequest(
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
