#!/usr/bin/env node
// Metadata-only project knowledge overlay for haengbogwan.
// This reads refs, manifests, ledgers, and DB knowledge-card metadata only.
// It does not read wiki bodies, source text, chunks, embeddings, attachments,
// NotebookLM answers, raw payloads, or secrets.
import { existsSync, lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
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
const DEFAULT_COMMON_KNOWLEDGE_BINDING_REL = "_workmeta/system/bindings/haengbogwan_common_knowledge_overlay.json";
const SAFE_PROJECT_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const DEFAULT_LIMIT = 20;
const MAX_TERM_CHARS = 160;
const MAX_CONTEXT_HINT_RULE_FILE_BYTES = 256 * 1024;
const MAX_COMMON_KNOWLEDGE_BINDING_BYTES = 256 * 1024;
const SAFE_RULE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;
const SAFE_WORK_TYPES = new Set(["answer", "review", "author", "revise", "purchase", "verify", "decide", "schedule"]);
const SAFE_CLAIM_CEILINGS = new Set(["observed", "source_supported", "validated_private", "canon_candidate", "canon_entry", "rejected_or_blocked"]);
const SAFE_COMMON_REF_KINDS = new Set(["registry_knowledge", "workspace_knowledge", "rag_route", "source_card", "knowledge_ledger", "wiki_ref", "routing_note"]);
const SAFE_COMMON_KNOWLEDGE_REF_KEYS = new Set([
  "id",
  "kind",
  "ref",
  "title",
  "summary",
  "tags",
  "owner_surface",
  "ownerSurface",
  "visibility",
  "claim_ceiling",
  "claimCeiling",
  "route_hint",
  "routeHint",
  "content_policy",
  "contentPolicy",
]);
const SAFE_COMMON_KNOWLEDGE_BINDING_KEYS = new Set([
  "schema_version",
  "binding_id",
  "enabled",
  "applies_to",
  "shared_refs",
  "common_knowledge_refs",
  "context_hint_rules",
  "rules",
  "notes",
]);
const SAFE_CONTEXT_HINT_RULE_KEYS = new Set([
  "id",
  "enabled",
  "priority",
  "hint_authority",
  "hintAuthority",
  "claim_ceiling",
  "claimCeiling",
  "owner_review_required",
  "ownerReviewRequired",
  "owner_review_flags",
  "ownerReviewFlags",
  "event_keywords",
  "eventKeywords",
  "knowledge_keywords",
  "knowledgeKeywords",
  "target_object",
  "targetObject",
  "work_types",
  "workTypes",
  "required_role",
  "requiredRole",
  "required_capability",
  "requiredCapability",
  "suggested_assignee_ref",
  "suggestedAssigneeRef",
  "description",
]);
const FORBIDDEN_HINT_KEY_RE = /(^|[._-])(secret|token|credential|cookie|session|password|passwd|private[-_]?key|body|bodies|raw|chunk|chunks|attachment|attachments|mail[-_]?body|notebooklm[-_]?answer|answer[-_]?text)([._-]|$)/i;

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

function normalizeRepoRelativeRef(value, label = "ref") {
  const ref = normalizeTerm(value).replaceAll("\\", "/");
  if (!ref) throw new Error(`missing_${label}`);
  if (isAbsolute(ref) || ref.includes("\0") || ref.split("/").includes("..")) {
    throw new Error(`unsafe_${label}:${ref}`);
  }
  return ref;
}

function firstN(rows, limit) {
  return (Array.isArray(rows) ? rows : []).slice(0, limit);
}

function isInside(parent, child) {
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
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

function contextHintRuleRefs(project) {
  return [
    `_workmeta/${project}/rules/haengbogwan_context_hint_rules.json`,
    `_workmeta/${project}/project_context/context_hint_rules.json`,
    `_workmeta/${project}/project_context/context_hint_rules/context_hint_rules.json`,
    `_workspaces/knowledge/${project}/context_hint_rules.json`,
    `_workspaces/knowledge/${project}/context_hint_rules/context_hint_rules.json`,
  ];
}

function resolveBindingRef(repoRoot, ref) {
  const root = resolve(repoRoot);
  const raw = String(ref ?? "").trim() || DEFAULT_COMMON_KNOWLEDGE_BINDING_REL;
  const abs = isAbsolute(raw) ? resolve(raw) : resolve(root, raw);
  const rel = relative(root, abs).replaceAll("\\", "/");
  if (!isInside(root, abs) || rel.startsWith("..") || rel === "") {
    throw new Error(`common_knowledge_binding_path_escape:${raw}`);
  }
  return { abs, rel };
}

function bindingAppliesTo(parsed, project) {
  const applies = parsed?.applies_to && typeof parsed.applies_to === "object" && !Array.isArray(parsed.applies_to)
    ? parsed.applies_to
    : {};
  const projectIds = stringArray(applies.project_ids ?? applies.projects, { label: "applies_to_project_ids", maxItems: 128 });
  if (!projectIds.length || projectIds.includes("*")) return true;
  return projectIds.includes(project);
}

function normalizeCommonKnowledgeRef(row, { sourceRef, index }) {
  if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error(`invalid_common_knowledge_ref:${index}`);
  for (const key of Object.keys(row)) {
    if (!SAFE_COMMON_KNOWLEDGE_REF_KEYS.has(key)) throw new Error(`unknown_common_knowledge_ref_key:${key}`);
  }
  const id = normalizeTerm(row.id) || `common_ref_${index}`;
  if (!SAFE_RULE_ID_RE.test(id)) throw new Error(`invalid_common_knowledge_ref_id:${id}`);
  const kind = normalizeTerm(row.kind) || "routing_note";
  if (!SAFE_COMMON_REF_KINDS.has(kind)) throw new Error(`invalid_common_knowledge_ref_kind:${kind}`);
  const ref = normalizeRepoRelativeRef(row.ref, "common_knowledge_ref");
  const claimCeiling = normalizeTerm(row.claim_ceiling ?? row.claimCeiling);
  return {
    id,
    kind,
    ref,
    title: normalizeTerm(row.title),
    summary: normalizeTerm(row.summary),
    tags: stringArray(row.tags, { label: "tags", maxItems: 32 }),
    owner_surface: normalizeTerm(row.owner_surface ?? row.ownerSurface),
    visibility: normalizeTerm(row.visibility),
    claim_ceiling: SAFE_CLAIM_CEILINGS.has(claimCeiling) ? claimCeiling : "observed",
    route_hint: normalizeTerm(row.route_hint ?? row.routeHint),
    source_ref: `${sourceRef}#shared_refs/${index}`,
    content_policy: "metadata_only",
    body_included: false,
  };
}

function assertNoForbiddenHintKeys(value, path = []) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoForbiddenHintKeys(entry, [...path, String(index)]));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_HINT_KEY_RE.test(key)) {
      throw new Error(`forbidden_context_hint_key:${[...path, key].join(".")}`);
    }
    assertNoForbiddenHintKeys(child, [...path, key]);
  }
}

