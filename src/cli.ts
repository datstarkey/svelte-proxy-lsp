#!/usr/bin/env node

/**
 * CLI wrapper for svelte-proxy-lsp
 * This file serves as the entry point for npx execution
 */

import { logger, LogLevel } from './utils/logger';

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
  --verbose         Enable verbose logging (debug level)
  --trace           Enable trace logging (most verbose)
  --quiet           Only show errors
  --log-level=<level>  Set log level (error|warn|info|debug|trace)
  --help, -h        Show this help message
  --version, -v     Show version information

Examples:
  # Use with VS Code or other editors via stdio
  svelte-proxy-lsp --stdio
  
  # Use with socket connection
  svelte-proxy-lsp --socket=5000
  
  # Use via npx without installation
  npx svelte-proxy-lsp --stdio

For more information, visit: https://github.com/datstarkey/svelte-proxy-lsp
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

// Configure logging level
if (args.includes('--verbose')) {
  logger.setLevel(LogLevel.DEBUG);
} else if (args.includes('--trace')) {
  logger.setLevel(LogLevel.TRACE);
} else if (args.includes('--quiet')) {
  logger.setLevel(LogLevel.ERROR);
} else {
  // Check for explicit log level
  const logLevelArg = args.find(arg => arg.startsWith('--log-level='));
  if (logLevelArg) {
    const level = logLevelArg.split('=')[1];
    logger.setLevelFromString(level);
  } else {
    // Default to ERROR for stdio mode (to not interfere with LSP communication)
    // and INFO for other modes
    if (args.includes('--stdio') || (!args.includes('--socket') && !args.includes('--pipe') && !args.includes('--node-ipc'))) {
      logger.setLevel(LogLevel.ERROR);
    } else {
      logger.setLevel(LogLevel.INFO);
    }
  }
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
  // The server.ts exports the main function by default when run directly
  // But when imported, we need to manually start the proxy
  const { ProxyServer } = require('./proxy/ProxyServer');
  
  async function startServer() {
    const server = new ProxyServer();
    
    // Handle graceful shutdown
    const shutdown = async () => {
      logger.info('Shutting down Svelte Proxy LSP...');
      await server.stop();
      process.exit(0);
    };
    
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
    process.on('SIGHUP', shutdown);
    
    try {
      logger.info('Svelte Proxy LSP Server starting...');
      await server.start();
    } catch (error) {
      logger.error('Failed to start Svelte Proxy LSP:', error);
      process.exit(1);
    }
  }
  
  startServer();
}).catch((error) => {
  logger.error('Failed to load Svelte Proxy LSP Server:', error);
  process.exit(1);
});