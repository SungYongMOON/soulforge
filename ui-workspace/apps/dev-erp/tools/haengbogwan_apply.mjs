#!/usr/bin/env node
// Dry-run-by-default haengbogwan apply/report wrapper.
// Builds metadata-only candidates, delegates ledger mutation to the existing CLI,
// and reports only bounded metadata.
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { buildContextPacketForProject } from "./haengbogwan_context_packet.mjs";
import { buildLedgerCandidatePlan } from "./haengbogwan_candidate_judge.mjs";
import {
  HAENGBOGWAN_MAIL_RECEIPT_RELATIVE_PATH,
  readHandledReceiptKeys,
} from "./mail_to_task_pending.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..", "..", "..");
const DEFAULT_WORKMETA_ROOT = join(REPO, "_workmeta");
const LEDGER_TOOL = join(HERE, "mail_to_task_ledger.mjs");
const DEFAULT_LIMIT = 20;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CANDIDATE_KEY_REPORT_LIMIT = 100;
const RECEIPT_HEADERS = [
  "receipt_key",
  "history_key",
  "project_id",
  "disposition",
  "status",
  "handled_at",
  "reason",
  "source_event_ref",
  "source_mail_ref",
  "source_mail_source_id",
  "source_lineage_ref",
  "generation_rule_ref",
  "generation_run_ref",
  "body_access",
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function validateToday(today) {
  const normalized = String(today || todayIso()).trim();
  if (!DATE_RE.test(normalized)) throw new Error(`invalid_today:${today}`);
  return normalized;
}

function validateNonNegativeInteger(value, label) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) throw new Error(`invalid_${label}:${value}`);
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
    projectId: "",
    limit: DEFAULT_LIMIT,
    today: todayIso(),
    dbPath: "",
    stage: "",
    stagePresent: false,
    autoOpen: false,
    defaultReviewDays: 0,
    defaultReviewDaysPresent: false,
    reminderDays: 0,
    reminderDaysPresent: false,
    json: false,
    apply: false,
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
      opts.projectId = readValue(argv, i, token);
      i += 1;
    } else if (token === "--limit") {
      opts.limit = validateNonNegativeInteger(readValue(argv, i, token), "limit");
      i += 1;
    } else if (token === "--today") {
      opts.today = readValue(argv, i, token);
      i += 1;
    } else if (token === "--db") {
      opts.dbPath = readValue(argv, i, token);
      i += 1;
    } else if (token === "--stage") {
      opts.stage = readValue(argv, i, token);
      opts.stagePresent = true;
      i += 1;
    } else if (token === "--default-review-days") {
      opts.defaultReviewDays = validateNonNegativeInteger(readValue(argv, i, token), "default_review_days");
      opts.defaultReviewDaysPresent = true;
      i += 1;
    } else if (token === "--reminder-days") {
      opts.reminderDays = validateNonNegativeInteger(readValue(argv, i, token), "reminder_days");
      opts.reminderDaysPresent = true;
      i += 1;
    } else {
      throw new Error(`unknown_arg:${token}`);
    }
  }

  opts.today = validateToday(opts.today);
  return opts;
}

function usage() {
  return [
    "Usage: node tools/haengbogwan_apply.mjs --workmeta-root <path> --project <code> [options]",
    "",
    "Builds metadata-only haengbogwan candidates and invokes mail_to_task_ledger.mjs.",
    "Dry-run is the default. Add --apply for ledger writes.",
    "",
    "Options:",
    "  --workmeta-root, --workmeta <path>",
    "  --project <code>",
    "  --limit <n>",
    "  --today <YYYY-MM-DD>",
    "  --db <dev-erp.db>    Load role/actor projection metadata for candidate suggestions only",
    "  --stage <name>",
    "  --auto-open",
    "  --default-review-days <n>",
    "  --reminder-days <n>",
    "  --json",
    "  --apply",
    "  --help",
  ].join("\n");
}

function baseLedgerArgsSummary(opts, invoked) {
  return {
    invoked,
    executable: "node",
    tool: "mail_to_task_ledger.mjs",
    workmeta_arg: "--workmeta",
    project_id: opts.projectId,
    candidates: invoked ? "os_tempfile" : "",
    forwarded: {
      apply: opts.apply,
      auto_open: opts.autoOpen,
      stage: opts.stagePresent ? opts.stage : null,
      default_review_days: opts.defaultReviewDaysPresent ? opts.defaultReviewDays : null,
      reminder_days: opts.reminderDaysPresent ? opts.reminderDays : null,
    },
  };
}

