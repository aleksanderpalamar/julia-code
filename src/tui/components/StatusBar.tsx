import React from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentMode, Temperament } from "../types.js";
import type { OrchestrationProgress } from "../../agent/loop.js";
import { modeLabel, modeColor, temperamentLabel, temperamentColor } from "../types.js";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import { getBreakpoint } from "../responsive.js";

function findPackageVersion(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 10; i++) {
    try {
      const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf-8"));
      if (pkg.version) return pkg.version;
    } catch { /* keep searching */ }
    dir = dirname(dir);
  }
  return "0.0.0";
}

const APP_VERSION = findPackageVersion();

interface Props {
  model: string;
  sessionId: string;
  isThinking: boolean;
  tokens: number;
  mode: AgentMode;
  temperament: Temperament;
  toolModel?: string | null;
  orchestrationProgress?: OrchestrationProgress | null;
}

export function StatusBar({ model, sessionId, isThinking, tokens, mode, temperament, toolModel, orchestrationProgress }: Props) {
  const shortId = sessionId.slice(0, 8);
  const cwd = process.cwd();
  const { columns } = useTerminalSize();
  const bp = getBreakpoint(columns);

  const isWide = bp === 'wide';
  const isNarrow = bp === 'narrow';

  return (
    <Box flexDirection="column" paddingX={1}>
      {/* Version line */}
      <Box>
        <Text color="gray">{"── "}</Text>
        <Text color="white" bold>Julia Code</Text>
        <Text color="gray"> v{APP_VERSION}</Text>
      </Box>

      <Box
        borderStyle="round"
        borderColor="gray"
        paddingX={1}
        paddingY={1}
        flexDirection={isWide ? 'row' : 'column'}
      >
        {/* Left panel: Logo + info */}
        <Box flexDirection="column" width={isWide ? "50%" : undefined}>
          {isNarrow ? (
            <Box>
              <Text color="cyan" bold>JULIA</Text>
              <Text>  </Text>
              <Text color="white" bold>Welcome back!</Text>
            </Box>
          ) : (
            <>
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
            </>
          )}

          <Box marginTop={1}>
            <Text>    </Text>
            <Text color="yellow">{model}</Text>
            {toolModel && toolModel !== model && (
              <>
                <Text color="gray"> → </Text>
                <Text color="green">{toolModel}</Text>
                <Text color="gray"> (tools)</Text>
              </>
            )}
            <Text color="gray"> · </Text>
            <Text color="gray">session: {shortId}</Text>
            <Text color="gray"> · </Text>
            <Text color="gray">{tokens.toLocaleString()} tokens</Text>
            {mode !== 'normal' && (
              <>
                <Text color="gray"> · </Text>
                <Text color={modeColor(mode)} bold>{modeLabel(mode)}</Text>
              </>
            )}
            {temperament !== 'neutral' && (
              <>
                <Text color="gray"> · </Text>
                <Text color={temperamentColor(temperament)} bold>{temperamentLabel(temperament)}</Text>
              </>
            )}
            {orchestrationProgress && (
              <>
                <Text color="gray"> · </Text>
                <Text color="cyan">
                  <Spinner type="dots" /> ACP [{orchestrationProgress.completed}/{orchestrationProgress.total} done
                  {orchestrationProgress.running > 0 ? `, ${orchestrationProgress.running} running` : ''}
                  {orchestrationProgress.queued > 0 ? `, ${orchestrationProgress.queued} queued` : ''}
                  {orchestrationProgress.failed > 0 ? `, ${orchestrationProgress.failed} failed` : ''}]
                </Text>
              </>
            )}
            {isThinking && !orchestrationProgress && (
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
        <Box
          flexDirection="column"
          width={isWide ? "50%" : undefined}
          paddingLeft={isWide ? 2 : 0}
          marginTop={isWide ? 0 : 1}
        >
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
