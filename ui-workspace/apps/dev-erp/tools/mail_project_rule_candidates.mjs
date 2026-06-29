#!/usr/bin/env node
// Export metadata-only project-routing rule candidates from ERP mail filing.
// This reads core_mail and mail_assign events, but never reads or writes mail body text.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openStore } from "../src/store.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, "..");
const REPO = resolve(HERE, "..", "..", "..", "..");
const DEFAULT_DB = join(APP, "data", "dev-erp.db");
const DEFAULT_WORKMETA_ROOT = join(REPO, "_workmeta");
const DEFAULT_BINDING = join(DEFAULT_WORKMETA_ROOT, "system", "bindings", "mail_project_router.yaml");
const INBOX_PROJECT = "P00-000_INBOX";
const SAFE_PROJECT_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const SAFE_RUN_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const PROJECT_CODE_RE = /\bP\d{2}-\d{3}\b/gi;
const ACRONYM_RE = /\b[A-Z][A-Z0-9]{1,15}(?:-[A-Z0-9]{2,15})?\b/g;
const STOP_TOKENS = new Set([
  "RE", "FW", "FWD", "READ", "MAIL", "FROM", "TO", "CC", "BCC", "HTML", "HTTP", "HTTPS",
  "PDF", "DOC", "DOCX", "XLS", "XLSX", "PPT", "PPTX", "ZIP", "IMG", "PNG", "JPG",
]);

function nowIso() {
  return new Date().toISOString();
}

function stampFromIso(value) {
  return String(value || nowIso()).replace(/[^0-9]/g, "").slice(0, 14) || "run";
}

function validateProjectId(value) {
  const project = String(value ?? "").trim();
  if (!project) return "";
  if (!SAFE_PROJECT_RE.test(project) || project.includes("..")) throw new Error(`unsafe_project_id:${project}`);
  return project;
}

function validateRunId(value, generatedAt) {
  const fallback = `route_candidates_${stampFromIso(generatedAt)}`;
  const runId = String(value || fallback).trim();
  if (!SAFE_RUN_RE.test(runId) || runId.includes("..")) throw new Error(`unsafe_run_id:${runId}`);
  return runId;
}

function asInt(value, fallback, label) {
  if (value === undefined || value === null || value === "") return fallback;
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
    workmetaRoot: DEFAULT_WORKMETA_ROOT,
    routerBindingPath: DEFAULT_BINDING,
    projectId: "",
    runId: "",
    outDir: "",
    minMailCount: 1,
    maxDomains: 8,
    maxTokens: 16,
    manualOnly: false,
    includeHidden: false,
    json: false,
    apply: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--db") opts.dbPath = readValue(argv, i++, a);
    else if (a === "--workmeta-root") opts.workmetaRoot = readValue(argv, i++, a);
    else if (a === "--router-binding") opts.routerBindingPath = readValue(argv, i++, a);
    else if (a === "--project") opts.projectId = validateProjectId(readValue(argv, i++, a));
    else if (a === "--run-id") opts.runId = readValue(argv, i++, a);
    else if (a === "--out-dir") opts.outDir = readValue(argv, i++, a);
    else if (a === "--min-mail-count") opts.minMailCount = asInt(readValue(argv, i++, a), 1, "min_mail_count");
    else if (a === "--max-domains") opts.maxDomains = asInt(readValue(argv, i++, a), 8, "max_domains");
    else if (a === "--max-tokens") opts.maxTokens = asInt(readValue(argv, i++, a), 16, "max_tokens");
    else if (a === "--manual-only") opts.manualOnly = true;
    else if (a === "--include-hidden") opts.includeHidden = true;
    else if (a === "--json") opts.json = true;
    else if (a === "--apply") opts.apply = true;
    else if (a === "--help" || a === "-h") {
      opts.help = true;
    } else {
      throw new Error(`unknown_arg:${a}`);
    }
  }
  return opts;
}

function safeQuote(value) {
  return JSON.stringify(String(value ?? ""));
}

