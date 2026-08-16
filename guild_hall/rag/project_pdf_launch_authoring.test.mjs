// TDD cycle 2 (red). This tracer names the project pdf admission launch authoring
// seam: the prepare step below is green, and the seal step named by the second
// import must fail until ./project_pdf_launch_authoring.mjs exports it. It covers
// one closed metadata input, one unsealed launch authoring candidate and one
// happy seal. The refusal matrix and the admission matrix already covered by
// ./project_pdf_admission.test.mjs are not restated here.
import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { canonicalise } from "../engineering_engine/kernel/canonical.mjs";
import { sha256Hex } from "../engineering_engine/kernel/fingerprint.mjs";
import {
  PROJECT_KNOWLEDGE_VIEW_AUTHORITY_GRANT_HASH_DOMAIN,
  PROJECT_KNOWLEDGE_VIEW_AUTHORITY_GRANT_SCHEMA_VERSION,
  PROJECT_KNOWLEDGE_VIEW_REQUEST_SCHEMA_VERSION,
  selectProjectKnowledgeView,
} from "../shared/project_knowledge_view.mjs";

import { extractAdmittedProjectPdfCandidate } from "./project_pdf_admission.mjs";
import {
  prepareProjectPdfAdmissionLaunchCandidate,
  sealProjectPdfAdmissionLaunch,
} from "./project_pdf_launch_authoring.mjs";
import * as authoringModule from "./project_pdf_launch_authoring.mjs";
import { runProjectPdfRagTracer } from "./project_pdf_rag_tracer.mjs";

const CANDIDATE_SCHEMA_VERSION = "soulforge.project_pdf_launch_authoring_candidate.v0";
const CHALLENGE_SCHEMA_VERSION = "soulforge.project_pdf_launch_authoring_challenge.v0";
const CHALLENGE_HASH_DOMAIN = "soulforge.project_pdf_launch_authoring.challenge.v0";

// The launch this seam authors is the existing admission launch, unchanged: same
// schemas, same ceilings, same media type and the same two grant bindings.
const LAUNCH_SCHEMA_VERSION = "soulforge.project_pdf_admission_launch.v0";
const READ_GRANT_SCHEMA_VERSION = "soulforge.project_pdf_read_grant.v0";
const READ_GRANT_HASH_DOMAIN = "soulforge.project_pdf_admission.document_read_grant.v0";
const KNOWLEDGE_VIEW_AUTHORITY_CEILING = "synthetic_validation_only";
const READ_GRANT_AUTHORITY_CEILING = "single_pdf_candidate_extraction_only";
const MEDIA_TYPE = "application/pdf";
const FEATURE_STATE = "off";
const RELATIVE_LOCATOR = "documents/tracer.pdf";
// The digest of the public synthetic one-page pdf the ingest seam is pinned
// against. Only the digest is named: authoring reads root metadata alone, so no
// document body exists in this fixture at all.
const DOCUMENT_SHA256 = "dabb2b0ac21c6506a621f3bfe6d0685e7e3eda2886f205c4ef066c7f656326a3";

const SHA256_HEX = /^[0-9a-f]{64}$/u;
const SHA256_CONTENT_ID = /^sha256:[0-9a-f]{64}$/u;
// A correlation token and nothing more: lower case, opaque, and incapable of
// carrying a path, a locator or a project word out on the sealed challenge.
const PURPOSE_TOKEN = /^[a-z0-9][a-z0-9_.-]{0,127}$/u;

// Each role names a distinct subject and a distinct revision, because a launch
// that reused one identity in two roles would let one approval stand for two.
function identity(seed) {
  const token = String(seed).padStart(12, "0");
  return {
    entity_id: `00000000-0000-4000-8000-${token}`,
    revision_id: `10000000-0000-4000-8000-${token}`,
  };
}

function exactRef(seed) {
  return {
    ...identity(seed),
    content_id: `sha256:${String(seed).padStart(64, "0")}`,
    content_hash_alg: "sha256",
  };
}

function insertionOrderRules(value) {
  const rules = {};
  const visit = (node, path = "") => {
    if (Array.isArray(node)) {
      rules[path] = "insertion_ordered";
      node.forEach((child) => visit(child, `${path}[]`));
    } else if (node !== null && typeof node === "object") {
      Object.entries(node).forEach(([key, child]) => visit(child, path ? `${path}.${key}` : key));
    }
  };
  visit(value);
  return rules;
}

const canonicalText = (value) => canonicalise(value, insertionOrderRules(value));

// Same shape as every fingerprint in this stack: the hash domain, a NUL
// separator, then the canonical serialisation of the material.
const canonicalFingerprint = (domain, material) => (
  `sha256:${sha256Hex(`${domain}\0${canonicalText(material)}`)}`
);

// The canonical launch bytes an admission run will be pinned against: the
// canonical serialisation plus exactly one newline.
const canonicalBytes = (value) => Buffer.from(`${canonicalText(value)}\n`, "utf8");

// Root metadata only. The containment, project and common directories exist
// because the Knowledge View resolves them; no pdf and no launch file is written,
// so the seam has nothing to read a body from and nothing to leave behind.
function authoringFixture() {
  const tempRoot = mkdtempSync(join(tmpdir(), "soulforge-pdf-launch-authoring-"));
  const containmentRoot = join(tempRoot, "workspace");
  const projectRoot = join(containmentRoot, "project");
  const commonRoot = join(containmentRoot, "common");
  mkdirSync(projectRoot, { recursive: true });
  mkdirSync(commonRoot, { recursive: true });

  return {
    tempRoot,
    containmentRoot,
    projectRoot,
    commonRoot,
    input: {
      project_binding_ref: exactRef(1),
      knowledge_view_policy_ref: exactRef(3),
      document_read_policy_ref: exactRef(12),
      knowledge_view_authority_grant_identity: identity(2),
      document_read_grant_identity: identity(11),
      document_revision_identity: identity(13),
      project_root_path: projectRoot,
      common_root_path: commonRoot,
      containment_root_path: containmentRoot,
      selected_common_revision_refs: [],
      approved_common_revision_refs: [],
      relative_locator: RELATIVE_LOCATOR,
      document_sha256: DOCUMENT_SHA256,
    },
    cleanup: () => rmSync(tempRoot, { recursive: true, force: true }),
  };
}

