import React from "react";
import { Text } from "ink";
import { useTheme } from "../theme";

/** Live token usage estimate with budget coloring. */
export function TokenCounter({ used, budget = 120_000 }: { used: number; budget?: number }): React.JSX.Element {
  const theme = useTheme();
  const ratio = budget > 0 ? used / budget : 0;
  const color = ratio > 0.9 ? theme.error : ratio > 0.7 ? theme.warning : theme.muted;
  const fmt = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
  return (
    <Text color={color} dimColor>
      {fmt(used)}/{fmt(budget)} tokens
    </Text>
  );
}