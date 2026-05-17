import { promises as fs } from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { defaultWorkmetaRoot, readProjectBattleEvents } from "../battle_log/battle_log.mjs";
import { pathExists } from "../shared/io.mjs";

export const MISSION_CLOSE_PROVENANCE_VERSION = "soulforge.mission_close.provenance.v0";

const SAFE_PATH_SEGMENT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/u;
const ISO_WITH_TIMEZONE_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u;
const TERMINAL_RESULTS = new Set(["completed", "blocked", "failed"]);

export async function closeMissionFromBattleEvent(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const missionId = validatePathSegment(options.missionId ?? options.mission_id, "mission_id");
  const battleEventId = validateRequiredText(options.battleEventId ?? options.battle_event_id, "battle_event_id");
  const runId = validatePathSegment(options.runId ?? options.run_id, "run_id");
  const missionSurface = normalizeMissionSurface(options.missionSurface ?? options.mission_surface ?? "public");
  const workmetaRoot = path.resolve(options.workmetaRoot ?? defaultWorkmetaRoot(repoRoot));
  const surfaceProjectCode =
    missionSurface === "private"
      ? validatePathSegment(options.projectCode ?? options.project_code, "project_code")
      : null;
  const surface = missionSurfacePaths({
    repoRoot,
    workmetaRoot,
    missionSurface,
    missionId,
    projectCode: surfaceProjectCode,
  });
  const missionRoot = surface.missionRoot;
  const missionPath = path.join(missionRoot, "mission.yaml");
  const readinessPath = path.join(missionRoot, "readiness.yaml");
  const indexPath = surface.indexPath;

  const mission = await readYamlObject(missionPath, "mission");
  const readiness = await readYamlObject(readinessPath, "readiness");
  assertMissionIdentity({ missionId, mission, readiness });

  const projectCode = validatePathSegment(
    options.projectCode ?? options.project_code ?? mission.project_code,
    "project_code",
  );
  if (missionSurface === "private") {
    assertPrivateMissionProject({ mission, projectCode });
  }
  const event = await findRequiredBattleEvent({ workmetaRoot, projectCode, missionId, battleEventId });
  const runRoot = path.join(workmetaRoot, projectCode, "runs", runId);
  if (!(await pathExists(runRoot))) {
    throw new Error(`missing_mission_close_run_evidence: ${projectCode}/${runId}`);
  }

  const terminalResult = terminalResultFromBattleEvent(event);
  const closedAt = normalizeClosedAt(options.closedAt ?? options.closed_at ?? new Date().toISOString());
  const terminalProvenance = {
    closed_via: "mission_close",
    closed_at: closedAt,
    terminal_result: terminalResult,
    run_id: runId,
    battle_event_id: battleEventId,
  };

  assertExistingTerminalProvenance(readiness.terminal_provenance, terminalProvenance);
  const changedFiles = [];

  const nextReadiness = clonePlain(readiness);
  if (sameTerminalProvenance(nextReadiness.terminal_provenance, terminalProvenance)) {
    terminalProvenance.closed_at = nextReadiness.terminal_provenance.closed_at;
  }
  nextReadiness.status = terminalResult;
  nextReadiness.summary = terminalReadinessSummary({ terminalResult, projectCode, runId, battleEventId });
  nextReadiness.latest_run_id = runId;
  nextReadiness.terminal_provenance = terminalProvenance;
  if (nextReadiness.checks && typeof nextReadiness.checks === "object" && !Array.isArray(nextReadiness.checks)) {
    if (Object.hasOwn(nextReadiness.checks, "battle_event_persisted")) {
      nextReadiness.checks.battle_event_persisted = "pass";
    }
  }
  if (terminalResult === "completed") {
    nextReadiness.blockers = [];
  }

  const nextMission = clonePlain(mission);
  nextMission.status = terminalResult;
  nextMission.run_refs = normalizeObject(nextMission.run_refs);
  nextMission.run_refs.latest_run_id = runId;

  await writeYamlIfChanged(readinessPath, readiness, nextReadiness, changedFiles);
  await writeYamlIfChanged(missionPath, mission, nextMission, changedFiles);

  if (await pathExists(indexPath)) {
    const index = await readYamlObject(indexPath, "mission index");
    const nextIndex = updateMissionIndex(index, { missionId, terminalResult, runId });
    await writeYamlIfChanged(indexPath, index, nextIndex, changedFiles);
  }

  return {
    status: changedFiles.length === 0 ? "unchanged" : "closed",
    changed: changedFiles.length > 0,
    changed_files: changedFiles,
    mission_id: missionId,
    mission_surface: missionSurface,
    mission_root: missionRoot,
    project_code: projectCode,
    terminal_result: terminalResult,
    run_id: runId,
    battle_event_id: battleEventId,
    provenance_version: MISSION_CLOSE_PROVENANCE_VERSION,
  };
}

function missionSurfacePaths({ repoRoot, workmetaRoot, missionSurface, missionId, projectCode }) {
  if (missionSurface === "private") {
    const missionsRoot = path.join(workmetaRoot, projectCode, "missions");
    return {
      missionRoot: path.join(missionsRoot, missionId),
      indexPath: path.join(missionsRoot, "index.yaml"),
    };
  }
  return {
    missionRoot: path.join(repoRoot, ".mission", missionId),
    indexPath: path.join(repoRoot, ".mission", "index.yaml"),
  };
}