function csvEscape(value) {
  const s = String(value ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function writeAtomic(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmp, text, "utf8");
  renameSync(tmp, path);
}

function isWithin(base, target) {
  const rel = relative(resolve(base), resolve(target));
  return rel === "" || (!!rel && !rel.startsWith("..") && !rel.startsWith("/") && !/^[A-Za-z]:/.test(rel));
}

function assertPrivateOutputDir(target, workmetaRoot) {
  if (!isWithin(workmetaRoot, target)) {
    throw new Error(`unsafe_output_dir_not_under_workmeta:${target}`);
  }
}

function hashShort(value) {
  return createHash("sha256").update(String(value)).digest("hex").slice(0, 12);
}

function addCount(map, key, inc = 1) {
  if (!key) return;
  map.set(key, (map.get(key) || 0) + inc);
}

function topCounts(map, limit) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([value, count]) => ({ value, count }));
}

function extractDomains(value) {
  const text = String(value ?? "").toLowerCase();
  const out = new Set();
  for (const m of text.matchAll(/[a-z0-9._%+-]+@([a-z0-9.-]+\.[a-z]{2,})/g)) {
    const domain = m[1].replace(/^\.+|\.+$/g, "");
    if (domain && domain.length <= 80) out.add(domain);
  }
  return [...out];
}

export function extractSafeSubjectTokens(subject = "") {
  const text = String(subject ?? "");
  const out = new Map();
  for (const m of text.matchAll(PROJECT_CODE_RE)) addCount(out, m[0].toUpperCase());
  for (const m of text.matchAll(ACRONYM_RE)) {
    const token = m[0].toUpperCase();
    if (STOP_TOKENS.has(token)) continue;
    if (/^\d+$/.test(token)) continue;
    if (!/[A-Z]/.test(token)) continue;
    const letterCount = (token.match(/[A-Z]/g) || []).length;
    if (letterCount < 2) continue;
    addCount(out, token);
  }
  return out;
}

function normalizeRows(rows, manualCounts, opts) {
  const grouped = new Map();
  for (const row of rows) {
    const project = row.project_id;
    const manual = manualCounts.get(row.id) || { count: 0, last_at: null, first_from: null };
    if (opts.manualOnly && manual.count <= 0) continue;
    if (!grouped.has(project)) {
      grouped.set(project, {
        project_code: project,
        mail_count: 0,
        manual_assignment_count: 0,
        first_mail_at: null,
        last_mail_at: null,
        last_manual_assignment_at: null,
        senderDomains: new Map(),
        subjectTokens: new Map(),
        mailboxes: new Map(),
        directions: new Map(),
        sample_mail_refs: [],
      });
    }
    const g = grouped.get(project);
    g.mail_count++;
    g.manual_assignment_count += manual.count;
    if (row.at && (!g.first_mail_at || row.at < g.first_mail_at)) g.first_mail_at = row.at;
    if (row.at && (!g.last_mail_at || row.at > g.last_mail_at)) g.last_mail_at = row.at;
    if (manual.last_at && (!g.last_manual_assignment_at || manual.last_at > g.last_manual_assignment_at)) {
      g.last_manual_assignment_at = manual.last_at;
    }
    for (const domain of extractDomains(row.counterpart)) addCount(g.senderDomains, domain);
    for (const [token, count] of extractSafeSubjectTokens(row.subject)) addCount(g.subjectTokens, token, count);
    addCount(g.mailboxes, row.mailbox || "(none)");
    addCount(g.directions, row.direction || "in");
    if (g.sample_mail_refs.length < 5) g.sample_mail_refs.push(row.id);
  }
  return [...grouped.values()].filter((g) => g.mail_count >= opts.minMailCount);
}

function bindingProjectRuleCounts(bindingText) {
  const counts = new Map();
  for (const m of String(bindingText || "").matchAll(/^\s*project_code:\s*([A-Za-z0-9._-]+)/gm)) {
    addCount(counts, m[1]);
  }
  return counts;
}

