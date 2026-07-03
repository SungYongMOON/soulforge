#!/usr/bin/env node
// tools/followup_scan.mjs — deterministic metadata-only follow-up scanner.
// Dry-run by default. --apply is required to write task-ledger candidates,
// followup cursor entries, or event_log rows. No mail body/attachment access.
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { readCsvObjects } from "./mail_to_task_pending.mjs";
import {
  isOutboundMail,
  mailHistoryKeyFromMailRef,
  mailHistoryKeyFromTaskKey,
  threadKeyAliasesForMail,
  threadKeyForMail,
} from "./mail_thread_key.mjs";

const execFileP = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, "..");
const REPO = resolve(HERE, "..", "..", "..", "..");
const CODE_RE = /^P\d{2}-\d{3}/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAIL_REL = join("reports", "메일_이력", "메일_이력.csv");
const TASK_REL = join("reports", "할일_장부", "할일_장부.csv");
const CLOSED_TASK_STATUSES = new Set(["done", "cancelled", "canceled", "closed", "complete", "완료", "취소"]);
const CURSOR_SCHEMA = "soulforge.dev_erp.followup_cursor.v0";

function readArg(argv, name, fallback) {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 && argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[index + 1] : fallback;
}

function hasArg(argv, name) {
  return argv.includes(`--${name}`);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function parseFollowupArgs(argv = process.argv.slice(2), env = process.env) {
  const projects = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--project" && argv[index + 1] && !argv[index + 1].startsWith("--")) projects.push(argv[index + 1]);
  }
  return {
    apply: hasArg(argv, "apply"),
    json: hasArg(argv, "json"),
    workmeta: readArg(argv, "workmeta", readArg(argv, "workmeta-root", join(REPO, "_workmeta"))),
    dataDir: readArg(argv, "data-dir", join(APP, "data")),
    db: readArg(argv, "db", "data/dev-erp.db"),
    today: validateDateOnly(readArg(argv, "today", todayIso())),
    days: Math.max(1, Number(readArg(argv, "days", env.DEV_ERP_FOLLOWUP_DAYS || "3")) || 3),
    reminderDays: Math.max(0, Number(readArg(argv, "reminder-days", env.DEV_ERP_FOLLOWUP_REMINDER_DAYS || "2")) || 2),
    limit: Math.max(1, Number(readArg(argv, "limit", env.DEV_ERP_FOLLOWUP_LIMIT || "5")) || 5),
    projects,
    runId: readArg(argv, "run-id", `followup_scan_${new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14)}`),
  };
}

function validateDateOnly(value) {
  const raw = String(value ?? "").trim();
  if (!DATE_RE.test(raw)) throw new Error(`invalid_date:${value}`);
  return raw;
}

