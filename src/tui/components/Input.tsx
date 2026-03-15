import React, { useState } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import Spinner from "ink-spinner";

interface Props {
  onSubmit: (value: string) => void;
  disabled: boolean;
  model: string;
  isThinking: boolean;
  tokens?: number;
}

export function Input({
  onSubmit,
  disabled,
  model,
  isThinking,
  tokens,
}: Props) {
  const [value, setValue] = useState("");

  const handleSubmit = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setValue("");
    onSubmit(trimmed);
  };

  return (
    <Box>
      <Text color="yellow">{model}</Text>
      <Text color="gray"> | </Text>
      <Text color="gray">
        {tokens ? `${tokens.toLocaleString()}tk` : "0tk"}{" "}
      </Text>
      <Text color="gray"> | </Text>
      {isThinking && (
        <>
          <Text color="gray"> | </Text>
          <Text color="magenta">
            <Spinner type="dots" /> thinking...
          </Text>
        </>
      )}
      <Text color="green" bold>
        {"❯ "}
      </Text>
      {disabled ? (
        <Text dimColor>waiting...</Text>
      ) : (
        <TextInput
          value={value}
          onChange={setValue}
          onSubmit={handleSubmit}
          placeholder="Ask Julia anything..."
        />
      )}
    </Box>
  );
}
