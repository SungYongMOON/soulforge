#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const monsterHouseRoot = path.join(repoRoot, "_workspaces", "monster_house", ".project_agent");
const intakeInboxRoot = path.join(monsterHouseRoot, "intake_inbox");
const globalEventRoot = path.join(monsterHouseRoot, "log", "monster_events");

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
      "  node scripts/monster-house.mjs intake --payload-file <path>",
      "  node scripts/monster-house.mjs update-monster --inbox-id <id> --monster-id <id> --patch-file <path>",
    ].join("\n"),
  );
  process.exit(1);
}

async function runIntake(args) {
  const payloadFile = requireFlag(args, "payload-file");
  const payload = await readJson(payloadFile);
  validateIntakePayload(payload);

  const inboxId = sanitizeId(payload.event_id);
  const inboxDir = path.join(intakeInboxRoot, inboxId);
  const inboxFile = path.join(inboxDir, "inbox.json");
  const monstersFile = path.join(inboxDir, "monsters.json");
  const historyFile = path.join(inboxDir, "history.jsonl");
  const now = new Date().toISOString();

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

  const normalizedMonsters = normalizeMonsters(payload.monsters ?? [], inboxId, now);
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
    intake_owner: payload.intake_owner ?? "guild_master",
    assignment_status: computeInboxAssignmentStatus(normalizedMonsters),
    subject: payload.subject ?? null,
    from,
    to,
    cc,
    body_excerpt: payload.body_excerpt ?? null,
    monster_count: normalizedMonsters.length,
    monster_ids: normalizedMonsters.map((monster) => monster.monster_id),
    created_at: now,
    updated_at: now,
  };

  await fs.mkdir(inboxDir, { recursive: true });
  await writeJson(inboxFile, inboxDocument);
  await writeJson(monstersFile, { monsters: normalizedMonsters });

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
    monster_count: normalizedMonsters.length,
  };
  await appendJsonl(historyFile, intakeEvent);
  await appendGlobalEvent(intakeEvent);

  for (const monster of normalizedMonsters) {
    const createdEvent = {
      event_type: "monster_created",
      at: now,
      inbox_id: inboxId,
      source_ref: payload.event_id,
      monster_id: monster.monster_id,
      monster_family: monster.monster_family,
      monster_name: monster.monster_name,
      work_pattern: monster.work_pattern,
      due_state: monster.due_state,
      known_status: monster.known_status,
      objective: monster.objective,
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

  printJson({
    request_id: `mail_intake_request_${inboxId}`,
    status: "materialized",
    workspace_intake_inbox_id: inboxId,
    workspace_intake_inbox_ref: relativeToRepo(inboxDir),
    source_ref: payload.event_id,
    monster_ids: normalizedMonsters.map((monster) => monster.monster_id),
    assignment_status: "pending_dungeon_assignment",
  });
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

function normalizeMonsters(monsters, inboxId, now) {
  return monsters.map((monster, index) => normalizeMonster(monster, index, inboxId, now));
}

function normalizeMonster(monster, index, inboxId, now) {
  const monsterId = monster.monster_id ?? `${inboxId}_${String(index + 1).padStart(3, "0")}`;
  const monsterFamily = monster.monster_family ?? "unknown_monster";
  const knownStatus = monster.known_status ?? (monsterFamily === "unknown_monster" ? "unknown" : "known");
  const dDay = monster.d_day ?? null;

  return {
    monster_id: monsterId,
    monster_family: monsterFamily,
    monster_name: monster.monster_name ?? null,
    work_pattern: monster.work_pattern ?? null,
    objective: monster.objective ?? "",
    d_day: dDay,
    due_state: monster.due_state ?? computeDueState(dDay),
    known_status: knownStatus,
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
    return "pending_dungeon_assignment";
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
        address: entry.address ?? null,
      };
    })
    .filter((entry) => entry && entry.address);
}

function requireFlag(args, key) {
  const value = args[key];
  if (!value || value === true) {
    throw new Error(`missing required flag: --${key}`);
  }
  return value;
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

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
