import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

const LOG_PATH = join(homedir(), '.juliacode', 'logs', 'mcp.log');

let ensured = false;

function ensureDir() {
  if (ensured) return;
  try {
    mkdirSync(dirname(LOG_PATH), { recursive: true });
    ensured = true;
  } catch {
  }
}

export function logMcp(line: string): void {
  ensureDir();
  try {
    appendFileSync(LOG_PATH, `${new Date().toISOString()} ${line}\n`, 'utf-8');
  } catch {
  }
}

export function getMcpLogPath(): string {
  return LOG_PATH;
}
