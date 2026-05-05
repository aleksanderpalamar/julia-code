import React from 'react';
import { Box, Text } from 'ink';
import { Markdown } from './Markdown.js';
import { ToolOutput } from './ToolOutput.js';

export interface ChatEntry {
  type: 'user' | 'assistant' | 'tool_call' | 'tool_result' | 'error' | 'system' | 'btw' | 'subagent_stream';
  content: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolSuccess?: boolean;
  subagentLabel?: string;
}

function formatToolCall(name: string, args?: Record<string, unknown>): string {
  if (!args) return name;

  const primaryArg = args.command ?? args.file_path ?? args.path ?? args.pattern ?? args.query ?? args.url;
  if (primaryArg && typeof primaryArg === 'string') {
    const short = primaryArg.length > 60 ? primaryArg.slice(0, 57) + '...' : primaryArg;
    return `${name}(${short})`;
  }

  return name;
}

interface Props {
  entries: ChatEntry[];
  streamingText: string;
}

const entryRenderers: Record<ChatEntry['type'], (e: ChatEntry) => React.ReactElement> = {
  user: (e) => <Text color="blue" bold>{'> '}{e.content}</Text>,
  btw: (e) => (
    <Text color="blue" bold>{'> '}<Text color="cyan">[btw] </Text>{e.content}</Text>
  ),
  assistant: (e) => <Markdown content={e.content} />,
  tool_call: (e) => (
    <Text color="yellow" dimColor>⚡ {formatToolCall(e.toolName!, e.toolArgs)}</Text>
  ),
  tool_result: (e) => (
    <ToolOutput
      name={e.toolName ?? 'unknown'}
      output={e.content}
      success={e.toolSuccess ?? true}
    />
  ),
  error: (e) => <Text color="red">Error: {e.content}</Text>,
  subagent_stream: (e) => (
    <Box flexDirection="column">
      <Text color="cyan" dimColor bold>[{e.subagentLabel ?? 'subagent'}]</Text>
      <Text dimColor>{e.content}</Text>
    </Box>
  ),
  system: (e) => <Text color="gray">{e.content}</Text>,
};

export function Chat({ entries, streamingText }: Props) {
  return (
    <Box flexDirection="column" flexGrow={1}>
      {entries.map((entry, i) => (
        <Box key={i} flexDirection="column" marginBottom={entry.type === 'tool_result' ? 0 : 1}>
          {entryRenderers[entry.type](entry)}
        </Box>
      ))}
      {streamingText && (
        <Box marginBottom={1}>
          <Markdown content={streamingText} />
        </Box>
      )}
    </Box>
  );
}
