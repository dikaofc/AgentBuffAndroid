import React from "react";
import { Box, Text, useInput } from "ink";
import { useTheme } from "../theme";
import type { AskPromptUi } from "../types";

/**
 * Ask dialog — the agent asks the user a free-text question mid-run
 * (via the `ask_user` tool). Type an answer + Enter to submit; Esc (or an
 * empty Enter) rejects and lets the agent continue without the answer.
 */
export function AskDialog({
  ask,
  onAnswer,
  onReject,
}: {
  ask: AskPromptUi;
  onAnswer: (answer: string) => void;
  onReject: () => void;
}): React.JSX.Element {
  const theme = useTheme();
  const [value, setValue] = React.useState("");

  useInput((input, key) => {
    if (key.escape) return onReject();
    if (key.return) {
      const text = value.trim();
      if (!text) return onReject(); // empty submit = reject
      onAnswer(text);
      setValue("");
      return;
    }
    if (key.backspace) {
      setValue((v) => v.slice(0, -1));
      return;
    }
    if (input && !key.ctrl && !key.meta) setValue((v) => v + input);
  });

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={theme.warning} paddingX={2} paddingY={1} marginY={1}>
      <Text bold color={theme.warning}>
        ❓ The agent asks
      </Text>
      <Text color={theme.foreground}>{ask.prompt}</Text>
      <Box flexDirection="row" marginTop={1}>
        <Text bold color={theme.primary}>
          ›
        </Text>
        <Text color={theme.foreground}>{value}</Text>
        <Text inverse color={theme.primary}>
          {" "}
        </Text>
      </Box>
      <Text color={theme.muted} dimColor>
        Enter answer · Esc reject
      </Text>
    </Box>
  );
}
