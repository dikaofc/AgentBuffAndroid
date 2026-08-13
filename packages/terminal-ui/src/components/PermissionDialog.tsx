import React from "react";
import { Box, Text, useInput } from "ink";
import { useTheme } from "../theme";
import type { PermissionUi } from "../types";

/**
 * Permission dialog — blocks input while awaiting consent:
 *   [Y] Yes  [N] No  [V] View diff
 */
export function PermissionDialog({
  request,
  onGrant,
  onDeny,
  onViewDiff,
}: {
  request: PermissionUi;
  onGrant: () => void;
  onDeny: () => void;
  onViewDiff: () => void;
}): React.JSX.Element {
  const theme = useTheme();
  const levelColor = request.permission === "dangerous" ? theme.error : request.permission === "sensitive" ? theme.warning : theme.primary;

  useInput((input, key) => {
    if (input === "y" || input === "Y" || input === "a") onGrant();
    if (input === "n" || input === "N" || input === "d") onDeny();
    if (input === "v" || input === "V") onViewDiff();
    if (key.return) onGrant();
    if (key.escape) onDeny();
  });

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={levelColor} paddingX={2} paddingY={1} marginY={1}>
      <Text bold color={levelColor}>
        ⚠ Permission required — {request.permission}
      </Text>
      <Text color={theme.foreground}>{request.description}</Text>
      <Text color={theme.muted} dimColor>
        directory: {request.cwd}
      </Text>
      <Box flexDirection="row" gap={3} marginTop={1}>
        <Text color={theme.success} bold>
          [Y] Yes
        </Text>
        <Text color={theme.error} bold>
          [N] No
        </Text>
        <Text color={theme.secondary} bold>
          [V] View diff
        </Text>
      </Box>
    </Box>
  );
}