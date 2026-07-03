import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  validateKnowledgeRagCandidate,
} from "../knowledge_access/knowledge_rag_candidate_ledger.mjs";
import { appendJsonl, normalizeRepoPath, pathExists, readJson, writeJson } from "../shared/io.mjs";
import {
  loadKnowledgeSourceCard,
  loadSourceTextIndex,
  validateKnowledgeSourceCard,
  validateSourceTextIndex,
  writeSourceTextIndex,
} from "./source_text_index.mjs";
import { validateSourceSyncReadyRef } from "./source_sync_ready_manifest.mjs";

export const KNOWLEDGE_APPROVED_BUILD_RUN_SCHEMA_VERSION = "soulforge.knowledge_approved_build_run.v0";
export const KNOWLEDGE_APPROVED_BUILD_EVENT_SCHEMA_VERSION = "soulforge.knowledge_approved_build_event.v0";
export const KNOWLEDGE_WEEKLY_TRIAGE_REPORT_SCHEMA_VERSION = "soulforge.knowledge_weekly_triage_report.v0";
export const KNOWLEDGE_PIPELINE_AUTOMATION_RUNNER_ID = "guild_hall.rag.knowledge_pipeline_automation.v0";

const DEFAULT_SYSTEM_LEDGER_ROOT = "_workmeta/system/knowledge_rag_candidate_ledger/events";
const DEFAULT_BUILD_EVENT_ROOT = "_workmeta/system/knowledge_pipeline_automation/build_events";
const DEFAULT_APPROVED_BUILD_REPORT_ROOT = "_workmeta/system/reports/rag/approved_build_runs";
const DEFAULT_WEEKLY_TRIAGE_ROOT = "_workmeta/system/reports/knowledge_triage";
const DEFAULT_INDEX_ROOT = "_workspaces/knowledge/rag/indexes_local/source_text_indexes";
const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,180}$/;
const CANDIDATE_ID_PATTERN = /^knowledge_rag_candidate_[a-f0-9]{16}$/;
const SECOND_PRECISION_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const RAW_PAYLOAD_EXTENSION_PATTERN =
  /\.(?:msg|eml|pst|ost|doc|docx|xls|xlsx|ppt|pptx|pdf|hwp|hwpx|zip|7z|rar|tar|tgz|gz|bz2|xz|wav|mp3|mp4|m4a|aac|flac|ogg)(?:$|[?#\s])/i;
const SECRET_LIKE_SEGMENT_PATTERN =
  /(^|[./_-])(?:\.env|auth|authorization|bearer|cookie|credential|credentials|passwd|password|private_key|refresh_token|secret|session|token)([./_-]|$)/iu;

export async function buildKnowledgeApprovedBuildRun(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const now = normalizeNow(options.now, options.date);
  const dateId = now.slice(0, 10).replaceAll("-", "");
  const runId = normalizeSafeId(options.runId ?? `knowledge_approved_build_${dateId}`);
  const mode = options.write === true ? "write" : "dry_run";
  const candidateSourceCardRefs = parseKeyValueMap(options.candidateSourceCardRefs ?? options.candidateSourceCardRef);
  const candidateIndexIds = parseKeyValueMap(options.candidateIndexIds ?? options.candidateIndexId);
  const ledgerRefs = await resolveCandidateLedgerRefs({
    repoRoot,
    ledgerRefs: options.ledgerRefs ?? options.ledgerRef,
    ledgerRootRefs: options.ledgerRootRefs ?? options.ledgerRootRef ?? DEFAULT_SYSTEM_LEDGER_ROOT,
  });
  const candidates = await loadCandidateLedgerProjection({ repoRoot, ledgerRefs });
  const buildEventLedgerRef = safeBuildEventLedgerRef(
    options.buildEventLedgerRef ?? path.posix.join(DEFAULT_BUILD_EVENT_ROOT, `${now.slice(0, 7)}.jsonl`),
  );
  const priorEvents = await loadBuildEvents({ repoRoot, buildEventLedgerRefs: [buildEventLedgerRef] });
  const accepted = candidates.rows.filter((candidate) => candidate.status === "accepted_for_review");
  const rows = [];
  const events = [];

  for (const candidate of accepted) {
    const row = await buildApprovedCandidateRow({
      repoRoot,
      candidate,
      now,
      mode,
      candidateSourceCardRefs,
      candidateIndexIds,
      priorEvents,
      write: options.write === true,
      stableMs: options.stableMs,
      maxChars: options.maxChars,
    });
    rows.push(row);
    events.push(row.event);
  }

  const summary = summarizeApprovedBuildRows({ candidateRows: candidates.rows, rows });
  const run = {
    schema_version: KNOWLEDGE_APPROVED_BUILD_RUN_SCHEMA_VERSION,
    kind: "knowledge_approved_build_run",
    run_id: runId,
    generated_at_utc: now,
    runner_id: KNOWLEDGE_PIPELINE_AUTOMATION_RUNNER_ID,
    mode,
    status: approvedBuildRunStatus({ rows, mode }),
    claim_ceiling: "validated_private",
    candidate_ledger_refs: ledgerRefs,
    build_event_ledger_ref: buildEventLedgerRef,
    state_transition_policy: stateTransitionPolicy(),
    summary,
    rows: rows.map(({ event, ...row }) => row),
    validation: {
      status: candidates.issues.length === 0 ? "pass" : "warning",
      candidate_issues: candidates.issues,
    },
    boundary: automationBoundary({ sourceTextIndexBuildAllowed: options.write === true }),
  };
  return {
    run,
    events,
    rendered: {
      markdown: renderKnowledgeApprovedBuildRunMarkdown(run),
    },
  };
}

export async function writeKnowledgeApprovedBuildRun(options = {}) {
  const built = await buildKnowledgeApprovedBuildRun({ ...options, write: true });
  const validation = validateKnowledgeApprovedBuildRun(built.run);
  if (validation.status !== "pass") {
    throw new Error(`approved build run validation failed: ${validation.errors.join("; ")}`);
  }
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const outputRootRef = safeRepoRelativeRef(options.outputRootRef ?? DEFAULT_APPROVED_BUILD_REPORT_ROOT);
  const outputDirRef = safeRepoRelativeRef(path.posix.join(outputRootRef, built.run.run_id));
  const runRef = path.posix.join(outputDirRef, "approved_build_run.json");
  const reportRef = path.posix.join(outputDirRef, "approved_build_run.md");
  for (const event of built.events) {
    await appendJsonl(path.join(repoRoot, built.run.build_event_ledger_ref), event);
  }
  await writeJson(path.join(repoRoot, runRef), built.run);
  await fs.writeFile(path.join(repoRoot, reportRef), built.rendered.markdown, "utf8");
  return {
    status: "written",
    run_ref: runRef,
    report_ref: reportRef,
    build_event_ledger_ref: built.run.build_event_ledger_ref,
    events_written: built.events.length,
    summary: built.run.summary,
  };
}

export async function loadKnowledgeApprovedBuildRun({ repoRoot = process.cwd(), runRef } = {}) {
  if (!runRef) throw new Error("--run-ref requires a value");
  return readJson(path.join(path.resolve(repoRoot), safeRepoRelativeRef(runRef)));
}

export function validateKnowledgeApprovedBuildRun(run) {
  const errors = [];
  if (run?.schema_version !== KNOWLEDGE_APPROVED_BUILD_RUN_SCHEMA_VERSION) errors.push("schema_version_mismatch");
  if (run?.kind !== "knowledge_approved_build_run") errors.push("kind_mismatch");
  if (!isSafeId(run?.run_id)) errors.push("run_id_unsafe");
  if (!SECOND_PRECISION_UTC_PATTERN.test(String(run?.generated_at_utc ?? ""))) errors.push("generated_at_utc_invalid");
  if (!["dry_run_complete", "write_complete", "write_complete_with_blockers"].includes(String(run?.status ?? ""))) {
    errors.push("status_unsupported");
  }
  if (run?.state_transition_policy?.owner_approval_automated !== false) {
    errors.push("owner_approval_must_not_be_automated");
  }
  if (run?.state_transition_policy?.source_card_owner_approval_required_for_index_write !== true) {
    errors.push("source_card_owner_approval_required_for_index_write");
  }
  if (run?.boundary?.owner_approval_mutated !== false) errors.push("boundary_owner_approval_mutated_must_be_false");
  if (run?.boundary?.source_payloads_persisted_to_workmeta !== false) {
    errors.push("boundary_source_payloads_persisted_to_workmeta_must_be_false");
  }
  if (!Array.isArray(run?.rows)) errors.push("rows_must_be_array");
  for (const row of run?.rows ?? []) {
    if (!CANDIDATE_ID_PATTERN.test(String(row.candidate_id ?? ""))) errors.push("row_candidate_id_invalid");
    if (!["approved_pending_index", "indexed", "index_skipped_existing", "blocked_after_acceptance"].includes(row.projected_state)) {
      errors.push(`row_projected_state_unsupported:${row.candidate_id ?? "unknown"}`);
    }
    if (JSON.stringify(row).match(RAW_PAYLOAD_EXTENSION_PATTERN)) {
      errors.push(`row_raw_payload_ref_blocked:${row.candidate_id ?? "unknown"}`);
    }
  }
  return {
    schema_version: "soulforge.knowledge_approved_build_run_validation.v0",
    kind: "knowledge_approved_build_run_validation",
    status: errors.length === 0 ? "pass" : "fail",
    error_count: errors.length,
    errors: [...new Set(errors)].sort(),
  };
}

export async function buildKnowledgeWeeklyTriageReport(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const now = normalizeNow(options.now, options.date);
  const dateId = now.slice(0, 10).replaceAll("-", "");
  const reportId = normalizeSafeId(options.reportId ?? `knowledge_triage_${dateId}`);
  const ledgerRefs = await resolveCandidateLedgerRefs({
    repoRoot,
    ledgerRefs: options.ledgerRefs ?? options.ledgerRef,
    ledgerRootRefs: options.ledgerRootRefs ?? options.ledgerRootRef ?? DEFAULT_SYSTEM_LEDGER_ROOT,
  });
  const candidates = await loadCandidateLedgerProjection({ repoRoot, ledgerRefs });
  const buildEventLedgerRefs = await resolveOptionalBuildEventLedgerRefs({
    repoRoot,
    buildEventLedgerRefs: options.buildEventLedgerRefs ?? options.buildEventLedgerRef,
    buildEventRootRefs: options.buildEventRootRefs ?? options.buildEventRootRef,
  });
  const buildEvents = await loadBuildEvents({ repoRoot, buildEventLedgerRefs });
  const latestEvents = latestBuildEventByCandidate(buildEvents.rows);
  const items = candidates.rows
    .filter((candidate) => !["rejected", "held"].includes(candidate.status))
    .map((candidate) => triageItem({ candidate, now, latestEvent: latestEvents.get(candidate.candidate_id) }))
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.candidate_id.localeCompare(right.candidate_id);
    });
  const topLimit = numericOption(options.top, 10);
  const topItems = items.slice(0, topLimit);
  const report = {
    schema_version: KNOWLEDGE_WEEKLY_TRIAGE_REPORT_SCHEMA_VERSION,
    kind: "knowledge_weekly_triage_report",
    report_id: reportId,
    generated_at_utc: now,
    runner_id: KNOWLEDGE_PIPELINE_AUTOMATION_RUNNER_ID,
    status: candidates.issues.length === 0 && buildEvents.issues.length === 0 ? "ready" : "ready_with_warnings",
    claim_ceiling: "observed",
    candidate_ledger_refs: ledgerRefs,
    build_event_ledger_refs: buildEventLedgerRefs,
    summary: summarizeTriageItems({ allCandidates: candidates.rows, items, topItems }),
    scoring_policy: {
      status_need_weight: true,
      age_days_capped_at_30: true,
      candidate_kind_weight: true,
      suggested_route_weight: true,
      missing_inputs_are_visible_not_authority: true,
    },
    top_items: topItems,
    open_items: items.filter((item) => item.current_status === "open"),
    owner_one_click_procedure: buildOwnerOneClickProcedure(topItems, now),
    validation: {
      status: candidates.issues.length === 0 && buildEvents.issues.length === 0 ? "pass" : "warning",
      candidate_issues: candidates.issues,
      build_event_issues: buildEvents.issues,
    },
    boundary: automationBoundary({ sourceTextIndexBuildAllowed: false }),
  };
  return {
    report,
    rendered: {
      markdown: renderKnowledgeWeeklyTriageMarkdown(report),
    },
  };
}

