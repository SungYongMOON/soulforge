import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { normalizeRepoPath, pathExists, readJson, writeJson } from "../shared/io.mjs";
import { loadRagWorkCard, validateRagWorkCard } from "./work_card.mjs";

export const OPERATIONAL_ROUTE_REGISTRY_VALIDATION_SCHEMA_VERSION =
  "soulforge.operational_route_registry_validation.v0";
export const OPERATIONAL_ROUTE_CATALOG_SCHEMA_VERSION = "soulforge.operational_route_catalog.v0";
export const OPERATIONAL_ROUTE_RESOLUTION_SCHEMA_VERSION = "soulforge.operational_route_resolution.v0";
export const OPERATIONAL_ROUTE_SMOKE_RUN_SCHEMA_VERSION = "soulforge.operational_route_smoke_run.v0";
export const OPERATIONAL_ROUTE_USAGE_RECORD_SCHEMA_VERSION = "soulforge.operational_route_usage_record.v0";
export const OPERATIONAL_ROUTE_USAGE_RECORD_VALIDATION_SCHEMA_VERSION =
  "soulforge.operational_route_usage_record_validation.v0";
export const OPERATIONAL_ROUTE_USAGE_SUMMARY_SCHEMA_VERSION = "soulforge.operational_route_usage_summary.v0";
export const OPERATIONAL_ROUTE_USAGE_SUMMARY_VALIDATION_SCHEMA_VERSION =
  "soulforge.operational_route_usage_summary_validation.v0";
export const OPERATIONAL_ROUTE_CANDIDATE_RECORD_SCHEMA_VERSION =
  "soulforge.operational_route_candidate_record.v0";
export const OPERATIONAL_ROUTE_CANDIDATE_RECORD_VALIDATION_SCHEMA_VERSION =
  "soulforge.operational_route_candidate_record_validation.v0";
export const OPERATIONAL_ROUTE_STATUS_SCHEMA_VERSION = "soulforge.operational_route_status.v0";
export const OPERATIONAL_ROUTE_STATUS_VALIDATION_SCHEMA_VERSION =
  "soulforge.operational_route_status_validation.v0";
export const OPERATIONAL_ROUTE_ANSWER_CARD_VALIDATION_SCHEMA_VERSION =
  "soulforge.operational_route_answer_card_validation.v0";
export const OPERATIONAL_ROUTE_PREFLIGHT_SCHEMA_VERSION = "soulforge.operational_route_preflight.v0";
export const OPERATIONAL_ROUTE_PREFLIGHT_VALIDATION_SCHEMA_VERSION =
  "soulforge.operational_route_preflight_validation.v0";
export const OPERATIONAL_ROUTE_DASHBOARD_SCHEMA_VERSION = "soulforge.operational_route_dashboard.v0";
export const OPERATIONAL_ROUTE_DASHBOARD_VALIDATION_SCHEMA_VERSION =
  "soulforge.operational_route_dashboard_validation.v0";
export const OPERATIONAL_ROUTE_SESSION_SCHEMA_VERSION = "soulforge.operational_route_session.v0";
export const OPERATIONAL_ROUTE_SESSION_VALIDATION_SCHEMA_VERSION =
  "soulforge.operational_route_session_validation.v0";
export const OPERATIONAL_ROUTE_SESSION_SWEEP_SCHEMA_VERSION = "soulforge.operational_route_session_sweep.v0";
export const OPERATIONAL_ROUTE_SESSION_SWEEP_VALIDATION_SCHEMA_VERSION =
  "soulforge.operational_route_session_sweep_validation.v0";
export const OPERATIONAL_ROUTE_CALL_PLAN_SCHEMA_VERSION = "soulforge.operational_route_call_plan.v0";
export const OPERATIONAL_ROUTE_CALL_PLAN_VALIDATION_SCHEMA_VERSION =
  "soulforge.operational_route_call_plan_validation.v0";
export const OPERATIONAL_ROUTE_CLOSEOUT_SCHEMA_VERSION = "soulforge.operational_route_closeout.v0";
export const OPERATIONAL_ROUTE_CLOSEOUT_VALIDATION_SCHEMA_VERSION =
  "soulforge.operational_route_closeout_validation.v0";
export const OPERATIONAL_ROUTE_REVIEW_GATE_SCHEMA_VERSION = "soulforge.operational_route_review_gate.v0";
export const OPERATIONAL_ROUTE_REVIEW_GATE_VALIDATION_SCHEMA_VERSION =
  "soulforge.operational_route_review_gate_validation.v0";
export const OPERATIONAL_ROUTE_COMMAND_SHEET_SCHEMA_VERSION = "soulforge.operational_route_command_sheet.v0";
export const OPERATIONAL_ROUTE_COMMAND_SHEET_VALIDATION_SCHEMA_VERSION =
  "soulforge.operational_route_command_sheet_validation.v0";
export const OPERATIONAL_ROUTE_OPS_CHECK_SCHEMA_VERSION = "soulforge.operational_route_ops_check.v0";
export const OPERATIONAL_ROUTE_OPS_CHECK_VALIDATION_SCHEMA_VERSION =
  "soulforge.operational_route_ops_check_validation.v0";
export const OPERATIONAL_ROUTE_READINESS_SCHEMA_VERSION = "soulforge.operational_route_readiness.v0";
export const OPERATIONAL_ROUTE_READINESS_VALIDATION_SCHEMA_VERSION =
  "soulforge.operational_route_readiness_validation.v0";
export const OPERATIONAL_ROUTE_EVIDENCE_SWEEP_SCHEMA_VERSION =
  "soulforge.operational_route_evidence_sweep.v0";
export const OPERATIONAL_ROUTE_EVIDENCE_SWEEP_VALIDATION_SCHEMA_VERSION =
  "soulforge.operational_route_evidence_sweep_validation.v0";
export const OPERATIONAL_ROUTE_LATEST_EVIDENCE_SCHEMA_VERSION =
  "soulforge.operational_route_latest_evidence.v0";
export const OPERATIONAL_ROUTE_LATEST_EVIDENCE_VALIDATION_SCHEMA_VERSION =
  "soulforge.operational_route_latest_evidence_validation.v0";
export const OPERATIONAL_ROUTE_OPERATOR_BRIEF_SCHEMA_VERSION =
  "soulforge.operational_route_operator_brief.v0";
export const OPERATIONAL_ROUTE_OPERATOR_BRIEF_VALIDATION_SCHEMA_VERSION =
  "soulforge.operational_route_operator_brief_validation.v0";
export const OPERATIONAL_ROUTE_OPERATOR_DOC_DRIFT_SCHEMA_VERSION =
  "soulforge.operational_route_operator_doc_drift.v0";
export const OPERATIONAL_ROUTE_OPERATOR_DOC_DRIFT_VALIDATION_SCHEMA_VERSION =
  "soulforge.operational_route_operator_doc_drift_validation.v0";
export const OPERATIONAL_ROUTE_OPERATOR_HEALTH_SCHEMA_VERSION =
  "soulforge.operational_route_operator_health.v0";
export const OPERATIONAL_ROUTE_OPERATOR_HEALTH_VALIDATION_SCHEMA_VERSION =
  "soulforge.operational_route_operator_health_validation.v0";
export const OPERATIONAL_ROUTE_SUGGESTION_SAFETY_SCHEMA_VERSION =
  "soulforge.operational_route_suggestion_safety.v0";
export const OPERATIONAL_ROUTE_SUGGESTION_SAFETY_VALIDATION_SCHEMA_VERSION =
  "soulforge.operational_route_suggestion_safety_validation.v0";

const ROUTE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const SAFE_APPROVED_ROOTS = [
  ".party/",
  ".registry/",
  ".unit/",
  ".workflow/",
  "_workmeta/",
  "_workspaces/knowledge/",
  "_workspaces/system/knowledge_view/",
  "_workspaces/system/rag/",
  "docs/",
  "guild_hall/",
];
const DEFAULT_USAGE_RECORD_ROOT = "_workmeta/system/reports/rag/operational_route_usage";
const DEFAULT_USAGE_SUMMARY_ROOT = "_workmeta/system/reports/rag/operational_route_usage_summary";
const DEFAULT_CANDIDATE_RECORD_ROOT = "_workmeta/system/reports/rag/operational_route_candidates";
const DEFAULT_OPERATIONAL_ROUTE_STATUS_ROOT = "_workmeta/system/reports/rag/operational_route_status";
const DEFAULT_OPERATIONAL_ROUTE_PREFLIGHT_ROOT = "_workmeta/system/reports/rag/operational_route_preflight";
const DEFAULT_OPERATIONAL_ROUTE_SESSION_ROOT = "_workmeta/system/reports/rag/operational_route_runs";
const DEFAULT_OPERATIONAL_ROUTE_SESSION_SWEEP_ROOT = "_workmeta/system/reports/rag/operational_route_sweeps";
const DEFAULT_OPERATIONAL_ROUTE_CALL_PLAN_ROOT = "_workmeta/system/reports/rag/operational_route_call_plans";
const DEFAULT_OPERATIONAL_ROUTE_OPS_CHECK_ROOT = "_workmeta/system/reports/rag/operational_route_ops_check";
const DEFAULT_OPERATIONAL_ROUTE_READINESS_ROOT = "_workmeta/system/reports/rag/operational_route_readiness";
const DEFAULT_OPERATIONAL_ROUTE_EVIDENCE_SWEEP_ROOT =
  "_workmeta/system/reports/rag/operational_route_evidence_sweeps";
const DEFAULT_OPERATIONAL_ROUTE_LATEST_EVIDENCE_ROOT =
  "_workmeta/system/reports/rag/operational_route_latest_evidence";
const DEFAULT_OPERATIONAL_ROUTE_OPERATOR_BRIEF_ROOT =
  "_workmeta/system/reports/rag/operational_route_operator_briefs";
const DEFAULT_OPERATIONAL_ROUTE_OPERATOR_DOC_DRIFT_ROOT =
  "_workmeta/system/reports/rag/operational_route_doc_drift";
const DEFAULT_OPERATIONAL_ROUTE_OPERATOR_HEALTH_ROOT =
  "_workmeta/system/reports/rag/operational_route_operator_health";
const DEFAULT_OPERATIONAL_ROUTE_SUGGESTION_SAFETY_ROOT =
  "_workmeta/system/reports/rag/operational_route_suggestion_safety";
const REQUIRED_FALSE_BOUNDARY_KEYS = [
  "source_text_included",
  "chunk_text_included",
  "copied_excerpt_included",
  "notebooklm_answer_included",
  "source_truth_claimed",
  "final_answer_authority_allowed",
  "public_canon_promotion_allowed",
  "ontology_acceptance_allowed",
  "external_upload_allowed",
  "default_route_mutation_allowed",
  "graph_truth_mutation_allowed",
];
const FORBIDDEN_PAYLOAD_KEYS = new Set([
  "answer_card_body",
  "answer_shell_output",
  "body",
  "body_html",
  "body_text",
  "chunk",
  "chunk_payload",
  "chunk_text",
  "chunks",
  "content",
  "excerpt",
  "html",
  "mail_body",
  "notebooklm_answer",
  "notebooklm_answer_text",
  "payload",
  "private_payload",
  "raw",
  "raw_payload",
  "raw_source_text",
  "source_body",
  "source_chunk",
  "source_chunks",
  "source_content",
  "source_payload",
  "source_text",
  "text",
]);
const SECRET_LIKE_KEYS = new Set([
  "access_token",
  "api_key",
  "authorization",
  "bearer_token",
  "client_secret",
  "cookie",
  "credential",
  "credentials",
  "password",
  "private_key",
  "refresh_token",
  "secret",
  "session",
  "token",
]);
const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "for",
  "from",
  "in",
  "of",
  "or",
  "summary",
  "the",
  "to",
  "with",
]);

export async function loadOperationalRouteRegistry(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const registryRef = safeOperationalRouteRef(options.registryRef);
  const raw = await fs.readFile(path.join(repoRoot, registryRef), "utf8");
  const registry = parseYaml(stripBom(raw));
  if (!registry || typeof registry !== "object" || Array.isArray(registry)) {
    throw new Error("operational route registry must be a YAML mapping");
  }
  return registry;
}

export async function validateOperationalRouteRegistry(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const registry = options.registry ?? (await loadOperationalRouteRegistry(options));
  const registryRef = options.registryRef ? safeOperationalRouteRef(options.registryRef) : null;
  const blockers = [];
  const warnings = [];
  const routes = [];
  const routeIds = new Set();
  let checkedRefCount = 0;
  let missingRefCount = 0;

  if (!String(registry.schema_version ?? "").includes("operational_route_registry.v0")) {
    blockers.push("schema_version_must_be_operational_route_registry_v0");
  }
  if (registry.kind !== "private_operational_route_registry") {
    blockers.push("kind_must_be_private_operational_route_registry");
  }
  if (!ROUTE_ID_PATTERN.test(String(registry.registry_id ?? ""))) {
    blockers.push("registry_id_must_be_safe_id");
  }
  for (const key of REQUIRED_FALSE_BOUNDARY_KEYS) {
    if (registry.boundary?.[key] !== false) {
      blockers.push(`boundary_${key}_must_be_false`);
    }
  }
  if (registry.route_defaults?.source_payload_loading_allowed !== false) {
    blockers.push("route_defaults_source_payload_loading_allowed_must_be_false");
  }
  if (registry.route_defaults?.use_as_public_default_route !== false) {
    blockers.push("route_defaults_use_as_public_default_route_must_be_false");
  }
  if (registry.route_defaults?.claim_ceiling === undefined) {
    blockers.push("route_defaults_claim_ceiling_required");
  }

  const unsafeValueBlockers = findUnsafeOperationalRouteValues(registry, "registry");
  blockers.push(...unsafeValueBlockers);

  const controlRefBlockers = validateRefMap(registry.control_refs, "control_refs");
  blockers.push(...controlRefBlockers.blockers);
  checkedRefCount += controlRefBlockers.checkedRefCount;
  const controlRefMissing = await countMissingRefs({
    repoRoot,
    refs: controlRefBlockers.refs,
    checkFiles: options.checkFiles !== false,
  });
  missingRefCount += controlRefMissing;
  if (controlRefMissing > 0) {
    blockers.push(`control_refs_missing:${controlRefMissing}`);
  }

  const routeList = Array.isArray(registry.routes) ? registry.routes : [];
  if (!Array.isArray(registry.routes) || routeList.length === 0) {
    blockers.push("routes_must_be_nonempty_array");
  }

  for (const [index, route] of routeList.entries()) {
    const routeBlockers = [];
    const routeId = String(route?.route_id ?? "");
    const routeTrail = `routes[${index}]`;
    if (!ROUTE_ID_PATTERN.test(routeId)) {
      routeBlockers.push(`${routeTrail}.route_id_must_be_safe_id`);
    } else if (routeIds.has(routeId)) {
      routeBlockers.push(`${routeTrail}.route_id_must_be_unique`);
    } else {
      routeIds.add(routeId);
    }
    if (!Array.isArray(route?.trigger_labels) || route.trigger_labels.length === 0) {
      routeBlockers.push(`${routeTrail}.trigger_labels_must_be_nonempty_array`);
    }
    if (!ROUTE_ID_PATTERN.test(String(route?.selected_work_card_id ?? ""))) {
      routeBlockers.push(`${routeTrail}.selected_work_card_id_must_be_safe_id`);
    }
    const evidencePages = validatePageArray(route?.evidence_pages);
    if (!evidencePages.valid) {
      routeBlockers.push(`${routeTrail}.evidence_pages_must_be_positive_integer_array`);
    }
    const reviewPages = validatePageArray(route?.review_context_pages, { allowEmpty: true });
    if (!reviewPages.valid) {
      routeBlockers.push(`${routeTrail}.review_context_pages_must_be_positive_integer_array`);
    }
    const routeRefs = [
      ["selected_work_card_ref", route?.selected_work_card_ref],
      ["operator_answer_card_ref", route?.operator_answer_card_ref],
      ["wiki_page_ref", route?.wiki_page_ref],
    ];
    const safeRefs = [];
    for (const [key, value] of routeRefs) {
      if (!value) {
        routeBlockers.push(`${routeTrail}.${key}_required`);
        continue;
      }
      const safe = trySafeOperationalRouteRef(value);
      if (!safe.ok) {
        routeBlockers.push(`${routeTrail}.${key}_unsafe_ref`);
        continue;
      }
      checkedRefCount += 1;
      safeRefs.push({ key, ref: safe.ref });
    }
    const routeMissingCount = await countMissingRefs({
      repoRoot,
      refs: safeRefs.map((item) => item.ref),
      checkFiles: options.checkFiles !== false,
    });
    missingRefCount += routeMissingCount;
    if (routeMissingCount > 0) {
      routeBlockers.push(`${routeTrail}.missing_refs:${routeMissingCount}`);
    }
    let workCardValidationStatus = "not_checked";
    let workCardValidationBlockerCount = 0;
    const selectedWorkCardRef = safeRefs.find((item) => item.key === "selected_work_card_ref")?.ref;
    if (options.checkWorkCards !== false && selectedWorkCardRef && routeMissingCount === 0) {
      try {
        const workCard = await loadRagWorkCard({ repoRoot, workCardRef: selectedWorkCardRef });
        const workCardValidation = validateRagWorkCard(workCard);
        workCardValidationStatus = workCardValidation.status;
        workCardValidationBlockerCount = workCardValidation.blocker_count;
        if (workCardValidation.status !== "pass") {
          routeBlockers.push(`${routeTrail}.selected_work_card_validation_blocked:${workCardValidation.blocker_count}`);
        }
      } catch {
        workCardValidationStatus = "blocked";
        workCardValidationBlockerCount = 1;
        routeBlockers.push(`${routeTrail}.selected_work_card_validation_error`);
      }
    }
    blockers.push(...routeBlockers);
    routes.push({
      route_id: routeId || null,
      status: routeBlockers.length === 0 ? "pass" : "blocked",
      blocker_count: routeBlockers.length,
      checked_ref_count: safeRefs.length,
      missing_ref_count: routeMissingCount,
      work_card_validation_status: workCardValidationStatus,
      work_card_validation_blocker_count: workCardValidationBlockerCount,
      evidence_page_count: evidencePages.values.length,
      review_context_page_count: reviewPages.values.length,
      claim_ceiling: route.claim_ceiling ?? registry.route_defaults?.claim_ceiling ?? null,
    });
  }

  return {
    schema_version: OPERATIONAL_ROUTE_REGISTRY_VALIDATION_SCHEMA_VERSION,
    kind: "operational_route_registry_validation",
    status: blockers.length === 0 ? "pass" : "blocked",
    registry_ref: registryRef,
    registry_id: registry.registry_id ?? null,
    counts: {
      route_count: routeList.length,
      checked_ref_count: checkedRefCount,
      missing_ref_count: missingRefCount,
      blocker_count: blockers.length,
      warning_count: warnings.length,
    },
    blockers,
    warnings,
    routes,
    boundary: operationalRouteBoundary(),
  };
}

export async function buildOperationalRouteCatalog(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const registryRef = safeOperationalRouteRef(options.registryRef);
  const registry = options.registry ?? (await loadOperationalRouteRegistry({ repoRoot, registryRef }));
  const validation = await validateOperationalRouteRegistry({
    repoRoot,
    registry,
    registryRef,
    checkFiles: options.checkFiles !== false,
    checkWorkCards: options.checkWorkCards !== false,
  });
  const defaultClaimCeiling = registry.route_defaults?.claim_ceiling ?? null;
  const routes = (Array.isArray(registry.routes) ? registry.routes : []).map((route) => ({
    route_id: route.route_id ?? null,
    selected_work_card_id: route.selected_work_card_id ?? null,
    selected_work_card_ref: route.selected_work_card_ref ?? null,
    operator_answer_card_ref: route.operator_answer_card_ref ?? null,
    wiki_page_ref: route.wiki_page_ref ?? null,
    evidence_pages: Array.isArray(route.evidence_pages) ? [...route.evidence_pages] : [],
    review_context_pages: Array.isArray(route.review_context_pages) ? [...route.review_context_pages] : [],
    claim_ceiling: route.claim_ceiling ?? defaultClaimCeiling,
    trigger_label_count: Array.isArray(route.trigger_labels) ? route.trigger_labels.length : 0,
    current_known_gap: route.current_known_gap ?? null,
  }));
  return {
    schema_version: OPERATIONAL_ROUTE_CATALOG_SCHEMA_VERSION,
    kind: "operational_route_catalog",
    status: validation.status === "pass" ? "ready_private_manual_review" : "blocked_registry_invalid",
    generated_at_utc: formatTimestampUtc(options.now),
    registry_ref: registryRef,
    registry_id: registry.registry_id ?? null,
    validation_status: validation.status,
    counts: {
      route_count: routes.length,
      blocker_count: validation.counts?.blocker_count ?? 0,
      warning_count: validation.counts?.warning_count ?? 0,
    },
    routes,
    boundary: operationalRouteBoundary(),
  };
}

export function renderOperationalRouteCatalogText(catalog) {
  const lines = [
    `Status: ${catalog.status}`,
    `Registry: ${catalog.registry_ref}`,
    `Routes: ${catalog.counts?.route_count ?? 0}`,
    `Registry validation: ${catalog.validation_status}`,
    "",
  ];
  for (const route of catalog.routes ?? []) {
    lines.push(
      `- ${route.route_id}`,
      `  Work card: ${route.selected_work_card_id}`,
      `  Work card ref: ${route.selected_work_card_ref}`,
      `  Operator answer card: ${route.operator_answer_card_ref}`,
      `  Wiki page: ${route.wiki_page_ref}`,
      `  Evidence pages: ${(route.evidence_pages ?? []).join(", ")}`,
      `  Review context pages: ${(route.review_context_pages ?? []).join(", ")}`,
      `  Claim ceiling: ${route.claim_ceiling}`,
      `  Trigger labels: ${route.trigger_label_count}`,
      `  Current known gap: ${route.current_known_gap ?? "(none)"}`,
    );
  }
  lines.push(
    "",
    "Boundary: route catalog metadata only. It lists private/manual-review routes and refs, but does not load source text, chunks, raw queries, answer-card bodies, final answer authority, public canon, ontology acceptance, graph truth, or default-route mutation.",
    "",
  );
  return lines.join("\n");
}

export async function resolveOperationalRoute(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const registryRef = safeOperationalRouteRef(options.registryRef);
  const registry = options.registry ?? (await loadOperationalRouteRegistry({ repoRoot, registryRef }));
  const validation = await validateOperationalRouteRegistry({
    repoRoot,
    registry,
    registryRef,
    checkFiles: options.checkFiles !== false,
  });
  const queryLabel = String(options.queryLabel ?? "").trim();
  if (!queryLabel) {
    throw new Error("--query-label requires a non-empty value");
  }
  const queryFingerprint = stableHash(`operational_route_query:${queryLabel}`);
  if (validation.status !== "pass") {
    return {
      schema_version: OPERATIONAL_ROUTE_RESOLUTION_SCHEMA_VERSION,
      kind: "operational_route_resolution",
      status: "blocked_registry_invalid",
      generated_at_utc: formatTimestampUtc(options.now),
      registry_ref: registryRef,
      registry_id: registry.registry_id ?? null,
      query_label_fingerprint: queryFingerprint,
      raw_query_persisted: false,
      validation,
      boundary: operationalRouteBoundary(),
    };
  }

  const scored = (registry.routes ?? [])
    .map((route) => scoreRoute(route, queryLabel))
    .sort((left, right) => right.score - left.score || String(left.route.route_id).localeCompare(String(right.route.route_id)));
  const best = scored[0];
  if (!best || best.score <= 0) {
    return {
      schema_version: OPERATIONAL_ROUTE_RESOLUTION_SCHEMA_VERSION,
      kind: "operational_route_resolution",
      status: "blocked_no_route",
      generated_at_utc: formatTimestampUtc(options.now),
      registry_ref: registryRef,
      registry_id: registry.registry_id ?? null,
      query_label_fingerprint: queryFingerprint,
      raw_query_persisted: false,
      match: {
        score: best?.score ?? 0,
        route_count_checked: scored.length,
      },
      boundary: operationalRouteBoundary(),
    };
  }

  const route = best.route;
  return {
    schema_version: OPERATIONAL_ROUTE_RESOLUTION_SCHEMA_VERSION,
    kind: "operational_route_resolution",
    status: "matched",
    generated_at_utc: formatTimestampUtc(options.now),
    registry_ref: registryRef,
    registry_id: registry.registry_id ?? null,
    query_label_fingerprint: queryFingerprint,
    raw_query_persisted: false,
    selected_route: {
      route_id: route.route_id,
      route_state: registry.route_defaults?.route_state ?? null,
      response_mode: registry.route_defaults?.response_mode ?? null,
      selected_work_card_id: route.selected_work_card_id,
      selected_work_card_ref: route.selected_work_card_ref,
      operator_answer_card_ref: route.operator_answer_card_ref,
      wiki_page_ref: route.wiki_page_ref,
      evidence_pages: route.evidence_pages ?? [],
      review_context_pages: route.review_context_pages ?? [],
      claim_ceiling: route.claim_ceiling ?? registry.route_defaults?.claim_ceiling ?? null,
      current_known_gap: route.current_known_gap ?? null,
    },
    match: {
      score: best.score,
      route_count_checked: scored.length,
      matched_trigger_label_index: best.matchedTriggerLabelIndex,
      matched_trigger_label_fingerprint: best.matchedTriggerLabelFingerprint,
      matched_token_count: best.matchedTokenCount,
    },
    operating_policy: {
      first_step: registry.operating_policy?.first_step ?? null,
      second_step: registry.operating_policy?.second_step ?? null,
      third_step: registry.operating_policy?.third_step ?? null,
      route_missing: registry.operating_policy?.route_missing ?? null,
      stronger_claim_requested: registry.operating_policy?.stronger_claim_requested ?? null,
    },
    boundary: operationalRouteBoundary(),
  };
}

export async function runOperationalRouteSmokeTests(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const registryRef = safeOperationalRouteRef(options.registryRef);
  const smokeTestRef = safeOperationalRouteRef(options.smokeTestRef);
  const smokeTests = await loadOperationalRouteSmokeTests({ repoRoot, smokeTestRef });
  const blockers = [];
  if (smokeTests.kind !== "operational_route_smoke_tests") {
    blockers.push("kind_must_be_operational_route_smoke_tests");
  }
  if (!Array.isArray(smokeTests.tests) || smokeTests.tests.length === 0) {
    blockers.push("tests_must_be_nonempty_array");
  }

  const results = [];
  for (const testCase of smokeTests.tests ?? []) {
    const resolution = await resolveOperationalRoute({
      repoRoot,
      registryRef,
      queryLabel: testCase.query_label,
      now: options.now,
      checkFiles: options.checkFiles !== false,
    });
    const actual = resolution.selected_route ?? {};
    const evidencePagesMatch = sameNumberArray(actual.evidence_pages ?? [], testCase.expected_evidence_pages ?? []);
    const passed =
      resolution.status === "matched" &&
      actual.route_id === testCase.expected_route_id &&
      actual.selected_work_card_id === testCase.expected_work_card_id &&
      evidencePagesMatch;
    if (!passed) {
      blockers.push(`smoke_test_failed:${testCase.test_id ?? "unknown"}`);
    }
    results.push({
      test_id: testCase.test_id ?? null,
      status: passed ? "pass" : "blocked",
      expected_route_id: testCase.expected_route_id ?? null,
      actual_route_id: actual.route_id ?? null,
      expected_work_card_id: testCase.expected_work_card_id ?? null,
      actual_work_card_id: actual.selected_work_card_id ?? null,
      expected_evidence_pages: testCase.expected_evidence_pages ?? [],
      actual_evidence_pages: actual.evidence_pages ?? [],
      evidence_pages_match: evidencePagesMatch,
      match_score: resolution.match?.score ?? 0,
    });
  }

  return {
    schema_version: OPERATIONAL_ROUTE_SMOKE_RUN_SCHEMA_VERSION,
    kind: "operational_route_smoke_run",
    status: blockers.length === 0 ? "pass" : "blocked",
    generated_at_utc: formatTimestampUtc(options.now),
    registry_ref: registryRef,
    smoke_test_ref: smokeTestRef,
    smoke_test_set_id: smokeTests.test_set_id ?? null,
    counts: {
      test_count: results.length,
      pass_count: results.filter((result) => result.status === "pass").length,
      blocked_count: results.filter((result) => result.status !== "pass").length,
      blocker_count: blockers.length,
    },
    blockers,
    tests: results,
    boundary: operationalRouteBoundary(),
  };
}

export async function buildOperationalRouteUsageRecord(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const registryRef = safeOperationalRouteRef(options.registryRef);
  const resolution = await resolveOperationalRoute({
    repoRoot,
    registryRef,
    queryLabel: options.queryLabel,
    checkFiles: options.checkFiles !== false,
    now: options.now,
  });
  const usageId = normalizeSafeId(options.usageId ?? `operational_route_usage_${stableHash([
    registryRef,
    resolution.query_label_fingerprint ?? "query",
    resolution.selected_route?.route_id ?? resolution.status,
    formatTimestampUtc(options.now).slice(0, 10),
  ].join(":")).slice(0, 12)}`);
  const selected = resolution.selected_route ?? null;
  return {
    schema_version: OPERATIONAL_ROUTE_USAGE_RECORD_SCHEMA_VERSION,
    kind: "operational_route_usage_record",
    status: resolution.status === "matched" ? "recorded_matched_route" : "blocked_unmatched_or_invalid_route",
    usage_id: usageId,
    generated_at_utc: formatTimestampUtc(options.now),
    registry_ref: registryRef,
    registry_id: resolution.registry_id ?? null,
    route_id: selected?.route_id ?? null,
    query_label_fingerprint: resolution.query_label_fingerprint ?? null,
    raw_query_persisted: false,
    selected_route: selected
      ? {
          selected_work_card_id: selected.selected_work_card_id,
          selected_work_card_ref: selected.selected_work_card_ref,
          operator_answer_card_ref: selected.operator_answer_card_ref,
          wiki_page_ref: selected.wiki_page_ref,
          evidence_pages: selected.evidence_pages ?? [],
          review_context_pages: selected.review_context_pages ?? [],
          claim_ceiling: selected.claim_ceiling,
          current_known_gap: selected.current_known_gap ?? null,
        }
      : null,
    promotion_signal: {
      usage_count_increment: resolution.status === "matched" ? 1 : 0,
      repeated_use_review_threshold: await readUsageThreshold({ repoRoot, registryRef }),
      route_to_sourcebound_review_when_repeated: resolution.status === "matched",
      stronger_permission_granted_here: false,
    },
    boundary: operationalRouteBoundary(),
  };
}

export async function writeOperationalRouteUsageRecord(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const record = await buildOperationalRouteUsageRecord(options);
  const outputRef = options.outputRef ?? defaultUsageRecordOutputRef(record);
  const outputPath = path.join(repoRoot, safeUsageRecordOutputPath(outputRef));
  await writeJson(outputPath, record);
  return {
    status: "written",
    usage_record_ref: normalizeRepoPath(path.relative(repoRoot, outputPath)),
    usage_id: record.usage_id,
    route_id: record.route_id,
    record_status: record.status,
    raw_query_persisted: record.raw_query_persisted,
    claim_ceiling: record.selected_route?.claim_ceiling ?? null,
  };
}

export async function loadOperationalRouteUsageRecord(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const recordRef = safeUsageRecordRef(options.recordRef ?? options.usageRecordRef);
  return readJson(path.join(repoRoot, recordRef));
}

export function validateOperationalRouteUsageRecord(record) {
  const blockers = [];
  if (record?.schema_version !== OPERATIONAL_ROUTE_USAGE_RECORD_SCHEMA_VERSION) blockers.push("schema_version_mismatch");
  if (record?.kind !== "operational_route_usage_record") blockers.push("kind_must_be_operational_route_usage_record");
  if (!ROUTE_ID_PATTERN.test(String(record?.usage_id ?? ""))) blockers.push("usage_id_must_be_safe_id");
  if (record?.raw_query_persisted !== false) blockers.push("raw_query_must_not_be_persisted");
  const registryRef = trySafeOperationalRouteRef(record?.registry_ref);
  if (!registryRef.ok) blockers.push("registry_ref_unsafe");
  if (record?.route_id !== null && record?.route_id !== undefined && !ROUTE_ID_PATTERN.test(String(record.route_id))) {
    blockers.push("route_id_must_be_safe_id_or_null");
  }
  if (record?.selected_route) {
    const refs = [
      ["selected_work_card_ref", record.selected_route.selected_work_card_ref],
      ["operator_answer_card_ref", record.selected_route.operator_answer_card_ref],
      ["wiki_page_ref", record.selected_route.wiki_page_ref],
    ];
    for (const [key, value] of refs) {
      if (!trySafeOperationalRouteRef(value).ok) blockers.push(`${key}_unsafe`);
    }
    if (!validatePageArray(record.selected_route.evidence_pages).valid) blockers.push("evidence_pages_must_be_positive_integer_array");
  }
  blockers.push(...findUnsafeOperationalRouteValues(record, "usage_record"));
  return {
    schema_version: OPERATIONAL_ROUTE_USAGE_RECORD_VALIDATION_SCHEMA_VERSION,
    kind: "operational_route_usage_record_validation",
    status: blockers.length === 0 ? "pass" : "blocked",
    usage_id: record?.usage_id ?? null,
    route_id: record?.route_id ?? null,
    blocker_count: blockers.length,
    blockers: [...new Set(blockers)].sort(),
    boundary: {
      metadata_only: record?.boundary?.metadata_only === true,
      source_text_loaded: record?.boundary?.source_text_loaded === true,
      raw_query_persisted: record?.raw_query_persisted === true,
      final_answer_authority_allowed: record?.boundary?.final_answer_authority_allowed === true,
      public_canon_promotion_allowed: record?.boundary?.public_canon_promotion_allowed === true,
    },
  };
}

export function renderOperationalRouteUsageRecordText(record) {
  const route = record.selected_route;
  const lines = [
    `Status: ${record.status}`,
    `Usage: ${record.usage_id}`,
    `Registry: ${record.registry_ref}`,
    `Route: ${record.route_id ?? "none"}`,
    `Raw query persisted: ${record.raw_query_persisted === true ? "yes" : "no"}`,
    `Usage count increment: ${record.promotion_signal?.usage_count_increment ?? 0}`,
    `Repeated-use threshold: ${record.promotion_signal?.repeated_use_review_threshold ?? "unknown"}`,
    `Route to sourcebound when repeated: ${record.promotion_signal?.route_to_sourcebound_review_when_repeated === true ? "yes" : "no"}`,
    `Stronger permission granted here: ${record.promotion_signal?.stronger_permission_granted_here === true ? "yes" : "no"}`,
    "Operator health gate checked here: no",
    "Preferred operator path: use operational-route-operator-run with --operational-route-operator-health-ref before recording real usage.",
  ];
  if (route) {
    lines.push(
      `Work card: ${route.selected_work_card_id}`,
      `Work card ref: ${route.selected_work_card_ref}`,
      `Operator answer card: ${route.operator_answer_card_ref}`,
      `Wiki page: ${route.wiki_page_ref}`,
      `Evidence pages: ${(route.evidence_pages ?? []).join(", ")}`,
      `Review context pages: ${(route.review_context_pages ?? []).join(", ")}`,
      `Claim ceiling: ${route.claim_ceiling}`,
      `Known gap: ${route.current_known_gap ?? "none"}`,
    );
  }
  lines.push(
    "",
    "Boundary: usage record is metadata only. It stores a query fingerprint, not the raw query. It does not store answer bodies, source text, chunks, source truth, final-answer authority, public canon, ontology acceptance, graph truth, default-route mutation, or external-upload authority.",
    "",
  );
  return lines.join("\n");
}

export async function buildOperationalRouteUsageSummary(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const registryRef = safeOperationalRouteRef(options.registryRef);
  const registry = await loadOperationalRouteRegistry({ repoRoot, registryRef });
  const usageRootRef = safeUsageRootRef(options.usageRootRef ?? DEFAULT_USAGE_RECORD_ROOT);
  const usageRecordRefs = await collectUsageRecordRefs({ repoRoot, usageRootRef });
  const records = [];
  const invalidRecordRefs = [];
  for (const recordRef of usageRecordRefs) {
    try {
      const record = await loadOperationalRouteUsageRecord({ repoRoot, recordRef });
      const validation = validateOperationalRouteUsageRecord(record);
      if (validation.status !== "pass") {
        invalidRecordRefs.push(recordRef);
        continue;
      }
      if (record.registry_ref === registryRef && record.status === "recorded_matched_route") {
        records.push({ ref: recordRef, record });
      }
    } catch {
      invalidRecordRefs.push(recordRef);
    }
  }
  const threshold = Number.parseInt(String(registry.promotion_triggers?.usage_threshold_for_review ?? "3"), 10);
  const repeatedUseReviewThreshold = Number.isFinite(threshold) && threshold > 0 ? threshold : 3;
  const usageByRoute = new Map();
  for (const item of records) {
    const routeId = item.record.route_id;
    if (!routeId) continue;
    const current = usageByRoute.get(routeId) ?? [];
    current.push(item.ref);
    usageByRoute.set(routeId, current);
  }
  const routeSummaries = (registry.routes ?? []).map((route) => {
    const usageRecordRefsForRoute = usageByRoute.get(route.route_id) ?? [];
    return {
      route_id: route.route_id,
      selected_work_card_id: route.selected_work_card_id ?? null,
      usage_count: usageRecordRefsForRoute.length,
      repeated_use_review_threshold: repeatedUseReviewThreshold,
      repeated_use_review_ready: usageRecordRefsForRoute.length >= repeatedUseReviewThreshold,
      usage_record_refs: usageRecordRefsForRoute.sort(),
      claim_ceiling: route.claim_ceiling ?? registry.route_defaults?.claim_ceiling ?? null,
    };
  });
  const readyRoutes = routeSummaries.filter((route) => route.repeated_use_review_ready);
  const summaryId = normalizeSafeId(options.summaryId ?? `operational_route_usage_summary_${stableHash([
    registryRef,
    usageRootRef,
    formatTimestampUtc(options.now).slice(0, 10),
  ].join(":")).slice(0, 12)}`);
  return {
    schema_version: OPERATIONAL_ROUTE_USAGE_SUMMARY_SCHEMA_VERSION,
    kind: "operational_route_usage_summary",
    status: readyRoutes.length > 0 ? "review_ready_routes_present" : "below_repeated_use_threshold",
    summary_id: summaryId,
    generated_at_utc: formatTimestampUtc(options.now),
    registry_ref: registryRef,
    registry_id: registry.registry_id ?? null,
    usage_root_ref: usageRootRef,
    counts: {
      route_count: routeSummaries.length,
      usage_record_count: records.length,
      invalid_record_count: invalidRecordRefs.length,
      repeated_use_review_ready_route_count: readyRoutes.length,
      repeated_use_review_threshold: repeatedUseReviewThreshold,
    },
    routes: routeSummaries,
    invalid_record_refs: invalidRecordRefs.sort(),
    next_action:
      readyRoutes.length > 0
        ? "route_to_sourcebound_review_for_repeated_real_use"
        : "continue_private_operational_use_and_record_usage_without_raw_queries",
    boundary: operationalRouteBoundary(),
  };
}

export async function writeOperationalRouteUsageSummary(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const summary = await buildOperationalRouteUsageSummary(options);
  const outputRef = options.outputRef ?? defaultUsageSummaryOutputRef(summary);
  const outputPath = path.join(repoRoot, safeUsageSummaryOutputPath(outputRef));
  await writeJson(outputPath, summary);
  return {
    status: "written",
    usage_summary_ref: normalizeRepoPath(path.relative(repoRoot, outputPath)),
    summary_id: summary.summary_id,
    summary_status: summary.status,
    usage_record_count: summary.counts.usage_record_count,
    repeated_use_review_ready_route_count: summary.counts.repeated_use_review_ready_route_count,
  };
}

export async function loadOperationalRouteUsageSummary(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const summaryRef = safeUsageSummaryRef(options.summaryRef ?? options.usageSummaryRef);
  return readJson(path.join(repoRoot, summaryRef));
}

export function validateOperationalRouteUsageSummary(summary) {
  const blockers = [];
  if (summary?.schema_version !== OPERATIONAL_ROUTE_USAGE_SUMMARY_SCHEMA_VERSION) blockers.push("schema_version_mismatch");
  if (summary?.kind !== "operational_route_usage_summary") blockers.push("kind_must_be_operational_route_usage_summary");
  if (!ROUTE_ID_PATTERN.test(String(summary?.summary_id ?? ""))) blockers.push("summary_id_must_be_safe_id");
  if (!trySafeOperationalRouteRef(summary?.registry_ref).ok) blockers.push("registry_ref_unsafe");
  if (!safeUsageRootRef(summary?.usage_root_ref, { throwOnError: false })) blockers.push("usage_root_ref_unsafe");
  if (!Array.isArray(summary?.routes)) blockers.push("routes_must_be_array");
  for (const route of summary?.routes ?? []) {
    if (!ROUTE_ID_PATTERN.test(String(route?.route_id ?? ""))) blockers.push("route_id_must_be_safe_id");
    if (!Array.isArray(route?.usage_record_refs)) blockers.push("usage_record_refs_must_be_array");
    for (const ref of route?.usage_record_refs ?? []) {
      try {
        safeUsageRecordRef(ref);
      } catch {
        blockers.push("usage_record_ref_unsafe");
      }
    }
  }
  blockers.push(...findUnsafeOperationalRouteValues(summary, "usage_summary"));
  return {
    schema_version: OPERATIONAL_ROUTE_USAGE_SUMMARY_VALIDATION_SCHEMA_VERSION,
    kind: "operational_route_usage_summary_validation",
    status: blockers.length === 0 ? "pass" : "blocked",
    summary_id: summary?.summary_id ?? null,
    blocker_count: blockers.length,
    blockers: [...new Set(blockers)].sort(),
    counts: summary?.counts ?? null,
    boundary: {
      metadata_only: summary?.boundary?.metadata_only === true,
      source_text_loaded: summary?.boundary?.source_text_loaded === true,
      final_answer_authority_allowed: summary?.boundary?.final_answer_authority_allowed === true,
      public_canon_promotion_allowed: summary?.boundary?.public_canon_promotion_allowed === true,
    },
  };
}

export function renderOperationalRouteUsageSummaryText(summary) {
  const lines = [
    `Status: ${summary.status}`,
    `Summary: ${summary.summary_id}`,
    `Registry: ${summary.registry_ref}`,
    `Usage root: ${summary.usage_root_ref}`,
    `Routes: ${summary.counts?.route_count ?? 0}`,
    `Usage records: ${summary.counts?.usage_record_count ?? 0}`,
    `Invalid records: ${summary.counts?.invalid_record_count ?? 0}`,
    `Repeated-use threshold: ${summary.counts?.repeated_use_review_threshold ?? "unknown"}`,
    `Ready routes: ${summary.counts?.repeated_use_review_ready_route_count ?? 0}`,
    "Routes:",
    ...(summary.routes ?? []).map(
      (route) =>
        `- ${route.route_id}: usage=${route.usage_count}/${route.repeated_use_review_threshold}, ready=${route.repeated_use_review_ready === true ? "yes" : "no"}, work_card=${route.selected_work_card_id ?? "none"}, claim=${route.claim_ceiling ?? "none"}`,
    ),
    `Next action: ${summary.next_action ?? "none"}`,
    "",
    "Boundary: usage summary is metadata only. It counts usage-record refs without raw queries, answer bodies, source text, chunks, source truth, final-answer authority, public canon, ontology acceptance, graph truth, default-route mutation, or external-upload authority.",
    "",
  ];
  return lines.join("\n");
}

export async function buildOperationalRouteCandidateRecord(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const registryRef = safeOperationalRouteRef(options.registryRef);
  const resolution = await resolveOperationalRoute({
    repoRoot,
    registryRef,
    queryLabel: options.queryLabel,
    checkFiles: options.checkFiles !== false,
    now: options.now,
  });
  const candidateId = normalizeSafeId(options.candidateId ?? `operational_route_candidate_${stableHash([
    registryRef,
    resolution.query_label_fingerprint ?? "query",
    resolution.status,
    formatTimestampUtc(options.now).slice(0, 10),
  ].join(":")).slice(0, 12)}`);
  const unmatched = resolution.status === "blocked_no_route";
  return {
    schema_version: OPERATIONAL_ROUTE_CANDIDATE_RECORD_SCHEMA_VERSION,
    kind: "operational_route_candidate_record",
    status: unmatched ? "recorded_unmatched_route_candidate" : "not_recorded_existing_route_or_invalid_registry",
    candidate_id: candidateId,
    generated_at_utc: formatTimestampUtc(options.now),
    registry_ref: registryRef,
    registry_id: resolution.registry_id ?? null,
    query_label_fingerprint: resolution.query_label_fingerprint ?? null,
    raw_query_persisted: false,
    resolution_status: resolution.status,
    matched_route_id: resolution.selected_route?.route_id ?? null,
    match: {
      score: resolution.match?.score ?? null,
      route_count_checked: resolution.match?.route_count_checked ?? null,
      matched_token_count: resolution.match?.matched_token_count ?? null,
    },
    candidate_signal: {
      candidate_count_increment: unmatched ? 1 : 0,
      owner_review_required: unmatched,
      route_registry_update_allowed_here: false,
      source_text_loading_allowed_here: false,
      default_route_mutation_allowed_here: false,
      stronger_permission_granted_here: false,
    },
    next_action: unmatched
      ? "review_candidate_route_without_raw_query_text"
      : "use_existing_route_or_fix_registry_before_candidate_capture",
    boundary: operationalRouteBoundary(),
  };
}

export async function writeOperationalRouteCandidateRecord(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const record = await buildOperationalRouteCandidateRecord(options);
  const outputRef = options.outputRef ?? defaultCandidateRecordOutputRef(record);
  const outputPath = path.join(repoRoot, safeCandidateRecordOutputPath(outputRef));
  await writeJson(outputPath, record);
  return {
    status: "written",
    candidate_record_ref: normalizeRepoPath(path.relative(repoRoot, outputPath)),
    candidate_id: record.candidate_id,
    record_status: record.status,
    resolution_status: record.resolution_status,
    raw_query_persisted: record.raw_query_persisted,
  };
}

export async function loadOperationalRouteCandidateRecord(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const recordRef = safeCandidateRecordRef(options.recordRef ?? options.candidateRecordRef);
  return readJson(path.join(repoRoot, recordRef));
}

export function validateOperationalRouteCandidateRecord(record) {
  const blockers = [];
  if (record?.schema_version !== OPERATIONAL_ROUTE_CANDIDATE_RECORD_SCHEMA_VERSION) blockers.push("schema_version_mismatch");
  if (record?.kind !== "operational_route_candidate_record") blockers.push("kind_must_be_operational_route_candidate_record");
  if (!ROUTE_ID_PATTERN.test(String(record?.candidate_id ?? ""))) blockers.push("candidate_id_must_be_safe_id");
  if (!trySafeOperationalRouteRef(record?.registry_ref).ok) blockers.push("registry_ref_unsafe");
  if (record?.query_label_fingerprint && !/^[a-f0-9]{64}$/u.test(record.query_label_fingerprint)) {
    blockers.push("query_label_fingerprint_unsafe");
  }
  if (record?.raw_query_persisted !== false) blockers.push("raw_query_must_not_be_persisted");
  if (record?.candidate_signal?.route_registry_update_allowed_here !== false) {
    blockers.push("route_registry_update_must_not_be_allowed_here");
  }
  if (record?.candidate_signal?.source_text_loading_allowed_here !== false) {
    blockers.push("source_text_loading_must_not_be_allowed_here");
  }
  if (record?.candidate_signal?.default_route_mutation_allowed_here !== false) {
    blockers.push("default_route_mutation_must_not_be_allowed_here");
  }
  if (record?.candidate_signal?.stronger_permission_granted_here !== false) {
    blockers.push("stronger_permission_must_not_be_granted_here");
  }
  blockers.push(...findUnsafeOperationalRouteValues(record, "candidate_record"));
  return {
    schema_version: OPERATIONAL_ROUTE_CANDIDATE_RECORD_VALIDATION_SCHEMA_VERSION,
    kind: "operational_route_candidate_record_validation",
    status: blockers.length === 0 ? "pass" : "blocked",
    candidate_id: record?.candidate_id ?? null,
    blocker_count: blockers.length,
    blockers: [...new Set(blockers)].sort(),
    boundary: {
      metadata_only: record?.boundary?.metadata_only === true,
      source_text_loaded: record?.boundary?.source_text_loaded === true,
      raw_query_persisted: record?.raw_query_persisted === true,
      default_route_mutation_allowed: record?.boundary?.default_route_mutation_allowed === true,
    },
  };
}

export function renderOperationalRouteCandidateRecordText(record, options = {}) {
  const previewOnly = options.previewOnly === true;
  const displayStatus = previewOnly && record.status === "recorded_unmatched_route_candidate"
    ? "preview_unmatched_route_candidate_no_write"
    : record.status;
  const lines = [
    `Status: ${displayStatus}`,
    `Candidate: ${record.candidate_id}`,
    `Registry: ${record.registry_ref}`,
    `Resolution: ${record.resolution_status}`,
    `Matched route: ${record.matched_route_id ?? "none"}`,
    `Preview only: ${previewOnly ? "yes" : "no"}`,
    `Raw query persisted: ${record.raw_query_persisted === true ? "yes" : "no"}`,
    `Candidate count increment: ${record.candidate_signal?.candidate_count_increment ?? 0}`,
    `Owner review required: ${record.candidate_signal?.owner_review_required === true ? "yes" : "no"}`,
    `Route registry update allowed here: ${record.candidate_signal?.route_registry_update_allowed_here === true ? "yes" : "no"}`,
    `Source text loading allowed here: ${record.candidate_signal?.source_text_loading_allowed_here === true ? "yes" : "no"}`,
    `Default route mutation allowed here: ${record.candidate_signal?.default_route_mutation_allowed_here === true ? "yes" : "no"}`,
    `Next action: ${record.next_action ?? "none"}`,
    "",
    "Boundary: candidate record is metadata only. It stores a query fingerprint, not the raw query. It does not update the route registry, load source text/chunks, create default routes, launch sourcebound review, or grant source truth, final-answer, public canon, ontology, graph truth, default-route, or external-upload authority.",
    "",
  ];
  return lines.join("\n");
}

export async function buildOperationalRouteStatus(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const registryRef = safeOperationalRouteRef(options.registryRef);
  const registry = await loadOperationalRouteRegistry({ repoRoot, registryRef });
  const usageRootRef = safeUsageRootRef(options.usageRootRef ?? DEFAULT_USAGE_RECORD_ROOT);
  const candidateRootRef = safeCandidateRootRef(options.candidateRootRef ?? DEFAULT_CANDIDATE_RECORD_ROOT);
  const registryValidation = await validateOperationalRouteRegistry({
    repoRoot,
    registry,
    registryRef,
    checkFiles: options.checkFiles !== false,
    checkWorkCards: options.checkWorkCards !== false,
  });
  const usageSummary = await buildOperationalRouteUsageSummary({
    repoRoot,
    registryRef,
    usageRootRef,
    summaryId: options.usageSummaryId,
    now: options.now,
  });
  const candidateSummary = await buildCandidateSummary({
    repoRoot,
    registryRef,
    candidateRootRef,
  });
  const routeUsageById = new Map((usageSummary.routes ?? []).map((route) => [route.route_id, route]));
  const routes = (registry.routes ?? []).map((route) => {
    const usage = routeUsageById.get(route.route_id) ?? {};
    return {
      route_id: route.route_id,
      route_state: route.route_state ?? registry.route_defaults?.route_state ?? null,
      selected_work_card_id: route.selected_work_card_id ?? null,
      selected_work_card_ref: route.selected_work_card_ref ?? null,
      operator_answer_card_ref: route.operator_answer_card_ref ?? null,
      wiki_page_ref: route.wiki_page_ref ?? null,
      evidence_pages: Array.isArray(route.evidence_pages) ? route.evidence_pages : [],
      review_context_pages: Array.isArray(route.review_context_pages) ? route.review_context_pages : [],
      usage_count: usage.usage_count ?? 0,
      repeated_use_review_threshold: usage.repeated_use_review_threshold ?? usageSummary.counts?.repeated_use_review_threshold ?? null,
      repeated_use_review_ready: usage.repeated_use_review_ready === true,
      claim_ceiling: route.claim_ceiling ?? registry.route_defaults?.claim_ceiling ?? null,
    };
  });
  const readyRouteCount = usageSummary.counts?.repeated_use_review_ready_route_count ?? 0;
  const overallStatus = computeOperationalRouteStatus({
    registryValidationStatus: registryValidation.status,
    readyRouteCount,
    unmatchedCandidateCount: candidateSummary.counts.unmatched_candidate_count,
  });
  const statusId = normalizeSafeId(options.statusId ?? `operational_route_status_${stableHash([
    registryRef,
    usageRootRef,
    candidateRootRef,
    formatTimestampUtc(options.now).slice(0, 10),
  ].join(":")).slice(0, 12)}`);
  return {
    schema_version: OPERATIONAL_ROUTE_STATUS_SCHEMA_VERSION,
    kind: "operational_route_status",
    status: overallStatus,
    status_id: statusId,
    generated_at_utc: formatTimestampUtc(options.now),
    registry_ref: registryRef,
    registry_id: registry.registry_id ?? null,
    usage_root_ref: usageRootRef,
    candidate_root_ref: candidateRootRef,
    counts: {
      route_count: routes.length,
      usage_record_count: usageSummary.counts?.usage_record_count ?? 0,
      invalid_usage_record_count: usageSummary.counts?.invalid_record_count ?? 0,
      repeated_use_review_ready_route_count: readyRouteCount,
      repeated_use_review_threshold: usageSummary.counts?.repeated_use_review_threshold ?? null,
      candidate_record_count: candidateSummary.counts.candidate_record_count,
      unmatched_candidate_count: candidateSummary.counts.unmatched_candidate_count,
      invalid_candidate_record_count: candidateSummary.counts.invalid_candidate_record_count,
    },
    registry_validation: {
      status: registryValidation.status,
      blocker_count: registryValidation.counts?.blocker_count ?? 0,
      warning_count: registryValidation.counts?.warning_count ?? 0,
      checked_ref_count: registryValidation.counts?.checked_ref_count ?? 0,
      missing_ref_count: registryValidation.counts?.missing_ref_count ?? 0,
      blockers: registryValidation.blockers,
      warnings: registryValidation.warnings,
    },
    usage_summary: usageSummary,
    candidate_summary: candidateSummary,
    routes,
    authority: {
      route_registry_update_allowed_here: false,
      source_text_loading_allowed_here: false,
      default_route_mutation_allowed_here: false,
      stronger_permission_granted_here: false,
      public_canon_promotion_allowed_here: false,
      ontology_acceptance_allowed_here: false,
    },
    next_actions: operationalRouteStatusNextActions({
      overallStatus,
      readyRouteCount,
      unmatchedCandidateCount: candidateSummary.counts.unmatched_candidate_count,
    }),
    boundary: operationalRouteBoundary(),
  };
}

export async function writeOperationalRouteStatus(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const status = await buildOperationalRouteStatus(options);
  const outputRef = options.outputRef ?? defaultOperationalRouteStatusOutputRef(status);
  const outputPath = path.join(repoRoot, safeOperationalRouteStatusOutputPath(outputRef));
  await writeJson(outputPath, status);
  return {
    status: "written",
    operational_route_status_ref: normalizeRepoPath(path.relative(repoRoot, outputPath)),
    status_id: status.status_id,
    route_status: status.status,
    route_count: status.counts.route_count,
    repeated_use_review_ready_route_count: status.counts.repeated_use_review_ready_route_count,
    unmatched_candidate_count: status.counts.unmatched_candidate_count,
  };
}

export async function loadOperationalRouteStatus(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const statusRef = safeOperationalRouteStatusRef(options.statusRef ?? options.operationalRouteStatusRef);
  return readJson(path.join(repoRoot, statusRef));
}

export function validateOperationalRouteStatus(status) {
  const blockers = [];
  const allowedStatuses = new Set([
    "blocked_registry_invalid",
    "candidate_review_required",
    "private_manual_review_ready_below_repeated_use_threshold",
    "sourcebound_review_ready_routes_present",
  ]);
  if (status?.schema_version !== OPERATIONAL_ROUTE_STATUS_SCHEMA_VERSION) blockers.push("schema_version_mismatch");
  if (status?.kind !== "operational_route_status") blockers.push("kind_must_be_operational_route_status");
  if (!ROUTE_ID_PATTERN.test(String(status?.status_id ?? ""))) blockers.push("status_id_must_be_safe_id");
  if (!allowedStatuses.has(status?.status)) blockers.push("status_must_be_allowed_operational_route_state");
  if (!trySafeOperationalRouteRef(status?.registry_ref).ok) blockers.push("registry_ref_unsafe");
  if (!safeUsageRootRef(status?.usage_root_ref, { throwOnError: false })) blockers.push("usage_root_ref_unsafe");
  if (!safeCandidateRootRef(status?.candidate_root_ref, { throwOnError: false })) blockers.push("candidate_root_ref_unsafe");
  if (status?.usage_summary) {
    const usageValidation = validateOperationalRouteUsageSummary(status.usage_summary);
    if (usageValidation.status !== "pass") blockers.push(`usage_summary_blocked:${usageValidation.blocker_count}`);
  } else {
    blockers.push("usage_summary_required");
  }
  if (!Array.isArray(status?.routes)) blockers.push("routes_must_be_array");
  for (const route of status?.routes ?? []) {
    if (!ROUTE_ID_PATTERN.test(String(route?.route_id ?? ""))) blockers.push("route_id_must_be_safe_id");
    if (route?.selected_work_card_ref && !trySafeOperationalRouteRef(route.selected_work_card_ref).ok) {
      blockers.push("selected_work_card_ref_unsafe");
    }
    if (route?.operator_answer_card_ref && !trySafeOperationalRouteRef(route.operator_answer_card_ref).ok) {
      blockers.push("operator_answer_card_ref_unsafe");
    }
    if (route?.wiki_page_ref && !trySafeOperationalRouteRef(route.wiki_page_ref).ok) blockers.push("wiki_page_ref_unsafe");
    if (!validatePageArray(route?.evidence_pages).valid) blockers.push("evidence_pages_must_be_positive_integer_array");
    if (!validatePageArray(route?.review_context_pages, { allowEmpty: true }).valid) {
      blockers.push("review_context_pages_must_be_positive_integer_array");
    }
  }
  if (!status?.candidate_summary || typeof status.candidate_summary !== "object" || Array.isArray(status.candidate_summary)) {
    blockers.push("candidate_summary_required");
  } else {
    if (!safeCandidateRootRef(status.candidate_summary.candidate_root_ref, { throwOnError: false })) {
      blockers.push("candidate_summary_root_ref_unsafe");
    }
    for (const ref of status.candidate_summary.invalid_candidate_record_refs ?? []) {
      try {
        safeCandidateRecordRef(ref);
      } catch {
        blockers.push("invalid_candidate_record_ref_unsafe");
      }
    }
    for (const candidate of status.candidate_summary.candidates ?? []) {
      try {
        safeCandidateRecordRef(candidate.candidate_record_ref);
      } catch {
        blockers.push("candidate_record_ref_unsafe");
      }
      if (!ROUTE_ID_PATTERN.test(String(candidate.candidate_id ?? ""))) blockers.push("candidate_id_must_be_safe_id");
      if (candidate.raw_query_persisted !== false) blockers.push("candidate_raw_query_must_not_be_persisted");
    }
  }
  if (status?.authority?.route_registry_update_allowed_here !== false) blockers.push("route_registry_update_must_not_be_allowed_here");
  if (status?.authority?.source_text_loading_allowed_here !== false) blockers.push("source_text_loading_must_not_be_allowed_here");
  if (status?.authority?.default_route_mutation_allowed_here !== false) blockers.push("default_route_mutation_must_not_be_allowed_here");
  if (status?.authority?.stronger_permission_granted_here !== false) blockers.push("stronger_permission_must_not_be_granted_here");
  if (status?.authority?.public_canon_promotion_allowed_here !== false) blockers.push("public_canon_promotion_must_not_be_allowed_here");
  if (status?.authority?.ontology_acceptance_allowed_here !== false) blockers.push("ontology_acceptance_must_not_be_allowed_here");
  blockers.push(...findUnsafeOperationalRouteValues(status, "operational_route_status"));
  return {
    schema_version: OPERATIONAL_ROUTE_STATUS_VALIDATION_SCHEMA_VERSION,
    kind: "operational_route_status_validation",
    status: blockers.length === 0 ? "pass" : "blocked",
    status_id: status?.status_id ?? null,
    route_status: status?.status ?? null,
    blocker_count: blockers.length,
    blockers: [...new Set(blockers)].sort(),
    counts: status?.counts ?? null,
    boundary: {
      metadata_only: status?.boundary?.metadata_only === true,
      source_text_loaded: status?.boundary?.source_text_loaded === true,
      final_answer_authority_allowed: status?.boundary?.final_answer_authority_allowed === true,
      public_canon_promotion_allowed: status?.boundary?.public_canon_promotion_allowed === true,
      default_route_mutation_allowed: status?.boundary?.default_route_mutation_allowed === true,
    },
  };
}

export function renderOperationalRouteStatusDigest(status) {
  return [
    `Status: ${status.status}`,
    `Registry: ${status.registry_ref}`,
    `Routes: ${status.counts?.route_count ?? 0}`,
    `Usage records: ${status.counts?.usage_record_count ?? 0}`,
    `Ready routes: ${status.counts?.repeated_use_review_ready_route_count ?? 0}`,
    `Unmatched candidates: ${status.counts?.unmatched_candidate_count ?? 0}`,
    `Invalid records: usage=${status.counts?.invalid_usage_record_count ?? 0}, candidate=${status.counts?.invalid_candidate_record_count ?? 0}`,
    "Next actions:",
    ...(status.next_actions ?? []).map((action) => `- ${action}`),
    "",
    "Boundary: metadata-only status surface; no source/chunk payloads, final answer authority, public canon promotion, ontology acceptance, graph truth mutation, or default route mutation.",
    "",
  ].join("\n");
}

export async function buildOperationalRouteReviewGate(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const registryRef = safeOperationalRouteRef(options.registryRef);
  const gateId = normalizeSafeId(options.gateId ?? `operational_route_review_gate_${stableHash([
    registryRef,
    options.usageRootRef ?? DEFAULT_USAGE_RECORD_ROOT,
    options.candidateRootRef ?? DEFAULT_CANDIDATE_RECORD_ROOT,
    formatTimestampUtc(options.now).slice(0, 10),
  ].join(":")).slice(0, 12)}`);
  const status = await buildOperationalRouteStatus({
    repoRoot,
    registryRef,
    usageRootRef: options.usageRootRef,
    candidateRootRef: options.candidateRootRef,
    statusId: `${gateId}_status`,
    checkFiles: options.checkFiles,
    checkWorkCards: options.checkWorkCards,
    now: options.now,
  });
  const statusValidation = validateOperationalRouteStatus(status);
  const readyRoutes = (status.routes ?? []).filter((route) => route.repeated_use_review_ready === true);
  const blockers = [];
  if (statusValidation.status !== "pass") blockers.push("operational_status_validation_blocked");
  if (status.status === "blocked_registry_invalid") blockers.push("registry_invalid");
  if ((status.counts?.unmatched_candidate_count ?? 0) > 0) blockers.push("unmatched_candidate_review_required");
  if (readyRoutes.length === 0) blockers.push("no_route_reached_repeated_use_threshold");
  const gateStatus =
    statusValidation.status !== "pass" || status.status === "blocked_registry_invalid"
      ? "blocked_operational_status"
      : (status.counts?.unmatched_candidate_count ?? 0) > 0
        ? "hold_unmatched_candidate_review_required"
        : readyRoutes.length > 0
          ? "ready_for_sourcebound_review_queue"
          : "hold_below_repeated_use_threshold";
  return {
    schema_version: OPERATIONAL_ROUTE_REVIEW_GATE_SCHEMA_VERSION,
    kind: "operational_route_review_gate",
    gate_id: gateId,
    generated_at_utc: formatTimestampUtc(options.now),
    registry_ref: registryRef,
    status: gateStatus,
    blockers: blockers.sort(),
    counts: {
      route_count: status.counts?.route_count ?? 0,
      usage_record_count: status.counts?.usage_record_count ?? 0,
      repeated_use_review_ready_route_count: readyRoutes.length,
      repeated_use_review_threshold: status.counts?.repeated_use_review_threshold ?? null,
      unmatched_candidate_count: status.counts?.unmatched_candidate_count ?? 0,
      invalid_usage_record_count: status.counts?.invalid_usage_record_count ?? 0,
      invalid_candidate_record_count: status.counts?.invalid_candidate_record_count ?? 0,
    },
    routes: (status.routes ?? []).map((route) => ({
      route_id: route.route_id,
      selected_work_card_id: route.selected_work_card_id,
      selected_work_card_ref: route.selected_work_card_ref,
      operator_answer_card_ref: route.operator_answer_card_ref,
      wiki_page_ref: route.wiki_page_ref,
      evidence_pages: route.evidence_pages ?? [],
      usage_count: route.usage_count ?? 0,
      repeated_use_review_threshold: route.repeated_use_review_threshold,
      repeated_use_review_ready: route.repeated_use_review_ready === true,
      claim_ceiling: route.claim_ceiling,
    })),
    ready_routes: readyRoutes.map((route) => ({
      route_id: route.route_id,
      selected_work_card_id: route.selected_work_card_id,
      usage_count: route.usage_count ?? 0,
      repeated_use_review_threshold: route.repeated_use_review_threshold,
      claim_ceiling: route.claim_ceiling,
    })),
    authority: {
      sourcebound_review_launch_allowed_here: false,
      route_registry_update_allowed_here: false,
      source_text_loading_allowed_here: false,
      source_truth_claimed_here: false,
      final_answer_authority_allowed_here: false,
      public_canon_promotion_allowed_here: false,
      ontology_acceptance_allowed_here: false,
      graph_truth_mutation_allowed_here: false,
      default_route_mutation_allowed_here: false,
    },
    next_actions:
      gateStatus === "ready_for_sourcebound_review_queue"
        ? ["prepare_sourcebound_review_packet_from_ready_routes_without_claiming_source_truth"]
        : gateStatus === "hold_unmatched_candidate_review_required"
          ? ["review_unmatched_candidates_before_route_registry_or_sourcebound_changes"]
          : ["continue_private_manual_review_use_until_repeated_use_threshold_or_new_evidence"],
    boundary: {
      ...operationalRouteBoundary(),
      source_truth_claimed: false,
      external_upload_allowed: false,
      review_gate_writes_usage_or_candidate: false,
      review_gate_launches_sourcebound_review: false,
    },
  };
}

export function validateOperationalRouteReviewGate(gate) {
  const blockers = [];
  const allowedStatuses = new Set([
    "blocked_operational_status",
    "hold_unmatched_candidate_review_required",
    "ready_for_sourcebound_review_queue",
    "hold_below_repeated_use_threshold",
  ]);
  if (gate?.schema_version !== OPERATIONAL_ROUTE_REVIEW_GATE_SCHEMA_VERSION) blockers.push("schema_version_mismatch");
  if (gate?.kind !== "operational_route_review_gate") blockers.push("kind_must_be_operational_route_review_gate");
  if (!ROUTE_ID_PATTERN.test(String(gate?.gate_id ?? ""))) blockers.push("gate_id_must_be_safe_id");
  if (!allowedStatuses.has(gate?.status)) blockers.push("status_must_be_allowed_review_gate_state");
  if (!trySafeOperationalRouteRef(gate?.registry_ref).ok) blockers.push("registry_ref_unsafe");
  if (!Array.isArray(gate?.routes)) blockers.push("routes_must_be_array");
  for (const route of gate?.routes ?? []) {
    if (!ROUTE_ID_PATTERN.test(String(route?.route_id ?? ""))) blockers.push("route_id_must_be_safe_id");
    for (const key of ["selected_work_card_ref", "operator_answer_card_ref", "wiki_page_ref"]) {
      if (route?.[key] && !trySafeOperationalRouteRef(route[key]).ok) blockers.push(`${key}_unsafe`);
    }
    if (!validatePageArray(route?.evidence_pages, { allowEmpty: true }).valid) {
      blockers.push("evidence_pages_must_be_positive_integer_array");
    }
  }
  for (const route of gate?.ready_routes ?? []) {
    if (!ROUTE_ID_PATTERN.test(String(route?.route_id ?? ""))) blockers.push("ready_route_id_must_be_safe_id");
  }
  const falseAuthorityKeys = [
    "sourcebound_review_launch_allowed_here",
    "route_registry_update_allowed_here",
    "source_text_loading_allowed_here",
    "source_truth_claimed_here",
    "final_answer_authority_allowed_here",
    "public_canon_promotion_allowed_here",
    "ontology_acceptance_allowed_here",
    "graph_truth_mutation_allowed_here",
    "default_route_mutation_allowed_here",
  ];
  for (const key of falseAuthorityKeys) {
    if (gate?.authority?.[key] !== false) blockers.push(`authority_${key}_must_be_false`);
  }
  for (const [key, value] of Object.entries(gate?.authority ?? {})) {
    if (value !== false) blockers.push(`authority_${key}_must_be_false`);
  }
  const falseBoundaryKeys = [
    "source_text_loaded",
    "chunk_text_loaded",
    "source_payloads_included",
    "copied_excerpts_included",
    "notebooklm_answers_included",
    "secrets_or_session_included",
    "runtime_absolute_paths_included",
    "final_answer_authority_allowed",
    "public_canon_promotion_allowed",
    "ontology_acceptance_allowed",
    "default_route_mutation_allowed",
    "graph_truth_mutation_allowed",
    "source_truth_claimed",
    "external_upload_allowed",
    "review_gate_writes_usage_or_candidate",
    "review_gate_launches_sourcebound_review",
  ];
  if (gate?.boundary?.metadata_only !== true) blockers.push("boundary_metadata_only_must_be_true");
  for (const key of falseBoundaryKeys) {
    if (gate?.boundary?.[key] !== false) blockers.push(`boundary_${key}_must_be_false`);
  }
  blockers.push(...findUnsafeOperationalRouteValues(gate, "operational_route_review_gate"));
  return {
    schema_version: OPERATIONAL_ROUTE_REVIEW_GATE_VALIDATION_SCHEMA_VERSION,
    kind: "operational_route_review_gate_validation",
    status: blockers.length === 0 ? "pass" : "blocked",
    gate_id: gate?.gate_id ?? null,
    gate_status: gate?.status ?? null,
    blocker_count: blockers.length,
    blockers: [...new Set(blockers)].sort(),
    counts: gate?.counts ?? null,
    boundary: {
      metadata_only: gate?.boundary?.metadata_only === true,
      source_text_loaded: gate?.boundary?.source_text_loaded === true,
      review_gate_launches_sourcebound_review: gate?.boundary?.review_gate_launches_sourcebound_review === true,
      public_canon_promotion_allowed: gate?.boundary?.public_canon_promotion_allowed === true,
    },
  };
}

export function renderOperationalRouteReviewGateText(gate) {
  const lines = [
    `Status: ${gate.status}`,
    `Registry: ${gate.registry_ref}`,
    `Routes: ${gate.counts?.route_count ?? 0}`,
    `Usage records: ${gate.counts?.usage_record_count ?? 0}`,
    `Repeated-use threshold: ${gate.counts?.repeated_use_review_threshold ?? "unknown"}`,
    `Ready routes: ${gate.counts?.repeated_use_review_ready_route_count ?? 0}`,
    `Unmatched candidates: ${gate.counts?.unmatched_candidate_count ?? 0}`,
    `Invalid records: usage=${gate.counts?.invalid_usage_record_count ?? 0}, candidate=${gate.counts?.invalid_candidate_record_count ?? 0}`,
    "Routes:",
    ...(gate.routes ?? []).map(
      (route) =>
        `- ${route.route_id}: usage=${route.usage_count}/${route.repeated_use_review_threshold}, review_ready=${route.repeated_use_review_ready ? "yes" : "no"}, claim=${route.claim_ceiling}`,
    ),
    "Next actions:",
    ...(gate.next_actions ?? []).map((action) => `- ${action}`),
    "",
    "Boundary: review-gate is metadata only. It does not launch sourcebound review, write usage/candidate records, load source text/chunks, or grant source truth, final-answer, public canon, ontology, graph truth, default-route, or external-upload authority.",
    "",
  ];
  return lines.join("\n");
}

export async function buildOperationalRouteCommandSheet(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const registryRef = safeOperationalRouteRef(options.registryRef);
  const smokeTestRef = options.smokeTestRef ? safeOperationalRouteRef(options.smokeTestRef) : null;
  const sheetId = normalizeSafeId(options.sheetId ?? `operational_route_command_sheet_${stableHash([
    registryRef,
    smokeTestRef ?? "no_smoke",
    formatTimestampUtc(options.now).slice(0, 10),
  ].join(":")).slice(0, 12)}`);
  const registry = await loadOperationalRouteRegistry({ repoRoot, registryRef });
  const registryValidation = await validateOperationalRouteRegistry({
    repoRoot,
    registry,
    registryRef,
    checkFiles: options.checkFiles !== false,
    checkWorkCards: options.checkWorkCards !== false,
  });
  const smokeArg = smokeTestRef ? ` --smoke-tests-ref ${smokeTestRef}` : "";
  const healthArg = " --operator-health-ref <operator_health_ref>";
  const queryArg = '--query-label "<ephemeral label>"';
  const usageArg = '--record-usage --usage-id <safe_usage_id>';
  const commandBase = "node guild_hall/rag/cli.mjs";
  const commands = [
    {
      phase: "readiness_dashboard",
      purpose: "review_route_set_before_question",
      command_line: `${commandBase} operational-route-dashboard --route-registry-ref ${registryRef}${smokeArg} --text`,
      writes_metadata: false,
      prints_answer_shell: false,
    },
    {
      phase: "question_call_plan",
      purpose: "route_one_transient_question_without_recording_usage",
      command_line: `${commandBase} operational-route-call-plan --route-registry-ref ${registryRef}${smokeArg} ${queryArg} --text`,
      writes_metadata: false,
      prints_answer_shell: false,
    },
    {
      phase: "question_call_plan_record",
      purpose: "store_fingerprint_only_call_plan_for_a_real_question_before_answering",
      command_line: `${commandBase} operational-route-call-plan --write --route-registry-ref ${registryRef}${smokeArg} ${queryArg} --plan-id <safe_call_plan_id>`,
      writes_metadata: true,
      prints_answer_shell: false,
      write_condition: "real_operator_question_only",
    },
    {
      phase: "terminal_answer_no_record",
      purpose: "print_call_plan_and_answer_shell_without_side_effects",
      command_line: `${commandBase} operational-route-operator-run --route-registry-ref ${registryRef}${smokeArg}${healthArg} ${queryArg}`,
      writes_metadata: false,
      prints_answer_shell: true,
    },
    {
      phase: "health_gated_no_answer_probe",
      purpose: "verify_health_gated_call_plan_without_printing_answer_body",
      command_line: `${commandBase} operational-route-operator-run --route-registry-ref ${registryRef}${smokeArg}${healthArg} ${queryArg} --skip-answer-shell`,
      writes_metadata: false,
      prints_answer_shell: false,
    },
    {
      phase: "terminal_answer_record_real_usage",
      purpose: "record_metadata_only_usage_after_real_delivered_answer",
      command_line: `${commandBase} operational-route-operator-run --route-registry-ref ${registryRef}${smokeArg}${healthArg} ${queryArg} ${usageArg}`,
      writes_metadata: true,
      prints_answer_shell: true,
      write_condition: "real_delivered_operator_answer_only",
    },
    {
      phase: "post_answer_closeout",
      purpose: "check_next_gate_for_one_transient_question",
      command_line: `${commandBase} operational-route-closeout --route-registry-ref ${registryRef} ${queryArg} --text`,
      writes_metadata: false,
      prints_answer_shell: false,
    },
    {
      phase: "route_set_review_gate",
      purpose: "check_repeated_use_and_candidate_readiness_without_launching_review",
      command_line: `${commandBase} operational-route-review-gate --route-registry-ref ${registryRef} --text`,
      writes_metadata: false,
      prints_answer_shell: false,
    },
    {
      phase: "stored_preflight_view",
      purpose: "reopen_stored_preflight_digest_without_rerunning_payload_work",
      command_line: `${commandBase} operational-route-preflight-view --operational-route-preflight-ref _workmeta/system/reports/rag/operational_route_preflight/<safe_preflight_id>/preflight.json`,
      writes_metadata: false,
      prints_answer_shell: false,
      read_only_view: true,
    },
    {
      phase: "stored_ops_check_view",
      purpose: "reopen_stored_ops_check_digest_without_executing_commands",
      command_line: `${commandBase} operational-route-ops-check-view --operational-route-ops-check-ref _workmeta/system/reports/rag/operational_route_ops_check/<safe_ops_check_id>/ops_check.json`,
      writes_metadata: false,
      prints_answer_shell: false,
      read_only_view: true,
    },
    {
      phase: "stored_session_sweep_view",
      purpose: "reopen_stored_route_set_sweep_digest",
      command_line: `${commandBase} operational-route-session-sweep-view --operational-route-session-sweep-ref _workmeta/system/reports/rag/operational_route_sweeps/<safe_sweep_id>/route_sweep.json`,
      writes_metadata: false,
      prints_answer_shell: false,
      read_only_view: true,
    },
    {
      phase: "stored_readiness_view",
      purpose: "reopen_stored_go_no_go_readiness_digest",
      command_line: `${commandBase} operational-route-readiness-view --operational-route-readiness-ref _workmeta/system/reports/rag/operational_route_readiness/<safe_readiness_id>/readiness.json`,
      writes_metadata: false,
      prints_answer_shell: false,
      read_only_view: true,
    },
    {
      phase: "stored_status_view",
      purpose: "reopen_stored_operational_status_digest",
      command_line: `${commandBase} operational-route-status-view --operational-route-status-ref _workmeta/system/reports/rag/operational_route_status/<safe_status_id>/status.json`,
      writes_metadata: false,
      prints_answer_shell: false,
      read_only_view: true,
    },
    {
      phase: "stored_call_plan_view",
      purpose: "reopen_stored_fingerprint_only_call_plan_digest",
      command_line: `${commandBase} operational-route-call-plan-view --operational-route-call-plan-ref _workmeta/system/reports/rag/operational_route_call_plans/<safe_call_plan_id>/call_plan.json`,
      writes_metadata: false,
      prints_answer_shell: false,
      read_only_view: true,
    },
    {
      phase: "stored_usage_record_view",
      purpose: "reopen_stored_usage_record_digest_after_real_answer",
      command_line: `${commandBase} operational-route-usage-record-view --usage-record-ref _workmeta/system/reports/rag/operational_route_usage/<safe_usage_id>/usage_record.json`,
      writes_metadata: false,
      prints_answer_shell: false,
      read_only_view: true,
    },
    {
      phase: "stored_usage_summary_view",
      purpose: "reopen_stored_repeated_use_count_digest",
      command_line: `${commandBase} operational-route-usage-summary-view --usage-summary-ref _workmeta/system/reports/rag/operational_route_usage_summary/<safe_summary_id>/usage_summary.json`,
      writes_metadata: false,
      prints_answer_shell: false,
      read_only_view: true,
    },
    {
      phase: "stored_candidate_record_view",
      purpose: "reopen_stored_unmatched_candidate_digest_after_real_unmatched_question",
      command_line: `${commandBase} operational-route-candidate-record-view --candidate-record-ref _workmeta/system/reports/rag/operational_route_candidates/<safe_candidate_id>/candidate_record.json`,
      writes_metadata: false,
      prints_answer_shell: false,
      read_only_view: true,
    },
    {
      phase: "stored_evidence_sweep_view",
      purpose: "reopen_stored_evidence_closure_digest",
      command_line: `${commandBase} operational-route-evidence-sweep-view --operational-route-evidence-sweep-ref _workmeta/system/reports/rag/operational_route_evidence_sweeps/<safe_evidence_sweep_id>/evidence_sweep.json`,
      writes_metadata: false,
      prints_answer_shell: false,
      read_only_view: true,
    },
    {
      phase: "latest_evidence_index",
      purpose: "find_latest_stored_evidence_refs_for_this_registry_without_manual_ref_lookup",
      command_line: `${commandBase} operational-route-latest-evidence --route-registry-ref ${registryRef} --text`,
      writes_metadata: false,
      prints_answer_shell: false,
      read_only_view: true,
    },
    {
      phase: "operator_brief",
      purpose: "print_one_page_operator_brief_with_latest_refs_and_safe_next_commands",
      command_line: `${commandBase} operational-route-operator-brief --route-registry-ref ${registryRef} --text`,
      writes_metadata: false,
      prints_answer_shell: false,
      read_only_view: true,
    },
    {
      phase: "operator_health",
      purpose: "check_latest_evidence_brief_and_doc_drift_as_one_operator_health_surface",
      command_line: `${commandBase} operational-route-operator-health --route-registry-ref ${registryRef} --text`,
      writes_metadata: false,
      prints_answer_shell: false,
      read_only_view: true,
    },
  ];
  return {
    schema_version: OPERATIONAL_ROUTE_COMMAND_SHEET_SCHEMA_VERSION,
    kind: "operational_route_command_sheet",
    sheet_id: sheetId,
    generated_at_utc: formatTimestampUtc(options.now),
    registry_ref: registryRef,
    registry_id: registry.registry_id ?? null,
    smoke_test_ref: smokeTestRef,
    registry_validation: {
      status: registryValidation.status,
      blocker_count: registryValidation.counts?.blocker_count ?? 0,
      warning_count: registryValidation.counts?.warning_count ?? 0,
    },
    counts: {
      route_count: Array.isArray(registry.routes) ? registry.routes.length : 0,
      command_count: commands.length,
    },
    query_placeholder: "<ephemeral label>",
    usage_id_placeholder: "<safe_usage_id>",
    commands,
    boundary: {
      ...operationalRouteBoundary(),
      source_truth_claimed: false,
      external_upload_allowed: false,
      command_sheet_executes_commands: false,
      raw_query_persisted: false,
      answer_shell_output_persisted: false,
      answer_card_body_persisted: false,
      sourcebound_review_launch_allowed_here: false,
    },
  };
}

export function validateOperationalRouteCommandSheet(sheet) {
  const blockers = [];
  if (sheet?.schema_version !== OPERATIONAL_ROUTE_COMMAND_SHEET_SCHEMA_VERSION) blockers.push("schema_version_mismatch");
  if (sheet?.kind !== "operational_route_command_sheet") blockers.push("kind_must_be_operational_route_command_sheet");
  if (!ROUTE_ID_PATTERN.test(String(sheet?.sheet_id ?? ""))) blockers.push("sheet_id_must_be_safe_id");
  if (!trySafeOperationalRouteRef(sheet?.registry_ref).ok) blockers.push("registry_ref_unsafe");
  if (sheet?.smoke_test_ref !== null && sheet?.smoke_test_ref !== undefined && !trySafeOperationalRouteRef(sheet.smoke_test_ref).ok) {
    blockers.push("smoke_test_ref_unsafe");
  }
  if (!Array.isArray(sheet?.commands)) blockers.push("commands_must_be_array");
  for (const command of sheet?.commands ?? []) {
    if (!ROUTE_ID_PATTERN.test(String(command?.phase ?? ""))) blockers.push("phase_must_be_safe_id");
    if (typeof command?.command_line !== "string" || command.command_line.length === 0) blockers.push("command_line_required");
    if (hasLocalAbsolutePathString(command?.command_line ?? "")) blockers.push("command_line_must_not_include_local_absolute_path");
    if (hasSecretLikeValueString(command?.command_line ?? "")) blockers.push("command_line_must_not_include_secret_like_value");
  }
  const falseBoundaryKeys = [
    "source_text_loaded",
    "chunk_text_loaded",
    "source_payloads_included",
    "copied_excerpts_included",
    "notebooklm_answers_included",
    "secrets_or_session_included",
    "runtime_absolute_paths_included",
    "final_answer_authority_allowed",
    "public_canon_promotion_allowed",
    "ontology_acceptance_allowed",
    "default_route_mutation_allowed",
    "graph_truth_mutation_allowed",
    "source_truth_claimed",
    "external_upload_allowed",
    "command_sheet_executes_commands",
    "raw_query_persisted",
    "answer_shell_output_persisted",
    "answer_card_body_persisted",
    "sourcebound_review_launch_allowed_here",
  ];
  if (sheet?.boundary?.metadata_only !== true) blockers.push("boundary_metadata_only_must_be_true");
  for (const key of falseBoundaryKeys) {
    if (sheet?.boundary?.[key] !== false) blockers.push(`boundary_${key}_must_be_false`);
  }
  blockers.push(...findUnsafeOperationalRouteValues(sheet, "operational_route_command_sheet"));
  return {
    schema_version: OPERATIONAL_ROUTE_COMMAND_SHEET_VALIDATION_SCHEMA_VERSION,
    kind: "operational_route_command_sheet_validation",
    status: blockers.length === 0 ? "pass" : "blocked",
    sheet_id: sheet?.sheet_id ?? null,
    blocker_count: blockers.length,
    blockers: [...new Set(blockers)].sort(),
    counts: sheet?.counts ?? null,
    boundary: {
      metadata_only: sheet?.boundary?.metadata_only === true,
      command_sheet_executes_commands: sheet?.boundary?.command_sheet_executes_commands === true,
      raw_query_persisted: sheet?.boundary?.raw_query_persisted === true,
      answer_card_body_persisted: sheet?.boundary?.answer_card_body_persisted === true,
      public_canon_promotion_allowed: sheet?.boundary?.public_canon_promotion_allowed === true,
    },
  };
}

export function renderOperationalRouteCommandSheetText(sheet) {
  const lines = [
    `Command sheet: ${sheet.sheet_id}`,
    `Registry: ${sheet.registry_ref}`,
    `Routes: ${sheet.counts?.route_count ?? 0}`,
    `Commands: ${sheet.counts?.command_count ?? 0}`,
    `Query placeholder: ${sheet.query_placeholder}`,
    `Usage id placeholder: ${sheet.usage_id_placeholder}`,
    "",
    "Commands:",
    ...(sheet.commands ?? []).map((command) => `${command.phase}: ${command.command_line}`),
    "",
    "Boundary: command sheet is metadata only and does not execute commands, persist raw queries, persist answer shell output, persist answer-card bodies, load source text/chunks, write usage/candidate records, launch sourcebound review, or grant source truth, final-answer, public canon, ontology, graph truth, default-route, or external-upload authority.",
    "",
  ];
  return lines.join("\n");
}

export async function buildOperationalRouteSuggestionSafety(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const registryRef = safeOperationalRouteRef(options.registryRef);
  const smokeTestRef = options.smokeTestRef ? safeOperationalRouteRef(options.smokeTestRef) : null;
  const safetyId = normalizeSafeId(options.safetyId ?? `operational_route_suggestion_safety_${stableHash([
    registryRef,
    smokeTestRef ?? "no_smoke",
    formatTimestampUtc(options.now).slice(0, 10),
  ].join(":")).slice(0, 12)}`);
  const commandSheet = await buildOperationalRouteCommandSheet({
    repoRoot,
    registryRef,
    smokeTestRef,
    checkFiles: options.checkFiles !== false,
    checkWorkCards: options.checkWorkCards !== false,
    now: options.now,
  });
  const commandSheetValidation = validateOperationalRouteCommandSheet(commandSheet);
  const surfaces = [
    analyzeOperationalRouteSuggestedCommands({
      surface: "command_sheet",
      sample_id: commandSheet.sheet_id,
      status: commandSheetValidation.status,
      route_id: null,
      commands: commandSheet.commands ?? [],
    }),
  ];
  const blockers = [];
  if (commandSheetValidation.status !== "pass") {
    blockers.push(`command_sheet_validation_blocked:${commandSheetValidation.blocker_count}`);
  }

  let smokeTests = null;
  if (smokeTestRef) {
    smokeTests = await loadOperationalRouteSmokeTests({ repoRoot, smokeTestRef });
    if (smokeTests.kind !== "operational_route_smoke_tests") blockers.push("kind_must_be_operational_route_smoke_tests");
    if (!Array.isArray(smokeTests.tests) || smokeTests.tests.length === 0) blockers.push("smoke_tests_must_be_nonempty_array");

    for (const [index, testCase] of (smokeTests.tests ?? []).entries()) {
      const sampleId = normalizeSafeId(testCase.test_id ?? `case_${index + 1}`);
      const callPlan = await buildOperationalRouteCallPlan({
        repoRoot,
        registryRef,
        smokeTestRef,
        queryLabel: testCase.query_label,
        planId: `${safetyId}_${sampleId}_call_plan`,
        checkFiles: options.checkFiles !== false,
        checkWorkCards: options.checkWorkCards !== false,
        now: options.now,
      });
      surfaces.push(
        analyzeOperationalRouteSuggestedCommands({
          surface: "call_plan",
          sample_id: sampleId,
          status: callPlan.status,
          route_id: callPlan.selected_route?.route_id ?? null,
          commands: callPlan.suggested_commands ?? [],
        }),
      );

      const session = await buildOperationalRouteSession({
        repoRoot,
        registryRef,
        smokeTestRef,
        queryLabel: testCase.query_label,
        sessionId: `${safetyId}_${sampleId}_session`,
        checkFiles: options.checkFiles !== false,
        checkWorkCards: options.checkWorkCards !== false,
        now: options.now,
      });
      surfaces.push(
        analyzeOperationalRouteSuggestedCommands({
          surface: "session",
          sample_id: sampleId,
          status: session.status,
          route_id: session.selected_route?.route_id ?? null,
          commands: session.suggested_commands ?? [],
        }),
      );
    }
  }

  for (const surface of surfaces) {
    blockers.push(...(surface.blockers ?? []));
  }
  const directUsageWriteCount = surfaces.reduce(
    (sum, surface) => sum + (surface.counts?.direct_usage_record_write_suggestion_count ?? 0),
    0,
  );
  const directCandidateWriteCount = surfaces.reduce(
    (sum, surface) => sum + (surface.counts?.direct_candidate_record_write_suggestion_count ?? 0),
    0,
  );
  const directCallPlanWriteCount = surfaces.reduce(
    (sum, surface) => sum + (surface.counts?.direct_call_plan_write_suggestion_count ?? 0),
    0,
  );
  const unsafeCandidateWriteCount = surfaces.reduce(
    (sum, surface) => sum + (surface.counts?.unsafe_candidate_record_write_suggestion_count ?? 0),
    0,
  );
  const unsafeCallPlanWriteCount = surfaces.reduce(
    (sum, surface) => sum + (surface.counts?.unsafe_call_plan_write_suggestion_count ?? 0),
    0,
  );
  const directAnswerShellCount = surfaces.reduce(
    (sum, surface) => sum + (surface.counts?.direct_answer_shell_suggestion_count ?? 0),
    0,
  );
  const recordUsageWithoutHealthCount = surfaces.reduce(
    (sum, surface) => sum + (surface.counts?.record_usage_without_health_ref_count ?? 0),
    0,
  );
  const recordUsageOutsideOperatorRunCount = surfaces.reduce(
    (sum, surface) => sum + (surface.counts?.record_usage_outside_operator_run_count ?? 0),
    0,
  );
  const commandCount = surfaces.reduce((sum, surface) => sum + (surface.counts?.command_count ?? 0), 0);

  return {
    schema_version: OPERATIONAL_ROUTE_SUGGESTION_SAFETY_SCHEMA_VERSION,
    kind: "operational_route_suggestion_safety",
    safety_id: safetyId,
    generated_at_utc: formatTimestampUtc(options.now),
    status: blockers.length === 0 ? "pass_operator_suggestion_safety" : "blocked_operator_suggestion_safety",
    registry_ref: registryRef,
    smoke_test_ref: smokeTestRef,
    smoke_test_set_id: smokeTests?.test_set_id ?? null,
    counts: {
      surface_count: surfaces.length,
      command_count: commandCount,
      direct_usage_record_write_suggestion_count: directUsageWriteCount,
      direct_candidate_record_write_suggestion_count: directCandidateWriteCount,
      direct_call_plan_write_suggestion_count: directCallPlanWriteCount,
      unsafe_candidate_record_write_suggestion_count: unsafeCandidateWriteCount,
      unsafe_call_plan_write_suggestion_count: unsafeCallPlanWriteCount,
      direct_answer_shell_suggestion_count: directAnswerShellCount,
      record_usage_without_health_ref_count: recordUsageWithoutHealthCount,
      record_usage_outside_operator_run_count: recordUsageOutsideOperatorRunCount,
      blocker_count: blockers.length,
    },
    surfaces,
    blockers: [...new Set(blockers)].sort(),
    next_actions: blockers.length === 0
      ? [
          "keep_operator_suggestions_on_health_gated_operator_run_path",
          "use_lower_level_usage_record_write_only_as_explicit_metadata_fallback_after_real_delivered_answer",
        ]
      : ["fix_operator_suggestion_safety_blockers_before_operator_use"],
    boundary: {
      ...operationalRouteBoundary(),
      suggestion_safety_executes_commands: false,
      suggestion_safety_writes_usage_or_candidate: false,
      suggestion_safety_writes_call_plan: false,
      raw_query_persisted: false,
      answer_shell_output_persisted: false,
      answer_card_body_persisted: false,
      source_truth_claimed: false,
      final_answer_authority_allowed: false,
      public_canon_promotion_allowed: false,
      ontology_acceptance_allowed: false,
      graph_truth_mutation_allowed: false,
      default_route_mutation_allowed: false,
    },
  };
}

export async function writeOperationalRouteSuggestionSafety(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const safety = await buildOperationalRouteSuggestionSafety(options);
  const outputRef = options.outputRef ?? defaultOperationalRouteSuggestionSafetyOutputRef(safety);
  const outputPath = path.join(repoRoot, safeOperationalRouteSuggestionSafetyOutputPath(outputRef));
  await writeJson(outputPath, safety);
  return {
    status: "written",
    operational_route_suggestion_safety_ref: normalizeRepoPath(path.relative(repoRoot, outputPath)),
    safety_id: safety.safety_id,
    safety_status: safety.status,
    blocker_count: safety.counts.blocker_count,
    command_count: safety.counts.command_count,
  };
}

export async function loadOperationalRouteSuggestionSafety(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const safetyRef = safeOperationalRouteSuggestionSafetyRef(
    options.suggestionSafetyRef ?? options.safetyRef ?? options.operationalRouteSuggestionSafetyRef,
  );
  return readJson(path.join(repoRoot, safetyRef));
}

export function validateOperationalRouteSuggestionSafety(safety) {
  const blockers = [];
  if (safety?.schema_version !== OPERATIONAL_ROUTE_SUGGESTION_SAFETY_SCHEMA_VERSION) blockers.push("schema_version_mismatch");
  if (safety?.kind !== "operational_route_suggestion_safety") blockers.push("kind_must_be_operational_route_suggestion_safety");
  if (!ROUTE_ID_PATTERN.test(String(safety?.safety_id ?? ""))) blockers.push("safety_id_must_be_safe_id");
  if (!trySafeOperationalRouteRef(safety?.registry_ref).ok) blockers.push("registry_ref_unsafe");
  if (safety?.smoke_test_ref !== null && safety?.smoke_test_ref !== undefined && !trySafeOperationalRouteRef(safety.smoke_test_ref).ok) {
    blockers.push("smoke_test_ref_unsafe");
  }
  const allowedStatuses = new Set(["pass_operator_suggestion_safety", "blocked_operator_suggestion_safety"]);
  if (!allowedStatuses.has(String(safety?.status ?? ""))) blockers.push("status_invalid");
  if (!Array.isArray(safety?.surfaces)) blockers.push("surfaces_must_be_array");
  for (const surface of safety?.surfaces ?? []) {
    if (!ROUTE_ID_PATTERN.test(String(surface?.surface ?? ""))) blockers.push("surface_must_be_safe_id");
    if (!ROUTE_ID_PATTERN.test(String(surface?.sample_id ?? ""))) blockers.push("sample_id_must_be_safe_id");
    if (!Array.isArray(surface?.blockers)) blockers.push("surface_blockers_must_be_array");
  }
  if ((safety?.counts?.direct_usage_record_write_suggestion_count ?? 0) !== 0) {
    blockers.push("direct_usage_record_write_suggestion_count_must_be_zero");
  }
  if ((safety?.counts?.unsafe_candidate_record_write_suggestion_count ?? 0) !== 0) {
    blockers.push("unsafe_candidate_record_write_suggestion_count_must_be_zero");
  }
  if ((safety?.counts?.unsafe_call_plan_write_suggestion_count ?? 0) !== 0) {
    blockers.push("unsafe_call_plan_write_suggestion_count_must_be_zero");
  }
  if ((safety?.counts?.direct_answer_shell_suggestion_count ?? 0) !== 0) {
    blockers.push("direct_answer_shell_suggestion_count_must_be_zero");
  }
  if ((safety?.counts?.record_usage_without_health_ref_count ?? 0) !== 0) {
    blockers.push("record_usage_without_health_ref_count_must_be_zero");
  }
  if ((safety?.counts?.record_usage_outside_operator_run_count ?? 0) !== 0) {
    blockers.push("record_usage_outside_operator_run_count_must_be_zero");
  }
  const falseBoundaryKeys = [
    "source_text_loaded",
    "chunk_text_loaded",
    "source_payloads_included",
    "copied_excerpts_included",
    "notebooklm_answers_included",
    "secrets_or_session_included",
    "runtime_absolute_paths_included",
    "suggestion_safety_executes_commands",
    "suggestion_safety_writes_usage_or_candidate",
    "suggestion_safety_writes_call_plan",
    "raw_query_persisted",
    "answer_shell_output_persisted",
    "answer_card_body_persisted",
    "source_truth_claimed",
    "final_answer_authority_allowed",
    "public_canon_promotion_allowed",
    "ontology_acceptance_allowed",
    "graph_truth_mutation_allowed",
    "default_route_mutation_allowed",
  ];
  for (const key of falseBoundaryKeys) {
    if (safety?.boundary?.[key] === true) blockers.push(`boundary_${key}_must_be_false`);
  }
  blockers.push(...findUnsafeOperationalRouteValues(safety, "operational_route_suggestion_safety"));
  return {
    schema_version: OPERATIONAL_ROUTE_SUGGESTION_SAFETY_VALIDATION_SCHEMA_VERSION,
    kind: "operational_route_suggestion_safety_validation",
    status: blockers.length === 0 ? "pass" : "blocked",
    safety_id: safety?.safety_id ?? null,
    safety_status: safety?.status ?? null,
    blocker_count: blockers.length,
    blockers: [...new Set(blockers)].sort(),
    counts: safety?.counts ?? {},
    boundary: {
      metadata_only: safety?.boundary?.metadata_only === true,
      suggestion_safety_executes_commands: safety?.boundary?.suggestion_safety_executes_commands === true,
      suggestion_safety_writes_usage_or_candidate: safety?.boundary?.suggestion_safety_writes_usage_or_candidate === true,
      raw_query_persisted: safety?.boundary?.raw_query_persisted === true,
      public_canon_promotion_allowed: safety?.boundary?.public_canon_promotion_allowed === true,
    },
  };
}

export function renderOperationalRouteSuggestionSafetyText(safety) {
  const validation = validateOperationalRouteSuggestionSafety(safety);
  const lines = [
    `Status: ${safety.status}`,
    `Validation: ${validation.status}`,
    `Safety id: ${safety.safety_id}`,
    `Registry: ${safety.registry_ref}`,
    `Smoke tests: ${safety.smoke_test_ref ?? "not_requested"}`,
    `Surfaces: ${safety.counts?.surface_count ?? 0}`,
    `Commands checked: ${safety.counts?.command_count ?? 0}`,
    `Direct usage-write suggestions: ${safety.counts?.direct_usage_record_write_suggestion_count ?? 0}`,
    `Direct candidate-write suggestions: ${safety.counts?.direct_candidate_record_write_suggestion_count ?? 0}`,
    `Direct call-plan-write suggestions: ${safety.counts?.direct_call_plan_write_suggestion_count ?? 0}`,
    `Unsafe candidate-write suggestions: ${safety.counts?.unsafe_candidate_record_write_suggestion_count ?? 0}`,
    `Unsafe call-plan-write suggestions: ${safety.counts?.unsafe_call_plan_write_suggestion_count ?? 0}`,
    `Direct answer-shell suggestions: ${safety.counts?.direct_answer_shell_suggestion_count ?? 0}`,
    `Record-usage without health ref: ${safety.counts?.record_usage_without_health_ref_count ?? 0}`,
    `Record-usage outside operator-run: ${safety.counts?.record_usage_outside_operator_run_count ?? 0}`,
    `Blockers: ${safety.counts?.blocker_count ?? validation.blocker_count ?? 0}`,
    "Surface summary:",
    ...(safety.surfaces ?? []).map((surface) =>
      `- ${surface.surface}:${surface.sample_id} status=${surface.status} route=${surface.route_id ?? "none"} commands=${surface.counts?.command_count ?? 0} blockers=${surface.blockers?.length ?? 0}`),
    "Next actions:",
    ...(safety.next_actions ?? []).map((action) => `- ${action}`),
    "",
    "Boundary: suggestion safety is metadata only. It inspects generated command strings without executing commands, writing usage/candidate/call-plan records, persisting raw queries or answer bodies, loading source text/chunks, or granting stronger authority.",
    "",
  ];
  return lines.join("\n");
}

export async function buildOperationalRouteOpsCheck(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const registryRef = safeOperationalRouteRef(options.registryRef);
  const smokeTestRef = options.smokeTestRef ? safeOperationalRouteRef(options.smokeTestRef) : null;
  const opsCheckId = normalizeSafeId(options.opsCheckId ?? `operational_route_ops_check_${stableHash([
    registryRef,
    smokeTestRef ?? "no_smoke",
    options.usageRootRef ?? DEFAULT_USAGE_RECORD_ROOT,
    options.candidateRootRef ?? DEFAULT_CANDIDATE_RECORD_ROOT,
    formatTimestampUtc(options.now).slice(0, 10),
  ].join(":")).slice(0, 12)}`);
  const preflight = await buildOperationalRoutePreflight({
    repoRoot,
    registryRef,
    smokeTestRef,
    usageRootRef: options.usageRootRef,
    candidateRootRef: options.candidateRootRef,
    preflightId: `${opsCheckId}_preflight`,
    checkFiles: options.checkFiles,
    checkWorkCards: options.checkWorkCards,
    now: options.now,
  });
  const dashboard = await buildOperationalRouteDashboard({
    repoRoot,
    registryRef,
    smokeTestRef,
    usageRootRef: options.usageRootRef,
    candidateRootRef: options.candidateRootRef,
    preflightId: `${opsCheckId}_dashboard_preflight`,
    checkFiles: options.checkFiles,
    checkWorkCards: options.checkWorkCards,
    now: options.now,
  });
  const commandSheet = await buildOperationalRouteCommandSheet({
    repoRoot,
    registryRef,
    smokeTestRef,
    sheetId: `${opsCheckId}_command_sheet`,
    checkFiles: options.checkFiles,
    checkWorkCards: options.checkWorkCards,
    now: options.now,
  });
  const suggestionSafety = await buildOperationalRouteSuggestionSafety({
    repoRoot,
    registryRef,
    smokeTestRef,
    safetyId: `${opsCheckId}_suggestion_safety`,
    checkFiles: options.checkFiles,
    checkWorkCards: options.checkWorkCards,
    now: options.now,
  });
  const reviewGate = await buildOperationalRouteReviewGate({
    repoRoot,
    registryRef,
    usageRootRef: options.usageRootRef,
    candidateRootRef: options.candidateRootRef,
    gateId: `${opsCheckId}_review_gate`,
    checkFiles: options.checkFiles,
    checkWorkCards: options.checkWorkCards,
    now: options.now,
  });
  const validations = {
    preflight: validateOperationalRoutePreflight(preflight),
    dashboard: validateOperationalRouteDashboard(dashboard),
    command_sheet: validateOperationalRouteCommandSheet(commandSheet),
    suggestion_safety: validateOperationalRouteSuggestionSafety(suggestionSafety),
    review_gate: validateOperationalRouteReviewGate(reviewGate),
  };
  const blockers = [];
  if (validations.preflight.status !== "pass") blockers.push("preflight_validation_blocked");
  if (preflight.status !== "pass_private_manual_review_ready") blockers.push("preflight_not_private_manual_review_ready");
  if (validations.dashboard.status !== "pass") blockers.push("dashboard_validation_blocked");
  if (validations.command_sheet.status !== "pass") blockers.push("command_sheet_validation_blocked");
  if (validations.suggestion_safety.status !== "pass") blockers.push("suggestion_safety_validation_blocked");
  if (suggestionSafety.status !== "pass_operator_suggestion_safety") blockers.push("suggestion_safety_not_passed");
  if (validations.review_gate.status !== "pass") blockers.push("review_gate_validation_blocked");
  return {
    schema_version: OPERATIONAL_ROUTE_OPS_CHECK_SCHEMA_VERSION,
    kind: "operational_route_ops_check",
    ops_check_id: opsCheckId,
    generated_at_utc: formatTimestampUtc(options.now),
    registry_ref: registryRef,
    smoke_test_ref: smokeTestRef,
    status: blockers.length === 0 ? "pass_private_manual_review_ready" : "blocked",
    blockers: blockers.sort(),
    surfaces: {
      preflight: {
        status: preflight.status,
        validation_status: validations.preflight.status,
        blocker_count: validations.preflight.blocker_count,
      },
      dashboard: {
        status: dashboard.status,
        validation_status: validations.dashboard.status,
        blocker_count: validations.dashboard.blocker_count,
      },
      command_sheet: {
        status: validations.command_sheet.status,
        command_count: commandSheet.counts?.command_count ?? 0,
        blocker_count: validations.command_sheet.blocker_count,
      },
      suggestion_safety: {
        status: suggestionSafety.status,
        validation_status: validations.suggestion_safety.status,
        blocker_count: validations.suggestion_safety.blocker_count,
        command_count: suggestionSafety.counts?.command_count ?? 0,
        direct_usage_record_write_suggestion_count: suggestionSafety.counts?.direct_usage_record_write_suggestion_count ?? 0,
        direct_candidate_record_write_suggestion_count: suggestionSafety.counts?.direct_candidate_record_write_suggestion_count ?? 0,
        direct_call_plan_write_suggestion_count: suggestionSafety.counts?.direct_call_plan_write_suggestion_count ?? 0,
        unsafe_candidate_record_write_suggestion_count: suggestionSafety.counts?.unsafe_candidate_record_write_suggestion_count ?? 0,
        unsafe_call_plan_write_suggestion_count: suggestionSafety.counts?.unsafe_call_plan_write_suggestion_count ?? 0,
        direct_answer_shell_suggestion_count: suggestionSafety.counts?.direct_answer_shell_suggestion_count ?? 0,
        record_usage_without_health_ref_count: suggestionSafety.counts?.record_usage_without_health_ref_count ?? 0,
        record_usage_outside_operator_run_count: suggestionSafety.counts?.record_usage_outside_operator_run_count ?? 0,
      },
      review_gate: {
        status: reviewGate.status,
        validation_status: validations.review_gate.status,
        blocker_count: validations.review_gate.blocker_count,
      },
    },
    counts: {
      route_count: preflight.counts?.route_count ?? dashboard.counts?.route_count ?? 0,
      usage_record_count: reviewGate.counts?.usage_record_count ?? dashboard.counts?.usage_record_count ?? 0,
      repeated_use_review_threshold: reviewGate.counts?.repeated_use_review_threshold ?? dashboard.counts?.repeated_use_review_threshold ?? null,
      repeated_use_review_ready_route_count: reviewGate.counts?.repeated_use_review_ready_route_count ?? 0,
      unmatched_candidate_count: reviewGate.counts?.unmatched_candidate_count ?? dashboard.counts?.unmatched_candidate_count ?? 0,
      command_count: commandSheet.counts?.command_count ?? 0,
      suggestion_command_count: suggestionSafety.counts?.command_count ?? 0,
      direct_usage_record_write_suggestion_count: suggestionSafety.counts?.direct_usage_record_write_suggestion_count ?? 0,
      direct_candidate_record_write_suggestion_count: suggestionSafety.counts?.direct_candidate_record_write_suggestion_count ?? 0,
      direct_call_plan_write_suggestion_count: suggestionSafety.counts?.direct_call_plan_write_suggestion_count ?? 0,
      unsafe_candidate_record_write_suggestion_count: suggestionSafety.counts?.unsafe_candidate_record_write_suggestion_count ?? 0,
      unsafe_call_plan_write_suggestion_count: suggestionSafety.counts?.unsafe_call_plan_write_suggestion_count ?? 0,
      direct_answer_shell_suggestion_count: suggestionSafety.counts?.direct_answer_shell_suggestion_count ?? 0,
      record_usage_without_health_ref_count: suggestionSafety.counts?.record_usage_without_health_ref_count ?? 0,
      record_usage_outside_operator_run_count: suggestionSafety.counts?.record_usage_outside_operator_run_count ?? 0,
    },
    next_actions:
      blockers.length > 0
        ? ["inspect_blocked_surface_before_operator_use"]
        : [
            "use_command_sheet_for_safe_operator_sequence",
            "keep_suggestion_safety_passed_before_operator_use",
            "record_usage_only_after_real_delivered_operator_answer",
            "keep_review_gate_as_decision_support_until_repeated_use_threshold",
          ],
    authority: {
      operator_use_allowed: blockers.length === 0,
      sourcebound_review_launch_allowed_here: false,
      source_truth_claimed_here: false,
      final_answer_authority_allowed_here: false,
      public_canon_promotion_allowed_here: false,
      ontology_acceptance_allowed_here: false,
      graph_truth_mutation_allowed_here: false,
      default_route_mutation_allowed_here: false,
    },
    boundary: {
      ...operationalRouteBoundary(),
      source_truth_claimed: false,
      external_upload_allowed: false,
      ops_check_executes_commands: false,
      ops_check_writes_usage_or_candidate: false,
      ops_check_launches_sourcebound_review: false,
      raw_query_persisted: false,
      answer_shell_output_persisted: false,
      answer_card_body_persisted: false,
    },
  };
}

export async function writeOperationalRouteOpsCheck(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const check = await buildOperationalRouteOpsCheck(options);
  const outputRef = options.outputRef ?? defaultOperationalRouteOpsCheckOutputRef(check);
  const outputPath = path.join(repoRoot, safeOperationalRouteOpsCheckOutputPath(outputRef));
  await writeJson(outputPath, check);
  return {
    status: "written",
    operational_route_ops_check_ref: normalizeRepoPath(path.relative(repoRoot, outputPath)),
    ops_check_id: check.ops_check_id,
    ops_check_status: check.status,
    route_count: check.counts.route_count,
    usage_record_count: check.counts.usage_record_count,
    repeated_use_review_ready_route_count: check.counts.repeated_use_review_ready_route_count,
    unmatched_candidate_count: check.counts.unmatched_candidate_count,
  };
}

export async function loadOperationalRouteOpsCheck(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const opsCheckRef = safeOperationalRouteOpsCheckRef(options.opsCheckRef ?? options.operationalRouteOpsCheckRef);
  return readJson(path.join(repoRoot, opsCheckRef));
}

export function validateOperationalRouteOpsCheck(check) {
  const blockers = [];
  if (check?.schema_version !== OPERATIONAL_ROUTE_OPS_CHECK_SCHEMA_VERSION) blockers.push("schema_version_mismatch");
  if (check?.kind !== "operational_route_ops_check") blockers.push("kind_must_be_operational_route_ops_check");
  if (!ROUTE_ID_PATTERN.test(String(check?.ops_check_id ?? ""))) blockers.push("ops_check_id_must_be_safe_id");
  if (!trySafeOperationalRouteRef(check?.registry_ref).ok) blockers.push("registry_ref_unsafe");
  if (check?.smoke_test_ref !== null && check?.smoke_test_ref !== undefined && !trySafeOperationalRouteRef(check.smoke_test_ref).ok) {
    blockers.push("smoke_test_ref_unsafe");
  }
  if (!["pass_private_manual_review_ready", "blocked"].includes(String(check?.status ?? ""))) {
    blockers.push("status_must_be_allowed_ops_check_state");
  }
  for (const [surfaceId, surface] of Object.entries(check?.surfaces ?? {})) {
    if (!ROUTE_ID_PATTERN.test(surfaceId)) blockers.push("surface_id_must_be_safe_id");
    if (surface?.validation_status && !["pass", "blocked"].includes(surface.validation_status)) {
      blockers.push(`surface_${surfaceId}_validation_status_invalid`);
    }
  }
  const falseAuthorityKeys = [
    "sourcebound_review_launch_allowed_here",
    "source_truth_claimed_here",
    "final_answer_authority_allowed_here",
    "public_canon_promotion_allowed_here",
    "ontology_acceptance_allowed_here",
    "graph_truth_mutation_allowed_here",
    "default_route_mutation_allowed_here",
  ];
  for (const key of falseAuthorityKeys) {
    if (check?.authority?.[key] !== false) blockers.push(`authority_${key}_must_be_false`);
  }
  const falseBoundaryKeys = [
    "source_text_loaded",
    "chunk_text_loaded",
    "source_payloads_included",
    "copied_excerpts_included",
    "notebooklm_answers_included",
    "secrets_or_session_included",
    "runtime_absolute_paths_included",
    "final_answer_authority_allowed",
    "public_canon_promotion_allowed",
    "ontology_acceptance_allowed",
    "default_route_mutation_allowed",
    "graph_truth_mutation_allowed",
    "source_truth_claimed",
    "external_upload_allowed",
    "ops_check_executes_commands",
    "ops_check_writes_usage_or_candidate",
    "ops_check_launches_sourcebound_review",
    "raw_query_persisted",
    "answer_shell_output_persisted",
    "answer_card_body_persisted",
  ];
  if (check?.boundary?.metadata_only !== true) blockers.push("boundary_metadata_only_must_be_true");
  for (const key of falseBoundaryKeys) {
    if (check?.boundary?.[key] !== false) blockers.push(`boundary_${key}_must_be_false`);
  }
  blockers.push(...findUnsafeOperationalRouteValues(check, "operational_route_ops_check"));
  return {
    schema_version: OPERATIONAL_ROUTE_OPS_CHECK_VALIDATION_SCHEMA_VERSION,
    kind: "operational_route_ops_check_validation",
    status: blockers.length === 0 ? "pass" : "blocked",
    ops_check_id: check?.ops_check_id ?? null,
    ops_check_status: check?.status ?? null,
    blocker_count: blockers.length,
    blockers: [...new Set(blockers)].sort(),
    counts: check?.counts ?? null,
    boundary: {
      metadata_only: check?.boundary?.metadata_only === true,
      ops_check_executes_commands: check?.boundary?.ops_check_executes_commands === true,
      ops_check_writes_usage_or_candidate: check?.boundary?.ops_check_writes_usage_or_candidate === true,
      ops_check_launches_sourcebound_review: check?.boundary?.ops_check_launches_sourcebound_review === true,
      public_canon_promotion_allowed: check?.boundary?.public_canon_promotion_allowed === true,
    },
  };
}

export function renderOperationalRouteOpsCheckText(check) {
  const lines = [
    `Status: ${check.status}`,
    `Registry: ${check.registry_ref}`,
    `Routes: ${check.counts?.route_count ?? 0}`,
    `Usage records: ${check.counts?.usage_record_count ?? 0}`,
    `Repeated-use threshold: ${check.counts?.repeated_use_review_threshold ?? "unknown"}`,
    `Ready routes: ${check.counts?.repeated_use_review_ready_route_count ?? 0}`,
    `Unmatched candidates: ${check.counts?.unmatched_candidate_count ?? 0}`,
    `Commands: ${check.counts?.command_count ?? 0}`,
    `Suggestion commands checked: ${check.counts?.suggestion_command_count ?? "n/a"}`,
    `Direct usage-write suggestions: ${check.counts?.direct_usage_record_write_suggestion_count ?? "n/a"}`,
    `Direct candidate-write suggestions: ${check.counts?.direct_candidate_record_write_suggestion_count ?? "n/a"}`,
    `Direct call-plan-write suggestions: ${check.counts?.direct_call_plan_write_suggestion_count ?? "n/a"}`,
    `Unsafe candidate-write suggestions: ${check.counts?.unsafe_candidate_record_write_suggestion_count ?? "n/a"}`,
    `Unsafe call-plan-write suggestions: ${check.counts?.unsafe_call_plan_write_suggestion_count ?? "n/a"}`,
    `Direct answer-shell suggestions: ${check.counts?.direct_answer_shell_suggestion_count ?? "n/a"}`,
    `Record-usage without health ref: ${check.counts?.record_usage_without_health_ref_count ?? "n/a"}`,
    `Record-usage outside operator-run: ${check.counts?.record_usage_outside_operator_run_count ?? "n/a"}`,
    "Surfaces:",
    ...Object.entries(check.surfaces ?? {}).map(
      ([surfaceId, surface]) =>
        `- ${surfaceId}: status=${surface.status ?? surface.validation_status}, validation=${surface.validation_status ?? "pass"}, blockers=${surface.blocker_count ?? 0}`,
    ),
    "Next actions:",
    ...(check.next_actions ?? []).map((action) => `- ${action}`),
    "",
    "Boundary: ops-check is metadata only. It does not execute commands, write usage/candidate records, persist raw queries, persist answer shell output, persist answer-card bodies, load source text/chunks, launch sourcebound review, or grant source truth, final-answer, public canon, ontology, graph truth, default-route, or external-upload authority.",
    "",
  ];
  return lines.join("\n");
}

export async function validateOperationalRouteAnswerCards(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const registryRef = safeOperationalRouteRef(options.registryRef);
  const registry = await loadOperationalRouteRegistry({ repoRoot, registryRef });
  const registryValidation = await validateOperationalRouteRegistry({
    repoRoot,
    registry,
    registryRef,
    checkFiles: options.checkFiles !== false,
    checkWorkCards: options.checkWorkCards !== false,
  });
  const routes = [];
  for (const route of registry.routes ?? []) {
    const routeBlockers = [];
    const answerCardSafe = trySafeOperationalRouteRef(route?.operator_answer_card_ref);
    let answerCardRef = answerCardSafe.ref;
    let body = "";
    if (!answerCardSafe.ok) {
      routeBlockers.push("operator_answer_card_ref_unsafe");
    } else {
      try {
        body = stripBom(await fs.readFile(path.join(repoRoot, answerCardSafe.ref), "utf8"));
      } catch {
        routeBlockers.push("operator_answer_card_missing_or_unreadable");
      }
    }
    const evidencePages = Array.isArray(route?.evidence_pages) ? route.evidence_pages : [];
    const checks = {
      route_id_present: body.includes(String(route?.route_id ?? "")),
      selected_work_card_id_present: body.includes(String(route?.selected_work_card_id ?? "")),
      evidence_pages_present: evidencePages.every((page) => body.includes(String(page))),
      manual_review_notice_present: /manual-review notice/i.test(body) || /manual-review/i.test(body),
      stronger_authority_denial_present: /source truth|public canon|ontology|doctrine|final answer|DAPA doctrine/i.test(body),
      local_absolute_path_absent: !hasLocalAbsolutePathString(body),
      secret_like_value_absent: !hasSecretLikeValueString(body),
    };
    for (const [key, passed] of Object.entries(checks)) {
      if (!passed) routeBlockers.push(key.replace(/_(present|absent)$/u, "_missing_or_failed"));
    }
    routes.push({
      route_id: route?.route_id ?? null,
      operator_answer_card_ref: answerCardRef,
      selected_work_card_id: route?.selected_work_card_id ?? null,
      status: routeBlockers.length === 0 ? "pass" : "blocked",
      blocker_count: routeBlockers.length,
      blockers: routeBlockers.sort(),
      checks,
    });
  }
  const blockedRoutes = routes.filter((route) => route.status !== "pass");
  const validationId = normalizeSafeId(options.validationId ?? `operational_route_answer_card_validation_${stableHash([
    registryRef,
    formatTimestampUtc(options.now).slice(0, 10),
  ].join(":")).slice(0, 12)}`);
  const result = {
    schema_version: OPERATIONAL_ROUTE_ANSWER_CARD_VALIDATION_SCHEMA_VERSION,
    kind: "operational_route_answer_card_validation",
    status: registryValidation.status === "pass" && blockedRoutes.length === 0 ? "pass" : "blocked",
    validation_id: validationId,
    generated_at_utc: formatTimestampUtc(options.now),
    registry_ref: registryRef,
    registry_id: registry.registry_id ?? null,
    counts: {
      route_count: routes.length,
      pass_count: routes.length - blockedRoutes.length,
      blocked_count: blockedRoutes.length,
      registry_blocker_count: registryValidation.counts?.blocker_count ?? 0,
    },
    registry_validation: {
      status: registryValidation.status,
      blocker_count: registryValidation.counts?.blocker_count ?? 0,
      blockers: registryValidation.blockers,
    },
    routes,
    boundary: operationalRouteBoundary(),
  };
  const blockers = findUnsafeOperationalRouteValues(result, "answer_card_validation");
  if (blockers.length > 0) {
    return {
      ...result,
      status: "blocked",
      counts: {
        ...result.counts,
        blocked_count: result.counts.blocked_count + 1,
      },
      boundary_blockers: blockers.sort(),
    };
  }
  return result;
}

export async function buildOperationalRoutePreflight(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const registryRef = safeOperationalRouteRef(options.registryRef);
  const smokeTestRef = options.smokeTestRef ? safeOperationalRouteRef(options.smokeTestRef) : null;
  const preflightId = normalizeSafeId(options.preflightId ?? `operational_route_preflight_${stableHash([
    registryRef,
    smokeTestRef ?? "no_smoke",
    formatTimestampUtc(options.now).slice(0, 10),
  ].join(":")).slice(0, 12)}`);
  const registry = await loadOperationalRouteRegistry({ repoRoot, registryRef });
  const registryValidation = await validateOperationalRouteRegistry({
    repoRoot,
    registry,
    registryRef,
    checkFiles: options.checkFiles !== false,
    checkWorkCards: options.checkWorkCards !== false,
  });
  const answerCardValidation = await validateOperationalRouteAnswerCards({
    repoRoot,
    registryRef,
    validationId: `${preflightId}_cards`,
    checkFiles: options.checkFiles !== false,
    checkWorkCards: options.checkWorkCards !== false,
    now: options.now,
  });
  const operationalStatus = await buildOperationalRouteStatus({
    repoRoot,
    registryRef,
    usageRootRef: options.usageRootRef,
    candidateRootRef: options.candidateRootRef,
    statusId: `${preflightId}_status`,
    checkFiles: options.checkFiles !== false,
    checkWorkCards: options.checkWorkCards !== false,
    now: options.now,
  });
  let smokeRun = null;
  if (smokeTestRef) {
    smokeRun = await runOperationalRouteSmokeTests({
      repoRoot,
      registryRef,
      smokeTestRef,
      checkFiles: options.checkFiles !== false,
      now: options.now,
    });
  }
  const blockers = [];
  if (registryValidation.status !== "pass") blockers.push("registry_validation_blocked");
  if (answerCardValidation.status !== "pass") blockers.push("answer_card_validation_blocked");
  if (operationalStatus.status === "blocked_registry_invalid") blockers.push("operational_status_blocked_registry_invalid");
  if (smokeRun && smokeRun.status !== "pass") blockers.push("smoke_run_blocked");
  const answerCardByRoute = new Map((answerCardValidation.routes ?? []).map((route) => [route.route_id, route]));
  const statusByRoute = new Map((operationalStatus.routes ?? []).map((route) => [route.route_id, route]));
  const smokeByRoute = new Map((smokeRun?.tests ?? []).map((test) => [test.expected_route_id, test]));
  const routes = (registry.routes ?? []).map((route) => {
    const routeId = route.route_id;
    const answerCard = answerCardByRoute.get(routeId);
    const statusRoute = statusByRoute.get(routeId);
    const smokeTest = smokeByRoute.get(routeId);
    return {
      route_id: routeId,
      selected_work_card_id: route.selected_work_card_id ?? null,
      answer_card_status: answerCard?.status ?? "not_checked",
      smoke_status: smokeTest?.status ?? (smokeRun ? "not_matched" : "not_requested"),
      usage_count: statusRoute?.usage_count ?? 0,
      repeated_use_review_ready: statusRoute?.repeated_use_review_ready === true,
      claim_ceiling: statusRoute?.claim_ceiling ?? route.claim_ceiling ?? registry.route_defaults?.claim_ceiling ?? null,
    };
  });
  const result = {
    schema_version: OPERATIONAL_ROUTE_PREFLIGHT_SCHEMA_VERSION,
    kind: "operational_route_preflight",
    status: blockers.length === 0 ? "pass_private_manual_review_ready" : "blocked",
    preflight_id: preflightId,
    generated_at_utc: formatTimestampUtc(options.now),
    registry_ref: registryRef,
    registry_id: registry.registry_id ?? null,
    smoke_test_ref: smokeTestRef,
    blockers,
    counts: {
      route_count: registry.routes?.length ?? 0,
      registry_blocker_count: registryValidation.counts?.blocker_count ?? 0,
      answer_card_blocked_count: answerCardValidation.counts?.blocked_count ?? 0,
      smoke_blocker_count: smokeRun?.counts?.blocker_count ?? 0,
      usage_record_count: operationalStatus.counts?.usage_record_count ?? 0,
      repeated_use_review_ready_route_count: operationalStatus.counts?.repeated_use_review_ready_route_count ?? 0,
      unmatched_candidate_count: operationalStatus.counts?.unmatched_candidate_count ?? 0,
    },
    registry_validation: {
      status: registryValidation.status,
      counts: registryValidation.counts,
    },
    answer_card_validation: {
      status: answerCardValidation.status,
      counts: answerCardValidation.counts,
    },
    smoke_run: smokeRun
      ? {
          status: smokeRun.status,
          smoke_test_ref: smokeRun.smoke_test_ref,
          smoke_test_set_id: smokeRun.smoke_test_set_id,
          counts: smokeRun.counts,
        }
      : {
          status: "not_requested",
          smoke_test_ref: null,
          counts: null,
        },
    operational_status: {
      status: operationalStatus.status,
      status_id: operationalStatus.status_id,
      counts: operationalStatus.counts,
      next_actions: operationalStatus.next_actions,
    },
    routes,
    next_actions: operationalRoutePreflightNextActions({
      blocked: blockers.length > 0,
      operationalStatus,
      smokeRun,
    }),
    boundary: operationalRouteBoundary(),
  };
  const unsafeBlockers = findUnsafeOperationalRouteValues(result, "operational_route_preflight");
  if (unsafeBlockers.length > 0) {
    return {
      ...result,
      status: "blocked",
      blockers: [...result.blockers, ...unsafeBlockers].sort(),
    };
  }
  return result;
}

export async function writeOperationalRoutePreflight(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const preflight = await buildOperationalRoutePreflight(options);
  const outputRef = options.outputRef ?? defaultOperationalRoutePreflightOutputRef(preflight);
  const outputPath = path.join(repoRoot, safeOperationalRoutePreflightOutputPath(outputRef));
  await writeJson(outputPath, preflight);
  return {
    status: "written",
    operational_route_preflight_ref: normalizeRepoPath(path.relative(repoRoot, outputPath)),
    preflight_id: preflight.preflight_id,
    preflight_status: preflight.status,
    route_count: preflight.counts.route_count,
    answer_card_blocked_count: preflight.counts.answer_card_blocked_count,
    smoke_blocker_count: preflight.counts.smoke_blocker_count,
    repeated_use_review_ready_route_count: preflight.counts.repeated_use_review_ready_route_count,
  };
}

export async function loadOperationalRoutePreflight(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const preflightRef = safeOperationalRoutePreflightRef(options.preflightRef ?? options.operationalRoutePreflightRef);
  return readJson(path.join(repoRoot, preflightRef));
}

export function validateOperationalRoutePreflight(preflight) {
  const blockers = [];
  const allowedStatuses = new Set(["pass_private_manual_review_ready", "blocked"]);
  if (preflight?.schema_version !== OPERATIONAL_ROUTE_PREFLIGHT_SCHEMA_VERSION) blockers.push("schema_version_mismatch");
  if (preflight?.kind !== "operational_route_preflight") blockers.push("kind_must_be_operational_route_preflight");
  if (!ROUTE_ID_PATTERN.test(String(preflight?.preflight_id ?? ""))) blockers.push("preflight_id_must_be_safe_id");
  if (!allowedStatuses.has(preflight?.status)) blockers.push("status_must_be_allowed_preflight_state");
  if (!trySafeOperationalRouteRef(preflight?.registry_ref).ok) blockers.push("registry_ref_unsafe");
  if (preflight?.smoke_test_ref !== null && preflight?.smoke_test_ref !== undefined) {
    if (!trySafeOperationalRouteRef(preflight.smoke_test_ref).ok) blockers.push("smoke_test_ref_unsafe");
  }
  if (!preflight?.registry_validation || typeof preflight.registry_validation !== "object") {
    blockers.push("registry_validation_required");
  }
  if (!preflight?.answer_card_validation || typeof preflight.answer_card_validation !== "object") {
    blockers.push("answer_card_validation_required");
  }
  if (!preflight?.operational_status || typeof preflight.operational_status !== "object") {
    blockers.push("operational_status_required");
  }
  if (!Array.isArray(preflight?.routes)) {
    blockers.push("routes_must_be_array");
  }
  for (const route of preflight?.routes ?? []) {
    if (!ROUTE_ID_PATTERN.test(String(route?.route_id ?? ""))) blockers.push("route_id_must_be_safe_id");
    if (route?.selected_work_card_id && !ROUTE_ID_PATTERN.test(String(route.selected_work_card_id))) {
      blockers.push("selected_work_card_id_must_be_safe_id");
    }
  }
  if (preflight?.boundary?.metadata_only !== true) blockers.push("boundary_metadata_only_must_be_true");
  if (preflight?.boundary?.source_text_loaded !== false) blockers.push("boundary_source_text_loaded_must_be_false");
  if (preflight?.boundary?.final_answer_authority_allowed !== false) {
    blockers.push("boundary_final_answer_authority_allowed_must_be_false");
  }
  if (preflight?.boundary?.public_canon_promotion_allowed !== false) {
    blockers.push("boundary_public_canon_promotion_allowed_must_be_false");
  }
  blockers.push(...findUnsafeOperationalRouteValues(preflight, "operational_route_preflight"));
  return {
    schema_version: OPERATIONAL_ROUTE_PREFLIGHT_VALIDATION_SCHEMA_VERSION,
    kind: "operational_route_preflight_validation",
    status: blockers.length === 0 ? "pass" : "blocked",
    preflight_id: preflight?.preflight_id ?? null,
    preflight_status: preflight?.status ?? null,
    blocker_count: blockers.length,
    blockers: [...new Set(blockers)].sort(),
    counts: preflight?.counts ?? null,
    boundary: {
      metadata_only: preflight?.boundary?.metadata_only === true,
      source_text_loaded: preflight?.boundary?.source_text_loaded === true,
      final_answer_authority_allowed: preflight?.boundary?.final_answer_authority_allowed === true,
      public_canon_promotion_allowed: preflight?.boundary?.public_canon_promotion_allowed === true,
    },
  };
}

export function renderOperationalRoutePreflightText(preflight) {
  const lines = [
    `Status: ${preflight.status}`,
    `Preflight: ${preflight.preflight_id}`,
    `Registry: ${preflight.registry_ref}`,
    `Smoke tests: ${preflight.smoke_test_ref ?? "not_requested"}`,
    `Routes: ${preflight.counts?.route_count ?? 0}`,
    `Usage records: ${preflight.counts?.usage_record_count ?? 0}`,
    `Ready routes: ${preflight.counts?.repeated_use_review_ready_route_count ?? 0}`,
    `Unmatched candidates: ${preflight.counts?.unmatched_candidate_count ?? 0}`,
    `Registry validation: ${preflight.registry_validation?.status ?? "unknown"}`,
    `Answer cards: ${preflight.answer_card_validation?.status ?? "unknown"}`,
    `Smoke run: ${preflight.smoke_run?.status ?? "not_requested"}`,
    `Operational status: ${preflight.operational_status?.status ?? "unknown"}`,
    "Routes:",
    ...(preflight.routes ?? []).map(
      (route) =>
        `- ${route.route_id}: answer_card=${route.answer_card_status}, smoke=${route.smoke_status}, usage=${route.usage_count}, repeated_ready=${route.repeated_use_review_ready === true ? "yes" : "no"}, claim=${route.claim_ceiling ?? "none"}`,
    ),
    "Next actions:",
    ...(preflight.next_actions ?? []).map((action) => `- ${action}`),
    "",
    "Boundary: preflight is metadata only. It does not execute answer shells, write usage/candidate records, persist raw queries, persist answer-card bodies, load source text/chunks, launch sourcebound review, or grant source truth, final-answer, public canon, ontology, graph truth, default-route, or external-upload authority.",
    "",
  ];
  return lines.join("\n");
}

export async function buildOperationalRouteDashboard(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const registryRef = safeOperationalRouteRef(options.registryRef);
  const smokeTestRef = options.smokeTestRef ? safeOperationalRouteRef(options.smokeTestRef) : null;
  const [catalog, preflight] = await Promise.all([
    buildOperationalRouteCatalog({
      repoRoot,
      registryRef,
      checkFiles: options.checkFiles !== false,
      checkWorkCards: options.checkWorkCards !== false,
      now: options.now,
    }),
    buildOperationalRoutePreflight({
      repoRoot,
      registryRef,
      smokeTestRef,
      usageRootRef: options.usageRootRef,
      candidateRootRef: options.candidateRootRef,
      preflightId: options.preflightId,
      checkFiles: options.checkFiles !== false,
      checkWorkCards: options.checkWorkCards !== false,
      now: options.now,
    }),
  ]);
  const preflightByRoute = new Map((preflight.routes ?? []).map((route) => [route.route_id, route]));
  const routeTable = (catalog.routes ?? []).map((route) => {
    const preflightRoute = preflightByRoute.get(route.route_id) ?? {};
    return {
      route_id: route.route_id,
      selected_work_card_id: route.selected_work_card_id,
      evidence_pages: route.evidence_pages ?? [],
      review_context_pages: route.review_context_pages ?? [],
      usage_count: preflightRoute.usage_count ?? 0,
      repeated_use_review_ready: preflightRoute.repeated_use_review_ready === true,
      answer_card_status: preflightRoute.answer_card_status ?? "not_checked",
      smoke_status: preflightRoute.smoke_status ?? "not_requested",
      claim_ceiling: route.claim_ceiling,
      current_known_gap: route.current_known_gap,
    };
  });
  const unmatchedCandidateCount = preflight.counts?.unmatched_candidate_count ?? 0;
  const readyRouteCount = preflight.counts?.repeated_use_review_ready_route_count ?? 0;
  let status = "ready_private_manual_review";
  if (catalog.status !== "ready_private_manual_review" || preflight.status !== "pass_private_manual_review_ready") {
    status = "blocked";
  } else if (unmatchedCandidateCount > 0) {
    status = "candidate_review_required";
  } else if (readyRouteCount > 0) {
    status = "sourcebound_review_ready";
  }
  const dashboard = {
    schema_version: OPERATIONAL_ROUTE_DASHBOARD_SCHEMA_VERSION,
    kind: "operational_route_dashboard",
    status,
    generated_at_utc: formatTimestampUtc(options.now),
    registry_ref: registryRef,
    registry_id: catalog.registry_id ?? null,
    smoke_test_ref: smokeTestRef,
    summary: {
      catalog_status: catalog.status,
      preflight_status: preflight.status,
      operational_status: preflight.operational_status?.status ?? "unknown",
      route_count: catalog.counts?.route_count ?? routeTable.length,
      usage_record_count: preflight.counts?.usage_record_count ?? 0,
      repeated_use_review_ready_route_count: readyRouteCount,
      unmatched_candidate_count: unmatchedCandidateCount,
      answer_card_blocked_count: preflight.counts?.answer_card_blocked_count ?? 0,
      smoke_blocker_count: preflight.counts?.smoke_blocker_count ?? 0,
    },
    routes: routeTable,
    next_actions: operationalRouteDashboardNextActions(status),
    boundary: operationalRouteBoundary(),
  };
  const unsafeBlockers = findUnsafeOperationalRouteValues(dashboard, "operational_route_dashboard");
  if (unsafeBlockers.length > 0) {
    return {
      ...dashboard,
      status: "blocked",
      unsafe_blockers: unsafeBlockers.sort(),
    };
  }
  return dashboard;
}

export function validateOperationalRouteDashboard(dashboard) {
  const blockers = [];
  const allowedStatuses = new Set([
    "blocked",
    "candidate_review_required",
    "ready_private_manual_review",
    "sourcebound_review_ready",
  ]);
  if (dashboard?.schema_version !== OPERATIONAL_ROUTE_DASHBOARD_SCHEMA_VERSION) blockers.push("schema_version_mismatch");
  if (dashboard?.kind !== "operational_route_dashboard") blockers.push("kind_must_be_operational_route_dashboard");
  if (!allowedStatuses.has(dashboard?.status)) blockers.push("status_must_be_allowed_dashboard_state");
  if (!trySafeOperationalRouteRef(dashboard?.registry_ref).ok) blockers.push("registry_ref_unsafe");
  if (dashboard?.smoke_test_ref !== null && dashboard?.smoke_test_ref !== undefined) {
    if (!trySafeOperationalRouteRef(dashboard.smoke_test_ref).ok) blockers.push("smoke_test_ref_unsafe");
  }
  if (!dashboard?.summary || typeof dashboard.summary !== "object") blockers.push("summary_required");
  if (!Array.isArray(dashboard?.routes)) blockers.push("routes_must_be_array");
  for (const route of dashboard?.routes ?? []) {
    if (!ROUTE_ID_PATTERN.test(String(route?.route_id ?? ""))) blockers.push("route_id_must_be_safe_id");
    if (route?.selected_work_card_id && !ROUTE_ID_PATTERN.test(String(route.selected_work_card_id))) {
      blockers.push("selected_work_card_id_must_be_safe_id");
    }
    if (!validatePageArray(route?.evidence_pages).valid) {
      blockers.push("evidence_pages_must_be_positive_integer_array");
    }
    if (!validatePageArray(route?.review_context_pages, { allowEmpty: true }).valid) {
      blockers.push("review_context_pages_must_be_positive_integer_array");
    }
  }
  if (dashboard?.boundary?.metadata_only !== true) blockers.push("boundary_metadata_only_must_be_true");
  if (dashboard?.boundary?.source_text_loaded !== false) blockers.push("boundary_source_text_loaded_must_be_false");
  if (dashboard?.boundary?.final_answer_authority_allowed !== false) {
    blockers.push("boundary_final_answer_authority_allowed_must_be_false");
  }
  if (dashboard?.boundary?.public_canon_promotion_allowed !== false) {
    blockers.push("boundary_public_canon_promotion_allowed_must_be_false");
  }
  if (dashboard?.boundary?.default_route_mutation_allowed !== false) {
    blockers.push("boundary_default_route_mutation_allowed_must_be_false");
  }
  blockers.push(...findUnsafeOperationalRouteValues(dashboard, "operational_route_dashboard"));
  return {
    schema_version: OPERATIONAL_ROUTE_DASHBOARD_VALIDATION_SCHEMA_VERSION,
    kind: "operational_route_dashboard_validation",
    status: blockers.length === 0 ? "pass" : "blocked",
    dashboard_status: dashboard?.status ?? null,
    blocker_count: blockers.length,
    blockers: [...new Set(blockers)].sort(),
    summary: dashboard?.summary ?? null,
    boundary: {
      metadata_only: dashboard?.boundary?.metadata_only === true,
      source_text_loaded: dashboard?.boundary?.source_text_loaded === true,
      final_answer_authority_allowed: dashboard?.boundary?.final_answer_authority_allowed === true,
      public_canon_promotion_allowed: dashboard?.boundary?.public_canon_promotion_allowed === true,
      default_route_mutation_allowed: dashboard?.boundary?.default_route_mutation_allowed === true,
    },
  };
}

export function renderOperationalRouteDashboardText(dashboard) {
  const lines = [
    `Status: ${dashboard.status}`,
    `Registry: ${dashboard.registry_ref}`,
    `Catalog: ${dashboard.summary?.catalog_status ?? "unknown"}`,
    `Preflight: ${dashboard.summary?.preflight_status ?? "unknown"}`,
    `Operational status: ${dashboard.summary?.operational_status ?? "unknown"}`,
    `Routes: ${dashboard.summary?.route_count ?? 0}`,
    `Usage records: ${dashboard.summary?.usage_record_count ?? 0}`,
    `Repeated-use ready routes: ${dashboard.summary?.repeated_use_review_ready_route_count ?? 0}`,
    `Unmatched candidates: ${dashboard.summary?.unmatched_candidate_count ?? 0}`,
    "",
    "Routes:",
  ];
  for (const route of dashboard.routes ?? []) {
    lines.push(
      `- ${route.route_id}`,
      `  Work card: ${route.selected_work_card_id}`,
      `  Evidence pages: ${(route.evidence_pages ?? []).join(", ")}`,
      `  Review context pages: ${(route.review_context_pages ?? []).join(", ")}`,
      `  Usage count: ${route.usage_count}`,
      `  Answer card: ${route.answer_card_status}`,
      `  Smoke: ${route.smoke_status}`,
      `  Claim ceiling: ${route.claim_ceiling}`,
      `  Current known gap: ${route.current_known_gap ?? "(none)"}`,
    );
  }
  lines.push(
    "",
    "Next actions:",
    ...(dashboard.next_actions ?? []).map((action) => `- ${action}`),
    "",
    "Boundary: dashboard metadata only. It does not create usage records, candidate records, source truth, final answers, public canon, ontology acceptance, graph truth, default routes, raw queries, answer bodies, source text, or chunks.",
    "",
  );
  return lines.join("\n");
}

export async function buildOperationalRouteSession(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const registryRef = safeOperationalRouteRef(options.registryRef);
  const smokeTestRef = options.smokeTestRef ? safeOperationalRouteRef(options.smokeTestRef) : null;
  const queryLabel = String(options.queryLabel ?? "").trim();
  if (!queryLabel) throw new Error("--query-label requires a non-empty value");
  const queryFingerprint = stableHash(`operational_route_query:${queryLabel}`);
  const sessionId = normalizeSafeId(options.sessionId ?? `operational_route_session_${stableHash([
    registryRef,
    queryFingerprint,
    formatTimestampUtc(options.now).slice(0, 10),
  ].join(":")).slice(0, 12)}`);
  const [preflight, resolution] = await Promise.all([
    buildOperationalRoutePreflight({
      repoRoot,
      registryRef,
      smokeTestRef,
      usageRootRef: options.usageRootRef,
      candidateRootRef: options.candidateRootRef,
      preflightId: `${sessionId}_preflight`,
      checkFiles: options.checkFiles !== false,
      checkWorkCards: options.checkWorkCards !== false,
      now: options.now,
    }),
    resolveOperationalRoute({
      repoRoot,
      registryRef,
      queryLabel,
      checkFiles: options.checkFiles !== false,
      now: options.now,
    }),
  ]);
  const matched = resolution.status === "matched";
  const sessionStatus =
    preflight.status !== "pass_private_manual_review_ready"
      ? "blocked_preflight"
      : matched
        ? "ready_matched_route"
        : "blocked_no_route_candidate_capture_recommended";
  const selectedRoute = matched
    ? {
        route_id: resolution.selected_route.route_id,
        selected_work_card_id: resolution.selected_route.selected_work_card_id,
        selected_work_card_ref: resolution.selected_route.selected_work_card_ref,
        operator_answer_card_ref: resolution.selected_route.operator_answer_card_ref,
        wiki_page_ref: resolution.selected_route.wiki_page_ref,
        evidence_pages: resolution.selected_route.evidence_pages,
        review_context_pages: resolution.selected_route.review_context_pages,
        claim_ceiling: resolution.selected_route.claim_ceiling,
      }
    : null;
  return {
    schema_version: OPERATIONAL_ROUTE_SESSION_SCHEMA_VERSION,
    kind: "operational_route_session",
    status: sessionStatus,
    session_id: sessionId,
    generated_at_utc: formatTimestampUtc(options.now),
    registry_ref: registryRef,
    registry_id: resolution.registry_id ?? preflight.registry_id ?? null,
    smoke_test_ref: smokeTestRef,
    query_label_fingerprint: queryFingerprint,
    raw_query_persisted: false,
    preflight_summary: {
      status: preflight.status,
      preflight_id: preflight.preflight_id,
      counts: preflight.counts,
    },
    resolution_summary: {
      status: resolution.status,
      route_id: resolution.selected_route?.route_id ?? null,
      selected_work_card_id: resolution.selected_route?.selected_work_card_id ?? null,
      evidence_pages: resolution.selected_route?.evidence_pages ?? [],
      claim_ceiling: resolution.selected_route?.claim_ceiling ?? null,
      match_score: resolution.match?.score ?? null,
      matched_token_count: resolution.match?.matched_token_count ?? null,
    },
    selected_route: selectedRoute,
    operator_surface: {
      answer_shell_available: matched,
      answer_shell_output_persisted: false,
      answer_card_body_persisted: false,
      wiki_route_available: matched,
      usage_record_allowed_after_real_answer: matched,
      candidate_record_recommended: !matched,
      source_text_loading_allowed_here: false,
    },
    suggested_commands: operationalRouteSessionSuggestedCommands({
      registryRef,
      smokeTestRef,
      matched,
    }),
    next_actions: operationalRouteSessionNextActions({ sessionStatus, matched }),
    authority: {
      source_truth_claimed: false,
      final_answer_authority_allowed: false,
      public_canon_promotion_allowed: false,
      ontology_acceptance_allowed: false,
      graph_truth_mutation_allowed: false,
      default_route_mutation_allowed: false,
      external_upload_allowed: false,
      stronger_permission_granted_here: false,
    },
    boundary: operationalRouteBoundary(),
  };
}

export async function writeOperationalRouteSession(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const session = await buildOperationalRouteSession(options);
  const outputRef = options.outputRef ?? defaultOperationalRouteSessionOutputRef(session);
  const outputPath = path.join(repoRoot, safeOperationalRouteSessionOutputPath(outputRef));
  await writeJson(outputPath, session);
  return {
    status: "written",
    operational_route_session_ref: normalizeRepoPath(path.relative(repoRoot, outputPath)),
    session_id: session.session_id,
    session_status: session.status,
    route_id: session.selected_route?.route_id ?? null,
    preflight_status: session.preflight_summary.status,
    raw_query_persisted: session.raw_query_persisted,
  };
}

export async function loadOperationalRouteSession(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const sessionRef = safeOperationalRouteSessionRef(options.sessionRef ?? options.operationalRouteSessionRef);
  return readJson(path.join(repoRoot, sessionRef));
}

export function validateOperationalRouteSession(session) {
  const blockers = [];
  const allowedStatuses = new Set([
    "blocked_no_route_candidate_capture_recommended",
    "blocked_preflight",
    "ready_matched_route",
  ]);
  if (session?.schema_version !== OPERATIONAL_ROUTE_SESSION_SCHEMA_VERSION) blockers.push("schema_version_mismatch");
  if (session?.kind !== "operational_route_session") blockers.push("kind_must_be_operational_route_session");
  if (!ROUTE_ID_PATTERN.test(String(session?.session_id ?? ""))) blockers.push("session_id_must_be_safe_id");
  if (!allowedStatuses.has(session?.status)) blockers.push("status_must_be_allowed_session_state");
  if (!trySafeOperationalRouteRef(session?.registry_ref).ok) blockers.push("registry_ref_unsafe");
  if (session?.smoke_test_ref !== null && session?.smoke_test_ref !== undefined) {
    if (!trySafeOperationalRouteRef(session.smoke_test_ref).ok) blockers.push("smoke_test_ref_unsafe");
  }
  if (!/^[a-f0-9]{64}$/u.test(String(session?.query_label_fingerprint ?? ""))) {
    blockers.push("query_label_fingerprint_unsafe");
  }
  if (session?.raw_query_persisted !== false) blockers.push("raw_query_must_not_be_persisted");
  if (!session?.preflight_summary || typeof session.preflight_summary !== "object") {
    blockers.push("preflight_summary_required");
  }
  if (!session?.resolution_summary || typeof session.resolution_summary !== "object") {
    blockers.push("resolution_summary_required");
  }
  if (session?.selected_route) {
    const refs = [
      ["selected_work_card_ref", session.selected_route.selected_work_card_ref],
      ["operator_answer_card_ref", session.selected_route.operator_answer_card_ref],
      ["wiki_page_ref", session.selected_route.wiki_page_ref],
    ];
    for (const [key, value] of refs) {
      if (!trySafeOperationalRouteRef(value).ok) blockers.push(`${key}_unsafe`);
    }
    if (!validatePageArray(session.selected_route.evidence_pages).valid) {
      blockers.push("evidence_pages_must_be_positive_integer_array");
    }
    if (!validatePageArray(session.selected_route.review_context_pages, { allowEmpty: true }).valid) {
      blockers.push("review_context_pages_must_be_positive_integer_array");
    }
  }
  if (session?.operator_surface?.answer_shell_output_persisted !== false) {
    blockers.push("answer_shell_output_must_not_be_persisted");
  }
  if (session?.operator_surface?.answer_card_body_persisted !== false) {
    blockers.push("answer_card_body_must_not_be_persisted");
  }
  if (session?.operator_surface?.source_text_loading_allowed_here !== false) {
    blockers.push("source_text_loading_must_not_be_allowed_here");
  }
  for (const [key, expected] of Object.entries({
    source_truth_claimed: false,
    final_answer_authority_allowed: false,
    public_canon_promotion_allowed: false,
    ontology_acceptance_allowed: false,
    graph_truth_mutation_allowed: false,
    default_route_mutation_allowed: false,
    external_upload_allowed: false,
    stronger_permission_granted_here: false,
  })) {
    if (session?.authority?.[key] !== expected) blockers.push(`authority_${key}_must_be_false`);
  }
  blockers.push(...findUnsafeOperationalRouteValues(session, "operational_route_session"));
  return {
    schema_version: OPERATIONAL_ROUTE_SESSION_VALIDATION_SCHEMA_VERSION,
    kind: "operational_route_session_validation",
    status: blockers.length === 0 ? "pass" : "blocked",
    session_id: session?.session_id ?? null,
    session_status: session?.status ?? null,
    route_id: session?.selected_route?.route_id ?? null,
    blocker_count: blockers.length,
    blockers: [...new Set(blockers)].sort(),
    boundary: {
      metadata_only: session?.boundary?.metadata_only === true,
      source_text_loaded: session?.boundary?.source_text_loaded === true,
      raw_query_persisted: session?.raw_query_persisted === true,
      final_answer_authority_allowed: session?.boundary?.final_answer_authority_allowed === true,
      public_canon_promotion_allowed: session?.boundary?.public_canon_promotion_allowed === true,
    },
  };
}

export function renderOperationalRouteSessionDigest(session) {
  const route = session.selected_route;
  const lines = [
    `Status: ${session.status}`,
    `Session: ${session.session_id}`,
    `Registry: ${session.registry_ref}`,
    `Preflight: ${session.preflight_summary?.status ?? "unknown"}`,
    `Raw query persisted: ${session.raw_query_persisted === true ? "yes" : "no"}`,
    `Answer shell output persisted: ${session.operator_surface?.answer_shell_output_persisted === true ? "yes" : "no"}`,
    `Answer-card body persisted: ${session.operator_surface?.answer_card_body_persisted === true ? "yes" : "no"}`,
  ];
  if (route) {
    lines.push(
      `Route: ${route.route_id}`,
      `Work card: ${route.selected_work_card_id}`,
      `Work card ref: ${route.selected_work_card_ref}`,
      `Operator answer card: ${route.operator_answer_card_ref}`,
      `Wiki page: ${route.wiki_page_ref}`,
      `Evidence pages: ${(route.evidence_pages ?? []).join(", ")}`,
      `Review context pages: ${(route.review_context_pages ?? []).join(", ")}`,
      `Claim ceiling: ${route.claim_ceiling}`,
    );
  } else {
    lines.push("Route: (no matched route)");
  }
  lines.push(
    "Next actions:",
    ...(session.next_actions ?? []).map((action) => `- ${action}`),
    "Suggested commands:",
    ...(session.suggested_commands ?? []).map((command) => `- ${command}`),
    "",
    "Boundary: route-session metadata only. It does not persist the raw query, answer shell output, answer-card body, source text, chunks, source truth, final answer authority, public canon, ontology acceptance, graph truth mutation, or default route mutation.",
    "",
  );
  return lines.join("\n");
}

export async function buildOperationalRouteSessionSweep(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const registryRef = safeOperationalRouteRef(options.registryRef);
  const smokeTestRef = safeOperationalRouteRef(options.smokeTestRef);
  const smokeTests = await loadOperationalRouteSmokeTests({ repoRoot, smokeTestRef });
  const sweepId = normalizeSafeId(options.sweepId ?? `operational_route_sweep_${stableHash([
    registryRef,
    smokeTestRef,
    formatTimestampUtc(options.now).slice(0, 10),
  ].join(":")).slice(0, 12)}`);
  const blockers = [];
  if (smokeTests.kind !== "operational_route_smoke_tests") {
    blockers.push("kind_must_be_operational_route_smoke_tests");
  }
  if (!Array.isArray(smokeTests.tests) || smokeTests.tests.length === 0) {
    blockers.push("smoke_tests_must_be_nonempty_array");
  }
  const cases = [];
  for (const [index, testCase] of (smokeTests.tests ?? []).entries()) {
    const smokeTestId = normalizeSafeId(testCase.test_id ?? `case_${index + 1}`);
    const session = await buildOperationalRouteSession({
      repoRoot,
      registryRef,
      smokeTestRef,
      queryLabel: testCase.query_label,
      sessionId: `${sweepId}_${smokeTestId}`,
      checkFiles: options.checkFiles !== false,
      checkWorkCards: options.checkWorkCards !== false,
      now: options.now,
    });
    const validation = validateOperationalRouteSession(session);
    const actual = session.selected_route ?? {};
    const evidencePagesMatch = sameNumberArray(actual.evidence_pages ?? [], testCase.expected_evidence_pages ?? []);
    const casePassed =
      session.status === "ready_matched_route" &&
      validation.status === "pass" &&
      actual.route_id === testCase.expected_route_id &&
      actual.selected_work_card_id === testCase.expected_work_card_id &&
      evidencePagesMatch;
    if (!casePassed) blockers.push(`session_sweep_case_failed:${smokeTestId}`);
    cases.push({
      smoke_test_id: smokeTestId,
      status: casePassed ? "pass" : "blocked",
      session_id: session.session_id,
      session_status: session.status,
      session_validation_status: validation.status,
      expected_route_id: testCase.expected_route_id ?? null,
      actual_route_id: actual.route_id ?? null,
      expected_work_card_id: testCase.expected_work_card_id ?? null,
      actual_work_card_id: actual.selected_work_card_id ?? null,
      expected_evidence_pages: testCase.expected_evidence_pages ?? [],
      actual_evidence_pages: actual.evidence_pages ?? [],
      evidence_pages_match: evidencePagesMatch,
      raw_query_persisted: session.raw_query_persisted === true,
      answer_shell_output_persisted: session.operator_surface?.answer_shell_output_persisted === true,
      answer_card_body_persisted: session.operator_surface?.answer_card_body_persisted === true,
      route_ref: actual.operator_answer_card_ref ?? null,
      wiki_page_ref: actual.wiki_page_ref ?? null,
      claim_ceiling: actual.claim_ceiling ?? null,
    });
  }
  const uniqueRoutes = new Set(cases.map((entry) => entry.actual_route_id).filter(Boolean));
  return {
    schema_version: OPERATIONAL_ROUTE_SESSION_SWEEP_SCHEMA_VERSION,
    kind: "operational_route_session_sweep",
    sweep_id: sweepId,
    generated_at_utc: formatTimestampUtc(options.now),
    registry_ref: registryRef,
    smoke_test_ref: smokeTestRef,
    smoke_test_set_id: smokeTests.test_set_id ?? null,
    status: blockers.length === 0 ? "pass_private_manual_review_route_set_ready" : "blocked",
    blockers: blockers.sort(),
    counts: {
      case_count: cases.length,
      pass_count: cases.filter((entry) => entry.status === "pass").length,
      blocked_count: cases.filter((entry) => entry.status !== "pass").length,
      unique_route_count: uniqueRoutes.size,
    },
    cases: cases.sort((left, right) => left.smoke_test_id.localeCompare(right.smoke_test_id)),
    authority: {
      source_truth_claimed: false,
      final_answer_authority_allowed: false,
      public_canon_promotion_allowed: false,
      ontology_acceptance_allowed: false,
      graph_truth_mutation_allowed: false,
      default_route_mutation_allowed: false,
      external_upload_allowed: false,
      sourcebound_review_launch_allowed_here: false,
    },
    boundary: {
      ...operationalRouteBoundary(),
      session_sweep_writes_usage_or_candidate: false,
      session_sweep_executes_answer_shell: false,
      session_sweep_persists_raw_query: false,
      answer_shell_output_persisted: false,
      answer_card_body_persisted: false,
    },
  };
}

export async function writeOperationalRouteSessionSweep(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const sweep = await buildOperationalRouteSessionSweep(options);
  const outputRef = options.outputRef ?? defaultOperationalRouteSessionSweepOutputRef(sweep);
  const outputPath = path.join(repoRoot, safeOperationalRouteSessionSweepOutputPath(outputRef));
  await writeJson(outputPath, sweep);
  return {
    status: "written",
    operational_route_session_sweep_ref: normalizeRepoPath(path.relative(repoRoot, outputPath)),
    sweep_id: sweep.sweep_id,
    sweep_status: sweep.status,
    case_count: sweep.counts.case_count,
    pass_count: sweep.counts.pass_count,
    blocked_count: sweep.counts.blocked_count,
    unique_route_count: sweep.counts.unique_route_count,
  };
}

export async function loadOperationalRouteSessionSweep(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const sweepRef = safeOperationalRouteSessionSweepRef(
    options.sweepRef ?? options.operationalRouteSessionSweepRef,
  );
  return readJson(path.join(repoRoot, sweepRef));
}

export function validateOperationalRouteSessionSweep(sweep) {
  const blockers = [];
  if (sweep?.schema_version !== OPERATIONAL_ROUTE_SESSION_SWEEP_SCHEMA_VERSION) blockers.push("schema_version_mismatch");
  if (sweep?.kind !== "operational_route_session_sweep") blockers.push("kind_must_be_operational_route_session_sweep");
  if (!ROUTE_ID_PATTERN.test(String(sweep?.sweep_id ?? ""))) blockers.push("sweep_id_must_be_safe_id");
  if (!trySafeOperationalRouteRef(sweep?.registry_ref).ok) blockers.push("registry_ref_unsafe");
  if (!trySafeOperationalRouteRef(sweep?.smoke_test_ref).ok) blockers.push("smoke_test_ref_unsafe");
  if (!["pass_private_manual_review_route_set_ready", "blocked"].includes(String(sweep?.status ?? ""))) {
    blockers.push("status_must_be_allowed_session_sweep_state");
  }
  if (!Array.isArray(sweep?.cases) || sweep.cases.length === 0) {
    blockers.push("cases_must_be_nonempty_array");
  }
  for (const entry of sweep?.cases ?? []) {
    if (!ROUTE_ID_PATTERN.test(String(entry?.smoke_test_id ?? ""))) blockers.push("smoke_test_id_must_be_safe_id");
    if (!ROUTE_ID_PATTERN.test(String(entry?.session_id ?? ""))) blockers.push("session_id_must_be_safe_id");
    if (!["pass", "blocked"].includes(String(entry?.status ?? ""))) blockers.push("case_status_invalid");
    if (!["pass", "blocked"].includes(String(entry?.session_validation_status ?? ""))) {
      blockers.push("case_session_validation_status_invalid");
    }
    if (entry?.expected_route_id && !ROUTE_ID_PATTERN.test(String(entry.expected_route_id))) {
      blockers.push("case_expected_route_id_unsafe");
    }
    if (entry?.actual_route_id && !ROUTE_ID_PATTERN.test(String(entry.actual_route_id))) {
      blockers.push("case_actual_route_id_unsafe");
    }
    if (entry?.expected_work_card_id && !ROUTE_ID_PATTERN.test(String(entry.expected_work_card_id))) {
      blockers.push("case_expected_work_card_id_unsafe");
    }
    if (entry?.actual_work_card_id && !ROUTE_ID_PATTERN.test(String(entry.actual_work_card_id))) {
      blockers.push("case_actual_work_card_id_unsafe");
    }
    if (!validatePageArray(entry?.expected_evidence_pages ?? [], { allowEmpty: true }).valid) {
      blockers.push("case_expected_evidence_pages_invalid");
    }
    if (!validatePageArray(entry?.actual_evidence_pages ?? [], { allowEmpty: true }).valid) {
      blockers.push("case_actual_evidence_pages_invalid");
    }
    if (entry?.raw_query_persisted !== false) blockers.push("case_raw_query_must_not_be_persisted");
    if (entry?.answer_shell_output_persisted !== false) blockers.push("case_answer_shell_output_must_not_be_persisted");
    if (entry?.answer_card_body_persisted !== false) blockers.push("case_answer_card_body_must_not_be_persisted");
    if (entry?.route_ref !== null && entry?.route_ref !== undefined && !trySafeOperationalRouteRef(entry.route_ref).ok) {
      blockers.push("case_route_ref_unsafe");
    }
    if (entry?.wiki_page_ref !== null && entry?.wiki_page_ref !== undefined && !trySafeOperationalRouteRef(entry.wiki_page_ref).ok) {
      blockers.push("case_wiki_page_ref_unsafe");
    }
  }
  for (const [key, expected] of Object.entries({
    source_truth_claimed: false,
    final_answer_authority_allowed: false,
    public_canon_promotion_allowed: false,
    ontology_acceptance_allowed: false,
    graph_truth_mutation_allowed: false,
    default_route_mutation_allowed: false,
    external_upload_allowed: false,
    sourcebound_review_launch_allowed_here: false,
  })) {
    if (sweep?.authority?.[key] !== expected) blockers.push(`authority_${key}_must_be_false`);
  }
  for (const [key, expected] of Object.entries({
    metadata_only: true,
    source_text_loaded: false,
    chunk_text_loaded: false,
    session_sweep_writes_usage_or_candidate: false,
    session_sweep_executes_answer_shell: false,
    session_sweep_persists_raw_query: false,
    answer_shell_output_persisted: false,
    answer_card_body_persisted: false,
    final_answer_authority_allowed: false,
    public_canon_promotion_allowed: false,
    ontology_acceptance_allowed: false,
    default_route_mutation_allowed: false,
    graph_truth_mutation_allowed: false,
  })) {
    if (sweep?.boundary?.[key] !== expected) blockers.push(`boundary_${key}_must_be_${expected}`);
  }
  blockers.push(...findUnsafeOperationalRouteValues(sweep, "operational_route_session_sweep"));
  return {
    schema_version: OPERATIONAL_ROUTE_SESSION_SWEEP_VALIDATION_SCHEMA_VERSION,
    kind: "operational_route_session_sweep_validation",
    status: blockers.length === 0 ? "pass" : "blocked",
    sweep_id: sweep?.sweep_id ?? null,
    sweep_status: sweep?.status ?? null,
    blocker_count: blockers.length,
    blockers: [...new Set(blockers)].sort(),
    counts: sweep?.counts ?? null,
    boundary: {
      metadata_only: sweep?.boundary?.metadata_only === true,
      source_text_loaded: sweep?.boundary?.source_text_loaded === true,
      raw_query_persisted: sweep?.boundary?.session_sweep_persists_raw_query === true,
      usage_or_candidate_written: sweep?.boundary?.session_sweep_writes_usage_or_candidate === true,
    },
  };
}

export function renderOperationalRouteSessionSweepText(sweep) {
  const lines = [
    `Status: ${sweep.status}`,
    `Sweep: ${sweep.sweep_id}`,
    `Registry: ${sweep.registry_ref}`,
    `Smoke tests: ${sweep.smoke_test_ref}`,
    `Cases: ${sweep.counts?.pass_count ?? 0}/${sweep.counts?.case_count ?? 0} pass`,
    `Unique routes: ${sweep.counts?.unique_route_count ?? 0}`,
    "Cases:",
    ...(sweep.cases ?? []).map(
      (entry) =>
        `- ${entry.smoke_test_id}: ${entry.status}, session=${entry.session_status}, route=${entry.actual_route_id ?? "none"}, work_card=${entry.actual_work_card_id ?? "none"}, evidence_pages_match=${entry.evidence_pages_match === true}`,
    ),
    "",
    "Boundary: session sweep is metadata only. It does not persist raw queries, execute answer shells, write usage/candidate records, load source text/chunks, launch sourcebound review, or grant source truth, final-answer, public canon, ontology, graph truth, default-route, or external-upload authority.",
    "",
  ];
  return lines.join("\n");
}

export async function buildOperationalRouteReadiness(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const registryRef = safeOperationalRouteRef(options.registryRef);
  const smokeTestRef = safeOperationalRouteRef(options.smokeTestRef);
  const readinessId = normalizeSafeId(options.readinessId ?? `operational_route_readiness_${stableHash([
    registryRef,
    smokeTestRef,
    options.usageRootRef ?? DEFAULT_USAGE_RECORD_ROOT,
    options.candidateRootRef ?? DEFAULT_CANDIDATE_RECORD_ROOT,
    formatTimestampUtc(options.now).slice(0, 10),
  ].join(":")).slice(0, 12)}`);
  const [opsCheck, routeSweep] = await Promise.all([
    buildOperationalRouteOpsCheck({
      repoRoot,
      registryRef,
      smokeTestRef,
      usageRootRef: options.usageRootRef,
      candidateRootRef: options.candidateRootRef,
      opsCheckId: `${readinessId}_ops_check`,
      checkFiles: options.checkFiles,
      checkWorkCards: options.checkWorkCards,
      now: options.now,
    }),
    buildOperationalRouteSessionSweep({
      repoRoot,
      registryRef,
      smokeTestRef,
      sweepId: `${readinessId}_route_sweep`,
      checkFiles: options.checkFiles,
      checkWorkCards: options.checkWorkCards,
      now: options.now,
    }),
  ]);
  const validations = {
    ops_check: validateOperationalRouteOpsCheck(opsCheck),
    route_sweep: validateOperationalRouteSessionSweep(routeSweep),
  };
  const blockers = [];
  if (validations.ops_check.status !== "pass") blockers.push("ops_check_validation_blocked");
  if (opsCheck.status !== "pass_private_manual_review_ready") blockers.push("ops_check_not_private_manual_review_ready");
  if (validations.route_sweep.status !== "pass") blockers.push("route_sweep_validation_blocked");
  if (routeSweep.status !== "pass_private_manual_review_route_set_ready") blockers.push("route_sweep_not_private_manual_review_ready");
  const usageRecordCount = opsCheck.counts?.usage_record_count ?? 0;
  const repeatedUseThreshold = opsCheck.counts?.repeated_use_review_threshold ?? null;
  const repeatedReadyCount = opsCheck.counts?.repeated_use_review_ready_route_count ?? 0;
  const unmatchedCandidateCount = opsCheck.counts?.unmatched_candidate_count ?? 0;
  const readinessStatus =
    blockers.length > 0
      ? "blocked"
      : repeatedReadyCount > 0 || unmatchedCandidateCount > 0
        ? "ready_private_manual_review_with_followup_gate"
        : "ready_private_manual_review_below_repeated_use_threshold";
  return {
    schema_version: OPERATIONAL_ROUTE_READINESS_SCHEMA_VERSION,
    kind: "operational_route_readiness",
    readiness_id: readinessId,
    generated_at_utc: formatTimestampUtc(options.now),
    registry_ref: registryRef,
    smoke_test_ref: smokeTestRef,
    status: readinessStatus,
    blockers: blockers.sort(),
    surfaces: {
      ops_check: {
        status: opsCheck.status,
        validation_status: validations.ops_check.status,
        blocker_count: validations.ops_check.blocker_count,
      },
      route_sweep: {
        status: routeSweep.status,
        validation_status: validations.route_sweep.status,
        blocker_count: validations.route_sweep.blocker_count,
      },
    },
    counts: {
      route_count: opsCheck.counts?.route_count ?? routeSweep.counts?.unique_route_count ?? 0,
      route_sweep_case_count: routeSweep.counts?.case_count ?? 0,
      route_sweep_pass_count: routeSweep.counts?.pass_count ?? 0,
      route_sweep_blocked_count: routeSweep.counts?.blocked_count ?? 0,
      usage_record_count: usageRecordCount,
      repeated_use_review_threshold: repeatedUseThreshold,
      repeated_use_review_ready_route_count: repeatedReadyCount,
      unmatched_candidate_count: unmatchedCandidateCount,
      command_count: opsCheck.counts?.command_count ?? 0,
    },
    ready_refs: {
      route_registry_ref: registryRef,
      smoke_test_ref: smokeTestRef,
    },
    next_actions:
      blockers.length > 0
        ? ["inspect_blocked_readiness_surface_before_operator_use"]
        : [
            "answer_real_operator_questions_with_operational_route_operator_run",
            "record_usage_only_after_real_delivered_operator_answer",
            "run_closeout_after_answer",
            "route_to_sourcebound_review_only_after_repeated_real_use_or_owner_request",
          ],
    authority: {
      operator_use_allowed: blockers.length === 0,
      sourcebound_review_launch_allowed_here: false,
      source_truth_claimed_here: false,
      final_answer_authority_allowed_here: false,
      public_canon_promotion_allowed_here: false,
      ontology_acceptance_allowed_here: false,
      graph_truth_mutation_allowed_here: false,
      default_route_mutation_allowed_here: false,
      external_upload_allowed_here: false,
    },
    boundary: {
      ...operationalRouteBoundary(),
      readiness_writes_usage_or_candidate: false,
      readiness_executes_answer_shell: false,
      readiness_launches_sourcebound_review: false,
      raw_query_persisted: false,
      answer_shell_output_persisted: false,
      answer_card_body_persisted: false,
    },
  };
}

export async function writeOperationalRouteReadiness(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const readiness = await buildOperationalRouteReadiness(options);
  const outputRef = options.outputRef ?? defaultOperationalRouteReadinessOutputRef(readiness);
  const outputPath = path.join(repoRoot, safeOperationalRouteReadinessOutputPath(outputRef));
  await writeJson(outputPath, readiness);
  return {
    status: "written",
    operational_route_readiness_ref: normalizeRepoPath(path.relative(repoRoot, outputPath)),
    readiness_id: readiness.readiness_id,
    readiness_status: readiness.status,
    route_count: readiness.counts.route_count,
    route_sweep_pass_count: readiness.counts.route_sweep_pass_count,
    usage_record_count: readiness.counts.usage_record_count,
    repeated_use_review_ready_route_count: readiness.counts.repeated_use_review_ready_route_count,
    unmatched_candidate_count: readiness.counts.unmatched_candidate_count,
  };
}

export async function loadOperationalRouteReadiness(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const readinessRef = safeOperationalRouteReadinessRef(
    options.readinessRef ?? options.operationalRouteReadinessRef,
  );
  return readJson(path.join(repoRoot, readinessRef));
}

export function validateOperationalRouteReadiness(readiness) {
  const blockers = [];
  if (readiness?.schema_version !== OPERATIONAL_ROUTE_READINESS_SCHEMA_VERSION) blockers.push("schema_version_mismatch");
  if (readiness?.kind !== "operational_route_readiness") blockers.push("kind_must_be_operational_route_readiness");
  if (!ROUTE_ID_PATTERN.test(String(readiness?.readiness_id ?? ""))) blockers.push("readiness_id_must_be_safe_id");
  if (!trySafeOperationalRouteRef(readiness?.registry_ref).ok) blockers.push("registry_ref_unsafe");
  if (!trySafeOperationalRouteRef(readiness?.smoke_test_ref).ok) blockers.push("smoke_test_ref_unsafe");
  if (![
    "ready_private_manual_review_below_repeated_use_threshold",
    "ready_private_manual_review_with_followup_gate",
    "blocked",
  ].includes(String(readiness?.status ?? ""))) {
    blockers.push("status_must_be_allowed_readiness_state");
  }
  for (const [surfaceId, surface] of Object.entries(readiness?.surfaces ?? {})) {
    if (!ROUTE_ID_PATTERN.test(surfaceId)) blockers.push("surface_id_must_be_safe_id");
    if (!["pass", "blocked"].includes(String(surface?.validation_status ?? ""))) {
      blockers.push(`surface_${surfaceId}_validation_status_invalid`);
    }
  }
  const falseAuthorityKeys = [
    "sourcebound_review_launch_allowed_here",
    "source_truth_claimed_here",
    "final_answer_authority_allowed_here",
    "public_canon_promotion_allowed_here",
    "ontology_acceptance_allowed_here",
    "graph_truth_mutation_allowed_here",
    "default_route_mutation_allowed_here",
    "external_upload_allowed_here",
  ];
  for (const key of falseAuthorityKeys) {
    if (readiness?.authority?.[key] !== false) blockers.push(`authority_${key}_must_be_false`);
  }
  const falseBoundaryKeys = [
    "source_text_loaded",
    "chunk_text_loaded",
    "source_payloads_included",
    "copied_excerpts_included",
    "notebooklm_answers_included",
    "secrets_or_session_included",
    "runtime_absolute_paths_included",
    "final_answer_authority_allowed",
    "public_canon_promotion_allowed",
    "ontology_acceptance_allowed",
    "default_route_mutation_allowed",
    "graph_truth_mutation_allowed",
    "readiness_writes_usage_or_candidate",
    "readiness_executes_answer_shell",
    "readiness_launches_sourcebound_review",
    "raw_query_persisted",
    "answer_shell_output_persisted",
    "answer_card_body_persisted",
  ];
  if (readiness?.boundary?.metadata_only !== true) blockers.push("boundary_metadata_only_must_be_true");
  for (const key of falseBoundaryKeys) {
    if (readiness?.boundary?.[key] !== false) blockers.push(`boundary_${key}_must_be_false`);
  }
  blockers.push(...findUnsafeOperationalRouteValues(readiness, "operational_route_readiness"));
  return {
    schema_version: OPERATIONAL_ROUTE_READINESS_VALIDATION_SCHEMA_VERSION,
    kind: "operational_route_readiness_validation",
    status: blockers.length === 0 ? "pass" : "blocked",
    readiness_id: readiness?.readiness_id ?? null,
    readiness_status: readiness?.status ?? null,
    blocker_count: blockers.length,
    blockers: [...new Set(blockers)].sort(),
    counts: readiness?.counts ?? null,
    boundary: {
      metadata_only: readiness?.boundary?.metadata_only === true,
      readiness_writes_usage_or_candidate: readiness?.boundary?.readiness_writes_usage_or_candidate === true,
      readiness_launches_sourcebound_review: readiness?.boundary?.readiness_launches_sourcebound_review === true,
      public_canon_promotion_allowed: readiness?.boundary?.public_canon_promotion_allowed === true,
    },
  };
}

export function renderOperationalRouteReadinessText(readiness) {
  const lines = [
    `Status: ${readiness.status}`,
    `Readiness: ${readiness.readiness_id}`,
    `Registry: ${readiness.registry_ref}`,
    `Smoke tests: ${readiness.smoke_test_ref}`,
    `Routes: ${readiness.counts?.route_count ?? 0}`,
    `Route sweep: ${readiness.counts?.route_sweep_pass_count ?? 0}/${readiness.counts?.route_sweep_case_count ?? 0} pass`,
    `Usage records: ${readiness.counts?.usage_record_count ?? 0}`,
    `Repeated-use threshold: ${readiness.counts?.repeated_use_review_threshold ?? "unknown"}`,
    `Ready routes: ${readiness.counts?.repeated_use_review_ready_route_count ?? 0}`,
    `Unmatched candidates: ${readiness.counts?.unmatched_candidate_count ?? 0}`,
    "Surfaces:",
    ...Object.entries(readiness.surfaces ?? {}).map(
      ([surfaceId, surface]) =>
        `- ${surfaceId}: status=${surface.status}, validation=${surface.validation_status}, blockers=${surface.blocker_count ?? 0}`,
    ),
    "Next actions:",
    ...(readiness.next_actions ?? []).map((action) => `- ${action}`),
    "",
    "Boundary: readiness is metadata only. It does not persist raw queries, execute answer shells, write usage/candidate records, load source text/chunks, launch sourcebound review, or grant source truth, final-answer, public canon, ontology, graph truth, default-route, or external-upload authority.",
    "",
  ];
  return lines.join("\n");
}

export async function buildOperationalRouteEvidenceSweep(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const sweepId = normalizeSafeId(options.sweepId ?? options.evidenceSweepId ?? `operational_route_evidence_sweep_${stableHash([
    options.preflightRef ?? "",
    options.opsCheckRef ?? "",
    options.sessionSweepRef ?? "",
    options.readinessRef ?? "",
    options.statusRef ?? "",
    options.usageSummaryRef ?? "",
    ...(options.usageRecordRefs ?? []),
    ...(options.candidateRecordRefs ?? []),
    formatTimestampUtc(options.now).slice(0, 10),
  ].join(":")).slice(0, 12)}`);
  const evidence = [];
  const singleEntries = [
    {
      evidence_type: "preflight",
      ref: options.preflightRef ?? options.operationalRoutePreflightRef,
      load: (ref) => loadOperationalRoutePreflight({ repoRoot, preflightRef: ref }),
      validate: validateOperationalRoutePreflight,
      idKey: "preflight_id",
    },
    {
      evidence_type: "ops_check",
      ref: options.opsCheckRef ?? options.operationalRouteOpsCheckRef,
      load: (ref) => loadOperationalRouteOpsCheck({ repoRoot, opsCheckRef: ref }),
      validate: validateOperationalRouteOpsCheck,
      idKey: "ops_check_id",
    },
    {
      evidence_type: "session_sweep",
      ref: options.sessionSweepRef ?? options.operationalRouteSessionSweepRef,
      load: (ref) => loadOperationalRouteSessionSweep({ repoRoot, sweepRef: ref }),
      validate: validateOperationalRouteSessionSweep,
      idKey: "sweep_id",
    },
    {
      evidence_type: "readiness",
      ref: options.readinessRef ?? options.operationalRouteReadinessRef,
      load: (ref) => loadOperationalRouteReadiness({ repoRoot, readinessRef: ref }),
      validate: validateOperationalRouteReadiness,
      idKey: "readiness_id",
    },
    {
      evidence_type: "status",
      ref: options.statusRef ?? options.operationalRouteStatusRef,
      load: (ref) => loadOperationalRouteStatus({ repoRoot, statusRef: ref }),
      validate: validateOperationalRouteStatus,
      idKey: "status_id",
    },
    {
      evidence_type: "usage_summary",
      ref: options.usageSummaryRef,
      load: (ref) => loadOperationalRouteUsageSummary({ repoRoot, summaryRef: ref }),
      validate: validateOperationalRouteUsageSummary,
      idKey: "summary_id",
    },
  ];
  for (const entry of singleEntries) {
    if (entry.ref) evidence.push(await buildOperationalRouteEvidenceEntry(entry));
  }
  for (const ref of options.usageRecordRefs ?? []) {
    evidence.push(await buildOperationalRouteEvidenceEntry({
      evidence_type: "usage_record",
      ref,
      load: (recordRef) => loadOperationalRouteUsageRecord({ repoRoot, recordRef }),
      validate: validateOperationalRouteUsageRecord,
      idKey: "usage_id",
    }));
  }
  for (const ref of options.candidateRecordRefs ?? []) {
    evidence.push(await buildOperationalRouteEvidenceEntry({
      evidence_type: "candidate_record",
      ref,
      load: (recordRef) => loadOperationalRouteCandidateRecord({ repoRoot, recordRef }),
      validate: validateOperationalRouteCandidateRecord,
      idKey: "candidate_id",
    }));
  }
  const blockedEntries = evidence.filter((entry) => entry.validation_status !== "pass");
  const readinessEntry = evidence.find((entry) => entry.evidence_type === "readiness");
  const status =
    evidence.length === 0
      ? "blocked_no_evidence_refs"
      : blockedEntries.length > 0
        ? "blocked_evidence_validation"
        : readinessEntry?.artifact_status === "ready_private_manual_review_below_repeated_use_threshold"
          ? "ready_private_manual_review_below_repeated_use_threshold"
          : "pass_metadata_only_evidence_sweep";
  const primaryCounts = evidence.find((entry) => entry.evidence_type === "readiness")?.counts
    ?? evidence.find((entry) => entry.evidence_type === "ops_check")?.counts
    ?? evidence.find((entry) => entry.evidence_type === "status")?.counts
    ?? {};
  const result = {
    schema_version: OPERATIONAL_ROUTE_EVIDENCE_SWEEP_SCHEMA_VERSION,
    kind: "operational_route_evidence_sweep",
    status,
    evidence_sweep_id: sweepId,
    generated_at_utc: formatTimestampUtc(options.now),
    counts: {
      evidence_count: evidence.length,
      pass_count: evidence.length - blockedEntries.length,
      blocked_count: blockedEntries.length,
      route_count: primaryCounts.route_count ?? 0,
      usage_record_count: primaryCounts.usage_record_count ?? 0,
      repeated_use_review_threshold: primaryCounts.repeated_use_review_threshold ?? null,
      repeated_use_review_ready_route_count: primaryCounts.repeated_use_review_ready_route_count ?? 0,
      unmatched_candidate_count: primaryCounts.unmatched_candidate_count ?? 0,
      command_count: primaryCounts.command_count ?? null,
    },
    evidence,
    next_actions: operationalRouteEvidenceSweepNextActions(status),
    boundary: {
      ...operationalRouteBoundary(),
      source_truth_claimed: false,
      final_answer_authority_allowed: false,
      public_canon_promotion_allowed: false,
      ontology_acceptance_allowed: false,
      graph_truth_mutation_allowed: false,
      default_route_mutation_allowed: false,
      external_upload_allowed: false,
      evidence_sweep_writes_usage_or_candidate: false,
      evidence_sweep_launches_sourcebound_review: false,
      raw_query_persisted: false,
      answer_shell_output_persisted: false,
      answer_card_body_persisted: false,
    },
  };
  const unsafeBlockers = findUnsafeOperationalRouteValues(result, "operational_route_evidence_sweep");
  if (unsafeBlockers.length > 0) {
    return {
      ...result,
      status: "blocked_unsafe_evidence_sweep",
      unsafe_blockers: unsafeBlockers.sort(),
    };
  }
  return result;
}

async function buildOperationalRouteEvidenceEntry({ evidence_type, ref, load, validate, idKey }) {
  const safeRef = safeOperationalRouteRef(ref);
  if (!safeRef.startsWith("_workmeta/")) {
    return {
      evidence_type,
      evidence_ref: safeRef,
      artifact_id: null,
      artifact_status: "blocked_non_workmeta_ref",
      validation_status: "blocked",
      blocker_count: 1,
      blockers: ["evidence_ref_must_be_under_workmeta"],
      counts: null,
      boundary: {},
    };
  }
  try {
    const artifact = await load(safeRef);
    const validation = validate(artifact);
    return {
      evidence_type,
      evidence_ref: safeRef,
      artifact_id: artifact?.[idKey] ?? null,
      artifact_status: artifact?.status ?? null,
      validation_status: validation.status,
      blocker_count: validation.blocker_count ?? 0,
      blockers: validation.blockers ?? [],
      counts: validation.counts ?? artifact?.counts ?? null,
      boundary: summarizeOperationalRouteEvidenceBoundary(validation.boundary ?? artifact?.boundary ?? {}),
    };
  } catch {
    return {
      evidence_type,
      evidence_ref: safeRef,
      artifact_id: null,
      artifact_status: "blocked_unreadable",
      validation_status: "blocked",
      blocker_count: 1,
      blockers: ["evidence_load_or_validation_failed"],
      counts: null,
      boundary: {},
    };
  }
}

function summarizeOperationalRouteEvidenceBoundary(boundary) {
  return {
    metadata_only: boundary.metadata_only === true,
    source_text_loaded: boundary.source_text_loaded === true,
    raw_query_persisted: boundary.raw_query_persisted === true,
    usage_or_candidate_written: boundary.usage_or_candidate_written === true
      || boundary.ops_check_writes_usage_or_candidate === true
      || boundary.readiness_writes_usage_or_candidate === true,
    final_answer_authority_allowed: boundary.final_answer_authority_allowed === true,
    public_canon_promotion_allowed: boundary.public_canon_promotion_allowed === true,
    default_route_mutation_allowed: boundary.default_route_mutation_allowed === true,
  };
}

export async function writeOperationalRouteEvidenceSweep(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const sweep = await buildOperationalRouteEvidenceSweep(options);
  const outputRef = options.outputRef ?? defaultOperationalRouteEvidenceSweepOutputRef(sweep);
  const outputPath = path.join(repoRoot, safeOperationalRouteEvidenceSweepOutputPath(outputRef));
  await writeJson(outputPath, sweep);
  return {
    status: "written",
    operational_route_evidence_sweep_ref: normalizeRepoPath(path.relative(repoRoot, outputPath)),
    evidence_sweep_id: sweep.evidence_sweep_id,
    sweep_status: sweep.status,
    evidence_count: sweep.counts.evidence_count,
    blocked_count: sweep.counts.blocked_count,
  };
}

export async function loadOperationalRouteEvidenceSweep(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const sweepRef = safeOperationalRouteEvidenceSweepRef(
    options.sweepRef ?? options.evidenceSweepRef ?? options.operationalRouteEvidenceSweepRef,
  );
  return readJson(path.join(repoRoot, sweepRef));
}

export function validateOperationalRouteEvidenceSweep(sweep) {
  const blockers = [];
  const allowedStatuses = new Set([
    "ready_private_manual_review_below_repeated_use_threshold",
    "pass_metadata_only_evidence_sweep",
    "blocked_no_evidence_refs",
    "blocked_evidence_validation",
    "blocked_unsafe_evidence_sweep",
  ]);
  if (sweep?.schema_version !== OPERATIONAL_ROUTE_EVIDENCE_SWEEP_SCHEMA_VERSION) blockers.push("schema_version_mismatch");
  if (sweep?.kind !== "operational_route_evidence_sweep") blockers.push("kind_must_be_operational_route_evidence_sweep");
  if (!ROUTE_ID_PATTERN.test(String(sweep?.evidence_sweep_id ?? ""))) blockers.push("evidence_sweep_id_must_be_safe_id");
  if (!allowedStatuses.has(String(sweep?.status ?? ""))) blockers.push("status_must_be_allowed_evidence_sweep_state");
  if (!Array.isArray(sweep?.evidence)) blockers.push("evidence_must_be_array");
  for (const entry of sweep?.evidence ?? []) {
    if (!ROUTE_ID_PATTERN.test(String(entry?.evidence_type ?? ""))) blockers.push("evidence_type_must_be_safe_id");
    const safe = trySafeOperationalRouteRef(entry?.evidence_ref);
    if (!safe.ok || !safe.ref.startsWith("_workmeta/")) blockers.push("evidence_ref_must_be_safe_workmeta_ref");
    if (!["pass", "blocked"].includes(String(entry?.validation_status ?? ""))) {
      blockers.push("entry_validation_status_must_be_pass_or_blocked");
    }
  }
  const blockedEntryCount = (sweep?.evidence ?? []).filter((entry) => entry.validation_status !== "pass").length;
  if (sweep?.status === "pass_metadata_only_evidence_sweep" && blockedEntryCount > 0) {
    blockers.push("pass_status_must_not_have_blocked_entries");
  }
  if (sweep?.status === "ready_private_manual_review_below_repeated_use_threshold" && blockedEntryCount > 0) {
    blockers.push("ready_status_must_not_have_blocked_entries");
  }
  for (const [key, expected] of Object.entries({
    metadata_only: true,
    source_text_loaded: false,
    chunk_text_loaded: false,
    evidence_sweep_writes_usage_or_candidate: false,
    evidence_sweep_launches_sourcebound_review: false,
    raw_query_persisted: false,
    answer_shell_output_persisted: false,
    answer_card_body_persisted: false,
    final_answer_authority_allowed: false,
    public_canon_promotion_allowed: false,
    ontology_acceptance_allowed: false,
    default_route_mutation_allowed: false,
    graph_truth_mutation_allowed: false,
  })) {
    if (sweep?.boundary?.[key] !== expected) blockers.push(`boundary_${key}_must_be_${expected}`);
  }
  blockers.push(...findUnsafeOperationalRouteValues(sweep, "operational_route_evidence_sweep"));
  return {
    schema_version: OPERATIONAL_ROUTE_EVIDENCE_SWEEP_VALIDATION_SCHEMA_VERSION,
    kind: "operational_route_evidence_sweep_validation",
    status: blockers.length === 0 ? "pass" : "blocked",
    evidence_sweep_id: sweep?.evidence_sweep_id ?? null,
    sweep_status: sweep?.status ?? null,
    blocker_count: blockers.length,
    blockers: [...new Set(blockers)].sort(),
    counts: sweep?.counts ?? null,
    boundary: {
      metadata_only: sweep?.boundary?.metadata_only === true,
      source_text_loaded: sweep?.boundary?.source_text_loaded === true,
      usage_or_candidate_written: sweep?.boundary?.evidence_sweep_writes_usage_or_candidate === true,
      sourcebound_review_launched: sweep?.boundary?.evidence_sweep_launches_sourcebound_review === true,
      public_canon_promotion_allowed: sweep?.boundary?.public_canon_promotion_allowed === true,
    },
  };
}

export function renderOperationalRouteEvidenceSweepText(sweep) {
  const lines = [
    `Status: ${sweep.status}`,
    `Evidence sweep: ${sweep.evidence_sweep_id}`,
    `Evidence: ${sweep.counts?.pass_count ?? 0}/${sweep.counts?.evidence_count ?? 0} pass`,
    `Routes: ${sweep.counts?.route_count ?? 0}`,
    `Usage records: ${sweep.counts?.usage_record_count ?? 0}`,
    `Ready routes: ${sweep.counts?.repeated_use_review_ready_route_count ?? 0}`,
    `Unmatched candidates: ${sweep.counts?.unmatched_candidate_count ?? 0}`,
    `Commands: ${sweep.counts?.command_count ?? "unknown"}`,
    "Evidence refs:",
    ...(sweep.evidence ?? []).map(
      (entry) =>
        `- ${entry.evidence_type}: validation=${entry.validation_status}, status=${entry.artifact_status ?? "unknown"}, ref=${entry.evidence_ref}`,
    ),
    "Next actions:",
    ...(sweep.next_actions ?? []).map((action) => `- ${action}`),
    "",
    "Boundary: evidence sweep is metadata only. It validates and summarizes stored refs without reading source text/chunks, raw queries, answer bodies, answer shell output, launching sourcebound review, writing usage/candidate records, or granting source truth, final-answer, public canon, ontology, graph truth, default-route, or external-upload authority.",
    "",
  ];
  return lines.join("\n");
}

export async function buildOperationalRouteLatestEvidence(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const registryRef = safeOperationalRouteRef(options.registryRef);
  const latestId = normalizeSafeId(options.latestEvidenceId ?? options.latestId ?? `operational_route_latest_evidence_${stableHash([
    registryRef,
    formatTimestampUtc(options.now).slice(0, 10),
  ].join(":")).slice(0, 12)}`);
  const specs = [
    {
      evidence_type: "preflight",
      root_ref: DEFAULT_OPERATIONAL_ROUTE_PREFLIGHT_ROOT,
      file_name: "preflight.json",
      load: (ref) => loadOperationalRoutePreflight({ repoRoot, preflightRef: ref }),
      validate: validateOperationalRoutePreflight,
      idKey: "preflight_id",
    },
    {
      evidence_type: "ops_check",
      root_ref: DEFAULT_OPERATIONAL_ROUTE_OPS_CHECK_ROOT,
      file_name: "ops_check.json",
      load: (ref) => loadOperationalRouteOpsCheck({ repoRoot, opsCheckRef: ref }),
      validate: validateOperationalRouteOpsCheck,
      idKey: "ops_check_id",
    },
    {
      evidence_type: "suggestion_safety",
      root_ref: DEFAULT_OPERATIONAL_ROUTE_SUGGESTION_SAFETY_ROOT,
      file_name: "suggestion_safety.json",
      load: (ref) => loadOperationalRouteSuggestionSafety({ repoRoot, suggestionSafetyRef: ref }),
      validate: validateOperationalRouteSuggestionSafety,
      idKey: "safety_id",
    },
    {
      evidence_type: "session_sweep",
      root_ref: DEFAULT_OPERATIONAL_ROUTE_SESSION_SWEEP_ROOT,
      file_name: "route_sweep.json",
      load: (ref) => loadOperationalRouteSessionSweep({ repoRoot, sweepRef: ref }),
      validate: validateOperationalRouteSessionSweep,
      idKey: "sweep_id",
    },
    {
      evidence_type: "readiness",
      root_ref: DEFAULT_OPERATIONAL_ROUTE_READINESS_ROOT,
      file_name: "readiness.json",
      load: (ref) => loadOperationalRouteReadiness({ repoRoot, readinessRef: ref }),
      validate: validateOperationalRouteReadiness,
      idKey: "readiness_id",
    },
    {
      evidence_type: "status",
      root_ref: DEFAULT_OPERATIONAL_ROUTE_STATUS_ROOT,
      file_name: "status.json",
      load: (ref) => loadOperationalRouteStatus({ repoRoot, statusRef: ref }),
      validate: validateOperationalRouteStatus,
      idKey: "status_id",
    },
    {
      evidence_type: "usage_summary",
      root_ref: DEFAULT_USAGE_SUMMARY_ROOT,
      file_name: "usage_summary.json",
      load: (ref) => loadOperationalRouteUsageSummary({ repoRoot, summaryRef: ref }),
      validate: validateOperationalRouteUsageSummary,
      idKey: "summary_id",
    },
    {
      evidence_type: "evidence_sweep",
      root_ref: DEFAULT_OPERATIONAL_ROUTE_EVIDENCE_SWEEP_ROOT,
      file_name: "evidence_sweep.json",
      load: (ref) => loadOperationalRouteEvidenceSweep({ repoRoot, evidenceSweepRef: ref }),
      validate: validateOperationalRouteEvidenceSweep,
      idKey: "evidence_sweep_id",
      matchesRegistry: (artifact) => operationalRouteEvidenceSweepMatchesRegistry({ repoRoot, artifact, registryRef }),
    },
  ];
  const latest_evidence = [];
  const missing_evidence_types = [];
  for (const spec of specs) {
    const entry = await findLatestOperationalRouteEvidenceEntry({
      repoRoot,
      registryRef,
      ...spec,
    });
    if (entry) latest_evidence.push(entry);
    else missing_evidence_types.push(spec.evidence_type);
  }
  const blockedEntries = latest_evidence.filter((entry) => entry.validation_status !== "pass");
  const readinessEntry = latest_evidence.find((entry) => entry.evidence_type === "readiness");
  const evidenceSweepEntry = latest_evidence.find((entry) => entry.evidence_type === "evidence_sweep");
  const status =
    blockedEntries.length > 0
      ? "blocked_latest_evidence_validation"
      : !readinessEntry || !evidenceSweepEntry
        ? "blocked_missing_latest_evidence"
        : readinessEntry.artifact_status === "ready_private_manual_review_below_repeated_use_threshold"
          ? "ready_private_manual_review_below_repeated_use_threshold"
          : "pass_latest_evidence_index";
  const primaryCounts = evidenceSweepEntry?.counts ?? readinessEntry?.counts
    ?? latest_evidence.find((entry) => entry.evidence_type === "ops_check")?.counts
    ?? latest_evidence.find((entry) => entry.evidence_type === "status")?.counts
    ?? {};
  const opsCheckCounts = latest_evidence.find((entry) => entry.evidence_type === "ops_check")?.counts ?? {};
  const suggestionSafetyCounts = latest_evidence.find((entry) => entry.evidence_type === "suggestion_safety")?.counts ?? {};
  const routeSweepCounts = readinessEntry?.counts
    ?? latest_evidence.find((entry) => entry.evidence_type === "session_sweep")?.counts
    ?? {};
  const result = {
    schema_version: OPERATIONAL_ROUTE_LATEST_EVIDENCE_SCHEMA_VERSION,
    kind: "operational_route_latest_evidence",
    latest_evidence_id: latestId,
    generated_at_utc: formatTimestampUtc(options.now),
    registry_ref: registryRef,
    status,
    counts: {
      latest_artifact_count: latest_evidence.length,
      missing_artifact_count: missing_evidence_types.length,
      blocked_artifact_count: blockedEntries.length,
      route_count: primaryCounts.route_count ?? 0,
      route_sweep_pass_count: routeSweepCounts.route_sweep_pass_count ?? routeSweepCounts.pass_count ?? null,
      usage_record_count: primaryCounts.usage_record_count ?? 0,
      repeated_use_review_threshold: primaryCounts.repeated_use_review_threshold ?? null,
      repeated_use_review_ready_route_count: primaryCounts.repeated_use_review_ready_route_count ?? 0,
      unmatched_candidate_count: primaryCounts.unmatched_candidate_count ?? 0,
      command_count: primaryCounts.command_count ?? null,
      suggestion_command_count: opsCheckCounts.suggestion_command_count ?? suggestionSafetyCounts.command_count ?? null,
      direct_usage_record_write_suggestion_count: opsCheckCounts.direct_usage_record_write_suggestion_count ?? suggestionSafetyCounts.direct_usage_record_write_suggestion_count ?? null,
      direct_candidate_record_write_suggestion_count: opsCheckCounts.direct_candidate_record_write_suggestion_count ?? suggestionSafetyCounts.direct_candidate_record_write_suggestion_count ?? null,
      direct_call_plan_write_suggestion_count: opsCheckCounts.direct_call_plan_write_suggestion_count ?? suggestionSafetyCounts.direct_call_plan_write_suggestion_count ?? null,
      unsafe_candidate_record_write_suggestion_count: opsCheckCounts.unsafe_candidate_record_write_suggestion_count ?? suggestionSafetyCounts.unsafe_candidate_record_write_suggestion_count ?? null,
      unsafe_call_plan_write_suggestion_count: opsCheckCounts.unsafe_call_plan_write_suggestion_count ?? suggestionSafetyCounts.unsafe_call_plan_write_suggestion_count ?? null,
      direct_answer_shell_suggestion_count: opsCheckCounts.direct_answer_shell_suggestion_count ?? suggestionSafetyCounts.direct_answer_shell_suggestion_count ?? null,
      record_usage_without_health_ref_count: opsCheckCounts.record_usage_without_health_ref_count ?? suggestionSafetyCounts.record_usage_without_health_ref_count ?? null,
      record_usage_outside_operator_run_count: opsCheckCounts.record_usage_outside_operator_run_count ?? suggestionSafetyCounts.record_usage_outside_operator_run_count ?? null,
    },
    latest_evidence,
    missing_evidence_types,
    next_actions: operationalRouteLatestEvidenceNextActions(status),
    boundary: {
      ...operationalRouteBoundary(),
      latest_evidence_scans_workmeta_only: true,
      latest_evidence_writes_usage_or_candidate: false,
      latest_evidence_launches_sourcebound_review: false,
      raw_query_persisted: false,
      answer_shell_output_persisted: false,
      answer_card_body_persisted: false,
      source_truth_claimed: false,
      final_answer_authority_allowed: false,
      public_canon_promotion_allowed: false,
      ontology_acceptance_allowed: false,
      graph_truth_mutation_allowed: false,
      default_route_mutation_allowed: false,
      external_upload_allowed: false,
    },
  };
  const unsafeBlockers = findUnsafeOperationalRouteValues(result, "operational_route_latest_evidence");
  if (unsafeBlockers.length > 0) {
    return {
      ...result,
      status: "blocked_unsafe_latest_evidence",
      unsafe_blockers: unsafeBlockers.sort(),
    };
  }
  return result;
}

export async function writeOperationalRouteLatestEvidence(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const latest = await buildOperationalRouteLatestEvidence(options);
  const outputRef = options.outputRef ?? defaultOperationalRouteLatestEvidenceOutputRef(latest);
  const outputPath = path.join(repoRoot, safeOperationalRouteLatestEvidenceOutputPath(outputRef));
  await writeJson(outputPath, latest);
  return {
    status: "written",
    operational_route_latest_evidence_ref: normalizeRepoPath(path.relative(repoRoot, outputPath)),
    latest_evidence_id: latest.latest_evidence_id,
    latest_evidence_status: latest.status,
    latest_artifact_count: latest.counts.latest_artifact_count,
    missing_artifact_count: latest.counts.missing_artifact_count,
    blocked_artifact_count: latest.counts.blocked_artifact_count,
  };
}

export async function loadOperationalRouteLatestEvidence(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const latestRef = safeOperationalRouteLatestEvidenceRef(
    options.latestEvidenceRef ?? options.operationalRouteLatestEvidenceRef,
  );
  return readJson(path.join(repoRoot, latestRef));
}

export function validateOperationalRouteLatestEvidence(latest) {
  const blockers = [];
  const allowedStatuses = new Set([
    "ready_private_manual_review_below_repeated_use_threshold",
    "pass_latest_evidence_index",
    "blocked_missing_latest_evidence",
    "blocked_latest_evidence_validation",
    "blocked_unsafe_latest_evidence",
  ]);
  if (latest?.schema_version !== OPERATIONAL_ROUTE_LATEST_EVIDENCE_SCHEMA_VERSION) blockers.push("schema_version_mismatch");
  if (latest?.kind !== "operational_route_latest_evidence") blockers.push("kind_must_be_operational_route_latest_evidence");
  if (!ROUTE_ID_PATTERN.test(String(latest?.latest_evidence_id ?? ""))) blockers.push("latest_evidence_id_must_be_safe_id");
  if (!trySafeOperationalRouteRef(latest?.registry_ref).ok) blockers.push("registry_ref_unsafe");
  if (!allowedStatuses.has(latest?.status)) blockers.push("status_not_allowed");
  if (!Array.isArray(latest?.latest_evidence)) blockers.push("latest_evidence_must_be_array");
  for (const entry of latest?.latest_evidence ?? []) {
    if (!ROUTE_ID_PATTERN.test(String(entry?.evidence_type ?? ""))) blockers.push("evidence_type_must_be_safe_id");
    if (!trySafeOperationalRouteRef(entry?.evidence_ref).ok) blockers.push("evidence_ref_unsafe");
    if (!entry?.evidence_ref?.startsWith("_workmeta/")) blockers.push("evidence_ref_must_be_under_workmeta");
    if (entry?.validation_status !== "pass") blockers.push(`evidence_validation_not_pass:${entry?.evidence_type ?? "unknown"}`);
  }
  if (!Array.isArray(latest?.missing_evidence_types)) blockers.push("missing_evidence_types_must_be_array");
  if (latest?.status === "ready_private_manual_review_below_repeated_use_threshold") {
    const evidenceTypes = new Set((latest.latest_evidence ?? []).map((entry) => entry.evidence_type));
    if (!evidenceTypes.has("readiness")) blockers.push("ready_status_requires_readiness_entry");
    if (!evidenceTypes.has("evidence_sweep")) blockers.push("ready_status_requires_evidence_sweep_entry");
  }
  const falseBoundaryKeys = [
    "source_text_loaded",
    "chunk_text_loaded",
    "source_payloads_included",
    "copied_excerpts_included",
    "notebooklm_answers_included",
    "secrets_or_session_included",
    "runtime_absolute_paths_included",
    "latest_evidence_writes_usage_or_candidate",
    "latest_evidence_launches_sourcebound_review",
    "raw_query_persisted",
    "answer_shell_output_persisted",
    "answer_card_body_persisted",
    "source_truth_claimed",
    "final_answer_authority_allowed",
    "public_canon_promotion_allowed",
    "ontology_acceptance_allowed",
    "graph_truth_mutation_allowed",
    "default_route_mutation_allowed",
    "external_upload_allowed",
  ];
  if (latest?.boundary?.metadata_only !== true) blockers.push("boundary_metadata_only_must_be_true");
  if (latest?.boundary?.latest_evidence_scans_workmeta_only !== true) {
    blockers.push("boundary_latest_evidence_scans_workmeta_only_must_be_true");
  }
  for (const key of falseBoundaryKeys) {
    if (latest?.boundary?.[key] !== false) blockers.push(`boundary_${key}_must_be_false`);
  }
  blockers.push(...findUnsafeOperationalRouteValues(latest, "operational_route_latest_evidence"));
  return {
    schema_version: OPERATIONAL_ROUTE_LATEST_EVIDENCE_VALIDATION_SCHEMA_VERSION,
    kind: "operational_route_latest_evidence_validation",
    status: blockers.length === 0 ? "pass" : "blocked",
    latest_evidence_id: latest?.latest_evidence_id ?? null,
    blocker_count: blockers.length,
    blockers: [...new Set(blockers)].sort(),
    counts: latest?.counts ?? null,
    boundary: {
      metadata_only: latest?.boundary?.metadata_only === true,
      latest_evidence_scans_workmeta_only: latest?.boundary?.latest_evidence_scans_workmeta_only === true,
      latest_evidence_writes_usage_or_candidate: latest?.boundary?.latest_evidence_writes_usage_or_candidate === true,
      latest_evidence_launches_sourcebound_review: latest?.boundary?.latest_evidence_launches_sourcebound_review === true,
      raw_query_persisted: latest?.boundary?.raw_query_persisted === true,
      answer_card_body_persisted: latest?.boundary?.answer_card_body_persisted === true,
      public_canon_promotion_allowed: latest?.boundary?.public_canon_promotion_allowed === true,
    },
  };
}

export function renderOperationalRouteLatestEvidenceText(latest) {
  const lines = [
    `Status: ${latest.status}`,
    `Latest evidence: ${latest.latest_evidence_id}`,
    `Registry: ${latest.registry_ref}`,
    `Artifacts: ${latest.counts?.latest_artifact_count ?? 0} found, ${latest.counts?.missing_artifact_count ?? 0} missing, ${latest.counts?.blocked_artifact_count ?? 0} blocked`,
    `Routes: ${latest.counts?.route_count ?? 0}`,
    `Usage records: ${latest.counts?.usage_record_count ?? 0}`,
    `Ready routes: ${latest.counts?.repeated_use_review_ready_route_count ?? 0}`,
    `Unmatched candidates: ${latest.counts?.unmatched_candidate_count ?? 0}`,
    `Commands: ${latest.counts?.command_count ?? "n/a"}`,
    `Suggestion commands checked: ${latest.counts?.suggestion_command_count ?? "n/a"}`,
    `Direct usage-write suggestions: ${latest.counts?.direct_usage_record_write_suggestion_count ?? "n/a"}`,
    `Direct candidate-write suggestions: ${latest.counts?.direct_candidate_record_write_suggestion_count ?? "n/a"}`,
    `Direct call-plan-write suggestions: ${latest.counts?.direct_call_plan_write_suggestion_count ?? "n/a"}`,
    `Unsafe candidate-write suggestions: ${latest.counts?.unsafe_candidate_record_write_suggestion_count ?? "n/a"}`,
    `Unsafe call-plan-write suggestions: ${latest.counts?.unsafe_call_plan_write_suggestion_count ?? "n/a"}`,
    `Direct answer-shell suggestions: ${latest.counts?.direct_answer_shell_suggestion_count ?? "n/a"}`,
    `Record-usage without health ref: ${latest.counts?.record_usage_without_health_ref_count ?? "n/a"}`,
    `Record-usage outside operator-run: ${latest.counts?.record_usage_outside_operator_run_count ?? "n/a"}`,
    "Latest refs:",
    ...(latest.latest_evidence ?? []).map(
      (entry) =>
        `- ${entry.evidence_type}: validation=${entry.validation_status}, status=${entry.artifact_status}, generated=${entry.generated_at_utc ?? "unknown"}, ref=${entry.evidence_ref}`,
    ),
    "Missing evidence types:",
    ...((latest.missing_evidence_types ?? []).length > 0 ? latest.missing_evidence_types.map((type) => `- ${type}`) : ["- none"]),
    "Next actions:",
    ...(latest.next_actions ?? []).map((action) => `- ${action}`),
    "",
    "Boundary: latest evidence scans stored _workmeta refs only. It does not read source text/chunks, raw queries, answer bodies, answer shell output, write usage/candidate records, launch sourcebound review, or grant source truth, final-answer, public canon, ontology, graph truth, default-route, or external-upload authority.",
    "",
  ];
  return lines.join("\n");
}

export async function buildOperationalRouteOperatorBrief(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const providedLatestRef = options.latestEvidenceRef ?? options.operationalRouteLatestEvidenceRef ?? null;
  const latest = providedLatestRef
    ? await loadOperationalRouteLatestEvidence({ repoRoot, latestEvidenceRef: providedLatestRef })
    : await buildOperationalRouteLatestEvidence({
        repoRoot,
        registryRef: options.registryRef,
        now: options.now,
      });
  const latestValidation = validateOperationalRouteLatestEvidence(latest);
  const registryRef = safeOperationalRouteRef(options.registryRef ?? latest.registry_ref);
  const registry = await loadOperationalRouteRegistry({ repoRoot, registryRef });
  const readinessRef = operationalRouteLatestEvidenceRefByType(latest, "readiness");
  const readiness = readinessRef ? await loadOperationalRouteReadiness({ repoRoot, readinessRef }) : null;
  const smokeTestRef = readiness?.smoke_test_ref ? safeOperationalRouteRef(readiness.smoke_test_ref) : null;
  const briefId = normalizeSafeId(options.briefId ?? options.operatorBriefId ?? `operational_route_operator_brief_${stableHash([
    registryRef,
    providedLatestRef ?? latest.latest_evidence_id,
    formatTimestampUtc(options.now).slice(0, 10),
  ].join(":")).slice(0, 12)}`);
  const status =
    latestValidation.status !== "pass"
      ? "blocked_latest_evidence_validation"
      : latest.status === "ready_private_manual_review_below_repeated_use_threshold"
        ? "ready_private_manual_review_below_repeated_use_threshold"
        : latest.status;
  const routeEntries = (Array.isArray(registry.routes) ? registry.routes : []).map((route) => ({
    route_id: route.route_id,
    selected_work_card_id: route.selected_work_card_id ?? null,
    selected_work_card_ref: route.selected_work_card_ref ?? null,
    operator_answer_card_ref: route.operator_answer_card_ref ?? null,
    wiki_page_ref: route.wiki_page_ref ?? null,
    evidence_pages: Array.isArray(route.evidence_pages) ? route.evidence_pages : [],
    review_context_pages: Array.isArray(route.review_context_pages) ? route.review_context_pages : [],
    claim_ceiling: route.claim_ceiling ?? registry.route_defaults?.claim_ceiling ?? null,
  }));
  const latestRefs = operationalRouteLatestEvidenceRefMap(latest);
  const commandBase = "node guild_hall/rag/cli.mjs";
  const smokeArg = smokeTestRef ? ` --smoke-tests-ref ${smokeTestRef}` : "";
  const latestHealthArg = providedLatestRef
    ? ` --operational-route-latest-evidence-ref ${safeOperationalRouteLatestEvidenceRef(providedLatestRef)}`
    : "";
  const operatorHealthArg = " --operator-health-ref <operator_health_ref>";
  const queryArg = '--query-label "<ephemeral label>"';
  const commands = [
    {
      phase: "check_latest_evidence",
      command_line: providedLatestRef
        ? `${commandBase} operational-route-latest-evidence-view --operational-route-latest-evidence-ref ${safeOperationalRouteLatestEvidenceRef(providedLatestRef)}`
        : `${commandBase} operational-route-latest-evidence --route-registry-ref ${registryRef} --text`,
      write_condition: "read_only",
    },
    {
      phase: "check_operator_health",
      command_line: `${commandBase} operational-route-operator-health --route-registry-ref ${registryRef}${latestHealthArg} --operational-route-operator-brief-ref <operator_brief_ref> --operational-route-doc-drift-ref <operator_doc_drift_ref> --text`,
      write_condition: "read_only_after_stored_refs_exist",
    },
    {
      phase: "record_call_plan_for_real_question",
      command_line: `${commandBase} operational-route-call-plan --write --route-registry-ref ${registryRef}${smokeArg} ${queryArg} --plan-id <safe_call_plan_id>`,
      write_condition: "real_operator_question_only",
    },
    {
      phase: "answer_without_recording",
      command_line: `${commandBase} operational-route-operator-run --route-registry-ref ${registryRef}${smokeArg}${operatorHealthArg} ${queryArg}`,
      write_condition: "terminal_only_operator_answer",
    },
    {
      phase: "probe_without_answer_body",
      command_line: `${commandBase} operational-route-operator-run --route-registry-ref ${registryRef}${smokeArg}${operatorHealthArg} ${queryArg} --skip-answer-shell`,
      write_condition: "read_only_health_gated_probe",
    },
    {
      phase: "answer_and_record_real_usage",
      command_line: `${commandBase} operational-route-operator-run --route-registry-ref ${registryRef}${smokeArg}${operatorHealthArg} ${queryArg} --record-usage --usage-id <safe_usage_id>`,
      write_condition: "real_delivered_operator_answer_only",
    },
    {
      phase: "post_answer_closeout",
      command_line: `${commandBase} operational-route-closeout --route-registry-ref ${registryRef} ${queryArg} --text`,
      write_condition: "read_only_after_operator_answer",
    },
    {
      phase: "route_set_gate",
      command_line: `${commandBase} operational-route-review-gate --route-registry-ref ${registryRef} --text`,
      write_condition: "read_only",
    },
    {
      phase: "candidate_preview",
      command_line: `${commandBase} operational-route-candidate-record --route-registry-ref ${registryRef} --query-label "<ephemeral unmatched label>" --text`,
      write_condition: "preview_only_for_real_unmatched_question",
    },
    {
      phase: "reopen_call_plan",
      command_line: `${commandBase} operational-route-call-plan-view --operational-route-call-plan-ref _workmeta/system/reports/rag/operational_route_call_plans/<safe_call_plan_id>/call_plan.json`,
      write_condition: "read_only_after_real_question_plan",
    },
  ];
  if (latestRefs.readiness_ref) {
    commands.splice(1, 0, {
      phase: "reopen_readiness",
      command_line: `${commandBase} operational-route-readiness-view --operational-route-readiness-ref ${latestRefs.readiness_ref}`,
      write_condition: "read_only",
    });
  }
  if (latestRefs.evidence_sweep_ref) {
    commands.splice(1, 0, {
      phase: "reopen_evidence_sweep",
      command_line: `${commandBase} operational-route-evidence-sweep-view --operational-route-evidence-sweep-ref ${latestRefs.evidence_sweep_ref}`,
      write_condition: "read_only",
    });
  }
  const commandSafety = analyzeOperationalRouteSuggestedCommands({
    surface: "operator_brief",
    sample_id: briefId,
    status,
    route_id: null,
    commands,
  });
  const result = {
    schema_version: OPERATIONAL_ROUTE_OPERATOR_BRIEF_SCHEMA_VERSION,
    kind: "operational_route_operator_brief",
    brief_id: briefId,
    generated_at_utc: formatTimestampUtc(options.now),
    status,
    registry_ref: registryRef,
    registry_id: registry.registry_id ?? null,
    smoke_test_ref: smokeTestRef,
    latest_evidence_ref: providedLatestRef ? safeOperationalRouteLatestEvidenceRef(providedLatestRef) : null,
    latest_evidence_status: latest.status,
    counts: {
      route_count: routeEntries.length,
      latest_artifact_count: latest.counts?.latest_artifact_count ?? 0,
      usage_record_count: latest.counts?.usage_record_count ?? 0,
      repeated_use_review_threshold: latest.counts?.repeated_use_review_threshold ?? null,
      repeated_use_review_ready_route_count: latest.counts?.repeated_use_review_ready_route_count ?? 0,
      unmatched_candidate_count: latest.counts?.unmatched_candidate_count ?? 0,
      command_count: commands.length,
      direct_usage_record_write_suggestion_count: commandSafety.counts.direct_usage_record_write_suggestion_count,
      direct_candidate_record_write_suggestion_count: commandSafety.counts.direct_candidate_record_write_suggestion_count,
      direct_call_plan_write_suggestion_count: commandSafety.counts.direct_call_plan_write_suggestion_count,
      unsafe_candidate_record_write_suggestion_count: commandSafety.counts.unsafe_candidate_record_write_suggestion_count,
      unsafe_call_plan_write_suggestion_count: commandSafety.counts.unsafe_call_plan_write_suggestion_count,
      direct_answer_shell_suggestion_count: commandSafety.counts.direct_answer_shell_suggestion_count,
      record_usage_without_health_ref_count: commandSafety.counts.record_usage_without_health_ref_count,
      record_usage_outside_operator_run_count: commandSafety.counts.record_usage_outside_operator_run_count,
    },
    latest_refs: latestRefs,
    routes: routeEntries,
    commands,
    next_actions: operationalRouteOperatorBriefNextActions(status),
    boundary: {
      ...operationalRouteBoundary(),
      operator_brief_scans_workmeta_only: true,
      operator_brief_executes_commands: false,
      operator_brief_writes_usage_or_candidate: false,
      operator_brief_launches_sourcebound_review: false,
      raw_query_persisted: false,
      answer_shell_output_persisted: false,
      answer_card_body_persisted: false,
      source_truth_claimed: false,
      final_answer_authority_allowed: false,
      public_canon_promotion_allowed: false,
      ontology_acceptance_allowed: false,
      graph_truth_mutation_allowed: false,
      default_route_mutation_allowed: false,
      external_upload_allowed: false,
    },
  };
  const unsafeBlockers = findUnsafeOperationalRouteValues(result, "operational_route_operator_brief");
  if (unsafeBlockers.length > 0) {
    return {
      ...result,
      status: "blocked_unsafe_operator_brief",
      unsafe_blockers: unsafeBlockers.sort(),
    };
  }
  return result;
}

export async function writeOperationalRouteOperatorBrief(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const brief = await buildOperationalRouteOperatorBrief(options);
  const outputRef = options.outputRef ?? defaultOperationalRouteOperatorBriefOutputRef(brief);
  const outputPath = path.join(repoRoot, safeOperationalRouteOperatorBriefOutputPath(outputRef));
  await writeJson(outputPath, brief);
  return {
    status: "written",
    operational_route_operator_brief_ref: normalizeRepoPath(path.relative(repoRoot, outputPath)),
    brief_id: brief.brief_id,
    brief_status: brief.status,
    route_count: brief.counts.route_count,
    command_count: brief.counts.command_count,
  };
}

export async function loadOperationalRouteOperatorBrief(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const briefRef = safeOperationalRouteOperatorBriefRef(
    options.operatorBriefRef ?? options.briefRef ?? options.operationalRouteOperatorBriefRef,
  );
  return readJson(path.join(repoRoot, briefRef));
}

export function validateOperationalRouteOperatorBrief(brief) {
  const blockers = [];
  const allowedStatuses = new Set([
    "ready_private_manual_review_below_repeated_use_threshold",
    "pass_latest_evidence_index",
    "blocked_missing_latest_evidence",
    "blocked_latest_evidence_validation",
    "blocked_unsafe_latest_evidence",
    "blocked_unsafe_operator_brief",
  ]);
  if (brief?.schema_version !== OPERATIONAL_ROUTE_OPERATOR_BRIEF_SCHEMA_VERSION) blockers.push("schema_version_mismatch");
  if (brief?.kind !== "operational_route_operator_brief") blockers.push("kind_must_be_operational_route_operator_brief");
  if (!ROUTE_ID_PATTERN.test(String(brief?.brief_id ?? ""))) blockers.push("brief_id_must_be_safe_id");
  if (!allowedStatuses.has(brief?.status)) blockers.push("status_not_allowed");
  if (!trySafeOperationalRouteRef(brief?.registry_ref).ok) blockers.push("registry_ref_unsafe");
  if (brief?.smoke_test_ref !== null && brief?.smoke_test_ref !== undefined && !trySafeOperationalRouteRef(brief.smoke_test_ref).ok) {
    blockers.push("smoke_test_ref_unsafe");
  }
  if (brief?.latest_evidence_ref !== null && brief?.latest_evidence_ref !== undefined) {
    const latestRefSafe = trySafeOperationalRouteRef(brief.latest_evidence_ref);
    if (!latestRefSafe.ok || !latestRefSafe.ref.startsWith("_workmeta/")) blockers.push("latest_evidence_ref_must_be_safe_workmeta_ref");
  }
  if (!Array.isArray(brief?.routes)) blockers.push("routes_must_be_array");
  for (const route of brief?.routes ?? []) {
    if (!ROUTE_ID_PATTERN.test(String(route?.route_id ?? ""))) blockers.push("route_id_must_be_safe_id");
    for (const key of ["selected_work_card_ref", "operator_answer_card_ref", "wiki_page_ref"]) {
      if (route?.[key] !== null && route?.[key] !== undefined && !trySafeOperationalRouteRef(route[key]).ok) {
        blockers.push(`${key}_unsafe`);
      }
    }
  }
  if (!Array.isArray(brief?.commands)) blockers.push("commands_must_be_array");
  for (const command of brief?.commands ?? []) {
    if (!ROUTE_ID_PATTERN.test(String(command?.phase ?? ""))) blockers.push("command_phase_must_be_safe_id");
    if (typeof command?.command_line !== "string" || command.command_line.length === 0) blockers.push("command_line_required");
    if (hasLocalAbsolutePathString(command?.command_line ?? "")) blockers.push("command_line_must_not_include_local_absolute_path");
    if (hasSecretLikeValueString(command?.command_line ?? "")) blockers.push("command_line_must_not_include_secret_like_value");
  }
  const commandSafety = analyzeOperationalRouteSuggestedCommands({
    surface: "operator_brief",
    sample_id: brief?.brief_id ?? "unknown",
    status: brief?.status ?? "unknown",
    route_id: null,
    commands: brief?.commands ?? [],
  });
  blockers.push(...(commandSafety.blockers ?? []));
  const falseBoundaryKeys = [
    "source_text_loaded",
    "chunk_text_loaded",
    "source_payloads_included",
    "copied_excerpts_included",
    "notebooklm_answers_included",
    "secrets_or_session_included",
    "runtime_absolute_paths_included",
    "operator_brief_executes_commands",
    "operator_brief_writes_usage_or_candidate",
    "operator_brief_launches_sourcebound_review",
    "raw_query_persisted",
    "answer_shell_output_persisted",
    "answer_card_body_persisted",
    "source_truth_claimed",
    "final_answer_authority_allowed",
    "public_canon_promotion_allowed",
    "ontology_acceptance_allowed",
    "graph_truth_mutation_allowed",
    "default_route_mutation_allowed",
    "external_upload_allowed",
  ];
  if (brief?.boundary?.metadata_only !== true) blockers.push("boundary_metadata_only_must_be_true");
  if (brief?.boundary?.operator_brief_scans_workmeta_only !== true) {
    blockers.push("boundary_operator_brief_scans_workmeta_only_must_be_true");
  }
  for (const key of falseBoundaryKeys) {
    if (brief?.boundary?.[key] !== false) blockers.push(`boundary_${key}_must_be_false`);
  }
  blockers.push(...findUnsafeOperationalRouteValues(brief, "operational_route_operator_brief"));
  return {
    schema_version: OPERATIONAL_ROUTE_OPERATOR_BRIEF_VALIDATION_SCHEMA_VERSION,
    kind: "operational_route_operator_brief_validation",
    status: blockers.length === 0 ? "pass" : "blocked",
    brief_id: brief?.brief_id ?? null,
    blocker_count: blockers.length,
    blockers: [...new Set(blockers)].sort(),
    counts: brief?.counts ?? null,
    boundary: {
      metadata_only: brief?.boundary?.metadata_only === true,
      operator_brief_scans_workmeta_only: brief?.boundary?.operator_brief_scans_workmeta_only === true,
      operator_brief_executes_commands: brief?.boundary?.operator_brief_executes_commands === true,
      operator_brief_writes_usage_or_candidate: brief?.boundary?.operator_brief_writes_usage_or_candidate === true,
      operator_brief_launches_sourcebound_review: brief?.boundary?.operator_brief_launches_sourcebound_review === true,
      raw_query_persisted: brief?.boundary?.raw_query_persisted === true,
      public_canon_promotion_allowed: brief?.boundary?.public_canon_promotion_allowed === true,
    },
  };
}

export function renderOperationalRouteOperatorBriefText(brief) {
  const lines = [
    `Status: ${brief.status}`,
    `Operator brief: ${brief.brief_id}`,
    `Registry: ${brief.registry_ref}`,
    `Latest evidence: ${brief.latest_evidence_ref ?? "generated_from_registry"}`,
    `Routes: ${brief.counts?.route_count ?? 0}`,
    `Usage records: ${brief.counts?.usage_record_count ?? 0}/${brief.counts?.repeated_use_review_threshold ?? "unknown"}`,
    `Ready routes: ${brief.counts?.repeated_use_review_ready_route_count ?? 0}`,
    `Unmatched candidates: ${brief.counts?.unmatched_candidate_count ?? 0}`,
    "",
    "Routes:",
    ...(brief.routes ?? []).map(
      (route) =>
        `- ${route.route_id}: work_card=${route.selected_work_card_id}, pages=${(route.evidence_pages ?? []).join(",")}, claim=${route.claim_ceiling}`,
    ),
    "",
    "Latest refs:",
    ...Object.entries(brief.latest_refs ?? {}).map(([key, value]) => `- ${key}: ${value ?? "missing"}`),
    "",
    "Safe commands:",
    ...(brief.commands ?? []).map((command) => `- ${command.phase}: ${command.command_line}`),
    "",
    "Next actions:",
    ...(brief.next_actions ?? []).map((action) => `- ${action}`),
    "",
    "Boundary: operator brief is metadata only. It does not execute commands, read source text/chunks, persist raw queries, persist answer bodies, write usage/candidate records, launch sourcebound review, or grant source truth, final-answer, public canon, ontology, graph truth, default-route, or external-upload authority.",
    "",
  ];
  return lines.join("\n");
}

export async function buildOperationalRouteOperatorDocDriftCheck(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const registryRef = safeOperationalRouteRef(options.registryRef);
  const latestEvidenceRefInput = options.latestEvidenceRef ?? options.operationalRouteLatestEvidenceRef;
  const latestEvidenceRef = latestEvidenceRefInput
    ? safeOperationalRouteLatestEvidenceRef(latestEvidenceRefInput)
    : null;
  const operatorBriefRefInput = options.operatorBriefRef ?? options.operationalRouteOperatorBriefRef;
  const operatorBriefRef = operatorBriefRefInput
    ? safeOperationalRouteOperatorBriefRef(operatorBriefRefInput)
    : null;
  const latest = latestEvidenceRef
    ? await loadOperationalRouteLatestEvidence({ repoRoot, latestEvidenceRef })
    : await buildOperationalRouteLatestEvidence({ repoRoot, registryRef, now: options.now });
  const brief = operatorBriefRef
    ? await loadOperationalRouteOperatorBrief({ repoRoot, operatorBriefRef })
    : await buildOperationalRouteOperatorBrief({
        repoRoot,
        registryRef,
        latestEvidenceRef,
        now: options.now,
      });
  const docRefs = normalizeOperatorDocRefs(options.docRefs ?? defaultOperationalRouteOperatorDocRefs(registryRef));
  const docs = [];
  for (const docRef of docRefs) {
    const docText = await fs.readFile(path.join(repoRoot, docRef), "utf8");
    docs.push({
      doc_ref: docRef,
      sha256: `sha256:${stableHash(docText)}`,
      size_bytes: Buffer.byteLength(docText, "utf8"),
      text: docText,
    });
  }
  const allText = docs.map((doc) => doc.text).join("\n");
  const latestRefs = operationalRouteLatestEvidenceRefMap(latest);
  const requiredRefs = [
    registryRef,
    latestEvidenceRef,
    operatorBriefRef,
    ...Object.values(latestRefs),
  ].filter(Boolean);
  const required_ref_checks = [...new Set(requiredRefs)].sort().map((ref) => ({
    ref,
    present: docs.some((doc) => doc.text.includes(ref)),
    present_in_doc_refs: docs.filter((doc) => doc.text.includes(ref)).map((doc) => doc.doc_ref).sort(),
  }));
  const commandCount = latest.counts?.command_count ?? null;
  const operatorBriefCommandCount = brief.counts?.command_count ?? null;
  const fact_checks = [
    {
      fact_id: "latest_command_count",
      value: commandCount,
      present: commandCount === null
        ? true
        : allText.includes(`command count \`${commandCount}\``)
          || allText.includes(`command_count: ${commandCount}`)
          || allText.includes(`route_command_sheet_command_count: ${commandCount}`),
    },
    {
      fact_id: "operator_brief_command_count",
      value: operatorBriefCommandCount,
      present: operatorBriefCommandCount === null
        ? true
        : allText.includes(`${operatorBriefCommandCount} safe`)
          || allText.includes(`operator_brief_command_count: ${operatorBriefCommandCount}`)
          || allText.includes(`route_operator_brief_command_count: ${operatorBriefCommandCount}`),
    },
  ];
  const allowedLatestRefs = new Set(required_ref_checks.map((entry) => entry.ref));
  const stale_refs = [];
  for (const doc of docs) {
    for (const ref of extractOperationalRouteEvidenceRefsFromText(doc.text)) {
      if (!allowedLatestRefs.has(ref)) {
        stale_refs.push({ doc_ref: doc.doc_ref, ref });
      }
    }
  }
  const missingRequiredRefs = required_ref_checks.filter((entry) => entry.present !== true);
  const missingFacts = fact_checks.filter((entry) => entry.present !== true);
  const blockers = [
    ...missingRequiredRefs.map((entry) => `missing_latest_ref:${entry.ref}`),
    ...missingFacts.map((entry) => `missing_fact:${entry.fact_id}`),
    ...stale_refs.map((entry) => `stale_ref:${entry.ref}`),
  ];
  const drift = {
    schema_version: OPERATIONAL_ROUTE_OPERATOR_DOC_DRIFT_SCHEMA_VERSION,
    kind: "operational_route_operator_doc_drift",
    drift_check_id: normalizeSafeId(options.driftCheckId ?? options.checkId ?? `operational_route_operator_doc_drift_${stableHash([
      registryRef,
      latestEvidenceRef ?? latest.latest_evidence_id,
      operatorBriefRef ?? brief.brief_id,
      docRefs.join("|"),
      formatTimestampUtc(options.now).slice(0, 10),
    ].join(":")).slice(0, 12)}`),
    generated_at_utc: formatTimestampUtc(options.now),
    status: blockers.length === 0 ? "pass_operator_docs_current" : "blocked_operator_doc_drift",
    registry_ref: registryRef,
    latest_evidence_ref: latestEvidenceRef,
    operator_brief_ref: operatorBriefRef,
    doc_refs: docRefs,
    required_ref_checks,
    fact_checks,
    stale_refs: stale_refs.sort((left, right) => `${left.doc_ref}:${left.ref}`.localeCompare(`${right.doc_ref}:${right.ref}`)),
    counts: {
      doc_count: docRefs.length,
      required_ref_count: required_ref_checks.length,
      missing_required_ref_count: missingRequiredRefs.length,
      missing_fact_count: missingFacts.length,
      stale_ref_count: stale_refs.length,
      command_count: commandCount,
      operator_brief_command_count: operatorBriefCommandCount,
    },
    blockers: blockers.sort(),
    next_actions: blockers.length === 0
      ? ["continue_using_operator_docs_with_latest_private_manual_review_refs"]
      : ["refresh_operator_docs_to_latest_refs_before_next_operator_use"],
    boundary: {
      ...operationalRouteBoundary(),
      operator_doc_drift_reads_operator_docs_only: true,
      operator_doc_drift_writes_usage_or_candidate: false,
      operator_doc_drift_writes_call_plan: false,
      operator_doc_drift_launches_sourcebound_review: false,
      raw_query_persisted: false,
      answer_shell_output_persisted: false,
      answer_card_body_persisted: false,
      source_truth_claimed: false,
      final_answer_authority_allowed: false,
      public_canon_promotion_allowed: false,
      ontology_acceptance_allowed: false,
      graph_truth_mutation_allowed: false,
      default_route_mutation_allowed: false,
      external_upload_allowed: false,
    },
  };
  const unsafeBlockers = findUnsafeOperationalRouteValues(drift, "operational_route_operator_doc_drift");
  if (unsafeBlockers.length > 0) {
    return {
      ...drift,
      status: "blocked_operator_doc_drift",
      blockers: [...new Set([...drift.blockers, ...unsafeBlockers])].sort(),
    };
  }
  return drift;
}

export async function writeOperationalRouteOperatorDocDriftCheck(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const drift = await buildOperationalRouteOperatorDocDriftCheck(options);
  const outputRef = options.outputRef ?? defaultOperationalRouteOperatorDocDriftOutputRef(drift);
  const outputPath = path.join(repoRoot, safeOperationalRouteOperatorDocDriftOutputPath(outputRef));
  await writeJson(outputPath, drift);
  return {
    status: "written",
    operational_route_operator_doc_drift_ref: normalizeRepoPath(path.relative(repoRoot, outputPath)),
    drift_check_id: drift.drift_check_id,
    drift_status: drift.status,
    doc_count: drift.counts.doc_count,
    stale_ref_count: drift.counts.stale_ref_count,
    missing_required_ref_count: drift.counts.missing_required_ref_count,
  };
}

export async function loadOperationalRouteOperatorDocDriftCheck(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const driftRef = safeOperationalRouteOperatorDocDriftRef(
    options.docDriftRef ?? options.operatorDocDriftRef ?? options.operationalRouteOperatorDocDriftRef,
  );
  return readJson(path.join(repoRoot, driftRef));
}

export function validateOperationalRouteOperatorDocDriftCheck(drift) {
  const blockers = [];
  const allowedStatuses = new Set(["pass_operator_docs_current", "blocked_operator_doc_drift"]);
  if (drift?.schema_version !== OPERATIONAL_ROUTE_OPERATOR_DOC_DRIFT_SCHEMA_VERSION) blockers.push("schema_version_mismatch");
  if (drift?.kind !== "operational_route_operator_doc_drift") blockers.push("kind_must_be_operational_route_operator_doc_drift");
  if (!ROUTE_ID_PATTERN.test(String(drift?.drift_check_id ?? ""))) blockers.push("drift_check_id_must_be_safe_id");
  if (!allowedStatuses.has(drift?.status)) blockers.push("status_not_allowed");
  if (!trySafeOperationalRouteRef(drift?.registry_ref).ok) blockers.push("registry_ref_unsafe");
  if (drift?.latest_evidence_ref !== null && drift?.latest_evidence_ref !== undefined) {
    const latestRefSafe = trySafeOperationalRouteRef(drift.latest_evidence_ref);
    if (!latestRefSafe.ok || !latestRefSafe.ref.startsWith("_workmeta/")) blockers.push("latest_evidence_ref_must_be_safe_workmeta_ref");
  }
  if (drift?.operator_brief_ref !== null && drift?.operator_brief_ref !== undefined) {
    const briefRefSafe = trySafeOperationalRouteRef(drift.operator_brief_ref);
    if (!briefRefSafe.ok || !briefRefSafe.ref.startsWith("_workmeta/")) blockers.push("operator_brief_ref_must_be_safe_workmeta_ref");
  }
  if (!Array.isArray(drift?.doc_refs) || drift.doc_refs.length === 0) blockers.push("doc_refs_must_be_nonempty_array");
  for (const ref of drift?.doc_refs ?? []) {
    if (!trySafeOperationalRouteRef(ref).ok) blockers.push("doc_ref_unsafe");
  }
  for (const check of drift?.required_ref_checks ?? []) {
    if (!trySafeOperationalRouteRef(check?.ref).ok) blockers.push("required_ref_unsafe");
    if (!Array.isArray(check?.present_in_doc_refs)) blockers.push("required_ref_present_in_doc_refs_must_be_array");
  }
  for (const entry of drift?.stale_refs ?? []) {
    if (!trySafeOperationalRouteRef(entry?.doc_ref).ok) blockers.push("stale_doc_ref_unsafe");
    if (!trySafeOperationalRouteRef(entry?.ref).ok) blockers.push("stale_ref_unsafe");
  }
  const falseBoundaryKeys = [
    "source_text_loaded",
    "chunk_text_loaded",
    "source_payloads_included",
    "copied_excerpts_included",
    "notebooklm_answers_included",
    "secrets_or_session_included",
    "runtime_absolute_paths_included",
    "operator_doc_drift_writes_usage_or_candidate",
    "operator_doc_drift_writes_call_plan",
    "operator_doc_drift_launches_sourcebound_review",
    "raw_query_persisted",
    "answer_shell_output_persisted",
    "answer_card_body_persisted",
    "source_truth_claimed",
    "final_answer_authority_allowed",
    "public_canon_promotion_allowed",
    "ontology_acceptance_allowed",
    "graph_truth_mutation_allowed",
    "default_route_mutation_allowed",
    "external_upload_allowed",
  ];
  if (drift?.boundary?.metadata_only !== true) blockers.push("boundary_metadata_only_must_be_true");
  if (drift?.boundary?.operator_doc_drift_reads_operator_docs_only !== true) {
    blockers.push("boundary_operator_doc_drift_reads_operator_docs_only_must_be_true");
  }
  for (const key of falseBoundaryKeys) {
    if (drift?.boundary?.[key] !== false) blockers.push(`boundary_${key}_must_be_false`);
  }
  blockers.push(...findUnsafeOperationalRouteValues(drift, "operational_route_operator_doc_drift"));
  return {
    schema_version: OPERATIONAL_ROUTE_OPERATOR_DOC_DRIFT_VALIDATION_SCHEMA_VERSION,
    kind: "operational_route_operator_doc_drift_validation",
    status: blockers.length === 0 ? "pass" : "blocked",
    drift_check_id: drift?.drift_check_id ?? null,
    drift_status: drift?.status ?? null,
    blocker_count: blockers.length,
    blockers: [...new Set(blockers)].sort(),
    counts: drift?.counts ?? null,
    boundary: {
      metadata_only: drift?.boundary?.metadata_only === true,
      operator_doc_drift_reads_operator_docs_only:
        drift?.boundary?.operator_doc_drift_reads_operator_docs_only === true,
      raw_query_persisted: drift?.boundary?.raw_query_persisted === true,
      public_canon_promotion_allowed: drift?.boundary?.public_canon_promotion_allowed === true,
    },
  };
}

export function renderOperationalRouteOperatorDocDriftText(drift) {
  const lines = [
    `Status: ${drift.status}`,
    `Doc drift check: ${drift.drift_check_id}`,
    `Registry: ${drift.registry_ref}`,
    `Latest evidence: ${drift.latest_evidence_ref ?? "generated_from_registry"}`,
    `Operator brief: ${drift.operator_brief_ref ?? "generated_from_latest_evidence"}`,
    `Docs: ${drift.counts?.doc_count ?? 0}`,
    `Required refs: ${(drift.counts?.required_ref_count ?? 0) - (drift.counts?.missing_required_ref_count ?? 0)}/${drift.counts?.required_ref_count ?? 0} present`,
    `Facts missing: ${drift.counts?.missing_fact_count ?? 0}`,
    `Stale refs: ${drift.counts?.stale_ref_count ?? 0}`,
    "Missing refs:",
    ...((drift.required_ref_checks ?? []).filter((entry) => entry.present !== true).map((entry) => `- ${entry.ref}`)),
    ...((drift.required_ref_checks ?? []).some((entry) => entry.present !== true) ? [] : ["- none"]),
    "Stale refs:",
    ...(drift.stale_refs ?? []).map((entry) => `- ${entry.doc_ref}: ${entry.ref}`),
    ...((drift.stale_refs ?? []).length > 0 ? [] : ["- none"]),
    "Next actions:",
    ...(drift.next_actions ?? []).map((action) => `- ${action}`),
    "",
    "Boundary: operator doc drift check reads operator docs and stored metadata refs only. It does not read source text/chunks, persist raw queries, persist answer bodies, write usage/candidate/call-plan records, launch sourcebound review, or grant source truth, final-answer, public canon, ontology, graph truth, default-route, or external-upload authority.",
    "",
  ];
  return lines.join("\n");
}

export async function buildOperationalRouteOperatorHealth(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const latestEvidenceRefInput = options.latestEvidenceRef ?? options.operationalRouteLatestEvidenceRef;
  const latestEvidenceRef = latestEvidenceRefInput
    ? safeOperationalRouteLatestEvidenceRef(latestEvidenceRefInput)
    : null;
  const operatorBriefRefInput = options.operatorBriefRef ?? options.operationalRouteOperatorBriefRef;
  const operatorBriefRef = operatorBriefRefInput
    ? safeOperationalRouteOperatorBriefRef(operatorBriefRefInput)
    : null;
  const operatorDocDriftRefInput =
    options.docDriftRef ?? options.operatorDocDriftRef ?? options.operationalRouteOperatorDocDriftRef;
  const operatorDocDriftRef = operatorDocDriftRefInput
    ? safeOperationalRouteOperatorDocDriftRef(operatorDocDriftRefInput)
    : null;
  const latest = latestEvidenceRef
    ? await loadOperationalRouteLatestEvidence({ repoRoot, latestEvidenceRef })
    : await buildOperationalRouteLatestEvidence({ repoRoot, registryRef: options.registryRef, now: options.now });
  const registryRef = safeOperationalRouteRef(options.registryRef ?? latest.registry_ref);
  const brief = operatorBriefRef
    ? await loadOperationalRouteOperatorBrief({ repoRoot, operatorBriefRef })
    : await buildOperationalRouteOperatorBrief({
        repoRoot,
        registryRef,
        latestEvidenceRef,
        now: options.now,
      });
  const drift = operatorDocDriftRef
    ? await loadOperationalRouteOperatorDocDriftCheck({ repoRoot, docDriftRef: operatorDocDriftRef })
    : await buildOperationalRouteOperatorDocDriftCheck({
        repoRoot,
        registryRef,
        latestEvidenceRef,
        operatorBriefRef,
        now: options.now,
      });
  const latestValidation = validateOperationalRouteLatestEvidence(latest);
  const briefValidation = validateOperationalRouteOperatorBrief(brief);
  const driftValidation = validateOperationalRouteOperatorDocDriftCheck(drift);
  const blockers = [];
  if (latestValidation.status !== "pass") blockers.push("latest_evidence_validation_blocked");
  if (briefValidation.status !== "pass") blockers.push("operator_brief_validation_blocked");
  if (driftValidation.status !== "pass") blockers.push("operator_doc_drift_validation_blocked");
  if (String(latest.status ?? "").startsWith("blocked")) blockers.push(`latest_evidence_status:${latest.status}`);
  if (String(brief.status ?? "").startsWith("blocked")) blockers.push(`operator_brief_status:${brief.status}`);
  if (drift.status !== "pass_operator_docs_current") blockers.push(`operator_doc_drift_status:${drift.status}`);
  const healthId = normalizeSafeId(options.healthId ?? options.operatorHealthId ?? `operational_route_operator_health_${stableHash([
    registryRef,
    latestEvidenceRef ?? latest.latest_evidence_id,
    operatorBriefRef ?? brief.brief_id,
    operatorDocDriftRef ?? drift.drift_check_id,
    formatTimestampUtc(options.now).slice(0, 10),
  ].join(":")).slice(0, 12)}`);
  const latestRefs = operationalRouteLatestEvidenceRefMap(latest);
  const health = {
    schema_version: OPERATIONAL_ROUTE_OPERATOR_HEALTH_SCHEMA_VERSION,
    kind: "operational_route_operator_health",
    health_id: healthId,
    generated_at_utc: formatTimestampUtc(options.now),
    status: blockers.length === 0 ? "pass_private_manual_review_operator_health" : "blocked_operator_health",
    registry_ref: registryRef,
    latest_evidence_ref: latestEvidenceRef,
    operator_brief_ref: operatorBriefRef,
    operator_doc_drift_ref: operatorDocDriftRef,
    surface_statuses: {
      latest_evidence: latest.status,
      operator_brief: brief.status,
      operator_doc_drift: drift.status,
    },
    validations: {
      latest_evidence: {
        status: latestValidation.status,
        blocker_count: latestValidation.blocker_count,
      },
      operator_brief: {
        status: briefValidation.status,
        blocker_count: briefValidation.blocker_count,
      },
      operator_doc_drift: {
        status: driftValidation.status,
        blocker_count: driftValidation.blocker_count,
      },
    },
    counts: {
      route_count: brief.counts?.route_count ?? latest.counts?.route_count ?? 0,
      latest_artifact_count: latest.counts?.latest_artifact_count ?? 0,
      missing_artifact_count: latest.counts?.missing_artifact_count ?? 0,
      blocked_artifact_count: latest.counts?.blocked_artifact_count ?? 0,
      command_count: latest.counts?.command_count ?? null,
      operator_brief_command_count: brief.counts?.command_count ?? null,
      usage_record_count: latest.counts?.usage_record_count ?? brief.counts?.usage_record_count ?? 0,
      repeated_use_review_threshold:
        latest.counts?.repeated_use_review_threshold ?? brief.counts?.repeated_use_review_threshold ?? null,
      repeated_use_review_ready_route_count:
        latest.counts?.repeated_use_review_ready_route_count
        ?? brief.counts?.repeated_use_review_ready_route_count
        ?? 0,
      unmatched_candidate_count:
        latest.counts?.unmatched_candidate_count ?? brief.counts?.unmatched_candidate_count ?? 0,
      doc_count: drift.counts?.doc_count ?? 0,
      missing_required_ref_count: drift.counts?.missing_required_ref_count ?? 0,
      missing_fact_count: drift.counts?.missing_fact_count ?? 0,
      stale_ref_count: drift.counts?.stale_ref_count ?? 0,
    },
    latest_refs: {
      ...latestRefs,
      latest_evidence_ref: latestEvidenceRef,
      operator_brief_ref: operatorBriefRef,
      operator_doc_drift_ref: operatorDocDriftRef,
    },
    blockers: blockers.sort(),
    next_actions: operationalRouteOperatorHealthNextActions(blockers.length === 0),
    boundary: {
      ...operationalRouteBoundary(),
      operator_health_scans_stored_metadata_only: true,
      operator_health_reads_operator_docs_only_for_doc_drift: true,
      operator_health_executes_commands: false,
      operator_health_writes_usage_or_candidate: false,
      operator_health_writes_call_plan: false,
      operator_health_launches_sourcebound_review: false,
      raw_query_persisted: false,
      answer_shell_output_persisted: false,
      answer_card_body_persisted: false,
      source_truth_claimed: false,
      final_answer_authority_allowed: false,
      public_canon_promotion_allowed: false,
      ontology_acceptance_allowed: false,
      graph_truth_mutation_allowed: false,
      default_route_mutation_allowed: false,
      external_upload_allowed: false,
    },
  };
  const unsafeBlockers = findUnsafeOperationalRouteValues(health, "operational_route_operator_health");
  if (unsafeBlockers.length > 0) {
    return {
      ...health,
      status: "blocked_operator_health",
      blockers: [...new Set([...health.blockers, ...unsafeBlockers])].sort(),
    };
  }
  return health;
}

export async function writeOperationalRouteOperatorHealth(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const health = await buildOperationalRouteOperatorHealth(options);
  const outputRef = options.outputRef ?? defaultOperationalRouteOperatorHealthOutputRef(health);
  const outputPath = path.join(repoRoot, safeOperationalRouteOperatorHealthOutputPath(outputRef));
  await writeJson(outputPath, health);
  return {
    status: "written",
    operational_route_operator_health_ref: normalizeRepoPath(path.relative(repoRoot, outputPath)),
    health_id: health.health_id,
    health_status: health.status,
    route_count: health.counts.route_count,
    command_count: health.counts.command_count,
    operator_brief_command_count: health.counts.operator_brief_command_count,
    blocker_count: health.blockers.length,
  };
}

export async function loadOperationalRouteOperatorHealth(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const healthRef = safeOperationalRouteOperatorHealthRef(
    options.healthRef ?? options.operatorHealthRef ?? options.operationalRouteOperatorHealthRef,
  );
  return readJson(path.join(repoRoot, healthRef));
}

export function validateOperationalRouteOperatorHealth(health) {
  const blockers = [];
  const allowedStatuses = new Set(["pass_private_manual_review_operator_health", "blocked_operator_health"]);
  if (health?.schema_version !== OPERATIONAL_ROUTE_OPERATOR_HEALTH_SCHEMA_VERSION) blockers.push("schema_version_mismatch");
  if (health?.kind !== "operational_route_operator_health") blockers.push("kind_must_be_operational_route_operator_health");
  if (!ROUTE_ID_PATTERN.test(String(health?.health_id ?? ""))) blockers.push("health_id_must_be_safe_id");
  if (!allowedStatuses.has(health?.status)) blockers.push("status_not_allowed");
  if (!trySafeOperationalRouteRef(health?.registry_ref).ok) blockers.push("registry_ref_unsafe");
  for (const key of ["latest_evidence_ref", "operator_brief_ref", "operator_doc_drift_ref"]) {
    if (health?.[key] !== null && health?.[key] !== undefined) {
      const refSafe = trySafeOperationalRouteRef(health[key]);
      if (!refSafe.ok || !refSafe.ref.startsWith("_workmeta/")) blockers.push(`${key}_must_be_safe_workmeta_ref`);
    }
  }
  for (const [key, value] of Object.entries(health?.latest_refs ?? {})) {
    if (value === null || value === undefined) continue;
    const refSafe = trySafeOperationalRouteRef(value);
    if (!refSafe.ok || !refSafe.ref.startsWith("_workmeta/")) blockers.push(`latest_ref_${key}_must_be_safe_workmeta_ref`);
  }
  for (const [surfaceId, surfaceStatus] of Object.entries(health?.surface_statuses ?? {})) {
    if (!ROUTE_ID_PATTERN.test(surfaceId)) blockers.push("surface_status_id_must_be_safe_id");
    if (typeof surfaceStatus !== "string" || surfaceStatus.length === 0) blockers.push(`surface_status_${surfaceId}_required`);
  }
  for (const [validationId, validation] of Object.entries(health?.validations ?? {})) {
    if (!ROUTE_ID_PATTERN.test(validationId)) blockers.push("validation_id_must_be_safe_id");
    if (!["pass", "blocked"].includes(String(validation?.status ?? ""))) {
      blockers.push(`validation_${validationId}_status_invalid`);
    }
  }
  if (!Array.isArray(health?.blockers)) blockers.push("blockers_must_be_array");
  for (const blocker of health?.blockers ?? []) {
    if (typeof blocker !== "string" || blocker.length === 0) blockers.push("blocker_must_be_nonempty_string");
  }
  const falseBoundaryKeys = [
    "source_text_loaded",
    "chunk_text_loaded",
    "source_payloads_included",
    "copied_excerpts_included",
    "notebooklm_answers_included",
    "secrets_or_session_included",
    "runtime_absolute_paths_included",
    "operator_health_executes_commands",
    "operator_health_writes_usage_or_candidate",
    "operator_health_writes_call_plan",
    "operator_health_launches_sourcebound_review",
    "raw_query_persisted",
    "answer_shell_output_persisted",
    "answer_card_body_persisted",
    "source_truth_claimed",
    "final_answer_authority_allowed",
    "public_canon_promotion_allowed",
    "ontology_acceptance_allowed",
    "graph_truth_mutation_allowed",
    "default_route_mutation_allowed",
    "external_upload_allowed",
  ];
  if (health?.boundary?.metadata_only !== true) blockers.push("boundary_metadata_only_must_be_true");
  if (health?.boundary?.operator_health_scans_stored_metadata_only !== true) {
    blockers.push("boundary_operator_health_scans_stored_metadata_only_must_be_true");
  }
  if (health?.boundary?.operator_health_reads_operator_docs_only_for_doc_drift !== true) {
    blockers.push("boundary_operator_health_reads_operator_docs_only_for_doc_drift_must_be_true");
  }
  for (const key of falseBoundaryKeys) {
    if (health?.boundary?.[key] !== false) blockers.push(`boundary_${key}_must_be_false`);
  }
  blockers.push(...findUnsafeOperationalRouteValues(health, "operational_route_operator_health"));
  return {
    schema_version: OPERATIONAL_ROUTE_OPERATOR_HEALTH_VALIDATION_SCHEMA_VERSION,
    kind: "operational_route_operator_health_validation",
    status: blockers.length === 0 ? "pass" : "blocked",
    health_id: health?.health_id ?? null,
    health_status: health?.status ?? null,
    blocker_count: blockers.length,
    blockers: [...new Set(blockers)].sort(),
    counts: health?.counts ?? null,
    boundary: {
      metadata_only: health?.boundary?.metadata_only === true,
      operator_health_scans_stored_metadata_only:
        health?.boundary?.operator_health_scans_stored_metadata_only === true,
      operator_health_executes_commands: health?.boundary?.operator_health_executes_commands === true,
      operator_health_writes_usage_or_candidate: health?.boundary?.operator_health_writes_usage_or_candidate === true,
      operator_health_writes_call_plan: health?.boundary?.operator_health_writes_call_plan === true,
      operator_health_launches_sourcebound_review: health?.boundary?.operator_health_launches_sourcebound_review === true,
      raw_query_persisted: health?.boundary?.raw_query_persisted === true,
      public_canon_promotion_allowed: health?.boundary?.public_canon_promotion_allowed === true,
    },
  };
}

export function renderOperationalRouteOperatorHealthText(health) {
  const lines = [
    `Status: ${health.status}`,
    `Operator health: ${health.health_id}`,
    `Registry: ${health.registry_ref}`,
    `Latest evidence: ${health.latest_evidence_ref ?? "generated_from_registry"}`,
    `Operator brief: ${health.operator_brief_ref ?? "generated_from_latest_evidence"}`,
    `Doc drift: ${health.operator_doc_drift_ref ?? "generated_from_operator_docs"}`,
    `Routes: ${health.counts?.route_count ?? 0}`,
    `Usage records: ${health.counts?.usage_record_count ?? 0}/${health.counts?.repeated_use_review_threshold ?? "unknown"}`,
    `Ready routes: ${health.counts?.repeated_use_review_ready_route_count ?? 0}`,
    `Unmatched candidates: ${health.counts?.unmatched_candidate_count ?? 0}`,
    `Command sheet commands: ${health.counts?.command_count ?? "n/a"}`,
    `Operator brief commands: ${health.counts?.operator_brief_command_count ?? "n/a"}`,
    `Operator docs: ${health.counts?.doc_count ?? 0}, missing refs=${health.counts?.missing_required_ref_count ?? 0}, missing facts=${health.counts?.missing_fact_count ?? 0}, stale refs=${health.counts?.stale_ref_count ?? 0}`,
    "Surfaces:",
    ...Object.entries(health.surface_statuses ?? {}).map(([key, value]) => {
      const validation = health.validations?.[key];
      return `- ${key}: status=${value}, validation=${validation?.status ?? "unknown"}, blockers=${validation?.blocker_count ?? "unknown"}`;
    }),
    "Latest refs:",
    ...Object.entries(health.latest_refs ?? {}).map(([key, value]) => `- ${key}: ${value ?? "missing"}`),
    "Blockers:",
    ...((health.blockers ?? []).length > 0 ? health.blockers.map((blocker) => `- ${blocker}`) : ["- none"]),
    "Next actions:",
    ...(health.next_actions ?? []).map((action) => `- ${action}`),
    "",
    "Boundary: operator health is metadata only. It checks stored latest evidence, operator brief, and operator doc-drift metadata; it does not execute commands, write usage/candidate/call-plan records, persist raw queries or answer bodies, launch sourcebound review, or grant source truth, final-answer, public canon, ontology, graph truth, default-route, or external-upload authority.",
    "",
  ];
  return lines.join("\n");
}

export async function buildOperationalRouteCallPlan(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const registryRef = safeOperationalRouteRef(options.registryRef);
  const smokeTestRef = options.smokeTestRef ? safeOperationalRouteRef(options.smokeTestRef) : null;
  const queryLabel = String(options.queryLabel ?? "").trim();
  if (!queryLabel) throw new Error("--query-label requires a non-empty value");
  const [dashboard, session] = await Promise.all([
    buildOperationalRouteDashboard({
      repoRoot,
      registryRef,
      smokeTestRef,
      usageRootRef: options.usageRootRef,
      candidateRootRef: options.candidateRootRef,
      checkFiles: options.checkFiles !== false,
      checkWorkCards: options.checkWorkCards !== false,
      now: options.now,
    }),
    buildOperationalRouteSession({
      repoRoot,
      registryRef,
      smokeTestRef,
      usageRootRef: options.usageRootRef,
      candidateRootRef: options.candidateRootRef,
      queryLabel,
      sessionId: options.planId ? `${normalizeSafeId(options.planId)}_session` : undefined,
      checkFiles: options.checkFiles !== false,
      checkWorkCards: options.checkWorkCards !== false,
      now: options.now,
    }),
  ]);
  let status = "ready_to_answer_manual_review";
  if (dashboard.status === "blocked") {
    status = "blocked_dashboard";
  } else if (session.status === "blocked_preflight") {
    status = "blocked_preflight";
  } else if (session.status === "blocked_no_route_candidate_capture_recommended") {
    status = "blocked_no_route_candidate_capture_recommended";
  }
  const selectedRoute = session.selected_route
    ? {
        route_id: session.selected_route.route_id,
        selected_work_card_id: session.selected_route.selected_work_card_id,
        selected_work_card_ref: session.selected_route.selected_work_card_ref,
        operator_answer_card_ref: session.selected_route.operator_answer_card_ref,
        wiki_page_ref: session.selected_route.wiki_page_ref,
        evidence_pages: session.selected_route.evidence_pages,
        review_context_pages: session.selected_route.review_context_pages,
        claim_ceiling: session.selected_route.claim_ceiling,
      }
    : null;
  const plan = {
    schema_version: OPERATIONAL_ROUTE_CALL_PLAN_SCHEMA_VERSION,
    kind: "operational_route_call_plan",
    status,
    plan_id: normalizeSafeId(options.planId ?? `operational_route_call_plan_${stableHash([
      registryRef,
      session.query_label_fingerprint,
      formatTimestampUtc(options.now).slice(0, 10),
    ].join(":")).slice(0, 12)}`),
    generated_at_utc: formatTimestampUtc(options.now),
    registry_ref: registryRef,
    registry_id: session.registry_id ?? dashboard.registry_id ?? null,
    smoke_test_ref: smokeTestRef,
    query_label_fingerprint: session.query_label_fingerprint,
    raw_query_persisted: false,
    dashboard_summary: {
      status: dashboard.status,
      route_count: dashboard.summary?.route_count ?? 0,
      usage_record_count: dashboard.summary?.usage_record_count ?? 0,
      repeated_use_review_ready_route_count: dashboard.summary?.repeated_use_review_ready_route_count ?? 0,
      unmatched_candidate_count: dashboard.summary?.unmatched_candidate_count ?? 0,
    },
    session_summary: {
      status: session.status,
      session_id: session.session_id,
      preflight_status: session.preflight_summary?.status ?? null,
      resolution_status: session.resolution_summary?.status ?? null,
      route_id: session.resolution_summary?.route_id ?? null,
      selected_work_card_id: session.resolution_summary?.selected_work_card_id ?? null,
      evidence_pages: session.resolution_summary?.evidence_pages ?? [],
      claim_ceiling: session.resolution_summary?.claim_ceiling ?? null,
    },
    selected_route: selectedRoute,
    operator_surface: {
      dashboard_output_persisted: false,
      answer_shell_available: session.operator_surface?.answer_shell_available === true,
      answer_shell_output_persisted: false,
      answer_card_body_persisted: false,
      usage_record_allowed_after_real_answer: session.operator_surface?.usage_record_allowed_after_real_answer === true,
      candidate_record_recommended: session.operator_surface?.candidate_record_recommended === true,
      source_text_loading_allowed_here: false,
    },
    suggested_commands: operationalRouteCallPlanSuggestedCommands({
      registryRef,
      smokeTestRef,
      matched: session.status === "ready_matched_route",
    }),
    next_actions: operationalRouteCallPlanNextActions(status),
    authority: {
      source_truth_claimed: false,
      final_answer_authority_allowed: false,
      public_canon_promotion_allowed: false,
      ontology_acceptance_allowed: false,
      graph_truth_mutation_allowed: false,
      default_route_mutation_allowed: false,
      external_upload_allowed: false,
      stronger_permission_granted_here: false,
    },
    boundary: operationalRouteBoundary(),
  };
  const unsafeBlockers = findUnsafeOperationalRouteValues(plan, "operational_route_call_plan");
  if (unsafeBlockers.length > 0) {
    return {
      ...plan,
      status: "blocked_dashboard",
      unsafe_blockers: unsafeBlockers.sort(),
    };
  }
  return plan;
}

export function validateOperationalRouteCallPlan(plan) {
  const blockers = [];
  const allowedStatuses = new Set([
    "blocked_dashboard",
    "blocked_no_route_candidate_capture_recommended",
    "blocked_preflight",
    "ready_to_answer_manual_review",
  ]);
  if (plan?.schema_version !== OPERATIONAL_ROUTE_CALL_PLAN_SCHEMA_VERSION) blockers.push("schema_version_mismatch");
  if (plan?.kind !== "operational_route_call_plan") blockers.push("kind_must_be_operational_route_call_plan");
  if (!allowedStatuses.has(plan?.status)) blockers.push("status_must_be_allowed_call_plan_state");
  if (!ROUTE_ID_PATTERN.test(String(plan?.plan_id ?? ""))) blockers.push("plan_id_must_be_safe_id");
  if (!trySafeOperationalRouteRef(plan?.registry_ref).ok) blockers.push("registry_ref_unsafe");
  if (plan?.smoke_test_ref !== null && plan?.smoke_test_ref !== undefined) {
    if (!trySafeOperationalRouteRef(plan.smoke_test_ref).ok) blockers.push("smoke_test_ref_unsafe");
  }
  if (!/^[a-f0-9]{64}$/u.test(String(plan?.query_label_fingerprint ?? ""))) {
    blockers.push("query_label_fingerprint_unsafe");
  }
  if (plan?.raw_query_persisted !== false) blockers.push("raw_query_must_not_be_persisted");
  if (!plan?.dashboard_summary || typeof plan.dashboard_summary !== "object") blockers.push("dashboard_summary_required");
  if (!plan?.session_summary || typeof plan.session_summary !== "object") blockers.push("session_summary_required");
  if (plan?.selected_route) {
    for (const [key, value] of Object.entries({
      selected_work_card_ref: plan.selected_route.selected_work_card_ref,
      operator_answer_card_ref: plan.selected_route.operator_answer_card_ref,
      wiki_page_ref: plan.selected_route.wiki_page_ref,
    })) {
      if (!trySafeOperationalRouteRef(value).ok) blockers.push(`${key}_unsafe`);
    }
    if (!validatePageArray(plan.selected_route.evidence_pages).valid) {
      blockers.push("evidence_pages_must_be_positive_integer_array");
    }
    if (!validatePageArray(plan.selected_route.review_context_pages, { allowEmpty: true }).valid) {
      blockers.push("review_context_pages_must_be_positive_integer_array");
    }
  }
  for (const [key, expected] of Object.entries({
    dashboard_output_persisted: false,
    answer_shell_output_persisted: false,
    answer_card_body_persisted: false,
    source_text_loading_allowed_here: false,
  })) {
    if (plan?.operator_surface?.[key] !== expected) blockers.push(`operator_surface_${key}_must_be_false`);
  }
  for (const [key, expected] of Object.entries({
    source_truth_claimed: false,
    final_answer_authority_allowed: false,
    public_canon_promotion_allowed: false,
    ontology_acceptance_allowed: false,
    graph_truth_mutation_allowed: false,
    default_route_mutation_allowed: false,
    external_upload_allowed: false,
    stronger_permission_granted_here: false,
  })) {
    if (plan?.authority?.[key] !== expected) blockers.push(`authority_${key}_must_be_false`);
  }
  if (plan?.boundary?.metadata_only !== true) blockers.push("boundary_metadata_only_must_be_true");
  if (plan?.boundary?.source_text_loaded !== false) blockers.push("boundary_source_text_loaded_must_be_false");
  blockers.push(...findUnsafeOperationalRouteValues(plan, "operational_route_call_plan"));
  return {
    schema_version: OPERATIONAL_ROUTE_CALL_PLAN_VALIDATION_SCHEMA_VERSION,
    kind: "operational_route_call_plan_validation",
    status: blockers.length === 0 ? "pass" : "blocked",
    plan_status: plan?.status ?? null,
    route_id: plan?.selected_route?.route_id ?? null,
    blocker_count: blockers.length,
    blockers: [...new Set(blockers)].sort(),
    boundary: {
      metadata_only: plan?.boundary?.metadata_only === true,
      source_text_loaded: plan?.boundary?.source_text_loaded === true,
      raw_query_persisted: plan?.raw_query_persisted === true,
      final_answer_authority_allowed: plan?.authority?.final_answer_authority_allowed === true,
      public_canon_promotion_allowed: plan?.authority?.public_canon_promotion_allowed === true,
      default_route_mutation_allowed: plan?.authority?.default_route_mutation_allowed === true,
    },
  };
}

export function renderOperationalRouteCallPlanText(plan) {
  const lines = [
    `Status: ${plan.status}`,
    `Plan: ${plan.plan_id}`,
    `Registry: ${plan.registry_ref}`,
    `Raw query persisted: ${plan.raw_query_persisted === true ? "yes" : "no"}`,
    `Dashboard: ${plan.dashboard_summary?.status ?? "unknown"}`,
    `Session: ${plan.session_summary?.status ?? "unknown"}`,
    `Preflight: ${plan.session_summary?.preflight_status ?? "unknown"}`,
    `Resolution: ${plan.session_summary?.resolution_status ?? "unknown"}`,
    `Usage records: ${plan.dashboard_summary?.usage_record_count ?? 0}`,
    `Repeated-use ready routes: ${plan.dashboard_summary?.repeated_use_review_ready_route_count ?? 0}`,
    `Unmatched candidates: ${plan.dashboard_summary?.unmatched_candidate_count ?? 0}`,
  ];
  if (plan.selected_route) {
    lines.push(
      `Route: ${plan.selected_route.route_id}`,
      `Work card: ${plan.selected_route.selected_work_card_id}`,
      `Work card ref: ${plan.selected_route.selected_work_card_ref}`,
      `Operator answer card: ${plan.selected_route.operator_answer_card_ref}`,
      `Wiki page: ${plan.selected_route.wiki_page_ref}`,
      `Evidence pages: ${(plan.selected_route.evidence_pages ?? []).join(", ")}`,
      `Review context pages: ${(plan.selected_route.review_context_pages ?? []).join(", ")}`,
      `Claim ceiling: ${plan.selected_route.claim_ceiling}`,
    );
  } else {
    lines.push("Route: (no matched route)");
  }
  lines.push(
    `Answer shell available: ${plan.operator_surface?.answer_shell_available === true ? "yes" : "no"}`,
    `Answer shell output persisted: ${plan.operator_surface?.answer_shell_output_persisted === true ? "yes" : "no"}`,
    `Answer-card body persisted: ${plan.operator_surface?.answer_card_body_persisted === true ? "yes" : "no"}`,
    "Next actions:",
    ...(plan.next_actions ?? []).map((action) => `- ${action}`),
    "Suggested commands:",
    ...(plan.suggested_commands ?? []).map((command) => `- ${command}`),
    "",
    "Boundary: call-plan metadata only. It routes one transient question without persisting the raw query, answer body, answer shell output, source text, chunks, source truth, final answers, public canon, ontology acceptance, graph truth, or default routes.",
    "",
  );
  return lines.join("\n");
}

export async function writeOperationalRouteCallPlan(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const plan = await buildOperationalRouteCallPlan(options);
  const outputRef = options.outputRef ?? defaultOperationalRouteCallPlanOutputRef(plan);
  const outputPath = path.join(repoRoot, safeOperationalRouteCallPlanOutputPath(outputRef));
  await writeJson(outputPath, plan);
  return {
    status: "written",
    operational_route_call_plan_ref: normalizeRepoPath(path.relative(repoRoot, outputPath)),
    plan_id: plan.plan_id,
    plan_status: plan.status,
    route_id: plan.selected_route?.route_id ?? null,
    raw_query_persisted: plan.raw_query_persisted === true,
    answer_shell_output_persisted: plan.operator_surface?.answer_shell_output_persisted === true,
  };
}

export async function loadOperationalRouteCallPlan(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const planRef = safeOperationalRouteCallPlanRef(
    options.callPlanRef ?? options.planRef ?? options.operationalRouteCallPlanRef,
  );
  return readJson(path.join(repoRoot, planRef));
}

export async function buildOperationalRouteCloseout(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const registryRef = safeOperationalRouteRef(options.registryRef);
  const closeoutId = normalizeSafeId(options.closeoutId ?? `operational_route_closeout_${stableHash([
    registryRef,
    options.queryLabel ? stableHash(options.queryLabel) : "registry",
    formatTimestampUtc(options.now).slice(0, 10),
  ].join(":")).slice(0, 12)}`);
  const status = await buildOperationalRouteStatus({
    repoRoot,
    registryRef,
    usageRootRef: options.usageRootRef,
    candidateRootRef: options.candidateRootRef,
    statusId: `${closeoutId}_status`,
    checkFiles: options.checkFiles,
    checkWorkCards: options.checkWorkCards,
    now: options.now,
  });
  const resolution = options.queryLabel
    ? await resolveOperationalRoute({
        repoRoot,
        registryRef,
        queryLabel: options.queryLabel,
        checkFiles: options.checkFiles !== false,
        now: options.now,
      })
    : null;
  const selected = resolution?.selected_route ?? null;
  const routeSummary = selected
    ? (status.usage_summary.routes ?? []).find((route) => route.route_id === selected.route_id) ?? null
    : null;
  const closeoutStatus = selected
    ? routeSummary?.repeated_use_review_ready === true
      ? "route_ready_for_sourcebound_review"
      : "closed_private_manual_review_below_repeated_use_threshold"
    : resolution && resolution.status !== "matched"
      ? "unmatched_candidate_capture_available"
      : "registry_closeout_status_only";
  const nextActions = [];
  if (selected && routeSummary?.repeated_use_review_ready === true) {
    nextActions.push("route_to_sourcebound_review_with_existing_usage_refs");
  } else if (selected) {
    nextActions.push("continue_private_manual_review_use");
    nextActions.push("record_future_real_usage_only_after_delivered_operator_answers");
  } else if (resolution && resolution.status !== "matched") {
    nextActions.push("record_candidate_only_if_this_was_a_real_unmatched_operator_question");
    nextActions.push("review_candidate_before_editing_route_registry");
  } else {
    nextActions.push("use_dashboard_or_call_plan_for_a_specific_transient_question");
  }
  if (status.counts.unmatched_candidate_count > 0) {
    nextActions.push("review_unmatched_candidate_records_before_route_registry_changes");
  }
  return {
    schema_version: OPERATIONAL_ROUTE_CLOSEOUT_SCHEMA_VERSION,
    kind: "operational_route_closeout",
    closeout_id: closeoutId,
    generated_at_utc: formatTimestampUtc(options.now),
    registry_ref: registryRef,
    status: closeoutStatus,
    selected_route: selected
      ? {
          route_id: selected.route_id,
          selected_work_card_id: selected.selected_work_card_id,
          selected_work_card_ref: selected.selected_work_card_ref,
          operator_answer_card_ref: selected.operator_answer_card_ref,
          wiki_page_ref: selected.wiki_page_ref,
          evidence_pages: selected.evidence_pages ?? [],
          review_context_pages: selected.review_context_pages ?? [],
          claim_ceiling: selected.claim_ceiling,
        }
      : null,
    route_usage: routeSummary
      ? {
          route_id: routeSummary.route_id,
          usage_count: routeSummary.usage_count,
          repeated_use_review_threshold: routeSummary.repeated_use_review_threshold,
          repeated_use_review_ready: routeSummary.repeated_use_review_ready,
          usage_record_refs: routeSummary.usage_record_refs ?? [],
        }
      : null,
    status_snapshot: {
      operational_status: status.status,
      route_count: status.counts.route_count,
      usage_record_count: status.counts.usage_record_count,
      unmatched_candidate_count: status.counts.unmatched_candidate_count,
      repeated_use_review_ready_route_count: status.counts.repeated_use_review_ready_route_count,
      sourcebound_ready_claimed: false,
    },
    query_signal: resolution
      ? {
          resolution_status: resolution.status,
          query_label_fingerprint: resolution.query_label_fingerprint ?? null,
          raw_query_persisted: false,
        }
      : null,
    next_actions: nextActions,
    boundary: {
      ...operationalRouteBoundary(),
      answer_shell_output_persisted: false,
      answer_card_body_persisted: false,
      raw_query_persisted: false,
      usage_record_written_here: false,
      candidate_record_written_here: false,
      sourcebound_ready_route_claimed_here: false,
      source_truth_claimed: false,
      external_upload_allowed: false,
    },
  };
}

export function validateOperationalRouteCloseout(closeout) {
  const blockers = [];
  if (closeout?.schema_version !== OPERATIONAL_ROUTE_CLOSEOUT_SCHEMA_VERSION) blockers.push("schema_version_mismatch");
  if (closeout?.kind !== "operational_route_closeout") blockers.push("kind_must_be_operational_route_closeout");
  if (!ROUTE_ID_PATTERN.test(String(closeout?.closeout_id ?? ""))) blockers.push("closeout_id_must_be_safe_id");
  if (!trySafeOperationalRouteRef(closeout?.registry_ref).ok) blockers.push("registry_ref_unsafe");
  if (closeout?.selected_route) {
    if (!ROUTE_ID_PATTERN.test(String(closeout.selected_route.route_id ?? ""))) blockers.push("route_id_must_be_safe_id");
    for (const key of ["selected_work_card_ref", "operator_answer_card_ref", "wiki_page_ref"]) {
      if (!trySafeOperationalRouteRef(closeout.selected_route[key]).ok) blockers.push(`${key}_unsafe`);
    }
    if (!validatePageArray(closeout.selected_route.evidence_pages).valid) blockers.push("evidence_pages_must_be_positive_integer_array");
  }
  if (closeout?.route_usage) {
    if (!ROUTE_ID_PATTERN.test(String(closeout.route_usage.route_id ?? ""))) blockers.push("route_usage_route_id_must_be_safe_id");
    if (!Array.isArray(closeout.route_usage.usage_record_refs)) blockers.push("usage_record_refs_must_be_array");
    for (const ref of closeout.route_usage.usage_record_refs ?? []) {
      try {
        safeUsageRecordRef(ref);
      } catch {
        blockers.push("usage_record_ref_unsafe");
      }
    }
  }
  if (closeout?.boundary?.metadata_only !== true) blockers.push("boundary_metadata_only_must_be_true");
  const closeoutFalseBoundaryKeys = [
    "source_text_loaded",
    "chunk_text_loaded",
    "source_payloads_included",
    "copied_excerpts_included",
    "notebooklm_answers_included",
    "secrets_or_session_included",
    "runtime_absolute_paths_included",
    "final_answer_authority_allowed",
    "public_canon_promotion_allowed",
    "ontology_acceptance_allowed",
    "default_route_mutation_allowed",
    "graph_truth_mutation_allowed",
    "raw_query_persisted",
    "answer_shell_output_persisted",
    "answer_card_body_persisted",
    "usage_record_written_here",
    "candidate_record_written_here",
    "sourcebound_ready_route_claimed_here",
    "source_truth_claimed",
    "external_upload_allowed",
  ];
  for (const key of closeoutFalseBoundaryKeys) {
    if (closeout?.boundary?.[key] !== false) blockers.push(`boundary_${key}_must_be_false`);
  }
  blockers.push(...findUnsafeOperationalRouteValues(closeout, "closeout"));
  return {
    schema_version: OPERATIONAL_ROUTE_CLOSEOUT_VALIDATION_SCHEMA_VERSION,
    kind: "operational_route_closeout_validation",
    status: blockers.length === 0 ? "pass" : "blocked",
    closeout_id: closeout?.closeout_id ?? null,
    blocker_count: blockers.length,
    blockers: [...new Set(blockers)].sort(),
    boundary: {
      metadata_only: closeout?.boundary?.metadata_only === true,
      raw_query_persisted: closeout?.boundary?.raw_query_persisted === true,
      answer_card_body_persisted: closeout?.boundary?.answer_card_body_persisted === true,
      sourcebound_ready_route_claimed_here: closeout?.boundary?.sourcebound_ready_route_claimed_here === true,
      public_canon_promotion_allowed: closeout?.boundary?.public_canon_promotion_allowed === true,
    },
  };
}

export function renderOperationalRouteCloseoutText(closeout) {
  const lines = [
    `Status: ${closeout.status}`,
    `Registry: ${closeout.registry_ref}`,
    `Operational status: ${closeout.status_snapshot?.operational_status ?? "unknown"}`,
    `Route count: ${closeout.status_snapshot?.route_count ?? 0}`,
    `Usage records: ${closeout.status_snapshot?.usage_record_count ?? 0}`,
    `Unmatched candidates: ${closeout.status_snapshot?.unmatched_candidate_count ?? 0}`,
    `Repeated-use ready routes: ${closeout.status_snapshot?.repeated_use_review_ready_route_count ?? 0}`,
  ];
  if (closeout.selected_route) {
    lines.push(
      `Route: ${closeout.selected_route.route_id}`,
      `Work card: ${closeout.selected_route.selected_work_card_id}`,
      `Work card ref: ${closeout.selected_route.selected_work_card_ref}`,
      `Operator answer card: ${closeout.selected_route.operator_answer_card_ref}`,
      `Wiki page: ${closeout.selected_route.wiki_page_ref}`,
      `Evidence pages: ${(closeout.selected_route.evidence_pages ?? []).join(", ")}`,
      `Claim ceiling: ${closeout.selected_route.claim_ceiling}`,
    );
  } else {
    lines.push("Route: (no matched route)");
  }
  if (closeout.route_usage) {
    lines.push(
      `Route usage count: ${closeout.route_usage.usage_count}`,
      `Repeated-use review threshold: ${closeout.route_usage.repeated_use_review_threshold}`,
      `Repeated-use review ready: ${closeout.route_usage.repeated_use_review_ready ? "yes" : "no"}`,
    );
  }
  lines.push(
    "Next actions:",
    ...(closeout.next_actions ?? []).map((action) => `- ${action}`),
    "",
    "Boundary: closeout is metadata only. It does not persist raw queries, answer shell output, answer-card bodies, source text, chunks, usage records, candidates, source truth, final answers, public canon, ontology acceptance, graph truth, or default routes.",
    "",
  );
  return lines.join("\n");
}

export async function renderOperationalRouteOperatorRun(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const healthRefInput = options.operatorHealthRef ?? options.healthRef ?? options.operationalRouteOperatorHealthRef;
  const healthRef = healthRefInput ? safeOperationalRouteOperatorHealthRef(healthRefInput) : null;
  const health = healthRef ? await loadOperationalRouteOperatorHealth({ repoRoot, healthRef }) : null;
  const healthValidation = health ? validateOperationalRouteOperatorHealth(health) : null;
  const plan = await buildOperationalRouteCallPlan(options);
  const sections = [];
  if (health) {
    sections.push(
      "Operator health gate:",
      `Health ref: ${healthRef}`,
      `Health status: ${health.status}`,
      `Health validation: ${healthValidation.status}`,
      `Health blockers: ${health.blockers?.length ?? healthValidation.blocker_count ?? 0}`,
      `Health registry match: ${health.registry_ref === plan.registry_ref ? "yes" : "no"}`,
    );
  } else {
    sections.push(
      "Operator health gate:",
      "Health ref: (not provided)",
      "Health status: not_checked",
      "Health validation: not_checked",
      "Health registry match: not_checked",
    );
  }
  sections.push(renderOperationalRouteCallPlanText(plan).trimEnd());
  if (options.recordUsage === true && !health) {
    sections.push(
      "Operator answer shell: skipped",
      "Reason: --record-usage requires a passing operator health ref for this route registry.",
      "Operational side effects:",
      "Usage record written: no",
      "Usage record ref: (none)",
      "Boundary: operator-run did not write usage records, candidate records, source truth, final answers, public canon, ontology acceptance, graph truth, default routes, raw queries, source text, chunks, or answer bodies.",
    );
    return `${sections.join("\n\n")}\n`;
  }
  if (
    health &&
    (
      healthValidation.status !== "pass" ||
      health.status !== "pass_private_manual_review_operator_health" ||
      health.registry_ref !== plan.registry_ref
    )
  ) {
    sections.push(
      "Operator answer shell: skipped",
      "Reason: operator health gate did not pass for this route registry.",
      "Boundary: operator-run did not write usage records, candidate records, source truth, final answers, public canon, ontology acceptance, graph truth, default routes, raw queries, source text, chunks, or answer bodies.",
    );
    return `${sections.join("\n\n")}\n`;
  }
  if (plan.status !== "ready_to_answer_manual_review") {
    sections.push(
      "Operator answer shell: skipped",
      "Reason: call plan is not ready for private/manual-review answer shell output.",
      "Boundary: operator-run did not write usage records, candidate records, source truth, final answers, public canon, ontology acceptance, graph truth, default routes, raw queries, source text, chunks, or answer bodies.",
    );
    return `${sections.join("\n\n")}\n`;
  }
  if (options.skipAnswerShell === true) {
    sections.push(
      "Operator answer shell: skipped",
      options.recordUsage === true
        ? "Reason: --skip-answer-shell cannot be combined with --record-usage because no answer was delivered by this command."
        : "Reason: --skip-answer-shell was requested for a health-gated no-answer probe.",
      "Operational side effects:",
      "Usage record written: no",
      "Usage record ref: (none)",
      "Boundary: operator-run verified the health-gated call plan without printing the answer shell. It did not write usage records, candidate records, source truth, final answers, public canon, ontology acceptance, graph truth, default routes, raw queries, source text, chunks, or answer bodies.",
    );
    return `${sections.join("\n\n")}\n`;
  }
  const answerShell = await renderOperationalRouteAnswerShell(options);
  let usageWrite = null;
  let usageValidation = null;
  let usageSummary = null;
  if (options.recordUsage === true) {
    if (!options.usageId) {
      throw new Error("--usage-id is required with --record-usage");
    }
    usageWrite = await writeOperationalRouteUsageRecord({
      ...options,
      usageId: options.usageId,
      outputRef: options.usageOutputRef,
    });
    const usageRecord = await loadOperationalRouteUsageRecord({
      repoRoot: options.repoRoot,
      recordRef: usageWrite.usage_record_ref,
    });
    usageValidation = validateOperationalRouteUsageRecord(usageRecord);
    usageSummary = await buildOperationalRouteUsageSummary({
      ...options,
      usageRootRef: usageRootRefFromUsageRecordRef(usageWrite.usage_record_ref),
    });
  }
  const usageSummaryRoute =
    usageWrite && usageSummary
      ? (usageSummary.routes ?? []).find((route) => route.route_id === usageWrite.route_id)
      : null;
  sections.push(
    "Operator answer shell (terminal-only):",
    answerShell.trimEnd(),
    "Operational side effects:",
    `Usage record written: ${usageWrite ? "yes" : "no"}`,
    ...(usageWrite
      ? [
          `Usage record ref: ${usageWrite.usage_record_ref}`,
          `Usage record status: ${usageWrite.record_status}`,
          `Usage raw query persisted: ${usageWrite.raw_query_persisted === true ? "yes" : "no"}`,
          `Usage record validation: ${usageValidation?.status ?? "not_checked"}`,
          `Route usage count after write: ${usageSummaryRoute?.usage_count ?? 0}`,
          `Repeated-use review threshold: ${usageSummaryRoute?.repeated_use_review_threshold ?? usageSummary?.counts?.repeated_use_review_threshold ?? "unknown"}`,
          `Repeated-use review ready: ${usageSummaryRoute?.repeated_use_review_ready === true ? "yes" : "no"}`,
        ]
      : ["Usage record ref: (none)"]),
    "Boundary: operator-run prints the selected private/manual-review answer shell to the terminal only. It writes a metadata-only usage record only when --record-usage and --usage-id are explicit; it never writes candidate records, source truth, final answers, public canon, ontology acceptance, graph truth, default routes, raw queries, source text, chunks, or answer bodies.",
  );
  return `${sections.join("\n\n")}\n`;
}

export function renderOperationalRouteResolutionText(resolution) {
  if (resolution.status !== "matched") {
    return [
      `Status: ${resolution.status}`,
      `Registry: ${resolution.registry_ref ?? "(none)"}`,
      "No operator route was selected. Use metadata navigation or sourcebound review instead of reading raw source text.",
      "",
    ].join("\n");
  }
  const route = resolution.selected_route;
  return [
    `Route: ${route.route_id}`,
    `Work card: ${route.selected_work_card_id}`,
    `Work card ref: ${route.selected_work_card_ref}`,
    `Operator answer card: ${route.operator_answer_card_ref}`,
    `Wiki page: ${route.wiki_page_ref}`,
    `Evidence pages: ${(route.evidence_pages ?? []).join(", ")}`,
    `Review context pages: ${(route.review_context_pages ?? []).join(", ")}`,
    `Claim ceiling: ${route.claim_ceiling}`,
    "Notice: private/manual-review route only; not source truth, public canon, ontology acceptance, or final answer authority.",
    "",
  ].join("\n");
}

export async function renderOperationalRouteAnswerShell(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const resolution = await resolveOperationalRoute(options);
  const header = renderOperationalRouteResolutionText(resolution).trimEnd();
  if (resolution.status !== "matched") {
    return `${header}\n`;
  }
  const answerCardRef = safeOperationalRouteRef(resolution.selected_route.operator_answer_card_ref);
  const answerCard = stripBom(await fs.readFile(path.join(repoRoot, answerCardRef), "utf8")).trimEnd();
  return [
    header,
    "",
    "--- Operator Answer Card ---",
    answerCard,
    "",
    "--- Boundary ---",
    "This shell reads a private operator answer card only. It does not read source text, chunks, NotebookLM answers, secrets, or grant stronger authority.",
    "",
  ].join("\n");
}

async function readUsageThreshold(options = {}) {
  try {
    const registry = await loadOperationalRouteRegistry(options);
    const threshold = Number.parseInt(String(registry.promotion_triggers?.usage_threshold_for_review ?? "3"), 10);
    return Number.isFinite(threshold) && threshold > 0 ? threshold : 3;
  } catch {
    return 3;
  }
}

async function loadOperationalRouteSmokeTests(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const smokeTestRef = safeOperationalRouteRef(options.smokeTestRef);
  const raw = await fs.readFile(path.join(repoRoot, smokeTestRef), "utf8");
  const tests = parseYaml(stripBom(raw));
  if (!tests || typeof tests !== "object" || Array.isArray(tests)) {
    throw new Error("operational route smoke tests must be a YAML mapping");
  }
  return tests;
}

function validateRefMap(value, trail) {
  const blockers = [];
  const refs = [];
  let checkedRefCount = 0;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { blockers, refs, checkedRefCount };
  }
  for (const [key, child] of Object.entries(value)) {
    if (key.endsWith("_ref")) {
      const safe = trySafeOperationalRouteRef(child);
      if (!safe.ok) {
        blockers.push(`${trail}.${key}_unsafe_ref`);
        continue;
      }
      checkedRefCount += 1;
      refs.push(safe.ref);
    }
  }
  return { blockers, refs, checkedRefCount };
}

function defaultUsageRecordOutputRef(record) {
  return normalizeRepoPath(path.join(DEFAULT_USAGE_RECORD_ROOT, record.usage_id, "usage_record.json"));
}

function defaultUsageSummaryOutputRef(summary) {
  return normalizeRepoPath(path.join(DEFAULT_USAGE_SUMMARY_ROOT, summary.summary_id, "usage_summary.json"));
}

function defaultCandidateRecordOutputRef(record) {
  return normalizeRepoPath(path.join(DEFAULT_CANDIDATE_RECORD_ROOT, record.candidate_id, "candidate_record.json"));
}

function defaultOperationalRouteStatusOutputRef(status) {
  return normalizeRepoPath(path.join(DEFAULT_OPERATIONAL_ROUTE_STATUS_ROOT, status.status_id, "status.json"));
}

function defaultOperationalRoutePreflightOutputRef(preflight) {
  return normalizeRepoPath(path.join(DEFAULT_OPERATIONAL_ROUTE_PREFLIGHT_ROOT, preflight.preflight_id, "preflight.json"));
}

function defaultOperationalRouteSessionOutputRef(session) {
  const outputId = `route_run_${stableHash(session.session_id).slice(0, 12)}`;
  return normalizeRepoPath(path.join(DEFAULT_OPERATIONAL_ROUTE_SESSION_ROOT, outputId, "route_run.json"));
}

function defaultOperationalRouteSessionSweepOutputRef(sweep) {
  return normalizeRepoPath(path.join(DEFAULT_OPERATIONAL_ROUTE_SESSION_SWEEP_ROOT, sweep.sweep_id, "route_sweep.json"));
}

function defaultOperationalRouteCallPlanOutputRef(plan) {
  return normalizeRepoPath(path.join(DEFAULT_OPERATIONAL_ROUTE_CALL_PLAN_ROOT, plan.plan_id, "call_plan.json"));
}

function defaultOperationalRouteOpsCheckOutputRef(check) {
  return normalizeRepoPath(path.join(DEFAULT_OPERATIONAL_ROUTE_OPS_CHECK_ROOT, check.ops_check_id, "ops_check.json"));
}

function defaultOperationalRouteReadinessOutputRef(readiness) {
  return normalizeRepoPath(path.join(DEFAULT_OPERATIONAL_ROUTE_READINESS_ROOT, readiness.readiness_id, "readiness.json"));
}

function defaultOperationalRouteEvidenceSweepOutputRef(sweep) {
  return normalizeRepoPath(path.join(DEFAULT_OPERATIONAL_ROUTE_EVIDENCE_SWEEP_ROOT, sweep.evidence_sweep_id, "evidence_sweep.json"));
}

function defaultOperationalRouteLatestEvidenceOutputRef(latest) {
  return normalizeRepoPath(path.join(DEFAULT_OPERATIONAL_ROUTE_LATEST_EVIDENCE_ROOT, latest.latest_evidence_id, "latest_evidence.json"));
}

function defaultOperationalRouteOperatorBriefOutputRef(brief) {
  return normalizeRepoPath(path.join(DEFAULT_OPERATIONAL_ROUTE_OPERATOR_BRIEF_ROOT, brief.brief_id, "operator_brief.json"));
}

function defaultOperationalRouteOperatorDocDriftOutputRef(drift) {
  return normalizeRepoPath(path.join(DEFAULT_OPERATIONAL_ROUTE_OPERATOR_DOC_DRIFT_ROOT, drift.drift_check_id, "doc_drift.json"));
}

function defaultOperationalRouteOperatorHealthOutputRef(health) {
  return normalizeRepoPath(path.join(DEFAULT_OPERATIONAL_ROUTE_OPERATOR_HEALTH_ROOT, health.health_id, "operator_health.json"));
}

function defaultOperationalRouteSuggestionSafetyOutputRef(safety) {
  return normalizeRepoPath(path.join(DEFAULT_OPERATIONAL_ROUTE_SUGGESTION_SAFETY_ROOT, safety.safety_id, "suggestion_safety.json"));
}

function safeUsageRecordOutputPath(value) {
  const ref = safeUsageRecordRef(value);
  if (
    !ref.startsWith(`${DEFAULT_USAGE_RECORD_ROOT}/`) &&
    !/^_workmeta\/[A-Za-z0-9][A-Za-z0-9_.-]{0,80}\/reports\/rag\/operational_route_usage\//.test(ref)
  ) {
    throw new Error("operational route usage record output must be under _workmeta/system/reports/rag/operational_route_usage/ or _workmeta/<project_code>/reports/rag/operational_route_usage/");
  }
  if (!ref.endsWith(".json")) throw new Error("operational route usage record output must be json");
  return ref;
}

function safeUsageRecordRef(value) {
  const ref = safeOperationalRouteRef(value);
  if (!ref.startsWith("_workmeta/")) {
    throw new Error("operational route usage record ref must be under _workmeta/");
  }
  return ref;
}

function usageRootRefFromUsageRecordRef(value) {
  const ref = safeUsageRecordRef(value);
  const parts = ref.split("/");
  const markerIndex = parts.lastIndexOf("operational_route_usage");
  if (markerIndex < 0) {
    throw new Error("operational route usage record ref must include operational_route_usage root");
  }
  return safeUsageRootRef(parts.slice(0, markerIndex + 1).join("/"));
}

function safeUsageSummaryOutputPath(value) {
  const ref = safeUsageSummaryRef(value);
  if (
    !ref.startsWith(`${DEFAULT_USAGE_SUMMARY_ROOT}/`) &&
    !/^_workmeta\/[A-Za-z0-9][A-Za-z0-9_.-]{0,80}\/reports\/rag\/operational_route_usage_summary\//.test(ref)
  ) {
    throw new Error("operational route usage summary output must be under _workmeta/system/reports/rag/operational_route_usage_summary/ or _workmeta/<project_code>/reports/rag/operational_route_usage_summary/");
  }
  if (!ref.endsWith(".json")) throw new Error("operational route usage summary output must be json");
  return ref;
}

function safeUsageSummaryRef(value) {
  const ref = safeOperationalRouteRef(value);
  if (!ref.startsWith("_workmeta/")) {
    throw new Error("operational route usage summary ref must be under _workmeta/");
  }
  return ref;
}

function safeCandidateRecordOutputPath(value) {
  const ref = safeCandidateRecordRef(value);
  if (
    !ref.startsWith(`${DEFAULT_CANDIDATE_RECORD_ROOT}/`) &&
    !/^_workmeta\/[A-Za-z0-9][A-Za-z0-9_.-]{0,80}\/reports\/rag\/operational_route_candidates\//.test(ref)
  ) {
    throw new Error("operational route candidate record output must be under _workmeta/system/reports/rag/operational_route_candidates/ or _workmeta/<project_code>/reports/rag/operational_route_candidates/");
  }
  if (!ref.endsWith(".json")) throw new Error("operational route candidate record output must be json");
  return ref;
}

function safeCandidateRecordRef(value) {
  const ref = safeOperationalRouteRef(value);
  if (!ref.startsWith("_workmeta/")) {
    throw new Error("operational route candidate record ref must be under _workmeta/");
  }
  return ref;
}

function safeOperationalRouteStatusOutputPath(value) {
  const ref = safeOperationalRouteStatusRef(value);
  if (
    !ref.startsWith(`${DEFAULT_OPERATIONAL_ROUTE_STATUS_ROOT}/`) &&
    !/^_workmeta\/[A-Za-z0-9][A-Za-z0-9_.-]{0,80}\/reports\/rag\/operational_route_status\//.test(ref)
  ) {
    throw new Error("operational route status output must be under _workmeta/system/reports/rag/operational_route_status/ or _workmeta/<project_code>/reports/rag/operational_route_status/");
  }
  if (!ref.endsWith(".json")) throw new Error("operational route status output must be json");
  return ref;
}

function safeOperationalRouteStatusRef(value) {
  const ref = safeOperationalRouteRef(value);
  if (!ref.startsWith("_workmeta/")) {
    throw new Error("operational route status ref must be under _workmeta/");
  }
  return ref;
}

function safeOperationalRoutePreflightOutputPath(value) {
  const ref = safeOperationalRoutePreflightRef(value);
  if (
    !ref.startsWith(`${DEFAULT_OPERATIONAL_ROUTE_PREFLIGHT_ROOT}/`) &&
    !/^_workmeta\/[A-Za-z0-9][A-Za-z0-9_.-]{0,80}\/reports\/rag\/operational_route_preflight\//.test(ref)
  ) {
    throw new Error("operational route preflight output must be under _workmeta/system/reports/rag/operational_route_preflight/ or _workmeta/<project_code>/reports/rag/operational_route_preflight/");
  }
  if (!ref.endsWith(".json")) throw new Error("operational route preflight output must be json");
  return ref;
}

function safeOperationalRoutePreflightRef(value) {
  const ref = safeOperationalRouteRef(value);
  if (!ref.startsWith("_workmeta/")) {
    throw new Error("operational route preflight ref must be under _workmeta/");
  }
  return ref;
}

function safeOperationalRouteSessionOutputPath(value) {
  const ref = safeOperationalRouteSessionRef(value);
  if (
    !ref.startsWith(`${DEFAULT_OPERATIONAL_ROUTE_SESSION_ROOT}/`) &&
    !/^_workmeta\/[A-Za-z0-9][A-Za-z0-9_.-]{0,80}\/reports\/rag\/operational_route_runs\//.test(ref)
  ) {
    throw new Error("operational route session output must be under _workmeta/system/reports/rag/operational_route_runs/ or _workmeta/<project_code>/reports/rag/operational_route_runs/");
  }
  if (!ref.endsWith(".json")) throw new Error("operational route session output must be json");
  return ref;
}

function safeOperationalRouteSessionRef(value) {
  const ref = safeOperationalRouteRef(value);
  if (!ref.startsWith("_workmeta/")) {
    throw new Error("operational route session ref must be under _workmeta/");
  }
  return ref;
}

function safeOperationalRouteSessionSweepOutputPath(value) {
  const ref = safeOperationalRouteSessionSweepRef(value);
  if (
    !ref.startsWith(`${DEFAULT_OPERATIONAL_ROUTE_SESSION_SWEEP_ROOT}/`) &&
    !/^_workmeta\/[A-Za-z0-9][A-Za-z0-9_.-]{0,80}\/reports\/rag\/operational_route_sweeps\//.test(ref)
  ) {
    throw new Error("operational route session sweep output must be under _workmeta/system/reports/rag/operational_route_sweeps/ or _workmeta/<project_code>/reports/rag/operational_route_sweeps/");
  }
  if (!ref.endsWith(".json")) throw new Error("operational route session sweep output must be json");
  return ref;
}

function safeOperationalRouteSessionSweepRef(value) {
  const ref = safeOperationalRouteRef(value);
  if (!ref.startsWith("_workmeta/")) {
    throw new Error("operational route session sweep ref must be under _workmeta/");
  }
  return ref;
}

function safeOperationalRouteCallPlanOutputPath(value) {
  const ref = safeOperationalRouteCallPlanRef(value);
  if (
    !ref.startsWith(`${DEFAULT_OPERATIONAL_ROUTE_CALL_PLAN_ROOT}/`) &&
    !/^_workmeta\/[A-Za-z0-9][A-Za-z0-9_.-]{0,80}\/reports\/rag\/operational_route_call_plans\//.test(ref)
  ) {
    throw new Error("operational route call-plan output must be under _workmeta/system/reports/rag/operational_route_call_plans/ or _workmeta/<project_code>/reports/rag/operational_route_call_plans/");
  }
  if (!ref.endsWith(".json")) throw new Error("operational route call-plan output must be json");
  return ref;
}

function safeOperationalRouteCallPlanRef(value) {
  const ref = safeOperationalRouteRef(value);
  if (!ref.startsWith("_workmeta/")) {
    throw new Error("operational route call-plan ref must be under _workmeta/");
  }
  return ref;
}

function safeOperationalRouteOpsCheckOutputPath(value) {
  const ref = safeOperationalRouteOpsCheckRef(value);
  if (
    !ref.startsWith(`${DEFAULT_OPERATIONAL_ROUTE_OPS_CHECK_ROOT}/`) &&
    !/^_workmeta\/[A-Za-z0-9][A-Za-z0-9_.-]{0,80}\/reports\/rag\/operational_route_ops_check\//.test(ref)
  ) {
    throw new Error("operational route ops-check output must be under _workmeta/system/reports/rag/operational_route_ops_check/ or _workmeta/<project_code>/reports/rag/operational_route_ops_check/");
  }
  if (!ref.endsWith(".json")) throw new Error("operational route ops-check output must be json");
  return ref;
}

function safeOperationalRouteOpsCheckRef(value) {
  const ref = safeOperationalRouteRef(value);
  if (!ref.startsWith("_workmeta/")) {
    throw new Error("operational route ops-check ref must be under _workmeta/");
  }
  return ref;
}

function safeOperationalRouteReadinessOutputPath(value) {
  const ref = safeOperationalRouteReadinessRef(value);
  if (
    !ref.startsWith(`${DEFAULT_OPERATIONAL_ROUTE_READINESS_ROOT}/`) &&
    !/^_workmeta\/[A-Za-z0-9][A-Za-z0-9_.-]{0,80}\/reports\/rag\/operational_route_readiness\//.test(ref)
  ) {
    throw new Error("operational route readiness output must be under _workmeta/system/reports/rag/operational_route_readiness/ or _workmeta/<project_code>/reports/rag/operational_route_readiness/");
  }
  if (!ref.endsWith(".json")) throw new Error("operational route readiness output must be json");
  return ref;
}

function safeOperationalRouteReadinessRef(value) {
  const ref = safeOperationalRouteRef(value);
  if (!ref.startsWith("_workmeta/")) {
    throw new Error("operational route readiness ref must be under _workmeta/");
  }
  return ref;
}

function safeOperationalRouteEvidenceSweepOutputPath(value) {
  const ref = safeOperationalRouteEvidenceSweepRef(value);
  if (
    !ref.startsWith(`${DEFAULT_OPERATIONAL_ROUTE_EVIDENCE_SWEEP_ROOT}/`) &&
    !/^_workmeta\/[A-Za-z0-9][A-Za-z0-9_.-]{0,80}\/reports\/rag\/operational_route_evidence_sweeps\//.test(ref)
  ) {
    throw new Error("operational route evidence sweep output must be under _workmeta/system/reports/rag/operational_route_evidence_sweeps/ or _workmeta/<project_code>/reports/rag/operational_route_evidence_sweeps/");
  }
  if (!ref.endsWith(".json")) throw new Error("operational route evidence sweep output must be json");
  return ref;
}

function safeOperationalRouteEvidenceSweepRef(value) {
  const ref = safeOperationalRouteRef(value);
  if (!ref.startsWith("_workmeta/")) {
    throw new Error("operational route evidence sweep ref must be under _workmeta/");
  }
  return ref;
}

function safeOperationalRouteLatestEvidenceOutputPath(value) {
  const ref = safeOperationalRouteLatestEvidenceRef(value);
  if (
    !ref.startsWith(`${DEFAULT_OPERATIONAL_ROUTE_LATEST_EVIDENCE_ROOT}/`) &&
    !/^_workmeta\/[A-Za-z0-9][A-Za-z0-9_.-]{0,80}\/reports\/rag\/operational_route_latest_evidence\//.test(ref)
  ) {
    throw new Error("operational route latest evidence output must be under _workmeta/system/reports/rag/operational_route_latest_evidence/ or _workmeta/<project_code>/reports/rag/operational_route_latest_evidence/");
  }
  if (!ref.endsWith(".json")) throw new Error("operational route latest evidence output must be json");
  return ref;
}

function safeOperationalRouteLatestEvidenceRef(value) {
  const ref = safeOperationalRouteRef(value);
  if (!ref.startsWith("_workmeta/")) {
    throw new Error("operational route latest evidence ref must be under _workmeta/");
  }
  return ref;
}

function safeOperationalRouteOperatorBriefOutputPath(value) {
  const ref = safeOperationalRouteOperatorBriefRef(value);
  if (
    !ref.startsWith(`${DEFAULT_OPERATIONAL_ROUTE_OPERATOR_BRIEF_ROOT}/`) &&
    !/^_workmeta\/[A-Za-z0-9][A-Za-z0-9_.-]{0,80}\/reports\/rag\/operational_route_operator_briefs\//.test(ref)
  ) {
    throw new Error("operational route operator brief output must be under _workmeta/system/reports/rag/operational_route_operator_briefs/ or _workmeta/<project_code>/reports/rag/operational_route_operator_briefs/");
  }
  if (!ref.endsWith(".json")) throw new Error("operational route operator brief output must be json");
  return ref;
}

function safeOperationalRouteOperatorBriefRef(value) {
  const ref = safeOperationalRouteRef(value);
  if (!ref.startsWith("_workmeta/")) {
    throw new Error("operational route operator brief ref must be under _workmeta/");
  }
  return ref;
}

function safeOperationalRouteOperatorDocDriftOutputPath(value) {
  const ref = safeOperationalRouteOperatorDocDriftRef(value);
  if (
    !ref.startsWith(`${DEFAULT_OPERATIONAL_ROUTE_OPERATOR_DOC_DRIFT_ROOT}/`) &&
    !/^_workmeta\/[A-Za-z0-9][A-Za-z0-9_.-]{0,80}\/reports\/rag\/operational_route_doc_drift\//.test(ref)
  ) {
    throw new Error("operational route operator doc-drift output must be under _workmeta/system/reports/rag/operational_route_doc_drift/ or _workmeta/<project_code>/reports/rag/operational_route_doc_drift/");
  }
  if (!ref.endsWith(".json")) throw new Error("operational route operator doc-drift output must be json");
  return ref;
}

function safeOperationalRouteOperatorDocDriftRef(value) {
  const ref = safeOperationalRouteRef(value);
  if (!ref.startsWith("_workmeta/")) {
    throw new Error("operational route operator doc-drift ref must be under _workmeta/");
  }
  return ref;
}

function safeOperationalRouteOperatorHealthOutputPath(value) {
  const ref = safeOperationalRouteOperatorHealthRef(value);
  if (
    !ref.startsWith(`${DEFAULT_OPERATIONAL_ROUTE_OPERATOR_HEALTH_ROOT}/`) &&
    !/^_workmeta\/[A-Za-z0-9][A-Za-z0-9_.-]{0,80}\/reports\/rag\/operational_route_operator_health\//.test(ref)
  ) {
    throw new Error("operational route operator health output must be under _workmeta/system/reports/rag/operational_route_operator_health/ or _workmeta/<project_code>/reports/rag/operational_route_operator_health/");
  }
  if (!ref.endsWith(".json")) throw new Error("operational route operator health output must be json");
  return ref;
}

function safeOperationalRouteOperatorHealthRef(value) {
  const ref = safeOperationalRouteRef(value);
  if (!ref.startsWith("_workmeta/")) {
    throw new Error("operational route operator health ref must be under _workmeta/");
  }
  return ref;
}

function safeOperationalRouteSuggestionSafetyOutputPath(value) {
  const ref = safeOperationalRouteSuggestionSafetyRef(value);
  if (
    !ref.startsWith(`${DEFAULT_OPERATIONAL_ROUTE_SUGGESTION_SAFETY_ROOT}/`) &&
    !/^_workmeta\/[A-Za-z0-9][A-Za-z0-9_.-]{0,80}\/reports\/rag\/operational_route_suggestion_safety\//.test(ref)
  ) {
    throw new Error("operational route suggestion safety output must be under _workmeta/system/reports/rag/operational_route_suggestion_safety/ or _workmeta/<project_code>/reports/rag/operational_route_suggestion_safety/");
  }
  if (!ref.endsWith(".json")) throw new Error("operational route suggestion safety output must be json");
  return ref;
}

function safeOperationalRouteSuggestionSafetyRef(value) {
  const ref = safeOperationalRouteRef(value);
  if (!ref.startsWith("_workmeta/")) {
    throw new Error("operational route suggestion safety ref must be under _workmeta/");
  }
  return ref;
}

function safeUsageRootRef(value, options = {}) {
  try {
    const ref = safeOperationalRouteRef(value);
    const ok =
      ref === DEFAULT_USAGE_RECORD_ROOT ||
      /^_workmeta\/[A-Za-z0-9][A-Za-z0-9_.-]{0,80}\/reports\/rag\/operational_route_usage$/.test(ref);
    if (!ok) throw new Error("usage root must be an operational_route_usage report root");
    return ref;
  } catch (error) {
    if (options.throwOnError === false) return null;
    throw error;
  }
}

function safeCandidateRootRef(value, options = {}) {
  try {
    const ref = safeOperationalRouteRef(value);
    const ok =
      ref === DEFAULT_CANDIDATE_RECORD_ROOT ||
      /^_workmeta\/[A-Za-z0-9][A-Za-z0-9_.-]{0,80}\/reports\/rag\/operational_route_candidates$/.test(ref);
    if (!ok) throw new Error("candidate root must be an operational_route_candidates report root");
    return ref;
  } catch (error) {
    if (options.throwOnError === false) return null;
    throw error;
  }
}

async function collectUsageRecordRefs(options = {}) {
  const absoluteRoot = path.join(options.repoRoot, options.usageRootRef);
  if (!(await pathExists(absoluteRoot))) return [];
  const results = [];
  await collectUsageRecordRefsFromDir({ repoRoot: options.repoRoot, currentDir: absoluteRoot, results });
  return results.sort();
}

async function collectUsageRecordRefsFromDir({ repoRoot, currentDir, results }) {
  const entries = await fs.readdir(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    const absolute = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      await collectUsageRecordRefsFromDir({ repoRoot, currentDir: absolute, results });
      continue;
    }
    if (entry.isFile() && entry.name === "usage_record.json") {
      results.push(normalizeRepoPath(path.relative(repoRoot, absolute)));
    }
  }
}

async function findLatestOperationalRouteEvidenceEntry(options = {}) {
  const refs = await collectOperationalRouteArtifactRefs({
    repoRoot: options.repoRoot,
    rootRef: options.root_ref,
    fileName: options.file_name,
  });
  const candidates = [];
  for (const ref of refs) {
    try {
      const artifact = await options.load(ref);
      const matchesRegistry = options.matchesRegistry
        ? await options.matchesRegistry(artifact)
        : operationalRouteArtifactMatchesRegistry({ artifact, registryRef: options.registryRef });
      if (!matchesRegistry) continue;
      const validation = options.validate(artifact);
      const stat = await fs.stat(path.join(options.repoRoot, ref));
      candidates.push({
        ref,
        artifact,
        validation,
        timestampMs: operationalRouteArtifactTimestampMs(artifact, stat),
      });
    } catch {
      // Unreadable artifacts cannot be safely matched to a registry without
      // overclaiming, so the latest index ignores them.
    }
  }
  candidates.sort((left, right) => {
    if (right.timestampMs !== left.timestampMs) return right.timestampMs - left.timestampMs;
    return right.ref.localeCompare(left.ref);
  });
  const latest = candidates[0];
  if (!latest) return null;
  return {
    evidence_type: options.evidence_type,
    evidence_ref: latest.ref,
    artifact_id: latest.artifact?.[options.idKey] ?? null,
    artifact_status: latest.artifact?.status ?? null,
    generated_at_utc: latest.artifact?.generated_at_utc ?? null,
    validation_status: latest.validation.status,
    blocker_count: latest.validation.blocker_count ?? 0,
    counts: latest.validation.counts ?? latest.artifact?.counts ?? null,
  };
}

async function collectOperationalRouteArtifactRefs({ repoRoot, rootRef, fileName }) {
  const root = safeOperationalRouteRef(rootRef);
  if (!root.startsWith("_workmeta/")) throw new Error("operational route artifact root must be under _workmeta/");
  const absoluteRoot = path.join(repoRoot, root);
  if (!(await pathExists(absoluteRoot))) return [];
  const results = [];
  await collectOperationalRouteArtifactRefsFromDir({ repoRoot, currentDir: absoluteRoot, fileName, results });
  return results.sort();
}

async function collectOperationalRouteArtifactRefsFromDir({ repoRoot, currentDir, fileName, results }) {
  const entries = await fs.readdir(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    const absolute = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      await collectOperationalRouteArtifactRefsFromDir({ repoRoot, currentDir: absolute, fileName, results });
      continue;
    }
    if (entry.isFile() && entry.name === fileName) {
      results.push(normalizeRepoPath(path.relative(repoRoot, absolute)));
    }
  }
}

function operationalRouteArtifactMatchesRegistry({ artifact, registryRef }) {
  return artifact?.registry_ref === registryRef || artifact?.ready_refs?.route_registry_ref === registryRef;
}

async function operationalRouteEvidenceSweepMatchesRegistry({ repoRoot, artifact, registryRef }) {
  for (const entry of artifact?.evidence ?? []) {
    const ref = entry?.evidence_ref;
    if (!ref) continue;
    try {
      const evidenceArtifact = await loadOperationalRouteEvidenceArtifactByType({
        repoRoot,
        evidenceType: entry.evidence_type,
        ref,
      });
      if (operationalRouteArtifactMatchesRegistry({ artifact: evidenceArtifact, registryRef })) return true;
    } catch {
      // Keep scanning other refs; a single unreadable entry is not enough to
      // bind this sweep to the registry.
    }
  }
  return false;
}

async function loadOperationalRouteEvidenceArtifactByType({ repoRoot, evidenceType, ref }) {
  if (evidenceType === "preflight") return loadOperationalRoutePreflight({ repoRoot, preflightRef: ref });
  if (evidenceType === "ops_check") return loadOperationalRouteOpsCheck({ repoRoot, opsCheckRef: ref });
  if (evidenceType === "session_sweep") return loadOperationalRouteSessionSweep({ repoRoot, sweepRef: ref });
  if (evidenceType === "readiness") return loadOperationalRouteReadiness({ repoRoot, readinessRef: ref });
  if (evidenceType === "status") return loadOperationalRouteStatus({ repoRoot, statusRef: ref });
  if (evidenceType === "usage_summary") return loadOperationalRouteUsageSummary({ repoRoot, summaryRef: ref });
  if (evidenceType === "usage_record") return loadOperationalRouteUsageRecord({ repoRoot, recordRef: ref });
  if (evidenceType === "candidate_record") return loadOperationalRouteCandidateRecord({ repoRoot, recordRef: ref });
  throw new Error("unsupported operational route evidence type");
}

function operationalRouteArtifactTimestampMs(artifact, stat) {
  const parsed = Date.parse(artifact?.generated_at_utc ?? artifact?.created_at ?? "");
  if (Number.isFinite(parsed)) return parsed;
  return stat?.mtimeMs ?? 0;
}

function operationalRouteLatestEvidenceRefByType(latest, evidenceType) {
  return latest?.latest_evidence?.find((entry) => entry.evidence_type === evidenceType)?.evidence_ref ?? null;
}

function operationalRouteLatestEvidenceRefMap(latest) {
  return {
    preflight_ref: operationalRouteLatestEvidenceRefByType(latest, "preflight"),
    ops_check_ref: operationalRouteLatestEvidenceRefByType(latest, "ops_check"),
    suggestion_safety_ref: operationalRouteLatestEvidenceRefByType(latest, "suggestion_safety"),
    session_sweep_ref: operationalRouteLatestEvidenceRefByType(latest, "session_sweep"),
    readiness_ref: operationalRouteLatestEvidenceRefByType(latest, "readiness"),
    status_ref: operationalRouteLatestEvidenceRefByType(latest, "status"),
    usage_summary_ref: operationalRouteLatestEvidenceRefByType(latest, "usage_summary"),
    evidence_sweep_ref: operationalRouteLatestEvidenceRefByType(latest, "evidence_sweep"),
  };
}

async function buildCandidateSummary(options = {}) {
  const candidateRecordRefs = await collectCandidateRecordRefs(options);
  const candidates = [];
  const invalidCandidateRecordRefs = [];
  for (const recordRef of candidateRecordRefs) {
    try {
      const record = await loadOperationalRouteCandidateRecord({ repoRoot: options.repoRoot, recordRef });
      const validation = validateOperationalRouteCandidateRecord(record);
      if (validation.status !== "pass") {
        invalidCandidateRecordRefs.push(recordRef);
        continue;
      }
      if (record.registry_ref === options.registryRef) {
        candidates.push({
          candidate_record_ref: recordRef,
          candidate_id: record.candidate_id,
          status: record.status,
          resolution_status: record.resolution_status,
          matched_route_id: record.matched_route_id ?? null,
          owner_review_required: record.candidate_signal?.owner_review_required === true,
          candidate_count_increment: record.candidate_signal?.candidate_count_increment ?? 0,
          raw_query_persisted: record.raw_query_persisted === true,
        });
      }
    } catch {
      invalidCandidateRecordRefs.push(recordRef);
    }
  }
  const unmatchedCandidateCount = candidates.filter(
    (candidate) => candidate.status === "recorded_unmatched_route_candidate",
  ).length;
  return {
    kind: "operational_route_candidate_summary",
    registry_ref: options.registryRef,
    candidate_root_ref: options.candidateRootRef,
    counts: {
      candidate_record_count: candidates.length,
      unmatched_candidate_count: unmatchedCandidateCount,
      existing_route_or_invalid_registry_count: candidates.length - unmatchedCandidateCount,
      invalid_candidate_record_count: invalidCandidateRecordRefs.length,
    },
    candidates: candidates.sort((left, right) => left.candidate_record_ref.localeCompare(right.candidate_record_ref)),
    invalid_candidate_record_refs: invalidCandidateRecordRefs.sort(),
  };
}

async function collectCandidateRecordRefs(options = {}) {
  const absoluteRoot = path.join(options.repoRoot, options.candidateRootRef);
  if (!(await pathExists(absoluteRoot))) return [];
  const results = [];
  await collectCandidateRecordRefsFromDir({ repoRoot: options.repoRoot, currentDir: absoluteRoot, results });
  return results.sort();
}

async function collectCandidateRecordRefsFromDir({ repoRoot, currentDir, results }) {
  const entries = await fs.readdir(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    const absolute = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      await collectCandidateRecordRefsFromDir({ repoRoot, currentDir: absolute, results });
      continue;
    }
    if (entry.isFile() && entry.name === "candidate_record.json") {
      results.push(normalizeRepoPath(path.relative(repoRoot, absolute)));
    }
  }
}

function computeOperationalRouteStatus({ registryValidationStatus, readyRouteCount, unmatchedCandidateCount }) {
  if (registryValidationStatus !== "pass") return "blocked_registry_invalid";
  if (readyRouteCount > 0) return "sourcebound_review_ready_routes_present";
  if (unmatchedCandidateCount > 0) return "candidate_review_required";
  return "private_manual_review_ready_below_repeated_use_threshold";
}

function operationalRouteStatusNextActions({ overallStatus, readyRouteCount, unmatchedCandidateCount }) {
  if (overallStatus === "blocked_registry_invalid") return ["fix_route_registry_validation_blockers"];
  if (overallStatus === "sourcebound_review_ready_routes_present") {
    return [
      `route_${readyRouteCount}_ready_routes_to_sourcebound_review`,
      "keep_recording_metadata_only_usage_without_raw_queries",
    ];
  }
  if (overallStatus === "candidate_review_required") {
    return [
      `review_${unmatchedCandidateCount}_unmatched_route_candidates_without_raw_queries`,
      "update_route_registry_only_after_owner_policy_or_sourcebound_review_passes",
    ];
  }
  return ["continue_private_manual_review_use", "record_metadata_only_usage_until_repeated_use_threshold"];
}

function operationalRoutePreflightNextActions({ blocked, operationalStatus, smokeRun }) {
  if (blocked) return ["fix_preflight_blockers_before_operator_use"];
  const actions = ["private_manual_review_operator_use_allowed"];
  if (smokeRun) actions.push("smoke_tests_passed_for_current_route_set");
  for (const action of operationalStatus.next_actions ?? []) {
    if (!actions.includes(action)) actions.push(action);
  }
  return actions;
}

function operationalRouteEvidenceSweepNextActions(status) {
  if (status === "blocked_no_evidence_refs") return ["provide_stored_evidence_refs_to_sweep"];
  if (status === "blocked_evidence_validation" || status === "blocked_unsafe_evidence_sweep") {
    return ["inspect_blocked_evidence_refs_before_operator_use"];
  }
  if (status === "ready_private_manual_review_below_repeated_use_threshold") {
    return [
      "continue_private_manual_review_use",
      "record_usage_only_after_real_operator_answer",
      "do_not_launch_sourcebound_review_until_repeated_use_threshold_or_owner_request",
    ];
  }
  return [
    "use_evidence_sweep_as_metadata_only_closure_check",
    "do_not_treat_evidence_sweep_as_source_truth_or_final_answer_authority",
  ];
}

function operationalRouteLatestEvidenceNextActions(status) {
  if (status === "blocked_missing_latest_evidence") {
    return [
      "write_or_reopen_missing_metadata_only_evidence_refs",
      "run_operational_route_ops_check_readiness_and_evidence_sweep_before_operator_use",
    ];
  }
  if (status === "blocked_latest_evidence_validation" || status === "blocked_unsafe_latest_evidence") {
    return ["inspect_blocked_latest_evidence_refs_before_operator_use"];
  }
  if (status === "ready_private_manual_review_below_repeated_use_threshold") {
    return [
      "use_latest_refs_for_private_manual_review_operation",
      "record_usage_only_after_real_operator_answer",
      "do_not_launch_sourcebound_review_until_repeated_use_threshold_or_owner_request",
    ];
  }
  return [
    "use_latest_evidence_as_operator_ref_index",
    "do_not_treat_latest_evidence_as_source_truth_or_final_answer_authority",
  ];
}

function operationalRouteOperatorBriefNextActions(status) {
  if (status === "ready_private_manual_review_below_repeated_use_threshold") {
    return [
      "use_operator_brief_for_next_private_manual_review_answer",
      "record_usage_only_after_real_operator_answer",
      "run_closeout_after_answer",
      "keep_sourcebound_review_on_hold_until_threshold_or_owner_request",
    ];
  }
  if (String(status ?? "").startsWith("blocked")) {
    return ["fix_latest_evidence_or_operator_brief_blockers_before_operator_use"];
  }
  return [
    "use_operator_brief_as_metadata_only_run_surface",
    "do_not_treat_operator_brief_as_source_truth_or_final_answer_authority",
  ];
}

function operationalRouteOperatorHealthNextActions(passed) {
  if (passed) {
    return [
      "operator_route_can_be_used_for_private_manual_review_answering",
      "record_usage_only_after_real_operator_answer",
      "rerun_operator_doc_drift_after_operator_docs_change",
      "keep_sourcebound_review_on_hold_until_threshold_or_owner_request",
    ];
  }
  return [
    "fix_latest_evidence_operator_brief_or_doc_drift_blockers_before_operator_use",
    "do_not_treat_operator_health_as_source_truth_or_final_answer_authority",
  ];
}

function defaultOperationalRouteOperatorDocRefs(registryRef) {
  const base = path.posix.dirname(safeOperationalRouteRef(registryRef));
  return [
    `${base}/operator_runbook.md`,
    `${base}/operator_status_digest.md`,
    `${base}/operator_closeout_map.md`,
  ];
}

function normalizeOperatorDocRefs(value) {
  const refs = Array.isArray(value) ? value : String(value ?? "").split(",");
  return refs.map((entry) => safeOperationalRouteRef(String(entry).trim())).filter(Boolean);
}

function extractOperationalRouteEvidenceRefsFromText(text) {
  const refs = new Set();
  const pattern =
    /_workmeta\/system\/reports\/rag\/operational_route_(?:ops_check|suggestion_safety|readiness|evidence_sweeps|latest_evidence|operator_briefs)\/[A-Za-z0-9_.:-]+\/[A-Za-z0-9_.:-]+\.json/gu;
  for (const match of String(text ?? "").matchAll(pattern)) {
    refs.add(match[0]);
  }
  return [...refs].sort();
}

function operationalRouteDashboardNextActions(status) {
  if (status === "blocked") return ["fix_dashboard_preflight_or_catalog_blockers_before_operator_use"];
  if (status === "candidate_review_required") {
    return [
      "review_unmatched_candidates_without_raw_queries",
      "continue_existing_private_manual_review_routes_only",
    ];
  }
  if (status === "sourcebound_review_ready") {
    return [
      "route_repeated_use_items_to_sourcebound_review",
      "do_not_promote_source_truth_or_public_canon_from_dashboard",
    ];
  }
  return [
    "choose_route_from_catalog",
    "run_operational_route_session_for_a_transient_question",
    "print_answer_shell_for_terminal_use",
    "record_operator_run_usage_only_after_real_answer_and_passing_health",
  ];
}

function analyzeOperationalRouteSuggestedCommands(options = {}) {
  const commands = Array.isArray(options.commands) ? options.commands : [];
  const directUsageWrite = [];
  const directCandidateWrite = [];
  const directCallPlanWrite = [];
  const unsafeCandidateWrite = [];
  const unsafeCallPlanWrite = [];
  const directAnswerShell = [];
  const recordUsageWithoutHealth = [];
  const recordUsageOutsideOperatorRun = [];
  const blockers = [];
  for (const command of commands) {
    const text = typeof command === "string"
      ? command
      : String(command?.command_line ?? "");
    const writeCondition = typeof command === "string" ? null : command?.write_condition ?? null;
    const hasDirectUsageWrite = /\boperational-route-usage-record\b/u.test(text) && /\s--write(?:\s|$)/u.test(text);
    const hasDirectCandidateWrite = /\boperational-route-candidate-record\b/u.test(text) && /\s--write(?:\s|$)/u.test(text);
    const hasDirectCallPlanWrite = /\boperational-route-call-plan\b/u.test(text) && /\s--write(?:\s|$)/u.test(text);
    const hasDirectAnswerShell = /\boperational-route-answer-shell\b/u.test(text);
    const hasRecordUsage = /\s--record-usage(?:\s|$)/u.test(text);
    const hasOperatorRun = /\boperational-route-operator-run\b/u.test(text);
    const hasHealthRef = /\s--(?:operational-route-operator-health-ref|operator-health-ref|health-ref)(?:\s|=)/u.test(text);
    const allowedCandidateWrite = hasDirectCandidateWrite && writeCondition === "real_unmatched_operator_question_only";
    const allowedCallPlanWrite = hasDirectCallPlanWrite && writeCondition === "real_operator_question_only";
    if (hasDirectUsageWrite) directUsageWrite.push(text);
    if (hasDirectCandidateWrite) directCandidateWrite.push(text);
    if (hasDirectCallPlanWrite) directCallPlanWrite.push(text);
    if (hasDirectCandidateWrite && !allowedCandidateWrite) unsafeCandidateWrite.push(text);
    if (hasDirectCallPlanWrite && !allowedCallPlanWrite) unsafeCallPlanWrite.push(text);
    if (hasDirectAnswerShell) directAnswerShell.push(text);
    if (hasRecordUsage && !hasHealthRef) recordUsageWithoutHealth.push(text);
    if (hasRecordUsage && !hasOperatorRun) recordUsageOutsideOperatorRun.push(text);
  }
  if (directUsageWrite.length > 0) blockers.push(`${options.surface}_suggests_direct_usage_record_write`);
  if (unsafeCandidateWrite.length > 0) blockers.push(`${options.surface}_suggests_unsafe_candidate_record_write`);
  if (unsafeCallPlanWrite.length > 0) blockers.push(`${options.surface}_suggests_unsafe_call_plan_write`);
  if (directAnswerShell.length > 0) blockers.push(`${options.surface}_suggests_direct_answer_shell`);
  if (recordUsageWithoutHealth.length > 0) blockers.push(`${options.surface}_record_usage_without_health_ref`);
  if (recordUsageOutsideOperatorRun.length > 0) blockers.push(`${options.surface}_record_usage_outside_operator_run`);
  return {
    surface: String(options.surface ?? "unknown"),
    sample_id: String(options.sample_id ?? "unknown"),
    status: String(options.status ?? "unknown"),
    route_id: options.route_id ?? null,
    counts: {
      command_count: commands.length,
      direct_usage_record_write_suggestion_count: directUsageWrite.length,
      direct_candidate_record_write_suggestion_count: directCandidateWrite.length,
      direct_call_plan_write_suggestion_count: directCallPlanWrite.length,
      unsafe_candidate_record_write_suggestion_count: unsafeCandidateWrite.length,
      unsafe_call_plan_write_suggestion_count: unsafeCallPlanWrite.length,
      direct_answer_shell_suggestion_count: directAnswerShell.length,
      record_usage_without_health_ref_count: recordUsageWithoutHealth.length,
      record_usage_outside_operator_run_count: recordUsageOutsideOperatorRun.length,
      blocker_count: blockers.length,
    },
    blockers,
  };
}

function operationalRouteSessionSuggestedCommands({ registryRef, smokeTestRef, matched }) {
  const commands = [
    `npm.cmd run guild-hall:rag -- operational-route-preflight --route-registry-ref ${registryRef}${smokeTestRef ? ` --smoke-tests-ref ${smokeTestRef}` : ""}`,
  ];
  if (matched) {
    commands.push(
      `npm.cmd run guild-hall:rag -- operational-route-operator-run --route-registry-ref ${registryRef}${smokeTestRef ? ` --smoke-tests-ref ${smokeTestRef}` : ""} --operational-route-operator-health-ref <operator_health_ref> --query-label "<ephemeral query label>"`,
      `npm.cmd run guild-hall:rag -- operational-route-operator-run --route-registry-ref ${registryRef}${smokeTestRef ? ` --smoke-tests-ref ${smokeTestRef}` : ""} --operational-route-operator-health-ref <operator_health_ref> --query-label "<ephemeral query label>" --skip-answer-shell`,
      `npm.cmd run guild-hall:rag -- operational-route-operator-run --route-registry-ref ${registryRef}${smokeTestRef ? ` --smoke-tests-ref ${smokeTestRef}` : ""} --operational-route-operator-health-ref <operator_health_ref> --query-label "<ephemeral query label>" --record-usage --usage-id <safe_usage_id>`,
    );
  } else {
    commands.push(
      `npm.cmd run guild-hall:rag -- operational-route-candidate-record --route-registry-ref ${registryRef} --query-label "<ephemeral unmatched label>" --candidate-id <safe_candidate_id> --text`,
    );
  }
  return commands;
}

function operationalRouteSessionNextActions({ sessionStatus, matched }) {
  if (sessionStatus === "blocked_preflight") return ["fix_preflight_blockers_before_answering"];
  if (!matched) return ["capture_unmatched_candidate_without_raw_query", "review_candidate_before_route_registry_change"];
  return [
    "print_answer_shell_for_terminal_use",
    "answer_with_route_work_card_pages_claim_ceiling_and_manual_review_notice",
    "record_operator_run_usage_only_after_real_answer_and_passing_health",
  ];
}

function operationalRouteCallPlanSuggestedCommands({ registryRef, smokeTestRef, matched }) {
  const commands = [
    `npm.cmd run guild-hall:rag -- operational-route-dashboard --route-registry-ref ${registryRef}${smokeTestRef ? ` --smoke-tests-ref ${smokeTestRef}` : ""} --text`,
  ];
  if (matched) {
    commands.push(
      `npm.cmd run guild-hall:rag -- operational-route-operator-run --route-registry-ref ${registryRef}${smokeTestRef ? ` --smoke-tests-ref ${smokeTestRef}` : ""} --operational-route-operator-health-ref <operator_health_ref> --query-label "<ephemeral query label>"`,
      `npm.cmd run guild-hall:rag -- operational-route-operator-run --route-registry-ref ${registryRef}${smokeTestRef ? ` --smoke-tests-ref ${smokeTestRef}` : ""} --operational-route-operator-health-ref <operator_health_ref> --query-label "<ephemeral query label>" --skip-answer-shell`,
      `npm.cmd run guild-hall:rag -- operational-route-operator-run --route-registry-ref ${registryRef}${smokeTestRef ? ` --smoke-tests-ref ${smokeTestRef}` : ""} --operational-route-operator-health-ref <operator_health_ref> --query-label "<ephemeral query label>" --record-usage --usage-id <safe_usage_id>`,
    );
  } else {
    commands.push(
      `npm.cmd run guild-hall:rag -- operational-route-candidate-record --route-registry-ref ${registryRef} --query-label "<ephemeral unmatched label>" --candidate-id <safe_candidate_id> --text`,
    );
  }
  return commands;
}

function operationalRouteCallPlanNextActions(status) {
  if (status === "blocked_dashboard") return ["fix_dashboard_blockers_before_answering"];
  if (status === "blocked_preflight") return ["fix_preflight_blockers_before_answering"];
  if (status === "blocked_no_route_candidate_capture_recommended") {
    return ["capture_unmatched_candidate_without_raw_query", "review_candidate_before_route_registry_change"];
  }
  return [
    "print_answer_shell_for_terminal_use",
    "answer_with_route_work_card_pages_claim_ceiling_and_manual_review_notice",
    "record_operator_run_usage_only_after_real_answer_and_passing_health",
  ];
}

async function countMissingRefs(options = {}) {
  if (!options.checkFiles) return 0;
  let missing = 0;
  for (const ref of options.refs ?? []) {
    if (!(await pathExists(path.join(options.repoRoot, ref)))) {
      missing += 1;
    }
  }
  return missing;
}

function scoreRoute(route, queryLabel) {
  const queryNorm = normalizeMatchText(queryLabel);
  const queryTokens = tokenizeForMatch(queryLabel);
  const candidates = [route.route_id, ...(Array.isArray(route.trigger_labels) ? route.trigger_labels : [])];
  let score = 0;
  let matchedTriggerLabelIndex = null;
  let matchedTriggerLabelFingerprint = null;
  let matchedTokenCount = 0;
  for (const [index, candidate] of candidates.entries()) {
    const candidateNorm = normalizeMatchText(candidate);
    if (!candidateNorm) continue;
    const candidateTokens = tokenizeForMatch(candidate);
    const tokenMatches = intersectCount(queryTokens, candidateTokens);
    const directMatch = candidateNorm === queryNorm || candidateNorm.includes(queryNorm) || queryNorm.includes(candidateNorm);
    const routeIdBonus = index === 0 && (directMatch || tokenMatches > 0) ? 25 : 0;
    let candidateScore = routeIdBonus + tokenMatches * 15;
    if (candidateNorm === queryNorm) candidateScore += 1000;
    if (directMatch) candidateScore += 300;
    if (candidateScore > score) {
      score = candidateScore;
      matchedTokenCount = tokenMatches;
      matchedTriggerLabelIndex = index === 0 ? null : index - 1;
      matchedTriggerLabelFingerprint = index === 0 ? null : stableHash(`operational_route_trigger:${candidate}`);
    }
  }
  return {
    route,
    score,
    matchedTriggerLabelIndex,
    matchedTriggerLabelFingerprint,
    matchedTokenCount,
  };
}

function tokenizeForMatch(value) {
  const compact = normalizeMatchText(value).replace(/[_:/.-]+/gu, " ");
  const roughTokens = compact.split(/[^\p{L}\p{N}]+/gu).filter(Boolean);
  const tokens = new Set();
  for (const token of roughTokens) {
    if (token.length > 1 && !STOPWORDS.has(token)) tokens.add(token);
  }
  return tokens;
}

function normalizeMatchText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/gu, " ")
    .trim();
}

function intersectCount(left, right) {
  let count = 0;
  for (const token of left) {
    if (right.has(token)) count += 1;
  }
  return count;
}

function validatePageArray(value, options = {}) {
  if ((value === undefined || value === null) && options.allowEmpty) {
    return { valid: true, values: [] };
  }
  if (!Array.isArray(value)) {
    return { valid: false, values: [] };
  }
  const values = value.filter((item) => Number.isInteger(item) && item > 0);
  return { valid: values.length === value.length, values };
}

function sameNumberArray(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
  return left.every((value, index) => Number(value) === Number(right[index]));
}

function normalizeSafeId(value) {
  const id = String(value ?? "").trim();
  if (!ROUTE_ID_PATTERN.test(id)) throw new Error("id_must_be_safe");
  return id;
}

function findUnsafeOperationalRouteValues(value, trail) {
  const blockers = [];
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      blockers.push(...findUnsafeOperationalRouteValues(item, `${trail}[${index}]`));
    });
    return blockers;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      const normalizedKey = key.toLowerCase();
      if (FORBIDDEN_PAYLOAD_KEYS.has(normalizedKey)) {
        blockers.push(`forbidden_payload_key:${trail}.${key}`);
      }
      if (SECRET_LIKE_KEYS.has(normalizedKey)) {
        blockers.push(`secret_like_key:${trail}.${key}`);
      }
      blockers.push(...findUnsafeOperationalRouteValues(child, `${trail}.${key}`));
    }
    return blockers;
  }
  if (typeof value === "string") {
    if (hasLocalAbsolutePathString(value)) blockers.push(`local_absolute_path:${trail}`);
    if (hasSecretLikeValueString(value)) blockers.push(`secret_like_value:${trail}`);
  }
  return blockers;
}

function safeOperationalRouteRef(value) {
  const result = trySafeOperationalRouteRef(value);
  if (!result.ok) {
    throw new Error(`unsafe operational route ref: ${value}`);
  }
  return result.ref;
}

function trySafeOperationalRouteRef(value) {
  const raw = String(value ?? "").trim();
  if (raw.includes("\\")) return { ok: false, ref: raw };
  const ref = normalizeRepoPath(raw);
  if (!ref) return { ok: false, ref };
  if (path.isAbsolute(ref) || path.win32.isAbsolute(ref) || ref.startsWith("~")) return { ok: false, ref };
  if (ref.includes("\\") || ref.includes("\u0000")) return { ok: false, ref };
  if (/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(ref) || /^[A-Za-z]:[\\/]/.test(ref)) return { ok: false, ref };
  if (ref.split("/").some((part) => part === "..")) return { ok: false, ref };
  if (!SAFE_APPROVED_ROOTS.some((root) => ref.startsWith(root))) return { ok: false, ref };
  if (/(^|[/_.-])(secret|token|cookie|credential|session|password|passwd|private_key)([/_.-]|$)/i.test(ref)) {
    return { ok: false, ref };
  }
  return { ok: true, ref };
}

function hasLocalAbsolutePathString(value) {
  const text = String(value ?? "");
  return /(^|[\s"'(])\/(?:Users|Volumes|private|var\/folders|tmp|home)\//.test(text) || /[A-Za-z]:[\\/]/.test(text);
}

function hasSecretLikeValueString(value) {
  const text = String(value ?? "").trim();
  if (!text) return false;
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(text)) return true;
  if (/\b(?:sk-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{20,}|AKIA[0-9A-Z]{16})\b/.test(text)) {
    return true;
  }
  if (/\b(?:password|passwd|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|session[_-]?cookie)\s*[:=]\s*["']?[^"'\s]{8,}/i.test(text)) {
    return true;
  }
  if (/\bbearer\s+[A-Za-z0-9._~+/-]{20,}/i.test(text)) return true;
  return false;
}

function operationalRouteBoundary() {
  return {
    metadata_only: true,
    source_text_loaded: false,
    chunk_text_loaded: false,
    source_payloads_included: false,
    copied_excerpts_included: false,
    notebooklm_answers_included: false,
    secrets_or_session_included: false,
    runtime_absolute_paths_included: false,
    final_answer_authority_allowed: false,
    public_canon_promotion_allowed: false,
    ontology_acceptance_allowed: false,
    default_route_mutation_allowed: false,
    graph_truth_mutation_allowed: false,
  };
}

function stripBom(value) {
  return String(value ?? "").replace(/^\uFEFF/u, "");
}

function stableHash(value) {
  return crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
}

function formatTimestampUtc(value) {
  if (!value) return new Date().toISOString();
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("invalid_timestamp");
  }
  return date.toISOString();
}
