import React from "react";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

/**
 * Generic frame animator. Returns the current frame of `frames`, advancing every
 * `delayMs`. When `delayMs` is null the timer never starts and the frame is
 * static — zero repaints while idle.
 */
export function useAnimatedFrame(frames: readonly string[], delayMs: number | null = 80): string {
  const [frame, setFrame] = React.useState(0);
  React.useEffect(() => {
    if (delayMs === null || frames.length <= 1) return;
    const timer = setInterval(() => setFrame((f) => (f + 1) % frames.length), delayMs);
    return () => clearInterval(timer);
  }, [delayMs, frames.length]);
  return frames[frame % frames.length] ?? "";
}

/** Spinner that ticks every `delayMs` while active (null = idle, no timer, zero repaints). */
export function useSpinner(delayMs: number | null = 80): string {
  return useAnimatedFrame(SPINNER_FRAMES, delayMs);
}

/** Animated ellipsis dots: "", "·", "··", "···" cycling while active. */
export function useDots(delayMs: number | null = 420): string {
  return useAnimatedFrame(["", "·", "··", "···"], delayMs);
}
