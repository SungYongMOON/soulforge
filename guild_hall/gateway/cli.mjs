#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  emitNotification,
  ensureGatewayNotifyPolicy,
  gatewayNotifyStatus,
  missionNotifyStatus,
  setGatewayEventEnabled,
  setMissionEventEnabled,
} from "../town_crier/runtime.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const gatewayRoot = path.join(repoRoot, "guild_hall", "state", "gateway");
const intakeInboxRoot = path.join(gatewayRoot, "intake_inbox");
const globalEventRoot = path.join(gatewayRoot, "log", "monster_events");

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);

  if (command === "intake") {
    await runIntake(args);
    return;
  }

  if (command === "update-monster") {
    await runUpdateMonster(args);
    return;
  }

  if (command === "notify-gateway") {
    await runNotifyGateway(args);
    return;
  }

  if (command === "notify-mission") {
    await runNotifyMission(args);
    return;
  }

  if (command === "notify-status") {
    await runNotifyStatus(args);
    return;
  }

  if (command === "notify-emit") {
    await runNotifyEmit(args);
    return;
  }

  printUsageAndExit();
}

function parseArgs(argv) {
  const flags = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];

    if (next === undefined || next.startsWith("--")) {
      flags[key] = true;
      continue;
    }

    flags[key] = next;
    index += 1;
  }

  return flags;
}

function printUsageAndExit() {
  console.error(
    [
      "Usage:",
      "  node guild_hall/gateway/cli.mjs intake --payload-file <path>",
      "  node guild_hall/gateway/cli.mjs update-monster --inbox-id <id> --monster-id <id> --patch-file <path>",
      "  node guild_hall/gateway/cli.mjs notify-gateway --event <event> (--on | --off)",
      "  node guild_hall/gateway/cli.mjs notify-mission --mission-id <id> --event <event> (--on | --off)",
      "  node guild_hall/gateway/cli.mjs notify-status --scope <gateway|mission> --event <event> [--mission-id <id>]",
      "  node guild_hall/gateway/cli.mjs notify-emit --scope <gateway|mission> --event <event> --text <message> [--mission-id <id>]",
    ].join("\n"),
  );
  process.exit(1);
}

