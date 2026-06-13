import { existsSync, promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin, PreviewServer, ViteDevServer } from "vite";

const API_PREFIX = "/__control_center_api";
const TEXT_EXTENSIONS = new Set([".md", ".yaml", ".yml", ".json"]);
const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");
const integratedFixtureRepoPath = "ui-workspace/fixtures/ui-state/integrated.sample.json";
const snapshotRepoPath = "guild_hall/state/snapshot/soulforge_snapshot.json";
const assistantDashboardRepoPath = "guild_hall/state/assistant_dashboard/latest.json";
const KNOWLEDGE_LANE_OWNER_GATED_STATES = new Set<KnowledgeLaneOwnerGatedState>([
  "blocked_missing_surface",
  "awaiting_metadata_evidence",
  "owner_review_required"
]);
const KNOWLEDGE_LANE_CLAIM_CEILING: KnowledgeLaneClaimCeiling = "observed";
const KNOWLEDGE_LANE_NUMERIC_EVIDENCE_COUNT_KEYS = [
  "project_knowledge_access_surface_count",
  "project_procedure_capture_surface_count",
  "project_ontology_surface_count",
  "system_knowledge_access_entry_count",
  "system_procedure_capture_entry_count"
] as const satisfies readonly KnowledgeLaneNumericEvidenceCountKey[];
const KNOWLEDGE_LANE_BOOLEAN_EVIDENCE_COUNT_KEYS = [
  "local_activity_surface_present",
  "private_activity_mirror_present"
] as const satisfies readonly KnowledgeLaneBooleanEvidenceCountKey[];

type ControlCenterOwnerId = "body" | "class" | "guild_hall" | "operations" | "docs";

interface ControlCenterFileRecord {
  path: string;
  label: string;
  ownerId: ControlCenterOwnerId;
  sectionId: string;
  sectionLabel: string;
  sectionDescription: string;
  editable: boolean;
  category: "canonical" | "generated" | "doc" | "archive";
  size: number;
  updatedAt: string;
}

interface ControlCenterSection {
  id: string;
  label: string;
  description: string;
  files: ControlCenterFileRecord[];
}

interface ControlCenterOwner {
  id: ControlCenterOwnerId;
  label: string;
  description: string;
  sections: ControlCenterSection[];
}

type SnapshotStatus = "fresh" | "stale" | "missing" | "unavailable";
type AssistantDashboardStatus = "ok" | "degraded" | "missing" | "unavailable";
type KnowledgeLaneOwnerGatedState = "blocked_missing_surface" | "awaiting_metadata_evidence" | "owner_review_required";
type KnowledgeLaneClaimCeiling = "observed";
type KnowledgeLaneNumericEvidenceCountKey =
  | "project_knowledge_access_surface_count"
  | "project_procedure_capture_surface_count"
  | "project_ontology_surface_count"
  | "system_knowledge_access_entry_count"
  | "system_procedure_capture_entry_count";
type KnowledgeLaneBooleanEvidenceCountKey = "local_activity_surface_present" | "private_activity_mirror_present";
type KnowledgeLaneEvidenceCounts = Record<KnowledgeLaneNumericEvidenceCountKey, number> & Record<KnowledgeLaneBooleanEvidenceCountKey, boolean>;

interface DungeonMapProject {
  project_code: string;
  workspace_present: boolean;
  workmeta_present: boolean;
  contract_present?: boolean;
  bindings_count?: number;
  report_surface_count?: number;
  mission_count?: number;
  blocked_mission_count?: number;
  pending_monster_count?: number;
  surface_status?: string;
}

interface DungeonMapMission {
  mission_id?: string;
  title: string;
  project_code?: string;
  status: string;
  readiness: string;
  workflow_id_present?: boolean;
  party_id?: string;
  display_group?: string;
  display_group_label?: string;
  display_group_rank?: number;
}

interface DungeonMapNextAction {
  id: string;
  status: string;
  summary: string;
  rank?: number;
}

interface DungeonMapPendingMonster {
  monster_id: string;
  inbox_id: string;
  monster_family: string;
  monster_name: string | null;
  work_pattern: string | null;
  objective_summary: string | null;
  due_state: string;
  d_day: string | null;
  known_status: string;
  assignment_status: string;
  assigned_project_code: string | null;
  assigned_stage: string | null;
  project_hint_count: number;
  stage_hint_count: number;
  mail_touch_count: number | null;
  last_mail_role: string | null;
  mission_ref_present: boolean;
  display_group: string;
  display_group_label: string;
  display_group_rank: number;
}

interface DungeonMapPendingMonsterGroup {
  id: string;
  label: string;
  rank: number;
  total: number;
  items: DungeonMapPendingMonster[];
}

interface DungeonMapKnowledgeLaneBlocker {
  id: string;
  severity: string;
  summary: string;
}

interface DungeonMapKnowledgeLane {
  label: string;
  owner_gated_state: KnowledgeLaneOwnerGatedState;
  claim_ceiling: KnowledgeLaneClaimCeiling;
  helper_present: boolean;
  notebooklm_bridge_present: boolean;
  workflow_present_count: number;
  fixture_present: boolean;
  evidence_present: boolean;
  evidence_surface_count: number;
  evidence_counts: KnowledgeLaneEvidenceCounts;
  blockers: DungeonMapKnowledgeLaneBlocker[];
  next_owner_review_action: string | null;
}

