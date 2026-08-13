import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../theme";
import type { SessionListEntry } from "../types";

/** Session list rows for the sidebar. */
export function SessionList({ sessions, cursor }: { sessions: SessionListEntry[]; cursor?: number }): React.JSX.Element {
  const theme = useTheme();
  if (sessions.length === 0) {
    return (
      <Text color={theme.muted} dimColor>
        no sessions yet
      </Text>
    );
  }
  return (
    <Box flexDirection="column">
      {sessions.slice(0, 10).map((session, idx) => (
        <Text key={session.id} color={idx === cursor ? theme.primary : theme.foreground} bold={idx === cursor} dimColor={idx !== cursor}>
          {idx === cursor ? "› " : "  "}
          {session.title.slice(0, 26)}
        </Text>
      ))}
    </Box>
  );
}