async function runIntake(args) {
  const payloadFile = requireFlag(args, "payload-file");
  const payload = await readJson(payloadFile);
  validateIntakePayload(payload);
  await ensureGatewayNotifyPolicy(repoRoot);

  const inboxId = sanitizeId(payload.event_id);
  const inboxDir = path.join(intakeInboxRoot, inboxId);
  const inboxFile = path.join(inboxDir, "inbox.json");
  const monstersFile = path.join(inboxDir, "monsters.json");
  const historyFile = path.join(inboxDir, "history.jsonl");
  const now = new Date().toISOString();
  const monsterIndex = await loadMonsterIndex();

  if (await pathExists(inboxFile)) {
    const existingInbox = await readJson(inboxFile);
    const existingMonsters = await readJson(monstersFile);
    printJson({
      request_id: `mail_intake_request_${inboxId}`,
      status: "duplicate",
      workspace_intake_inbox_id: existingInbox.workspace_intake_inbox_id,
      workspace_intake_inbox_ref: relativeToRepo(inboxDir),
      source_ref: existingInbox.source_ref,
      monster_ids: existingMonsters.monsters.map((monster) => monster.monster_id),
      assignment_status: existingInbox.assignment_status,
    });
    return;
  }

  const {
    createdMonsters,
    linkedExistingMonsterIds,
    resolutionStatus,
    linkedEvents,
  } = await resolveIncomingMonsters(payload.monsters ?? [], inboxId, payload, now, monsterIndex);
  const from = normalizeAddressEntries(payload.from);
  const to = normalizeAddressEntries(payload.to);
  const cc = normalizeAddressEntries(payload.cc);
  const inboxDocument = {
    workspace_intake_inbox_id: inboxId,
    source_kind: "mail",
    source_ref: payload.event_id,
    source: payload.source,
    provider_message_id: payload.provider_message_id,
    event_ref: payload.event_ref,
    raw_ref: payload.raw_ref,
    attachment_refs: normalizeArray(payload.attachment_refs),
    thread_ref: payload.thread_ref ?? null,
    received_at: payload.received_at,
    mailbox_id: payload.mailbox_id,
    intake_owner: payload.intake_owner ?? "gateway",
    assignment_status: computeInboxAssignmentStatus(createdMonsters),
    resolution_status: resolutionStatus,
    subject: payload.subject ?? null,
    from,
    to,
    cc,
    body_excerpt: payload.body_excerpt ?? null,
    monster_count: createdMonsters.length,
    monster_ids: createdMonsters.map((monster) => monster.monster_id),
    linked_existing_count: linkedExistingMonsterIds.length,
    linked_existing_monster_ids: linkedExistingMonsterIds,
    created_at: now,
    updated_at: now,
  };

  await fs.mkdir(inboxDir, { recursive: true });
  await writeJson(inboxFile, inboxDocument);
  await writeJson(monstersFile, { monsters: createdMonsters });

  const intakeEvent = {
    event_type: "mail_intake_received",
    at: now,
    inbox_id: inboxId,
    source_ref: payload.event_id,
    mailbox_id: payload.mailbox_id,
    subject: payload.subject ?? null,
    from,
    to,
    cc,
    body_excerpt: payload.body_excerpt ?? null,
    created_monster_count: createdMonsters.length,
    linked_existing_count: linkedExistingMonsterIds.length,
    resolution_status: resolutionStatus,
  };
  await appendJsonl(historyFile, intakeEvent);
  await appendGlobalEvent(intakeEvent);

  for (const event of linkedEvents) {
    await appendJsonl(historyFile, event);
    await appendGlobalEvent(event);
  }

  for (const monster of createdMonsters) {
    const createdEvent = {
      event_type: "monster_created",
      at: now,
      inbox_id: inboxId,
      source_ref: payload.event_id,
      monster_id: monster.monster_id,
      monster_family: monster.monster_family,
      monster_name: monster.monster_name,
      work_pattern: monster.work_pattern,
      dedupe_key: monster.dedupe_key,
      due_state: monster.due_state,
      known_status: monster.known_status,
      objective: monster.objective,
      objective_ko: monster.objective_ko,
      assignment_status: monster.assignment_status,
      assigned_project_code: monster.assigned_project_code,
      assigned_stage: monster.assigned_stage,
      assigned_target_inbox_ref: monster.assigned_target_inbox_ref,
      project_monster_ref: monster.project_monster_ref,
      transferred_at: monster.transferred_at,
    };
    await appendJsonl(historyFile, createdEvent);
    await appendGlobalEvent(createdEvent);
  }

  if (createdMonsters.length > 0) {
    await emitNotification(repoRoot, {
      scope: "gateway",
      event: "monster_created",
      text: renderMonsterCreatedMessage({
        inboxId,
        sourceRef: payload.event_id,
        subject: payload.subject ?? null,
        bodyExcerpt: payload.body_excerpt ?? null,
        from,
        attachmentRefs: normalizeArray(payload.attachment_refs),
        monsters: createdMonsters,
      }),
    });
  }

  printJson({
    request_id: `mail_intake_request_${inboxId}`,
    status: "materialized",
    workspace_intake_inbox_id: inboxId,
    workspace_intake_inbox_ref: relativeToRepo(inboxDir),
    source_ref: payload.event_id,
    monster_ids: createdMonsters.map((monster) => monster.monster_id),
    linked_existing_monster_ids: linkedExistingMonsterIds,
    resolution_status: resolutionStatus,
    assignment_status: inboxDocument.assignment_status,
  });
}

async function runNotifyGateway(args) {
  const event = requireFlag(args, "event");
  const enabled = requireToggleValue(args);
  const result = await setGatewayEventEnabled(repoRoot, event, enabled);
  printJson({
    request_id: `notify_gateway_${event}`,
    status: "updated",
    ...result,
  });
}

async function runNotifyMission(args) {
  const event = requireFlag(args, "event");
  const enabled = requireToggleValue(args);
  const missionId = args["mission-id"] ?? null;
  const missionFile = args["mission-file"] ?? null;
  const target = missionFile || missionId;
  if (!target) {
    throw new Error("missing required flag: --mission-id or --mission-file");
  }

  const result = await setMissionEventEnabled(repoRoot, target, event, enabled);
  printJson({
    request_id: `notify_mission_${event}`,
    status: "updated",
    ...result,
  });
}

async function runNotifyStatus(args) {
  const scope = requireFlag(args, "scope");
  const event = requireFlag(args, "event");

  if (scope === "gateway") {
    printJson(await gatewayNotifyStatus(repoRoot, event));
    return;
  }

  if (scope === "mission") {
    const missionId = args["mission-id"] ?? null;
    const missionFile = args["mission-file"] ?? null;
    const target = missionFile || missionId;
    if (!target) {
      throw new Error("missing required flag: --mission-id or --mission-file");
    }
    printJson(await missionNotifyStatus(repoRoot, target, event));
    return;
  }

  throw new Error(`unsupported scope: ${scope}`);
}

async function runNotifyEmit(args) {
  const scope = requireFlag(args, "scope");
  const event = requireFlag(args, "event");
  const text = await readMessageText(args);
  const missionId = args["mission-id"] ?? null;
  const missionFile = args["mission-file"] ?? null;
  const result = await emitNotification(repoRoot, {
    scope,
    event,
    text,
    missionId,
    missionFilePath: missionFile,
  });
  printJson(result);
  if (!result.ok && result.status !== "disabled") {
    process.exitCode = 1;
  }
}

