import React, { useCallback, useState } from "react";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { Box, useApp, useInput } from "ink";
import { Chat } from "./components/Chat.js";
import { Input } from "./components/Input.js";
import { StatusBar } from "./components/StatusBar.js";
import { TrustPrompt } from "./components/TrustPrompt.js";
import { useSession } from "./hooks/useSession.js";
import { useAgent } from "./hooks/useAgent.js";
import { useClipboardPaste } from "./hooks/useClipboardPaste.js";
import { getConfig } from "../config/index.js";
import { getProjectDir } from "../config/workspace.js";
import { nextMode, modeLabel, nextTemperament, temperamentLabel } from "./types.js";
import type { AgentMode, Temperament } from "./types.js";
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
  const [mode, setMode] = useState<AgentMode>('normal');
  const [temperament, setTemperament] = useState<Temperament>(() => getConfig().defaultTemperament as Temperament);
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const [pendingImageNames, setPendingImageNames] = useState<string[]>([]);

  const { pasteInProgress } = useClipboardPaste({
    onImagePasted: (base64, name) => {
      setPendingImages(prev => [...prev, base64]);
      setPendingImageNames(prev => [...prev, name]);
      addSystemEntry(`[Image #${pendingImages.length + 1}] pasted from clipboard`);
    },
    onError: (msg) => addSystemEntry(`Clipboard error: ${msg}`),
    disabled: isThinking,
  });

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

      // Catch-all for unrecognized /trust subcommands
      if (text.startsWith("/trust")) {
        addSystemEntry(
          "Usage:\n  /trust             — list trusted dirs\n  /trust revoke <path> — revoke trust\n  /trust revoke-all    — revoke all"
        );
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

      // Catch-all for unrecognized /mcp subcommands
      if (text.startsWith("/mcp")) {
        addSystemEntry(
          "Usage:\n  /mcp             — list servers\n  /mcp add <name> <command> [args...]  — add server\n  /mcp remove <name>  — remove server"
        );
        return;
      }

      // /temperament commands
      if (text === "/temperament") {
        setTemperament(prev => {
          const n = nextTemperament(prev);
          addSystemEntry(`Temperament: ${temperamentLabel(n) || 'neutral'}`);
          return n;
        });
        return;
      }

      if (text.startsWith("/temperament ")) {
        const value = text.slice("/temperament ".length).trim().toLowerCase();
        const valid: Temperament[] = ['neutral', 'sharp', 'warm', 'auto'];
        if (!valid.includes(value as Temperament)) {
          addSystemEntry(`Invalid temperament '${value}'. Valid: ${valid.join(', ')}`);
          return;
        }
        setTemperament(value as Temperament);
        addSystemEntry(`Temperament: ${temperamentLabel(value as Temperament) || 'neutral'}`);
        return;
      }

      if (text === "/mode") {
        setMode(prev => {
          const n = nextMode(prev);
          addSystemEntry(`Mode: ${modeLabel(n) || 'normal'}`);
          return n;
        });
        return;
      }

      // /image commands
      if (text === "/image list") {
        if (pendingImageNames.length === 0) {
          addSystemEntry("No images attached.");
        } else {
          const lines = pendingImageNames.map((name, i) => `  [Image #${i + 1}] ${name}`);
          addSystemEntry("Pending images:\n" + lines.join("\n"));
        }
        return;
      }

      if (text === "/image clear") {
        setPendingImages([]);
        setPendingImageNames([]);
        addSystemEntry("All pending images cleared.");
        return;
      }

      if (text.startsWith("/image ")) {
        const imgPath = text.slice("/image ".length).trim();
        if (!imgPath) {
          addSystemEntry("Usage: /image <path> | list | clear");
          return;
        }
        try {
          const VALID_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
          const resolved = resolve(imgPath);
          const ext = resolved.toLowerCase().slice(resolved.lastIndexOf('.'));
          if (!VALID_EXTENSIONS.includes(ext)) {
            addSystemEntry(`Invalid image format '${ext}'. Supported: ${VALID_EXTENSIONS.join(', ')}`);
            return;
          }
          const stat = statSync(resolved);
          const MAX_SIZE = 10 * 1024 * 1024; // 10MB
          if (stat.size > MAX_SIZE) {
            addSystemEntry(`Image too large (${(stat.size / 1024 / 1024).toFixed(1)}MB). Max: 10MB`);
            return;
          }
          const base64 = readFileSync(resolved).toString('base64');
          const fileName = resolved.split('/').pop() ?? imgPath;
          setPendingImages(prev => [...prev, base64]);
          setPendingImageNames(prev => [...prev, fileName]);
          const count = pendingImages.length + 1;
          addSystemEntry(`[Image #${count}] attached: ${fileName}`);
        } catch (err) {
          addSystemEntry(`Failed to read image: ${err instanceof Error ? err.message : String(err)}`);
        }
        return;
      }

      if (text === "/image") {
        addSystemEntry("Usage: /image <path> | list | clear");
        return;
      }

      const imagesToSend = pendingImages.length > 0 ? [...pendingImages] : undefined;
      if (imagesToSend) {
        setPendingImages([]);
        setPendingImageNames([]);
      }
      sendMessage(session.id, text, model, mode, imagesToSend, temperament);
    },
    [session.id, model, sendMessage, exit, projectDir, addSystemEntry, pendingImages, pendingImageNames, temperament],
  );

  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      exit();
    }
    if (key.shift && key.tab) {
      setMode(prev => nextMode(prev));
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
        mode={mode}
        temperament={temperament}
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
          mode={mode}
          pendingImageCount={pendingImages.length}
          pasteInProgress={pasteInProgress}
        />
      </Box>
    </Box>
  );
}
