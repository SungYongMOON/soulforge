import { createHash, randomUUID } from "node:crypto";
import {
  link,
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rmdir,
  unlink,
} from "node:fs/promises";
import path from "node:path";

import {
  serializeCanonicalIdentity,
  validateTypedRef,
} from "../shared/temporal_identity.mjs";
import {
  assertNoWindowsPathCollisions,
  decideImmutableRagOutput,
  resolveRagOwnerRoot,
  verifyRagWriteContainment,
} from "./project_rag_paths.mjs";
import { PROJECT_RAG_PILOT_BUNDLE_SCHEMA_VERSION } from "./project_rag_pilot.mjs";

export const PROJECT_RAG_WRITER_AUTHORITY_SCHEMA_VERSION =
  "soulforge.project_rag_writer_authority.v1";
export const PROJECT_RAG_APPLY_RECEIPT_SCHEMA_VERSION =
  "soulforge.project_rag_apply_receipt.v1";
export const PROJECT_RAG_ROLLBACK_RECEIPT_SCHEMA_VERSION =
  "soulforge.project_rag_rollback_receipt.v1";
export const PROJECT_RAG_OWNER_ROOT_BOOTSTRAP_RECEIPT_SCHEMA_VERSION =
  "soulforge.project_rag_owner_root_bootstrap_receipt.v1";

const CONTENT_ID_RE = /^sha256:[0-9a-f]{64}$/u;
const APPLY_OPERATION = "project_rag_v1_pilot_apply";
const ROLLBACK_OPERATION = "project_rag_v1_pilot_rollback";
const BOOTSTRAP_OPERATION = "project_rag_v1_owner_root_bootstrap";
const MAX_ARTIFACTS = 4;

export class ProjectRagWriterError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = "ProjectRagWriterError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

