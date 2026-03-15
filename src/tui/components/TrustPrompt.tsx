import React, { useState } from "react";
import { Box, Text, useInput } from "ink";

interface Props {
  directory: string;
  onTrust: () => void;
  onExit: () => void;
}

const options = [
  "Yes, I trust this folder",
  "No, exit",
] as const;

export function TrustPrompt({ directory, onTrust, onExit }: Props) {
  const [selected, setSelected] = useState(0);

  useInput((input, key) => {
    if (key.upArrow) {
      setSelected(0);
    } else if (key.downArrow) {
      setSelected(1);
    } else if (key.return) {
      if (selected === 0) onTrust();
      else onExit();
    } else if (key.escape) {
      onExit();
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
        Accessing workspace:
      </Text>
      <Text> </Text>
      <Text color="white" bold>
        {directory}
      </Text>
      <Text> </Text>
      <Text color="gray">
        Quick safety check: Is this a project you created or one you trust?
      </Text>
      <Text color="gray">
        Julia'll be able to read, edit, and execute files here.
      </Text>
      <Text> </Text>
      {options.map((label, i) => (
        <Text key={i}>
          <Text color={selected === i ? "cyan" : "gray"}>
            {selected === i ? " ❯ " : "   "}
          </Text>
          <Text color={selected === i ? "white" : "gray"} bold={selected === i}>
            {i + 1}. {label}
          </Text>
        </Text>
      ))}
      <Text> </Text>
      <Text color="gray" dimColor>
        Enter to confirm · Esc to cancel
      </Text>
    </Box>
  );
}
