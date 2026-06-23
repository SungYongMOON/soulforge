import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { normalizeRepoPath, pathExists, readJson, writeJson } from "../shared/io.mjs";

export const MASTER_KNOWLEDGE_INVENTORY_SCHEMA_VERSION = "soulforge.master_knowledge_inventory.v0";
export const MASTER_KNOWLEDGE_INVENTORY_SUMMARY_SCHEMA_VERSION = "soulforge.master_knowledge_inventory_summary.v0";
export const CANDIDATE_PRIORITY_TRIAGE_SCHEMA_VERSION = "soulforge.knowledge_rag_candidate_priority_triage.v0";
export const SOURCEBOUND_REVIEW_SELECTION_SCHEMA_VERSION = "soulforge.sourcebound_review_selection.v0";
export const MASTER_INVENTORY_REFRESH_RUNNER_ID = "guild_hall.rag.master_inventory_refresh.v0";

const DEFAULT_OUTPUT_ROOT = "_workmeta/system/reports/knowledge_wiki";
const DEFAULT_LEDGER_ROOT = "_workmeta/system/knowledge_rag_candidate_ledger/events";
const DEFAULT_SCAN_ROOTS = [
  "_workmeta/system/knowledge_rag_candidate_ledger",
  "_workmeta/system/reports/knowledge_access",
  "_workmeta/system/reports/knowledge_wiki",
  "_workmeta/system/reports/post_development_review",
  "_workmeta/system/reports/procedure_capture",
  "_workmeta/system/reports/rag",
  "_workspaces/knowledge/common",
  "_workspaces/knowledge/rag",
  "_workspaces/knowledge/source_cards",
  "_workspaces/knowledge/wiki",
  ".party",
  ".registry/knowledge",
  ".workflow",
  "docs/architecture",
  "guild_hall/knowledge_access",
  "guild_hall/knowledge_graph",
  "guild_hall/rag",
];
const SECRET_LIKE_SEGMENT_PATTERN = /(^|[./_-])(auth|authorization|bearer|cookie|credential|credentials|passwd|password|private_key|refresh_token|secret|session|token)([./_-]|$)/iu;
const HOST_ABSOLUTE_PATTERN = /(?:^|["'\s])(?:\/Users\/|\/Volumes\/|file:\/\/)/u;
const SAFE_CLAIM_CEILINGS = new Set([
  "observed",
  "source_supported",
  "validated_private",
  "canon_candidate",
  "canon_entry",
  "rejected_or_blocked",
  "unknown",
  "source_supported_or_observed_by_source_card",
  "observed_until_sourcebound_review",
  "pilot_executed_not_canon_truth",
  "pilot_executed_not_default_route_safe",
]);

export async function buildMasterKnowledgeInventoryRefresh(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const now = normalizeNow(options.now, options.date);
  const dateId = now.slice(0, 10).replaceAll("-", "");
  const inventoryId = normalizeSafeId(options.inventoryId ?? `master_knowledge_inventory_reconcile_${dateId}`);
  const outputRootRef = safeRepoRelativeRef(options.outputRootRef ?? DEFAULT_OUTPUT_ROOT);
  const outputDirRef = safeRepoRelativeRef(path.posix.join(outputRootRef, inventoryId));
  const scanRoots = normalizeScanRoots(options.scanRoots ?? DEFAULT_SCAN_ROOTS);
  const rows = [];
  const scanStats = {
    scanned_roots: [],
    missing_roots: [],
    skipped_secret_like_paths: 0,
    skipped_non_file_entries: 0,
  };

  for (const row of await buildPublicKnowledgeRows({ repoRoot, now })) rows.push(row);
  const candidateRows = await loadCandidateLedgerRows({ repoRoot, ledgerRootRef: options.ledgerRootRef ?? DEFAULT_LEDGER_ROOT });
  const candidateTriage = buildCandidatePriorityTriage({
    candidates: candidateRows,
    generatedAtUtc: now,
    sourceInventoryRef: path.posix.join(outputDirRef, "master_knowledge_inventory.json"),
  });
  for (const row of buildCandidateControlRows(candidateRows, candidateTriage, now)) rows.push(row);

  const notebooklmMetadataRef = await resolveNotebooklmMetadataRef({
    repoRoot,
    outputRootRef,
    inventoryId,
    explicitRef: options.notebooklmMetadataRef,
  });
  const notebooklmInventory = notebooklmMetadataRef
    ? await loadNotebooklmMetadataInventory({ repoRoot, ref: notebooklmMetadataRef })
    : null;
  for (const row of buildNotebooklmControlRows(notebooklmInventory, notebooklmMetadataRef, now)) rows.push(row);

  const fileRows = await buildFileMetadataRows({ repoRoot, scanRoots, now, scanStats });
  rows.push(...fileRows);

  rows.sort((a, b) => {
    const left = `${a.owner_surface}\0${a.kind}\0${a.stable_ref}`;
    const right = `${b.owner_surface}\0${b.kind}\0${b.stable_ref}`;
    return left.localeCompare(right);
  });
  rows.forEach((row, index) => {
    row.row_number = index + 1;
  });

  const inventoryRef = path.posix.join(outputDirRef, "master_knowledge_inventory.json");
  const csvRef = path.posix.join(outputDirRef, "master_knowledge_inventory.csv");
  const summary = buildInventorySummary({
    rows,
    generatedAtUtc: now,
    inventoryRef,
    csvRef,
    candidateTriage,
    notebooklmInventory,
    notebooklmMetadataRef,
    scanStats,
  });
  const inventory = {
    schema_version: MASTER_KNOWLEDGE_INVENTORY_SCHEMA_VERSION,
    kind: "master_knowledge_inventory",
    inventory_id: inventoryId,
    generated_at_utc: now,
    runner_id: MASTER_INVENTORY_REFRESH_RUNNER_ID,
    claim_ceiling: "observed",
    boundary: metadataOnlyBoundary(),
    control_surface: {
      current_control_surface_ref: outputDirRef,
      recurring_refresh_command:
        `npm run guild-hall:rag -- master-inventory-refresh --write --date ${now.slice(0, 10)}`,
      notebooklm_metadata_ref: notebooklmMetadataRef,
      notebooklm_live_query_executed: false,
      source_text_reading_executed: false,
    },
    scan_policy: {
      scan_roots: scanRoots,
      file_rows_are_metadata_only: true,
      secret_like_paths_skipped: true,
      source_payloads_read: false,
    },
    rows,
  };
  const sourceboundSelection = buildSourceboundReviewSelection({
    candidateTriage,
    generatedAtUtc: now,
    sourceInventoryRef: inventoryRef,
  });
  const validation = validateMasterKnowledgeInventoryRefresh({ inventory, summary, candidateTriage, sourceboundSelection });

  return {
    schema_version: "soulforge.master_knowledge_inventory_refresh_result.v0",
    kind: "master_knowledge_inventory_refresh_result",
    status: validation.status === "pass" ? "ready" : "invalid",
    generated_at_utc: now,
    runner_id: MASTER_INVENTORY_REFRESH_RUNNER_ID,
    output_dir_ref: outputDirRef,
    artifacts: {
      master_inventory_ref: inventoryRef,
      master_inventory_csv_ref: csvRef,
      inventory_summary_ref: path.posix.join(outputDirRef, "inventory_summary.json"),
      reconcile_report_ref: path.posix.join(outputDirRef, "reconcile_report.md"),
      rag_refresh_handoff_decision_ref: path.posix.join(outputDirRef, "rag_refresh_handoff_decision.yaml"),
      control_surface_binding_ref: path.posix.join(outputDirRef, "control_surface_binding.yaml"),
      candidate_priority_triage_ref: path.posix.join(outputDirRef, "candidate_priority_triage.json"),
      candidate_priority_triage_report_ref: path.posix.join(outputDirRef, "candidate_priority_triage.md"),
      sourcebound_review_selection_ref: path.posix.join(outputDirRef, "sourcebound_review_selection.json"),
      sourcebound_review_selection_report_ref: path.posix.join(outputDirRef, "sourcebound_review_selection.md"),
      validation_log_ref: path.posix.join(outputDirRef, "validation_log.md"),
    },
    summary,
    inventory,
    candidate_priority_triage: candidateTriage,
    sourcebound_review_selection: sourceboundSelection,
    validation,
    rendered: {
      csv: renderInventoryCsv(rows),
      reconcile_report_md: renderReconcileReport({ summary, candidateTriage, sourceboundSelection, outputDirRef }),
      rag_refresh_handoff_decision_yaml: renderRagRefreshHandoffDecision({ summary, outputDirRef, now }),
      control_surface_binding_yaml: renderControlSurfaceBinding({ summary, outputDirRef, now }),
      candidate_priority_triage_md: renderCandidatePriorityTriageMarkdown(candidateTriage),
      sourcebound_review_selection_md: renderSourceboundReviewSelectionMarkdown(sourceboundSelection),
      validation_log_md: renderValidationLog({ validation, summary, candidateTriage, sourceboundSelection }),
    },
  };
}

export async function writeMasterKnowledgeInventoryRefresh(options = {}) {
  const refresh = await buildMasterKnowledgeInventoryRefresh(options);
  if (refresh.validation.status !== "pass") {
    const detail = refresh.validation.errors.join("; ") || "unknown validation error";
    throw new Error(`master inventory refresh failed validation: ${detail}`);
  }
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const outputDir = path.join(repoRoot, refresh.output_dir_ref);
  await fs.mkdir(outputDir, { recursive: true });
  await writeJson(path.join(repoRoot, refresh.artifacts.master_inventory_ref), refresh.inventory);
  await fs.writeFile(path.join(repoRoot, refresh.artifacts.master_inventory_csv_ref), refresh.rendered.csv, "utf8");
  await writeJson(path.join(repoRoot, refresh.artifacts.inventory_summary_ref), refresh.summary);
  await fs.writeFile(path.join(repoRoot, refresh.artifacts.reconcile_report_ref), refresh.rendered.reconcile_report_md, "utf8");
  await fs.writeFile(
    path.join(repoRoot, refresh.artifacts.rag_refresh_handoff_decision_ref),
    refresh.rendered.rag_refresh_handoff_decision_yaml,
    "utf8",
  );
  await fs.writeFile(
    path.join(repoRoot, refresh.artifacts.control_surface_binding_ref),
    refresh.rendered.control_surface_binding_yaml,
    "utf8",
  );
  await writeJson(path.join(repoRoot, refresh.artifacts.candidate_priority_triage_ref), refresh.candidate_priority_triage);
  await fs.writeFile(
    path.join(repoRoot, refresh.artifacts.candidate_priority_triage_report_ref),
    refresh.rendered.candidate_priority_triage_md,
    "utf8",
  );
  await writeJson(path.join(repoRoot, refresh.artifacts.sourcebound_review_selection_ref), refresh.sourcebound_review_selection);
  await fs.writeFile(
    path.join(repoRoot, refresh.artifacts.sourcebound_review_selection_report_ref),
    refresh.rendered.sourcebound_review_selection_md,
    "utf8",
  );
  await fs.writeFile(path.join(repoRoot, refresh.artifacts.validation_log_ref), refresh.rendered.validation_log_md, "utf8");
  return {
    status: "written",
    output_dir_ref: refresh.output_dir_ref,
    artifacts: refresh.artifacts,
    total_rows: refresh.summary.summary.total_rows,
    candidate_rows: refresh.summary.summary.candidate_ledger_rows,
    notebooklm_notebooks: refresh.summary.summary.notebooklm_notebooks,
    notebooklm_sources: refresh.summary.summary.notebooklm_sources,
    selected_sourcebound_candidate_id: refresh.sourcebound_review_selection.selected_candidate?.candidate_id ?? null,
  };
}

export async function loadMasterKnowledgeInventoryRefresh({ repoRoot = process.cwd(), inventoryRef } = {}) {
  if (!inventoryRef) throw new Error("--inventory-ref requires a value");
  return readJson(path.join(path.resolve(repoRoot), safeRepoRelativeRef(inventoryRef)));
}

export function validateMasterKnowledgeInventoryRefresh(payload) {
  const errors = [];
  const inventory = payload?.inventory ?? payload;
  const summary = payload?.summary;
  const candidateTriage = payload?.candidateTriage ?? payload?.candidate_priority_triage;
  const sourceboundSelection = payload?.sourceboundSelection ?? payload?.sourcebound_review_selection;

  if (inventory?.schema_version !== MASTER_KNOWLEDGE_INVENTORY_SCHEMA_VERSION) {
    errors.push("inventory schema_version mismatch");
  }
  if (!Array.isArray(inventory?.rows)) {
    errors.push("inventory.rows must be an array");
  }
  if (inventory?.boundary?.metadata_only !== true) {
    errors.push("inventory boundary.metadata_only must be true");
  }
  for (const [key, expected] of Object.entries(metadataOnlyBoundary())) {
    if (inventory?.boundary?.[key] !== expected) {
      errors.push(`inventory boundary.${key} must be ${expected}`);
    }
  }
  for (const row of inventory?.rows ?? []) {
    if (!row.row_id || !row.stable_ref || !row.kind || !row.owner_surface || !row.claim_ceiling) {
      errors.push(`row missing required metadata fields: ${row?.stable_ref ?? "(unknown)"}`);
    }
    if (!SAFE_CLAIM_CEILINGS.has(row.claim_ceiling)) {
      errors.push(`row has unsupported claim ceiling ${row.claim_ceiling}: ${row.stable_ref}`);
    }
    const serialized = JSON.stringify(row);
    if (HOST_ABSOLUTE_PATTERN.test(serialized)) {
      errors.push(`row contains host absolute path: ${row.stable_ref}`);
    }
    for (const key of Object.keys(row)) {
      if (["body", "chunk", "content", "payload", "raw", "secret", "source_text", "text"].includes(key)) {
        errors.push(`row uses forbidden payload-shaped key ${key}: ${row.stable_ref}`);
      }
    }
  }
  if (summary && summary.schema_version !== MASTER_KNOWLEDGE_INVENTORY_SUMMARY_SCHEMA_VERSION) {
    errors.push("summary schema_version mismatch");
  }
  if (candidateTriage && candidateTriage.schema_version !== CANDIDATE_PRIORITY_TRIAGE_SCHEMA_VERSION) {
    errors.push("candidate triage schema_version mismatch");
  }
  if (sourceboundSelection && sourceboundSelection.schema_version !== SOURCEBOUND_REVIEW_SELECTION_SCHEMA_VERSION) {
    errors.push("sourcebound selection schema_version mismatch");
  }
  return {
    schema_version: "soulforge.master_knowledge_inventory_refresh_validation.v0",
    status: errors.length === 0 ? "pass" : "fail",
    errors,
    checked_at_utc: new Date().toISOString(),
  };
}

function metadataOnlyBoundary() {
  return {
    metadata_only: true,
    source_payloads_included: false,
    source_text_read: false,
    source_text_index_built: false,
    embedding_vectors_included: false,
    bm25_payloads_included: false,
    notebooklm_answers_included: false,
    notebooklm_upload_or_query_executed: false,
    drive_mutation_executed: false,
    raw_questions_included: false,
    private_payloads_included: false,
    secrets_included: false,
    runtime_absolute_paths_included: false,
    canon_or_ontology_mutated: false,
    owner_approval_granted: false,
    default_route_switched: false,
  };
}

async function buildPublicKnowledgeRows({ repoRoot, now }) {
  const root = path.join(repoRoot, ".registry", "knowledge");
  if (!(await pathExists(root))) return [];
  const entries = await fs.readdir(root, { withFileTypes: true });
  const rows = [];
  for (const entry of entries.filter((item) => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const ref = `.registry/knowledge/${entry.name}/knowledge.yaml`;
    const filePath = path.join(repoRoot, ref);
    if (!(await pathExists(filePath))) continue;
    const raw = await fs.readFile(filePath, "utf8");
    const fields = parseFlatYamlFields(raw);
    rows.push({
      row_id: rowId("public_canon_knowledge_entry", ref),
      stable_ref: ref,
      owner_surface: ".registry/knowledge",
      kind: "public_canon_knowledge_entry",
      level: "L5_public_canon_entry",
      lifecycle_state: fields.status ?? "unknown",
      claim_ceiling: fields.claim_ceiling ?? "unknown",
      title: fields.title ?? entry.name,
      relation_hooks: ["public_canon_entry"],
      route_hint: fields.claim_ceiling ? "claim_ceiling_explicit" : "claim_ceiling_missing",
      risk: fields.claim_ceiling ? "metadata_ok" : "claim_ceiling_missing",
      next_action: fields.claim_ceiling ? "retain" : "add_explicit_claim_ceiling",
      generated_at_utc: now,
    });
  }
  return rows;
}

async function loadCandidateLedgerRows({ repoRoot, ledgerRootRef }) {
  const rootRef = safeRepoRelativeRef(ledgerRootRef);
  const root = path.join(repoRoot, rootRef);
  if (!(await pathExists(root))) return [];
  const files = (await listFiles(root, repoRoot))
    .filter((ref) => ref.endsWith(".jsonl"))
    .sort((a, b) => a.localeCompare(b));
  const rows = [];
  for (const fileRef of files) {
    const raw = await fs.readFile(path.join(repoRoot, fileRef), "utf8");
    for (const [lineIndex, line] of raw.split(/\r?\n/u).entries()) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const parsed = JSON.parse(trimmed);
        rows.push({
          ...parsed,
          ledger_ref: fileRef,
          ledger_line: lineIndex + 1,
        });
      } catch {
        rows.push({
          schema_version: "soulforge.knowledge_rag_candidate.parse_error.v0",
          kind: "knowledge_rag_candidate_parse_error",
          status: "blocked",
          candidate_id: rowId("parse_error", `${fileRef}:${lineIndex + 1}`),
          created_at: null,
          project_code: "system",
          source_context_ref: fileRef,
          candidate_kind: "parse_error",
          short_reason: "Candidate ledger line could not be parsed as JSON.",
          suggested_route: "owner_decision_needed",
          claim_ceiling: "rejected_or_blocked",
          missing_inputs: ["valid_jsonl_row"],
          owner_question: "Should this malformed candidate row be repaired or ignored?",
          boundary: metadataOnlyBoundary(),
          ledger_ref: fileRef,
          ledger_line: lineIndex + 1,
        });
      }
    }
  }
  return rows;
}

function buildCandidateControlRows(candidates, triage, now) {
  const byCandidateId = new Map(triage.items.map((item) => [item.candidate_id, item]));
  return candidates.map((candidate) => {
    const triageItem = byCandidateId.get(candidate.candidate_id);
    const ref = `${candidate.ledger_ref}#${candidate.candidate_id}`;
    return {
      row_id: rowId("knowledge_rag_candidate", ref),
      stable_ref: ref,
      owner_surface: "_workmeta/system/knowledge_rag_candidate_ledger",
      kind: "knowledge_rag_candidate",
      level: "L0_governance_signal",
      lifecycle_state: candidate.status ?? "unknown",
      claim_ceiling: candidate.claim_ceiling ?? "observed",
      title: candidate.short_reason ?? candidate.candidate_id,
      relation_hooks: ["routes_to", "requires_owner_decision"],
      route_hint: candidate.suggested_route ?? "unknown",
      risk: "metadata_ok",
      next_action: triageItem?.recommended_next_action ?? "triage",
      priority_rank: triageItem?.priority_rank ?? null,
      priority_lane: triageItem?.priority_lane ?? null,
      generated_at_utc: now,
    };
  });
}

function buildCandidatePriorityTriage({ candidates, generatedAtUtc, sourceInventoryRef }) {
  const items = candidates
    .map((candidate) => classifyCandidate(candidate))
    .sort((a, b) => {
      if (a.priority_rank !== b.priority_rank) return a.priority_rank - b.priority_rank;
      return a.candidate_id.localeCompare(b.candidate_id);
    });
  const byLane = countBy(items, "priority_lane");
  return {
    schema_version: CANDIDATE_PRIORITY_TRIAGE_SCHEMA_VERSION,
    kind: "knowledge_rag_candidate_priority_triage",
    generated_at_utc: generatedAtUtc,
    source_inventory_ref: sourceInventoryRef,
    claim_ceiling: "observed",
    boundary: metadataOnlyBoundary(),
    total_candidates: items.length,
    by_priority_lane: byLane,
    items,
  };
}

function classifyCandidate(candidate) {
  const id = candidate.candidate_id ?? "unknown_candidate";
  const reason = candidate.short_reason ?? "";
  const route = candidate.suggested_route ?? "";
  const base = {
    candidate_id: id,
    source_context_ref: candidate.source_context_ref ?? null,
    suggested_route: route,
    claim_ceiling: candidate.claim_ceiling ?? "observed",
    short_reason: reason,
    owner_question: candidate.owner_question ?? null,
    missing_inputs: candidate.missing_inputs ?? [],
  };
  if (id === "knowledge_rag_candidate_d61cccdecf50b676") {
    return {
      ...base,
      priority_rank: 1,
      priority_lane: "immediate_sourcebound_review",
      decision: "select_first",
      recommended_next_action: "open_sourcebound_review_packet_for_sonar_electronics_calculator_seed_then_prepare_dev_erp_import_review",
      rationale:
        "Highest practical value: calculator seed formulas can move directly into dev-ERP after sourcebound review and owner import scope decision.",
    };
  }
  if (id === "knowledge_rag_candidate_8ecfbea9312e643b") {
    return {
      ...base,
      priority_rank: 2,
      priority_lane: "immediate_sourcebound_review",
      decision: "second_sourcebound_candidate",
      recommended_next_action: "run_sourcebound_review_after_law_body_snapshot_and_erp_calendar_policy_are_bound",
      rationale:
        "Strong knowledge-system value for SE ERP schedule rules, but source snapshot and policy gaps should be closed before stronger claim.",
    };
  }
  if (id === "knowledge_rag_candidate_5bb2de6e0bee6a53") {
    return {
      ...base,
      priority_rank: 3,
      priority_lane: "immediate_sourcebound_review",
      decision: "defer_behind_domain_sources",
      recommended_next_action: "hold_until_domain_sourcebound_reviews_finish_or_review_loop_design_becomes_active_slice",
      rationale:
        "Useful workflow-design source, but less urgent than calculator/import and SE schedule-rule source work.",
    };
  }
  if (id === "knowledge_rag_candidate_b97554eddf58b15c") {
    return {
      ...base,
      priority_rank: 4,
      priority_lane: "hold_or_monitor",
      decision: "addressed_by_current_runner_slice",
      recommended_next_action: "monitor_runner_outputs_and_route_new_gaps_through_rag_metadata_refresh_v0",
      rationale:
        "The deterministic aggregate runner is the current implementation slice; no separate owner decision is needed for the already requested metadata-only runner.",
    };
  }
  if (id === "knowledge_rag_candidate_15db96513cc86e77") {
    return {
      ...base,
      priority_rank: 5,
      priority_lane: "owner_decision_needed",
      decision: "owner_backfill_scope_needed",
      recommended_next_action: "decide_historical_backfill_scope_before_bulk_ledger_import",
      rationale:
        "Historical backfill could be large and mixed-scope; owner should choose breadth before metadata is normalized.",
    };
  }
  if (id === "knowledge_rag_candidate_30ae8c62c7ea11b7") {
    return {
      ...base,
      priority_rank: 6,
      priority_lane: "owner_decision_needed",
      decision: "owner_promotion_policy_needed",
      recommended_next_action: "choose_between_private_source_public_safe_derivatives_internal_sourcebound_backfill_or_manual_review_closeout",
      rationale:
        "The full wikiization register bundles several distinct promotion paths and should not be promoted as one decision.",
    };
  }
  if (id === "knowledge_rag_candidate_23b95fbb5abf4982") {
    return {
      ...base,
      priority_rank: 7,
      priority_lane: "owner_decision_needed",
      decision: "payload_policy_decision_needed",
      recommended_next_action: "decide_legacy_workmeta_payload_grandfather_or_migration_policy_before_validator_expansion",
      rationale:
        "This affects public/private boundary policy and validator behavior, so it should stay owner-governed.",
    };
  }
  if (id === "knowledge_rag_candidate_c5769d0098327eb9") {
    return {
      ...base,
      priority_rank: 8,
      priority_lane: "hold_or_monitor",
      decision: "resolved_by_current_workflow_registration_state",
      recommended_next_action: "monitor_registered_rag_source_text_support_routes_without_default_route_claim",
      rationale:
        "Current workflow index already includes the RAG quality/work-card support routes; no immediate registration action remains.",
    };
  }
  if (id === "knowledge_rag_candidate_c43c28c570184cce") {
    return {
      ...base,
      priority_rank: 9,
      priority_lane: "hold_or_monitor",
      decision: "resolved_by_current_party_allowed_workflows",
      recommended_next_action: "keep_llm_wiki_stack_as_optional_route_unless_owner_requests_consolidation",
      rationale:
        "The knowledge wiki cell allowed workflow set now lists the LLM wiki stack as optional, so the gap is no longer urgent.",
    };
  }
  if (id === "knowledge_rag_candidate_090ae35661f2aa6c") {
    return {
      ...base,
      priority_rank: 10,
      priority_lane: "hold_or_monitor",
      decision: "metadata_only_operator_tool_hold",
      recommended_next_action: "keep_operational_route_tooling_as_helper_surface_until_repeated_use_justifies_workflowization",
      rationale:
        "Broad helper tooling is useful but should not become first-class workflow/canon without repeated operator demand.",
    };
  }
  return {
    ...base,
    priority_rank: 99,
    priority_lane: route === "sourcebound_review_candidate" ? "immediate_sourcebound_review" : "owner_decision_needed",
    decision: "needs_manual_triage",
    recommended_next_action: "review_candidate_metadata_and_assign_owner_route",
    rationale: "No deterministic priority rule matched this candidate.",
  };
}

function buildSourceboundReviewSelection({ candidateTriage, generatedAtUtc, sourceInventoryRef }) {
  const selected = candidateTriage.items.find((item) => item.decision === "select_first")
    ?? candidateTriage.items.find((item) => item.priority_lane === "immediate_sourcebound_review")
    ?? null;
  return {
    schema_version: SOURCEBOUND_REVIEW_SELECTION_SCHEMA_VERSION,
    kind: "sourcebound_review_selection",
    generated_at_utc: generatedAtUtc,
    source_inventory_ref: sourceInventoryRef,
    claim_ceiling: "observed",
    boundary: metadataOnlyBoundary(),
    selected_candidate: selected
      ? {
          candidate_id: selected.candidate_id,
          source_context_ref: selected.source_context_ref,
          title: selected.short_reason || selected.candidate_id,
          reason: selected.rationale,
          next_action: selected.recommended_next_action,
          required_before_import: selected.missing_inputs ?? [],
        }
      : null,
    alternate_candidates: candidateTriage.items
      .filter((item) => item.priority_lane === "immediate_sourcebound_review" && item.candidate_id !== selected?.candidate_id)
      .map((item) => ({
        candidate_id: item.candidate_id,
        reason: item.rationale,
        next_action: item.recommended_next_action,
      })),
    non_claims: [
      "selection_does_not_execute_selected_candidate",
      "selection_does_not_promote_public_canon",
      "selection_does_not_grant_source_truth",
      "selection_does_not_approve_owner_scope",
    ],
  };
}

async function resolveNotebooklmMetadataRef({ repoRoot, outputRootRef, inventoryId, explicitRef }) {
  if (explicitRef) {
    const ref = safeRepoRelativeRef(explicitRef);
    if (!(await pathExists(path.join(repoRoot, ref)))) {
      throw new Error(`notebooklm metadata ref not found: ${ref}`);
    }
    return ref;
  }
  const rootRef = safeRepoRelativeRef(outputRootRef);
  const root = path.join(repoRoot, rootRef);
  if (!(await pathExists(root))) return null;
  const candidates = (await listFiles(root, repoRoot))
    .filter((ref) => ref.endsWith("/notebooklm_metadata_inventory.json"))
    .sort((a, b) => b.localeCompare(a));
  const sameInventoryRef = path.posix.join(rootRef, inventoryId, "notebooklm_metadata_inventory.json");
  if (candidates.includes(sameInventoryRef)) return sameInventoryRef;
  return candidates[0] ?? null;
}

async function loadNotebooklmMetadataInventory({ repoRoot, ref }) {
  const inventory = await readJson(path.join(repoRoot, safeRepoRelativeRef(ref)));
  if (inventory?.boundary?.metadata_only !== true) {
    throw new Error(`notebooklm metadata inventory is not metadata-only: ${ref}`);
  }
  return inventory;
}

function buildNotebooklmControlRows(inventory, sourceRef, now) {
  if (!inventory) return [];
  const rows = [];
  rows.push({
    row_id: rowId("notebooklm_live_metadata_inventory", sourceRef),
    stable_ref: sourceRef,
    owner_surface: "_workmeta/system/reports/knowledge_wiki",
    kind: "notebooklm_live_metadata_inventory",
    level: "L0_advisory_bookshelf_metadata",
    lifecycle_state: inventory.available === true ? "available" : "unavailable",
    claim_ceiling: "observed",
    title: "NotebookLM metadata mirror",
    relation_hooks: ["advisory_bookshelf_metadata"],
    route_hint: "metadata_mirror_only",
    risk: "metadata_ok",
    next_action: "refresh_live_mirror_separately_when_notebooklm_state_must_be_current",
    generated_at_utc: now,
  });
  for (const notebook of inventory.notebooks ?? []) {
    const ref = `notebooklm:notebook:${notebook.notebook_id ?? fingerprint(notebook.title ?? "untitled")}`;
    rows.push({
      row_id: rowId("notebooklm_notebook_metadata", ref),
      stable_ref: ref,
      owner_surface: "NotebookLM",
      kind: "notebooklm_notebook_metadata",
      level: "L0_advisory_bookshelf_metadata",
      lifecycle_state: "metadata_visible",
      claim_ceiling: "observed",
      title: notebook.title ?? "Untitled notebook",
      relation_hooks: ["advisory_bookshelf"],
      route_hint: notebook.group ?? "ungrouped",
      risk: "metadata_ok",
      next_action: "use_as_navigation_only_until_sourcebound_review",
      generated_at_utc: now,
    });
  }
  for (const source of inventory.sources ?? []) {
    const ref = `notebooklm:source:${source.notebook_id ?? "unknown"}:${source.source_id ?? fingerprint(source.title ?? "untitled")}`;
    rows.push({
      row_id: rowId("notebooklm_source_metadata", ref),
      stable_ref: ref,
      owner_surface: "NotebookLM",
      kind: "notebooklm_source_metadata",
      level: "L0_advisory_bookshelf_metadata",
      lifecycle_state: "metadata_visible",
      claim_ceiling: "observed",
      title: source.title ?? "Untitled source",
      relation_hooks: ["advisory_source_metadata"],
      route_hint: source.group ?? "ungrouped",
      risk: "metadata_ok",
      next_action: "do_not_treat_notebooklm_membership_as_source_truth",
      generated_at_utc: now,
    });
  }
  return rows;
}

async function buildFileMetadataRows({ repoRoot, scanRoots, now, scanStats }) {
  const rows = [];
  for (const rootRef of scanRoots) {
    const root = path.join(repoRoot, rootRef);
    if (!(await pathExists(root))) {
      scanStats.missing_roots.push(rootRef);
      continue;
    }
    scanStats.scanned_roots.push(rootRef);
    const refs = await listFiles(root, repoRoot);
    for (const ref of refs.sort((a, b) => a.localeCompare(b))) {
      if (isSecretLikePath(ref)) {
        scanStats.skipped_secret_like_paths += 1;
        continue;
      }
      const absolute = path.join(repoRoot, ref);
      const stat = await fs.lstat(absolute);
      if (!stat.isFile()) {
        scanStats.skipped_non_file_entries += 1;
        continue;
      }
      rows.push({
        row_id: rowId("file_metadata", ref),
        stable_ref: ref,
        owner_surface: classifyOwnerSurface(ref),
        kind: classifyFileKind(ref),
        level: classifyFileLevel(ref),
        lifecycle_state: "file_visible",
        claim_ceiling: classifyFileClaimCeiling(ref),
        title: path.posix.basename(ref),
        relation_hooks: classifyRelationHooks(ref),
        route_hint: classifyRouteHint(ref),
        risk: classifyRisk(ref),
        next_action: classifyNextAction(ref),
        size_bytes: stat.size,
        modified_at_utc: stat.mtime.toISOString(),
        generated_at_utc: now,
      });
    }
  }
  return rows;
}

async function listFiles(root, repoRoot) {
  const refs = [];
  async function walk(current) {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === ".git" || entry.name === "node_modules") continue;
      const absolute = path.join(current, entry.name);
      const relative = normalizeRepoPath(path.relative(repoRoot, absolute));
      if (entry.isDirectory()) {
        await walk(absolute);
      } else if (entry.isFile()) {
        refs.push(relative);
      }
    }
  }
  await walk(root);
  return refs;
}

