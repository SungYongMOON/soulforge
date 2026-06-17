import { existsSync, lstatSync, readdirSync, realpathSync } from "node:fs";
import { basename, extname, isAbsolute, join, relative, resolve } from "node:path";

export const KNOWLEDGE_SHELL_SCHEMA = "dev_erp.knowledge_shell.v1";
export const KNOWLEDGE_SHELL_CONTRACT_KIND = "knowledge_shell_contract";

export const KNOWLEDGE_SHELL_OPERATION_CONTRACT = {
  contract_ref: "docs/architecture/guild_hall/KARPATHY_STYLE_WIKI_RAG_ERP_CONTRACT_V0.md",
  architecture: "karpathy_style_sourcebound_wiki_metadata_shell",
  content_policy: "metadata_only",
  body_included: false,
  llm_runtime_policy: {
    karpathy_llm_runtime_required: false,
    karpathy_llm_runtime_installed_by_contract: false,
    karpathy_reference_role: "wiki_operating_pattern_only",
    preferred_runtime_surface: "ollama_or_configured_llm_adapter",
    disallowed_install_assumption_refs: ["llm.c", "nanoGPT", "minGPT", "micrograd", "makemore"],
  },
  erp_role: {
    role: "metadata_shell_consumer",
    owns_source_truth: false,
    reads_source_bodies: false,
    mutates_public_canon: false,
    treats_notebooklm_as_authority: false,
  },
  wiki_role: {
    route: "knowledge_wiki_cell",
    default_workflow: "knowledge_wiki_pipeline_v0",
    generated_wiki_state: "private_derivative_projection_until_review",
    source_truth_owner: "source_packets_or_owner_held_files",
  },
  rag_role: {
    default_stage: "metadata_only",
    source_text_lane_requires_owner_approval: true,
    index_build_requires_source_card_permission: true,
    public_canon_requires_owner_decision_and_review: true,
  },
};

export const DEFAULT_KNOWLEDGE_SHELL_ROOTS = [
  {
    key: "registry_knowledge",
    rel: ".registry/knowledge",
    owner_surface: ".registry/knowledge",
    visibility: "public_safe",
    uses: ["spaces", "wiki_pages"],
  },
  {
    key: "workspace_knowledge",
    rel: "_workspaces/knowledge",
    owner_surface: "_workspaces/knowledge",
    visibility: "project_private",
    uses: ["spaces", "wiki_pages", "rag_work_cards"],
    allow_external_root: true,
    external_reason: "owner_approved_workspace_junction",
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
    key: "workmeta_knowledge_rag",
    rel: "_workmeta/system/knowledge_rag_candidate_ledger",
    owner_surface: "_workmeta/system/knowledge_rag_candidate_ledger",
    visibility: "private_metadata",
    uses: ["spaces", "rag_routes", "rag_work_cards", "ledgers"],
  },
  {
    key: "workmeta_reports_rag",
    rel: "_workmeta/system/reports/rag",
    owner_surface: "_workmeta/system/reports/rag",
    visibility: "private_metadata",
    uses: ["ledgers"],
  },
  {
    key: "workmeta_reports_knowledge_wiki",
    rel: "_workmeta/system/reports/knowledge_wiki",
    owner_surface: "_workmeta/system/reports/knowledge_wiki",
    visibility: "private_metadata",
    uses: ["ledgers"],
  },
  {
    key: "workmeta_reports_knowledge_access",
    rel: "_workmeta/system/reports/knowledge_access",
    owner_surface: "_workmeta/system/reports/knowledge_access",
    visibility: "private_metadata",
    uses: ["ledgers"],
  },
];

const RAW_BODY_EXTS = new Set([
  ".hwp", ".hwpx", ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
  ".zip", ".7z", ".rar", ".eml", ".msg", ".mbox",
]);

const SAFE_METADATA_EXTS = new Set([
  ".md", ".markdown", ".yaml", ".yml", ".json", ".jsonl", ".txt", ".csv", ".tsv",
]);

