import React from "react";
import { Box, Text, useInput } from "ink";
import { useTheme } from "../theme";
import { FileTree } from "./FileTree";
import { SessionList } from "./SessionList";
import type { SessionListEntry } from "../types";

export interface SidebarData {
  sessions: SessionListEntry[];
  files: string[];
}

/**
 * Left sidebar: recent sessions + project file tree, with j/k navigation
 * to resume a session from the list.
 */
export function Sidebar({
  data,
  onResume,
  onClose,
}: {
  data: SidebarData;
  onResume: (id: string) => void;
  onClose: () => void;
}): React.JSX.Element {
  const theme = useTheme();
  const [cursor, setCursor] = React.useState(0);

  useInput(
    (input, key) => {
      if (key.escape) return onClose();
      if (key.upArrow || input === "k") setCursor((c) => Math.max(0, c - 1));
      if (key.downArrow || input === "j") setCursor((c) => Math.min(data.sessions.length - 1, c + 1));
      if (key.return) {
        const session = data.sessions[cursor];
        if (session) onResume(session.id);
      }
    },
    { isActive: data.sessions.length > 0 },
  );

  return (
    <Box flexDirection="column" width={32} borderStyle="round" borderColor={theme.border} paddingX={1} marginRight={1}>
      <Text bold color={theme.secondary}>Sessions</Text>
      <SessionList sessions={data.sessions} cursor={cursor} />
      <Box marginTop={1}>
        <Text bold color={theme.secondary}>
          Project
        </Text>
      </Box>
      <FileTree paths={data.files} />
      <Text color={theme.muted} dimColor>
        Esc close · Enter resume
      </Text>
    </Box>
  );
}