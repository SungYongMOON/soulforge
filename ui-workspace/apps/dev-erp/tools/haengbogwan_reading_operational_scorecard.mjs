#!/usr/bin/env node
// Operational replay scorecard for the Haengbogwan mail reading engine.
// It may read protected mail text through the context packet, but every file it
// writes is metadata-only and leaves owner scoring fields blank.
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildReadingContextPacket,
} from "./haengbogwan_reading_context_packet.mjs";
import {
  judgeReadingContextPacket,
  redactReadingCandidateBundle,
} from "./haengbogwan_reading_candidate_judge.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, "..");
const REPO = resolve(HERE, "..", "..", "..", "..");
const DEFAULT_DB = join(APP, "data", "dev-erp.db");
const DEFAULT_WORKMETA_ROOT = join(REPO, "_workmeta");
const DEFAULT_LIMIT = 5000;
const DEFAULT_BODY_MODE = "two_stage";
const SAFE_PROJECT_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const SAFE_RUN_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function nowIso() {
  return new Date().toISOString();
}

function stampFromIso(value) {
  return String(value || nowIso()).replace(/[^0-9]/g, "").slice(0, 14) || "run";
}

function validateProjectId(value) {
  const project = String(value ?? "").trim();
  if (!project || !SAFE_PROJECT_RE.test(project) || project.includes("..")) {
    throw new Error(`unsafe_project_id:${project || "(empty)"}`);
  }
  return project;
}

function validateRunId(value, generatedAt) {
  const fallback = `operational_${stampFromIso(generatedAt)}`;
  const runId = String(value || fallback).trim();
  if (!SAFE_RUN_RE.test(runId) || runId.includes("..")) {
    throw new Error(`unsafe_run_id:${runId || "(empty)"}`);
  }
  return runId;
}

function validateLimit(value, label = "limit") {
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
    dbPath: DEFAULT_DB,
    repoRoot: REPO,
    workmetaRoot: DEFAULT_WORKMETA_ROOT,
    projectId: "",
    query: "",
    direction: "",
    mailbox: "",
    limit: DEFAULT_LIMIT,
    bodyMode: DEFAULT_BODY_MODE,
    maxTextChars: 12000,
    knowledgeLimit: 200,
    includeHidden: false,
    outDir: "",
    runId: "",
    json: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--help" || token === "-h") opts.help = true;
    else if (token === "--json") opts.json = true;
    else if (token === "--include-hidden") opts.includeHidden = true;
    else if (token === "--db") {
      opts.dbPath = readValue(argv, i, token);
      i += 1;
    } else if (token === "--repo-root") {
      opts.repoRoot = readValue(argv, i, token);
      i += 1;
    } else if (token === "--workmeta-root" || token === "--workmeta") {
      opts.workmetaRoot = readValue(argv, i, token);
      i += 1;
    } else if (token === "--project") {
      opts.projectId = readValue(argv, i, token);
      i += 1;
    } else if (token === "--query" || token === "--q") {
      opts.query = readValue(argv, i, token);
      i += 1;
    } else if (token === "--direction") {
      opts.direction = readValue(argv, i, token);
      i += 1;
    } else if (token === "--mailbox") {
      opts.mailbox = readValue(argv, i, token);
      i += 1;
    } else if (token === "--limit") {
      opts.limit = validateLimit(readValue(argv, i, token));
      i += 1;
    } else if (token === "--body-mode") {
      opts.bodyMode = readValue(argv, i, token);
      i += 1;
    } else if (token === "--max-text-chars") {
      opts.maxTextChars = validateLimit(readValue(argv, i, token), "max_text_chars");
      i += 1;
    } else if (token === "--knowledge-limit") {
      opts.knowledgeLimit = validateLimit(readValue(argv, i, token), "knowledge_limit");
      i += 1;
    } else if (token === "--out") {
      opts.outDir = readValue(argv, i, token);
      i += 1;
    } else if (token === "--run-id") {
      opts.runId = readValue(argv, i, token);
      i += 1;
    } else {
      throw new Error(`unknown_arg:${token}`);
    }
  }
  if (opts.projectId) validateProjectId(opts.projectId);
  opts.limit = validateLimit(opts.limit);
  opts.knowledgeLimit = validateLimit(opts.knowledgeLimit, "knowledge_limit");
  return opts;
}

