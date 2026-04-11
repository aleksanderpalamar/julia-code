#!/usr/bin/env tsx
import React from 'react';
import { render } from 'ink';
import { App } from './src/tui/app.js';
import { loadConfig, reloadConfig } from './src/config/index.js';
import { getDb, closeDb } from './src/session/db.js';
import { initProviders } from './src/providers/registry.js';
import { initTools } from './src/tools/registry.js';
import { initWorkspace } from './src/config/workspace.js';
import { startGateway } from './src/gateway/server.js';
import { initMcpServers, shutdownMcpServers } from './src/mcp/index.js';
import { syncAvailableModels } from './src/config/mcp.js';
import { cleanupOrphanedWorktrees } from './src/agent/worktree.js';

// Bootstrap
async function bootstrap() {
  loadConfig();
  getDb();          // Initialize database
  initProviders();  // Register LLM providers
  await syncAvailableModels();  // Populate models.available from Ollama + auto-detect toolModel
  reloadConfig();   // Reload config after sync (toolModel may have been auto-configured)
  initTools();      // Register tools
  initWorkspace();  // Create workspace directory
  cleanupOrphanedWorktrees();  // Remove stale worktrees from previous runs
  await initMcpServers();  // Connect MCP servers and register their tools
}

await bootstrap();

// Parse CLI args
const args = process.argv.slice(2);
let sessionId: string | undefined;
let mode: 'tui' | 'gateway' = 'tui';
let gatewayPort = 18800;
let gatewayHost = '127.0.0.1';

for (let i = 0; i < args.length; i++) {
  if ((args[i] === '--session' || args[i] === '-s') && args[i + 1]) {
    sessionId = args[++i];
  }
  if (args[i] === '--gateway' || args[i] === '-g') {
    mode = 'gateway';
  }
  if (args[i] === '--port' && args[i + 1]) {
    gatewayPort = Number(args[++i]);
  }
  if (args[i] === '--host' && args[i + 1]) {
    gatewayHost = args[++i];
  }
}

if (mode === 'gateway') {
  // Run as HTTP gateway daemon
  startGateway({ host: gatewayHost, port: gatewayPort });
} else {
  // Run TUI
  const { waitUntilExit } = render(
    React.createElement(App, { sessionId })
  );

  waitUntilExit().then(async () => {
    cleanupOrphanedWorktrees();
    await shutdownMcpServers();
    closeDb();
    process.exit(0);
  });
}

// Cleanup worktrees on unexpected exit
process.on('SIGINT', () => {
  cleanupOrphanedWorktrees();
  process.exit(0);
});
process.on('SIGTERM', () => {
  cleanupOrphanedWorktrees();
  process.exit(0);
});
