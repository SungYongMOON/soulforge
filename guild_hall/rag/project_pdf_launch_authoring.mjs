// Project pdf admission launch authoring — prepare and seal steps.
//
// This seam prepares one closed, unsealed launch candidate for the existing
// admission seam, and correlates one external owner seal with exactly one
// prepared candidate to hand back the canonical launch bytes that seal names. It
// reads project root metadata alone: no document body is opened, nothing is
// enumerated, nothing is written, and no network or model call is made. What it
// returns is private runtime material and a correlation only receipt, never a
// runnable launch and never an approval.
//
// Correlation is not identity. The challenge below lets a later seal be
// correlated to exactly one set of launch bytes; it cannot prove who issued
// those bytes. The same caller that prepares a candidate can also produce every
// value that appears on it, so nothing here is evidence of a second party. The
// actual Owner, the trusted registry and the sealing key stay external to this
// module and to this process. A hand crafted launch file can also reach the
// admission seam without ever passing through this frozen helper, so preparing
// material here is not approval, not provenance, and not a production ready path.
import { createHash } from "node:crypto";
import { isAbsolute, resolve } from "node:path";
import process from "node:process";
import { types } from "node:util";

import { canonicalise, compareCodePoints } from "../engineering_engine/kernel/canonical.mjs";
import {
  exactRefIdentityKey,
  inspectIdentifierOpacity,
  isWellFormedRef,
  logicalRevisionKey,
  sameExactRef,
} from "../engineering_engine/kernel/identity.mjs";
import {
  PROJECT_KNOWLEDGE_VIEW_AUTHORITY_GRANT_HASH_DOMAIN,
  PROJECT_KNOWLEDGE_VIEW_AUTHORITY_GRANT_SCHEMA_VERSION,
  PROJECT_KNOWLEDGE_VIEW_REQUEST_SCHEMA_VERSION,
  selectProjectKnowledgeView,
} from "../shared/project_knowledge_view.mjs";

const CANDIDATE_SCHEMA_VERSION = "soulforge.project_pdf_launch_authoring_candidate.v0";
const CHALLENGE_SCHEMA_VERSION = "soulforge.project_pdf_launch_authoring_challenge.v0";
const CHALLENGE_HASH_DOMAIN = "soulforge.project_pdf_launch_authoring.challenge.v0";

// The seal step's own schemas and its one hash domain. A seal ref is bound under
// this domain alone, so material bound for another purpose cannot verify as a
// seal and a seal cannot verify as anything else.
const EXTERNAL_OWNER_SEAL_SCHEMA_VERSION = "soulforge.project_pdf_launch_external_owner_seal.v0";
const EXTERNAL_OWNER_SEAL_HASH_DOMAIN =
  "soulforge.project_pdf_launch_authoring.external_owner_seal.v0";
const SEAL_RECEIPT_SCHEMA_VERSION = "soulforge.project_pdf_launch_seal_receipt.v0";
// The whole of what a verified seal may claim: which bytes were sealed, never
// who sealed them.
const SEAL_CLAIM_CEILING = "correlation_only";
const SEAL_MODE = "manual_zero_write";

// The launch authored here is the existing admission launch, unchanged: the same
// schemas, the same ceilings, the same media type and the same two grants. An
// authored launch that named its own schema or its own ceiling would not be the
// launch the admission seam admits, so none of these is a parameter.
const LAUNCH_SCHEMA_VERSION = "soulforge.project_pdf_admission_launch.v0";
const READ_GRANT_SCHEMA_VERSION = "soulforge.project_pdf_read_grant.v0";
const READ_GRANT_HASH_DOMAIN = "soulforge.project_pdf_admission.document_read_grant.v0";
const KNOWLEDGE_VIEW_AUTHORITY_CEILING = "synthetic_validation_only";
const READ_GRANT_AUTHORITY_CEILING = "single_pdf_candidate_extraction_only";
const MEDIA_TYPE = "application/pdf";
const FEATURE_STATE = "off";
const HASH_ALG = "sha256";
const CANDIDATE_STATUS = "awaiting_external_owner_seal";
const CANDIDATE_SENSITIVITY = "private_runtime_material";
// A fixed correlation token and nothing more: lower case and opaque by
// construction, so no path, locator or project word can ride out on a sealed
// challenge through this field.
const CHALLENGE_PURPOSE = "project_pdf_admission_launch_seal";

