import { readFile } from 'node:fs/promises';
import { getDb } from '../session/db.js';
import { getObservabilityLogPath, type ObservabilityEvent } from './logger.js';

export interface OrchestrationMetrics {
  totalRuns: number;
  completedRuns: number;
  failedRuns: number;
  successRate: number;
  avgDurationMs: number | null;
  avgSubtaskCount: number | null;
}

export interface SubagentMetrics {
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  failureRate: number;
  avgDurationMs: number | null;
  perModel: Record<string, {
    count: number;
    completed: number;
    failed: number;
    avgDurationMs: number | null;
  }>;
}

export interface LoopMetrics {
  totalLoops: number;
  avgIterations: number | null;
  maxIterations: number | null;
  reasons: Record<'done' | 'max_iterations' | 'error' | 'aborted', number>;
  retriesByKind: Record<'stream' | 'empty' | 'deterministic', number>;
  iterationHistogram: Record<string, number>;
}

export interface ToolMetrics {
  totalCalls: number;
  perTool: Record<string, {
    calls: number;
    failures: number;
    avgDurationMs: number | null;
  }>;
}

export interface PlannerMetrics {
  total: number;
  byVia: Record<'heuristic' | 'llm' | 'cache', number>;
  cacheHitRate: number | null;
}

export interface AllMetrics {
  orchestration: OrchestrationMetrics;
  subagents: SubagentMetrics;
  loops: LoopMetrics;
  tools: ToolMetrics;
  planner: PlannerMetrics;
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  const sum = values.reduce((a, b) => a + b, 0);
  return Math.round(sum / values.length);
}

export function computeOrchestrationMetrics(): OrchestrationMetrics {
  const db = getDb();
  const rows = db.prepare(
    'SELECT status, duration_ms, subtask_count FROM orchestration_runs'
  ).all() as Array<{ status: string; duration_ms: number | null; subtask_count: number }>;

  const completed = rows.filter(r => r.status === 'completed');
  const failed = rows.filter(r => r.status === 'failed');
  const durations = rows.map(r => r.duration_ms).filter((d): d is number => d !== null);
  const subtaskCounts = rows.map(r => r.subtask_count);

  return {
    totalRuns: rows.length,
    completedRuns: completed.length,
    failedRuns: failed.length,
    successRate: rows.length === 0 ? 0 : completed.length / rows.length,
    avgDurationMs: avg(durations),
    avgSubtaskCount: avg(subtaskCounts),
  };
}

export function computeSubagentMetrics(): SubagentMetrics {
  const db = getDb();
  const rows = db.prepare(
    'SELECT model, status, duration_ms FROM subagent_runs'
  ).all() as Array<{ model: string | null; status: string; duration_ms: number | null }>;

  const completed = rows.filter(r => r.status === 'completed');
  const failed = rows.filter(r => r.status === 'failed');
  const durations = rows.map(r => r.duration_ms).filter((d): d is number => d !== null);

  const perModel: SubagentMetrics['perModel'] = {};
  for (const r of rows) {
    const key = r.model ?? 'default';
    if (!perModel[key]) {
      perModel[key] = { count: 0, completed: 0, failed: 0, avgDurationMs: null };
    }
    perModel[key].count++;
    if (r.status === 'completed') perModel[key].completed++;
    if (r.status === 'failed') perModel[key].failed++;
  }

  for (const key of Object.keys(perModel)) {
    const modelDurations = rows
      .filter(r => (r.model ?? 'default') === key)
      .map(r => r.duration_ms)
      .filter((d): d is number => d !== null);
    perModel[key].avgDurationMs = avg(modelDurations);
  }

  return {
    totalTasks: rows.length,
    completedTasks: completed.length,
    failedTasks: failed.length,
    failureRate: rows.length === 0 ? 0 : failed.length / rows.length,
    avgDurationMs: avg(durations),
    perModel,
  };
}

async function readEvents(path?: string): Promise<ObservabilityEvent[]> {
  const file = path ?? getObservabilityLogPath();
  let content: string;
  try {
    content = await readFile(file, 'utf-8');
  } catch {
    return [];
  }

  const events: ObservabilityEvent[] = [];
  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line) as ObservabilityEvent);
    } catch {
      // Ignore malformed lines.
    }
  }
  return events;
}

export async function computeLoopMetrics(path?: string): Promise<LoopMetrics> {
  const events = await readEvents(path);

  const loopEnds = events.filter(e => e.type === 'loop_end');
  const retries = events.filter(e => e.type === 'retry');

  const iterations = loopEnds.map(e => (e as Extract<ObservabilityEvent, { type: 'loop_end' }>).iterations);

  const reasons: LoopMetrics['reasons'] = { done: 0, max_iterations: 0, error: 0, aborted: 0 };
  for (const e of loopEnds) {
    const r = (e as Extract<ObservabilityEvent, { type: 'loop_end' }>).reason;
    reasons[r]++;
  }

  const retriesByKind: LoopMetrics['retriesByKind'] = { stream: 0, empty: 0, deterministic: 0 };
  for (const e of retries) {
    const k = (e as Extract<ObservabilityEvent, { type: 'retry' }>).kind;
    retriesByKind[k]++;
  }

  const iterationHistogram: Record<string, number> = {};
  for (const n of iterations) {
    const key = String(n);
    iterationHistogram[key] = (iterationHistogram[key] ?? 0) + 1;
  }

  return {
    totalLoops: loopEnds.length,
    avgIterations: avg(iterations),
    maxIterations: iterations.length === 0 ? null : Math.max(...iterations),
    reasons,
    retriesByKind,
    iterationHistogram,
  };
}

