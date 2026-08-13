import React from "react";
import { Box, Text, useStdout } from "ink";
import { homedir } from "os";
import { useTheme } from "../theme";
import { useAnimatedFrame } from "./spinner";
import type { StatusInfo, UiPhase } from "../types";

/** Home-shortened path: ~ for the user's home directory. */
function shortCwd(cwd: string): string {
  const home = homedir();
  return cwd.startsWith(home) ? "~" + cwd.slice(home.length) : cwd;
}

/**
 * Status line: phase dot · model · mode · cwd · session on the left,
 * key bindings on the right (hidden on narrow terminals).
 */
export function StatusBar({
  status,
  phase,
  columns: columnsProp,
}: {
  status: StatusInfo;
  phase: UiPhase;
  columns?: number;
}): React.JSX.Element {
  const theme = useTheme();
  const { stdout } = useStdout();
  const columns =
    typeof columnsProp === "number" && Number.isFinite(columnsProp)
      ? columnsProp
      : Number.isFinite(stdout.columns)
        ? stdout.columns
        : 80;
  const phaseColor =
    phase === "error"
      ? theme.error
      : phase === "awaiting-permission"
        ? theme.warning
        : phase === "idle"
          ? theme.success
          : theme.primary;
  // Animated phase indicator: pulses/streams while active, static when idle
  // (timer only ticks for non-idle phases — no repaint cost at rest).
  const PHASE_DOTS: Record<UiPhase, readonly string[]> = {
    idle: ["●"],
    thinking: ["◌", "◔", "◕", "◉", "◕", "◔"],
    streaming: ["▸", "▹", "▸", "▹"],
    "awaiting-permission": ["◔", "◑", "◕", "◑"],
    error: ["✗"],
  };
  const dot = useAnimatedFrame(PHASE_DOTS[phase], phase === "idle" || phase === "error" ? null : 340);
  const phaseLabel =
    phase === "idle" ? "idle" : phase === "thinking" ? "thinking" : phase === "streaming" ? "streaming" : phase === "awaiting-permission" ? "ask" : "error";
  const title = status.sessionTitle && status.sessionTitle.length > 30 ? status.sessionTitle.slice(0, 29) + "…" : status.sessionTitle;
  const modeLabel = status.permissionMode && status.permissionMode !== "default" ? status.permissionMode : undefined;
  const rest = [status.mock ? "MOCK" : undefined, status.model, status.mode, modeLabel, shortCwd(status.cwd)].filter(Boolean).join(" · ");
  return (
    <Box borderStyle="round" borderColor={theme.border} paddingX={1} justifyContent="space-between" width="100%">
      <Box flexShrink={1} minWidth={0}>
        <Text color={phaseColor} dimColor wrap="truncate">
          {dot} {phaseLabel} · {title ? `${rest} · ${title}` : rest}
        </Text>
      </Box>
      {columns >= 64 ? (
        <Box flexDirection="row" gap={2} flexShrink={0}>
          <Text color={theme.muted}>^Q quit</Text>
          <Text color={theme.muted}>^M model</Text>
          <Text color={theme.muted}>Esc sidebar</Text>
          <Text color={theme.muted}>/help</Text>
        </Box>
      ) : null}
    </Box>
  );
}