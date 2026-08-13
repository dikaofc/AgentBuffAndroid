import React from "react";
import { Box, Text, useStdout } from "ink";
import { homedir } from "os";
import { useTheme } from "../theme";
import { useAnimatedFrame } from "./spinner";

/** Home-shortened path: /data/data/com.termux/files/home/PENTEST -> ~/PENTEST */
function shortCwd(cwd: string): string {
  const home = homedir();
  return cwd.startsWith(home) ? "~" + cwd.slice(home.length) : cwd;
}

/**
 * Fresh-chat welcome — plain text, no box, no fixed height. Rendered in the
 * scrollable message area so it can never push the layout past the terminal.
 */
export function Welcome({
  status,
}: {
  status: { model: string; cwd: string; mode: string };
}): React.JSX.Element {
  const theme = useTheme();
  const { stdout } = useStdout();
  const columns = Number.isFinite(stdout.columns) ? stdout.columns : 80;
  const dashN = Math.max(12, Math.min(36, columns - 8));
  // Gentle idle animation: logo glyph breathes, caret blinks at the tagline.
  const logo = useAnimatedFrame(["◈", "◈", "◉", "◈"], 720);
  const caret = useAnimatedFrame(["▍", " "], 530);
  return (
    <Box flexDirection="column" gap={1} paddingX={2} paddingY={1} flexShrink={1}>
      <Text bold color={theme.primary}>
        {logo} DikaBuff Agent CLI
      </Text>
      <Text color={theme.muted} dimColor>
        {status.model} · {status.mode} · {shortCwd(status.cwd)}
      </Text>
      <Text color={theme.border}>{"".padEnd(dashN, "─")}</Text>
      <Text color={theme.muted} dimColor wrap="truncate">
        type a request (or /help) — quick chats answer instantly, no scan
      </Text>
      <Text color={theme.border} dimColor>
        /mode plan|code · /permissions · /model · /clear · /compact · /cost · /status · /memory{caret}
      </Text>
    </Box>
  );
}
