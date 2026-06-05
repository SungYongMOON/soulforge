import crypto from "node:crypto";
import path from "node:path";
import {
  normalizeRepoPath,
  readJson,
  writeJson,
} from "../shared/io.mjs";
import {
  loadSourceTextAnswerRun,
  loadSourceTextIndex,
  loadSourceTextTraceabilitySidecar,
  validateSourceTextAnswerRun,
  validateSourceTextIndex,
  validateSourceTextTraceabilitySidecar,
} from "./source_text_index.mjs";

export const SOURCE_TEXT_QUALITY_REVIEW_SCHEMA_VERSION = "soulforge.source_text_quality_review.v0";
export const SOURCE_TEXT_QUALITY_REVIEW_VALIDATION_SCHEMA_VERSION = "soulforge.source_text_quality_review_validation.v0";
export const RAG_WORK_CARD_SCHEMA_VERSION = "soulforge.source_text_work_card.v0";
export const RAG_WORK_CARD_VALIDATION_SCHEMA_VERSION = "soulforge.source_text_work_card_validation.v0";
export const SOURCE_TEXT_QUALITY_REVIEW_GENERATOR_ID = "guild_hall.rag.source_text_quality_review_generator.v0";
export const RAG_WORK_CARD_GENERATOR_ID = "guild_hall.rag.work_card_router.v0";

const DEFAULT_QUALITY_REVIEW_ROOT = "_workspaces/knowledge/rag/source_text_quality_reviews";
const DEFAULT_WORK_CARD_ROOT = "_workspaces/knowledge/rag/source_text_work_cards";
const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,180}$/;
const SOURCE_TEXT_TRACEABILITY_STATUSES = new Set(["mapped", "weak_mapped", "unmapped", "not_checked"]);
const QUALITY_REVIEW_STATUSES = new Set(["source_supported", "manual_review", "blocked"]);
const WORK_CARD_STATUSES = new Set(["ready", "manual_review", "blocked"]);
const CLAIM_CEILINGS = new Set(["observed", "source_supported", "validated_private", "canon_candidate", "canon_entry", "rejected_or_blocked"]);
const WORK_CARD_FORBIDDEN_PAYLOAD_KEYS = new Set([
  "chunk_text",
  "excerpt",
  "notebooklm_answer",
  "notebooklm_question",
  "notebooklm_response",
  "question",
  "raw_query",
  "source_text",
]);
const WORK_CARD_SECRET_LIKE_KEYS = new Set([
  "access_token",
  "api_key",
  "authorization",
  "bearer_token",
  "client_secret",
  "cookie",
  "credential",
  "credentials",
  "id_token",
  "password",
  "passwd",
  "private_key",
  "refresh_token",
  "secret",
  "session",
  "token",
]);