function toCandidate(group, opts, activeRuleCount, conflictProjectCodes = []) {
  const tokenCounts = topCounts(group.subjectTokens, opts.maxTokens);
  const domainCounts = topCounts(group.senderDomains, opts.maxDomains);
  const tokenList = tokenCounts.map((x) => x.value);
  const domainList = domainCounts.map((x) => x.value);
  const candidateId = `erp_route_candidate_${group.project_code.replace(/[^A-Za-z0-9]+/g, "_")}_${hashShort(`${group.project_code}:${domainList.join("|")}:${tokenList.join("|")}`)}`;
  return {
    schema_version: "soulforge.erp_mail_project_route_candidate.v1",
    candidate_id: candidateId,
    created_at: opts.generatedAt,
    source: "dev_erp.manual_mail_assign_and_current_project",
    claim_ceiling: "observed_metadata_only",
    status: "owner_review_required",
    project_code: group.project_code,
    owner_review_required: true,
    recommended_action: activeRuleCount > 0 ? "compare_with_existing_router_rule" : "review_for_router_binding",
    active_router_project_rule_count: activeRuleCount,
    evidence: {
      mail_count: group.mail_count,
      manual_assignment_count: group.manual_assignment_count,
      first_mail_at: group.first_mail_at,
      last_mail_at: group.last_mail_at,
      last_manual_assignment_at: group.last_manual_assignment_at,
      sender_domain_counts: domainCounts,
      safe_subject_token_counts: tokenCounts,
      mailbox_counts: topCounts(group.mailboxes, 8),
      direction_counts: topCounts(group.directions, 4),
      sample_mail_refs: group.sample_mail_refs,
      conflict_project_codes: conflictProjectCodes,
    },
    proposed_route: {
      rule_id: candidateId.toUpperCase(),
      state: "candidate_owner_review",
      project_code: group.project_code,
      stage: "project_route_owner_review",
      match_policy: {
        subject_any: tokenList,
        from_domains: domainList,
      },
      confidence_if_matched: "hint",
      next_action_if_matched: "hold_for_owner_review",
    },
    privacy_boundary: {
      raw_body_read: false,
      body_text_read: false,
      raw_html_read: false,
      attachment_payload_read: false,
      full_subjects_written: false,
      full_addresses_written: false,
    },
  };
}

function yamlList(values, indent = 8) {
  if (!values.length) return `${" ".repeat(indent)}[]`;
  return values.map((v) => `${" ".repeat(indent)}- ${safeQuote(v)}`).join("\n");
}

function renderCandidateYaml(report) {
  const lines = [
    "schema_version: soulforge.mail_project_rule_candidates.v0",
    `generated_at: ${safeQuote(report.generated_at)}`,
    "source:",
    "  db_table: core_mail",
    "  event_table: event_log",
    "  manual_event_kind: mail_assign",
    "privacy_boundary:",
    "  raw_body_read: false",
    "  body_text_read: false",
    "  raw_html_read: false",
    "  attachment_payload_read: false",
    "  full_subjects_written: false",
    "  full_addresses_written: false",
    "candidates:",
  ];
  if (!report.candidates.length) {
    lines.push("  []");
    return `${lines.join("\n")}\n`;
  }
  for (const c of report.candidates) {
    lines.push(`  - candidate_id: ${safeQuote(c.candidate_id)}`);
    lines.push(`    source: ${safeQuote(c.source)}`);
    lines.push(`    claim_ceiling: ${safeQuote(c.claim_ceiling)}`);
    lines.push(`    status: ${safeQuote(c.status)}`);
    lines.push(`    project_code: ${safeQuote(c.project_code)}`);
    lines.push(`    owner_review_required: ${c.owner_review_required ? "true" : "false"}`);
    lines.push(`    recommended_action: ${safeQuote(c.recommended_action)}`);
    lines.push(`    active_router_project_rule_count: ${c.active_router_project_rule_count}`);
    lines.push("    evidence:");
    lines.push(`      mail_count: ${c.evidence.mail_count}`);
    lines.push(`      manual_assignment_count: ${c.evidence.manual_assignment_count}`);
    lines.push(`      first_mail_at: ${safeQuote(c.evidence.first_mail_at || "")}`);
    lines.push(`      last_mail_at: ${safeQuote(c.evidence.last_mail_at || "")}`);
    lines.push(`      last_manual_assignment_at: ${safeQuote(c.evidence.last_manual_assignment_at || "")}`);
    lines.push("      sender_domains:");
    lines.push(yamlList(c.evidence.sender_domain_counts.map((x) => `${x.value}:${x.count}`), 8));
    lines.push("      safe_subject_tokens:");
    lines.push(yamlList(c.evidence.safe_subject_token_counts.map((x) => `${x.value}:${x.count}`), 8));
    lines.push("      conflict_project_codes:");
    lines.push(yamlList(c.evidence.conflict_project_codes, 8));
    lines.push("    proposed_route:");
    lines.push(`      rule_id: ${safeQuote(c.proposed_route.rule_id)}`);
    lines.push(`      state: ${safeQuote(c.proposed_route.state)}`);
    lines.push(`      project_code: ${safeQuote(c.proposed_route.project_code)}`);
    lines.push(`      stage: ${safeQuote(c.proposed_route.stage)}`);
    lines.push("      match_policy:");
    lines.push("        subject_any:");
    lines.push(yamlList(c.proposed_route.match_policy.subject_any, 10));
    lines.push("        from_domains:");
    lines.push(yamlList(c.proposed_route.match_policy.from_domains, 10));
    lines.push(`      confidence_if_matched: ${safeQuote(c.proposed_route.confidence_if_matched)}`);
    lines.push(`      next_action_if_matched: ${safeQuote(c.proposed_route.next_action_if_matched)}`);
  }
  return `${lines.join("\n")}\n`;
}

