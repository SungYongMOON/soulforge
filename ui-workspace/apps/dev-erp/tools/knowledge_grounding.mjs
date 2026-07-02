// tools/knowledge_grounding.mjs -- metadata-only RAG index hints for mail intake.
// Reads only source_text_index.json metadata files from the exact source-text index root.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..", "..", "..");
export const DEFAULT_KNOWLEDGE_INDEX_ROOT = join(REPO, "_workspaces", "knowledge", "rag", "indexes_local", "source_text_indexes");

const DEFAULT_IO = Object.freeze({ existsSync, readFileSync, readdirSync });
const STOP_TOKENS = new Set([
  "p26", "014", "p26-014", "kvds", "project", "프로젝트",
  "메일", "요청", "검토", "확인", "관련", "회신", "자료", "건", "문의", "완료",
]);
const SYNONYMS = new Map([
  ["요구사양", ["requirements", "specification"]],
  ["요구사항", ["requirements"]],
  ["요구도", ["requirements"]],
  ["사양서", ["requirements", "specification"]],
  ["과업", ["work", "statement", "sow"]],
  ["업무정의", ["work", "statement", "sow"]],
  ["소프트웨어", ["software", "sw"]],
  ["sw", ["software"]],
  ["규격", ["standard"]],
  ["표준", ["standard"]],
]);

function normalizePathRef(value) {
  return String(value ?? "").trim().replaceAll("\\", "/").replace(/\/+/g, "/");
}

function fieldValue(index, path) {
  let current = index;
  for (const key of path) {
    if (current == null || typeof current !== "object") return undefined;
    current = current[key];
  }
  return current;
}

function sourceCardRef(index) {
  return normalizePathRef(
    index?.source_card_ref
    ?? fieldValue(index, ["source_refs", "source_card_ref"])
    ?? fieldValue(index, ["source_card", "ref"])
    ?? "",
  );
}

