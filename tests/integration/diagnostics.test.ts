import { ChildProcess, spawn } from "child_process";
import { readFileSync } from "fs";
import { join } from "path";
import {
  TypedLSPClient,
  createDidCloseParams,
  createDidOpenParams,
} from "../utils/TypedLSPClient";

describe("LSP Diagnostics Tests", () => {
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
          publishDiagnostics: {},
          hover: { dynamicRegistration: true },
          completion: { dynamicRegistration: true },
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

    // Give server time to initialize fully
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }, 30000);

  afterAll(async () => {
    // Properly shutdown the client and server
    if (client) {
      try {
        await client.shutdown();
        client.exit();
        // Wait a bit for the exit to process
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error) {
        console.error("Error during client shutdown:", error);
      } finally {
        client.dispose();
      }
    }

    if (serverProcess && !serverProcess.killed) {
      serverProcess.kill("SIGTERM");
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  });

  test("should detect TypeScript errors in Svelte files", async () => {
    const errorTestFile = join(
      testAppPath,
      "src/lib/components/ErrorTest.svelte",
    );
    const content = readFileSync(errorTestFile, "utf-8");
    const docUri = `file://${errorTestFile}`;

    console.log("Opening ErrorTest.svelte with known TypeScript errors...");

    // Clear any existing diagnostics
    client.clearDiagnostics();

    // Open document with errors
    client.didOpen(createDidOpenParams(docUri, "svelte", 1, content));

    // Give the server time to process the file
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Sometimes diagnostics need a change event to trigger
    // Send a minor change to trigger diagnostics
    client.didChange({
      textDocument: { uri: docUri, version: 2 },
      contentChanges: [{ text: content }],
    });

    // Wait for diagnostics to be published
    const diagnostics = await client.waitForDiagnostics(docUri, 15000);

    console.log(
      `✅ Received ${diagnostics.length} diagnostic(s) for ErrorTest.svelte`,
    );

    diagnostics.forEach((diagnostic, index) => {
      console.log(
        `  ${index + 1}. Line ${diagnostic.range.start.line + 1}: ${diagnostic.message} (severity: ${diagnostic.severity})`,
      );
    });

    // Validate that we received diagnostics
    expect(diagnostics).toBeDefined();
    expect(Array.isArray(diagnostics)).toBe(true);
    expect(diagnostics.length).toBeGreaterThan(0);

    // We should have at least some errors for the intentional mistakes
    if (diagnostics.length > 0) {
      const messages = diagnostics.map((d: any) => d.message);

      // Check for specific expected errors
      const hasStringNotAssignableToNumber = messages.some(
        (msg: string) =>
          msg.includes("string") &&
          msg.includes("assignable") &&
          msg.includes("number"),
      );
      const hasMissingAgeProperty = messages.some(
        (msg: string) =>
          (msg.includes("Property") &&
            msg.includes("age") &&
            msg.includes("missing")) ||
          (msg.includes("age") && msg.includes("required")),
      );
      const hasNumberNotAssignableToString = messages.some(
        (msg: string) =>
          msg.includes("number") &&
          msg.includes("assignable") &&
          msg.includes("string"),
      );

      console.log(`✅ Found expected errors:`);
      console.log(
        `  - String not assignable to number: ${hasStringNotAssignableToNumber ? "✅" : "❌"}`,
      );
      console.log(
        `  - Missing age property: ${hasMissingAgeProperty ? "✅" : "❌"}`,
      );
      console.log(
        `  - Number not assignable to string: ${hasNumberNotAssignableToString ? "✅" : "❌"}`,
      );

      // At least verify we have some error diagnostics
      expect(diagnostics.length).toBeGreaterThan(0);

      // Verify we have error-level diagnostics (severity 1 = Error)
      const errorDiagnostics = diagnostics.filter((d: any) => d.severity === 1);
      expect(errorDiagnostics.length).toBeGreaterThan(0);

      // Verify we found at least one of our expected specific errors
      expect(
        hasStringNotAssignableToNumber &&
          hasMissingAgeProperty &&
          hasNumberNotAssignableToString,
      ).toBe(true);
    } else {
      console.log(
        "⚠️ No diagnostics received - this might indicate the language servers are not available",
      );
    }

    // Validate that the server processed the document without crashing
    expect(client.isProcessAlive()).toBe(true);
    expect(client.getPendingRequestCount()).toBe(0);

    // Clean up
    client.didClose(createDidCloseParams(docUri));
  }, 20000);

  test("should detect cross-file import errors", async () => {
    const importErrorFile = join(
      testAppPath,
      "src/lib/components/ImportErrorTest.svelte",
    );
    const content = readFileSync(importErrorFile, "utf-8");
    const docUri = `file://${importErrorFile}`;

    console.log(
      "Opening ImportErrorTest.svelte with cross-file import errors...",
    );

    client.clearDiagnostics();

    client.didOpen(createDidOpenParams(docUri, "svelte", 1, content));

    const diagnostics = await client.waitForDiagnostics(docUri, 10000);

    console.log(
      `✅ Received ${diagnostics.length} diagnostic(s) for ImportErrorTest.svelte`,
    );

    diagnostics.forEach((diagnostic, index) => {
      console.log(
        `  ${index + 1}. Line ${diagnostic.range.start.line + 1}: ${diagnostic.message} (severity: ${diagnostic.severity})`,
      );
    });

    expect(diagnostics).toBeDefined();
    expect(Array.isArray(diagnostics)).toBe(true);
    expect(diagnostics.length).toBeGreaterThan(0);

    if (diagnostics.length > 0) {
      const messages = diagnostics.map((d: any) => d.message);

      // Check for specific expected import errors
      const hasCannotFindModule = messages.some(
        (msg: string) =>
          msg.includes("Cannot find module") && msg.includes("./missing-file"),
      );
      const hasCannotFindType = messages.some(
        (msg: string) =>
          msg.includes("Cannot find name") && msg.includes("NonExistentType"),
      );
      const hasStringNotAssignableToDate = messages.some(
        (msg: string) =>
          msg.includes("string") &&
          msg.includes("assignable") &&
          msg.includes("Date"),
      );
      const hasStringNotAssignableToJob = messages.some(
        (msg: string) =>
          msg.includes("string") &&
          msg.includes("assignable") &&
          msg.includes("Job"),
      );

      console.log(`✅ Found expected import/type errors:`);
      console.log(
        `  - Cannot find module './missing-file': ${hasCannotFindModule ? "✅" : "❌"}`,
      );
      console.log(
        `  - Cannot find name 'NonExistentType': ${hasCannotFindType ? "✅" : "❌"}`,
      );
      console.log(
        `  - String not assignable to Date: ${hasStringNotAssignableToDate ? "✅" : "❌"}`,
      );
      console.log(
        `  - String not assignable to Job: ${hasStringNotAssignableToJob ? "✅" : "❌"}`,
      );

      expect(diagnostics.length).toBeGreaterThan(0);

      // Should have error-level diagnostics for import issues
      const errorDiagnostics = diagnostics.filter((d: any) => d.severity === 1);
      expect(errorDiagnostics.length).toBeGreaterThan(0);

      // Verify we found at least one of our expected specific errors
      expect(
        hasCannotFindModule ||
          hasCannotFindType ||
          hasStringNotAssignableToDate ||
          hasStringNotAssignableToJob,
      ).toBe(true);
    } else {
      console.log("⚠️ No diagnostics received for cross-file errors");
    }

    // Validate that the server handled the cross-file errors without crashing
    expect(client.isProcessAlive()).toBe(true);
    expect(client.getPendingRequestCount()).toBe(0);

    client.didClose(createDidCloseParams(docUri));
  }, 20000);

  test("should handle valid files with no errors", async () => {
    const validFile = join(
      testAppPath,
      "src/lib/components/ComplexType.svelte",
    );
    const content = readFileSync(validFile, "utf-8");
    const docUri = `file://${validFile}`;

    console.log("Opening ComplexType.svelte (should be error-free)...");

    client.clearDiagnostics();

    client.didOpen(createDidOpenParams(docUri, "svelte", 1, content));

    // Wait a bit for diagnostics (might be empty)
    const diagnostics = await client.waitForDiagnostics(docUri, 8000);

    console.log(
      `✅ Received ${diagnostics.length} diagnostic(s) for ComplexType.svelte`,
    );

    if (diagnostics.length > 0) {
      diagnostics.forEach((diagnostic, index) => {
        console.log(
          `  ${index + 1}. Line ${diagnostic.range.start.line + 1}: ${diagnostic.message} (severity: ${diagnostic.severity})`,
        );
      });
    }

    expect(diagnostics).toBeDefined();
    expect(Array.isArray(diagnostics)).toBe(true);

    // For a valid file, we should have no error-level diagnostics
    const errorDiagnostics = diagnostics.filter((d: any) => d.severity === 1);
    console.log(`✅ Error-level diagnostics: ${errorDiagnostics.length}`);

    // This should be 0 for a valid file
    expect(errorDiagnostics.length).toBe(0);

    // Validate server is still healthy
    expect(client.isProcessAlive()).toBe(true);
    expect(client.getPendingRequestCount()).toBe(0);

    client.didClose(createDidCloseParams(docUri));
  }, 15000);
});