function buildInventorySummary({
  rows,
  generatedAtUtc,
  inventoryRef,
  csvRef,
  candidateTriage,
  notebooklmInventory,
  notebooklmMetadataRef,
  scanStats,
}) {
  const controlKinds = new Set([
    "knowledge_rag_candidate",
    "notebooklm_live_metadata_inventory",
    "notebooklm_notebook_metadata",
    "notebooklm_source_metadata",
    "public_canon_knowledge_entry",
  ]);
  const controlRows = rows.filter((row) => controlKinds.has(row.kind)).length;
  const summary = {
    total_rows: rows.length,
    control_rows: controlRows,
    file_metadata_rows: rows.length - controlRows,
    notebooklm_notebooks: notebooklmInventory?.notebooks?.length ?? 0,
    notebooklm_sources: notebooklmInventory?.sources?.length ?? 0,
    notebooklm_source_list_errors: notebooklmInventory?.errors?.length ?? 0,
    candidate_ledger_rows: candidateTriage.total_candidates,
    public_knowledge_entries: rows.filter((row) => row.kind === "public_canon_knowledge_entry").length,
    public_knowledge_missing_claim_ceiling: rows.filter((row) => row.kind === "public_canon_knowledge_entry" && row.claim_ceiling === "unknown").length,
    by_owner_surface: countBy(rows, "owner_surface"),
    by_kind: countBy(rows, "kind"),
    by_level: countBy(rows, "level"),
    by_claim_ceiling: countBy(rows, "claim_ceiling"),
    by_risk: countBy(rows, "risk"),
    candidate_priority_lanes: candidateTriage.by_priority_lane,
    scan: scanStats,
  };
  return {
    schema_version: MASTER_KNOWLEDGE_INVENTORY_SUMMARY_SCHEMA_VERSION,
    generated_at_utc: generatedAtUtc,
    summary,
    notebooklm_groups: notebooklmInventory?.groups ?? {},
    notebooklm_metadata_ref: notebooklmMetadataRef,
    source_inventory_ref: inventoryRef,
    csv_ref: csvRef,
  };
}

