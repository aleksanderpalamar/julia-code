import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';

interface PendingRequest {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: unknown;
}

interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

const REQUEST_TIMEOUT_MS = 30_000;

export class McpTransport extends EventEmitter {
  private child: ChildProcess | null = null;
  private pending = new Map<number, PendingRequest>();
  private nextId = 1;
  private buffer = '';
  private _closed = false;

  constructor(
    private command: string,
    private args: string[],
    private env?: Record<string, string>,
  ) {
    super();
  }

  start(): void {
    this.child = spawn(this.command, this.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...this.env },
    });

    this.child.stdout!.on('data', (chunk: Buffer) => {
      this.buffer += chunk.toString();
      this.processBuffer();
    });

    this.child.stderr!.on('data', (chunk: Buffer) => {
      // Log MCP server stderr as debug info
      const lines = chunk.toString().trim();
      if (lines) {
        for (const line of lines.split('\n')) {
          process.stderr.write(`[mcp:${this.command}] ${line}\n`);
        }
      }
    });

    this.child.on('error', (err) => {
      this.rejectAll(err);
      this._closed = true;
      this.emit('error', err);
    });

    this.child.on('exit', (code) => {
      this.rejectAll(new Error(`MCP server exited with code ${code}`));
      this._closed = true;
      this.emit('close', code);
    });
  }

  get closed(): boolean {
    return this._closed;
  }

  send(method: string, params?: unknown): Promise<unknown> {
    if (this._closed || !this.child) {
      return Promise.reject(new Error('Transport is closed'));
    }

    const id = this.nextId++;
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      ...(params !== undefined && { params }),
    };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP request '${method}' timed out after ${REQUEST_TIMEOUT_MS}ms`));
      }, REQUEST_TIMEOUT_MS);

      this.pending.set(id, { resolve, reject, timer });
      this.child!.stdin!.write(JSON.stringify(request) + '\n');
    });
  }

  notify(method: string, params?: unknown): void {
    if (this._closed || !this.child) return;

    const notification: JsonRpcNotification = {
      jsonrpc: '2.0',
      method,
      ...(params !== undefined && { params }),
    };

    this.child.stdin!.write(JSON.stringify(notification) + '\n');
  }

  close(): void {
    if (this._closed) return;
    this._closed = true;

    this.rejectAll(new Error('Transport closed'));

    if (this.child) {
      this.child.stdin!.end();
      this.child.kill();
      this.child = null;
    }
  }

  private processBuffer(): void {
    const lines = this.buffer.split('\n');
    // Keep the last incomplete line in the buffer
    this.buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const msg = JSON.parse(trimmed) as JsonRpcResponse;
        if (msg.id !== undefined && this.pending.has(msg.id)) {
          const pending = this.pending.get(msg.id)!;
          this.pending.delete(msg.id);
          clearTimeout(pending.timer);

          if (msg.error) {
            pending.reject(new Error(`JSON-RPC error ${msg.error.code}: ${msg.error.message}`));
          } else {
            pending.resolve(msg.result);
          }
        }
        // Notifications from server are ignored for now
      } catch {
        // Ignore unparseable lines (debug output, etc.)
      }
    }
  }

  private rejectAll(error: Error): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }
}