// The launch is rebuilt here from the input alone, never read back out of the
// candidate: both grant refs are bound to the canonical hash of their own
// material, and the two fingerprints come from the Knowledge View selector run
// by this test, so the seam cannot satisfy the expectation by echoing itself.
function expectedLaunchMaterial(input) {
  const request = {
    schema_version: PROJECT_KNOWLEDGE_VIEW_REQUEST_SCHEMA_VERSION,
    feature_state: FEATURE_STATE,
    project_binding_refs: [input.project_binding_ref],
    common_revision_refs: input.selected_common_revision_refs,
  };
  const authorityGrantMaterial = {
    schema_version: PROJECT_KNOWLEDGE_VIEW_AUTHORITY_GRANT_SCHEMA_VERSION,
    feature_state: FEATURE_STATE,
    authority_ceiling: KNOWLEDGE_VIEW_AUTHORITY_CEILING,
    policy_ref: input.knowledge_view_policy_ref,
    project_binding_ref: input.project_binding_ref,
    project_root_path: input.project_root_path,
    common_root_path: input.common_root_path,
    containment_root_path: input.containment_root_path,
    approved_common_revision_refs: input.approved_common_revision_refs,
  };
  const authorityGrant = {
    ...authorityGrantMaterial,
    grant_ref: {
      ...input.knowledge_view_authority_grant_identity,
      content_id: canonicalFingerprint(
        PROJECT_KNOWLEDGE_VIEW_AUTHORITY_GRANT_HASH_DOMAIN,
        authorityGrantMaterial,
      ),
      content_hash_alg: "sha256",
    },
  };
  const view = selectProjectKnowledgeView(request, authorityGrant, authorityGrant.grant_ref);

  const readGrantMaterial = {
    schema_version: READ_GRANT_SCHEMA_VERSION,
    feature_state: FEATURE_STATE,
    authority_ceiling: READ_GRANT_AUTHORITY_CEILING,
    read_policy_ref: input.document_read_policy_ref,
    project_binding_ref: input.project_binding_ref,
    knowledge_scope_fingerprint_sha256: view.knowledge_scope_fingerprint_sha256,
    local_admission_fingerprint_sha256: view.local_admission_fingerprint_sha256,
    relative_locator: input.relative_locator,
    // Nothing else in the grant carries the document digest, so the exact
    // revision content id is the pin a later opened body must satisfy.
    document_revision_ref: {
      ...input.document_revision_identity,
      content_id: `sha256:${input.document_sha256}`,
      content_hash_alg: "sha256",
    },
    media_type: MEDIA_TYPE,
  };
  const readGrant = {
    ...readGrantMaterial,
    grant_ref: {
      ...input.document_read_grant_identity,
      content_id: canonicalFingerprint(READ_GRANT_HASH_DOMAIN, readGrantMaterial),
      content_hash_alg: "sha256",
    },
  };

  return {
    view,
    launch: {
      schema_version: LAUNCH_SCHEMA_VERSION,
      feature_state: FEATURE_STATE,
      project_knowledge_view_request: request,
      project_knowledge_view_authority_grant: authorityGrant,
      expected_project_knowledge_view_authority_grant_ref: { ...authorityGrant.grant_ref },
      document_read_grant: readGrant,
      expected_document_read_grant_ref: { ...readGrant.grant_ref },
    },
  };
}

// The challenge commits to the launch bytes without carrying them: a digest, a
// count and three refs. The purpose token is production's own fixed correlation
// token, so it is taken as observed and hashed back in here.
function expectedChallenge(launch, purpose) {
  const launchBytes = canonicalBytes(launch);
  const material = {
    schema_version: CHALLENGE_SCHEMA_VERSION,
    purpose,
    launch_sha256: sha256Hex(launchBytes),
    launch_byte_count: launchBytes.byteLength,
    project_binding_ref: launch.document_read_grant.project_binding_ref,
    document_revision_ref: launch.document_read_grant.document_revision_ref,
    document_read_grant_ref: launch.document_read_grant.grant_ref,
  };
  return {
    ...material,
    challenge_sha256: sha256Hex(`${CHALLENGE_HASH_DOMAIN}\0${canonicalText(material)}`),
  };
}

function assertDeeplyFrozen(value, trail) {
  if (value === null || typeof value !== "object") return;
  assert.equal(Object.isFrozen(value), true, `${trail} must be frozen`);
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertDeeplyFrozen(item, `${trail}[${index}]`));
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    assertDeeplyFrozen(item, `${trail}.${key}`);
  }
}

