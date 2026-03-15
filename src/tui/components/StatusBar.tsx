import React from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";

interface Props {
  model: string;
  sessionId: string;
  isThinking: boolean;
  tokens: number;
}

export function StatusBar({ model, sessionId, isThinking, tokens }: Props) {
  const shortId = sessionId.slice(0, 8);

  return (
    <Box
      borderStyle="single"
      borderColor="gray"
      paddingX={1}
      flexDirection="column"
    >
      <Box>
        <Text color="cyan" bold>
          {"  ╦╦ ╦╦  ╦╔═╗"}
        </Text>
      </Box>
      <Box>
        <Text color="cyan" bold>
          {"  ║║ ║║  ║╠═╣"}
        </Text>
        <Text color="gray"> </Text>
        <Text color="yellow">{model}</Text>
        <Text color="gray"> | </Text>
        <Text color="gray">session: {shortId}</Text>
        <Text color="gray"> | </Text>
        <Text color="gray">{tokens.toLocaleString()} tokens</Text>
        {isThinking && (
          <>
            <Text color="gray"> | </Text>
            <Text color="magenta">
              <Spinner type="dots" /> thinking...
            </Text>
          </>
        )}
      </Box>
      <Box>
        <Text color="cyan" bold>
          {" ╚╝╚═╝╩═╝╩╩ ╩"}
        </Text>
        <Text color="gray"> </Text>
        <Text color="magenta">{process.cwd()}</Text>
      </Box>
    </Box>
  );
}