function addDaysIso(dateOnly, days) {
  const base = validateDateOnly(dateOnly);
  const date = new Date(`${base}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

function calendarDaysBetween(startIso, today) {
  const start = String(startIso ?? "").slice(0, 10);
  if (!DATE_RE.test(start)) return null;
  const a = Date.parse(`${start}T00:00:00Z`);
  const b = Date.parse(`${today}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.floor((b - a) / 86400000);
}

function dateTimeMs(value) {
  const raw = String(value ?? "").trim();
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : NaN;
}

const firstOf = (row, names) => {
  for (const name of names) {
    const value = row?.[name];
    if (value != null && String(value).trim() !== "") return String(value).trim();
  }
  return "";
};

function isOpenTaskStatus(status) {
  const normalized = String(status ?? "").trim().toLowerCase();
  return !CLOSED_TASK_STATUSES.has(normalized);
}

function isInboundMail({ event_type = "", eventType = "", mailbox = "" } = {}) {
  const text = `${event_type || eventType} ${mailbox}`.toLowerCase();
  return /(^|[_\s-])(received|inbound|incoming|inbox)([_\s-]|$)|\uC218\uC2E0|\uBC1B\uC74C/iu.test(text);
}

function loadCursor(cursorPath) {
  try {
    const parsed = JSON.parse(readFileSync(cursorPath, "utf8"));
    const keys = parsed?.keys && typeof parsed.keys === "object" ? parsed.keys : {};
    return { schema_version: CURSOR_SCHEMA, keys };
  } catch {
    return { schema_version: CURSOR_SCHEMA, keys: {} };
  }
}

function saveCursor(cursorPath, cursor) {
  mkdirSync(dirname(cursorPath), { recursive: true });
  writeFileSync(cursorPath, `${JSON.stringify({ schema_version: CURSOR_SCHEMA, keys: cursor.keys }, null, 2)}\n`);
}

function listProjects(workmetaRoot, requested = []) {
  if (requested.length) return requested;
  if (!existsSync(workmetaRoot)) return [];
  return readdirSync(workmetaRoot).filter((name) => CODE_RE.test(name));
}

function mailRowsForProject(workmetaRoot, projectId) {
  const mail = readCsvObjects(join(workmetaRoot, projectId, MAIL_REL));
  return mail.rows.map((row) => {
    const historyKey = firstOf(row, ["이력키", "history_key"]);
    const subject = firstOf(row, ["제목", "subject"]);
    const from = firstOf(row, ["발신자", "from"]);
    const mailbox = firstOf(row, ["메일함", "mailbox"]);
    const eventType = firstOf(row, ["이벤트유형", "event_type"]);
    const rawThread = firstOf(row, ["스레드", "스레드키", "메일스레드ID", "스레드ID"]);
    const threadAliases = threadKeyAliasesForMail({ thread: rawThread, subject, from });
    return {
      history_key: historyKey,
      subject,
      from,
      mailbox,
      received_at: firstOf(row, ["메일수신시각", "received_at"]),
      source_id: firstOf(row, ["메일소스ID", "source_id"]),
      event_type: eventType,
      thread: threadKeyForMail({ thread: rawThread, subject, from }),
      thread_aliases: threadAliases,
      outbound: isOutboundMail({ event_type: eventType, mailbox }),
      inbound: isInboundMail({ event_type: eventType, mailbox }),
    };
  }).filter((row) => row.history_key);
}

function taskRowsForProject(workmetaRoot, projectId) {
  return readCsvObjects(join(workmetaRoot, projectId, TASK_REL)).rows;
}

function openTaskThreadMap(taskRows) {
  const out = new Map();
  for (const row of taskRows) {
    const itemKey = firstOf(row, ["할일키", "id"]);
    const thread = firstOf(row, ["소스스레드키", "source_thread_ref"]);
    const status = firstOf(row, ["상태", "status"]);
    if (!itemKey || !thread || !isOpenTaskStatus(status)) continue;
    if (!out.has(thread)) out.set(thread, itemKey);
  }
  return out;
}

function convertedMailKeys(taskRows, knownMailKeys = null) {
  const out = new Set();
  for (const row of taskRows) {
    const key = firstOf(row, ["할일키", "id"]);
    const taskHistoryKey = mailHistoryKeyFromTaskKey(key, knownMailKeys);
    if (taskHistoryKey) out.add(taskHistoryKey);
    const ref = firstOf(row, ["관련메일이력키", "소스메일키", "source_mail_ref"]);
    const refHistoryKey = mailHistoryKeyFromMailRef(ref);
    if (refHistoryKey) out.add(refHistoryKey);
  }
  return out;
}

function cappedSubject(subject, max = 40) {
  const text = String(subject ?? "").replace(/\s+/gu, " ").trim() || "(제목 없음)";
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function suggestedSenderRef(mail) {
  return String(mail.from || mail.mailbox || "").replace(/\s+/gu, " ").trim().slice(0, 120);
}

function buildFollowupCandidate(mail, opts) {
  return {
    title: `회신 확인: ${cappedSubject(mail.subject, 40)}`,
    work_type: "answer",
    completion_criteria: "상대 회신 수신 또는 재송부/유선 확인",
    due: addDaysIso(opts.today, 2),
    review_status: "needs_review",
    review_reason: "auto_followup_no_reply",
    suggested_assignee_ref: suggestedSenderRef(mail),
    assignee_confidence: "low",
    assignee_reason: "원 발신자 기본 제안(확정 담당자 아님)",
    source_thread_ref: mail.thread || "",
    source_mail_source_id: mail.source_id || "",
    generation_rule_ref: "followup_scan",
    generation_run_ref: opts.runId,
  };
}

function hasLaterInbound(mail, allRows) {
  const aliases = new Set(mail.thread_aliases?.length ? mail.thread_aliases : [mail.thread].filter(Boolean));
  if (!aliases.size) return false;
  const sentMs = dateTimeMs(mail.received_at);
  return allRows.some((row) => {
    const rowAliases = row.thread_aliases?.length ? row.thread_aliases : [row.thread].filter(Boolean);
    if (!row.inbound || !rowAliases.some((thread) => aliases.has(thread))) return false;
    const receivedMs = dateTimeMs(row.received_at);
    return Number.isFinite(sentMs) && Number.isFinite(receivedMs) && receivedMs > sentMs;
  });
}

function openTaskForMail(mail, openThreads) {
  const aliases = mail.thread_aliases?.length ? mail.thread_aliases : [mail.thread].filter(Boolean);
  for (const thread of aliases) {
    const itemRef = openThreads.get(thread);
    if (itemRef) return { itemRef, thread };
  }
  return { itemRef: "", thread: mail.thread || "" };
}

function dueReminderRows(taskRows, opts, cursor) {
  const planned = [];
  for (const row of taskRows) {
    const taskKey = firstOf(row, ["할일키", "id"]);
    const status = firstOf(row, ["상태", "status"]);
    const due = firstOf(row, ["마감일", "due", "due_date"]);
    const nextAction = firstOf(row, ["다음액션", "next_action"]);
    if (!taskKey || !DATE_RE.test(due) || nextAction || !isOpenTaskStatus(status)) continue;
    const daysUntil = calendarDaysBetween(opts.today, due);
    if (daysUntil == null || daysUntil < 0 || daysUntil > opts.reminderDays) continue;
    const cursorKey = `${opts.project}|due_reminder|${taskKey}|${due}`;
    if (cursor.keys[cursorKey]) continue;
    planned.push({ task_key: taskKey, due, cursor_key: cursorKey, days_until: daysUntil });
  }
  return planned;
}

async function appendEvent(opts, deps, event) {
  if (typeof deps.appendEvent === "function") {
    deps.appendEvent(event);
    return true;
  }
  if (deps.appendEvent === null || !opts.apply) return false;
  try {
    const dbPath = /^([A-Za-z]:[\\/]|\/)/.test(opts.db) ? opts.db : resolve(APP, opts.db);
    if (!existsSync(dbPath)) return false;
    const { openStore } = await import("../src/store.mjs");
    const store = openStore(dbPath);
    store.appendEvent(event);
    store.db.close();
    return true;
  } catch {
    return false;
  }
}

async function defaultExec(cmd, args, { timeout }) {
  return execFileP(cmd, args, { cwd: APP, timeout, maxBuffer: 8 * 1024 * 1024 });
}

async function applyCandidates(projectId, candidates, opts, exec) {
  if (!Object.keys(candidates).length) return { applied: 0, skipped: true };
  const tmpDir = join(opts.dataDir, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const candidatePath = join(tmpDir, `followup_${projectId}_${opts.runId}.json`);
  writeFileSync(candidatePath, JSON.stringify(candidates, null, 2));
  await exec("node", [
    "tools/mail_to_task_ledger.mjs",
    "--project", projectId,
    "--candidates", candidatePath,
    "--db", opts.db,
    "--workmeta", opts.workmeta,
    "--run-id", opts.runId,
    "--apply",
  ], { timeout: 60000 });
  return { applied: Object.keys(candidates).length, candidate_path: candidatePath };
}

export async function runFollowupScan(options, deps = {}) {
  const opts = {
    apply: false,
    json: true,
    workmeta: join(REPO, "_workmeta"),
    dataDir: join(APP, "data"),
    db: "data/dev-erp.db",
    today: todayIso(),
    days: 3,
    reminderDays: 2,
    limit: 5,
    projects: [],
    runId: `followup_scan_${new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14)}`,
    ...options,
  };
  opts.today = validateDateOnly(opts.today);
  const exec = deps.exec ?? defaultExec;
  const cursorPath = join(opts.dataDir, "followup_cursor.json");
  const cursor = loadCursor(cursorPath);
  const summary = {
    ok: true,
    apply: Boolean(opts.apply),
    today: opts.today,
    days: opts.days,
    reminder_days: opts.reminderDays,
    limit: opts.limit,
    body_access: "metadata_only",
    track_a_enabled: true,
    track_a_disabled_projects: 0,
    no_reply_candidates: 0,
    no_reply_events: 0,
    due_reminders: 0,
    truncated: 0,
    cursor_written: 0,
    projects: {},
    errors: [],
  };

  for (const projectId of listProjects(opts.workmeta, opts.projects)) {
    const projectOpts = { ...opts, project: projectId };
    const mailRows = mailRowsForProject(opts.workmeta, projectId);
    const taskRows = taskRowsForProject(opts.workmeta, projectId);
    const openThreads = openTaskThreadMap(taskRows);
    const mailKeySet = new Set(mailRows.map((row) => row.history_key).filter(Boolean));
    const converted = convertedMailKeys(taskRows, mailKeySet);
    const project = {
      no_reply_candidates: 0,
      no_reply_events: 0,
      due_reminders: 0,
      track_a_enabled: true,
      skipped_replied: 0,
      skipped_converted: 0,
      skipped_too_new: 0,
      truncated: 0,
      candidate_keys: [],
    };

    const candidates = {};
    let actionCount = 0;
    const outboundRows = mailRows
      .filter((row) => row.outbound)
      .sort((a, b) => String(a.received_at).localeCompare(String(b.received_at)) || a.history_key.localeCompare(b.history_key));
    if (mailRows.length > 0 && outboundRows.length === 0) {
      project.track_a_enabled = false;
      project.track_a_disabled_reason = "no_outbound_direction_signal";
      summary.track_a_disabled_projects += 1;
    }
    for (const mail of outboundRows) {
      if (converted.has(mail.history_key)) { project.skipped_converted += 1; continue; }
      const ageDays = calendarDaysBetween(mail.received_at, opts.today);
      if (ageDays == null || ageDays < opts.days) { project.skipped_too_new += 1; continue; }
      if (hasLaterInbound(mail, mailRows)) { project.skipped_replied += 1; continue; }
      const { itemRef, thread: matchedThread } = openTaskForMail(mail, openThreads);
      const cursorKey = itemRef ? `${projectId}|followup_due|${mail.history_key}|${matchedThread || mail.thread || ""}|${opts.today}` : "";
      if (cursorKey && cursor.keys[cursorKey]) continue;
      if (actionCount >= opts.limit) { project.truncated += 1; continue; }
      actionCount += 1;
      if (itemRef) {
        project.no_reply_events += 1;
        summary.no_reply_events += 1;
        if (opts.apply) {
          const wrote = await appendEvent(opts, deps, {
            actor_ref: "erp",
            actor_kind: "ai",
            kind: "followup_due",
            item_ref: itemRef,
            project_ref: projectId,
            used_refs: ["followup_scan", "auto_intake"],
            data_label: "meta",
            note: `history_key=${mail.history_key};thread=${matchedThread || mail.thread};days=${opts.days}`,
          });
          cursor.keys[cursorKey] = new Date().toISOString();
          if (wrote) summary.cursor_written += 1;
        }
        continue;
      }
      candidates[mail.history_key] = buildFollowupCandidate(mail, projectOpts);
      project.candidate_keys.push(mail.history_key);
      project.no_reply_candidates += 1;
      summary.no_reply_candidates += 1;
    }

    const reminders = dueReminderRows(taskRows, projectOpts, cursor).slice(0, opts.limit);
    project.due_reminders += reminders.length;
    summary.due_reminders += reminders.length;
    if (opts.apply) {
      for (const reminder of reminders) {
        const wrote = await appendEvent(opts, deps, {
          actor_ref: "erp",
          actor_kind: "ai",
          kind: "due_reminder",
          item_ref: reminder.task_key,
          project_ref: projectId,
          used_refs: ["followup_scan"],
          data_label: "meta",
          note: `due=${reminder.due};days_until=${reminder.days_until}`,
        });
        if (wrote) {
          cursor.keys[reminder.cursor_key] = new Date().toISOString();
          summary.cursor_written += 1;
        }
      }
      if (Object.keys(candidates).length) {
        try {
          project.ledger = await applyCandidates(projectId, candidates, opts, exec);
        } catch (error) {
          project.ledger = { error: String(error?.message ?? error).slice(0, 160) };
          summary.errors.push(`ledger:${projectId}`);
        }
      }
    } else if (Object.keys(candidates).length) {
      project.ledger = { planned: Object.keys(candidates).length };
    }
    summary.truncated += project.truncated;
    summary.projects[projectId] = project;
  }

  if (opts.apply && summary.cursor_written > 0) saveCursor(cursorPath, cursor);
  if (summary.track_a_disabled_projects > 0) summary.track_a_enabled = false;
  summary.ok = summary.errors.length === 0;
  return summary;
}

function renderText(summary) {
  return `# followup_scan ${summary.apply ? "apply" : "dry-run"} today=${summary.today} no_reply_candidates=${summary.no_reply_candidates} no_reply_events=${summary.no_reply_events} due_reminders=${summary.due_reminders} truncated=${summary.truncated} errors=${summary.errors.length}\n`;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  try {
    const opts = parseFollowupArgs();
    const summary = await runFollowupScan(opts);
    process.stdout.write(opts.json ? `${JSON.stringify(summary)}\n` : renderText(summary));
    process.exitCode = summary.ok ? 0 : 1;
  } catch (error) {
    process.stderr.write(`[followup_scan] ${String(error?.message ?? error)}\n`);
    process.exitCode = 2;
  }
}
