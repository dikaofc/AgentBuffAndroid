import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../theme";
import type { ToolEventUi } from "../types";
import { useSpinner } from "./spinner";

/** Live tool execution panel: ✓ / ✗ / ◌ rows with durations. */
export function ToolExecutionPanel({ tools }: { tools: ToolEventUi[] }): React.JSX.Element {
  const theme = useTheme();
  const spin = useSpinner();
  if (tools.length === 0) return <></>;
  const recent = tools.slice(-6);
  return (
    <Box flexDirection="column" marginY={1} paddingX={1}>
      {recent.map((tool) => {
        const icon = tool.status === "running" ? `${spin} ` : tool.status === "ok" ? "✓ " : "✗ ";
        const color = tool.status === "ok" ? theme.success : tool.status === "error" ? theme.error : theme.primary;
        return (
          <Text key={tool.id} color={color} dimColor={tool.status === "running"}>
            {icon}
            {tool.name}
            {tool.durationMs !== undefined ? <Text color={theme.muted}> ({tool.durationMs}ms)</Text> : null}
            {tool.status === "running" ? <Text color={theme.muted}>…</Text> : null}
          </Text>
        );
      })}
    </Box>
  );
}