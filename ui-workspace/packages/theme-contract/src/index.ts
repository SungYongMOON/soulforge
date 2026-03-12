export type ThemeId = "adventurers_desk";

export interface ThemeManifest {
  id: ThemeId | string;
  phase: string;
  css_entry: string;
  notes: string[];
}