export async function writeKnowledgeWeeklyTriageReport(options = {}) {
  const built = await buildKnowledgeWeeklyTriageReport(options);
  const validation = validateKnowledgeWeeklyTriageReport(built.report);
  if (validation.status !== "pass") {
    throw new Error(`weekly triage validation failed: ${validation.errors.join("; ")}`);
  }
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const outputRootRef = safeRepoRelativeRef(options.outputRootRef ?? DEFAULT_WEEKLY_TRIAGE_ROOT);
  const outputDirRef = safeRepoRelativeRef(path.posix.join(outputRootRef, built.report.report_id));
  const reportJsonRef = path.posix.join(outputDirRef, "weekly_triage_report.json");
  const reportMdRef = path.posix.join(outputDirRef, "weekly_triage_report.md");
  await writeJson(path.join(repoRoot, reportJsonRef), built.report);
  await fs.writeFile(path.join(repoRoot, reportMdRef), built.rendered.markdown, "utf8");
  return {
    status: "written",
    report_ref: reportJsonRef,
    report_md_ref: reportMdRef,
    summary: built.report.summary,
  };
}

export async function loadKnowledgeWeeklyTriageReport({ repoRoot = process.cwd(), reportRef } = {}) {
  if (!reportRef) throw new Error("--report-ref requires a value");
  return readJson(path.join(path.resolve(repoRoot), safeRepoRelativeRef(reportRef)));
}