interface DungeonMapOperationBoard {
  schema_version: string;
  summary: Record<string, unknown>;
  sections: {
    dungeon_map: {
      label: string;
      items: DungeonMapProject[];
    };
    mission_board: {
      label: string;
      counts_by_status: Record<string, unknown>;
      counts_by_display_group: Record<string, unknown>;
      items: DungeonMapMission[];
    };
    monster_gate: {
      label: string;
      count: number;
      display_limit: number;
      truncated: boolean;
      groups: DungeonMapPendingMonsterGroup[];
    };
    knowledge_lane: DungeonMapKnowledgeLane | null;
    action_queue: {
      label: string;
      items: DungeonMapNextAction[];
    };
  };
}

interface SnapshotFreshnessResult {
  ok: boolean;
  status: SnapshotStatus;
  errors: string[];
  changed_sources: { id?: string; source_ref?: string }[];
  stored_fingerprint: string | null;
  current_fingerprint: string | null;
}

interface SnapshotProducerModule {
  buildSnapshot(options?: { repoRoot?: string; generatedAt?: string }): Promise<Record<string, unknown>>;
  compareSnapshotFreshness(storedSnapshot: Record<string, unknown>, currentSnapshot: Record<string, unknown>): SnapshotFreshnessResult;
}

interface AssistantDashboardValidationResult {
  ok: boolean;
  errors: string[];
}

interface AssistantDashboardModule {
  validateAssistantDashboard(dashboard: unknown): AssistantDashboardValidationResult;
}

function normalizeRepoPath(value: string) {
  return value.split(path.sep).join("/");
}

function resolveRepoPath(repoPath: string) {
  return path.resolve(repoRoot, repoPath);
}

function resolveWorkmetaProjectPath(projectCode: string) {
  return normalizeRepoPath(path.join("_workmeta", projectCode));
}

function isTextFile(repoPath: string) {
  return TEXT_EXTENSIONS.has(path.extname(repoPath));
}

function isEditableFile(repoPath: string) {
  return isTextFile(repoPath);
}

function fileCategoryFor(repoPath: string): ControlCenterFileRecord["category"] {
  if (repoPath.startsWith("docs/") || repoPath === "README.md" || repoPath === "AGENTS.md") {
    return "doc";
  }

  return "canonical";
}

function isLegacyWorkspaceBridgeDir(name: string) {
  return name === "company" || name === "personal";
}

async function statFile(repoPath: string) {
  const absolutePath = resolveRepoPath(repoPath);
  const stats = await fs.stat(absolutePath);

  return {
    size: stats.size,
    updatedAt: stats.mtime.toISOString()
  };
}

async function buildFileRecord(
  ownerId: ControlCenterOwnerId,
  sectionId: string,
  sectionLabel: string,
  sectionDescription: string,
  repoPath: string
) {
  const fileStats = await statFile(repoPath);

  return {
    path: repoPath,
    label: path.basename(repoPath),
    ownerId,
    sectionId,
    sectionLabel,
    sectionDescription,
    editable: isEditableFile(repoPath),
    category: fileCategoryFor(repoPath),
    size: fileStats.size,
    updatedAt: fileStats.updatedAt
  } satisfies ControlCenterFileRecord;
}

async function walkFiles(relativeDir: string, predicate: (repoPath: string) => boolean): Promise<string[]> {
  const absoluteDir = resolveRepoPath(relativeDir);

  if (!existsSync(absoluteDir)) {
    return [];
  }

  const entries = await fs.readdir(absoluteDir, { withFileTypes: true });
  const results: string[] = [];

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const entryRepoPath = normalizeRepoPath(path.join(relativeDir, entry.name));

    if (entry.isDirectory()) {
      results.push(...(await walkFiles(entryRepoPath, predicate)));
      continue;
    }

    if (predicate(entryRepoPath)) {
      results.push(entryRepoPath);
    }
  }

  return results;
}

async function existingFiles(repoPaths: string[]) {
  const results: string[] = [];

  for (const repoPath of repoPaths) {
    if (existsSync(resolveRepoPath(repoPath))) {
      results.push(repoPath);
    }
  }

  return results;
}

async function buildSection(
  ownerId: ControlCenterOwnerId,
  sectionId: string,
  sectionLabel: string,
  sectionDescription: string,
  repoPaths: string[]
) {
  const files = await Promise.all(repoPaths.map((repoPath) => buildFileRecord(ownerId, sectionId, sectionLabel, sectionDescription, repoPath)));

  return {
    id: sectionId,
    label: sectionLabel,
    description: sectionDescription,
    files
  } satisfies ControlCenterSection;
}

async function buildBodyOwner(): Promise<ControlCenterOwner> {
  const sections: ControlCenterSection[] = [];

  sections.push(
    await buildSection(
      "body",
      "identity-core",
      "Registry Root",
      "Outer canon/store root and species catalog entrypoint.",
      await existingFiles([".registry/README.md", ".registry/index.yaml"])
    )
  );

  sections.push(
    await buildSection(
      "body",
      "species-catalog",
      "Species Catalog",
      "Species canon entries with inline hero candidates.",
      await walkFiles(".registry/species", (repoPath) => isTextFile(repoPath))
    )
  );

  sections.push(
    await buildSection(
      "body",
      "unit-core",
      "Unit Owner",
      "Active unit owner root and unit-owned surfaces.",
      [
        ...(await existingFiles([".unit/README.md"])),
        ...(await walkFiles(".unit", (repoPath) => isTextFile(repoPath)))
      ]
    )
  );

  return {
    id: "body",
    label: "Registry / Unit",
    description: "Species canon and active unit owner files.",
    sections: sections.filter((section) => section.files.length > 0)
  };
}

