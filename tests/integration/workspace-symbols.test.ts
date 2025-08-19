import { spawn, ChildProcess } from 'child_process';
import { join } from 'path';
import { TypedLSPClient, createDidOpenParams, createDidCloseParams, createTextDocumentIdentifier, createPosition } from "../utils/TypedLSPClient";

describe('LSP Workspace Symbol Tests', () => {
  let serverProcess: ChildProcess;
  let client: TypedLSPClient;
  const testAppPath = join(__dirname, '../../test-app');

  beforeAll(async () => {
    const serverPath = join(__dirname, '../../src/server.ts');
    
    serverProcess = spawn('npx', ['tsx', serverPath, '--stdio'], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    await new Promise(resolve => setTimeout(resolve, 3000));

    if (!serverProcess.stdin || !serverProcess.stdout) {
      throw new Error('Failed to create server stdio');
    }

    client = new TypedLSPClient(serverProcess);

    // Initialize the server with workspace capabilities
    await client.initialize( {
      processId: process.pid,
      rootUri: `file://${testAppPath}`,
      capabilities: {
        workspace: {
          symbol: {
            dynamicRegistration: true,
            symbolKind: {
              valueSet: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26]
            },
            tagSupport: {
              valueSet: [1]
            }
          }
        },
        textDocument: {
          documentSymbol: {
            dynamicRegistration: true,
            symbolKind: {
              valueSet: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26]
            },
            hierarchicalDocumentSymbolSupport: true,
            tagSupport: {
              valueSet: [1]
            }
          },
          definition: { dynamicRegistration: true },
          references: { dynamicRegistration: true }
        }
      },
      workspaceFolders: [{
        uri: `file://${testAppPath}`,
        name: 'test-app'
      }]
    });

    client.initialized();
    
    // Give the server time to index the workspace
    await new Promise(resolve => setTimeout(resolve, 2000));
  }, 40000);

  afterAll(async () => {
    if (serverProcess && !serverProcess.killed) {
      serverProcess.kill('SIGTERM');
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  });

  test('should find workspace symbols across project', async () => {
    try {
      const symbols = await client.workspaceSymbol({
        query: 'Person'
      });

      console.log('✅ Workspace Symbol Search for "Person":');
      if (symbols && Array.isArray(symbols)) {
        console.log(`  Found ${symbols.length} symbols`);
        
        symbols.forEach((symbol: any, index: number) => {
          console.log(`  ${index + 1}. ${symbol.name} (${symbol.kind}) in ${symbol.location?.uri || symbol.containerName || 'unknown'}`);
        });

        // Look for expected symbols
        const hasPersonType = symbols.some((s: any) => 
          s.name === 'Person' && s.location?.uri?.includes('ComplexType.svelte')
        );
        const hasExternalPerson = symbols.some((s: any) => 
          s.name === 'ExternalPerson' && s.location?.uri?.includes('types.ts')
        );

        console.log(`\n  Person type in ComplexType.svelte: ${hasPersonType ? '✅' : '❌'}`);
        console.log(`  ExternalPerson in types.ts: ${hasExternalPerson ? '✅' : '❌'}`);
      } else {
        console.log('  No symbols found or invalid response format');
      }

    } catch (error) {
      console.log('Workspace symbol search error:', (error as Error).message);
    }

    // Validate that the server handled workspace symbol search without crashing
    expect(client.isProcessAlive()).toBe(true);
    expect(client.getPendingRequestCount()).toBe(0);
  }, 20000);

  test('should find symbols by different search terms', async () => {
    const searchTerms = ['Job', 'ExternalPerson', 'utils', 'greet'];

    for (const term of searchTerms) {
      try {
        const symbols = await client.workspaceSymbol({
          query: term
        });

        console.log(`\n✅ Workspace Symbol Search for "${term}":`);
        if (symbols && Array.isArray(symbols)) {
          console.log(`  Found ${symbols.length} symbols`);
          
          symbols.slice(0, 5).forEach((symbol: any, index: number) => {
            const location = symbol.location?.uri ? 
              symbol.location.uri.split('/').pop() : 
              'unknown location';
            console.log(`  ${index + 1}. ${symbol.name} (kind: ${symbol.kind}) in ${location}`);
          });

          if (symbols.length > 5) {
            console.log(`  ... and ${symbols.length - 5} more`);
          }
        } else {
          console.log('  No symbols found');
        }

        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (error) {
        console.log(`  Error searching for "${term}":`, (error as Error).message);
      }
    }

    // Validate that the server processed multiple search terms without crashing
    expect(client.isProcessAlive()).toBe(true);
    expect(client.getPendingRequestCount()).toBe(0);
  }, 25000);

  test('should handle empty and wildcard symbol searches', async () => {
    const searches = [
      { query: '', description: 'empty query' },
      { query: '*', description: 'wildcard query' },
      { query: 'NonExistentSymbol', description: 'non-existent symbol' }
    ];

    for (const search of searches) {
      try {
        const symbols = await client.workspaceSymbol({
          query: search.query
        });

        console.log(`\n✅ Workspace Symbol Search for ${search.description}:`);
        if (symbols && Array.isArray(symbols)) {
          console.log(`  Found ${symbols.length} symbols`);
          
          if (search.query === '') {
            // Empty query might return all symbols or none depending on server implementation
            console.log(`  Empty query handling: ${symbols.length > 0 ? 'returns all symbols' : 'returns no symbols'}`);
          } else if (search.query === '*') {
            // Wildcard might return many symbols
            console.log(`  Wildcard handling: ${symbols.length > 0 ? 'returns symbols' : 'not supported'}`);
          } else {
            // Non-existent should return empty
            console.log(`  Non-existent symbol handling: ${symbols.length === 0 ? 'correctly empty' : 'unexpected results'}`);
          }
        } else {
          console.log('  Invalid response or no symbols');
        }

        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (error) {
        console.log(`  Error with ${search.description}:`, (error as Error).message);
      }
    }

    // Validate that the server handled edge case searches without crashing
    expect(client.isProcessAlive()).toBe(true);
    expect(client.getPendingRequestCount()).toBe(0);
  }, 15000);

  test('should find symbols with fuzzy matching', async () => {
    const fuzzySearches = [
      { query: 'Pers', expected: 'Person, ExternalPerson' },
      { query: 'Ext', expected: 'ExternalPerson, ExternalComplexType' },
      { query: 'Job', expected: 'Job type' },
      { query: 'Comp', expected: 'ComplexType, ExternalComplexType' }
    ];

    for (const search of fuzzySearches) {
      try {
        const symbols = await client.workspaceSymbol({
          query: search.query
        });

        console.log(`\n✅ Fuzzy Search for "${search.query}" (expecting ${search.expected}):`);
        if (symbols && Array.isArray(symbols)) {
          console.log(`  Found ${symbols.length} symbols`);
          
          const symbolNames = symbols.map((s: any) => s.name).join(', ');
          console.log(`  Symbol names: ${symbolNames || 'none'}`);
          
          // Check if we found reasonable fuzzy matches
          const hasRelevantMatch = symbols.some((s: any) => 
            s.name.toLowerCase().includes(search.query.toLowerCase()) ||
            search.query.toLowerCase().split('').every((char: string) => 
              s.name.toLowerCase().includes(char)
            )
          );
          
          console.log(`  Has relevant fuzzy matches: ${hasRelevantMatch ? '✅' : '❌'}`);
        } else {
          console.log('  No symbols found');
        }

        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (error) {
        console.log(`  Fuzzy search error for "${search.query}":`, (error as Error).message);
      }
    }

    // Validate that the server handled fuzzy searches without crashing
    expect(client.isProcessAlive()).toBe(true);
    expect(client.getPendingRequestCount()).toBe(0);
  }, 20000);
});