export function validateKnowledgeWeeklyTriageReport(report) {
  const errors = [];
  if (report?.schema_version !== KNOWLEDGE_WEEKLY_TRIAGE_REPORT_SCHEMA_VERSION) errors.push("schema_version_mismatch");
  if (report?.kind !== "knowledge_weekly_triage_report") errors.push("kind_mismatch");
  if (!isSafeId(report?.report_id)) errors.push("report_id_unsafe");
  if (!SECOND_PRECISION_UTC_PATTERN.test(String(report?.generated_at_utc ?? ""))) errors.push("generated_at_utc_invalid");
  if (!Array.isArray(report?.top_items)) errors.push("top_items_must_be_array");
  if (!Array.isArray(report?.open_items)) errors.push("open_items_must_be_array");
  if (report?.boundary?.owner_approval_mutated !== false) errors.push("owner_approval_must_not_be_mutated");
  if (report?.boundary?.source_text_index_built !== false) errors.push("triage_must_not_build_indexes");
  const serialized = JSON.stringify(report);
  if (serialized.match(RAW_PAYLOAD_EXTENSION_PATTERN)) errors.push("raw_payload_ref_blocked");
  if (serialized.match(SECRET_LIKE_SEGMENT_PATTERN)) errors.push("secret_like_segment_blocked");
  return {
    schema_version: "soulforge.knowledge_weekly_triage_report_validation.v0",
    kind: "knowledge_weekly_triage_report_validation",
    status: errors.length === 0 ? "pass" : "fail",
    error_count: errors.length,
    errors: [...new Set(errors)].sort(),
  };
}

