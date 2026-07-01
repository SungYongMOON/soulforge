#!/usr/bin/env node
// Backfill project routing for already-ingested ERP mail.
// Reads core_mail metadata and the private router binding; does not read raw
// provider payloads or attachments. By default only exact suggestions are moved.
import { dirname, join, resolve } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { loadMailProjectRouterBinding, buildMailProjectRoutingSuggestion } from "../../../../guild_hall/gateway/mail_project_router.mjs";
import { openStore } from "../src/store.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, "..");
const REPO = resolve(HERE, "..", "..", "..", "..");
const DEFAULT_DB = join(APP, "data", "dev-erp.db");
const DEFAULT_BINDING_REL = "_workmeta/system/bindings/mail_project_router.yaml";
const INBOX_PROJECT = "P00-000_INBOX";
const SAFE_PROJECT_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function readValue(argv, index, token) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${token}_requires_value`);
  return value;
}

function validateProject(value, label) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (!SAFE_PROJECT_RE.test(text) || text.includes("..")) throw new Error(`unsafe_${label}:${text}`);
  return text;
}

function asInt(value, fallback, label) {
  if (value === undefined || value === null || value === "") return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) throw new Error(`invalid_${label}:${value}`);
  return n;
}

function parseArgs(argv) {
  const opts = {
    dbPath: DEFAULT_DB,
    repoRoot: REPO,
    bindingFile: null,
    fromProject: INBOX_PROJECT,
    targetProject: "",
    includeHint: false,
    privateDeep: false,
    includeHidden: false,
    limit: 0,
    apply: false,
    json: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--db") opts.dbPath = readValue(argv, i++, a);
    else if (a === "--repo-root") opts.repoRoot = readValue(argv, i++, a);
    else if (a === "--binding") opts.bindingFile = readValue(argv, i++, a);
    else if (a === "--from-project") opts.fromProject = validateProject(readValue(argv, i++, a), "from_project");
    else if (a === "--target-project") opts.targetProject = validateProject(readValue(argv, i++, a), "target_project");
    else if (a === "--include-hint") opts.includeHint = true;
    else if (a === "--private-deep") opts.privateDeep = true;
    else if (a === "--include-hidden") opts.includeHidden = true;
    else if (a === "--limit") opts.limit = asInt(readValue(argv, i++, a), 0, "limit");
    else if (a === "--apply") opts.apply = true;
    else if (a === "--json") opts.json = true;
    else if (a === "--help" || a === "-h") opts.help = true;
    else throw new Error(`unknown_arg:${a}`);
  }
  return opts;
}

function printHelp() {
  console.log([
    "Usage: node tools/mail_project_route_backfill.mjs [--apply] [--target-project P24-049]",
    "",
    "Options:",
    "  --db <path>              dev-erp DB path (default: data/dev-erp.db)",
    "  --from-project <code>    current project bucket to scan (default: P00-000_INBOX)",
    "  --target-project <code>  only apply suggestions to this project",
    "  --include-hint           allow hint-confidence moves (default: exact only)",
    "  --private-deep           include core_mail.body_text in router matching",
    "  --limit <n>              inspect at most n rows",
    "  --apply                  write project moves; omitted means dry-run",
    "  --json                   print JSON summary",
  ].join("\n"));
}

function sqlForRows(opts) {
  const cond = [];
  const args = [];
  if (opts.fromProject) {
    cond.push("project_id=?");
    args.push(opts.fromProject);
  }
  if (!opts.includeHidden) cond.push("COALESCE(hidden,0)=0");
  const limit = opts.limit ? " LIMIT ?" : "";
  if (opts.limit) args.push(opts.limit);
  return {
    sql: `SELECT id, project_id, at, direction, subject, counterpart, source_ref, mailbox, body_text FROM core_mail ${cond.length ? `WHERE ${cond.join(" AND ")}` : ""} ORDER BY at DESC${limit}`,
    args,
  };
}

function toCandidate(row) {
  return {
    source_event: {
      source: row.source_ref || "core_mail",
      workspace: row.mailbox || "",
    },
    mail_summary: {
      subject: row.subject || "",
      from: row.counterpart ? [row.counterpart] : [],
      classification: {},
      attachment_types: [],
    },
  };
}

function effectiveBindingFile(opts) {
  if (opts.bindingFile) return opts.bindingFile;
  const localBinding = resolve(opts.repoRoot, DEFAULT_BINDING_REL);
  if (existsSync(localBinding)) return null;
  const siblingSourceBinding = resolve(opts.repoRoot, "..", "Soulforge", DEFAULT_BINDING_REL);
  return existsSync(siblingSourceBinding) ? siblingSourceBinding : null;
}

function summarizeRoutes(rows) {
  const byProject = {};
  const byRule = {};
  for (const row of rows) {
    byProject[row.to_project] = (byProject[row.to_project] || 0) + 1;
    byRule[row.route_id] = (byRule[row.route_id] || 0) + 1;
  }
  return { by_project: byProject, by_rule: byRule };
}

export async function planMailProjectRouteBackfill(opts) {
  const loaded = await loadMailProjectRouterBinding({
    repoRoot: opts.repoRoot,
    bindingFile: effectiveBindingFile(opts),
  });
  const store = openStore(opts.dbPath);
  try {
    const { sql, args } = sqlForRows(opts);
    const rows = store.db.prepare(sql).all(...args);
    const now = new Date();
    const acceptedConf = new Set(["exact"]);
    if (opts.includeHint) acceptedConf.add("hint");
    const matches = [];
    const skipped = { defaulted: 0, same_project: 0, wrong_target: 0, low_confidence: 0, unmatched: 0 };
    for (const row of rows) {
      const suggestion = buildMailProjectRoutingSuggestion(toCandidate(row), {
        binding: loaded.binding,
        bindingRef: loaded.binding_ref,
        now,
        privateDeep: !!opts.privateDeep,
        eventRecord: opts.privateDeep ? { body_text: row.body_text || "" } : null,
      });
      if (suggestion.status !== "suggested" || !suggestion.project_code) {
        skipped[suggestion.status === "defaulted" ? "defaulted" : "unmatched"]++;
        continue;
      }
      if (suggestion.project_code === row.project_id) {
        skipped.same_project++;
        continue;
      }
      if (opts.targetProject && suggestion.project_code !== opts.targetProject) {
        skipped.wrong_target++;
        continue;
      }
      if (!acceptedConf.has(suggestion.confidence || "")) {
        skipped.low_confidence++;
        continue;
      }
      matches.push({
        mail_id: row.id,
        from_project: row.project_id || null,
        to_project: suggestion.project_code,
        route_id: suggestion.route_id,
        confidence: suggestion.confidence,
        matched_on: suggestion.matched_on,
        reason_codes: suggestion.reason_codes,
      });
    }
    return {
      schema_version: "soulforge.dev_erp.mail_project_route_backfill.v0",
      generated_at: now.toISOString(),
      mode: opts.apply ? "apply" : "dry_run",
      scanned: rows.length,
      matched: matches.length,
      skipped,
      ...summarizeRoutes(matches),
      matches,
    };
  } finally {
    store.db.close();
  }
}

export async function applyMailProjectRouteBackfill(opts, plan = null) {
  const report = plan ?? await planMailProjectRouteBackfill({ ...opts, apply: false });
  const store = openStore(opts.dbPath);
  let moved = 0;
  const errors = [];
  try {
    for (const match of report.matches) {
      const result = store.setMailProject(match.mail_id, match.to_project);
      if (result?.ok) moved++;
      else errors.push({ mail_id: match.mail_id, error: result?.error || "unknown_error" });
    }
    store.appendEvent({
      actor_ref: "mail_project_route_backfill",
      actor_kind: "system",
      kind: "mail_route_backfill",
      from: opts.fromProject || null,
      to: opts.targetProject || null,
      used_refs: ["core_mail", "mail_project_router"],
      data_label: "real",
      note: `moved=${moved}; matched=${report.matches.length}; include_hint=${!!opts.includeHint}; private_deep=${!!opts.privateDeep}`,
    });
  } finally {
    store.db.close();
  }
  return { ...report, mode: "apply", moved, errors };
}

function printHuman(report) {
  console.log(`# mail project route backfill ${report.mode}`);
  console.log(`scanned=${report.scanned} matched=${report.matched}${report.moved !== undefined ? ` moved=${report.moved}` : ""}`);
  console.log(`by_project=${JSON.stringify(report.by_project)}`);
  console.log(`by_rule=${JSON.stringify(report.by_rule)}`);
  console.log(`skipped=${JSON.stringify(report.skipped)}`);
  if (report.errors?.length) console.log(`errors=${JSON.stringify(report.errors)}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const opts = parseArgs(process.argv.slice(2));
    if (opts.help) {
      printHelp();
      process.exit(0);
    }
    const report = opts.apply
      ? await applyMailProjectRouteBackfill(opts)
      : await planMailProjectRouteBackfill(opts);
    if (opts.json) console.log(JSON.stringify(report, null, 2));
    else printHuman(report);
  } catch (err) {
    console.error(`[mail_project_route_backfill] ${err?.message || err}`);
    process.exit(1);
  }
}
