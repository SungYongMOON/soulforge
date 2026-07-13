import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { serializeCanonicalIdentity } from "../shared/temporal_identity.mjs";
import { PROJECT_RAG_PILOT_BUNDLE_SCHEMA_VERSION } from "./project_rag_pilot.mjs";
import {
  PROJECT_RAG_WRITER_AUTHORITY_SCHEMA_VERSION,
  ProjectRagWriterError,
  applyProjectRagPilotBundle,
  bootstrapProjectRagOwnerRoot,
  rollbackProjectRagPilotApply,
} from "./project_rag_writer.mjs";

const PROJECT_REF = Object.freeze({
  entity_type: "project",
  owner_surface: "dev_erp",
  entity_id: "P-SYN-WRITER",
});
const OWNER_DECISION_REF = Object.freeze({
  entity_type: "owner_decision",
  owner_surface: "owner_decision_ledger",
  entity_id: "decision-syn-writer-a",
});
const DECISION_EVIDENCE_DIGEST =
  "sha256:1d53bedd9982e6a6d5ee21a69635b216ca6099d0d1dd0c20b65c17e6e80733b8";

function digest(value) {
  const text = typeof value === "string" ? value : serializeCanonicalIdentity(value);
  return `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`;
}

function wrap(targetRef, payload) {
  return {
    target_ref: targetRef,
    serialization_profile_id: "soulforge.identity_basis.cjson_nfc_utf8.v1",
    canonical_content_id: digest(payload),
    payload,
  };
}

function makeBundle() {
  const root = `_workspaces/${PROJECT_REF.entity_id}/reference_payloads/rag`;
  const index = wrap(`${root}/indexes_local/ridx_syn/project_rag_index.v1.json`, {
    schema_version: "soulforge.project_rag_index.v1",
    kind: "project_rag_index",
    project_ref: PROJECT_REF,
    counts: { chunk_count: 2 },
  });
  const lineage = wrap(
    `${root}/traceability_sidecars/ridx_syn/project_rag_lineage_sidecar.v1.json`,
    {
      schema_version: "soulforge.project_rag_lineage_sidecar.v1",
      kind: "project_rag_lineage_sidecar",
      project_ref: PROJECT_REF,
      boundary: { metadata_only: true },
    },
  );
  const answer = wrap(`${root}/answer_runs/ridx_syn/answer_syn.v1.json`, {
    schema_version: "soulforge.project_rag_answer_reference.v1",
    kind: "project_rag_answer_reference",
    project_ref: PROJECT_REF,
    answer_content_included: false,
  });
  const createdOutputs = [index, lineage, answer].map((artifact) => ({
    target_ref: artifact.target_ref,
    expected_content_id: artifact.canonical_content_id,
    rollback_action: "delete_only_if_digest_matches",
  }));
  const rollback = wrap(
    `${root}/operational_routes/ridx_syn/project_rag_pilot_rollback_manifest.v1.json`,
    {
      schema_version: "soulforge.project_rag_pilot_rollback_manifest.v1",
      kind: "project_rag_pilot_rollback_manifest",
      mode: "plan_only",
      apply_allowed: false,
      project_ref: PROJECT_REF,
      created_outputs: createdOutputs,
    },
  );
  const basis = {
    schema_version: PROJECT_RAG_PILOT_BUNDLE_SCHEMA_VERSION,
    kind: "project_rag_pilot_bundle",
    mode: "build_only",
    apply_requested: false,
    write_allowed: false,
    project_ref: PROJECT_REF,
    identity_summary: {
      source_id: "source-syn-writer",
      source_revision_id: "sr_syn_writer",
      extraction_run_id: "exr_syn_writer",
      rag_index_id: "ridx_syn",
      chunk_count: 2,
    },
    index,
    lineage_sidecar: lineage,
    answer_run: answer,
    rollback_manifest: rollback,
    next_gate: {
      status: "blocked_pending_separate_writer_gate",
      apply_implementation_present: false,
      external_owner_binding_present: false,
    },
  };
  return { ...basis, bundle_digest: digest(basis) };
}

function authorityAttestation(request, overrides = {}) {
  const payload = {
    schema_version: PROJECT_RAG_WRITER_AUTHORITY_SCHEMA_VERSION,
    project_ref: request.project_ref,
    owner_decision_ref: request.owner_decision_ref,
    operation: request.operation,
    bundle_digest: request.bundle_digest,
    output_set_digest: request.output_set_digest,
    local_private_only: true,
    external_upload_allowed: false,
    canon_promotion_allowed: false,
    approved: true,
    decision_evidence_digest: DECISION_EVIDENCE_DIGEST,
    ...overrides,
  };
  return { ...payload, authority_evidence_digest: digest(payload) };
}