function stateTransitionPolicy() {
  return {
    candidate_rows_are_append_only: true,
    owner_approval_automated: false,
    owner_rejection_or_hold_automated: false,
    public_canon_promotion_automated: false,
    source_card_owner_approval_required_for_index_write: true,
    post_accepted_projection_events: [
      "approved_candidate_observed",
      "index_build_planned",
      "index_build_written",
      "index_build_skipped_existing",
      "index_build_blocked",
    ],
    projected_states_after_accepted_for_review: [
      "approved_pending_index",
      "indexed",
      "index_skipped_existing",
      "blocked_after_acceptance",
    ],
  };
}

async function buildApprovedCandidateRow({
  repoRoot,
  candidate,
  now,
  mode,
  candidateSourceCardRefs,
  candidateIndexIds,
  write,
  stableMs,
  maxChars,
}) {
  const sourceCardRef = candidateSourceCardRefs.get(candidate.candidate_id) ?? null;
  const indexId = normalizeSafeId(candidateIndexIds.get(candidate.candidate_id) ?? indexIdForSourceCardRef(sourceCardRef, candidate));
  const sourceTextIndexRef = path.posix.join(DEFAULT_INDEX_ROOT, indexId, "source_text_index.json");
  const commands = [];
  let eventType = "index_build_blocked";
  let projectedState = "blocked_after_acceptance";
  let blockers = [];
  let sourceCardSummary = null;
  let indexSummary = {
    index_id: indexId,
    source_text_index_ref: sourceTextIndexRef,
    index_status: "not_run",
    chunk_count: 0,
  };

  if (!sourceCardRef) {
    blockers = ["source_card_ref_missing"];
  } else {
    const sourceCard = await loadKnowledgeSourceCard({ repoRoot, sourceCardRef });
    const sourceCardValidation = validateKnowledgeSourceCard(sourceCard);
    sourceCardSummary = {
      source_id: sourceCard.source_id ?? null,
      title: sourceCard.title ?? sourceCard.source_id ?? null,
      approval_status: sourceCard.approval_status ?? null,
      source_sync_ready_ref: sourceCard.source_sync_ready_ref ?? null,
      source_ref: sourceCardSourceRef(sourceCard),
      owner_approved_for_index: sourceCardOwnerApprovedForIndex(sourceCard),
    };
    if (sourceCardValidation.status !== "pass") {
      blockers = sourceCardValidation.blockers.map((blocker) => `source_card:${blocker}`);
    } else if (!sourceCardOwnerApprovedForIndex(sourceCard)) {
      blockers = ["source_card_owner_approval_missing"];
    } else {
      const readyRef = sourceCard.source_sync_ready_ref ?? null;
      const readyValidation = readyRef
        ? await validateSourceSyncReadyRef({
          repoRoot,
          readyRef,
          sourceCardRef,
          sourceTextRef: sourceCardSourceRef(sourceCard),
          stableMs,
        })
        : { status: "not_required", blockers: [] };
      if (readyValidation.status !== "pass" && readyValidation.status !== "not_required") {
        blockers = (readyValidation.blockers ?? ["source_sync_ready_blocked"]).map((blocker) => `ready:${blocker}`);
      } else if (await pathExists(path.join(repoRoot, sourceTextIndexRef))) {
        const existing = await loadSourceTextIndex({ repoRoot, sourceTextIndexRef });
        const validation = validateSourceTextIndex(existing);
        if (validation.status === "pass") {
          eventType = "index_build_skipped_existing";
          projectedState = "index_skipped_existing";
          indexSummary = {
            index_id: existing.index_id,
            source_text_index_ref: sourceTextIndexRef,
            index_status: existing.status,
            chunk_count: existing.counts?.chunk_count ?? 0,
            validation_status: validation.status,
          };
        } else {
          blockers = validation.blockers.map((blocker) => `existing_index:${blocker}`);
        }
      } else if (!write) {
        eventType = "index_build_planned";
        projectedState = "approved_pending_index";
        commands.push(
          `npm.cmd run guild-hall:rag -- source-text-index --write --source-card-ref ${sourceCardRef} --index-id ${indexId}`,
        );
      } else {
        const written = await writeSourceTextIndex({
          repoRoot,
          sourceCardRef,
          indexId,
          stableMs,
          maxChars,
          now,
        });
        const index = await loadSourceTextIndex({ repoRoot, sourceTextIndexRef: written.source_text_index_ref });
        const validation = validateSourceTextIndex(index);
        if (validation.status === "pass") {
          eventType = "index_build_written";
          projectedState = "indexed";
          indexSummary = {
            index_id: written.index_id,
            source_text_index_ref: written.source_text_index_ref,
            index_status: written.index_status,
            chunk_count: written.chunk_count,
            validation_status: validation.status,
          };
        } else {
          blockers = validation.blockers.map((blocker) => `written_index:${blocker}`);
        }
      }
    }
  }

  const event = buildApprovedBuildEvent({
    now,
    candidate,
    eventType,
    projectedState,
    sourceCardRef,
    sourceCardSummary,
    indexSummary,
    blockers,
    mode,
  });

  return {
    candidate_id: candidate.candidate_id,
    project_code: candidate.project_code,
    candidate_status: candidate.status,
    source_context_ref: candidate.source_context_ref,
    short_reason: candidate.short_reason,
    source_card_ref: sourceCardRef,
    source_card_summary: sourceCardSummary,
    projected_state: projectedState,
    event_type: eventType,
    blockers,
    index: indexSummary,
    commands,
    event,
  };
}