test("prepares one closed unsealed project pdf admission launch authoring candidate", () => {
  const state = authoringFixture();
  const inputBefore = structuredClone(state.input);
  try {
    const candidate = prepareProjectPdfAdmissionLaunchCandidate(state.input);

    assert.deepEqual(Object.keys(candidate), [
      "schema_version",
      "status",
      "feature_state",
      "sensitivity",
      "runnable",
      "launch_material",
      "challenge",
      "gates",
      "effects",
    ]);
    assert.equal(candidate.schema_version, CANDIDATE_SCHEMA_VERSION);
    // Prepared material, not a runnable launch: it is unsealed, private runtime
    // material and says so on its face.
    assert.equal(candidate.status, "awaiting_external_owner_seal");
    assert.equal(candidate.feature_state, FEATURE_STATE);
    assert.equal(candidate.sensitivity, "private_runtime_material");
    assert.equal(candidate.runnable, false);

    const { launch, view } = expectedLaunchMaterial(state.input);
    assert.deepEqual(candidate.launch_material, launch);
    assert.deepEqual(Object.keys(candidate.launch_material), [
      "schema_version",
      "feature_state",
      "project_knowledge_view_request",
      "project_knowledge_view_authority_grant",
      "expected_project_knowledge_view_authority_grant_ref",
      "document_read_grant",
      "expected_document_read_grant_ref",
    ]);

    // The current schemas, unelevated: an authored launch that named its own
    // schema, its own ceiling or another media type would not be the launch the
    // admission seam admits.
    const material = candidate.launch_material;
    const readGrant = material.document_read_grant;
    assert.equal(material.schema_version, LAUNCH_SCHEMA_VERSION);
    assert.equal(
      material.project_knowledge_view_request.schema_version,
      PROJECT_KNOWLEDGE_VIEW_REQUEST_SCHEMA_VERSION,
    );
    assert.equal(
      material.project_knowledge_view_authority_grant.schema_version,
      PROJECT_KNOWLEDGE_VIEW_AUTHORITY_GRANT_SCHEMA_VERSION,
    );
    assert.equal(readGrant.schema_version, READ_GRANT_SCHEMA_VERSION);
    assert.equal(material.feature_state, FEATURE_STATE);
    assert.equal(material.project_knowledge_view_request.feature_state, FEATURE_STATE);
    assert.equal(material.project_knowledge_view_authority_grant.feature_state, FEATURE_STATE);
    assert.equal(readGrant.feature_state, FEATURE_STATE);
    assert.equal(
      material.project_knowledge_view_authority_grant.authority_ceiling,
      KNOWLEDGE_VIEW_AUTHORITY_CEILING,
    );
    assert.equal(readGrant.authority_ceiling, READ_GRANT_AUTHORITY_CEILING);
    assert.equal(readGrant.media_type, MEDIA_TYPE);

    // Each expectation mirrors the grant ref that was actually computed, so a
    // launch cannot ship an expectation that no grant in it satisfies.
    assert.deepEqual(
      material.expected_project_knowledge_view_authority_grant_ref,
      material.project_knowledge_view_authority_grant.grant_ref,
    );
    assert.deepEqual(material.expected_document_read_grant_ref, readGrant.grant_ref);

    // Selector produced: both fingerprints are the Knowledge View's own, not a
    // value this seam invented and wrote into the read grant.
    assert.equal(
      readGrant.knowledge_scope_fingerprint_sha256,
      view.knowledge_scope_fingerprint_sha256,
    );
    assert.equal(
      readGrant.local_admission_fingerprint_sha256,
      view.local_admission_fingerprint_sha256,
    );
    assert.match(readGrant.knowledge_scope_fingerprint_sha256, SHA256_CONTENT_ID);
    assert.match(readGrant.local_admission_fingerprint_sha256, SHA256_CONTENT_ID);
    assert.equal(readGrant.document_revision_ref.content_id, `sha256:${DOCUMENT_SHA256}`);

    assert.deepEqual(Object.keys(candidate.challenge), [
      "schema_version",
      "purpose",
      "launch_sha256",
      "launch_byte_count",
      "project_binding_ref",
      "document_revision_ref",
      "document_read_grant_ref",
      "challenge_sha256",
    ]);
    assert.match(candidate.challenge.purpose, PURPOSE_TOKEN);
    assert.deepEqual(candidate.challenge, expectedChallenge(launch, candidate.challenge.purpose));
    assert.match(candidate.challenge.launch_sha256, SHA256_HEX);
    assert.match(candidate.challenge.challenge_sha256, SHA256_HEX);

    // Correlation only. The challenge is the thing an external owner is asked to
    // seal, so no absolute path, no relative locator and no launch bytes may ride
    // out on it — and no launch bytes hang off the candidate either.
    const challengeText = JSON.stringify(candidate.challenge);
    const escaped = (value) => JSON.stringify(value).slice(1, -1);
    for (const withheld of [
      state.tempRoot,
      state.containmentRoot,
      state.projectRoot,
      state.commonRoot,
      RELATIVE_LOCATOR,
      "tracer.pdf",
      canonicalText(launch),
    ]) {
      assert.equal(
        challengeText.includes(escaped(withheld)),
        false,
        "challenge must carry no path, locator or launch bytes",
      );
    }
    assert.equal(Object.hasOwn(candidate, "launchBytes"), false);

    // Nothing is sealed, correlated, verified or approved yet, and preparing
    // material is not doing anything.
    assert.deepEqual(candidate.gates, {
      external_owner_seal_required: true,
      external_owner_seal_correlated: false,
      independent_provenance_verified: false,
      owner_approval_verified: false,
    });
    assert.deepEqual(candidate.effects, {
      filesystem_writes: 0,
      document_body_reads: 0,
      network_calls: 0,
      model_calls: 0,
    });

    // The counted effects, observed: no launch file, no document, nothing left
    // behind in any of the three roots the seam was handed.
    assert.deepEqual(readdirSync(state.tempRoot), ["workspace"]);
    assert.deepEqual(readdirSync(state.containmentRoot).sort(), ["common", "project"]);
    assert.deepEqual(readdirSync(state.projectRoot), []);
    assert.deepEqual(readdirSync(state.commonRoot), []);

    assertDeeplyFrozen(candidate, "project_pdf_launch_authoring_candidate");
    assert.deepEqual(state.input, inputBefore);
  } finally {
    state.cleanup();
  }
});

const EXTERNAL_OWNER_SEAL_SCHEMA_VERSION = "soulforge.project_pdf_launch_external_owner_seal.v0";
const EXTERNAL_OWNER_SEAL_HASH_DOMAIN =
  "soulforge.project_pdf_launch_authoring.external_owner_seal.v0";
const SEAL_CLAIM_CEILING = "correlation_only";
const SEAL_RECEIPT_SCHEMA_VERSION = "soulforge.project_pdf_launch_seal_receipt.v0";

// Test correlation material, not an owner seal: the seed names a distinct public
// synthetic subject, and the ref binds only the seal's own fields. Nothing here
// is an authority, an identity proof or evidence of a second party.
function externalOwnerSeal(candidate, seed) {
  const material = {
    schema_version: EXTERNAL_OWNER_SEAL_SCHEMA_VERSION,
    claim_ceiling: SEAL_CLAIM_CEILING,
    challenge_sha256: candidate.challenge.challenge_sha256,
    launch_sha256: candidate.challenge.launch_sha256,
  };
  return {
    schema_version: material.schema_version,
    claim_ceiling: material.claim_ceiling,
    seal_ref: {
      ...identity(seed),
      content_id: canonicalFingerprint(EXTERNAL_OWNER_SEAL_HASH_DOMAIN, material),
      content_hash_alg: "sha256",
    },
    challenge_sha256: material.challenge_sha256,
    launch_sha256: material.launch_sha256,
  };
}

