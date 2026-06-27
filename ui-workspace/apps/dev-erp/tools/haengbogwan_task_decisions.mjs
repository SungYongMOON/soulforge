#!/usr/bin/env node
// Metadata-only task decision receipts for haengbogwan triage.
// Dry-run is the default; --apply is required before writing receipts.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..", "..", "..");
const DEFAULT_WORKMETA_ROOT = join(REPO, "_workmeta");
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const HAENGBOGWAN_TASK_DECISION_RELATIVE_PATH = join("reports", "haengbogwan_task_decisions", "task_decisions.csv");
const HEADERS = [
  "decision_key",
  "project_id",
  "task_key",
  "decision",
  "status",
  "snooze_until",
  "reason",
  "decided_at",
  "decided_by",
  "body_access",
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function usage() {
  return `Usage: haengbogwan_task_decisions --project <code> --task <task_key> --decision snooze --until YYYY-MM-DD [--reason <text>] [--decided-by <ref>] [--apply] [--json]

Writes metadata-only task decision receipts. Dry-run is the default.`;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      row.push(cur);
      cur = "";
    } else if (c === "\n") {
      row.push(cur);
      rows.push(row);
      row = [];
      cur = "";
    } else if (c !== "\r") {
      cur += c;
    }
  }
  if (cur !== "" || row.length) {
    row.push(cur);
    rows.push(row);
  }
  return rows;
}

function readCsvObjects(filePath) {
  if (!existsSync(filePath)) return [];
  const records = parseCsv(readFileSync(filePath, "utf8").replace(/^\uFEFF/, "").normalize("NFC"))
    .filter((row) => row.some((cell) => String(cell).trim()));
  if (!records.length) return [];
  const headers = records[0].map((header) => String(header || "").trim());
  return records.slice(1).map((row) => {
    const out = {};
    headers.forEach((header, index) => {
      out[header] = String(row[index] ?? "").trim();
    });
    return out;
  });
}

