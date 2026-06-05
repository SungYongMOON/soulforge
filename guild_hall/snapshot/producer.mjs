import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { normalizeBattleEvent } from "../battle_log/battle_log.mjs";
import { pathExists, readJson, writeJson } from "../shared/io.mjs";

export const SNAPSHOT_VERSION = "soulforge.snapshot.v0";
export const SNAPSHOT_PRODUCER = "guild_hall/snapshot";
export const SNAPSHOT_OBSERVATIONS_VERSION = "soulforge.snapshot_observations.v0";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = path.resolve(__dirname, "../..");

const OWNER_ROOTS = [
  [".registry", "canon_store", "tracked"],
  [".unit", "active_units", "tracked"],
  [".workflow", "workflow_canon", "tracked"],
  [".party", "party_templates", "tracked"],
  [".mission", "held_missions", "tracked"],
  ["guild_hall", "cross_project_operations", "tracked_code_local_state"],
  ["_workspaces", "local_project_worksite", "local_only"],
  ["_workmeta", "project_private_metadata", "nested_private_repo"],
  ["private-state", "continuity_mirror", "nested_private_repo"],
  ["docs", "architecture_docs", "tracked"],
  ["ui-workspace", "derived_ui_consumer", "tracked"],
];

const WORKMETA_NON_PROJECT_ROOTS = new Set([".git", "templates", "system"]);
const PENDING_MONSTER_ASSIGNMENT_STATUSES = new Set(["pending_dungeon_assignment", "blocked"]);
const PENDING_MONSTER_DISPLAY_LIMIT = 24;
const PENDING_MONSTER_DISPLAY_GROUPS = [
  { id: "blocked", label: "Blocked", rank: 10 },
  { id: "due_watch", label: "Due watch", rank: 20 },
  { id: "assigned_route", label: "Assigned route", rank: 30 },
  { id: "routing_hints", label: "Routing hints", rank: 40 },
  { id: "needs_identification", label: "Needs identification", rank: 50 },
  { id: "open_intake", label: "Open intake", rank: 60 },
];
const PENDING_MONSTER_DISPLAY_GROUP_BY_ID = new Map(PENDING_MONSTER_DISPLAY_GROUPS.map((group) => [group.id, group]));
const PENDING_MONSTER_SUMMARY_MIRROR_FIELDS = [
  "monster_id",
  "inbox_id",
  "monster_family",
  "monster_name",
  "work_pattern",
  "objective_summary",
  "due_state",
  "d_day",
  "known_status",
  "assignment_status",
  "assigned_project_code",
  "assigned_stage",
  "project_hint_count",
  "stage_hint_count",
  "mail_touch_count",
  "last_mail_role",
  "mission_ref_present",
  "display_group",
  "display_group_label",
  "display_group_rank",
];
const MISSION_TERMINAL_PROVENANCE_MARKER_FIELDS = [
  "terminal_provenance_present",
  "terminal_provenance_complete",
  "terminal_provenance_closed_via_mission_close",
  "terminal_result_matches_readiness",
  "run_pointer_present",
  "battle_event_pointer_present",
];
const OPERATION_BOARD_VERSION = "soulforge.operation_board_projection.v0";
export const NEXT_ACTION_STATUS_VALUES = Object.freeze(["started", "next"]);
const NEXT_ACTION_ALLOWED_STATUSES = new Set(NEXT_ACTION_STATUS_VALUES);
const NEXT_ACTION_ALLOWED_FIELDS = ["id", "status", "summary"];
const ACTION_QUEUE_ITEM_ALLOWED_FIELDS = ["id", "status", "summary", "rank"];
const OPERATION_BOARD_DUNGEON_MAP_ITEM_FIELDS = [
  "project_code",
  "workspace_present",
  "workmeta_present",
  "contract_present",
  "bindings_count",
  "report_surface_count",
  "mission_count",
  "blocked_mission_count",
  "pending_monster_count",
  "surface_status",
];
const OPERATION_BOARD_MISSION_BOARD_ITEM_FIELDS = [
  "mission_id",
  "title",
  "project_code",
  "status",
  "readiness_status",
  "workflow_id_present",
  "party_id",
  ...MISSION_TERMINAL_PROVENANCE_MARKER_FIELDS,
  "display_group",
  "display_group_label",
  "display_group_rank",
];
const OPERATION_BOARD_MONSTER_GATE_GROUP_FIELDS = ["id", "label", "rank", "total", "items"];
const KNOWLEDGE_LANE_VERSION = "soulforge.knowledge_lane_status.v0";
const KNOWLEDGE_LANE_CLAIM_CEILING = "observed";
const KNOWLEDGE_LANE_OWNER_GATED_STATES = new Set([
  "blocked_missing_surface",
  "awaiting_metadata_evidence",
  "owner_review_required",
]);
const AUTH_SESSION_ENTRY_NAME_PATTERN =
  /(^|[._-])(auth|oauth|session|sessions|token|tokens|cookie|cookies|credential|credentials|secret|secrets)([._-]|$)/i;
const KNOWLEDGE_LANE_REFS = {
  operatingModel: "docs/architecture/guild_hall/KNOWLEDGE_OPERATING_MODEL_V0.md",
  helperRoot: "guild_hall/knowledge_access",
  knowledgeAccessWorkflow: ".workflow/knowledge_access_event_capture_v0",
  sourceboundWorkflow: ".workflow/sourcebound_knowledge_packet_operating_loop_v0",
  notebooklmFixture: "docs/architecture/workspace/examples/notebooklm_bridge",
  ontologyReviewManual: "docs/architecture/foundation/ONTOLOGY_REVIEW_MANUAL_V0.md",
  ontologyModel: "docs/architecture/foundation/ONTOLOGY_MODEL_V0.md",
};
const MISSION_BOARD_DISPLAY_GROUPS = [
  { id: "blocked", label: "Blocked", rank: 10 },
  { id: "ready", label: "Ready", rank: 20 },
  { id: "active", label: "Active", rank: 30 },
  { id: "completed", label: "Completed", rank: 80 },
  { id: "other", label: "Other", rank: 90 },
];
const MISSION_BOARD_DISPLAY_GROUP_BY_ID = new Map(MISSION_BOARD_DISPLAY_GROUPS.map((group) => [group.id, group]));
const BATTLE_LOG_SOURCE_REF = "_workmeta/*/log/events/**/battle_events.jsonl";
const BATTLE_LOG_SUMMARY_FIELDS = [
  "source_ref",
  "event_count",
  "project_count_with_events",
  "by_result",
  "by_bottleneck_reason",
  "by_battle_mode",
  "by_automation_possibility",
  "total_intervention_count",
  "latest_occurred_at",
  "projects",
  "skipped_row_count",
  "skipped_file_count",
];
const BATTLE_LOG_PROJECT_SUMMARY_FIELDS = [
  "project_code",
  "event_count",
  "latest_occurred_at",
  "latest_result",
  "latest_bottleneck_reason",
  "intervention_total",
];

const SNAPSHOT_OWNER_NOTES = [
  "Snapshot is a read-only projection for UI and external hosts.",
  "Snapshot does not replace canonical owner roots.",
  "Private roots are summarized by existence and surface counts only.",
];

export function defaultSnapshotPath(repoRoot = defaultRepoRoot) {
  return path.join(repoRoot, "guild_hall", "state", "snapshot", "soulforge_snapshot.json");
}

export async function buildSnapshot(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? defaultRepoRoot);
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const diagnostics = createDiagnostics();

  const roots = await summarizeOwnerRoots(repoRoot);
  const projects = await summarizeProjects(repoRoot, diagnostics);
  const missions = await summarizeMissions(repoRoot, diagnostics);
  const gateway = await summarizeGateway(repoRoot);
  const privateState = await summarizePrivateState(repoRoot);
  const knowledgeLane = await summarizeKnowledgeLane(repoRoot);
  const battleLog = await summarizeBattleLog(repoRoot);
  const repo = summarizeRepo(repoRoot);
  const sourceObservations = await collectSourceObservations(repoRoot, generatedAt);
  const nextActions = [
    {
      id: "snapshot_schema",
      status: "started",
      summary: "Keep the read-only snapshot contract stable enough for UI consumption.",
    },
    {
      id: "dungeon_map",
      status: "next",
      summary: "Render owner roots and project surfaces from snapshot metadata.",
    },
    {
      id: "mission_board",
      status: "next",
      summary: "Render held mission readiness and blocker summaries from snapshot metadata.",
    },
    {
      id: "anti_bottleneck_loop",
      status: "next",
      summary: "Surface intervention_count and bottleneck_reason so repeated owner prompts can be folded into runner packets.",
    },
  ];
  const finalizedDiagnostics = finalizeDiagnostics(diagnostics);

  const snapshot = {
    schema_version: SNAPSHOT_VERSION,
    generated_at: generatedAt,
    source: {
      producer: SNAPSHOT_PRODUCER,
      mode: "local_read_only",
      privacy_mode: "sanitized_metadata_only",
      notes: SNAPSHOT_OWNER_NOTES,
    },
    repo,
    active_slice: {
      id: "snapshot_to_operation_board_v0",
      source_ref: "docs/architecture/foundation/DEVELOPMENT_ROADMAP_V0.md",
      current_goal: "read-only snapshot -> Dungeon Map -> Mission Board",
    },
    roots,
    projects,
    missions,
    gateway,
    private_state: privateState,
    knowledge_lane: knowledgeLane,
    battle_log: battleLog,
    operation_board: buildOperationBoardProjection({
      projects,
      missions,
      gateway,
      knowledgeLane,
      battleLog,
      nextActions,
      diagnostics: finalizedDiagnostics,
    }),
    source_observations: sourceObservations,
    next_actions: nextActions,
    diagnostics: finalizedDiagnostics,
  };

  return snapshot;
}

export async function writeSnapshot(snapshot, outputPath) {
  await writeJson(outputPath, snapshot);
}

export function compareSnapshotFreshness(storedSnapshot, currentSnapshot) {
  const errors = [];
  const storedObservations = storedSnapshot?.source_observations;
  const currentObservations = currentSnapshot?.source_observations;
  const storedFingerprint = storedObservations?.fingerprint ?? null;
  const currentFingerprint = currentObservations?.fingerprint ?? null;
  let changedSources = [];

  if (!storedSnapshot || typeof storedSnapshot !== "object") {
    errors.push("stored snapshot must be an object");
  }
  if (storedSnapshot?.schema_version !== currentSnapshot?.schema_version) {
    errors.push("stored snapshot schema_version does not match current producer output");
  }
  if (
    currentSnapshot?.operation_board?.schema_version &&
    storedSnapshot?.operation_board?.schema_version !== currentSnapshot.operation_board.schema_version
  ) {
    errors.push("stored snapshot operation_board projection is missing or stale; regenerate it");
  }
  if (
    currentSnapshot?.knowledge_lane?.schema_version &&
    storedSnapshot?.knowledge_lane?.schema_version !== currentSnapshot.knowledge_lane.schema_version
  ) {
    errors.push("stored snapshot knowledge_lane status is missing or stale; regenerate it");
  }
  validateKnowledgeLaneSnapshotContract(storedSnapshot, errors, { label: "stored snapshot " });
  validateKnowledgeLaneSnapshotContract(currentSnapshot, errors, { label: "current snapshot " });
  validateBattleLogSnapshotContract(storedSnapshot, errors, { label: "stored snapshot " });
  validateBattleLogSnapshotContract(currentSnapshot, errors, { label: "current snapshot " });
  compareKnowledgeLaneFreshnessSupport(storedSnapshot, currentSnapshot, errors);
  if (!storedObservations || storedObservations.schema_version !== SNAPSHOT_OBSERVATIONS_VERSION) {
    errors.push("stored snapshot has no current source_observations; regenerate it");
  }
  if (!currentObservations || currentObservations.schema_version !== SNAPSHOT_OBSERVATIONS_VERSION) {
    errors.push("current snapshot has no current source_observations");
  }
  if (!storedFingerprint) {
    errors.push("stored snapshot source observation fingerprint is missing");
  }
  if (!currentFingerprint) {
    errors.push("current snapshot source observation fingerprint is missing");
  }

  if (storedFingerprint && currentFingerprint && storedFingerprint !== currentFingerprint) {
    errors.push("source observations changed since the stored snapshot was generated");
    changedSources = compareObservationItems(storedObservations.items, currentObservations.items);
  }

  return {
    ok: errors.length === 0,
    status: errors.length === 0 ? "fresh" : "stale",
    errors,
    changed_sources: changedSources,
    stored_fingerprint: storedFingerprint,
    current_fingerprint: currentFingerprint,
  };
}