async function runUpdateMonster(args) {
  const inboxId = sanitizeId(requireFlag(args, "inbox-id"));
  const monsterId = requireFlag(args, "monster-id");
  const patchFile = requireFlag(args, "patch-file");
  const patch = await readJson(patchFile);
  const now = new Date().toISOString();

  const inboxDir = path.join(intakeInboxRoot, inboxId);
  const inboxFile = path.join(inboxDir, "inbox.json");
  const monstersFile = path.join(inboxDir, "monsters.json");
  const historyFile = path.join(inboxDir, "history.jsonl");

  if (!(await pathExists(inboxFile)) || !(await pathExists(monstersFile))) {
    throw new Error(`inbox not found: ${relativeToRepo(inboxDir)}`);
  }

  const inboxDocument = await readJson(inboxFile);
  const monsterDocument = await readJson(monstersFile);
  const index = monsterDocument.monsters.findIndex((candidate) => candidate.monster_id === monsterId);

  if (index === -1) {
    throw new Error(`monster not found: ${monsterId}`);
  }

  const before = monsterDocument.monsters[index];
  const candidate = normalizeMonster(
    {
      ...before,
      ...patch,
      monster_id: before.monster_id,
      updated_at: before.updated_at,
    },
    index,
    inboxId,
    now,
  );
  const candidateChanges = collectChanges(before, candidate).filter((change) => change !== "updated_at");

  if (candidateChanges.length === 0) {
    printJson({
      request_id: `monster_update_${inboxId}_${monsterId}`,
      status: "no_op",
      inbox_id: inboxId,
      monster_id: monsterId,
    });
    return;
  }

  const after = {
    ...candidate,
    updated_at: now,
  };
  const changes = collectChanges(before, after);

  monsterDocument.monsters[index] = after;
  inboxDocument.assignment_status = computeInboxAssignmentStatus(monsterDocument.monsters);
  inboxDocument.updated_at = now;
  await writeJson(monstersFile, monsterDocument);
  await writeJson(inboxFile, inboxDocument);

  const updatedEvent = {
    event_type: "monster_updated",
    at: now,
    inbox_id: inboxId,
    source_ref: inboxDocument.source_ref,
    monster_id: monsterId,
    changes,
    before: pickFields(before, changes),
    after: pickFields(after, changes),
  };
  await appendJsonl(historyFile, updatedEvent);
  await appendGlobalEvent(updatedEvent);

  if (changes.includes("monster_family")) {
    await appendGlobalEvent({
      event_type: "monster_family_changed",
      at: now,
      inbox_id: inboxId,
      source_ref: inboxDocument.source_ref,
      monster_id: monsterId,
      before: { monster_family: before.monster_family },
      after: { monster_family: after.monster_family },
    });
  }

  if (changes.includes("monster_name")) {
    const eventType = before.monster_name ? "monster_renamed" : "monster_named";
    await appendGlobalEvent({
      event_type: eventType,
      at: now,
      inbox_id: inboxId,
      source_ref: inboxDocument.source_ref,
      monster_id: monsterId,
      before: { monster_name: before.monster_name },
      after: { monster_name: after.monster_name },
    });
  }

  const assignmentChanges = changes.filter((change) =>
    [
      "assignment_status",
      "assigned_project_code",
      "assigned_stage",
      "assigned_target_inbox_ref",
      "project_monster_ref",
      "transferred_at",
      "assignment_block_reason",
      "assignment_updated_at",
    ].includes(change),
  );

  if (assignmentChanges.length > 0) {
    const assignmentEvent =
      after.assignment_status === "transferred"
        ? {
            event_type: "transferred_to_project",
            at: now,
            inbox_id: inboxId,
            source_ref: inboxDocument.source_ref,
            monster_id: monsterId,
            assigned_project_code: after.assigned_project_code,
            assigned_stage: after.assigned_stage,
            assigned_target_inbox_ref: after.assigned_target_inbox_ref,
            project_monster_ref: after.project_monster_ref,
            transferred_at: after.transferred_at,
          }
        : before.assignment_status === "assigned" && after.assignment_status === "assigned"
        ? {
            event_type: "monster_reassigned",
            at: now,
            inbox_id: inboxId,
            source_ref: inboxDocument.source_ref,
            monster_id: monsterId,
            before: pickFields(before, assignmentChanges),
            after: pickFields(after, assignmentChanges),
          }
        : after.assignment_status === "assigned"
          ? {
              event_type: "assigned_to_dungeon",
              at: now,
              inbox_id: inboxId,
              source_ref: inboxDocument.source_ref,
              monster_id: monsterId,
              assigned_project_code: after.assigned_project_code,
              assigned_stage: after.assigned_stage,
              assigned_target_inbox_ref: after.assigned_target_inbox_ref,
            }
          : after.assignment_status === "blocked"
            ? {
                event_type: "assignment_blocked",
                at: now,
                inbox_id: inboxId,
                source_ref: inboxDocument.source_ref,
                monster_id: monsterId,
                reason_code: after.assignment_block_reason ?? null,
                before: pickFields(before, assignmentChanges),
                after: pickFields(after, assignmentChanges),
              }
            : null;

    if (assignmentEvent) {
      await appendJsonl(historyFile, assignmentEvent);
      await appendGlobalEvent(assignmentEvent);
    }
  }

  printJson({
    request_id: `monster_update_${inboxId}_${monsterId}`,
    status: "updated",
    inbox_id: inboxId,
    monster_id: monsterId,
    changes,
    inbox_assignment_status: inboxDocument.assignment_status,
  });
}

