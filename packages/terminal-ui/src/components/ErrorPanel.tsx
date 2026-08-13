import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../theme";

/** Red warning box for agent/provider errors with an actionable hint. */
export function ErrorPanel({ message, hint }: { message: string; hint?: string }): React.JSX.Element {
  const theme = useTheme();
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={theme.error} paddingX={1} marginY={1}>
      <Text bold color={theme.error}>
        ✖ Error
      </Text>
      <Text color={theme.error}>{message}</Text>
      {hint ? (
        <Text color={theme.muted} dimColor>
          {hint}
        </Text>
      ) : (
        <Text color={theme.muted} dimColor>
          hint: check ~/.dikabuff/config.json or run `dikabuff doctor`
        </Text>
      )}
    </Box>
  );
}