async function buildClassOwner(): Promise<ControlCenterOwner> {
  const sections: ControlCenterSection[] = [];

  sections.push(
    await buildSection(
      "class",
      "class-core",
      "Class Catalog",
      "Primary class catalog metadata and root guide.",
      await existingFiles([".registry/classes/README.md"])
    )
  );

  sections.push(
    await buildSection(
      "class",
      "class-packages",
      "Class Packages",
      "Reusable class package definitions.",
      await walkFiles(".registry/classes", (repoPath) => isTextFile(repoPath))
    )
  );

  sections.push(
    await buildSection(
      "class",
      "workflow-canon",
      "Workflow Canon",
      "Workflow canon files and curated history.",
      [
        ...(await existingFiles([".workflow/README.md", ".workflow/index.yaml"])),
        ...(await walkFiles(".workflow", (repoPath) => isTextFile(repoPath)))
      ]
    )
  );

  sections.push(
    await buildSection(
      "class",
      "party-templates",
      "Party Templates",
      "Reusable party templates and stats notes.",
      [
        ...(await existingFiles([".party/README.md", ".party/index.yaml"])),
        ...(await walkFiles(".party", (repoPath) => isTextFile(repoPath)))
      ]
    )
  );

  return {
    id: "class",
    label: "Catalogs",
    description: "Class, workflow, and party canon files.",
    sections: sections.filter((section) => section.files.length > 0)
  };
}

async function buildOperationsOwner(): Promise<ControlCenterOwner> {
  const sections: ControlCenterSection[] = [];

  sections.push(
    await buildSection(
      "operations",
      "mission-core",
      "Mission Plans",
      "Held mission plans and readiness owner surfaces.",
      [
        ...(await existingFiles([".mission/README.md", ".mission/index.yaml"])),
        ...(await walkFiles(
          ".mission",
          (repoPath) => isTextFile(repoPath) && repoPath !== ".mission/README.md" && repoPath !== ".mission/index.yaml"
        ))
      ]
    )
  );

  sections.push(
    await buildSection(
      "operations",
      "workspace-core",
      "Workspace Guides",
      "Workspace root guide and local-only mount policy.",
      await existingFiles(["_workspaces/README.md"])
    )
  );

  const workspaceRoot = resolveRepoPath("_workspaces");
  if (existsSync(workspaceRoot)) {
    const projectEntries = await fs.readdir(workspaceRoot, { withFileTypes: true });

    for (const projectEntry of projectEntries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (!projectEntry.isDirectory() || projectEntry.name.startsWith(".") || isLegacyWorkspaceBridgeDir(projectEntry.name)) {
        continue;
      }

      const projectDir = `_workspaces/${projectEntry.name}`;
      const projectFiles = [
        ...(await existingFiles([`${projectDir}/README.md`])),
        ...(await walkFiles(resolveWorkmetaProjectPath(projectEntry.name), (repoPath) => isTextFile(repoPath)))
      ];

      if (projectFiles.length === 0) {
        continue;
      }

      sections.push(
        await buildSection(
          "operations",
          `workspace-${projectEntry.name}`,
          projectEntry.name,
          "Direct local-only project mount surface.",
          projectFiles
        )
      );
    }
  }

  return {
    id: "operations",
    label: "Operations",
    description: "Mission plans and workspace boundary files.",
    sections: sections.filter((section) => section.files.length > 0)
  };
}

async function buildGuildHallOwner(): Promise<ControlCenterOwner> {
  const sections: ControlCenterSection[] = [];

  sections.push(
    await buildSection(
      "guild_hall",
      "guild-hall-core",
      "Guild Hall",
      "Cross-project operating root and owner guide.",
      await existingFiles(["guild_hall/README.md"])
    )
  );

  for (const [sectionId, sectionLabel, relativeDir, description] of [
    ["guild-hall-gateway", "Gateway", "guild_hall/gateway", "Ingress source and staging owner."],
    ["guild-hall-town-crier", "Town Crier", "guild_hall/town_crier", "Notify queue and outbound transport owner."],
    ["guild-hall-night-watch", "Night Watch", "guild_hall/night_watch", "Nightly review owner."],
    ["guild-hall-dungeon-assignment", "Dungeon Assignment", "guild_hall/dungeon_assignment", "Cross-project assignment owner."],
  ] as const) {
    const files = await walkFiles(relativeDir, (repoPath) => isTextFile(repoPath));
    if (files.length === 0) {
      continue;
    }

    sections.push(await buildSection("guild_hall", sectionId, sectionLabel, description, files));
  }

  const stateFiles = await walkFiles("guild_hall/state", (repoPath) => isTextFile(repoPath));
  if (stateFiles.length > 0) {
    sections.push(
      await buildSection(
        "guild_hall",
        "guild-hall-state",
        "State",
        "Local-only guild hall state mounts discovered on this machine.",
        stateFiles
      )
    );
  }

  return {
    id: "guild_hall",
    label: "Guild Hall",
    description: "Cross-project operating root and local state files.",
    sections: sections.filter((section) => section.files.length > 0)
  };
}

