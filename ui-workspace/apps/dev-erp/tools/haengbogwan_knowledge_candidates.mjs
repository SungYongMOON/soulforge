// Metadata-only knowledge/RAG candidate bridge for haengbogwan runs.
// The row is a deferred signal only; it never ingests source text or mutates RAG/wiki.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

import {
  buildKnowledgeRagCandidate,
  validateKnowledgeRagCandidate,
} from "../../../../guild_hall/knowledge_access/knowledge_rag_candidate_ledger.mjs";

const PROJECT_RE = /^P\d{2}-\d{3}$/;
const SOURCE_SUMMARY_REL = "project_context/summaries/project_summary.md";

function normalizeProjectCode(value) {
  const project = String(value ?? "").trim();
  if (!PROJECT_RE.test(project)) throw new Error(`invalid_project_code:${project || "(empty)"}`);
  return project;
}

function monthStamp(value) {
  const raw = String(value ?? "");
  const match = raw.match(/^(\d{4})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}`;
  return new Date().toISOString().slice(0, 7);
}

function isInside(parent, child) {
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !rel.includes(`..${sep}`));
}

function workmetaIsDefaultRepoWorkmeta(repoRoot, workmetaRoot) {
  return resolve(workmetaRoot) === resolve(repoRoot, "_workmeta");
}

function candidateLedgerRef(projectCode, generatedAt) {
  return `_workmeta/${projectCode}/knowledge_rag_candidate_ledger/events/${monthStamp(generatedAt)}.jsonl`;
}

function sourceContextRef(projectCode) {
  return `_workmeta/${projectCode}/${SOURCE_SUMMARY_REL}`;
}

function safeCount(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function contextCounts(contextReport = {}) {
  const total = contextReport.total_counts || {};
  const incoming = contextReport.incoming_counts || {};
  return {
    acceptedEvents: safeCount(contextReport.accepted_event_count),
    openReviews: safeCount(total.review_queue ?? incoming.review_queue),
    branches: safeCount(total.branch_summaries),
    sources: safeCount(total.sources ?? incoming.sources),
  };
}

function readCandidateIds(ledgerPath) {
  const ids = new Set();
  if (!existsSync(ledgerPath)) return ids;
  const lines = readFileSync(ledgerPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line);
      if (typeof row.candidate_id === "string") ids.add(row.candidate_id);
    } catch {
      // Validation owns malformed-row reporting. Duplicate scan should stay best-effort.
    }
  }
  return ids;
}

function appendCandidateIfMissing(ledgerPath, candidate) {
  const ids = readCandidateIds(ledgerPath);
  if (ids.has(candidate.candidate_id)) {
    return { appended: false, skipped_reason: "duplicate_candidate_id" };
  }
  mkdirSync(dirname(ledgerPath), { recursive: true });
  appendFileSync(ledgerPath, `${JSON.stringify(candidate)}\n`, "utf8");
  return { appended: true, skipped_reason: "" };
}

export function buildProjectContextKnowledgeCandidate({
  projectCode,
  contextReport,
  generatedAt,
} = {}) {
  const project = normalizeProjectCode(projectCode);
  const counts = contextCounts(contextReport);
  if (!counts.acceptedEvents) return null;
  const ref = sourceContextRef(project);
  return buildKnowledgeRagCandidate({
    projectCode: project,
    createdAt: generatedAt,
    sourceContextRef: ref,
    candidateKind: "knowledge_trigger",
    shortReason: [
      `Haengbogwan project_context updated with ${counts.acceptedEvents} metadata events`,
      `${counts.openReviews} open review rows`,
      `${counts.branches} branches`,
      "review whether branches should become wiki/RAG sourcebound candidates",
    ].join("; "),
    suggestedRoute: "owner_decision_needed",
    claimCeiling: "observed",
    missingInputs: ["owner_decision_ref", "sourcebound_packet_ref", "knowledge_source_card"],
    ownerQuestion: `Which ${project} project_context branches should be promoted to sourcebound wiki/RAG review, and which should remain task-only?`,
    repeatedUseSignal: {
      count: Math.max(1, counts.openReviews || counts.acceptedEvents),
      sourceEventCount: counts.sources || counts.acceptedEvents,
      lastSeenAt: generatedAt,
      signalRef: ref,
    },
  });
}

export function runProjectContextKnowledgeCandidateUpdate({
  repoRoot,
  workmetaRoot,
  projectCode,
  contextReport,
  generatedAt,
  apply = false,
} = {}) {
  const repo = resolve(repoRoot || process.cwd());
  const workmeta = resolve(workmetaRoot || join(repo, "_workmeta"));
  const base = {
    apply: Boolean(apply),
    invoked: false,
    skipped_reason: "",
    candidate_count: 0,
    appended_count: 0,
    skipped_duplicate_count: 0,
    ledger_ref: "",
    source_context_ref: "",
    candidate_ids: [],
    boundary: {
      metadata_only: true,
      source_payload_read: false,
      raw_payload_copied: false,
      rag_ingestion_executed: false,
      wiki_or_rag_mutated: false,
    },
  };

  if (!contextReport?.apply) {
    return { ...base, skipped_reason: "context_not_applied" };
  }
  if (!workmetaIsDefaultRepoWorkmeta(repo, workmeta)) {
    return { ...base, skipped_reason: "workmeta_root_not_repo_default" };
  }

  const candidate = buildProjectContextKnowledgeCandidate({ projectCode, contextReport, generatedAt });
  if (!candidate) return { ...base, skipped_reason: "no_context_events" };
  const validation = validateKnowledgeRagCandidate(candidate);
  if (!validation.ok) {
    return { ...base, skipped_reason: `invalid_candidate:${validation.errors.join("+")}` };
  }

  const ledgerRef = candidateLedgerRef(candidate.project_code, generatedAt);
  const ledgerPath = resolve(repo, ledgerRef);
  if (!isInside(repo, ledgerPath)) {
    return { ...base, skipped_reason: "candidate_ledger_path_escape" };
  }

  if (!apply) {
    return {
      ...base,
      invoked: true,
      candidate_count: 1,
      ledger_ref: ledgerRef,
      source_context_ref: candidate.source_context_ref,
      candidate_ids: [candidate.candidate_id],
    };
  }

  const appendResult = appendCandidateIfMissing(ledgerPath, candidate);
  return {
    ...base,
    invoked: true,
    candidate_count: 1,
    appended_count: appendResult.appended ? 1 : 0,
    skipped_duplicate_count: appendResult.appended ? 0 : 1,
    skipped_reason: appendResult.skipped_reason,
    ledger_ref: ledgerRef,
    source_context_ref: candidate.source_context_ref,
    candidate_ids: [candidate.candidate_id],
  };
}
