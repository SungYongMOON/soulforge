import { FIXTURE_MAP, type RowId, type RowItem, type StatusTone, type UiState } from "@soulforge/renderer-core";

export interface SkinLabStory {
  id: string;
  label: string;
  description: string;
  coverage: string[];
  uiState: UiState;
}

const ROW_IDS: RowId[] = ["skills", "tools", "knowledge", "workflows"];

function cloneBaseState() {
  return structuredClone(FIXTURE_MAP.integrated) as UiState;
}

function mutateAllItems(state: UiState, mutate: (rowId: RowId, item: RowItem, index: number) => void) {
  for (const rowId of ROW_IDS) {
    for (const [index, item] of state.class_view.rows[rowId].entries()) {
      mutate(rowId, item, index);
    }
  }
}

function setDiagnostics(state: UiState, warnings: UiState["diagnostics"]["warnings"], errors: UiState["diagnostics"]["errors"]) {
  state.diagnostics.warnings = warnings;
  state.diagnostics.errors = errors;
}

function workspaceProjects(state: UiState) {
  if (!Array.isArray(state.workspaces.projects)) {
    state.workspaces.projects = [];
  }

  if (state.workspaces.projects.length === 0) {
    state.workspaces.projects.push({
      project_code: "P00-000",
      project_root_ref: "_workspaces/P00-000",
      project_path: "_workspaces/P00-000",
      project_name: "Local Smoke Sample",
      state: "project_agent_present",
      project_agent_present: true,
      binding_status: "bound",
      capsule_binding_count: 0,
      workflow_binding_count: 0,
      local_state_entry_count: 0
    });
  }

  return state.workspaces.projects;
}

function setWorkspaceState(state: UiState, status: "bound" | "unbound" | "invalid") {
  for (const project of workspaceProjects(state)) {
    project.state = status;
    project.binding_status = status === "invalid" ? "error" : status === "unbound" ? "warning" : "bound";
  }
}

function refreshDerivedFields(state: UiState, storyId: string, statusNote: string) {
  const installedCounts = { skills: 0, tools: 0, knowledge: 0, workflows: 0 };
  const equippedCounts = { skills: 0, tools: 0, knowledge: 0, workflows: 0 };

  for (const rowId of ROW_IDS) {
    for (const item of state.class_view.rows[rowId]) {
      if (item.installed) {
        installedCounts[rowId] += 1;
      }
      if (item.equipped || item.active) {
        equippedCounts[rowId] += 1;
      }
    }
  }

  state.overview.installed_counts = installedCounts;
  state.overview.equipped_counts = equippedCounts;
  state.overview.sections_present = {
    present: state.body.section_presence.filter((section) => section.present).length,
    total: state.body.section_presence.length
  };

  const allProjects = workspaceProjects(state);
  const bound = allProjects.filter((project) => project.state === "bound").length;
  const unbound = allProjects.filter((project) => project.state === "unbound").length;
  const invalid = allProjects.filter((project) => project.state === "invalid").length;
  const workspaceTone: StatusTone = invalid > 0 ? "error" : unbound > 0 ? "warning" : "bound";

  state.workspaces.summary = {
    ...(state.workspaces.summary ?? {}),
    total: allProjects.length,
    bound,
    unbound,
    invalid,
    binding_status: workspaceTone
  };

  state.overview.workspace_counts = {
    total: allProjects.length,
    bound,
    unbound,
    invalid
  };

  const warnings = state.diagnostics.warnings.length;
  const errors = state.diagnostics.errors.length;
  const overallStatus: StatusTone = errors > 0 ? "error" : warnings > 0 ? "warning" : "ready";

  state.diagnostics.summary = {
    warnings,
    errors,
    highest_severity: errors > 0 ? "error" : warnings > 0 ? "warning" : "ok"
  };

  state.overview.warnings = warnings;
  state.overview.errors = errors;
  state.overview.overall_status = overallStatus;
  state.overview.status_note = statusNote;
  state.source = {
    ...state.source,
    mode: "fixture",
    fixture_name: `skin-lab:${storyId}`,
    producer: "skin-lab-storybook"
  };
}

function makeActiveStory() {
  const state = cloneBaseState();

  mutateAllItems(state, (_rowId, item) => {
    item.installed = true;
    item.equipped = true;
    item.active = true;
    item.required = true;
    item.preferred = true;
    item.dependency_status = "resolved";
  });

  setDiagnostics(state, [], []);
  setWorkspaceState(state, "bound");
  refreshDerivedFields(state, "active", "All rows are fully active and resolved.");
  return state;
}

function makeInstalledOnlyStory() {
  const state = cloneBaseState();

  mutateAllItems(state, (_rowId, item) => {
    item.installed = true;
    item.equipped = false;
    item.active = false;
    item.required = false;
    item.preferred = false;
    item.dependency_status = "resolved";
  });

  setDiagnostics(state, [], []);
  setWorkspaceState(state, "bound");
  refreshDerivedFields(state, "installed_only", "Installed assets stay available without being equipped or selected.");
  return state;
}

