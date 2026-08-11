import type { AllMetrics } from './types.js';

const HEADER = 'Julia observability stats';
const DIVIDER = '-'.repeat(40);
const INDENT = '  ';
const LABEL_WIDTH = 18;
const TOOL_NAME_WIDTH = 16;
const TOP_TOOLS_LIMIT = 5;
const TOP_MODELS_LIMIT = 3;

interface Section {
  title: string;
  lines: string[];
}

type SectionBuilder = (metrics: AllMetrics) => Section | null;

function row(label: string, value: string | number): string {
  return `${INDENT}${label.padEnd(LABEL_WIDTH)}${value}`;
}

function percentage(value: number | null): string {
  return value === null ? 'n/a' : `${Math.round(value * 100)}%`;
}

function duration(value: number | null): string {
  if (value === null) return 'n/a';
  return value < 1000 ? `${value}ms` : `${(value / 1000).toFixed(1)}s`;
}

function byCallCount<T extends { calls: number }>(
  entries: Record<string, T>,
  limit: number,
): Array<[string, T]> {
  return Object.entries(entries)
    .sort(([, a], [, b]) => b.calls - a.calls)
    .slice(0, limit);
}

const plannerSection: SectionBuilder = ({ planner }) => ({
  title: 'Planner',
  lines: [
    row('decisions', planner.total),
    row('via heuristic', planner.byVia.heuristic),
    row('via llm', planner.byVia.llm),
    row('via cache', planner.byVia.cache),
    row('cache hit-rate', percentage(planner.cacheHitRate)),
  ],
});

const orchestrationSection: SectionBuilder = ({ orchestration }) => ({
  title: 'Orchestration',
  lines: [
    row('runs', orchestration.totalRuns),
    row('completed/failed', `${orchestration.completedRuns}/${orchestration.failedRuns}`),
    row('success-rate', percentage(orchestration.successRate)),
    row('avg duration', duration(orchestration.avgDurationMs)),
    row('avg subtasks', orchestration.avgSubtaskCount ?? 'n/a'),
  ],
});

const subagentSection: SectionBuilder = ({ subagents }) => ({
  title: 'Subagents',
  lines: [
    row('tasks', subagents.totalTasks),
    row('completed/failed', `${subagents.completedTasks}/${subagents.failedTasks}`),
    row('failure-rate', percentage(subagents.failureRate)),
    row('avg duration', duration(subagents.avgDurationMs)),
  ],
});

const loopSection: SectionBuilder = ({ loops }) => ({
  title: 'Loops',
  lines: [
    row('total', loops.totalLoops),
    row('avg iterations', loops.avgIterations ?? 'n/a'),
    row('max iterations', loops.maxIterations ?? 'n/a'),
    row('reasons', `done=${loops.reasons.done} max=${loops.reasons.max_iterations} err=${loops.reasons.error} abort=${loops.reasons.aborted}`),
    row('retries', `stream=${loops.retriesByKind.stream} empty=${loops.retriesByKind.empty} det=${loops.retriesByKind.deterministic} correction=${loops.retriesByKind['tool-correction']} intent=${loops.retriesByKind['intent-nudge']}`),
  ],
});

const llmSection: SectionBuilder = ({ llm }) => {
  if (llm.totalCalls === 0) return null;

  const models = byCallCount(llm.perModel, TOP_MODELS_LIMIT).map(([model, usage]) =>
    `${INDENT}${model.padEnd(TOOL_NAME_WIDTH)} calls=${usage.calls} avg=${duration(usage.avgDurationMs)} tokens=${usage.tokens}`);

  return {
    title: 'LLM calls',
    lines: [
      row('total', llm.totalCalls),
      row('by pass', `main=${llm.byPass.main} synth=${llm.byPass.synthesis} correction=${llm.byPass.correction}`),
      row('avg duration', duration(llm.avgDurationMs)),
      row('tokens in/out', `${llm.promptTokens}/${llm.completionTokens}`),
      ...models,
    ],
  };
};

const gateSection: SectionBuilder = ({ gate }) => {
  if (gate.total === 0) return null;

  return {
    title: 'Security gate',
    lines: [
      row('decisions', gate.total),
      row('outcomes', `allowed=${gate.byOutcome.allowed} denied=${gate.byOutcome.denied} blocked=${gate.byOutcome.blocked} limited=${gate.byOutcome.rate_limited}`),
      row('via', `blocklist=${gate.byVia.blocklist} quota=${gate.byVia.quota} risk=${gate.byVia.risk} rule=${gate.byVia['allow-rule']} user=${gate.byVia.user} hook=${gate.byVia.hook}`),
    ],
  };
};

const compactionSection: SectionBuilder = ({ compaction }) => {
  if (compaction.total === 0) return null;

  return {
    title: 'Compaction',
    lines: [
      row('runs', `${compaction.total} (auto=${compaction.byKind.auto} emergency=${compaction.byKind.emergency})`),
      row('messages', compaction.messagesCompacted),
      row('tokens saved', compaction.tokensSaved),
      row('avg duration', duration(compaction.avgDurationMs)),
    ],
  };
};

const memorySection: SectionBuilder = ({ memory }) => {
  if (memory.total === 0) return null;

  return {
    title: 'Memory retrieval',
    lines: [
      row('retrievals', memory.total),
      row(
        'provider avail.',
        `${memory.providerAvailable}/${memory.total} (${percentage(memory.availabilityRate)})`,
      ),
      row('candidates/return', `${memory.candidates}/${memory.returned}`),
      row('avg top score', memory.avgTopScore === null ? 'n/a' : memory.avgTopScore.toFixed(3)),
      row('avg duration', duration(memory.avgDurationMs)),
    ],
  };
};

const diagnosticsSection: SectionBuilder = ({ diagnostics }) => {
  if (diagnostics.total === 0) return null;

  return {
    title: 'Diagnostics',
    lines: [
      row('runs', diagnostics.total),
      row('clean/problems', `${diagnostics.clean}/${diagnostics.problems}`),
      row('avg duration', duration(diagnostics.avgDurationMs)),
    ],
  };
};

const topToolsSection: SectionBuilder = ({ tools }) => {
  const top = byCallCount(tools.perTool, TOP_TOOLS_LIMIT);
  if (top.length === 0) return null;

  return {
    title: 'Top tools',
    lines: top.map(([name, usage]) =>
      `${INDENT}${name.padEnd(TOOL_NAME_WIDTH)} calls=${usage.calls} failures=${usage.failures} avg=${duration(usage.avgDurationMs)}`),
  };
};

const SECTIONS: readonly SectionBuilder[] = [
  plannerSection,
  orchestrationSection,
  subagentSection,
  loopSection,
  llmSection,
  gateSection,
  compactionSection,
  memorySection,
  diagnosticsSection,
  topToolsSection,
];

function isSection(section: Section | null): section is Section {
  return section !== null;
}

function render(section: Section): string[] {
  return ['', section.title, ...section.lines];
}

export function formatMetricsForDisplay(metrics: AllMetrics): string {
  return [
    HEADER,
    DIVIDER,
    ...SECTIONS.map(build => build(metrics)).filter(isSection).flatMap(render),
  ].join('\n');
}