test("seals one prepared candidate into canonical launch bytes and a correlation only receipt", () => {
  const state = authoringFixture();
  const inputBefore = structuredClone(state.input);
  try {
    const candidate = prepareProjectPdfAdmissionLaunchCandidate(state.input);
    const candidateBefore = structuredClone(candidate);
    const seal = externalOwnerSeal(candidate, 21);
    const sealBefore = structuredClone(seal);

    const sealed = sealProjectPdfAdmissionLaunch(candidate, seal);

    assert.deepEqual(Object.keys(sealed), ["launchBytes", "launchSha256", "receipt"]);

    // The bytes an admission run is pinned against, rebuilt here rather than read
    // back out of the result: the canonical serialisation plus one final newline.
    const expectedBytes = canonicalBytes(candidate.launch_material);
    assert.equal(Buffer.isBuffer(sealed.launchBytes), true);
    assert.equal(sealed.launchBytes.equals(expectedBytes), true);
    const launchText = sealed.launchBytes.toString("utf8");
    assert.equal(launchText.endsWith("\n"), true);
    assert.equal(launchText.endsWith("\n\n"), false);

    assert.match(sealed.launchSha256, SHA256_HEX);
    assert.equal(sealed.launchSha256, sha256Hex(expectedBytes));
    assert.equal(sealed.launchSha256, candidate.challenge.launch_sha256);
    assert.equal(sealed.launchSha256, seal.launch_sha256);

    assert.deepEqual(sealed.receipt, {
      schema_version: SEAL_RECEIPT_SCHEMA_VERSION,
      mode: "manual_zero_write",
      result: "PASS",
      feature_state: FEATURE_STATE,
      // Correlation, not provenance: the seal is bound to exactly these bytes and
      // this challenge, and still says nothing about who produced either.
      binding: {
        canonical_launch_bytes: true,
        external_seal_content_binding_verified: true,
        challenge_binding_verified: true,
        launch_binding_verified: true,
        correlation_only: true,
        independent_provenance_verified: false,
      },
      launch: { sha256: sealed.launchSha256, byte_count: expectedBytes.byteLength },
      authority: {
        owner_approval_verified: false,
        source_truth: false,
        canon: false,
        project_state: false,
        activation_allowed: false,
        engine_input_allowed: false,
        rag_write_allowed: false,
        wiki_write_allowed: false,
        erp_write_allowed: false,
        taskdriver_allowed: false,
      },
      effects: {
        filesystem_writes: 0,
        document_body_reads: 0,
        network_calls: 0,
        model_calls: 0,
        rag_index_writes: 0,
        wiki_writes: 0,
        engine_calls: 0,
        erp_writes: 0,
        taskdriver_activated: false,
      },
    });

    // A receipt is the part that may be shown, so digests and counts may ride out
    // on it but no path, locator, ref or launch payload may.
    const receiptText = JSON.stringify(sealed.receipt);
    const escaped = (value) => JSON.stringify(value).slice(1, -1);
    const readGrant = candidate.launch_material.document_read_grant;
    for (const withheld of [
      state.tempRoot,
      state.containmentRoot,
      state.projectRoot,
      state.commonRoot,
      RELATIVE_LOCATOR,
      "tracer.pdf",
      canonicalText(candidate.launch_material),
      readGrant.project_binding_ref.entity_id,
      readGrant.document_revision_ref.content_id,
      readGrant.grant_ref.content_id,
      seal.seal_ref.entity_id,
      seal.seal_ref.content_id,
    ]) {
      assert.equal(
        receiptText.includes(escaped(withheld)),
        false,
        "receipt must carry no path, locator, ref or launch bytes",
      );
    }

    // The wrapper is closed and the receipt is immutable; the byte snapshot stays
    // a mutable Buffer, so nothing here requires it to be frozen.
    assert.equal(Object.isFrozen(sealed), true, "seal result wrapper must be frozen");
    assertDeeplyFrozen(sealed.receipt, "project_pdf_launch_seal_receipt");

    // The counted effects, observed: no launch file and nothing left behind.
    assert.deepEqual(readdirSync(state.tempRoot), ["workspace"]);
    assert.deepEqual(readdirSync(state.containmentRoot).sort(), ["common", "project"]);
    assert.deepEqual(readdirSync(state.projectRoot), []);
    assert.deepEqual(readdirSync(state.commonRoot), []);

    // Each call hands back its own snapshot, so a caller that writes into one set
    // of bytes cannot reach the next caller's launch or any retained state.
    const second = sealProjectPdfAdmissionLaunch(candidate, seal);
    assert.notEqual(second.launchBytes, sealed.launchBytes);
    assert.equal(second.launchBytes.equals(expectedBytes), true);
    assert.deepEqual(second.receipt, sealed.receipt);

    sealed.launchBytes[0] ^= 0xff;
    assert.equal(sealed.launchBytes.equals(expectedBytes), false);
    assert.equal(second.launchBytes.equals(expectedBytes), true);
    const third = sealProjectPdfAdmissionLaunch(candidate, seal);
    assert.equal(third.launchBytes.equals(expectedBytes), true);
    assert.deepEqual(third.receipt, sealed.receipt);

    assert.deepEqual(candidate, candidateBefore);
    assert.deepEqual(seal, sealBefore);
    assert.deepEqual(state.input, inputBefore);
  } finally {
    state.cleanup();
  }
});

// ------------------------------------------------------------- hardened guards

