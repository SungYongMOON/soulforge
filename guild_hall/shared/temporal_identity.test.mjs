import test from "node:test";
import assert from "node:assert/strict";

import {
  IDENTITY_GENERATION_PROFILE_ID,
  buildEvidenceLocatorIdentity,
  buildExtractionRunIdentity,
  buildRagChunkIdentity,
  buildRagIndexIdentity,
  buildSourceIdentity,
  buildSourceRevisionIdentity,
  canonicalIdentityBytes,
  canonicalizeIdentityValue,
  hashRawContentBytes,
  normalizeIdentityTimestamp,
  normalizeRepoRelativePath,
  normalizeSemanticSet,
  preserveOwnerIssuedIdentity,
  serializeCanonicalIdentity,
  validateTypedRef,
  verifyIdentityCollision,
} from "./temporal_identity.mjs";

const PROJECT_REF = Object.freeze({
  entity_type: "project",
  owner_surface: "dev_erp",
  entity_id: "P24-049",
});

const ABC_CONTENT_ID =
  "sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

function buildGoldenFixture() {
  const source = buildSourceIdentity({
    owner_ref: PROJECT_REF,
    source_kind: "file",
    source_key: "lf_01J00000000000000000000000",
  });
  const revision = buildSourceRevisionIdentity({
    source_id: source.id,
    occurrence_key: "official_issue_001",
    content_id: ABC_CONTENT_ID,
    canonicalization_profile_id: "raw_bytes.v1",
  });
  const extraction = buildExtractionRunIdentity({
    source_revision_id: revision.id,
    extractor_profile_id: "pdf_text.v1",
    run_key: "01J00000000000000000000001",
    started_at: "2026-07-13T01:02:03.000Z",
  });
  const locator = buildEvidenceLocatorIdentity({
    source_revision_id: revision.id,
    locator_kind: "page",
    locator: { page: 1 },
  });
  const index = buildRagIndexIdentity({
    scope_ref: PROJECT_REF,
    source_revision_ids: [revision.id],
    parser_profile_id: "pdf_text.v1",
    chunk_profile_id: "paragraph.v1",
    acl_profile_id: "project_private.v1",
  });
  const chunk = buildRagChunkIdentity({
    source_revision_id: revision.id,
    chunk_profile_id: "paragraph.v1",
    evidence_locator_id: locator.id,
    chunk_content_id: ABC_CONTENT_ID,
  });
  return { source, revision, extraction, locator, index, chunk };
}

test("canonical profile: ASCII key order, NFC UTF-8, safe integers", () => {
  const decomposed = { z: 2, a: "e\u0301", nested: { y: 1, b: true } };
  const composed = { nested: { b: true, y: 1 }, a: "é", z: 2 };
  const expected = '{"a":"é","nested":{"b":true,"y":1},"z":2}';

  assert.equal(serializeCanonicalIdentity(decomposed), expected);
  assert.equal(serializeCanonicalIdentity(composed), expected);
  assert.deepEqual(canonicalizeIdentityValue(decomposed), {
    a: "é",
    nested: { b: true, y: 1 },
    z: 2,
  });
  assert.deepEqual(canonicalIdentityBytes(decomposed), Buffer.from(expected, "utf8"));
  assert.throws(() => serializeCanonicalIdentity({ "한글키": 1 }), /printable ASCII/u);

  for (const invalid of [1.1, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53]) {
    assert.throws(() => serializeCanonicalIdentity({ invalid }), /safe integer/u);
  }
});

test("semantic set: canonical-byte dedupe and order", () => {
  assert.deepEqual(
    normalizeSemanticSet(["z", "e\u0301", "é", "a", { b: 2, a: 1 }, { a: 1, b: 2 }]),
    ["a", "z", "é", { a: 1, b: 2 }],
  );
});

test("typed ref: exact triple only and NFC-normalized values", () => {
  assert.deepEqual(
    validateTypedRef({
      owner_surface: "wiki",
      entity_id: "cafe\u0301",
      entity_type: "source",
    }),
    { entity_id: "café", entity_type: "source", owner_surface: "wiki" },
  );
  assert.throws(
    () => validateTypedRef({ ...PROJECT_REF, display_label: "shown only" }),
    /unknown field/u,
  );
  assert.throws(
    () => validateTypedRef({ ...PROJECT_REF, entity_type: "Project" }),
    /must match/u,
  );
});

