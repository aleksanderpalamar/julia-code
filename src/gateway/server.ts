import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { getConfig } from '../config/index.js';
import { AgentLoop } from '../agent/loop.js';
import { AgentQueue } from '../agent/queue.js';
import {
  createSession,
  listSessions,
  getSession,
  getMessages,
  addMessage,
} from '../session/manager.js';

const agent = new AgentLoop();
const queue = new AgentQueue(agent);

interface GatewayOptions {
  host?: string;
  port?: number;
}

export function startGateway(options: GatewayOptions = {}) {
  const host = options.host ?? '127.0.0.1';
  const port = options.port ?? 18800;

  const server = createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      await route(req, res);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      json(res, 500, { error: message });
    }
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${port} is already in use. Try a different port with --port <number>`);
      process.exit(1);
    }
    throw err;
  });

  server.listen(port, host, () => {
    console.log(`Gateway listening on http://${host}:${port}`);
  });

  return server;
}

async function route(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  const path = url.pathname;
  const method = req.method ?? 'GET';

  if (method === 'GET' && path === '/health') {
    return json(res, 200, { status: 'ok', model: getConfig().defaultModel });
  }

  if (method === 'GET' && path === '/sessions') {
    return json(res, 200, { sessions: listSessions() });
  }

  if (method === 'POST' && path === '/sessions') {
    const body = await readBody(req);
    const session = createSession(body.title as string | undefined);
    return json(res, 201, { session });
  }

  const sessionMatch = path.match(/^\/sessions\/([^/]+)$/);
  if (method === 'GET' && sessionMatch) {
    const session = getSession(sessionMatch[1]);
    if (!session) return json(res, 404, { error: 'Session not found' });
    return json(res, 200, { session });
  }

  const messagesMatch = path.match(/^\/sessions\/([^/]+)\/messages$/);
  if (method === 'GET' && messagesMatch) {
    const session = getSession(messagesMatch[1]);
    if (!session) return json(res, 404, { error: 'Session not found' });
    const messages = getMessages(session.id);
    return json(res, 200, { messages });
  }

  if (method === 'POST' && path === '/chat') {
    const body = await readBody(req);
    if (!body.message) return json(res, 400, { error: 'message is required' });

    const sessionId = (body.session_id as string) ?? createSession(body.title as string | undefined).id;
    const model = (body.model as string) ?? getConfig().defaultModel;
    const message = body.message as string;

    const events: Array<{ type: string; data: unknown }> = [];

    const onChunk = (text: string) => events.push({ type: 'chunk', data: text });
    const onToolCall = (tc: { function: { name: string } }) =>
      events.push({ type: 'tool_call', data: tc.function.name });
    const onToolResult = (name: string, result: string, success: boolean) =>
      events.push({ type: 'tool_result', data: { name, result: result.slice(0, 500), success } });

    agent.on('chunk', onChunk);
    agent.on('tool_call', onToolCall);
    agent.on('tool_result', onToolResult);

    try {
      await queue.enqueue(sessionId, message, model);
    } finally {
      agent.off('chunk', onChunk);
      agent.off('tool_call', onToolCall);
      agent.off('tool_result', onToolResult);
    }

    const messages = getMessages(sessionId);
    const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');

    return json(res, 200, {
      session_id: sessionId,
      response: lastAssistant?.content ?? '',
      events,
    });
  }

  if (method === 'POST' && path === '/chat/stream') {
    const body = await readBody(req);
    if (!body.message) return json(res, 400, { error: 'message is required' });

    const sessionId = (body.session_id as string) ?? createSession(body.title as string | undefined).id;
    const model = (body.model as string) ?? getConfig().defaultModel;

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    const send = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const onThinking = () => send('thinking', {});
    const onChunk = (text: string) => send('chunk', { text });
    const onToolCall = (tc: { function: { name: string; arguments: Record<string, unknown> } }) =>
      send('tool_call', { name: tc.function.name });
    const onToolResult = (name: string, result: string, success: boolean) =>
      send('tool_result', { name, result: result.slice(0, 500), success });
    const onDone = (fullText: string) => send('done', { text: fullText, session_id: sessionId });
    const onError = (error: string) => send('error', { error });

    agent.on('thinking', onThinking);
    agent.on('chunk', onChunk);
    agent.on('tool_call', onToolCall);
    agent.on('tool_result', onToolResult);
    agent.on('done', onDone);
    agent.on('error', onError);

    try {
      await queue.enqueue(sessionId, body.message as string, model);
    } finally {
      agent.off('thinking', onThinking);
      agent.off('chunk', onChunk);
      agent.off('tool_call', onToolCall);
      agent.off('tool_result', onToolResult);
      agent.off('done', onDone);
      agent.off('error', onError);
    }

    res.end();
    return;
  }

  json(res, 404, { error: 'Not found' });
}

function json(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => (data += chunk));
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}