function buildApprovedBuildEvent({ now, candidate, eventType, projectedState, sourceCardRef, sourceCardSummary, indexSummary, blockers, mode }) {
  const stable = {
    candidate_id: candidate.candidate_id,
    event_type: eventType,
    projected_state: projectedState,
    source_card_ref: sourceCardRef,
    index_id: indexSummary.index_id,
    generated_at_utc: now,
  };
  return {
    schema_version: KNOWLEDGE_APPROVED_BUILD_EVENT_SCHEMA_VERSION,
    kind: "knowledge_approved_build_event",
    event_id: `knowledge_approved_build_event_${stableHash(stable).slice(0, 16)}`,
    event_at_utc: now,
    runner_id: KNOWLEDGE_PIPELINE_AUTOMATION_RUNNER_ID,
    mode,
    candidate_id: candidate.candidate_id,
    project_code: candidate.project_code,
    candidate_status_at_build: candidate.status,
    event_type: eventType,
    projected_state: projectedState,
    source_card_ref: sourceCardRef,
    source_card_summary: sourceCardSummary,
    index: indexSummary,
    blockers,
    claim_ceiling: "validated_private",
    boundary: automationBoundary({ sourceTextIndexBuildAllowed: eventType === "index_build_written" }),
  };
}

async function loadCandidateLedgerProjection({ repoRoot, ledgerRefs }) {
  const latest = new Map();
  const issues = [];
  let rowOrder = 0;
  for (const ledgerRef of ledgerRefs) {
    const raw = await fs.readFile(path.join(repoRoot, ledgerRef), "utf8");
    const lines = raw.split(/\r?\n/u);
    for (let index = 0; index < lines.length; index += 1) {
      const trimmed = lines[index].trim();
      if (!trimmed) continue;
      rowOrder += 1;
      try {
        const candidate = JSON.parse(trimmed);
        const validation = validateKnowledgeRagCandidate(candidate);
        if (!validation.ok) {
          issues.push({ ledger_ref: ledgerRef, line: index + 1, candidate_id: safeCandidateId(candidate?.candidate_id), errors: validation.errors });
          continue;
        }
        latest.set(candidate.candidate_id, {
          ...candidate,
          ledger_ref: ledgerRef,
          ledger_line: index + 1,
          projection_order: rowOrder,
        });
      } catch {
        issues.push({ ledger_ref: ledgerRef, line: index + 1, errors: ["invalid_json"] });
      }
    }
  }
  return {
    rows: [...latest.values()].sort((a, b) => a.projection_order - b.projection_order),
    issues,
  };
}

async function resolveCandidateLedgerRefs({ repoRoot, ledgerRefs, ledgerRootRefs }) {
  const explicit = normalizeList(ledgerRefs).map((ref) => safeCandidateLedgerRef(ref));
  const roots = normalizeList(ledgerRootRefs);
  const fromRoots = [];
  for (const rootRefRaw of roots) {
    const rootRef = safeRepoRelativeRef(rootRefRaw);
    const rootPath = path.join(repoRoot, rootRef);
    if (!(await pathExists(rootPath))) continue;
    for (const fileRef of await listFiles(rootPath, repoRoot)) {
      if (fileRef.endsWith(".jsonl")) fromRoots.push(safeCandidateLedgerRef(fileRef));
    }
  }
  return [...new Set([...explicit, ...fromRoots])].sort();
}

async function resolveOptionalBuildEventLedgerRefs({ repoRoot, buildEventLedgerRefs, buildEventRootRefs }) {
  const explicit = normalizeList(buildEventLedgerRefs).map((ref) => safeBuildEventLedgerRef(ref));
  const roots = normalizeList(buildEventRootRefs);
  const fromRoots = [];
  for (const rootRefRaw of roots) {
    const rootRef = safeRepoRelativeRef(rootRefRaw);
    const rootPath = path.join(repoRoot, rootRef);
    if (!(await pathExists(rootPath))) continue;
    for (const fileRef of await listFiles(rootPath, repoRoot)) {
      if (fileRef.endsWith(".jsonl")) fromRoots.push(safeBuildEventLedgerRef(fileRef));
    }
  }
  return [...new Set([...explicit, ...fromRoots])].sort();
}

async function loadBuildEvents({ repoRoot, buildEventLedgerRefs }) {
  const rows = [];
  const issues = [];
  for (const ledgerRef of buildEventLedgerRefs) {
    const filePath = path.join(repoRoot, ledgerRef);
    if (!(await pathExists(filePath))) continue;
    const raw = await fs.readFile(filePath, "utf8");
    for (const [index, line] of raw.split(/\r?\n/u).entries()) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const row = JSON.parse(trimmed);
        if (row.schema_version !== KNOWLEDGE_APPROVED_BUILD_EVENT_SCHEMA_VERSION) {
          issues.push({ ledger_ref: ledgerRef, line: index + 1, errors: ["build_event_schema_version_mismatch"] });
          continue;
        }
        rows.push({ ...row, ledger_ref: ledgerRef, ledger_line: index + 1 });
      } catch {
        issues.push({ ledger_ref: ledgerRef, line: index + 1, errors: ["invalid_json"] });
      }
    }
  }
  return { rows, issues };
}