export function validateSnapshot(snapshot) {
  const errors = [];

  if (!snapshot || typeof snapshot !== "object") {
    errors.push("snapshot must be an object");
    return buildValidationResult(errors);
  }

  if (snapshot.schema_version !== SNAPSHOT_VERSION) {
    errors.push(`schema_version must be ${SNAPSHOT_VERSION}`);
  }
  for (const key of [
    "generated_at",
    "source",
    "roots",
    "projects",
    "missions",
    "gateway",
    "knowledge_lane",
    "battle_log",
    "operation_board",
    "source_observations",
    "next_actions",
    "diagnostics",
  ]) {
    if (!(key in snapshot)) {
      errors.push(`missing top-level key: ${key}`);
    }
  }
  if (!Array.isArray(snapshot.roots)) {
    errors.push("roots must be an array");
  }
  if (!Array.isArray(snapshot.projects)) {
    errors.push("projects must be an array");
  }
  if (!Array.isArray(snapshot.missions?.items)) {
    errors.push("missions.items must be an array");
  }
  if (typeof snapshot.gateway?.pending_monsters?.count !== "number") {
    errors.push("gateway.pending_monsters.count must be a number");
  }
  if (!Array.isArray(snapshot.gateway?.pending_monsters?.items)) {
    errors.push("gateway.pending_monsters.items must be an array");
  }
  validateKnowledgeLaneSnapshotContract(snapshot, errors);
  validateBattleLogSnapshotContract(snapshot, errors);
  validateNextActionsSnapshotContract(snapshot, errors);
  if (snapshot.operation_board?.schema_version !== OPERATION_BOARD_VERSION) {
    errors.push(`operation_board.schema_version must be ${OPERATION_BOARD_VERSION}`);
  }
  if (!Array.isArray(snapshot.operation_board?.sections?.dungeon_map?.items)) {
    errors.push("operation_board.sections.dungeon_map.items must be an array");
  }
  if (!Array.isArray(snapshot.operation_board?.sections?.mission_board?.items)) {
    errors.push("operation_board.sections.mission_board.items must be an array");
  }
  if (!Array.isArray(snapshot.operation_board?.sections?.monster_gate?.groups)) {
    errors.push("operation_board.sections.monster_gate.groups must be an array");
  }
  if (!Array.isArray(snapshot.operation_board?.sections?.knowledge_lane?.blockers)) {
    errors.push("operation_board.sections.knowledge_lane.blockers must be an array");
  }
  if (!snapshot.operation_board?.sections?.battle_log || typeof snapshot.operation_board.sections.battle_log !== "object") {
    errors.push("operation_board.sections.battle_log must be an object");
  }
  if (!Array.isArray(snapshot.source_observations?.items)) {
    errors.push("source_observations.items must be an array");
  }
  if (!snapshot.source_observations?.fingerprint) {
    errors.push("source_observations.fingerprint must be present");
  }
  validateOperationBoardDungeonMapProjection(snapshot, errors);
  validateOperationBoardMissionBoardProjection(snapshot, errors);
  validateOperationBoardMonsterGateProjection(snapshot, errors);
  validateOperationBoardBattleLogProjection(snapshot, errors);
  validateOperationBoardProjectionCounts(snapshot, errors);

  const forbiddenPaths = [
    "guild_hall/state/gateway/mailbox/company/mail/raw",
    "guild_hall/state/gateway/mailbox/personal/mail/raw",
    "guild_hall/state/gateway/mailbox/company/mail/attachments",
    "guild_hall/state/gateway/mailbox/personal/mail/attachments",
    "gmail_token.json",
    "notebooklm_auth.json",
    "notebooklm_session.json",
    ".notebooklm",
    ".config/notebooklm",
    "DO_NOT_LEAK_NOTEBOOK_QUERY",
    "DO_NOT_LEAK_NOTEBOOK_ANSWER",
    "DO_NOT_LEAK_SOURCE_PAYLOAD",
    "DO_NOT_LEAK_PRIVATE_REPORT",
    "DO_NOT_LEAK_ONTOLOGY_CANDIDATE",
    "DO_NOT_LEAK_OWNER_DECISION",
    "DO_NOT_LEAK_GRAPH_MUTATION",
    "DO_NOT_SERIALIZE_EVENT_ID",
    "DO_NOT_SERIALIZE_MISSION_ID",
    "DO_NOT_SERIALIZE_SOURCE_REF",
    "DO_NOT_SERIALIZE_NEXT_ACTION_NOTE",
    "DO_NOT_SERIALIZE_PARTY_ID",
    "DO_NOT_SERIALIZE_UNIT_ID",
    "DO_NOT_SERIALIZE_LOOP_ID",
    "DO_NOT_SERIALIZE_STAGE",
  ];
  const payload = JSON.stringify(snapshot);
  for (const forbiddenPath of forbiddenPaths) {
    if (payload.includes(forbiddenPath)) {
      errors.push(`snapshot must not expose raw/private path: ${forbiddenPath}`);
    }
  }

  return buildValidationResult(errors);
}

function validateNextActionsSnapshotContract(snapshot, errors, options = {}) {
  const label = options.label ?? "";
  const nextActions = snapshot?.next_actions;
  const actionQueueItems = snapshot?.operation_board?.sections?.action_queue?.items;

  if (!Array.isArray(nextActions)) {
    errors.push(`${label}next_actions must be an array`);
  } else {
    validateNextActionItems(nextActions, `${label}next_actions`, NEXT_ACTION_ALLOWED_FIELDS, errors);
  }

  if (!Array.isArray(actionQueueItems)) {
    errors.push(`${label}operation_board.sections.action_queue.items must be an array`);
  } else {
    validateNextActionItems(
      actionQueueItems,
      `${label}operation_board.sections.action_queue.items`,
      ACTION_QUEUE_ITEM_ALLOWED_FIELDS,
      errors,
    );
  }

  if (!Array.isArray(nextActions) || !Array.isArray(actionQueueItems)) {
    return;
  }

  if (actionQueueItems.length !== nextActions.length) {
    errors.push(`${label}operation_board.sections.action_queue.items length must match next_actions length`);
  }

  const compareLength = Math.min(nextActions.length, actionQueueItems.length);
  for (let index = 0; index < compareLength; index += 1) {
    const nextAction = nextActions[index];
    const actionQueueItem = actionQueueItems[index];
    const expectedRank = index + 1;

    if (actionQueueItem?.rank !== expectedRank) {
      errors.push(`${label}operation_board.sections.action_queue.items[${index}].rank must be ${expectedRank}`);
    }
    for (const field of ["id", "status", "summary"]) {
      if (actionQueueItem?.[field] !== nextAction?.[field]) {
        errors.push(`${label}operation_board.sections.action_queue.items[${index}].${field} must mirror next_actions[${index}].${field}`);
      }
    }
  }
}

function validateNextActionItems(items, pathLabel, allowedFields, errors) {
  for (const [index, item] of items.entries()) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      errors.push(`${pathLabel}[${index}] must be an object`);
      continue;
    }
    validateAllowedObjectKeys(`${pathLabel}[${index}]`, item, allowedFields, errors);
    for (const field of ["id", "status", "summary"]) {
      if (typeof item[field] !== "string") {
        errors.push(`${pathLabel}[${index}].${field} must be a string`);
      }
    }
    if (typeof item.status === "string" && !NEXT_ACTION_ALLOWED_STATUSES.has(item.status)) {
      errors.push(`${pathLabel}[${index}].status must be one of ${NEXT_ACTION_STATUS_VALUES.join(", ")}`);
    }
  }
}

function validateBattleLogSnapshotContract(snapshot, errors, options = {}) {
  const label = options.label ?? "";
  const battleLog = snapshot?.battle_log;

  if (!battleLog || typeof battleLog !== "object" || Array.isArray(battleLog)) {
    errors.push(`${label}battle_log must be an object`);
    return;
  }

  validateAllowedObjectKeys(`${label}battle_log`, battleLog, BATTLE_LOG_SUMMARY_FIELDS, errors);

  if (battleLog.source_ref !== BATTLE_LOG_SOURCE_REF) {
    errors.push(`${label}battle_log.source_ref must be ${BATTLE_LOG_SOURCE_REF}`);
  }

  for (const field of [
    "event_count",
    "project_count_with_events",
    "total_intervention_count",
    "skipped_row_count",
    "skipped_file_count",
  ]) {
    if (numberValue(battleLog[field]) === null) {
      errors.push(`${label}battle_log.${field} must be a number`);
    }
  }

  for (const field of ["by_result", "by_bottleneck_reason", "by_battle_mode", "by_automation_possibility"]) {
    if (!battleLog[field] || typeof battleLog[field] !== "object" || Array.isArray(battleLog[field])) {
      errors.push(`${label}battle_log.${field} must be an object`);
    }
  }

  if (battleLog.latest_occurred_at !== null && typeof battleLog.latest_occurred_at !== "string") {
    errors.push(`${label}battle_log.latest_occurred_at must be a string or null`);
  }

  if (!Array.isArray(battleLog.projects)) {
    errors.push(`${label}battle_log.projects must be an array`);
    return;
  }

  for (const [index, project] of battleLog.projects.entries()) {
    const projectPath = `${label}battle_log.projects[${index}]`;
    if (!project || typeof project !== "object" || Array.isArray(project)) {
      errors.push(`${projectPath} must be an object`);
      continue;
    }
    validateAllowedObjectKeys(projectPath, project, BATTLE_LOG_PROJECT_SUMMARY_FIELDS, errors);
    for (const field of ["project_code", "latest_result", "latest_bottleneck_reason"]) {
      if (project[field] !== null && typeof project[field] !== "string") {
        errors.push(`${projectPath}.${field} must be a string or null`);
      }
    }
    if (project.latest_occurred_at !== null && typeof project.latest_occurred_at !== "string") {
      errors.push(`${projectPath}.latest_occurred_at must be a string or null`);
    }
    for (const field of ["event_count", "intervention_total"]) {
      if (numberValue(project[field]) === null) {
        errors.push(`${projectPath}.${field} must be a number`);
      }
    }
  }
}

function validateOperationBoardDungeonMapProjection(snapshot, errors, options = {}) {
  const label = options.label ?? "";
  const projects = Array.isArray(snapshot?.projects) ? snapshot.projects : null;
  const missionItems = Array.isArray(snapshot?.missions?.items) ? snapshot.missions.items : null;
  const pendingMonsterItems = Array.isArray(snapshot?.gateway?.pending_monsters?.items)
    ? snapshot.gateway.pending_monsters.items
    : null;
  const dungeonMapItems = Array.isArray(snapshot?.operation_board?.sections?.dungeon_map?.items)
    ? snapshot.operation_board.sections.dungeon_map.items
    : null;

  if (!projects || !dungeonMapItems) {
    return;
  }

  validateCountMirror(
    `${label}operation_board.sections.dungeon_map.items length`,
    dungeonMapItems.length,
    projects.length,
    "projects.length",
    errors,
  );

  const projectCodes = projects.map((project) => project?.project_code);
  const dungeonMapProjectCodes = dungeonMapItems.map((item) => item?.project_code);
  if (stableStringify(Array.from(new Set(dungeonMapProjectCodes)).sort()) !== stableStringify(Array.from(new Set(projectCodes)).sort())) {
    errors.push(`${label}operation_board.sections.dungeon_map.items project_code set must match projects project_code set`);
  }

  const compareLength = Math.min(projects.length, dungeonMapItems.length);
  for (let index = 0; index < compareLength; index += 1) {
    const project = projects[index];
    const item = dungeonMapItems[index];
    const itemPath = `${label}operation_board.sections.dungeon_map.items[${index}]`;

    if (!item || typeof item !== "object" || Array.isArray(item)) {
      errors.push(`${itemPath} must be an object`);
      continue;
    }
    validateAllowedObjectKeys(itemPath, item, OPERATION_BOARD_DUNGEON_MAP_ITEM_FIELDS, errors);

    const projectCode = project?.project_code;
    validateValueMirror(`${itemPath}.project_code`, item.project_code, projectCode, `projects[${index}].project_code`, errors);
    validateValueMirror(
      `${itemPath}.workspace_present`,
      item.workspace_present,
      Boolean(project?.workspace?.present),
      `Boolean(projects[${index}].workspace.present)`,
      errors,
    );
    validateValueMirror(
      `${itemPath}.workmeta_present`,
      item.workmeta_present,
      Boolean(project?.workmeta?.present),
      `Boolean(projects[${index}].workmeta.present)`,
      errors,
    );
    validateValueMirror(
      `${itemPath}.contract_present`,
      item.contract_present,
      Boolean(project?.workmeta?.contract_present),
      `Boolean(projects[${index}].workmeta.contract_present)`,
      errors,
    );
    validateValueMirror(
      `${itemPath}.bindings_count`,
      item.bindings_count,
      numberValue(project?.workmeta?.bindings_count) ?? 0,
      `projects[${index}].workmeta.bindings_count`,
      errors,
    );
    validateValueMirror(
      `${itemPath}.report_surface_count`,
      item.report_surface_count,
      Array.isArray(project?.workmeta?.report_surfaces) ? project.workmeta.report_surfaces.length : 0,
      `projects[${index}].workmeta.report_surfaces length`,
      errors,
    );
    if (missionItems) {
      const projectMissions = missionItems.filter((mission) => mission?.project_code === projectCode);
      validateValueMirror(`${itemPath}.mission_count`, item.mission_count, projectMissions.length, "missions.items project_code count", errors);
      validateValueMirror(
        `${itemPath}.blocked_mission_count`,
        item.blocked_mission_count,
        countMissionsByGroup(projectMissions, "blocked"),
        "missions.items project_code blocked display_group count",
        errors,
      );
    }
    if (pendingMonsterItems) {
      validateValueMirror(
        `${itemPath}.pending_monster_count`,
        item.pending_monster_count,
        pendingMonsterItems.filter((monster) => monster?.assigned_project_code === projectCode).length,
        "gateway.pending_monsters.items assigned_project_code count",
        errors,
      );
    }
    validateValueMirror(
      `${itemPath}.surface_status`,
      item.surface_status,
      classifyProjectSurfaceStatus(project),
      `classifyProjectSurfaceStatus(projects[${index}])`,
      errors,
    );
  }
}