function resolver(request) {
  return authorityAttestation(request);
}

async function createRepo({ prepareTargets = true } = {}) {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-rag-writer-"));
  const ownerRoot = path.join(
    repoRoot,
    "_workspaces",
    PROJECT_REF.entity_id,
    "reference_payloads",
    "rag",
  );
  await mkdir(ownerRoot, { recursive: true });
  if (prepareTargets) {
    const bundle = makeBundle();
    for (const artifact of [
      bundle.index,
      bundle.lineage_sidecar,
      bundle.answer_run,
      bundle.rollback_manifest,
    ]) {
      await mkdir(path.dirname(nativePath(repoRoot, artifact.target_ref)), { recursive: true });
    }
  }
  return { repoRoot, ownerRoot };
}

async function createUnbootstrappedRepo() {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-rag-bootstrap-"));
  const projectRoot = path.join(repoRoot, "_workspaces", PROJECT_REF.entity_id);
  await mkdir(projectRoot, { recursive: true });
  return { repoRoot, projectRoot };
}

function applyInput(repoRoot, bundle = makeBundle()) {
  return {
    apply: true,
    bundle,
    repo_root: repoRoot,
    approved_owner_root_realpath: null,
    owner_decision_ref: OWNER_DECISION_REF,
  };
}

function rollbackInput(repoRoot, applyReceipt) {
  return {
    rollback: true,
    apply_receipt: applyReceipt,
    repo_root: repoRoot,
    approved_owner_root_realpath: null,
    owner_decision_ref: OWNER_DECISION_REF,
  };
}

function nativePath(repoRoot, targetRef) {
  return path.join(repoRoot, ...targetRef.split("/"));
}

function writerError(code) {
  return (error) => error instanceof ProjectRagWriterError && error.code === code;
}

test("owner-root bootstrap binds the exact project root before creating the locked RAG root", async (t) => {
  const { repoRoot, projectRoot } = await createUnbootstrappedRepo();
  t.after(() => rm(repoRoot, { recursive: true, force: true }));
  const input = {
    apply: true,
    repo_root: repoRoot,
    project_ref: PROJECT_REF,
    approved_project_root_realpath: await realpath(projectRoot),
    owner_decision_ref: OWNER_DECISION_REF,
  };
  const first = await bootstrapProjectRagOwnerRoot(input, {
    trusted_owner_decision_resolver: resolver,
  });
  assert.equal(first.outcome, "created");
  assert.equal(first.binding_status, "repo_internal");
  const second = await bootstrapProjectRagOwnerRoot(input, {
    trusted_owner_decision_resolver: resolver,
  });
  assert.equal(second.outcome, "idempotent_noop");
});

test("writer applies canonical artifacts exclusively, verifies readback, and is idempotent", async (t) => {
  const { repoRoot } = await createRepo();
  t.after(() => rm(repoRoot, { recursive: true, force: true }));
  const bundle = makeBundle();
  const first = await applyProjectRagPilotBundle(applyInput(repoRoot, bundle), {
    trusted_owner_decision_resolver: resolver,
  });
  assert.equal(first.write_count, 4);
  assert.equal(first.noop_count, 0);
  for (const artifact of [
    bundle.index,
    bundle.lineage_sidecar,
    bundle.answer_run,
    bundle.rollback_manifest,
  ]) {
    const bytes = await readFile(nativePath(repoRoot, artifact.target_ref));
    assert.equal(digest(bytes.toString("utf8")), artifact.canonical_content_id);
    assert.equal(bytes.toString("utf8"), serializeCanonicalIdentity(artifact.payload));
  }
  const second = await applyProjectRagPilotBundle(applyInput(repoRoot, bundle), {
    trusted_owner_decision_resolver: resolver,
  });
  assert.equal(second.receipt_digest, first.receipt_digest);
  assert.equal(second.write_count, 4);
  assert.equal(second.noop_count, 0);
});