const BLOCKED_NAME_RE = /(^\.|(^|[._-])(secret|token|credential|cookie|session|password|passwd|private[-_]?key|body|bodies|raw|chunk|chunks|attachment|attachments|mail[-_]?body|notebooklm[-_]?answer|answer[-_]?text)([._-]|$)|\.(pem|key|pfx|p12)$)/i;

function normalizeRel(p) {
  return String(p || "").replaceAll("\\", "/").replace(/^\/+/, "");
}

function isInside(parent, child) {
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function refFor(repoRoot, absPath) {
  const rel = relative(repoRoot, absPath).replaceAll("\\", "/");
  return rel || ".";
}

function stableEntries(absDir) {
  return readdirSync(absDir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name, "en"));
}

function rootKeyFromRel(rel) {
  return normalizeRel(rel).replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "root";
}

function normalizeAllowedRoots(repoRoot, allowedRoots = DEFAULT_KNOWLEDGE_SHELL_ROOTS) {
  const root = resolve(repoRoot);
  return allowedRoots.map((entry) => {
    const item = typeof entry === "string" ? { rel: entry } : { ...entry };
    const rel = normalizeRel(item.rel);
    const abs = resolve(root, rel);
    const key = item.key || rootKeyFromRel(rel);
    const uses = item.uses || ["spaces", "wiki_pages", "rag_routes", "rag_work_cards", "ledgers"];
    const base = {
      key,
      rel,
      path: rel,
      abs,
      owner_surface: item.owner_surface || rel,
      visibility: item.visibility || "metadata_private",
      uses,
      allow_external_root: Boolean(item.allow_external_root),
      external_reason: item.external_reason,
    };
    if (!rel || !isInside(root, abs)) return { ...base, status: "blocked", exists: false, reason: "outside_repo_root" };
    if (!existsSync(abs)) return { ...base, status: "missing", exists: false };
    try {
      const realRoot = realpathSync.native(abs);
      const repoRealRoot = realpathSync.native(root);
      if (!isInside(repoRealRoot, realRoot)) {
        if (item.allow_external_root) {
          return {
            ...base,
            realRoot,
            status: "present",
            exists: true,
            external_root: true,
            external_reason: item.external_reason || "allowlisted_external_root",
          };
        }
        return { ...base, status: "blocked", exists: true, reason: "outside_repo_root" };
      }
      return { ...base, realRoot, status: "present", exists: true };
    } catch {
      return { ...base, status: "unreadable", exists: true };
    }
  });
}

function publicRoot(root) {
  return {
    key: root.key,
    path: root.path,
    owner_surface: root.owner_surface,
    visibility: root.visibility,
    status: root.status,
    exists: root.exists,
    reason: root.reason,
    external_root: root.external_root || false,
    external_reason: root.external_reason,
  };
}

function isBlockedName(name) {
  return BLOCKED_NAME_RE.test(name);
}

function isRawBodyFile(name) {
  return RAW_BODY_EXTS.has(extname(name).toLowerCase());
}

function isSafeMetadataFile(name) {
  return SAFE_METADATA_EXTS.has(extname(name).toLowerCase());
}

function emptyCounts() {
  return {
    dir_count: 0,
    file_count: 0,
    scanned_ref_count: 0,
    blocked_ref_count: 0,
    chunk_ref_count: 0,
    truncated: false,
  };
}

function markBlocked(counts, name) {
  counts.blocked_ref_count += 1;
  if (/chunk/i.test(name)) counts.chunk_ref_count += 1;
}

function baseRef(repoRoot, root, absPath, info, kind) {
  const path = refFor(repoRoot, absPath);
  return {
    ref: path,
    path,
    name: basename(absPath),
    root: root.key,
    owner_surface: root.owner_surface,
    visibility: root.visibility,
    kind,
    status: "present",
    size_bytes: kind === "file" ? info.size : undefined,
    mtime_ms: Math.trunc(info.mtimeMs),
    content_policy: "metadata_only",
    body_included: false,
  };
}