export async function buildSourceTextQualityReview(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const index = options.sourceTextIndex ?? await loadSourceTextIndex({
    repoRoot,
    sourceTextIndexRef: options.sourceTextIndexRef,
  });
  const sidecar = options.traceabilitySidecar ?? await loadSourceTextTraceabilitySidecar({
    repoRoot,
    traceabilitySidecarRef: options.traceabilitySidecarRef,
  });
  const answerRun = options.answerRun ?? (options.answerRunRef
    ? await loadSourceTextAnswerRun({ repoRoot, runRef: options.answerRunRef })
    : null);
  const indexValidation = validateSourceTextIndex(index);
  const sidecarValidation = validateSourceTextTraceabilitySidecar(sidecar);
  const answerRunValidation = answerRun ? validateSourceTextAnswerRun(answerRun) : null;
  const reviewId = normalizeSimpleId(
    options.reviewId ?? `source_text_quality_review_${stableHash([
      index?.index_id ?? "unknown",
      sidecar?.traceability_id ?? "unknown",
      answerRun?.run_id ?? "no_answer_run",
    ].join(":")).slice(0, 12)}`,
    "review_id",
  );
  const generatedAtUtc = formatTimestampUtc(options.now);
  const validationBlockers = [
    ...(indexValidation.status === "pass" ? [] : ["source_text_index_validation_blocked"]),
    ...(sidecarValidation.status === "pass" ? [] : ["traceability_sidecar_validation_blocked"]),
    ...(answerRunValidation && answerRunValidation.status !== "pass" ? ["answer_run_validation_blocked"] : []),
  ];
  const targetPages = normalizePages(options.pages).length > 0
    ? normalizePages(options.pages)
    : pagesFromAnswerRun(answerRun);
  const pageSummariesByPage = new Map((sidecar?.page_summary ?? []).map((page) => [page.page_no, page]));
  const sidecarChunks = Array.isArray(sidecar?.chunks) ? sidecar.chunks : [];
  const answerCitations = Array.isArray(answerRun?.response?.citations) ? answerRun.response.citations : [];
  const citationsByChunkId = new Map(answerCitations.map((citation) => [citation.chunk_id, citation]));
  const citationReviews = answerCitations.map((citation) => reviewCitation(citation));
  const pages = targetPages.map((pageNo) => reviewPage({
    pageNo,
    pageSummary: pageSummariesByPage.get(pageNo) ?? null,
    chunks: sidecarChunks.filter((chunk) => (chunk.page_span?.pages ?? []).includes(pageNo)),
    citations: answerCitations.filter((citation) => (citation.page_span?.pages ?? []).includes(pageNo)),
  }));
  const pageOrCitationReviews = [...pages, ...citationReviews];
  const blocked = validationBlockers.length > 0 || pageOrCitationReviews.some((item) => item.review_status === "blocked");
  const manualReview = pageOrCitationReviews.some((item) => item.review_status === "manual_review" || item.manual_review_required === true);
  const status = blocked ? "blocked" : manualReview ? "manual_review" : "source_supported";
  const warningCodes = [
    ...new Set([
      ...pages.flatMap((page) => page.warning_codes ?? []),
      ...citationReviews.flatMap((citation) => citation.warning_codes ?? []),
    ]),
  ].sort();

  return {
    schema_version: SOURCE_TEXT_QUALITY_REVIEW_SCHEMA_VERSION,
    kind: "source_text_quality_review",
    review_id: reviewId,
    generator_id: SOURCE_TEXT_QUALITY_REVIEW_GENERATOR_ID,
    generated_at_utc: generatedAtUtc,
    status,
    source_refs: {
      source_text_index_ref: options.sourceTextIndexRef ?? sidecar?.source_refs?.source_text_index_ref ?? answerRun?.source_refs?.source_text_index_ref ?? null,
      traceability_sidecar_ref: options.traceabilitySidecarRef ?? answerRun?.source_refs?.traceability_sidecar_ref ?? null,
      answer_run_ref: options.answerRunRef ?? null,
      index_id: index?.index_id ?? null,
      traceability_id: sidecar?.traceability_id ?? null,
      run_id: answerRun?.run_id ?? null,
      source_card_ref: index?.source_refs?.source_card_ref ?? sidecar?.source_refs?.source_card_ref ?? answerRun?.source_refs?.source_card_ref ?? null,
      source_id: index?.source_refs?.source_id ?? sidecar?.source_refs?.source_id ?? answerRun?.source_refs?.source_id ?? null,
      source_ref: index?.source_refs?.source_ref ?? sidecar?.source_refs?.source_ref ?? answerRun?.source_refs?.source_ref ?? null,
    },
    boundary: sourceTextQualityReviewBoundary(),
    quality_policy: {
      page_traceability_required: true,
      source_text_or_chunk_text_copied: false,
      raw_query_persisted: false,
      mapped_citations_may_support_source_scoped_claims: true,
      weak_or_unmapped_citations_block_source_scoped_claims: true,
      table_or_picture_warnings_require_operator_attention: true,
      owner_approval_granted_here: false,
      public_canon_promotion_allowed: false,
    },
    counts: {
      reviewed_page_count: pages.length,
      citation_review_count: citationReviews.length,
      source_supported_page_count: pages.filter((page) => page.review_status === "source_supported").length,
      manual_review_page_count: pages.filter((page) => page.review_status === "manual_review").length,
      blocked_page_count: pages.filter((page) => page.review_status === "blocked").length,
      mapped_chunk_count: sidecar?.counts?.mapped_chunk_count ?? 0,
      weak_mapped_chunk_count: sidecar?.counts?.weak_mapped_chunk_count ?? 0,
      unmapped_chunk_count: sidecar?.counts?.unmapped_chunk_count ?? 0,
    },
    reviewed_pages: pages,
    citation_reviews: citationReviews,
    warning_codes: warningCodes,
    manual_review_required: status === "manual_review",
    blockers: [...new Set([
      ...validationBlockers,
      ...pages.flatMap((page) => page.blocker_codes ?? []),
      ...citationReviews.flatMap((citation) => citation.blocker_codes ?? []),
    ])].sort(),
    validation: {
      status: "unchecked",
      upstream_validation: {
        source_text_index: indexValidation.status,
        traceability_sidecar: sidecarValidation.status,
        answer_run: answerRunValidation?.status ?? "not_supplied",
      },
    },
  };
}

export async function writeSourceTextQualityReview(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const review = await buildSourceTextQualityReview(options);
  const outputRef = options.outputRef ?? defaultQualityReviewOutputRef(review);
  const outputPath = path.join(repoRoot, safeQualityReviewOutputPath(outputRef));
  await writeJson(outputPath, review);
  return {
    status: "written",
    source_text_quality_review_ref: normalizeRepoPath(path.relative(repoRoot, outputPath)),
    review_id: review.review_id,
    review_status: review.status,
    reviewed_page_count: review.counts.reviewed_page_count,
    manual_review_required: review.manual_review_required,
  };
}

export async function loadSourceTextQualityReview({ repoRoot = process.cwd(), reviewRef } = {}) {
  if (!reviewRef) throw new Error("source_text_quality_review_ref_required");
  return readJson(path.join(path.resolve(repoRoot), safeRepoRelativePath(reviewRef)));
}