function stringArray(value, { label, required = false, maxItems = 32 } = {}) {
  if (value == null) {
    if (required) throw new Error(`missing_${label}`);
    return [];
  }
  if (!Array.isArray(value)) throw new Error(`invalid_${label}:not_array`);
  const out = [];
  for (const item of value) {
    const text = normalizeTerm(item);
    if (!text) continue;
    if (!out.includes(text)) out.push(text);
    if (out.length >= maxItems) break;
  }
  if (required && !out.length) throw new Error(`missing_${label}`);
  return out;
}

function normalizeContextHintRule(row, { project, sourceRef, index }) {
  if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error(`invalid_rule:${index}`);
  for (const key of Object.keys(row)) {
    if (!SAFE_CONTEXT_HINT_RULE_KEYS.has(key)) throw new Error(`unknown_context_hint_key:${key}`);
  }
  if (row.enabled === false) return null;
  const id = normalizeTerm(row.id);
  if (!id || !SAFE_RULE_ID_RE.test(id)) throw new Error(`invalid_context_hint_id:${id || index}`);
  const targetObject = normalizeTerm(row.target_object ?? row.targetObject);
  if (!targetObject) throw new Error(`missing_target_object:${id}`);
  const workTypes = stringArray(row.work_types ?? row.workTypes, { label: "work_types", maxItems: 4 })
    .filter((type) => SAFE_WORK_TYPES.has(type));
  if ((row.work_types ?? row.workTypes) && !workTypes.length) throw new Error(`invalid_work_types:${id}`);
  const priority = Number(row.priority ?? 0);
  return {
    id,
    source_ref: `${sourceRef}#rules/${index}`,
    project_id: project,
    enabled: true,
    priority: Number.isFinite(priority) ? priority : 0,
    event_keywords: stringArray(row.event_keywords ?? row.eventKeywords, { label: "event_keywords", required: true }),
    knowledge_keywords: stringArray(row.knowledge_keywords ?? row.knowledgeKeywords, { label: "knowledge_keywords" }),
    target_object: targetObject,
    work_types: workTypes,
    required_role: normalizeTerm(row.required_role ?? row.requiredRole),
    required_capability: normalizeTerm(row.required_capability ?? row.requiredCapability),
    suggested_assignee_ref: normalizeTerm(row.suggested_assignee_ref ?? row.suggestedAssigneeRef),
    hint_authority: normalizeTerm(row.hint_authority ?? row.hintAuthority) || "metadata_hint",
    claim_ceiling: SAFE_CLAIM_CEILINGS.has(normalizeTerm(row.claim_ceiling ?? row.claimCeiling))
      ? normalizeTerm(row.claim_ceiling ?? row.claimCeiling)
      : "observed",
    owner_review_required: row.owner_review_required ?? row.ownerReviewRequired ?? true,
    owner_review_flags: stringArray(row.owner_review_flags ?? row.ownerReviewFlags, { label: "owner_review_flags", maxItems: 16 }),
    description: normalizeTerm(row.description),
    content_policy: "metadata_only",
    body_included: false,
  };
}

