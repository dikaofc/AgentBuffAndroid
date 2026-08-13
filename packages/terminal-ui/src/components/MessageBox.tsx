import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../theme";
import type { UiMessage } from "../types";
import { Markdown } from "../markdown/render";

/**
 * Message render: divider label + plain content (no per-message box):
 *   ── User ──────────────────────
 *   content
 *
 *   ── DikaBuff ▍ ────────────────
 *   markdown content
 */
export function MessageBox({ message }: { message: UiMessage }): React.JSX.Element {
  const theme = useTheme();
  const isUser = message.role === "user";
  const accent = isUser ? theme.user : theme.assistant;
  return (
    <Box flexDirection="column" marginY={1} flexShrink={1}>
      <Text color={accent} dimColor>
        ── {isUser ? "User" : "DikaBuff"}
        {message.streaming ? <Text color={theme.primary}> ▍</Text> : null} ──
      </Text>
      <Box paddingLeft={2} paddingRight={1} flexShrink={1}>
        {isUser ? (
          <Text color={theme.foreground}>{message.content}</Text>
        ) : message.content ? (
          <Markdown text={message.content} />
        ) : (
          <Text color={theme.muted} dimColor>
            …
          </Text>
        )}
      </Box>
    </Box>
  );
}