import React from "react";
import type { ThemePalette } from "@dikabuff/config";
import { getTheme } from "@dikabuff/config";
import { ThemeContext } from "./theme";

export function ThemeProvider({ themeId, children }: { themeId: string; children: React.ReactNode }): React.JSX.Element {
  const theme: ThemePalette = getTheme(themeId);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}