function validateOperationBoardMissionBoardProjection(snapshot, errors, options = {}) {
  const label = options.label ?? "";
  const missionItems = Array.isArray(snapshot?.missions?.items) ? snapshot.missions.items : null;
  const missionCounts =
    snapshot?.missions?.counts && typeof snapshot.missions.counts === "object" && !Array.isArray(snapshot.missions.counts)
      ? snapshot.missions.counts
      : null;
  const missionBoard = snapshot?.operation_board?.sections?.mission_board;
  const missionBoardItems = Array.isArray(missionBoard?.items) ? missionBoard.items : null;

  if (!missionItems || !missionBoardItems) {
    return;
  }

  validateCountMirror(
    `${label}operation_board.sections.mission_board.items length`,
    missionBoardItems.length,
    missionItems.length,
    "missions.items.length",
    errors,
  );

  const missionIds = missionItems.map((mission) => mission?.mission_id);
  const missionBoardMissionIds = missionBoardItems.map((item) => item?.mission_id);
  if (stableStringify(Array.from(new Set(missionBoardMissionIds)).sort()) !== stableStringify(Array.from(new Set(missionIds)).sort())) {
    errors.push(`${label}operation_board.sections.mission_board.items mission_id set must match missions.items mission_id set`);
  }

  const expectedMissionBoard = buildOperationBoardMissionBoard({ missionItems, missionCounts: missionCounts ?? {} });
  const compareLength = Math.min(expectedMissionBoard.items.length, missionBoardItems.length);
  for (let index = 0; index < compareLength; index += 1) {
    const item = missionBoardItems[index];
    const expectedItem = expectedMissionBoard.items[index];
    const itemPath = `${label}operation_board.sections.mission_board.items[${index}]`;

    if (!item || typeof item !== "object" || Array.isArray(item)) {
      errors.push(`${itemPath} must be an object`);
      continue;
    }
    validateAllowedObjectKeys(itemPath, item, OPERATION_BOARD_MISSION_BOARD_ITEM_FIELDS, errors);

    for (const field of OPERATION_BOARD_MISSION_BOARD_ITEM_FIELDS) {
      validateValueMirror(
        `${itemPath}.${field}`,
        item[field],
        expectedItem?.[field],
        `missions.items Mission Board projection[${index}].${field}`,
        errors,
      );
    }
  }

  if (missionCounts) {
    validateCountObjectMirror(
      `${label}operation_board.sections.mission_board.counts_by_status`,
      missionBoard?.counts_by_status,
      missionCounts,
      "missions.counts status count",
      errors,
    );
  }
}

function validateOperationBoardMonsterGateProjection(snapshot, errors, options = {}) {
  const label = options.label ?? "";
  const pendingMonsterItems = Array.isArray(snapshot?.gateway?.pending_monsters?.items)
    ? snapshot.gateway.pending_monsters.items
    : null;
  const monsterGateGroups = Array.isArray(snapshot?.operation_board?.sections?.monster_gate?.groups)
    ? snapshot.operation_board.sections.monster_gate.groups
    : null;

  if (!monsterGateGroups) {
    return;
  }

  validateCountMirror(
    `${label}operation_board.sections.monster_gate.groups length`,
    monsterGateGroups.length,
    PENDING_MONSTER_DISPLAY_GROUPS.length,
    "PENDING_MONSTER_DISPLAY_GROUPS.length",
    errors,
  );

  const compareGroupLength = Math.min(monsterGateGroups.length, PENDING_MONSTER_DISPLAY_GROUPS.length);
  for (let groupIndex = 0; groupIndex < compareGroupLength; groupIndex += 1) {
    const group = monsterGateGroups[groupIndex];
    const expectedGroup = PENDING_MONSTER_DISPLAY_GROUPS[groupIndex];
    const groupPath = `${label}operation_board.sections.monster_gate.groups[${groupIndex}]`;

    if (!group || typeof group !== "object" || Array.isArray(group)) {
      errors.push(`${groupPath} must be an object`);
      continue;
    }
    validateAllowedObjectKeys(groupPath, group, OPERATION_BOARD_MONSTER_GATE_GROUP_FIELDS, errors);

    for (const field of ["id", "label", "rank"]) {
      validateValueMirror(
        `${groupPath}.${field}`,
        group[field],
        expectedGroup[field],
        `PENDING_MONSTER_DISPLAY_GROUPS[${groupIndex}].${field}`,
        errors,
      );
    }

    if (!Array.isArray(group.items)) {
      errors.push(`${groupPath}.items must be an array`);
      continue;
    }

    for (const [itemIndex, item] of group.items.entries()) {
      const itemPath = `${groupPath}.items[${itemIndex}]`;
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        errors.push(`${itemPath} must be an object`);
        continue;
      }
      validateAllowedObjectKeys(itemPath, item, PENDING_MONSTER_SUMMARY_MIRROR_FIELDS, errors);
    }

    if (!pendingMonsterItems) {
      continue;
    }

    const expectedItems = pendingMonsterItems.filter((monster) => monster?.display_group === group.id);
    validateCountMirror(
      `${groupPath}.items length`,
      group.items.length,
      expectedItems.length,
      `gateway.pending_monsters.items filtered by display_group ${group.id} length`,
      errors,
    );

    const compareItemLength = Math.min(group.items.length, expectedItems.length);
    for (let itemIndex = 0; itemIndex < compareItemLength; itemIndex += 1) {
      const item = group.items[itemIndex];
      const expectedItem = expectedItems[itemIndex];
      const itemPath = `${groupPath}.items[${itemIndex}]`;

      if (!item || typeof item !== "object" || Array.isArray(item)) {
        continue;
      }

      for (const field of PENDING_MONSTER_SUMMARY_MIRROR_FIELDS) {
        validateValueMirror(
          `${itemPath}.${field}`,
          item[field],
          expectedItem?.[field],
          `gateway.pending_monsters.items filtered by display_group ${group.id}[${itemIndex}].${field}`,
          errors,
        );
      }
    }
  }
}

function validateOperationBoardBattleLogProjection(snapshot, errors, options = {}) {
  const label = options.label ?? "";
  const battleLog = snapshot?.battle_log;
  const boardBattleLog = snapshot?.operation_board?.sections?.battle_log;

  if (!battleLog || typeof battleLog !== "object" || Array.isArray(battleLog)) {
    errors.push(`${label}battle_log must be an object`);
    return;
  }
  if (!boardBattleLog || typeof boardBattleLog !== "object" || Array.isArray(boardBattleLog)) {
    errors.push(`${label}operation_board.sections.battle_log must be an object`);
    return;
  }

  if (stableStringify(boardBattleLog) !== stableStringify(battleLog)) {
    errors.push(`${label}operation_board.sections.battle_log must mirror battle_log`);
  }
}

function validateOperationBoardProjectionCounts(snapshot, errors, options = {}) {
  const label = options.label ?? "";
  const projects = Array.isArray(snapshot?.projects) ? snapshot.projects : null;
  const missionItems = Array.isArray(snapshot?.missions?.items) ? snapshot.missions.items : null;
  const nextActions = Array.isArray(snapshot?.next_actions) ? snapshot.next_actions : null;
  const battleLog = snapshot?.battle_log && typeof snapshot.battle_log === "object" && !Array.isArray(snapshot.battle_log) ? snapshot.battle_log : null;
  const pendingMonsters = snapshot?.gateway?.pending_monsters;
  const summary = snapshot?.operation_board?.summary;
  const missionBoard = snapshot?.operation_board?.sections?.mission_board;
  const missionBoardItems = Array.isArray(missionBoard?.items) ? missionBoard.items : null;
  const monsterGate = snapshot?.operation_board?.sections?.monster_gate;
  const monsterGateGroups = Array.isArray(monsterGate?.groups) ? monsterGate.groups : null;

  if (!summary || typeof summary !== "object" || Array.isArray(summary)) {
    errors.push(`${label}operation_board.summary must be an object`);
    return;
  }

  if (nextActions) {
    validateCountMirror(
      `${label}operation_board.summary.next_action_count`,
      summary.next_action_count,
      nextActions.length,
      "next_actions.length",
      errors,
    );
  }

  if (battleLog) {
    validateCountMirror(
      `${label}operation_board.summary.battle_log_event_count`,
      summary.battle_log_event_count,
      numberValue(battleLog.event_count) ?? 0,
      "battle_log.event_count",
      errors,
    );
    validateCountMirror(
      `${label}operation_board.summary.battle_log_project_count_with_events`,
      summary.battle_log_project_count_with_events,
      numberValue(battleLog.project_count_with_events) ?? 0,
      "battle_log.project_count_with_events",
      errors,
    );
  }

  if (projects) {
    validateCountMirror(`${label}operation_board.summary.project_count`, summary.project_count, projects.length, "projects.length", errors);
    validateCountMirror(
      `${label}operation_board.summary.workspace_project_count`,
      summary.workspace_project_count,
      projects.filter((project) => project?.workspace?.present).length,
      "projects with workspace.present count",
      errors,
    );
    validateCountMirror(
      `${label}operation_board.summary.workmeta_project_count`,
      summary.workmeta_project_count,
      projects.filter((project) => project?.workmeta?.present).length,
      "projects with workmeta.present count",
      errors,
    );
  }

  if (missionItems) {
    validateCountMirror(`${label}operation_board.summary.mission_count`, summary.mission_count, missionItems.length, "missions.items.length", errors);
  }

  if (missionBoardItems) {
    const missionDisplayGroupCounts = countBy(missionBoardItems, (item) => item?.display_group ?? "unknown");
    validateCountMirror(
      `${label}operation_board.summary.blocked_mission_count`,
      summary.blocked_mission_count,
      missionDisplayGroupCounts.blocked ?? 0,
      "mission_board.items blocked display_group count",
      errors,
    );
    validateCountMirror(
      `${label}operation_board.summary.ready_mission_count`,
      summary.ready_mission_count,
      missionDisplayGroupCounts.ready ?? 0,
      "mission_board.items ready display_group count",
      errors,
    );
    validateCountObjectMirror(
      `${label}operation_board.sections.mission_board.counts_by_display_group`,
      missionBoard?.counts_by_display_group,
      missionDisplayGroupCounts,
      "mission_board.items display_group count",
      errors,
    );
  }

  if (!pendingMonsters || typeof pendingMonsters !== "object" || Array.isArray(pendingMonsters)) {
    return;
  }

  const pendingMonsterCount = numberValue(pendingMonsters.count);
  if (pendingMonsterCount !== null) {
    validateCountMirror(
      `${label}operation_board.summary.pending_monster_count`,
      summary.pending_monster_count,
      pendingMonsterCount,
      "gateway.pending_monsters.count",
      errors,
    );
    validateCountMirror(
      `${label}operation_board.sections.monster_gate.count`,
      monsterGate?.count,
      pendingMonsterCount,
      "gateway.pending_monsters.count",
      errors,
    );
  }

  const gatewayDisplayGroupCounts = pendingMonsters.by_display_group;
  if (!gatewayDisplayGroupCounts || typeof gatewayDisplayGroupCounts !== "object" || Array.isArray(gatewayDisplayGroupCounts)) {
    errors.push(`${label}gateway.pending_monsters.by_display_group must be an object`);
    return;
  }

  const blockedMonsterCount = countObjectValue(gatewayDisplayGroupCounts, "blocked", `${label}gateway.pending_monsters.by_display_group`, errors);
  const dueWatchMonsterCount = countObjectValue(gatewayDisplayGroupCounts, "due_watch", `${label}gateway.pending_monsters.by_display_group`, errors);
  if (blockedMonsterCount !== null) {
    validateCountMirror(
      `${label}operation_board.summary.blocked_monster_count`,
      summary.blocked_monster_count,
      blockedMonsterCount,
      "gateway.pending_monsters.by_display_group.blocked",
      errors,
    );
  }
  if (dueWatchMonsterCount !== null) {
    validateCountMirror(
      `${label}operation_board.summary.due_watch_monster_count`,
      summary.due_watch_monster_count,
      dueWatchMonsterCount,
      "gateway.pending_monsters.by_display_group.due_watch",
      errors,
    );
  }

  if (!monsterGateGroups) {
    return;
  }

  const monsterGateTruncated = Boolean(monsterGate?.truncated);
  for (const [index, group] of monsterGateGroups.entries()) {
    const groupPath = `${label}operation_board.sections.monster_gate.groups[${index}]`;
    if (!group || typeof group !== "object" || Array.isArray(group)) {
      errors.push(`${groupPath} must be an object`);
      continue;
    }
    if (typeof group.id !== "string") {
      errors.push(`${groupPath}.id must be a string`);
      continue;
    }

    const gatewayGroupTotal = countObjectValue(gatewayDisplayGroupCounts, group.id, `${label}gateway.pending_monsters.by_display_group`, errors);
    if (gatewayGroupTotal !== null) {
      validateCountMirror(
        `${groupPath}.total`,
        group.total,
        gatewayGroupTotal,
        `gateway.pending_monsters.by_display_group.${group.id}`,
        errors,
      );
    }

    if (!Array.isArray(group.items)) {
      errors.push(`${groupPath}.items must be an array`);
      continue;
    }

    if (monsterGateTruncated) {
      const groupTotal = numberValue(group.total);
      if (groupTotal !== null && group.items.length > groupTotal) {
        errors.push(`${groupPath}.items length must not exceed total`);
      }
    } else {
      validateCountMirror(`${groupPath}.total`, group.total, group.items.length, `${groupPath}.items.length`, errors);
    }
  }
}

