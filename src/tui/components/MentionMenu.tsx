import React from 'react';
import { Box, Text } from 'ink';

interface Props {
  matches: string[];
  selectedIndex: number;
}

export function MentionMenu({ matches, selectedIndex }: Props) {
  if (matches.length === 0) return null;
  const maxPathLen = Math.max(...matches.map(m => m.length));

  return (
    <Box flexDirection="column" borderStyle="single" borderTop borderBottom={false} borderLeft={false} borderRight={false}>
      {matches.map((path, i) => {
        const isSelected = i === selectedIndex;
        const padded = path.padEnd(maxPathLen + 2);
        return (
          <Box key={path}>
            <Text
              inverse={isSelected}
              color={isSelected ? undefined : 'cyan'}
              bold={isSelected}
            >
              {'  @'}{padded}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
