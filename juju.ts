#!/usr/bin/env tsx
import React from 'react';
import { render } from 'ink';
import { App } from './src/tui/app.js';
import { loadConfig } from './src/config/index.js';
import { getDb, closeDb } from './src/session/db.js';
import { initProviders } from './src/providers/registry.js';
import { initTools } from './src/tools/registry.js';
import { initWorkspace } from './src/config/workspace.js';
import { startGateway } from './src/gateway/server.js';

// Bootstrap
loadConfig();
getDb();          // Initialize database
initProviders();  // Register LLM providers
initTools();      // Register tools
initWorkspace();  // Create workspace directory

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

  waitUntilExit().then(() => {
    closeDb();
    process.exit(0);
  });
}