// The internal refusal surface restated rather than imported: the error class and
// its code table stay private to production, so only the observable name, code and
// current fixed message are pinned here.
const ERROR_NAME = "ProjectPdfLaunchAuthoringError";
const REFUSAL_MESSAGES = Object.freeze({
  input_refused: "project pdf launch authoring input is refused",
  role_refused: "project pdf launch authoring role separation is refused",
  scope_refused: "project pdf launch authoring common revision scope is refused",
  locator_refused: "project pdf launch authoring relative locator is refused",
  root_refused: "project pdf launch authoring root path is refused",
  knowledge_view_refused: "project pdf launch authoring knowledge view is refused",
  launch_refused: "project pdf launch authoring launch material is refused",
  candidate_refused: "project pdf launch authoring candidate is refused",
  seal_refused: "project pdf launch authoring external owner seal is refused",
});

const prepare = prepareProjectPdfAdmissionLaunchCandidate;
const sealLaunch = sealProjectPdfAdmissionLaunch;
const escapeJson = (value) => JSON.stringify(value).slice(1, -1);

// One stable payload free refusal: fixed name, fixed code, fixed message, one own
// key, no cause, no raw inner exception and nothing handed in echoed back out.
function stableRefusal(code, planted = []) {
  return (error) => {
    assert.equal(error instanceof Error, true);
    assert.equal(error instanceof TypeError, false);
    assert.equal(error.name, ERROR_NAME);
    assert.equal(error.constructor.name, ERROR_NAME);
    assert.equal(error.code, code);
    assert.equal(error.message, REFUSAL_MESSAGES[code]);
    assert.deepEqual(Object.keys(error), ["code"]);
    assert.equal(Object.hasOwn(error, "cause"), false);
    const surface = `${error.name}\n${error.message}\n${error.code}\n${error.stack ?? ""}`;
    for (const value of planted) {
      assert.equal(surface.includes(value), false, "refusal must echo nothing handed in");
    }
    return true;
  };
}

// A proxy answers every reflective read with test code, so a refusal settled by
// object identity alone leaves this counter at zero.
function trapProbe(target, { revoked = false } = {}) {
  const probe = { traps: 0 };
  const handler = {};
  for (const trap of Object.getOwnPropertyNames(Reflect)) {
    handler[trap] = (...args) => { probe.traps += 1; return Reflect[trap](...args); };
  }
  const revocable = Proxy.revocable(target, handler);
  if (revoked) revocable.revoke();
  probe.proxy = revocable.proxy;
  return probe;
}

function deepFreezeCopy(value) {
  if (value === null || typeof value !== "object") return value;
  for (const child of Object.values(value)) deepFreezeCopy(child);
  return Object.freeze(value);
}

function assertNoLaunchBytes(value, trail) {
  if (value === null || typeof value !== "object") return;
  assert.equal(ArrayBuffer.isView(value), false, `${trail} must carry no bytes`);
  for (const [key, child] of Object.entries(value)) {
    assert.notEqual(key, "launchBytes", `${trail} must carry no launch bytes`);
    assertNoLaunchBytes(child, `${trail}.${key}`);
  }
}

test("prepares one identical candidate from either common revision order", () => {
  const state = authoringFixture();
  const withCommon = (seeds) => deepFreezeCopy({
    ...structuredClone(state.input),
    selected_common_revision_refs: seeds.map(exactRef),
    approved_common_revision_refs: seeds.map(exactRef),
  });
  const forward = withCommon([31, 32]);
  const reverse = withCommon([32, 31]);
  const forwardBefore = structuredClone(forward);
  const reverseBefore = structuredClone(reverse);
  try {
    const first = prepare(forward);
    const second = prepare(reverse);
    const ordered = [exactRef(31), exactRef(32)];

    // Same set, either caller order, one identical candidate: both output arrays
    // are in the fixed identity order and not the order they were handed in.
    assert.deepEqual(first, second);
    assert.notEqual(first, second);
    const material = first.launch_material;
    assert.deepEqual(material.project_knowledge_view_request.common_revision_refs, ordered);
    assert.deepEqual(
      material.project_knowledge_view_authority_grant.approved_common_revision_refs,
      ordered,
    );
    assertNoLaunchBytes(first, "candidate");
    assertNoLaunchBytes(second, "candidate");

    const challengeText = JSON.stringify(first.challenge);
    for (const withheld of [
      state.tempRoot, state.containmentRoot, state.projectRoot, state.commonRoot,
      RELATIVE_LOCATOR, canonicalText(first.launch_material),
    ]) {
      assert.equal(
        challengeText.includes(escapeJson(withheld)),
        false,
        "challenge must carry no path, locator or launch bytes",
      );
    }

    // The caller's arrays are read, never written, reordered or unfrozen in place.
    assert.deepEqual(forward, forwardBefore);
    assert.deepEqual(reverse, reverseBefore);
    assert.equal(Object.isFrozen(reverse.selected_common_revision_refs), true);
    assert.equal(reverse.selected_common_revision_refs[0].entity_id, exactRef(32).entity_id);
  } finally {
    state.cleanup();
  }
});

