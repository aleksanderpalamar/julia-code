import { readFile } from 'node:fs/promises';
import { getObservabilityLogPath } from '../event-sink.js';
import type { EventOf, ObservabilityEvent, ObservabilityEventType } from '../events.js';

function parseLine(line: string): ObservabilityEvent | null {
  try {
    return JSON.parse(line) as ObservabilityEvent;
  } catch {
    return null;
  }
}

function isEvent(event: ObservabilityEvent | null): event is ObservabilityEvent {
  return event !== null;
}

export async function loadEvents(path?: string): Promise<ObservabilityEvent[]> {
  let content: string;
  try {
    content = await readFile(path ?? getObservabilityLogPath(), 'utf-8');
  } catch {
    return [];
  }

  return content
    .split('\n')
    .filter(line => line.trim())
    .map(parseLine)
    .filter(isEvent);
}

export function selectEvents<T extends ObservabilityEventType>(
  events: readonly ObservabilityEvent[],
  type: T,
): Array<EventOf<T>> {
  return events.filter((event): event is EventOf<T> => event.type === type);
}

export function average(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((total, value) => total + value, 0) / values.length);
}

export function sumOf<T>(items: readonly T[], value: (item: T) => number): number {
  return items.reduce((total, item) => total + value(item), 0);
}

export function tally<T, K extends string>(
  items: readonly T[],
  seed: Record<K, number>,
  key: (item: T) => K,
): Record<K, number> {
  const counts = { ...seed };
  for (const item of items) counts[key(item)]++;
  return counts;
}

export function countOccurrences<T>(
  items: readonly T[],
  key: (item: T) => string,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const bucket = key(item);
    counts[bucket] = (counts[bucket] ?? 0) + 1;
  }
  return counts;
}

export function groupBy<T>(
  items: readonly T[],
  key: (item: T) => string,
): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const bucket = key(item);
    const existing = groups.get(bucket);
    if (existing) existing.push(item);
    else groups.set(bucket, [item]);
  }
  return groups;
}

export function mapValues<T, R>(
  groups: Map<string, T>,
  transform: (value: T) => R,
): Record<string, R> {
  const result: Record<string, R> = {};
  for (const [key, value] of groups) result[key] = transform(value);
  return result;
}
