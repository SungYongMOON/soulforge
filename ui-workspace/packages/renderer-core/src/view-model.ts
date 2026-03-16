import { ROW_ORDER, ROW_PRESENTATIONS } from "./constants";
import type {
  CatalogItem,
  ClassViewState,
  DiagnosticsState,
  OverviewMetric,
  RenderableEntity,
  RowId,
  RowPresentation,
  UiState,
  WorkspaceProject
} from "@soulforge/ui-contract";

function workspaceProjects(state: UiState): WorkspaceProject[] {
  if (Array.isArray(state.workspaces.projects) && state.workspaces.projects.length > 0) {
    return state.workspaces.projects;
  }

  const grouped = state.workspaces.grouped_projects;
  if (!grouped) {
    return [];
  }

  return [...(grouped.company ?? []), ...(grouped.personal ?? [])];
}

function workspaceTone(project: WorkspaceProject) {
  if (project.binding_status) {
    return project.binding_status;
  }

  if (project.state === "invalid") {
    return "error";
  }
  if (project.state === "unbound" || project.state === "local_detected") {
    return "warning";
  }
  return "bound";
}

function normalizedWorkspaceProject(project: WorkspaceProject): WorkspaceProject {
  return {
    ...project,
    project_name:
      project.project_name ??
      project.project_code ??
      project.project_id ??
      project.project_root_ref ??
      project.project_path ??
      "Workspace",
    project_path: project.project_path ?? project.project_root_ref ?? "_workspaces/unknown",
    binding_status: workspaceTone(project),
    capsule_binding_count: Number(project.capsule_binding_count ?? 0),
    workflow_binding_count: Number(project.workflow_binding_count ?? 0),
    local_state_entry_count: Number(project.local_state_entry_count ?? 0)
  };
}

export function buildOverviewMetrics(state: UiState): OverviewMetric[] {
  return [
    {
      id: "sections",
      label: "Sections",
      value: `${state.overview.sections_present.present}/${state.overview.sections_present.total}`,
      tone: state.overview.sections_present.present === state.overview.sections_present.total ? "ready" : "partial"
    },
    {
      id: "installed",
      label: "Installed",
      value: `${state.overview.installed_counts.skills + state.overview.installed_counts.tools + state.overview.installed_counts.knowledge + state.overview.installed_counts.workflows}`,
      tone: "ready"
    },
    {
      id: "equipped",
      label: "Equipped",
      value: `${state.overview.equipped_counts.skills + state.overview.equipped_counts.tools + state.overview.equipped_counts.knowledge + state.overview.equipped_counts.workflows}`,
      tone: "bound"
    },
    {
      id: "projects",
      label: "Projects",
      value: `${state.overview.workspace_counts.bound}/${state.overview.workspace_counts.total} bound`,
      tone: state.overview.workspace_counts.invalid > 0 ? "error" : state.overview.workspace_counts.unbound > 0 ? "warning" : "ready"
    }
  ];
}

export function buildRowGroups(classView: ClassViewState): Array<RowPresentation & { items: ClassViewState["rows"][RowId] }> {
  return ROW_ORDER.map((rowId) => ({
    ...ROW_PRESENTATIONS[rowId],
    items: classView.rows[rowId] ?? []
  }));
}

export function buildCatalogSections(state: UiState) {
  return [
    {
      id: "species",
      label: "Species Catalog",
      items: state.catalogs.identity.species_candidates
    },
    {
      id: "heroes",
      label: "Hero Catalog",
      items: state.catalogs.identity.hero_candidates
    },
    {
      id: "profiles",
      label: "Profile Catalog",
      items: state.catalogs.class.profiles_catalog
    },
    {
      id: "skills",
      label: "Skills Catalog",
      items: state.catalogs.class.skills_catalog
    },
    {
      id: "tools",
      label: "Tools Catalog",
      items: state.catalogs.class.tools_catalog
    },
    {
      id: "knowledge",
      label: "Knowledge Catalog",
      items: state.catalogs.class.knowledge_catalog
    },
    {
      id: "workflows",
      label: "Workflow Catalog",
      items: state.catalogs.class.workflows_catalog
    }
  ];
}

export function buildWorkspaceGroups(state: UiState): Array<{ id: string; label: string; projects: WorkspaceProject[] }> {
  const projects = workspaceProjects(state).map(normalizedWorkspaceProject);
  if (projects.length === 0) {
    return [
      {
        id: "local_projects",
        label: "Local Projects",
        projects: []
      }
    ];
  }

  const groupedByKind = new Map<string, WorkspaceProject[]>();
  for (const project of projects) {
    const groupId = project.workspace_kind ?? "local_projects";
    const current = groupedByKind.get(groupId) ?? [];
    current.push(project);
    groupedByKind.set(groupId, current);
  }

  return [...groupedByKind.entries()].map(([groupId, groupProjects]) => ({
    id: groupId,
    label: groupId === "local_projects" ? "Local Projects" : groupId,
    projects: groupProjects
  }));
}

export function buildDiagnosticsTone(diagnostics: DiagnosticsState) {
  if (diagnostics.summary.errors > 0) {
    return "error";
  }
  if (diagnostics.summary.warnings > 0) {
    return "warning";
  }
  return "ready";
}

function rowEntity(key: string, item: UiState["class_view"]["rows"][RowId][number]): RenderableEntity {
  return {
    key,
    title: item.display_name,
    summary: item.summary,
    badges: [
      item.installed ? "Installed" : "Unavailable",
      item.equipped ? "Equipped" : "Idle",
      item.required ? "Required" : item.preferred ? "Preferred" : "Optional"
    ],
    sourceRef: item.source_ref
  };
}

function catalogEntity(key: string, item: CatalogItem): RenderableEntity {
  return {
    key,
    title: item.display_name,
    summary: item.summary,
    badges: [item.active ? "Active" : "Candidate"],
    sourceRef: item.source_ref
  };
}

export function findRenderableEntity(state: UiState, key: string | null): RenderableEntity | null {
  if (!key) {
    return null;
  }

  if (key.startsWith("row:")) {
    const [, rowId, itemId] = key.split(":");
    const row = state.class_view.rows[rowId as RowId] ?? [];
    const item = row.find((candidate) => candidate.id === itemId);
    return item ? rowEntity(key, item) : null;
  }

  if (key.startsWith("catalog:")) {
    const [, sectionId, itemId] = key.split(":");
    for (const section of buildCatalogSections(state)) {
      if (section.id !== sectionId) {
        continue;
      }
      const item = section.items.find((candidate) => candidate.id === itemId);
      return item ? catalogEntity(key, item) : null;
    }
  }

  return null;
}

export function rowKey(rowId: RowId, itemId: string) {
  return `row:${rowId}:${itemId}`;
}

export function catalogKey(sectionId: string, itemId: string) {
  return `catalog:${sectionId}:${itemId}`;
}
