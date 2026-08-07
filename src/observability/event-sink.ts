import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { ObservabilityEvent } from './events.js';

const LOG_FILENAME = 'events.jsonl';
const DIR_MODE = 0o700;
const FILE_MODE = 0o600;

function resolveLogDir(): string {
  return process.env.JULIA_LOG_DIR ?? join(homedir(), '.juliacode', 'logs');
}

export function getObservabilityLogPath(): string {
  return join(resolveLogDir(), LOG_FILENAME);
}

let directoryReady: Promise<void> | null = null;
let pendingWrites: Promise<void> = Promise.resolve();

function ensureDirectory(): Promise<void> {
  directoryReady ??= mkdir(resolveLogDir(), { recursive: true, mode: DIR_MODE })
    .then(() => undefined);
  return directoryReady;
}

function isDebugEnabled(): boolean {
  return process.env.JULIA_DEBUG === '1';
}

async function append(event: ObservabilityEvent): Promise<void> {
  const line = `${JSON.stringify(event)}\n`;
  await ensureDirectory();
  await appendFile(getObservabilityLogPath(), line, { mode: FILE_MODE });
  if (isDebugEnabled()) {
    process.stderr.write(`[obs] ${line}`);
  }
}

export function writeEvent(event: ObservabilityEvent): void {
  pendingWrites = pendingWrites
    .then(() => append(event))
    .catch(() => undefined);
}

export function flushObservability(): Promise<void> {
  return pendingWrites;
}

export function resetLoggerStateForTests(): void {
  directoryReady = null;
  pendingWrites = Promise.resolve();
}