function renderInventoryCsv(rows) {
  const columns = [
    "row_number",
    "row_id",
    "stable_ref",
    "owner_surface",
    "kind",
    "level",
    "lifecycle_state",
    "claim_ceiling",
    "title",
    "relation_hooks",
    "route_hint",
    "risk",
    "next_action",
    "priority_rank",
    "priority_lane",
    "size_bytes",
    "modified_at_utc",
  ];
  const lines = [columns.join(",")];
  for (const row of rows) {
    lines.push(columns.map((column) => csvCell(Array.isArray(row[column]) ? row[column].join("|") : row[column])).join(","));
  }
  return `${lines.join("\n")}\n`;
}

function renderReconcileReport({ summary, candidateTriage, sourceboundSelection, outputDirRef }) {
  const s = summary.summary;
  const selected = sourceboundSelection.selected_candidate;
  return [
    `# Master Knowledge Inventory + Reconcile Report - ${summary.generated_at_utc.slice(0, 10)}`,
    "",
    "Worker: `codex_gpt-5`",
    "Runner: `guild_hall.rag.master_inventory_refresh.v0`",
    "Claim ceiling: observed",
    "",
    "## Boundary",
    "",
    "This report is metadata-only. It does not copy source bodies, chunks, NotebookLM answers, raw questions, mail bodies, attachments, credentials, secrets, Drive payloads, private source text, embeddings, or BM25/vector payloads.",
    "",
    "## Control Surface",
    "",
    `Current private control surface: \`${outputDirRef}/\``,
    "",
    "Recurring refresh command:",
    "",
    "```bash",
    `npm run guild-hall:rag -- master-inventory-refresh --write --date ${summary.generated_at_utc.slice(0, 10)}`,
    "```",
    "",
    "## Current Counts",
    "",
    `- Total rows: ${s.total_rows}`,
    `- File metadata rows: ${s.file_metadata_rows}`,
    `- Public knowledge canon entries: ${s.public_knowledge_entries}`,
    `- Public knowledge entries missing claim ceiling: ${s.public_knowledge_missing_claim_ceiling}`,
    `- Candidate ledger rows: ${s.candidate_ledger_rows}`,
    `- NotebookLM notebooks from metadata mirror: ${s.notebooklm_notebooks}`,
    `- NotebookLM source metadata rows from metadata mirror: ${s.notebooklm_sources}`,
    "",
    "## Candidate Triage",
    "",
    ...Object.entries(candidateTriage.by_priority_lane).map(([lane, count]) => `- ${lane}: ${count}`),
    "",
    "Priority order:",
    "",
    ...candidateTriage.items.map(
      (item) => `${item.priority_rank}. ${item.candidate_id} - ${item.priority_lane} - ${item.decision}`,
    ),
    "",
    "## First Sourcebound Review Selection",
    "",
    selected
      ? `Selected: \`${selected.candidate_id}\` (${selected.title}).`
      : "Selected: none.",
    selected ? `Next action: ${selected.next_action}.` : "",
    "",
    "## Non-Claims",
    "",
    "- No public canon promotion.",
    "- No ontology acceptance.",
    "- No RAG source-text ingestion or index build.",
    "- No NotebookLM upload, query, or answer validation.",
    "- No owner decision applied.",
    "- No default-route switch.",
    "",
  ].join("\n");
}