function walkMetadata(repoRoot, root, { maxDepth = 4, maxRefs = 200, include }) {
  const counts = emptyCounts();
  const refs = [];
  if (root.status !== "present") return { refs, counts };

  function visit(absDir, depth) {
    if (refs.length >= maxRefs) {
      counts.truncated = true;
      return;
    }
    let entries;
    try {
      entries = stableEntries(absDir);
    } catch {
      markBlocked(counts, basename(absDir));
      return;
    }
    for (const entry of entries) {
      if (refs.length >= maxRefs) {
        counts.truncated = true;
        return;
      }
      if (isBlockedName(entry.name)) {
        markBlocked(counts, entry.name);
        continue;
      }
      const abs = join(absDir, entry.name);
      let info;
      try {
        info = lstatSync(abs);
      } catch {
        markBlocked(counts, entry.name);
        continue;
      }
      if (info.isSymbolicLink()) {
        markBlocked(counts, entry.name);
        continue;
      }
      if (info.isDirectory()) {
        counts.dir_count += 1;
        const item = include({ repoRoot, root, absPath: abs, info, kind: "dir", depth });
        if (item) {
          counts.scanned_ref_count += 1;
          refs.push(item);
        }
        if (depth < maxDepth) visit(abs, depth + 1);
        continue;
      }
      if (!info.isFile()) continue;
      if (isRawBodyFile(entry.name)) {
        markBlocked(counts, entry.name);
        continue;
      }
      counts.file_count += 1;
      const item = include({ repoRoot, root, absPath: abs, info, kind: "file", depth });
      if (item) {
        counts.scanned_ref_count += 1;
        refs.push(item);
      }
    }
  }

  visit(root.abs, 0);
  return { refs, counts };
}

function immediateCounts(absDir) {
  const counts = emptyCounts();
  let entries;
  try {
    entries = stableEntries(absDir);
  } catch {
    counts.blocked_ref_count = 1;
    return counts;
  }
  for (const entry of entries) {
    if (isBlockedName(entry.name) || isRawBodyFile(entry.name)) {
      markBlocked(counts, entry.name);
      continue;
    }
    const abs = join(absDir, entry.name);
    try {
      const info = lstatSync(abs);
      if (info.isSymbolicLink()) markBlocked(counts, entry.name);
      else if (info.isDirectory()) counts.dir_count += 1;
      else if (info.isFile()) counts.file_count += 1;
    } catch {
      markBlocked(counts, entry.name);
    }
  }
  return counts;
}

function envelope(kind, roots, payload, counts) {
  return {
    schema: KNOWLEDGE_SHELL_SCHEMA,
    kind,
    content_policy: "metadata_only",
    body_included: false,
    roots: roots.map(publicRoot),
    counts,
    ...payload,
  };
}

function contractCounts(roots) {
  return {
    root_count: roots.length,
    present_root_count: roots.filter((root) => root.status === "present").length,
    missing_root_count: roots.filter((root) => root.status === "missing").length,
    blocked_root_count: roots.filter((root) => root.status === "blocked").length,
    dir_count: 0,
    file_count: 0,
    scanned_ref_count: 0,
    blocked_ref_count: 0,
    chunk_ref_count: 0,
    truncated: false,
  };
}

export function scanKnowledgeShellContract(options = {}) {
  const repoRoot = optionsRoot(options);
  const roots = normalizeAllowedRoots(repoRoot, options.allowedRoots);
  return envelope(
    KNOWLEDGE_SHELL_CONTRACT_KIND,
    roots,
    { contract: KNOWLEDGE_SHELL_OPERATION_CONTRACT },
    contractCounts(roots),
  );
}

function rootsFor(repoRoot, options, use) {
  const roots = normalizeAllowedRoots(repoRoot, options.allowedRoots);
  return roots.filter((root) => root.uses.includes(use));
}

