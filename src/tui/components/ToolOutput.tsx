import React from 'react';
import { Box, Text } from 'ink';

interface Props {
  name: string;
  output: string;
  success: boolean;
}

export function ToolOutput({ name, output, success }: Props) {
  const maxLines = 20;
  const lines = output.split('\n');
  const truncated = lines.length > maxLines;
  const display = truncated ? lines.slice(0, maxLines).join('\n') + '\n...' : output;

  return (
    <Box flexDirection="column" marginY={0}>
      <Text color={success ? 'green' : 'red'}>
        {success ? '✓' : '✗'} tool:{name}
      </Text>
      {display && (
        <Box marginLeft={2}>
          <Text dimColor>{display}</Text>
        </Box>
      )}
    </Box>
  );
}
