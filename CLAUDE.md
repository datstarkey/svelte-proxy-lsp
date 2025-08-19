# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a standalone LSP proxy service that combines the Svelte Language Server and TypeScript Language Server into a unified LSP interface. The proxy intelligently routes requests based on cursor position and file type to provide comprehensive Svelte development support.

## Build Commands

```bash
# Build the project
pnpm build

# Development with watch mode
pnpm dev

# Start the proxy server
pnpm start

# Clean build artifacts
pnpm clean
```

## Architecture

### Core Components

- **`src/server.ts`** - Main entry point that initializes ProxyServer and handles graceful shutdown
- **`src/proxy/ProxyServer.ts`** - Core proxy logic that manages LSP connections, routes requests, and merges responses
- **`src/proxy/LSPServerProcess.ts`** - Child process management for spawning and communicating with language servers
- **`src/utils/documentParser.ts`** - Svelte file parsing for position-based routing decisions
- **`src/utils/tsconfig.ts`** - TypeScript configuration utilities with Svelte plugin integration

### Request Routing Strategy

The proxy uses position-based routing for `.svelte` files:
- Script blocks (`<script>` tags) → TypeScript Language Server  
- Template/markup → Svelte Language Server
- Style blocks (`<style>` tags) → Svelte Language Server
- Document-wide operations → Both servers (results merged)

For non-Svelte files (`.ts`, `.js`, etc.), requests go directly to the TypeScript server.

### Language Server Configuration

- **Svelte Server**: Configured with comprehensive plugin settings for TypeScript, HTML, CSS, and Svelte-specific features
- **TypeScript Server**: Enhanced with `typescript-svelte-plugin` for Svelte-aware type checking and cross-file references

## Development Notes

- The proxy spawns child processes for both language servers on startup
- Document synchronization keeps both servers in sync with file changes
- Response deduplication prevents duplicate completions and locations
- All LSP capabilities are supported: completions, hover, definitions, references, symbols, code actions, rename, formatting

## Testing

### Test Commands

```bash
# Run all unit tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run integration tests
pnpm test:integration

# Run specific test pattern
pnpm test -- --testNamePattern="parseDocument"

# Run specific integration tests
pnpm test -- --testPathPattern="person-type"
pnpm test -- --testPathPattern="external-person-type"
pnpm test -- --testPathPattern="diagnostics"
pnpm test -- --testPathPattern="symbol-insertion"
pnpm test -- --testPathPattern="workspace-symbols"
pnpm test -- --testPathPattern="document-symbols"
```

### Test Structure

- **Unit Tests** (`tests/unit/`) - Test individual components and utilities
  - `documentParser.test.ts` - Svelte file parsing and position detection  
  - `LSPServerProcess.test.ts` - Server process management
  
- **Integration Tests** (`tests/integration/`) - Test with real language servers
  - `typed-lsp-client.test.ts` - Tests using strongly typed LSP client for protocol compliance
  - `person-type.test.ts` - Tests TypeScript type processing in Svelte components
  - `external-person-type.test.ts` - Tests cross-file type imports and complex type hierarchies
  - `diagnostics.test.ts` - Tests TypeScript error detection and reporting in Svelte files
  - `symbol-insertion.test.ts` - Tests code completions, auto-imports, and symbol insertion
  - `workspace-symbols.test.ts` - Tests workspace-wide symbol search and fuzzy matching
  - `document-symbols.test.ts` - Tests document symbol extraction and hierarchical structure

- **Test App** (`test-app/`) - Minimal SvelteKit application for testing
  - Contains real Svelte components and TypeScript files
  - Used by integration tests to verify cross-file functionality

- **Test Utilities** (`tests/utils/`) - Shared testing utilities
  - `TypedLSPClient.ts` - Strongly typed LSP client using vscode-jsonrpc directly for robust testing with full TypeScript type safety

### Test Results

**Total: 47 passing tests, 1 skipped**

**Unit Tests (26 passing):**
- ✅ Document Parser (16 tests) - Svelte file parsing, region detection, file type routing
- ✅ LSP Server Process (10 tests) - Child process management, lifecycle, communication

**Integration Tests (21 passing, 1 skipped):**
- ✅ Typed LSP Client (3 tests, 1 skipped) - Server initialization, TypeScript operations, real file processing  
- ✅ Person Type Test (2 tests) - Verifies server processes TypeScript types in Svelte components
- ✅ External Person Type Test (2 tests) - Tests cross-file type imports and complex type hierarchies
- ✅ Diagnostics Test (3 tests) - TypeScript error detection in Svelte files, cross-file validation, and error-free file handling
- ✅ Symbol Insertion Test (3 tests) - Code completions, auto-imports, and Svelte-specific syntax
- ✅ Workspace Symbols Test (4 tests) - Workspace symbol search, fuzzy matching, wildcard queries
- ✅ Document Symbols Test (4 tests) - Symbol extraction from Svelte/TypeScript files with ranges
- ⏭️ One complex Svelte operation test skipped (requires language server dependencies)

