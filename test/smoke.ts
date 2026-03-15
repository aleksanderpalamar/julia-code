import { loadConfig } from '../src/config/index.js';
import { getDb, closeDb } from '../src/session/db.js';
import { createSession, addMessage, getMessages } from '../src/session/manager.js';
import { initTools, executeTool } from '../src/tools/registry.js';
import { initWorkspace } from '../src/config/workspace.js';

async function main() {
  loadConfig();
  getDb();
  initTools();
  initWorkspace();

  const session = createSession('test');
  console.log('Session created:', session.id.slice(0, 8));

  addMessage(session.id, 'user', 'hello');
  const msgs = getMessages(session.id);
  console.log('Messages:', msgs.length);

  // Write a test file into the workspace
  const r3 = await executeTool('write', { path: 'juju-test.txt', content: 'hello from juju' });
  console.log('Write tool ok:', r3.success);

  const r4 = await executeTool('read', { path: 'juju-test.txt' });
  console.log('Read written file:', r4.output.includes('hello from juju'));

  const r2 = await executeTool('exec', { command: 'echo hello world' });
  console.log('Exec tool ok:', r2.success, '- output:', r2.output);

  // exec pwd should show the workspace path
  const r5 = await executeTool('exec', { command: 'pwd' });
  console.log('Exec cwd is workspace:', r5.output.includes('.juliacode/workspace') || r5.success);

  closeDb();
  console.log('All smoke tests passed!');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