export function validateSourceTextQualityReview(review) {
  const blockers = [];
  if (review?.schema_version !== SOURCE_TEXT_QUALITY_REVIEW_SCHEMA_VERSION) blockers.push("schema_version_mismatch");
  if (review?.kind !== "source_text_quality_review") blockers.push("kind_must_be_source_text_quality_review");
  if (!isSafeId(review?.review_id)) blockers.push("review_id_unsafe");
  if (!QUALITY_REVIEW_STATUSES.has(review?.status)) blockers.push("source_text_quality_review_status_unknown");
  if (review?.boundary?.storage_scope !== "_workspaces_private_payload") blockers.push("storage_scope_must_be_workspaces_private_payload");
  if (review?.boundary?.source_text_included !== false) blockers.push("source_text_must_not_be_included");
  if (review?.boundary?.chunk_text_included !== false) blockers.push("chunk_text_must_not_be_included");
  if (review?.boundary?.raw_query_persisted !== false) blockers.push("raw_query_must_not_be_persisted");
  if (review?.boundary?.public_repo_safe !== false) blockers.push("quality_review_must_not_be_public_repo_safe");
  if (!safeWorkspaceKnowledgeJsonRef(review?.source_refs?.source_text_index_ref)) blockers.push("source_text_index_ref_must_be_workspace_json");
  if (!safeWorkspaceKnowledgeJsonRef(review?.source_refs?.traceability_sidecar_ref)) blockers.push("traceability_sidecar_ref_must_be_workspace_json");
  if (review?.source_refs?.answer_run_ref !== null && review?.source_refs?.answer_run_ref !== undefined && !safeWorkspaceKnowledgeJsonRef(review.source_refs.answer_run_ref)) {
    blockers.push("answer_run_ref_must_be_workspace_json");
  }
  if (!Array.isArray(review?.reviewed_pages)) blockers.push("reviewed_pages_must_be_array");
  if (!Array.isArray(review?.citation_reviews)) blockers.push("citation_reviews_must_be_array");
  for (const page of review?.reviewed_pages ?? []) validateReviewedPage(page, blockers, "page");
  for (const citation of review?.citation_reviews ?? []) validateReviewedCitation(citation, blockers);
  blockers.push(...payloadBoundaryBlockers(review, "source_text_quality_review"));
  return {
    schema_version: SOURCE_TEXT_QUALITY_REVIEW_VALIDATION_SCHEMA_VERSION,
    kind: "source_text_quality_review_validation",
    status: blockers.length === 0 ? "pass" : "blocked",
    review_id: review?.review_id ?? null,
    blocker_count: blockers.length,
    blockers: [...new Set(blockers)].sort(),
    boundary: {
      storage_scope: review?.boundary?.storage_scope ?? null,
      source_text_included: review?.boundary?.source_text_included === true,
      chunk_text_included: review?.boundary?.chunk_text_included === true,
      raw_query_persisted: review?.boundary?.raw_query_persisted === true,
      public_repo_safe: review?.boundary?.public_repo_safe === true,
    },
  };
}