function validateIntakePayload(payload) {
  const required = [
    "action",
    "event_id",
    "source",
    "mailbox_id",
    "provider_message_id",
    "received_at",
    "event_ref",
    "raw_ref",
  ];

  for (const field of required) {
    if (!payload[field]) {
      throw new Error(`missing required field: ${field}`);
    }
  }

  if (payload.action !== "mail_intake_request") {
    throw new Error(`unsupported action: ${payload.action}`);
  }

  if (payload.monsters !== undefined && !Array.isArray(payload.monsters)) {
    throw new Error("monsters must be an array when provided");
  }
}

async function resolveIncomingMonsters(monsters, inboxId, payload, now, monsterIndex) {
  const inboxDir = path.join(intakeInboxRoot, inboxId);
  const createdMonsters = [];
  const linkedExistingMonsterIds = [];
  const linkedEvents = [];

  for (let index = 0; index < monsters.length; index += 1) {
    const rawMonster = monsters[index];
    const match = findExistingMonsterMatch(rawMonster, monsterIndex);

    if (rawMonster.match_existing_monster_id && !match) {
      throw new Error(`matched monster not found: ${rawMonster.match_existing_monster_id}`);
    }

    if (match) {
      const touchResult = await touchExistingMonster(match, rawMonster, payload, now);
      linkedExistingMonsterIds.push(match.monster_id);
      linkedEvents.push({
        event_type: "mail_linked_to_existing_monster",
        at: now,
        inbox_id: inboxId,
        source_ref: payload.event_id,
        linked_monster_id: match.monster_id,
        matched_by: touchResult.matched_by,
        dedupe_key: normalizeDedupeKey(rawMonster.dedupe_key),
        mail_role: normalizeMailRole(rawMonster.mail_role),
      });
      continue;
    }

    const normalized = normalizeMonster(rawMonster, index, inboxId, now, payload);
    createdMonsters.push(normalized);
    registerMonsterInIndex(monsterIndex, normalized, { inbox_id: inboxId, inbox_dir: inboxDir });
  }

  return {
    createdMonsters,
    linkedExistingMonsterIds,
    linkedEvents,
    resolutionStatus: computeResolutionStatus(createdMonsters, linkedExistingMonsterIds),
  };
}

function findExistingMonsterMatch(monster, monsterIndex) {
  if (monster.match_existing_monster_id) {
    return monsterIndex.byId.get(monster.match_existing_monster_id) ?? null;
  }

  const dedupeKey = normalizeDedupeKey(monster.dedupe_key);
  if (dedupeKey) {
    return monsterIndex.byDedupeKey.get(dedupeKey) ?? null;
  }

  return null;
}

async function touchExistingMonster(match, rawMonster, payload, now) {
  const inboxFile = path.join(match.inbox_dir, "inbox.json");
  const monstersFile = path.join(match.inbox_dir, "monsters.json");
  const historyFile = path.join(match.inbox_dir, "history.jsonl");
  const inboxDocument = await readJson(inboxFile);
  const monsterDocument = await readJson(monstersFile);
  const monsterIndex = monsterDocument.monsters.findIndex((candidate) => candidate.monster_id === match.monster_id);

  if (monsterIndex === -1) {
    throw new Error(`linked monster not found in inbox: ${match.monster_id}`);
  }

  const before = monsterDocument.monsters[monsterIndex];
  const nextSourceRefs = appendUnique(normalizeArray(before.source_refs), [payload.event_id]);
  const alreadySeen = normalizeArray(before.source_refs).includes(payload.event_id);
  const baseTouchCount =
    typeof before.mail_touch_count === "number" ? before.mail_touch_count : normalizeArray(before.source_refs).length;
  const after = {
    ...before,
    dedupe_key: before.dedupe_key ?? normalizeDedupeKey(rawMonster.dedupe_key),
    source_refs: nextSourceRefs,
    last_mail_at: payload.received_at,
    last_mail_role: normalizeMailRole(rawMonster.mail_role),
    mail_touch_count: alreadySeen ? baseTouchCount : baseTouchCount + 1,
    updated_at: now,
  };
  const changes = collectChanges(before, after);

  if (changes.length > 0) {
    monsterDocument.monsters[monsterIndex] = after;
    inboxDocument.updated_at = now;
    await writeJson(monstersFile, monsterDocument);
    await writeJson(inboxFile, inboxDocument);

    const touchEvent = {
      event_type: "monster_touched_by_mail",
      at: now,
      inbox_id: match.inbox_id,
      source_ref: payload.event_id,
      monster_id: match.monster_id,
      matched_by: rawMonster.match_existing_monster_id ? "monster_id" : "dedupe_key",
      mail_role: normalizeMailRole(rawMonster.mail_role),
      changes,
      before: pickFields(before, changes),
      after: pickFields(after, changes),
    };
    await appendJsonl(historyFile, touchEvent);
    await appendGlobalEvent(touchEvent);
  }

  return {
    matched_by: rawMonster.match_existing_monster_id ? "monster_id" : "dedupe_key",
  };
}

