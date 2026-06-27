#!/usr/bin/env node
// Single-entry metadata-only haengbogwan run report.
// Dry-run is the default; --apply delegates writes to haengbogwan_apply.mjs.
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildHaengbogwanApplyReport } from "./haengbogwan_apply.mjs";
import { buildSnapshots } from "./haengbogwan_snapshot.mjs";
import { activeSnoozeDecisionMap } from "./haengbogwan_task_decisions.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..", "..", "..");
const DEFAULT_WORKMETA_ROOT = join(REPO, "_workmeta");
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_LIMIT = 20;
const DEFAULT_TRIAGE_LIMIT = 10;

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function usage() {
  return `Usage: haengbogwan_run [--workmeta-root <dir>] [--project <code>] [--limit <n>] [--triage-limit <n>] [--today YYYY-MM-DD] [--db <dev-erp.db>] [--apply] [--auto-open] [--stage <code>] [--json]

Build one metadata-only haengbogwan execution report.
Dry-run is the default. --apply is required before task ledger rows or reference receipts are written.`;
}

function validateToday(today) {
  const normalized = String(today || todayIso()).trim();
  if (!DATE_RE.test(normalized)) throw new Error(`invalid_today:${today}`);
  return normalized;
}

function validateLimit(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) throw new Error(`invalid_limit:${value}`);
  return n;
}

