import React from "react";
import { Box, Text, useInput } from "ink";
import { useTheme } from "../theme";
import { useAnimatedFrame } from "./spinner";

export interface InputBoxHandle {
  focus(): void;
}

/**
 * Multiline prompt input with:
 *  - Enter submit · Shift+Enter newline
 *  - ↑/↓ history navigation (scoped to this session)
 *  - ←/→/Home/End cursor movement
 *  - leading "/" shows command-suggestion styling (routed by the host)
 *
 * Correctness note (why refs): the keystroke handler must never compute from
 * stale render state. On slow terminals (Termux) or while holding a key, two
 * keypresses can arrive before React commits the re-render — reading `value`
 * / `cursor` from the closure then drops characters or makes backspace appear
 * dead. All mutations therefore go through `applyChange`, which syncs the refs
 * synchronously before batching the state updates.
 */
export function InputBox({
  value,
  onChange,
  onSubmit,
  onCommand,
  history,
  disabled,
  pending,
  hint,
}: {
  value: string;
  onChange: (next: string) => void;
  onSubmit: (text: string) => void;
  onCommand?: (cmd: string) => void;
  history?: string[];
  /** Hard lock (modal overlays): no typing at all. */
  disabled?: boolean;
  /** A turn is running: typing is allowed, Enter is ignored until it finishes. */
  pending?: boolean;
  hint?: string;
}): React.JSX.Element {
  const theme = useTheme();
  const isCommand = value.trim().startsWith("/");

  // Live mirrors of the controlled state — always current, even mid-render.
  const valueRef = React.useRef(value);
  const cursorRef = React.useRef(value.length);
  const histIdxRef = React.useRef(-1);
  valueRef.current = value;

  const [cursor, setCursor] = React.useState(value.length);
  const historyRef = React.useRef<string[]>(history ?? []);
  const [histIdx, setHistIdx] = React.useState(-1);

  React.useEffect(() => {
    historyRef.current = history ?? [];
  }, [history]);

  // Clamp cursor when the value changes externally (stream flush, /command
  // reset, resume). Synced to the ref too so the handler never sees drift.
  React.useEffect(() => {
    const clamped = Math.min(cursorRef.current, value.length);
    cursorRef.current = clamped;
    setCursor(clamped);
  }, [value]);

  /** Single write path: sync refs first (handler-safe), then React state. */
  const applyChange = React.useCallback(
    (next: string, nextCursor: number): void => {
      valueRef.current = next;
      cursorRef.current = nextCursor;
      onChange(next);
      setCursor(nextCursor);
    },
    [onChange],
  );

  const moveCursor = React.useCallback((next: number): void => {
    cursorRef.current = next;
    setCursor(next);
  }, []);

  // Animations — timers only tick while the box is actually usable. Hooks are
  // unconditional (Rules of Hooks): toggling isCommand must not change the hook
  // count, or React unmounts the whole tree on the next keystroke.
  const promptFrame = useAnimatedFrame(["›", "⟩", "»", "⟩"], disabled ? null : pending ? 260 : null);
  const promptGlyph = isCommand ? "/" : promptFrame;
  const cursorOn = useAnimatedFrame(["block", "blank"], disabled ? null : 530) === "block";

  useInput(
    (input, key) => {
      if (disabled) return;

      const cur = () => cursorRef.current;
      const val = () => valueRef.current;

      if (key.return) {
        if (pending) return; // type-ahead allowed, submit waits for the running turn
        if (key.shift) {
          insert("\n");
          return;
        }
        const text = val().trim();
        if (!text) return;
        if (text.startsWith("/") && onCommand) {
          onCommand(text);
          return; // the host resets the value; cursor clamps via the effect
        }
        historyRef.current.push(text);
        histIdxRef.current = -1;
        setHistIdx(-1);
        applyChange("", 0);
        onSubmit(text);
        return;
      }
      if (key.upArrow) {
        const hist = historyRef.current;
        if (hist.length === 0) return;
        const idx = histIdxRef.current === -1 ? hist.length - 1 : Math.max(0, histIdxRef.current - 1);
        histIdxRef.current = idx;
        setHistIdx(idx);
        const prev = hist[idx];
        if (prev !== undefined) applyChange(prev, prev.length);
        return;
      }
      if (key.downArrow) {
        if (histIdxRef.current === -1) return;
        const idx = histIdxRef.current + 1;
        if (idx >= historyRef.current.length) {
          histIdxRef.current = -1;
          setHistIdx(-1);
          applyChange("", 0);
        } else {
          histIdxRef.current = idx;
          setHistIdx(idx);
          const next = historyRef.current[idx]!;
          applyChange(next, next.length);
        }
        return;
      }
      if (key.leftArrow) return moveCursor(Math.max(0, cur() - 1));
      if (key.rightArrow) return moveCursor(Math.min(val().length, cur() + 1));
      // Home/End arrive as ANSI sequences in raw mode (Ink does not expose them on `key`).
      if (input === "\u001b[H" || input === "\u001bOH") return moveCursor(0);
      if (input === "\u001b[F" || input === "\u001bOF") return moveCursor(val().length);
      // Ink quirk (5.x): most terminals send DEL (\x7f) for the Backspace key,
      // which Ink maps to `key.delete` with `input` blanked out — `key.backspace`
      // only ever fires for \b (Ctrl+H). So the Backspace key must be handled
      // through `key.delete` too, or deletion silently does nothing (the bug
      // "can't delete text" on Termux).
      //   key.backspace           → \b          → delete char before cursor
      //   key.delete @ end        → DEL \x7f    → the Backspace key: same
      //   key.delete mid-text     → \x1b[3~     → true forward Delete
      if (key.backspace) {
        const c = cur();
        if (c === 0) return;
        applyChange(val().slice(0, c - 1) + val().slice(c), c - 1);
        return;
      }
      if (key.delete) {
        const c = cur();
        if (c >= val().length) {
          if (c === 0) return;
          applyChange(val().slice(0, c - 1) + val().slice(c), c - 1);
        } else {
          applyChange(val().slice(0, c) + val().slice(c + 1), c);
        }
        return;
      }
      // printable characters
      if (input && !key.ctrl && !key.meta) {
        insert(input);
      }
    },
    { isActive: !disabled },
  );

  function insert(text: string): void {
    const c = cursorRef.current;
    const next = valueRef.current.slice(0, c) + text + valueRef.current.slice(c);
    applyChange(next, c + text.length);
  }

  return (
    <Box flexDirection="column" marginTop={0} borderStyle="round" borderColor={isCommand ? theme.warning : theme.border} paddingX={1} paddingY={0}>
      <Box flexDirection="row">
        <Text bold color={isCommand ? theme.warning : theme.primary}>
          {promptGlyph}
        </Text>
        <Box flexShrink={1} minWidth={0}>
          <Text color={isCommand ? theme.warning : theme.foreground} wrap="truncate-start">
            {value.slice(0, cursor)}
          </Text>
        </Box>
        <Box flexShrink={0}>
          <Text color={theme.primary} inverse={cursorOn} dimColor={!cursorOn}>
            {" "}
          </Text>
        </Box>
        <Box flexShrink={0}>
          <Text color={theme.foreground} wrap="truncate">
            {value.slice(cursor)}
          </Text>
        </Box>
      </Box>
      <Text color={theme.muted} dimColor>
        {hint ??
          (isCommand
            ? "command mode — /mode · /permissions · /model · /theme · /clear · /compact · /cost · /status · /memory · /review · /help · /quit"
            : "Enter send · Shift+Enter newline · ↑ history · / for commands")}
      </Text>
    </Box>
  );
}
