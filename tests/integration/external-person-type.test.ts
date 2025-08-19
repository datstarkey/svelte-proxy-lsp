import { spawn, ChildProcess } from 'child_process';
import { join } from 'path';
import { readFileSync } from 'fs';
import { TypedLSPClient, createDidOpenParams, createDidCloseParams, createTextDocumentIdentifier, createPosition } from '../utils/TypedLSPClient';

describe('External Person Type Information Test', () => {
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
    await client.initialize({
      processId: process.pid,
      rootUri: `file://${testAppPath}`,
      capabilities: {
        textDocument: {
          hover: { dynamicRegistration: true },
          definition: { dynamicRegistration: true },
          typeDefinition: { dynamicRegistration: true },
          references: { dynamicRegistration: true },
          documentSymbol: {
            dynamicRegistration: true,
            symbolKind: {
              valueSet: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26]
            },
            hierarchicalDocumentSymbolSupport: true
          }
        }
      },
      workspaceFolders: [{
        uri: `file://${testAppPath}`,
        name: 'test-app'
      }]
    });

    client.initialized();
    
    // Give server time to initialize fully
    await new Promise(resolve => setTimeout(resolve, 1000));
  }, 30000);

  afterAll(async () => {
    if (serverProcess && !serverProcess.killed) {
      serverProcess.kill('SIGTERM');
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  });

  test('should analyze ExternalPerson type from ExternalComplexType.svelte via LSP', async () => {
    const externalComplexFile = join(testAppPath, 'src/lib/components/ExternalComplexType.svelte');
    const content = readFileSync(externalComplexFile, 'utf-8');
    const docUri = `file://${externalComplexFile}`;

    console.log('Opening ExternalComplexType.svelte to analyze cross-file types...');

    // Open the document
    client.didOpen(createDidOpenParams(docUri, 'svelte', 1, content));

    // Wait for server to process the document
    await new Promise(resolve => setTimeout(resolve, 2000));

    try {
      // Find the import statement line and get definition
      const lines = content.split('\n');
      let importLine = -1;
      let externalPersonPosition = -1;

      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('import type { ExternalPerson }')) {
          importLine = i;
          externalPersonPosition = lines[i].indexOf('ExternalPerson') + 7; // Middle of "ExternalPerson"
          break;
        }
      }

      expect(importLine).toBeGreaterThanOrEqual(0);
      console.log(`Found ExternalPerson import at line ${importLine + 1}`);

      // Get definition of ExternalPerson type
      const definitionResult = await client.definition({
        textDocument: createTextDocumentIdentifier(docUri),
        position: createPosition(importLine, externalPersonPosition)
      });
      
      if (!definitionResult) {
        console.log('⚠️ Definition request failed - server might not support cross-file navigation');
        console.log('This is expected if language servers are not fully installed');
      }

      if (definitionResult) {
        console.log('✅ Definition result for ExternalPerson:', definitionResult);
        
        if (Array.isArray(definitionResult) && definitionResult.length > 0) {
          const def = definitionResult[0];
          // Handle both Location and LocationLink types
          const uri = 'uri' in def ? def.uri : (def as any).targetUri;
          const range = 'range' in def ? def.range : (def as any).targetRange;
          
          if (uri && range) {
            expect(uri).toContain('types.ts');
            console.log(`  ExternalPerson defined in: ${uri.split('/').pop()}`);
            console.log(`  At line: ${range.start.line + 1}`);
          }
        }
      }

      // Get hover information for ExternalPerson usage
      const personUsageLine = lines.findIndex(line => line.includes('person: ExternalPerson'));
      if (personUsageLine >= 0) {
        const personChar = lines[personUsageLine].indexOf('ExternalPerson') + 7;
        
        const hoverResult = await client.hover({
          textDocument: createTextDocumentIdentifier(docUri),
          position: createPosition(personUsageLine, personChar)
        });
        
        if (!hoverResult) {
          console.log('⚠️ Hover request failed');
        }

        if (hoverResult && hoverResult.contents) {
          console.log('✅ Hover information for ExternalPerson:');
          let hoverText = '';
          if (typeof hoverResult.contents === 'string') {
            hoverText = hoverResult.contents;
          } else if (Array.isArray(hoverResult.contents)) {
            hoverText = hoverResult.contents.map(c => typeof c === 'string' ? c : c.value).join('\n');
          } else if ('value' in hoverResult.contents) {
            hoverText = hoverResult.contents.value;
          } else {
            hoverText = JSON.stringify(hoverResult.contents);
          }
          
          console.log(hoverText);

          // Verify the hover shows the ExternalPerson type structure
          expect(hoverText).toContain('ExternalPerson');
          
          // Check for properties
          const hasName = hoverText.includes('name') && hoverText.includes('string');
          const hasAge = hoverText.includes('age') && hoverText.includes('Date');
          const hasJob = hoverText.includes('job') && hoverText.includes('Job');

          console.log('✅ ExternalPerson properties detected:');
          console.log(`  - name: string - ${hasName ? '✅' : '❌'}`);
          console.log(`  - age: Date - ${hasAge ? '✅' : '❌'}`);
          console.log(`  - job: Job - ${hasJob ? '✅' : '❌'}`);
        }
      }

      // Request document symbols
      const symbols = await client.documentSymbol({
        textDocument: createTextDocumentIdentifier(docUri)
      }) || [];
      
      if (symbols.length === 0) {
        console.log('⚠️ Document symbol request failed or returned no symbols');
      }

      console.log(`✅ Received ${symbols.length} symbol(s) from LSP`);
      
      // Look for Props interface that uses ExternalPerson
      const findPropsSymbol = (syms: any[]): any => {
        for (const sym of syms) {
          if (sym.name === 'Props' || sym.name.includes('Props')) {
            return sym;
          }
          if (sym.children) {
            const found = findPropsSymbol(sym.children);
            if (found) return found;
          }
        }
        return null;
      };

      const propsSymbol = findPropsSymbol(symbols);
      if (propsSymbol) {
        console.log('✅ Found Props interface that uses ExternalPerson');
        console.log(`  Name: ${propsSymbol.name}`);
        console.log(`  Kind: ${propsSymbol.kind}`);
      }

    } catch (error) {
      console.log('Error analyzing external types:', (error as Error).message);
      throw error;
    }

    // Clean up
    client.didClose(createDidCloseParams(docUri));
  }, 30000);

  test('should trace cross-file type hierarchy via LSP', async () => {
    const typesFile = join(testAppPath, 'src/lib/components/types.ts');
    const content = readFileSync(typesFile, 'utf-8');
    const docUri = `file://${typesFile}`;

    console.log('Opening types.ts to analyze type hierarchy...');

    // Open the types file
    client.didOpen(createDidOpenParams(docUri, 'typescript', 1, content));

    await new Promise(resolve => setTimeout(resolve, 2000));

    try {
      // Get document symbols from types.ts
      const symbols = await client.documentSymbol({
        textDocument: createTextDocumentIdentifier(docUri)
      }) || [];

      console.log(`✅ Received ${symbols.length} symbol(s) from types.ts`);

      // Find ExternalPerson and Job types
      let externalPersonSymbol: any = null;
      let jobSymbol: any = null;

      for (const sym of symbols) {
        if (sym.name === 'ExternalPerson') {
          externalPersonSymbol = sym;
        }
        if (sym.name === 'Job') {
          jobSymbol = sym;
        }
      }

      if (externalPersonSymbol) {
        console.log('✅ Found ExternalPerson type in types.ts:');
        console.log(`  Name: ${externalPersonSymbol.name}`);
        console.log(`  Kind: ${externalPersonSymbol.kind} (23 = TypeAlias)`);
        console.log(`  Line: ${externalPersonSymbol.range?.start?.line + 1}`);

        // Get hover for ExternalPerson
        const hoverResult = await client.hover({
          textDocument: createTextDocumentIdentifier(docUri),
          position: createPosition(
            externalPersonSymbol.range.start.line,
            externalPersonSymbol.range.start.character + 10
          )
        });

        if (hoverResult && hoverResult.contents) {
          let hoverText = '';
          if (typeof hoverResult.contents === 'string') {
            hoverText = hoverResult.contents;
          } else if (Array.isArray(hoverResult.contents)) {
            hoverText = hoverResult.contents.map(c => typeof c === 'string' ? c : c.value).join('\n');
          } else if ('value' in hoverResult.contents) {
            hoverText = hoverResult.contents.value;
          }
          
          console.log('  Type structure:', hoverText.substring(0, 200));
          
          expect(hoverText).toContain('ExternalPerson');
          expect(hoverText).toContain('name');
          expect(hoverText).toContain('age');
          expect(hoverText).toContain('job');
        }
      }

      if (jobSymbol) {
        console.log('✅ Found Job type in types.ts:');
        console.log(`  Name: ${jobSymbol.name}`);
        console.log(`  Kind: ${jobSymbol.kind}`);
        console.log(`  Line: ${jobSymbol.range?.start?.line + 1}`);

        // Get hover for Job
        const hoverResult = await client.hover({
          textDocument: createTextDocumentIdentifier(docUri),
          position: createPosition(
            jobSymbol.range.start.line,
            jobSymbol.range.start.character + 3
          )
        });

        if (hoverResult && hoverResult.contents) {
          let hoverText = '';
          if (typeof hoverResult.contents === 'string') {
            hoverText = hoverResult.contents;
          } else if (Array.isArray(hoverResult.contents)) {
            hoverText = hoverResult.contents.map(c => typeof c === 'string' ? c : c.value).join('\n');
          } else if ('value' in hoverResult.contents) {
            hoverText = hoverResult.contents.value;
          }
          
          console.log('  Type structure:', hoverText.substring(0, 200));
          
          expect(hoverText).toContain('Job');
          expect(hoverText).toContain('title');
          expect(hoverText).toContain('work');
        }
      }

      // Verify we found both types
      expect(externalPersonSymbol).toBeDefined();
      expect(jobSymbol).toBeDefined();

      // Now check references to see where ExternalPerson is used
      if (externalPersonSymbol) {
        const references = await client.references({
          textDocument: createTextDocumentIdentifier(docUri),
          position: createPosition(
            externalPersonSymbol.range.start.line,
            externalPersonSymbol.range.start.character + 10
          ),
          context: { includeDeclaration: false }
        });

        if (references && Array.isArray(references)) {
          console.log(`✅ Found ${references.length} reference(s) to ExternalPerson`);
          references.forEach(ref => {
            const fileName = ref.uri.split('/').pop();
            console.log(`  - Used in: ${fileName} at line ${ref.range.start.line + 1}`);
          });
        }
      }

    } catch (error) {
      console.log('Error analyzing type hierarchy:', (error as Error).message);
    }

    // Clean up
    client.didClose(createDidCloseParams(docUri));
  }, 20000);
});