test("repo path: normalize separators/NFC and reject unsafe forms", () => {
  assert.equal(
    normalizeRepoRelativePath("docs\\cafe\u0301\\file.md"),
    "docs/café/file.md",
  );
  for (const invalid of [
    "/absolute/file.md",
    "\\\\server\\share\\file.md",
    ["C:", "repo", "file.md"].join("\\"),
    "./file.md",
    "docs/../file.md",
    "docs//file.md",
    "docs/",
  ]) {
    assert.throws(() => normalizeRepoRelativePath(invalid), /repo-relative path/u);
  }
});

test("identity timestamp: strict UTC RFC3339 and canonical fractional seconds", () => {
  assert.equal(normalizeIdentityTimestamp("2026-07-13T01:02:03.1200Z"), "2026-07-13T01:02:03.12Z");
  assert.equal(normalizeIdentityTimestamp("2026-07-13T01:02:03.000Z"), "2026-07-13T01:02:03Z");
  for (const invalid of [
    "2026-07-13T01:02:03+00:00",
    "2026-02-30T01:02:03Z",
    "2026-07-13 01:02:03Z",
    "0000-01-01T00:00:00Z",
  ]) {
    assert.throws(() => normalizeIdentityTimestamp(invalid), /timestamp/u);
  }
});

test("raw content hash: exact bytes only, without text normalization", () => {
  assert.equal(hashRawContentBytes(Buffer.from("abc", "utf8")), ABC_CONTENT_ID);
  assert.notEqual(
    hashRawContentBytes(Buffer.from("é", "utf8")),
    hashRawContentBytes(Buffer.from("e\u0301", "utf8")),
  );
  assert.throws(() => hashRawContentBytes("abc"), /bytes, not text/u);
});

test("six identity builders: golden IDs, exact prefixes, full digest, explicit optionals", () => {
  const { source, revision, extraction, locator, index, chunk } = buildGoldenFixture();
  assert.equal(
    IDENTITY_GENERATION_PROFILE_ID,
    "soulforge.identity_basis.cjson_nfc_utf8.v1",
  );
  assert.deepEqual(
    [source.id, revision.id, extraction.id, locator.id, index.id, chunk.id],
    [
      "src_9aa7f70363e7e93da6b5ca44330b5699",
      "sr_041cb71bd6f575bad6ad305132d0f92c",
      "exr_bfbfbaa369ca6ccfa06729910f88e0b2",
      "loc_aefec87e891b55946d0bd44dc15ee66d",
      "ridx_ba39856fe56dc3d0f1d34b5d6f38d841",
      "rch_ff4025adfa21c52231dddfbe34c0e82d",
    ],
  );
  for (const identity of [source, revision, extraction, locator, index, chunk]) {
    assert.match(identity.identity_digest, /^sha256:[0-9a-f]{64}$/u);
    assert.equal(
      identity.id.slice(identity.id.indexOf("_") + 1),
      identity.identity_digest.slice(7, 39),
    );
  }
  assert.equal(source.identity_basis.issuer_namespace, null);
  assert.deepEqual(revision.identity_basis.applicability_refs, []);
  assert.equal(revision.identity_basis.published_at, null);
  assert.equal(revision.identity_basis.effective_from, null);
  assert.equal(revision.identity_basis.effective_to, null);
  assert.deepEqual(extraction.identity_basis.input_refs, []);
  assert.equal(locator.identity_basis.coordinate_profile_id, null);
  assert.equal(index.identity_basis.embedding_profile_id, null);
  assert.deepEqual(chunk.identity_basis.context_refs, []);
  assert.equal(extraction.identity_basis.started_at, "2026-07-13T01:02:03Z");
});

test("RAG index revision membership is a semantic set", () => {
  const base = {
    scope_ref: PROJECT_REF,
    parser_profile_id: "parser.v1",
    chunk_profile_id: "chunk.v1",
    acl_profile_id: "acl.v1",
  };
  const left = buildRagIndexIdentity({
    ...base,
    source_revision_ids: ["sr_b", "sr_a", "sr_a"],
  });
  const right = buildRagIndexIdentity({
    ...base,
    source_revision_ids: ["sr_a", "sr_b"],
  });
  assert.equal(left.id, right.id);
  assert.deepEqual(left.identity_basis.source_revision_ids, ["sr_a", "sr_b"]);
});

