export const THEME_DATA_ATTRIBUTE = "data-sf-theme";
export const THEME_PHASE_DATA_ATTRIBUTE = "data-sf-theme-phase";

export const THEME_MATERIAL_SLOTS = [
  "frame",
  "panel",
  "card",
  "catalog",
  "summary_strip",
  "info_dock",
  "character_plate",
  "skills_row",
  "tools_row",
  "knowledge_row",
  "workflows_row",
  "diagnostics"
] as const;

export const THEME_ICON_SLOTS = [
  "overview",
  "skills",
  "tools",
  "knowledge",
  "workflows",
  "diagnostics",
  "candidate",
  "selection"
] as const;

export type ThemeId = string;
export type ThemeMaterialSlot = (typeof THEME_MATERIAL_SLOTS)[number];
export type ThemeIconSlot = (typeof THEME_ICON_SLOTS)[number];

export interface ThemeManifest {
  id: ThemeId;
  label: string;
  family: string;
  phase: string;
  css_entry: string;
  material_hooks: Partial<Record<ThemeMaterialSlot, string>>;
  icon_hooks: Partial<Record<ThemeIconSlot, string>>;
  asset_hints?: Record<string, string>;
  notes: string[];
}

export function resolveThemeManifest(
  themes: readonly ThemeManifest[],
  requestedId?: string | null,
  fallbackId?: string | null
) {
  if (themes.length === 0) {
    throw new Error("At least one theme manifest is required.");
  }

  const candidateIds = [requestedId, fallbackId, themes[0]?.id].filter((value): value is string => Boolean(value));

  for (const candidateId of candidateIds) {
    const match = themes.find((theme) => theme.id === candidateId);
    if (match) {
      return match;
    }
  }

  return themes[0];
}

export function applyThemeManifest(
  theme: ThemeManifest,
  target: { setAttribute(name: string, value: string): void }
) {
  target.setAttribute(THEME_DATA_ATTRIBUTE, theme.id);
  target.setAttribute(THEME_PHASE_DATA_ATTRIBUTE, theme.phase);
}