function renderRagRefreshHandoffDecision({ summary, outputDirRef, now }) {
  return [
    "schema_version: soulforge.rag_refresh_handoff_decision.v0",
    "kind: rag_refresh_handoff_decision",
    `generated_at_utc: ${quoteYaml(now)}`,
    "workflow_id: rag_metadata_refresh_v0",
    "claim_ceiling: observed",
    "decision: aggregate_runner_executed_metadata_only",
    `control_surface_ref: ${quoteYaml(outputDirRef)}`,
    `master_inventory_ref: ${quoteYaml(summary.source_inventory_ref)}`,
    `inventory_summary_ref: ${quoteYaml(path.posix.join(outputDirRef, "inventory_summary.json"))}`,
    `candidate_priority_triage_ref: ${quoteYaml(path.posix.join(outputDirRef, "candidate_priority_triage.json"))}`,
    `sourcebound_review_selection_ref: ${quoteYaml(path.posix.join(outputDirRef, "sourcebound_review_selection.json"))}`,
    "boundary:",
    "  metadata_only: true",
    "  source_text_reading_allowed: false",
    "  source_text_index_build_allowed: false",
    "  notebooklm_upload_or_query_allowed: false",
    "  drive_mutation_allowed: false",
    "  owner_approval_granted_here: false",
    "  public_canon_promotion_allowed: false",
    "  ontology_acceptance_allowed: false",
    "  default_route_switch_allowed: false",
    "next_actions:",
    "  - use_this_folder_as_current_private_knowledge_control_surface",
    "  - run_sourcebound_review_for_selected_candidate_before_dev_erp_import",
    "  - keep_candidate_ledger_append_only_and_record_future_decisions_as_new_metadata",
    "",
  ].join("\n");
}