test("refuses every hardened prepare input before any knowledge view detail", () => {
  const state = authoringFixture();
  // Roots that do not exist: anything reaching the Knowledge View would refuse
  // there, so a lexical code here shows the refusal was settled before it.
  const absentRoot = join(state.tempRoot, "absent");
  const MARKER = "zz-planted-0001";
  const base = () => ({
    ...structuredClone(state.input),
    project_root_path: join(absentRoot, "project"),
    common_root_path: join(absentRoot, "common"),
    containment_root_path: absentRoot,
  });
  const variant = (overrides) => () => ({ ...base(), ...overrides });
  const planted = [MARKER, absentRoot, RELATIVE_LOCATOR];
  let getters = 0;
  const accessor = () => {
    const input = base();
    Object.defineProperty(input.project_binding_ref, "content_id", {
      get: () => { getters += 1; return MARKER; },
      enumerable: true,
      configurable: true,
    });
    return input;
  };
  const cyclic = () => {
    const input = base();
    input.approved_common_revision_refs.push(input.approved_common_revision_refs);
    return input;
  };
  const aliased = () => {
    const input = base();
    input.knowledge_view_policy_ref = input.project_binding_ref;
    return input;
  };
  const foreignProto = Object.assign(Object.create({}), exactRef(12));
  const malformedRef = { ...exactRef(1), content_hash_alg: "sha512" };
  const cases = [
    [accessor, "input_refused"],
    [cyclic, "input_refused"],
    [aliased, "input_refused"],
    [variant({ document_read_policy_ref: foreignProto }), "input_refused"],
    [variant({ approved_common_revision_refs: new Array(2) }), "input_refused"],
    [variant({ writer_output_path: MARKER }), "input_refused"],
    [variant({ project_binding_ref: malformedRef }), "input_refused"],
    [variant({ document_sha256: DOCUMENT_SHA256.toUpperCase() }), "input_refused"],
    [variant({ relative_locator: "documents/trace\u0301r.pdf" }), "input_refused"],
    [variant({ project_root_path: null }), "input_refused"],
    [variant({ document_read_policy_ref: exactRef(1) }), "role_refused"],
    [variant({ selected_common_revision_refs: [exactRef(31)] }), "scope_refused"],
    [variant({ relative_locator: "documents/../tracer.pdf" }), "locator_refused"],
    [variant({ relative_locator: "documents\\tracer.pdf" }), "locator_refused"],
    [variant({ relative_locator: "C:documents/tracer.pdf" }), "locator_refused"],
    [variant({ relative_locator: "documents/tracer.pdf " }), "locator_refused"],
    [variant({ relative_locator: "documents/con.pdf" }), "locator_refused"],
    [variant({ containment_root_path: "workspace" }), "root_refused"],
    [variant({ project_root_path: "\\\\server\\share" }), "root_refused"],
  ];
  try {
    for (const [make, code] of cases) {
      assert.throws(() => prepare(make()), stableRefusal(code, planted));
    }
    for (const probe of [trapProbe(base()), trapProbe(base(), { revoked: true })]) {
      assert.throws(() => prepare(probe.proxy), stableRefusal("input_refused", planted));
      assert.equal(probe.traps, 0, "a refused proxy input must call no trap");
    }
    assert.equal(getters, 0, "a refused accessor input must call no getter");

    // Nothing was created either: the absent roots never came into being.
    assert.deepEqual(readdirSync(state.tempRoot), ["workspace"]);
    assert.deepEqual(readdirSync(state.containmentRoot).sort(), ["common", "project"]);
  } finally {
    state.cleanup();
  }
});

test("refuses every hardened seal, unbranded candidate copy and tampered copy", () => {
  const state = authoringFixture();
  const MARKER = "zz-planted-0002";
  try {
    const candidate = prepare(state.input);
    const seal = externalOwnerSeal(candidate, 21);
    const candidateBefore = structuredClone(candidate);
    const sealBefore = structuredClone(seal);
    const planted = [MARKER, state.tempRoot, RELATIVE_LOCATOR, seal.seal_ref.content_id];
    const otherDigest = "0".repeat(64);
    const other = exactRef(41);
    const cloned = () => structuredClone(seal);
    const sealVariant = (overrides) => () => ({ ...cloned(), ...overrides });
    let getters = 0;
    const accessorSeal = () => {
      const copy = cloned();
      Object.defineProperty(copy.seal_ref, "content_id", {
        get: () => { getters += 1; return MARKER; },
        enumerable: true,
        configurable: true,
      });
      return copy;
    };
    const cyclicSeal = () => {
      const copy = cloned();
      copy.seal_ref.parent = copy;
      return copy;
    };
    const aliasedSeal = () => {
      const copy = cloned();
      copy.correlated_ref = copy.seal_ref;
      return copy;
    };
    const missing = cloned();
    delete missing.launch_sha256;
    // Rebound rather than edited: the ref commits to the changed pins, so these
    // fail on the pin comparison and not on the seal's own content binding.
    const reboundChallenge = externalOwnerSeal(
      { challenge: { challenge_sha256: otherDigest, launch_sha256: seal.launch_sha256 } },
      22,
    );
    const reboundLaunch = externalOwnerSeal(
      { challenge: { challenge_sha256: seal.challenge_sha256, launch_sha256: otherDigest } },
      23,
    );
    const sealCases = [
      [accessorSeal, "input_refused"],
      [cyclicSeal, "input_refused"],
      [aliasedSeal, "input_refused"],
      [() => Object.assign(Object.create({}), cloned()), "input_refused"],
      [() => missing, "seal_refused"],
      [sealVariant({ writer_output_path: MARKER }), "seal_refused"],
      [sealVariant({ claim_ceiling: "owner_identity_proven" }), "seal_refused"],
      [sealVariant({ seal_ref: { ...seal.seal_ref, content_hash_alg: "sha512" } }), "seal_refused"],
      [sealVariant({ seal_ref: other }), "seal_refused"],
      [() => reboundChallenge, "seal_refused"],
      [() => reboundLaunch, "seal_refused"],
    ];
    for (const [make, code] of sealCases) {
      assert.throws(() => sealLaunch(candidate, make()), stableRefusal(code, planted));
    }
    for (const probe of [trapProbe(candidate), trapProbe(candidate, { revoked: true })]) {
      assert.throws(() => sealLaunch(probe.proxy, seal), stableRefusal("candidate_refused", planted));
      assert.equal(probe.traps, 0, "a refused proxy candidate must call no trap");
    }

    // A faithful copy is still not the prepared candidate, and neither is any
    // tampered one, frozen or not: what is sealed is the exact prepared object.
    const mutations = [
      () => {},
      (copy) => { copy.challenge.launch_byte_count += 1; },
      (copy) => { copy.launch_material.project_knowledge_view_request.feature_state = "on"; },
      (copy) => { copy.launch_material.project_knowledge_view_authority_grant.grant_ref = other; },
      (copy) => { copy.launch_material.document_read_grant.relative_locator = MARKER; },
      (copy) => { copy.launch_material.document_read_grant.document_revision_ref = other; },
      (copy) => { copy.launch_material.expected_document_read_grant_ref = other; },
    ];
    for (const mutate of mutations) {
      for (const frozen of [false, true]) {
        const copy = structuredClone(candidate);
        mutate(copy);
        if (frozen) deepFreezeCopy(copy);
        assert.throws(() => sealLaunch(copy, seal), stableRefusal("candidate_refused", planted));
      }
    }
    assert.equal(getters, 0, "a refused accessor seal must call no getter");

    const sealed = sealLaunch(candidate, seal);
    assert.equal(sealed.receipt.result, "PASS");
    assert.equal(sealed.launchSha256, candidate.challenge.launch_sha256);
    assert.deepEqual(candidate, candidateBefore);
    assert.deepEqual(seal, sealBefore);
  } finally {
    state.cleanup();
  }
});

