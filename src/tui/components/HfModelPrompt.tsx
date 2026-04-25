import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';

interface Props {
  current: string;
  onSubmit: (modelId: string) => void;
  onCancel: () => void;
}

const SUGGESTIONS: Array<{ id: string; hint: string }> = [
  { id: 'meta-llama/Llama-3.3-70B-Instruct',          hint: 'native tools, balanced default' },
  { id: 'Qwen/Qwen2.5-72B-Instruct',                  hint: 'native tools, strong coding' },
  { id: 'mistralai/Mistral-Large-Instruct-2411',      hint: 'native tools, multilingual' },
  { id: 'deepseek-ai/DeepSeek-V3',                    hint: 'native tools, reasoning' },
  { id: 'moonshotai/Kimi-K2-Instruct',                hint: 'native tools, large context' },
];

type Mode = 'list' | 'custom';

export function HfModelPrompt({ current, onSubmit, onCancel }: Props) {
  const currentIndex = SUGGESTIONS.findIndex(s => s.id === current);
  const [mode, setMode] = useState<Mode>('list');
  const [selected, setSelected] = useState(currentIndex >= 0 ? currentIndex : 0);
  const [customValue, setCustomValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  useInput((input, key) => {
    if (mode === 'custom') {
      if (key.escape) onCancel();
      return;
    }
    if (key.upArrow) {
      setSelected(prev => (prev <= 0 ? SUGGESTIONS.length - 1 : prev - 1));
    } else if (key.downArrow) {
      setSelected(prev => (prev >= SUGGESTIONS.length - 1 ? 0 : prev + 1));
    } else if (key.return) {
      onSubmit(SUGGESTIONS[selected].id);
    } else if (key.escape) {
      onCancel();
    } else if (key.tab) {
      setMode('custom');
    } else if (input && /^[A-Za-z0-9\/\-_.:]$/.test(input)) {
      setCustomValue(input);
      setMode('custom');
    }
  });

  const handleCustomSubmit = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) {
      setError('Type a HF Hub repo ID, e.g. meta-llama/Llama-3.3-70B-Instruct');
      return;
    }
    if (!/^[A-Za-z0-9._-]+\/[A-Za-z0-9._:-]+$/.test(trimmed)) {
      setError('Invalid repo ID. Format: <org>/<model>[:<provider>].');
      return;
    }
    setError(null);
    onSubmit(trimmed);
  };

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
      <Text color="cyan" bold>Choose a Hugging Face model</Text>
      <Text color="gray">Pick a curated suggestion or type any HF Hub repo ID.</Text>
      <Text> </Text>
      {SUGGESTIONS.map((s, i) => {
        const isSelected = mode === 'list' && i === selected;
        const isCurrent = s.id === current;
        const indicator = isSelected ? '❯' : ' ';
        const check = isCurrent ? ' ✓' : '';
        return (
          <Box key={s.id}>
            <Text color={isSelected ? 'cyan' : 'gray'}>{` ${indicator} `}</Text>
            <Text color={isCurrent ? 'green' : isSelected ? 'white' : 'gray'} bold={isSelected}>
              {`${i + 1}. ${s.id}`}
            </Text>
            <Text color="gray">{`  ${s.hint}`}</Text>
            <Text color="green">{check}</Text>
          </Box>
        );
      })}
      <Text> </Text>
      <Box>
        <Text color="cyan" bold>[custom] </Text>
        {mode === 'custom' ? (
          <TextInput
            value={customValue}
            onChange={(v) => {
              setCustomValue(v);
              if (error) setError(null);
            }}
            onSubmit={handleCustomSubmit}
            placeholder="org/model[:provider]"
          />
        ) : (
          <Text color="gray" dimColor>(Tab or start typing to enter a repo ID manually)</Text>
        )}
      </Box>
      {error && (
        <Box marginTop={1}>
          <Text color="red">{error}</Text>
        </Box>
      )}
      <Text> </Text>
      {mode === 'list' ? (
        <Text color="gray" dimColor>↑↓ navigate · Enter select · Tab custom · Esc cancel</Text>
      ) : (
        <Text color="gray" dimColor>Enter submit · Esc cancel</Text>
      )}
    </Box>
  );
}
