import { TextDocuments } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { LSPServerProcess } from './LSPServerProcess';
import { parseDocument, shouldUseSvelteServer, shouldUseTypeScriptServer, isSvelteFile, ParsedDocument } from '../utils/documentParser';
import { getTsServerPluginConfig } from '../utils/tsconfig';
import type { InitializeParams, InitializeResult, CompletionItem, TextDocumentPositionParams, Hover } from 'vscode-languageserver/node';

export class TestProxyServer {
  private parsedDocuments = new Map<string, ParsedDocument>();
  private svelteServer: LSPServerProcess;
  private typescriptServer: LSPServerProcess;

  constructor() {
    // Configure Svelte Language Server
    this.svelteServer = new LSPServerProcess({
      command: 'svelte-language-server',
      args: ['--stdio'],
      name: 'Svelte'
    });

    // Configure TypeScript Language Server with Svelte plugin
    this.typescriptServer = new LSPServerProcess({
      command: 'typescript-language-server',
      args: ['--stdio'],
      name: 'TypeScript'
    });
  }

  async start(): Promise<void> {
    // Start both servers
    await Promise.all([
      this.svelteServer.start(),
      this.typescriptServer.start()
    ]);

    console.log('TestProxyServer started');
  }

  async stop(): Promise<void> {
    await Promise.all([
      this.svelteServer.stop(),
      this.typescriptServer.stop()
    ]);
  }

  async initialize(params: InitializeParams): Promise<InitializeResult> {
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
          includePackageJsonAutoImports: 'auto',
          includeCompletionsForModuleExports: true,
          includeAutomaticOptionalChainCompletions: true
        },
        hostInfo: 'svelte-proxy-lsp'
      }
    };

    console.log('Initializing servers...');
    console.log('TypeScript server will use Svelte plugin:', !!sveltePlugin);

    // Initialize both servers
    const [svelteCapabilities, tsCapabilities] = await Promise.all([
      this.svelteServer.initialize(params),
      this.typescriptServer.initialize(tsParams)
    ]);

    // Merge capabilities
    const mergedCapabilities = this.mergeCapabilities(svelteCapabilities, tsCapabilities);

    return {
      capabilities: mergedCapabilities.capabilities,
      serverInfo: {
        name: 'Svelte Proxy LSP',
        version: '1.0.0'
      }
    };
  }

  updateParsedDocument(document: TextDocument): void {
    const parsed = parseDocument(document.uri, document.getText(), document.version);
    this.parsedDocuments.set(document.uri, parsed);
    
    // Sync to both servers
    this.syncDocumentToServers(document);
  }

  private syncDocumentToServers(document: TextDocument): void {
    const svelteParams = {
      textDocument: {
        uri: document.uri,
        languageId: isSvelteFile(document.uri) ? 'svelte' : document.languageId,
        version: document.version,
        text: document.getText()
      }
    };

    const tsParams = {
      textDocument: {
        uri: document.uri,
        // For TypeScript server, treat .svelte files as TypeScript when using the plugin
        languageId: isSvelteFile(document.uri) ? 'typescript' : document.languageId,
        version: document.version,
        text: document.getText()
      }
    };

    // Sync to both servers with appropriate language IDs
    this.svelteServer.sendNotification('textDocument/didOpen', svelteParams);
    this.typescriptServer.sendNotification('textDocument/didOpen', tsParams);
  }

  async getCompletion(params: TextDocumentPositionParams): Promise<CompletionItem[]> {
    const parsed = this.parsedDocuments.get(params.textDocument.uri);
    if (!parsed) return [];

    const results: CompletionItem[] = [];

    // Get completions from appropriate servers
    if (shouldUseSvelteServer(parsed, params.position)) {
      try {
        const svelteResults = await this.svelteServer.sendRequest<typeof params, CompletionItem[]>('textDocument/completion', params);
        results.push(...(svelteResults || []));
      } catch (error) {
        console.error('Svelte completion error:', error);
      }
    }

    if (shouldUseTypeScriptServer(parsed, params.position)) {
      try {
        const tsResults = await this.typescriptServer.sendRequest<typeof params, CompletionItem[]>('textDocument/completion', params);
        results.push(...(tsResults || []));
      } catch (error) {
        console.error('TypeScript completion error:', error);
      }
    }

    return this.deduplicateCompletions(results);
  }

  async getHover(params: TextDocumentPositionParams): Promise<Hover | null> {
    const parsed = this.parsedDocuments.get(params.textDocument.uri);
    if (!parsed) return null;

    // Try TypeScript first for script regions, then Svelte
    if (shouldUseTypeScriptServer(parsed, params.position)) {
      try {
        const result = await this.typescriptServer.sendRequest<typeof params, Hover | null>('textDocument/hover', params);
        if (result) return result;
      } catch (error) {
        console.error('TypeScript hover error:', error);
      }
    }

    if (shouldUseSvelteServer(parsed, params.position)) {
      try {
        return await this.svelteServer.sendRequest<typeof params, Hover | null>('textDocument/hover', params);
      } catch (error) {
        console.error('Svelte hover error:', error);
      }
    }

    return null;
  }

  private mergeCapabilities(svelteCapabilities: InitializeResult, tsCapabilities: InitializeResult): InitializeResult {
    return {
      capabilities: {
        textDocumentSync: 2, // Incremental
        completionProvider: {
          resolveProvider: true,
          triggerCharacters: [
            ...(svelteCapabilities.capabilities.completionProvider?.triggerCharacters || []),
            ...(tsCapabilities.capabilities.completionProvider?.triggerCharacters || [])
          ]
        },
        hoverProvider: true,
        signatureHelpProvider: {
          triggerCharacters: [
            ...(svelteCapabilities.capabilities.signatureHelpProvider?.triggerCharacters || []),
            ...(tsCapabilities.capabilities.signatureHelpProvider?.triggerCharacters || [])
          ]
        },
        definitionProvider: true,
        referencesProvider: true,
        documentSymbolProvider: true,
        codeActionProvider: true,
        renameProvider: true,
        documentFormattingProvider: true,
      }
    };
  }

  private deduplicateCompletions(completions: CompletionItem[]): CompletionItem[] {
    const seen = new Set<string>();
    return completions.filter(item => {
      const key = `${item.label}:${item.kind}:${item.detail || ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}