function makeRequiredStory() {
  const state = cloneBaseState();

  mutateAllItems(state, (_rowId, item) => {
    item.installed = true;
    item.equipped = false;
    item.active = false;
    item.required = true;
    item.preferred = false;
    item.dependency_status = "resolved";
  });

  setDiagnostics(state, [], []);
  setWorkspaceState(state, "bound");
  refreshDerivedFields(state, "required", "Workflow-required items stay visually stronger than preferred or installed-only items.");
  return state;
}

function makePreferredStory() {
  const state = cloneBaseState();

  mutateAllItems(state, (_rowId, item) => {
    item.installed = true;
    item.equipped = false;
    item.active = false;
    item.required = false;
    item.preferred = true;
    item.dependency_status = "resolved";
  });

  setDiagnostics(state, [], []);
  setWorkspaceState(state, "bound");
  refreshDerivedFields(state, "preferred", "Profile preference highlights remain visible without escalating to workflow required.");
  return state;
}

function makeInvalidDependencyStory() {
  const state = cloneBaseState();

  mutateAllItems(state, (rowId, item, index) => {
    item.installed = rowId !== "knowledge";
    item.equipped = rowId === "skills" && index === 0;
    item.active = rowId === "skills" && index === 0;
    item.required = rowId === "workflows";
    item.preferred = rowId === "tools";
    item.dependency_status = rowId === "workflows" ? "invalid" : rowId === "knowledge" ? "partial" : "resolved";
  });

  setDiagnostics(state, [], [
    {
      code: "workflow_dependency_invalid",
      message: "Workflow combo card requires a knowledge pack that is not installed in the current preview state.",
      severity: "error",
      location_hint: ".workflow/example_workflow/workflow.yaml"
    }
  ]);
  setWorkspaceState(state, "invalid");
  refreshDerivedFields(state, "invalid_dependency", "Invalid dependency state should outrank active or preferred accents.");
  return state;
}

function makePartialUnknownStory() {
  const state = cloneBaseState();

  state.class_view.rows.skills[0].installed = false;
  state.class_view.rows.skills[0].equipped = false;
  state.class_view.rows.skills[0].active = false;
  state.class_view.rows.skills[0].required = false;
  state.class_view.rows.skills[0].preferred = false;
  state.class_view.rows.skills[0].dependency_status = "unknown";

  state.class_view.rows.tools[0].installed = false;
  state.class_view.rows.tools[0].equipped = false;
  state.class_view.rows.tools[0].active = false;
  state.class_view.rows.tools[0].required = false;
  state.class_view.rows.tools[0].preferred = false;
  state.class_view.rows.tools[0].dependency_status = "partial";

  state.class_view.rows.knowledge = [];
  state.class_view.rows.workflows = [];

  state.body.section_presence[1].present = false;
  state.body.section_presence[1].status = "missing";
  state.body.section_presence[2].status = "partial";

  setDiagnostics(state, [
    {
      code: "partial_preview_state",
      message: "Skin lab preview intentionally combines empty rows, unknown status, and partial body coverage.",
      severity: "warning",
      location_hint: "skin-lab-storybook"
    }
  ], []);
  setWorkspaceState(state, "unbound");
  refreshDerivedFields(state, "partial_unknown", "Partial story keeps none, unknown, and partial states visible in one isolated preview.");
  return state;
}

export const SKIN_LAB_STORIES: SkinLabStory[] = [
  {
    id: "active",
    label: "Active State",
    description: "All installed assets are active, equipped, required, and preferred to stress the strongest path.",
    coverage: ["active", "equipped", "required", "preferred"],
    uiState: makeActiveStory()
  },
  {
    id: "installed_only",
    label: "Installed Only",
    description: "Installed assets remain available without being elevated to active or preferred state.",
    coverage: ["installed only"],
    uiState: makeInstalledOnlyStory()
  },
  {
    id: "required",
    label: "Required",
    description: "Workflow-required highlighting stays visually ahead of normal installed inventory.",
    coverage: ["required"],
    uiState: makeRequiredStory()
  },
  {
    id: "preferred",
    label: "Preferred",
    description: "Profile preference should be visible but still weaker than workflow required.",
    coverage: ["preferred"],
    uiState: makePreferredStory()
  },
  {
    id: "invalid_dependency",
    label: "Invalid Dependency",
    description: "Broken workflow dependency and workspace invalid state surface the error material path.",
    coverage: ["invalid dependency", "error"],
    uiState: makeInvalidDependencyStory()
  },
  {
    id: "partial_unknown",
    label: "None / Unknown / Partial",
    description: "Combines empty rows, unknown dependency, and partial body coverage for placeholder-state review.",
    coverage: ["none", "unknown", "partial"],
    uiState: makePartialUnknownStory()
  }
];

export function selectStory(storyId: string | null | undefined) {
  return SKIN_LAB_STORIES.find((story) => story.id === storyId) ?? SKIN_LAB_STORIES[0];
}
