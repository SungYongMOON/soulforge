export const UI_SCHEMA_VERSION = "ui-state.v1";
export const ROW_IDS = ["skills", "tools", "knowledge", "workflows"] as const;
export const TAB_IDS = ["overview", "body", "class", "workspaces"] as const;
export const FIXTURE_NAMES = ["integrated", "overview", "body", "class", "workspaces"] as const;

export type StatusTone =
  | "ok"
  | "ready"
  | "warning"
  | "error"
  | "missing"
  | "partial"
  | "present"
  | "inactive"
  | "bound"
  | "unbound"
  | "mixed"
  | "resolved";

export type RowId = (typeof ROW_IDS)[number];
export type TabId = (typeof TAB_IDS)[number];
export type FixtureName = (typeof FIXTURE_NAMES)[number];

export interface IdentityRef {
  id: string;
  display_name: string;
  summary: string;
  source_ref: string | null;
  active: boolean;
  [key: string]: unknown;
}

export interface SourceMeta {
  producer: string;
  mode: "fixture" | "integration" | "url";
  adapter: string;
  fixture_name: string | null;
  notes: string[];
  [key: string]: unknown;
}

export interface CountBlock {
  skills: number;
  tools: number;
  knowledge: number;
  workflows: number;
  [key: string]: number;
}

export interface OverviewState {
  body_id: string | null;
  class_id: string | null;
  active_profile: string | null;
  active_species: IdentityRef | null;
  active_hero: IdentityRef | null;
  sections_present: {
    present: number;
    total: number;
    [key: string]: unknown;
  };
  installed_counts: CountBlock;
  equipped_counts: CountBlock;
  workspace_counts: {
    total: number;
    bound: number;
    unbound: number;
    invalid: number;
    [key: string]: unknown;
  };
  warnings: number;
  errors: number;
  overall_status: StatusTone;
  status_note?: string;
  [key: string]: unknown;
}

export interface SectionPresence {
  id: string;
  path: string;
  present: boolean;
  status: StatusTone;
  [key: string]: unknown;
}

export interface SectionSummary {
  section_id: string;
  title: string;
  summary: string;
  status: StatusTone;
  present: boolean;
  [key: string]: unknown;
}

