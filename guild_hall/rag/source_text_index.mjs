import crypto from "node:crypto";
import path from "node:path";
import { promises as fs } from "node:fs";
import { normalizeRepoPath, readJson, writeJson } from "../shared/io.mjs";
import { validateSourceSyncReadyRef } from "./source_sync_ready_manifest.mjs";

export const KNOWLEDGE_SOURCE_CARD_SCHEMA_VERSION = "soulforge.knowledge_source_card.v0";
export const SOURCE_TEXT_INDEX_SCHEMA_VERSION = "soulforge.source_text_index.v0";
export const SOURCE_TEXT_ANSWER_RUN_SCHEMA_VERSION = "soulforge.source_text_answer_run.v0";
export const SOURCE_TEXT_TRACEABILITY_SIDECAR_SCHEMA_VERSION = "soulforge.source_text_traceability_sidecar.v0";
export const KNOWLEDGE_SOURCE_CARD_VALIDATION_SCHEMA_VERSION = "soulforge.knowledge_source_card_validation.v0";
export const SOURCE_TEXT_INDEX_VALIDATION_SCHEMA_VERSION = "soulforge.source_text_index_validation.v0";
export const SOURCE_TEXT_ANSWER_RUN_VALIDATION_SCHEMA_VERSION = "soulforge.source_text_answer_run_validation.v0";
export const SOURCE_TEXT_TRACEABILITY_SIDECAR_VALIDATION_SCHEMA_VERSION = "soulforge.source_text_traceability_sidecar_validation.v0";
export const SOURCE_TEXT_INDEX_GENERATOR_ID = "guild_hall.rag.source_text_index_generator.v0";
export const SOURCE_TEXT_ANSWER_RUN_GENERATOR_ID = "guild_hall.rag.source_text_answer_run_generator.v0";
export const SOURCE_TEXT_TRACEABILITY_SIDECAR_GENERATOR_ID = "guild_hall.rag.source_text_traceability_sidecar_generator.v0";

const DEFAULT_INDEX_ROOT = "_workspaces/knowledge/rag/indexes_local/source_text_indexes";
const DEFAULT_DERIVED_TEXT_ROOT = "_workspaces/knowledge/rag/derived_text";
const DEFAULT_ANSWER_RUN_ROOT = "_workspaces/knowledge/rag/answer_runs";
const DEFAULT_TRACEABILITY_SIDECAR_ROOT = "_workspaces/knowledge/rag/traceability_sidecars";
const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,180}$/;
const SUPPORTED_SOURCE_EXTENSIONS = new Set([".md", ".markdown", ".txt"]);
const SOURCE_TEXT_ARTIFACT_FORBIDDEN_KEYS = new Set([
  "answer_text",
  "canon_entry",
  "chunk_text",
  "credential",
  "credentials",
  "notebooklm_answer",
  "public_canon_entry",
  "question",
  "raw_query",
  "secret",
  "session",
  "source_text",
  "token",
]);
const SOURCE_TEXT_ARTIFACT_FORBIDDEN_AUTHORITY_CLAIM_KEYS = new Set([
  "canon_promotion_allowed",
  "canon_promotion_granted",
  "owner_approval_granted",
  "public_canon_promotion",
  "public_canon_promotion_allowed",
  "source_truth",
  "source_truth_claimed",
]);
const SOURCE_TEXT_INDEX_PAYLOAD_TRAILS = [/^source_text_index\.chunks\[\d+\]\.chunk_text$/u];
const SOURCE_TEXT_ANSWER_RUN_PAYLOAD_TRAILS = [/^source_text_answer_run\.response\.answer_text$/u];
const SOURCE_TEXT_ARTIFACT_ALLOWED_METADATA_VALUES = new Set(["weak_token_overlap_page_span"]);
const STOPWORD_TOKENS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "how",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "rag",
  "search",
  "source",
  "the",
  "to",
  "what",
  "with",
  "관련",
  "검색",
  "대해",
  "대한",
  "무엇",
  "설명",
  "어떤",
  "어떻게",
  "알려",
  "알려줘",
  "자료",
  "지식",
  "질문",
  "하나요",
]);
const KOREAN_PARTICLE_SUFFIXES = [
  "으로서",
  "으로써",
  "에게서",
  "으로",
  "에서",
  "에게",
  "부터",
  "까지",
  "처럼",
  "보다",
  "께서",
  "와",
  "과",
  "은",
  "는",
  "이",
  "가",
  "을",
  "를",
  "의",
  "에",
  "로",
  "도",
  "만",
];

export async function loadKnowledgeSourceCard({ repoRoot = process.cwd(), sourceCardRef } = {}) {
  if (!sourceCardRef) throw new Error("source_card_ref_required");
  const root = path.resolve(repoRoot);
  return readJson(path.join(root, safeRepoRelativePath(sourceCardRef)));
}

export function validateKnowledgeSourceCard(card) {
  const blockers = [];
  if (card?.schema_version !== KNOWLEDGE_SOURCE_CARD_SCHEMA_VERSION) blockers.push("source_card_schema_version_mismatch");
  if (!isSafeId(card?.source_id)) blockers.push("source_id_unsafe");
  if (!card?.title || typeof card.title !== "string") blockers.push("source_card_title_required");
  const sourceRef = sourceCardSourceRef(card);
  const readyRef = sourceCardSyncReadyRef(card);
  if (!safeWorkspaceKnowledgeRef(sourceRef)) blockers.push("source_ref_must_be_under_workspaces_knowledge");
  if (!SUPPORTED_SOURCE_EXTENSIONS.has(path.extname(String(sourceRef ?? "")).toLowerCase())) {
    blockers.push("source_kind_extension_unsupported");
  }
  if (readyRef !== null && !safeWorkspaceKnowledgeJsonRef(readyRef)) blockers.push("source_sync_ready_ref_must_be_workspace_knowledge_json");
  if (card?.rag_permissions?.source_text_retrieval !== true) blockers.push("source_text_retrieval_permission_required");
  if (card?.rag_permissions?.index_build !== true) blockers.push("index_build_permission_required");
  if (card?.rag_permissions?.answer_synthesis !== true) blockers.push("answer_synthesis_permission_required");
  if (card?.public_canon_promotion_allowed !== false && !officialSourcePromotionAllowed(card)) {
    blockers.push("public_canon_promotion_requires_official_source_authority");
  }
  if (card?.notebooklm_packet_allowed !== false && !officialSourcePromotionAllowed(card)) {
    blockers.push("notebooklm_packet_requires_official_source_authority");
  }
  blockers.push(...findLocalAbsolutePathStrings(card));
  return {
    schema_version: KNOWLEDGE_SOURCE_CARD_VALIDATION_SCHEMA_VERSION,
    kind: "knowledge_source_card_validation",
    source_id: card?.source_id ?? null,
    status: blockers.length === 0 ? "pass" : "blocked",
    blocker_count: blockers.length,
    blockers: [...new Set(blockers)].sort(),
  };
}