function csvEscape(value) {
  const raw = String(value ?? "");
  return /[",\r\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

function validateDate(value, label) {
  const normalized = String(value || "").trim();
  if (!DATE_RE.test(normalized)) throw new Error(`invalid_${label}:${value}`);
  return normalized;
}

function readValue(argv, index, token) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${token}_requires_value`);
  return value;
}

function parseArgs(argv) {
  const opts = {
    workmetaRoot: DEFAULT_WORKMETA_ROOT,
    projectId: "",
    taskKey: "",
    decision: "snooze",
    snoozeUntil: "",
    reason: "",
    decidedBy: "owner",
    today: todayIso(),
    apply: false,
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
    } else if (token === "--workmeta-root" || token === "--workmeta") {
      opts.workmetaRoot = readValue(argv, i, token);
      i += 1;
    } else if (token === "--project") {
      opts.projectId = readValue(argv, i, token);
      i += 1;
    } else if (token === "--task") {
      opts.taskKey = readValue(argv, i, token);
      i += 1;
    } else if (token === "--decision") {
      opts.decision = readValue(argv, i, token);
      i += 1;
    } else if (token === "--until" || token === "--snooze-until") {
      opts.snoozeUntil = validateDate(readValue(argv, i, token), "snooze_until");
      i += 1;
    } else if (token === "--reason") {
      opts.reason = readValue(argv, i, token);
      i += 1;
    } else if (token === "--decided-by") {
      opts.decidedBy = readValue(argv, i, token);
      i += 1;
    } else if (token === "--today") {
      opts.today = validateDate(readValue(argv, i, token), "today");
      i += 1;
    } else {
      throw new Error(`unknown_arg:${token}`);
    }
  }
  opts.today = validateDate(opts.today, "today");
  return opts;
}

export function taskDecisionPath(workmetaRoot, projectId) {
  return join(workmetaRoot, projectId, HAENGBOGWAN_TASK_DECISION_RELATIVE_PATH);
}

function normalizeReceipt(row) {
  return {
    decision_key: row.decision_key || "",
    project_id: row.project_id || "",
    task_key: row.task_key || "",
    decision: String(row.decision || "").toLowerCase(),
    status: String(row.status || "active").toLowerCase(),
    snooze_until: row.snooze_until || "",
    reason: row.reason || "",
    decided_at: row.decided_at || "",
    decided_by: row.decided_by || "",
    body_access: row.body_access || "",
  };
}

export function readTaskDecisionReceipts({ workmetaRoot = DEFAULT_WORKMETA_ROOT, projectId } = {}) {
  return readCsvObjects(taskDecisionPath(workmetaRoot, projectId)).map(normalizeReceipt);
}

export function activeSnoozeDecisionMap({ workmetaRoot = DEFAULT_WORKMETA_ROOT, projectId, today = todayIso() } = {}) {
  const checkedToday = validateDate(today, "today");
  const out = new Map();
  for (const row of readTaskDecisionReceipts({ workmetaRoot, projectId })) {
    if (row.decision !== "snooze") continue;
    if (row.status && row.status !== "active") continue;
    if (!row.task_key || !DATE_RE.test(row.snooze_until)) continue;
    if (row.snooze_until < checkedToday) continue;
    const prev = out.get(row.task_key);
    if (!prev || row.snooze_until >= prev.snooze_until) out.set(row.task_key, row);
  }
  return out;
}

export function buildTaskDecisionReport(opts) {
  if (!opts.projectId) throw new Error("--project_required");
  if (!opts.taskKey) throw new Error("--task_required");
  const decision = String(opts.decision || "snooze").toLowerCase();
  if (decision !== "snooze") throw new Error(`unsupported_decision:${opts.decision}`);
  const snoozeUntil = validateDate(opts.snoozeUntil, "snooze_until");
  const now = new Date().toISOString();
  const path = taskDecisionPath(opts.workmetaRoot, opts.projectId);
  const receipts = readTaskDecisionReceipts({ workmetaRoot: opts.workmetaRoot, projectId: opts.projectId });
  const duplicate = receipts.some((row) => row.task_key === opts.taskKey
    && row.decision === "snooze"
    && row.status === "active"
    && row.snooze_until === snoozeUntil);
  const receipt = {
    decision_key: `taskdecision:${opts.taskKey}:snooze:${snoozeUntil}`,
    project_id: opts.projectId,
    task_key: opts.taskKey,
    decision: "snooze",
    status: "active",
    snooze_until: snoozeUntil,
    reason: opts.reason || "",
    decided_at: now,
    decided_by: opts.decidedBy || "owner",
    body_access: "metadata_only",
  };
  if (opts.apply && !duplicate) {
    mkdirSync(dirname(path), { recursive: true });
    const needsHeader = !existsSync(path);
    const line = HEADERS.map((header) => csvEscape(receipt[header])).join(",");
    appendFileSync(path, `${needsHeader ? `${HEADERS.join(",")}\n` : ""}${line}\n`, "utf8");
  }
  return {
    project_id: opts.projectId,
    task_key: opts.taskKey,
    apply: Boolean(opts.apply),
    decision,
    status: "active",
    snooze_until: snoozeUntil,
    duplicate,
    written: Boolean(opts.apply && !duplicate),
    body_access: "metadata_only",
    receipt_relpath: HAENGBOGWAN_TASK_DECISION_RELATIVE_PATH.replace(/\\/g, "/"),
  };
}

export function main(argv = process.argv.slice(2), { stdout = process.stdout, stderr = process.stderr } = {}) {
  try {
    const opts = parseArgs(argv);
    if (opts.help) {
      stdout.write(`${usage()}\n`);
      return 0;
    }
    const report = buildTaskDecisionReport(opts);
    stdout.write(`${opts.json ? JSON.stringify(report) : JSON.stringify(report, null, 2)}\n`);
    return 0;
  } catch (error) {
    stderr.write(`[haengbogwan_task_decisions] ${error.message}\n`);
    return 2;
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  process.exitCode = main();
}
