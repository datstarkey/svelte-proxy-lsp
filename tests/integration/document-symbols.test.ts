import { ChildProcess, spawn } from "child_process";
import { readFileSync } from "fs";
import { join } from "path";
import type { SymbolInformation } from "vscode-languageserver-protocol";
import {
  TypedLSPClient,
  createDidCloseParams,
  createDidOpenParams,
  createTextDocumentIdentifier,
} from "../utils/TypedLSPClient";

describe("LSP Document Symbol Tests", () => {
  let serverProcess: ChildProcess;
  let client: TypedLSPClient;
  const testAppPath = join(__dirname, "../../test-app");

  beforeAll(async () => {
    const serverPath = join(__dirname, "../../src/server.ts");

    serverProcess = spawn("npx", ["tsx", serverPath, "--stdio"], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    await new Promise((resolve) => setTimeout(resolve, 2000));

    if (!serverProcess.stdin || !serverProcess.stdout) {
      throw new Error("Failed to create server stdio");
    }

    client = new TypedLSPClient(serverProcess);

    // Initialize the server
    await client.initialize({
      processId: process.pid,
      rootUri: `file://${testAppPath}`,
      capabilities: {
        textDocument: {
          documentSymbol: {
            dynamicRegistration: true,
            symbolKind: {
              valueSet: [
                1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18,
                19, 20, 21, 22, 23, 24, 25, 26,
              ],
            },
            hierarchicalDocumentSymbolSupport: true,
            tagSupport: {
              valueSet: [1],
            },
          },
          hover: { dynamicRegistration: true },
          definition: { dynamicRegistration: true },
        },
      },
      workspaceFolders: [
        {
          uri: `file://${testAppPath}`,
          name: "test-app",
        },
      ],
    });

    client.initialized();
  }, 30000);

  afterAll(async () => {
    if (serverProcess && !serverProcess.killed) {
      serverProcess.kill("SIGTERM");
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  });

  test("should extract symbols from Svelte components", async () => {
    const complexTypeFile = join(
      testAppPath,
      "src/lib/components/ComplexType.svelte",
    );
    const content = readFileSync(complexTypeFile, "utf-8");
    const uri = `file://${complexTypeFile}`;

    // Open the document
    client.didOpen(createDidOpenParams(uri, "svelte", 1, content));

    await new Promise((resolve) => setTimeout(resolve, 2000));

    const symbols = await client.documentSymbol({
      textDocument: createTextDocumentIdentifier(uri),
    });

    // Assert symbols were returned
    expect(symbols).toBeDefined();
    expect(Array.isArray(symbols)).toBe(true);
    expect(symbols).not.toHaveLength(0);

    console.log("✅ ComplexType.svelte Document Symbols:");
    console.log(`  Found ${symbols!.length} top-level symbols`);

    const symbolsArray = symbols as any[];

    // Helper to recursively find all symbols
    const getAllSymbolNames = (syms: any[]): string[] => {
      const names: string[] = [];
      syms.forEach((symbol) => {
        names.push(symbol.name);
        if (symbol.children) {
          names.push(...getAllSymbolNames(symbol.children));
        }
      });
      return names;
    };

    const allSymbolNames = getAllSymbolNames(symbolsArray);

    // Assert expected symbols exist
    expect(allSymbolNames).toContain("Person");
    expect(
      allSymbolNames.some((name) => name.includes("Props") || name === "Props"),
    ).toBe(true);
    expect(allSymbolNames).toContain("input"); // The actual prop name is 'input', not 'person'

    // Validate that the server processed Svelte component symbols without crashing
    expect(client.isProcessAlive()).toBe(true);
    expect(client.getPendingRequestCount()).toBe(0);

    client.didClose(createDidCloseParams(uri));
  }, 15000);

  test("should extract symbols from TypeScript files", async () => {
    const typesFile = join(testAppPath, "src/lib/components/types.ts");
    const content = readFileSync(typesFile, "utf-8");
    const uri = `file://${typesFile}`;

    client.didOpen(createDidOpenParams(uri, "typescript", 1, content));

    await new Promise((resolve) => setTimeout(resolve, 2000));

    const symbols = await client.documentSymbol({
      textDocument: createTextDocumentIdentifier(uri),
    });

    // Assert symbols were returned
    expect(symbols).toBeDefined();
    expect(Array.isArray(symbols)).toBe(true);
    expect(symbols).not.toHaveLength(0);

    console.log("✅ types.ts Document Symbols:");
    console.log(`  Found ${symbols!.length} symbols`);

    const symbolsArray = symbols as SymbolInformation[];

    // Assert expected type definitions exist
    const hasExternalPerson = symbolsArray.some(
      (s: any) => s.name === "ExternalPerson",
    );
    const hasJob = symbolsArray.some((s: any) => s.name === "Job");

    expect(hasExternalPerson).toBe(true);
    expect(hasJob).toBe(true);

    // Check that ExternalPerson has expected properties
    const externalPerson = symbolsArray.find(
      (s) => s.name === "ExternalPerson",
    );
    expect(externalPerson).toBeDefined();
    // Kind 13 is Variable, 11 is Interface, 5 is Class - TypeScript server may return as Variable
    expect([5, 11, 13]).toContain(externalPerson!.kind);

    // SymbolInformation doesn't have children property, that's DocumentSymbol
    // So we skip the children check for SymbolInformation

    // Validate that the server processed TypeScript file symbols without crashing
    expect(client.isProcessAlive()).toBe(true);
    expect(client.getPendingRequestCount()).toBe(0);

    client.didClose(createDidCloseParams(uri));
  }, 15000);

  test("should extract symbols from complex Svelte component", async () => {
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

    client.didOpen(createDidOpenParams(uri, "svelte", 1, complexContent));

    await new Promise((resolve) => setTimeout(resolve, 2000));

    const symbols = await client.documentSymbol({
      textDocument: createTextDocumentIdentifier(uri),
    });

    // Assert symbols were returned
    expect(symbols).toBeDefined();
    expect(Array.isArray(symbols)).toBe(true);
    expect(symbols).not.toHaveLength(0);

    console.log("✅ Complex Svelte Component Symbols:");
    console.log(`  Found ${symbols!.length} symbols`);

    const symbolsArray = symbols as any[];

    // Helper to recursively find all symbols
    const getAllSymbolNames = (syms: any[]): string[] => {
      const names: string[] = [];
      syms.forEach((symbol) => {
        names.push(symbol.name);
        if (symbol.children) {
          names.push(...getAllSymbolNames(symbol.children));
        }
      });
      return names;
    };

    const allNames = getAllSymbolNames(symbolsArray);

    // Assert all expected symbols exist
    expect(allNames).toContain("Props");
    expect(allNames).toContain("LocalType");
    expect(allNames).toContain("CONSTANT_VALUE");
    expect(allNames).toContain("handleClick");
    expect(allNames).toContain("processData");
    expect(allNames).toContain("localVar");
    expect(allNames).toContain("title");
    expect(allNames).toContain("person");
    expect(allNames).toContain("count");

    // Validate that the server processed complex component symbols without crashing
    expect(client.isProcessAlive()).toBe(true);
    expect(client.getPendingRequestCount()).toBe(0);

    client.didClose(createDidCloseParams(uri));
  }, 15000);

  test("should handle symbol ranges and positions correctly", async () => {
    const utilsFile = join(testAppPath, "src/lib/utils.ts");
    const content = readFileSync(utilsFile, "utf-8");
    const uri = `file://${utilsFile}`;

    client.didOpen(createDidOpenParams(uri, "typescript", 1, content));

    await new Promise((resolve) => setTimeout(resolve, 2000));

    const symbols = await client.documentSymbol({
      textDocument: createTextDocumentIdentifier(uri),
    });

    // Assert symbols were returned
    expect(symbols).toBeDefined();
    expect(Array.isArray(symbols)).toBe(true);
    expect(symbols).not.toHaveLength(0);

    console.log("✅ utils.ts Symbol Ranges and Positions:");

    const symbolsArray = symbols as any[];

    // Test each symbol has valid ranges
    symbolsArray.forEach((symbol: any) => {
      console.log(`  Symbol: ${symbol.name}`);

      // Assert range exists and is valid
      expect(symbol.range).toBeDefined();
      expect(symbol.range.start).toBeDefined();
      expect(symbol.range.end).toBeDefined();
      expect(symbol.range.start.line).toBeGreaterThanOrEqual(0);
      expect(symbol.range.start.character).toBeGreaterThanOrEqual(0);
      expect(symbol.range.end.line).toBeGreaterThanOrEqual(
        symbol.range.start.line,
      );

      // Assert selection range exists and is valid
      expect(symbol.selectionRange).toBeDefined();
      expect(symbol.selectionRange.start).toBeDefined();
      expect(symbol.selectionRange.end).toBeDefined();
      expect(symbol.selectionRange.start.line).toBeGreaterThanOrEqual(0);
      expect(symbol.selectionRange.start.character).toBeGreaterThanOrEqual(0);

      // Selection range should be within the full range
      expect(symbol.selectionRange.start.line).toBeGreaterThanOrEqual(
        symbol.range.start.line,
      );
      expect(symbol.selectionRange.end.line).toBeLessThanOrEqual(
        symbol.range.end.line,
      );
    });

    // Assert expected symbols exist
    const symbolNames = symbolsArray.map((s: any) => s.name);
    expect(symbolNames).toContain("formatDate");
    expect(symbolNames).toContain("greetUser");
    expect(symbolNames).toContain("UserManager");
    expect(symbolNames).toContain("GreetingOptions");

    // Validate that the server processed symbol range queries without crashing
    expect(client.isProcessAlive()).toBe(true);
    expect(client.getPendingRequestCount()).toBe(0);

    client.didClose(createDidCloseParams(uri));
  }, 15000);
});
