import { DEFAULT_UI_HINTS, EMPTY_CATALOGS, PRECEDENCE_LEGEND } from "./constants";
import type {
  BodyState,
  CatalogItem,
  CatalogsState,
  ClassViewState,
  DiagnosticsState,
  IdentityRef,
  LegacyDerivedState,
  LegacyFinding,
  LegacyModuleRecord,
  LegacyWorkspaceProject,
  ProfileRef,
  RowId,
  RowItem,
  StatusTone,
  UiState,
  WorkspaceProject,
  WorkspacesState
} from "@soulforge/ui-contract";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function humanizeId(value: string | null | undefined): string {
  if (!value) {
    return "Unknown";
  }

  const segment = value.split(".").at(-1) ?? value;
  return segment
    .split(/[_-]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function statusFromLegacyResult(result: string | null): StatusTone {
  if (result === "FAIL") {
    return "error";
  }
  if (result === "WARN") {
    return "warning";
  }
  return "ready";
}

function bindingStatus(total: number, bound: number, unbound: number, invalid: number): StatusTone {
  if (invalid > 0) {
    return "error";
  }
  if (bound === total && total > 0) {
    return "bound";
  }
  if (unbound === total && total > 0) {
    return "unbound";
  }
  if (bound > 0 && unbound > 0) {
    return "mixed";
  }
  return "partial";
}

function legacyRequires(record: LegacyModuleRecord | undefined) {
  const requires = asRecord(record?.requires);
  return {
    skills: asArray<string>(requires?.skills),
    tools: asArray<string>(requires?.tools),
    knowledge: asArray<string>(requires?.knowledge)
  };
}

function catalogRefFor(category: string | null, family: string | null): string | null {
  if (category === "skill") {
    return ".agent_class/example_class/skill_refs.yaml";
  }
  if (category === "knowledge") {
    return ".agent_class/example_class/knowledge_refs.yaml";
  }
  if (category === "workflow") {
    return ".workflow/example_workflow/workflow.yaml";
  }
  if (category === "tool" && family) {
    return ".agent_class/example_class/tool_refs.yaml";
  }
  return null;
}

function buildLegacyDiagnosticItems(findings: LegacyFinding[], severity: "warning" | "error") {
  return findings.map((finding) => ({
    code: asString(finding.code) ?? `${severity}_unknown`,
    message: asString(finding.message) ?? "Unknown diagnostic",
    severity,
    location_hint: null
  }));
}

function buildDiagnosticsState(raw: LegacyDerivedState): DiagnosticsState {
  const warnings = buildLegacyDiagnosticItems(asArray<LegacyFinding>(raw.diagnostics?.warnings), "warning");
  const errors = buildLegacyDiagnosticItems(asArray<LegacyFinding>(raw.diagnostics?.errors), "error");

  return {
    summary: {
      warnings: warnings.length,
      errors: errors.length,
      highest_severity: errors.length ? "error" : warnings.length ? "warning" : "ok"
    },
    warnings,
    errors
  };
}

function buildActiveProfileRef(activeProfileId: string | null): ProfileRef | null {
  if (!activeProfileId) {
    return null;
  }

  return {
    id: activeProfileId,
    display_name: humanizeId(activeProfileId),
    summary: "Derived from legacy active_profile only. Preferred semantics are heuristic until the producer emits full profile projection.",
    source_ref: null,
    active: true
  };
}

function buildClassRows(raw: LegacyDerivedState, activeProfileId: string | null): ClassViewState["rows"] {
  const legacyClass = asRecord(raw.class) ?? {};
  const installed = asRecord(legacyClass.installed) ?? {};
  const equipped = asRecord(legacyClass.equipped) ?? {};
  const workflowCards = asArray<LegacyModuleRecord>(legacyClass.workflow_cards);

  const equippedIds = new Map<RowId, Set<string>>([
    ["skills", new Set(asArray<LegacyModuleRecord>(equipped.skills).map((item) => asString(item.id)).filter(Boolean) as string[])],
    ["tools", new Set(asArray<LegacyModuleRecord>(equipped.tools).map((item) => asString(item.id)).filter(Boolean) as string[])],
    ["knowledge", new Set(asArray<LegacyModuleRecord>(equipped.knowledge).map((item) => asString(item.id)).filter(Boolean) as string[])],
    ["workflows", new Set(asArray<LegacyModuleRecord>(equipped.workflows).map((item) => asString(item.id)).filter(Boolean) as string[])]
  ]);

  const requiredIds = {
    skills: new Set<string>(),
    tools: new Set<string>(),
    knowledge: new Set<string>()
  };

  const workflowCardMap = new Map<string, LegacyModuleRecord>();
  for (const workflowCard of workflowCards) {
    const workflowId = asString(workflowCard.id);
    if (!workflowId) {
      continue;
    }
    workflowCardMap.set(workflowId, workflowCard);
    if (equippedIds.get("workflows")?.has(workflowId)) {
      const requires = legacyRequires(workflowCard);
      requires.skills.forEach((item) => requiredIds.skills.add(item));
      requires.tools.forEach((item) => requiredIds.tools.add(item));
      requires.knowledge.forEach((item) => requiredIds.knowledge.add(item));
    }
  }

  function mapItems(rowId: RowId, category: string): RowItem[] {
    return asArray<LegacyModuleRecord>(installed[rowId]).map((item) => {
      const itemId = asString(item.id) ?? `${rowId}.unknown`;
      const family = asString(item.family);
      const workflowCard = category === "workflow" ? workflowCardMap.get(itemId) : undefined;
      const isEquipped = equippedIds.get(rowId)?.has(itemId) ?? false;
      const required =
        rowId === "skills"
          ? requiredIds.skills.has(itemId)
          : rowId === "tools"
            ? requiredIds.tools.has(itemId)
            : rowId === "knowledge"
              ? requiredIds.knowledge.has(itemId)
              : isEquipped;

      return {
        id: itemId,
        display_name: asString(item.name) ?? humanizeId(itemId),
        summary: asString(item.description) ?? "Legacy derive payload did not include a summary.",
        installed: true,
        equipped: isEquipped,
        active: isEquipped,
        required,
        preferred: activeProfileId ? isEquipped || required : null,
        dependency_status: category === "workflow" ? (asString(workflowCard?.dependency_status) as RowItem["dependency_status"]) ?? "unknown" : required ? "resolved" : null,
        family,
        category,
        source_ref: asString(item.manifest_path),
        source_hint: asString(item.manifest_path) ? "legacy derive installed asset" : "legacy derive payload",
        catalog_ref: catalogRefFor(category, family),
        selectable_candidate: true
      };
    });
  }

  return {
    skills: mapItems("skills", "skill"),
    tools: mapItems("tools", "tool"),
    knowledge: mapItems("knowledge", "knowledge"),
    workflows: mapItems("workflows", "workflow")
  };
}

function buildCatalogItems(items: RowItem[]): CatalogItem[] {
  return items.map((item) => ({
    id: item.id,
    display_name: item.display_name,
    summary: item.summary,
    source_ref: item.catalog_ref,
    active: item.active ?? false,
    candidate: true
  }));
}

function buildCatalogs(classView: ClassViewState, activeProfile: ProfileRef | null): CatalogsState {
  return {
    identity: EMPTY_CATALOGS.identity,
    class: {
      status: "partial",
      profiles_catalog: activeProfile
        ? [
            {
              id: activeProfile.id,
              display_name: activeProfile.display_name,
              summary: activeProfile.summary,
              source_ref: null,
              active: true,
              candidate: true
            }
          ]
        : [],
      skills_catalog: buildCatalogItems(classView.rows.skills),
      tools_catalog: buildCatalogItems(classView.rows.tools),
      knowledge_catalog: buildCatalogItems(classView.rows.knowledge),
      workflows_catalog: buildCatalogItems(classView.rows.workflows)
    }
  };
}

function buildBodyState(raw: LegacyDerivedState, classId: string | null, activeProfileId: string | null, workspaces: WorkspacesState): BodyState {
  const legacyBody = asRecord(raw.body) ?? {};
  const sections = asArray<Record<string, unknown>>(legacyBody.sections).map((section) => {
    const id = asString(section.id) ?? "section";
    const present = asBoolean(section.present) ?? false;
    return {
      id,
      path: asString(section.path) ?? `.agent/${id}`,
      present,
      status: (present ? "present" : "missing") as StatusTone
    };
  });

  return {
    meta: {
      body_id: asString(legacyBody.id),
      display_name: asString(legacyBody.name),
      operating_context: null,
      status: sections.every((section) => section.present) ? "ready" : "partial"
    },
    active_species: null,
    active_hero: null,
    section_presence: sections,
    section_summaries: sections.map((section) => ({
      section_id: section.id,
      title: humanizeId(section.id),
      summary: section.present
        ? `${humanizeId(section.id)} section is present in the legacy derive payload.`
        : `${humanizeId(section.id)} section is missing from the legacy derive payload.`,
      status: section.present ? "ready" : "missing",
      present: section.present
    })),
    current_bindings: {
      class_binding: {
        status: classId ? "bound" : "unbound",
        class_id: classId,
        active_profile: activeProfileId
      },
      workspace_binding: {
        status: workspaces.summary.binding_status,
        active_workspace: workspaces.summary.active_workspace ?? null,
        candidate_count: 2
      },
      precedence: [...PRECEDENCE_LEGEND]
    }
  };
}

function mapLegacyProject(project: LegacyWorkspaceProject): WorkspaceProject {
  const projectPath = asString(project.project_path) ?? "_workspaces/unknown";
  const projectCode = projectPath.split("/").filter(Boolean).at(-1) ?? "workspace";

  return {
    project_code: projectCode,
    project_id: project.contract?.project_id ?? null,
    project_name: project.contract?.project_name ?? humanizeId(project.project_path ?? "workspace"),
    project_root_ref: projectPath,
    project_path: projectPath,
    workspace_kind: project.workspace_kind === "personal" ? "personal" : "company",
    state: project.state === "invalid" ? "invalid" : project.state === "unbound" ? "unbound" : "bound",
    project_agent_present: asBoolean(project.project_agent_present) ?? false,
    default_loadout: project.contract?.default_loadout ?? null,
    binding_status: project.state === "invalid" ? "error" : project.state === "unbound" ? "unbound" : "bound",
    capsule_binding_count: Number(project.capsule_binding_count ?? 0),
    workflow_binding_count: Number(project.workflow_binding_count ?? 0),
    local_state_entry_count: Number(project.local_state_entry_count ?? 0)
  };
}

function buildWorkspacesState(raw: LegacyDerivedState): WorkspacesState {
  const summary = asRecord(raw.workspaces?.summary) ?? {};
  const total = Number(summary.total ?? 0);
  const bound = Number(summary.bound ?? 0);
  const unbound = Number(summary.unbound ?? 0);
  const invalid = Number(summary.invalid ?? 0);
  const companyProjects = asArray<LegacyWorkspaceProject>(raw.workspaces?.company?.projects).map(mapLegacyProject);
  const personalProjects = asArray<LegacyWorkspaceProject>(raw.workspaces?.personal?.projects).map(mapLegacyProject);

  return {
    root: "_workspaces",
    owner: "_workspaces",
    mode: "local_only_mount",
    mount_status: "legacy_compat_projection",
    local_scan_enabled: false,
    projects: [...companyProjects, ...personalProjects],
    notes: [
      "Legacy workspace payload normalized for renderer compatibility.",
      "Company and personal grouping is legacy-only and not part of the vNext canon."
    ],
    summary: {
      total,
      bound,
      unbound,
      invalid,
      binding_status: bindingStatus(total, bound, unbound, invalid),
      active_workspace: null
    },
    grouped_projects: {
      company: companyProjects,
      personal: personalProjects
    }
  };
}

export function adaptLegacyDerivedState(raw: LegacyDerivedState): UiState {
  const diagnostics = buildDiagnosticsState(raw);
  const classId = asString(raw.overview?.class_id) ?? asString(raw.class?.id);
  const activeProfileId = asString(raw.overview?.active_profile) ?? asString(raw.class?.active_profile);
  const classRows = buildClassRows(raw, activeProfileId);
  const activeProfile = buildActiveProfileRef(activeProfileId);
  const classView: ClassViewState = {
    class_id: classId,
    class_name: classId ? humanizeId(classId) : null,
    class_version: null,
    active_profile: activeProfile,
    rows: classRows
  };
  const workspaces = buildWorkspacesState(raw);
  const body = buildBodyState(raw, classId, activeProfileId, workspaces);
  const bodySections = body.section_presence.length;
  const legacyOverview = asRecord(raw.overview) ?? {};
  const counts = asRecord(legacyOverview.counts) ?? {};
  const installedCounts = asRecord(counts.installed) ?? {};
  const equippedCounts = asRecord(counts.equipped) ?? {};
  const projects = asRecord(counts.projects) ?? {};

  return {
    schema_version: "ui-state.v1",
    generated_at: new Date().toISOString(),
    source: {
      producer: "derive-ui-state",
      mode: "integration",
      adapter: "legacy-derived-state-to-v1",
      fixture_name: null,
      notes: [
        "Legacy derive payload normalized by renderer-core.",
        "Active species, active hero, and full catalog projections remain unavailable until the producer emits them directly.",
        "Preferred flags are heuristic when only active_profile and equipped state are present."
      ]
    },
    overview: {
      body_id: asString(legacyOverview.body_id) ?? body.meta.body_id,
      class_id: classId,
      active_profile: activeProfileId,
      active_species: null,
      active_hero: null,
      sections_present: {
        present: Number(counts.body_sections_present ?? bodySections),
        total: bodySections
      },
      installed_counts: {
        skills: Number(installedCounts.skills ?? classRows.skills.length),
        tools: Number(installedCounts.tools ?? classRows.tools.length),
        knowledge: Number(installedCounts.knowledge ?? classRows.knowledge.length),
        workflows: Number(installedCounts.workflows ?? classRows.workflows.length)
      },
      equipped_counts: {
        skills: Number(equippedCounts.skills ?? classRows.skills.filter((item) => item.equipped).length),
        tools: Number(equippedCounts.tools ?? classRows.tools.filter((item) => item.equipped).length),
        knowledge: Number(equippedCounts.knowledge ?? classRows.knowledge.filter((item) => item.equipped).length),
        workflows: Number(equippedCounts.workflows ?? classRows.workflows.filter((item) => item.equipped).length)
      },
      workspace_counts: {
        total: Number(projects.total ?? workspaces.summary.total),
        bound: Number(projects.bound ?? workspaces.summary.bound),
        unbound: Number(projects.unbound ?? workspaces.summary.unbound),
        invalid: Number(projects.invalid ?? workspaces.summary.invalid)
      },
      warnings: diagnostics.summary.warnings,
      errors: diagnostics.summary.errors,
      overall_status: statusFromLegacyResult(asString(asRecord(legacyOverview.status)?.result)),
      status_note: "Legacy derive payload normalized into renderer v1."
    },
    body,
    class_view: classView,
    workspaces,
    diagnostics,
    catalogs: buildCatalogs(classView, activeProfile),
    ui_hints: DEFAULT_UI_HINTS
  };
}