export interface BodyState {
  meta: {
    body_id: string | null;
    display_name: string | null;
    version?: string | null;
    operating_context: string | null;
    status: StatusTone;
    [key: string]: unknown;
  };
  active_species: IdentityRef | null;
  active_hero: IdentityRef | null;
  section_presence: SectionPresence[];
  section_summaries: SectionSummary[];
  current_bindings: {
    class_binding: {
      status: StatusTone;
      class_id: string | null;
      active_profile: string | null;
      [key: string]: unknown;
    };
    workspace_binding: {
      status: StatusTone;
      active_workspace?: string | null;
      candidate_count?: number;
      [key: string]: unknown;
    };
    precedence: string[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface ProfileRef {
  id: string;
  display_name: string;
  summary: string;
  source_ref: string | null;
  active: boolean;
  [key: string]: unknown;
}

export interface RowItem {
  id: string;
  display_name: string;
  summary: string;
  installed: boolean;
  equipped: boolean;
  active: boolean | null;
  required: boolean | null;
  preferred: boolean | null;
  dependency_status: "resolved" | "invalid" | "partial" | "unknown" | null;
  family: string | null;
  category: string | null;
  source_ref: string | null;
  source_hint: string | null;
  catalog_ref: string | null;
  selectable_candidate: boolean;
  [key: string]: unknown;
}

export interface ClassViewState {
  class_id: string | null;
  class_name: string | null;
  class_version: string | null;
  active_profile: ProfileRef | null;
  rows: Record<RowId, RowItem[]>;
  row_order?: RowId[];
  legend?: Array<{ id: string; label: string; summary: string }>;
  [key: string]: unknown;
}

export interface WorkspaceProject {
  project_id: string | null;
  project_name: string | null;
  project_path: string;
  workspace_kind: "company" | "personal";
  state: "bound" | "unbound" | "invalid";
  project_agent_present: boolean;
  default_loadout: string | null;
  binding_status: StatusTone;
  capsule_binding_count: number;
  workflow_binding_count: number;
  local_state_entry_count: number;
  [key: string]: unknown;
}

export interface WorkspacesState {
  summary: {
    total: number;
    bound: number;
    unbound: number;
    invalid: number;
    binding_status: StatusTone;
    active_workspace?: string | null;
    [key: string]: unknown;
  };
  grouped_projects: {
    company: WorkspaceProject[];
    personal: WorkspaceProject[];
    [key: string]: WorkspaceProject[];
  };
  [key: string]: unknown;
}

export interface DiagnosticItem {
  code: string;
  message: string;
  severity: "warning" | "error";
  location_hint: string | null;
  [key: string]: unknown;
}

export interface DiagnosticsState {
  summary: {
    warnings: number;
    errors: number;
    highest_severity: "ok" | "warning" | "error";
    [key: string]: unknown;
  };
  warnings: DiagnosticItem[];
  errors: DiagnosticItem[];
  [key: string]: unknown;
}

export interface CatalogItem {
  id: string;
  display_name: string;
  summary: string;
  source_ref: string | null;
  active: boolean;
  candidate: boolean;
  [key: string]: unknown;
}

export interface CatalogsState {
  identity: {
    status: StatusTone;
    species_candidates: CatalogItem[];
    hero_candidates: CatalogItem[];
    [key: string]: unknown;
  };
  class: {
    status: StatusTone;
    profiles_catalog: CatalogItem[];
    skills_catalog: CatalogItem[];
    tools_catalog: CatalogItem[];
    knowledge_catalog: CatalogItem[];
    workflows_catalog: CatalogItem[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface UiHintsState {
  theme: string;
  phase: string;
  default_tab?: string | null;
  layout: {
    left_ratio: number;
    right_ratio: number;
    gutter_ratio: number;
    [key: string]: unknown;
  };
  material_hints: Record<string, string>;
  icon_hints: Record<string, string>;
  renderer_notes?: string[];
  [key: string]: unknown;
}

export interface UiState {
  schema_version: string;
  generated_at: string | null;
  source: SourceMeta;
  overview: OverviewState;
  body: BodyState;
  class_view: ClassViewState;
  workspaces: WorkspacesState;
  diagnostics: DiagnosticsState;
  catalogs: CatalogsState;
  ui_hints: UiHintsState;
  [key: string]: unknown;
}

export interface LegacyFinding {
  level?: string;
  code?: string;
  message?: string;
}

export interface LegacyModuleRecord {
  id?: string;
  name?: string;
  description?: string;
  manifest_path?: string;
  family?: string;
  dependency_status?: string;
  requires?: {
    skills?: string[];
    tools?: string[];
    knowledge?: string[];
  };
  [key: string]: unknown;
}

export interface LegacyDerivedState {
  ui?: {
    tabs?: Array<{ id?: string; label?: string; enabled?: boolean }>;
  };
  overview?: {
    body_id?: string | null;
    class_id?: string | null;
    active_profile?: string | null;
    counts?: {
      body_sections_present?: number;
      installed?: Partial<Record<RowId, number>>;
      equipped?: Partial<Record<RowId, number>>;
      projects?: {
        total?: number;
        bound?: number;
        unbound?: number;
        invalid?: number;
      };
    };
    status?: {
      result?: string;
      warning_count?: number;
      error_count?: number;
    };
  };
  body?: {
    id?: string | null;
    name?: string | null;
    sections?: Array<{ id?: string; path?: string; present?: boolean }>;
  };
  class?: {
    id?: string | null;
    active_profile?: string | null;
    installed?: Partial<Record<RowId, LegacyModuleRecord[]>>;
    equipped?: Partial<Record<RowId, LegacyModuleRecord[]>>;
    workflow_cards?: LegacyModuleRecord[];
  };
  workspaces?: {
    summary?: {
      total?: number;
      bound?: number;
      unbound?: number;
      invalid?: number;
    };
    company?: {
      projects?: LegacyWorkspaceProject[];
    };
    personal?: {
      projects?: LegacyWorkspaceProject[];
    };
  };
  diagnostics?: {
    warnings?: LegacyFinding[];
    errors?: LegacyFinding[];
  };
}

export interface LegacyWorkspaceProject {
  project_path?: string;
  workspace_kind?: "company" | "personal";
  state?: "bound" | "unbound" | "invalid";
  project_agent_present?: boolean;
  contract?: {
    project_id?: string | null;
    project_name?: string | null;
    default_loadout?: string | null;
  };
  capsule_binding_count?: number;
  workflow_binding_count?: number;
  local_state_entry_count?: number;
  [key: string]: unknown;
}

export interface UiStateRequest {
  kind: "fixture" | "url";
  fixture?: FixtureName;
  url?: string;
}

export interface RowPresentation {
  id: RowId;
  label: string;
  hint: string;
  material: string;
  icon: string;
}

export interface OverviewMetric {
  id: string;
  label: string;
  value: string;
  tone: StatusTone;
}

export interface RenderableEntity {
  key: string;
  title: string;
  summary: string;
  badges: string[];
  sourceRef: string | null;
}

export interface SelectionState {
  activeTab: TabId;
  selectedItemKey: string | null;
  previewCandidateKey: string | null;
  openedCatalog: string | null;
  infoDockSection: "selection" | "preview" | "diagnostics" | "summary";
}

export type SelectionAction =
  | { type: "reset"; activeTab: TabId }
  | { type: "tab"; tab: TabId }
  | { type: "select-item"; key: string | null }
  | { type: "preview-candidate"; key: string | null }
  | { type: "open-catalog"; catalog: string | null }
  | { type: "focus-diagnostics" };
