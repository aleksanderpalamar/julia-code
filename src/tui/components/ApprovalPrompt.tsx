import React, { useState } from "react";
import { Box, Text, useInput } from "ink";

export type ApprovalResult = "approve" | "deny" | "approve_all";

interface Props {
  toolName: string;
  argsSummary: string;
  onResult: (result: ApprovalResult) => void;
}

const options = [
  { key: "approve", label: "[Y] Approve", color: "green" },
  { key: "deny", label: "[N] Deny", color: "red" },
  {
    key: "approve_all",
    label: "[A] Approve all in this session",
    color: "yellow",
  },
] as const;

export function ApprovalPrompt({ toolName, argsSummary, onResult }: Props) {
  const [selected, setSelected] = useState(0);

  useInput((input, key) => {
    if (key.upArrow) {
      setSelected((prev) => Math.max(0, prev - 1));
    } else if (key.downArrow) {
      setSelected((prev) => Math.min(options.length - 1, prev + 1));
    } else if (key.return) {
      onResult(options[selected].key);
    } else if (input === "y" || input === "Y") {
      onResult("approve");
    } else if (input === "n" || input === "N") {
      onResult("deny");
    } else if (input === "a" || input === "A") {
      onResult("approve_all");
    } else if (key.escape) {
      onResult("deny");
    }
  });

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="yellow"
      paddingX={2}
      paddingY={1}
    >
      <Text color="yellow" bold>
        Tool Approval Required
      </Text>
      <Text> </Text>
      <Text>
        <Text color="cyan" bold>
          Tool:{" "}
        </Text>
        <Text color="white" bold>
          {toolName}
        </Text>
      </Text>
      <Text>
        <Text color="cyan" bold>
          Args:{" "}
        </Text>
        <Text color="gray">{argsSummary}</Text>
      </Text>
      <Text> </Text>
      {options.map((opt, i) => (
        <Text key={opt.key}>
          <Text color={selected === i ? (opt.color as string) : "gray"}>
            {selected === i ? " ❯ " : "   "}
          </Text>
          <Text color={selected === i ? "white" : "gray"} bold={selected === i}>
            {opt.label}
          </Text>
        </Text>
      ))}
      <Text> </Text>
      <Text color="gray" dimColor>
        Use arrow keys to navigate, Enter to select, or Y/N/A for quick
        selection.
      </Text>
    </Box>
  );
}

export function summarizeArgs(
  toolName: string,
  args: Record<string, unknown>,
): string {
  switch (toolName) {
    case "exec":
      return String(args.command ?? "").slice(0, 120);
    case "write":
      return `path: ${args.path ?? "?"} (${String(args.content ?? "").length} chars)`;
    case "edit":
      return `path: ${args.path ?? "?"}`;
    case "fetch":
      return `${args.method ?? "GET"} ${args.url ?? "?"}`;
    default:
      return Object.entries(args)
        .slice(0, 3)
        .map(([k, v]) => `${k}: ${String(v).slice(0, 50)}`)
        .join(", ");
  }
}
