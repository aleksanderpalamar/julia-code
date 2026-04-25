import React, { useState } from "react";
import { Box, Text, useInput } from "ink";

export type ProviderId = 'ollama' | 'huggingface';

interface ProviderOption {
  id: ProviderId;
  label: string;
  hint: string;
}

const PROVIDERS: ProviderOption[] = [
  { id: 'ollama', label: 'Ollama', hint: 'local + Ollama Cloud' },
  { id: 'huggingface', label: 'Hugging Face', hint: 'HF Inference Providers (cloud, HF_TOKEN)' },
];

interface Props {
  current: ProviderId;
  onSelect: (provider: ProviderId) => void;
  onCancel: () => void;
}

export function ProviderPicker({ current, onSelect, onCancel }: Props) {
  const currentIndex = PROVIDERS.findIndex(p => p.id === current);
  const [selected, setSelected] = useState(currentIndex >= 0 ? currentIndex : 0);

  useInput((_input, key) => {
    if (key.upArrow) {
      setSelected(prev => (prev <= 0 ? PROVIDERS.length - 1 : prev - 1));
    } else if (key.downArrow) {
      setSelected(prev => (prev >= PROVIDERS.length - 1 ? 0 : prev + 1));
    } else if (key.return) {
      onSelect(PROVIDERS[selected].id);
    } else if (key.escape) {
      onCancel();
    }
  });

  const maxLen = Math.max(...PROVIDERS.map(p => p.label.length));

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
      <Text color="cyan" bold>Select provider</Text>
      <Text color="gray">Switch the LLM provider used by Julia.</Text>
      <Text> </Text>
      {PROVIDERS.map((provider, i) => {
        const isSelected = i === selected;
        const isCurrent = provider.id === current;
        const indicator = isSelected ? "❯" : " ";
        const check = isCurrent ? " ✓" : "";
        const padded = provider.label.padEnd(maxLen + 2);
        return (
          <Box key={provider.id}>
            <Text color={isSelected ? "cyan" : "gray"}>{` ${indicator} `}</Text>
            <Text color={isCurrent ? "green" : isSelected ? "white" : "gray"} bold={isSelected}>
              {`${i + 1}. ${padded}`}
            </Text>
            <Text color="gray">{`  ${provider.hint}`}</Text>
            <Text color="green">{check}</Text>
          </Box>
        );
      })}
      <Text> </Text>
      <Text color="gray" dimColor>↑↓ navigate · Enter select · Esc cancel</Text>
    </Box>
  );
}
