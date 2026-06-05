import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import {
  addIssue,
  asObject,
  asString,
  repoRelative,
  repoRoot,
  type LintIssue,
  type LintResult
} from "./shared";

const SNAPSHOT_VERSION = "soulforge.snapshot.v0";
const OPERATION_BOARD_VERSION = "soulforge.operation_board_projection.v0";
const PUBLIC_SAFE_PRIVACY_MODE = "public_safe_snapshot_projection";
const BATTLE_LOG_AGGREGATE_REF = "_workmeta/*/log/events/**/battle_events.jsonl";
const fixtureDir = path.resolve(repoRoot, "fixtures/operation-board");

const DUNGEON_MAP_ITEM_FIELDS = new Set([
  "project_code",
  "workspace_present",
  "workmeta_present",
  "contract_present",
  "bindings_count",
  "report_surface_count",
  "mission_count",
  "blocked_mission_count",
  "pending_monster_count",
  "surface_status"
]);

const MISSION_BOARD_ITEM_FIELDS = new Set([
  "mission_id",
  "title",
  "project_code",
  "status",
  "readiness_status",
  "workflow_id_present",
  "party_id",
  "terminal_provenance_present",
  "terminal_provenance_complete",
  "terminal_provenance_closed_via_mission_close",
  "terminal_result_matches_readiness",
  "run_pointer_present",
  "battle_event_pointer_present",
  "display_group",
  "display_group_label",
  "display_group_rank"
]);

const MONSTER_GATE_GROUPS = [
  { id: "blocked", label: "Blocked", rank: 10 },
  { id: "due_watch", label: "Due watch", rank: 20 },
  { id: "assigned_route", label: "Assigned route", rank: 30 },
  { id: "routing_hints", label: "Routing hints", rank: 40 },
  { id: "needs_identification", label: "Needs identification", rank: 50 },
  { id: "open_intake", label: "Open intake", rank: 60 }
] as const;

const MONSTER_GATE_GROUP_FIELDS = new Set(["id", "label", "rank", "total", "items"]);

const MONSTER_GATE_ITEM_FIELDS = new Set([
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
  "display_group_rank"
]);

const ACTION_QUEUE_ITEM_FIELDS = new Set(["id", "status", "summary", "rank"]);
const NEXT_ACTION_FIELDS = new Set(["id", "status", "summary"]);
const NEXT_ACTION_STATUSES = new Set(["started", "next"]);
const KNOWLEDGE_LANE_BLOCKER_FIELDS = new Set(["id", "severity", "summary"]);
const BATTLE_LOG_PROJECT_FIELDS = new Set(["project_code", "event_count", "latest_occurred_at"]);
const DIAGNOSTIC_ITEM_FIELDS = new Set(["id", "severity", "summary"]);

const REQUIRED_SECTIONS = [
  "dungeon_map",
  "mission_board",
  "monster_gate",
  "knowledge_lane",
  "battle_log",
  "action_queue",
  "diagnostics"
] as const;

