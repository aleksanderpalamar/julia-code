import React, { useCallback, useState } from "react";
import { Box, useApp, useInput } from "ink";
import { Chat } from "./components/Chat.js";
import { Input } from "./components/Input.js";
import { StatusBar } from "./components/StatusBar.js";
import { TrustPrompt } from "./components/TrustPrompt.js";
import { useSession } from "./hooks/useSession.js";
import { useAgent } from "./hooks/useAgent.js";
import { getConfig } from "../config/index.js";
import { getProjectDir } from "../config/workspace.js";
import {
  isDirectoryTrusted,
  trustDirectory,
  untrustDirectory,
  untrustAll,
  getTrustedDirectories,
} from "../config/trust.js";
import {
  getMcpServerConfigs,
  addMcpServerConfig,
  removeMcpServerConfig,
} from "../config/mcp.js";
import {
  getMcpServerStatuses,
  addMcpServer,
  removeMcpServer,
} from "../mcp/manager.js";

interface Props {
  sessionId?: string;
}

export function App({ sessionId }: Props) {
  const { exit } = useApp();
  const projectDir = getProjectDir();
  const [trusted, setTrusted] = useState(() => isDirectoryTrusted(projectDir));
  const { session, refreshSession } = useSession(sessionId);
  const { entries, streamingText, isThinking, sessionTokens, sendMessage, addSystemEntry } =
    useAgent(refreshSession);
  const model = getConfig().defaultModel;

  const handleTrust = useCallback(() => {
    trustDirectory(projectDir);
    setTrusted(true);
  }, [projectDir]);

  const handleTrustExit = useCallback(() => {
    exit();
  }, [exit]);

  const handleSubmit = useCallback(
    (text: string) => {
      if (text === "/quit" || text === "/exit") {
        exit();
        return;
      }

      if (text === "/clear") {
        return;
      }

      // /trust commands
      if (text === "/trust" || text === "/trust list") {
        const dirs = getTrustedDirectories();
        if (dirs.length === 0) {
          addSystemEntry("No trusted directories.");
        } else {
          addSystemEntry(
            "Trusted directories:\n" + dirs.map(d => `  - ${d}`).join("\n")
          );
        }
        return;
      }

      if (text.startsWith("/trust revoke-all")) {
        untrustAll();
        addSystemEntry("All trusted directories have been revoked.");
        return;
      }

      if (text.startsWith("/trust revoke ")) {
        const path = text.slice("/trust revoke ".length).trim();
        if (!path) {
          addSystemEntry("Usage: /trust revoke <path>");
          return;
        }
        untrustDirectory(path);
        addSystemEntry(`Revoked trust for: ${path}`);
        if (path === projectDir) {
          setTrusted(false);
        }
        return;
      }

      // /mcp commands
      if (text === "/mcp" || text === "/mcp list") {
        const configs = getMcpServerConfigs();
        const statuses = getMcpServerStatuses();
        const configNames = Object.keys(configs);

        if (configNames.length === 0) {
          addSystemEntry("No MCP servers configured.");
          return;
        }

        const lines = configNames.map(name => {
          const status = statuses.find(s => s.name === name);
          const state = status?.connected ? `connected, ${status.toolCount} tools` : "disconnected";
          return `  - ${name}: ${state}`;
        });
        addSystemEntry("MCP Servers:\n" + lines.join("\n"));
        return;
      }

      if (text.startsWith("/mcp add ")) {
        const parts = text.slice("/mcp add ".length).trim().split(/\s+/);
        if (parts.length < 2) {
          addSystemEntry("Usage: /mcp add <name> <command> [args...]");
          return;
        }
        const [name, command, ...args] = parts;
        const config = { command, args };
        addMcpServerConfig(name, config);
        addSystemEntry(`Adding MCP server '${name}'...`);
        addMcpServer(name, config).then(result => {
          if (result.success) {
            addSystemEntry(`MCP server '${name}' connected: ${result.toolCount} tools registered.`);
          } else {
            addSystemEntry(`MCP server '${name}' failed to connect: ${result.error}`);
          }
        });
        return;
      }

      if (text.startsWith("/mcp remove ")) {
        const name = text.slice("/mcp remove ".length).trim();
        if (!name) {
          addSystemEntry("Usage: /mcp remove <name>");
          return;
        }
        removeMcpServer(name);
        removeMcpServerConfig(name);
        addSystemEntry(`MCP server '${name}' removed.`);
        return;
      }

      sendMessage(session.id, text, model);
    },
    [session.id, model, sendMessage, exit, projectDir, addSystemEntry],
  );

  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      exit();
    }
  });

  if (!trusted) {
    return (
      <TrustPrompt
        directory={projectDir}
        onTrust={handleTrust}
        onExit={handleTrustExit}
      />
    );
  }

  return (
    <Box flexDirection="column" height="100%">
      <StatusBar
        model={model}
        sessionId={session.id}
        isThinking={isThinking}
        tokens={session.total_tokens}
      />
      <Box flexDirection="column" flexGrow={1} paddingX={1}>
        <Chat entries={entries} streamingText={streamingText} />
      </Box>
      <Box paddingX={1} paddingY={0}>
        <Input
          onSubmit={handleSubmit}
          disabled={isThinking}
          model={model}
          isThinking={isThinking}
          tokens={sessionTokens.promptTokens + sessionTokens.completionTokens}
        />
      </Box>
    </Box>
  );
}