function readValue(argv, index, token) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${token}_requires_value`);
  return value;
}

function parseArgs(argv) {
  const opts = {
    workmetaRoot: DEFAULT_WORKMETA_ROOT,
    projects: [],
    limit: DEFAULT_LIMIT,
    triageLimit: DEFAULT_TRIAGE_LIMIT,
    today: todayIso(),
    dbPath: "",
    apply: false,
    autoOpen: false,
    stage: "",
    stagePresent: false,
    json: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--help" || token === "-h") {
      opts.help = true;
    } else if (token === "--json") {
      opts.json = true;
    } else if (token === "--apply") {
      opts.apply = true;
    } else if (token === "--auto-open") {
      opts.autoOpen = true;
    } else if (token === "--workmeta-root" || token === "--workmeta") {
      opts.workmetaRoot = readValue(argv, i, token);
      i += 1;
    } else if (token === "--project") {
      opts.projects.push(readValue(argv, i, token));
      i += 1;
    } else if (token === "--limit") {
      opts.limit = validateLimit(readValue(argv, i, token));
      i += 1;
    } else if (token === "--triage-limit") {
      opts.triageLimit = validateLimit(readValue(argv, i, token));
      i += 1;
    } else if (token === "--today") {
      opts.today = validateToday(readValue(argv, i, token));
      i += 1;
    } else if (token === "--db") {
      opts.dbPath = readValue(argv, i, token);
      i += 1;
    } else if (token === "--stage") {
      opts.stage = readValue(argv, i, token);
      opts.stagePresent = true;
      i += 1;
    } else {
      throw new Error(`unknown_arg:${token}`);
    }
  }
  opts.today = validateToday(opts.today);
  opts.limit = validateLimit(opts.limit);
  opts.triageLimit = validateLimit(opts.triageLimit);
  return opts;
}

function compactSnapshot(snapshot) {
  return {
    pending_mail_count: snapshot.pending_mail_count ?? 0,
    unclassified_task_count: snapshot.unclassified_task_count ?? 0,
    due_today_count: snapshot.due_today_count ?? 0,
    overdue_count: snapshot.overdue_count ?? 0,
    blocked_count: snapshot.blocked_count ?? 0,
    waiting_count: snapshot.waiting_count ?? 0,
    needs_quick_triage_count: snapshot.needs_quick_triage_count ?? 0,
    raw_boundary_skip_count: snapshot.raw_boundary_skip_count ?? 0,
    next_actions: Array.isArray(snapshot.next_actions) ? snapshot.next_actions.slice(0, 8) : [],
  };
}

function addTotals(totals, row) {
  totals.pending_mail_count += row.snapshot.pending_mail_count;
  totals.unclassified_task_count += row.snapshot.unclassified_task_count;
  totals.due_today_count += row.snapshot.due_today_count;
  totals.overdue_count += row.snapshot.overdue_count;
  totals.blocked_count += row.snapshot.blocked_count;
  totals.waiting_count += row.snapshot.waiting_count;
  totals.needs_quick_triage_count += row.snapshot.needs_quick_triage_count;
  totals.raw_boundary_skip_count += row.snapshot.raw_boundary_skip_count;
  totals.candidate_count += row.apply_report.candidate_count;
  totals.reference_only_skip_count += row.apply_report.reference_only_skip_count;
  totals.reference_receipt_written += row.apply_report.reference_receipt_written;
  totals.triage_queue_count += row.triage_queue.length;
  totals.active_snooze_count += row.task_decisions.active_snooze_count;
  if (row.apply_report.ledger_exit_code && row.apply_report.ledger_exit_code !== 0) totals.ledger_failure_count += 1;
}

function addTriageItem(map, item, reason, score) {
  const taskKey = String(item?.task_key || "").trim();
  if (!taskKey) return;
  const existing = map.get(taskKey) || {
    task_key: taskKey,
    title: item.title || "",
    status: item.status || "",
    review_status: item.review_status || "",
    due: item.due || "",
    assignee: item.assignee || "",
    source_ref: item.source_ref || "",
    reasons: [],
    score: 0,
    next_action: "",
  };
  if (!existing.reasons.includes(reason)) existing.reasons.push(reason);
  existing.score = Math.max(existing.score, score);
  existing.next_action = nextActionForReasons(existing.reasons);
  map.set(taskKey, existing);
}

function nextActionForReasons(reasons) {
  if (reasons.includes("blocked")) return "Clear blocker or mark an owner decision.";
  if (reasons.includes("overdue")) return "Decide: do today, snooze with reason, or close if already handled.";
  if (reasons.includes("due_today")) return "Confirm the completion plan for today.";
  if (reasons.includes("unclassified")) return "Fill work type, completion criteria, due date, and owner.";
  if (reasons.includes("missing_assignee")) return "Assign a responsible owner or team.";
  if (reasons.includes("waiting")) return "Check whether the wait is still valid or snooze explicitly.";
  return "Review and decide the next action.";
}

function buildTriageQueue(snapshot, { limit = DEFAULT_TRIAGE_LIMIT, activeSnoozes = new Map() } = {}) {
  const map = new Map();
  for (const item of snapshot.blocked || []) addTriageItem(map, item, "blocked", 120);
  for (const item of snapshot.overdue || []) addTriageItem(map, item, "overdue", 110);
  for (const item of snapshot.due_today || []) addTriageItem(map, item, "due_today", 100);
  for (const item of snapshot.waiting || []) addTriageItem(map, item, "waiting", 70);
  for (const item of snapshot.needs_quick_triage || []) {
    const reasons = Array.isArray(item.reasons) && item.reasons.length ? item.reasons : ["quick_triage"];
    for (const reason of reasons) {
      const score = reason === "unclassified" ? 90
        : reason === "missing_due" ? 75
          : reason === "missing_assignee" ? 80
            : reason === "reference_likely" ? 45
              : 60;
      addTriageItem(map, item, reason, score);
    }
  }
  const allItems = [...map.values()];
  const activeSnoozeCount = allItems.filter((item) => activeSnoozes.has(item.task_key)).length;
  const queue = allItems
    .filter((item) => !activeSnoozes.has(item.task_key))
    .sort((a, b) => b.score - a.score
      || (a.due || "9999-99-99").localeCompare(b.due || "9999-99-99")
      || a.task_key.localeCompare(b.task_key))
    .slice(0, limit);
  return { queue, active_snooze_count: activeSnoozeCount };
}

function projectRunRow(snapshot, opts) {
  const activeSnoozes = activeSnoozeDecisionMap({
    workmetaRoot: opts.workmetaRoot,
    projectId: snapshot.project_id,
    today: opts.today,
  });
  const triage = buildTriageQueue(snapshot, { limit: opts.triageLimit, activeSnoozes });
  const applyReport = buildHaengbogwanApplyReport({
    workmetaRoot: opts.workmetaRoot,
    projectId: snapshot.project_id,
    limit: opts.limit,
    today: opts.today,
    dbPath: opts.dbPath,
    apply: opts.apply,
    autoOpen: opts.autoOpen,
    stage: opts.stage,
    stagePresent: opts.stagePresent,
    defaultReviewDays: 0,
    defaultReviewDaysPresent: false,
    reminderDays: 0,
    reminderDaysPresent: false,
  });
  return {
    project_id: snapshot.project_id,
    snapshot: compactSnapshot(snapshot),
    triage_queue: triage.queue,
    task_decisions: {
      active_snooze_count: triage.active_snooze_count,
    },
    apply_report: {
      apply: applyReport.apply,
      candidate_count: applyReport.candidate_count,
      candidate_keys: applyReport.candidate_keys,
      reference_only_skip_count: applyReport.reference_only_skip_count,
      reference_receipt_written: applyReport.reference_receipt_written,
      reference_receipt_skipped: applyReport.reference_receipt_skipped,
      ledger_exit_code: applyReport.ledger_exit_code,
      ledger_invoked: Boolean(applyReport.ledger_args_summary?.invoked),
      skipped_reason: applyReport.skipped_reason || "",
      body_access: applyReport.body_access,
    },
  };
}

export function buildHaengbogwanRunReport(opts) {
  const snapshots = buildSnapshots({
    workmetaRoot: opts.workmetaRoot,
    projects: opts.projects,
    today: opts.today,
    itemLimit: opts.limit,
    rawSkipLimit: opts.limit,
  });
  const projects = snapshots.map((snapshot) => projectRunRow(snapshot, opts));
  const totals = {
    pending_mail_count: 0,
    unclassified_task_count: 0,
    due_today_count: 0,
    overdue_count: 0,
    blocked_count: 0,
    waiting_count: 0,
    needs_quick_triage_count: 0,
    raw_boundary_skip_count: 0,
    candidate_count: 0,
    reference_only_skip_count: 0,
    reference_receipt_written: 0,
    triage_queue_count: 0,
    active_snooze_count: 0,
    ledger_failure_count: 0,
  };
  for (const row of projects) addTotals(totals, row);
  return {
    generated_at: new Date().toISOString(),
    today: opts.today,
    apply: opts.apply,
    body_access: "metadata_only",
    project_count: projects.length,
    totals,
    projects,
  };
}

function renderText(report) {
  const lines = [];
  lines.push(`# haengbogwan run ${report.today} (${report.apply ? "apply" : "dry-run"})`);
  lines.push(`projects=${report.project_count} pending=${report.totals.pending_mail_count} candidates=${report.totals.candidate_count} refs=${report.totals.reference_only_skip_count} due_today=${report.totals.due_today_count} overdue=${report.totals.overdue_count} triage=${report.totals.triage_queue_count} snoozed=${report.totals.active_snooze_count}`);
  for (const row of report.projects) {
    lines.push(`- ${row.project_id}: pending=${row.snapshot.pending_mail_count} candidates=${row.apply_report.candidate_count} refs=${row.apply_report.reference_only_skip_count} triage=${row.triage_queue.length} snoozed=${row.task_decisions.active_snooze_count} ledger=${row.apply_report.ledger_exit_code ?? "not_invoked"}`);
    for (const action of row.snapshot.next_actions.slice(0, 3)) lines.push(`  next: ${action}`);
    for (const item of row.triage_queue.slice(0, 3)) lines.push(`  triage: ${item.task_key} score=${item.score} ${item.reasons.join("+")}`);
  }
  return `${lines.join("\n")}\n`;
}

export function main(argv = process.argv.slice(2), { stdout = process.stdout, stderr = process.stderr } = {}) {
  try {
    const opts = parseArgs(argv);
    if (opts.help) {
      stdout.write(`${usage()}\n`);
      return 0;
    }
    const report = buildHaengbogwanRunReport(opts);
    stdout.write(opts.json ? `${JSON.stringify(report)}\n` : renderText(report));
    return report.totals.ledger_failure_count ? 1 : 0;
  } catch (error) {
    stderr.write(`[haengbogwan_run] ${error.message}\n`);
    return 2;
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  process.exitCode = main();
}