export async function buildSourceTextIndex(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const sourceCard = options.sourceCard ?? await loadKnowledgeSourceCard({
    repoRoot,
    sourceCardRef: options.sourceCardRef,
  });
  const cardValidation = validateKnowledgeSourceCard(sourceCard);
  const sourceRef = sourceCardSourceRef(sourceCard);
  const readyManifestRef = options.readyManifestRef ?? sourceCardSyncReadyRef(sourceCard);
  const syncReadyValidation = readyManifestRef
    ? await validateSourceSyncReadyRef({
      repoRoot,
      readyRef: readyManifestRef,
      sourceCardRef: options.sourceCardRef,
      sourceTextRef: sourceRef,
      stableMs: options.stableMs,
    })
    : null;
  const indexId = normalizeSimpleId(
    options.indexId ?? `source_text_index_${sourceCard?.source_id ?? "unknown"}_${stableHash(sourceCard?.source_ref ?? "").slice(0, 8)}`,
    "index_id",
  );
  const generatedAtUtc = formatTimestampUtc(options.now);
  const doclingJsonRef = options.doclingJsonRef ?? null;
  const safeDoclingJsonRef = doclingJsonRef
    ? safeWorkspaceKnowledgeJsonRef(doclingJsonRef)
      ? safeRepoRelativePath(doclingJsonRef)
      : null
    : null;
  if (doclingJsonRef && !safeDoclingJsonRef) throw new Error("docling json ref must be under _workspaces/knowledge and json");

  if (cardValidation.status !== "pass") {
    return {
      schema_version: SOURCE_TEXT_INDEX_SCHEMA_VERSION,
      kind: "source_text_index",
      index_id: indexId,
      generator_id: SOURCE_TEXT_INDEX_GENERATOR_ID,
      generated_at_utc: generatedAtUtc,
      status: "blocked_invalid_source_card",
      source_refs: {
        source_card_ref: options.sourceCardRef ?? null,
        source_id: sourceCard?.source_id ?? null,
        source_ref: sourceRef,
        source_sync_ready_ref: readyManifestRef ?? null,
        docling_json_ref: safeDoclingJsonRef,
      },
      boundary: sourceTextIndexBoundary({ sourceTextLoaded: false }),
      permissions: blockedSourceTextIndexPermissions(),
      validation: {
        status: "blocked",
        upstream_validation: cardValidation,
        sync_ready_validation: syncReadyValidation,
      },
      counts: {
        chunk_count: 0,
        indexed_source_count: 0,
      },
      chunks: [],
    };
  }
  if (syncReadyValidation && syncReadyValidation.status !== "pass") {
    return {
      schema_version: SOURCE_TEXT_INDEX_SCHEMA_VERSION,
      kind: "source_text_index",
      index_id: indexId,
      generator_id: SOURCE_TEXT_INDEX_GENERATOR_ID,
      generated_at_utc: generatedAtUtc,
      status: "blocked_sync_not_ready",
      source_refs: {
        source_card_ref: options.sourceCardRef ?? null,
        source_id: sourceCard?.source_id ?? null,
        source_ref: sourceRef,
        source_sync_ready_ref: readyManifestRef,
        docling_json_ref: safeDoclingJsonRef,
      },
      boundary: sourceTextIndexBoundary({ sourceTextLoaded: false }),
      permissions: blockedSourceTextIndexPermissions(),
      validation: {
        status: "blocked",
        upstream_validation: cardValidation.status,
        sync_ready_validation: syncReadyValidation,
      },
      counts: {
        chunk_count: 0,
        indexed_source_count: 0,
      },
      chunks: [],
    };
  }

  let normalizedText;
  let chunks;
  let doclingSummary = null;
  let sourceOrderBasis = "source_text_paragraph_order";
  if (safeDoclingJsonRef) {
    const doclingJson = await readJson(path.join(repoRoot, safeDoclingJsonRef));
    const doclingProfile = buildDoclingTraceabilityProfile(doclingJson);
    normalizedText = doclingTextForIndex(doclingProfile);
    chunks = chunkDoclingElementOrderText(doclingProfile, {
      sourceId: sourceCard.source_id,
      sourceRef,
      maxChars: numericOption(options.maxChars, 900),
    });
    sourceOrderBasis = "docling_element_page_order";
    doclingSummary = {
      schema_name: typeof doclingJson?.schema_name === "string" ? doclingJson.schema_name : null,
      version: typeof doclingJson?.version === "string" ? doclingJson.version : null,
      page_count: doclingProfile.pageCount,
      text_element_count: doclingProfile.textElementCount,
      table_count: doclingProfile.tableCount,
      picture_count: doclingProfile.pictureCount,
    };
  } else {
    const sourcePath = path.join(repoRoot, safeRepoRelativePath(sourceRef));
    const rawText = await fs.readFile(sourcePath, "utf8");
    normalizedText = normalizeSourceText(rawText, sourceCard.source_kind);
    chunks = chunkText(normalizedText, {
      sourceId: sourceCard.source_id,
      sourceRef,
      maxChars: numericOption(options.maxChars, 900),
    });
  }
  const derivedTextRef = normalizeRepoPath(path.join(DEFAULT_DERIVED_TEXT_ROOT, indexId, `${sourceCard.source_id}.txt`));

  return {
    schema_version: SOURCE_TEXT_INDEX_SCHEMA_VERSION,
    kind: "source_text_index",
    index_id: indexId,
    generator_id: SOURCE_TEXT_INDEX_GENERATOR_ID,
    generated_at_utc: generatedAtUtc,
    status: chunks.length > 0 ? "ready" : "blocked_empty_source_text",
    source_refs: {
      source_card_ref: options.sourceCardRef ?? null,
      source_id: sourceCard.source_id,
      source_ref: sourceRef,
      source_sync_ready_ref: readyManifestRef ?? null,
      derived_text_ref: derivedTextRef,
      docling_json_ref: safeDoclingJsonRef,
    },
    source_card_summary: {
      title: sourceCard.title,
      domains: Array.isArray(sourceCard.domains) ? sourceCard.domains : [],
      sensitivity: sourceCard.sensitivity ?? "unspecified",
      approval_status: sourceCard.approval_status ?? "unspecified",
      claim_ceiling: sourceCard.claim_ceiling ?? "observed",
    },
    boundary: sourceTextIndexBoundary({ sourceTextLoaded: true }),
    permissions: {
      source_text_retrieval_allowed: true,
      index_build_allowed: true,
      answer_synthesis_allowed: true,
      public_canon_promotion_allowed: false,
      notebooklm_packet_allowed: false,
    },
    counts: {
      indexed_source_count: 1,
      chunk_count: chunks.length,
      source_char_count: normalizedText.length,
      ...(doclingSummary ? {
        docling_page_count: doclingSummary.page_count,
        docling_text_element_count: doclingSummary.text_element_count,
        docling_table_count: doclingSummary.table_count,
        docling_picture_count: doclingSummary.picture_count,
      } : {}),
    },
    generation_profile: {
      source_order_basis: sourceOrderBasis,
      chunk_max_chars: numericOption(options.maxChars, 900),
      native_page_traceability: Boolean(safeDoclingJsonRef),
    },
    ...(doclingSummary ? { docling_summary: doclingSummary } : {}),
    chunks,
    validation: {
      status: "unchecked",
      upstream_validation: cardValidation.status,
      sync_ready_validation: syncReadyValidation?.status ?? "not_required",
    },
  };
}

export async function writeSourceTextIndex(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const index = await buildSourceTextIndex(options);
  const outputRef = options.outputRef ?? defaultIndexOutputRef(index);
  const safeOutputRef = safeSourceTextIndexOutputPath(outputRef);
  if (index.status === "ready") {
    const derivedPath = path.join(repoRoot, safeRepoRelativePath(index.source_refs.derived_text_ref));
    let normalizedText;
    if (index.source_refs.docling_json_ref) {
      normalizedText = (index.chunks ?? []).map((chunk) => String(chunk.chunk_text ?? "").trim()).filter(Boolean).join("\n\n");
    } else {
      const sourcePath = path.join(repoRoot, safeRepoRelativePath(index.source_refs.source_ref));
      normalizedText = normalizeSourceText(await fs.readFile(sourcePath, "utf8"));
    }
    await fs.mkdir(path.dirname(derivedPath), { recursive: true });
    await fs.writeFile(derivedPath, `${normalizedText.trim()}\n`, "utf8");
  }
  const outputPath = path.join(repoRoot, safeOutputRef);
  await writeJson(outputPath, index);
  return {
    status: "written",
    source_text_index_ref: normalizeRepoPath(path.relative(repoRoot, outputPath)),
    derived_text_ref: index.source_refs.derived_text_ref,
    index_id: index.index_id,
    index_status: index.status,
    chunk_count: index.counts.chunk_count,
  };
}

export async function loadSourceTextIndex({ repoRoot = process.cwd(), sourceTextIndexRef } = {}) {
  if (!sourceTextIndexRef) throw new Error("source_text_index_ref_required");
  const root = path.resolve(repoRoot);
  return readJson(path.join(root, safeRepoRelativePath(sourceTextIndexRef)));
}

export function validateSourceTextIndex(index) {
  const blockers = [];
  if (index?.schema_version !== SOURCE_TEXT_INDEX_SCHEMA_VERSION) blockers.push("schema_version_mismatch");
  if (index?.kind !== "source_text_index") blockers.push("kind_must_be_source_text_index");
  if (!isSafeId(index?.index_id)) blockers.push("index_id_unsafe");
  if (!["ready", "blocked_empty_source_text", "blocked_invalid_source_card", "blocked_sync_not_ready"].includes(index?.status)) {
    blockers.push("source_text_index_status_unknown");
  }
  if (!safeWorkspaceKnowledgeRef(index?.source_refs?.source_ref)) blockers.push("source_ref_must_be_under_workspaces_knowledge");
  if (index?.status === "ready" && !safeWorkspaceKnowledgeRef(index?.source_refs?.derived_text_ref)) {
    blockers.push("derived_text_ref_must_be_under_workspaces_knowledge");
  }
  if (index?.status !== "ready" && index?.source_refs?.derived_text_ref !== undefined && !safeWorkspaceKnowledgeRef(index.source_refs.derived_text_ref)) {
    blockers.push("derived_text_ref_must_be_under_workspaces_knowledge");
  }
  if (index?.source_refs?.docling_json_ref !== null && index?.source_refs?.docling_json_ref !== undefined && !safeWorkspaceKnowledgeJsonRef(index.source_refs.docling_json_ref)) {
    blockers.push("docling_json_ref_must_be_under_workspaces_knowledge_json");
  }
  if (index?.boundary?.storage_scope !== "_workspaces_private_payload") blockers.push("storage_scope_must_be_workspaces_private_payload");
  if (index?.boundary?.source_text_loaded !== true && index?.status === "ready") blockers.push("ready_index_must_mark_source_text_loaded");
  if (index?.boundary?.public_repo_safe !== false) blockers.push("source_text_index_must_not_be_public_repo_safe");
  if (index?.permissions?.public_canon_promotion_allowed !== false) blockers.push("public_canon_promotion_must_be_false");
  if (index?.permissions?.notebooklm_packet_allowed !== false) blockers.push("notebooklm_packet_must_be_false");
  if (!Array.isArray(index?.chunks)) blockers.push("chunks_must_be_array");
  for (const chunk of index?.chunks ?? []) {
    if (!isSafeId(chunk?.chunk_id)) blockers.push("chunk_id_unsafe");
    if (typeof chunk?.chunk_text !== "string" || chunk.chunk_text.trim().length === 0) blockers.push("chunk_text_required");
    if (!safeWorkspaceKnowledgeRef(chunk?.source_ref)) blockers.push("chunk_source_ref_must_be_under_workspaces_knowledge");
    if (chunk?.page_span !== null && chunk?.page_span !== undefined) {
      if (!Number.isInteger(chunk.page_span.start_page) || chunk.page_span.start_page < 1) blockers.push("chunk_page_span_start_page_invalid");
      if (!Number.isInteger(chunk.page_span.end_page) || chunk.page_span.end_page < chunk.page_span.start_page) blockers.push("chunk_page_span_end_page_invalid");
      if (!Array.isArray(chunk.page_span.pages)) blockers.push("chunk_page_span_pages_must_be_array");
    }
    if (chunk?.traceability_status !== undefined && !["mapped", "weak_mapped", "unmapped", "not_checked"].includes(chunk.traceability_status)) {
      blockers.push("chunk_traceability_status_unknown");
    }
    if (chunk?.layout_labels !== undefined && !Array.isArray(chunk.layout_labels)) blockers.push("chunk_layout_labels_must_be_array");
    if (chunk?.warning_codes !== undefined && !Array.isArray(chunk.warning_codes)) blockers.push("chunk_warning_codes_must_be_array");
  }
  blockers.push(...findSourceTextArtifactContamination(index, "source_text_index", {
    allowedPayloadTrails: SOURCE_TEXT_INDEX_PAYLOAD_TRAILS,
  }));
  return {
    schema_version: SOURCE_TEXT_INDEX_VALIDATION_SCHEMA_VERSION,
    kind: "source_text_index_validation",
    status: blockers.length === 0 ? "pass" : "blocked",
    index_id: index?.index_id ?? null,
    blocker_count: blockers.length,
    blockers: [...new Set(blockers)].sort(),
    boundary: {
      storage_scope: index?.boundary?.storage_scope ?? null,
      source_text_loaded: index?.boundary?.source_text_loaded === true,
      public_repo_safe: index?.boundary?.public_repo_safe === true,
      notebooklm_answers_included: index?.boundary?.notebooklm_answers_included === true,
      runtime_absolute_paths_included: index?.boundary?.runtime_absolute_paths_included === true,
    },
  };
}