function summaryObject(index) {
  const value = index?.source_card_summary ?? {};
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function textField(index, rootName, summaryName = rootName) {
  return String(index?.[rootName] ?? summaryObject(index)?.[summaryName] ?? "").trim();
}

function domainsField(index) {
  const domains = index?.domains ?? summaryObject(index)?.domains ?? [];
  return Array.isArray(domains) ? domains.map((d) => String(d ?? "").trim()).filter(Boolean) : [];
}

function cappedSummary(index) {
  const raw = index?.source_card_summary ?? "";
  const text = typeof raw === "string" ? raw : JSON.stringify(raw);
  return String(text ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
}

function approvalStatus(index) {
  return textField(index, "approval_status");
}

function isEligibleApproval(index, projectCode, scope) {
  const approval = approvalStatus(index).toLowerCase();
  if (/approved|owner_approved/u.test(approval) || approval.includes("승인")) return true;
  if (scope !== "project") return false;
  const projectToken = String(projectCode ?? "").toLowerCase().replace(/-/g, "_");
  return approval.startsWith("owner_requested_")
    && approval.includes(projectToken)
    && approval.includes("project_scoped_rag");
}

function refScope(sourceRef, projectCode) {
  const normalized = normalizePathRef(sourceRef);
  if (normalized.includes(`/projects/${projectCode}/`)) return "project";
  if (!normalized.includes("/projects/")) return "common";
  return "other";
}

function readIndexFile(file, io) {
  return JSON.parse(io.readFileSync(file, "utf8"));
}

export function listProjectKnowledgeRefs(projectCode, {
  includeCommon = false,
  knowledgeRoot = DEFAULT_KNOWLEDGE_INDEX_ROOT,
  io = DEFAULT_IO,
} = {}) {
  const project = String(projectCode ?? "").trim();
  if (!project) return [];
  try {
    if (!io.existsSync(knowledgeRoot)) return [];
    const refs = [];
    for (const entry of io.readdirSync(knowledgeRoot, { withFileTypes: true })) {
      if (!entry?.isDirectory?.()) continue;
      const file = join(knowledgeRoot, entry.name, "source_text_index.json");
      if (!io.existsSync(file)) continue;
      const index = readIndexFile(file, io);
      if (String(index?.status ?? "").trim().toLowerCase() !== "ready") continue;
      const source_card_ref = sourceCardRef(index);
      const scope = refScope(source_card_ref, project);
      if (scope === "other" || (scope === "common" && !includeCommon)) continue;
      if (!isEligibleApproval(index, project, scope)) continue;
      refs.push({
        index_id: String(index?.index_id ?? entry.name).trim(),
        title: textField(index, "title") || String(index?.index_id ?? entry.name).trim(),
        domains: domainsField(index),
        source_card_ref,
        source_card_summary: cappedSummary(index),
        scope,
      });
    }
    const scopeRank = { project: 0, common: 1 };
    return refs
      .filter((ref) => ref.index_id && ref.source_card_ref)
      .sort((a, b) => (scopeRank[a.scope] ?? 9) - (scopeRank[b.scope] ?? 9)
        || a.title.localeCompare(b.title)
        || a.index_id.localeCompare(b.index_id));
  } catch {
    return [];
  }
}

export function knowledgeContextLines(refs = [], { maxLines = 12 } = {}) {
  return (Array.isArray(refs) ? refs : []).slice(0, maxLines).map((ref) => {
    const title = String(ref?.title || ref?.index_id || "knowledge").trim();
    const domains = Array.isArray(ref?.domains) && ref.domains.length ? ref.domains.join(", ") : ref?.scope || "metadata";
    return `승인된 지식: ${title} (${domains})`;
  });
}

function tokensFor(value) {
  const text = String(value ?? "").normalize("NFKC").toLowerCase();
  const tokens = new Set();
  for (const match of text.matchAll(/[\p{L}\p{N}_-]+/gu)) {
    const token = match[0].trim();
    if (token.length < 2 || STOP_TOKENS.has(token)) continue;
    tokens.add(token);
    for (const extra of SYNONYMS.get(token) ?? []) tokens.add(extra);
  }
  return tokens;
}

function refHaystack(ref) {
  return [
    ref?.title,
    ...(Array.isArray(ref?.domains) ? ref.domains : []),
    ref?.source_card_summary,
  ].join(" ");
}

export function matchingKnowledgeRefs(subjectText, refs = [], { maxMatches = 3 } = {}) {
  const subjectTokens = tokensFor(subjectText);
  if (!subjectTokens.size) return [];
  const out = [];
  for (const ref of Array.isArray(refs) ? refs : []) {
    const haystackTokens = tokensFor(refHaystack(ref));
    let matched = false;
    for (const token of subjectTokens) {
      if (haystackTokens.has(token)) {
        matched = true;
        break;
      }
    }
    if (matched) out.push(ref);
    if (out.length >= maxMatches) break;
  }
  return out;
}

function normalizeUsedRefs(value) {
  if (Array.isArray(value)) return value.map((v) => String(v ?? "").trim()).filter(Boolean);
  if (!value) return [];
  return String(value).split(/[,\s]+/u).map((v) => v.trim()).filter(Boolean);
}

export function applyKnowledgeGroundingToCandidate(candidate, subjectText, refs = []) {
  const next = { ...(candidate ?? {}) };
  const matches = matchingKnowledgeRefs([subjectText, next.title].filter(Boolean).join(" "), refs);
  if (!matches.length) return { candidate: next, matched_refs: [], used_refs: [] };

  const usedRefs = normalizeUsedRefs(next.used_refs);
  const actions = String(next.next_action ?? "").trim() ? [String(next.next_action).trim()] : [];
  for (const ref of matches) {
    const refId = String(ref?.index_id ?? "").trim();
    if (!refId) continue;
    const used = `knowledge:${refId}`;
    if (!usedRefs.includes(used)) usedRefs.push(used);
    const action = `근거 확인: ${refId}`;
    if (!actions.some((existing) => existing.includes(action))) actions.push(action);
  }
  next.used_refs = usedRefs;
  next.next_action = actions.join(" · ");
  return { candidate: next, matched_refs: matches, used_refs: usedRefs.filter((ref) => ref.startsWith("knowledge:")) };
}