export async function computeToolMetrics(path?: string): Promise<ToolMetrics> {
  const events = await readEvents(path);
  const toolCalls = events.filter(e => e.type === 'tool_call') as Array<Extract<ObservabilityEvent, { type: 'tool_call' }>>;

  const perTool: ToolMetrics['perTool'] = {};
  for (const t of toolCalls) {
    if (!perTool[t.name]) {
      perTool[t.name] = { calls: 0, failures: 0, avgDurationMs: null };
    }
    perTool[t.name].calls++;
    if (!t.success) perTool[t.name].failures++;
  }

  for (const name of Object.keys(perTool)) {
    const durations = toolCalls.filter(t => t.name === name).map(t => t.durationMs);
    perTool[name].avgDurationMs = avg(durations);
  }

  return {
    totalCalls: toolCalls.length,
    perTool,
  };
}

export async function computePlannerMetrics(path?: string): Promise<PlannerMetrics> {
  const events = await readEvents(path);
  const decisions = events.filter(e => e.type === 'planner_decision') as Array<
    Extract<ObservabilityEvent, { type: 'planner_decision' }>
  >;

  const byVia: PlannerMetrics['byVia'] = { heuristic: 0, llm: 0, cache: 0 };
  for (const d of decisions) byVia[d.via]++;

  const llmOrCache = byVia.llm + byVia.cache;
  const cacheHitRate = llmOrCache === 0 ? null : byVia.cache / llmOrCache;

  return {
    total: decisions.length,
    byVia,
    cacheHitRate,
  };
}

export async function getAllMetrics(): Promise<AllMetrics> {
  const [loops, tools, planner] = await Promise.all([
    computeLoopMetrics(),
    computeToolMetrics(),
    computePlannerMetrics(),
  ]);
  return {
    orchestration: computeOrchestrationMetrics(),
    subagents: computeSubagentMetrics(),
    loops,
    tools,
    planner,
  };
}

function pct(n: number | null): string {
  if (n === null) return 'n/a';
  return `${Math.round(n * 100)}%`;
}

function ms(n: number | null): string {
  if (n === null) return 'n/a';
  if (n < 1000) return `${n}ms`;
  return `${(n / 1000).toFixed(1)}s`;
}

export function formatMetricsForDisplay(m: AllMetrics): string {
  const lines: string[] = [];

  lines.push('Julia observability stats');
  lines.push('-'.repeat(40));

  lines.push('');
  lines.push('Planner');
  lines.push(`  decisions         ${m.planner.total}`);
  lines.push(`  via heuristic     ${m.planner.byVia.heuristic}`);
  lines.push(`  via llm           ${m.planner.byVia.llm}`);
  lines.push(`  via cache         ${m.planner.byVia.cache}`);
  lines.push(`  cache hit-rate    ${pct(m.planner.cacheHitRate)}`);

  lines.push('');
  lines.push('Orchestration');
  lines.push(`  runs              ${m.orchestration.totalRuns}`);
  lines.push(`  completed/failed  ${m.orchestration.completedRuns}/${m.orchestration.failedRuns}`);
  lines.push(`  success-rate      ${pct(m.orchestration.successRate)}`);
  lines.push(`  avg duration      ${ms(m.orchestration.avgDurationMs)}`);
  lines.push(`  avg subtasks      ${m.orchestration.avgSubtaskCount ?? 'n/a'}`);

  lines.push('');
  lines.push('Subagents');
  lines.push(`  tasks             ${m.subagents.totalTasks}`);
  lines.push(`  completed/failed  ${m.subagents.completedTasks}/${m.subagents.failedTasks}`);
  lines.push(`  failure-rate      ${pct(m.subagents.failureRate)}`);
  lines.push(`  avg duration      ${ms(m.subagents.avgDurationMs)}`);

  lines.push('');
  lines.push('Loops');
  lines.push(`  total             ${m.loops.totalLoops}`);
  lines.push(`  avg iterations    ${m.loops.avgIterations ?? 'n/a'}`);
  lines.push(`  max iterations    ${m.loops.maxIterations ?? 'n/a'}`);
  lines.push(`  reasons           done=${m.loops.reasons.done} max=${m.loops.reasons.max_iterations} err=${m.loops.reasons.error} abort=${m.loops.reasons.aborted}`);
  lines.push(`  retries           stream=${m.loops.retriesByKind.stream} empty=${m.loops.retriesByKind.empty} det=${m.loops.retriesByKind.deterministic}`);

  const topTools = Object.entries(m.tools.perTool)
    .sort(([, a], [, b]) => b.calls - a.calls)
    .slice(0, 5);
  if (topTools.length > 0) {
    lines.push('');
    lines.push('Top tools');
    for (const [name, s] of topTools) {
      lines.push(`  ${name.padEnd(16)} calls=${s.calls} failures=${s.failures} avg=${ms(s.avgDurationMs)}`);
    }
  }

  return lines.join('\n');
}
