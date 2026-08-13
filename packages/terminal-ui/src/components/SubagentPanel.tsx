import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../theme";
import { useSpinner } from "./spinner";
import type { SubagentTaskUi } from "../types";

/**
 * Live fan-out panel: one line per delegated sub-agent task.
 *   ◌ 1/2 · reading auth flow…
 *   ✓ 2/2 · locating tests
 */
export function SubagentPanel({ tasks }: { tasks: SubagentTaskUi[] }): React.JSX.Element {
  const theme = useTheme();
  // Stop the spinner timer the moment nothing is running — otherwise the
  // panel would repaint ~12x/second forever, even after fan-out completes.
  const anyRunning = tasks.some((t) => t.status === "running" || t.status === "tool");
  const spin = useSpinner(anyRunning ? 80 : null);
  if (tasks.length === 0) return <></>;
  return (
    <Box flexDirection="column" marginY={1} paddingX={1}>
      <Text bold color={theme.secondary}>
        ⧉ Sub-agents
      </Text>
      {tasks.map((task) => {
        const running = task.status === "running" || task.status === "tool";
        const icon = task.status === "done" ? "✓" : task.status === "error" ? "✗" : `${spin}`;
        const color = task.status === "done" ? theme.success : task.status === "error" ? theme.error : theme.primary;
        const detail = task.status === "tool" && task.detail ? ` · ${task.detail}` : "";
        return (
          <Text key={task.index} color={color} dimColor={running}>
            {icon} {task.index + 1}/{task.total} · {task.label}
            {detail}
          </Text>
        );
      })}
    </Box>
  );
}