export async function buildSourceTextTraceabilitySidecar(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const index = options.sourceTextIndex ?? await loadSourceTextIndex({
    repoRoot,
    sourceTextIndexRef: options.sourceTextIndexRef,
  });
  const indexValidation = validateSourceTextIndex(index);
  const doclingJsonRef = options.doclingJsonRef;
  if (!doclingJsonRef) throw new Error("docling_json_ref_required");
  const safeDoclingJsonRef = safeWorkspaceKnowledgeJsonRef(doclingJsonRef)
    ? safeRepoRelativePath(doclingJsonRef)
    : null;
  if (!safeDoclingJsonRef) throw new Error("docling json ref must be under _workspaces/knowledge and json");
  const traceabilityId = normalizeSimpleId(
    options.traceabilityId ?? `${index?.index_id ?? "unknown"}_traceability_${stableHash(safeDoclingJsonRef).slice(0, 8)}`,
    "traceability_id",
  );
  const generatedAtUtc = formatTimestampUtc(options.now);

  const base = {
    schema_version: SOURCE_TEXT_TRACEABILITY_SIDECAR_SCHEMA_VERSION,
    kind: "source_text_traceability_sidecar",
    traceability_id: traceabilityId,
    generator_id: SOURCE_TEXT_TRACEABILITY_SIDECAR_GENERATOR_ID,
    generated_at_utc: generatedAtUtc,
    status: "blocked_invalid_source_text_index",
    source_refs: {
      source_text_index_ref: options.sourceTextIndexRef ?? null,
      index_id: index?.index_id ?? null,
      source_card_ref: index?.source_refs?.source_card_ref ?? null,
      source_id: index?.source_refs?.source_id ?? null,
      source_ref: index?.source_refs?.source_ref ?? null,
      derived_text_ref: index?.source_refs?.derived_text_ref ?? null,
      docling_json_ref: safeDoclingJsonRef,
    },
    boundary: sourceTextTraceabilitySidecarBoundary(),
    counts: {
      chunk_count: Array.isArray(index?.chunks) ? index.chunks.length : 0,
      mapped_chunk_count: 0,
      weak_mapped_chunk_count: 0,
      unmapped_chunk_count: Array.isArray(index?.chunks) ? index.chunks.length : 0,
      page_backed_chunk_count: 0,
    },
    chunks: [],
    page_summary: [],
    validation: {
      status: "blocked",
      upstream_validation: indexValidation,
    },
  };

  if (indexValidation.status !== "pass") return base;

  const doclingJson = await readJson(path.join(repoRoot, safeDoclingJsonRef));
  const doclingProfile = buildDoclingTraceabilityProfile(doclingJson);
  const chunkMappings = (index.chunks ?? []).map((chunk) => mapChunkToDoclingTrace(chunk, doclingProfile));
  const mappedChunkCount = chunkMappings.filter((chunk) => chunk.traceability_status === "mapped").length;
  const weakMappedChunkCount = chunkMappings.filter((chunk) => chunk.traceability_status === "weak_mapped").length;
  const unmappedChunkCount = chunkMappings.filter((chunk) => chunk.traceability_status === "unmapped").length;
  const pageBackedChunkCount = mappedChunkCount + weakMappedChunkCount;
  const chunkCount = chunkMappings.length;
  return {
    ...base,
    status: pageBackedChunkCount === 0 ? "blocked_no_page_traceability" : unmappedChunkCount > 0 || weakMappedChunkCount > 0 ? "partial_page_traceability" : "page_traceability_ready",
    docling_summary: {
      schema_name: typeof doclingJson?.schema_name === "string" ? doclingJson.schema_name : null,
      version: typeof doclingJson?.version === "string" ? doclingJson.version : null,
      page_count: doclingProfile.pageCount,
      text_element_count: doclingProfile.textElementCount,
      table_count: doclingProfile.tableCount,
      picture_count: doclingProfile.pictureCount,
    },
    counts: {
      chunk_count: chunkCount,
      mapped_chunk_count: mappedChunkCount,
      weak_mapped_chunk_count: weakMappedChunkCount,
      unmapped_chunk_count: unmappedChunkCount,
      page_backed_chunk_count: pageBackedChunkCount,
      page_count: doclingProfile.pageCount,
      text_element_count: doclingProfile.textElementCount,
      table_count: doclingProfile.tableCount,
      picture_count: doclingProfile.pictureCount,
    },
    quality_gates: {
      chunk_page_traceability: pageBackedChunkCount === chunkCount && weakMappedChunkCount === 0 ? "pass" : pageBackedChunkCount > 0 ? "partial" : "blocked",
      table_traceability: doclingProfile.tableCount > 0 ? "metadata_only_labels_present" : "not_detected",
      figure_traceability: doclingProfile.pictureCount > 0 ? "page_presence_only" : "not_detected",
      citation_page_audit_ready: pageBackedChunkCount > 0,
      canon_promotion_allowed: false,
    },
    chunks: chunkMappings,
    page_summary: doclingProfile.pageSummary,
    validation: {
      status: "unchecked",
      upstream_validation: indexValidation.status,
    },
  };
}

export async function writeSourceTextTraceabilitySidecar(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const sidecar = await buildSourceTextTraceabilitySidecar(options);
  const outputRef = options.outputRef ?? defaultTraceabilitySidecarOutputRef(sidecar);
  const outputPath = path.join(repoRoot, safeSourceTextTraceabilitySidecarOutputPath(outputRef));
  await writeJson(outputPath, sidecar);
  return {
    status: "written",
    traceability_sidecar_ref: normalizeRepoPath(path.relative(repoRoot, outputPath)),
    traceability_id: sidecar.traceability_id,
    sidecar_status: sidecar.status,
    chunk_count: sidecar.counts.chunk_count,
    page_backed_chunk_count: sidecar.counts.page_backed_chunk_count ?? 0,
  };
}

export async function loadSourceTextTraceabilitySidecar({ repoRoot = process.cwd(), traceabilitySidecarRef } = {}) {
  if (!traceabilitySidecarRef) throw new Error("traceability_sidecar_ref_required");
  const root = path.resolve(repoRoot);
  return readJson(path.join(root, safeRepoRelativePath(traceabilitySidecarRef)));
}

