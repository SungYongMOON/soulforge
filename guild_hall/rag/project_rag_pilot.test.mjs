import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  ProjectRagPilotError,
  buildProjectRagPilotBundle,
} from "./project_rag_pilot.mjs";

const PROJECT_REF = Object.freeze({
  entity_type: "project",
  owner_surface: "dev_erp",
  entity_id: "P-SYN-001",
});

const REFS = Object.freeze({
  source_card:
    "_workspaces/knowledge/source_cards/p_syn_001_workspace.source_card.json",
  ready_manifest:
    "_workspaces/knowledge/private/projects/p_syn_001/source_sync_ready_manifest.json",
  source_content:
    "_workspaces/knowledge/private/projects/p_syn_001/derived_text/p_syn_001_workspace.md",
  normalized_text:
    "_workspaces/knowledge/rag/derived_text/p_syn_001_workspace_index/p_syn_001_workspace.txt",
  legacy_index:
    "_workspaces/knowledge/rag/indexes_local/source_text_indexes/p_syn_001_workspace_index/source_text_index.json",
  legacy_answer_run:
    "_workspaces/knowledge/rag/answer_runs/p_syn_001_workspace_smoke/source_text_answer_run.json",
});

function contentId(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function jsonEnvelope(ref, value) {
  const bytes = Buffer.from(JSON.stringify(value, null, 2), "utf8");
  return {
    ref,
    bytes,
    expected_sha256: contentId(bytes),
    expected_byte_length: bytes.byteLength,
  };
}

function textEnvelope(ref, value) {
  const bytes = Buffer.from(value, "utf8");
  return {
    ref,
    bytes,
    expected_sha256: contentId(bytes),
    expected_byte_length: bytes.byteLength,
  };
}

function readEnvelopeJson(envelope) {
  return JSON.parse(Buffer.from(envelope.bytes).toString("utf8"));
}

function replaceJsonEnvelope(fixture, artifactName, value) {
  const prior = fixture.artifacts[artifactName];
  fixture.artifacts[artifactName] = jsonEnvelope(prior.ref, value);
}

function refreshSourceCardManifestBinding(fixture, sourceCard) {
  replaceJsonEnvelope(fixture, "source_card", sourceCard);
  const manifest = readEnvelopeJson(fixture.artifacts.ready_manifest);
  const file = manifest.files.find(
    (entry) => entry.repo_relative_path === fixture.artifacts.source_card.ref,
  );
  file.sha256 = fixture.artifacts.source_card.expected_sha256;
  file.size_bytes = fixture.artifacts.source_card.expected_byte_length;
  replaceJsonEnvelope(fixture, "ready_manifest", manifest);
}

function replaceNormalizedTextAndChunks(fixture, normalizedText, chunkTexts) {
  fixture.artifacts.normalized_text = textEnvelope(REFS.normalized_text, normalizedText);
  const index = readEnvelopeJson(fixture.artifacts.legacy_index);
  index.chunks = chunkTexts.map((chunkText, indexValue) => ({
    chunk_id: `p_syn_001_workspace_chunk_${String(indexValue + 1).padStart(3, "0")}`,
    source_ref: REFS.source_content,
    chunk_index: indexValue,
    chunk_text: chunkText,
    token_fingerprints: [`token_${indexValue + 1}`],
    char_count: chunkText.length,
  }));
  index.counts.chunk_count = index.chunks.length;
  replaceJsonEnvelope(fixture, "legacy_index", index);

  if (fixture.artifacts.legacy_answer_run) {
    const answer = readEnvelopeJson(fixture.artifacts.legacy_answer_run);
    answer.response.citations = index.chunks.map((chunk, indexValue) => ({
      chunk_id: chunk.chunk_id,
      source_ref: REFS.source_content,
      score: 1.25 - indexValue / 10,
      traceability_status: "not_checked",
    }));
    answer.response.retrieved_chunk_count = answer.response.citations.length;
    answer.response.answer_uses_source_text = answer.response.citations.length > 0;
    replaceJsonEnvelope(fixture, "legacy_answer_run", answer);
  }
}

function makeFixture({ includeAnswer = true } = {}) {
  const sourceId = "p_syn_001_workspace";
  const corpusBytes = Buffer.from(
    "# Synthetic project corpus\n\nThis is owner-approved private source material.\n",
    "utf8",
  );
  const corpusContentId = contentId(corpusBytes);
  const sourceCard = {
    schema_version: "soulforge.knowledge_source_card.v0",
    source_id: sourceId,
    title: "Synthetic private project corpus",
    source_ref: { repo_relative_path: REFS.source_content },
    source_sync_ready_ref: REFS.ready_manifest,
    source_kind: "markdown_source_text",
    domains: ["project_p_syn_001", "synthetic_test"],
    approval_status: "owner_approved_local_source_text_ready",
    authority: {
      source_is_approved_knowledge_reference: true,
      approval_basis: "synthetic_owner_fixture",
      source_canon_status: "private_source_only",
      derived_extraction_requires_quality_check: true,
      answer_runs_require_source_citation: true,
    },
    origin: {
      corpus_sha256: corpusContentId,
      corpus_byte_count: corpusBytes.byteLength,
      corpus_manifest_ref:
        "_workspaces/knowledge/private/projects/p_syn_001/corpus_manifest.json",
      extraction_quality_status: "synthetic_checked",
    },
    rag_permissions: {
      scope: "project_private_only",
      source_text_retrieval: true,
      index_build: true,
      answer_synthesis: true,
    },
    public_canon_promotion_allowed: false,
    notebooklm_packet_allowed: false,
    claim_ceiling: "observed",
    boundary: {
      repo_relative_paths_only: true,
      runtime_absolute_paths_allowed: false,
      source_payload_contains_project_raw_material: true,
      source_payload_contains_secret: false,
      owner_review_required_before_external_upload_or_canon: true,
      public_source_payload_not_stored_in_public_repo: true,
    },
    derived_output_policy: {
      allowed_output_root: "_workspaces/knowledge/rag",
      requires_source_ref_backlink: true,
      requires_rebuildable_output: true,
    },
  };
  const sourceCardEnvelope = jsonEnvelope(REFS.source_card, sourceCard);
  const readyManifest = {
    schema_version: "soulforge.source_sync_ready_manifest.v0",
    kind: "source_sync_ready_manifest",
    manifest_id: "p_syn_001_workspace_ready",
    source_id: sourceId,
    source_card_ref: REFS.source_card,
    status: "ready_for_index",
    created_at_utc: "2026-01-01T00:00:00Z",
    producer: {
      origin_label: "synthetic_fixture",
      tool_label: "synthetic_builder",
      prepared_by_role: "owner_or_steward",
    },
    boundary: {
      metadata_only: true,
      ready_file_is_not_owner_approval: true,
      ready_file_is_not_source_truth: true,
      raw_payloads_included: false,
      source_payloads_included: false,
      source_text_included: false,
      chunk_payloads_included: false,
      notebooklm_answers_included: false,
      secrets_or_session_included: false,
      runtime_absolute_paths_included: false,
    },
    indexing_gate: {
      source_text_ref: REFS.source_content,
      min_stable_ms: 0,
      requires_source_card_validation: true,
      requires_hash_match: true,
    },
    files: [
      {
        role: "source_card",
        repo_relative_path: REFS.source_card,
        size_bytes: sourceCardEnvelope.expected_byte_length,
        sha256: sourceCardEnvelope.expected_sha256,
        required: true,
        media_type_label: "application_json",
      },
      {
        role: "derived_text",
        repo_relative_path: REFS.source_content,
        size_bytes: corpusBytes.byteLength,
        sha256: corpusContentId,
        required: true,
        media_type_label: "text_markdown",
      },
    ],
  };
  const normalizedText = [
    "Synthetic chunk alpha has a unique exact span.",
    "Synthetic chunk bravo carries a second unique exact span.",
  ].join("\n\n");
  const chunkTexts = normalizedText.split("\n\n");
  const chunks = chunkTexts.map((chunkText, indexValue) => ({
    chunk_id: `${sourceId}_chunk_${String(indexValue + 1).padStart(3, "0")}`,
    source_ref: REFS.source_content,
    chunk_index: indexValue,
    chunk_text: chunkText,
    token_fingerprints: [`synthetic_token_fingerprint_${indexValue + 1}`],
    char_count: chunkText.length,
  }));
  const legacyIndex = {
    schema_version: "soulforge.source_text_index.v0",
    kind: "source_text_index",
    index_id: "p_syn_001_workspace_index",
    generator_id: "guild_hall.rag.source_text_index_generator.v0",
    generated_at_utc: "2026-01-01T00:10:00Z",
    status: "ready",
    source_refs: {
      source_card_ref: REFS.source_card,
      source_id: sourceId,
      source_ref: REFS.source_content,
      source_sync_ready_ref: REFS.ready_manifest,
      derived_text_ref: REFS.normalized_text,
      docling_json_ref: null,
    },
    source_card_summary: {
      title: "Synthetic private project corpus",
      domains: ["project_p_syn_001", "synthetic_test"],
      sensitivity: "internal_project",
      approval_status: sourceCard.approval_status,
      claim_ceiling: "observed",
    },
    boundary: {
      storage_scope: "_workspaces_private_payload",
      source_text_loaded: true,
      public_repo_safe: false,
    },
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
    generation_profile: {
      source_order_basis: "source_text_paragraph_order",
      chunk_max_chars: 900,
      native_page_traceability: false,
    },
    chunks,
    validation: {
      status: "unchecked",
      upstream_validation: "pass",
      sync_ready_validation: "pass",
    },
  };
  const answerRun = {
    schema_version: "soulforge.source_text_answer_run.v0",
    kind: "source_text_answer_run",
    run_id: "p_syn_001_workspace_smoke",
    generator_id: "guild_hall.rag.source_text_answer_run_generator.v0",
    generated_at_utc: "2026-01-01T00:20:00Z",
    status: "source_text_answer",
    source_refs: {
      source_text_index_ref: REFS.legacy_index,
      index_id: legacyIndex.index_id,
      source_card_ref: REFS.source_card,
      source_id: sourceId,
      source_ref: REFS.source_content,
      traceability_sidecar_ref: null,
    },
    boundary: {
      storage_scope: "_workspaces_private_payload",
      source_text_loaded: true,
      public_repo_safe: false,
      raw_query_persisted: false,
    },
    query: {
      raw_query_persisted: false,
      query_fingerprint: "query_fingerprint_must_not_survive",
      query_token_fingerprints: ["query_token_must_not_survive"],
    },
    response: {
      answer_uses_source_text: true,
      retrieved_chunk_count: chunks.length,
      answer_text: "PRIVATE_ANSWER_TEXT_MUST_NOT_SURVIVE",
      citations: chunks.map((chunk, indexValue) => ({
        chunk_id: chunk.chunk_id,
        source_ref: REFS.source_content,
        score: 1.25 - indexValue / 10,
        traceability_status: "not_checked",
      })),
    },
    validation: { status: "unchecked", upstream_validation: "pass" },
  };
  return {
    apply: false,
    project_ref: { ...PROJECT_REF },
    legacy_reader_ref: REFS.legacy_index,
    identity_profile: {
      occurrence_key: "synthetic_owner_occurrence_001",
      canonicalization_profile_id: "soulforge.source_corpus.raw_bytes.v1",
      published_at: null,
      effective_from: null,
      effective_to: null,
      extractor_profile_id: "guild_hall.rag.source_text_extractor.v0",
      extraction_run_key: "synthetic_owner_extraction_run_001",
      extraction_started_at: "2026-01-01T00:10:00Z",
      parser_profile_id: "guild_hall.rag.source_text_parser.v0",
      chunk_profile_id: "guild_hall.rag.source_text_chunk_900.v0",
      acl_profile_id: "project_private_source_text.v1",
      embedding_profile_id: null,
    },
    artifacts: {
      source_card: sourceCardEnvelope,
      ready_manifest: jsonEnvelope(REFS.ready_manifest, readyManifest),
      legacy_index: jsonEnvelope(REFS.legacy_index, legacyIndex),
      normalized_text: textEnvelope(REFS.normalized_text, normalizedText),
      ...(includeAnswer
        ? { legacy_answer_run: jsonEnvelope(REFS.legacy_answer_run, answerRun) }
        : {}),
    },
  };
}

function assertPilotError(action, code) {
  assert.throws(action, (error) => {
    assert.ok(error instanceof ProjectRagPilotError);
    assert.equal(error.code, code);
    return true;
  });
}

test("builds a deterministic metadata-only project RAG v1 pilot bundle", () => {
  const fixture = makeFixture();
  const first = buildProjectRagPilotBundle(fixture);
  const second = buildProjectRagPilotBundle(fixture);

  assert.deepEqual(second, first);
  assert.equal(first.mode, "build_only");
  assert.equal(first.apply_requested, false);
  assert.equal(first.write_allowed, false);
  assert.match(first.identity_summary.source_revision_id, /^sr_[0-9a-f]{32}$/u);
  assert.match(first.identity_summary.extraction_run_id, /^exr_[0-9a-f]{32}$/u);
  assert.match(first.identity_summary.rag_index_id, /^ridx_[0-9a-f]{32}$/u);
  assert.equal(first.identity_summary.chunk_count, 2);
  assert.equal(first.lineage_sidecar.payload.legacy_source_identity.id, "p_syn_001_workspace");
  assert.equal(first.index.payload.chunks.length, 2);
  assert.ok(
    first.index.target_ref.startsWith(
      "_workspaces/P-SYN-001/reference_payloads/rag/indexes_local/",
    ),
  );
  assert.equal(first.answer_run.payload.citations.length, 2);
  assert.deepEqual(first.answer_run.payload.project_ref, PROJECT_REF);
  assert.equal(first.rollback_manifest.payload.apply_allowed, false);
  assert.equal(first.rollback_manifest.payload.created_outputs.length, 3);
  assert.equal(first.next_gate.apply_implementation_present, false);

  const serialized = JSON.stringify(first);
  assert.doesNotMatch(serialized, /Synthetic chunk alpha/u);
  assert.doesNotMatch(serialized, /Synthetic chunk bravo/u);
  assert.doesNotMatch(serialized, /PRIVATE_ANSWER_TEXT_MUST_NOT_SURVIVE/u);
  assert.doesNotMatch(serialized, /query_fingerprint_must_not_survive/u);
  assert.doesNotMatch(serialized, /query_token_must_not_survive/u);
  assert.doesNotMatch(serialized, /synthetic_token_fingerprint/u);
  assert.doesNotMatch(serialized, /"chunk_text"|"answer_text"|"query_fingerprint"/u);
});

test("supports a bundle without a legacy answer run", () => {
  const bundle = buildProjectRagPilotBundle(makeFixture({ includeAnswer: false }));
  assert.equal(bundle.answer_run, null);
  assert.equal(bundle.rollback_manifest.payload.created_outputs.length, 2);
});

test("blocks apply because writer and external binding are a separate gate", () => {
  const fixture = makeFixture();
  fixture.apply = true;
  assertPilotError(() => buildProjectRagPilotBundle(fixture), "RAG_PILOT_APPLY_BLOCKED");
});

test("rejects an artifact whose exact bytes do not match its expected hash", () => {
  const fixture = makeFixture();
  const bytes = Buffer.from(fixture.artifacts.legacy_index.bytes);
  bytes[bytes.length - 2] = bytes[bytes.length - 2] === 32 ? 33 : 32;
  fixture.artifacts.legacy_index.bytes = bytes;
  assertPilotError(() => buildProjectRagPilotBundle(fixture), "RAG_PILOT_HASH_MISMATCH");
});

test("rejects source-card bytes that no longer match the ready manifest", () => {
  const fixture = makeFixture();
  const sourceCard = readEnvelopeJson(fixture.artifacts.source_card);
  sourceCard.title = "Changed but not re-bound in ready manifest";
  replaceJsonEnvelope(fixture, "source_card", sourceCard);
  assertPilotError(() => buildProjectRagPilotBundle(fixture), "RAG_PILOT_HASH_MISMATCH");
});

test("rejects a legacy chunk missing from normalized bytes", () => {
  const fixture = makeFixture();
  replaceNormalizedTextAndChunks(fixture, "Only one exact span exists.", ["Missing span"]);
  assertPilotError(
    () => buildProjectRagPilotBundle(fixture),
    "RAG_PILOT_CHUNK_SPAN_MISSING",
  );
});

test("rejects a legacy chunk with more than one exact normalized-text span", () => {
  const fixture = makeFixture();
  replaceNormalizedTextAndChunks(fixture, "Repeated span.\n\nRepeated span.", ["Repeated span."]);
  assertPilotError(
    () => buildProjectRagPilotBundle(fixture),
    "RAG_PILOT_CHUNK_SPAN_AMBIGUOUS",
  );
});

test("rejects exact chunk spans that overlap", () => {
  const fixture = makeFixture();
  replaceNormalizedTextAndChunks(fixture, "alpha beta gamma", ["alpha beta", "beta gamma"]);
  assertPilotError(
    () => buildProjectRagPilotBundle(fixture),
    "RAG_PILOT_CHUNK_SPAN_OVERLAP",
  );
});

test("rejects a source card without project-private index permission", () => {
  const fixture = makeFixture();
  const sourceCard = readEnvelopeJson(fixture.artifacts.source_card);
  sourceCard.rag_permissions.index_build = false;
  refreshSourceCardManifestBinding(fixture, sourceCard);
  assertPilotError(() => buildProjectRagPilotBundle(fixture), "RAG_PILOT_ACL_REJECTED");
});

test("rejects a common or global RAG scope", () => {
  const fixture = makeFixture();
  const sourceCard = readEnvelopeJson(fixture.artifacts.source_card);
  sourceCard.rag_permissions.scope = "common_global";
  refreshSourceCardManifestBinding(fixture, sourceCard);
  assertPilotError(() => buildProjectRagPilotBundle(fixture), "RAG_PILOT_ACL_REJECTED");
});

test("rejects a caller project_ref that differs from source, domain, and path tokens", () => {
  const fixture = makeFixture();
  fixture.project_ref = { ...PROJECT_REF, entity_id: "P-SYN-002" };
  assertPilotError(
    () => buildProjectRagPilotBundle(fixture),
    "RAG_PILOT_CROSS_PROJECT_REJECTED",
  );
});

test("project token matching rejects prefix overlap instead of using substring containment", () => {
  const fixture = makeFixture();
  fixture.project_ref = { ...PROJECT_REF, entity_id: "P-SYN-00" };
  assertPilotError(
    () => buildProjectRagPilotBundle(fixture),
    "RAG_PILOT_CROSS_PROJECT_REJECTED",
  );
});

test("rejects answer citations that do not resolve to exact legacy chunks", () => {
  const fixture = makeFixture();
  const answer = readEnvelopeJson(fixture.artifacts.legacy_answer_run);
  answer.response.citations[0].chunk_id = "p_syn_001_workspace_chunk_missing";
  replaceJsonEnvelope(fixture, "legacy_answer_run", answer);
  assertPilotError(
    () => buildProjectRagPilotBundle(fixture),
    "RAG_PILOT_ANSWER_RUN_INVALID",
  );
});
