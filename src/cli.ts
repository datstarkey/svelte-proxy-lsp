#!/usr/bin/env node

/**
 * CLI wrapper for svelte-proxy-lsp
 * This file serves as the entry point for npx execution
 */

// Parse command line arguments
const args = process.argv.slice(2);

// Help text
const helpText = `
svelte-proxy-lsp - A unified LSP proxy for Svelte and TypeScript

Usage:
  svelte-proxy-lsp [options]

Options:
  --stdio           Use stdio for communication (default)
  --node-ipc        Use node-ipc for communication
  --socket=<port>   Use socket on specified port
  --pipe=<name>     Use named pipe
  --help, -h        Show this help message
  --version, -v     Show version information

Examples:
  # Use with VS Code or other editors via stdio
  svelte-proxy-lsp --stdio
  
  # Use with socket connection
  svelte-proxy-lsp --socket=5000
  
  # Use via npx without installation
  npx svelte-proxy-lsp --stdio

For more information, visit: https://github.com/yourusername/svelte-proxy-lsp
`;

// Check for help flag
if (args.includes('--help') || args.includes('-h')) {
  console.log(helpText);
  process.exit(0);
}

// Check for version flag
if (args.includes('--version') || args.includes('-v')) {
  const packageJson = require('../package.json');
  console.log(`svelte-proxy-lsp v${packageJson.version}`);
  process.exit(0);
}

// Default to stdio if no communication method specified
if (args.length === 0 || (!args.includes('--stdio') && 
    !args.includes('--node-ipc') && 
    !args.some(arg => arg.startsWith('--socket')) && 
    !args.some(arg => arg.startsWith('--pipe')))) {
  args.push('--stdio');
}

// Import and start the server
import('./server').then(() => {
  // The server module will handle the startup
  console.error('Svelte Proxy LSP Server starting...');
}).catch((error) => {
  console.error('Failed to start Svelte Proxy LSP Server:', error);
  process.exit(1);
});