function optionsRoot(options = {}) {
  return resolve(options.root || process.cwd());
}

export function scanKnowledgeSpaces(options = {}) {
  const repoRoot = optionsRoot(options);
  const roots = rootsFor(repoRoot, options, "spaces");
  const spaces = [];
  const counts = emptyCounts();
  for (const root of roots) {
    if (root.status !== "present") continue;
    const rootCounts = immediateCounts(root.abs);
    for (const key of Object.keys(counts)) {
      if (typeof counts[key] === "boolean") counts[key] = counts[key] || rootCounts[key];
      else counts[key] += rootCounts[key] || 0;
    }
    spaces.push({
      id: root.key,
      root: root.key,
      path: root.path,
      owner_surface: root.owner_surface,
      visibility: root.visibility,
      status: "present",
      counts: rootCounts,
      content_policy: "metadata_only",
      body_included: false,
    });
    let entries = [];
    try { entries = stableEntries(root.abs); } catch { continue; }
    for (const entry of entries) {
      if (spaces.length >= (options.maxRefs ?? 200)) {
        counts.truncated = true;
        break;
      }
      if (isBlockedName(entry.name)) {
        markBlocked(counts, entry.name);
        continue;
      }
      const abs = join(root.abs, entry.name);
      let info;
      try { info = lstatSync(abs); } catch { markBlocked(counts, entry.name); continue; }
      if (info.isSymbolicLink()) {
        markBlocked(counts, entry.name);
        continue;
      }
      if (!info.isDirectory()) continue;
      spaces.push({
        id: `${root.key}:${entry.name}`,
        root: root.key,
        path: refFor(repoRoot, abs),
        owner_surface: root.owner_surface,
        visibility: root.visibility,
        status: "present",
        counts: immediateCounts(abs),
        content_policy: "metadata_only",
        body_included: false,
      });
    }
  }
  return envelope("knowledge_spaces", roots, { spaces }, { ...counts, space_count: spaces.length });
}

function wikiPageItem({ repoRoot, root, absPath, info, kind }) {
  if (kind !== "file" || !isSafeMetadataFile(absPath)) return null;
  const item = baseRef(repoRoot, root, absPath, info, "file");
  return {
    page_ref: item.ref,
    page_type: extname(absPath).replace(/^\./, "") || "file",
    title_ref: basename(absPath, extname(absPath)),
    source_ref_count: 0,
    claim_ceiling: "observed",
    ...item,
  };
}

export function scanWikiPageRefs(options = {}) {
  const repoRoot = optionsRoot(options);
  const roots = rootsFor(repoRoot, options, "wiki_pages");
  const pages = [];
  const counts = emptyCounts();
  for (const root of roots) {
    const result = walkMetadata(repoRoot, root, {
      maxDepth: options.maxDepth ?? 5,
      maxRefs: options.maxRefs ?? 300,
      include: wikiPageItem,
    });
    pages.push(...result.refs);
    for (const key of Object.keys(counts)) {
      if (typeof counts[key] === "boolean") counts[key] = counts[key] || result.counts[key];
      else counts[key] += result.counts[key] || 0;
    }
  }
  return envelope("wiki_page_refs", roots, { pages }, { ...counts, page_count: pages.length });
}

function ragRouteItem({ repoRoot, root, absPath, info, kind, depth }) {
  const rel = refFor(repoRoot, absPath);
  const name = basename(absPath);
  const routeLike = /(rag|route|index|stage|pipeline|workflow)/i.test(rel);
  if (kind === "dir" && depth <= 2 && routeLike) {
    const item = baseRef(repoRoot, root, absPath, info, "dir");
    return { route_ref: item.ref, route_type: "directory", claim_ceiling: "observed", ...item };
  }
  if (kind === "file" && isSafeMetadataFile(name) && routeLike) {
    const item = baseRef(repoRoot, root, absPath, info, "file");
    return { route_ref: item.ref, route_type: extname(name).replace(/^\./, "") || "file", claim_ceiling: "observed", ...item };
  }
  return null;
}