function readContextHintRuleFile({ root, project, rel, limit }) {
  const abs = resolve(root, rel);
  if (!isInside(root, abs) || !existsSync(abs)) return { rules: [], sources: [], errors: [] };
  const linkInfo = lstatSync(abs);
  if (linkInfo.isSymbolicLink()) {
    return { rules: [], sources: [], errors: [{ ref: rel, reason: "context_hint_rule_symlink_blocked" }] };
  }
  const realRoot = realpathSync.native(root);
  const realAbs = realpathSync.native(abs);
  if (!isInside(realRoot, realAbs)) {
    return { rules: [], sources: [], errors: [{ ref: rel, reason: "context_hint_rule_realpath_escape" }] };
  }
  const info = statSync(abs);
  if (!info.isFile()) return { rules: [], sources: [], errors: [] };
  if (info.size > MAX_CONTEXT_HINT_RULE_FILE_BYTES) {
    return { rules: [], sources: [], errors: [{ ref: rel, reason: "context_hint_rule_file_too_large" }] };
  }
  try {
    const parsed = JSON.parse(readFileSync(abs, "utf8"));
    assertNoForbiddenHintKeys(parsed);
    const declaredProject = normalizeTerm(parsed?.project_id);
    if (declaredProject && declaredProject !== project) {
      throw new Error(`context_hint_project_mismatch:${declaredProject}`);
    }
    const sourceRules = Array.isArray(parsed) ? parsed : parsed.rules;
    if (!Array.isArray(sourceRules)) throw new Error("rules_not_array");
    const rules = [];
    const seenIds = new Set();
    const duplicateIds = [];
    for (let i = 0; i < sourceRules.length && rules.length < limit; i += 1) {
      const rule = normalizeContextHintRule(sourceRules[i], { project, sourceRef: rel, index: i });
      if (!rule) continue;
      if (seenIds.has(rule.id)) {
        duplicateIds.push(rule.id);
        continue;
      }
      seenIds.add(rule.id);
      rules.push(rule);
    }
    return {
      rules,
      sources: [{
        ref: rel,
        path: rel,
        rule_count: rules.length,
        size_bytes: info.size,
        mtime_ms: Math.trunc(info.mtimeMs),
        content_policy: "metadata_only",
        body_included: false,
      }],
      errors: duplicateIds.map((id) => ({ ref: rel, reason: `duplicate_context_hint_rule_id:${id}` })),
    };
  } catch (error) {
    return { rules: [], sources: [], errors: [{ ref: rel, reason: error.message }] };
  }
}

function scanContextHintRules({ repoRoot, project, limit }) {
  const root = resolve(repoRoot);
  const out = { rules: [], sources: [], errors: [] };
  for (const rel of contextHintRuleRefs(project)) {
    if (out.rules.length >= limit) break;
    const result = readContextHintRuleFile({ root, project, rel, limit: limit - out.rules.length });
    out.rules.push(...result.rules);
    out.sources.push(...result.sources);
    out.errors.push(...result.errors);
  }
  return out;
}