export async function buildRagWorkCard(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const answerRun = options.answerRun ?? await loadSourceTextAnswerRun({
    repoRoot,
    runRef: options.answerRunRef,
  });
  const qualityReview = options.qualityReview ?? await loadSourceTextQualityReview({
    repoRoot,
    reviewRef: options.qualityReviewRef,
  });
  const answerValidation = validateSourceTextAnswerRun(answerRun);
  const qualityValidation = validateSourceTextQualityReview(qualityReview);
  const queryLabel = String(options.queryLabel ?? "unlabeled_rag_work_card_query").trim();
  const workCardId = normalizeSimpleId(
    options.workCardId ?? `rag_work_card_${stableHash([
      answerRun?.run_id ?? "unknown",
      qualityReview?.review_id ?? "unknown",
      queryLabel,
    ].join(":")).slice(0, 12)}`,
    "work_card_id",
  );
  const evidenceItems = buildEvidenceItems({ answerRun, qualityReview });
  const validationBlocked = answerValidation.status !== "pass" || qualityValidation.status !== "pass";
  const evidenceBlocked = evidenceItems.length === 0 || evidenceItems.some((item) => item.evidence_status === "blocked");
  const manualReviewRequired = qualityReview.status === "manual_review" || evidenceItems.some((item) => item.manual_review_required);
  const status = validationBlocked || evidenceBlocked || qualityReview.status === "blocked"
    ? "blocked"
    : manualReviewRequired
      ? "manual_review"
      : "ready";
  const claimCeiling = status === "blocked" ? "rejected_or_blocked" : "source_supported";
  const citationStatus = status === "blocked"
    ? evidenceItems.length === 0 ? "blocked_no_citations" : "blocked"
    : manualReviewRequired
      ? "source_supported_with_manual_review"
      : "source_supported";
  const evidencePages = [...new Set(evidenceItems.flatMap((item) => item.pages))].sort((a, b) => a - b);

  return {
    schema_version: RAG_WORK_CARD_SCHEMA_VERSION,
    kind: "source_text_work_card",
    work_card_id: workCardId,
    generator_id: RAG_WORK_CARD_GENERATOR_ID,
    generated_at_utc: formatTimestampUtc(options.now),
    status,
    query: {
      query_label: queryLabel,
      raw_query_persisted: false,
      query_fingerprint: stableHash(`rag_work_card_query:${queryLabel}`),
      answer_run_query_fingerprint: answerRun?.query?.query_fingerprint ?? null,
    },
    intent: {
      label: queryLabel,
      route: "source_text_rag_work_card",
      graph_node_candidates: normalizeStringList(options.graphNodeRefs),
    },
    source_refs: {
      source_text_answer_run_ref: options.answerRunRef ?? null,
      source_text_quality_review_ref: options.qualityReviewRef ?? null,
      source_text_index_ref: answerRun?.source_refs?.source_text_index_ref ?? qualityReview?.source_refs?.source_text_index_ref ?? null,
      traceability_sidecar_ref: answerRun?.source_refs?.traceability_sidecar_ref ?? qualityReview?.source_refs?.traceability_sidecar_ref ?? null,
      source_card_ref: answerRun?.source_refs?.source_card_ref ?? qualityReview?.source_refs?.source_card_ref ?? null,
      source_id: answerRun?.source_refs?.source_id ?? qualityReview?.source_refs?.source_id ?? null,
      source_ref: answerRun?.source_refs?.source_ref ?? qualityReview?.source_refs?.source_ref ?? null,
    },
    boundary: ragWorkCardBoundary(),
    citation_status: citationStatus,
    claim_ceiling: claimCeiling,
    manual_review_required: manualReviewRequired,
    evidence_pages: evidencePages,
    evidence_items: evidenceItems,
    answer_summary: buildWorkCardSummary({
      queryLabel,
      sourceTitle: answerRun?.source_refs?.source_id ?? qualityReview?.source_refs?.source_id ?? "source",
      evidencePages,
      status,
      manualReviewRequired,
      claimCeiling,
    }),
    next_actions: workCardNextActions({ status, manualReviewRequired, evidencePages, qualityReview }),
    validation: {
      status: "unchecked",
      upstream_validation: {
        source_text_answer_run: answerValidation.status,
        source_text_quality_review: qualityValidation.status,
      },
    },
  };
}

export async function writeRagWorkCard(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const workCard = await buildRagWorkCard(options);
  const outputRef = options.outputRef ?? defaultWorkCardOutputRef(workCard);
  const outputPath = path.join(repoRoot, safeWorkCardOutputPath(outputRef));
  await writeJson(outputPath, workCard);
  return {
    status: "written",
    source_text_work_card_ref: normalizeRepoPath(path.relative(repoRoot, outputPath)),
    work_card_id: workCard.work_card_id,
    work_card_status: workCard.status,
    citation_status: workCard.citation_status,
    claim_ceiling: workCard.claim_ceiling,
    evidence_page_count: workCard.evidence_pages.length,
    manual_review_required: workCard.manual_review_required,
  };
}

export async function loadRagWorkCard({ repoRoot = process.cwd(), workCardRef } = {}) {
  if (!workCardRef) throw new Error("source_text_work_card_ref_required");
  return readJson(path.join(path.resolve(repoRoot), safeRepoRelativePath(workCardRef)));
}