test("builder schemas reject unknown identity fields and invalid effective ranges", () => {
  assert.throws(
    () =>
      buildSourceIdentity({
        owner_ref: PROJECT_REF,
        source_kind: "file",
        source_key: "lf_1",
        display_label: "name and path are not identity",
      }),
    /unknown field/u,
  );
  assert.throws(
    () =>
      buildSourceRevisionIdentity({
        source_id: "src_1",
        occurrence_key: "issue_1",
        content_id: ABC_CONTENT_ID,
        canonicalization_profile_id: "raw_bytes.v1",
        effective_from: "2026-07-14T00:00:00Z",
        effective_to: "2026-07-13T00:00:00Z",
      }),
    /effective_from/u,
  );
});

test("effective ranges compare instants instead of unequal ISO timestamp string shapes", () => {
  const revision = buildSourceRevisionIdentity({
    source_id: "src_fractional_range",
    occurrence_key: "issue_fractional_range",
    content_id: ABC_CONTENT_ID,
    canonicalization_profile_id: "raw_bytes.v1",
    effective_from: "2026-01-01T00:00:00Z",
    effective_to: "2026-01-01T00:00:00.1Z",
  });
  assert.equal(revision.identity_basis.effective_from, "2026-01-01T00:00:00Z");
  assert.equal(revision.identity_basis.effective_to, "2026-01-01T00:00:00.1Z");
});

test("collision verifier: same scoped full basis is no-op; different basis conflicts", () => {
  const { source } = buildGoldenFixture();
  const same = buildSourceIdentity({
    source_key: "lf_01J00000000000000000000000",
    source_kind: "file",
    owner_ref: { entity_id: "P24-049", entity_type: "project", owner_surface: "dev_erp" },
  });
  assert.deepEqual(verifyIdentityCollision(source, same, { scope_ref: PROJECT_REF }), {
    decision: "idempotent_noop",
    identity_digest: source.identity_digest,
    scope_canonical:
      '{"entity_id":"P24-049","entity_type":"project","owner_surface":"dev_erp"}',
    scoped_id: source.id,
  });

  const otherBasis = buildSourceIdentity({
    owner_ref: PROJECT_REF,
    source_kind: "mail",
    source_key: "message-1",
  });
  const sameIdDifferentBasis = { ...otherBasis, id: source.id };
  assert.throws(
    () => verifyIdentityCollision(source, sameIdDifferentBasis, { scope_ref: PROJECT_REF }),
    (error) => error.code === "IDENTITY_COLLISION",
  );
  assert.throws(
    () =>
      verifyIdentityCollision(
        source,
        { ...source, identity_basis: { ...source.identity_basis, source_kind: "mail" } },
        { scope_ref: PROJECT_REF },
      ),
    /does not match its full identity_basis/u,
  );
});

test("owner-issued semantic ID is preserved and aliases stay typed/deduplicated", () => {
  const result = preserveOwnerIssuedIdentity({
    owner_ref: {
      entity_type: "task",
      owner_surface: "dev_erp",
      entity_id: "existing-core-item-7",
    },
    aliases: [
      { entity_type: "task", owner_surface: "legacy_import", entity_id: "cafe\u0301" },
      { entity_type: "task", owner_surface: "legacy_import", entity_id: "café" },
      { entity_type: "task", owner_surface: "dev_erp", entity_id: "existing-core-item-7" },
    ],
  });
  assert.equal(result.id, "existing-core-item-7");
  assert.equal(result.owner_issued, true);
  assert.deepEqual(result.aliases, [
    { entity_id: "café", entity_type: "task", owner_surface: "legacy_import" },
  ]);
  assert.throws(
    () =>
      preserveOwnerIssuedIdentity({
        owner_ref: PROJECT_REF,
        aliases: [{ entity_type: "source", owner_surface: "legacy", entity_id: "x" }],
      }),
    /keep the primary entity_type/u,
  );
});