function readCommonKnowledgeBindingFile({ repoRoot, project, bindingRef, limit }) {
  const root = resolve(repoRoot);
  let binding;
  try {
    binding = resolveBindingRef(root, bindingRef);
  } catch (error) {
    return {
      loaded: false,
      reason: error.message,
      binding_ref: String(bindingRef ?? DEFAULT_COMMON_KNOWLEDGE_BINDING_REL),
      common_knowledge_refs: [],
      rules: [],
      sources: [],
      errors: [{ ref: String(bindingRef ?? DEFAULT_COMMON_KNOWLEDGE_BINDING_REL), reason: error.message }],
    };
  }
  if (!existsSync(binding.abs)) {
    return {
      loaded: false,
      reason: "binding_not_found",
      binding_ref: binding.rel,
      common_knowledge_refs: [],
      rules: [],
      sources: [],
      errors: [],
    };
  }
  const sourceBase = {
    ref: binding.rel,
    path: binding.rel,
    source_type: "common_knowledge_binding",
    content_policy: "metadata_only",
    body_included: false,
  };
  try {
    const linkInfo = lstatSync(binding.abs);
    if (linkInfo.isSymbolicLink()) throw new Error("common_knowledge_binding_symlink_blocked");
    const realRoot = realpathSync.native(root);
    const realAbs = realpathSync.native(binding.abs);
    if (!isInside(realRoot, realAbs)) throw new Error("common_knowledge_binding_realpath_escape");
    const info = statSync(binding.abs);
    if (!info.isFile()) throw new Error("common_knowledge_binding_not_file");
    if (info.size > MAX_COMMON_KNOWLEDGE_BINDING_BYTES) throw new Error("common_knowledge_binding_file_too_large");
    const parsed = JSON.parse(readFileSync(binding.abs, "utf8"));
    assertNoForbiddenHintKeys(parsed);
    for (const key of Object.keys(parsed || {})) {
      if (!SAFE_COMMON_KNOWLEDGE_BINDING_KEYS.has(key)) throw new Error(`unknown_common_knowledge_binding_key:${key}`);
    }
    const source = {
      ...sourceBase,
      size_bytes: info.size,
      mtime_ms: Math.trunc(info.mtimeMs),
    };
    if (parsed?.enabled === false) {
      return {
        loaded: false,
        reason: "binding_disabled",
        binding_ref: binding.rel,
        common_knowledge_refs: [],
        rules: [],
        sources: [source],
        errors: [],
      };
    }
    if (!bindingAppliesTo(parsed, project)) {
      return {
        loaded: false,
        reason: "binding_not_applicable",
        binding_ref: binding.rel,
        common_knowledge_refs: [],
        rules: [],
        sources: [source],
        errors: [],
      };
    }
    const rawRefs = parsed.shared_refs ?? parsed.common_knowledge_refs ?? [];
    if (!Array.isArray(rawRefs)) throw new Error("common_knowledge_refs_not_array");
    const rawRules = parsed.context_hint_rules ?? parsed.rules ?? [];
    if (!Array.isArray(rawRules)) throw new Error("common_context_hint_rules_not_array");
    const commonRefs = [];
    const rules = [];
    const errors = [];
    const seenRefIds = new Set();
    const seenRuleIds = new Set();
    for (let i = 0; i < rawRefs.length && commonRefs.length < limit; i += 1) {
      try {
        const ref = normalizeCommonKnowledgeRef(rawRefs[i], { sourceRef: binding.rel, index: i });
        if (seenRefIds.has(ref.id)) {
          errors.push({ ref: binding.rel, reason: `duplicate_common_knowledge_ref_id:${ref.id}` });
          continue;
        }
        seenRefIds.add(ref.id);
        commonRefs.push(ref);
      } catch (error) {
        errors.push({ ref: `${binding.rel}#shared_refs/${i}`, reason: error.message });
      }
    }
    for (let i = 0; i < rawRules.length && rules.length < limit; i += 1) {
      try {
        const rule = normalizeContextHintRule(rawRules[i], { project, sourceRef: binding.rel, index: i });
        if (!rule) continue;
        if (seenRuleIds.has(rule.id)) {
          errors.push({ ref: binding.rel, reason: `duplicate_context_hint_rule_id:${rule.id}` });
          continue;
        }
        seenRuleIds.add(rule.id);
        rules.push({ ...rule, scope: "common" });
      } catch (error) {
        errors.push({ ref: `${binding.rel}#context_hint_rules/${i}`, reason: error.message });
      }
    }
    return {
      loaded: true,
      reason: "",
      binding_ref: binding.rel,
      common_knowledge_refs: commonRefs,
      rules,
      sources: [{
        ...source,
        common_knowledge_ref_count: commonRefs.length,
        rule_count: rules.length,
      }],
      errors,
    };
  } catch (error) {
    return {
      loaded: false,
      reason: error.message,
      binding_ref: binding.rel,
      common_knowledge_refs: [],
      rules: [],
      sources: [sourceBase],
      errors: [{ ref: binding.rel, reason: error.message }],
    };
  }
}

