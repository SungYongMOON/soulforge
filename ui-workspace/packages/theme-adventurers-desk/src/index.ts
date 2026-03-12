import type { ThemeManifest } from "@soulforge/theme-contract";

export const ADVENTURERS_DESK_THEME: ThemeManifest = {
  id: "adventurers_desk",
  label: "Adventurer's Desk / Warm",
  family: "adventurers-desk",
  phase: "ui-1",
  css_entry: "@soulforge/theme-adventurers-desk/theme.css",
  material_hooks: {
    frame: "atlas-frame",
    panel: "parchment-panel",
    card: "paper-card",
    catalog: "bookshelf-spine",
    summary_strip: "parchment-ribbon",
    info_dock: "leather-folio",
    character_plate: "silhouette-plinth",
    skills_row: "frosted-orb",
    tools_row: "belt-slot",
    knowledge_row: "bookshelf-spine",
    workflows_row: "combo-card",
    diagnostics: "warning-paper"
  },
  icon_hooks: {
    overview: "compass",
    skills: "orb",
    tools: "hook",
    knowledge: "spine",
    workflows: "combo",
    diagnostics: "telegram",
    candidate: "sigil",
    selection: "pin"
  },
  asset_hints: {
    paper_grain: "./assets/paper-grain.svg"
  },
  notes: [
    "Warm desk surface with parchment, brass, leather, and frosted orb accents.",
    "Phase UI-1 keeps silhouette placeholders and restrained hierarchy."
  ]
};

export const ADVENTURERS_ARCHIVE_THEME: ThemeManifest = {
  id: "adventurers_archive",
  label: "Adventurer's Desk / Archive",
  family: "adventurers-desk",
  phase: "ui-1",
  css_entry: "@soulforge/theme-adventurers-desk/theme.css",
  material_hooks: {
    frame: "atlas-frame",
    panel: "parchment-panel",
    card: "paper-card",
    catalog: "bookshelf-spine",
    summary_strip: "parchment-ribbon",
    info_dock: "leather-folio",
    character_plate: "silhouette-plinth",
    skills_row: "frosted-orb",
    tools_row: "belt-slot",
    knowledge_row: "bookshelf-spine",
    workflows_row: "combo-card",
    diagnostics: "warning-paper"
  },
  icon_hooks: {
    overview: "compass",
    skills: "orb",
    tools: "hook",
    knowledge: "spine",
    workflows: "combo",
    diagnostics: "telegram",
    candidate: "sigil",
    selection: "pin"
  },
  asset_hints: {
    paper_grain: "./assets/paper-grain.svg"
  },
  notes: [
    "Cooler archive-paper variant for contrast testing without changing renderer structure.",
    "Keeps the same material hooks so skin work can proceed independently of renderer logic."
  ]
};

export const ADVENTURERS_DESK_THEMES = [ADVENTURERS_DESK_THEME, ADVENTURERS_ARCHIVE_THEME] as const;
