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
  const cwd = process.cwd();

  return (
    <Box flexDirection="column" paddingX={1}>
      {/* Version line */}
      <Box>
        <Text color="gray">{"── "}</Text>
        <Text color="white" bold>Julia Code</Text>
        <Text color="gray"> v0.1.0</Text>
      </Box>

      <Box borderStyle="round" borderColor="gray" paddingX={1} paddingY={1}>
        {/* Left panel: Logo + info */}
        <Box flexDirection="column" width="50%">
          <Box>
            <Text color="cyan" bold>{"  ╦╦ ╦╦  ╦╔═╗"}</Text>
          </Box>
          <Box>
            <Text color="cyan" bold>{"  ║║ ║║  ║╠═╣"}</Text>
            <Text>  </Text>
            <Text color="white" bold>Welcome back!</Text>
          </Box>
          <Box>
            <Text color="cyan" bold>{" ╚╝╚═╝╩═╝╩╩ ╩"}</Text>
          </Box>

          <Box marginTop={1}>
            <Text>    </Text>
            <Text color="yellow">{model}</Text>
            <Text color="gray"> · </Text>
            <Text color="gray">session: {shortId}</Text>
            <Text color="gray"> · </Text>
            <Text color="gray">{tokens.toLocaleString()} tokens</Text>
            {isThinking && (
              <>
                <Text color="gray"> · </Text>
                <Text color="magenta">
                  <Spinner type="dots" /> thinking...
                </Text>
              </>
            )}
          </Box>

          <Box>
            <Text>    </Text>
            <Text color="magenta">{cwd}</Text>
          </Box>
        </Box>

        {/* Right panel: Tips + Recent activity */}
        <Box flexDirection="column" width="50%" paddingLeft={2}>
          <Box>
            <Text color="yellow" bold>Tips for getting started</Text>
          </Box>
          <Box marginTop={1} flexDirection="column">
            <Text color="gray">Run </Text>
            <Box>
              <Text color="gray">  </Text>
              <Text color="white">/help</Text>
              <Text color="gray"> to see available commands.</Text>
            </Box>
            <Box>
              <Text color="gray">  </Text>
              <Text color="white">/mcp</Text>
              <Text color="gray"> to manage MCP servers.</Text>
            </Box>
            <Box>
              <Text color="gray">  Julia uses local models via </Text>
              <Text color="cyan">Ollama</Text>
              <Text color="gray">.</Text>
            </Box>
          </Box>

          <Box marginTop={1}>
            <Text color="yellow" bold>Recent activity</Text>
          </Box>
          <Box>
            <Text color="gray">  No recent activity</Text>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