test("keeps the authoring seam closed, static and effect free", () => {
  assert.deepEqual(Object.keys(authoringModule).sort(), [
    "prepareProjectPdfAdmissionLaunchCandidate",
    "sealProjectPdfAdmissionLaunch",
  ]);
  // Comments are stripped first, so what is checked below is import and call
  // syntax and not a word that happens to appear in the prose around it.
  const source = readFileSync(
    new URL("./project_pdf_launch_authoring.mjs", import.meta.url),
    "utf8",
  ).replace(/\/\*[\s\S]*?\*\//gu, " ").replace(/^[ \t]*\/\/.*$/gmu, " ");
  for (const forbidden of [
    /node:fs\b|\bfs\.[a-z]/u,
    /\b(?:readFile|writeFile|appendFile|open|readdir|mkdir|rmSync|createWriteStream)\w*\s*\(/u,
    /\bfetch\s*\(|\bnode:(?:http|https|net|dns|dgram|tls)\b|https?:\/\//u,
    /\bchild_process\b|\bexecSync\b|\bspawn\w*\s*\(|\bcreateOwnerSeal\b/u,
    /\bprocess\.(?:argv|env|exit|stdin|stdout|stderr|cwd)\b/u,
    /\brequire\s*\(|\bimport\s*\(/u,
  ]) {
    assert.equal(forbidden.test(source), false, "authoring source must stay closed");
  }
  assert.equal(source.split("selectProjectKnowledgeView(").length - 1, 1);

  const state = authoringFixture();
  try {
    const candidate = prepare(state.input);
    const sealed = sealLaunch(candidate, externalOwnerSeal(candidate, 24));
    for (const value of Object.values(sealed.receipt.authority)) assert.equal(value, false);
    for (const [key, value] of Object.entries(sealed.receipt.effects)) {
      assert.equal(value, key === "taskdriver_activated" ? false : 0);
    }
    for (const value of Object.values(candidate.effects)) assert.equal(value, 0);
    assertDeeplyFrozen(candidate, "candidate");
    assertDeeplyFrozen(sealed.receipt, "receipt");
    assert.deepEqual(readdirSync(state.tempRoot), ["workspace"]);
    assert.deepEqual(readdirSync(state.containmentRoot).sort(), ["common", "project"]);
    assert.deepEqual(readdirSync(state.projectRoot), []);
    assert.deepEqual(readdirSync(state.commonRoot), []);
  } finally {
    state.cleanup();
  }
});

// ------------------------------------------------- public synthetic integration

// The same public synthetic one-page pdf the ingest, admission and tracer seams
// are pinned against, materialised once under this fixture's own temporary
// project root so an authored launch can be carried end to end. No project
// payload, no private source.
const DOCUMENT_BASE64 =
  "JVBERi0xLjcKJcK1wrYKJSBXcml0dGVuIGJ5IE11UERGIDEuMjcuMgoKMSAwIG9iago8PC9UeXBlL0NhdGFsb2cvUGFnZXMgMiAwIFIvSW5mbzw8L1Byb2R1Y2VyKE11UERGIDEuMjcuMik+Pj4+CmVuZG9iagoKMiAwIG9iago8PC9UeXBlL1BhZ2VzL0NvdW50IDEvS2lkc1s0IDAgUl0+PgplbmRvYmoKCjMgMCBvYmoKPDwvRm9udDw8L2hlbHYgNSAwIFI+Pj4+CmVuZG9iagoKNCAwIG9iago8PC9UeXBlL1BhZ2UvTWVkaWFCb3hbMCAwIDMwMCAyMDBdL1JvdGF0ZSAwL1Jlc291cmNlcyAzIDAgUi9QYXJlbnQgMiAwIFIvQ29udGVudHNbNiAwIFJdPj4KZW5kb2JqCgo1IDAgb2JqCjw8L1R5cGUvRm9udC9TdWJ0eXBlL1R5cGUxL0Jhc2VGb250L0hlbHZldGljYS9FbmNvZGluZy9XaW5BbnNpRW5jb2Rpbmc+PgplbmRvYmoKCjYgMCBvYmoKPDwvTGVuZ3RoIDk5L0ZpbHRlci9GbGF0ZURlY29kZT4+CnN0cmVhbQp42h2KMQrDQAwEe71CP7Ckk/ZcBBeBNOkC6oKrw4cLu0jj9+cwWwwzLP3omaQsY8oFrDZznjTt23GxKmfn7yMKeg00YNBQESYh7g6T6qMoCqKaCez+tWG+rPmmV9KH/oHxFqwKZW5kc3RyZWFtCmVuZG9iagoKeHJlZgowIDcKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDQyIDAwMDAwIG4gCjAwMDAwMDAxMjAgMDAwMDAgbiAKMDAwMDAwMDE3MiAwMDAwMCBuIAowMDAwMDAwMjEzIDAwMDAwIG4gCjAwMDAwMDAzMjAgMDAwMDAgbiAKMDAwMDAwMDQwOSAwMDAwMCBuIAoKdHJhaWxlcgo8PC9TaXplIDcvUm9vdCAxIDAgUi9JRFs8MTdDM0FDQzI5MDY4QzI5MjU2QzM4NzdFMTRDMzhGQzM+PDhEOENBRUNDNzNGREU3MkRGNDc5NzBGQzM0NUQ3ODNFPl0+PgpzdGFydHhyZWYKNTc2CiUlRU9GCg==";
const DOCUMENT_BYTE_COUNT = 850;
// The page text exactly as the extractor reports it, trailing newline included.
const DOCUMENT_TEXT = "Soulforge PDF tracer bullet\n";
const DOCUMENT_TEXT_SHA256 = "3dceeabc3c008cd7e7700aa1414a0b522cdd091d8f5618b625e0bbbfe7347b86";
const QUERY_TEXT = "Soulforge";

test("carries one authored launch through admission and the rag tracer unchanged", async () => {
  const state = authoringFixture();
  const inputBefore = structuredClone(state.input);
  try {
    const documentBytes = Buffer.from(DOCUMENT_BASE64, "base64");
    assert.equal(documentBytes.byteLength, DOCUMENT_BYTE_COUNT);
    assert.equal(sha256Hex(documentBytes), DOCUMENT_SHA256);
    mkdirSync(join(state.projectRoot, "documents"));
    writeFileSync(join(state.projectRoot, ...RELATIVE_LOCATOR.split("/")), documentBytes);

    const candidate = prepare(state.input);
    const candidateBefore = structuredClone(candidate);
    const seal = externalOwnerSeal(candidate, 25);
    const sealBefore = structuredClone(seal);
    const sealed = sealLaunch(candidate, seal);

    // The seam wrote nothing: the authored bytes become a runnable launch here,
    // exactly once, and both downstream calls are pinned against those bytes.
    const launchPath = join(state.tempRoot, "launch.json");
    writeFileSync(launchPath, sealed.launchBytes);
    const launchBytesBefore = Buffer.from(sealed.launchBytes);

    const admitted = await extractAdmittedProjectPdfCandidate({
      launchPath,
      expectedLaunchSha256: sealed.launchSha256,
    });

    const readGrant = candidate.launch_material.document_read_grant;
    assert.deepEqual(admitted.admission.project_binding_ref, state.input.project_binding_ref);
    assert.deepEqual(admitted.admission.document_revision_ref, readGrant.document_revision_ref);
    assert.deepEqual(admitted.admission.document_read_grant_ref, readGrant.grant_ref);
    assert.equal(
      admitted.admission.knowledge_scope_fingerprint_sha256,
      readGrant.knowledge_scope_fingerprint_sha256,
    );
    assert.equal(
      admitted.admission.local_admission_fingerprint_sha256,
      readGrant.local_admission_fingerprint_sha256,
    );
    assert.equal(admitted.admission.knowledge_view_project_read_allowed, false);

    const ingest = admitted.ingest_candidate;
    assert.deepEqual(ingest.source, {
      media_type: MEDIA_TYPE,
      sha256: DOCUMENT_SHA256,
      byte_count: DOCUMENT_BYTE_COUNT,
    });
    assert.equal(ingest.extraction.page_count, 1);
    assert.deepEqual(ingest.extraction.pages, [{ page_number: 1, text: DOCUMENT_TEXT }]);
    assert.equal(ingest.extraction.character_count, DOCUMENT_TEXT.length);
    assert.equal(ingest.extraction.text_sha256, DOCUMENT_TEXT_SHA256);
    for (const granted of Object.values(admitted.authority)) assert.equal(granted, false);
    for (const granted of Object.values(ingest.authority)) assert.equal(granted, false);
    for (const count of Object.values(admitted.effects)) assert.equal(count, 0);
    for (const count of Object.values(ingest.effects)) assert.equal(count, 0);

    const { answer, receipt } = await runProjectPdfRagTracer({
      launchPath,
      expectedLaunchSha256: sealed.launchSha256,
      queryText: QUERY_TEXT,
    });

    assert.notEqual(answer, null);
    assert.equal(answer.status, "candidate_answer");
    assert.equal(receipt.result, "PASS");
    assert.equal(receipt.blocker_code, null);
    assert.equal(receipt.blocker_stage, null);

    // The answer is grounded on the same document revision the authored launch
    // pinned, and it quotes the page it names rather than a repaired span.
    assert.equal(answer.response.citations.length >= 1, true);
    const [citation] = answer.response.citations;
    assert.deepEqual(citation.document_revision_ref, readGrant.document_revision_ref);
    assert.equal(citation.page_number, 1);
    assert.equal(citation.excerpt.includes("Soulforge"), true);
    assert.equal(citation.excerpt, DOCUMENT_TEXT);
    assert.equal(citation.excerpt_sha256, `sha256:${sha256Hex(citation.excerpt)}`);
    assert.equal(citation.excerpt_sha256, `sha256:${DOCUMENT_TEXT_SHA256}`);

    // One retrieval and nothing else, no authority granted and no gate passed.
    assert.equal(answer.effects.rag_query_calls, 1);
    assert.equal(receipt.effects.rag_query_calls, 1);
    for (const [key, value] of Object.entries(answer.effects)) {
      if (key !== "rag_query_calls") assert.equal(value, 0);
    }
    for (const [key, value] of Object.entries(receipt.effects)) {
      if (key === "rag_query_calls") continue;
      assert.equal(value, key === "taskdriver_activated" ? false : 0);
    }
    for (const granted of Object.values(answer.authority)) assert.equal(granted, false);
    for (const passed of Object.values(receipt.gates)) assert.equal(passed, false);
    assert.equal(receipt.persistence.state, "not_requested");
    assert.equal(receipt.persistence.persistent_file_writes, 0);

    // The authored candidate, the input, the seal and the pinned bytes are what
    // they were before either downstream call, and only what this test created
    // exists anywhere under the fixture.
    assert.deepEqual(candidate, candidateBefore);
    assert.deepEqual(seal, sealBefore);
    assert.deepEqual(state.input, inputBefore);
    assert.equal(sealed.launchBytes.equals(launchBytesBefore), true);
    assert.equal(sealed.launchSha256, sha256Hex(sealed.launchBytes));
    assert.equal(sha256Hex(readFileSync(launchPath)), sealed.launchSha256);
    assert.deepEqual(readdirSync(state.tempRoot).sort(), ["launch.json", "workspace"]);
    assert.deepEqual(readdirSync(state.containmentRoot).sort(), ["common", "project"]);
    assert.deepEqual(readdirSync(state.projectRoot), ["documents"]);
    assert.deepEqual(readdirSync(join(state.projectRoot, "documents")), ["tracer.pdf"]);
    assert.deepEqual(readdirSync(state.commonRoot), []);
  } finally {
    state.cleanup();
  }
});