async function buildDocsOwner(): Promise<ControlCenterOwner> {
  const sections: ControlCenterSection[] = [];

  sections.push(
    await buildSection(
      "docs",
      "docs-repo",
      "Repository Guides",
      "Top-level repository manuals and instructions.",
      await existingFiles(["AGENTS.md", "README.md", "docs/README.md"])
    )
  );

  sections.push(
    await buildSection(
      "docs",
      "docs-foundation",
      "Architecture / Foundation",
      "Active repository foundation docs.",
      await walkFiles("docs/architecture/foundation", (repoPath) => isTextFile(repoPath))
    )
  );

  sections.push(
    await buildSection(
      "docs",
      "docs-workspace",
      "Architecture / Workspace",
      "Workspace and project-agent contracts.",
      await walkFiles("docs/architecture/workspace", (repoPath) => isTextFile(repoPath))
    )
  );

  sections.push(
    await buildSection(
      "docs",
      "docs-ui",
      "Architecture / UI",
      "Source, sync, derive, and control center docs.",
      await walkFiles("docs/architecture/ui", (repoPath) => isTextFile(repoPath))
    )
  );

  return {
    id: "docs",
    label: "Docs",
    description: "Repository manuals and architecture references.",
    sections: sections.filter((section) => section.files.length > 0)
  };
}

async function buildTree() {
  const owners = [await buildBodyOwner(), await buildClassOwner(), await buildGuildHallOwner(), await buildOperationsOwner(), await buildDocsOwner()];

  return {
    generatedAt: new Date().toISOString(),
    owners
  };
}

function findFileInTree(owners: ControlCenterOwner[], repoPath: string) {
  for (const owner of owners) {
    for (const section of owner.sections) {
      for (const file of section.files) {
        if (file.path === repoPath) {
          return file;
        }
      }
    }
  }

  return null;
}

function parseRequestedRepoPath(url: URL) {
  const requestedPath = url.searchParams.get("path");

  if (!requestedPath) {
    throw new Error("Missing file path.");
  }

  const normalized = path.posix.normalize(requestedPath.replace(/\\/g, "/"));

  if (normalized.startsWith("../") || normalized === ".." || normalized.startsWith("/")) {
    throw new Error("Invalid file path.");
  }

  return normalized;
}

async function readRequestJson(request: IncomingMessage) {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const rawBody = Buffer.concat(chunks).toString("utf8").trim();

  if (!rawBody) {
    return {};
  }

  return JSON.parse(rawBody) as Record<string, unknown>;
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload));
}

