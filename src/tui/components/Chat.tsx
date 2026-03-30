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

export function Chat({ entries, streamingText }: Props) {
  return (
    <Box flexDirection="column" flexGrow={1}>
      {entries.map((entry, i) => (
        <Box key={i} flexDirection="column" marginBottom={entry.type === 'tool_result' ? 0 : 1}>
          {entry.type === 'user' && (
            <>
              <Text color="blue" bold>{'> '}{entry.content}</Text>
            </>
          )}
          {entry.type === 'btw' && (
            <Text color="blue" bold>{'> '}<Text color="cyan">[btw] </Text>{entry.content}</Text>
          )}
          {entry.type === 'assistant' && (
            <Markdown content={entry.content} />
          )}
          {entry.type === 'tool_call' && (
            <Text color="yellow" dimColor>⚡ {formatToolCall(entry.toolName!, entry.toolArgs)}</Text>
          )}
          {entry.type === 'tool_result' && (
            <ToolOutput
              name={entry.toolName ?? 'unknown'}
              output={entry.content}
              success={entry.toolSuccess ?? true}
            />
          )}
          {entry.type === 'error' && (
            <Text color="red">Error: {entry.content}</Text>
          )}
          {entry.type === 'subagent_stream' && (
            <Box flexDirection="column">
              <Text color="cyan" dimColor bold>[{entry.subagentLabel ?? 'subagent'}]</Text>
              <Text dimColor>{entry.content}</Text>
            </Box>
          )}
          {entry.type === 'system' && (
            <Text color="gray">{entry.content}</Text>
          )}
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
