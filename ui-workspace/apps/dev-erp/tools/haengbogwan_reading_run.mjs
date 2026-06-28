#!/usr/bin/env node
// End-to-end haengbogwan reading run.
// Reads local mail text only inside the private packet, emits redacted output,
// and can separately apply task-ledger rows and project_context metadata.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildReadingContextPacket,
} from "./haengbogwan_reading_context_packet.mjs";
import {
  judgeReadingContextPacket,
  redactReadingCandidateBundle,
} from "./haengbogwan_reading_candidate_judge.mjs";
import {
  runProjectContextKnowledgeCandidateUpdate,
} from "./haengbogwan_knowledge_candidates.mjs";
import {
  runProjectContextUpdate,
} from "./haengbogwan_project_context.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, "..");
const REPO = resolve(HERE, "..", "..", "..", "..");
const DEFAULT_DB = join(APP, "data", "dev-erp.db");
const DEFAULT_WORKMETA_ROOT = join(REPO, "_workmeta");
const LEDGER_TOOL = join(HERE, "mail_to_task_ledger.mjs");
const DEFAULT_LIMIT = 20;
const DEFAULT_BODY_MODE = "two_stage";
const REPORT_RELATIVE_ROOT = join("reports", "haengbogwan_reading_runs");
const SAFE_PROJECT_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function nowIso() {
  return new Date().toISOString();
}

function validateProjectId(value) {
  const project = String(value ?? "").trim();
  if (!project || !SAFE_PROJECT_RE.test(project) || project.includes("..")) {
    throw new Error(`unsafe_project_id:${project || "(empty)"}`);
  }
  return project;
}

function validateLimit(value, label = "limit") {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) throw new Error(`invalid_${label}:${value}`);
  return n;
}

function safeProjectRoot(workmetaRoot, projectId) {
  const root = resolve(workmetaRoot);
  const project = validateProjectId(projectId);
  const target = resolve(root, project);
  const prefix = root.endsWith(sep) ? root : `${root}${sep}`;
  if (!target.startsWith(prefix)) throw new Error(`project_path_escape:${project}`);
  return target;
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
    knowledgeLimit: DEFAULT_LIMIT,
    includeHidden: false,
    codexJudgmentsPath: "",
    codexMinConfidence: 0.35,
    applyTasks: false,
    applyContext: false,
    applyKnowledgeCandidates: false,
    skipTaskLedger: false,
    autoOpen: false,
    stage: "",
    stagePresent: false,
    assignMailboxOwner: false,
    writeReport: false,
    json: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--help" || token === "-h") opts.help = true;
    else if (token === "--json") opts.json = true;
    else if (token === "--include-hidden") opts.includeHidden = true;
    else if (token === "--apply") {
      opts.applyTasks = true;
      opts.applyContext = true;
    } else if (token === "--apply-tasks") opts.applyTasks = true;
    else if (token === "--apply-context") opts.applyContext = true;
    else if (token === "--apply-knowledge-candidates") opts.applyKnowledgeCandidates = true;
    else if (token === "--skip-task-ledger") opts.skipTaskLedger = true;
    else if (token === "--auto-open") opts.autoOpen = true;
    else if (token === "--assign-mailbox-owner") opts.assignMailboxOwner = true;
    else if (token === "--write-report") opts.writeReport = true;
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
    } else if (token === "--codex-judgments") {
      opts.codexJudgmentsPath = readValue(argv, i, token);
      i += 1;
    } else if (token === "--codex-min-confidence") {
      opts.codexMinConfidence = Number(readValue(argv, i, token));
      if (!Number.isFinite(opts.codexMinConfidence) || opts.codexMinConfidence < 0 || opts.codexMinConfidence > 1) {
        throw new Error("--codex-min-confidence_requires_0_to_1");
      }
      i += 1;
    } else if (token === "--stage") {
      opts.stage = readValue(argv, i, token);
      opts.stagePresent = true;
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
    "Usage: node tools/haengbogwan_reading_run.mjs --project <code> [--db <dev-erp.db>] [--repo-root <runtime-root>] [--workmeta-root <dir>] [--limit N] [--body-mode subject|preview|two_stage|full] [--apply-tasks] [--apply-context] [--apply-knowledge-candidates] [--apply] [--write-report] [--json]",
    "",
    "Builds a body-aware mail reading packet, creates redacted task/context candidates,",
    "optionally applies task ledger rows, updates _workmeta/<project>/project_context,",
    "and can append metadata-only deferred knowledge/RAG candidate rows.",
    "Dry-run is the default. Mail body text is never emitted in stdout or reports.",
  ].join("\n");
}