function latestBuildEventByCandidate(rows) {
  const latest = new Map();
  for (const row of rows) {
    const prev = latest.get(row.candidate_id);
    if (!prev || String(row.event_at_utc ?? "").localeCompare(String(prev.event_at_utc ?? "")) > 0) {
      latest.set(row.candidate_id, row);
    }
  }
  return latest;
}

function triageItem({ candidate, now, latestEvent }) {
  const ageDays = Math.max(0, Math.floor((Date.parse(now) - Date.parse(candidate.created_at)) / 86400000));
  const currentStatus = candidate.status ?? "unknown";
  const action = currentStatus === "accepted_for_review"
    ? acceptedCandidateAction(latestEvent)
    : currentStatus === "open"
      ? "owner_one_click_decision"
      : "monitor";
  const score = triageScore({ candidate, ageDays, action });
  return {
    candidate_id: candidate.candidate_id,
    project_code: candidate.project_code,
    current_status: currentStatus,
    action,
    score,
    age_days: ageDays,
    candidate_kind: candidate.candidate_kind,
    suggested_route: candidate.suggested_route,
    source_context_ref: candidate.source_context_ref,
    short_reason: candidate.short_reason,
    missing_inputs: candidate.missing_inputs ?? [],
    owner_question: candidate.owner_question ?? null,
    latest_build_event: latestEvent ? {
      event_type: latestEvent.event_type,
      projected_state: latestEvent.projected_state,
      event_at_utc: latestEvent.event_at_utc,
      index_ref: latestEvent.index?.source_text_index_ref ?? null,
      blockers: latestEvent.blockers ?? [],
    } : null,
    owner_one_click: ownerOneClickCommand(candidate, now),
  };
}

function acceptedCandidateAction(latestEvent) {
  if (!latestEvent) return "run_approved_build_runner";
  if (["indexed", "index_skipped_existing"].includes(latestEvent.projected_state)) return "index_ready";
  if (latestEvent.projected_state === "blocked_after_acceptance") return "repair_build_blocker";
  return "run_approved_build_runner";
}

function triageScore({ candidate, ageDays, action }) {
  const actionWeight = {
    owner_one_click_decision: 40,
    run_approved_build_runner: 45,
    repair_build_blocker: 35,
    index_ready: 10,
    monitor: 5,
  }[action] ?? 5;
  const kindWeight = {
    completion_knowledge: 35,
    knowledge_trigger: 30,
    owner_decision_gap: 25,
    rag_readiness_gap: 22,
    sourcebound_gap: 22,
    manual_candidate: 18,
    repeated_use_signal: 18,
    ontology_pattern: 15,
  }[candidate.candidate_kind] ?? 10;
  const routeWeight = {
    sourcebound_review_candidate: 25,
    rag_ingestion_candidate: 22,
    owner_decision_needed: 20,
    ontology_candidate: 14,
    metadata_only_record: 8,
    reject_or_hold: 0,
  }[candidate.suggested_route] ?? 5;
  const ageWeight = Math.min(ageDays, 30);
  const missingInputsWeight = Math.min((candidate.missing_inputs ?? []).length * 2, 12);
  return actionWeight + kindWeight + routeWeight + ageWeight + missingInputsWeight;
}

function ownerOneClickCommand(candidate, now) {
  if (candidate.status !== "open") return null;
  const ledgerRef = monthlyLedgerRef(candidate.project_code, now);
  const parts = [
    "npm.cmd run guild-hall:knowledge-access -- candidate-ledger-append",
    `--ledger-ref ${ledgerRef}`,
    `--candidate-id ${candidate.candidate_id}`,
    `--created-at ${now}`,
    `--project-code ${candidate.project_code}`,
    `--source-context-ref ${candidate.source_context_ref}`,
    `--candidate-kind ${candidate.candidate_kind}`,
    `--short-reason ${quoteCli(candidate.short_reason)}`,
    `--suggested-route ${candidate.suggested_route}`,
    `--claim-ceiling ${candidate.claim_ceiling}`,
    "--status accepted_for_review",
    ...((candidate.missing_inputs ?? []).map((item) => `--missing-input ${quoteCli(item)}`)),
    ...(candidate.owner_question ? [`--owner-question ${quoteCli(candidate.owner_question)}`] : []),
    "--json",
  ];
  return parts.join(" ");
}

function buildOwnerOneClickProcedure(items, now) {
  return {
    owner_authority_required: true,
    automation_does_not_approve: true,
    instruction: "Pick one open candidate and run its owner_one_click command. The next approved-build-runner batch handles index/build events only.",
    ledger_month_ref_hint: monthlyLedgerRef("P26-014", now),
    commands: items.filter((item) => item.owner_one_click).map((item) => ({
      candidate_id: item.candidate_id,
      project_code: item.project_code,
      command: item.owner_one_click,
    })),
  };
}

