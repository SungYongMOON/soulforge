import crypto from "node:crypto";
import path from "node:path";
import { promises as fs } from "node:fs";
import { normalizeRepoPath, readJson, writeJson } from "../shared/io.mjs";
import { validateSourceSyncReadyRef } from "./source_sync_ready_manifest.mjs";

export const KNOWLEDGE_SOURCE_CARD_SCHEMA_VERSION = "soulforge.knowledge_source_card.v0";
export const SOURCE_TEXT_INDEX_SCHEMA_VERSION = "soulforge.source_text_index.v0";
export const SOURCE_TEXT_ANSWER_RUN_SCHEMA_VERSION = "soulforge.source_text_answer_run.v0";
export const KNOWLEDGE_SOURCE_CARD_VALIDATION_SCHEMA_VERSION = "soulforge.knowledge_source_card_validation.v0";
export const SOURCE_TEXT_INDEX_VALIDATION_SCHEMA_VERSION = "soulforge.source_text_index_validation.v0";
export const SOURCE_TEXT_ANSWER_RUN_VALIDATION_SCHEMA_VERSION = "soulforge.source_text_answer_run_validation.v0";
export const SOURCE_TEXT_INDEX_GENERATOR_ID = "guild_hall.rag.source_text_index_generator.v0";
export const SOURCE_TEXT_ANSWER_RUN_GENERATOR_ID = "guild_hall.rag.source_text_answer_run_generator.v0";

const DEFAULT_INDEX_ROOT = "_workspaces/knowledge/rag/indexes_local/source_text_indexes";
const DEFAULT_DERIVED_TEXT_ROOT = "_workspaces/knowledge/rag/derived_text";
const DEFAULT_ANSWER_RUN_ROOT = "_workspaces/knowledge/rag/answer_runs";
const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,180}$/;
const SUPPORTED_SOURCE_EXTENSIONS = new Set([".md", ".markdown", ".txt"]);
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

  const sourcePath = path.join(repoRoot, safeRepoRelativePath(sourceRef));
  const rawText = await fs.readFile(sourcePath, "utf8");
  const normalizedText = normalizeSourceText(rawText, sourceCard.source_kind);
  const chunks = chunkText(normalizedText, {
    sourceId: sourceCard.source_id,
    sourceRef,
    maxChars: numericOption(options.maxChars, 900),
  });
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
    },
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
    const sourcePath = path.join(repoRoot, safeRepoRelativePath(index.source_refs.source_ref));
    const normalizedText = normalizeSourceText(await fs.readFile(sourcePath, "utf8"));
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
  }
  blockers.push(...findLocalAbsolutePathStrings(index));
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

export async function buildSourceTextAnswerRun(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const question = String(options.question ?? "").trim();
  if (!question) throw new Error("source text answer run requires --question");
  const index = options.sourceTextIndex ?? await loadSourceTextIndex({
    repoRoot,
    sourceTextIndexRef: options.sourceTextIndexRef,
  });
  const indexValidation = validateSourceTextIndex(index);
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
    },
    boundary: sourceTextAnswerRunBoundary(),
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
      citations: retrievedChunks.map((chunk) => ({
        chunk_id: chunk.chunk_id,
        source_ref: chunk.source_ref,
        score: chunk.score,
      })),
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
  if (!Array.isArray(run?.response?.citations)) blockers.push("citations_must_be_array");
  for (const citation of run?.response?.citations ?? []) {
    if (!isSafeId(citation?.chunk_id)) blockers.push("citation_chunk_id_unsafe");
    if (!safeWorkspaceKnowledgeRef(citation?.source_ref)) blockers.push("citation_source_ref_must_be_under_workspaces_knowledge");
  }
  blockers.push(...findLocalAbsolutePathStrings(run));
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
    lines.push(`- ${citation.chunk_id} (${citation.source_ref}, score=${citation.score})`);
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

function sourceTextAnswerRunBoundary() {
  return {
    storage_scope: "_workspaces_private_payload",
    source_text_loaded: true,
    answer_uses_source_text: true,
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
