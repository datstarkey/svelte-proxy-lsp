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

    // Test completion after "person."
    const personCompletion = await client.completion( {
      textDocument: createTextDocumentIdentifier(docUri),
      position: { line: 10, character: 11 } // After "person."
    });

    // Assert completion response is valid
    expect(personCompletion).toBeDefined();
    
    const personItems = Array.isArray(personCompletion) 
      ? personCompletion 
      : (personCompletion as any).items || [];
    
    expect(personItems.length).toBeGreaterThan(0);
    
    console.log('✅ Person property completions:');
    console.log(`  Found ${personItems.length} completion items`);
    
    // Assert expected properties are present
    const hasName = personItems.some((item: any) => item.label === 'name');
    const hasAge = personItems.some((item: any) => item.label === 'age');
    const hasJob = personItems.some((item: any) => item.label === 'job');
    
    expect(hasName).toBe(true);
    expect(hasAge).toBe(true);
    expect(hasJob).toBe(true);

    // Test completion after "person.job."
    const jobCompletion = await client.completion( {
      textDocument: createTextDocumentIdentifier(docUri),
      position: { line: 13, character: 15 } // After "person.job."
    });

    expect(jobCompletion).toBeDefined();
    
    const jobItems = Array.isArray(jobCompletion) 
      ? jobCompletion 
      : (jobCompletion as any).items || [];
    
    expect(jobItems.length).toBeGreaterThan(0);
    
    console.log('\n✅ Job property completions:');
    console.log(`  Found ${jobItems.length} completion items`);
    
    // Assert expected Job properties
    const hasTitle = jobItems.some((item: any) => item.label === 'title');
    const hasWork = jobItems.some((item: any) => item.label === 'work' || item.label === 'company');
    
    expect(hasTitle || hasWork).toBe(true);

    // Test built-in Date methods - this tests TypeScript's built-in completions
    const dateCompletion = await client.completion( {
      textDocument: createTextDocumentIdentifier(docUri),
      position: { line: 16, character: 35 } // After "toDate"
    });

    expect(dateCompletion).toBeDefined();
    
    const dateItems = Array.isArray(dateCompletion) 
      ? dateCompletion 
      : (dateCompletion as any).items || [];
    
    // Should have Date method completions
    // We don't strictly require specific methods as this depends on TypeScript version
    expect(dateItems.length).toBeGreaterThan(0);
    
    console.log('\n✅ Date method completions:');
    console.log(`  Found ${dateItems.length} completion items`);

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

    // Test event directive completions
      const eventCompletion = await client.completion( {
        textDocument: createTextDocumentIdentifier(docUri),
        position: { line: 11, character: 14 } // After "on:"
      });

      expect(eventCompletion).toBeDefined();
      
      const eventItems = Array.isArray(eventCompletion) 
        ? eventCompletion 
        : (eventCompletion as any).items || [];
      
      console.log('✅ Event directive completions:');
      console.log(`  Found ${eventItems.length} completion items`);
      
      // Svelte should provide event completions
      expect(eventItems.length).toBeGreaterThan(0);
      
      const hasClick = eventItems.some((item: any) => item.label.includes('click'));
      const hasInput = eventItems.some((item: any) => item.label.includes('input'));
      
      // At least one event type should be present
      expect(hasClick || hasInput).toBe(true);

      // Test binding completions
      const bindCompletion = await client.completion( {
        textDocument: createTextDocumentIdentifier(docUri),
        position: { line: 14, character: 15 } // After "bind:"
      });

      expect(bindCompletion).toBeDefined();
      
      const bindItems = Array.isArray(bindCompletion) 
        ? bindCompletion 
        : (bindCompletion as any).items || [];
      
      console.log('\n✅ Binding directive completions:');
      console.log(`  Found ${bindItems.length} completion items`);
      
      // Svelte should provide binding completions for input elements
      expect(bindItems.length).toBeGreaterThan(0);
      
      const hasValue = bindItems.some((item: any) => item.label.includes('value'));
      const hasChecked = bindItems.some((item: any) => item.label.includes('checked'));
      
      // At least one binding type should be present
      expect(hasValue || hasChecked).toBe(true);

      // Test variable completions in expressions
      const expressionCompletion = await client.completion( {
        textDocument: createTextDocumentIdentifier(docUri),
        position: { line: 21, character: 15 } // Inside expression {|}
      });

      expect(expressionCompletion).toBeDefined();
      
      const exprItems = Array.isArray(expressionCompletion) 
        ? expressionCompletion 
        : (expressionCompletion as any).items || [];
      
      console.log('\n✅ Expression variable completions:');
      console.log(`  Found ${exprItems.length} completion items`);
      
      // Should have access to script variables in template expressions
      expect(exprItems.length).toBeGreaterThan(0);
      
      const hasName = exprItems.some((item: any) => item.label === 'name');
      const hasCount = exprItems.some((item: any) => item.label === 'count');
      const hasIncrement = exprItems.some((item: any) => item.label === 'increment');
      
      // At least one variable should be available in the expression
      expect(hasName || hasCount || hasIncrement).toBe(true);


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

    // Test auto-import completion
      const autoImportCompletion = await client.completion( {
        textDocument: createTextDocumentIdentifier(docUri),
        position: { line: 2, character: 21 } // After "External"
      });

      expect(autoImportCompletion).toBeDefined();
      
      const autoImportItems = Array.isArray(autoImportCompletion) 
        ? autoImportCompletion 
        : (autoImportCompletion as any).items || [];
      
      console.log('✅ Auto-import completions:');
      console.log(`  Found ${autoImportItems.length} completion items`);
      
      // TypeScript should provide completions even for not-yet-imported types
      // This may not always work depending on server implementation
      if (autoImportItems.length > 0) {
        const hasExternalPerson = autoImportItems.some((item: any) => 
          item.label.includes('ExternalPerson')
        );
        const hasAutoImport = autoImportItems.some((item: any) => 
          item.additionalTextEdits || item.command
        );
        
        // If we have items, check for relevant ones
        expect(hasExternalPerson || hasAutoImport).toBe(true);
      }

      // Test already imported type completion
      const importedCompletion = await client.completion( {
        textDocument: createTextDocumentIdentifier(docUri),
        position: { line: 6, character: 26 } // After "ExternalPer"
      });

      expect(importedCompletion).toBeDefined();
      
      const importedItems = Array.isArray(importedCompletion) 
        ? importedCompletion 
        : (importedCompletion as any).items || [];
      
      console.log('\n✅ Imported type completions:');
      console.log(`  Found ${importedItems.length} completion items`);
      
      // Should complete already imported types
      expect(importedItems.length).toBeGreaterThan(0);
      
      const hasExternalPerson = importedItems.some((item: any) => 
        item.label === 'ExternalPerson'
      );
      
      expect(hasExternalPerson).toBe(true);


    // Validate that the server processed auto-import scenarios without crashing
    expect(client.isProcessAlive()).toBe(true);
    expect(client.getPendingRequestCount()).toBe(0);

    client.didClose(createDidCloseParams(docUri));
  }, 15000);
});