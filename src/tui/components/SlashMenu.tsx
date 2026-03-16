import React from 'react';
import { Box, Text } from 'ink';
import type { SlashCommand } from '../commands/types.js';

interface Props {
  commands: SlashCommand[];
  selectedIndex: number;
}

export function SlashMenu({ commands, selectedIndex }: Props) {
  if (commands.length === 0) return null;

  const maxNameLen = Math.max(...commands.map(c => c.name.length));

  return (
    <Box flexDirection="column" borderStyle="single" borderTop borderBottom={false} borderLeft={false} borderRight={false}>
      {commands.map((cmd, i) => {
        const isSelected = i === selectedIndex;
        const padded = cmd.name.padEnd(maxNameLen + 2);
        return (
          <Box key={cmd.name}>
            <Text
              inverse={isSelected}
              color={isSelected ? undefined : 'cyan'}
              bold={isSelected}
            >
              {'  '}{padded}{cmd.description}{'  '}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