export function scanRagRoutes(options = {}) {
  const repoRoot = optionsRoot(options);
  const roots = rootsFor(repoRoot, options, "rag_routes");
  const routes = [];
  const counts = emptyCounts();
  for (const root of roots) {
    const result = walkMetadata(repoRoot, root, {
      maxDepth: options.maxDepth ?? 4,
      maxRefs: options.maxRefs ?? 200,
      include: ragRouteItem,
    });
    routes.push(...result.refs);
    for (const key of Object.keys(counts)) {
      if (typeof counts[key] === "boolean") counts[key] = counts[key] || result.counts[key];
      else counts[key] += result.counts[key] || 0;
    }
  }
  return envelope("rag_route_refs", roots, { routes }, { ...counts, route_count: routes.length });
}

function ragWorkCardItem({ repoRoot, root, absPath, info, kind }) {
  if (kind !== "file") return null;
  const name = basename(absPath);
  if (!isSafeMetadataFile(name) || !/(work[-_]?card|source[-_]?card|route[-_]?card|card)/i.test(name)) return null;
  const item = baseRef(repoRoot, root, absPath, info, "file");
  return {
    work_card_ref: item.ref,
    card_type: extname(name).replace(/^\./, "") || "file",
    chunk_count: 0,
    claim_ceiling: "observed",
    ...item,
  };
}

export function scanRagWorkCards(options = {}) {
  const repoRoot = optionsRoot(options);
  const roots = rootsFor(repoRoot, options, "rag_work_cards");
  const work_cards = [];
  const counts = emptyCounts();
  for (const root of roots) {
    const result = walkMetadata(repoRoot, root, {
      maxDepth: options.maxDepth ?? 6,
      maxRefs: options.maxRefs ?? 300,
      include: ragWorkCardItem,
    });
    work_cards.push(...result.refs);
    for (const key of Object.keys(counts)) {
      if (typeof counts[key] === "boolean") counts[key] = counts[key] || result.counts[key];
      else counts[key] += result.counts[key] || 0;
    }
  }
  return envelope("rag_work_card_refs", roots, { work_cards }, { ...counts, work_card_count: work_cards.length });
}

function ledgerItem({ repoRoot, root, absPath, info, kind, depth }) {
  const rel = refFor(repoRoot, absPath);
  const name = basename(absPath);
  const ledgerLike = /(ledger|report|review|handoff|run|packet|registry|knowledge|rag|access|route|candidate)/i.test(rel);
  if (kind === "dir" && depth <= 2 && ledgerLike) {
    const item = baseRef(repoRoot, root, absPath, info, "dir");
    return { ledger_ref: item.ref, ledger_type: "directory", claim_ceiling: "observed", ...item };
  }
  if (kind === "file" && isSafeMetadataFile(name) && ledgerLike) {
    const item = baseRef(repoRoot, root, absPath, info, "file");
    return { ledger_ref: item.ref, ledger_type: extname(name).replace(/^\./, "") || "file", claim_ceiling: "observed", ...item };
  }
  return null;
}

export function scanKnowledgeLedgers(options = {}) {
  const repoRoot = optionsRoot(options);
  const roots = rootsFor(repoRoot, options, "ledgers");
  const ledgers = [];
  const counts = emptyCounts();
  for (const root of roots) {
    const result = walkMetadata(repoRoot, root, {
      maxDepth: options.maxDepth ?? 3,
      maxRefs: options.maxRefs ?? 300,
      include: ledgerItem,
    });
    ledgers.push(...result.refs);
    for (const key of Object.keys(counts)) {
      if (typeof counts[key] === "boolean") counts[key] = counts[key] || result.counts[key];
      else counts[key] += result.counts[key] || 0;
    }
  }
  return envelope("knowledge_ledger_refs", roots, { ledgers }, { ...counts, ledger_count: ledgers.length });
}
