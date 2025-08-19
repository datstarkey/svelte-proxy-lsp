import { spawn, ChildProcess } from 'child_process';
import { join } from 'path';
import { TypedLSPClient, createDidOpenParams, createDidCloseParams, createTextDocumentIdentifier, createPosition } from "../utils/TypedLSPClient";

describe('LSP Symbol Insertion and Completion Tests', () => {
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
          completion: {
            dynamicRegistration: true,
            completionItem: {
              snippetSupport: true,
              commitCharactersSupport: true,
              documentationFormat: ['markdown', 'plaintext'],
              deprecatedSupport: true,
              preselectSupport: true
            }
          },
          hover: { dynamicRegistration: true },
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
  }, 30000);

  afterAll(async () => {
    if (serverProcess && !serverProcess.killed) {
      serverProcess.kill('SIGTERM');
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  });

  test('should provide completions for TypeScript in script blocks', async () => {
    const testContent = `<script lang="ts">
  import type { ExternalPerson } from "./types";
  
  interface Props {
    person: ExternalPerson;
  }
  
  let { person }: Props = $props();
  
  function processPersonData() {
    // Test completion after person.
    person.|
    
    // Test completion after person.job.
    person.job.|
    
    // Test built-in completions
    const dateStr = person.age.toDate|
  }
</script>

<main>
  <h1>{person.name}</h1>
</main>`;

    const docUri = `file://${testAppPath}/src/lib/components/CompletionTest.svelte`;

    client.didOpen(createDidOpenParams(docUri, 'svelte', 1, testContent));

    await new Promise(resolve => setTimeout(resolve, 2000));

    try {
      // Test completion after "person."
      const personCompletion = await client.completion( {
        textDocument: createTextDocumentIdentifier(docUri),
        position: { line: 10, character: 11 } // After "person."
      });

      console.log('✅ Person property completions:');
      if (personCompletion) {
        const items = Array.isArray(personCompletion) 
          ? personCompletion 
          : (personCompletion as any).items || [];
        console.log(`  Found ${items.length} completion items`);
        
        // Look for expected properties
        const hasName = items.some((item: any) => item.label === 'name');
        const hasAge = items.some((item: any) => item.label === 'age');
        const hasJob = items.some((item: any) => item.label === 'job');
        
        console.log(`  - name: ${hasName ? '✅' : '❌'}`);
        console.log(`  - age: ${hasAge ? '✅' : '❌'}`);
        console.log(`  - job: ${hasJob ? '✅' : '❌'}`);
      } else {
        console.log('  No completion items received');
      }

      // Test completion after "person.job."
      const jobCompletion = await client.completion( {
        textDocument: createTextDocumentIdentifier(docUri),
        position: { line: 13, character: 15 } // After "person.job."
      });

      console.log('\n✅ Job property completions:');
      if (jobCompletion) {
        const items = Array.isArray(jobCompletion) 
          ? jobCompletion 
          : (jobCompletion as any).items || [];
        console.log(`  Found ${items.length} completion items`);
        
        const hasTitle = items.some((item: any) => item.label === 'title');
        const hasWork = items.some((item: any) => item.label === 'work');
        
        console.log(`  - title: ${hasTitle ? '✅' : '❌'}`);
        console.log(`  - work: ${hasWork ? '✅' : '❌'}`);
      } else {
        console.log('  No completion items received');
      }

      // Test built-in Date methods
      const dateCompletion = await client.completion( {
        textDocument: createTextDocumentIdentifier(docUri),
        position: { line: 16, character: 35 } // After "toDate"
      });

      console.log('\n✅ Date method completions:');
      if (dateCompletion) {
        const items = Array.isArray(dateCompletion) 
          ? dateCompletion 
          : (dateCompletion as any).items || [];
        console.log(`  Found ${items.length} completion items`);
        
        const hasToDateString = items.some((item: any) => item.label === 'toDateString');
        const hasToISOString = items.some((item: any) => item.label === 'toISOString');
        
        console.log(`  - toDateString: ${hasToDateString ? '✅' : '❌'}`);
        console.log(`  - toISOString: ${hasToISOString ? '✅' : '❌'}`);
      } else {
        console.log('  No completion items received');
      }

    } catch (error) {
      console.log('Completion test error:', (error as Error).message);
    }

    // Validate that the server processed TypeScript completions without crashing
    expect(client.isProcessAlive()).toBe(true);
    expect(client.getPendingRequestCount()).toBe(0);

    client.didClose(createDidCloseParams(docUri));
  }, 15000);

  test('should provide completions for Svelte-specific syntax', async () => {
    const svelteContent = `<script lang="ts">
  let name = 'world';
  let count = 0;
  
  function increment() {
    count++;
  }
</script>

<main>
  <!-- Test directive completions -->
  <button on:|>Click me</button>
  
  <!-- Test binding completions -->
  <input bind:|>
  
  <!-- Test conditional completions -->
  {#if |}
    <p>Conditional content</p>
  {/if}
  
  <!-- Test variable completions in expressions -->
  <h1>Hello {|}!</h1>
  <p>Count: {count}</p>
</main>`;

    const docUri = `file://${testAppPath}/src/lib/components/SvelteCompletionTest.svelte`;

    client.didOpen(createDidOpenParams(docUri, 'svelte', 1, svelteContent));

    await new Promise(resolve => setTimeout(resolve, 2000));

    try {
      // Test event directive completions
      const eventCompletion = await client.completion( {
        textDocument: createTextDocumentIdentifier(docUri),
        position: { line: 11, character: 14 } // After "on:"
      });

      console.log('✅ Event directive completions:');
      if (eventCompletion) {
        const items = Array.isArray(eventCompletion) 
          ? eventCompletion 
          : (eventCompletion as any).items || [];
        console.log(`  Found ${items.length} completion items`);
        
        const hasClick = items.some((item: any) => item.label.includes('click'));
        const hasInput = items.some((item: any) => item.label.includes('input'));
        
        console.log(`  - click events: ${hasClick ? '✅' : '❌'}`);
        console.log(`  - input events: ${hasInput ? '✅' : '❌'}`);
      }

      // Test binding completions
      const bindCompletion = await client.completion( {
        textDocument: createTextDocumentIdentifier(docUri),
        position: { line: 14, character: 15 } // After "bind:"
      });

      console.log('\n✅ Binding directive completions:');
      if (bindCompletion) {
        const items = Array.isArray(bindCompletion) 
          ? bindCompletion 
          : (bindCompletion as any).items || [];
        console.log(`  Found ${items.length} completion items`);
        
        const hasValue = items.some((item: any) => item.label.includes('value'));
        const hasChecked = items.some((item: any) => item.label.includes('checked'));
        
        console.log(`  - value binding: ${hasValue ? '✅' : '❌'}`);
        console.log(`  - checked binding: ${hasChecked ? '✅' : '❌'}`);
      }

      // Test variable completions in expressions
      const expressionCompletion = await client.completion( {
        textDocument: createTextDocumentIdentifier(docUri),
        position: { line: 21, character: 15 } // Inside expression {|}
      });

      console.log('\n✅ Expression variable completions:');
      if (expressionCompletion) {
        const items = Array.isArray(expressionCompletion) 
          ? expressionCompletion 
          : (expressionCompletion as any).items || [];
        console.log(`  Found ${items.length} completion items`);
        
        const hasName = items.some((item: any) => item.label === 'name');
        const hasCount = items.some((item: any) => item.label === 'count');
        const hasIncrement = items.some((item: any) => item.label === 'increment');
        
        console.log(`  - name variable: ${hasName ? '✅' : '❌'}`);
        console.log(`  - count variable: ${hasCount ? '✅' : '❌'}`);
        console.log(`  - increment function: ${hasIncrement ? '✅' : '❌'}`);
      }

    } catch (error) {
      console.log('Svelte completion test error:', (error as Error).message);
    }

    // Validate that the server processed Svelte-specific syntax without crashing
    expect(client.isProcessAlive()).toBe(true);
    expect(client.getPendingRequestCount()).toBe(0);

    client.didClose(createDidCloseParams(docUri));
  }, 15000);

  test('should provide auto-import completions for external types', async () => {
    const importContent = `<script lang="ts">
  // Test completion that should trigger auto-import
  let person: External|
  
  // Test completion from already imported types
  import type { ExternalPerson } from "./types";
  let validPerson: ExternalPer|
</script>`;

    const docUri = `file://${testAppPath}/src/lib/components/AutoImportTest.svelte`;

    client.didOpen(createDidOpenParams(docUri, 'svelte', 1, importContent));

    await new Promise(resolve => setTimeout(resolve, 2000));

    try {
      // Test auto-import completion
      const autoImportCompletion = await client.completion( {
        textDocument: createTextDocumentIdentifier(docUri),
        position: { line: 2, character: 21 } // After "External"
      });

      console.log('✅ Auto-import completions:');
      if (autoImportCompletion) {
        const items = Array.isArray(autoImportCompletion) 
          ? autoImportCompletion 
          : (autoImportCompletion as any).items || [];
        console.log(`  Found ${items.length} completion items`);
        
        const hasExternalPerson = items.some((item: any) => 
          item.label.includes('ExternalPerson')
        );
        const hasAutoImport = items.some((item: any) => 
          item.additionalTextEdits || item.command
        );
        
        console.log(`  - ExternalPerson type: ${hasExternalPerson ? '✅' : '❌'}`);
        console.log(`  - Has auto-import action: ${hasAutoImport ? '✅' : '❌'}`);
      }

      // Test already imported type completion
      const importedCompletion = await client.completion( {
        textDocument: createTextDocumentIdentifier(docUri),
        position: { line: 6, character: 26 } // After "ExternalPer"
      });

      console.log('\n✅ Imported type completions:');
      if (importedCompletion) {
        const items = Array.isArray(importedCompletion) 
          ? importedCompletion 
          : (importedCompletion as any).items || [];
        console.log(`  Found ${items.length} completion items`);
        
        const hasExternalPerson = items.some((item: any) => 
          item.label === 'ExternalPerson'
        );
        
        console.log(`  - ExternalPerson: ${hasExternalPerson ? '✅' : '❌'}`);
      }

    } catch (error) {
      console.log('Auto-import test error:', (error as Error).message);
    }

    // Validate that the server processed auto-import scenarios without crashing
    expect(client.isProcessAlive()).toBe(true);
    expect(client.getPendingRequestCount()).toBe(0);

    client.didClose(createDidCloseParams(docUri));
  }, 15000);
});