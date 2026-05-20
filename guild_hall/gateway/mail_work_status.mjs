import { promises as fs } from "node:fs";
import path from "node:path";
import YAML from "yaml";

import { pathExists, readJson, relativeToRepo, writeJson } from "../shared/io.mjs";

export const MAIL_WORK_STATUS_SCHEMA_VERSION = "soulforge.gateway.mail_work_status.v1";

export function defaultMailCandidateQueueRoot(repoRoot) {
  return path.join(repoRoot, "guild_hall", "state", "gateway", "mail_candidate");
}

export function defaultGatewayIntakeInboxRoot(repoRoot) {
  return path.join(repoRoot, "guild_hall", "state", "gateway", "intake_inbox");
}

export function defaultMailWorkStatusRoot(repoRoot) {
  return path.join(repoRoot, "guild_hall", "state", "gateway", "mail_work_status");
}

export function defaultMailWorkStatusLatestFile(repoRoot) {
  return path.join(defaultMailWorkStatusRoot(repoRoot), "latest.json");
}

export function defaultWorkmetaRoot(repoRoot) {
  return path.join(repoRoot, "_workmeta");
}

export async function refreshMailWorkStatus({
  repoRoot,
  queueRoot = defaultMailCandidateQueueRoot(repoRoot),
  intakeInboxRoot = defaultGatewayIntakeInboxRoot(repoRoot),
  workmetaRoot = defaultWorkmetaRoot(repoRoot),
  outputFile = defaultMailWorkStatusLatestFile(repoRoot),
}) {
  const projection = await buildMailWorkStatusProjection({
    repoRoot,
    queueRoot,
    intakeInboxRoot,
    workmetaRoot,
  });
  await writeJson(outputFile, projection);
  return {
    request_id: "mail_work_status_refresh",
    status: "refreshed",
    projection_ref: relativeToRepo(repoRoot, outputFile),
    generated_at: projection.generated_at,
    count: projection.count,
    counts: projection.counts,
    entries: projection.entries,
  };
}

export async function listMailWorkStatus({
  repoRoot,
  queueRoot = defaultMailCandidateQueueRoot(repoRoot),
  intakeInboxRoot = defaultGatewayIntakeInboxRoot(repoRoot),
  workmetaRoot = defaultWorkmetaRoot(repoRoot),
  latestFile = defaultMailWorkStatusLatestFile(repoRoot),
  workStatus = "",
  projectCode = "",
}) {
  let projectionSource = "latest";
  let projection;

  if (await pathExists(latestFile)) {
    projection = await readJson(latestFile);
  } else {
    projectionSource = "computed";
    projection = await buildMailWorkStatusProjection({
      repoRoot,
      queueRoot,
      intakeInboxRoot,
      workmetaRoot,
    });
  }

  let entries = Array.isArray(projection.entries) ? [...projection.entries] : [];
  if (workStatus) {
    entries = entries.filter((entry) => entry.work_status === workStatus);
  }
  if (projectCode) {
    entries = entries.filter((entry) => entry.project_code === projectCode);
  }

  return {
    request_id: "mail_work_status_list",
    status: "ok",
    projection_source: projectionSource,
    projection_ref: projectionSource === "latest" ? relativeToRepo(repoRoot, latestFile) : null,
    generated_at: projection.generated_at ?? null,
    count: entries.length,
    total_count: Number(projection.count ?? entries.length),
    counts: countByWorkStatus(entries),
    entries,
  };
}