const INPUT_FIELDS = Object.freeze([
  "project_binding_ref",
  "knowledge_view_policy_ref",
  "document_read_policy_ref",
  "knowledge_view_authority_grant_identity",
  "document_read_grant_identity",
  "document_revision_identity",
  "project_root_path",
  "common_root_path",
  "containment_root_path",
  "selected_common_revision_refs",
  "approved_common_revision_refs",
  "relative_locator",
  "document_sha256",
]);
const EXACT_REF_FIELDS = Object.freeze([
  "entity_id",
  "revision_id",
  "content_id",
  "content_hash_alg",
]);
// The three grant and revision roles are named by identity alone: their content
// ids are computed here from their own material, so a caller cannot assert one.
const IDENTITY_FIELDS = Object.freeze(["entity_id", "revision_id"]);

// The exact closed shapes the seal step re-checks. Prepared material is not
// trusted merely because it came from this module: a candidate whose shape
// drifted is refused rather than sealed.
const CANDIDATE_FIELDS = Object.freeze([
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
const LAUNCH_MATERIAL_FIELDS = Object.freeze([
  "schema_version",
  "feature_state",
  "project_knowledge_view_request",
  "project_knowledge_view_authority_grant",
  "expected_project_knowledge_view_authority_grant_ref",
  "document_read_grant",
  "expected_document_read_grant_ref",
]);
const READ_GRANT_FIELDS = Object.freeze([
  "schema_version",
  "feature_state",
  "authority_ceiling",
  "read_policy_ref",
  "project_binding_ref",
  "knowledge_scope_fingerprint_sha256",
  "local_admission_fingerprint_sha256",
  "relative_locator",
  "document_revision_ref",
  "media_type",
  "grant_ref",
]);
const CHALLENGE_FIELDS = Object.freeze([
  "schema_version",
  "purpose",
  "launch_sha256",
  "launch_byte_count",
  "project_binding_ref",
  "document_revision_ref",
  "document_read_grant_ref",
  "challenge_sha256",
]);
// The seal ref commits to every other field of the seal, so no single pin can be
// swapped while the ref still verifies. The ref is excluded from its own material.
const EXTERNAL_OWNER_SEAL_FIELDS = Object.freeze([
  "schema_version",
  "claim_ceiling",
  "seal_ref",
  "challenge_sha256",
  "launch_sha256",
]);

const MAX_GRAPH_DEPTH = 12;
const MAX_GRAPH_NODES = 512;
const MAX_ARRAY_LENGTH = 64;
const MAX_OBJECT_KEYS = 64;
const MAX_STRING_LENGTH = 4096;
const MAX_PATH_CHARS = 4096;
const MAX_LOCATOR_CHARS = 1024;
const MAX_LOCATOR_SEGMENTS = 64;
const MAX_LOCATOR_SEGMENT_CHARS = 255;

const SHA256_HEX = /^[0-9a-f]{64}$/u;
const SHA256_CONTENT_ID = /^sha256:[0-9a-f]{64}$/u;
const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/u;
const CANONICAL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const CONTENT_DERIVED_REVISION = /^[0-9a-f]{12,64}$/iu;
const NUMBERED_REVISION = /(?:^|[-_.])(?:r|rev|v)\d+(?:[-_.]\d+)*$/iu;
const RESERVED_FLOATING_REVISION = /^(?:latest|current|head|tip|floating)$/iu;
const WINDOWS_UNC_OR_DEVICE_NAMESPACE = /^[\\/]{2}/u;
const WINDOWS_DRIVE_DESIGNATOR = /^[A-Za-z]:(?=[\\/]|$)/u;
const WINDOWS_DEVICE_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu;
const WINDOWS_TRIMMED_SEGMENT = /[. ](?:[\\/]|$)/u;
const TRAILING_DOT_OR_SPACE = /[. ]$/u;

// Fixed, payload free refusals. No path, locator, ref, digest or inner exception
// may reach a caller through an error raised here, and the class stays internal.
const ERROR_NAME = "ProjectPdfLaunchAuthoringError";
const ERROR_MESSAGES = Object.freeze({
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

class ProjectPdfLaunchAuthoringError extends Error {
  constructor(code) {
    super(ERROR_MESSAGES[code]);
    Object.defineProperty(this, "name", {
      value: ERROR_NAME,
      writable: true,
      enumerable: false,
      configurable: true,
    });
    this.code = code;
  }
}

function refuse(code) {
  throw new ProjectPdfLaunchAuthoringError(code);
}

// One narrow in-memory brand and nothing more: membership says this exact frozen
// object was created by the prepare step in this process. It is a correlation
// convenience for the seal step, never issuer proof — the same caller holds both
// steps, so the brand can never say who prepared anything.
const PREPARED_CANDIDATES = new WeakSet();

/**
 * Prepares one closed, unsealed project pdf admission launch authoring candidate.
 *
 * The order below is the safe sequence and is not an implementation detail: the
 * whole input is snapshotted before any semantics are read, every role, scope and
 * locator refusal is settled lexically, and only then is the Knowledge View
 * selector invoked once for metadata-only root, scope and local admission
 * authentication. The launch bytes are committed to and discarded, so the
 * returned candidate carries a digest and a count but never the bytes.
 */
export function prepareProjectPdfAdmissionLaunchCandidate(input) {
  const snapshot = snapshotPlainData(input, { seen: new WeakSet(), nodes: 0 }, 0);
  exactKeys(snapshot, INPUT_FIELDS);

  const projectRef = validateExactRef(snapshot.project_binding_ref);
  const knowledgeViewPolicyRef = validateExactRef(snapshot.knowledge_view_policy_ref);
  const documentReadPolicyRef = validateExactRef(snapshot.document_read_policy_ref);
  const knowledgeViewGrantIdentity = validateIdentity(
    snapshot.knowledge_view_authority_grant_identity,
  );
  const documentReadGrantIdentity = validateIdentity(snapshot.document_read_grant_identity);
  const documentRevisionIdentity = validateIdentity(snapshot.document_revision_identity);

  // Six roles, six subjects, six revisions. A launch that reused one identity in
  // two roles would let one approval stand for two, so the pairwise separation is
  // checked on both keys before anything is built from them.
  const roles = [
    projectRef,
    knowledgeViewPolicyRef,
    knowledgeViewGrantIdentity,
    documentReadPolicyRef,
    documentReadGrantIdentity,
    documentRevisionIdentity,
  ];
  const roleEntityIds = roles.map((role) => role.entity_id);
  const roleLogicalRevisions = roles.map(logicalRevisionKey);
  if (roleLogicalRevisions.some((key) => key === null)
      || new Set(roleEntityIds).size !== roles.length
      || new Set(roleLogicalRevisions).size !== roles.length) {
    refuse("role_refused");
  }

  const approvedCommonRefs = normalizeCommonRefs(snapshot.approved_common_revision_refs);
  const selectedCommonRefs = normalizeCommonRefs(snapshot.selected_common_revision_refs);
  const approvedIdentities = new Set(approvedCommonRefs.map(exactRefIdentityKey));
  for (const ref of [...approvedCommonRefs, ...selectedCommonRefs]) {
    if (roleEntityIds.includes(ref.entity_id)
        || roleLogicalRevisions.includes(logicalRevisionKey(ref))) {
      refuse("scope_refused");
    }
  }
  if (selectedCommonRefs.some((ref) => !approvedIdentities.has(exactRefIdentityKey(ref)))) {
    refuse("scope_refused");
  }

  if (typeof snapshot.document_sha256 !== "string" || !SHA256_HEX.test(snapshot.document_sha256)) {
    refuse("input_refused");
  }
  if (refusedRelativeLocator(snapshot.relative_locator)) refuse("locator_refused");
  const projectRootPath = snapshot.project_root_path;
  const commonRootPath = snapshot.common_root_path;
  const containmentRootPath = snapshot.containment_root_path;
  for (const path of [projectRootPath, commonRootPath, containmentRootPath]) {
    if (refusedAbsoluteLocalPath(path)) refuse("root_refused");
  }

  const request = {
    schema_version: PROJECT_KNOWLEDGE_VIEW_REQUEST_SCHEMA_VERSION,
    feature_state: FEATURE_STATE,
    project_binding_refs: [cloneRef(projectRef)],
    common_revision_refs: selectedCommonRefs.map(cloneRef),
  };
  // The authority grant ref commits to every other field of its own grant, so no
  // single field can be swapped while the ref still verifies. The ref itself is
  // excluded from its own material, exactly as the Knowledge View recomputes it.
  const authorityGrantMaterial = {
    schema_version: PROJECT_KNOWLEDGE_VIEW_AUTHORITY_GRANT_SCHEMA_VERSION,
    feature_state: FEATURE_STATE,
    authority_ceiling: KNOWLEDGE_VIEW_AUTHORITY_CEILING,
    policy_ref: cloneRef(knowledgeViewPolicyRef),
    project_binding_ref: cloneRef(projectRef),
    project_root_path: projectRootPath,
    common_root_path: commonRootPath,
    containment_root_path: containmentRootPath,
    approved_common_revision_refs: approvedCommonRefs.map(cloneRef),
  };
  const authorityGrant = {
    ...authorityGrantMaterial,
    grant_ref: bindRef(
      knowledgeViewGrantIdentity,
      canonicalFingerprint(
        PROJECT_KNOWLEDGE_VIEW_AUTHORITY_GRANT_HASH_DOMAIN,
        authorityGrantMaterial,
      ),
    ),
  };

  // The one selector run. It is metadata only: it authenticates the roots, the
  // scope and the local admission and returns commitments, and this seam takes
  // both fingerprints from it rather than inventing values of its own.
  const view = selectView(request, authorityGrant, cloneRef(authorityGrant.grant_ref));
  if (!SHA256_CONTENT_ID.test(view.knowledge_scope_fingerprint_sha256)
      || !SHA256_CONTENT_ID.test(view.local_admission_fingerprint_sha256)) {
    refuse("knowledge_view_refused");
  }

  const readGrantMaterial = {
    schema_version: READ_GRANT_SCHEMA_VERSION,
    feature_state: FEATURE_STATE,
    authority_ceiling: READ_GRANT_AUTHORITY_CEILING,
    read_policy_ref: cloneRef(documentReadPolicyRef),
    project_binding_ref: cloneRef(projectRef),
    knowledge_scope_fingerprint_sha256: view.knowledge_scope_fingerprint_sha256,
    local_admission_fingerprint_sha256: view.local_admission_fingerprint_sha256,
    relative_locator: snapshot.relative_locator,
    // Nothing else in the grant carries the document digest, so the exact
    // revision content id is the pin a later opened body must satisfy.
    document_revision_ref: bindRef(documentRevisionIdentity, `sha256:${snapshot.document_sha256}`),
    media_type: MEDIA_TYPE,
  };
  const readGrant = {
    ...readGrantMaterial,
    grant_ref: bindRef(
      documentReadGrantIdentity,
      canonicalFingerprint(READ_GRANT_HASH_DOMAIN, readGrantMaterial),
    ),
  };

  const launch = {
    schema_version: LAUNCH_SCHEMA_VERSION,
    feature_state: FEATURE_STATE,
    project_knowledge_view_request: request,
    project_knowledge_view_authority_grant: authorityGrant,
    expected_project_knowledge_view_authority_grant_ref: cloneRef(authorityGrant.grant_ref),
    document_read_grant: readGrant,
    expected_document_read_grant_ref: cloneRef(readGrant.grant_ref),
  };

  // The commitment an admission run will be pinned against: the canonical
  // serialisation plus exactly one newline. The bytes are hashed and dropped
  // here, so no launch payload hangs off the returned candidate.
  const launchBytes = canonicalLaunchBytes(launch);
  const challengeMaterial = {
    schema_version: CHALLENGE_SCHEMA_VERSION,
    purpose: CHALLENGE_PURPOSE,
    launch_sha256: sha256Hex(launchBytes),
    launch_byte_count: launchBytes.byteLength,
    project_binding_ref: cloneRef(readGrant.project_binding_ref),
    document_revision_ref: cloneRef(readGrant.document_revision_ref),
    document_read_grant_ref: cloneRef(readGrant.grant_ref),
  };
  const challenge = {
    ...challengeMaterial,
    challenge_sha256: bareCanonicalDigest(CHALLENGE_HASH_DOMAIN, challengeMaterial),
  };

  const candidate = deepFreeze({
    schema_version: CANDIDATE_SCHEMA_VERSION,
    status: CANDIDATE_STATUS,
    feature_state: FEATURE_STATE,
    sensitivity: CANDIDATE_SENSITIVITY,
    runnable: false,
    launch_material: launch,
    challenge,
    // Nothing is sealed, correlated, verified or approved by preparing material.
    // A seal correlated later still proves only which bytes were sealed, never
    // who sealed them: that answer lives with the external owner and registry.
    gates: {
      external_owner_seal_required: true,
      external_owner_seal_correlated: false,
      independent_provenance_verified: false,
      owner_approval_verified: false,
    },
    effects: {
      filesystem_writes: 0,
      document_body_reads: 0,
      network_calls: 0,
      model_calls: 0,
    },
  });
  // Branded only after it is frozen, so the object the seal step can recognise is
  // the exact object handed back here and never something that resembles it.
  PREPARED_CANDIDATES.add(candidate);
  return candidate;
}

// ---------------------------------------------------------------- seal

/**
 * Correlates one external owner seal with one prepared candidate and returns the
 * canonical launch bytes that seal is bound to.
 *
 * Correlation is not identity. A seal accepted here proves only that these exact
 * launch bytes and this exact challenge are the ones it names; it cannot prove
 * who issued it. The same caller that prepared the candidate can also create
 * every value on the seal, so nothing verified here is evidence of a second
 * party: the actual Owner, the trusted registry and the sealing key stay external
 * to this module and to this process. A hand crafted launch can also reach the
 * admission seam without ever passing through this helper, so a PASS receipt is
 * not approval, not provenance and not a production ready path.
 *
 * The order below is the safe sequence and is not an implementation detail: the
 * handed seal is snapshotted into owned plain data before one semantic decision
 * is taken on it, the candidate is recomputed from its own launch material rather
 * than read back, and only then are the seal's two pins compared. The selector is
 * not run again, nothing is opened and nothing is written.
 */
export function sealProjectPdfAdmissionLaunch(candidate, externalOwnerSeal) {
  const prepared = preparedCandidate(candidate);
  const seal = acceptedExternalOwnerSeal(externalOwnerSeal);
  const { launchBytes, launchSha256, challengeSha256 } = verifiedCandidateCommitment(prepared);

  // Both pins exactly: a seal correlated to another challenge or to other launch
  // bytes is refused rather than reported as a weaker pass. What holds after this
  // line is still correlation alone — which bytes were sealed, not who sealed
  // them, and not that anyone outside this process ever saw them.
  if (seal.challenge_sha256 !== challengeSha256 || seal.launch_sha256 !== launchSha256) {
    refuse("seal_refused");
  }

  // A fresh byte snapshot on every call, so a caller that writes into one result
  // cannot reach the candidate, the receipt or any later call. The wrapper is
  // frozen; the bytes stay an ordinary mutable Buffer.
  return Object.freeze({
    launchBytes,
    launchSha256,
    receipt: sealReceipt(launchSha256, launchBytes.byteLength),
  });
}

// A proxy answers every reflective read with caller code and a revoked one cannot
// answer at all, so both are settled by object identity alone, before a single
// trap capable read. An unbranded look alike is refused here too, however
// faithful: the brand is in-memory correlation convenience, not issuer proof.
function preparedCandidate(candidate) {
  if (candidate === null || typeof candidate !== "object" || types.isProxy(candidate)
      || !PREPARED_CANDIDATES.has(candidate) || !Object.isFrozen(candidate)) {
    refuse("candidate_refused");
  }
  exactKeys(candidate, CANDIDATE_FIELDS, "candidate_refused");
  if (candidate.schema_version !== CANDIDATE_SCHEMA_VERSION
      || candidate.status !== CANDIDATE_STATUS
      || candidate.feature_state !== FEATURE_STATE
      || candidate.sensitivity !== CANDIDATE_SENSITIVITY
      || candidate.runnable !== false) {
    refuse("candidate_refused");
  }
  return candidate;
}

// The candidate is recomputed rather than read back: the launch bytes are rebuilt
// from its own launch material, the digest and the count are taken from those
// bytes, the challenge digest is recomputed over the challenge's own fields, and
// each of the three challenge refs must be the exact ref the launch carries.
function verifiedCandidateCommitment(prepared) {
  const launch = exactKeys(prepared.launch_material, LAUNCH_MATERIAL_FIELDS, "candidate_refused");
  const readGrant = exactKeys(launch.document_read_grant, READ_GRANT_FIELDS, "candidate_refused");
  const challenge = exactKeys(prepared.challenge, CHALLENGE_FIELDS, "candidate_refused");
  const authorityGrant = launch.project_knowledge_view_authority_grant;
  if (launch.schema_version !== LAUNCH_SCHEMA_VERSION
      || launch.feature_state !== FEATURE_STATE
      || readGrant.schema_version !== READ_GRANT_SCHEMA_VERSION
      || readGrant.feature_state !== FEATURE_STATE
      || readGrant.authority_ceiling !== READ_GRANT_AUTHORITY_CEILING
      || readGrant.media_type !== MEDIA_TYPE
      || authorityGrant === null || typeof authorityGrant !== "object"
      || !sameExactRef(
        launch.expected_project_knowledge_view_authority_grant_ref,
        authorityGrant.grant_ref,
      )
      || !sameExactRef(launch.expected_document_read_grant_ref, readGrant.grant_ref)
      || challenge.schema_version !== CHALLENGE_SCHEMA_VERSION
      || challenge.purpose !== CHALLENGE_PURPOSE) {
    refuse("candidate_refused");
  }

  const launchBytes = canonicalLaunchBytes(launch);
  const launchSha256 = sha256Hex(launchBytes);
  if (challenge.launch_sha256 !== launchSha256
      || challenge.launch_byte_count !== launchBytes.byteLength) {
    refuse("candidate_refused");
  }

  const pinnedRefs = [
    [challenge.project_binding_ref, readGrant.project_binding_ref],
    [challenge.document_revision_ref, readGrant.document_revision_ref],
    [challenge.document_read_grant_ref, readGrant.grant_ref],
  ];
  if (pinnedRefs.some(([challengeRef, launchRef]) => (
    !wellFormedExactRef(challengeRef) || !sameExactRef(challengeRef, launchRef)
  ))) {
    refuse("candidate_refused");
  }

  const challengeSha256 = bareCanonicalDigest(CHALLENGE_HASH_DOMAIN, {
    schema_version: challenge.schema_version,
    purpose: challenge.purpose,
    launch_sha256: challenge.launch_sha256,
    launch_byte_count: challenge.launch_byte_count,
    project_binding_ref: cloneRef(challenge.project_binding_ref),
    document_revision_ref: cloneRef(challenge.document_revision_ref),
    document_read_grant_ref: cloneRef(challenge.document_read_grant_ref),
  });
  if (challenge.challenge_sha256 !== challengeSha256) refuse("candidate_refused");
  return { launchBytes, launchSha256, challengeSha256 };
}

// The handed seal is copied into owned plain data before one semantic decision is
// taken on it, so a proxy, an accessor, a custom prototype, an aliased node, a
// cycle, a sparse array, an extra key or a missing key loses without any caller
// code being called back into. The caller's own graph is only read, never written.
function acceptedExternalOwnerSeal(externalOwnerSeal) {
  const seal = snapshotPlainData(externalOwnerSeal, { seen: new WeakSet(), nodes: 0 }, 0);
  exactKeys(seal, EXTERNAL_OWNER_SEAL_FIELDS, "seal_refused");
  if (seal.schema_version !== EXTERNAL_OWNER_SEAL_SCHEMA_VERSION
      || seal.claim_ceiling !== SEAL_CLAIM_CEILING
      || typeof seal.challenge_sha256 !== "string" || !SHA256_HEX.test(seal.challenge_sha256)
      || typeof seal.launch_sha256 !== "string" || !SHA256_HEX.test(seal.launch_sha256)
      || !wellFormedExactRef(seal.seal_ref)) {
    refuse("seal_refused");
  }
  // Recomputed, not trusted: the ref commits to every other field of the seal and
  // is excluded from its own material, so no single pin can be swapped while the
  // ref still verifies. Verifying it still says nothing about who bound it.
  const material = {
    schema_version: seal.schema_version,
    claim_ceiling: seal.claim_ceiling,
    challenge_sha256: seal.challenge_sha256,
    launch_sha256: seal.launch_sha256,
  };
  if (seal.seal_ref.content_id
      !== canonicalFingerprint(EXTERNAL_OWNER_SEAL_HASH_DOMAIN, material)) {
    refuse("seal_refused");
  }
  return seal;
}

// The same exact ref shape the prepare step admits, asked as a question rather
// than raised as a refusal, so the seal step can name which shape drifted.
function wellFormedExactRef(ref) {
  try {
    validateExactRef(ref);
    return true;
  } catch {
    return false;
  }
}

// The receipt is the part that may be shown, so it carries booleans, counts and
// one digest that was already committed to, and nothing else: no path, no
// locator, no ref and no launch or seal payload. Every authority stays false and
// every effect stays zero, because correlating a seal decides nothing and does
// nothing — no write, no body read, no network, model, RAG, Wiki, Engine, ERP or
// TaskDriver call happens on this path.
function sealReceipt(launchSha256, byteCount) {
  return deepFreeze({
    schema_version: SEAL_RECEIPT_SCHEMA_VERSION,
    mode: SEAL_MODE,
    result: "PASS",
    feature_state: FEATURE_STATE,
    binding: {
      canonical_launch_bytes: true,
      external_seal_content_binding_verified: true,
      challenge_binding_verified: true,
      launch_binding_verified: true,
      // Correlation only, stated where it is decided: which bytes were sealed is
      // knowable here, who sealed them is not and is not claimed.
      correlation_only: true,
      independent_provenance_verified: false,
    },
    launch: { sha256: launchSha256, byte_count: byteCount },
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
}

// ---------------------------------------------------------------- input snapshot

// The whole input is copied into owned plain data before one semantic decision is
// taken on it, so every later read sees the same values this snapshot saw. A
// proxy answers every reflective read with caller code and a revoked one cannot
// answer at all, so the proxy test comes before `Array.isArray` and before any
// other trap capable read. Accessors, symbol keys, non-enumerable properties, a
// custom prototype, a non-NFC string or key, a sparse or exotic array, a cycle
// and an aliased node are refused rather than normalised. The caller's own graph
// is only read, never written.
function snapshotPlainData(value, state, depth) {
  if (depth > MAX_GRAPH_DEPTH || value === null) refuse("input_refused");

  const kind = typeof value;
  if (kind === "string") {
    if (value.length > MAX_STRING_LENGTH || value.normalize("NFC") !== value) {
      refuse("input_refused");
    }
    return value;
  }
  if (kind === "boolean") return value;
  if (kind === "number" && Number.isSafeInteger(value)) return value;
  if (kind !== "object" || types.isProxy(value)) refuse("input_refused");
  if (state.seen.has(value)) refuse("input_refused");
  state.seen.add(value);
  state.nodes += 1;
  if (state.nodes > MAX_GRAPH_NODES) refuse("input_refused");

  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.length > MAX_OBJECT_KEYS
      || ownKeys.some((key) => typeof key === "symbol")) {
    refuse("input_refused");
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);

  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype
        || value.length > MAX_ARRAY_LENGTH
        || !Object.hasOwn(descriptors, "length")) {
      refuse("input_refused");
    }
    const keys = Object.keys(descriptors).filter((key) => key !== "length");
    if (keys.length !== value.length) refuse("input_refused");
    const output = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !Object.hasOwn(descriptor, "value") || descriptor.enumerable !== true) {
        refuse("input_refused");
      }
      output.push(snapshotPlainData(descriptor.value, state, depth + 1));
    }
    return output;
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) refuse("input_refused");
  const output = {};
  for (const key of Object.keys(descriptors)) {
    const descriptor = descriptors[key];
    if (!Object.hasOwn(descriptor, "value") || descriptor.enumerable !== true
        || key.normalize("NFC") !== key) {
      refuse("input_refused");
    }
    Object.defineProperty(output, key, {
      value: snapshotPlainData(descriptor.value, state, depth + 1),
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return output;
}

// ---------------------------------------------------------------- shapes

// The refusal code is a parameter so the seal step can name which of its own
// closed shapes drifted. No key, value or path rides out on any of them.
function exactKeys(value, expected, code = "input_refused") {
  if (value === null || typeof value !== "object" || Array.isArray(value)) refuse(code);
  const actual = Object.keys(value).sort(compareCodePoints);
  const required = [...expected].sort(compareCodePoints);
  if (actual.length !== required.length || actual.some((key, index) => key !== required[index])) {
    refuse(code);
  }
  return value;
}

// An identifier pair names which subject and which state of it. A revision that
// is not a canonical uuid, a content derived digest or a numbered revision is
// refused, because a floating revision would let the pinned material move.
function validateIdentity(identity) {
  exactKeys(identity, IDENTITY_FIELDS);
  const { entity_id: entityId, revision_id: revisionId } = identity;
  if (!SAFE_IDENTIFIER.test(entityId) || !SAFE_IDENTIFIER.test(revisionId)
      || inspectIdentifierOpacity(entityId).opaque !== true
      || inspectIdentifierOpacity(revisionId).opaque !== true
      || RESERVED_FLOATING_REVISION.test(revisionId)
      || !(CANONICAL_UUID.test(revisionId)
        || CONTENT_DERIVED_REVISION.test(revisionId)
        || NUMBERED_REVISION.test(revisionId))) {
    refuse("input_refused");
  }
  return identity;
}

function validateExactRef(ref) {
  exactKeys(ref, EXACT_REF_FIELDS);
  if (!isWellFormedRef(ref)
      || ref.content_hash_alg !== HASH_ALG
      || !SHA256_CONTENT_ID.test(ref.content_id)) {
    refuse("input_refused");
  }
  validateIdentity({ entity_id: ref.entity_id, revision_id: ref.revision_id });
  return ref;
}

// Common refs may not contradict a role, repeat one identity, or name one
// revision of one subject twice under different bytes. The order is fixed by the
// exact identity key, so the same set always canonicalises to the same bytes.
function normalizeCommonRefs(refs) {
  if (!Array.isArray(refs) || refs.length > MAX_ARRAY_LENGTH) refuse("input_refused");
  const exactKeysSeen = new Set();
  const logicalKeysSeen = new Map();
  const normalized = [];
  for (const ref of refs) {
    validateExactRef(ref);
    const exactKey = exactRefIdentityKey(ref);
    const logicalKey = logicalRevisionKey(ref);
    if (exactKey === null || logicalKey === null) refuse("input_refused");
    if (exactKeysSeen.has(exactKey)) refuse("scope_refused");
    if (logicalKeysSeen.has(logicalKey) && logicalKeysSeen.get(logicalKey) !== exactKey) {
      refuse("scope_refused");
    }
    exactKeysSeen.add(exactKey);
    logicalKeysSeen.set(logicalKey, exactKey);
    normalized.push(cloneRef(ref));
  }
  normalized.sort((left, right) => compareCodePoints(
    exactRefIdentityKey(left),
    exactRefIdentityKey(right),
  ));
  return normalized;
}

function cloneRef(ref) {
  return {
    entity_id: ref.entity_id,
    revision_id: ref.revision_id,
    content_id: ref.content_id,
    content_hash_alg: ref.content_hash_alg,
  };
}

function bindRef(identity, contentId) {
  if (typeof contentId !== "string" || !SHA256_CONTENT_ID.test(contentId)) refuse("launch_refused");
  return {
    entity_id: identity.entity_id,
    revision_id: identity.revision_id,
    content_id: contentId,
    content_hash_alg: HASH_ALG,
  };
}

function deepFreeze(value) {
  if (value === null || typeof value !== "object") return value;
  for (const key of Object.keys(value)) deepFreeze(value[key]);
  return Object.freeze(value);
}

// ---------------------------------------------------------------- fingerprints

const sha256Hex = (input) => createHash(HASH_ALG).update(input).digest("hex");

function insertionOrderRules(value) {
  const rules = {};
  const visit = (node, path = "") => {
    if (Array.isArray(node)) {
      rules[path] = "insertion_ordered";
      for (const child of node) visit(child, `${path}[]`);
    } else if (node !== null && typeof node === "object") {
      for (const [key, child] of Object.entries(node)) {
        visit(child, path ? `${path}.${key}` : key);
      }
    }
  };
  visit(value);
  return rules;
}

// The hash domain, a NUL separator, then the canonical serialisation of the
// material. A material that cannot be canonicalised has no fingerprint, and the
// contract error that says why is caught here so no detail rides out on it.
function canonicalText(material) {
  try {
    return canonicalise(material, insertionOrderRules(material));
  } catch {
    return refuse("launch_refused");
  }
}

const canonicalFingerprint = (domain, material) => (
  `sha256:${sha256Hex(`${domain}\0${canonicalText(material)}`)}`
);

const bareCanonicalDigest = (domain, material) => (
  sha256Hex(`${domain}\0${canonicalText(material)}`)
);

function canonicalLaunchBytes(launch) {
  return Buffer.from(`${canonicalText(launch)}\n`, "utf8");
}

function selectView(request, authorityGrant, expectedAuthorityGrantRef) {
  try {
    return selectProjectKnowledgeView(request, authorityGrant, expectedAuthorityGrantRef);
  } catch {
    return refuse("knowledge_view_refused");
  }
}

// ---------------------------------------------------------------- path forms

function controlFree(value) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x20 || code === 0x7f) return false;
  }
  return true;
}

// A local absolute root path in its one normalised NFC form and nothing else: no
// UNC or device namespace, no control character, no alternate data stream and no
// windows alias segment that would resolve to a different directory than the one
// checked. This is lexical only; no directory is opened or enumerated here.
function refusedAbsoluteLocalPath(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_PATH_CHARS
      || !controlFree(value) || value.normalize("NFC") !== value || !isAbsolute(value)
      || resolve(value) !== value || WINDOWS_UNC_OR_DEVICE_NAMESPACE.test(value)) return true;
  const colonStart = WINDOWS_DRIVE_DESIGNATOR.test(value) ? 2 : 0;
  if (value.includes(":", colonStart)) return true;
  if (process.platform !== "win32") return false;
  if (WINDOWS_TRIMMED_SEGMENT.test(value)) return true;
  return value.split(/[\\/]/u).filter(Boolean).some((segment) => WINDOWS_DEVICE_NAME.test(segment));
}

// Exactly the locator form the admission seam accepts: one leaf below the
// admitted project root, relative, forward slashed, free of traversal and free of
// the windows alias forms that resolve to a different file than the one checked.
function refusedRelativeLocator(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_LOCATOR_CHARS
      || !controlFree(value) || value.normalize("NFC") !== value || isAbsolute(value)
      || WINDOWS_UNC_OR_DEVICE_NAMESPACE.test(value) || /^[A-Za-z]:/u.test(value)
      || value.includes("\\") || value.includes(":")) return true;
  const segments = value.split("/");
  if (segments.length === 0 || segments.length > MAX_LOCATOR_SEGMENTS) return true;
  return segments.some((segment) => (
    segment.length === 0 || segment.length > MAX_LOCATOR_SEGMENT_CHARS
    || segment === "." || segment === ".."
    || TRAILING_DOT_OR_SPACE.test(segment)
    || WINDOWS_DEVICE_NAME.test(segment)
  ));
}