async function findRequiredBattleEvent({ workmetaRoot, projectCode, missionId, battleEventId }) {
  const events = await readProjectBattleEvents({ workmetaRoot, projectCode });
  const event = events.find((candidate) => candidate.event_id === battleEventId);
  if (!event) {
    throw new Error(`missing_mission_close_battle_evidence: ${projectCode}/${battleEventId}`);
  }
  if (event.mission_id !== missionId) {
    throw new Error(`mission_close_battle_event_mission_mismatch: ${event.mission_id}`);
  }
  if (event.project_code !== projectCode) {
    throw new Error(`mission_close_battle_event_project_mismatch: ${event.project_code}`);
  }
  return event;
}

function terminalResultFromBattleEvent(event) {
  const result = event.result === "completed_with_follow_up" ? "completed" : event.result;
  if (!TERMINAL_RESULTS.has(result)) {
    throw new Error(`unsupported_mission_close_terminal_result: ${event.result}`);
  }
  return result;
}

function updateMissionIndex(index, { missionId, terminalResult, runId }) {
  const nextIndex = clonePlain(index);
  if (!Array.isArray(nextIndex.entries)) {
    return nextIndex;
  }
  const entry = nextIndex.entries.find((candidate) => candidate?.mission_id === missionId);
  if (!entry) {
    return nextIndex;
  }
  entry.status = terminalResult;
  entry.readiness_status = terminalResult;
  entry.latest_run_id = runId;
  return nextIndex;
}

function terminalReadinessSummary({ terminalResult, projectCode, runId, battleEventId }) {
  const resultText = {
    completed: "completed",
    blocked: "blocked",
    failed: "failed",
  }[terminalResult];
  return `Mission ${resultText} via mission_close. Terminal pointers reference _workmeta/${projectCode}/runs/${runId} and battle event ${battleEventId}.`;
}

function assertExistingTerminalProvenance(existing, next) {
  if (!existing || typeof existing !== "object") {
    return;
  }
  if (existing.closed_via !== "mission_close") {
    throw new Error("mission_close_existing_terminal_provenance_not_owned");
  }
  const comparableExisting = {
    closed_via: existing.closed_via,
    terminal_result: existing.terminal_result,
    run_id: existing.run_id,
    battle_event_id: existing.battle_event_id,
  };
  const comparableNext = {
    closed_via: next.closed_via,
    terminal_result: next.terminal_result,
    run_id: next.run_id,
    battle_event_id: next.battle_event_id,
  };
  if (JSON.stringify(comparableExisting) !== JSON.stringify(comparableNext)) {
    throw new Error("mission_close_terminal_provenance_conflict");
  }
}

function sameTerminalProvenance(existing, next) {
  if (!existing || typeof existing !== "object") {
    return false;
  }
  return (
    existing.closed_via === next.closed_via &&
    existing.terminal_result === next.terminal_result &&
    existing.run_id === next.run_id &&
    existing.battle_event_id === next.battle_event_id
  );
}

function assertMissionIdentity({ missionId, mission, readiness }) {
  if (mission.mission_id !== missionId) {
    throw new Error(`mission_close_mission_id_mismatch: mission.yaml ${mission.mission_id}`);
  }
  if (readiness.mission_id !== missionId) {
    throw new Error(`mission_close_mission_id_mismatch: readiness.yaml ${readiness.mission_id}`);
  }
}

function assertPrivateMissionProject({ mission, projectCode }) {
  if (mission.project_code !== projectCode) {
    throw new Error(`mission_close_private_mission_project_mismatch: ${mission.project_code}`);
  }
}

async function readYamlObject(filePath, label) {
  let raw;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(`missing_mission_close_${label.replace(/\s+/gu, "_")}_file: ${filePath}`);
    }
    throw error;
  }
  const parsed = YAML.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`invalid_mission_close_${label.replace(/\s+/gu, "_")}_yaml`);
  }
  return parsed;
}

async function writeYamlIfChanged(filePath, previous, next, changedFiles) {
  if (JSON.stringify(previous) === JSON.stringify(next)) {
    return;
  }
  await fs.writeFile(filePath, `${YAML.stringify(next).trimEnd()}\n`, "utf8");
  changedFiles.push(filePath);
}

function normalizeObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value;
}

function clonePlain(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeClosedAt(value) {
  const text = validateRequiredText(value, "closed_at");
  if (!ISO_WITH_TIMEZONE_PATTERN.test(text) || Number.isNaN(Date.parse(text))) {
    throw new Error("invalid_mission_close_closed_at");
  }
  return text;
}

function normalizeMissionSurface(value) {
  const text = validateRequiredText(value, "mission_surface");
  if (text !== "public" && text !== "private") {
    throw new Error(`invalid_mission_close_mission_surface: ${text}`);
  }
  return text;
}

function validatePathSegment(value, field) {
  const text = validateRequiredText(value, field);
  if (!SAFE_PATH_SEGMENT_PATTERN.test(text)) {
    throw new Error(`invalid_mission_close_${field}`);
  }
  return text;
}

function validateRequiredText(value, field) {
  const text = String(value ?? "").trim();
  if (!text) {
    throw new Error(`missing_mission_close_${field}`);
  }
  return text;
}