function scanCommonKnowledgeBinding({ repoRoot, project, bindingRef, limit, includeCommonKnowledge }) {
  if (!includeCommonKnowledge) {
    return {
      loaded: false,
      reason: "disabled_by_option",
      binding_ref: String(bindingRef ?? DEFAULT_COMMON_KNOWLEDGE_BINDING_REL),
      common_knowledge_refs: [],
      rules: [],
      sources: [],
      errors: [],
    };
  }
  return readCommonKnowledgeBindingFile({ repoRoot, project, bindingRef, limit });
}

function mergeContextHintRules(projectRules, commonRules, limit) {
  const merged = { rules: [], sources: [], errors: [] };
  const seen = new Set();
  for (const result of [projectRules, commonRules]) {
    merged.sources.push(...(result.sources || []));
    merged.errors.push(...(result.errors || []));
    for (const rule of result.rules || []) {
      if (merged.rules.length >= limit) break;
      if (seen.has(rule.id)) {
        merged.errors.push({ ref: rule.source_ref || rule.id, reason: `duplicate_context_hint_rule_id:${rule.id}` });
        continue;
      }
      seen.add(rule.id);
      merged.rules.push(rule);
    }
  }
  return merged;
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
  includeCommonKnowledge = true,
  commonKnowledgeBindingPath = DEFAULT_COMMON_KNOWLEDGE_BINDING_REL,
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
  const projectContextHintRules = scanContextHintRules({ repoRoot: resolve(repoRoot), project, limit: checkedLimit });
  const commonKnowledge = scanCommonKnowledgeBinding({
    repoRoot: resolve(repoRoot),
    project,
    bindingRef: commonKnowledgeBindingPath,
    limit: checkedLimit,
    includeCommonKnowledge,
  });
  const contextHintRules = mergeContextHintRules(projectContextHintRules, commonKnowledge, checkedLimit);
  const counts = {
    ...rootCounts(contract),
    space_count: spaces.counts?.space_count ?? 0,
    wiki_page_count: wikiPages.counts?.page_count ?? 0,
    rag_route_count: ragRoutes.counts?.route_count ?? 0,
    rag_work_card_count: ragWorkCards.counts?.work_card_count ?? 0,
    knowledge_ledger_count: ledgers.counts?.ledger_count ?? 0,
    common_knowledge_ref_count: commonKnowledge.common_knowledge_refs.length,
    common_knowledge_binding_loaded: commonKnowledge.loaded ? 1 : 0,
    context_hint_rule_count: contextHintRules.rules.length,
    context_hint_rule_source_count: contextHintRules.sources.length,
    context_hint_rule_error_count: contextHintRules.errors.length,
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
      context_hint_rule_body_loaded: false,
      common_knowledge_binding_loaded: commonKnowledge.loaded,
      owner_approval_required_for_source_text: true,
    },
    counts,
    roots: firstN(contract.roots, checkedLimit),
    spaces: firstN(spaces.spaces, checkedLimit),
    wiki_page_refs: firstN(wikiPages.pages, checkedLimit),
    rag_route_refs: firstN(ragRoutes.routes, checkedLimit),
    rag_work_card_refs: firstN(ragWorkCards.work_cards, checkedLimit),
    knowledge_ledger_refs: firstN(ledgers.ledgers, checkedLimit),
    common_knowledge_refs: firstN(commonKnowledge.common_knowledge_refs, checkedLimit),
    context_hint_rules: firstN(contextHintRules.rules, checkedLimit),
    context_hint_rule_sources: firstN(contextHintRules.sources, checkedLimit),
    context_hint_rule_errors: firstN(contextHintRules.errors, checkedLimit),
    core_knowledge_hits: firstN(coreKnowledge.hits, checkedLimit),
    core_knowledge: {
      loaded: coreKnowledge.loaded,
      reason: coreKnowledge.reason || "",
    },
    common_knowledge_binding: {
      loaded: commonKnowledge.loaded,
      reason: commonKnowledge.reason || "",
      ref: commonKnowledge.binding_ref || "",
      enabled: includeCommonKnowledge,
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
    includeCommonKnowledge: true,
    commonKnowledgeBindingPath: DEFAULT_COMMON_KNOWLEDGE_BINDING_REL,
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
    } else if (token === "--no-common-knowledge") {
      opts.includeCommonKnowledge = false;
    } else if (token === "--common-knowledge") {
      opts.commonKnowledgeBindingPath = readValue(argv, i, token);
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
    "Usage: node tools/haengbogwan_project_knowledge_overlay.mjs --project <code> [--repo-root <dir>] [--db <dev-erp.db>] [--query <text>] [--limit N] [--common-knowledge <ref>] [--no-common-knowledge] [--json]",
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
