import React, { useState } from "react";
import { Box, Text, useInput } from "ink";

interface ModelOption {
  id: string;
  name?: string;
  current: boolean;
}

interface Props {
  models: ModelOption[];
  onSelect: (modelId: string) => void;
  onCancel: () => void;
}

export function ModelPicker({ models, onSelect, onCancel }: Props) {
  const currentIndex = models.findIndex(m => m.current);
  const [selected, setSelected] = useState(currentIndex >= 0 ? currentIndex : 0);

  useInput((input, key) => {
    if (key.upArrow) {
      setSelected(prev => (prev <= 0 ? models.length - 1 : prev - 1));
    } else if (key.downArrow) {
      setSelected(prev => (prev >= models.length - 1 ? 0 : prev + 1));
    } else if (key.return) {
      onSelect(models[selected].id);
    } else if (key.escape) {
      onCancel();
    }
  });

  if (models.length === 0) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text color="yellow" bold>No models available</Text>
        <Text color="gray">Make sure Ollama is running and has models installed.</Text>
        <Text color="gray">Run: ollama pull {"<model>"}</Text>
      </Box>
    );
  }

  const maxLen = Math.max(...models.map(m => m.id.length));

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
      <Text color="cyan" bold>Select model</Text>
      <Text color="gray">Switch between Ollama models. Applies to this session and future sessions.</Text>
      <Text> </Text>
      {models.map((model, i) => {
        const isSelected = i === selected;
        const indicator = isSelected ? "❯" : " ";
        const check = model.current ? " ✓" : "";
        const padded = model.id.padEnd(maxLen + 2);
        return (
          <Box key={model.id}>
            <Text color={isSelected ? "cyan" : "gray"}>{` ${indicator} `}</Text>
            <Text color={model.current ? "green" : isSelected ? "white" : "gray"} bold={isSelected}>
              {`${i + 1}. ${padded}`}
            </Text>
            <Text color="green">{check}</Text>
          </Box>
        );
      })}
      <Text> </Text>
      <Text color="gray" dimColor>↑↓ navigate · Enter select · Esc cancel</Text>
    </Box>
  );
}