function normalizeMonsters(monsters, inboxId, now) {
  return monsters.map((monster, index) => normalizeMonster(monster, index, inboxId, now));
}

function normalizeMonster(monster, index, inboxId, now, payload = null) {
  const monsterId = monster.monster_id ?? `${inboxId}_${String(index + 1).padStart(3, "0")}`;
  const monsterFamily = monster.monster_family ?? "unknown_monster";
  const knownStatus = monster.known_status ?? (monsterFamily === "unknown_monster" ? "unknown" : "known");
  const dDay = monster.d_day ?? null;
  const sourceRef = payload?.event_id ?? null;
  const sourceRefs = appendUnique(normalizeArray(monster.source_refs), sourceRef ? [sourceRef] : []);

  return {
    monster_id: monsterId,
    monster_family: monsterFamily,
    monster_name: monster.monster_name ?? null,
    work_pattern: monster.work_pattern ?? null,
    dedupe_key: normalizeDedupeKey(monster.dedupe_key),
    objective: monster.objective ?? "",
    objective_ko: monster.objective_ko ?? null,
    d_day: dDay,
    due_state: monster.due_state ?? computeDueState(dDay),
    known_status: knownStatus,
    source_refs: sourceRefs,
    last_mail_at: monster.last_mail_at ?? payload?.received_at ?? null,
    mail_touch_count: monster.mail_touch_count ?? sourceRefs.length,
    last_mail_role: normalizeMailRole(monster.last_mail_role ?? monster.mail_role),
    project_hints: normalizeArray(monster.project_hints),
    stage_hints: normalizeArray(monster.stage_hints),
    assignment_status: monster.assignment_status ?? "pending_dungeon_assignment",
    assigned_project_code: monster.assigned_project_code ?? null,
    assigned_stage: monster.assigned_stage ?? null,
    assigned_target_inbox_ref: monster.assigned_target_inbox_ref ?? null,
    project_monster_ref: monster.project_monster_ref ?? null,
    transferred_at: monster.transferred_at ?? null,
    assignment_block_reason: monster.assignment_block_reason ?? null,
    assignment_updated_at:
      hasAssignmentState(monster) || hasAssignmentStateChange(monster)
        ? monster.assignment_updated_at ?? now
        : null,
    unresolved_reason:
      monster.unresolved_reason ?? (monsterFamily === "unknown_monster" ? "family unresolved" : null),
    mission_ref: monster.mission_ref ?? null,
    source_quote: monster.source_quote ?? null,
    created_at: monster.created_at ?? now,
    updated_at: monster.updated_at ?? now,
  };
}

function computeInboxAssignmentStatus(monsters) {
  if (monsters.length === 0) {
    return "not_required";
  }

  const statuses = monsters.map((monster) => monster.assignment_status ?? "pending_dungeon_assignment");

  if (statuses.every((status) => status === "transferred")) {
    return "assigned";
  }

  if (statuses.every((status) => status === "assigned" || status === "transferred")) {
    return "assigned";
  }

  if (statuses.some((status) => status === "assigned" || status === "transferred")) {
    return "partially_assigned";
  }

  if (statuses.every((status) => status === "blocked")) {
    return "blocked";
  }

  return "pending_dungeon_assignment";
}

function computeResolutionStatus(createdMonsters, linkedExistingMonsterIds) {
  if (createdMonsters.length > 0 && linkedExistingMonsterIds.length > 0) {
    return "mixed";
  }

  if (linkedExistingMonsterIds.length > 0) {
    return "linked_existing_only";
  }

  if (createdMonsters.length > 0) {
    return "created_only";
  }

  return "empty";
}

function hasAssignmentState(monster) {
  return Boolean(
      monster.assigned_project_code ||
      monster.assigned_stage ||
      monster.assigned_target_inbox_ref ||
      monster.project_monster_ref ||
      monster.transferred_at ||
      monster.assignment_block_reason,
  );
}

function hasAssignmentStateChange(monster) {
  return (
    monster.assignment_status === "assigned" ||
    monster.assignment_status === "blocked" ||
    monster.assignment_status === "transferred"
  );
}

function computeDueState(dDay) {
  if (!dDay) {
    return "no_due";
  }

  const dueDate = new Date(dDay);
  if (Number.isNaN(dueDate.getTime())) {
    return "no_due";
  }

  const diffMs = dueDate.getTime() - Date.now();
  if (diffMs < 0) {
    return "missed";
  }

  const diffHours = diffMs / (1000 * 60 * 60);
  if (diffHours <= 24) {
    return "at_risk";
  }

  return "scheduled";
}

