import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../theme";
import type { SubagentTaskUi, ToolEventUi, UiMessage } from "../types";
import { MessageBox } from "./MessageBox";
import { ToolExecutionPanel } from "./ToolExecutionPanel";
import { SubagentPanel } from "./SubagentPanel";
import { ErrorPanel } from "./ErrorPanel";

// Memoized leaves: during streaming, only the message whose content changed
// re-renders — everything else bails out (kills the whole-tree repaint flicker).
const MemoMessage = React.memo(MessageBox);
const MemoTools = React.memo(ToolExecutionPanel);
const MemoSubagents = React.memo(SubagentPanel);
const MemoError = React.memo(ErrorPanel);

/**
 * Scrollable chat: user/assistant message boxes + live tool/sub-agent panels.
 * Renders the tail of history and auto-follows the stream.
 */
export function ChatPanel({
  messages,
  toolEvents,
  subagentTasks,
  error,
}: {
  messages: UiMessage[];
  toolEvents: ToolEventUi[];
  subagentTasks: SubagentTaskUi[];
  error?: string;
}): React.JSX.Element {
  const theme = useTheme();
  const ref = React.useRef<{ scrollToBottom(): void } | null>(null);
  const MAX_VISIBLE = 24;
  const visible = messages.length > MAX_VISIBLE ? messages.slice(-MAX_VISIBLE) : messages;

  return (
    <Box flexDirection="column" flexGrow={1} ref={ref as never}>
      {messages.length > MAX_VISIBLE ? (
        <Text color={theme.muted} dimColor>
          ↑ older messages hidden (resize scroll) — {messages.length - MAX_VISIBLE} more
        </Text>
      ) : null}
      {visible.map((message) => (
        <MemoMessage key={message.id} message={message} />
      ))}
      <MemoSubagents tasks={subagentTasks} />
      <MemoTools tools={toolEvents} />
      {error ? <MemoError message={error} /> : null}
    </Box>
  );
}
