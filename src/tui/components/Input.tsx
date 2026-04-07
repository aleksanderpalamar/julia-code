import React, { useState, useMemo } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import Spinner from "ink-spinner";
import { SlashMenu } from "./SlashMenu.js";
import { filterCommands } from "../commands/registry.js";
import type { AgentMode } from "../types.js";
import { modeLabel, modeColor } from "../types.js";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import { getBreakpoint } from "../responsive.js";

interface Props {
  onSubmit: (value: string) => void;
  disabled: boolean;
  model: string;
  isThinking: boolean;
  tokens?: number;
  mode: AgentMode;
  pendingImageCount?: number;
  pasteInProgress?: React.MutableRefObject<boolean>;
}

export function Input({
  onSubmit,
  disabled,
  model,
  isThinking,
  tokens,
  mode,
  pendingImageCount,
  pasteInProgress,
}: Props) {
  const [value, setValue] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const { columns } = useTerminalSize();
  const bp = getBreakpoint(columns);

  const showMenu = value.startsWith("/") && !value.includes(" ");
  const filteredCommands = useMemo(
    () => (showMenu ? filterCommands(value) : []),
    [value, showMenu],
  );

  useInput(
    (input, key) => {
      if (!showMenu || filteredCommands.length === 0) return;

      if (key.upArrow) {
        setSelectedIndex((prev) =>
          prev <= 0 ? filteredCommands.length - 1 : prev - 1,
        );
      }

      if (key.downArrow) {
        setSelectedIndex((prev) =>
          prev >= filteredCommands.length - 1 ? 0 : prev + 1,
        );
      }

      if (key.tab && !key.shift) {
        const cmd = filteredCommands[selectedIndex];
        if (cmd) {
          setValue(cmd.name + " ");
          setSelectedIndex(0);
        }
      }

      if (key.escape) {
        setValue("");
        setSelectedIndex(0);
      }
    },
    { isActive: !disabled },
  );

  const handleChange = (newValue: string) => {
    if (pasteInProgress?.current) {
      pasteInProgress.current = false;
      return;
    }
    const cleaned = newValue.replace(/\x16/g, '');
    if (cleaned !== value) {
      setValue(cleaned);
      setSelectedIndex(0);

      if (cleaned.startsWith("/") && !cleaned.includes(" ")) {
        const matches = filterCommands(cleaned);
        if (matches.length === 1 && matches[0].name === cleaned && matches[0].autoTrigger) {
          setValue("");
          onSubmit(matches[0].name);
        }
      }
    }
  };

  const handleSubmit = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    if (showMenu && filteredCommands.length > 0) {
      const cmd = filteredCommands[selectedIndex];
      if (cmd) {
        setValue("");
        setSelectedIndex(0);
        onSubmit(cmd.name);
        return;
      }
    }

    setValue("");
    setSelectedIndex(0);
    onSubmit(trimmed);
  };

  const displayModel = bp === 'narrow'
    ? null
    : bp === 'medium' && model.length > 20
      ? model.slice(0, 17) + '...'
      : model;

  const showTokens = bp !== 'narrow';

  return (
    <Box flexDirection="column">
      {showMenu && filteredCommands.length > 0 && (
        <SlashMenu commands={filteredCommands} selectedIndex={selectedIndex} />
      )}
      <Box>
        {displayModel && (
          <>
            <Text color="yellow">{displayModel}</Text>
            <Text color="gray"> | </Text>
          </>
        )}
        {showTokens && (
          <>
            <Text color="gray">
              {tokens ? `${tokens.toLocaleString()}tk` : "0tk"}{" "}
            </Text>
          </>
        )}
        {mode !== 'normal' && (
          <>
            <Text color="gray"> | </Text>
            <Text color={modeColor(mode)} bold>{modeLabel(mode)}</Text>
          </>
        )}
        {(pendingImageCount ?? 0) > 0 && (
          <>
            <Text color="gray"> | </Text>
            <Text color="cyan" bold>[{pendingImageCount} img]</Text>
          </>
        )}
        {isThinking && (
          <>
            <Text color="gray"> | </Text>
            <Text color="magenta">
              <Spinner type="dots" /> thinking...
            </Text>
          </>
        )}
        <Text color="gray"> | </Text>
        <Text color={modeColor(mode)} bold>
          {"❯ "}
        </Text>
        {disabled ? (
          <Text dimColor>waiting...</Text>
        ) : (
          <TextInput
            value={value}
            onChange={handleChange}
            onSubmit={handleSubmit}
            placeholder="Ask Julia anything..."
          />
        )}
      </Box>
    </Box>
  );
}