function validateValueMirror(pathLabel, actualValue, expectedValue, expectedLabel, errors) {
  if (actualValue !== expectedValue) {
    errors.push(`${pathLabel} must mirror ${expectedLabel} (${expectedValue})`);
  }
}

function validateAllowedObjectKeys(pathLabel, value, allowedFields, errors) {
  const allowed = new Set(allowedFields);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      errors.push(`${pathLabel}.${key} is not an allowed field`);
    }
  }
}

function validateCountObjectMirror(pathLabel, actualCounts, expectedCounts, expectedLabel, errors) {
  if (!actualCounts || typeof actualCounts !== "object" || Array.isArray(actualCounts)) {
    errors.push(`${pathLabel} must be an object`);
    return;
  }

  const keys = Array.from(new Set([...Object.keys(actualCounts), ...Object.keys(expectedCounts)])).sort();
  for (const key of keys) {
    const actual = countObjectValue(actualCounts, key, pathLabel, errors);
    const expected = numberValue(expectedCounts[key]) ?? 0;
    if (actual === null) {
      continue;
    }
    if (actual !== expected) {
      errors.push(`${pathLabel}.${key} must equal ${expectedLabel} (${expected})`);
    }
  }
}

function countObjectValue(counts, key, pathLabel, errors) {
  if (!Object.hasOwn(counts, key)) {
    return 0;
  }
  const count = numberValue(counts[key]);
  if (count === null) {
    errors.push(`${pathLabel}.${key} must be a number`);
    return null;
  }
  return count;
}

function validateCountMirror(pathLabel, actualValue, expectedValue, expectedLabel, errors) {
  const actual = numberValue(actualValue);
  if (actual === null) {
    errors.push(`${pathLabel} must be a number`);
    return;
  }
  if (actual !== expectedValue) {
    errors.push(`${pathLabel} must equal ${expectedLabel} (${expectedValue})`);
  }
}

function validateKnowledgeLaneSnapshotContract(snapshot, errors, options = {}) {
  const label = options.label ?? "";
  const lane = snapshot?.knowledge_lane;

  if (!lane || typeof lane !== "object" || Array.isArray(lane)) {
    errors.push(`${label}knowledge_lane must be an object`);
    return;
  }

  if (lane.schema_version !== KNOWLEDGE_LANE_VERSION) {
    errors.push(`${label}knowledge_lane.schema_version must be ${KNOWLEDGE_LANE_VERSION}`);
  }

  const state = lane.owner_gated?.state;
  if (typeof state !== "string") {
    errors.push(`${label}knowledge_lane.owner_gated.state must be a string`);
  } else if (!KNOWLEDGE_LANE_OWNER_GATED_STATES.has(state)) {
    errors.push(
      `${label}knowledge_lane.owner_gated.state must be one of ${Array.from(KNOWLEDGE_LANE_OWNER_GATED_STATES).join(", ")}`,
    );
  }

  const claimCeiling = lane.claim_ceiling;
  if (typeof claimCeiling !== "string") {
    errors.push(`${label}knowledge_lane.claim_ceiling must be a string`);
  } else if (claimCeiling !== KNOWLEDGE_LANE_CLAIM_CEILING) {
    errors.push(`${label}knowledge_lane.claim_ceiling must be ${KNOWLEDGE_LANE_CLAIM_CEILING}`);
  }

  const blockers = Array.isArray(lane.blockers) ? lane.blockers : null;
  if (!blockers) {
    errors.push(`${label}knowledge_lane.blockers must be an array`);
  }

  const evidence = lane.evidence;
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    errors.push(`${label}knowledge_lane.evidence must be an object`);
  }

  const evidencePresent = typeof evidence?.present === "boolean" ? evidence.present : null;
  const evidenceSurfaceCount = numberValue(evidence?.total_surface_count);
  const privateEvidenceSurfaceCount = numberValue(evidence?.private_surface_count);
  if (evidencePresent === null) {
    errors.push(`${label}knowledge_lane.evidence.present must be a boolean`);
  }
  if (evidenceSurfaceCount === null) {
    errors.push(`${label}knowledge_lane.evidence.total_surface_count must be a number`);
  }
  if (privateEvidenceSurfaceCount === null) {
    errors.push(`${label}knowledge_lane.evidence.private_surface_count must be a number`);
  }
  if (evidencePresent !== null && evidenceSurfaceCount !== null && evidencePresent !== (evidenceSurfaceCount > 0)) {
    errors.push(`${label}knowledge_lane.evidence.present must match evidence.total_surface_count > 0`);
  }
  if (
    evidenceSurfaceCount !== null &&
    privateEvidenceSurfaceCount !== null &&
    evidenceSurfaceCount !== privateEvidenceSurfaceCount
  ) {
    errors.push(`${label}knowledge_lane.evidence.private_surface_count must equal evidence.total_surface_count`);
  }
  if (!evidence?.counts || typeof evidence.counts !== "object" || Array.isArray(evidence.counts)) {
    errors.push(`${label}knowledge_lane.evidence.counts must be an object`);
  }

  if (typeof state === "string" && KNOWLEDGE_LANE_OWNER_GATED_STATES.has(state) && blockers && evidencePresent !== null) {
    const expectedState = expectedKnowledgeLaneOwnerGateState({ blockers, evidencePresent });
    if (state !== expectedState) {
      errors.push(`${label}knowledge_lane.owner_gated.state must be ${expectedState} for current blockers/evidence`);
    }
  }

  const boardSummary = snapshot?.operation_board?.summary;
  const boardLane = snapshot?.operation_board?.sections?.knowledge_lane;
  if (!boardLane || typeof boardLane !== "object" || Array.isArray(boardLane)) {
    errors.push(`${label}operation_board.sections.knowledge_lane must be an object`);
    return;
  }

  if (typeof boardLane.owner_gated_state !== "string") {
    errors.push(`${label}operation_board.sections.knowledge_lane.owner_gated_state must be a string`);
  } else if (!KNOWLEDGE_LANE_OWNER_GATED_STATES.has(boardLane.owner_gated_state)) {
    errors.push(
      `${label}operation_board.sections.knowledge_lane.owner_gated_state must be one of ${Array.from(
        KNOWLEDGE_LANE_OWNER_GATED_STATES,
      ).join(", ")}`,
    );
  }
  if (state && boardLane.owner_gated_state !== state) {
    errors.push(`${label}operation_board.sections.knowledge_lane.owner_gated_state must match knowledge_lane.owner_gated.state`);
  }
  if (boardSummary?.knowledge_lane_state !== state) {
    errors.push(`${label}operation_board.summary.knowledge_lane_state must match knowledge_lane.owner_gated.state`);
  }
  if (boardLane.claim_ceiling !== claimCeiling) {
    errors.push(`${label}operation_board.sections.knowledge_lane.claim_ceiling must match knowledge_lane.claim_ceiling`);
  }
  if (typeof boardLane.evidence_present !== "boolean") {
    errors.push(`${label}operation_board.sections.knowledge_lane.evidence_present must be a boolean`);
  } else if (evidencePresent !== null && boardLane.evidence_present !== evidencePresent) {
    errors.push(`${label}operation_board.sections.knowledge_lane.evidence_present must match knowledge_lane.evidence.present`);
  }
  if (numberValue(boardLane.evidence_surface_count) === null) {
    errors.push(`${label}operation_board.sections.knowledge_lane.evidence_surface_count must be a number`);
  } else if (evidenceSurfaceCount !== null && boardLane.evidence_surface_count !== evidenceSurfaceCount) {
    errors.push(
      `${label}operation_board.sections.knowledge_lane.evidence_surface_count must match knowledge_lane.evidence.total_surface_count`,
    );
  }
  if (
    numberValue(boardSummary?.knowledge_evidence_surface_count) !== null &&
    evidenceSurfaceCount !== null &&
    boardSummary.knowledge_evidence_surface_count !== evidenceSurfaceCount
  ) {
    errors.push(`${label}operation_board.summary.knowledge_evidence_surface_count must match knowledge_lane.evidence.total_surface_count`);
  }
}

function compareKnowledgeLaneFreshnessSupport(storedSnapshot, currentSnapshot, errors) {
  const storedSupport = knowledgeLaneFreshnessSupport(storedSnapshot?.knowledge_lane);
  const currentSupport = knowledgeLaneFreshnessSupport(currentSnapshot?.knowledge_lane);

  if (!storedSupport || !currentSupport) {
    return;
  }

  if (stableStringify(storedSupport) !== stableStringify(currentSupport)) {
    errors.push("stored snapshot knowledge_lane owner_gated state/blockers/evidence do not match current metadata support; regenerate it");
  }
}

function knowledgeLaneFreshnessSupport(lane) {
  if (!lane || typeof lane !== "object" || Array.isArray(lane)) {
    return null;
  }

  const evidence = lane.evidence && typeof lane.evidence === "object" && !Array.isArray(lane.evidence) ? lane.evidence : null;

  return {
    owner_gated: {
      state: lane.owner_gated?.state ?? null,
    },
    blockers: Array.isArray(lane.blockers) ? lane.blockers : null,
    evidence,
  };
}

async function collectSourceObservations(repoRoot, observedAt) {
  const rawItems = await Promise.all([
    observeGitSource(repoRoot),
    observeFileSource(repoRoot, {
      id: "development_roadmap",
      sourceRef: "docs/architecture/foundation/DEVELOPMENT_ROADMAP_V0.md",
      owner: "docs/architecture/foundation",
      readMode: "file_metadata_only",
    }),
    observeFileSource(repoRoot, {
      id: "mission_index",
      sourceRef: ".mission/index.yaml",
      owner: ".mission",
      readMode: "public_summary_file_metadata",
    }),
    observeMissionReadinessSource(repoRoot),
    observeDirectorySource(repoRoot, {
      id: "workspace_projects",
      sourceRef: "_workspaces",
      owner: "_workspaces",
      readMode: "shallow_directory_metadata_only",
      exclude: new Set([".git"]),
    }),
    observeWorkmetaSource(repoRoot),
    observeBattleLogSource(repoRoot),
    observeGatewaySource(repoRoot),
    observeKnowledgeLaneSource(repoRoot),
    observePrivateStateSource(repoRoot),
  ]);
  const items = rawItems.map(withObservationSignature);

  return {
    schema_version: SNAPSHOT_OBSERVATIONS_VERSION,
    observed_at: observedAt,
    policy: {
      signal_scope: "metadata_only",
      freshness_rule: "A stored snapshot is fresh only when every source observation signature still matches current local observations.",
    },
    fingerprint: hashStable({
      schema_version: SNAPSHOT_OBSERVATIONS_VERSION,
      items: items.map((item) => ({ id: item.id, signature: item.signature })),
    }),
    items,
  };
}

async function observeGitSource(repoRoot) {
  const gitStatus = summarizeGit(repoRoot);
  return {
    id: "repo_worktree",
    source_ref: ".",
    owner: "Soulforge",
    read_mode: "git_metadata_only",
    present: gitStatus.available,
    signal: {
      kind: "git_status",
      branch: gitOutput(repoRoot, ["branch", "--show-current"]) || null,
      head: gitOutput(repoRoot, ["rev-parse", "HEAD"]),
      dirty: gitStatus.dirty,
      changed_entries: gitStatus.changed_entries,
    },
  };
}

async function observeFileSource(repoRoot, { id, sourceRef, owner, readMode }) {
  const stat = await statPath(path.join(repoRoot, sourceRef));
  return {
    id,
    source_ref: sourceRef,
    owner,
    read_mode: readMode,
    present: stat.present,
    signal: {
      kind: "file_stat",
      entry_type: stat.entry_type,
      mtime_ms: stat.mtime_ms,
      size_bytes: stat.size_bytes,
    },
  };
}