export function validateRagWorkCard(workCard) {
  const blockers = [];
  if (workCard?.schema_version !== RAG_WORK_CARD_SCHEMA_VERSION) blockers.push("schema_version_mismatch");
  if (workCard?.kind !== "source_text_work_card") blockers.push("kind_must_be_source_text_work_card");
  if (!isSafeId(workCard?.work_card_id)) blockers.push("work_card_id_unsafe");
  if (!WORK_CARD_STATUSES.has(workCard?.status)) blockers.push("rag_work_card_status_unknown");
  if (!CLAIM_CEILINGS.has(workCard?.claim_ceiling)) blockers.push("claim_ceiling_unknown");
  if (workCard?.query?.raw_query_persisted !== false) blockers.push("raw_query_must_not_be_persisted");
  if (workCard?.boundary?.storage_scope !== "_workspaces_private_payload") blockers.push("storage_scope_must_be_workspaces_private_payload");
  if (workCard?.boundary?.source_text_included !== false) blockers.push("source_text_must_not_be_included");
  if (workCard?.boundary?.chunk_text_included !== false) blockers.push("chunk_text_must_not_be_included");
  if (workCard?.boundary?.public_repo_safe !== false) blockers.push("work_card_must_not_be_public_repo_safe");
  if (!safeWorkspaceKnowledgeJsonRef(workCard?.source_refs?.source_text_answer_run_ref)) blockers.push("source_text_answer_run_ref_must_be_workspace_json");
  if (!safeWorkspaceKnowledgeJsonRef(workCard?.source_refs?.source_text_quality_review_ref)) blockers.push("source_text_quality_review_ref_must_be_workspace_json");
  if (!Array.isArray(workCard?.evidence_pages)) blockers.push("evidence_pages_must_be_array");
  if (!Array.isArray(workCard?.evidence_items)) blockers.push("evidence_items_must_be_array");
  for (const item of workCard?.evidence_items ?? []) {
    if (!isSafeId(item?.chunk_id)) blockers.push("evidence_chunk_id_unsafe");
    if (!Array.isArray(item?.pages)) blockers.push("evidence_pages_must_be_array");
    if (!QUALITY_REVIEW_STATUSES.has(item?.evidence_status)) blockers.push("evidence_status_unknown");
    if (!Array.isArray(item?.warning_codes)) blockers.push("evidence_warning_codes_must_be_array");
  }
  blockers.push(...payloadBoundaryBlockers(workCard, "source_text_work_card"));
  return {
    schema_version: RAG_WORK_CARD_VALIDATION_SCHEMA_VERSION,
    kind: "source_text_work_card_validation",
    status: blockers.length === 0 ? "pass" : "blocked",
    work_card_id: workCard?.work_card_id ?? null,
    blocker_count: blockers.length,
    blockers: [...new Set(blockers)].sort(),
    boundary: {
      storage_scope: workCard?.boundary?.storage_scope ?? null,
      source_text_included: workCard?.boundary?.source_text_included === true,
      chunk_text_included: workCard?.boundary?.chunk_text_included === true,
      public_repo_safe: workCard?.boundary?.public_repo_safe === true,
      raw_query_persisted: workCard?.query?.raw_query_persisted === true,
    },
  };
}

export function renderRagWorkCardText(workCard) {
  const lines = [
    `업무카드: ${workCard.query?.query_label ?? workCard.work_card_id}`,
    `상태: ${workCard.status}`,
    `근거 상태: ${workCard.citation_status}`,
    `주장 한계: ${workCard.claim_ceiling}`,
    `근거 페이지: ${(workCard.evidence_pages ?? []).length > 0 ? workCard.evidence_pages.join(", ") : "없음"}`,
    `수동 검수 필요: ${workCard.manual_review_required ? "예" : "아니오"}`,
    "",
    workCard.answer_summary ?? "",
    "",
    "근거 항목:",
  ];
  for (const item of workCard.evidence_items ?? []) {
    const warningText = item.warning_codes.length > 0 ? ` warnings=${item.warning_codes.join(",")}` : "";
    lines.push(`- ${item.chunk_id}: pages=${item.pages.join(",")} status=${item.evidence_status}${warningText}`);
  }
  if ((workCard.evidence_items ?? []).length === 0) lines.push("- 없음");
  lines.push("");
  lines.push("경계: 이 카드는 _workspaces/knowledge private RAG 산출물이며, owner approval/public canon/NotebookLM authority가 아닙니다.");
  return `${lines.join("\n")}\n`;
}

function reviewCitation(citation) {
  const pageSpan = normalizePageSpan(citation?.page_span);
  const traceabilityStatus = citation?.traceability_status ?? "not_checked";
  const warningCodes = normalizeStringList(citation?.warning_codes);
  const blockerCodes = [];
  if (!pageSpan) blockerCodes.push("citation_page_span_missing");
  if (!SOURCE_TEXT_TRACEABILITY_STATUSES.has(traceabilityStatus)) blockerCodes.push("citation_traceability_status_unknown");
  if (["weak_mapped", "unmapped", "not_checked"].includes(traceabilityStatus)) blockerCodes.push(`citation_traceability_${traceabilityStatus}`);
  const layoutReviewReasons = layoutWarningReasons(warningCodes);
  const reviewStatus = blockerCodes.length > 0 ? "blocked" : layoutReviewReasons.length > 0 ? "manual_review" : "source_supported";
  return {
    chunk_id: citation?.chunk_id ?? "unknown",
    pages: pageSpan?.pages ?? [],
    traceability_status: traceabilityStatus,
    review_status: reviewStatus,
    manual_review_required: layoutReviewReasons.length > 0,
    manual_review_reasons: layoutReviewReasons,
    warning_codes: warningCodes,
    blocker_codes: blockerCodes,
  };
}