function buildLedgerArgs(opts, candidatePath) {
  const args = [
    LEDGER_TOOL,
    "--workmeta",
    opts.workmetaRoot,
    "--project",
    opts.projectId,
    "--candidates",
    candidatePath,
  ];
  if (opts.stagePresent) args.push("--stage", opts.stage);
  if (opts.autoOpen) args.push("--auto-open");
  if (opts.defaultReviewDaysPresent) args.push("--default-review-days", String(opts.defaultReviewDays));
  if (opts.reminderDaysPresent) args.push("--reminder-days", String(opts.reminderDays));
  if (opts.apply) args.push("--apply");
  return args;
}

function compactBoundary(boundary) {
  return {
    metadata_only: boundary?.metadata_only === true,
    raw_body_loaded: boundary?.raw_body_loaded === true,
    attachments_loaded: boundary?.attachments_loaded === true,
    workspace_payload_loaded: boundary?.workspace_payload_loaded === true,
    secret_loaded: boundary?.secret_loaded === true,
    allowed_ledger_refs: Array.isArray(boundary?.allowed_ledger_refs) ? boundary.allowed_ledger_refs : [],
    raw_boundary_skip_count: boundary?.raw_boundary_skip_count ?? 0,
    raw_boundary_skips: Array.isArray(boundary?.raw_boundary_skips) ? boundary.raw_boundary_skips : [],
  };
}

