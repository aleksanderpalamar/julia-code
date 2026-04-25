import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';

interface Props {
  onSubmit: (token: string) => void;
  onCancel: () => void;
}

const TOKEN_URL = 'https://huggingface.co/settings/tokens';

export function HfTokenInput({ onSubmit, onCancel }: Props) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  useInput((_input, key) => {
    if (key.escape) onCancel();
  });

  const handleSubmit = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed.startsWith('hf_') || trimmed.length < 8) {
      setError('Invalid token format. Tokens start with "hf_" and are at least 8 chars.');
      return;
    }
    setError(null);
    onSubmit(trimmed);
  };

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
      <Text color="cyan" bold>Hugging Face access token</Text>
      <Text> </Text>
      <Text color="gray">  Get a token at: <Text color="white">{TOKEN_URL}</Text></Text>
      <Text color="gray">  Scope needed: <Text color="white">"Make calls to Inference Providers"</Text></Text>
      <Text color="gray">  The token is saved to <Text color="white">~/.juliacode/settings.json</Text> (plain JSON).</Text>
      <Text> </Text>
      <Box>
        <Text color="cyan" bold>[hf token] </Text>
        <TextInput
          value={value}
          onChange={(v) => {
            setValue(v);
            if (error) setError(null);
          }}
          onSubmit={handleSubmit}
          placeholder="hf_..."
        />
      </Box>
      {error && (
        <Box marginTop={1}>
          <Text color="red">{error}</Text>
        </Box>
      )}
      <Text> </Text>
      <Text color="gray" dimColor>Enter to save · Esc to cancel</Text>
    </Box>
  );
}