test("apply journal resumes partial output state and recreates its durable receipt", async (t) => {
  const { repoRoot } = await createRepo();
  t.after(() => rm(repoRoot, { recursive: true, force: true }));
  const bundle = makeBundle();
  const first = await applyProjectRagPilotBundle(applyInput(repoRoot, bundle), {
    trusted_owner_decision_resolver: resolver,
  });
  const routeParent = path.dirname(nativePath(repoRoot, bundle.rollback_manifest.target_ref));
  const applyReceiptJournal = path.join(
    routeParent,
    `.project_rag_apply_${bundle.bundle_digest.slice("sha256:".length)}.receipt.v1.json`,
  );
  await rm(applyReceiptJournal, { force: true });
  await rm(nativePath(repoRoot, bundle.index.target_ref), { force: true });
  await rm(nativePath(repoRoot, bundle.lineage_sidecar.target_ref), { force: true });
  const recovered = await applyProjectRagPilotBundle(applyInput(repoRoot, bundle), {
    trusted_owner_decision_resolver: resolver,
  });
  assert.equal(recovered.receipt_digest, first.receipt_digest);
  for (const artifact of [
    bundle.index,
    bundle.lineage_sidecar,
    bundle.answer_run,
    bundle.rollback_manifest,
  ]) {
    assert.equal(
      `sha256:${createHash("sha256").update(await readFile(
        nativePath(repoRoot, artifact.target_ref),
      )).digest("hex")}`,
      artifact.canonical_content_id,
    );
  }
  const afterRecovery = await applyProjectRagPilotBundle(applyInput(repoRoot, bundle), {
    trusted_owner_decision_resolver: resolver,
  });
  assert.equal(afterRecovery.receipt_digest, first.receipt_digest);
  assert.equal(afterRecovery.write_count, 4);
  assert.equal(afterRecovery.noop_count, 0);
});

test("a retry after a lost successful response returns the durable rollback authority", async (t) => {
  const { repoRoot } = await createRepo();
  t.after(() => rm(repoRoot, { recursive: true, force: true }));
  const bundle = makeBundle();
  const first = await applyProjectRagPilotBundle(applyInput(repoRoot, bundle), {
    trusted_owner_decision_resolver: resolver,
  });
  const recoveredReceipt = await applyProjectRagPilotBundle(applyInput(repoRoot, bundle), {
    trusted_owner_decision_resolver: resolver,
  });
  assert.equal(recoveredReceipt.receipt_digest, first.receipt_digest);
  const rolledBack = await rollbackProjectRagPilotApply(
    rollbackInput(repoRoot, recoveredReceipt),
    { trusted_owner_decision_resolver: resolver },
  );
  assert.equal(rolledBack.deleted_outputs.length, 4);
  assert.equal(rolledBack.preserved_idempotent_outputs.length, 0);
  for (const output of recoveredReceipt.created_outputs) {
    await assert.rejects(
      readFile(nativePath(repoRoot, output.target_ref)),
      (error) => error?.code === "ENOENT",
    );
  }
});

test("writer refuses to create target directories during immutable apply", async (t) => {
  const { repoRoot } = await createRepo({ prepareTargets: false });
  t.after(() => rm(repoRoot, { recursive: true, force: true }));
  await assert.rejects(
    applyProjectRagPilotBundle(applyInput(repoRoot), {
      trusted_owner_decision_resolver: resolver,
    }),
    writerError("RAG_WRITER_TARGET_PARENT_NOT_PREPARED"),
  );
});

test("writer fails closed before any new output when one immutable target conflicts", async (t) => {
  const { repoRoot } = await createRepo();
  t.after(() => rm(repoRoot, { recursive: true, force: true }));
  const bundle = makeBundle();
  const conflictPath = nativePath(repoRoot, bundle.index.target_ref);
  await mkdir(path.dirname(conflictPath), { recursive: true });
  await writeFile(conflictPath, "different immutable bytes", "utf8");
  await assert.rejects(
    applyProjectRagPilotBundle(applyInput(repoRoot, bundle), {
      trusted_owner_decision_resolver: resolver,
    }),
    writerError("RAG_WRITER_IMMUTABLE_CONFLICT"),
  );
  await assert.rejects(
    readFile(nativePath(repoRoot, bundle.lineage_sidecar.target_ref)),
    (error) => error?.code === "ENOENT",
  );
});

test("writer requires an exact trusted owner-decision attestation", async (t) => {
  const { repoRoot } = await createRepo();
  t.after(() => rm(repoRoot, { recursive: true, force: true }));
  const input = applyInput(repoRoot);
  await assert.rejects(
    applyProjectRagPilotBundle(input, { trusted_owner_decision_resolver: null }),
    writerError("RAG_WRITER_TRUSTED_AUTHORITY_RESOLVER_REQUIRED"),
  );
  await assert.rejects(
    applyProjectRagPilotBundle(input, {
      trusted_owner_decision_resolver: (request) => authorityAttestation(request, {
        external_upload_allowed: true,
      }),
    }),
    writerError("RAG_WRITER_AUTHORITY_BINDING_MISMATCH"),
  );
});

