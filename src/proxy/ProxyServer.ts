import {
  CodeAction,
  CodeActionParams,
  CompletionItem,
  createConnection,
  DocumentFormattingParams,
  DocumentSymbol,
  DocumentSymbolParams,
  Hover,
  InitializeParams,
  InitializeResult,
  Location,
  ProposedFeatures,
  ReferenceParams,
  RenameParams,
  SignatureHelp,
  TextDocumentPositionParams,
  TextDocuments,
  TextDocumentSyncKind,
  TextEdit,
  WorkspaceEdit,
} from "vscode-languageserver/node";

import { TextDocument } from "vscode-languageserver-textdocument";
import {
  isSvelteFile,
  ParsedDocument,
  parseDocument,
  shouldUseSvelteServer,
  shouldUseTypeScriptServer,
} from "../utils/documentParser";
import { getTsServerPluginConfig } from "../utils/tsconfig";
import { LSPServerProcess } from "./LSPServerProcess";

export class ProxyServer {
  private connection = createConnection(ProposedFeatures.all);
  private documents = new TextDocuments(TextDocument);
  private parsedDocuments = new Map<string, ParsedDocument>();

  private svelteServer: LSPServerProcess;
  private typescriptServer: LSPServerProcess;

  constructor() {
    // Configure Svelte Language Server with VSCode-style flags
    this.svelteServer = new LSPServerProcess({
      command: "node",
      args: [
        "--experimental-modules",
        require.resolve("svelte-language-server/bin/server.js"),
        "--stdio",
      ],
      name: "Svelte",
    });

    // Configure TypeScript Language Server with Svelte plugin
    this.typescriptServer = new LSPServerProcess({
      command: "typescript-language-server",
      args: ["--stdio"],
      name: "TypeScript",
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // Connection handlers
    this.connection.onInitialize(this.onInitialize.bind(this));
    this.connection.onInitialized(this.onInitialized.bind(this));

    // Document lifecycle
    this.documents.onDidOpen(this.onDidOpenDocument.bind(this));
    this.documents.onDidChangeContent(this.onDidChangeDocument.bind(this));
    this.documents.onDidClose(this.onDidCloseDocument.bind(this));

    // Language features
    this.connection.onCompletion(this.onCompletion.bind(this));
    this.connection.onHover(this.onHover.bind(this));
    this.connection.onDefinition(this.onDefinition.bind(this));
    this.connection.onReferences(this.onReferences.bind(this));
    this.connection.onSignatureHelp(this.onSignatureHelp.bind(this));
    this.connection.onDocumentSymbol(this.onDocumentSymbol.bind(this));
    this.connection.onCodeAction(this.onCodeAction.bind(this));
    this.connection.onRenameRequest(this.onRename.bind(this));
    this.connection.onDocumentFormatting(this.onDocumentFormatting.bind(this));

    this.documents.listen(this.connection);
  }

  async start(): Promise<void> {
    // Start both servers
    await Promise.all([
      this.svelteServer.start(),
      this.typescriptServer.start(),
    ]);

    // Set up notification forwarding AFTER servers are started
    this.setupNotificationForwarding();

    this.connection.listen();
    console.log("Svelte Proxy LSP Server started");
  }

  async stop(): Promise<void> {
    await Promise.all([this.svelteServer.stop(), this.typescriptServer.stop()]);
  }

  private async onInitialize(
    params: InitializeParams,
  ): Promise<InitializeResult> {
    // Get Svelte plugin configuration
    const sveltePlugin = getTsServerPluginConfig();

    // Create enhanced params for TypeScript server with Svelte plugin
    const tsParams = {
      ...params,
      initializationOptions: {
        ...params.initializationOptions,
        plugins: sveltePlugin ? [sveltePlugin] : [],
        preferences: {
          ...params.initializationOptions?.preferences,
          includePackageJsonAutoImports: "auto",
          includeCompletionsForModuleExports: true,
          includeAutomaticOptionalChainCompletions: true,
        },
        hostInfo: "svelte-proxy-lsp",
      },
    };

    // Create enhanced params for Svelte server with official configuration structure
    const svelteParams = {
      ...params,
      initializationOptions: {
        configuration: {
          svelte: {
            plugin: {
              typescript: {
                enable: true,
                hover: { enable: true },
                diagnostics: { enable: true },
                completions: { enable: true },
                codeActions: { enable: true },
                signatureHelp: { enable: true },
                semanticTokens: { enable: true },
              },
              svelte: {
                enable: true,
                hover: { enable: true },
                diagnostics: { enable: true },
                completions: { enable: true },
                codeActions: { enable: true },
              },
              html: {
                enable: true,
                hover: { enable: true },
                completions: { enable: true },
              },
              css: {
                enable: true,
                hover: { enable: true },
                completions: { enable: true },
                diagnostics: { enable: true },
              },
            },
            compilerWarnings: {},
            defaultScriptLanguage: "ts",
          },
          prettier: {},
          emmet: {},
          javascript: {
            preferences: { includePackageJsonAutoImports: "auto" },
          },
          typescript: {
            preferences: { includePackageJsonAutoImports: "auto" },
          },
        },
        dontFilterIncompleteCompletions: true,
        isTrusted: true,
      },
    };

    console.log("Initializing servers...");
    console.log("TypeScript server will use Svelte plugin:", !!sveltePlugin);

    // Initialize both servers with proper configurations
    const [svelteCapabilities, tsCapabilities] = await Promise.all([
      this.svelteServer.initialize(svelteParams),
      this.typescriptServer.initialize(tsParams),
    ]);

    // Merge capabilities
    const mergedCapabilities = this.mergeCapabilities(
      svelteCapabilities,
      tsCapabilities,
    );

    return {
      capabilities: mergedCapabilities.capabilities,
      serverInfo: {
        name: "Svelte Proxy LSP",
        version: "1.0.0",
      },
    };
  }

  private setupNotificationForwarding(): void {
    // Forward diagnostics from Svelte server using the dedicated onDiagnostic method
    this.svelteServer.onDiagnostic((params) => {
      console.log("Forwarding diagnostics from Svelte server:", params.uri);
      this.connection.sendDiagnostics(params);
    });

    // Forward diagnostics from TypeScript server using the dedicated onDiagnostic method
    this.typescriptServer.onDiagnostic((params) => {
      console.log("Forwarding diagnostics from TypeScript server:", params.uri);
      this.connection.sendDiagnostics(params);
    });

    // Forward other important notifications
    const notificationsToForward = [
      "window/showMessage",
      "window/logMessage",
      "telemetry/event",
      "$/progress",
    ];

    for (const notification of notificationsToForward) {
      this.svelteServer.onNotification(notification, (params: any) => {
        this.connection.sendNotification(notification, params);
      });

      this.typescriptServer.onNotification(notification, (params: any) => {
        this.connection.sendNotification(notification, params);
      });
    }
  }

  private onInitialized(): void {
    console.log("Svelte Proxy LSP initialized");

    // Send initial configuration matching VSCode extension
    const initialConfig = {
      settings: {
        svelte: {
          enable: true,
          diagnostics: { enable: true },
          compilerWarnings: {},
          defaultScriptLanguage: "ts",
        },
        prettier: {},
        emmet: {},
        javascript: {
          preferences: { includePackageJsonAutoImports: "auto" },
        },
        typescript: {
          preferences: { includePackageJsonAutoImports: "auto" },
        },
        css: {},
        html: {},
      },
    };

    // Send initial configuration to both servers
    this.svelteServer.sendNotification(
      "workspace/didChangeConfiguration",
      initialConfig,
    );
    this.typescriptServer.sendNotification("workspace/didChangeConfiguration", {
      settings: {
        ...initialConfig.settings,
        typescript: {
          ...initialConfig.settings.typescript,
          plugins: [
            {
              name: "typescript-svelte-plugin",
              enabled: true,
            },
          ],
        },
      },
    });

    // Configure workspace settings for ongoing changes
    this.connection.onDidChangeConfiguration((change) => {
      // Forward configuration changes to both servers
      this.svelteServer.sendNotification(
        "workspace/didChangeConfiguration",
        change,
      );
      this.typescriptServer.sendNotification(
        "workspace/didChangeConfiguration",
        change,
      );
    });
  }

  private onDidOpenDocument(event: { document: TextDocument }): void {
    const document = event.document;
    console.log(`Opening document: ${document.uri}`);
    this.updateParsedDocument(document);
    this.syncDocumentOpen(document);
  }

  private onDidChangeDocument(event: { document: TextDocument }): void {
    const document = event.document;
    console.log(`Document changed: ${document.uri}`);
    this.updateParsedDocument(document);
    this.syncDocumentChange(document);
  }

  private onDidCloseDocument(event: { document: TextDocument }): void {
    const document = event.document;
    this.parsedDocuments.delete(document.uri);

    // Notify appropriate server of document close based on file type
    const closeParams = { textDocument: { uri: document.uri } };
    if (isSvelteFile(document.uri)) {
      this.svelteServer.sendNotification("textDocument/didClose", closeParams);
    } else if (
      document.uri.endsWith(".ts") ||
      document.uri.endsWith(".js") ||
      document.uri.endsWith(".tsx") ||
      document.uri.endsWith(".jsx")
    ) {
      this.typescriptServer.sendNotification(
        "textDocument/didClose",
        closeParams,
      );
    }
  }

  private updateParsedDocument(document: TextDocument): void {
    const parsed = parseDocument(
      document.uri,
      document.getText(),
      document.version,
    );
    this.parsedDocuments.set(document.uri, parsed);
  }

  private syncDocumentOpen(document: TextDocument): void {
    const docParams = {
      textDocument: {
        uri: document.uri,
        languageId: document.languageId,
        version: document.version,
        text: document.getText(),
      },
    };

    // Send to appropriate server based on file type
    if (isSvelteFile(document.uri)) {
      console.log(`Sending Svelte file to Svelte server: ${document.uri}`);
      this.svelteServer.sendNotification("textDocument/didOpen", docParams);
    } else if (
      document.uri.endsWith(".ts") ||
      document.uri.endsWith(".js") ||
      document.uri.endsWith(".tsx") ||
      document.uri.endsWith(".jsx")
    ) {
      console.log(
        `Sending TypeScript file to TypeScript server: ${document.uri}`,
      );
      this.typescriptServer.sendNotification("textDocument/didOpen", docParams);
    }
  }

  private syncDocumentChange(document: TextDocument): void {
    const changeParams = {
      textDocument: {
        uri: document.uri,
        version: document.version,
      },
      contentChanges: [
        {
          text: document.getText(),
        },
      ],
    };

    // Send change notifications to appropriate server based on file type
    if (isSvelteFile(document.uri)) {
      this.svelteServer.sendNotification(
        "textDocument/didChange",
        changeParams,
      );
    } else if (
      document.uri.endsWith(".ts") ||
      document.uri.endsWith(".js") ||
      document.uri.endsWith(".tsx") ||
      document.uri.endsWith(".jsx")
    ) {
      this.typescriptServer.sendNotification(
        "textDocument/didChange",
        changeParams,
      );
    }
  }

  private async onCompletion(
    params: TextDocumentPositionParams,
  ): Promise<CompletionItem[]> {
    const parsed = this.parsedDocuments.get(params.textDocument.uri);
    if (!parsed) {
      console.log(`No parsed document found for ${params.textDocument.uri}`);
      return [];
    }

    const results: CompletionItem[] = [];
    const useSvelte = shouldUseSvelteServer(parsed, params.position);
    const useTypeScript = shouldUseTypeScriptServer(parsed, params.position);

    console.log(`Completion request for ${params.textDocument.uri}`);
    console.log(`Will use Svelte: ${useSvelte}, TypeScript: ${useTypeScript}`);

    // Get completions from appropriate server based on file type
    if (useSvelte) {
      try {
        console.log("Requesting completion from Svelte server...");
        const svelteResults = await this.svelteServer.sendRequest<
          typeof params,
          CompletionItem[]
        >("textDocument/completion", params);
        console.log(
          `Svelte server returned:`,
          svelteResults ? "results" : "null",
        );
        if (Array.isArray(svelteResults)) {
          results.push(...svelteResults);
        } else if (svelteResults) {
          results.push(...((svelteResults as any)?.items || []));
        }
      } catch (error) {
        console.error("Svelte completion error:", error);
      }
    }

    if (useTypeScript) {
      try {
        console.log("Requesting completion from TypeScript server...");
        const tsResults = await this.typescriptServer.sendRequest<
          typeof params,
          CompletionItem[]
        >("textDocument/completion", params);
        console.log(
          `TypeScript server returned:`,
          tsResults ? "results" : "null",
        );
        if (Array.isArray(tsResults)) {
          results.push(...tsResults);
        } else if (tsResults) {
          results.push(...((tsResults as any)?.items || []));
        }
      } catch (error) {
        console.error("TypeScript completion error:", error);
      }
    }

    console.log(`Total completion results: ${results.length}`);
    return this.deduplicateCompletions(results);
  }

  private async onHover(
    params: TextDocumentPositionParams,
  ): Promise<Hover | null> {
    console.log(
      `🔍 Hover request for ${params.textDocument.uri} at line ${params.position.line}, char ${params.position.character}`,
    );

    const parsed = this.parsedDocuments.get(params.textDocument.uri);
    if (!parsed) {
      console.log("❌ No parsed document found for hover request");
      return null;
    }

    const useSvelte = shouldUseSvelteServer(parsed, params.position);
    const useTypeScript = shouldUseTypeScriptServer(parsed, params.position);

    console.log(`Will use Svelte: ${useSvelte}, TypeScript: ${useTypeScript}`);

    // Use appropriate server based on file type
    if (useSvelte) {
      try {
        console.log("🚀 Sending hover request to Svelte server...");
        const result = await this.svelteServer.sendRequest<
          typeof params,
          Hover | null
        >("textDocument/hover", params);
        console.log(
          "📥 Svelte server hover response:",
          result ? "Has result" : "No result",
        );
        return result;
      } catch (error) {
        console.error("❌ Svelte hover error:", error);
      }
    }

    if (useTypeScript) {
      try {
        console.log("🚀 Sending hover request to TypeScript server...");
        const result = await this.typescriptServer.sendRequest<
          typeof params,
          Hover | null
        >("textDocument/hover", params);
        console.log(
          "📥 TypeScript server hover response:",
          result ? "Has result" : "No result",
        );
        return result;
      } catch (error) {
        console.error("❌ TypeScript hover error:", error);
      }
    }

    console.log("❌ No server selected for hover request");
    return null;
  }

  private async onDefinition(
    params: TextDocumentPositionParams,
  ): Promise<Location[]> {
    const parsed = this.parsedDocuments.get(params.textDocument.uri);
    if (!parsed) return [];

    const results: Location[] = [];

    if (shouldUseTypeScriptServer(parsed, params.position)) {
      try {
        const tsResults = await this.typescriptServer.sendRequest<
          typeof params,
          Location[]
        >("textDocument/definition", params);
        results.push(...(tsResults || []));
      } catch (error) {
        console.error("TypeScript definition error:", error);
      }
    }

    if (shouldUseSvelteServer(parsed, params.position)) {
      try {
        const svelteResults = await this.svelteServer.sendRequest<
          typeof params,
          Location[]
        >("textDocument/definition", params);
        results.push(...(svelteResults || []));
      } catch (error) {
        console.error("Svelte definition error:", error);
      }
    }

    return this.deduplicateLocations(results);
  }

  private async onReferences(params: ReferenceParams): Promise<Location[]> {
    const parsed = this.parsedDocuments.get(params.textDocument.uri);
    if (!parsed) return [];

    const results: Location[] = [];

    if (shouldUseTypeScriptServer(parsed, params.position)) {
      try {
        const tsResults = await this.typescriptServer.sendRequest<
          typeof params,
          Location[]
        >("textDocument/references", params);
        results.push(...(tsResults || []));
      } catch (error) {
        console.error("TypeScript references error:", error);
      }
    }

    if (shouldUseSvelteServer(parsed, params.position)) {
      try {
        const svelteResults = await this.svelteServer.sendRequest<
          typeof params,
          Location[]
        >("textDocument/references", params);
        results.push(...(svelteResults || []));
      } catch (error) {
        console.error("Svelte references error:", error);
      }
    }

    return this.deduplicateLocations(results);
  }

  private async onSignatureHelp(
    params: TextDocumentPositionParams,
  ): Promise<SignatureHelp | null> {
    const parsed = this.parsedDocuments.get(params.textDocument.uri);
    if (!parsed) return null;

    // Prefer TypeScript for signature help in script regions
    if (shouldUseTypeScriptServer(parsed, params.position)) {
      try {
        const result = await this.typescriptServer.sendRequest<
          typeof params,
          SignatureHelp | null
        >("textDocument/signatureHelp", params);
        if (result) return result;
      } catch (error) {
        console.error("TypeScript signature help error:", error);
      }
    }

    if (shouldUseSvelteServer(parsed, params.position)) {
      try {
        return await this.svelteServer.sendRequest<
          typeof params,
          SignatureHelp | null
        >("textDocument/signatureHelp", params);
      } catch (error) {
        console.error("Svelte signature help error:", error);
      }
    }

    return null;
  }

  private async onDocumentSymbol(
    params: DocumentSymbolParams,
  ): Promise<DocumentSymbol[]> {
    const parsed = this.parsedDocuments.get(params.textDocument.uri);
    if (!parsed) return [];

    const results: DocumentSymbol[] = [];

    // Get symbols from both servers for Svelte files
    if (isSvelteFile(parsed.uri)) {
      try {
        const svelteResults = await this.svelteServer.sendRequest<
          typeof params,
          DocumentSymbol[]
        >("textDocument/documentSymbol", params);
        results.push(...(svelteResults || []));
      } catch (error) {
        console.error("Svelte document symbol error:", error);
      }
    }

    try {
      const tsResults = await this.typescriptServer.sendRequest<
        typeof params,
        DocumentSymbol[]
      >("textDocument/documentSymbol", params);
      results.push(...(tsResults || []));
    } catch (error) {
      console.error("TypeScript document symbol error:", error);
    }

    return results;
  }

  private async onCodeAction(params: CodeActionParams): Promise<CodeAction[]> {
    const parsed = this.parsedDocuments.get(params.textDocument.uri);
    if (!parsed) return [];

    const results: CodeAction[] = [];

    if (shouldUseTypeScriptServer(parsed, params.range.start)) {
      try {
        const tsResults = await this.typescriptServer.sendRequest<
          typeof params,
          CodeAction[]
        >("textDocument/codeAction", params);
        results.push(...(tsResults || []));
      } catch (error) {
        console.error("TypeScript code action error:", error);
      }
    }

    if (shouldUseSvelteServer(parsed, params.range.start)) {
      try {
        const svelteResults = await this.svelteServer.sendRequest<
          typeof params,
          CodeAction[]
        >("textDocument/codeAction", params);
        results.push(...(svelteResults || []));
      } catch (error) {
        console.error("Svelte code action error:", error);
      }
    }

    return results;
  }

  private async onRename(params: RenameParams): Promise<WorkspaceEdit | null> {
    const parsed = this.parsedDocuments.get(params.textDocument.uri);
    if (!parsed) return null;

    // Try TypeScript first, then Svelte
    if (shouldUseTypeScriptServer(parsed, params.position)) {
      try {
        const result = await this.typescriptServer.sendRequest<
          typeof params,
          WorkspaceEdit | null
        >("textDocument/rename", params);
        if (result) return result;
      } catch (error) {
        console.error("TypeScript rename error:", error);
      }
    }

    if (shouldUseSvelteServer(parsed, params.position)) {
      try {
        return await this.svelteServer.sendRequest<
          typeof params,
          WorkspaceEdit | null
        >("textDocument/rename", params);
      } catch (error) {
        console.error("Svelte rename error:", error);
      }
    }

    return null;
  }

  private async onDocumentFormatting(
    params: DocumentFormattingParams,
  ): Promise<TextEdit[]> {
    const parsed = this.parsedDocuments.get(params.textDocument.uri);
    if (!parsed) return [];

    // Prefer Svelte formatter for .svelte files
    if (isSvelteFile(parsed.uri)) {
      try {
        const result = await this.svelteServer.sendRequest<
          typeof params,
          TextEdit[]
        >("textDocument/formatting", params);
        if (result && result.length > 0) return result;
      } catch (error) {
        console.error("Svelte formatting error:", error);
      }
    }

    try {
      return (
        (await this.typescriptServer.sendRequest<typeof params, TextEdit[]>(
          "textDocument/formatting",
          params,
        )) || []
      );
    } catch (error) {
      console.error("TypeScript formatting error:", error);
      return [];
    }
  }

  private mergeCapabilities(
    svelteCapabilities: InitializeResult,
    tsCapabilities: InitializeResult,
  ): InitializeResult {
    return {
      capabilities: {
        textDocumentSync: TextDocumentSyncKind.Incremental,
        completionProvider: {
          resolveProvider: true,
          triggerCharacters: [
            ...(svelteCapabilities.capabilities.completionProvider
              ?.triggerCharacters || []),
            ...(tsCapabilities.capabilities.completionProvider
              ?.triggerCharacters || []),
          ],
        },
        hoverProvider: true,
        signatureHelpProvider: {
          triggerCharacters: [
            ...(svelteCapabilities.capabilities.signatureHelpProvider
              ?.triggerCharacters || []),
            ...(tsCapabilities.capabilities.signatureHelpProvider
              ?.triggerCharacters || []),
          ],
        },
        definitionProvider: true,
        referencesProvider: true,
        documentSymbolProvider: true,
        codeActionProvider: true,
        renameProvider: true,
        documentFormattingProvider: true,
      },
    };
  }

  private deduplicateCompletions(
    completions: CompletionItem[],
  ): CompletionItem[] {
    const seen = new Set<string>();
    return completions.filter((item) => {
      const key = `${item.label}:${item.kind}:${item.detail || ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private deduplicateLocations(locations: Location[]): Location[] {
    const seen = new Set<string>();
    return locations.filter((location) => {
      const key = `${location.uri}:${location.range.start.line}:${location.range.start.character}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // Test methods (expose private methods for testing)
  public async testInitialize(
    params: InitializeParams,
  ): Promise<InitializeResult> {
    return this.onInitialize(params);
  }

  public testUpdateParsedDocument(document: TextDocument): void {
    this.updateParsedDocument(document);
  }

  public async testCompletion(
    params: TextDocumentPositionParams,
  ): Promise<CompletionItem[]> {
    return this.onCompletion(params);
  }

  public async testHover(
    params: TextDocumentPositionParams,
  ): Promise<Hover | null> {
    return this.onHover(params);
  }
}