function monthlyLedgerRef(projectCode, now) {
  return `_workmeta/${projectCode}/knowledge_rag_candidate_ledger/events/${now.slice(0, 7)}.jsonl`;
}

function summarizeApprovedBuildRows({ candidateRows, rows }) {
  const acceptedCandidateCount = candidateRows.filter((candidate) => candidate.status === "accepted_for_review").length;
  return {
    total_candidate_count: candidateRows.length,
    accepted_for_review_count: acceptedCandidateCount,
    planned_count: rows.filter((row) => row.projected_state === "approved_pending_index").length,
    indexed_count: rows.filter((row) => row.projected_state === "indexed").length,
    skipped_existing_count: rows.filter((row) => row.projected_state === "index_skipped_existing").length,
    blocked_after_acceptance_count: rows.filter((row) => row.projected_state === "blocked_after_acceptance").length,
  };
}

function summarizeTriageItems({ allCandidates, items, topItems }) {
  return {
    total_candidate_count: allCandidates.length,
    actionable_candidate_count: items.length,
    open_candidate_count: items.filter((item) => item.current_status === "open").length,
    accepted_for_review_count: items.filter((item) => item.current_status === "accepted_for_review").length,
    top_item_count: topItems.length,
    p26_014_open_candidate_count: items.filter((item) => item.project_code === "P26-014" && item.current_status === "open").length,
    action_counts: countBy(items, "action"),
  };
}

function approvedBuildRunStatus({ rows, mode }) {
  if (mode === "dry_run") return "dry_run_complete";
  return rows.some((row) => row.projected_state === "blocked_after_acceptance")
    ? "write_complete_with_blockers"
    : "write_complete";
}

function renderKnowledgeApprovedBuildRunMarkdown(run) {
  return [
    `# Knowledge Approved Build Run - ${run.generated_at_utc.slice(0, 10)}`,
    "",
    `Status: ${run.status}`,
    `Mode: ${run.mode}`,
    "Claim ceiling: validated_private",
    "",
    "## Summary",
    "",
    `- accepted_for_review: ${run.summary.accepted_for_review_count}`,
    `- planned: ${run.summary.planned_count}`,
    `- indexed: ${run.summary.indexed_count}`,
    `- skipped existing: ${run.summary.skipped_existing_count}`,
    `- blocked after acceptance: ${run.summary.blocked_after_acceptance_count}`,
    "",
    "## Rows",
    "",
    "| Candidate | Project | Projected state | Index | Blockers |",
    "| --- | --- | --- | --- | --- |",
    ...run.rows.map((row) =>
      `| \`${row.candidate_id}\` | ${row.project_code} | ${row.projected_state} | ${row.index?.source_text_index_ref ?? ""} | ${(row.blockers ?? []).join(", ")} |`),
    "",
    "## Boundary",
    "",
    "Owner approval, rejection, canon promotion, ontology acceptance, and default-route switching are not automated by this runner.",
    "",
  ].join("\n");
}

function renderKnowledgeWeeklyTriageMarkdown(report) {
  return [
    `# Knowledge Weekly Triage - ${report.generated_at_utc.slice(0, 10)}`,
    "",
    "Claim ceiling: observed",
    "",
    "## Summary",
    "",
    `- total candidates: ${report.summary.total_candidate_count}`,
    `- open candidates: ${report.summary.open_candidate_count}`,
    `- accepted_for_review: ${report.summary.accepted_for_review_count}`,
    `- P26-014 open candidates: ${report.summary.p26_014_open_candidate_count}`,
    "",
    "## Top Decisions",
    "",
    "| Rank | Score | Candidate | Status | Action | Reason |",
    "| ---: | ---: | --- | --- | --- | --- |",
    ...report.top_items.map((item, index) =>
      `| ${index + 1} | ${item.score} | \`${item.candidate_id}\` | ${item.current_status} | ${item.action} | ${escapeMd(item.short_reason)} |`),
    "",
    "## Current Open Candidates",
    "",
    "| Candidate | Project | Age | Route | Missing inputs |",
    "| --- | --- | ---: | --- | --- |",
    ...report.open_items.map((item) =>
      `| \`${item.candidate_id}\` | ${item.project_code} | ${item.age_days} | ${item.suggested_route} | ${(item.missing_inputs ?? []).join(", ")} |`),
    "",
    "## Owner One-Click Procedure",
    "",
    "Pick exactly one open candidate, then run its command. The automation batch after that handles only indexing/build-event projection.",
    "",
    ...report.owner_one_click_procedure.commands.map((row) => [
      `### ${row.candidate_id}`,
      "",
      "```powershell",
      row.command,
      "```",
      "",
    ].join("\n")),
    "## Boundary",
    "",
    "This report reads metadata ledgers only. It does not read source bodies, build indexes, approve candidates, reject candidates, mutate public canon, or switch routes.",
    "",
  ].join("\n");
}