function renderSummaryCsv(report) {
  const header = [
    "candidate_id",
    "project_code",
    "mail_count",
    "manual_assignment_count",
    "active_router_project_rule_count",
    "first_mail_at",
    "last_mail_at",
    "last_manual_assignment_at",
    "safe_subject_tokens",
    "sender_domains",
    "conflict_project_codes",
    "recommended_action",
  ];
  const rows = [header];
  for (const c of report.candidates) {
    rows.push([
      c.candidate_id,
      c.project_code,
      c.evidence.mail_count,
      c.evidence.manual_assignment_count,
      c.active_router_project_rule_count,
      c.evidence.first_mail_at || "",
      c.evidence.last_mail_at || "",
      c.evidence.last_manual_assignment_at || "",
      c.evidence.safe_subject_token_counts.map((x) => `${x.value}:${x.count}`).join(";"),
      c.evidence.sender_domain_counts.map((x) => `${x.value}:${x.count}`).join(";"),
      c.evidence.conflict_project_codes.join(";"),
      c.recommended_action,
    ]);
  }
  return `${rows.map((row) => row.map(csvEscape).join(",")).join("\n")}\n`;
}

export function buildMailProjectRuleCandidateReport({
  dbPath = DEFAULT_DB,
  routerBindingPath = DEFAULT_BINDING,
  projectId = "",
  minMailCount = 1,
  maxDomains = 8,
  maxTokens = 16,
  manualOnly = false,
  includeHidden = false,
  generatedAt = nowIso(),
} = {}) {
  const store = openStore(dbPath);
  try {
    const cond = ["project_id IS NOT NULL", "project_id<>?"];
    const args = [INBOX_PROJECT];
    const safeProject = validateProjectId(projectId);
    if (safeProject) {
      cond.push("project_id=?");
      args.push(safeProject);
    }
    if (!includeHidden) cond.push("COALESCE(hidden,0)=0 AND dup_of IS NULL");
    const rows = store.db.prepare(
      `SELECT id, project_id, at, direction, subject, counterpart, mailbox
       FROM core_mail
       WHERE ${cond.join(" AND ")}
       ORDER BY project_id, at, id`
    ).all(...args);
    const eventRows = store.db.prepare(
      `SELECT item_ref AS mail_id, COUNT(*) AS count, MAX(at) AS last_at, MIN(from_val) AS first_from
       FROM event_log
       WHERE kind='mail_assign' AND item_ref IS NOT NULL AND to_val IS NOT NULL
       GROUP BY item_ref`
    ).all();
    const manualCounts = new Map(eventRows.map((r) => [r.mail_id, {
      count: Number(r.count || 0),
      last_at: r.last_at || null,
      first_from: r.first_from || null,
    }]));
    const activeCounts = bindingProjectRuleCounts(
      existsSync(routerBindingPath) ? readFileSync(routerBindingPath, "utf8") : ""
    );
    const groups = normalizeRows(rows, manualCounts, { manualOnly, minMailCount });
    const scannedManualMailCount = rows.filter((r) => (manualCounts.get(r.id)?.count || 0) > 0).length;
    const tokenProjects = new Map();
    for (const g of groups) {
      for (const token of g.subjectTokens.keys()) {
        if (!tokenProjects.has(token)) tokenProjects.set(token, new Set());
        tokenProjects.get(token).add(g.project_code);
      }
    }
    const candidates = groups.map((g) => {
      const conflicts = new Set();
      for (const token of g.subjectTokens.keys()) {
        for (const project of tokenProjects.get(token) || []) {
          if (project !== g.project_code) conflicts.add(project);
        }
      }
      return toCandidate(
        g,
        { maxDomains, maxTokens, generatedAt },
        activeCounts.get(g.project_code) || 0,
        [...conflicts].sort()
      );
    });
    return {
      schema_version: "soulforge.mail_project_rule_candidates.v0",
      generated_at: generatedAt,
      db_path: dbPath,
      router_binding_path: routerBindingPath,
      filters: { project_id: safeProject || null, min_mail_count: minMailCount, manual_only: manualOnly, include_hidden: includeHidden },
      summary: {
        scanned_mail_count: rows.length,
        candidate_count: candidates.length,
        manual_assignment_mail_count: scannedManualMailCount,
      },
      candidates,
    };
  } finally {
    store.db.close?.();
  }
}