export function validateSourceTextTraceabilitySidecar(sidecar) {
  const blockers = [];
  const chunks = Array.isArray(sidecar?.chunks) ? sidecar.chunks : [];
  const pageSummary = Array.isArray(sidecar?.page_summary) ? sidecar.page_summary : [];
  const counts = sidecar?.counts ?? {};
  const countValue = (key) => counts?.[key];
  const hasOptionalCount = (key) => counts && typeof counts === "object" && counts[key] !== undefined && counts[key] !== null;
  const hasPageSpanPages = (chunk) => Array.isArray(chunk?.page_span?.pages) && chunk.page_span.pages.length > 0;
  const mappedChunkCount = chunks.filter((chunk) => chunk?.traceability_status === "mapped").length;
  const weakMappedChunkCount = chunks.filter((chunk) => chunk?.traceability_status === "weak_mapped").length;
  const unmappedChunkCount = chunks.filter((chunk) => chunk?.traceability_status === "unmapped").length;
  const pageBackedChunkCount = chunks.filter((chunk) =>
    ["mapped", "weak_mapped"].includes(chunk?.traceability_status) && hasPageSpanPages(chunk)
  ).length;
  const pageSummaryTableCount = pageSummary.reduce((sum, page) => sum + (Number.isInteger(page?.table_count) ? page.table_count : 0), 0);
  const pageSummaryPictureCount = pageSummary.reduce((sum, page) => sum + (Number.isInteger(page?.picture_count) ? page.picture_count : 0), 0);

  if (sidecar?.schema_version !== SOURCE_TEXT_TRACEABILITY_SIDECAR_SCHEMA_VERSION) blockers.push("schema_version_mismatch");
  if (sidecar?.kind !== "source_text_traceability_sidecar") blockers.push("kind_must_be_source_text_traceability_sidecar");
  if (!isSafeId(sidecar?.traceability_id)) blockers.push("traceability_id_unsafe");
  if (!["page_traceability_ready", "partial_page_traceability", "blocked_no_page_traceability", "blocked_invalid_source_text_index"].includes(sidecar?.status)) {
    blockers.push("traceability_sidecar_status_unknown");
  }
  if (sidecar?.boundary?.storage_scope !== "_workspaces_private_payload") blockers.push("storage_scope_must_be_workspaces_private_payload");
  if (sidecar?.boundary?.chunk_text_included !== false) blockers.push("chunk_text_must_not_be_included");
  if (sidecar?.boundary?.source_text_included !== false) blockers.push("source_text_must_not_be_included");
  if (sidecar?.boundary?.public_repo_safe !== false) blockers.push("traceability_sidecar_must_not_be_public_repo_safe");
  if (!safeWorkspaceKnowledgeRef(sidecar?.source_refs?.source_ref)) blockers.push("source_ref_must_be_under_workspaces_knowledge");
  if (!safeWorkspaceKnowledgeJsonRef(sidecar?.source_refs?.docling_json_ref)) blockers.push("docling_json_ref_must_be_under_workspaces_knowledge_json");
  if (!Array.isArray(sidecar?.chunks)) blockers.push("chunks_must_be_array");
  if (!Array.isArray(sidecar?.page_summary)) blockers.push("page_summary_must_be_array");
  if (countValue("chunk_count") !== chunks.length) blockers.push("chunk_count_mismatch");
  if (countValue("page_backed_chunk_count") !== pageBackedChunkCount) blockers.push("page_backed_chunk_count_mismatch");
  if (countValue("mapped_chunk_count") !== mappedChunkCount) blockers.push("mapped_chunk_count_mismatch");
  if (countValue("weak_mapped_chunk_count") !== weakMappedChunkCount) blockers.push("weak_mapped_chunk_count_mismatch");
  if (countValue("unmapped_chunk_count") !== unmappedChunkCount) blockers.push("unmapped_chunk_count_mismatch");
  if (hasOptionalCount("page_count") && countValue("page_count") !== pageSummary.length) blockers.push("page_count_mismatch");
  if (hasOptionalCount("table_count") && countValue("table_count") !== pageSummaryTableCount) blockers.push("page_summary_table_count_mismatch");
  if (hasOptionalCount("picture_count") && countValue("picture_count") !== pageSummaryPictureCount) blockers.push("page_summary_picture_count_mismatch");
  for (const chunk of chunks) {
    if (!isSafeId(chunk?.chunk_id)) blockers.push("chunk_id_unsafe");
    if (!["mapped", "weak_mapped", "unmapped"].includes(chunk?.traceability_status)) blockers.push("chunk_traceability_status_unknown");
    if (!Array.isArray(chunk?.layout_labels)) blockers.push("chunk_layout_labels_must_be_array");
    if (chunk?.warning_codes !== undefined && !Array.isArray(chunk.warning_codes)) blockers.push("chunk_warning_codes_must_be_array");
    const warningCodes = Array.isArray(chunk?.warning_codes) ? chunk.warning_codes : [];
    if (chunk?.traceability_status === "weak_mapped" && !warningCodes.includes("weak_token_overlap_page_span")) blockers.push("weak_mapped_chunk_missing_warning");
    if (chunk?.traceability_status === "unmapped" && !warningCodes.includes("chunk_page_span_unmapped")) blockers.push("unmapped_chunk_missing_warning");
    if (chunk && typeof chunk === "object" && Object.hasOwn(chunk, "chunk_text")) blockers.push("chunk_text_must_not_be_included");
    if (chunk && typeof chunk === "object" && Object.hasOwn(chunk, "source_text")) blockers.push("source_text_must_not_be_included");
    if (chunk?.page_span !== null && chunk?.page_span !== undefined) {
      if (!Number.isInteger(chunk.page_span.start_page) || chunk.page_span.start_page < 1) blockers.push("page_span_start_page_invalid");
      if (!Number.isInteger(chunk.page_span.end_page) || chunk.page_span.end_page < chunk.page_span.start_page) blockers.push("page_span_end_page_invalid");
      if (!Array.isArray(chunk.page_span.pages)) blockers.push("page_span_pages_must_be_array");
    }
  }
  for (const page of pageSummary) {
    if (!Array.isArray(page?.warning_codes)) blockers.push("page_summary_warning_codes_must_be_array");
    const warningCodes = Array.isArray(page?.warning_codes) ? page.warning_codes : [];
    if (Number.isInteger(page?.table_count) && page.table_count > 0 && !warningCodes.includes("table_present")) blockers.push("page_summary_warning_code_mismatch");
    if (Number.isInteger(page?.picture_count) && page.picture_count > 0 && !warningCodes.includes("picture_present")) blockers.push("page_summary_warning_code_mismatch");
    if (page?.text_element_count === 0 && !warningCodes.includes("no_docling_text_elements")) blockers.push("page_summary_warning_code_mismatch");
    if (page && typeof page === "object" && Object.hasOwn(page, "chunk_text")) blockers.push("chunk_text_must_not_be_included");
    if (page && typeof page === "object" && Object.hasOwn(page, "source_text")) blockers.push("source_text_must_not_be_included");
  }
  blockers.push(...findSourceTextArtifactContamination(sidecar, "source_text_traceability_sidecar"));
  return {
    schema_version: SOURCE_TEXT_TRACEABILITY_SIDECAR_VALIDATION_SCHEMA_VERSION,
    kind: "source_text_traceability_sidecar_validation",
    status: blockers.length === 0 ? "pass" : "blocked",
    traceability_id: sidecar?.traceability_id ?? null,
    blocker_count: blockers.length,
    blockers: [...new Set(blockers)].sort(),
    counts: {
      chunk_count: sidecar?.counts?.chunk_count ?? null,
      page_backed_chunk_count: sidecar?.counts?.page_backed_chunk_count ?? null,
      unmapped_chunk_count: sidecar?.counts?.unmapped_chunk_count ?? null,
    },
    boundary: {
      storage_scope: sidecar?.boundary?.storage_scope ?? null,
      chunk_text_included: sidecar?.boundary?.chunk_text_included === true,
      source_text_included: sidecar?.boundary?.source_text_included === true,
      public_repo_safe: sidecar?.boundary?.public_repo_safe === true,
    },
  };
}

export async function buildSourceTextAnswerRun(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const question = String(options.question ?? "").trim();
  if (!question) throw new Error("source text answer run requires --question");
  const index = options.sourceTextIndex ?? await loadSourceTextIndex({
    repoRoot,
    sourceTextIndexRef: options.sourceTextIndexRef,
  });
  const indexValidation = validateSourceTextIndex(index);
  const traceabilitySidecar = options.traceabilitySidecar ?? (options.traceabilitySidecarRef
    ? await loadSourceTextTraceabilitySidecar({ repoRoot, traceabilitySidecarRef: options.traceabilitySidecarRef })
    : null);
  const traceabilityByChunkId = traceabilitySidecar
    ? new Map((traceabilitySidecar.chunks ?? []).map((chunk) => [chunk.chunk_id, chunk]))
    : new Map();
  const nativePageTraceabilityAvailable = indexChunksHaveNativePageTraceability(index);
  const runId = normalizeSimpleId(
    options.runId ?? `source_text_answer_run_${stableHash(`${index?.index_id ?? "unknown"}:${question}`).slice(0, 12)}`,
    "run_id",
  );
  const base = {
    schema_version: SOURCE_TEXT_ANSWER_RUN_SCHEMA_VERSION,
    kind: "source_text_answer_run",
    run_id: runId,
    generator_id: SOURCE_TEXT_ANSWER_RUN_GENERATOR_ID,
    generated_at_utc: formatTimestampUtc(options.now),
    status: "blocked_invalid_source_text_index",
    source_refs: {
      source_text_index_ref: options.sourceTextIndexRef ?? null,
      index_id: index?.index_id ?? null,
      source_card_ref: index?.source_refs?.source_card_ref ?? null,
      source_id: index?.source_refs?.source_id ?? null,
      source_ref: index?.source_refs?.source_ref ?? null,
      traceability_sidecar_ref: options.traceabilitySidecarRef ?? null,
    },
    boundary: sourceTextAnswerRunBoundary({ citationPageTraceabilityChecked: Boolean(traceabilitySidecar) || nativePageTraceabilityAvailable }),
    query: {
      raw_query_persisted: false,
      query_fingerprint: stableHash(`source_text_answer_query:${question}`),
      query_token_fingerprints: [...tokenize(question)].map(stableHash),
    },
  };
  if (indexValidation.status !== "pass") {
    return {
      ...base,
      response: {
        answer_uses_source_text: false,
        retrieved_chunk_count: 0,
        answer_text: "Source-text answer run is blocked because the source-text index did not validate.",
        citations: [],
      },
      validation: {
        status: "blocked",
        upstream_validation: indexValidation,
      },
    };
  }
  const retrievedChunks = retrieveChunks(index, question, numericOption(options.maxChunks, 3));
  return {
    ...base,
    status: retrievedChunks.length > 0 ? "source_text_answer" : "no_source_text_hit",
    response: {
      answer_uses_source_text: retrievedChunks.length > 0,
      retrieved_chunk_count: retrievedChunks.length,
      answer_text: renderExtractiveAnswerText({ index, retrievedChunks }),
      citations: retrievedChunks.map((chunk) => sourceTextCitationForChunk(chunk, traceabilityByChunkId.get(chunk.chunk_id))),
    },
    validation: {
      status: "unchecked",
      upstream_validation: indexValidation.status,
    },
  };
}