export async function buildMailWorkStatusProjection({
  repoRoot,
  queueRoot = defaultMailCandidateQueueRoot(repoRoot),
  intakeInboxRoot = defaultGatewayIntakeInboxRoot(repoRoot),
  workmetaRoot = defaultWorkmetaRoot(repoRoot),
}) {
  const generatedAt = new Date().toISOString();
  const candidates = await loadCandidates(repoRoot, queueRoot);
  const projectState = await loadProjectState(repoRoot, workmetaRoot);
  const records = new Map();
  const consumedCandidateIds = new Set();

  await loadGatewayRecords({
    repoRoot,
    intakeInboxRoot,
    candidates,
    records,
    consumedCandidateIds,
  });

  attachProjectRecords({
    projectState,
    candidates,
    records,
    consumedCandidateIds,
  });

  for (const candidate of candidates.all) {
    if (consumedCandidateIds.has(candidate.candidate_id)) {
      continue;
    }
    records.set(`candidate:${candidate.candidate_id}`, {
      key: `candidate:${candidate.candidate_id}`,
      candidate,
      gateway: null,
      project: null,
    });
  }

  const entries = [...records.values()]
    .map((record) => finalizeProjectionRecord({ projectState, record }))
    .sort(compareProjectionEntries);

  return {
    schema_version: MAIL_WORK_STATUS_SCHEMA_VERSION,
    kind: "mail_work_status_projection",
    generated_at: generatedAt,
    count: entries.length,
    counts: countByWorkStatus(entries),
    entries,
    boundary: {
      raw_payload_copied: false,
    },
  };
}

async function loadGatewayRecords({ repoRoot, intakeInboxRoot, candidates, records, consumedCandidateIds }) {
  if (!(await pathExists(intakeInboxRoot))) {
    return;
  }

  const entries = await fs.readdir(intakeInboxRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === "_index") {
      continue;
    }

    const inboxDir = path.join(intakeInboxRoot, entry.name);
    const inboxFile = path.join(inboxDir, "inbox.json");
    const monstersFile = path.join(inboxDir, "monsters.json");
    if (!(await pathExists(inboxFile)) || !(await pathExists(monstersFile))) {
      continue;
    }

    const [inbox, monsterDocument] = await Promise.all([readJson(inboxFile), readJson(monstersFile)]);
    if (inbox.source_kind && inbox.source_kind !== "mail") {
      continue;
    }

    for (const monster of normalizeArray(monsterDocument.monsters)) {
      const sourceRefs = uniqueValues([inbox.source_ref, ...normalizeArray(monster.source_refs)]);
      const candidate = findCandidateBySourceRefs(candidates.byEventId, sourceRefs);
      if (candidate) {
        consumedCandidateIds.add(candidate.candidate_id);
      }

      records.set(`monster:${monster.monster_id}`, {
        key: `monster:${monster.monster_id}`,
        candidate,
        gateway: {
          inbox_id: inbox.workspace_intake_inbox_id ?? entry.name,
          inbox_ref: relativeToRepo(repoRoot, inboxDir),
          monster_ref: `${relativeToRepo(repoRoot, monstersFile)}#monster_id=${monster.monster_id}`,
          history_ref: relativeToRepo(repoRoot, path.join(inboxDir, "history.jsonl")),
          source_ref: inbox.source_ref ?? null,
          updated_at: latestTimestamp([
            inbox.updated_at,
            monster.updated_at,
            monster.assignment_updated_at,
            monster.transferred_at,
          ]),
          monster,
        },
        project: null,
      });
    }
  }
}

function attachProjectRecords({ projectState, candidates, records, consumedCandidateIds }) {
  for (const project of projectState.projectMonsters) {
    const key = `monster:${project.monster_id}`;
    const existing = records.get(key) ?? {
      key,
      candidate: findCandidateBySourceRefs(candidates.byEventId, normalizeArray(project.source_refs)),
      gateway: null,
      project: null,
    };

    if (existing.candidate) {
      consumedCandidateIds.add(existing.candidate.candidate_id);
    }

    existing.project = project;
    records.set(key, existing);
  }
}

async function loadProjectState(repoRoot, workmetaRoot) {
  const projectMonsters = [];
  const missionsByKey = new Map();
  const battlesByKey = new Map();

  if (!(await pathExists(workmetaRoot))) {
    return { projectMonsters, missionsByKey, battlesByKey };
  }

  const entries = await fs.readdir(workmetaRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const projectCode = entry.name;
    const projectRoot = path.join(workmetaRoot, projectCode);

    await loadProjectMonsters(repoRoot, projectRoot, projectCode, projectMonsters);
    await loadMissionIndex(repoRoot, projectRoot, projectCode, missionsByKey);
    await loadBattleEvents(repoRoot, projectRoot, projectCode, battlesByKey);
  }

  return { projectMonsters, missionsByKey, battlesByKey };
}