function reviewPage({ pageNo, pageSummary, chunks, citations }) {
  const warningCodes = [
    ...new Set([
      ...chunks.flatMap((chunk) => normalizeStringList(chunk.warning_codes)),
      ...(pageSummary?.picture_count > 0 ? ["picture_present_on_page"] : []),
      ...(pageSummary?.table_count > 0 ? ["table_present_on_page"] : []),
    ]),
  ].sort();
  const traceabilityStatuses = [...new Set(chunks.map((chunk) => chunk.traceability_status ?? "unmapped"))].sort();
  const blockerCodes = [];
  if (chunks.length === 0) blockerCodes.push("page_has_no_page_backed_chunks");
  if (traceabilityStatuses.includes("weak_mapped")) blockerCodes.push("page_has_weak_mapped_chunks");
  if (traceabilityStatuses.includes("unmapped")) blockerCodes.push("page_has_unmapped_chunks");
  const cited = citations.length > 0;
  const layoutReviewReasons = layoutWarningReasons(warningCodes);
  const reviewStatus = blockerCodes.length > 0 ? "blocked" : cited ? "source_supported" : layoutReviewReasons.length > 0 ? "manual_review" : "source_supported";
  return {
    page_no: pageNo,
    review_status: reviewStatus,
    cited,
    manual_review_required: reviewStatus === "manual_review" || (cited && layoutReviewReasons.length > 0),
    manual_review_reasons: layoutReviewReasons,
    chunk_ids: chunks.map((chunk) => chunk.chunk_id).filter(Boolean).sort(),
    citation_chunk_ids: citations.map((citation) => citation.chunk_id).filter(Boolean).sort(),
    traceability_statuses: traceabilityStatuses,
    warning_codes: warningCodes,
    blocker_codes: blockerCodes,
    page_summary: pageSummary ? {
      text_element_count: pageSummary.text_element_count ?? 0,
      table_count: pageSummary.table_count ?? 0,
      picture_count: pageSummary.picture_count ?? 0,
    } : null,
  };
}

function buildEvidenceItems({ answerRun, qualityReview }) {
  const pageReviews = new Map((qualityReview?.reviewed_pages ?? []).map((page) => [page.page_no, page]));
  return (answerRun?.response?.citations ?? []).map((citation) => {
    const pages = normalizePageSpan(citation.page_span)?.pages ?? [];
    const pageStatuses = pages.map((pageNo) => pageReviews.get(pageNo)?.review_status).filter(Boolean);
    const warningCodes = [
      ...new Set([
        ...normalizeStringList(citation.warning_codes),
        ...pages.flatMap((pageNo) => normalizeStringList(pageReviews.get(pageNo)?.warning_codes)),
      ]),
    ].sort();
    const blocked = !normalizePageSpan(citation.page_span) || ["weak_mapped", "unmapped", "not_checked"].includes(citation.traceability_status);
    const manualReviewRequired = layoutWarningReasons(warningCodes).length > 0 || pageStatuses.includes("manual_review");
    const evidenceStatus = blocked ? "blocked" : pageStatuses.includes("blocked") ? "blocked" : manualReviewRequired ? "manual_review" : "source_supported";
    return {
      chunk_id: citation.chunk_id,
      pages,
      score: citation.score ?? null,
      traceability_status: citation.traceability_status ?? "not_checked",
      evidence_status: evidenceStatus,
      manual_review_required: manualReviewRequired,
      warning_codes: warningCodes,
    };
  });
}

function buildWorkCardSummary({ queryLabel, sourceTitle, evidencePages, status, manualReviewRequired, claimCeiling }) {
  const pageText = evidencePages.length > 0 ? evidencePages.join(", ") : "no cited pages";
  if (status === "blocked") {
    return `${queryLabel}: 현재 승인된 source-text 근거가 부족하거나 검증이 막혀 업무카드 사용이 보류됩니다. 기준 source=${sourceTitle}, pages=${pageText}, claim_ceiling=${claimCeiling}.`;
  }
  const reviewText = manualReviewRequired ? "표/그림/OCR 등 수동 검수 항목이 남아 있습니다" : "인용 페이지 추적 상태가 업무카드 v0 기준을 만족합니다";
  return `${queryLabel}: ${sourceTitle} 기준 근거 페이지 ${pageText}를 사용합니다. ${reviewText}. claim_ceiling=${claimCeiling}.`;
}

function workCardNextActions({ status, manualReviewRequired, evidencePages, qualityReview }) {
  if (status === "blocked") {
    return [
      "source-text answer run 또는 quality review blocker를 먼저 해소한다",
      "근거 페이지가 없거나 weak/unmapped이면 업무 판단으로 사용하지 않는다",
    ];
  }
  const actions = [
    "업무카드를 project work note 또는 SE 정리 요청의 근거 카드로 사용한다",
    "반복 사용 가치가 있으면 knowledge wiki handoff 후보로 보낸다",
  ];
  if (manualReviewRequired) {
    actions.unshift(`수동 검수 대상 페이지 확인: ${(qualityReview?.reviewed_pages ?? []).filter((page) => page.manual_review_required).map((page) => page.page_no).join(", ") || evidencePages.join(", ")}`);
  }
  return actions;
}

function validateReviewedPage(page, blockers, prefix) {
  if (!Number.isInteger(page?.page_no) || page.page_no < 1) blockers.push(`${prefix}_page_no_invalid`);
  if (!QUALITY_REVIEW_STATUSES.has(page?.review_status)) blockers.push(`${prefix}_review_status_unknown`);
  if (!Array.isArray(page?.chunk_ids)) blockers.push(`${prefix}_chunk_ids_must_be_array`);
  if (!Array.isArray(page?.citation_chunk_ids)) blockers.push(`${prefix}_citation_chunk_ids_must_be_array`);
  if (!Array.isArray(page?.warning_codes)) blockers.push(`${prefix}_warning_codes_must_be_array`);
  if (!Array.isArray(page?.blocker_codes)) blockers.push(`${prefix}_blocker_codes_must_be_array`);
}

