import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../theme";

/**
 * Unified diff renderer: parses `git diff` output and colors
 * hunks (+green / -red / @@cyan / headers muted).
 */
export function DiffViewer({ title, content, onClose }: { title: string; content: string; onClose: () => void }): React.JSX.Element {
  const theme = useTheme();
  const lines = content.split("\n");
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={theme.primary} paddingX={1} marginY={1}>
      <Text bold color={theme.primary}>
        Diff — {title} <Text color={theme.muted} dimColor>[Esc close]</Text>
      </Text>
      {lines.map((line, i) => {
        let color = theme.foreground;
        let bold = false;
        if (line.startsWith("+")) {
          color = theme.success;
        } else if (line.startsWith("-")) {
          color = theme.error;
        } else if (line.startsWith("@@")) {
          color = theme.secondary;
          bold = true;
        } else if (line.startsWith("diff ") || line.startsWith("index ") || line.startsWith("--- ") || line.startsWith("+++ ")) {
          color = theme.muted;
          bold = true;
        }
        return (
          <Text key={i} color={color} bold={bold}>
            {line || " "}
          </Text>
        );
      })}
    </Box>
  );
}