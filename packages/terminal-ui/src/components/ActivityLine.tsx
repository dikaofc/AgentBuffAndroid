import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../theme";
import { useSpinner, useDots } from "./spinner";

/**
 * Live activity line — animated text showing what the AI is doing right now
 * (fed by `thinking` events): spinning glyph + gently growing ellipsis dots.
 * Runs only while an activity is present so it never repaints in idle: the
 * timers are null when there's nothing to show.
 */
export function ActivityLine({ activity }: { activity?: string }): React.JSX.Element | null {
  const theme = useTheme();
  const spin = useSpinner(activity ? 80 : null);
  const dots = useDots(activity ? 400 : null);
  if (!activity) return null;
  return (
    <Box flexDirection="row" paddingX={1} marginBottom={1}>
      <Text color={theme.primary}>{spin}</Text>
      <Text color={theme.foreground} dimColor>
        {" "}
        {activity}
        {dots}
      </Text>
    </Box>
  );
}