function usage() {
  return [
    "Usage: node tools/haengbogwan_reading_operational_scorecard.mjs --project <code> [--db <dev-erp.db>] [--repo-root <runtime-root>] [--workmeta-root <dir>] [--limit N] [--body-mode subject|preview|two_stage|full] [--run-id <id>] [--json]",
    "",
    "Replays project mail through the Haengbogwan reading engine and writes metadata-only",
    "operational artifacts: scorecard.json, owner_review_queue.csv, body_coverage.csv,",
    "candidate_summary.csv, and RUN_SUMMARY.md.",
    "Precision/recall are not computed until the owner fills the review queue labels.",
    "Mail body text and attachment payloads are never written to the artifacts.",
  ].join("\n");
}

function isInside(root, target) {
  const rel = resolve(target).slice(resolve(root).length);
  return resolve(target) === resolve(root) || (rel.startsWith(sep) && !rel.includes(`${sep}..${sep}`));
}

function safeOutputDir({ workmetaRoot, projectId, outDir, runId }) {
  const project = validateProjectId(projectId);
  const projectRoot = resolve(workmetaRoot, project);
  const defaultDir = resolve(projectRoot, "reports", "haengbogwan_reading_runs", runId);
  const target = outDir ? resolve(process.cwd(), outDir) : defaultDir;
  if (!isInside(projectRoot, target)) throw new Error(`output_path_outside_project_workmeta:${target}`);
  return target;
}

