import React, { useCallback, useEffect, useState } from "react";
import { Box, useApp, useInput } from "ink";
import { Chat } from "./components/Chat.js";
import { Input } from "./components/Input.js";
import { StatusBar } from "./components/StatusBar.js";
import { TrustPrompt } from "./components/TrustPrompt.js";
import { ApprovalPrompt, summarizeArgs } from "./components/ApprovalPrompt.js";
import { BtwInput } from "./components/BtwInput.js";
import { ModelPicker } from "./components/ModelPicker.js";
import { useSession } from "./hooks/useSession.js";
import { useAgent } from "./hooks/useAgent.js";
import { useClipboardPaste } from "./hooks/useClipboardPaste.js";
import { useSlashCommands } from "./hooks/useSlashCommands.js";
import { getConfig, reloadConfig } from "../config/index.js";
import { getProjectDir } from "../config/workspace.js";
import { nextMode } from "./types.js";
import type { AgentMode, Temperament } from "./types.js";
import { isDirectoryTrusted, trustDirectory } from "../config/trust.js";
import {
  getAvailableModels,
  setDefaultModel,
  setToolModel,
} from "../config/mcp.js";

interface Props {
  sessionId?: string;
}

export function App({ sessionId }: Props) {
  const { exit } = useApp();
  const projectDir = getProjectDir();
  const [trusted, setTrusted] = useState(() => isDirectoryTrusted(projectDir));
  const { session, refreshSession } = useSession(sessionId);
  const { entries, streamingText, isThinking, sessionTokens, activeToolModel, orchestrationProgress, sendMessage, addSystemEntry, sendBtw, pendingApproval, resolveApproval } =
    useAgent(refreshSession);
  const [model, setModel] = useState(() => getConfig().defaultModel);
  const rawConfigToolModel = getConfig().toolModel;
  const currentModelIsCloud = getAvailableModels().find(m => m.id === model)?.isCloud ?? false;
  const configToolModel = currentModelIsCloud ? null : rawConfigToolModel;
  const [mode, setMode] = useState<AgentMode>('normal');
  const [temperament, setTemperament] = useState<Temperament>(() => getConfig().defaultTemperament as Temperament);
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const [pendingImageNames, setPendingImageNames] = useState<string[]>([]);
  const [showBtw, setShowBtw] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [showToolModelPicker, setShowToolModelPicker] = useState(false);

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

  const dispatchSlash = useSlashCommands({
    exit,
    addSystemEntry,
    setMode,
    setTemperament,
    setModel,
    setShowModelPicker,
    setShowToolModelPicker,
    setPendingImages,
    setPendingImageNames,
    setTrusted,
    projectDir,
    pendingImageNames,
    pendingImages,
    session,
    model,
    mode,
    temperament,
    sendMessage,
  });

  const handleSubmit = useCallback(
    async (text: string) => {
      if (await dispatchSlash(text)) return;

      const imagesToSend = pendingImages.length > 0 ? [...pendingImages] : undefined;
      if (imagesToSend) {
        setPendingImages([]);
        setPendingImageNames([]);
      }

      sendMessage(session.id, text, model, mode, imagesToSend, temperament);
    },
    [dispatchSlash, pendingImages, sendMessage, session.id, model, mode, temperament],
  );

  const handleModelSelect = useCallback((modelId: string) => {
    setDefaultModel(modelId);
    reloadConfig();
    setModel(modelId);
    setShowModelPicker(false);
    addSystemEntry(`Model switched to: ${modelId}`);
  }, [addSystemEntry]);

  const handleModelCancel = useCallback(() => {
    setShowModelPicker(false);
  }, []);

  const handleToolModelSelect = useCallback((modelId: string) => {
    setToolModel(modelId);
    reloadConfig();
    setShowToolModelPicker(false);
    addSystemEntry(`Tool model switched to: ${modelId}`);
  }, [addSystemEntry]);

  const handleToolModelCancel = useCallback(() => {
    setShowToolModelPicker(false);
  }, []);

  const handleBtwSubmit = useCallback(
    (text: string) => {
      sendBtw(session.id, text);
      setShowBtw(false);
    },
    [session.id, sendBtw]
  );

  const handleBtwCancel = useCallback(() => {
    setShowBtw(false);
  }, []);

  useEffect(() => {
    if (!isThinking) setShowBtw(false);
  }, [isThinking]);

  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      exit();
    }
    if (key.shift && key.tab) {
      setMode(prev => nextMode(prev));
    }
    if (key.ctrl && input === "b") {
      if (isThinking && !pendingApproval) {
        setShowBtw(true);
      }
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
        toolModel={activeToolModel ?? configToolModel}
        orchestrationProgress={orchestrationProgress}
      />
      <Box flexDirection="column" flexGrow={1} paddingX={1}>
        <Chat entries={entries} streamingText={streamingText} />
      </Box>
      {pendingApproval && (
        <Box paddingX={1}>
          <ApprovalPrompt
            toolName={pendingApproval.toolName}
            argsSummary={summarizeArgs(pendingApproval.toolName, pendingApproval.args)}
            onResult={resolveApproval}
          />
        </Box>
      )}
      {showModelPicker && (
        <Box paddingX={1}>
          <ModelPicker
            models={getAvailableModels().map(m => ({
              id: m.id,
              name: m.name,
              current: m.id === model,
            }))}
            onSelect={handleModelSelect}
            onCancel={handleModelCancel}
          />
        </Box>
      )}
      {showToolModelPicker && (
        <Box paddingX={1}>
          <ModelPicker
            models={getAvailableModels().map(m => ({
              id: m.id,
              name: m.name,
              current: m.id === (configToolModel ?? ''),
            }))}
            onSelect={handleToolModelSelect}
            onCancel={handleToolModelCancel}
          />
        </Box>
      )}
      {showBtw && (
        <Box paddingX={1}>
          <BtwInput onSubmit={handleBtwSubmit} onCancel={handleBtwCancel} />
        </Box>
      )}
      <Box paddingX={1} paddingY={0}>
        <Input
          onSubmit={handleSubmit}
          disabled={isThinking || pendingApproval !== null || showModelPicker || showToolModelPicker}
          model={model}
          isThinking={isThinking}
          tokens={sessionTokens.promptTokens + sessionTokens.completionTokens}
          mode={mode}
          pendingImageCount={pendingImages.length}
          pasteInProgress={pasteInProgress}
          orchestrationProgress={orchestrationProgress}
        />
      </Box>
    </Box>
  );
}
