import { promises as fs } from "node:fs";
import path from "node:path";
import YAML from "yaml";

import { pathExists, readJson, relativeToRepo, writeJson } from "../shared/io.mjs";

export const MAIL_WORK_STATUS_SCHEMA_VERSION = "soulforge.gateway.mail_work_status.v1";
export const MAIL_WORK_PRIORITY_SCHEMA_VERSION = "soulforge.gateway.mail_work_priority.v1";

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

export function defaultMailWorkPriorityLatestFile(repoRoot) {
  return path.join(defaultMailWorkStatusRoot(repoRoot), "priority_latest.json");
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

export async function refreshMailWorkPriority({
  repoRoot,
  queueRoot = defaultMailCandidateQueueRoot(repoRoot),
  intakeInboxRoot = defaultGatewayIntakeInboxRoot(repoRoot),
  workmetaRoot = defaultWorkmetaRoot(repoRoot),
  outputFile = defaultMailWorkPriorityLatestFile(repoRoot),
}) {
  const projection = await buildMailWorkPriorityProjection({
    repoRoot,
    queueRoot,
    intakeInboxRoot,
    workmetaRoot,
  });
  await writeJson(outputFile, projection);
  return {
    request_id: "mail_work_priority_refresh",
    status: "refreshed",
    projection_ref: relativeToRepo(repoRoot, outputFile),
    generated_at: projection.generated_at,
    count: projection.count,
    counts: projection.counts,
    entries: projection.entries,
  };
}

export async function listMailWorkPriority({
  repoRoot,
  queueRoot = defaultMailCandidateQueueRoot(repoRoot),
  intakeInboxRoot = defaultGatewayIntakeInboxRoot(repoRoot),
  workmetaRoot = defaultWorkmetaRoot(repoRoot),
  latestFile = defaultMailWorkPriorityLatestFile(repoRoot),
  workStatus = "",
  operatingState = "",
  routeCandidate = "",
  routeConfidence = "",
  threadGroup = "",
  priorityFlag = "",
}) {
  let projectionSource = "latest";
  let projection;

  if (await pathExists(latestFile)) {
    projection = await readJson(latestFile);
  } else {
    projectionSource = "computed";
    projection = await buildMailWorkPriorityProjection({
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
  if (operatingState) {
    entries = entries.filter((entry) => entry.operating_state_ko === operatingState);
  }
  if (routeCandidate) {
    entries = entries.filter((entry) => entry.route_candidate === routeCandidate);
  }
  if (routeConfidence) {
    entries = entries.filter((entry) => entry.route_confidence === routeConfidence);
  }
  if (threadGroup) {
    entries = entries.filter((entry) => entry.thread_group === threadGroup);
  }
  if (priorityFlag) {
    entries = entries.filter((entry) => normalizeArray(entry.priority_flags_ko).includes(priorityFlag));
  }

  return {
    request_id: "mail_work_priority_list",
    status: "ok",
    projection_source: projectionSource,
    projection_ref: projectionSource === "latest" ? relativeToRepo(repoRoot, latestFile) : null,
    generated_at: projection.generated_at ?? null,
    count: entries.length,
    total_count: Number(projection.count ?? entries.length),
    counts: countByPriorityState(entries),
    route_counts: countByRoute(entries),
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

export async function buildMailWorkPriorityProjection({
  repoRoot,
  queueRoot = defaultMailCandidateQueueRoot(repoRoot),
  intakeInboxRoot = defaultGatewayIntakeInboxRoot(repoRoot),
  workmetaRoot = defaultWorkmetaRoot(repoRoot),
}) {
  const statusProjection = await buildMailWorkStatusProjection({
    repoRoot,
    queueRoot,
    intakeInboxRoot,
    workmetaRoot,
  });
  const preparedEntries = normalizeArray(statusProjection.entries)
    .filter((entry) => entry?.candidate_id)
    .map((entry) => ({
      entry,
      thread_group: resolveThreadGroup(entry),
    }));
  const threadCounts = countByThreadGroup(preparedEntries);
  const entries = preparedEntries
    .map(({ entry, thread_group }) => buildPriorityRow(entry, thread_group, Number(threadCounts.get(thread_group) ?? 1)))
    .sort(comparePriorityEntries);

  return {
    schema_version: MAIL_WORK_PRIORITY_SCHEMA_VERSION,
    kind: "mail_work_priority_projection",
    generated_at: statusProjection.generated_at,
    source_schema_version: statusProjection.schema_version,
    count: entries.length,
    counts: countByPriorityState(entries),
    route_counts: countByRoute(entries),
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
          subject: inbox.subject ?? null,
          received_at: inbox.received_at ?? null,
          thread_ref: inbox.thread_ref ?? null,
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
      const event = JSON.parse(line.replace(/^\uFEFF/u, ""));
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
  const subject = firstNonEmpty(candidate?.subject, gateway?.subject);
  const receivedAt = firstNonEmpty(candidate?.received_at, gateway?.received_at);
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
    subject,
    received_at: receivedAt,
    mail_source: candidate?.source ?? null,
    mail_workspace: candidate?.workspace ?? null,
    attachment_count: Number(candidate?.attachment_count ?? 0),
    attachment_types: normalizeArray(candidate?.attachment_types),
    classification_bucket: candidate?.classification_bucket ?? null,
    thread_ref: gateway?.thread_ref ?? null,
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
    const sourceEvent = candidate?.source_event ?? {};
    const mailSummary = candidate?.mail_summary ?? {};
    const eventId = sourceEvent.event_id ?? null;
    const classification = mailSummary.classification ?? null;
    const summary = {
      candidate_id: candidate.candidate_id ?? null,
      status: candidate.status ?? null,
      event_id: eventId,
      source: sourceEvent.source ?? null,
      workspace: sourceEvent.workspace ?? null,
      received_at: sourceEvent.received_at ?? null,
      subject: mailSummary.subject ?? null,
      attachment_count: Number(mailSummary.attachment_count ?? 0),
      attachment_types: normalizeArray(mailSummary.attachment_types),
      classification_bucket:
        typeof classification === "string" ? classification : classification?.bucket ?? null,
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

function buildPriorityRow(entry, threadGroup, threadCount) {
  const route = resolvePriorityRoute(entry);
  const operatingState = resolveOperatingState(entry, route, threadCount);
  const priorityFlags = resolvePriorityFlags(entry, operatingState, route, threadCount);

  return {
    candidate_id: entry.candidate_id ?? null,
    mail_source_ref: entry.mail_source_ref ?? null,
    subject: entry.subject ?? null,
    received_at: entry.received_at ?? null,
    operating_state_ko: operatingState,
    route_candidate: route.route_candidate,
    route_confidence: route.route_confidence,
    thread_group: threadGroup,
    priority_flags_ko: priorityFlags,
    next_action_ko: resolveNextActionKo(entry, operatingState, route, threadCount),
    owner_question_ko: resolveOwnerQuestionKo(entry, operatingState, route, threadCount),
    work_status: entry.work_status ?? "unknown",
    refs: entry.refs ?? {},
    boundary: {
      raw_payload_copied: false,
    },
  };
}

function resolvePriorityRoute(entry) {
  const subjectText = normalizeSearchText(entry.subject);
  if (isPromoLike(subjectText)) {
    return {
      route_candidate: "none/promo",
      route_confidence: "none",
      route_kind: "non_work",
    };
  }
  if (isPersonalAdminLike(subjectText)) {
    return {
      route_candidate: "none/personal",
      route_confidence: "none",
      route_kind: "personal_admin",
    };
  }
  if (isExactP26014Subject(subjectText)) {
    return {
      route_candidate: "P26-014",
      route_confidence: "exact",
      route_kind: "exact_work",
    };
  }
  if (isWorkLikeSubject(subjectText, entry)) {
    return {
      route_candidate: "P00-000_INBOX",
      route_confidence: "review",
      route_kind: "work_review",
    };
  }
  return {
    route_candidate: "none/personal",
    route_confidence: "none",
    route_kind: "non_work",
  };
}

function resolveOperatingState(entry, route, threadCount) {
  if (isTerminalWorkStatus(entry.work_status)) {
    return "기존 일에 붙이기";
  }
  if (route.route_kind === "non_work") {
    return "일 아님";
  }
  if (route.route_kind === "personal_admin") {
    return "개인/관리 보류";
  }
  if (threadCount > 1 || hasExistingWorkSurface(entry)) {
    return "기존 일에 붙이기";
  }
  if (route.route_kind === "exact_work") {
    return "새 일";
  }
  if (route.route_kind === "work_review") {
    return "프로젝트 확인 보류";
  }
  return "내용 애매 보류";
}

function resolvePriorityFlags(entry, operatingState, route, threadCount) {
  if (isTerminalWorkStatus(entry.work_status)) {
    return [];
  }
  const subjectText = normalizeSearchText(entry.subject);
  const flags = [];
  if (route.route_confidence === "exact" || hasDueOrUrgentHint(subjectText)) {
    flags.push("오늘 처리");
  }
  if (needsHumanReview(subjectText, route)) {
    flags.push("사람 병목");
  }
  if (hasMaterialReviewHint(subjectText, entry)) {
    flags.push("자료 확인");
  }
  if (threadCount > 1) {
    flags.push("스레드 묶기");
  }
  if (operatingState.endsWith("보류") || route.route_confidence === "none") {
    flags.push("보류");
  }
  return uniqueValues(flags);
}

function resolveNextActionKo(entry, operatingState, route, threadCount) {
  if (isTerminalWorkStatus(entry.work_status)) {
    return "이미 처리된 상태를 유지하고 후속 필요 여부만 확인한다.";
  }
  if (operatingState === "일 아님") {
    return "업무 큐에서 제외하고 필요 시 개인 참고로만 둔다.";
  }
  if (operatingState === "개인/관리 보류") {
    return "project monster로 만들지 않고 개인/관리 확인만 한다.";
  }
  if (threadCount > 1 || operatingState === "기존 일에 붙이기") {
    return "같은 thread_group의 기존 업무에 붙일 후보인지 확인한다.";
  }
  if (route.route_confidence === "exact") {
    return "P26-014 큐에서 오늘 처리 여부와 기존 작업 연결 여부를 확인한다.";
  }
  if (route.route_confidence === "review") {
    return "프로젝트 코드를 확인한 뒤 수동으로 업무화/보류를 결정한다.";
  }
  return "메일 metadata만으로 업무 여부를 owner가 확인한다.";
}

function resolveOwnerQuestionKo(entry, operatingState, route, threadCount) {
  if (isTerminalWorkStatus(entry.work_status)) {
    return "후속 조치가 남아 있나요?";
  }
  if (operatingState === "일 아님") {
    return "업무 큐에서 제외해도 될까요?";
  }
  if (operatingState === "개인/관리 보류") {
    return "개인/관리 확인만 하고 project monster로 만들지 않을까요?";
  }
  if (threadCount > 1 || operatingState === "기존 일에 붙이기") {
    return "이 메일을 같은 thread_group의 기존 업무에 붙일까요?";
  }
  if (route.route_confidence === "exact") {
    return "P26-014의 새 업무로 둘까요, 기존 업무에 붙일까요?";
  }
  if (route.route_confidence === "review") {
    return "어느 프로젝트 코드로 보낼까요?";
  }
  return "metadata만으로 업무 판단을 보류할까요?";
}

function resolveThreadGroup(entry) {
  const subjectText = normalizeSearchText(entry.subject);
  if (subjectText.includes("sensor production schedule") || subjectText.includes("센서 일정")) {
    return "센서 일정/status";
  }
  if (subjectText.includes("sensor") && (subjectText.includes("schedule") || subjectText.includes("status"))) {
    return "센서 일정/status";
  }
  if (subjectText.includes("주간 진행상황")) {
    return "센서 일정/status";
  }
  if (subjectText.includes("p978") || subjectText.includes("시운전절차서")) {
    return "P978 시운전절차서";
  }
  if (subjectText.includes("q4") && (subjectText.includes("진행 독려") || subjectText.includes("품질점검"))) {
    return "Q4 진행 독려";
  }
  if (subjectText.includes("환경시험절차서") || (subjectText.includes("환경시험") && subjectText.includes("절차서"))) {
    return "환경시험절차서";
  }
  if (subjectText.includes("p23-043") || (subjectText.includes("requested access") && subjectText.includes("조향장치"))) {
    return "P23-043 접근권한";
  }
  if (subjectText.includes("해경") || subjectText.includes("실증시험") || (subjectText.includes("시험") && subjectText.includes("협조"))) {
    return "해경/시험 협조";
  }
  if (
    subjectText.includes("pc 정보") ||
    subjectText.includes("저장장치") ||
    subjectText.includes("로그인 알림") ||
    subjectText.includes("급여명세서")
  ) {
    return "내부 자산/admin";
  }
  return `subject:${normalizeSubjectForThread(entry.subject)}`;
}

function hasExistingWorkSurface(entry) {
  return Boolean(entry.monster_id || entry.project_code || entry.project_monster_ref || entry.mission_id);
}

function isExactP26014Subject(subjectText) {
  return /기[0-9ㅇᄋ○oO영공xX]탐/iu.test(subjectText) || subjectText.includes("기뢰탐색음탐기") || subjectText.includes("kvds");
}

function isWorkLikeSubject(subjectText, entry) {
  if (!subjectText) {
    return false;
  }
  if (/(^|\b)p\d{2,3}-?\d{3}(\b|$)/iu.test(subjectText)) {
    return true;
  }
  return [
    "요청",
    "협조",
    "검토",
    "작성",
    "확인",
    "회신",
    "문의",
    "공유",
    "결과",
    "보고서",
    "절차서",
    "일정",
    "status",
    "sensor",
    "해경",
    "시험",
    "무인수상정",
    "음탐기",
    "예인형수중탐색장치",
    "bom",
    "dxf",
    "step",
    "자료",
    "납품",
    "검사성적서",
    "requested access",
  ].some((keyword) => subjectText.includes(keyword)) || Number(entry.attachment_count ?? 0) > 0;
}

function isPersonalAdminLike(subjectText) {
  return [
    "정보보호",
    "신용정보",
    "신용관리",
    "출금완료",
    "입금완료",
    "withdrawal",
    "binance",
    "upbit",
    "korbit",
    "청구서",
    "영수증",
    "급여명세서",
    "billing",
    "receipt",
    "invoice",
    "카드",
    "nice지키미",
    "약관",
    "정책 변경",
    "이용 기간 종료",
    "서비스 이용내역",
    "로그인 알림",
    "pc 정보",
    "저장장치",
  ].some((keyword) => subjectText.includes(keyword));
}

function isPromoLike(subjectText) {
  return [
    "무료",
    "프로모션",
    "할인",
    "슬로건",
    "엠블럼",
    "선호도 투표",
    "주얼",
    "youtube",
  ].some((keyword) => subjectText.includes(keyword));
}

function hasDueOrUrgentHint(subjectText) {
  return subjectText.includes("urgent") || subjectText.includes("오늘") || subjectText.includes("까지") || /~\s?\d/u.test(subjectText);
}

function needsHumanReview(subjectText, route) {
  if (route.route_confidence === "review") {
    return true;
  }
  return ["회신", "확인", "협조", "문의", "요청", "독려", "requested access"].some((keyword) =>
    subjectText.includes(keyword),
  );
}

function hasMaterialReviewHint(subjectText, entry) {
  if (Number(entry.attachment_count ?? 0) > 0) {
    return true;
  }
  return ["자료", "파일", "첨부", "절차서", "bom", "dxf", "step", "검사성적서", "보고서"].some((keyword) =>
    subjectText.includes(keyword),
  );
}

function isTerminalWorkStatus(workStatus) {
  return ["completed", "completed_with_follow_up", "blocked", "failed"].includes(workStatus);
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

function normalizeSearchText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/gu, " ")
    .trim();
}

function normalizeSubjectForThread(value) {
  const normalized = normalizeSearchText(value)
    .replace(/^((re|fw|fwd)\s*:\s*)+/u, "")
    .replace(/\[[^\]]+\]/gu, "")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim();
  return normalized || "unknown";
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

function comparePriorityEntries(left, right) {
  const leftRank = priorityRank(left);
  const rightRank = priorityRank(right);
  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }

  const timestampCompare = compareTimestamps(right.received_at, left.received_at);
  if (timestampCompare !== 0) {
    return timestampCompare;
  }

  return `${left.thread_group}:${left.candidate_id ?? ""}:${left.mail_source_ref ?? ""}`.localeCompare(
    `${right.thread_group}:${right.candidate_id ?? ""}:${right.mail_source_ref ?? ""}`,
  );
}

function priorityRank(entry) {
  if (isTerminalWorkStatus(entry.work_status)) {
    return 100;
  }
  if (entry.route_confidence === "exact") {
    return 10;
  }
  if (entry.operating_state_ko === "기존 일에 붙이기") {
    return 20;
  }
  if (entry.route_confidence === "review") {
    return 30;
  }
  if (entry.operating_state_ko === "개인/관리 보류") {
    return 80;
  }
  if (entry.operating_state_ko === "일 아님") {
    return 90;
  }
  return 50;
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

function countByPriorityState(entries) {
  const counts = {};
  for (const entry of normalizeArray(entries)) {
    const key = entry?.operating_state_ko ?? "내용 애매 보류";
    counts[key] = Number(counts[key] ?? 0) + 1;
  }
  return counts;
}

function countByRoute(entries) {
  const counts = {};
  for (const entry of normalizeArray(entries)) {
    const key = entry?.route_candidate ?? "none/personal";
    counts[key] = Number(counts[key] ?? 0) + 1;
  }
  return counts;
}

function countByThreadGroup(entries) {
  const counts = new Map();
  for (const entry of normalizeArray(entries)) {
    const key = entry.thread_group ?? "subject:unknown";
    counts.set(key, Number(counts.get(key) ?? 0) + 1);
  }
  return counts;
}
