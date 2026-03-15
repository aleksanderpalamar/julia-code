import { loadConfig } from '../src/config/index.js';
import { getDb, closeDb } from '../src/session/db.js';
import { initProviders } from '../src/providers/registry.js';
import { initTools, executeTool } from '../src/tools/registry.js';
import { initWorkspace } from '../src/config/workspace.js';

async function main() {
  loadConfig();
  getDb();
  initProviders();
  initTools();
  initWorkspace();

  // Test fetch tool directly
  console.log('--- Testing fetch tool ---');
  const r = await executeTool('fetch', { url: 'https://httpbin.org/get', max_length: 500 });
  console.log('success:', r.success);
  console.log('output:', r.output.slice(0, 300));

  console.log('\n--- Testing HTML fetch ---');
  const r2 = await executeTool('fetch', { url: 'https://example.com', max_length: 1000 });
  console.log('success:', r2.success);
  console.log('output:', r2.output.slice(0, 300));

  closeDb();
  console.log('\nFetch tests passed!');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