function atomicWrite(filePath, text) {
  mkdirSync(dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  writeFileSync(tmp, text, "utf8");
  renameSync(tmp, filePath);
}

function csvEscape(value) {
  const raw = String(value ?? "");
  return /[",\r\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

function writeCsv(filePath, headers, rows) {
  const lines = [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(",")),
  ];
  atomicWrite(filePath, `${lines.join("\n")}\n`);
}

function countBy(rows, key) {
  const out = {};
  for (const row of rows) {
    const value = String(row?.[key] ?? "unknown") || "unknown";
    out[value] = (out[value] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(out).sort((a, b) => a[0].localeCompare(b[0])));
}

function ratio(n, d) {
  if (!d) return 0;
  return Number((n / d).toFixed(4));
}

function oldestFirst(events) {
  return [...events].sort((a, b) => {
    const at = String(a.received_at || "").localeCompare(String(b.received_at || ""));
    if (at) return at;
    return String(a.mail_ref || "").localeCompare(String(b.mail_ref || ""));
  });
}

function compactTextList(value) {
  if (!Array.isArray(value)) return String(value ?? "");
  return value.map((v) => String(v ?? "").trim()).filter(Boolean).join("|");
}

function backfillStatus(event) {
  const access = String(event.body_access || "");
  if (access === "event_body_text" || access === "core_mail.body_text" || access === "core_mail.body_text_fallback") {
    return "ok_full_body";
  }
  if (access === "core_mail.body_preview") return "needs_full_body_backfill";
  if (access === "subject_only") return "needs_body_backfill";
  return "unknown";
}

function engineShouldCreateTask(report) {
  return report.disposition === "candidate" ? "yes" : "no";
}

function engineShouldUpdateExisting(report) {
  return report.disposition === "update_existing" ? "yes" : "no";
}

function scorecardFrom({ opts, runId, generatedAt, packet, bundle, outDir }) {
  const reports = Array.isArray(bundle.mail_reading_reports) ? bundle.mail_reading_reports : [];
  const events = Array.isArray(packet.mail_events) ? packet.mail_events : [];
  const total = reports.length;
  const dispositionCounts = countBy(reports, "disposition");
  const bodyAccessCounts = countBy(events, "body_access");
  const fullBodyCount = events.filter((event) => ["event_body_text", "core_mail.body_text", "core_mail.body_text_fallback"].includes(event.body_access)).length;
  const needsBackfillCount = events.filter((event) => ["subject_only", "core_mail.body_preview"].includes(event.body_access)).length;
  const ownerReviewCount = reports.filter((report) => report.disposition === "owner_review").length;
  const autoClassifiedCount = Math.max(0, total - ownerReviewCount);
  const dueDetectedCount = reports.filter((report) => report.due).length;
  const knowledgeHintAppliedCount = reports.filter((report) => report.knowledge_hint_applied).length;
  const confidenceValues = reports.map((report) => Number(report.confidence)).filter(Number.isFinite);
  const avgConfidence = confidenceValues.length
    ? Number((confidenceValues.reduce((a, b) => a + b, 0) / confidenceValues.length).toFixed(3))
    : 0;
  return {
    schema_version: "haengbogwan.reading_operational_scorecard.v1",
    generated_at: generatedAt,
    run_id: runId,
    project_id: opts.projectId,
    input: {
      db_ref: resolve(opts.dbPath),
      repo_root_ref: resolve(opts.repoRoot),
      workmeta_root_ref: resolve(opts.workmetaRoot),
      query: opts.query,
      direction: opts.direction,
      mailbox: opts.mailbox,
      limit: opts.limit,
      body_mode: opts.bodyMode,
      max_text_chars: opts.maxTextChars,
      knowledge_limit: opts.knowledgeLimit,
      include_hidden: Boolean(opts.includeHidden),
      replay_order: "oldest_first_within_selected_rows",
    },
    boundary: {
      reads_local_mail_text_for_classification: true,
      raw_body_written_to_artifacts: false,
      reading_text_written_to_artifacts: false,
      attachment_payloads_loaded: false,
      secrets_loaded: false,
      owner_labels_required_for_precision_recall: true,
    },
    counts: {
      mail: total,
      candidate_mail: dispositionCounts.candidate || 0,
      update_existing_mail: dispositionCounts.update_existing || 0,
      owner_review_mail: dispositionCounts.owner_review || 0,
      reference_or_no_action_mail: dispositionCounts.reference_or_no_action || 0,
      auto_classified_mail: autoClassifiedCount,
      due_detected_mail: dueDetectedCount,
      knowledge_hint_applied_mail: knowledgeHintAppliedCount,
      existing_task_linked_mail: events.filter((event) => Array.isArray(event.existing_task_refs) && event.existing_task_refs.length).length,
      full_body_available_mail: fullBodyCount,
      body_backfill_needed_mail: needsBackfillCount,
    },
    ratios: {
      auto_classified: ratio(autoClassifiedCount, total),
      full_body_available: ratio(fullBodyCount, total),
      body_backfill_needed: ratio(needsBackfillCount, total),
      due_detected: ratio(dueDetectedCount, total),
      knowledge_hint_applied: ratio(knowledgeHintAppliedCount, total),
    },
    disposition_counts: dispositionCounts,
    body_access_counts: bodyAccessCounts,
    confidence: {
      average: avgConfidence,
      sample_count: confidenceValues.length,
    },
    precision_recall: {
      status: "owner_labels_required",
      computed: false,
      label_file: "owner_review_queue.csv",
      required_owner_columns: [
        "owner_label_is_task",
        "owner_label_expected_action",
        "owner_label_due",
        "owner_label_assignee_ref",
      ],
      note: "Automatic precision/recall requires owner labels for all sampled rows, including reference/no-action rows.",
    },
    output_files: {
      out_dir: outDir,
      scorecard: "scorecard.json",
      owner_review_queue: "owner_review_queue.csv",
      body_coverage: "body_coverage.csv",
      candidate_summary: "candidate_summary.csv",
      run_summary: "RUN_SUMMARY.md",
    },
  };
}

function ownerReviewRows(bundle) {
  const reports = Array.isArray(bundle.mail_reading_reports) ? bundle.mail_reading_reports : [];
  return reports.map((report, index) => ({
    seq: index + 1,
    mail_ref: report.mail_ref,
    ledger_key: report.ledger_key,
    received_at: report.received_at,
    direction: report.direction,
    mailbox_ref: report.mailbox_ref,
    recipient_role: report.recipient_role,
    body_access: report.body_access,
    existing_task_count: Array.isArray(report.existing_task_refs) ? report.existing_task_refs.length : 0,
    disposition: report.disposition,
    engine_should_create_task: engineShouldCreateTask(report),
    engine_should_update_existing: engineShouldUpdateExisting(report),
    primary_work_type: report.primary_work_type,
    work_types: compactTextList(report.work_types),
    due: report.due,
    priority: report.priority,
    confidence: report.confidence,
    required_role: report.required_role,
    required_capability: report.required_capability,
    suggested_assignee_ref: report.suggested_assignee_ref,
    bot_hint: report.bot_hint,
    knowledge_hint_applied: report.knowledge_hint_applied ? "yes" : "no",
    knowledge_hint_authority: report.knowledge_hint_authority,
    owner_review_required: report.owner_review_required ? "yes" : "no",
    owner_review_flags: compactTextList(report.owner_review_flags),
    owner_label_is_task: "",
    owner_label_expected_action: "",
    owner_label_due: "",
    owner_label_assignee_ref: "",
    owner_label_notes: "",
  }));
}

function bodyCoverageRows(packet) {
  const events = Array.isArray(packet.mail_events) ? packet.mail_events : [];
  return events.map((event, index) => ({
    seq: index + 1,
    mail_ref: event.mail_ref,
    ledger_key: event.ledger_key,
    received_at: event.received_at,
    direction: event.direction,
    mailbox_ref: event.mailbox_ref,
    source_ref: event.source_ref,
    pointer_ref: event.pointer_ref,
    body_access: event.body_access,
    backfill_status: backfillStatus(event),
    event_body_read: event.event_body_read ? "yes" : "no",
    event_found: event.event_found ? "yes" : "no",
    event_ref: event.event_ref,
    event_file_ref: event.event_file_ref,
    event_line: event.event_line ?? "",
    body_preview_len: event.body_preview_len,
    body_text_len: event.body_text_len,
    body_text_fallback_len: event.body_text_fallback_len,
    body_fallback_ref: event.body_fallback_ref,
    reading_text_len: event.reading_text_len,
    reading_text_source_len: event.reading_text_source_len,
    reading_text_truncated: event.reading_text_truncated ? "yes" : "no",
    attachment_count: event.attachment_count,
  }));
}

function candidateSummaryRows(bundle) {
  const reports = Array.isArray(bundle.mail_reading_reports) ? bundle.mail_reading_reports : [];
  return reports.map((report, index) => ({
    seq: index + 1,
    mail_ref: report.mail_ref,
    received_at: report.received_at,
    disposition: report.disposition,
    body_access: report.body_access,
    primary_work_type: report.primary_work_type,
    work_types: compactTextList(report.work_types),
    due: report.due,
    priority: report.priority,
    confidence: report.confidence,
    required_role: report.required_role,
    required_capability: report.required_capability,
    suggested_assignee_ref: report.suggested_assignee_ref,
    bot_hint: report.bot_hint,
    knowledge_hint_applied: report.knowledge_hint_applied ? "yes" : "no",
    codex_judgment_status: report.codex_judgment_status || "",
  }));
}

function runSummaryMarkdown(scorecard) {
  return [
    `# Haengbogwan Reading Operational Replay`,
    "",
    `- run_id: ${scorecard.run_id}`,
    `- project_id: ${scorecard.project_id}`,
    `- generated_at: ${scorecard.generated_at}`,
    `- replay_order: ${scorecard.input.replay_order}`,
    `- mail: ${scorecard.counts.mail}`,
    `- candidate_mail: ${scorecard.counts.candidate_mail}`,
    `- update_existing_mail: ${scorecard.counts.update_existing_mail}`,
    `- owner_review_mail: ${scorecard.counts.owner_review_mail}`,
    `- reference_or_no_action_mail: ${scorecard.counts.reference_or_no_action_mail}`,
    `- full_body_available_mail: ${scorecard.counts.full_body_available_mail}`,
    `- body_backfill_needed_mail: ${scorecard.counts.body_backfill_needed_mail}`,
    `- auto_classified_ratio: ${scorecard.ratios.auto_classified}`,
    `- full_body_available_ratio: ${scorecard.ratios.full_body_available}`,
    "",
    "## Precision / Recall",
    "",
    "Not computed yet. Fill owner labels in owner_review_queue.csv first.",
    "",
    "## Boundary",
    "",
    "- raw mail body written: no",
    "- reading_text written: no",
    "- attachment payloads loaded: no",
    "- secrets loaded: no",
    "",
  ].join("\n");
}

export function buildOperationalScorecardRun(rawOpts = {}) {
  const generatedAt = rawOpts.generatedAt || nowIso();
  const opts = {
    dbPath: rawOpts.dbPath || DEFAULT_DB,
    repoRoot: rawOpts.repoRoot || REPO,
    workmetaRoot: rawOpts.workmetaRoot || DEFAULT_WORKMETA_ROOT,
    projectId: validateProjectId(rawOpts.projectId),
    query: String(rawOpts.query ?? ""),
    direction: String(rawOpts.direction ?? ""),
    mailbox: String(rawOpts.mailbox ?? ""),
    limit: validateLimit(rawOpts.limit ?? DEFAULT_LIMIT),
    bodyMode: rawOpts.bodyMode || DEFAULT_BODY_MODE,
    maxTextChars: validateLimit(rawOpts.maxTextChars ?? 12000, "max_text_chars"),
    knowledgeLimit: validateLimit(rawOpts.knowledgeLimit ?? 200, "knowledge_limit"),
    includeHidden: Boolean(rawOpts.includeHidden),
  };
  const runId = validateRunId(rawOpts.runId, generatedAt);
  const outDir = safeOutputDir({
    workmetaRoot: opts.workmetaRoot,
    projectId: opts.projectId,
    outDir: rawOpts.outDir || "",
    runId,
  });

  const packet = buildReadingContextPacket({
    dbPath: opts.dbPath,
    repoRoot: opts.repoRoot,
    projectId: opts.projectId,
    query: opts.query,
    direction: opts.direction,
    mailbox: opts.mailbox,
    limit: opts.limit,
    bodyMode: opts.bodyMode,
    maxTextChars: opts.maxTextChars,
    includeText: true,
    includeHidden: opts.includeHidden,
    includeKnowledge: true,
    knowledgeLimit: opts.knowledgeLimit,
    generatedAt,
  });
  const orderedPacket = {
    ...packet,
    mail_events: oldestFirst(packet.mail_events),
  };
  const bundle = redactReadingCandidateBundle(judgeReadingContextPacket(orderedPacket, { generatedAt }));
  const scorecard = scorecardFrom({ opts, runId, generatedAt, packet: orderedPacket, bundle, outDir });

  mkdirSync(outDir, { recursive: true });
  atomicWrite(join(outDir, "scorecard.json"), `${JSON.stringify(scorecard, null, 2)}\n`);
  writeCsv(join(outDir, "owner_review_queue.csv"), [
    "seq",
    "mail_ref",
    "ledger_key",
    "received_at",
    "direction",
    "mailbox_ref",
    "recipient_role",
    "body_access",
    "existing_task_count",
    "disposition",
    "engine_should_create_task",
    "engine_should_update_existing",
    "primary_work_type",
    "work_types",
    "due",
    "priority",
    "confidence",
    "required_role",
    "required_capability",
    "suggested_assignee_ref",
    "bot_hint",
    "knowledge_hint_applied",
    "knowledge_hint_authority",
    "owner_review_required",
    "owner_review_flags",
    "owner_label_is_task",
    "owner_label_expected_action",
    "owner_label_due",
    "owner_label_assignee_ref",
    "owner_label_notes",
  ], ownerReviewRows(bundle));
  writeCsv(join(outDir, "body_coverage.csv"), [
    "seq",
    "mail_ref",
    "ledger_key",
    "received_at",
    "direction",
    "mailbox_ref",
    "source_ref",
    "pointer_ref",
    "body_access",
    "backfill_status",
    "event_body_read",
    "event_found",
    "event_ref",
    "event_file_ref",
    "event_line",
    "body_preview_len",
    "body_text_len",
    "body_text_fallback_len",
    "body_fallback_ref",
    "reading_text_len",
    "reading_text_source_len",
    "reading_text_truncated",
    "attachment_count",
  ], bodyCoverageRows(orderedPacket));
  writeCsv(join(outDir, "candidate_summary.csv"), [
    "seq",
    "mail_ref",
    "received_at",
    "disposition",
    "body_access",
    "primary_work_type",
    "work_types",
    "due",
    "priority",
    "confidence",
    "required_role",
    "required_capability",
    "suggested_assignee_ref",
    "bot_hint",
    "knowledge_hint_applied",
    "codex_judgment_status",
  ], candidateSummaryRows(bundle));
  atomicWrite(join(outDir, "RUN_SUMMARY.md"), runSummaryMarkdown(scorecard));

  return {
    scorecard,
    outDir,
    files: scorecard.output_files,
  };
}

export function main(argv = process.argv.slice(2), { stdout = process.stdout, stderr = process.stderr } = {}) {
  try {
    const opts = parseArgs(argv);
    if (opts.help) {
      stdout.write(`${usage()}\n`);
      return 0;
    }
    if (!opts.projectId) throw new Error("--project_required");
    const result = buildOperationalScorecardRun(opts);
    if (opts.json) {
      stdout.write(`${JSON.stringify(result.scorecard)}\n`);
    } else {
      stdout.write([
        `haengbogwan operational scorecard ${result.scorecard.project_id}`,
        `mail=${result.scorecard.counts.mail} candidate=${result.scorecard.counts.candidate_mail} update_existing=${result.scorecard.counts.update_existing_mail} owner_review=${result.scorecard.counts.owner_review_mail} body_backfill_needed=${result.scorecard.counts.body_backfill_needed_mail}`,
        `out=${result.outDir}`,
      ].join("\n") + "\n");
    }
    return 0;
  } catch (error) {
    stderr.write(`[haengbogwan_reading_operational_scorecard] ${error.message}\n`);
    return 2;
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  process.exitCode = main();
}
