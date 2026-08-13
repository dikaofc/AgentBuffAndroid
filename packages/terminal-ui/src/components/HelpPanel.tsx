import React from "react";
import { Box, Text, useInput, useStdout } from "ink";
import { useTheme } from "../theme";

interface HelpEntry {
  cmd: string;
  desc: string;
}

interface HelpGroup {
  title: string;
  entries: HelpEntry[];
}

const HELP_GROUPS: HelpGroup[] = [
  {
    title: "Session",
    entries: [
      { cmd: "/new", desc: "fresh session" },
      { cmd: "/resume <id>", desc: "resume session by id" },
      { cmd: "/clear", desc: "clear conversation" },
      { cmd: "/compact", desc: "fold old messages into a recap" },
      { cmd: "/quit", desc: "exit" },
    ],
  },
  {
    title: "Mode & permissions",
    entries: [
      { cmd: "/mode", desc: "plan | code | debug | research | review" },
      { cmd: "/permissions", desc: "default | acceptEdits | plan | bypassPermissions" },
    ],
  },
  {
    title: "Model & look",
    entries: [
      { cmd: "/model", desc: "model picker (^M)" },
      { cmd: "/theme", desc: "dark | amoled | dracula | catppuccin | minimal" },
    ],
  },
  {
    title: "Info",
    entries: [
      { cmd: "/cost", desc: "token + cost usage" },
      { cmd: "/status", desc: "session summary" },
      { cmd: "/memory", desc: "project memory notes" },
      { cmd: "/doctor", desc: "quick diagnostics" },
      { cmd: "/learn", desc: "auto-learning status" },
      { cmd: "/review", desc: "code review of the working tree" },
      { cmd: "/help", desc: "this panel" },
    ],
  },
];

/** Flat row index: headers and entries numbered across groups in render order. */
function rowIndexOf(g: number, i: number): number {
  let n = 0;
  for (let x = 0; x < g; x++) n += HELP_GROUPS[x]!.entries.length + 1;
  return n + i; // i = 0 → header, i ≥ 1 → entries[i - 1]
}

const GROUP_COLS: Array<[number, number]> = [
  [0, 1],
  [2, 3],
];

/**
 * /help overlay — an elegant, categorized command reference. Rows reveal with a
 * short stagger (one-time animation, no timer left behind). Esc or Enter closes.
 * Rendered above the input box; the input is disabled while open.
 */
export function HelpPanel({
  active,
  onClose,
}: {
  active: boolean;
  onClose: () => void;
}): React.JSX.Element {
  const theme = useTheme();
  const { stdout } = useStdout();
  const columns = Number.isFinite(stdout.columns) ? stdout.columns : 80;
  const [revealed, setRevealed] = React.useState(0);
  const totalRows = HELP_GROUPS.reduce((n, g) => n + g.entries.length + 1, 0);

  // One-time stagger on open.
  React.useEffect(() => {
    if (!active) {
      setRevealed(0);
      return;
    }
    const timer = setInterval(() => {
      setRevealed((r) => {
        if (r >= totalRows) {
          clearInterval(timer);
          return r;
        }
        return r + 1;
      });
    }, 24);
    return () => clearInterval(timer);
  }, [active, totalRows]);

  useInput(
    (input, key) => {
      if (!active) return;
      if (key.escape || key.return) onClose();
    },
    { isActive: active },
  );

  const wide = columns >= 112;
  const cmdWidth = 18;

  const renderGroup = (g: number): React.JSX.Element => {
    const group = HELP_GROUPS[g]!;
    const headerRow = rowIndexOf(g, 0);
    const headerShown = revealed > headerRow;
    return (
      <Box key={group.title} flexDirection="column" flexShrink={1} minWidth={0}>
        <Text bold color={theme.secondary}>
          {headerShown ? `◆ ${group.title}` : " ".repeat(group.title.length + 2)}
        </Text>
        {group.entries.map((entry, i) => {
          if (revealed <= rowIndexOf(g, i + 1)) return null;
          return (
            <Text key={entry.cmd}>
              <Text color={theme.primary} bold>
                {entry.cmd.padEnd(cmdWidth, " ")}
              </Text>
              <Text color={theme.muted}>{entry.desc}</Text>
            </Text>
          );
        })}
      </Box>
    );
  };

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={theme.border} marginY={1} paddingX={1} paddingY={0}>
      <Box flexDirection="row" justifyContent="space-between">
        <Text bold color={theme.primary}>
          ◈ DikaBuff — commands
        </Text>
        <Text color={theme.muted} dimColor>
          Esc / Enter close
        </Text>
      </Box>
      {wide ? (
        <Box flexDirection="row">
          {GROUP_COLS.map((col) => (
            <Box key={col.join()} flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0} paddingRight={2}>
              {col.map(renderGroup)}
            </Box>
          ))}
        </Box>
      ) : (
        <Box flexDirection="column">{HELP_GROUPS.map((_, g) => renderGroup(g))}</Box>
      )}
    </Box>
  );
}