export async function writeSourceTextAnswerRun(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const run = await buildSourceTextAnswerRun(options);
  const outputRef = options.outputRef ?? defaultAnswerRunOutputRef(run);
  const outputPath = path.join(repoRoot, safeSourceTextAnswerRunOutputPath(outputRef));
  await writeJson(outputPath, run);
  return {
    status: "written",
    source_text_answer_run_ref: normalizeRepoPath(path.relative(repoRoot, outputPath)),
    run_id: run.run_id,
    response_status: run.status,
    retrieved_chunk_count: run.response.retrieved_chunk_count,
  };
}

export async function loadSourceTextAnswerRun({ repoRoot = process.cwd(), runRef } = {}) {
  if (!runRef) throw new Error("source_text_answer_run_ref_required");
  const root = path.resolve(repoRoot);
  return readJson(path.join(root, safeRepoRelativePath(runRef)));
}

export function validateSourceTextAnswerRun(run) {
  const blockers = [];
  if (run?.schema_version !== SOURCE_TEXT_ANSWER_RUN_SCHEMA_VERSION) blockers.push("schema_version_mismatch");
  if (run?.kind !== "source_text_answer_run") blockers.push("kind_must_be_source_text_answer_run");
  if (!isSafeId(run?.run_id)) blockers.push("run_id_unsafe");
  if (!["source_text_answer", "no_source_text_hit", "blocked_invalid_source_text_index"].includes(run?.status)) {
    blockers.push("source_text_answer_run_status_unknown");
  }
  if (run?.query?.raw_query_persisted !== false) blockers.push("raw_query_must_not_be_persisted");
  if (!Array.isArray(run?.query?.query_token_fingerprints)) blockers.push("query_token_fingerprints_required");
  if (run?.boundary?.storage_scope !== "_workspaces_private_payload") blockers.push("storage_scope_must_be_workspaces_private_payload");
  if (run?.boundary?.public_repo_safe !== false) blockers.push("source_text_answer_run_must_not_be_public_repo_safe");
  const answerText = run?.response?.answer_text;
  if (typeof answerText !== "string" || answerText.trim().length === 0) blockers.push("answer_text_required");
  if (!Array.isArray(run?.response?.citations)) blockers.push("citations_must_be_array");
  for (const citation of run?.response?.citations ?? []) {
    if (!isSafeId(citation?.chunk_id)) blockers.push("citation_chunk_id_unsafe");
    if (!safeWorkspaceKnowledgeRef(citation?.source_ref)) blockers.push("citation_source_ref_must_be_under_workspaces_knowledge");
    if (citation?.page_span !== undefined && citation.page_span !== null) {
      if (!Number.isInteger(citation.page_span.start_page) || citation.page_span.start_page < 1) blockers.push("citation_page_span_start_page_invalid");
      if (!Number.isInteger(citation.page_span.end_page) || citation.page_span.end_page < citation.page_span.start_page) blockers.push("citation_page_span_end_page_invalid");
      if (!Array.isArray(citation.page_span.pages)) blockers.push("citation_page_span_pages_must_be_array");
    }
    if (citation?.traceability_status !== undefined && !["mapped", "weak_mapped", "unmapped", "not_checked"].includes(citation.traceability_status)) {
      blockers.push("citation_traceability_status_unknown");
    }
  }
  blockers.push(...findSourceTextArtifactContamination(run, "source_text_answer_run", {
    allowedPayloadTrails: SOURCE_TEXT_ANSWER_RUN_PAYLOAD_TRAILS,
  }));
  return {
    schema_version: SOURCE_TEXT_ANSWER_RUN_VALIDATION_SCHEMA_VERSION,
    kind: "source_text_answer_run_validation",
    status: blockers.length === 0 ? "pass" : "blocked",
    run_id: run?.run_id ?? null,
    blocker_count: blockers.length,
    blockers: [...new Set(blockers)].sort(),
    boundary: {
      storage_scope: run?.boundary?.storage_scope ?? null,
      source_text_loaded: run?.boundary?.source_text_loaded === true,
      raw_query_persisted: run?.query?.raw_query_persisted === true,
      public_repo_safe: run?.boundary?.public_repo_safe === true,
    },
  };
}

export function renderSourceTextAnswerRunText(run) {
  const lines = [
    run.response?.answer_text ?? "No source-text answer text was generated.",
    "",
    `상태: ${run.status}`,
    `검색된 본문 조각: ${run.response?.retrieved_chunk_count ?? 0}`,
    `Source-text index: ${run.source_refs?.source_text_index_ref ?? "n/a"}`,
    "근거 chunks:",
  ];
  for (const citation of run.response?.citations ?? []) {
    const pageText = citation.page_span ? `, pages=${citation.page_span.pages.join(",")}` : "";
    lines.push(`- ${citation.chunk_id} (${citation.source_ref}, score=${citation.score}${pageText})`);
  }
  if ((run.response?.citations ?? []).length === 0) lines.push("- 없음");
  lines.push("");
  lines.push("경계: source-text answer run. 원문/추출문 기반 private workspace 산출물이며 public canon, NotebookLM 답변, owner approval 이 아닙니다.");
  return `${lines.join("\n")}\n`;
}

function sourceTextIndexBoundary({ sourceTextLoaded }) {
  return {
    storage_scope: "_workspaces_private_payload",
    source_text_loaded: sourceTextLoaded,
    source_text_payloads_included: sourceTextLoaded,
    public_repo_safe: false,
    notebooklm_answers_included: false,
    runtime_absolute_paths_included: false,
    secrets_or_session_included: false,
    owner_approval_claimed: false,
    public_canon_promotion_allowed: false,
  };
}

function sourceTextTraceabilitySidecarBoundary() {
  return {
    storage_scope: "_workspaces_private_payload",
    source_text_loaded: true,
    source_text_included: false,
    chunk_text_included: false,
    public_repo_safe: false,
    notebooklm_answers_included: false,
    runtime_absolute_paths_included: false,
    secrets_or_session_included: false,
    owner_approval_claimed: false,
    public_canon_promotion_allowed: false,
  };
}

function sourceTextAnswerRunBoundary({ citationPageTraceabilityChecked = false } = {}) {
  return {
    storage_scope: "_workspaces_private_payload",
    source_text_loaded: true,
    answer_uses_source_text: true,
    citation_page_traceability_checked: citationPageTraceabilityChecked,
    public_repo_safe: false,
    notebooklm_answers_included: false,
    runtime_absolute_paths_included: false,
    raw_query_persisted: false,
    owner_approval_claimed: false,
    public_canon_promotion_allowed: false,
  };
}

function blockedSourceTextIndexPermissions() {
  return {
    source_text_retrieval_allowed: false,
    index_build_allowed: false,
    answer_synthesis_allowed: false,
    public_canon_promotion_allowed: false,
    notebooklm_packet_allowed: false,
  };
}

function normalizeSourceText(rawText, sourceKind = "text") {
  const withoutBom = String(rawText ?? "").replace(/^\uFEFF/u, "");
  const normalized = withoutBom.replace(/\r\n?/g, "\n").replace(/[ \t]+$/gm, "");
  if (sourceKind === "markdown" || sourceKind === "md" || sourceKind === "markdown_source_text") {
    return normalized.replace(/^---\n[\s\S]*?\n---\n/u, "").trim();
  }
  return normalized.trim();
}

function sourceTextCitationForChunk(chunk, traceability) {
  const citation = {
    chunk_id: chunk.chunk_id,
    source_ref: chunk.source_ref,
    score: chunk.score,
  };
  if (!traceability) {
    const nativePageSpan = normalizeChunkPageSpan(chunk?.page_span);
    if (nativePageSpan) {
      return {
        ...citation,
        page_span: nativePageSpan,
        traceability_status: ["mapped", "weak_mapped", "unmapped"].includes(chunk?.traceability_status) ? chunk.traceability_status : "mapped",
        layout_labels: Array.isArray(chunk?.layout_labels) ? chunk.layout_labels : [],
        warning_codes: Array.isArray(chunk?.warning_codes) ? chunk.warning_codes : [],
      };
    }
    return {
      ...citation,
      traceability_status: "not_checked",
    };
  }
  return {
    ...citation,
    page_span: traceability.page_span ?? null,
    traceability_status: traceability.traceability_status,
    layout_labels: traceability.layout_labels ?? [],
    warning_codes: traceability.warning_codes ?? [],
  };
}