export function writeMailProjectRuleCandidateReport(report, { outDir, runId, workmetaRoot = DEFAULT_WORKMETA_ROOT } = {}) {
  const safeRunId = validateRunId(runId, report.generated_at);
  const target = outDir
    ? resolve(outDir)
    : join(resolve(workmetaRoot), "system", "reports", "mail_project_rule_candidates", safeRunId);
  assertPrivateOutputDir(target, workmetaRoot);
  mkdirSync(target, { recursive: true });
  const jsonPath = join(target, "rule_candidates.json");
  const yamlPath = join(target, "candidate_routes.yaml");
  const csvPath = join(target, "rule_candidate_summary.csv");
  writeAtomic(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  writeAtomic(yamlPath, renderCandidateYaml(report));
  writeAtomic(csvPath, renderSummaryCsv(report));
  return { out_dir: target, json_path: jsonPath, yaml_path: yamlPath, csv_path: csvPath };
}

function printHelp() {
  console.log(`Usage: node tools/mail_project_rule_candidates.mjs [options]

Options:
  --db <path>                 dev-ERP SQLite DB path
  --project <project_id>       Limit to one project, e.g. P26-014
  --manual-only                Only use mails with mail_assign event evidence
  --min-mail-count <n>         Minimum grouped mail count, default 1
  --apply                      Write metadata-only report files
  --out-dir <path>             Output directory for --apply
  --workmeta-root <path>       Workmeta root for default output
  --router-binding <path>      Existing router binding to compare
  --json                       Print JSON
`);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    printHelp();
    return;
  }
  const generatedAt = nowIso();
  const report = buildMailProjectRuleCandidateReport({ ...opts, generatedAt });
  let writeResult = null;
  if (opts.apply) {
    writeResult = writeMailProjectRuleCandidateReport(report, opts);
  }
  const output = {
    ok: true,
    summary: report.summary,
    filters: report.filters,
    out: writeResult,
    candidates: report.candidates.map((c) => ({
      candidate_id: c.candidate_id,
      project_code: c.project_code,
      mail_count: c.evidence.mail_count,
      manual_assignment_count: c.evidence.manual_assignment_count,
      active_router_project_rule_count: c.active_router_project_rule_count,
      safe_subject_tokens: c.evidence.safe_subject_token_counts.map((x) => x.value),
      sender_domains: c.evidence.sender_domain_counts.map((x) => x.value),
      recommended_action: c.recommended_action,
    })),
  };
  if (opts.json || opts.apply) console.log(JSON.stringify(output, null, 2));
  else {
    console.log(`mail_count=${report.summary.scanned_mail_count} candidates=${report.summary.candidate_count} manual_assignment_mail_count=${report.summary.manual_assignment_mail_count}`);
    for (const c of output.candidates) {
      console.log(`${c.project_code}: mail=${c.mail_count} manual=${c.manual_assignment_count} router_rules=${c.active_router_project_rule_count} tokens=${c.safe_subject_tokens.join("|") || "-"} domains=${c.sender_domains.join("|") || "-"}`);
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err?.stack || err?.message || String(err));
    process.exit(1);
  });
}