### Key Test Features

- **Real Server Testing**: Tests use `tsx src/server.ts` to run the actual server
- **TypeScript Type Processing**: Validates the server can handle TypeScript types within Svelte files
- **Cross-file Type Imports**: Tests complex type hierarchies imported from external TypeScript files
- **LSP Protocol Compliance**: Tests using strongly typed vscode-jsonrpc for protocol compliance
- **Realistic Application Structure**: Tests with actual SvelteKit project layout
- **Diagnostic Validation**: Tests TypeScript error detection and cross-file validation
- **Symbol Operations**: Tests code completions, auto-imports, workspace search, document symbols
- **Svelte-specific Features**: Tests event handlers, bindings, directives, and template syntax
- **Position-based Testing**: Validates symbol ranges, hover positions, and completion triggers

### Manual Testing

Run the server directly from TypeScript source:
```bash
# Using npm script
pnpm start:dev --stdio

# Or directly with tsx
npx tsx src/server.ts --stdio
```

Or build first and run the compiled version:
```bash
pnpm build && pnpm start --stdio
```

The test app provides realistic files to test completions, hover, and other LSP features.

### TypedLSPClient Test Utility

The `tests/utils/TypedLSPClient.ts` provides a strongly typed LSP client using vscode-jsonrpc directly for all integration tests:

**Features:**
- **Strong Type Safety**: Full TypeScript types for all LSP protocol messages using vscode-jsonrpc and vscode-languageserver-protocol
- **Direct JSON-RPC Communication**: Uses vscode-jsonrpc directly for better control and reliability
- **Diagnostic Handling**: Built-in support for both push-based and pull-based diagnostics (LSP 3.17+) with intelligent fallback
- **Error Recovery**: Graceful error handling with null returns instead of exceptions
- **Helper Functions**: Utility functions for creating LSP protocol objects (Position, Range, TextDocumentIdentifier, etc.)
- **Process Management**: Tracks server process lifecycle and provides cleanup methods

**Usage Example:**
```typescript
import { TypedLSPClient, createDidOpenParams, createPosition } from '../utils/TypedLSPClient';

const client = new TypedLSPClient(serverProcess);

// Initialize with proper types
await client.initialize({
  processId: process.pid,
  rootUri: `file://${workspacePath}`,
  capabilities: { /* strongly typed */ }
});

client.initialized();

// Open document with helper
client.didOpen(createDidOpenParams(uri, 'svelte', 1, content));

// Get hover with type safety
const hover = await client.hover({
  textDocument: createTextDocumentIdentifier(uri),
  position: createPosition(line, character)
});

// Wait for diagnostics
const diagnostics = await client.waitForDiagnostics(uri, 10000);

// Close document
client.didClose(createDidCloseParams(uri));
```

**Benefits:**
- **Type Safety**: Catches type mismatches at compile time rather than runtime
- **Protocol Compliance**: Ensures all requests follow LSP specification exactly
- **Better IDE Support**: Full autocomplete and IntelliSense for all LSP methods
- **Maintainability**: Direct control over protocol implementation using vscode-jsonrpc
- **Testing Focus**: Allows tests to focus on functionality rather than protocol details

### Testing Anti-Patterns and Mistakes

**CRITICAL ERROR - Meaningless Assertions:**

I initially wrote several tests with `expect(true).toBe(true);` assertions, which is a serious testing anti-pattern. This is completely wrong because:

1. **No Actual Testing**: These assertions always pass regardless of whether the code works
2. **False Confidence**: They give the illusion of test coverage without any validation
3. **Waste of Resources**: They consume CI time and developer attention without value
4. **Maintenance Burden**: They create technical debt that must be fixed later

**What Should Have Been Done:**
- Test specific return values, error conditions, or state changes
- Validate that expected data structures are returned
- Assert that operations complete successfully with measurable outcomes
- Test both success and failure scenarios with concrete expectations

**Example of Proper Test Assertions:**
```typescript
// WRONG - meaningless assertion
expect(true).toBe(true);

// CORRECT - test actual functionality
expect(diagnosticResult).toBeDefined();
expect(diagnosticResult.errors.length).toBeGreaterThan(0);
expect(diagnosticResult.errors[0].message).toContain('Type mismatch');

// CORRECT - test server responses
expect(symbols).toEqual(expect.arrayContaining([
  expect.objectContaining({
    name: 'Person',
    kind: expect.any(Number)
  })
]));
```

This mistake has been corrected in all test files to ensure meaningful validation of LSP server functionality.

## Dependencies

- Language servers are resolved via `require.resolve()` (Svelte) and PATH lookup (TypeScript)
- Requires Node.js 16+ and the underlying language servers to be available
- Uses vscode-languageserver and vscode-jsonrpc libraries for LSP protocol implementation