import React from 'react';
import { Box, Text } from 'ink';
import { Markdown } from './Markdown.js';
import { ToolOutput } from './ToolOutput.js';

export interface ChatEntry {
  type: 'user' | 'assistant' | 'tool_call' | 'tool_result' | 'error' | 'system' | 'btw';
  content: string;
  toolName?: string;
  toolSuccess?: boolean;
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
            <Text color="yellow" dimColor>⚡ calling {entry.toolName}...</Text>
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