test("rollback deletes only files created by its apply receipt and preserves idempotent files", async (t) => {
  const { repoRoot } = await createRepo();
  t.after(() => rm(repoRoot, { recursive: true, force: true }));
  const bundle = makeBundle();
  const preservedPath = nativePath(repoRoot, bundle.index.target_ref);
  await mkdir(path.dirname(preservedPath), { recursive: true });
  await writeFile(preservedPath, serializeCanonicalIdentity(bundle.index.payload), "utf8");
  const applied = await applyProjectRagPilotBundle(applyInput(repoRoot, bundle), {
    trusted_owner_decision_resolver: resolver,
  });
  assert.equal(applied.write_count, 3);
  assert.equal(applied.noop_count, 1);
  const rolledBack = await rollbackProjectRagPilotApply(
    rollbackInput(repoRoot, applied),
    { trusted_owner_decision_resolver: resolver },
  );
  assert.equal(rolledBack.deleted_outputs.length, 3);
  assert.equal(rolledBack.preserved_idempotent_outputs.length, 1);
  assert.equal(
    (await readFile(preservedPath, "utf8")),
    serializeCanonicalIdentity(bundle.index.payload),
  );
  await assert.rejects(
    readFile(nativePath(repoRoot, bundle.lineage_sidecar.target_ref)),
    (error) => error?.code === "ENOENT",
  );
});

test("rollback refuses to delete an output whose digest changed", async (t) => {
  const { repoRoot } = await createRepo();
  t.after(() => rm(repoRoot, { recursive: true, force: true }));
  const bundle = makeBundle();
  const applied = await applyProjectRagPilotBundle(applyInput(repoRoot, bundle), {
    trusted_owner_decision_resolver: resolver,
  });
  const tamperedPath = nativePath(repoRoot, bundle.index.target_ref);
  await writeFile(tamperedPath, "tampered after apply", "utf8");
  await assert.rejects(
    rollbackProjectRagPilotApply(rollbackInput(repoRoot, applied), {
      trusted_owner_decision_resolver: resolver,
    }),
    writerError("RAG_WRITER_ROLLBACK_DIGEST_MISMATCH"),
  );
  assert.equal(await readFile(tamperedPath, "utf8"), "tampered after apply");
  for (const output of applied.created_outputs) {
    if (output.target_ref === bundle.index.target_ref) continue;
    assert.equal(
      `sha256:${createHash("sha256").update(await readFile(
        nativePath(repoRoot, output.target_ref),
      )).digest("hex")}`,
      output.canonical_content_id,
    );
  }
});

test("rollback journal completes a partially deleted transaction after interruption", async (t) => {
  const { repoRoot } = await createRepo();
  t.after(() => rm(repoRoot, { recursive: true, force: true }));
  const bundle = makeBundle();
  const applied = await applyProjectRagPilotBundle(applyInput(repoRoot, bundle), {
    trusted_owner_decision_resolver: resolver,
  });
  await rollbackProjectRagPilotApply(rollbackInput(repoRoot, applied), {
    trusted_owner_decision_resolver: resolver,
  });
  const reapplied = await applyProjectRagPilotBundle(applyInput(repoRoot, bundle), {
    trusted_owner_decision_resolver: resolver,
  });
  const routeParent = path.dirname(nativePath(repoRoot, bundle.rollback_manifest.target_ref));
  const rollbackReceiptJournal = path.join(
    routeParent,
    `.project_rag_rollback_${reapplied.receipt_digest.slice("sha256:".length)}.receipt.v1.json`,
  );
  await rm(rollbackReceiptJournal, { force: true });
  await rm(nativePath(repoRoot, bundle.index.target_ref), { force: true });
  const recovered = await rollbackProjectRagPilotApply(
    rollbackInput(repoRoot, reapplied),
    { trusted_owner_decision_resolver: resolver },
  );
  assert.equal(recovered.deleted_outputs.length, 4);
  for (const output of reapplied.created_outputs) {
    await assert.rejects(
      readFile(nativePath(repoRoot, output.target_ref)),
      (error) => error?.code === "ENOENT",
    );
  }
});
