#!/usr/bin/env node
// Metadata-only Outlook-rule replay for already-ingested ERP mail.
// This tool never moves mail or writes to the ERP DB. It produces a private
// rule packet and a Shadow classification report for owner review.
import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const INBOX_PROJECT = "P00-000_INBOX";
const PROJECT_RE = /\bP\d{2}-\d{3}\b/giu;
const SAFE_PROJECT_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;

function readValue(argv, index, token) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${token}_requires_value`);
  return value;
}

function validateProject(value, label) {
  const text = String(value ?? "").trim();
  if (!text || !SAFE_PROJECT_RE.test(text) || text.includes("..")) {
    throw new Error(`unsafe_${label}:${text}`);
  }
  return text;
}

function parseArgs(argv) {
  const opts = {
    dbPath: "",
    outlookRulesPath: "",
    outputDir: "",
    fromProject: INBOX_PROJECT,
    ownerSubjectContains: "",
    ownerNotBefore: "",
    ownerProject: "",
    includeHidden: false,
    json: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--db") opts.dbPath = readValue(argv, i++, arg);
    else if (arg === "--outlook-rules") opts.outlookRulesPath = readValue(argv, i++, arg);
    else if (arg === "--output-dir") opts.outputDir = readValue(argv, i++, arg);
    else if (arg === "--from-project") opts.fromProject = validateProject(readValue(argv, i++, arg), "from_project");
    else if (arg === "--owner-subject-contains") opts.ownerSubjectContains = readValue(argv, i++, arg);
    else if (arg === "--owner-not-before") opts.ownerNotBefore = readValue(argv, i++, arg);
    else if (arg === "--owner-project") opts.ownerProject = validateProject(readValue(argv, i++, arg), "owner_project");
    else if (arg === "--include-hidden") opts.includeHidden = true;
    else if (arg === "--json") opts.json = true;
    else if (arg === "--help" || arg === "-h") opts.help = true;
    else throw new Error(`unknown_arg:${arg}`);
  }
  return opts;
}

function printHelp() {
  console.log([
    "Usage: node tools/mail_outlook_shadow_classify.mjs --db <path> --outlook-rules <json> --output-dir <dir>",
    "",
    "Optional owner override:",
    "  --owner-subject-contains <text>",
    "  --owner-not-before <YYYY-MM-DD>",
    "  --owner-project <project-code>",
    "",
    "Safety: metadata-only, SQLite readOnly + query_only, no ERP/Outlook mutation.",
  ].join("\n"));
}

function parseAt(value) {
  const timestamp = Date.parse(String(value ?? ""));
  return Number.isFinite(timestamp) ? timestamp : null;
}

function rawValues(condition) {
  return (Array.isArray(condition?.values) ? condition.values : [])
    .filter((value) => value !== null && value !== undefined && value !== "");
}

function extractAddressLike(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return String(value.address ?? value.email ?? value.name ?? "").trim().toLowerCase();
  }
  const text = String(value ?? "").trim();
  const structured = /(?:^|[;{\s])address=([^;}\s]+)/iu.exec(text);
  return (structured?.[1] ?? text).trim().toLowerCase();
}

function extractActionDestination(actions) {
  const move = (Array.isArray(actions) ? actions : []).find((action) => action?.name === "MoveToFolder");
  const value = rawValues(move)[0] ?? "";
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return {
      folder_path: String(value.folder_path ?? "").trim(),
      folder_name: String(value.folder_name ?? "").trim(),
    };
  }
  const raw = String(value ?? "");
  const folderPath = /(?:^|[;{])folder_path=([^;}]+)/iu.exec(raw)?.[1]?.trim() ?? "";
  const folderName = /(?:^|[;{])folder_name=([^;}]+)/iu.exec(raw)?.[1]?.trim() ?? "";
  return { folder_path: folderPath, folder_name: folderName };
}

function destinationKind(destination, projectCode) {
  if (projectCode) return { kind: "project", bucket: projectCode };
  const text = `${destination.folder_path} ${destination.folder_name}`.toLowerCase();
  if (text.includes("plaud")) return { kind: "system_voice", bucket: "system_voice" };
  if (text.includes("soulforge")) return { kind: "system", bucket: "system" };
  if (text.includes("pjt") || text.includes("급여")) return { kind: "company_admin", bucket: "company_admin" };
  if (text.includes("mhc")) return { kind: "project_candidate", bucket: "MHC" };
  return { kind: "outlook_folder", bucket: destination.folder_name || "unmapped_outlook_folder" };
}

export function normalizeOutlookRuleInventory(inventory) {
  const rawRules = Array.isArray(inventory?.rules) ? inventory.rules : [];
  return rawRules
    .filter((rule) => rule?.enabled !== false)
    .map((rule, index) => {
      const destination = extractActionDestination(rule.actions);
      const projectCodes = [...new Set(`${destination.folder_path} ${destination.folder_name}`.match(PROJECT_RE) ?? [])]
        .map((value) => value.toUpperCase());
      const projectCode = projectCodes.length === 1 ? projectCodes[0] : null;
      const target = destinationKind(destination, projectCode);
      const conditions = (Array.isArray(rule.conditions) ? rule.conditions : []).map((condition) => ({
        field: String(condition?.name ?? "").trim(),
        values: rawValues(condition).map((value) =>
          ["From", "SentTo", "SenderAddress"].includes(String(condition?.name ?? ""))
            ? extractAddressLike(value)
            : String(value ?? "").trim(),
        ).filter(Boolean),
      }));
      return {
        rule_id: `outlook_${String(rule.execution_order ?? index + 1).padStart(3, "0")}`,
        execution_order: Number(rule.execution_order ?? index + 1),
        name: String(rule.name ?? ""),
        conditions,
        destination,
        target_kind: target.kind,
        target_bucket: target.bucket,
        project_code: projectCode,
        stop_after_match: (Array.isArray(rule.actions) ? rule.actions : []).some((action) => action?.name === "Stop"),
      };
    })
    .sort((a, b) => a.execution_order - b.execution_order);
}

function directionKind(value) {
  const text = String(value ?? "").trim().toLowerCase();
  if (["in", "incoming", "received", "receive"].includes(text)) return "incoming";
  if (["out", "outgoing", "sent", "send"].includes(text)) return "outgoing";
  return "unknown";
}

function conditionMatches(condition, row) {
  const values = condition.values.map((value) => String(value ?? "").trim().toLowerCase()).filter(Boolean);
  if (values.length === 0) return false;
  const subject = String(row.subject ?? "").toLowerCase();
  const counterpart = String(row.counterpart ?? "").toLowerCase();
  const direction = directionKind(row.direction);
  if (condition.field === "Subject") return values.some((value) => subject.includes(value));
  if (["From", "SenderAddress"].includes(condition.field)) {
    return direction === "incoming" && values.some((value) => counterpart.includes(value));
  }
  if (condition.field === "SentTo") {
    return direction === "outgoing" && values.some((value) => counterpart.includes(value));
  }
  return false;
}

function outlookRuleMatches(rule, row) {
  return rule.conditions.length > 0 && rule.conditions.every((condition) => conditionMatches(condition, row));
}

function explicitProjectCodes(subject) {
  return [...new Set((String(subject ?? "").match(PROJECT_RE) ?? []).map((value) => value.toUpperCase()))];
}

function digest(value) {
  return crypto.createHash("sha256").update(String(value ?? ""), "utf8").digest("hex");
}

export function classifyMailMetadata(row, { outlookRules, ownerRule, fromProject = INBOX_PROJECT }) {
  if (String(row.project_id ?? "") !== fromProject) {
    return {
      status: "preserved_existing_assignment",
      candidate_project: row.project_id || null,
      target_kind: "project",
      target_bucket: row.project_id || null,
      primary_rule_id: "existing_assignment",
      matched_rule_ids: [],
      conflicting_project_codes: [],
      needs_review: false,
    };
  }

  const explicitCodes = explicitProjectCodes(row.subject);
  if (explicitCodes.length === 1) {
    return {
      status: "candidate",
      candidate_project: explicitCodes[0],
      target_kind: "project",
      target_bucket: explicitCodes[0],
      primary_rule_id: "explicit_project_code_in_subject",
      matched_rule_ids: ["explicit_project_code_in_subject"],
      conflicting_project_codes: [],
      needs_review: false,
    };
  }
  if (explicitCodes.length > 1) {
    return {
      status: "conflict",
      candidate_project: null,
      target_kind: "unresolved",
      target_bucket: fromProject,
      primary_rule_id: "multiple_explicit_project_codes",
      matched_rule_ids: ["multiple_explicit_project_codes"],
      conflicting_project_codes: explicitCodes,
      needs_review: true,
    };
  }

  const ownerNeedle = String(ownerRule?.subject_contains ?? "").trim().toLowerCase();
  const ownerThreshold = parseAt(ownerRule?.not_before);
  const rowAt = parseAt(row.at);
  if (
    ownerNeedle &&
    ownerRule?.project_code &&
    String(row.subject ?? "").toLowerCase().includes(ownerNeedle) &&
    ownerThreshold !== null &&
    rowAt !== null &&
    rowAt >= ownerThreshold
  ) {
    return {
      status: "candidate",
      candidate_project: ownerRule.project_code,
      target_kind: "project",
      target_bucket: ownerRule.project_code,
      primary_rule_id: ownerRule.rule_id,
      matched_rule_ids: [ownerRule.rule_id],
      conflicting_project_codes: [],
      needs_review: false,
    };
  }

  const matches = outlookRules.filter((rule) => outlookRuleMatches(rule, row));
  if (matches.length === 0) {
    return {
      status: "unclassified",
      candidate_project: null,
      target_kind: "unclassified",
      target_bucket: fromProject,
      primary_rule_id: null,
      matched_rule_ids: [],
      conflicting_project_codes: [],
      needs_review: true,
    };
  }
  const first = matches[0];
  const projectCodes = [...new Set(matches.map((rule) => rule.project_code).filter(Boolean))];
  const conflict = projectCodes.length > 1;
  return {
    status: conflict ? "conflict" : first.target_kind === "project" ? "candidate" : "non_project_bucket",
    candidate_project: conflict ? null : first.project_code,
    target_kind: conflict ? "unresolved" : first.target_kind,
    target_bucket: conflict ? fromProject : first.target_bucket,
    primary_rule_id: first.rule_id,
    matched_rule_ids: matches.map((rule) => rule.rule_id),
    conflicting_project_codes: conflict ? projectCodes : [],
    needs_review: conflict || first.target_kind !== "project",
  };
}

function sourceFingerprints(dbPath) {
  const files = [dbPath, `${dbPath}-wal`, `${dbPath}-shm`];
  return files.map((path) => {
    if (!existsSync(path)) return { name: basename(path), exists: false };
    const stat = statSync(path);
    return {
      name: basename(path),
      exists: true,
      size: stat.size,
      mtime_ms: stat.mtimeMs,
      sha256: crypto.createHash("sha256").update(readFileSync(path)).digest("hex"),
    };
  });
}

function fingerprintSetsEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function increment(map, key) {
  const normalized = String(key ?? "<null>");
  map[normalized] = (map[normalized] || 0) + 1;
}

function timestampSlug(now) {
  return now.toISOString().replace(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "Z");
}

export function runMailProjectShadowClassification(opts) {
  for (const [key, value] of Object.entries({ dbPath: opts.dbPath, outlookRulesPath: opts.outlookRulesPath, outputDir: opts.outputDir })) {
    if (!value) throw new Error(`missing_${key}`);
  }
  if (!existsSync(opts.dbPath)) throw new Error("db_not_found");
  if (!existsSync(opts.outlookRulesPath)) throw new Error("outlook_rules_not_found");

  const inventoryText = readFileSync(opts.outlookRulesPath, "utf8").replace(/^\uFEFF/u, "");
  const inventory = JSON.parse(inventoryText);
  const outlookRules = normalizeOutlookRuleInventory(inventory);
  if (outlookRules.length === 0) throw new Error("no_enabled_outlook_rules");
  const ownerRule = opts.ownerSubjectContains && opts.ownerNotBefore && opts.ownerProject
    ? {
        rule_id: "owner_subject_after_override_001",
        subject_contains: opts.ownerSubjectContains,
        not_before: opts.ownerNotBefore,
        project_code: validateProject(opts.ownerProject, "owner_project"),
      }
    : null;
  if ([opts.ownerSubjectContains, opts.ownerNotBefore, opts.ownerProject].filter(Boolean).length > 0 && !ownerRule) {
    throw new Error("owner_rule_requires_subject_not_before_and_project");
  }

  const before = sourceFingerprints(opts.dbPath);
  const db = new DatabaseSync(opts.dbPath, { readOnly: true });
  db.exec("PRAGMA query_only=ON");
  const sourceCounts = db.prepare(
    "SELECT COUNT(*) AS total, SUM(CASE WHEN COALESCE(hidden,0)<>0 THEN 1 ELSE 0 END) AS hidden FROM core_mail",
  ).get();
  const where = opts.includeHidden ? "" : "WHERE COALESCE(hidden,0)=0";
  const rows = db.prepare(`SELECT id, project_id, at, direction, subject, counterpart FROM core_mail ${where} ORDER BY at, id`).all();
  const totalChanges = db.prepare("SELECT total_changes() AS n").get().n;
  db.close();
  const after = sourceFingerprints(opts.dbPath);
  if (totalChanges !== 0) throw new Error(`unexpected_total_changes:${totalChanges}`);
  if (!fingerprintSetsEqual(before, after)) throw new Error("source_fingerprint_changed_during_shadow_scan");

  const byStatus = {};
  const byTarget = {};
  const byPrimaryRule = {};
  let eligible = 0;
  const results = rows.map((row) => {
    if (String(row.project_id ?? "") === opts.fromProject) eligible += 1;
    const classification = classifyMailMetadata(row, { outlookRules, ownerRule, fromProject: opts.fromProject });
    increment(byStatus, classification.status);
    increment(byTarget, classification.target_bucket);
    increment(byPrimaryRule, classification.primary_rule_id);
    return {
      mail_id: row.id,
      current_project: row.project_id || null,
      at: row.at,
      direction: row.direction,
      subject_sha256: digest(row.subject),
      counterpart_sha256: digest(row.counterpart),
      ...classification,
    };
  });

  const now = opts.now ?? new Date();
  const slug = timestampSlug(now);
  mkdirSync(opts.outputDir, { recursive: true });
  const rulePacketPath = join(opts.outputDir, `mail_shadow_rules_${slug}.json`);
  const resultPath = join(opts.outputDir, `mail_shadow_result_${slug}.json`);
  const summaryPath = join(opts.outputDir, `mail_shadow_summary_${slug}.json`);
  const latestPath = join(opts.outputDir, "mail_shadow_latest.json");
  const rulePacket = {
    schema_version: "soulforge.mail.outlook_shadow_rules.v1",
    generated_at: now.toISOString(),
    source_inventory_ref: basename(opts.outlookRulesPath),
    precedence: ["preserve_existing_assignment", "explicit_project_code_in_subject", "owner_override", "outlook_execution_order", "unclassified"],
    from_project: opts.fromProject,
    owner_rule: ownerRule,
    outlook_rules: outlookRules,
  };
  const summary = {
    schema_version: "soulforge.mail.outlook_shadow_summary.v1",
    generated_at: now.toISOString(),
    mode: "shadow_metadata_only",
    db_ref: basename(opts.dbPath),
    source_rows_total: sourceCounts.total,
    hidden_rows_excluded: opts.includeHidden ? 0 : sourceCounts.hidden,
    scanned: rows.length,
    eligible_from_project: eligible,
    by_status: byStatus,
    by_target: byTarget,
    by_primary_rule: byPrimaryRule,
    source_read_only: true,
    sqlite_query_only: true,
    sqlite_total_changes: totalChanges,
    source_fingerprint_unchanged: true,
    body_read: false,
    attachment_read: false,
    outlook_mutation: false,
    erp_mutation: false,
    rule_packet_file: basename(rulePacketPath),
    result_file: basename(resultPath),
  };
  writeFileSync(rulePacketPath, `${JSON.stringify(rulePacket, null, 2)}\n`, "utf8");
  writeFileSync(resultPath, `${JSON.stringify({ ...summary, results }, null, 2)}\n`, "utf8");
  writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  writeFileSync(latestPath, `${JSON.stringify({
    schema_version: "soulforge.mail.outlook_shadow_latest.v1",
    generated_at: now.toISOString(),
    rule_packet_file: basename(rulePacketPath),
    result_file: basename(resultPath),
    summary_file: basename(summaryPath),
  }, null, 2)}\n`, "utf8");
  return { summary, rulePacketPath, resultPath, summaryPath, latestPath };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const opts = parseArgs(process.argv.slice(2));
    if (opts.help) {
      printHelp();
      process.exit(0);
    }
    const report = runMailProjectShadowClassification(opts);
    if (opts.json) console.log(JSON.stringify(report.summary, null, 2));
    else {
      console.log("# mail Outlook Shadow classification");
      console.log(`scanned=${report.summary.scanned} eligible=${report.summary.eligible_from_project}`);
      console.log(`by_status=${JSON.stringify(report.summary.by_status)}`);
      console.log(`by_target=${JSON.stringify(report.summary.by_target)}`);
      console.log(`source_fingerprint_unchanged=${report.summary.source_fingerprint_unchanged}`);
    }
  } catch (error) {
    console.error(`[mail_outlook_shadow_classify] ${error?.message || error}`);
    process.exit(1);
  }
}