function buildDoclingTraceabilityProfile(doclingJson) {
  const refMap = new Map();
  for (const collectionName of ["texts", "tables", "pictures", "groups"]) {
    for (const item of doclingJson?.[collectionName] ?? []) {
      if (typeof item?.self_ref === "string") refMap.set(item.self_ref, { ...item, collectionName });
    }
  }
  const ordered = [];
  const visitedRefs = new Set();
  for (const child of doclingJson?.body?.children ?? []) {
    collectDoclingOrderedElements(child?.$ref, refMap, ordered, visitedRefs);
  }
  const remaining = [];
  for (const collectionName of ["texts", "tables", "pictures"]) {
    for (const item of doclingJson?.[collectionName] ?? []) {
      if (!visitedRefs.has(item?.self_ref)) {
        remaining.push(doclingTraceabilityElement({ ...item, collectionName }));
      }
    }
  }
  ordered.push(...remaining.sort(compareDoclingElementsByPage));
  const pageMap = new Map();
  for (const [key, page] of Object.entries(doclingJson?.pages ?? {})) {
    const pageNo = Number(page?.page_no ?? key);
    if (Number.isInteger(pageNo) && pageNo > 0) {
      pageMap.set(pageNo, {
        page_no: pageNo,
        text_element_count: 0,
        table_count: 0,
        picture_count: 0,
      });
    }
  }
  const textElements = ordered.filter((element) => element.element_kind === "text" || element.element_kind === "table");
  let cursor = 0;
  for (const element of textElements) {
    element.normalized_start = cursor;
    element.normalized_end = cursor + element.normalized_text.length;
    cursor = element.normalized_end;
  }
  for (const element of ordered) {
    for (const pageNo of element.pages) {
      const summary = pageMap.get(pageNo) ?? {
        page_no: pageNo,
        text_element_count: 0,
        table_count: 0,
        picture_count: 0,
      };
      if (element.element_kind === "text") summary.text_element_count += 1;
      if (element.element_kind === "table") summary.table_count += 1;
      if (element.element_kind === "picture") summary.picture_count += 1;
      pageMap.set(pageNo, summary);
    }
  }
  return {
    elements: ordered,
    textElements,
    normalizedDocumentText: textElements.map((element) => element.normalized_text).join(""),
    pageSummary: [...pageMap.values()]
      .sort((a, b) => a.page_no - b.page_no)
      .map((page) => ({
        ...page,
        warning_codes: [
          ...(page.text_element_count === 0 ? ["no_docling_text_elements"] : []),
          ...(page.picture_count > 0 ? ["picture_present"] : []),
          ...(page.table_count > 0 ? ["table_present"] : []),
        ],
      })),
    pageCount: Object.keys(doclingJson?.pages ?? {}).length,
    textElementCount: Array.isArray(doclingJson?.texts) ? doclingJson.texts.length : 0,
    tableCount: Array.isArray(doclingJson?.tables) ? doclingJson.tables.length : 0,
    pictureCount: Array.isArray(doclingJson?.pictures) ? doclingJson.pictures.length : 0,
  };
}

function collectDoclingOrderedElements(ref, refMap, ordered, visitedRefs) {
  if (!ref || visitedRefs.has(ref)) return;
  const item = refMap.get(ref);
  if (!item) return;
  visitedRefs.add(ref);
  if (item.collectionName === "groups") {
    for (const child of item.children ?? []) collectDoclingOrderedElements(child?.$ref, refMap, ordered, visitedRefs);
    return;
  }
  ordered.push(doclingTraceabilityElement(item));
}

function doclingTraceabilityElement(item) {
  const elementKind = item.collectionName === "tables" ? "table" : item.collectionName === "pictures" ? "picture" : "text";
  const text = elementKind === "table" ? doclingTableText(item) : String(item?.text ?? item?.orig ?? "");
  const pages = doclingPagesForElement(item);
  return {
    self_ref: item.self_ref,
    element_kind: elementKind,
    label: safeDoclingLabel(item.label ?? elementKind),
    pages,
    text,
    normalized_text: normalizeTraceText(text),
    token_set: tokenize(text),
  };
}

function compareDoclingElementsByPage(a, b) {
  return doclingElementPrimaryPage(a) - doclingElementPrimaryPage(b) || String(a.self_ref ?? "").localeCompare(String(b.self_ref ?? ""));
}

function doclingElementPrimaryPage(element) {
  return Array.isArray(element?.pages) && element.pages.length > 0 ? element.pages[0] : Number.MAX_SAFE_INTEGER;
}

function doclingTableText(table) {
  const cells = table?.data?.table_cells ?? [];
  return cells.map((cell) => String(cell?.text ?? "")).filter(Boolean).join(" ");
}

function doclingPagesForElement(item) {
  const pages = new Set();
  for (const prov of item?.prov ?? []) {
    const pageNo = Number(prov?.page_no);
    if (Number.isInteger(pageNo) && pageNo > 0) pages.add(pageNo);
  }
  return [...pages].sort((a, b) => a - b);
}

function mapChunkToDoclingTrace(chunk, doclingProfile) {
  const nativeTrace = nativeChunkTraceResult(chunk, doclingProfile);
  if (nativeTrace) return nativeTrace;
  const chunkTextValue = String(chunk?.chunk_text ?? "");
  const normalizedChunk = normalizeTraceText(chunkTextValue);
  const exactRange = locateNormalizedChunkRange(normalizedChunk, doclingProfile.normalizedDocumentText);
  if (exactRange) {
    return chunkTraceResult(chunk, doclingProfile, elementsOverlappingRange(doclingProfile.textElements, exactRange), "normalized_text_anchor", "mapped");
  }
  const tokenMatchElements = bestTokenMatchElements(chunkTextValue, doclingProfile.textElements);
  if (tokenMatchElements.length > 0) {
    return chunkTraceResult(chunk, doclingProfile, tokenMatchElements, "token_overlap", "weak_mapped");
  }
  return {
    chunk_id: chunk.chunk_id,
    chunk_index: chunk.chunk_index,
    source_ref: chunk.source_ref,
    traceability_status: "unmapped",
    match_method: "none",
    page_span: null,
    layout_labels: [],
    element_ref_count: 0,
    warning_codes: ["chunk_page_span_unmapped"],
  };
}

function nativeChunkTraceResult(chunk, doclingProfile) {
  const pageSpan = normalizeChunkPageSpan(chunk?.page_span);
  if (!pageSpan) return null;
  const pageSummaries = doclingPageSummariesForPages(doclingProfile, pageSpan.pages);
  const traceabilityStatus = ["mapped", "weak_mapped", "unmapped"].includes(chunk?.traceability_status)
    ? chunk.traceability_status
    : "mapped";
  const warningCodes = [
    ...(Array.isArray(chunk?.warning_codes) ? chunk.warning_codes : []),
    ...doclingWarningCodes({ pages: pageSpan.pages, pageSummaries, traceabilityStatus }),
  ];
  return {
    chunk_id: chunk.chunk_id,
    chunk_index: chunk.chunk_index,
    source_ref: chunk.source_ref,
    traceability_status: traceabilityStatus,
    match_method: chunk?.match_method ?? "chunk_native_page_span",
    page_span: pageSpan,
    layout_labels: Array.isArray(chunk?.layout_labels) ? chunk.layout_labels : [],
    element_ref_count: Number.isInteger(chunk?.element_ref_count) ? chunk.element_ref_count : 0,
    warning_codes: [...new Set(warningCodes)].sort(),
  };
}

function locateNormalizedChunkRange(normalizedChunk, normalizedDocumentText) {
  if (!normalizedChunk || normalizedChunk.length < 12) return null;
  const fullIndex = normalizedDocumentText.indexOf(normalizedChunk);
  if (fullIndex >= 0) return { start: fullIndex, end: fullIndex + normalizedChunk.length };
  const anchorLength = Math.min(120, Math.max(40, Math.floor(normalizedChunk.length / 4)));
  const startAnchor = normalizedChunk.slice(0, anchorLength);
  const endAnchor = normalizedChunk.slice(-anchorLength);
  const startIndex = normalizedDocumentText.indexOf(startAnchor);
  const endIndex = normalizedDocumentText.lastIndexOf(endAnchor);
  if (startIndex >= 0 && endIndex >= startIndex) return { start: startIndex, end: endIndex + endAnchor.length };
  return null;
}

function elementsOverlappingRange(elements, range) {
  return elements.filter((element) => element.normalized_end > range.start && element.normalized_start < range.end);
}

function bestTokenMatchElements(chunkTextValue, elements) {
  const chunkTokens = tokenize(chunkTextValue);
  if (chunkTokens.size === 0) return [];
  const matches = elements
    .map((element) => {
      const matched = [...chunkTokens].filter((token) => element.token_set.has(token));
      const denominator = Math.max(1, Math.min(chunkTokens.size, element.token_set.size));
      return {
        element,
        matched_count: matched.length,
        score: matched.length / denominator,
      };
    })
    .filter((match) => match.matched_count >= 2 && match.score >= 0.35)
    .sort((a, b) => b.score - a.score || b.matched_count - a.matched_count)
    .slice(0, 5);
  const bestScore = matches[0]?.score ?? 0;
  return matches.filter((match) => match.score >= bestScore * 0.8).map((match) => match.element);
}

function chunkTraceResult(chunk, doclingProfile, elements, matchMethod, traceabilityStatus) {
  const pages = [...new Set(elements.flatMap((element) => element.pages))].sort((a, b) => a - b);
  const layoutLabels = [...new Set(elements.map((element) => element.label).filter(Boolean))].sort();
  const pageSummaries = doclingPageSummariesForPages(doclingProfile, pages);
  const warningCodes = doclingWarningCodes({ pages, pageSummaries, traceabilityStatus });
  return {
    chunk_id: chunk.chunk_id,
    chunk_index: chunk.chunk_index,
    source_ref: chunk.source_ref,
    traceability_status: pages.length > 0 ? traceabilityStatus : "unmapped",
    match_method: matchMethod,
    page_span: pages.length > 0 ? {
      start_page: pages[0],
      end_page: pages[pages.length - 1],
      pages,
    } : null,
    layout_labels: layoutLabels,
    element_ref_count: elements.length,
    warning_codes: [...new Set(warningCodes)].sort(),
  };
}

function doclingPageSummariesForPages(doclingProfile, pages) {
  return pages.map((pageNo) => doclingProfile.pageSummary.find((page) => page.page_no === pageNo)).filter(Boolean);
}

