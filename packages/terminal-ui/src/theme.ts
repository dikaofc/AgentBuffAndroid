import { createContext, useContext } from "react";
import type { ThemePalette } from "@dikabuff/config";
import { getTheme } from "@dikabuff/config";

/** React context plumbing the active theme into every component. */
export const ThemeContext = createContext<ThemePalette>(getTheme("dark"));

export function useTheme(): ThemePalette {
  return useContext(ThemeContext);
}

export function withTheme(themeId: string): ThemePalette {
  return getTheme(themeId);
}