async function loadIntegratedFixturePayload() {
  const content = await fs.readFile(resolveRepoPath(integratedFixtureRepoPath), "utf8");
  return JSON.parse(content) as Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringField(value: unknown, fallback = "unknown") {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function nullableStringField(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function numberField(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function countField(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : fallback;
}

function numberRecordField(value: unknown): Record<string, number> {
  const record = isRecord(value) ? value : {};
  const result: Record<string, number> = {};

  for (const [key, count] of Object.entries(record)) {
    result[key] = countField(count);
  }

  return result;
}

function nullableNumberField(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function booleanField(value: unknown) {
  return typeof value === "boolean" ? value : false;
}

function arrayField(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function knowledgeLaneOwnerGatedStateField(value: unknown) {
  return typeof value === "string" && KNOWLEDGE_LANE_OWNER_GATED_STATES.has(value as KnowledgeLaneOwnerGatedState)
    ? (value as KnowledgeLaneOwnerGatedState)
    : null;
}

function knowledgeLaneClaimCeilingField(value: unknown) {
  return value === KNOWLEDGE_LANE_CLAIM_CEILING ? KNOWLEDGE_LANE_CLAIM_CEILING : null;
}

function mapKnowledgeLaneEvidenceCounts(value: unknown): KnowledgeLaneEvidenceCounts {
  const counts = isRecord(value) ? value : {};
  const sanitized = {} as KnowledgeLaneEvidenceCounts;

  for (const key of KNOWLEDGE_LANE_NUMERIC_EVIDENCE_COUNT_KEYS) {
    sanitized[key] = countField(counts[key]);
  }

  for (const key of KNOWLEDGE_LANE_BOOLEAN_EVIDENCE_COUNT_KEYS) {
    sanitized[key] = booleanField(counts[key]);
  }

  return sanitized;
}

function mapProjectItem(item: unknown): DungeonMapProject {
  const project = isRecord(item) ? item : {};
  const workspace = isRecord(project.workspace) ? project.workspace : {};
  const workmeta = isRecord(project.workmeta) ? project.workmeta : {};

  return {
    project_code: stringField(project.project_code),
    workspace_present: typeof project.workspace_present === "boolean" ? project.workspace_present : booleanField(workspace.present),
    workmeta_present: typeof project.workmeta_present === "boolean" ? project.workmeta_present : booleanField(workmeta.present),
    contract_present: typeof project.contract_present === "boolean" ? project.contract_present : undefined,
    bindings_count: typeof project.bindings_count === "number" ? numberField(project.bindings_count) : undefined,
    report_surface_count: typeof project.report_surface_count === "number" ? numberField(project.report_surface_count) : undefined,
    mission_count: typeof project.mission_count === "number" ? numberField(project.mission_count) : undefined,
    blocked_mission_count: typeof project.blocked_mission_count === "number" ? numberField(project.blocked_mission_count) : undefined,
    pending_monster_count: typeof project.pending_monster_count === "number" ? numberField(project.pending_monster_count) : undefined,
    surface_status: nullableStringField(project.surface_status) ?? undefined
  };
}

function mapProjects(snapshot: Record<string, unknown>): DungeonMapProject[] {
  return arrayField(snapshot.projects).map(mapProjectItem);
}

function mapMissionItem(item: unknown): DungeonMapMission {
  const mission = isRecord(item) ? item : {};

  return {
    mission_id: nullableStringField(mission.mission_id) ?? undefined,
    title: stringField(mission.title),
    project_code: nullableStringField(mission.project_code) ?? undefined,
    status: stringField(mission.status),
    readiness: stringField(mission.readiness_status, stringField(mission.readiness)),
    workflow_id_present: typeof mission.workflow_id_present === "boolean" ? mission.workflow_id_present : undefined,
    party_id: nullableStringField(mission.party_id) ?? undefined,
    display_group: nullableStringField(mission.display_group) ?? undefined,
    display_group_label: nullableStringField(mission.display_group_label) ?? undefined,
    display_group_rank: typeof mission.display_group_rank === "number" ? numberField(mission.display_group_rank) : undefined
  };
}

function mapMissions(snapshot: Record<string, unknown>): DungeonMapMission[] {
  const missions = isRecord(snapshot.missions) ? snapshot.missions : {};
  return arrayField(missions.items).map(mapMissionItem);
}

function mapNextActionItem(item: unknown): DungeonMapNextAction {
  const action = isRecord(item) ? item : {};

  return {
    id: stringField(action.id),
    status: stringField(action.status),
    summary: stringField(action.summary, ""),
    rank: typeof action.rank === "number" ? numberField(action.rank) : undefined
  };
}

function mapNextActions(snapshot: Record<string, unknown>): DungeonMapNextAction[] {
  return arrayField(snapshot.next_actions).map(mapNextActionItem);
}

function mapPendingMonsterItems(items: unknown): DungeonMapPendingMonster[] {
  return arrayField(items).map((item) => {
    const monster = isRecord(item) ? item : {};

    return {
      monster_id: stringField(monster.monster_id),
      inbox_id: stringField(monster.inbox_id),
      monster_family: stringField(monster.monster_family, "unknown_monster"),
      monster_name: nullableStringField(monster.monster_name),
      work_pattern: nullableStringField(monster.work_pattern),
      objective_summary: nullableStringField(monster.objective_summary),
      due_state: stringField(monster.due_state, "no_due"),
      d_day: nullableStringField(monster.d_day),
      known_status: stringField(monster.known_status, "unknown"),
      assignment_status: stringField(monster.assignment_status, "pending_dungeon_assignment"),
      assigned_project_code: nullableStringField(monster.assigned_project_code),
      assigned_stage: nullableStringField(monster.assigned_stage),
      project_hint_count: numberField(monster.project_hint_count),
      stage_hint_count: numberField(monster.stage_hint_count),
      mail_touch_count: nullableNumberField(monster.mail_touch_count),
      last_mail_role: nullableStringField(monster.last_mail_role),
      mission_ref_present: booleanField(monster.mission_ref_present),
      display_group: stringField(monster.display_group, "open_intake"),
      display_group_label: stringField(monster.display_group_label, "Open intake"),
      display_group_rank: numberField(monster.display_group_rank, 999)
    };
  });
}

function mapPendingMonsters(gateway: Record<string, unknown>): DungeonMapPendingMonster[] {
  const pendingMonsters = isRecord(gateway.pending_monsters) ? gateway.pending_monsters : {};
  return mapPendingMonsterItems(pendingMonsters.items);
}

function mapKnowledgeLaneBlocker(item: unknown): DungeonMapKnowledgeLaneBlocker {
  const blocker = isRecord(item) ? item : {};

  return {
    id: stringField(blocker.id),
    severity: stringField(blocker.severity, "info"),
    summary: stringField(blocker.summary, "")
  };
}

function mapKnowledgeLane(item: unknown): DungeonMapKnowledgeLane | null {
  if (!isRecord(item)) {
    return null;
  }

  const ownerGatedState = knowledgeLaneOwnerGatedStateField(item.owner_gated_state);
  const claimCeiling = knowledgeLaneClaimCeilingField(item.claim_ceiling);
  if (!ownerGatedState || !claimCeiling) {
    return null;
  }

  return {
    label: stringField(item.label, "Knowledge Lane"),
    owner_gated_state: ownerGatedState,
    claim_ceiling: claimCeiling,
    helper_present: booleanField(item.helper_present),
    notebooklm_bridge_present: booleanField(item.notebooklm_bridge_present),
    workflow_present_count: countField(item.workflow_present_count),
    fixture_present: booleanField(item.fixture_present),
    evidence_present: booleanField(item.evidence_present),
    evidence_surface_count: countField(item.evidence_surface_count),
    evidence_counts: mapKnowledgeLaneEvidenceCounts(item.evidence_counts),
    blockers: arrayField(item.blockers).map(mapKnowledgeLaneBlocker),
    next_owner_review_action: nullableStringField(item.next_owner_review_action)
  };
}

function mapOperationBoard(snapshot: Record<string, unknown>): DungeonMapOperationBoard | null {
  const operationBoard = isRecord(snapshot.operation_board) ? snapshot.operation_board : null;
  if (!operationBoard) {
    return null;
  }

  const sections = isRecord(operationBoard.sections) ? operationBoard.sections : {};
  const dungeonMap = isRecord(sections.dungeon_map) ? sections.dungeon_map : {};
  const missionBoard = isRecord(sections.mission_board) ? sections.mission_board : {};
  const monsterGate = isRecord(sections.monster_gate) ? sections.monster_gate : {};
  const actionQueue = isRecord(sections.action_queue) ? sections.action_queue : {};
  const knowledgeLane = isRecord(sections.knowledge_lane) ? sections.knowledge_lane : null;

  return {
    schema_version: stringField(operationBoard.schema_version),
    summary: isRecord(operationBoard.summary) ? operationBoard.summary : {},
    sections: {
      dungeon_map: {
        label: stringField(dungeonMap.label, "Dungeon Map"),
        items: arrayField(dungeonMap.items).map(mapProjectItem)
      },
      mission_board: {
        label: stringField(missionBoard.label, "Mission Board"),
        counts_by_status: isRecord(missionBoard.counts_by_status) ? missionBoard.counts_by_status : {},
        counts_by_display_group: isRecord(missionBoard.counts_by_display_group) ? missionBoard.counts_by_display_group : {},
        items: arrayField(missionBoard.items).map(mapMissionItem)
      },
      monster_gate: {
        label: stringField(monsterGate.label, "Monster Gate"),
        count: numberField(monsterGate.count),
        display_limit: numberField(monsterGate.display_limit),
        truncated: booleanField(monsterGate.truncated),
        groups: arrayField(monsterGate.groups).map((item) => {
          const group = isRecord(item) ? item : {};
          return {
            id: stringField(group.id),
            label: stringField(group.label),
            rank: numberField(group.rank, 999),
            total: numberField(group.total),
            items: mapPendingMonsterItems(group.items)
          };
        })
      },
      knowledge_lane: mapKnowledgeLane(knowledgeLane),
      action_queue: {
        label: stringField(actionQueue.label, "Next Actions"),
        items: arrayField(actionQueue.items).map(mapNextActionItem)
      }
    }
  };
}

export function mapSnapshotResponse(
  snapshot: Record<string, unknown> | null,
  status: SnapshotStatus,
  details: {
    error?: string;
    freshness?: SnapshotFreshnessResult;
  } = {}
) {
  const observations = snapshot && isRecord(snapshot.source_observations) ? snapshot.source_observations : {};
  const gateway = snapshot && isRecord(snapshot.gateway) ? snapshot.gateway : {};
  const pendingMonsters = isRecord(gateway.pending_monsters) ? gateway.pending_monsters : {};

  return {
    status,
    snapshot_path: snapshotRepoPath,
    error: details.error,
    generated_at: snapshot && typeof snapshot.generated_at === "string" ? snapshot.generated_at : null,
    source_observation_count: arrayField(observations.items).length,
    freshness_errors: details.freshness?.errors ?? [],
    changed_source_ids: details.freshness?.changed_sources.map((source) => source.id ?? source.source_ref ?? "unknown") ?? [],
    projects: snapshot ? mapProjects(snapshot) : [],
    missions: snapshot ? mapMissions(snapshot) : [],
    operation_board: snapshot ? mapOperationBoard(snapshot) : null,
    gateway: {
      intake_inbox_count: typeof gateway.intake_inbox_count === "number" ? gateway.intake_inbox_count : 0,
      monster_index_present: booleanField(gateway.monster_index_present),
      pending_monsters: {
        count: numberField(pendingMonsters.count),
        display_limit: numberField(pendingMonsters.display_limit),
        truncated: booleanField(pendingMonsters.truncated),
        by_display_group: isRecord(pendingMonsters.by_display_group) ? pendingMonsters.by_display_group : {},
        items: mapPendingMonsters(gateway)
      }
    },
    next_actions: snapshot ? mapNextActions(snapshot) : []
  };
}

function assistantDashboardStatusField(value: unknown, fallback: AssistantDashboardStatus = "degraded"): AssistantDashboardStatus {
  if (value === "ok" || value === "degraded" || value === "missing" || value === "unavailable") {
    return value;
  }
  return fallback;
}

function mapAssistantDashboardSummary(value: unknown) {
  const summary = isRecord(value) ? value : {};
  return {
    project_count: countField(summary.project_count),
    active_deadline_count: countField(summary.active_deadline_count),
    overdue_deadline_count: countField(summary.overdue_deadline_count),
    due_today_deadline_count: countField(summary.due_today_deadline_count),
    active_open_action_count: countField(summary.active_open_action_count),
    high_open_action_count: countField(summary.high_open_action_count),
    waiting_item_count: countField(summary.waiting_item_count),
    recent_done_count: countField(summary.recent_done_count),
    p00_unresolved_deadline_count: countField(summary.p00_unresolved_deadline_count),
    stale_warning_count: countField(summary.stale_warning_count)
  };
}

function mapAssistantDashboardItem(item: unknown) {
  const row = isRecord(item) ? item : {};
  const title =
    nullableStringField(row.title) ??
    nullableStringField(row.subject_hint) ??
    nullableStringField(row.item) ??
    nullableStringField(row.next_action) ??
    nullableStringField(row.deadline_id) ??
    nullableStringField(row.action_id) ??
    nullableStringField(row.work_id) ??
    "untitled";

  return {
    kind: stringField(row.kind),
    project_code: stringField(row.project_code),
    id:
      nullableStringField(row.deadline_id) ??
      nullableStringField(row.action_id) ??
      nullableStringField(row.work_id) ??
      nullableStringField(row.id) ??
      "",
    title,
    status: stringField(row.status),
    priority: nullableStringField(row.priority),
    due_at: nullableStringField(row.due_at),
    due_date_kst: nullableStringField(row.due_date_kst),
    action_type: nullableStringField(row.action_type),
    owner_or_contact: nullableStringField(row.owner_or_contact),
    next_action: nullableStringField(row.next_action),
    source_ref: nullableStringField(row.source_ref),
    claim_ceiling: nullableStringField(row.claim_ceiling)
  };
}

function mapAssistantDashboardProject(item: unknown) {
  const project = isRecord(item) ? item : {};
  return {
    project_code: stringField(project.project_code),
    active_deadline_count: countField(project.active_deadline_count),
    active_open_action_count: countField(project.active_open_action_count),
    recent_done_count: countField(project.recent_done_count),
    deadline_counts: numberRecordField(project.deadline_counts),
    open_action_counts: numberRecordField(project.open_action_counts),
    work_status_counts: numberRecordField(project.work_status_counts),
    top_open_actions: arrayField(project.top_open_actions).map(mapAssistantDashboardItem)
  };
}

function mapAssistantDashboardWaitingGroup(item: unknown) {
  const group = isRecord(item) ? item : {};
  return {
    owner_or_contact: stringField(group.owner_or_contact, "unassigned"),
    count: countField(group.count),
    items: arrayField(group.items).map(mapAssistantDashboardItem)
  };
}

function mapAssistantDashboardHealth(item: unknown) {
  const health = isRecord(item) ? item : {};
  return {
    id: stringField(health.id),
    source_ref: stringField(health.source_ref),
    status: stringField(health.status),
    generated_at: nullableStringField(health.generated_at),
    age_hours: nullableNumberField(health.age_hours),
    max_age_hours: nullableNumberField(health.max_age_hours)
  };
}

function mapAssistantDashboardValidationBlock(item: unknown) {
  const block = isRecord(item) ? item : {};
  return {
    status: stringField(block.status),
    error_count: countField(block.error_count),
    errors: arrayField(block.errors).map((entry) => {
      const error = isRecord(entry) ? entry : {};
      return {
        ref: stringField(error.ref, ""),
        field: stringField(error.field, ""),
        reason: stringField(error.reason, "")
      };
    })
  };
}

function emptyAssistantDashboardResponse(status: AssistantDashboardStatus, error?: string) {
  return {
    status,
    dashboard_path: assistantDashboardRepoPath,
    error,
    schema_version: null,
    generated_at: null,
    today_kst: null,
    summary: mapAssistantDashboardSummary({}),
    sections: {
      today_risk: [],
      p00_unresolved_deadlines: [],
      projects: [],
      waiting_on_people: [],
      done_recent: [],
      ai_data_health: []
    },
    validation: {
      deadline_watch: mapAssistantDashboardValidationBlock({ status: "missing" }),
      project_ledgers: mapAssistantDashboardValidationBlock({ status: "missing" })
    },
    boundary: {
      read_only_rollup: true,
      project_ledgers_are_truth: true,
      raw_payload_copied: false,
      raw_mail_body_read: false,
      raw_html_read: false,
      attachment_payload_read: false,
      telegram_sent: false,
      calendar_mutated: false,
      project_assignment_confirmed: false
    },
    validation_errors: []
  };
}

function mapAssistantDashboardResponse(
  dashboard: Record<string, unknown>,
  status: AssistantDashboardStatus,
  validationErrors: string[] = []
) {
  const sections = isRecord(dashboard.sections) ? dashboard.sections : {};
  const validation = isRecord(dashboard.validation) ? dashboard.validation : {};

  return {
    status,
    dashboard_path: assistantDashboardRepoPath,
    error: validationErrors.length ? "assistant dashboard validation failed" : undefined,
    schema_version: nullableStringField(dashboard.schema_version),
    generated_at: nullableStringField(dashboard.generated_at),
    today_kst: nullableStringField(dashboard.today_kst),
    summary: mapAssistantDashboardSummary(dashboard.summary),
    sections: {
      today_risk: arrayField(sections.today_risk).map(mapAssistantDashboardItem),
      p00_unresolved_deadlines: arrayField(sections.p00_unresolved_deadlines).map(mapAssistantDashboardItem),
      projects: arrayField(sections.projects).map(mapAssistantDashboardProject),
      waiting_on_people: arrayField(sections.waiting_on_people).map(mapAssistantDashboardWaitingGroup),
      done_recent: arrayField(sections.done_recent).map(mapAssistantDashboardItem),
      ai_data_health: arrayField(sections.ai_data_health).map(mapAssistantDashboardHealth)
    },
    validation: {
      deadline_watch: mapAssistantDashboardValidationBlock(validation.deadline_watch),
      project_ledgers: mapAssistantDashboardValidationBlock(validation.project_ledgers)
    },
    boundary: isRecord(dashboard.boundary) ? dashboard.boundary : emptyAssistantDashboardResponse("missing").boundary,
    validation_errors: validationErrors
  };
}

async function loadAssistantDashboardModule() {
  return (await import(pathToFileURL(resolveRepoPath("guild_hall/assistant_dashboard/dashboard.mjs")).href)) as AssistantDashboardModule;
}

async function handleAssistantDashboardRequest(response: ServerResponse) {
  const dashboardPath = resolveRepoPath(assistantDashboardRepoPath);

  if (!existsSync(dashboardPath)) {
    sendJson(response, 200, emptyAssistantDashboardResponse("missing"));
    return;
  }

  try {
    const content = await fs.readFile(dashboardPath, "utf8");
    const dashboard = JSON.parse(content) as unknown;

    if (!isRecord(dashboard)) {
      throw new Error("Assistant dashboard root must be an object.");
    }

    const dashboardModule = await loadAssistantDashboardModule();
    const validation = dashboardModule.validateAssistantDashboard(dashboard);
    const status = validation.ok ? assistantDashboardStatusField(dashboard.status) : "unavailable";
    sendJson(response, 200, mapAssistantDashboardResponse(dashboard, status, validation.errors));
  } catch (error) {
    sendJson(
      response,
      200,
      emptyAssistantDashboardResponse("unavailable", error instanceof Error ? error.message : "Failed to read assistant dashboard.")
    );
  }
}

async function loadSnapshotProducer() {
  return (await import(pathToFileURL(resolveRepoPath("guild_hall/snapshot/producer.mjs")).href)) as SnapshotProducerModule;
}

async function handleSnapshotRequest(response: ServerResponse) {
  const snapshotPath = resolveRepoPath(snapshotRepoPath);

  if (!existsSync(snapshotPath)) {
    sendJson(response, 200, mapSnapshotResponse(null, "missing"));
    return;
  }

  try {
    const content = await fs.readFile(snapshotPath, "utf8");
    const snapshot = JSON.parse(content) as unknown;

    if (!isRecord(snapshot)) {
      throw new Error("Snapshot root must be an object.");
    }

    try {
      const producer = await loadSnapshotProducer();
      const currentSnapshot = await producer.buildSnapshot({ repoRoot });
      const freshness = producer.compareSnapshotFreshness(snapshot, currentSnapshot);
      sendJson(response, 200, mapSnapshotResponse(snapshot, freshness.status, { freshness }));
    } catch (error) {
      sendJson(
        response,
        200,
        mapSnapshotResponse(snapshot, "unavailable", {
          error: error instanceof Error ? error.message : "Failed to compare snapshot freshness."
        })
      );
    }
  } catch (error) {
    sendJson(
      response,
      200,
      mapSnapshotResponse(null, "unavailable", {
        error: error instanceof Error ? error.message : "Failed to read snapshot."
      })
    );
  }
}

async function handleTreeRequest(response: ServerResponse) {
  const tree = await buildTree();
  sendJson(response, 200, tree);
}

async function handleFileRequest(request: IncomingMessage, response: ServerResponse, url: URL) {
  const tree = await buildTree();
  const repoPath = parseRequestedRepoPath(url);
  const fileRecord = findFileInTree(tree.owners, repoPath);

  if (!fileRecord) {
    sendJson(response, 404, { error: `Unknown file path: ${repoPath}` });
    return;
  }

  if (request.method === "GET") {
    const content = await fs.readFile(resolveRepoPath(repoPath), "utf8");
    sendJson(response, 200, {
      ...fileRecord,
      content
    });
    return;
  }

  if (request.method === "PUT") {
    const writeToken = process.env.SOULFORGE_CONTROL_CENTER_WRITE_TOKEN ?? "";
    const headerValue = request.headers["x-soulforge-write-token"];
    const requestToken = Array.isArray(headerValue) ? headerValue[0] : headerValue;

    if (!writeToken) {
      sendJson(response, 403, {
        error:
          "Control center writes are disabled. Set SOULFORGE_CONTROL_CENTER_WRITE_TOKEN and send x-soulforge-write-token to enable file edits."
      });
      return;
    }

    if (requestToken !== writeToken) {
      sendJson(response, 403, { error: "Invalid or missing x-soulforge-write-token header." });
      return;
    }

    if (!fileRecord.editable) {
      sendJson(response, 403, { error: `${repoPath} is read-only in the control center.` });
      return;
    }

    const body = await readRequestJson(request);
    const content = typeof body.content === "string" ? body.content : null;

    if (content === null) {
      sendJson(response, 400, { error: "Missing string content." });
      return;
    }

    await fs.writeFile(resolveRepoPath(repoPath), content, "utf8");
    const updatedStats = await statFile(repoPath);
    sendJson(response, 200, {
      ...fileRecord,
      updatedAt: updatedStats.updatedAt,
      size: updatedStats.size,
      content
    });
    return;
  }

  sendJson(response, 405, { error: `Unsupported method for /file: ${request.method}` });
}

async function handleValidateRequest(response: ServerResponse) {
  const warning = {
    level: "warning",
    code: "fixture-preview",
    message: "Control center preview currently uses the integrated fixture sample after canonical cleanup."
  };

  sendJson(response, 200, {
    ok: true,
    exitCode: 0,
    stdout: "",
    stderr: "",
    payload: {
      command: "fixture-validate",
      summary: {
        pass: 1,
        warn: 1,
        fail: 0,
        result: "WARN"
      },
      warnings: [warning],
      errors: [],
      findings: [warning]
    }
  });
}

async function handleDeriveRequest(response: ServerResponse) {
  sendJson(response, 200, await loadIntegratedFixturePayload());
}

async function handleControlCenterRequest(request: IncomingMessage, response: ServerResponse) {
  const url = new URL(request.url ?? "", "http://127.0.0.1");
  const routePath = url.pathname.replace(API_PREFIX, "") || "/";

  if (routePath === "/tree") {
    await handleTreeRequest(response);
    return;
  }

  if (routePath === "/file") {
    await handleFileRequest(request, response, url);
    return;
  }

  if (routePath === "/validate" && request.method === "POST") {
    await handleValidateRequest(response);
    return;
  }

  if (routePath === "/derive-ui-state" && request.method === "GET") {
    await handleDeriveRequest(response);
    return;
  }

  if (routePath === "/snapshot" && request.method === "GET") {
    await handleSnapshotRequest(response);
    return;
  }

  if (routePath === "/assistant-dashboard" && request.method === "GET") {
    await handleAssistantDashboardRequest(response);
    return;
  }

  sendJson(response, 404, { error: `Unknown control center route: ${routePath}` });
}

function attachControlCenterApi(server: ViteDevServer | PreviewServer) {
  server.middlewares.use(async (request, response, next) => {
    if (!request.url?.startsWith(API_PREFIX)) {
      next();
      return;
    }

    try {
      await handleControlCenterRequest(request, response);
    } catch (error) {
      sendJson(response, 500, {
        error: error instanceof Error ? error.message : "Unknown control center server error."
      });
    }
  });
}

export function controlCenterPlugin(): Plugin {
  return {
    name: "soulforge-control-center",
    configureServer(server) {
      attachControlCenterApi(server);
    },
    configurePreviewServer(server) {
      attachControlCenterApi(server);
    }
  };
}
