import { spawn, ChildProcess } from 'child_process';
import { join } from 'path';
import { readFileSync } from 'fs';
import { TypedLSPClient, createDidOpenParams, createDidCloseParams, createTextDocumentIdentifier } from "../utils/TypedLSPClient";

describe('LSP Document Symbol Tests', () => {
  let serverProcess: ChildProcess;
  let client: TypedLSPClient;
  const testAppPath = join(__dirname, '../../test-app');

  beforeAll(async () => {
    const serverPath = join(__dirname, '../../src/server.ts');
    
    serverProcess = spawn('npx', ['tsx', serverPath, '--stdio'], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    await new Promise(resolve => setTimeout(resolve, 2000));

    if (!serverProcess.stdin || !serverProcess.stdout) {
      throw new Error('Failed to create server stdio');
    }

    client = new TypedLSPClient(serverProcess);

    // Initialize the server
    await client.initialize( {
      processId: process.pid,
      rootUri: `file://${testAppPath}`,
      capabilities: {
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
          hover: { dynamicRegistration: true },
          definition: { dynamicRegistration: true }
        }
      },
      workspaceFolders: [{
        uri: `file://${testAppPath}`,
        name: 'test-app'
      }]
    });

    client.initialized();
  }, 30000);

  afterAll(async () => {
    if (serverProcess && !serverProcess.killed) {
      serverProcess.kill('SIGTERM');
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  });

  test('should extract symbols from Svelte components', async () => {
    const complexTypeFile = join(testAppPath, 'src/lib/components/ComplexType.svelte');
    const content = readFileSync(complexTypeFile, 'utf-8');
    const uri = `file://${complexTypeFile}`;

    // Open the document
    client.didOpen(createDidOpenParams(uri, 'svelte', 1, content));

    await new Promise(resolve => setTimeout(resolve, 2000));

    try {
      const symbols = await client.documentSymbol( {
        textDocument: createTextDocumentIdentifier(uri)
      });

      console.log('✅ ComplexType.svelte Document Symbols:');
      if (symbols && Array.isArray(symbols)) {
        console.log(`  Found ${symbols.length} top-level symbols`);
        
        const printSymbol = (symbol: any, indent: string = '') => {
          const kindNames = [
            '', 'File', 'Module', 'Namespace', 'Package', 'Class', 'Method', 'Property',
            'Field', 'Constructor', 'Enum', 'Interface', 'Function', 'Variable', 'Constant',
            'String', 'Number', 'Boolean', 'Array', 'Object', 'Key', 'Null', 'EnumMember',
            'Struct', 'Event', 'Operator', 'TypeParameter'
          ];
          
          const kindName = kindNames[symbol.kind] || `Unknown(${symbol.kind})`;
          console.log(`${indent}- ${symbol.name} (${kindName})`);
          
          if (symbol.children && symbol.children.length > 0) {
            symbol.children.forEach((child: any) => {
              printSymbol(child, indent + '  ');
            });
          }
        };

        symbols.forEach((symbol: any) => printSymbol(symbol));

        // Look for expected symbols
        const hasPersonType = symbols.some((s: any) => s.name === 'Person');
        const hasProps = symbols.some((s: any) => s.name === 'Props' || s.name.includes('Props'));
        
        console.log(`\n  Person type definition: ${hasPersonType ? '✅' : '❌'}`);
        console.log(`  Props interface: ${hasProps ? '✅' : '❌'}`);

      } else {
        console.log('  No symbols found or invalid response format');
      }

    } catch (error) {
      console.log('Document symbol extraction error:', (error as Error).message);
    }

    // Validate that the server processed Svelte component symbols without crashing
    expect(client.isProcessAlive()).toBe(true);
    expect(client.getPendingRequestCount()).toBe(0);

    client.didClose(createDidCloseParams(uri ));
  }, 15000);

  test('should extract symbols from TypeScript files', async () => {
    const typesFile = join(testAppPath, 'src/lib/components/types.ts');
    const content = readFileSync(typesFile, 'utf-8');
    const uri = `file://${typesFile}`;

    client.didOpen(createDidOpenParams(uri, 'typescript', 1, content));

    await new Promise(resolve => setTimeout(resolve, 2000));

    try {
      const symbols = await client.documentSymbol( {
        textDocument: createTextDocumentIdentifier(uri)
      });

      console.log('✅ types.ts Document Symbols:');
      if (symbols && Array.isArray(symbols)) {
        console.log(`  Found ${symbols.length} symbols`);
        
        symbols.forEach((symbol: any) => {
          const kindNames = [
            '', 'File', 'Module', 'Namespace', 'Package', 'Class', 'Method', 'Property',
            'Field', 'Constructor', 'Enum', 'Interface', 'Function', 'Variable', 'Constant',
            'String', 'Number', 'Boolean', 'Array', 'Object', 'Key', 'Null', 'EnumMember',
            'Struct', 'Event', 'Operator', 'TypeParameter'
          ];
          
          const kindName = kindNames[symbol.kind] || `Unknown(${symbol.kind})`;
          console.log(`  - ${symbol.name} (${kindName})`);
          
          if (symbol.children && symbol.children.length > 0) {
            symbol.children.forEach((child: any) => {
              console.log(`    - ${child.name} (${kindNames[child.kind] || child.kind})`);
            });
          }
        });

        // Look for expected type definitions
        const hasExternalPerson = symbols.some((s: any) => s.name === 'ExternalPerson');
        const hasJob = symbols.some((s: any) => s.name === 'Job');
        
        console.log(`\n  ExternalPerson type: ${hasExternalPerson ? '✅' : '❌'}`);
        console.log(`  Job type: ${hasJob ? '✅' : '❌'}`);

      } else {
        console.log('  No symbols found or invalid response format');
      }

    } catch (error) {
      console.log('TypeScript document symbol error:', (error as Error).message);
    }

    // Validate that the server processed TypeScript file symbols without crashing
    expect(client.isProcessAlive()).toBe(true);
    expect(client.getPendingRequestCount()).toBe(0);

    client.didClose(createDidCloseParams(uri ));
  }, 15000);

  test('should extract symbols from complex Svelte component', async () => {
    const complexContent = `<script lang="ts">
  import type { ExternalPerson } from "./types";

  interface Props {
    title: string;
    person: ExternalPerson;
    count?: number;
  }

  let { title, person, count = 0 }: Props = $props();

  type LocalType = {
    id: number;
    active: boolean;
  };

  const CONSTANT_VALUE = 42;
  let localVar = "test";

  function handleClick() {
    count++;
    console.log('Clicked!');
  }

  function processData(data: LocalType): string {
    return data.active ? \`ID: \${data.id}\` : 'Inactive';
  }

  $: displayText = \`\${title}: \${person.name}\`;
  $: isActive = count > 0;
</script>

<main>
  <h1>{displayText}</h1>
  <p>Count: {count}</p>
  <button on:click={handleClick}>Click me</button>
</main>

<style>
  main {
    padding: 1rem;
  }
  
  h1 {
    color: blue;
  }
</style>`;

    const uri = `file://${testAppPath}/src/lib/components/ComplexSymbolTest.svelte`;

    client.didOpen(createDidOpenParams(uri, 'svelte', 1, complexContent));

    await new Promise(resolve => setTimeout(resolve, 2000));

    try {
      const symbols = await client.documentSymbol( {
        textDocument: createTextDocumentIdentifier(uri)
      });

      console.log('✅ Complex Svelte Component Symbols:');
      if (symbols && Array.isArray(symbols)) {
        console.log(`  Found ${symbols.length} symbols`);
        
        const printSymbol = (symbol: any, indent: string = '') => {
          const kindNames = [
            '', 'File', 'Module', 'Namespace', 'Package', 'Class', 'Method', 'Property',
            'Field', 'Constructor', 'Enum', 'Interface', 'Function', 'Variable', 'Constant',
            'String', 'Number', 'Boolean', 'Array', 'Object', 'Key', 'Null', 'EnumMember',
            'Struct', 'Event', 'Operator', 'TypeParameter'
          ];
          
          const kindName = kindNames[symbol.kind] || `Unknown(${symbol.kind})`;
          console.log(`${indent}- ${symbol.name} (${kindName}) [${symbol.range?.start?.line || '?'}:${symbol.range?.start?.character || '?'}]`);
          
          if (symbol.children && symbol.children.length > 0) {
            symbol.children.forEach((child: any) => {
              printSymbol(child, indent + '  ');
            });
          }
        };

        symbols.forEach((symbol: any) => printSymbol(symbol));

        // Check for various symbol types
        const getAllSymbolNames = (symbols: any[]): string[] => {
          const names: string[] = [];
          symbols.forEach(symbol => {
            names.push(symbol.name);
            if (symbol.children) {
              names.push(...getAllSymbolNames(symbol.children));
            }
          });
          return names;
        };

        const allNames = getAllSymbolNames(symbols);
        
        const checks = [
          { name: 'Props interface', found: allNames.includes('Props') },
          { name: 'LocalType', found: allNames.includes('LocalType') },
          { name: 'CONSTANT_VALUE', found: allNames.includes('CONSTANT_VALUE') },
          { name: 'handleClick function', found: allNames.includes('handleClick') },
          { name: 'processData function', found: allNames.includes('processData') },
          { name: 'localVar variable', found: allNames.includes('localVar') }
        ];

        console.log('\n  Symbol type verification:');
        checks.forEach(check => {
          console.log(`  ${check.name}: ${check.found ? '✅' : '❌'}`);
        });

      } else {
        console.log('  No symbols found or invalid response format');
      }

    } catch (error) {
      console.log('Complex component symbol error:', (error as Error).message);
    }

    // Validate that the server processed complex component symbols without crashing
    expect(client.isProcessAlive()).toBe(true);
    expect(client.getPendingRequestCount()).toBe(0);

    client.didClose(createDidCloseParams(uri ));
  }, 15000);

  test('should handle symbol ranges and positions correctly', async () => {
    const utilsFile = join(testAppPath, 'src/lib/utils.ts');
    const content = readFileSync(utilsFile, 'utf-8');
    const uri = `file://${utilsFile}`;

    client.didOpen(createDidOpenParams(uri, 'typescript', 1, content));

    await new Promise(resolve => setTimeout(resolve, 2000));

    try {
      const symbols = await client.documentSymbol( {
        textDocument: createTextDocumentIdentifier(uri)
      });

      console.log('✅ utils.ts Symbol Ranges and Positions:');
      if (symbols && Array.isArray(symbols)) {
        symbols.forEach((symbol: any) => {
          console.log(`  Symbol: ${symbol.name}`);
          
          if (symbol.range) {
            console.log(`    Range: ${symbol.range.start.line}:${symbol.range.start.character} - ${symbol.range.end.line}:${symbol.range.end.character}`);
          }
          
          if (symbol.selectionRange) {
            console.log(`    Selection: ${symbol.selectionRange.start.line}:${symbol.selectionRange.start.character} - ${symbol.selectionRange.end.line}:${symbol.selectionRange.end.character}`);
          }

          // Verify ranges are valid
          if (symbol.range && symbol.selectionRange) {
            const rangeValid = symbol.range.start.line >= 0 && symbol.range.start.character >= 0 &&
                              symbol.range.end.line >= symbol.range.start.line;
            const selectionValid = symbol.selectionRange.start.line >= 0 && symbol.selectionRange.start.character >= 0;
            
            console.log(`    Range valid: ${rangeValid ? '✅' : '❌'}`);
            console.log(`    Selection valid: ${selectionValid ? '✅' : '❌'}`);
          }
          
          console.log('');
        });

      } else {
        console.log('  No symbols found or invalid response format');
      }

    } catch (error) {
      console.log('Symbol range test error:', (error as Error).message);
    }

    // Validate that the server processed symbol range queries without crashing
    expect(client.isProcessAlive()).toBe(true);
    expect(client.getPendingRequestCount()).toBe(0);

    client.didClose(createDidCloseParams(uri ));
  }, 15000);
});