function validateReviewedCitation(citation, blockers) {
  if (!isSafeId(citation?.chunk_id)) blockers.push("citation_chunk_id_unsafe");
  if (!Array.isArray(citation?.pages)) blockers.push("citation_pages_must_be_array");
  if (!QUALITY_REVIEW_STATUSES.has(citation?.review_status)) blockers.push("citation_review_status_unknown");
  if (!Array.isArray(citation?.warning_codes)) blockers.push("citation_warning_codes_must_be_array");
  if (!Array.isArray(citation?.blocker_codes)) blockers.push("citation_blocker_codes_must_be_array");
}

function sourceTextQualityReviewBoundary() {
  return {
    storage_scope: "_workspaces_private_payload",
    source_text_loaded_upstream: true,
    source_text_included: false,
    chunk_text_included: false,
    source_excerpt_included: false,
    raw_query_persisted: false,
    public_repo_safe: false,
    notebooklm_answers_included: false,
    runtime_absolute_paths_included: false,
    secrets_or_session_included: false,
    owner_approval_claimed: false,
    public_canon_promotion_allowed: false,
  };
}

function ragWorkCardBoundary() {
  return {
    storage_scope: "_workspaces_private_payload",
    source_text_loaded_upstream: true,
    source_text_included: false,
    chunk_text_included: false,
    source_excerpt_included: false,
    raw_query_persisted: false,
    public_repo_safe: false,
    notebooklm_answers_included: false,
    runtime_absolute_paths_included: false,
    secrets_or_session_included: false,
    owner_approval_claimed: false,
    public_canon_promotion_allowed: false,
  };
}

function defaultQualityReviewOutputRef(review) {
  return normalizeRepoPath(path.join(DEFAULT_QUALITY_REVIEW_ROOT, review.review_id, "source_text_quality_review.json"));
}

function defaultWorkCardOutputRef(workCard) {
  return normalizeRepoPath(path.join(DEFAULT_WORK_CARD_ROOT, workCard.work_card_id, "source_text_work_card.json"));
}

function safeQualityReviewOutputPath(outputRef) {
  const normalized = safeRepoRelativePath(outputRef);
  if (!normalized.startsWith(`${DEFAULT_QUALITY_REVIEW_ROOT}/`)) {
    throw new Error(`source text quality review output must be under ${DEFAULT_QUALITY_REVIEW_ROOT}`);
  }
  if (!normalized.endsWith(".json")) throw new Error("source text quality review output must be json");
  return normalized;
}

function safeWorkCardOutputPath(outputRef) {
  const normalized = safeRepoRelativePath(outputRef);
  if (!normalized.startsWith(`${DEFAULT_WORK_CARD_ROOT}/`)) {
    throw new Error(`rag work card output must be under ${DEFAULT_WORK_CARD_ROOT}`);
  }
  if (!normalized.endsWith(".json")) throw new Error("rag work card output must be json");
  return normalized;
}

function normalizePages(value) {
  const values = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
  const pages = new Set();
  for (const item of values) {
    for (const part of String(item).split(",")) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const range = trimmed.match(/^(\d+)-(\d+)$/u);
      if (range) {
        const start = Number(range[1]);
        const end = Number(range[2]);
        for (let page = Math.min(start, end); page <= Math.max(start, end); page += 1) pages.add(page);
        continue;
      }
      const page = Number(trimmed);
      if (Number.isInteger(page) && page > 0) pages.add(page);
    }
  }
  return [...pages].sort((a, b) => a - b);
}

function pagesFromAnswerRun(answerRun) {
  return [
    ...new Set(
      (answerRun?.response?.citations ?? [])
        .flatMap((citation) => normalizePageSpan(citation.page_span)?.pages ?? []),
    ),
  ].sort((a, b) => a - b);
}

function normalizePageSpan(pageSpan) {
  if (!pageSpan || typeof pageSpan !== "object") return null;
  const pages = Array.isArray(pageSpan.pages)
    ? [...new Set(pageSpan.pages.map(Number).filter((pageNo) => Number.isInteger(pageNo) && pageNo > 0))].sort((a, b) => a - b)
    : [];
  const startPage = Number(pageSpan.start_page ?? pages[0]);
  const endPage = Number(pageSpan.end_page ?? pages[pages.length - 1]);
  if (!Number.isInteger(startPage) || startPage < 1) return null;
  if (!Number.isInteger(endPage) || endPage < startPage) return null;
  return {
    start_page: startPage,
    end_page: endPage,
    pages: pages.length > 0 ? pages : [startPage],
  };
}

