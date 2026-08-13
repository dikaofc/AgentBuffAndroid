import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../theme";

/** Renders a list of file paths as a tree (used by the sidebar). */
export function FileTree({ paths }: { paths: string[] }): React.JSX.Element {
  const theme = useTheme();
  if (paths.length === 0) {
    return (
      <Text color={theme.muted} dimColor>
        (empty)
      </Text>
    );
  }
  const top = new Map<string, { dirs: Set<string>; files: string[] }>();
  for (const p of paths) {
    const parts = p.split("/");
    const root = parts[0] ?? "?";
    const entry = top.get(root) ?? { dirs: new Set<string>(), files: [] };
    if (parts.length > 1) entry.dirs.add(parts[1]!);
    else entry.files.push(root);
    top.set(root, entry);
  }
  return (
    <Box flexDirection="column">
      {[...top.entries()].map(([root, entry]) => (
        <Box key={root} flexDirection="column">
          <Text color={theme.primary}>
            📁 {root}
          </Text>
          {[...entry.dirs].map((dir) => (
            <Text key={dir} color={theme.foreground} dimColor>
              {"  "}⊢ {dir}/
            </Text>
          ))}
          {entry.files.map((f) => (
            <Text key={f} color={theme.foreground} dimColor>
              {"  "}⊢ {f}
            </Text>
          ))}
        </Box>
      ))}
    </Box>
  );
}