function collectChanges(before, after) {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changes = [];

  for (const key of keys) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      changes.push(key);
    }
  }

  return changes.sort();
}

function pickFields(record, keys) {
  const selected = {};
  for (const key of keys) {
    selected[key] = record[key] ?? null;
  }
  return selected;
}

function normalizeArray(value) {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function appendUnique(items, additions) {
  const merged = [...normalizeArray(items), ...normalizeArray(additions)];
  return [...new Set(merged.filter(Boolean))];
}

function normalizeMailRole(value) {
  if (!value) {
    return "new_request";
  }

  const normalized = String(value).trim();
  return normalized || "new_request";
}

function normalizeDedupeKey(value) {
  if (!value) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized || null;
}

async function loadMonsterIndex() {
  const index = {
    byId: new Map(),
    byDedupeKey: new Map(),
  };

  await loadMonsterIndexRoot(index, intakeInboxRoot);
  return index;
}

async function loadMonsterIndexRoot(index, rootPath) {
  if (!(await pathExists(rootPath))) {
    return;
  }

  const entries = await fs.readdir(rootPath, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const inboxDir = path.join(rootPath, entry.name);
    const monstersFile = path.join(inboxDir, "monsters.json");
    if (!(await pathExists(monstersFile))) {
      continue;
    }

    const monsterDocument = await readJson(monstersFile);
    for (const monster of normalizeArray(monsterDocument.monsters)) {
      registerMonsterInIndex(index, monster, { inbox_id: entry.name, inbox_dir: inboxDir });
    }
  }
}

function registerMonsterInIndex(index, monster, location) {
  const record = {
    monster_id: monster.monster_id,
    inbox_id: location.inbox_id,
    inbox_dir: location.inbox_dir,
    updated_at: monster.updated_at ?? null,
  };

  index.byId.set(monster.monster_id, record);

  const dedupeKey = normalizeDedupeKey(monster.dedupe_key);
  if (!dedupeKey) {
    return;
  }

  const existing = index.byDedupeKey.get(dedupeKey);
  if (!existing || compareTimestamps(record.updated_at, existing.updated_at) >= 0) {
    index.byDedupeKey.set(dedupeKey, record);
  }
}

function compareTimestamps(left, right) {
  const leftTime = left ? new Date(left).getTime() : 0;
  const rightTime = right ? new Date(right).getTime() : 0;
  return leftTime - rightTime;
}

function normalizeAddressEntries(value) {
  const entries = normalizeArray(value);
  return entries
    .map((entry) => {
      if (!entry) {
        return null;
      }

      if (typeof entry === "string") {
        return {
          name: null,
          address: entry,
        };
      }

      return {
        name: entry.name ?? null,
        address: entry.address ?? entry.email ?? null,
      };
    })
    .filter((entry) => entry && entry.address);
}

function requireToggleValue(args) {
  if (args.on) {
    return true;
  }

  if (args.off) {
    return false;
  }

  const enabled = args.enabled;
  if (enabled === "true" || enabled === true) {
    return true;
  }

  if (enabled === "false") {
    return false;
  }

  throw new Error("missing required toggle flag: --on, --off, or --enabled <true|false>");
}

function requireFlag(args, key) {
  const value = args[key];
  if (!value || value === true) {
    throw new Error(`missing required flag: --${key}`);
  }
  return value;
}

async function readMessageText(args) {
  if (args["text-file"]) {
    return (await fs.readFile(String(args["text-file"]), "utf8")).trim();
  }

  const text = String(args.text ?? "").trim();
  if (!text) {
    throw new Error("missing required flag: --text or --text-file");
  }
  return text;
}

function renderMonsterCreatedMessage({ inboxId, sourceRef, subject, bodyExcerpt, from, attachmentRefs, monsters }) {
  const lines = [
    "[관문]",
    "새 의뢰가 도착했습니다.",
  ];

  if (subject) {
    lines.push("");
    lines.push(`제목: ${subject}`);
  }

  const bodySummary = summarizeMailBody(bodyExcerpt);
  if (bodySummary) {
    lines.push(`요약: ${bodySummary}`);
  }

  lines.push(`발신자: ${formatSenderSummary(from)}`);
  lines.push(`첨부파일: ${formatAttachmentCount(attachmentRefs)}`);
  lines.push(`몬스터 수: ${monsters.length}마리`);

  lines.push("");
  lines.push("몬스터 정보");

  monsters.forEach((monster, index) => {
    lines.push(`${index + 1}. ${formatMonsterHeadline(monster)}`);
    lines.push(` - 할일: ${formatMonsterObjective(monster)}`);
    lines.push(` - 기한: ${formatMonsterDue(monster)}`);
    lines.push(` - 긴급도: ${formatMonsterUrgency(monster)}`);
  });

  if (!subject && (inboxId || sourceRef)) {
    lines.push("");
    lines.push("관문에서 새 몬스터가 감지되었습니다.");
  }

  return lines.join("\n");
}

function formatMonsterHeadline(monster) {
  const family = normalizeMonsterFamilyLabel(monster.monster_family);
  const rawName = String(monster.monster_name ?? "").trim();
  if (!rawName) {
    return family;
  }

  const name = normalizeMonsterNameLabel(rawName);
  if (name.toLowerCase() === family.toLowerCase()) {
    return name;
  }

  return `${name} ${family}`;
}

function formatMonsterObjective(monster) {
  const objectiveKo = String(monster.objective_ko ?? "").trim();
  if (objectiveKo) {
    return objectiveKo;
  }

  const objective = String(monster.objective ?? "").trim();
  if (!objective) {
    return "미정";
  }

  return localizeInstruction(objective, "task");
}

function summarizeMailBody(bodyExcerpt) {
  const normalized = normalizeSentence(bodyExcerpt);
  if (!normalized) {
    return null;
  }

  return truncateLine(localizeInstruction(stripSummaryDueHint(normalized), "summary"), 120);
}

function localizeInstruction(value, mode) {
  const text = normalizeSentence(value);
  if (!text) {
    return mode === "summary" ? "새 요청이 도착했습니다." : "세부 작업을 확인합니다.";
  }

  const stripped = stripRequestPrefix(text);

  const matched =
    matchInstruction(stripped, /^Review and process the attached (.+)$/i, {
      task: (target) => `첨부된 ${target}를 검토하고 처리합니다.`,
      summary: (target) => `첨부된 ${target}의 검토 및 처리 요청입니다.`,
    }) ||
    matchInstruction(stripped, /^Review and process (.+)$/i, {
      task: (target) => `${target}를 검토하고 처리합니다.`,
      summary: (target) => `${target}의 검토 및 처리 요청입니다.`,
    }) ||
    matchInstruction(stripped, /^Review the attached (.+)$/i, {
      task: (target) => `첨부된 ${target}를 검토합니다.`,
      summary: (target) => `첨부된 ${target} 검토 요청입니다.`,
    }) ||
    matchInstruction(stripped, /^Review (.+)$/i, {
      task: (target) => `${target}를 검토합니다.`,
      summary: (target) => `${target} 검토 요청입니다.`,
    }) ||
    matchInstruction(stripped, /^Process the attached (.+)$/i, {
      task: (target) => `첨부된 ${target}를 처리합니다.`,
      summary: (target) => `첨부된 ${target} 처리 요청입니다.`,
    }) ||
    matchInstruction(stripped, /^Process (.+)$/i, {
      task: (target) => `${target}를 처리합니다.`,
      summary: (target) => `${target} 처리 요청입니다.`,
    }) ||
    matchInstruction(stripped, /^Update (.+)$/i, {
      task: (target) => `${target}를 업데이트합니다.`,
      summary: (target) => `${target} 업데이트 요청입니다.`,
    }) ||
    matchInstruction(stripped, /^(Create|Write|Draft|Prepare) (.+)$/i, {
      task: (target) => `${target}를 작성합니다.`,
      summary: (target) => `${target} 작성 요청입니다.`,
    }) ||
    matchInstruction(stripped, /^(Send|Submit) (.+)$/i, {
      task: (target) => `${target}를 송부합니다.`,
      summary: (target) => `${target} 송부 요청입니다.`,
    }) ||
    matchInstruction(stripped, /^Confirm (.+)$/i, {
      task: (target) => `${target}를 확인합니다.`,
      summary: (target) => `${target} 확인 요청입니다.`,
    }) ||
    matchInstruction(stripped, /^Complete and submit (.+)$/i, {
      task: (target) => `${target}를 완료하고 제출합니다.`,
      summary: (target) => `${target} 완료 및 제출 요청입니다.`,
    }) ||
    matchInstruction(stripped, /^Complete (.+)$/i, {
      task: (target) => `${target}를 완료합니다.`,
      summary: (target) => `${target} 완료 요청입니다.`,
    }) ||
    matchInstruction(stripped, /^(Reply|Respond) with (.+)$/i, {
      task: (target) => `${target}를 회신합니다.`,
      summary: (target) => `${target} 회신 요청입니다.`,
    });

  if (matched) {
    return matched[mode];
  }

  return mode === "summary"
    ? `다음 요청이 도착했습니다: ${truncateLine(stripped, 90)}`
    : `다음 작업을 진행합니다: ${truncateLine(stripped, 90)}`;
}

function formatSenderSummary(entries) {
  const normalized = normalizeArray(entries);
  if (normalized.length === 0) {
    return "미확인";
  }

  const [first, ...rest] = normalized;
  const primary = first.name || first.address || "미확인";
  if (rest.length === 0) {
    return primary;
  }

  return `${primary} 외 ${rest.length}`;
}

function formatAttachmentCount(attachmentRefs) {
  const count = normalizeArray(attachmentRefs).filter(Boolean).length;
  if (count === 0) {
    return "없음";
  }

  return `${count}건`;
}

function formatMonsterDue(monster) {
  return formatDueLabel(monster.d_day, monster.due_state);
}

function formatDueLabel(dDay, dueState) {
  const date = parseDueDate(dDay);
  if (!date) {
    return "기한 미정";
  }

  const dayName = ["일", "월", "화", "수", "목", "금", "토"][date.getDay()];
  const dateLabel = `${date.getMonth() + 1}/${date.getDate()}(${dayName})`;
  const delta = formatDueDelta(date, dueState);

  return delta ? `${dateLabel} · ${delta}` : dateLabel;
}

function formatDueDelta(date, dueState) {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((target.getTime() - startOfToday.getTime()) / (1000 * 60 * 60 * 24));

  if (dueState === "missed" || diffDays < 0) {
    return `D+${Math.abs(diffDays)}`;
  }

  if (diffDays === 0) {
    return "D-Day";
  }

  return `D-${diffDays}`;
}

function formatMonsterUrgency(monster) {
  const dueState = monster.due_state ?? computeDueState(monster.d_day);
  if (dueState === "missed" || dueState === "at_risk") {
    return "긴급";
  }

  const date = parseDueDate(monster.d_day);
  if (!date) {
    return "보통";
  }

  const diffMs = date.getTime() - Date.now();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  if (diffDays <= 3) {
    return "주의";
  }

  return "보통";
}

function parseDueDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function matchInstruction(value, pattern, renderers) {
  const match = String(value).match(pattern);
  if (!match) {
    return null;
  }

  const rawTarget = match.at(-1) ?? "";
  const target = normalizeInstructionTarget(rawTarget);
  if (!target) {
    return null;
  }

  return {
    task: renderers.task(target),
    summary: renderers.summary(target),
  };
}

function stripRequestPrefix(value) {
  return String(value)
    .trim()
    .replace(/^please\s+/i, "")
    .replace(/^kindly\s+/i, "")
    .replace(/^can you\s+/i, "")
    .replace(/^could you\s+/i, "")
    .trim();
}

function normalizeSentence(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.]+$/, "");
}