function renderControlSurfaceBinding({ summary, outputDirRef, now }) {
  return [
    "schema_version: soulforge.master_knowledge_inventory_control_surface.v0",
    "kind: master_knowledge_inventory_control_surface",
    `generated_at_utc: ${quoteYaml(now)}`,
    "status: active",
    "claim_ceiling: observed",
    `current_control_surface_ref: ${quoteYaml(outputDirRef)}`,
    `master_inventory_ref: ${quoteYaml(summary.source_inventory_ref)}`,
    `csv_ref: ${quoteYaml(summary.csv_ref)}`,
    `summary_ref: ${quoteYaml(path.posix.join(outputDirRef, "inventory_summary.json"))}`,
    "recurring_refresh_command: \"npm run guild-hall:rag -- master-inventory-refresh --write --date YYYY-MM-DD\"",
    "boundary:",
    "  metadata_only: true",
    "  notebooklm_answers_included: false",
    "  source_payloads_included: false",
    "  raw_questions_included: false",
    "  secrets_included: false",
    "  owner_approval_granted_here: false",
    "non_claims:",
    "  - source_truth",
    "  - public_canon_promotion",
    "  - ontology_acceptance",
    "  - default_route_safety",
    "",
  ].join("\n");
}

function renderCandidatePriorityTriageMarkdown(triage) {
  return [
    `# Candidate Ledger Priority Triage - ${triage.generated_at_utc.slice(0, 10)}`,
    "",
    "Claim ceiling: observed",
    "",
    "## Summary",
    "",
    ...Object.entries(triage.by_priority_lane).map(([lane, count]) => `- ${lane}: ${count}`),
    "",
    "## Items",
    "",
    "| Rank | Candidate | Lane | Decision | Next action |",
    "| ---: | --- | --- | --- | --- |",
    ...triage.items.map(
      (item) =>
        `| ${item.priority_rank} | \`${item.candidate_id}\` | ${item.priority_lane} | ${item.decision} | ${item.recommended_next_action} |`,
    ),
    "",
    "## Boundary",
    "",
    "This triage is metadata-only. It does not close owner decisions, approve sources, promote canon, or mutate graph/RAG indexes.",
    "",
  ].join("\n");
}