async function loadProjectMonsters(repoRoot, projectRoot, projectCode, projectMonsters) {
  const monstersDir = path.join(projectRoot, "monsters");
  if (!(await pathExists(monstersDir))) {
    return;
  }

  const entries = await fs.readdir(monstersDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".yaml")) {
      continue;
    }

    const filePath = path.join(monstersDir, entry.name);
    const monster = YAML.parse(await fs.readFile(filePath, "utf8"));
    if (!isMailDerivedProjectMonster(monster)) {
      continue;
    }

    projectMonsters.push({
      monster_id: monster.source_monster_id ?? monster.monster_id,
      project_code: monster.project_code ?? projectCode,
      stage: monster.stage ?? null,
      status: monster.status ?? null,
      mission_ref: monster.mission_ref ?? null,
      source_refs: normalizeArray(monster.source_refs),
      updated_at: latestTimestamp([monster.updated_at, monster.created_at]),
      project_monster_ref: relativeToRepo(repoRoot, filePath),
    });
  }
}

async function loadMissionIndex(repoRoot, projectRoot, projectCode, missionsByKey) {
  const indexFile = path.join(projectRoot, "missions", "index.yaml");
  if (!(await pathExists(indexFile))) {
    return;
  }

  const indexDocument = YAML.parse(await fs.readFile(indexFile, "utf8"));
  for (const entry of normalizeArray(indexDocument.entries)) {
    if (!entry?.mission_id) {
      continue;
    }
    const missionRef = entry.mission_ref ?? `_workmeta/${projectCode}/missions/${entry.mission_id}`;
    missionsByKey.set(projectKey(projectCode, entry.mission_id), {
      mission_id: entry.mission_id,
      mission_ref: missionRef,
      status: entry.status ?? null,
      readiness_status: entry.readiness_status ?? null,
      stage: entry.stage ?? null,
      latest_run_id: entry.latest_run_id ?? null,
      mission_index_ref: relativeToRepo(repoRoot, indexFile),
    });
  }
}

async function loadBattleEvents(repoRoot, projectRoot, projectCode, battlesByKey) {
  const eventsRoot = path.join(projectRoot, "log", "events");
  if (!(await pathExists(eventsRoot))) {
    return;
  }

  const files = await collectFiles(eventsRoot, (filePath) => path.basename(filePath) === "battle_events.jsonl");
  for (const filePath of files) {
    const raw = await fs.readFile(filePath, "utf8");
    for (const line of raw.split(/\r?\n/u)) {
      if (!line.trim()) {
        continue;
      }
      const event = JSON.parse(line);
      if (!event.mission_id || !event.project_code) {
        continue;
      }

      const key = projectKey(event.project_code ?? projectCode, event.mission_id);
      const existing = battlesByKey.get(key);
      const candidate = {
        battle_event_id: event.event_id ?? null,
        battle_event_ref: `${relativeToRepo(repoRoot, filePath)}#event_id=${event.event_id ?? ""}`,
        occurred_at: event.occurred_at ?? null,
        terminal_result: event.result ?? null,
      };

      if (!existing || compareTimestamps(candidate.occurred_at, existing.occurred_at) >= 0) {
        battlesByKey.set(key, candidate);
      }
    }
  }
}