function normalizeInstructionTarget(value) {
  return normalizeSentence(value)
    .replace(/^(the|a|an)\s+/i, "")
    .replace(/\bpackage\b/gi, "패키지")
    .replace(/\bdocument\b/gi, "문서")
    .replace(/\bfile\b/gi, "파일")
    .replace(/\breport\b/gi, "보고서")
    .replace(/\bchecklist\b/gi, "체크리스트")
    .replace(/\bdraft\b/gi, "초안")
    .replace(/\bsubmission\b/gi, "제출본")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateLine(value, maxLength) {
  const text = String(value ?? "").trim();
  if (!text || text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function stripSummaryDueHint(value) {
  return String(value ?? "")
    .replace(/\s+(by|before|until|due)\s+[^.]+$/i, "")
    .replace(/\s+기한[:\s][^.]+$/i, "")
    .trim();
}

function normalizeMonsterFamilyLabel(value) {
  if (!value) {
    return "정체 미상";
  }

  const key = String(value).trim();
  const labels = {
    slime: "슬라임",
    imp: "임프",
    goblin: "고블린",
    kobold: "코볼트",
    mimic: "미믹",
    basilisk: "바실리스크",
    harpy: "하피",
    orc: "오크",
    golem: "골렘",
    troll: "트롤",
    wyvern: "와이번",
    hydra: "히드라",
    chimera: "키메라",
    sphinx: "스핑크스",
    beholder: "비홀더",
    lich: "리치",
    wraith: "레이스",
    phoenix: "피닉스",
    dragon: "드래곤",
    unknown_monster: "정체 미상",
  };

  return labels[key] ?? humanizeLabel(key);
}

function normalizeMonsterNameLabel(value) {
  if (!value) {
    return "이름 미정";
  }
  return humanizeLabel(String(value));
}

function humanizeLabel(value) {
  return String(value)
    .trim()
    .split(/[_-]+/g)
    .filter(Boolean)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(" ");
}

function sanitizeId(value) {
  const cleaned = String(value)
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned || "unknown";
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function appendJsonl(filePath, event) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, `${JSON.stringify(event)}\n`, "utf8");
}

async function appendGlobalEvent(event) {
  const stamp = new Date(event.at);
  const year = String(stamp.getUTCFullYear());
  const month = String(stamp.getUTCMonth() + 1).padStart(2, "0");
  const filePath = path.join(globalEventRoot, year, `${year}-${month}.jsonl`);
  await appendJsonl(filePath, event);
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function relativeToRepo(filePath) {
  return path.relative(repoRoot, filePath) || ".";
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

main().catch(async (error) => {
  console.error(error.message);
  process.exit(1);
});