function renderSourceboundReviewSelectionMarkdown(selection) {
  const selected = selection.selected_candidate;
  return [
    `# Sourcebound Review Selection - ${selection.generated_at_utc.slice(0, 10)}`,
    "",
    "Claim ceiling: observed",
    "",
    selected ? `Selected candidate: \`${selected.candidate_id}\`` : "Selected candidate: none",
    selected ? `Selected target: ${selected.title}` : "",
    selected ? `Reason: ${selected.reason}` : "",
    selected ? `Next action: ${selected.next_action}` : "",
    "",
    "## Required Before Review",
    "",
    ...(selected?.required_before_import ?? []).map((item) => `- ${item}`),
    "",
    "## Alternates",
    "",
    ...selection.alternate_candidates.map((item) => `- \`${item.candidate_id}\`: ${item.next_action}`),
    "",
    "## Non-Claims",
    "",
    ...selection.non_claims.map((item) => `- ${item}`),
    "",
  ].join("\n");
}

function renderValidationLog({ validation, summary, candidateTriage, sourceboundSelection }) {
  return [
    `# Master Knowledge Inventory Refresh Validation - ${summary.generated_at_utc.slice(0, 10)}`,
    "",
    `Runner: \`${MASTER_INVENTORY_REFRESH_RUNNER_ID}\``,
    `Validation status: ${validation.status}`,
    "",
    "## Checks",
    "",
    `- Inventory rows: ${summary.summary.total_rows}`,
    `- Public knowledge missing claim ceiling: ${summary.summary.public_knowledge_missing_claim_ceiling}`,
    `- Candidate rows triaged: ${candidateTriage.total_candidates}`,
    `- NotebookLM notebooks from metadata mirror: ${summary.summary.notebooklm_notebooks}`,
    `- NotebookLM sources from metadata mirror: ${summary.summary.notebooklm_sources}`,
    `- Selected sourcebound candidate: ${sourceboundSelection.selected_candidate?.candidate_id ?? "none"}`,
    `- Secret-like paths skipped: ${summary.summary.scan.skipped_secret_like_paths}`,
    "",
    "## Boundary",
    "",
    "- Metadata-only output.",
    "- No source text read.",
    "- No source-text index build.",
    "- No NotebookLM live query or answer import.",
    "- No Drive mutation.",
    "- No owner approval, ontology acceptance, public canon promotion, or default-route switch.",
    "",
    "## Errors",
    "",
    ...(validation.errors.length ? validation.errors.map((error) => `- ${error}`) : ["- none"]),
    "",
  ].join("\n");
}

