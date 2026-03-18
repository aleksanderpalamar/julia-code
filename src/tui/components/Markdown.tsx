import React from 'react';
import { Text } from 'ink';
import { Marked } from 'marked';
import { markedTerminal } from 'marked-terminal';
import { useTerminalSize } from '../hooks/useTerminalSize.js';

interface Props {
  content: string;
}

export function Markdown({ content }: Props) {
  if (!content.trim()) return null;

  const { columns } = useTerminalSize();

  let rendered: string;
  try {
    const width = Math.max(columns - 2, 40);
    const marked = new Marked(markedTerminal({ width, reflowText: true }) as any);
    rendered = (marked.parse(content) as string).trimEnd();
  } catch {
    rendered = content;
  }

  return <Text wrap="wrap">{rendered}</Text>;
}