async function observeDirectorySource(repoRoot, { id, sourceRef, owner, readMode, exclude = new Set() }) {
  const root = path.join(repoRoot, sourceRef);
  const stat = await statPath(root);
  const entries = stat.present ? await readDirectoryEntries(root, exclude) : [];
  return {
    id,
    source_ref: sourceRef,
    owner,
    read_mode: readMode,
    present: stat.present,
    signal: {
      kind: "directory_surface",
      root_mtime_ms: stat.mtime_ms,
      direct_dir_count: entries.filter((entry) => entry.isDirectory()).length,
      direct_file_count: entries.filter((entry) => entry.isFile()).length,
    },
  };
}

async function observeMissionReadinessSource(repoRoot) {
  const missionRoot = path.join(repoRoot, ".mission");
  const stat = await statPath(missionRoot);
  const missionIds = stat.present ? await listDirectoryNames(missionRoot) : [];
  const readinessStats = await Promise.all(missionIds.map((missionId) => statPath(path.join(missionRoot, missionId, "readiness.yaml"))));
  const presentReadinessStats = readinessStats.filter((readinessStat) => readinessStat.present && readinessStat.entry_type === "file");

  return {
    id: "mission_readiness",
    source_ref: ".mission/*/readiness.yaml",
    owner: ".mission",
    read_mode: "mission_readiness_file_metadata_only",
    present: stat.present,
    signal: {
      kind: "mission_readiness_surface",
      mission_directory_count: missionIds.length,
      readiness_file_count: presentReadinessStats.length,
      latest_readiness_mtime_ms: presentReadinessStats.reduce(
        (latest, readinessStat) => Math.max(latest, numberValue(readinessStat.mtime_ms) ?? 0),
        0,
      ),
      readiness_total_size_bytes: presentReadinessStats.reduce(
        (total, readinessStat) => total + (numberValue(readinessStat.size_bytes) ?? 0),
        0,
      ),
    },
  };
}

async function observeWorkmetaSource(repoRoot) {
  const root = path.join(repoRoot, "_workmeta");
  const stat = await statPath(root);
  const projectCodes = stat.present
    ? await listProjectCodes(root, {
        exclude: new Set([".git", "templates"]),
        requireSurface: true,
      })
    : [];
  const surfacePaths = [root];
  for (const projectCode of projectCodes) {
    const projectRoot = path.join(root, projectCode);
    surfacePaths.push(
      path.join(projectRoot, "contract.yaml"),
      path.join(projectRoot, "bindings"),
      path.join(projectRoot, "reports"),
      path.join(projectRoot, "artifacts", "missions"),
    );
  }

  return {
    id: "workmeta_projects",
    source_ref: "_workmeta",
    owner: "_workmeta",
    read_mode: "project_surface_metadata_only",
    present: stat.present,
    signal: {
      kind: "workmeta_surface",
      root_mtime_ms: stat.mtime_ms,
      project_count: projectCodes.length,
      latest_surface_mtime_ms: await latestMtimeMs(surfacePaths),
    },
  };
}

async function observeBattleLogSource(repoRoot) {
  const projectFiles = await collectBattleEventFileSurfaces(repoRoot);
  const fileStats = projectFiles.map((entry) => entry.stat);

  return {
    id: "battle_log_events",
    source_ref: BATTLE_LOG_SOURCE_REF,
    owner: "guild_hall/battle_log",
    read_mode: "battle_event_file_metadata_only",
    present: projectFiles.length > 0,
    signal: {
      kind: "battle_log_event_files",
      file_count: projectFiles.length,
      latest_mtime_ms: fileStats.reduce((latest, stat) => Math.max(latest, numberValue(stat.mtime_ms) ?? 0), 0),
      total_size_bytes: fileStats.reduce((total, stat) => total + (numberValue(stat.size_bytes) ?? 0), 0),
      project_count: new Set(projectFiles.map((entry) => entry.project_code)).size,
    },
  };
}

async function observeGatewaySource(repoRoot) {
  const gatewayStateRoot = path.join(repoRoot, "guild_hall", "state", "gateway");
  const intakeRoot = path.join(gatewayStateRoot, "intake_inbox");
  const stat = await statPath(gatewayStateRoot);
  const inboxDirs = await listDirectoryNames(intakeRoot, { exclude: new Set(["_index"]) });
  const monsterIndexPath = path.join(intakeRoot, "_index", "monster_index.json");
  const monsterIndexStat = await statPath(monsterIndexPath);
  const monsterStatePaths = inboxDirs.map((inboxId) => path.join(intakeRoot, inboxId, "monsters.json"));
  const observedPaths = [
    gatewayStateRoot,
    intakeRoot,
    monsterIndexPath,
    path.join(gatewayStateRoot, "log", "mail_fetch", "state"),
    ...inboxDirs.map((inboxId) => path.join(intakeRoot, inboxId)),
    ...monsterStatePaths,
  ];

  return {
    id: "gateway_state",
    source_ref: "guild_hall/state/gateway",
    owner: "guild_hall/gateway",
    read_mode: "state_surface_metadata_only",
    present: stat.present,
    signal: {
      kind: "gateway_surface",
      root_mtime_ms: stat.mtime_ms,
      intake_inbox_count: inboxDirs.length,
      monster_index_mtime_ms: monsterIndexStat.mtime_ms,
      monster_state_file_count: (await Promise.all(monsterStatePaths.map((filePath) => pathExists(filePath)))).filter(Boolean).length,
      latest_surface_mtime_ms: await latestMtimeMs(observedPaths),
    },
  };
}

async function observeKnowledgeLaneSource(repoRoot) {
  const surface = await collectKnowledgeLaneSurfaceSignals(repoRoot);
  return {
    id: "knowledge_lane",
    source_ref: KNOWLEDGE_LANE_REFS.operatingModel,
    owner: "guild_hall/knowledge_lane",
    read_mode: "knowledge_metadata_surface_only",
    present: surface.public_surface_count > 0 || surface.evidence.present,
    signal: {
      kind: "knowledge_lane_surface",
      public_surface_count: surface.public_surface_count,
      private_evidence_surface_count: surface.evidence.private_surface_count,
      helper_present: surface.helper.present,
      notebooklm_bridge_present: surface.helper.notebooklm_bridge_present,
      workflow_present_count: surface.workflows.present_count,
      fixture_present: surface.fixtures.notebooklm_bridge_public_synthetic_present,
      project_knowledge_access_surface_count: surface.evidence.counts.project_knowledge_access_surface_count,
      project_procedure_capture_surface_count: surface.evidence.counts.project_procedure_capture_surface_count,
      project_ontology_surface_count: surface.evidence.counts.project_ontology_surface_count,
      latest_surface_mtime_ms: surface.latest_surface_mtime_ms,
    },
  };
}

async function observePrivateStateSource(repoRoot) {
  const root = path.join(repoRoot, "private-state");
  const stat = await statPath(root);
  const gitStatus = stat.present ? summarizeGit(root) : summarizeEmptyGit();
  const gitHead = stat.present ? gitOutput(root, ["rev-parse", "HEAD"]) : null;
  return {
    id: "private_state",
    source_ref: "private-state",
    owner: "private-state",
    read_mode: "continuity_surface_metadata_only",
    present: stat.present,
    signal: {
      kind: "private_state_surface",
      root_mtime_ms: stat.mtime_ms,
      git_head_fingerprint: gitHead ? hashStable({ owner: "private-state", head: gitHead }).slice(0, 16) : null,
      git_dirty: gitStatus.dirty,
      git_changed_entries: gitStatus.changed_entries,
      latest_surface_mtime_ms: await latestMtimeMs([
        root,
        path.join(root, "guild_hall", "state", "gateway"),
        path.join(root, "guild_hall", "state", "operations", "soulforge_activity"),
      ]),
    },
  };
}

async function summarizeOwnerRoots(repoRoot) {
  const roots = [];
  for (const [root, role, trackingPolicy] of OWNER_ROOTS) {
    const absolutePath = path.join(repoRoot, root);
    roots.push({
      root,
      role,
      tracking_policy: trackingPolicy,
      present: await pathExists(absolutePath),
    });
  }
  return roots;
}

async function summarizeProjects(repoRoot, diagnostics) {
  const workspaceCodes = await listProjectCodes(path.join(repoRoot, "_workspaces"), {
    exclude: new Set([".git"]),
    requireSurface: false,
  });
  const workmetaCodes = await listProjectCodes(path.join(repoRoot, "_workmeta"), {
    exclude: WORKMETA_NON_PROJECT_ROOTS,
    requireSurface: true,
  });

  const projectCodes = Array.from(new Set([...workspaceCodes, ...workmetaCodes])).sort();
  const projects = [];

  for (const projectCode of projectCodes) {
    projects.push({
      project_code: projectCode,
      workspace: await summarizeWorkspaceProject(repoRoot, projectCode),
      workmeta: await summarizeWorkmetaProject(repoRoot, projectCode),
    });
  }

  if (projectCodes.length === 0) {
    diagnostics.warnings.push({
      code: "no_project_surfaces_detected",
      severity: "warning",
      message: "No project code was detected under _workspaces or _workmeta.",
      location_hint: "_workspaces, _workmeta",
    });
  }

  return projects;
}

async function summarizeWorkspaceProject(repoRoot, projectCode) {
  const root = path.join(repoRoot, "_workspaces", projectCode);
  const present = await pathExists(root);
  return {
    present,
    source_ref: `_workspaces/${projectCode}`,
    mode: "local_only",
  };
}

async function summarizeWorkmetaProject(repoRoot, projectCode) {
  const root = path.join(repoRoot, "_workmeta", projectCode);
  const present = await pathExists(root);
  if (!present) {
    return {
      present: false,
      source_ref: `_workmeta/${projectCode}`,
      mode: "nested_private_repo",
      contract_present: false,
      bindings_count: 0,
      report_surfaces: [],
      mission_artifacts_present: false,
    };
  }

  return {
    present: true,
    source_ref: `_workmeta/${projectCode}`,
    mode: "nested_private_repo",
    contract_present: await pathExists(path.join(root, "contract.yaml")),
    bindings_count: await countDirectoryEntries(path.join(root, "bindings"), { filesOnly: true }),
    report_surfaces: await listDirectoryNames(path.join(root, "reports")),
    mission_artifacts_present: await pathExists(path.join(root, "artifacts", "missions")),
  };
}

async function summarizeBattleLog(repoRoot) {
  const files = await collectBattleEventFileSurfaces(repoRoot);
  const byResult = {};
  const byBottleneckReason = {};
  const byBattleMode = {};
  const byAutomationPossibility = {};
  const projectSummaries = new Map();
  let eventCount = 0;
  let totalInterventionCount = 0;
  let skippedRowCount = 0;
  let skippedFileCount = 0;
  let latestEvent = null;

  for (const file of files) {
    let text;
    try {
      text = await fs.readFile(file.file_path, "utf8");
    } catch {
      skippedFileCount += 1;
      continue;
    }

    for (const line of text.split(/\r?\n/u).filter(Boolean)) {
      let event;
      try {
        event = normalizeBattleEvent(JSON.parse(line), { expectedProjectCode: file.project_code });
      } catch {
        skippedRowCount += 1;
        continue;
      }

      eventCount += 1;
      totalInterventionCount += event.intervention_count;
      incrementCount(byResult, event.result);
      incrementCount(byBottleneckReason, event.bottleneck_reason);
      incrementCount(byBattleMode, event.battle_mode);
      incrementCount(byAutomationPossibility, event.automation_possibility);

      if (!latestEvent || compareBattleEvents(event, latestEvent) > 0) {
        latestEvent = event;
      }

      const projectSummary = projectSummaries.get(event.project_code) ?? {
        project_code: event.project_code,
        event_count: 0,
        latest_event: null,
        intervention_total: 0,
      };
      projectSummary.event_count += 1;
      projectSummary.intervention_total += event.intervention_count;
      if (!projectSummary.latest_event || compareBattleEvents(event, projectSummary.latest_event) > 0) {
        projectSummary.latest_event = event;
      }
      projectSummaries.set(event.project_code, projectSummary);
    }
  }

  return {
    source_ref: BATTLE_LOG_SOURCE_REF,
    event_count: eventCount,
    project_count_with_events: projectSummaries.size,
    by_result: byResult,
    by_bottleneck_reason: byBottleneckReason,
    by_battle_mode: byBattleMode,
    by_automation_possibility: byAutomationPossibility,
    total_intervention_count: totalInterventionCount,
    latest_occurred_at: latestEvent?.occurred_at ?? null,
    projects: Array.from(projectSummaries.values())
      .map((project) => ({
        project_code: project.project_code,
        event_count: project.event_count,
        latest_occurred_at: project.latest_event?.occurred_at ?? null,
        latest_result: project.latest_event?.result ?? null,
        latest_bottleneck_reason: project.latest_event?.bottleneck_reason ?? null,
        intervention_total: project.intervention_total,
      }))
      .sort((left, right) => left.project_code.localeCompare(right.project_code)),
    skipped_row_count: skippedRowCount,
    skipped_file_count: skippedFileCount,
  };
}