function automationBoundary({ sourceTextIndexBuildAllowed }) {
  return {
    metadata_only_report: true,
    source_payloads_persisted_to_workmeta: false,
    raw_mail_or_attachment_read: false,
    notebooklm_answer_read_or_stored: false,
    secrets_read_or_stored: false,
    owner_approval_mutated: false,
    source_text_index_built: sourceTextIndexBuildAllowed,
    public_canon_mutated: false,
    ontology_mutated: false,
    graph_mutated: false,
    default_route_switched: false,
  };
}

function indexIdForSourceCardRef(sourceCardRef, candidate) {
  if (!sourceCardRef) return `candidate_${candidate.candidate_id.slice(-16)}_source_text_index`;
  const base = path.posix.basename(String(sourceCardRef), ".json").replace(/\.source_card$/u, "");
  return `${normalizeSafeId(base)}_source_text_index`;
}

function sourceCardSourceRef(card) {
  if (typeof card?.source_ref === "string") return card.source_ref;
  if (typeof card?.source_ref?.repo_relative_path === "string") return card.source_ref.repo_relative_path;
  return null;
}

function sourceCardOwnerApprovedForIndex(card) {
  const status = String(card?.approval_status ?? "");
  return status.startsWith("owner_approved_") || card?.authority?.source_is_approved_knowledge_reference === true;
}

async function listFiles(rootPath, repoRoot) {
  const entries = await fs.readdir(rootPath, { withFileTypes: true });
  const refs = [];
  for (const entry of entries) {
    const fullPath = path.join(rootPath, entry.name);
    if (entry.isDirectory()) {
      refs.push(...await listFiles(fullPath, repoRoot));
    } else if (entry.isFile()) {
      refs.push(normalizeRepoPath(path.relative(repoRoot, fullPath)));
    }
  }
  return refs;
}

function parseKeyValueMap(value) {
  const map = new Map();
  for (const item of normalizeList(value)) {
    const [rawKey, ...rest] = String(item).split("=");
    const key = rawKey.trim();
    const val = rest.join("=").trim();
    if (!CANDIDATE_ID_PATTERN.test(key)) throw new Error("candidate mapping key must be a candidate id");
    if (!val) throw new Error("candidate mapping value required");
    map.set(key, val);
  }
  return map;
}

function normalizeList(value) {
  if (value === undefined || value === null || value === "") return [];
  return Array.isArray(value) ? value.flatMap((item) => normalizeList(item)) : [String(value)];
}

function numericOption(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error("numeric option must be a non-negative integer");
  return parsed;
}

function normalizeNow(now, date) {
  if (now) return formatTimestampUtc(now);
  if (date) return formatTimestampUtc(`${date}T00:00:00Z`);
  return formatTimestampUtc(new Date().toISOString());
}

function formatTimestampUtc(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) throw new Error("invalid timestamp");
  return date.toISOString().replace(/\.\d{3}Z$/u, "Z");
}

function normalizeSafeId(value) {
  const text = String(value ?? "").trim().replace(/[^A-Za-z0-9_.:-]+/gu, "_").replace(/^_+/u, "").slice(0, 180);
  if (!isSafeId(text)) throw new Error("safe id required");
  return text;
}

function isSafeId(value) {
  return SAFE_ID_PATTERN.test(String(value ?? ""));
}

function safeCandidateId(value) {
  return CANDIDATE_ID_PATTERN.test(String(value ?? "")) ? String(value) : undefined;
}

function safeCandidateLedgerRef(value) {
  const ref = safeRepoRelativeRef(value);
  if (!/^_workmeta\/(system|P\d{2}-\d{3})\/knowledge_rag_candidate_ledger\/.+\.jsonl$/u.test(ref)) {
    throw new Error("candidate ledger ref must be under _workmeta/<project>/knowledge_rag_candidate_ledger and jsonl");
  }
  return ref;
}

function safeBuildEventLedgerRef(value) {
  const ref = safeRepoRelativeRef(value);
  if (!/^_workmeta\/system\/knowledge_pipeline_automation\/build_events\/.+\.jsonl$/u.test(ref)) {
    throw new Error("build event ledger ref must be under _workmeta/system/knowledge_pipeline_automation/build_events and jsonl");
  }
  return ref;
}

function safeRepoRelativeRef(value) {
  const raw = String(value ?? "").trim().replace(/\\/gu, "/");
  if (!raw || raw.includes("\0")) throw new Error("repo relative ref required");
  if (path.isAbsolute(raw) || path.win32.isAbsolute(raw) || raw.startsWith("/") || /^[a-z]+:\/\//iu.test(raw)) {
    throw new Error("runtime absolute refs are not allowed");
  }
  const normalized = normalizeRepoPath(path.posix.normalize(raw));
  if (normalized === "." || normalized.startsWith("../") || normalized.includes("/../")) {
    throw new Error("repo relative ref must not traverse");
  }
  if (SECRET_LIKE_SEGMENT_PATTERN.test(normalized)) throw new Error("secret-like ref blocked");
  return normalized;
}

function countBy(items, key) {
  const out = {};
  for (const item of items) {
    const value = String(item[key] ?? "unknown");
    out[value] = (out[value] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

function quoteCli(value) {
  return `"${String(value ?? "").replace(/"/gu, '\\"')}"`;
}

function escapeMd(value) {
  return String(value ?? "").replace(/\|/gu, "\\|").replace(/\r?\n/gu, " ");
}

function stableHash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