function compactOverlayCounts(contextPacket) {
  const roleOverlay = Array.isArray(contextPacket?.role_overlay) ? contextPacket.role_overlay : [];
  const actorOverlay = Array.isArray(contextPacket?.actor_overlay) ? contextPacket.actor_overlay : [];
  return {
    roles_status: contextPacket?.not_loaded?.roles?.status ?? "not_loaded",
    actors_status: contextPacket?.not_loaded?.actors?.status ?? "not_loaded",
    role_overlay_count: roleOverlay.length,
    actor_overlay_count: actorOverlay.length,
  };
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replacePathVariant(text, pathValue, label) {
  const raw = String(pathValue || "").trim();
  if (!raw) return text;
  const variants = new Set([
    raw,
    raw.replaceAll("\\", "/"),
    resolve(raw),
    resolve(raw).replaceAll("\\", "/"),
  ]);
  let out = text;
  for (const variant of variants) {
    if (!variant || variant.length < 3) continue;
    out = out.replace(new RegExp(escapeRegExp(variant), "g"), label);
  }
  return out;
}

function sanitizeLedgerText(value, { workmetaRoot, tempDir }) {
  let out = String(value || "");
  out = replacePathVariant(out, workmetaRoot, "<workmeta-root>");
  out = replacePathVariant(out, tempDir, "<temp-candidate-dir>");
  out = out.replace(/[A-Za-z]:[\\/][^\r\n]*/g, "<absolute_path>");
  out = out.replace(/\\\\[^\s\r\n]*/g, "<unc_path>");
  return out;
}

export function ledgerExitCode(result) {
  if (typeof result?.status === "number") return result.status;
  if (result?.error) return 1;
  if (result?.signal) return 1;
  return 0;
}

function csvEscape(value) {
  const raw = String(value ?? "");
  return /[",\r\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

function referenceReceiptPath(workmetaRoot, projectId) {
  return join(workmetaRoot, projectId, HAENGBOGWAN_MAIL_RECEIPT_RELATIVE_PATH);
}

function emptyReferenceReceiptResult(referenceOnlySkips) {
  return {
    reference_only_skip_count: referenceOnlySkips.length,
    reference_receipt_written: 0,
    reference_receipt_skipped: 0,
    reference_receipt_write_enabled: false,
    reference_receipt_relpath: HAENGBOGWAN_MAIL_RECEIPT_RELATIVE_PATH.replace(/\\/g, "/"),
  };
}

function writeReferenceOnlyReceipts({
  workmetaRoot,
  projectId,
  referenceOnlySkips,
  handledAt,
}) {
  const receiptPath = referenceReceiptPath(workmetaRoot, projectId);
  const existing = readHandledReceiptKeys(receiptPath);
  const rows = [];
  let duplicateCount = 0;
  for (const skip of referenceOnlySkips) {
    const historyKey = String(skip.history_key || "").trim();
    if (!historyKey) continue;
    if (existing.has(historyKey)) {
      duplicateCount += 1;
      continue;
    }
    existing.add(historyKey);
    rows.push({
      ...skip,
      receipt_key: `mailreceipt:${historyKey}:reference_only`,
      handled_at: handledAt,
    });
  }
  if (rows.length) {
    mkdirSync(dirname(receiptPath), { recursive: true });
    const needsHeader = !existsSync(receiptPath);
    const lines = rows.map((row) => RECEIPT_HEADERS.map((header) => csvEscape(row[header])).join(","));
    appendFileSync(receiptPath, `${needsHeader ? `${RECEIPT_HEADERS.join(",")}\n` : ""}${lines.join("\n")}\n`, "utf8");
  }
  return {
    reference_only_skip_count: referenceOnlySkips.length,
    reference_receipt_written: rows.length,
    reference_receipt_skipped: duplicateCount,
    reference_receipt_write_enabled: true,
    reference_receipt_relpath: HAENGBOGWAN_MAIL_RECEIPT_RELATIVE_PATH.replace(/\\/g, "/"),
  };
}

export function buildHaengbogwanApplyReport(opts) {
  const generatedAt = new Date().toISOString();
  const contextPacket = buildContextPacketForProject({
    workmetaRoot: opts.workmetaRoot,
    projectId: opts.projectId,
    limit: opts.limit,
    today: opts.today,
    generatedAt,
    dbPath: opts.dbPath,
  });
  const candidatePlan = buildLedgerCandidatePlan(contextPacket);
  const candidates = candidatePlan.candidates;
  const referenceOnlySkips = candidatePlan.reference_only_skips;
  const candidateKeys = Object.keys(candidates).sort((a, b) => a.localeCompare(b));
  const referenceReceiptBase = emptyReferenceReceiptResult(referenceOnlySkips);
  const baseReport = {
    project_id: contextPacket.project_id,
    apply: opts.apply,
    candidate_count: candidateKeys.length,
    candidate_keys: candidateKeys.slice(0, CANDIDATE_KEY_REPORT_LIMIT),
    ...referenceReceiptBase,
    context_boundary: compactBoundary(contextPacket.boundary),
    context_overlay_counts: compactOverlayCounts(contextPacket),
    ledger_exit_code: null,
    ledger_stdout: "",
    ledger_stderr: "",
    ledger_args_summary: baseLedgerArgsSummary(opts, false),
    generated_at: generatedAt,
    body_access: "metadata_only",
  };

  if (!candidateKeys.length) {
    const receiptResult = opts.apply
      ? writeReferenceOnlyReceipts({
        workmetaRoot: opts.workmetaRoot,
        projectId: opts.projectId,
        referenceOnlySkips,
        handledAt: generatedAt,
      })
      : referenceReceiptBase;
    return {
      ...baseReport,
      ...receiptResult,
      skipped_reason: referenceOnlySkips.length ? "no_ledger_candidates_reference_receipts_only" : "no_candidates",
    };
  }

  let tempDir = "";
  try {
    tempDir = mkdtempSync(join(tmpdir(), "sf-haengbogwan-apply-"));
    const candidatePath = join(tempDir, "candidates.json");
    writeFileSync(candidatePath, `${JSON.stringify(candidates, null, 2)}\n`, "utf8");
    const ledgerArgs = buildLedgerArgs(opts, candidatePath);
    const result = spawnSync(process.execPath, ledgerArgs, { encoding: "utf8" });
    const exitCode = ledgerExitCode(result);
    const receiptResult = opts.apply && exitCode === 0
      ? writeReferenceOnlyReceipts({
        workmetaRoot: opts.workmetaRoot,
        projectId: opts.projectId,
        referenceOnlySkips,
        handledAt: generatedAt,
      })
      : referenceReceiptBase;
    return {
      ...baseReport,
      ...receiptResult,
      ledger_exit_code: exitCode,
      ledger_signal: result.signal || "",
      ledger_stdout: sanitizeLedgerText(result.stdout || "", { workmetaRoot: opts.workmetaRoot, tempDir }),
      ledger_stderr: sanitizeLedgerText(result.stderr || (result.error ? result.error.message : ""), { workmetaRoot: opts.workmetaRoot, tempDir }),
      ledger_args_summary: baseLedgerArgsSummary(opts, true),
    };
  } finally {
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  }
}

export function main(argv = process.argv.slice(2), { stdout = process.stdout, stderr = process.stderr } = {}) {
  try {
    const opts = parseArgs(argv);
    if (opts.help) {
      stdout.write(`${usage()}\n`);
      return 0;
    }
    if (!opts.projectId) throw new Error("--project_required");
    const report = buildHaengbogwanApplyReport(opts);
    stdout.write(`${opts.json ? JSON.stringify(report) : JSON.stringify(report, null, 2)}\n`);
    return report.ledger_exit_code ?? 0;
  } catch (error) {
    stderr.write(`[haengbogwan_apply] ${error.message}\n`);
    return 2;
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  process.exitCode = main();
}