function classifyOwnerSurface(ref) {
  if (ref.startsWith("_workmeta/system/knowledge_rag_candidate_ledger")) return "_workmeta/system/knowledge_rag_candidate_ledger";
  if (ref.startsWith("_workmeta/system/reports/knowledge_access")) return "_workmeta/system/reports/knowledge_access";
  if (ref.startsWith("_workmeta/system/reports/knowledge_wiki")) return "_workmeta/system/reports/knowledge_wiki";
  if (ref.startsWith("_workmeta/system/reports/post_development_review")) return "_workmeta/system/reports/post_development_review";
  if (ref.startsWith("_workmeta/system/reports/procedure_capture")) return "_workmeta/system/reports/procedure_capture";
  if (ref.startsWith("_workmeta/system/reports/rag")) return "_workmeta/system/reports/rag";
  if (ref.startsWith("_workspaces/knowledge/common")) return "_workspaces/knowledge/common";
  if (ref.startsWith("_workspaces/knowledge/rag")) return "_workspaces/knowledge/rag";
  if (ref.startsWith("_workspaces/knowledge/source_cards")) return "_workspaces/knowledge/source_cards";
  if (ref.startsWith("_workspaces/knowledge/wiki")) return "_workspaces/knowledge/wiki";
  if (ref.startsWith(".registry/knowledge")) return ".registry/knowledge";
  if (ref.startsWith(".workflow")) return ".workflow";
  if (ref.startsWith(".party")) return ".party";
  if (ref.startsWith("docs/architecture")) return "docs/architecture";
  if (ref.startsWith("guild_hall/knowledge_access")) return "guild_hall/knowledge_access";
  if (ref.startsWith("guild_hall/knowledge_graph")) return "guild_hall/knowledge_graph";
  if (ref.startsWith("guild_hall/rag")) return "guild_hall/rag";
  return "other";
}