const FORBIDDEN_MARKERS: Array<{ label: string; pattern: RegExp }> = [
  { label: "raw marker", pattern: /\braw(?:[_ -]?(?:payload|body|html|text|ref|source|mail))?\b/i },
  { label: "private marker", pattern: /\bprivate(?:[_ -]?(?:state|payload|report|path|ref|body|text))?\b|private-state\//i },
  { label: "workspace payload path", pattern: /_workspaces\//i },
  { label: "state payload path", pattern: /guild_hall\/state\//i },
  { label: "workmeta payload path", pattern: /_workmeta\//i },
  { label: "source marker", pattern: /\bsource(?:[_ -]?(?:ref|fields|quote|text|body|payload|raw|path|file|url|chunk))?\b/i },
  { label: "attachment marker", pattern: /\battachment(?:s|[_ -]?(?:ref|payload|path|file|id))?\b/i },
  { label: "provider marker", pattern: /\bprovider(?:[_ -]?(?:id|payload|raw|message|response|token|ref))?\b/i },
  { label: "secret marker", pattern: /\b(secret|token|credential|cookie|session|authorization|bearer)\b/i },
  { label: "mail body/html marker", pattern: /\bmail[_ -]?(?:body|html|raw|payload|text)\b|\b(?:body|html)[_ -]?mail\b|\bbody_html\b|\bhtml_body\b/i },
  { label: "file URL", pattern: /file:\/\/\//i },
  { label: "local absolute path", pattern: /(^|[^A-Za-z0-9_])(?:\/(?:Users|Volumes|home|mnt|var|tmp|private)\/|[A-Za-z]:\\\\)/i },
  {
    label: "NotebookLM payload marker",
    pattern: /notebooklm[_ -]?(?:answer|question|query|payload|body|html|source|quote|response|prompt|session|auth|token)|DO_NOT_LEAK_NOTEBOOK/i
  }
];

const BATTLE_LOG_FORBIDDEN_KEYS = new Set([
  "events",
  "event_rows",
  "rows",
  "items",
  "event_id",
  "event_ref",
  "mission_id",
  "stage",
  "source_ref",
  "party_id",
  "unit_id",
  "loop_id",
  "next_action_note",
  "rendered_markdown"
]);

interface OperationBoardFixture {
  repoPath: string;
  payload: Record<string, unknown>;
}

type PathPart = string | number;

export function runOperationBoardFixtureLint() {
  const issues: LintIssue[] = [];
  const fixtures = loadOperationBoardFixtures(issues);

  for (const fixture of fixtures) {
    lintFixture(fixture, issues);
  }

  return {
    name: "operation board fixture lint",
    issues
  } satisfies LintResult;
}

function loadOperationBoardFixtures(issues: LintIssue[]) {
  if (!existsSync(fixtureDir)) {
    addIssue(issues, "missing-fixture-dir", "fixtures/operation-board", "operation-board fixture directory must exist");
    return [];
  }

  const fileNames = readdirSync(fixtureDir)
    .filter((fileName) => fileName.endsWith(".sample.json"))
    .sort();

  if (fileNames.length === 0) {
    addIssue(issues, "missing-fixture", "fixtures/operation-board", "at least one *.sample.json fixture must exist");
    return [];
  }

  return fileNames.flatMap((fileName) => {
    const absolutePath = path.resolve(fixtureDir, fileName);
    const repoPath = repoRelative(absolutePath);
    const text = readFileSync(absolutePath, "utf-8");

    try {
      const payload = JSON.parse(text) as Record<string, unknown>;
      return [{ repoPath, payload } satisfies OperationBoardFixture];
    } catch (error) {
      addIssue(issues, "json-parse", repoPath, error instanceof Error ? error.message : "fixture JSON is invalid");
      return [];
    }
  });
}

function lintFixture(fixture: OperationBoardFixture, issues: LintIssue[]) {
  scanForbiddenMarkers(fixture.payload, [], fixture.repoPath, issues);

  if (fixture.payload.schema_version !== SNAPSHOT_VERSION) {
    addIssue(
      issues,
      "schema-version",
      fixture.repoPath,
      `schema_version must be ${SNAPSHOT_VERSION}, got ${String(fixture.payload.schema_version)}`
    );
  }

  const operationBoard = requireObject(fixture.payload.operation_board, "operation_board", fixture.repoPath, issues);
  if (!operationBoard) {
    return;
  }

  if (operationBoard.schema_version !== OPERATION_BOARD_VERSION) {
    addIssue(
      issues,
      "operation-board-schema-version",
      fixture.repoPath,
      `operation_board.schema_version must be ${OPERATION_BOARD_VERSION}, got ${String(operationBoard.schema_version)}`
    );
  }

  const privacy = requireObject(operationBoard.privacy, "operation_board.privacy", fixture.repoPath, issues);
  if (asString(privacy?.mode) !== PUBLIC_SAFE_PRIVACY_MODE) {
    addIssue(
      issues,
      "operation-board-privacy-mode",
      fixture.repoPath,
      `operation_board.privacy.mode must be ${PUBLIC_SAFE_PRIVACY_MODE}`
    );
  }

  const summary = requireObject(operationBoard.summary, "operation_board.summary", fixture.repoPath, issues);
  const sections = requireObject(operationBoard.sections, "operation_board.sections", fixture.repoPath, issues);
  if (!summary || !sections) {
    return;
  }

  for (const section of REQUIRED_SECTIONS) {
    requireObject(sections[section], `operation_board.sections.${section}`, fixture.repoPath, issues);
  }

  const dungeonMap = asObject(sections.dungeon_map);
  const missionBoard = asObject(sections.mission_board);
  const monsterGate = asObject(sections.monster_gate);
  const knowledgeLane = asObject(sections.knowledge_lane);
  const battleLog = asObject(sections.battle_log);
  const actionQueue = asObject(sections.action_queue);
  const diagnostics = asObject(sections.diagnostics);
  const topLevelDiagnostics = requireObject(fixture.payload.diagnostics, "diagnostics", fixture.repoPath, issues);
  const topLevelDiagnosticSummary = requireObject(topLevelDiagnostics?.summary, "diagnostics.summary", fixture.repoPath, issues);
  const nextActions = requireArray(fixture.payload.next_actions, "next_actions", fixture.repoPath, issues);

  const dungeonMapItems = requireArray(dungeonMap?.items, "operation_board.sections.dungeon_map.items", fixture.repoPath, issues);
  const missionBoardItems = requireArray(missionBoard?.items, "operation_board.sections.mission_board.items", fixture.repoPath, issues);
  const monsterGateGroups = requireArray(monsterGate?.groups, "operation_board.sections.monster_gate.groups", fixture.repoPath, issues);
  const knowledgeLaneBlockers = requireArray(knowledgeLane?.blockers, "operation_board.sections.knowledge_lane.blockers", fixture.repoPath, issues);
  const battleLogProjects = requireArray(battleLog?.projects, "operation_board.sections.battle_log.projects", fixture.repoPath, issues);
  const actionQueueItems = requireArray(actionQueue?.items, "operation_board.sections.action_queue.items", fixture.repoPath, issues);
  const diagnosticItems = requireArray(diagnostics?.items, "operation_board.sections.diagnostics.items", fixture.repoPath, issues);
  const topLevelDiagnosticWarnings = requireArray(topLevelDiagnostics?.warnings, "diagnostics.warnings", fixture.repoPath, issues);
  const topLevelDiagnosticErrors = requireArray(topLevelDiagnostics?.errors, "diagnostics.errors", fixture.repoPath, issues);

  validateAllowedItems(dungeonMapItems, DUNGEON_MAP_ITEM_FIELDS, "operation_board.sections.dungeon_map.items", fixture.repoPath, issues);
  validateAllowedItems(missionBoardItems, MISSION_BOARD_ITEM_FIELDS, "operation_board.sections.mission_board.items", fixture.repoPath, issues);
  validateMonsterGateGroups(monsterGateGroups, fixture.repoPath, issues);
  validateAllowedItems(knowledgeLaneBlockers, KNOWLEDGE_LANE_BLOCKER_FIELDS, "operation_board.sections.knowledge_lane.blockers", fixture.repoPath, issues);
  validateAllowedItems(battleLogProjects, BATTLE_LOG_PROJECT_FIELDS, "operation_board.sections.battle_log.projects", fixture.repoPath, issues);
  validateAllowedItems(actionQueueItems, ACTION_QUEUE_ITEM_FIELDS, "operation_board.sections.action_queue.items", fixture.repoPath, issues);
  validateAllowedItems(diagnosticItems, DIAGNOSTIC_ITEM_FIELDS, "operation_board.sections.diagnostics.items", fixture.repoPath, issues);
  validateAllowedItems(nextActions, NEXT_ACTION_FIELDS, "next_actions", fixture.repoPath, issues);
  validateAllowedItems(topLevelDiagnosticWarnings, DIAGNOSTIC_ITEM_FIELDS, "diagnostics.warnings", fixture.repoPath, issues);
  validateAllowedItems(topLevelDiagnosticErrors, DIAGNOSTIC_ITEM_FIELDS, "diagnostics.errors", fixture.repoPath, issues);

  validateSummaryCounts(
    {
      summary,
      dungeonMapItems,
      missionBoard,
      missionBoardItems,
      monsterGate,
      monsterGateGroups,
      knowledgeLane,
      battleLog,
      actionQueueItems,
      nextActions,
      diagnostics
    },
    fixture.repoPath,
    issues
  );
  validateActionQueueMirror(nextActions, actionQueueItems, fixture.repoPath, issues);
  validateBattleLogSection(battleLog, fixture.repoPath, issues);
  validateDiagnosticsMirror(
    {
      diagnostics,
      diagnosticItems,
      topLevelDiagnosticSummary,
      topLevelDiagnosticWarnings,
      topLevelDiagnosticErrors
    },
    fixture.repoPath,
    issues
  );
}

function validateSummaryCounts(
  context: {
    summary: Record<string, unknown>;
    dungeonMapItems: unknown[];
    missionBoard: Record<string, unknown> | null;
    missionBoardItems: unknown[];
    monsterGate: Record<string, unknown> | null;
    monsterGateGroups: unknown[];
    knowledgeLane: Record<string, unknown> | null;
    battleLog: Record<string, unknown> | null;
    actionQueueItems: unknown[];
    nextActions: unknown[];
    diagnostics: Record<string, unknown> | null;
  },
  file: string,
  issues: LintIssue[]
) {
  const {
    summary,
    dungeonMapItems,
    missionBoard,
    missionBoardItems,
    monsterGate,
    monsterGateGroups,
    knowledgeLane,
    battleLog,
    actionQueueItems,
    nextActions,
    diagnostics
  } = context;
  const missionDisplayCounts = countBy(missionBoardItems, "display_group");
  const monsterGroups = monsterGateGroups.map((group) => asObject(group)).filter((group): group is Record<string, unknown> => group !== null);
  const monsterGroupTotals = countMonsterGroupTotals(monsterGroups);

  validateCount(summary.project_count, dungeonMapItems.length, "operation_board.summary.project_count", "dungeon_map.items.length", file, issues);
  validateCount(
    summary.workspace_project_count,
    dungeonMapItems.filter((item) => asObject(item)?.workspace_present === true).length,
    "operation_board.summary.workspace_project_count",
    "dungeon_map.items workspace_present count",
    file,
    issues
  );
  validateCount(
    summary.workmeta_project_count,
    dungeonMapItems.filter((item) => asObject(item)?.workmeta_present === true).length,
    "operation_board.summary.workmeta_project_count",
    "dungeon_map.items workmeta_present count",
    file,
    issues
  );
  validateCount(summary.mission_count, missionBoardItems.length, "operation_board.summary.mission_count", "mission_board.items.length", file, issues);
  validateCount(
    summary.blocked_mission_count,
    missionDisplayCounts.blocked ?? 0,
    "operation_board.summary.blocked_mission_count",
    "mission_board.items blocked display_group count",
    file,
    issues
  );
  validateCount(
    summary.ready_mission_count,
    missionDisplayCounts.ready ?? 0,
    "operation_board.summary.ready_mission_count",
    "mission_board.items ready display_group count",
    file,
    issues
  );
  validateCountObject(
    asObject(missionBoard?.counts_by_display_group),
    missionDisplayCounts,
    "operation_board.sections.mission_board.counts_by_display_group",
    file,
    issues
  );
  validateCount(
    summary.pending_monster_count,
    monsterGroupTotals.sum,
    "operation_board.summary.pending_monster_count",
    "monster_gate.groups total sum",
    file,
    issues
  );
  validateCount(monsterGate?.count, monsterGroupTotals.sum, "operation_board.sections.monster_gate.count", "monster_gate.groups total sum", file, issues);
  validateCount(
    summary.blocked_monster_count,
    monsterGroupTotals.byId.blocked ?? 0,
    "operation_board.summary.blocked_monster_count",
    "monster_gate group blocked total",
    file,
    issues
  );
  validateCount(
    summary.due_watch_monster_count,
    monsterGroupTotals.byId.due_watch ?? 0,
    "operation_board.summary.due_watch_monster_count",
    "monster_gate group due_watch total",
    file,
    issues
  );
  validateCount(
    summary.next_action_count,
    nextActions.length,
    "operation_board.summary.next_action_count",
    "next_actions.length",
    file,
    issues
  );
  validateCount(
    summary.next_action_count,
    actionQueueItems.length,
    "operation_board.summary.next_action_count",
    "action_queue.items.length",
    file,
    issues
  );
  validateCount(
    summary.battle_log_event_count,
    battleLog?.event_count,
    "operation_board.summary.battle_log_event_count",
    "battle_log.event_count",
    file,
    issues
  );
  validateCount(
    summary.battle_log_project_count_with_events,
    battleLog?.project_count_with_events,
    "operation_board.summary.battle_log_project_count_with_events",
    "battle_log.project_count_with_events",
    file,
    issues
  );
  validateCount(
    summary.knowledge_evidence_surface_count,
    knowledgeLane?.evidence_surface_count,
    "operation_board.summary.knowledge_evidence_surface_count",
    "knowledge_lane.evidence_surface_count",
    file,
    issues
  );

  if (summary.knowledge_lane_state !== knowledgeLane?.owner_gated_state) {
    addIssue(
      issues,
      "summary-count-mirror",
      file,
      "operation_board.summary.knowledge_lane_state must match knowledge_lane.owner_gated_state"
    );
  }

  if (summary.diagnostics_status !== diagnostics?.status) {
    addIssue(issues, "summary-count-mirror", file, "operation_board.summary.diagnostics_status must match diagnostics.status");
  }
}

function validateMonsterGateGroups(groups: unknown[], file: string, issues: LintIssue[]) {
  validateCount(groups.length, MONSTER_GATE_GROUPS.length, "operation_board.sections.monster_gate.groups.length", "documented group count", file, issues);

  for (const [index, value] of groups.entries()) {
    const pathLabel = `operation_board.sections.monster_gate.groups[${index}]`;
    const group = requireObject(value, pathLabel, file, issues);
    if (!group) {
      continue;
    }

    validateAllowedKeys(group, MONSTER_GATE_GROUP_FIELDS, pathLabel, file, issues);

    const expectedGroup = MONSTER_GATE_GROUPS[index];
    if (expectedGroup) {
      for (const field of ["id", "label", "rank"] as const) {
        if (group[field] !== expectedGroup[field]) {
          addIssue(issues, "monster-gate-group", file, `${pathLabel}.${field} must be ${String(expectedGroup[field])}`);
        }
      }
    }

    const items = requireArray(group.items, `${pathLabel}.items`, file, issues);
    validateAllowedItems(items, MONSTER_GATE_ITEM_FIELDS, `${pathLabel}.items`, file, issues);
    validateCount(group.total, items.length, `${pathLabel}.total`, `${pathLabel}.items.length`, file, issues);
  }
}

function validateActionQueueMirror(nextActions: unknown[], actionQueueItems: unknown[], file: string, issues: LintIssue[]) {
  validateCount(
    actionQueueItems.length,
    nextActions.length,
    "operation_board.sections.action_queue.items.length",
    "next_actions.length",
    file,
    issues
  );

  const compareLength = Math.min(nextActions.length, actionQueueItems.length);
  for (let index = 0; index < compareLength; index += 1) {
    const action = asObject(nextActions[index]);
    const queueItem = asObject(actionQueueItems[index]);
    const pathLabel = `operation_board.sections.action_queue.items[${index}]`;

    if (!action || !queueItem) {
      continue;
    }

    if (!NEXT_ACTION_STATUSES.has(asString(action.status) ?? "")) {
      addIssue(issues, "next-action-status", file, `next_actions[${index}].status must be started or next`);
    }

    if (queueItem.rank !== index + 1) {
      addIssue(issues, "action-queue-mirror", file, `${pathLabel}.rank must be ${index + 1}`);
    }

    for (const field of ["id", "status", "summary"] as const) {
      if (queueItem[field] !== action[field]) {
        addIssue(issues, "action-queue-mirror", file, `${pathLabel}.${field} must mirror next_actions[${index}].${field}`);
      }
    }
  }
}

function validateBattleLogSection(battleLog: Record<string, unknown> | null, file: string, issues: LintIssue[]) {
  if (!battleLog) {
    return;
  }

  if (battleLog.source_ref !== BATTLE_LOG_AGGREGATE_REF) {
    addIssue(
      issues,
      "battle-log-aggregate-ref",
      file,
      `operation_board.sections.battle_log.source_ref must be ${BATTLE_LOG_AGGREGATE_REF}`
    );
  }

  scanBattleLogRows(battleLog, ["operation_board", "sections", "battle_log"], file, issues);
}

function validateDiagnosticsMirror(
  context: {
    diagnostics: Record<string, unknown> | null;
    diagnosticItems: unknown[];
    topLevelDiagnosticSummary: Record<string, unknown> | null;
    topLevelDiagnosticWarnings: unknown[];
    topLevelDiagnosticErrors: unknown[];
  },
  file: string,
  issues: LintIssue[]
) {
  const { diagnostics, diagnosticItems, topLevelDiagnosticSummary, topLevelDiagnosticWarnings, topLevelDiagnosticErrors } = context;

  if (diagnostics?.status !== topLevelDiagnosticSummary?.highest_severity) {
    addIssue(
      issues,
      "diagnostics-mirror",
      file,
      "operation_board.sections.diagnostics.status must match diagnostics.summary.highest_severity"
    );
  }

  validateCount(
    topLevelDiagnosticSummary?.warnings,
    topLevelDiagnosticWarnings.length,
    "diagnostics.summary.warnings",
    "diagnostics.warnings.length",
    file,
    issues
  );
  validateCount(
    topLevelDiagnosticSummary?.errors,
    topLevelDiagnosticErrors.length,
    "diagnostics.summary.errors",
    "diagnostics.errors.length",
    file,
    issues
  );
  validateCount(
    diagnostics?.warnings,
    topLevelDiagnosticSummary?.warnings,
    "operation_board.sections.diagnostics.warnings",
    "diagnostics.summary.warnings",
    file,
    issues
  );
  validateCount(
    diagnostics?.errors,
    topLevelDiagnosticSummary?.errors,
    "operation_board.sections.diagnostics.errors",
    "diagnostics.summary.errors",
    file,
    issues
  );
  validateCount(
    diagnostics?.warnings,
    topLevelDiagnosticWarnings.length,
    "operation_board.sections.diagnostics.warnings",
    "diagnostics.warnings.length",
    file,
    issues
  );
  validateCount(
    diagnostics?.errors,
    topLevelDiagnosticErrors.length,
    "operation_board.sections.diagnostics.errors",
    "diagnostics.errors.length",
    file,
    issues
  );
  validateCount(
    diagnosticItems.length,
    topLevelDiagnosticWarnings.length + topLevelDiagnosticErrors.length,
    "operation_board.sections.diagnostics.items.length",
    "diagnostics warnings/errors total length",
    file,
    issues
  );
}

function scanBattleLogRows(value: unknown, pathParts: PathPart[], file: string, issues: LintIssue[]) {
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      scanBattleLogRows(item, [...pathParts, index], file, issues);
    }
    return;
  }

  const object = asObject(value);
  if (!object) {
    return;
  }

  for (const [key, child] of Object.entries(object)) {
    const childPath = [...pathParts, key];
    if (BATTLE_LOG_FORBIDDEN_KEYS.has(key) && !isAllowedBattleSourceRefPath(childPath)) {
      addIssue(issues, "battle-log-event-row", file, `${formatPath(childPath)} must not include individual battle event row/ref fields`);
    }
    scanBattleLogRows(child, childPath, file, issues);
  }
}

function validateAllowedItems(items: unknown[], allowedFields: Set<string>, pathLabel: string, file: string, issues: LintIssue[]) {
  for (const [index, value] of items.entries()) {
    const itemPath = `${pathLabel}[${index}]`;
    const item = requireObject(value, itemPath, file, issues);
    if (!item) {
      continue;
    }
    validateAllowedKeys(item, allowedFields, itemPath, file, issues);
  }
}

function validateAllowedKeys(item: Record<string, unknown>, allowedFields: Set<string>, pathLabel: string, file: string, issues: LintIssue[]) {
  for (const key of Object.keys(item)) {
    if (!allowedFields.has(key)) {
      addIssue(issues, "allowed-fields", file, `${pathLabel}.${key} is not an allowed field`);
    }
  }
}

function scanForbiddenMarkers(value: unknown, pathParts: PathPart[], file: string, issues: LintIssue[]) {
  if (typeof value === "string") {
    if (isAllowedBattleSourceRefPath(pathParts)) {
      if (value !== BATTLE_LOG_AGGREGATE_REF) {
        addIssue(issues, "forbidden-payload-marker", file, `${formatPath(pathParts)} must use the aggregate wildcard ref`);
      }
      return;
    }
    scanTextForForbiddenMarkers(value, formatPath(pathParts), file, issues);
    return;
  }

  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      scanForbiddenMarkers(item, [...pathParts, index], file, issues);
    }
    return;
  }

  const object = asObject(value);
  if (!object) {
    return;
  }

  for (const [key, child] of Object.entries(object)) {
    const childPath = [...pathParts, key];
    if (!isAllowedBattleSourceRefPath(childPath)) {
      scanTextForForbiddenMarkers(key, formatPath(childPath), file, issues);
    }
    scanForbiddenMarkers(child, childPath, file, issues);
  }
}

function scanTextForForbiddenMarkers(text: string, pathLabel: string, file: string, issues: LintIssue[]) {
  for (const marker of FORBIDDEN_MARKERS) {
    if (marker.pattern.test(text)) {
      addIssue(issues, "forbidden-payload-marker", file, `${pathLabel} must not contain ${marker.label}`);
    }
  }
}

function countBy(items: unknown[], field: string) {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const object = asObject(item);
    const key = asString(object?.[field]) ?? "unknown";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function countMonsterGroupTotals(groups: Record<string, unknown>[]) {
  const byId: Record<string, number> = {};
  let sum = 0;

  for (const group of groups) {
    const id = asString(group.id);
    const total = numberValue(group.total);
    if (!id || total === null) {
      continue;
    }
    byId[id] = total;
    sum += total;
  }

  return { byId, sum };
}

function validateCount(actual: unknown, expected: unknown, actualLabel: string, expectedLabel: string, file: string, issues: LintIssue[]) {
  if (actual !== expected) {
    addIssue(issues, "summary-count-mirror", file, `${actualLabel} must equal ${expectedLabel} (${String(expected)})`);
  }
}

function validateCountObject(
  actual: Record<string, unknown> | null,
  expected: Record<string, number>,
  pathLabel: string,
  file: string,
  issues: LintIssue[]
) {
  if (!actual) {
    addIssue(issues, "summary-count-mirror", file, `${pathLabel} must be an object`);
    return;
  }

  const actualKeys = Object.keys(actual).sort();
  const expectedKeys = Object.keys(expected).sort();
  if (actualKeys.join(",") !== expectedKeys.join(",")) {
    addIssue(issues, "summary-count-mirror", file, `${pathLabel} keys must match mission display groups`);
    return;
  }

  for (const key of expectedKeys) {
    validateCount(actual[key], expected[key], `${pathLabel}.${key}`, `mission_board.items ${key} count`, file, issues);
  }
}

function requireObject(value: unknown, pathLabel: string, file: string, issues: LintIssue[]) {
  const object = asObject(value);
  if (!object) {
    addIssue(issues, "required-object", file, `${pathLabel} must be an object`);
  }
  return object;
}

function requireArray(value: unknown, pathLabel: string, file: string, issues: LintIssue[]) {
  if (!Array.isArray(value)) {
    addIssue(issues, "required-array", file, `${pathLabel} must be an array`);
    return [];
  }
  return value;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isAllowedBattleSourceRefPath(pathParts: PathPart[]) {
  return (
    pathParts.length === 4 &&
    pathParts[0] === "operation_board" &&
    pathParts[1] === "sections" &&
    pathParts[2] === "battle_log" &&
    pathParts[3] === "source_ref"
  );
}

function formatPath(pathParts: PathPart[]) {
  if (pathParts.length === 0) {
    return "$";
  }

  return pathParts.reduce((pathLabel, part) => {
    if (typeof part === "number") {
      return `${pathLabel}[${part}]`;
    }
    return `${pathLabel}.${part}`;
  }, "$");
}