function doclingWarningCodes({ pages, pageSummaries, traceabilityStatus }) {
  return [
    ...(traceabilityStatus === "weak_mapped" ? ["weak_token_overlap_page_span"] : []),
    ...(pages.length === 0 ? ["chunk_page_span_unmapped"] : []),
    ...(pages.length > 1 ? ["multi_page_chunk"] : []),
    ...(pageSummaries.some((page) => page.picture_count > 0) ? ["picture_present_on_page"] : []),
    ...(pageSummaries.some((page) => page.table_count > 0) ? ["table_present_on_page"] : []),
  ];
}

function normalizeChunkPageSpan(pageSpan) {
  if (!pageSpan || typeof pageSpan !== "object") return null;
  const pages = Array.isArray(pageSpan.pages)
    ? [...new Set(pageSpan.pages.map(Number).filter((pageNo) => Number.isInteger(pageNo) && pageNo > 0))].sort((a, b) => a - b)
    : [];
  const startPage = Number(pageSpan.start_page ?? pages[0]);
  const endPage = Number(pageSpan.end_page ?? pages[pages.length - 1]);
  if (!Number.isInteger(startPage) || startPage < 1) return null;
  if (!Number.isInteger(endPage) || endPage < startPage) return null;
  const normalizedPages = pages.length > 0 ? pages : [startPage];
  return {
    start_page: startPage,
    end_page: endPage,
    pages: normalizedPages,
  };
}

function indexChunksHaveNativePageTraceability(index) {
  return Array.isArray(index?.chunks) && index.chunks.some((chunk) => normalizeChunkPageSpan(chunk?.page_span));
}

function safeDoclingLabel(value) {
  return String(value ?? "unknown")
    .replace(/[^A-Za-z0-9_.:-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "unknown";
}

function normalizeTraceText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/gu, "")
    .replace(/[|#*_`~>()[\]{}"'“”‘’.,;:!?\\/\\-]+/gu, "");
}

function sourceCardSourceRef(card) {
  const value = card?.source_ref;
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && typeof value.repo_relative_path === "string") {
    return value.repo_relative_path;
  }
  return null;
}

function sourceCardSyncReadyRef(card) {
  for (const key of ["source_sync_ready_ref", "sync_ready_ref", "ready_manifest_ref"]) {
    const value = card?.[key];
    if (typeof value === "string") return value;
    if (value && typeof value === "object" && typeof value.repo_relative_path === "string") {
      return value.repo_relative_path;
    }
  }
  return null;
}

function chunkText(text, { sourceId, sourceRef, maxChars }) {
  const paragraphs = text
    .split(/\n{2,}/u)
    .map((item) => item.trim())
    .filter(Boolean);
  const chunks = [];
  let current = "";
  for (const paragraph of paragraphs) {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }
    if (current) chunks.push(current);
    if (paragraph.length <= maxChars) {
      current = paragraph;
    } else {
      for (let start = 0; start < paragraph.length; start += maxChars) {
        chunks.push(paragraph.slice(start, start + maxChars).trim());
      }
      current = "";
    }
  }
  if (current) chunks.push(current);
  return chunks.filter(Boolean).map((chunkTextValue, index) => {
    const tokenSet = tokenize(chunkTextValue);
    return {
      chunk_id: `${sourceId}_chunk_${String(index + 1).padStart(3, "0")}`,
      source_ref: sourceRef,
      chunk_index: index,
      chunk_text: chunkTextValue,
      token_fingerprints: [...tokenSet].map(stableHash).sort(),
      char_count: chunkTextValue.length,
    };
  });
}