function classifyFileKind(ref) {
  if (ref.endsWith("knowledge.yaml") && ref.startsWith(".registry/knowledge/")) return "public_canon_knowledge_file";
  if (ref.endsWith(".jsonl") && ref.includes("knowledge_rag_candidate_ledger")) return "knowledge_rag_candidate_ledger";
  if (ref.endsWith("notebooklm_metadata_inventory.json")) return "notebooklm_metadata_or_report";
  if (ref.endsWith("master_knowledge_inventory.json")) return "master_knowledge_inventory_artifact";
  if (ref.endsWith("source_card.json") || ref.endsWith(".source_card.json")) return "knowledge_source_card";
  if (ref.endsWith("source_sync_ready_manifest.json")) return "source_sync_ready_manifest";
  if (ref.endsWith("source_text_index.json")) return "source_text_index";
  if (ref.endsWith("source_text_quality_review.json")) return "source_text_quality_review";
  if (ref.endsWith("source_text_work_card.json")) return "source_text_work_card";
  if (ref.endsWith("source_text_answer_run.json")) return "source_text_answer_run_ref_only";
  if (ref.endsWith("source_text_traceability_sidecar.json")) return "source_text_traceability_sidecar";
  if (ref.endsWith("sourcebound_knowledge_map.json")) return "private_sourcebound_knowledge_map";
  if (ref.endsWith("knowledge_map_manifest.json")) return "private_sourcebound_knowledge_map_manifest";
  if (ref.includes("/rag/") || ref.includes("rag")) return "knowledge_rag_report_or_metadata";
  if (ref.startsWith(".workflow/")) return "workflow_metadata_or_support";
  if (ref.startsWith(".party/")) return "party_metadata_or_support";
  if (ref.startsWith("guild_hall/")) return "helper_program_surface";
  return "other_metadata_or_support";
}

function classifyFileLevel(ref) {
  const kind = classifyFileKind(ref);
  if (kind === "knowledge_source_card" || kind === "source_sync_ready_manifest") return "L1_source_intake_or_readiness";
  if (kind === "source_text_index" || kind === "source_text_traceability_sidecar") return "L2_searchable_rag";
  if (kind === "source_text_quality_review" || kind === "source_text_work_card" || kind === "source_text_answer_run_ref_only") {
    return "L3_work_ready_rag_support";
  }
  if (kind === "private_sourcebound_knowledge_map" || kind === "private_sourcebound_knowledge_map_manifest") {
    return "L4_private_wiki_or_sourcebound_candidate";
  }
  if (kind === "public_canon_knowledge_file") return "L0_metadata_or_support";
  if (ref.startsWith(".workflow/rag_metadata_refresh_v0")) return "L0_refresh_route";
  return "L0_metadata_or_support";
}

function classifyFileClaimCeiling(ref) {
  const kind = classifyFileKind(ref);
  if (kind === "public_canon_knowledge_file") return "observed";
  if (kind === "knowledge_source_card" || kind === "source_sync_ready_manifest") return "source_supported_or_observed_by_source_card";
  if (kind === "source_text_quality_review" || kind === "source_text_work_card" || kind === "source_text_answer_run_ref_only") {
    return "observed_until_sourcebound_review";
  }
  if (ref.startsWith(".workflow/rag_metadata_refresh_v0")) return "pilot_executed_not_default_route_safe";
  return "observed";
}

function classifyRelationHooks(ref) {
  const hooks = [];
  if (ref.startsWith(".workflow/")) hooks.push("chains");
  if (ref.startsWith(".party/")) hooks.push("routes_to");
  if (ref.includes("source_card") || ref.includes("source_sync_ready")) hooks.push("source_ref");
  if (ref.includes("source_text_index")) hooks.push("retrieval_metadata");
  if (ref.includes("sourcebound_knowledge_map")) hooks.push("derived_from");
  if (ref.includes("candidate")) hooks.push("requires_owner_decision");
  return hooks.length ? hooks : ["inventory_metadata"];
}

function classifyRouteHint(ref) {
  if (ref.includes("sourcebound")) return "sourcebound_review_route";
  if (ref.includes("candidate")) return "candidate_or_owner_decision_route";
  if (ref.includes("rag")) return "rag_metadata_refresh_route";
  if (ref.startsWith(".registry/knowledge")) return "public_knowledge_registry";
  return "metadata_inventory";
}

function classifyRisk(ref) {
  const kind = classifyFileKind(ref);
  if (kind === "source_text_answer_run_ref_only") return "ref_only_answer_body_not_copied";
  if (kind.startsWith("private_") || ref.startsWith("_workspaces/knowledge")) return "private_payload_metadata_only_output";
  return "metadata_ok";
}

function classifyNextAction(ref) {
  const kind = classifyFileKind(ref);
  if (kind === "public_canon_knowledge_file") return "retain_with_explicit_claim_ceiling";
  if (kind === "private_sourcebound_knowledge_map") return "review_before_public_promotion";
  if (kind === "knowledge_rag_candidate_ledger") return "triage_candidates";
  if (kind === "notebooklm_metadata_or_report") return "navigation_only_refresh_when_needed";
  return "retain_as_inventory_metadata";
}

function normalizeNow(now, date) {
  if (now && date) throw new Error("use either --now or --date, not both");
  if (now) return new Date(now).toISOString();
  if (date) return new Date(`${date}T00:00:00.000Z`).toISOString();
  return new Date().toISOString();
}

function normalizeSafeId(value) {
  const normalized = String(value ?? "").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/u.test(normalized)) {
    throw new Error(`invalid safe id: ${value}`);
  }
  return normalized;
}

function normalizeScanRoots(values) {
  return values.map((value) => safeRepoRelativeRef(value));
}

function safeRepoRelativeRef(value) {
  const normalized = normalizeRepoPath(path.posix.normalize(String(value ?? "").trim()));
  if (!normalized || normalized === "." || normalized.startsWith("../") || normalized.startsWith("/") || /^[A-Za-z]:/u.test(normalized)) {
    throw new Error(`invalid repo-relative ref: ${value}`);
  }
  return normalized;
}

function isSecretLikePath(ref) {
  return SECRET_LIKE_SEGMENT_PATTERN.test(ref) || path.posix.basename(ref).startsWith(".env");
}

function parseFlatYamlFields(raw) {
  const fields = {};
  for (const line of raw.split(/\r?\n/u)) {
    const match = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/u);
    if (!match) continue;
    fields[match[1]] = unquoteYamlScalar(match[2]);
  }
  return fields;
}

function unquoteYamlScalar(value) {
  const trimmed = String(value ?? "").trim();
  if ((trimmed.startsWith("\"") && trimmed.endsWith("\"")) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed || null;
}

function countBy(items, key) {
  const counts = {};
  for (const item of items) {
    const value = String(item[key] ?? "unknown");
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function csvCell(value) {
  if (value === undefined || value === null) return "";
  const text = String(value);
  if (/[",\n\r]/u.test(text)) return `"${text.replaceAll("\"", "\"\"")}"`;
  return text;
}

function rowId(kind, ref) {
  return `${kind}_${fingerprint(ref)}`;
}

function fingerprint(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 16);
}

function quoteYaml(value) {
  return JSON.stringify(String(value ?? ""));
}