function layoutWarningReasons(warningCodes) {
  return [
    ...(warningCodes.includes("picture_present_on_page") ? ["picture_present_on_page"] : []),
    ...(warningCodes.includes("table_present_on_page") ? ["table_present_on_page"] : []),
  ];
}

function normalizeStringList(value) {
  if (value === undefined || value === null) return [];
  const values = Array.isArray(value) ? value : [value];
  return [...new Set(values.map((item) => String(item).trim()).filter(Boolean))].sort();
}

function safeWorkspaceKnowledgeRef(value) {
  if (!value || typeof value !== "string") return false;
  let normalized;
  try {
    normalized = safeRepoRelativePath(value);
  } catch {
    return false;
  }
  return normalized.startsWith("_workspaces/knowledge/") && !normalized.includes("/../");
}

function safeWorkspaceKnowledgeJsonRef(value) {
  return safeWorkspaceKnowledgeRef(value) && String(value).endsWith(".json");
}

function safeRepoRelativePath(value) {
  if (!value || typeof value !== "string") throw new Error("repo_relative_path_required");
  if (path.isAbsolute(value)) throw new Error("repo_relative_path_must_not_be_absolute");
  const normalized = normalizeRepoPath(path.normalize(value));
  if (normalized === "." || normalized.startsWith("../") || normalized.includes("/../")) {
    throw new Error("repo_relative_path_must_stay_in_repo");
  }
  return normalized;
}

function normalizeSimpleId(value, fieldName) {
  const raw = String(value ?? "").trim();
  if (!SAFE_ID_PATTERN.test(raw)) throw new Error(`${fieldName}_unsafe`);
  return raw;
}

function isSafeId(value) {
  return typeof value === "string" && SAFE_ID_PATTERN.test(value);
}

function formatTimestampUtc(value) {
  return value ? new Date(value).toISOString() : new Date().toISOString();
}

function stableHash(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function payloadBoundaryBlockers(value, trail) {
  const blockers = [];
  collectPayloadBoundaryBlockers(value, trail, blockers);
  return blockers;
}

function collectPayloadBoundaryBlockers(value, trail, blockers) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectPayloadBoundaryBlockers(item, `${trail}[${index}]`, blockers));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      const childTrail = `${trail}.${key}`;
      const normalizedKey = key.toLowerCase();
      if (WORK_CARD_FORBIDDEN_PAYLOAD_KEYS.has(normalizedKey)) {
        blockers.push(`forbidden_payload_key:${childTrail}`);
        addGenericPayloadKeyBlocker(normalizedKey, blockers);
      }
      if (WORK_CARD_SECRET_LIKE_KEYS.has(normalizedKey)) {
        blockers.push(`secret_like_key:${childTrail}`);
      }
      collectPayloadBoundaryBlockers(child, childTrail, blockers);
    }
    return;
  }
  if (typeof value !== "string") return;
  if (hasFileUrlString(value)) {
    blockers.push(`file_url_string:${trail}`);
    blockers.push("file_url_must_not_be_included");
  }
  if (/\/Users\//u.test(value)) blockers.push("runtime_absolute_user_path_included");
  if (/\/Volumes\//u.test(value)) blockers.push("runtime_absolute_volume_path_included");
  if (/[A-Za-z]:[\\/]/u.test(value)) blockers.push("runtime_absolute_windows_path_included");
  if (hasLocalAbsolutePathString(value)) blockers.push(`local_absolute_path:${trail}`);
  if (hasSecretLikeValueString(value)) blockers.push(`secret_like_value:${trail}`);
}

function addGenericPayloadKeyBlocker(normalizedKey, blockers) {
  if (normalizedKey === "chunk_text") blockers.push("chunk_text_must_not_be_included");
  if (normalizedKey === "source_text") blockers.push("source_text_must_not_be_included");
  if (normalizedKey === "excerpt") blockers.push("excerpt_must_not_be_included");
  if (normalizedKey === "question") blockers.push("raw_question_must_not_be_included");
  if (normalizedKey === "raw_query") blockers.push("raw_query_must_not_be_persisted");
}

function hasFileUrlString(value) {
  return /\bfile:\/\//iu.test(String(value ?? ""));
}

function hasLocalAbsolutePathString(value) {
  const text = String(value ?? "");
  return /(^|[\s"'(])\/(?:Users|Volumes|private|var\/folders|tmp|home)\//u.test(text) || /[A-Za-z]:[\\/]/u.test(text);
}

function hasSecretLikeValueString(value) {
  const text = String(value ?? "").trim();
  if (!text) return false;
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/u.test(text)) return true;
  if (/\b(?:sk-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{20,}|AKIA[0-9A-Z]{16})\b/u.test(text)) {
    return true;
  }
  if (/\b(?:password|passwd|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|session[_-]?cookie)\s*[:=]\s*["']?[^"'\s]{8,}/iu.test(text)) {
    return true;
  }
  if (/\bbearer\s+[A-Za-z0-9._~+/-]{20,}/iu.test(text)) return true;
  return false;
}