function doclingTextForIndex(doclingProfile) {
  return (doclingProfile.textElements ?? [])
    .map((element) => String(element.text ?? "").trim())
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

function chunkDoclingElementOrderText(doclingProfile, { sourceId, sourceRef, maxChars }) {
  const chunks = [];
  let currentParts = [];
  let currentElements = [];
  const flush = () => {
    if (currentParts.length === 0) return;
    chunks.push(doclingChunkFromParts({
      sourceId,
      sourceRef,
      chunkIndex: chunks.length,
      parts: currentParts,
      elements: currentElements,
      doclingProfile,
    }));
    currentParts = [];
    currentElements = [];
  };

  for (const element of doclingProfile.textElements ?? []) {
    const text = String(element.text ?? "").trim();
    if (!text) continue;
    for (const piece of splitDoclingTextPiece(text, maxChars)) {
      if (currentParts.length > 0 && shouldFlushDoclingPageChunk(currentElements, element)) flush();
      const candidateLength = currentParts.length === 0
        ? piece.length
        : currentParts.join("\n\n").length + 2 + piece.length;
      if (currentParts.length > 0 && candidateLength > maxChars) flush();
      currentParts.push(piece);
      currentElements.push(element);
    }
  }
  flush();
  return chunks;
}

function shouldFlushDoclingPageChunk(currentElements, nextElement) {
  const currentPages = [...new Set(currentElements.flatMap((element) => element.pages))].sort((a, b) => a - b);
  const nextPage = doclingElementPrimaryPage(nextElement);
  if (currentPages.length === 0 || !Number.isInteger(nextPage)) return false;
  return !currentPages.includes(nextPage);
}

function splitDoclingTextPiece(text, maxChars) {
  if (text.length <= maxChars) return [text];
  const pieces = [];
  for (let start = 0; start < text.length; start += maxChars) {
    const piece = text.slice(start, start + maxChars).trim();
    if (piece) pieces.push(piece);
  }
  return pieces;
}

function doclingChunkFromParts({ sourceId, sourceRef, chunkIndex, parts, elements, doclingProfile }) {
  const chunkTextValue = parts.join("\n\n");
  const tokenSet = tokenize(chunkTextValue);
  const pages = [...new Set(elements.flatMap((element) => element.pages))].sort((a, b) => a - b);
  const pageSpan = pages.length > 0
    ? {
      start_page: pages[0],
      end_page: pages[pages.length - 1],
      pages,
    }
    : null;
  const layoutLabels = [...new Set(elements.map((element) => element.label).filter(Boolean))].sort();
  const warningCodes = doclingWarningCodes({
    pages,
    pageSummaries: doclingPageSummariesForPages(doclingProfile, pages),
    traceabilityStatus: pages.length > 0 ? "mapped" : "unmapped",
  });
  return {
    chunk_id: `${sourceId}_chunk_${String(chunkIndex + 1).padStart(3, "0")}`,
    source_ref: sourceRef,
    chunk_index: chunkIndex,
    chunk_text: chunkTextValue,
    token_fingerprints: [...tokenSet].map(stableHash).sort(),
    char_count: chunkTextValue.length,
    page_span: pageSpan,
    traceability_status: pages.length > 0 ? "mapped" : "unmapped",
    match_method: pages.length > 0 ? "docling_element_order" : "docling_element_order_unpaged",
    layout_labels: layoutLabels,
    element_ref_count: elements.length,
    warning_codes: warningCodes,
  };
}

function retrieveChunks(index, question, maxChunks) {
  const queryProfile = buildSearchProfile(question);
  const queryTokens = queryProfile.tokens;
  if (queryTokens.size === 0) return [];
  const chunkProfiles = (index.chunks ?? []).map((chunk) => ({
    chunk,
    profile: buildSearchProfile(chunk.chunk_text ?? ""),
  }));
  const documentFrequencies = documentFrequenciesFor([...queryTokens], chunkProfiles);
  return chunkProfiles
    .map(({ chunk, profile }) => {
      const score = scoreChunkForQuery({ chunk, profile, queryProfile, documentFrequencies, chunkCount: chunkProfiles.length });
      return { ...chunk, score };
    })
    .filter((chunk) => chunk.score > 0)
    .sort((a, b) => b.score - a.score || a.chunk_index - b.chunk_index)
    .slice(0, maxChunks);
}

function documentFrequenciesFor(queryTokens, chunkProfiles) {
  const frequencies = new Map(queryTokens.map((token) => [token, 0]));
  for (const { profile } of chunkProfiles) {
    for (const token of queryTokens) {
      if (profile.tokens.has(token)) frequencies.set(token, frequencies.get(token) + 1);
    }
  }
  return frequencies;
}

function scoreChunkForQuery({ chunk, profile, queryProfile, documentFrequencies, chunkCount }) {
  const matchedTokens = [...queryProfile.tokens].filter((token) => profile.tokens.has(token));
  if (matchedTokens.length === 0) return 0;
  let weightedMatchScore = 0;
  for (const token of matchedTokens) {
    const frequency = documentFrequencies.get(token) ?? 0;
    const inverseDocumentFrequency = 1 + Math.log((chunkCount + 1) / (frequency + 1));
    weightedMatchScore += inverseDocumentFrequency * technicalTokenWeight(token);
  }
  const coverage = matchedTokens.length / queryProfile.tokens.size;
  const cooccurrenceBonus = matchedTokens.length >= 2 ? Math.pow(matchedTokens.length, 1.25) : 0;
  const densityBonus = matchedTokens.length / Math.max(1, Math.log2(Number(chunk.char_count ?? 0) + 2));
  const normalizedText = profile.normalizedText;
  const exactBonus = normalizedText.includes(queryProfile.normalizedText) ? 5 : 0;
  return roundScore(weightedMatchScore * 3 + coverage * 4 + cooccurrenceBonus + densityBonus + exactBonus);
}

function renderExtractiveAnswerText({ index, retrievedChunks }) {
  if (retrievedChunks.length === 0) {
    return "등록된 source-text index에서 직접 맞는 본문 조각을 찾지 못했습니다.";
  }
  const title = index.source_card_summary?.title ?? index.source_refs?.source_id ?? "source";
  const lines = [
    `"${title}" source-text index에서 관련 본문 조각 ${retrievedChunks.length}개를 찾았습니다.`,
    ...retrievedChunks.map((chunk, index) => `${index + 1}. ${chunk.chunk_text}`),
  ];
  return lines.join("\n\n");
}

function defaultIndexOutputRef(index) {
  return normalizeRepoPath(path.join(DEFAULT_INDEX_ROOT, index.index_id, "source_text_index.json"));
}

function defaultAnswerRunOutputRef(run) {
  return normalizeRepoPath(path.join(DEFAULT_ANSWER_RUN_ROOT, run.run_id, "source_text_answer_run.json"));
}

function defaultTraceabilitySidecarOutputRef(sidecar) {
  return normalizeRepoPath(path.join(DEFAULT_TRACEABILITY_SIDECAR_ROOT, sidecar.traceability_id, "source_text_traceability_sidecar.json"));
}

function safeSourceTextIndexOutputPath(outputRef) {
  const normalized = safeRepoRelativePath(outputRef);
  if (!normalized.startsWith(`${DEFAULT_INDEX_ROOT}/`)) {
    throw new Error(`source text index output must be under ${DEFAULT_INDEX_ROOT}`);
  }
  if (!normalized.endsWith(".json")) throw new Error("source text index output must be json");
  return normalized;
}

function safeSourceTextAnswerRunOutputPath(outputRef) {
  const normalized = safeRepoRelativePath(outputRef);
  if (!normalized.startsWith(`${DEFAULT_ANSWER_RUN_ROOT}/`)) {
    throw new Error(`source text answer run output must be under ${DEFAULT_ANSWER_RUN_ROOT}`);
  }
  if (!normalized.endsWith(".json")) throw new Error("source text answer run output must be json");
  return normalized;
}

function safeSourceTextTraceabilitySidecarOutputPath(outputRef) {
  const normalized = safeRepoRelativePath(outputRef);
  if (!normalized.startsWith(`${DEFAULT_TRACEABILITY_SIDECAR_ROOT}/`)) {
    throw new Error(`source text traceability sidecar output must be under ${DEFAULT_TRACEABILITY_SIDECAR_ROOT}`);
  }
  if (!normalized.endsWith(".json")) throw new Error("source text traceability sidecar output must be json");
  return normalized;
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

function officialSourcePromotionAllowed(card) {
  return (
    card?.authority?.source_is_approved_knowledge_reference === true &&
    [
      "owner_approved_official_public_source",
      "owner_approved_official_source",
      "official_public_source",
    ].includes(card?.approval_status) &&
    typeof card?.origin?.publisher === "string" &&
    card.origin.publisher.trim().length > 0
  );
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

function tokenize(value) {
  return buildSearchProfile(value).tokens;
}

function buildSearchProfile(value) {
  const normalizedText = normalizeSearchText(value);
  const tokens = new Set();
  for (const segment of searchSegments(normalizedText)) {
    const pieces = segment
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .split(/\s+/u)
      .map((token) => token.trim())
      .filter(Boolean);
    const sequence = [];
    for (let index = 0; index < pieces.length; index += 1) {
      const acronymRun = collectSingleLetterAcronymRun(pieces, index);
      if (acronymRun) {
        addSearchToken(tokens, acronymRun.token);
        sequence.push(acronymRun.token);
        index = acronymRun.endIndex;
        continue;
      }
      const variants = normalizedTokenVariants(pieces[index]);
      for (const variant of variants) addSearchToken(tokens, variant);
      const primary =
        variants.find((variant, variantIndex) => variantIndex > 0 && isSearchToken(variant)) ??
        variants.find((variant) => isSearchToken(variant));
      if (primary) sequence.push(primary);
    }
    for (const compactToken of compactPhraseTokens(sequence)) addSearchToken(tokens, compactToken);
  }
  return {
    normalizedText,
    tokens,
  };
}

function normalizeSearchText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/([\p{Script=Latin}\p{N}])([\p{Script=Hangul}])/gu, "$1 $2")
    .replace(/([\p{Script=Hangul}])([\p{Script=Latin}\p{N}])/gu, "$1 $2")
    .trim();
}

function searchSegments(normalizedText) {
  return normalizedText
    .split(/[,;:()[\]{}"'“”‘’!?]+/u)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function collectSingleLetterAcronymRun(pieces, startIndex) {
  if (!/^[a-z]$/u.test(pieces[startIndex] ?? "")) return null;
  let token = "";
  let endIndex = startIndex;
  for (let index = startIndex; index < pieces.length && /^[a-z]$/u.test(pieces[index]); index += 1) {
    token += pieces[index];
    endIndex = index;
  }
  return token.length >= 2 ? { token, endIndex } : null;
}

function normalizedTokenVariants(token) {
  const variants = [token];
  if (/^\p{Script=Hangul}+$/u.test(token)) {
    for (const suffix of KOREAN_PARTICLE_SUFFIXES) {
      if (token.endsWith(suffix) && token.length - suffix.length >= 2) {
        variants.push(token.slice(0, -suffix.length));
      }
    }
  }
  return [...new Set(variants)];
}

function compactPhraseTokens(sequence) {
  const compactTokens = [];
  for (let size = 2; size <= 3; size += 1) {
    for (let index = 0; index <= sequence.length - size; index += 1) {
      const terms = sequence.slice(index, index + size);
      if (!shouldCompactPhrase(terms)) continue;
      compactTokens.push(terms.join(""));
    }
  }
  return compactTokens;
}

function shouldCompactPhrase(terms) {
  if (terms.some((term) => !isSearchToken(term))) return false;
  return terms.some((term) => /\p{Script=Hangul}/u.test(term));
}

function addSearchToken(tokens, token) {
  if (isSearchToken(token)) tokens.add(token);
}

function isSearchToken(token) {
  return token.length >= 2 && !STOPWORD_TOKENS.has(token);
}

function technicalTokenWeight(token) {
  let weight = 1;
  if (/\p{Script=Hangul}/u.test(token) && token.length >= 3) weight += 0.35;
  if (/^[a-z]{2,6}$/u.test(token)) weight += 0.35;
  if (/\p{Script=Hangul}/u.test(token) && /[a-z0-9]/u.test(token)) weight += 0.35;
  if (token.length >= 6) weight += 0.2;
  return weight;
}

function roundScore(value) {
  return Math.round(value * 1000) / 1000;
}

function numericOption(value, fallback) {
  if (value === undefined || value === null || value === true) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function findLocalAbsolutePathStrings(value) {
  const raw = JSON.stringify(value ?? {});
  const blockers = [];
  if (/\/Users\//u.test(raw)) blockers.push("runtime_absolute_user_path_included");
  if (/\/Volumes\//u.test(raw)) blockers.push("runtime_absolute_volume_path_included");
  return blockers;
}

function findSourceTextArtifactContamination(value, trail, options = {}) {
  const allowedPayloadTrails = options.allowedPayloadTrails ?? [];
  if (typeof value === "string" && matchesAllowedPayloadTrail(trail, allowedPayloadTrails)) return [];

  const blockers = [];
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      blockers.push(...findSourceTextArtifactContamination(item, `${trail}[${index}]`, options));
    });
    return blockers;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      const childTrail = `${trail}.${key}`;
      const normalizedKey = key.toLowerCase();
      if (
        !matchesAllowedPayloadTrail(childTrail, allowedPayloadTrails) &&
        SOURCE_TEXT_ARTIFACT_FORBIDDEN_KEYS.has(normalizedKey)
      ) {
        blockers.push(`forbidden_key:${childTrail}`);
      }
      if (
        !matchesAllowedPayloadTrail(childTrail, allowedPayloadTrails) &&
        SOURCE_TEXT_ARTIFACT_FORBIDDEN_AUTHORITY_CLAIM_KEYS.has(normalizedKey) &&
        child !== false
      ) {
        blockers.push(`forbidden_key:${childTrail}`);
      }
      blockers.push(...findSourceTextArtifactContamination(child, childTrail, options));
    }
    return blockers;
  }
  if (typeof value !== "string") return blockers;
  if (hasFileUrlString(value)) blockers.push(`file_url_string:${trail}`);
  if (/\/Users\//u.test(value)) blockers.push("runtime_absolute_user_path_included");
  if (/\/Volumes\//u.test(value)) blockers.push("runtime_absolute_volume_path_included");
  if (hasLocalAbsolutePathString(value)) blockers.push(`local_absolute_path:${trail}`);
  if (hasForbiddenSourceTextArtifactValue(value)) blockers.push(`forbidden_value:${trail}`);
  if (hasSecretLikeValueString(value)) blockers.push(`secret_like_value:${trail}`);
  return blockers;
}

function matchesAllowedPayloadTrail(trail, allowedPayloadTrails) {
  return allowedPayloadTrails.some((pattern) => pattern.test(trail));
}

function hasFileUrlString(value) {
  return /\bfile:\/\//iu.test(String(value ?? ""));
}

function hasLocalAbsolutePathString(value) {
  const text = String(value ?? "");
  return /(^|[\s"'(])\/(?:Users|Volumes|private|var\/folders|tmp|home)\//u.test(text) || /[A-Za-z]:[\\/]/u.test(text);
}

function hasForbiddenSourceTextArtifactValue(value) {
  if (SOURCE_TEXT_ARTIFACT_ALLOWED_METADATA_VALUES.has(String(value ?? ""))) return false;
  return /(^|[\s"'`=:/_.-])(?:raw_query|question|notebooklm_answer|credentials?|session|token|secret)(?=$|[\s"'`=:/_.-])/iu.test(
    String(value ?? ""),
  );
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
