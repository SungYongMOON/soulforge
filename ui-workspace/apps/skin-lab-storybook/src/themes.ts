import { ADVENTURERS_DESK_THEMES } from "@soulforge/theme-adventurers-desk";
import { applyThemeManifest, resolveThemeManifest } from "@soulforge/theme-contract";
import "@soulforge/theme-adventurers-desk/theme.css";

export const AVAILABLE_THEMES = [...ADVENTURERS_DESK_THEMES];

export function selectTheme(themeId: string | null | undefined) {
  return resolveThemeManifest(AVAILABLE_THEMES, themeId);
}

export function applyThemeSelection(themeId: string | null | undefined) {
  const theme = selectTheme(themeId);
  applyThemeManifest(theme, document.documentElement);
  return theme;
}