async function summarizeMissions(repoRoot, diagnostics) {
  const indexPath = path.join(repoRoot, ".mission", "index.yaml");
  const exists = await pathExists(indexPath);
  if (!exists) {
    diagnostics.errors.push({
      code: "mission_index_missing",
      severity: "error",
      message: ".mission/index.yaml is missing.",
      location_hint: ".mission/index.yaml",
    });
    return { source_ref: ".mission/index.yaml", items: [], counts: {} };
  }

  const document = await readYaml(indexPath, diagnostics);
  const entries = Array.isArray(document?.entries) ? document.entries : [];
  const items = (await Promise.all(
    entries.map(async (entry) => {
      const missionId = stringValue(entry?.mission_id);
      const readinessStatus = stringValue(entry?.readiness_status);
      if (!missionId) {
        return null;
      }
      return {
        mission_id: missionId,
        title: stringValue(entry?.title),
        project_code: stringValue(entry?.project_code),
        status: stringValue(entry?.status),
        readiness_status: readinessStatus,
        workflow_id_present: Boolean(stringValue(entry?.workflow_id)),
        party_id: stringValue(entry?.party_id),
        ...(await summarizeMissionTerminalProvenance(repoRoot, missionId, readinessStatus, diagnostics)),
      };
    }),
  ))
    .filter((entry) => entry?.mission_id)
    .sort((left, right) => left.mission_id.localeCompare(right.mission_id));

  return {
    source_ref: ".mission/index.yaml",
    items,
    counts: countBy(items, (item) => item.status ?? "unknown"),
  };
}

async function summarizeMissionTerminalProvenance(repoRoot, missionId, readinessStatus, diagnostics) {
  const defaultMarkers = {
    terminal_provenance_present: false,
    terminal_provenance_complete: false,
    terminal_provenance_closed_via_mission_close: false,
    terminal_result_matches_readiness: false,
    run_pointer_present: false,
    battle_event_pointer_present: false,
  };
  const missionRoot = path.resolve(repoRoot, ".mission");
  const readinessPath = path.resolve(missionRoot, missionId, "readiness.yaml");
  if (!readinessPath.startsWith(`${missionRoot}${path.sep}`) || !(await pathExists(readinessPath))) {
    return defaultMarkers;
  }

  const document = await readYaml(readinessPath, diagnostics);
  const terminalProvenance = document?.terminal_provenance;
  if (!terminalProvenance || typeof terminalProvenance !== "object" || Array.isArray(terminalProvenance)) {
    return defaultMarkers;
  }

  const closedVia = stringValue(terminalProvenance.closed_via);
  const closedAt = stringValue(terminalProvenance.closed_at);
  const terminalResult = stringValue(terminalProvenance.terminal_result);
  const runId = stringValue(terminalProvenance.run_id);
  const battleEventId = stringValue(terminalProvenance.battle_event_id);

  return {
    terminal_provenance_present: true,
    terminal_provenance_complete: Boolean(closedVia && closedAt && terminalResult && runId && battleEventId),
    terminal_provenance_closed_via_mission_close: closedVia === "mission_close",
    terminal_result_matches_readiness: Boolean(terminalResult && readinessStatus && terminalResult === readinessStatus),
    run_pointer_present: Boolean(runId),
    battle_event_pointer_present: Boolean(battleEventId),
  };
}

async function summarizeGateway(repoRoot) {
  const gatewayStateRoot = path.join(repoRoot, "guild_hall", "state", "gateway");
  const intakeRoot = path.join(gatewayStateRoot, "intake_inbox");
  const inboxDirs = await listDirectoryNames(intakeRoot, { exclude: new Set(["_index"]) });
  const pendingMonsters = await summarizePendingMonsters(intakeRoot, inboxDirs);

  return {
    source_ref: "guild_hall/state/gateway",
    state_root_present: await pathExists(gatewayStateRoot),
    intake_inbox_present: await pathExists(intakeRoot),
    intake_inbox_count: inboxDirs.length,
    monster_index_present: await pathExists(path.join(intakeRoot, "_index", "monster_index.json")),
    pending_monsters: pendingMonsters,
    mail_fetch_state_present: await pathExists(path.join(gatewayStateRoot, "log", "mail_fetch", "state")),
    mailbox_surfaces: {
      company_present: await pathExists(path.join(gatewayStateRoot, "mailbox", "company")),
      personal_present: await pathExists(path.join(gatewayStateRoot, "mailbox", "personal")),
    },
  };
}

async function summarizePendingMonsters(intakeRoot, inboxDirs) {
  const counts = {
    by_assignment_status: {},
    by_display_group: {},
    by_family: {},
    by_due_state: {},
    by_known_status: {},
  };
  const summaries = [];
  let pendingCount = 0;
  let skippedUnreadableFiles = 0;

  for (const inboxId of inboxDirs) {
    const monstersPath = path.join(intakeRoot, inboxId, "monsters.json");
    const monsterDocument = await readJsonOrNull(monstersPath);
    if (!monsterDocument) {
      if (await pathExists(monstersPath)) {
        skippedUnreadableFiles += 1;
      }
      continue;
    }

    const monsters = Array.isArray(monsterDocument?.monsters)
      ? monsterDocument.monsters
      : Array.isArray(monsterDocument)
        ? monsterDocument
        : [];

    for (const monster of monsters) {
      if (!monster || typeof monster !== "object" || Array.isArray(monster)) {
        continue;
      }

      const assignmentStatus = stringValue(monster.assignment_status) ?? "pending_dungeon_assignment";
      if (!PENDING_MONSTER_ASSIGNMENT_STATUSES.has(assignmentStatus)) {
        continue;
      }

      const family = stringValue(monster.monster_family) ?? "unknown_monster";
      const dueState = stringValue(monster.due_state) ?? "no_due";
      const knownStatus = stringValue(monster.known_status) ?? "unknown";
      const summary = summarizePendingMonster({ inboxId, monster, assignmentStatus, family, dueState, knownStatus });
      pendingCount += 1;
      incrementCount(counts.by_assignment_status, assignmentStatus);
      incrementCount(counts.by_display_group, summary.display_group);
      incrementCount(counts.by_family, family);
      incrementCount(counts.by_due_state, dueState);
      incrementCount(counts.by_known_status, knownStatus);
      summaries.push(summary);
    }
  }

  const items = summaries.sort(comparePendingMonsterSummaries).slice(0, PENDING_MONSTER_DISPLAY_LIMIT);

  return {
    source_ref: "guild_hall/state/gateway/intake_inbox",
    count: pendingCount,
    display_limit: PENDING_MONSTER_DISPLAY_LIMIT,
    truncated: pendingCount > items.length,
    ...counts,
    items,
    skipped_unreadable_files: skippedUnreadableFiles,
    privacy: {
      mode: "sanitized_monster_summary_only",
      excluded_fields: [
        "body_text",
        "body_html",
        "body_excerpt",
        "source_quote",
        "raw_ref",
        "attachment_refs",
        "provider_message_id",
      ],
    },
  };
}

function summarizePendingMonster({ inboxId, monster, assignmentStatus, family, dueState, knownStatus }) {
  const summary = {
    monster_id: stringValue(monster.monster_id),
    inbox_id: inboxId,
    monster_family: family,
    monster_name: summaryStringValue(monster.monster_name, 80),
    work_pattern: stringValue(monster.work_pattern),
    objective_summary: summaryStringValue(monster.objective_ko, 140) ?? summaryStringValue(monster.objective, 140),
    due_state: dueState,
    d_day: stringValue(monster.d_day),
    known_status: knownStatus,
    assignment_status: assignmentStatus,
    assigned_project_code: stringValue(monster.assigned_project_code),
    assigned_stage: stringValue(monster.assigned_stage),
    project_hint_count: arrayLength(monster.project_hints),
    stage_hint_count: arrayLength(monster.stage_hints),
    mail_touch_count: numberValue(monster.mail_touch_count),
    last_mail_role: stringValue(monster.last_mail_role),
    mission_ref_present: Boolean(stringValue(monster.mission_ref)),
  };
  const displayGroup = classifyPendingMonsterDisplayGroup(summary);

  return {
    ...summary,
    display_group: displayGroup.id,
    display_group_label: displayGroup.label,
    display_group_rank: displayGroup.rank,
  };
}

function classifyPendingMonsterDisplayGroup(monster) {
  let groupId = "open_intake";

  if (monster.assignment_status === "blocked") {
    groupId = "blocked";
  } else if (monster.due_state && monster.due_state !== "no_due") {
    groupId = "due_watch";
  } else if (monster.assigned_project_code || monster.assigned_stage || monster.mission_ref_present) {
    groupId = "assigned_route";
  } else if (monster.project_hint_count > 0 || monster.stage_hint_count > 0) {
    groupId = "routing_hints";
  } else if (monster.monster_family === "unknown_monster" || monster.known_status === "unknown") {
    groupId = "needs_identification";
  }

  return PENDING_MONSTER_DISPLAY_GROUP_BY_ID.get(groupId) ?? PENDING_MONSTER_DISPLAY_GROUP_BY_ID.get("open_intake");
}

function comparePendingMonsterSummaries(left, right) {
  return (
    numberSortValue(left.display_group_rank) - numberSortValue(right.display_group_rank) ||
    stringSortValue(left.due_state).localeCompare(stringSortValue(right.due_state)) ||
    stringSortValue(left.monster_id).localeCompare(stringSortValue(right.monster_id))
  );
}

function numberSortValue(value) {
  return typeof value === "number" ? value : Number.MAX_SAFE_INTEGER;
}

function stringSortValue(value) {
  return typeof value === "string" ? value : "";
}

async function summarizePrivateState(repoRoot) {
  const root = path.join(repoRoot, "private-state");
  const present = await pathExists(root);
  return {
    present,
    source_ref: "private-state",
    mode: "nested_private_repo",
    git_present: await pathExists(path.join(root, ".git")),
    git_status: present ? summarizeGit(root) : summarizeEmptyGit(),
    continuity_surfaces: {
      gateway_present: await pathExists(path.join(root, "guild_hall", "state", "gateway")),
      activity_present: await pathExists(path.join(root, "guild_hall", "state", "operations", "soulforge_activity")),
    },
  };
}

async function summarizeKnowledgeLane(repoRoot) {
  const surface = await collectKnowledgeLaneSurfaceSignals(repoRoot);
  const blockers = buildKnowledgeLaneBlockers(surface);

  return {
    schema_version: KNOWLEDGE_LANE_VERSION,
    source_ref: KNOWLEDGE_LANE_REFS.operatingModel,
    privacy: {
      mode: "sanitized_metadata_only",
      source_fields: [
        "known public helper/doc/workflow/fixture path presence",
        "known private evidence directory presence and counts",
        "owner-gate and claim-ceiling metadata",
      ],
      excluded_fields: [
        "auth/session data",
        "NotebookLM query, answer, or source payloads",
        "private report prose",
        "private evidence filenames",
        "ontology candidate statements",
        "owner decisions",
        "graph mutation payloads",
        "registry promotion claims",
      ],
    },
    owner_gated: {
      state: classifyKnowledgeLaneOwnerGate(surface, blockers),
      required_before: ["claim upgrade", "ontology acceptance", "graph update", "registry promotion"],
      snapshot_authority: "metadata_status_only",
    },
    helper: surface.helper,
    workflows: surface.workflows,
    fixtures: surface.fixtures,
    ontology: surface.ontology,
    public_surface_count: surface.public_surface_count,
    evidence: {
      present: surface.evidence.present,
      total_surface_count: surface.evidence.total_surface_count,
      private_surface_count: surface.evidence.private_surface_count,
      counts: surface.evidence.counts,
    },
    claim_ceiling: KNOWLEDGE_LANE_CLAIM_CEILING,
    claim_note: "Snapshot observes lane metadata only; it does not validate knowledge, accept ontology, record owner decisions, mutate graphs, or promote registry canon.",
    blockers,
    next_owner_review_action: buildKnowledgeLaneNextOwnerReviewAction(surface, blockers),
  };
}