function finalizeProjectionRecord({ projectState, record }) {
  const project = record.project;
  const gateway = record.gateway;
  const candidate = record.candidate;
  const missionRef = project?.mission_ref ?? gateway?.monster?.mission_ref ?? null;
  const missionId =
    extractMissionId(missionRef) ??
    null;
  const projectCode = project?.project_code ?? gateway?.monster?.assigned_project_code ?? null;
  const mission = missionId && projectCode ? projectState.missionsByKey.get(projectKey(projectCode, missionId)) ?? null : null;
  const battle = missionId && projectCode ? projectState.battlesByKey.get(projectKey(projectCode, missionId)) ?? null : null;
  const work = resolveWorkStatus({ battle, candidate, gateway, mission, project });
  const mailSourceRef = firstNonEmpty(candidate?.event_id, gateway?.source_ref, ...normalizeArray(project?.source_refs));
  const updatedAt = latestTimestamp([
    candidate?.updated_at,
    gateway?.updated_at,
    project?.updated_at,
    mission?.latest_run_id ? mission.latest_run_id : null,
    battle?.occurred_at,
  ]);

  return {
    mail_source_ref: mailSourceRef,
    candidate_id: candidate?.candidate_id ?? null,
    inbox_id: gateway?.inbox_id ?? null,
    monster_id: gateway?.monster?.monster_id ?? project?.monster_id ?? null,
    project_code: projectCode,
    project_monster_ref: project?.project_monster_ref ?? gateway?.monster?.project_monster_ref ?? null,
    mission_id: missionId,
    mission_ref: mission?.mission_ref ?? missionRef,
    battle_event_id: battle?.battle_event_id ?? null,
    terminal_result: work.terminal_result,
    work_status: work.work_status,
    status_reason: work.status_reason,
    refs: compactObject({
      candidate_ref: candidate?.candidate_ref ?? null,
      mail_intake_request_ref: candidate?.intake_request_ref ?? null,
      intake_inbox_ref: gateway?.inbox_ref ?? null,
      gateway_monster_ref: gateway?.monster_ref ?? null,
      gateway_history_ref: gateway?.history_ref ?? null,
      project_monster_ref: project?.project_monster_ref ?? null,
      mission_ref: mission?.mission_ref ?? missionRef,
      mission_index_ref: mission?.mission_index_ref ?? null,
      battle_event_ref: battle?.battle_event_ref ?? null,
    }),
    updated_at: updatedAt,
    boundary: {
      raw_payload_copied: false,
    },
  };
}

function resolveWorkStatus({ battle, candidate, gateway, mission, project }) {
  if (battle?.terminal_result) {
    return {
      work_status: battle.terminal_result,
      terminal_result: battle.terminal_result,
      status_reason: `battle result ${battle.terminal_result}`,
    };
  }

  const missionStatus = mission?.readiness_status ?? mission?.status ?? null;
  if (missionStatus === "completed") {
    return {
      work_status: "completed",
      terminal_result: "completed",
      status_reason: "mission readiness_status completed",
    };
  }
  if (missionStatus === "failed") {
    return {
      work_status: "failed",
      terminal_result: "failed",
      status_reason: "mission readiness_status failed",
    };
  }
  if (missionStatus === "ready") {
    return {
      work_status: "mission_ready",
      terminal_result: null,
      status_reason: "mission readiness_status ready",
    };
  }
  if (missionStatus === "blocked") {
    return {
      work_status: "mission_blocked",
      terminal_result: null,
      status_reason: "mission readiness_status blocked",
    };
  }

  if (project) {
    return {
      work_status: "assigned_to_project",
      terminal_result: null,
      status_reason:
        project.status === "blocked"
          ? "project monster materialized but downstream state remains unresolved"
          : "project monster materialized",
    };
  }

  const gatewayStatus = gateway?.monster?.assignment_status ?? null;
  if (gatewayStatus === "assigned" || gatewayStatus === "transferred") {
    return {
      work_status: "assigned_to_project",
      terminal_result: null,
      status_reason: `gateway assignment_status ${gatewayStatus}`,
    };
  }
  if (gateway) {
    return {
      work_status: "monster_pending_assignment",
      terminal_result: null,
      status_reason: `gateway assignment_status ${gatewayStatus ?? "pending_dungeon_assignment"}`,
    };
  }

  if (candidate) {
    return {
      work_status: "candidate_pending",
      terminal_result: null,
      status_reason: `candidate status ${candidate.status}`,
    };
  }

  return {
    work_status: "unknown",
    terminal_result: null,
    status_reason: "no mail-derived work surface found",
  };
}

