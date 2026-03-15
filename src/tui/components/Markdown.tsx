import React from 'react';
import { Text } from 'ink';
import { Marked } from 'marked';
import { markedTerminal } from 'marked-terminal';

function getTerminalWidth(): number {
  return process.stdout.columns || 80;
}

interface Props {
  content: string;
}

export function Markdown({ content }: Props) {
  if (!content.trim()) return null;

  let rendered: string;
  try {
    const width = getTerminalWidth();
    const marked = new Marked(markedTerminal({ width, reflowText: true }) as any);
    rendered = (marked.parse(content) as string).trimEnd();
  } catch {
    rendered = content;
  }

  return <Text wrap="wrap">{rendered}</Text>;
}