async function collectKnowledgeLaneSurfaceSignals(repoRoot) {
  const helperRoot = path.join(repoRoot, KNOWLEDGE_LANE_REFS.helperRoot);
  const knowledgeWorkflowRoot = path.join(repoRoot, KNOWLEDGE_LANE_REFS.knowledgeAccessWorkflow);
  const sourceboundWorkflowRoot = path.join(repoRoot, KNOWLEDGE_LANE_REFS.sourceboundWorkflow);
  const notebooklmFixtureRoot = path.join(repoRoot, KNOWLEDGE_LANE_REFS.notebooklmFixture);
  const systemKnowledgeAccessRoot = path.join(repoRoot, "_workmeta", "system", "reports", "knowledge_access");
  const systemProcedureCaptureRoot = path.join(repoRoot, "_workmeta", "system", "reports", "procedure_capture");
  const localActivityRoot = path.join(repoRoot, "guild_hall", "state", "operations", "soulforge_activity");
  const privateActivityRoot = path.join(repoRoot, "private-state", "guild_hall", "state", "operations", "soulforge_activity");

  const helper = {
    source_ref: KNOWLEDGE_LANE_REFS.helperRoot,
    present: await pathExists(helperRoot),
    readme_present: await pathExists(path.join(helperRoot, "README.md")),
    cli_present: await pathExists(path.join(helperRoot, "cli.mjs")),
    ledger_present: await pathExists(path.join(helperRoot, "ledger.mjs")),
    notebooklm_bridge_present: await pathExists(path.join(helperRoot, "notebooklm_bridge.mjs")),
    test_present: await pathExists(path.join(helperRoot, "knowledge_access.test.mjs")),
  };

  const workflows = {
    knowledge_access_event_capture_v0: {
      source_ref: KNOWLEDGE_LANE_REFS.knowledgeAccessWorkflow,
      present: await pathExists(path.join(knowledgeWorkflowRoot, "workflow.yaml")),
      template_count: await countDirectoryEntries(path.join(knowledgeWorkflowRoot, "templates"), { filesOnly: true }),
    },
    sourcebound_knowledge_packet_operating_loop_v0: {
      source_ref: KNOWLEDGE_LANE_REFS.sourceboundWorkflow,
      present: await pathExists(path.join(sourceboundWorkflowRoot, "workflow.yaml")),
      template_count: await countDirectoryEntries(path.join(sourceboundWorkflowRoot, "templates"), { filesOnly: true }),
    },
  };
  workflows.present_count = countPresentBooleans([
    workflows.knowledge_access_event_capture_v0.present,
    workflows.sourcebound_knowledge_packet_operating_loop_v0.present,
  ]);

  const fixtures = {
    notebooklm_bridge_public_synthetic_present: await pathExists(notebooklmFixtureRoot),
    notebooklm_bridge_public_synthetic_file_count: await countDirectoryEntries(notebooklmFixtureRoot, { filesOnly: true }),
    source_ref: KNOWLEDGE_LANE_REFS.notebooklmFixture,
  };

  const ontology = {
    review_manual_present: await pathExists(path.join(repoRoot, KNOWLEDGE_LANE_REFS.ontologyReviewManual)),
    model_present: await pathExists(path.join(repoRoot, KNOWLEDGE_LANE_REFS.ontologyModel)),
    sourcebound_template_present: await pathExists(
      path.join(sourceboundWorkflowRoot, "templates", "ontology_candidate_rule_register.template.yaml"),
    ),
    source_refs: [KNOWLEDGE_LANE_REFS.ontologyReviewManual, KNOWLEDGE_LANE_REFS.ontologyModel],
  };

  const projectCodes = await listProjectCodes(path.join(repoRoot, "_workmeta"), {
    exclude: WORKMETA_NON_PROJECT_ROOTS,
    requireSurface: true,
  });
  const projectSurfaceDirs = [];
  const projectEvidenceCounts = {
    project_knowledge_access_surface_count: 0,
    project_procedure_capture_surface_count: 0,
    project_ontology_surface_count: 0,
  };

  for (const projectCode of projectCodes) {
    const projectRoot = path.join(repoRoot, "_workmeta", projectCode);
    const knowledgeAccessRoot = path.join(projectRoot, "reports", "knowledge_access");
    const procedureCaptureRoot = path.join(projectRoot, "reports", "procedure_capture");
    const ontologyRoot = path.join(projectRoot, "ontology");
    projectSurfaceDirs.push(knowledgeAccessRoot, procedureCaptureRoot, ontologyRoot);

    if ((await countKnowledgeAccessEntryFiles(knowledgeAccessRoot)) > 0) {
      projectEvidenceCounts.project_knowledge_access_surface_count += 1;
    }
    if (await pathExists(procedureCaptureRoot)) {
      projectEvidenceCounts.project_procedure_capture_surface_count += 1;
    }
    if (await pathExists(ontologyRoot)) {
      projectEvidenceCounts.project_ontology_surface_count += 1;
    }
  }

  const systemKnowledgeAccessEntryCount = await countKnowledgeAccessEntryFiles(systemKnowledgeAccessRoot);
  const evidenceCounts = {
    ...projectEvidenceCounts,
    system_knowledge_access_present: await pathExists(systemKnowledgeAccessRoot),
    system_knowledge_access_entry_count: systemKnowledgeAccessEntryCount,
    system_procedure_capture_present: await pathExists(systemProcedureCaptureRoot),
    system_procedure_capture_entry_count: await countDirectoryEntries(systemProcedureCaptureRoot, { filesOnly: true }),
    local_activity_surface_present: await pathExists(localActivityRoot),
    private_activity_mirror_present: await pathExists(privateActivityRoot),
  };
  const privateSurfaceCount =
    projectEvidenceCounts.project_knowledge_access_surface_count +
    projectEvidenceCounts.project_procedure_capture_surface_count +
    projectEvidenceCounts.project_ontology_surface_count +
    countPresentBooleans([
      systemKnowledgeAccessEntryCount > 0,
      evidenceCounts.system_procedure_capture_present,
      evidenceCounts.local_activity_surface_present,
      evidenceCounts.private_activity_mirror_present,
    ]);
  const publicSurfaceCount = countPresentBooleans([
    await pathExists(path.join(repoRoot, KNOWLEDGE_LANE_REFS.operatingModel)),
    helper.present,
    helper.cli_present,
    helper.ledger_present,
    helper.notebooklm_bridge_present,
    workflows.knowledge_access_event_capture_v0.present,
    workflows.sourcebound_knowledge_packet_operating_loop_v0.present,
    fixtures.notebooklm_bridge_public_synthetic_present,
    ontology.review_manual_present,
    ontology.model_present,
    ontology.sourcebound_template_present,
  ]);

  return {
    helper,
    workflows,
    fixtures,
    ontology,
    public_surface_count: publicSurfaceCount,
    evidence: {
      present: privateSurfaceCount > 0,
      total_surface_count: privateSurfaceCount,
      private_surface_count: privateSurfaceCount,
      counts: evidenceCounts,
    },
    latest_surface_mtime_ms: await latestMtimeMs([
      path.join(repoRoot, KNOWLEDGE_LANE_REFS.operatingModel),
      helperRoot,
      path.join(helperRoot, "cli.mjs"),
      path.join(helperRoot, "ledger.mjs"),
      path.join(helperRoot, "notebooklm_bridge.mjs"),
      knowledgeWorkflowRoot,
      path.join(knowledgeWorkflowRoot, "templates"),
      sourceboundWorkflowRoot,
      path.join(sourceboundWorkflowRoot, "templates"),
      notebooklmFixtureRoot,
      path.join(repoRoot, KNOWLEDGE_LANE_REFS.ontologyReviewManual),
      path.join(repoRoot, KNOWLEDGE_LANE_REFS.ontologyModel),
      systemKnowledgeAccessRoot,
      systemProcedureCaptureRoot,
      localActivityRoot,
      privateActivityRoot,
      ...projectSurfaceDirs,
    ]),
  };
}

function buildKnowledgeLaneBlockers(surface) {
  const blockers = [];

  if (!surface.helper.present || !surface.helper.cli_present || !surface.helper.ledger_present) {
    blockers.push({
      id: "knowledge_access_helper_incomplete",
      severity: "blocking",
      summary: "Knowledge access helper metadata surface is missing or incomplete.",
    });
  }
  if (surface.workflows.present_count < 2) {
    blockers.push({
      id: "knowledge_workflow_surface_incomplete",
      severity: "blocking",
      summary: "Knowledge capture/sourcebound workflow metadata surface is incomplete.",
    });
  }
  if (!surface.fixtures.notebooklm_bridge_public_synthetic_present) {
    blockers.push({
      id: "notebooklm_public_fixture_missing",
      severity: "warning",
      summary: "Public synthetic NotebookLM bridge fixture surface is not present.",
    });
  }
  if (!surface.evidence.present) {
    blockers.push({
      id: "metadata_evidence_surface_missing",
      severity: "warning",
      summary: "No private/local metadata evidence surface was detected.",
    });
  }

  blockers.push({
    id: "owner_review_required_for_claim_upgrade",
    severity: "gate",
    summary: "Owner/review approval is required before claim upgrades, ontology acceptance, graph updates, or registry promotion.",
  });

  return blockers;
}

function classifyKnowledgeLaneOwnerGate(surface, blockers) {
  return expectedKnowledgeLaneOwnerGateState({ blockers, evidencePresent: surface.evidence.present });
}

function expectedKnowledgeLaneOwnerGateState({ blockers, evidencePresent }) {
  if (blockers.some((blocker) => blocker.severity === "blocking")) {
    return "blocked_missing_surface";
  }
  if (!evidencePresent) {
    return "awaiting_metadata_evidence";
  }
  return "owner_review_required";
}

function buildKnowledgeLaneNextOwnerReviewAction(surface) {
  if (!surface.helper.present || surface.workflows.present_count < 2) {
    return "Restore the public helper/workflow metadata surfaces before reviewing knowledge lane evidence.";
  }
  if (!surface.evidence.present) {
    return "Capture metadata-only evidence in the correct private/local owner before requesting claim or ontology review.";
  }
  return "Review only the metadata counts and blockers, then keep the lane at observed unless source support and an owner/review route justify a stronger claim.";
}

function buildOperationBoardProjection({ projects, missions, gateway, knowledgeLane, battleLog, nextActions, diagnostics }) {
  const missionItems = Array.isArray(missions.items) ? missions.items : [];
  const pendingMonsters = gateway.pending_monsters ?? {};
  const pendingMonsterItems = Array.isArray(pendingMonsters.items) ? pendingMonsters.items : [];
  const pendingByDisplayGroup = pendingMonsters.by_display_group ?? {};

  return {
    schema_version: OPERATION_BOARD_VERSION,
    source_ref: "soulforge_snapshot.json",
    privacy: {
      mode: "public_safe_snapshot_projection",
      source_fields: ["projects", "missions", "gateway.pending_monsters", "knowledge_lane", "battle_log", "next_actions", "diagnostics"],
      excluded_fields: [
        "mail body/html",
        "source quote",
        "raw refs",
        "attachment refs",
        "provider ids",
        "secret values",
        "NotebookLM payloads",
        "private report prose",
        "ontology candidate statements",
        "owner decisions",
        "battle log event ids",
        "battle log mission ids",
        "battle log stage text",
        "battle log source refs",
        "battle log party/unit/loop ids",
        "battle log next action notes",
        "battle log rendered markdown prose",
      ],
    },
    summary: {
      project_count: projects.length,
      workspace_project_count: projects.filter((project) => project.workspace?.present).length,
      workmeta_project_count: projects.filter((project) => project.workmeta?.present).length,
      mission_count: missionItems.length,
      blocked_mission_count: countMissionsByGroup(missionItems, "blocked"),
      ready_mission_count: countMissionsByGroup(missionItems, "ready"),
      pending_monster_count: numberValue(pendingMonsters.count) ?? 0,
      blocked_monster_count: numberValue(pendingByDisplayGroup.blocked) ?? 0,
      due_watch_monster_count: numberValue(pendingByDisplayGroup.due_watch) ?? 0,
      battle_log_event_count: numberValue(battleLog.event_count) ?? 0,
      battle_log_project_count_with_events: numberValue(battleLog.project_count_with_events) ?? 0,
      knowledge_lane_state: knowledgeLane.owner_gated?.state ?? "unknown",
      knowledge_evidence_surface_count: numberValue(knowledgeLane.evidence?.total_surface_count) ?? 0,
      next_action_count: nextActions.length,
      diagnostics_status: diagnostics.summary.highest_severity,
    },
    sections: {
      dungeon_map: buildOperationBoardDungeonMap({ projects, missionItems, pendingMonsterItems }),
      mission_board: buildOperationBoardMissionBoard({ missionItems, missionCounts: missions.counts ?? {} }),
      monster_gate: buildOperationBoardMonsterGate({ pendingMonsters, pendingMonsterItems }),
      knowledge_lane: buildOperationBoardKnowledgeLane(knowledgeLane),
      battle_log: cloneJson(battleLog),
      action_queue: buildOperationBoardActionQueue(nextActions),
    },
  };
}