async function loadCandidates(repoRoot, queueRoot) {
  const pendingRoot = path.join(queueRoot, "queue", "pending");
  const all = [];
  const byEventId = new Map();

  if (!(await pathExists(pendingRoot))) {
    return { all, byEventId };
  }

  const entries = await fs.readdir(pendingRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      continue;
    }

    const candidateFile = path.join(pendingRoot, entry.name);
    const candidate = await readJson(candidateFile);
    const eventId = candidate?.source_event?.event_id ?? null;
    const summary = {
      candidate_id: candidate.candidate_id ?? null,
      status: candidate.status ?? null,
      event_id: eventId,
      candidate_ref: relativeToRepo(repoRoot, candidateFile),
      intake_request_ref: candidate?.business_review?.intake_request_ref ?? null,
      updated_at: latestTimestamp([candidate.updated_at, candidate.created_at]),
    };

    all.push(summary);
    if (!eventId) {
      continue;
    }

    const existing = byEventId.get(eventId);
    if (!existing || compareTimestamps(summary.updated_at, existing.updated_at) >= 0) {
      byEventId.set(eventId, summary);
    }
  }

  return { all, byEventId };
}

async function collectFiles(rootPath, predicate) {
  const files = [];
  const entries = await fs.readdir(rootPath, { withFileTypes: true });
  for (const entry of entries) {
    const filePath = path.join(rootPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(filePath, predicate)));
      continue;
    }
    if (entry.isFile() && predicate(filePath)) {
      files.push(filePath);
    }
  }
  return files.sort();
}

function isMailDerivedProjectMonster(monster) {
  if (!monster || typeof monster !== "object") {
    return false;
  }

  if (monster.source_owner === "gateway") {
    return true;
  }

  return (
    typeof monster.filing_packet_ref === "string" &&
    monster.filing_packet_ref.includes("/mail_filing/")
  );
}

function findCandidateBySourceRefs(byEventId, sourceRefs) {
  for (const sourceRef of normalizeArray(sourceRefs)) {
    const candidate = byEventId.get(sourceRef);
    if (candidate) {
      return candidate;
    }
  }
  return null;
}

function extractMissionId(ref) {
  if (!ref) {
    return null;
  }
  const normalized = String(ref).replace(/\\/gu, "/").replace(/\/$/u, "");
  const parts = normalized.split("/");
  return parts.at(-1) || null;
}

function projectKey(projectCode, missionId) {
  return `${projectCode}:${missionId}`;
}

function normalizeArray(value) {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function uniqueValues(values) {
  return [...new Set(normalizeArray(values).flat().filter(Boolean))];
}

function compactObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== null && entry !== undefined));
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function latestTimestamp(values) {
  let latest = null;
  let latestEpoch = Number.NEGATIVE_INFINITY;

  for (const value of normalizeArray(values).flat()) {
    if (typeof value !== "string" || !value.trim()) {
      continue;
    }
    const epoch = Date.parse(value);
    if (Number.isNaN(epoch)) {
      continue;
    }
    if (epoch >= latestEpoch) {
      latestEpoch = epoch;
      latest = value;
    }
  }

  return latest;
}

function compareTimestamps(left, right) {
  const leftEpoch = Date.parse(left ?? "");
  const rightEpoch = Date.parse(right ?? "");

  if (Number.isNaN(leftEpoch) && Number.isNaN(rightEpoch)) {
    return String(left ?? "").localeCompare(String(right ?? ""));
  }
  if (Number.isNaN(leftEpoch)) {
    return -1;
  }
  if (Number.isNaN(rightEpoch)) {
    return 1;
  }
  return leftEpoch - rightEpoch;
}

function compareProjectionEntries(left, right) {
  const timestampCompare = compareTimestamps(right.updated_at, left.updated_at);
  if (timestampCompare !== 0) {
    return timestampCompare;
  }

  return `${left.monster_id ?? ""}:${left.candidate_id ?? ""}:${left.mail_source_ref ?? ""}`.localeCompare(
    `${right.monster_id ?? ""}:${right.candidate_id ?? ""}:${right.mail_source_ref ?? ""}`,
  );
}

function countByWorkStatus(entries) {
  const counts = {};
  for (const entry of normalizeArray(entries)) {
    const key = entry?.work_status ?? "unknown";
    counts[key] = Number(counts[key] ?? 0) + 1;
  }
  return counts;
}
