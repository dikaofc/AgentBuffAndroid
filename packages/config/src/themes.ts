/** Terminal theme palettes. Colors are hex (Ink-compatible) + ANSI accents. */

export type ThemeId = "dark" | "amoled" | "dracula" | "catppuccin" | "minimal";

export interface ThemePalette {
  id: ThemeId;
  name: string;
  background: string;
  foreground: string;
  primary: string;
  secondary: string;
  success: string;
  warning: string;
  error: string;
  muted: string;
  border: string;
  user: string;
  assistant: string;
  thinking: string;
  code: string;
  codeBackground: string;
  /** ANSI code used by non-Ink output (logs). */
  accentAnsi: "cyan" | "green" | "magenta" | "blue" | "white";
}

export const THEMES: Record<ThemeId, ThemePalette> = {
  dark: {
    id: "dark", name: "Dark",
    background: "#1e1e2e", foreground: "#cdd6f4",
    primary: "#89b4fa", secondary: "#94e2d5",
    success: "#a6e3a1", warning: "#f9e2af", error: "#f38ba8",
    muted: "#6c7086", border: "#45475a",
    user: "#89b4fa", assistant: "#cdd6f4", thinking: "#6c7086",
    code: "#f9e2af", codeBackground: "#181825",
    accentAnsi: "cyan",
  },
  amoled: {
    id: "amoled", name: "AMOLED",
    background: "#000000", foreground: "#eaeaea",
    primary: "#4fc3f7", secondary: "#81c784",
    success: "#81c784", warning: "#ffd54f", error: "#ff8a80",
    muted: "#616161", border: "#303030",
    user: "#4fc3f7", assistant: "#eaeaea", thinking: "#616161",
    code: "#ffd54f", codeBackground: "#0a0a0a",
    accentAnsi: "cyan",
  },
  dracula: {
    id: "dracula", name: "Dracula",
    background: "#282a36", foreground: "#f8f8f2",
    primary: "#bd93f9", secondary: "#8be9fd",
    success: "#50fa7b", warning: "#f1fa8c", error: "#ff5555",
    muted: "#6272a4", border: "#44475a",
    user: "#bd93f9", assistant: "#f8f8f2", thinking: "#6272a4",
    code: "#ffb86c", codeBackground: "#21222c",
    accentAnsi: "magenta",
  },
  catppuccin: {
    id: "catppuccin", name: "Catppuccin",
    background: "#1e1e2e", foreground: "#cdd6f4",
    primary: "#89b4fa", secondary: "#fab387",
    success: "#a6e3a1", warning: "#f9e2af", error: "#f38ba8",
    muted: "#6c7086", border: "#45475a",
    user: "#89b4fa", assistant: "#cdd6f4", thinking: "#6c7086",
    code: "#f9e2af", codeBackground: "#181825",
    accentAnsi: "blue",
  },
  minimal: {
    id: "minimal", name: "Minimal",
    background: "#0f0f0f", foreground: "#e2e2e2",
    primary: "#ffffff", secondary: "#9a9a9a",
    success: "#b8b8b8", warning: "#d0d0d0", error: "#ff6b6b",
    muted: "#5a5a5a", border: "#2a2a2a",
    user: "#ffffff", assistant: "#e2e2e2", thinking: "#5a5a5a",
    code: "#c8c8c8", codeBackground: "#161616",
    accentAnsi: "white",
  },
};

export const THEME_IDS = Object.keys(THEMES) as ThemeId[];

export function getTheme(id: string): ThemePalette {
  return THEMES[(id as ThemeId) in THEMES ? (id as ThemeId) : "dark"] ?? THEMES.dark!;
}