function buildOperationBoardDungeonMap({ projects, missionItems, pendingMonsterItems }) {
  return {
    label: "Dungeon Map",
    items: projects.map((project) => {
      const projectMissions = missionItems.filter((mission) => mission.project_code === project.project_code);
      const projectMonsters = pendingMonsterItems.filter((monster) => monster.assigned_project_code === project.project_code);

      return {
        project_code: project.project_code,
        workspace_present: Boolean(project.workspace?.present),
        workmeta_present: Boolean(project.workmeta?.present),
        contract_present: Boolean(project.workmeta?.contract_present),
        bindings_count: numberValue(project.workmeta?.bindings_count) ?? 0,
        report_surface_count: Array.isArray(project.workmeta?.report_surfaces) ? project.workmeta.report_surfaces.length : 0,
        mission_count: projectMissions.length,
        blocked_mission_count: countMissionsByGroup(projectMissions, "blocked"),
        pending_monster_count: projectMonsters.length,
        surface_status: classifyProjectSurfaceStatus(project),
      };
    }),
  };
}

function buildOperationBoardMissionBoard({ missionItems, missionCounts }) {
  const items = missionItems
    .map((mission) => {
      const displayGroup = classifyMissionBoardDisplayGroup(mission);
      return {
        mission_id: mission.mission_id,
        title: mission.title,
        project_code: mission.project_code,
        status: mission.status,
        readiness_status: mission.readiness_status,
        workflow_id_present: mission.workflow_id_present,
        party_id: mission.party_id,
        terminal_provenance_present: mission.terminal_provenance_present,
        terminal_provenance_complete: mission.terminal_provenance_complete,
        terminal_provenance_closed_via_mission_close: mission.terminal_provenance_closed_via_mission_close,
        terminal_result_matches_readiness: mission.terminal_result_matches_readiness,
        run_pointer_present: mission.run_pointer_present,
        battle_event_pointer_present: mission.battle_event_pointer_present,
        display_group: displayGroup.id,
        display_group_label: displayGroup.label,
        display_group_rank: displayGroup.rank,
      };
    })
    .sort(compareBoardItems);

  return {
    label: "Mission Board",
    counts_by_status: missionCounts,
    counts_by_display_group: countBy(items, (item) => item.display_group),
    items,
  };
}

function buildOperationBoardMonsterGate({ pendingMonsters, pendingMonsterItems }) {
  return {
    label: "Monster Gate",
    count: numberValue(pendingMonsters.count) ?? 0,
    display_limit: numberValue(pendingMonsters.display_limit) ?? 0,
    truncated: Boolean(pendingMonsters.truncated),
    groups: PENDING_MONSTER_DISPLAY_GROUPS.map((group) => ({
      id: group.id,
      label: group.label,
      rank: group.rank,
      total: numberValue(pendingMonsters.by_display_group?.[group.id]) ?? 0,
      items: pendingMonsterItems.filter((monster) => monster.display_group === group.id),
    })),
  };
}

function buildOperationBoardKnowledgeLane(knowledgeLane) {
  return {
    label: "Knowledge Lane",
    owner_gated_state: knowledgeLane.owner_gated?.state ?? "unknown",
    claim_ceiling: knowledgeLane.claim_ceiling ?? KNOWLEDGE_LANE_CLAIM_CEILING,
    helper_present: Boolean(knowledgeLane.helper?.present),
    notebooklm_bridge_present: Boolean(knowledgeLane.helper?.notebooklm_bridge_present),
    workflow_present_count: numberValue(knowledgeLane.workflows?.present_count) ?? 0,
    fixture_present: Boolean(knowledgeLane.fixtures?.notebooklm_bridge_public_synthetic_present),
    evidence_present: Boolean(knowledgeLane.evidence?.present),
    evidence_surface_count: numberValue(knowledgeLane.evidence?.total_surface_count) ?? 0,
    evidence_counts: knowledgeLane.evidence?.counts ?? {},
    blockers: Array.isArray(knowledgeLane.blockers) ? knowledgeLane.blockers : [],
    next_owner_review_action: knowledgeLane.next_owner_review_action,
  };
}

function buildOperationBoardActionQueue(nextActions) {
  return {
    label: "Next Actions",
    items: nextActions.map((action, index) => ({
      id: action.id,
      status: action.status,
      summary: action.summary,
      rank: index + 1,
    })),
  };
}

function classifyProjectSurfaceStatus(project) {
  if (!project.workspace?.present && !project.workmeta?.present) {
    return "missing";
  }
  if (!project.workspace?.present) {
    return "workspace_missing";
  }
  if (!project.workmeta?.present) {
    return "workmeta_missing";
  }
  if (!project.workmeta?.contract_present) {
    return "contract_missing";
  }
  return "ready";
}

function classifyMissionBoardDisplayGroup(mission) {
  let groupId = "other";
  const status = mission.status;
  const readinessStatus = mission.readiness_status;

  if (status === "blocked" || readinessStatus === "blocked") {
    groupId = "blocked";
  } else if (readinessStatus === "ready") {
    groupId = "ready";
  } else if (status === "completed" || readinessStatus === "completed" || status === "closed" || readinessStatus === "closed") {
    groupId = "completed";
  } else if (status === "held" || status === "started" || status === "in_progress" || status === "active") {
    groupId = "active";
  }

  return MISSION_BOARD_DISPLAY_GROUP_BY_ID.get(groupId) ?? MISSION_BOARD_DISPLAY_GROUP_BY_ID.get("other");
}

function countMissionsByGroup(missions, groupId) {
  return missions.filter((mission) => classifyMissionBoardDisplayGroup(mission).id === groupId).length;
}

function compareBoardItems(left, right) {
  return (
    numberSortValue(left.display_group_rank) - numberSortValue(right.display_group_rank) ||
    stringSortValue(left.project_code).localeCompare(stringSortValue(right.project_code)) ||
    stringSortValue(left.mission_id).localeCompare(stringSortValue(right.mission_id)) ||
    stringSortValue(left.id).localeCompare(stringSortValue(right.id))
  );
}

function compareBattleEvents(left, right) {
  const timeDiff = Date.parse(left.occurred_at) - Date.parse(right.occurred_at);
  if (timeDiff !== 0) {
    return timeDiff;
  }
  return stringSortValue(left.event_id).localeCompare(stringSortValue(right.event_id));
}

function summarizeRepo(repoRoot) {
  return {
    root: ".",
    branch: gitOutput(repoRoot, ["branch", "--show-current"]) || null,
    git_status: summarizeGit(repoRoot),
  };
}

function summarizeGit(cwd) {
  const status = gitOutput(cwd, ["status", "--porcelain"]);
  if (status === null) {
    return {
      available: false,
      dirty: null,
      changed_entries: null,
    };
  }

  const lines = status ? status.split("\n").filter(Boolean) : [];
  return {
    available: true,
    dirty: lines.length > 0,
    changed_entries: lines.length,
  };
}

function summarizeEmptyGit() {
  return {
    available: false,
    dirty: null,
    changed_entries: null,
  };
}

function gitOutput(cwd, args) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });

  if (result.status !== 0) {
    return null;
  }
  return result.stdout.trim();
}

async function listProjectCodes(root, options = {}) {
  const entries = await listDirectoryNames(root, options);
  if (!options.requireSurface) {
    return entries;
  }

  const result = [];
  for (const entry of entries) {
    const candidateRoot = path.join(root, entry);
    if (
      (await pathExists(path.join(candidateRoot, "contract.yaml"))) ||
      (await pathExists(path.join(candidateRoot, "bindings"))) ||
      (await pathExists(path.join(candidateRoot, "reports")))
    ) {
      result.push(entry);
    }
  }
  return result;
}

async function collectBattleEventFileSurfaces(repoRoot) {
  const workmetaRoot = path.join(repoRoot, "_workmeta");
  const projectCodes = await listDirectoryNames(workmetaRoot, { exclude: WORKMETA_NON_PROJECT_ROOTS });
  const files = [];

  for (const projectCode of projectCodes) {
    const eventsRoot = path.join(workmetaRoot, projectCode, "log", "events");
    const projectFiles = await collectBattleEventFiles(eventsRoot);
    for (const filePath of projectFiles) {
      files.push({
        project_code: projectCode,
        file_path: filePath,
        stat: await statPath(filePath),
      });
    }
  }

  return files.sort((left, right) => left.file_path.localeCompare(right.file_path));
}

async function collectBattleEventFiles(root) {
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      const entryPath = path.join(root, entry.name);
      if (entry.isDirectory()) {
        files.push(...(await collectBattleEventFiles(entryPath)));
      } else if (entry.isFile() && entry.name === "battle_events.jsonl") {
        files.push(entryPath);
      }
    }
    return files.sort();
  } catch {
    return [];
  }
}

async function listDirectoryNames(root, options = {}) {
  const exclude = options.exclude ?? new Set();
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => !name.startsWith("."))
      .filter((name) => !exclude.has(name))
      .sort();
  } catch {
    return [];
  }
}

async function readDirectoryEntries(root, exclude = new Set()) {
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    return entries
      .filter((entry) => !entry.name.startsWith("."))
      .filter((entry) => !exclude.has(entry.name));
  } catch {
    return [];
  }
}

async function statPath(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return {
      present: true,
      entry_type: stat.isFile() ? "file" : stat.isDirectory() ? "directory" : "other",
      mtime_ms: Math.trunc(stat.mtimeMs),
      size_bytes: stat.isFile() ? stat.size : null,
    };
  } catch {
    return {
      present: false,
      entry_type: null,
      mtime_ms: null,
      size_bytes: null,
    };
  }
}

async function latestMtimeMs(paths) {
  let latest = null;
  for (const filePath of paths) {
    const stat = await statPath(filePath);
    if (!stat.present || stat.mtime_ms === null) {
      continue;
    }
    latest = latest === null ? stat.mtime_ms : Math.max(latest, stat.mtime_ms);
  }
  return latest;
}

async function countDirectoryEntries(root, options = {}) {
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    if (options.filesOnly) {
      return entries.filter((entry) => entry.isFile()).length;
    }
    if (options.directoriesOnly) {
      return entries.filter((entry) => entry.isDirectory()).length;
    }
    return entries.length;
  } catch {
    return 0;
  }
}

async function countKnowledgeAccessEntryFiles(root) {
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    return entries.filter((entry) => entry.isFile() && !isAuthSessionEntryName(entry.name)).length;
  } catch {
    return 0;
  }
}

function isAuthSessionEntryName(name) {
  return AUTH_SESSION_ENTRY_NAME_PATTERN.test(name);
}

async function readYaml(filePath, diagnostics) {
  try {
    const text = await fs.readFile(filePath, "utf8");
    return YAML.parse(text.replace(/^\uFEFF/, ""));
  } catch (error) {
    diagnostics.errors.push({
      code: "yaml_read_failed",
      severity: "error",
      message: error instanceof Error ? error.message : String(error),
      location_hint: path.relative(defaultRepoRoot, filePath).split(path.sep).join("/"),
    });
    return null;
  }
}

function countBy(items, getKey) {
  const counts = {};
  for (const item of items) {
    const key = getKey(item);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function incrementCount(counts, key) {
  counts[key] = (counts[key] ?? 0) + 1;
}

function stringValue(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function summaryStringValue(value, maxLength) {
  const text = stringValue(value)?.replace(/\s+/g, " ");
  if (!text) {
    return null;
  }
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
}

function numberValue(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function arrayLength(value) {
  return Array.isArray(value) ? value.length : 0;
}

function countPresentBooleans(values) {
  return values.filter(Boolean).length;
}

async function readJsonOrNull(filePath) {
  try {
    return await readJson(filePath);
  } catch {
    return null;
  }
}

function createDiagnostics() {
  return {
    warnings: [],
    errors: [],
  };
}

function finalizeDiagnostics(diagnostics) {
  return {
    summary: {
      warnings: diagnostics.warnings.length,
      errors: diagnostics.errors.length,
      highest_severity: diagnostics.errors.length > 0 ? "error" : diagnostics.warnings.length > 0 ? "warning" : "ok",
    },
    warnings: diagnostics.warnings,
    errors: diagnostics.errors,
  };
}

function buildValidationResult(errors) {
  return {
    ok: errors.length === 0,
    errors,
  };
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function withObservationSignature(item) {
  const { signature, ...payload } = item;
  return {
    ...payload,
    signature: hashStable(payload),
  };
}

function compareObservationItems(storedItems = [], currentItems = []) {
  const stored = new Map((Array.isArray(storedItems) ? storedItems : []).map((item) => [item.id, item]));
  const current = new Map((Array.isArray(currentItems) ? currentItems : []).map((item) => [item.id, item]));
  const ids = Array.from(new Set([...stored.keys(), ...current.keys()])).sort();
  const changes = [];

  for (const id of ids) {
    const storedItem = stored.get(id);
    const currentItem = current.get(id);
    if (!storedItem) {
      changes.push({
        id,
        source_ref: currentItem?.source_ref ?? id,
        change_type: "new_source",
      });
      continue;
    }
    if (!currentItem) {
      changes.push({
        id,
        source_ref: storedItem.source_ref ?? id,
        change_type: "removed_source",
      });
      continue;
    }
    if (storedItem.signature !== currentItem.signature) {
      changes.push({
        id,
        source_ref: currentItem.source_ref ?? storedItem.source_ref ?? id,
        change_type: "changed",
      });
    }
  }

  return changes;
}

function hashStable(value) {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function stableStringify(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}
