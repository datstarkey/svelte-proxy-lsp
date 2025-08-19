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
    const symbols = await client.workspaceSymbol({
      query: 'Person'
    });

    // Assert symbols were returned
    expect(symbols).toBeDefined();
    expect(Array.isArray(symbols)).toBe(true);
    expect(symbols).not.toHaveLength(0);

    console.log('✅ Workspace Symbol Search for "Person":');
    console.log(`  Found ${symbols!.length} symbols`);
    
    const symbolsArray = symbols as any[];
    
    // Assert we found Person-related symbols
    const personSymbols = symbolsArray.filter((s: any) => 
      s.name.includes('Person')
    );
    expect(personSymbols.length).toBeGreaterThan(0);

    // Check for specific symbols
    const hasPersonType = symbolsArray.some((s: any) => 
      s.name === 'Person' && s.location?.uri?.includes('ComplexType.svelte')
    );
    const hasExternalPerson = symbolsArray.some((s: any) => 
      s.name === 'ExternalPerson' && s.location?.uri?.includes('types.ts')
    );

    expect(hasPersonType || hasExternalPerson).toBe(true);

    // Validate that the server handled workspace symbol search without crashing
    expect(client.isProcessAlive()).toBe(true);
    expect(client.getPendingRequestCount()).toBe(0);
  }, 20000);

  test('should find symbols by different search terms', async () => {
    const searchTerms = [
      { query: 'Job', expectedInResult: 'Job' },
      { query: 'ExternalPerson', expectedInResult: 'ExternalPerson' },
      { query: 'greet', expectedInResult: 'greet' }
    ];

    for (const { query, expectedInResult } of searchTerms) {
      const symbols = await client.workspaceSymbol({ query });

      console.log(`\n✅ Workspace Symbol Search for "${query}":`);
      
      // Assert symbols array is returned
      expect(symbols).toBeDefined();
      expect(Array.isArray(symbols)).toBe(true);
      
      const symbolsArray = symbols as any[];
      console.log(`  Found ${symbolsArray.length} symbols`);
      
      // For each search term, we expect to find at least one relevant symbol
      if (query !== 'utils') { // 'utils' might not match anything directly
        const hasRelevantSymbol = symbolsArray.some((s: any) => 
          s.name.toLowerCase().includes(expectedInResult.toLowerCase())
        );
        expect(hasRelevantSymbol).toBe(true);
      }

      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 500));
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
      const symbols = await client.workspaceSymbol({
        query: search.query
      });

      console.log(`\n✅ Workspace Symbol Search for ${search.description}:`);
      
      // Assert we always get an array back
      expect(symbols).toBeDefined();
      expect(Array.isArray(symbols)).toBe(true);
      
      const symbolsArray = symbols as any[];
      console.log(`  Found ${symbolsArray.length} symbols`);
      
      if (search.query === 'NonExistentSymbol') {
        // Non-existent symbol should return empty or very few results
        expect(symbolsArray.filter((s: any) => 
          s.name === 'NonExistentSymbol'
        ).length).toBe(0);
      }
      // Empty and wildcard queries behavior varies by server implementation
      // so we just check they don't crash

      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Validate that the server handled edge case searches without crashing
    expect(client.isProcessAlive()).toBe(true);
    expect(client.getPendingRequestCount()).toBe(0);
  }, 15000);

  test('should find symbols with fuzzy matching', async () => {
    const fuzzySearches = [
      { query: 'Pers', shouldMatch: ['Person', 'ExternalPerson'] },
      { query: 'Ext', shouldMatch: ['ExternalPerson', 'ExternalComplexType'] },
      { query: 'Job', shouldMatch: ['Job'] },
      { query: 'greet', shouldMatch: ['greetUser', 'GreetingOptions'] }
    ];

    for (const search of fuzzySearches) {
      const symbols = await client.workspaceSymbol({
        query: search.query
      });

      console.log(`\n✅ Fuzzy Search for "${search.query}":`);
      
      // Assert we get an array
      expect(symbols).toBeDefined();
      expect(Array.isArray(symbols)).toBe(true);
      
      const symbolsArray = symbols as any[];
      console.log(`  Found ${symbolsArray.length} symbols`);
      
      if (symbolsArray.length > 0) {
        const symbolNames = symbolsArray.map((s: any) => s.name);
        console.log(`  Symbol names: ${symbolNames.slice(0, 5).join(', ')}`);
        
        // Check if we found at least one of the expected matches
        const foundExpectedMatch = search.shouldMatch.some(expected => 
          symbolNames.some(name => 
            name.toLowerCase().includes(search.query.toLowerCase()) ||
            name.toLowerCase().includes(expected.toLowerCase())
          )
        );
        
        expect(foundExpectedMatch).toBe(true);
      }

      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Validate that the server handled fuzzy searches without crashing
    expect(client.isProcessAlive()).toBe(true);
    expect(client.getPendingRequestCount()).toBe(0);
  }, 20000);
});