function fail(code, message, details) {
  throw new ProjectRagWriterError(code, message, details);
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertExactKeys(value, expected, code, label) {
  if (!isPlainObject(value)) fail(code, `${label} must be a plain object`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length
    || actual.some((key, index) => key !== wanted[index])
  ) fail(code, `${label} has an invalid exact field set`);
}

function canonicalDigest(value) {
  return `sha256:${createHash("sha256")
    .update(serializeCanonicalIdentity(value), "utf8")
    .digest("hex")}`;
}

function normalizeContentId(value, code, label) {
  if (typeof value !== "string" || !CONTENT_ID_RE.test(value)) {
    fail(code, `${label} must be sha256:<64 lowercase hex>`);
  }
  return value;
}

function normalizeProjectRef(value) {
  let ref;
  try {
    ref = validateTypedRef(value);
  } catch {
    fail("RAG_WRITER_PROJECT_REF_INVALID", "project ref is invalid");
  }
  if (ref.entity_type !== "project" || ref.owner_surface !== "dev_erp") {
    fail("RAG_WRITER_PROJECT_REF_INVALID", "project ref must be owned by dev_erp");
  }
  return ref;
}

function normalizeOwnerDecisionRef(value) {
  let ref;
  try {
    ref = validateTypedRef(value);
  } catch {
    fail("RAG_WRITER_OWNER_DECISION_REF_INVALID", "owner decision ref is invalid");
  }
  if (ref.entity_type !== "owner_decision") {
    fail(
      "RAG_WRITER_OWNER_DECISION_REF_INVALID",
      "owner decision ref must use owner_decision entity type",
    );
  }
  return ref;
}

function refsEqual(left, right) {
  return serializeCanonicalIdentity(left) === serializeCanonicalIdentity(right);
}

function artifactBytes(artifact) {
  return Buffer.from(serializeCanonicalIdentity(artifact.payload), "utf8");
}

function validateArtifact(artifact, projectRef, label) {
  assertExactKeys(
    artifact,
    ["target_ref", "serialization_profile_id", "canonical_content_id", "payload"],
    "RAG_WRITER_ARTIFACT_SHAPE_INVALID",
    label,
  );
  if (typeof artifact.target_ref !== "string" || artifact.target_ref.length === 0) {
    fail("RAG_WRITER_TARGET_REF_INVALID", `${label}.target_ref is invalid`);
  }
  if (
    typeof artifact.serialization_profile_id !== "string"
    || artifact.serialization_profile_id.length === 0
  ) fail("RAG_WRITER_SERIALIZATION_PROFILE_INVALID", `${label} profile is invalid`);
  if (!isPlainObject(artifact.payload)) {
    fail("RAG_WRITER_ARTIFACT_PAYLOAD_INVALID", `${label}.payload is invalid`);
  }
  if (
    !refsEqual(artifact.payload.project_ref, projectRef)
    || !artifact.target_ref.startsWith(
      `_workspaces/${projectRef.entity_id}/reference_payloads/rag/`,
    )
  ) fail("RAG_WRITER_ARTIFACT_PROJECT_MISMATCH", `${label} is not project-bound`);
  const expectedContentId = normalizeContentId(
    artifact.canonical_content_id,
    "RAG_WRITER_ARTIFACT_DIGEST_INVALID",
    `${label}.canonical_content_id`,
  );
  const bytes = artifactBytes(artifact);
  const actualContentId = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
  if (actualContentId !== expectedContentId) {
    fail("RAG_WRITER_ARTIFACT_DIGEST_MISMATCH", `${label} digest does not match payload`);
  }
  return {
    target_ref: artifact.target_ref,
    canonical_content_id: expectedContentId,
    bytes,
  };
}

function validateBundle(bundle) {
  assertExactKeys(
    bundle,
    [
      "schema_version",
      "kind",
      "mode",
      "apply_requested",
      "write_allowed",
      "project_ref",
      "identity_summary",
      "index",
      "lineage_sidecar",
      "answer_run",
      "rollback_manifest",
      "next_gate",
      "bundle_digest",
    ],
    "RAG_WRITER_BUNDLE_SHAPE_INVALID",
    "bundle",
  );
  if (
    bundle.schema_version !== PROJECT_RAG_PILOT_BUNDLE_SCHEMA_VERSION
    || bundle.kind !== "project_rag_pilot_bundle"
    || bundle.mode !== "build_only"
    || bundle.apply_requested !== false
    || bundle.write_allowed !== false
  ) fail("RAG_WRITER_BUNDLE_STATE_INVALID", "bundle is not a build-only pilot bundle");
  assertExactKeys(
    bundle.next_gate,
    ["status", "apply_implementation_present", "external_owner_binding_present"],
    "RAG_WRITER_BUNDLE_GATE_INVALID",
    "bundle.next_gate",
  );
  if (bundle.next_gate.status !== "blocked_pending_separate_writer_gate") {
    fail("RAG_WRITER_BUNDLE_GATE_INVALID", "bundle did not stop at the writer gate");
  }
  const projectRef = normalizeProjectRef(bundle.project_ref);
  const bundleBasis = { ...bundle };
  delete bundleBasis.bundle_digest;
  const bundleDigest = normalizeContentId(
    bundle.bundle_digest,
    "RAG_WRITER_BUNDLE_DIGEST_INVALID",
    "bundle.bundle_digest",
  );
  if (bundleDigest !== canonicalDigest(bundleBasis)) {
    fail("RAG_WRITER_BUNDLE_DIGEST_MISMATCH", "bundle digest does not match bundle basis");
  }
  const artifacts = [
    validateArtifact(bundle.index, projectRef, "bundle.index"),
    validateArtifact(bundle.lineage_sidecar, projectRef, "bundle.lineage_sidecar"),
    ...(bundle.answer_run === null
      ? []
      : [validateArtifact(bundle.answer_run, projectRef, "bundle.answer_run")]),
    validateArtifact(bundle.rollback_manifest, projectRef, "bundle.rollback_manifest"),
  ];
  if (artifacts.length < 3 || artifacts.length > MAX_ARTIFACTS) {
    fail("RAG_WRITER_ARTIFACT_COUNT_INVALID", "bundle artifact count is outside bounds");
  }
  const uniqueRefs = new Set(artifacts.map((artifact) => artifact.target_ref));
  if (uniqueRefs.size !== artifacts.length) {
    fail("RAG_WRITER_TARGET_DUPLICATE", "bundle output target refs must be unique");
  }
  try {
    assertNoWindowsPathCollisions(artifacts.map((artifact) => artifact.target_ref));
  } catch (error) {
    fail("RAG_WRITER_TARGET_COLLISION", "bundle output target refs collide", {
      cause_code: error?.code ?? "unknown",
    });
  }
  const expectedCreated = artifacts.slice(0, -1).map((artifact) => ({
    target_ref: artifact.target_ref,
    expected_content_id: artifact.canonical_content_id,
    rollback_action: "delete_only_if_digest_matches",
  }));
  const rollbackPayload = bundle.rollback_manifest.payload;
  if (
    rollbackPayload?.mode !== "plan_only"
    || rollbackPayload?.apply_allowed !== false
    || !refsEqual(rollbackPayload?.project_ref, projectRef)
    || serializeCanonicalIdentity(rollbackPayload?.created_outputs)
      !== serializeCanonicalIdentity(expectedCreated)
  ) fail("RAG_WRITER_ROLLBACK_PLAN_MISMATCH", "rollback plan does not match outputs");
  return { projectRef, bundleDigest, artifacts };
}

function outputSetDigest(artifacts) {
  return canonicalDigest(artifacts.map((artifact) => ({
    target_ref: artifact.target_ref,
    canonical_content_id: artifact.canonical_content_id,
  })));
}

function buildAuthorityRequest({ operation, projectRef, ownerDecisionRef, bundleDigest, outputs }) {
  return Object.freeze({
    project_ref: projectRef,
    owner_decision_ref: ownerDecisionRef,
    operation,
    bundle_digest: bundleDigest,
    output_set_digest: outputSetDigest(outputs),
    local_private_only: true,
    external_upload_allowed: false,
    canon_promotion_allowed: false,
  });
}

function resolveAuthority(resolver, request) {
  if (typeof resolver !== "function") {
    fail(
      "RAG_WRITER_TRUSTED_AUTHORITY_RESOLVER_REQUIRED",
      "trusted owner-decision resolver is required",
    );
  }
  let value;
  try {
    value = resolver(request);
  } catch {
    fail("RAG_WRITER_AUTHORITY_RESOLUTION_FAILED", "owner decision resolution failed");
  }
  assertExactKeys(
    value,
    [
      "schema_version",
      "project_ref",
      "owner_decision_ref",
      "operation",
      "bundle_digest",
      "output_set_digest",
      "local_private_only",
      "external_upload_allowed",
      "canon_promotion_allowed",
      "approved",
      "decision_evidence_digest",
      "authority_evidence_digest",
    ],
    "RAG_WRITER_AUTHORITY_ATTESTATION_INVALID",
    "authority attestation",
  );
  const payload = { ...value };
  delete payload.authority_evidence_digest;
  if (
    payload.schema_version !== PROJECT_RAG_WRITER_AUTHORITY_SCHEMA_VERSION
    || !refsEqual(payload.project_ref, request.project_ref)
    || !refsEqual(payload.owner_decision_ref, request.owner_decision_ref)
    || payload.operation !== request.operation
    || payload.bundle_digest !== request.bundle_digest
    || payload.output_set_digest !== request.output_set_digest
    || payload.local_private_only !== true
    || payload.external_upload_allowed !== false
    || payload.canon_promotion_allowed !== false
    || payload.approved !== true
  ) fail("RAG_WRITER_AUTHORITY_BINDING_MISMATCH", "authority attestation is not exact");
  normalizeContentId(
    payload.decision_evidence_digest,
    "RAG_WRITER_DECISION_EVIDENCE_DIGEST_INVALID",
    "decision_evidence_digest",
  );
  const authorityEvidenceDigest = normalizeContentId(
    value.authority_evidence_digest,
    "RAG_WRITER_AUTHORITY_EVIDENCE_DIGEST_INVALID",
    "authority_evidence_digest",
  );
  if (authorityEvidenceDigest !== canonicalDigest(payload)) {
    fail("RAG_WRITER_AUTHORITY_EVIDENCE_MISMATCH", "authority attestation digest mismatches");
  }
  return Object.freeze({ ...payload, authority_evidence_digest: authorityEvidenceDigest });
}

function containmentInput({ repoRoot, approvedOwnerRootRealpath, projectRef, targetRef }) {
  return {
    repo_root: repoRoot,
    owner_scope: "project",
    project_ref: projectRef,
    target_ref: targetRef,
    ...(approvedOwnerRootRealpath === null
      ? {}
      : { approved_owner_root_realpath: approvedOwnerRootRealpath }),
  };
}

function nativeTargetPath(repoRoot, targetRef) {
  return path.resolve(repoRoot, ...targetRef.split("/"));
}

function isNativePathContained(rootPath, candidatePath) {
  const relative = path.relative(rootPath, candidatePath);
  return relative === ""
    || (
      relative !== ".."
      && !relative.startsWith(`..${path.sep}`)
      && !path.isAbsolute(relative)
    );
}

async function existingPathState(candidatePath) {
  try {
    return { exists: true, stat: await lstat(candidatePath) };
  } catch (error) {
    if (error?.code === "ENOENT") return { exists: false, stat: null };
    throw error;
  }
}

export async function bootstrapProjectRagOwnerRoot(input, options = {}) {
  assertExactKeys(
    input,
    [
      "apply",
      "repo_root",
      "project_ref",
      "approved_project_root_realpath",
      "owner_decision_ref",
    ],
    "RAG_WRITER_BOOTSTRAP_INPUT_INVALID",
    "owner-root bootstrap input",
  );
  assertExactKeys(
    options,
    ["trusted_owner_decision_resolver"],
    "RAG_WRITER_OPTIONS_INVALID",
    "writer options",
  );
  if (input.apply !== true) {
    fail("RAG_WRITER_EXPLICIT_APPLY_REQUIRED", "owner-root bootstrap apply must be true");
  }
  if (typeof input.repo_root !== "string" || !path.isAbsolute(input.repo_root)) {
    fail("RAG_WRITER_REPO_ROOT_INVALID", "repo_root must be absolute");
  }
  if (
    typeof input.approved_project_root_realpath !== "string"
    || !path.isAbsolute(input.approved_project_root_realpath)
  ) fail("RAG_WRITER_PROJECT_ROOT_BINDING_INVALID", "project root binding is invalid");
  const projectRef = normalizeProjectRef(input.project_ref);
  const ownerDecisionRef = normalizeOwnerDecisionRef(input.owner_decision_ref);
  const owner = resolveRagOwnerRoot({ owner_scope: "project", project_ref: projectRef });
  const repoRoot = path.resolve(input.repo_root);
  const projectRootRef = `_workspaces/${projectRef.entity_id}`;
  const projectRootPath = nativeTargetPath(repoRoot, projectRootRef);
  const approvedProjectRootRealpath = await realpath(
    path.resolve(input.approved_project_root_realpath),
  ).catch(() => {
    fail("RAG_WRITER_PROJECT_ROOT_BINDING_INVALID", "approved project root is unreadable");
  });
  const projectRootState = await existingPathState(projectRootPath);
  if (!projectRootState.exists) {
    fail("RAG_WRITER_PROJECT_ROOT_MISSING", "lexical project workspace root is missing");
  }
  const projectRootRealpath = await realpath(projectRootPath);
  if (path.relative(approvedProjectRootRealpath, projectRootRealpath) !== "") {
    fail("RAG_WRITER_PROJECT_ROOT_BINDING_MISMATCH", "project root binding mismatches");
  }
  const ownerRootPath = nativeTargetPath(repoRoot, owner.owner_root_ref);
  if (!isNativePathContained(projectRootPath, ownerRootPath)) {
    fail("RAG_WRITER_PROJECT_ROOT_ESCAPE", "owner root escaped the project workspace root");
  }
  const referencePayloadsPath = path.dirname(ownerRootPath);
  const referenceState = await existingPathState(referencePayloadsPath);
  if (referenceState.exists && (
    referenceState.stat.isSymbolicLink()
    || !referenceState.stat.isDirectory()
  )) fail("RAG_WRITER_BOOTSTRAP_REPARSE_BLOCKED", "reference_payloads is not a plain directory");
  const ownerState = await existingPathState(ownerRootPath);
  if (ownerState.exists && (
    ownerState.stat.isSymbolicLink()
    || !ownerState.stat.isDirectory()
  )) fail("RAG_WRITER_BOOTSTRAP_REPARSE_BLOCKED", "RAG owner root is not a plain directory");
  const plan = {
    project_ref: projectRef,
    project_root_ref: projectRootRef,
    owner_root_ref: owner.owner_root_ref,
    operation: BOOTSTRAP_OPERATION,
  };
  const planDigest = canonicalDigest(plan);
  const authority = resolveAuthority(
    options.trusted_owner_decision_resolver,
    buildAuthorityRequest({
      operation: BOOTSTRAP_OPERATION,
      projectRef,
      ownerDecisionRef,
      bundleDigest: planDigest,
      outputs: [{
        target_ref: owner.owner_root_ref,
        canonical_content_id: planDigest,
      }],
    }),
  );
  const createdReferencePayloads = !referenceState.exists;
  const createdOwnerRoot = !ownerState.exists;
  try {
    await mkdir(ownerRootPath, { recursive: true });
    const ownerRootRealpath = await realpath(ownerRootPath);
    if (!isNativePathContained(projectRootRealpath, ownerRootRealpath)) {
      fail("RAG_WRITER_PROJECT_ROOT_ESCAPE", "created owner root escaped the project binding");
    }
    const containment = await verifyRagWriteContainment({
      repo_root: repoRoot,
      owner_scope: "project",
      project_ref: projectRef,
      target_ref: `${owner.owner_root_ref}/indexes_local/bootstrap_probe.json`,
      approved_owner_root_realpath: ownerRootRealpath,
    });
    if (containment.binding_status !== "approved_external" && projectRootState.stat.isSymbolicLink()) {
      fail("RAG_WRITER_OWNER_ROOT_BINDING_MISMATCH", "external owner binding was not verified");
    }
    const payload = {
      schema_version: PROJECT_RAG_OWNER_ROOT_BOOTSTRAP_RECEIPT_SCHEMA_VERSION,
      kind: "project_rag_owner_root_bootstrap_receipt",
      project_ref: projectRef,
      owner_root_ref: owner.owner_root_ref,
      plan_digest: planDigest,
      owner_decision_ref: ownerDecisionRef,
      authority_evidence_digest: authority.authority_evidence_digest,
      outcome: createdOwnerRoot ? "created" : "idempotent_noop",
      binding_status: containment.binding_status,
    };
    return Object.freeze({ ...payload, receipt_digest: canonicalDigest(payload) });
  } catch (error) {
    if (createdOwnerRoot) {
      try {
        await rmdir(ownerRootPath);
      } catch {
        // A non-empty or changed path is not safe to remove automatically.
      }
    }
    if (createdReferencePayloads) {
      try {
        await rmdir(referencePayloadsPath);
      } catch {
        // A non-empty or changed path is not safe to remove automatically.
      }
    }
    throw error;
  }
}

async function readExistingContentId(targetPath) {
  try {
    const bytes = await readFile(targetPath);
    return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function preflightArtifact(context, artifact) {
  await verifyRagWriteContainment(containmentInput({
    ...context,
    targetRef: artifact.target_ref,
  }));
  const targetPath = nativeTargetPath(context.repoRoot, artifact.target_ref);
  const existingContentId = await readExistingContentId(targetPath);
  let decision;
  try {
    decision = decideImmutableRagOutput({
      existing_digest: existingContentId,
      candidate_digest: artifact.canonical_content_id,
    });
  } catch (error) {
    fail("RAG_WRITER_IMMUTABLE_CONFLICT", "immutable output conflict", {
      target_ref: artifact.target_ref,
      cause_code: error?.code ?? "unknown",
    });
  }
  return { ...artifact, decision: decision.decision };
}

async function safeUnlinkTemp(tempPath) {
  try {
    await unlink(tempPath);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

async function exclusiveAtomicCreate(context, artifact) {
  const targetPath = nativeTargetPath(context.repoRoot, artifact.target_ref);
  const targetParent = path.dirname(targetPath);
  await mkdir(targetParent, { recursive: true });
  await verifyRagWriteContainment(containmentInput({
    ...context,
    targetRef: artifact.target_ref,
  }));

  const targetSegments = artifact.target_ref.split("/");
  const targetName = targetSegments.at(-1);
  const tempName = `.${targetName}.tmp-${randomUUID()}`;
  const tempRef = [...targetSegments.slice(0, -1), tempName].join("/");
  const tempPath = nativeTargetPath(context.repoRoot, tempRef);
  await verifyRagWriteContainment(containmentInput({ ...context, targetRef: tempRef }));

  let handle = null;
  try {
    handle = await open(tempPath, "wx");
    await handle.writeFile(artifact.bytes);
    await handle.sync();
    await handle.close();
    handle = null;
    await verifyRagWriteContainment(containmentInput({ ...context, targetRef: tempRef }));
    await verifyRagWriteContainment(containmentInput({
      ...context,
      targetRef: artifact.target_ref,
    }));
    try {
      await link(tempPath, targetPath);
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      const racedContentId = await readExistingContentId(targetPath);
      if (racedContentId !== artifact.canonical_content_id) {
        fail("RAG_WRITER_IMMUTABLE_CONFLICT", "target appeared with a different digest");
      }
      return "idempotent_noop";
    }
    const readbackContentId = await readExistingContentId(targetPath);
    if (readbackContentId !== artifact.canonical_content_id) {
      fail("RAG_WRITER_READBACK_MISMATCH", "created output failed readback verification");
    }
    return "created";
  } finally {
    if (handle !== null) await handle.close();
    await safeUnlinkTemp(tempPath);
  }
}

function receiptOutput(artifact) {
  return {
    target_ref: artifact.target_ref,
    canonical_content_id: artifact.canonical_content_id,
  };
}

function applyReceiptPayload({
  projectRef,
  bundleDigest,
  ownerDecisionRef,
  authority,
  created,
  idempotent,
}) {
  return {
    schema_version: PROJECT_RAG_APPLY_RECEIPT_SCHEMA_VERSION,
    kind: "project_rag_apply_receipt",
    project_ref: projectRef,
    bundle_digest: bundleDigest,
    owner_decision_ref: ownerDecisionRef,
    authority_evidence_digest: authority.authority_evidence_digest,
    created_outputs: created.map(receiptOutput),
    idempotent_outputs: idempotent.map(receiptOutput),
    write_count: created.length,
    noop_count: idempotent.length,
  };
}

async function rollbackCreatedAfterFailure(context, created) {
  for (const artifact of [...created].reverse()) {
    try {
      await verifyRagWriteContainment(containmentInput({
        ...context,
        targetRef: artifact.target_ref,
      }));
      const targetPath = nativeTargetPath(context.repoRoot, artifact.target_ref);
      const currentContentId = await readExistingContentId(targetPath);
      if (currentContentId === artifact.canonical_content_id) await unlink(targetPath);
    } catch {
      // The original error remains authoritative; unsafe cleanup is intentionally skipped.
    }
  }
}

export async function applyProjectRagPilotBundle(input, options = {}) {
  assertExactKeys(
    input,
    [
      "apply",
      "bundle",
      "repo_root",
      "approved_owner_root_realpath",
      "owner_decision_ref",
    ],
    "RAG_WRITER_APPLY_INPUT_INVALID",
    "apply input",
  );
  assertExactKeys(
    options,
    ["trusted_owner_decision_resolver"],
    "RAG_WRITER_OPTIONS_INVALID",
    "writer options",
  );
  if (input.apply !== true) fail("RAG_WRITER_EXPLICIT_APPLY_REQUIRED", "apply must be true");
  if (typeof input.repo_root !== "string" || !path.isAbsolute(input.repo_root)) {
    fail("RAG_WRITER_REPO_ROOT_INVALID", "repo_root must be absolute");
  }
  if (
    input.approved_owner_root_realpath !== null
    && (
      typeof input.approved_owner_root_realpath !== "string"
      || !path.isAbsolute(input.approved_owner_root_realpath)
    )
  ) fail("RAG_WRITER_OWNER_ROOT_BINDING_INVALID", "owner root binding is invalid");
  const bundle = validateBundle(input.bundle);
  const ownerDecisionRef = normalizeOwnerDecisionRef(input.owner_decision_ref);
  const authorityRequest = buildAuthorityRequest({
    operation: APPLY_OPERATION,
    projectRef: bundle.projectRef,
    ownerDecisionRef,
    bundleDigest: bundle.bundleDigest,
    outputs: bundle.artifacts,
  });
  const authority = resolveAuthority(
    options.trusted_owner_decision_resolver,
    authorityRequest,
  );
  const context = {
    repoRoot: path.resolve(input.repo_root),
    approvedOwnerRootRealpath: input.approved_owner_root_realpath,
    projectRef: bundle.projectRef,
  };
  const preflight = [];
  for (const artifact of bundle.artifacts) {
    preflight.push(await preflightArtifact(context, artifact));
  }
  const created = [];
  const idempotent = preflight.filter(
    (artifact) => artifact.decision === "idempotent_noop",
  );
  try {
    for (const artifact of preflight) {
      if (artifact.decision === "idempotent_noop") continue;
      const outcome = await exclusiveAtomicCreate(context, artifact);
      if (outcome === "created") created.push(artifact);
      else idempotent.push(artifact);
    }
  } catch (error) {
    await rollbackCreatedAfterFailure(context, created);
    throw error;
  }
  const payload = applyReceiptPayload({
    projectRef: bundle.projectRef,
    bundleDigest: bundle.bundleDigest,
    ownerDecisionRef,
    authority,
    created,
    idempotent,
  });
  return Object.freeze({ ...payload, receipt_digest: canonicalDigest(payload) });
}

function validateApplyReceipt(value) {
  assertExactKeys(
    value,
    [
      "schema_version",
      "kind",
      "project_ref",
      "bundle_digest",
      "owner_decision_ref",
      "authority_evidence_digest",
      "created_outputs",
      "idempotent_outputs",
      "write_count",
      "noop_count",
      "receipt_digest",
    ],
    "RAG_WRITER_APPLY_RECEIPT_INVALID",
    "apply receipt",
  );
  const payload = { ...value };
  delete payload.receipt_digest;
  if (
    value.schema_version !== PROJECT_RAG_APPLY_RECEIPT_SCHEMA_VERSION
    || value.kind !== "project_rag_apply_receipt"
    || normalizeContentId(
      value.receipt_digest,
      "RAG_WRITER_APPLY_RECEIPT_INVALID",
      "receipt_digest",
    ) !== canonicalDigest(payload)
  ) fail("RAG_WRITER_APPLY_RECEIPT_INVALID", "apply receipt digest mismatches");
  const projectRef = normalizeProjectRef(value.project_ref);
  const ownerDecisionRef = normalizeOwnerDecisionRef(value.owner_decision_ref);
  normalizeContentId(
    value.bundle_digest,
    "RAG_WRITER_APPLY_RECEIPT_INVALID",
    "bundle_digest",
  );
  normalizeContentId(
    value.authority_evidence_digest,
    "RAG_WRITER_APPLY_RECEIPT_INVALID",
    "authority_evidence_digest",
  );
  for (const field of ["created_outputs", "idempotent_outputs"]) {
    if (!Array.isArray(value[field]) || value[field].length > MAX_ARTIFACTS) {
      fail("RAG_WRITER_APPLY_RECEIPT_INVALID", `${field} is invalid`);
    }
    for (const output of value[field]) {
      assertExactKeys(
        output,
        ["target_ref", "canonical_content_id"],
        "RAG_WRITER_APPLY_RECEIPT_INVALID",
        field,
      );
      if (
        typeof output.target_ref !== "string"
        || !output.target_ref.startsWith(
          `_workspaces/${projectRef.entity_id}/reference_payloads/rag/`,
        )
      ) fail("RAG_WRITER_APPLY_RECEIPT_INVALID", `${field} target is invalid`);
      normalizeContentId(
        output.canonical_content_id,
        "RAG_WRITER_APPLY_RECEIPT_INVALID",
        `${field} digest`,
      );
    }
  }
  if (
    value.write_count !== value.created_outputs.length
    || value.noop_count !== value.idempotent_outputs.length
  ) fail("RAG_WRITER_APPLY_RECEIPT_INVALID", "apply receipt counts mismatch");
  return { ...value, project_ref: projectRef, owner_decision_ref: ownerDecisionRef };
}

async function rollbackOne(context, output) {
  await verifyRagWriteContainment(containmentInput({
    ...context,
    targetRef: output.target_ref,
  }));
  const targetPath = nativeTargetPath(context.repoRoot, output.target_ref);
  const currentContentId = await readExistingContentId(targetPath);
  if (currentContentId === null) return "already_absent";
  if (currentContentId !== output.canonical_content_id) {
    fail("RAG_WRITER_ROLLBACK_DIGEST_MISMATCH", "rollback target digest changed", {
      target_ref: output.target_ref,
    });
  }
  await verifyRagWriteContainment(containmentInput({
    ...context,
    targetRef: output.target_ref,
  }));
  await unlink(targetPath);
  if (await readExistingContentId(targetPath) !== null) {
    fail("RAG_WRITER_ROLLBACK_READBACK_FAILED", "rollback target still exists");
  }
  return "deleted";
}

async function preflightRollback(context, outputs) {
  for (const output of outputs) {
    await verifyRagWriteContainment(containmentInput({
      ...context,
      targetRef: output.target_ref,
    }));
    const targetPath = nativeTargetPath(context.repoRoot, output.target_ref);
    const currentContentId = await readExistingContentId(targetPath);
    if (
      currentContentId !== null
      && currentContentId !== output.canonical_content_id
    ) {
      fail("RAG_WRITER_ROLLBACK_DIGEST_MISMATCH", "rollback target digest changed", {
        target_ref: output.target_ref,
      });
    }
  }
}

export async function rollbackProjectRagPilotApply(input, options = {}) {
  assertExactKeys(
    input,
    [
      "rollback",
      "apply_receipt",
      "repo_root",
      "approved_owner_root_realpath",
      "owner_decision_ref",
    ],
    "RAG_WRITER_ROLLBACK_INPUT_INVALID",
    "rollback input",
  );
  assertExactKeys(
    options,
    ["trusted_owner_decision_resolver"],
    "RAG_WRITER_OPTIONS_INVALID",
    "writer options",
  );
  if (input.rollback !== true) {
    fail("RAG_WRITER_EXPLICIT_ROLLBACK_REQUIRED", "rollback must be true");
  }
  if (typeof input.repo_root !== "string" || !path.isAbsolute(input.repo_root)) {
    fail("RAG_WRITER_REPO_ROOT_INVALID", "repo_root must be absolute");
  }
  if (
    input.approved_owner_root_realpath !== null
    && (
      typeof input.approved_owner_root_realpath !== "string"
      || !path.isAbsolute(input.approved_owner_root_realpath)
    )
  ) fail("RAG_WRITER_OWNER_ROOT_BINDING_INVALID", "owner root binding is invalid");
  const receipt = validateApplyReceipt(input.apply_receipt);
  const ownerDecisionRef = normalizeOwnerDecisionRef(input.owner_decision_ref);
  if (!refsEqual(ownerDecisionRef, receipt.owner_decision_ref)) {
    fail("RAG_WRITER_OWNER_DECISION_BINDING_MISMATCH", "rollback decision ref mismatches");
  }
  const outputs = [...receipt.created_outputs, ...receipt.idempotent_outputs];
  const authorityRequest = buildAuthorityRequest({
    operation: ROLLBACK_OPERATION,
    projectRef: receipt.project_ref,
    ownerDecisionRef,
    bundleDigest: receipt.bundle_digest,
    outputs,
  });
  const authority = resolveAuthority(
    options.trusted_owner_decision_resolver,
    authorityRequest,
  );
  const context = {
    repoRoot: path.resolve(input.repo_root),
    approvedOwnerRootRealpath: input.approved_owner_root_realpath,
    projectRef: receipt.project_ref,
  };
  await preflightRollback(context, receipt.created_outputs);
  const deletedOutputs = [];
  const alreadyAbsentOutputs = [];
  for (const output of [...receipt.created_outputs].reverse()) {
    const outcome = await rollbackOne(context, output);
    if (outcome === "deleted") deletedOutputs.push(output);
    else alreadyAbsentOutputs.push(output);
  }
  const payload = {
    schema_version: PROJECT_RAG_ROLLBACK_RECEIPT_SCHEMA_VERSION,
    kind: "project_rag_rollback_receipt",
    project_ref: receipt.project_ref,
    source_apply_receipt_digest: receipt.receipt_digest,
    owner_decision_ref: ownerDecisionRef,
    authority_evidence_digest: authority.authority_evidence_digest,
    deleted_outputs: deletedOutputs,
    already_absent_outputs: alreadyAbsentOutputs,
    preserved_idempotent_outputs: receipt.idempotent_outputs,
  };
  return Object.freeze({ ...payload, receipt_digest: canonicalDigest(payload) });
}