function absoluteOrCwd(pathValue) {
  const raw = String(pathValue ?? "").trim();
  return raw ? resolve(process.cwd(), raw) : "";
}

function readJsonFile(pathValue, label) {
  const path = absoluteOrCwd(pathValue);
  if (!path || !existsSync(path)) throw new Error(`${label}_not_found:${pathValue}`);
  return JSON.parse(readFileSync(path, "utf8"));
}

function compactLedgerCandidates(candidates) {
  const entries = Object.entries(candidates || {});
  return {
    candidate_count: entries.length,
    candidate_keys: entries.map(([key]) => key).sort((a, b) => a.localeCompare(b)).slice(0, 100),
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
  let out = String(text || "");
  for (const variant of variants) {
    if (!variant || variant.length < 3) continue;
    out = out.replace(new RegExp(escapeRegExp(variant), "g"), label);
  }
  return out;
}

function sanitizeText(value, { repoRoot, workmetaRoot, tempDir, dbPath }) {
  let out = String(value || "");
  out = replacePathVariant(out, repoRoot, "<repo-root>");
  out = replacePathVariant(out, workmetaRoot, "<workmeta-root>");
  out = replacePathVariant(out, tempDir, "<temp-dir>");
  out = replacePathVariant(out, dbPath, "<dev-erp-db>");
  out = out.replace(/[A-Za-z]:[\\/][^\r\n]*/g, "<absolute_path>");
  out = out.replace(/\\\\[^\s\r\n]*/g, "<unc_path>");
  return out;
}

function ledgerExitCode(result) {
  if (typeof result?.status === "number") return result.status;
  if (result?.error) return 1;
  if (result?.signal) return 1;
  return 0;
}

function buildLedgerArgs(opts, candidatePath, generatedAt) {
  const args = [
    LEDGER_TOOL,
    "--workmeta",
    opts.workmetaRoot,
    "--project",
    opts.projectId,
    "--candidates",
    candidatePath,
    "--rule",
    "haengbogwan_reading_candidate_judge.v1",
    "--run-id",
    `haengbogwan-reading:${generatedAt.slice(0, 10)}`,
  ];
  if (opts.dbPath) args.push("--db", opts.dbPath);
  if (opts.stagePresent) args.push("--stage", opts.stage);
  if (opts.autoOpen) args.push("--auto-open");
  if (opts.assignMailboxOwner) args.push("--assign-mailbox-owner");
  if (opts.applyTasks) args.push("--apply");
  return args;
}

function runTaskLedger(bundle, opts, generatedAt) {
  const candidates = bundle?.ledger_candidates || {};
  const compact = compactLedgerCandidates(candidates);
  const base = {
    invoked: false,
    apply: Boolean(opts.applyTasks),
    skipped_reason: "",
    ledger_exit_code: null,
    ledger_signal: "",
    ledger_stdout: "",
    ledger_stderr: "",
    ...compact,
  };
  if (opts.skipTaskLedger) return { ...base, skipped_reason: "skip_task_ledger_requested" };
  if (!compact.candidate_count) return { ...base, skipped_reason: "no_ledger_candidates" };

  let tempDir = "";
  try {
    tempDir = mkdtempSync(join(tmpdir(), "sf-haengbogwan-reading-run-"));
    const candidatePath = join(tempDir, "candidates.json");
    writeFileSync(candidatePath, `${JSON.stringify(candidates, null, 2)}\n`, "utf8");
    const result = spawnSync(process.execPath, buildLedgerArgs(opts, candidatePath, generatedAt), { encoding: "utf8" });
    const exitCode = ledgerExitCode(result);
    return {
      ...base,
      invoked: true,
      ledger_exit_code: exitCode,
      ledger_signal: result.signal || "",
      ledger_stdout: sanitizeText(result.stdout || "", { ...opts, tempDir }),
      ledger_stderr: sanitizeText(result.stderr || (result.error ? result.error.message : ""), { ...opts, tempDir }),
    };
  } finally {
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  }
}

function reportTitle(report) {
  return String(report.codex_title || report.target_object || report.subject || report.mail_ref || "").trim();
}

function reportCompletionCriteria(report) {
  return String(report.codex_completion_criteria || report.completion_goal || "").trim();
}

function safeConfidence(report) {
  const n = Number(report?.codex_confidence ?? report?.confidence);
  if (!Number.isFinite(n)) return "";
  return Math.max(0, Math.min(1, Number(n.toFixed(2))));
}

export function readingBundleToProjectContextEvents(bundle) {
  const reports = Array.isArray(bundle?.mail_reading_reports) ? bundle.mail_reading_reports : [];
  return reports.map((report) => {
    const disposition = String(report.disposition || "owner_review");
    const actionRequired = disposition === "candidate";
    return {
      source_kind: "mail",
      source_id: report.source_mail_ref || report.mail_ref || report.source_ref,
      external_ref: report.source_mail_ref || report.mail_ref || report.source_ref,
      project_code: report.project_id || bundle?.project_id || "",
      received_at: report.received_at || "",
      title: reportTitle(report),
      branch_hint: report.target_object || report.context_key || "mail triage",
      summary_hint: [
        `disposition=${disposition}`,
        `work=${report.primary_work_type || "review"}`,
        report.due ? `due=${report.due}` : "",
        report.knowledge_hint_applied ? "knowledge_hint=applied" : "",
        "body_text_redacted",
      ].filter(Boolean).join("; "),
      action_required: actionRequired,
      work_type: actionRequired ? (report.primary_work_type || "review") : "",
      completion_criteria: actionRequired ? reportCompletionCriteria(report) : "",
      due: actionRequired ? (report.due || "") : "",
      suggested_actor_ref: actionRequired ? (report.suggested_assignee_ref || report.bot_hint || "") : "",
      confidence: safeConfidence(report),
      pointer_ref: report.source_mail_ref || "",
      body_access: report.body_access || bundle?.body_access || "reading_metadata",
      reason: [
        "haengbogwan_reading_run",
        disposition,
        report.evidence_summary || "redacted mail reading report",
      ].join("; "),
      milestone_label: report.due ? `${report.target_object || "mail"} due ${report.due}` : "",
    };
  });
}

function runContextUpdate(bundle, opts, generatedAt) {
  const events = readingBundleToProjectContextEvents(bundle);
  const report = runProjectContextUpdate({
    workmetaRoot: opts.workmetaRoot,
    projectCode: opts.projectId,
    events,
    generatedAt,
    apply: opts.applyContext,
  });
  return {
    ...report,
    context_event_count: events.length,
  };
}

function reportFileName(generatedAt, report) {
  const stamp = generatedAt.replace(/[^0-9]/g, "").slice(0, 14);
  const digest = createHash("sha1").update(JSON.stringify({
    project_id: report.project_id,
    generated_at: generatedAt,
    counts: report.counts,
  })).digest("hex").slice(0, 10);
  return `${stamp || "run"}_${digest}.json`;
}

function writeRedactedRunReport(report, opts, generatedAt) {
  const projectRoot = safeProjectRoot(opts.workmetaRoot, opts.projectId);
  const rel = join(REPORT_RELATIVE_ROOT, reportFileName(generatedAt, report));
  const target = join(projectRoot, rel);
  mkdirSync(dirname(target), { recursive: true });
  const tmp = `${target}.tmp`;
  const normalizedRel = rel.replaceAll("\\", "/");
  const writtenReport = {
    ...report,
    report_write: {
      ...(report.report_write || {}),
      enabled: true,
      written: true,
      relpath: normalizedRel,
    },
  };
  writeFileSync(tmp, `${JSON.stringify(writtenReport, null, 2)}\n`, "utf8");
  renameSync(tmp, target);
  return normalizedRel;
}

function compactContextPacket(packet) {
  return {
    schema_version: packet?.schema_version || "",
    source: packet?.source || "",
    project_id: packet?.project_id || "",
    body_mode: packet?.body_mode || "",
    body_access: packet?.body_access || "",
    boundary: {
      local_event_body_read: packet?.boundary?.local_event_body_read === true,
      raw_body_persisted: packet?.boundary?.raw_body_persisted === true,
      attachments_loaded: packet?.boundary?.attachments_loaded === true,
      attachment_payloads_loaded: packet?.boundary?.attachment_payloads_loaded === true,
      secret_loaded: packet?.boundary?.secret_loaded === true,
      protected_text_in_packet: false,
      project_knowledge_overlay_loaded: packet?.boundary?.project_knowledge_overlay_loaded === true,
    },
    counts: packet?.counts || {},
  };
}

export function buildHaengbogwanReadingRunReport(opts) {
  const generatedAt = nowIso();
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
  const codexJudgments = opts.codexJudgmentsPath
    ? readJsonFile(opts.codexJudgmentsPath, "codex_judgments")
    : null;
  const bundle = judgeReadingContextPacket(packet, {
    generatedAt,
    codexJudgments,
    minConfidence: opts.codexMinConfidence,
  });
  const redactedBundle = redactReadingCandidateBundle(bundle);
  const taskLedger = runTaskLedger(redactedBundle, opts, generatedAt);
  const projectContext = runContextUpdate(redactedBundle, opts, generatedAt);
  const knowledgeCandidateReport = runProjectContextKnowledgeCandidateUpdate({
    repoRoot: opts.repoRoot,
    workmetaRoot: opts.workmetaRoot,
    projectCode: opts.projectId,
    contextReport: projectContext,
    generatedAt,
    apply: opts.applyKnowledgeCandidates,
  });
  const report = {
    schema_version: "haengbogwan.reading_run.v1",
    generated_at: generatedAt,
    project_id: opts.projectId,
    apply: {
      tasks: Boolean(opts.applyTasks),
      context: Boolean(opts.applyContext),
      knowledge_candidates: Boolean(opts.applyKnowledgeCandidates),
    },
    body_access: redactedBundle.body_access || packet.body_access || "",
    boundary: {
      local_event_body_read: packet.boundary?.local_event_body_read === true,
      raw_body_persisted: false,
      reading_text_emitted: false,
      attachments_loaded: false,
      attachment_payloads_loaded: false,
      secret_loaded: false,
      owner_approval_required_for_apply: true,
    },
    counts: {
      mail: redactedBundle.counts?.mail ?? 0,
      candidate_mail: redactedBundle.counts?.candidate_mail ?? 0,
      update_existing_mail: redactedBundle.counts?.update_existing_mail ?? 0,
      owner_review_mail: redactedBundle.counts?.owner_review_mail ?? 0,
      reference_or_no_action_mail: redactedBundle.counts?.reference_or_no_action_mail ?? 0,
      ledger_candidate_keys: redactedBundle.counts?.ledger_candidate_keys ?? 0,
      context_groups: redactedBundle.counts?.context_groups ?? 0,
      context_events: projectContext.context_event_count ?? 0,
      knowledge_candidate_rows: knowledgeCandidateReport.candidate_count ?? 0,
      knowledge_candidate_appended: knowledgeCandidateReport.appended_count ?? 0,
      event_body_read: packet.counts?.event_body_read ?? 0,
      knowledge_refs: packet.counts?.knowledge_refs ?? 0,
    },
    context_packet: compactContextPacket(packet),
    candidate_bundle: redactedBundle,
    task_ledger: taskLedger,
    project_context: projectContext,
    knowledge_candidates: knowledgeCandidateReport,
    report_write: {
      enabled: Boolean(opts.writeReport),
      written: false,
      relpath: "",
    },
  };
  if (opts.writeReport) {
    report.report_write.relpath = writeRedactedRunReport(report, opts, generatedAt);
    report.report_write.written = true;
  }
  return report;
}

function renderText(report) {
  return [
    `# haengbogwan reading run ${report.project_id} (${report.apply.tasks || report.apply.context ? "apply" : "dry-run"})`,
    `mail=${report.counts.mail} body_read=${report.counts.event_body_read} candidates=${report.counts.candidate_mail} task_keys=${report.counts.ledger_candidate_keys} context_events=${report.counts.context_events} knowledge_refs=${report.counts.knowledge_refs}`,
    `task_ledger=${report.task_ledger.invoked ? report.task_ledger.ledger_exit_code : report.task_ledger.skipped_reason} context=${report.project_context.apply ? "applied" : "dry-run"} knowledge_candidates=${report.knowledge_candidates.appended_count || report.knowledge_candidates.skipped_reason || "dry-run"}`,
    report.report_write.written ? `report=${report.report_write.relpath}` : "",
  ].filter(Boolean).join("\n") + "\n";
}

export function main(argv = process.argv.slice(2), { stdout = process.stdout, stderr = process.stderr } = {}) {
  try {
    const opts = parseArgs(argv);
    if (opts.help) {
      stdout.write(`${usage()}\n`);
      return 0;
    }
    if (!opts.projectId) throw new Error("--project_required");
    const report = buildHaengbogwanReadingRunReport(opts);
    stdout.write(opts.json ? `${JSON.stringify(report)}\n` : renderText(report));
    return report.task_ledger.ledger_exit_code && report.task_ledger.ledger_exit_code !== 0 ? 1 : 0;
  } catch (error) {
    stderr.write(`[haengbogwan_reading_run] ${error.message}\n`);
    return 2;
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  process.exitCode = main();
}
