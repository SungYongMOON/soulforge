import { ROW_IDS, TAB_IDS, type RowId, type RowPresentation, type TabId, type UiHintsState } from "@soulforge/ui-contract";

export const TAB_ORDER: TabId[] = [...TAB_IDS];

export const TAB_LABELS: Record<TabId, string> = {
  overview: "종합",
  body: "본체",
  class: "직업",
  workspaces: "워크스페이스"
};

export const ROW_ORDER: RowId[] = [...ROW_IDS];

export const ROW_PRESENTATIONS: Record<RowId, RowPresentation> = {
  skills: {
    id: "skills",
    label: "Skills",
    hint: "Installed skill patterns and active orbs.",
    material: "frosted-orb",
    icon: "orb"
  },
  tools: {
    id: "tools",
    label: "Tools",
    hint: "External attachments and slot bindings.",
    material: "belt-slot",
    icon: "hook"
  },
  knowledge: {
    id: "knowledge",
    label: "Knowledge",
    hint: "Installed knowledge packs and spines.",
    material: "bookshelf-spine",
    icon: "spine"
  },
  workflows: {
    id: "workflows",
    label: "Workflows",
    hint: "Required combo cards and dependency chains.",
    material: "combo-card",
    icon: "combo"
  }
};

export const DEFAULT_UI_HINTS: UiHintsState = {
  theme: "adventurers_desk",
  phase: "ui-1",
  default_tab: "overview",
  layout: {
    left_ratio: 25,
    right_ratio: 70,
    gutter_ratio: 5
  },
  material_hints: {
    skills: "frosted-orb",
    tools: "belt-slot",
    knowledge: "bookshelf-spine",
    workflows: "combo-card",
    diagnostics: "warning-paper",
    info_dock: "leather-folio"
  },
  icon_hints: {
    skills: "orb",
    tools: "hook",
    knowledge: "spine",
    workflows: "combo",
    diagnostics: "telegram",
    overview: "compass"
  },
  renderer_notes: [
    "Use placeholder silhouette assets only.",
    "Keep renderer read-only and local-state only."
  ]
};

export const PRECEDENCE_LEGEND = [
  "workflow.required",
  "profile.preferred",
  "hero.bias",
  "species.default"
];

export const EMPTY_CATALOGS = {
  identity: {
    status: "missing" as const,
    species_candidates: [],
    hero_candidates: []
  },
  class: {
    status: "partial" as const,
    profiles_catalog: [],
    skills_catalog: [],
    tools_catalog: [],
    knowledge_catalog: [],
    workflows_catalog: []
  }
};
