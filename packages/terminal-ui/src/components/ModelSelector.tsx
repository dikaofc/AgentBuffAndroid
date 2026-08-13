import React from "react";
import { Box, Text, useInput } from "ink";
import { useTheme } from "../theme";

export interface ModelOption {
  id: string;
  label?: string;
}

/**
 * Model switcher. Supports both a popover list (Enter to confirm, Esc to
 * cancel) and bracket navigation.
 */
export function ModelSelector({
  models,
  current,
  onSelect,
  active,
  onClose,
}: {
  models: ModelOption[];
  current: string;
  onSelect: (id: string) => void;
  active: boolean;
  onClose: () => void;
}): React.JSX.Element {
  const theme = useTheme();
  const [cursor, setCursor] = React.useState(Math.max(0, models.findIndex((m) => m.id === current)));

  useInput(
    (input, key) => {
      if (!active) return;
      if (key.escape) return onClose();
      if (key.upArrow) setCursor((c) => (c - 1 + models.length) % models.length);
      if (key.downArrow) setCursor((c) => (c + 1) % models.length);
      if (key.return) {
        const model = models[cursor];
        if (model) onSelect(model.id);
        onClose();
      }
      if (input === "j") setCursor((c) => (c + 1) % models.length);
      if (input === "k") setCursor((c) => (c - 1 + models.length) % models.length);
    },
    { isActive: active },
  );

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={theme.primary} marginY={1} paddingX={1}>
      <Text bold color={theme.primary}>
        Model
      </Text>
      {models.map((model, idx) => (
        <Text key={model.id} color={idx === cursor ? theme.primary : theme.foreground} bold={idx === cursor}>
          {idx === cursor ? "› " : "  "}
          {model.id === current ? "● " : "○ "}
          {model.id}
          {model.label ? <Text color={theme.muted}> — {model.label}</Text> : null}
        </Text>
      ))}
      <Text color={theme.muted} dimColor>
        ↑/↓ or j/k to move · Enter to switch · Esc to close
      </Text>
    </Box>
  );
}