#!/usr/bin/env node

import { ProxyServer } from './proxy/ProxyServer';
import { logger } from './utils/logger';

async function main() {
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
    await server.start();
  } catch (error) {
    logger.error('Failed to start Svelte Proxy LSP:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(error => {
    logger.error('Unhandled error:', error);
    process.exit(1);
  });
}

export { ProxyServer };