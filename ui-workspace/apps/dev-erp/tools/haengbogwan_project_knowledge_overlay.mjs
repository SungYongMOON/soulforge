#!/usr/bin/env node
// Metadata-only project knowledge overlay for haengbogwan.
// This reads refs, manifests, ledgers, and DB knowledge-card metadata only.
// It does not read wiki bodies, source text, chunks, embeddings, attachments,
// NotebookLM answers, raw payloads, or secrets.
import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  scanKnowledgeLedgers,
  scanKnowledgeShellContract,
  scanKnowledgeSpaces,
  scanRagRoutes,
  scanRagWorkCards,
  scanWikiPageRefs,
} from "../src/knowledge_shell.mjs";
import { Store } from "../src/store.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, "..");
const REPO = resolve(HERE, "..", "..", "..", "..");
const DEFAULT_DB = join(APP, "data", "dev-erp.db");
const SAFE_PROJECT_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const DEFAULT_LIMIT = 20;
const MAX_TERM_CHARS = 160;

function validateProjectId(projectId) {
  const project = String(projectId ?? "").trim();
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

function normalizeTerm(value) {
  return String(value ?? "")
    .replace(/\0/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TERM_CHARS);
}

function uniqueTerms(values) {
  const out = [];
  const seen = new Set();
  for (const value of values) {
    const term = normalizeTerm(value);
    if (!term) continue;
    const key = term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(term);
  }
  return out;
}

function firstN(rows, limit) {
  return (Array.isArray(rows) ? rows : []).slice(0, limit);
}

function relProjectRoots(project) {
  return [
    {
      key: "registry_knowledge",
      rel: ".registry/knowledge",
      owner_surface: ".registry/knowledge",
      visibility: "public_safe",
      uses: ["spaces", "wiki_pages"],
    },
    {
      key: "workspace_knowledge_project",
      rel: `_workspaces/knowledge/${project}`,
      owner_surface: "_workspaces/knowledge",
      visibility: "project_private",
      uses: ["spaces", "wiki_pages", "rag_work_cards"],
      allow_external_root: true,
      external_reason: "owner_approved_workspace_junction",
    },
    {
      key: "workspace_knowledge_common",
      rel: "_workspaces/knowledge/common",
      owner_surface: "_workspaces/knowledge/common",
      visibility: "shared_private",
      uses: ["spaces", "wiki_pages", "rag_work_cards"],
      allow_external_root: true,
      external_reason: "owner_approved_workspace_junction",
    },
    {
      key: "workspace_project_source_packets",
      rel: `_workspaces/${project}/source_packets`,
      owner_surface: `_workspaces/${project}/source_packets`,
      visibility: "project_private_source_inventory",
      uses: ["spaces"],
    },
    {
      key: "workspace_project_knowledge_extract",
      rel: `_workspaces/${project}/reference_payloads/knowledge_extract`,
      owner_surface: `_workspaces/${project}/reference_payloads/knowledge_extract`,
      visibility: "project_private_source_text_lane",
      uses: ["spaces"],
    },
    {
      key: "workmeta_project_knowledge_ingest_receipts",
      rel: `_workmeta/${project}/knowledge_ingest_receipts`,
      owner_surface: `_workmeta/${project}/knowledge_ingest_receipts`,
      visibility: "project_private_metadata",
      uses: ["spaces", "ledgers"],
    },
    {
      key: "workmeta_project_knowledge_rag_candidate_ledger",
      rel: `_workmeta/${project}/knowledge_rag_candidate_ledger`,
      owner_surface: `_workmeta/${project}/knowledge_rag_candidate_ledger`,
      visibility: "project_private_metadata",
      uses: ["spaces", "rag_routes", "rag_work_cards", "ledgers"],
    },
    {
      key: "workmeta_project_reports_knowledge_wiki",
      rel: `_workmeta/${project}/reports/knowledge_wiki`,
      owner_surface: `_workmeta/${project}/reports/knowledge_wiki`,
      visibility: "project_private_metadata",
      uses: ["spaces", "wiki_pages", "ledgers"],
    },
    {
      key: "workmeta_project_reports_rag",
      rel: `_workmeta/${project}/reports/rag`,
      owner_surface: `_workmeta/${project}/reports/rag`,
      visibility: "project_private_metadata",
      uses: ["spaces", "rag_routes", "rag_work_cards", "ledgers"],
    },
    {
      key: "workmeta_project_reports_source_research",
      rel: `_workmeta/${project}/reports/source_research`,
      owner_surface: `_workmeta/${project}/reports/source_research`,
      visibility: "project_private_metadata",
      uses: ["spaces", "ledgers"],
    },
    {
      key: "guild_rag",
      rel: "guild_hall/rag",
      owner_surface: "guild_hall/rag",
      visibility: "operations_private",
      uses: ["spaces", "rag_routes", "rag_work_cards", "ledgers"],
    },
    {
      key: "guild_knowledge_access",
      rel: "guild_hall/knowledge_access",
      owner_surface: "guild_hall/knowledge_access",
      visibility: "operations_private",
      uses: ["spaces", "ledgers"],
    },
    {
      key: "workmeta_system_knowledge_rag_candidate_ledger",
      rel: "_workmeta/system/knowledge_rag_candidate_ledger",
      owner_surface: "_workmeta/system/knowledge_rag_candidate_ledger",
      visibility: "private_metadata",
      uses: ["spaces", "rag_routes", "rag_work_cards", "ledgers"],
    },
    {
      key: "workmeta_system_reports_knowledge_wiki",
      rel: "_workmeta/system/reports/knowledge_wiki",
      owner_surface: "_workmeta/system/reports/knowledge_wiki",
      visibility: "private_metadata",
      uses: ["spaces", "wiki_pages", "ledgers"],
    },
    {
      key: "workmeta_system_reports_rag",
      rel: "_workmeta/system/reports/rag",
      owner_surface: "_workmeta/system/reports/rag",
      visibility: "private_metadata",
      uses: ["spaces", "rag_routes", "rag_work_cards", "ledgers"],
    },
  ];
}

function resolvedDbPath(dbPath) {
  const raw = String(dbPath ?? "").trim();
  if (!raw) return "";
  const candidates = [resolve(process.cwd(), raw), resolve(APP, raw)];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return "";
}

function retrieveCoreKnowledge({ dbPath = "", queryTerms = [], limit = DEFAULT_LIMIT } = {}) {
  const path = resolvedDbPath(dbPath);
  if (!path) return { loaded: false, hits: [], reason: "db_not_available" };
  const terms = uniqueTerms(queryTerms);
  if (!terms.length) return { loaded: false, hits: [], reason: "query_terms_empty" };
  const db = new DatabaseSync(path, { readOnly: true });
  const store = new Store(db);
  try {
    const hits = store.retrieveKnowledge(terms.join(" "), limit).map((row) => ({
      id: row.knowledge.id,
      title: row.knowledge.title,
      summary: row.knowledge.summary ?? "",
      topic: row.knowledge.topic ?? "",
      source_ref: row.knowledge.source_ref ?? "",
      claim_ceiling: row.knowledge.claim_ceiling ?? "",
      keywords: row.knowledge.keywords ?? "",
      pointer: row.knowledge.pointer ?? "",
      score: row.score,
      norm: row.norm,
      content_policy: "metadata_only",
      body_included: false,
    }));
    return { loaded: true, hits };
  } finally {
    db.close();
  }
}

function rootCounts(contract) {
  const roots = Array.isArray(contract?.roots) ? contract.roots : [];
  return {
    root_count: roots.length,
    present_root_count: roots.filter((root) => root.status === "present").length,
    missing_root_count: roots.filter((root) => root.status === "missing").length,
    blocked_root_count: roots.filter((root) => root.status === "blocked").length,
  };
}

function notLoadedNotes() {
  return {
    wiki_body: {
      status: "not_loaded",
      reason: "knowledge overlay carries wiki page refs only",
    },
    rag_chunks: {
      status: "not_loaded",
      reason: "source text, chunk payloads, and embeddings require a separate approved RAG source-text lane",
    },
    source_text: {
      status: "not_loaded",
      reason: "always-on project knowledge context is metadata-only",
    },
    notebooklm_answers: {
      status: "not_loaded",
      reason: "NotebookLM answers are advisory payloads and are not read by the ERP overlay",
    },
    raw_payloads: {
      status: "not_loaded",
      reason: "raw project payloads stay in _workspaces/source packets or owner-held files",
    },
    attachments: {
      status: "not_loaded",
      reason: "attachment payloads are outside this overlay",
    },
    secrets: {
      status: "not_loaded",
      reason: "secret files and credential material are never loaded",
    },
  };
}

export function buildProjectKnowledgeOverlay({
  repoRoot = REPO,
  dbPath = DEFAULT_DB,
  projectId,
  queryTerms = [],
  limit = DEFAULT_LIMIT,
  generatedAt = new Date().toISOString(),
} = {}) {
  const project = validateProjectId(projectId);
  const checkedLimit = validateLimit(limit);
  const terms = uniqueTerms([project, ...queryTerms]).slice(0, checkedLimit);
  const allowedRoots = relProjectRoots(project);
  const scanOptions = {
    root: resolve(repoRoot),
    allowedRoots,
    maxRefs: checkedLimit,
    maxDepth: 5,
  };
  const contract = scanKnowledgeShellContract(scanOptions);
  const spaces = scanKnowledgeSpaces(scanOptions);
  const wikiPages = scanWikiPageRefs(scanOptions);
  const ragRoutes = scanRagRoutes(scanOptions);
  const ragWorkCards = scanRagWorkCards(scanOptions);
  const ledgers = scanKnowledgeLedgers(scanOptions);
  const coreKnowledge = retrieveCoreKnowledge({ dbPath, queryTerms: terms, limit: checkedLimit });
  const counts = {
    ...rootCounts(contract),
    space_count: spaces.counts?.space_count ?? 0,
    wiki_page_count: wikiPages.counts?.page_count ?? 0,
    rag_route_count: ragRoutes.counts?.route_count ?? 0,
    rag_work_card_count: ragWorkCards.counts?.work_card_count ?? 0,
    knowledge_ledger_count: ledgers.counts?.ledger_count ?? 0,
    core_knowledge_hit_count: coreKnowledge.hits.length,
    blocked_ref_count: (spaces.counts?.blocked_ref_count ?? 0)
      + (wikiPages.counts?.blocked_ref_count ?? 0)
      + (ragRoutes.counts?.blocked_ref_count ?? 0)
      + (ragWorkCards.counts?.blocked_ref_count ?? 0)
      + (ledgers.counts?.blocked_ref_count ?? 0),
  };

  return {
    schema_version: "haengbogwan.project_knowledge_overlay.v1",
    generated_at: generatedAt,
    project_id: project,
    query_terms: terms,
    boundary: {
      metadata_only: true,
      body_included: false,
      wiki_body_loaded: false,
      source_text_loaded: false,
      rag_chunks_loaded: false,
      embeddings_loaded: false,
      notebooklm_answers_loaded: false,
      raw_payload_copied: false,
      attachments_loaded: false,
      secret_loaded: false,
      owner_approval_required_for_source_text: true,
    },
    counts,
    roots: firstN(contract.roots, checkedLimit),
    spaces: firstN(spaces.spaces, checkedLimit),
    wiki_page_refs: firstN(wikiPages.pages, checkedLimit),
    rag_route_refs: firstN(ragRoutes.routes, checkedLimit),
    rag_work_card_refs: firstN(ragWorkCards.work_cards, checkedLimit),
    knowledge_ledger_refs: firstN(ledgers.ledgers, checkedLimit),
    core_knowledge_hits: firstN(coreKnowledge.hits, checkedLimit),
    core_knowledge: {
      loaded: coreKnowledge.loaded,
      reason: coreKnowledge.reason || "",
    },
    not_loaded: notLoadedNotes(),
  };
}

function readValue(argv, index, token) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${token}_requires_value`);
  return value;
}

function parseArgs(argv) {
  const opts = {
    repoRoot: REPO,
    dbPath: DEFAULT_DB,
    projectId: "",
    queryTerms: [],
    limit: DEFAULT_LIMIT,
    json: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--help" || token === "-h") {
      opts.help = true;
    } else if (token === "--json") {
      opts.json = true;
    } else if (token === "--repo-root") {
      opts.repoRoot = readValue(argv, i, token);
      i += 1;
    } else if (token === "--db") {
      opts.dbPath = readValue(argv, i, token);
      i += 1;
    } else if (token === "--project") {
      opts.projectId = readValue(argv, i, token);
      i += 1;
    } else if (token === "--query" || token === "--term") {
      opts.queryTerms.push(readValue(argv, i, token));
      i += 1;
    } else if (token === "--limit") {
      opts.limit = validateLimit(readValue(argv, i, token));
      i += 1;
    } else {
      throw new Error(`unknown_arg:${token}`);
    }
  }
  if (opts.projectId) validateProjectId(opts.projectId);
  return opts;
}

function usage() {
  return [
    "Usage: node tools/haengbogwan_project_knowledge_overlay.mjs --project <code> [--repo-root <dir>] [--db <dev-erp.db>] [--query <text>] [--limit N] [--json]",
    "",
    "Builds a metadata-only project knowledge overlay for haengbogwan.",
    "No wiki bodies, source text, chunks, raw payloads, attachments, NotebookLM answers, or secrets are read.",
  ].join("\n");
}

export function main(argv = process.argv.slice(2), { stdout = process.stdout, stderr = process.stderr } = {}) {
  try {
    const opts = parseArgs(argv);
    if (opts.help) {
      stdout.write(`${usage()}\n`);
      return 0;
    }
    if (!opts.projectId) throw new Error("--project_required");
    const overlay = buildProjectKnowledgeOverlay(opts);
    stdout.write(opts.json ? `${JSON.stringify(overlay)}\n` : `${JSON.stringify(overlay, null, 2)}\n`);
    return 0;
  } catch (error) {
    stderr.write(`[haengbogwan_project_knowledge_overlay] ${error.message}\n`);
    return 2;
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  process.exitCode = main();
}
