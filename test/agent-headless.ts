import { loadConfig } from '../src/config/index.js';
import { getDb, closeDb } from '../src/session/db.js';
import { initProviders } from '../src/providers/registry.js';
import { initTools } from '../src/tools/registry.js';
import { initWorkspace } from '../src/config/workspace.js';
import { createSession } from '../src/session/manager.js';
import { AgentLoop } from '../src/agent/loop.js';

async function main() {
  loadConfig();
  getDb();
  initProviders();
  initTools();
  initWorkspace();

  const session = createSession('headless-test');
  const agent = new AgentLoop();

  agent.on('thinking', () => process.stdout.write('[thinking] '));
  agent.on('chunk', (text) => process.stdout.write(text));
  agent.on('tool_call', (tc) => console.log(`\n[tool_call] ${tc.function.name}(${JSON.stringify(tc.function.arguments)})`));
  agent.on('tool_result', (name, result, ok) => console.log(`[tool_result] ${name}: ${ok ? 'ok' : 'error'} (${result.slice(0, 100)}...)`));
  agent.on('done', () => console.log('\n[done]'));
  agent.on('error', (err) => console.error(`\n[error] ${err}`));

  console.log('Sending message: "What files are in the current directory? Use the exec tool to run ls -la"');
  console.log('---');

  await agent.run(session.id, 'What files are in the current directory? Use the exec tool to run ls -la');

  closeDb();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
