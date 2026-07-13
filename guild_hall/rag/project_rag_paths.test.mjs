import assert from "node:assert/strict";
import { mkdtemp, mkdir, realpath, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  COMMON_RAG_ROOT_REF,
  RAG_ASSET_KINDS,
  RagPathContractError,
  assertNoWindowsPathCollisions,
  assertRagPathLexicallyContained,
  assertRagTargetMatchesOwner,
  decideImmutableRagOutput,
  inspectLegacyProjectRagRef,
  resolveRagAssetTarget,
  resolveRagOwnerRoot,
  verifyRagWriteContainment,
} from "./project_rag_paths.mjs";

const PROJECT_REF = Object.freeze({
  entity_type: "project",
  owner_surface: "dev_erp",
  entity_id: "P24-049",
});

const OTHER_PROJECT_REF = Object.freeze({
  entity_type: "project",
  owner_surface: "dev_erp",
  entity_id: "P25-050",
});

const DIGEST_A = `sha256:${"a".repeat(64)}`;
const DIGEST_B = `sha256:${"b".repeat(64)}`;

function assertCode(fn, code) {
  assert.throws(fn, (error) => error instanceof RagPathContractError && error.code === code);
}

async function assertRejectsCode(promise, code) {
  await assert.rejects(
    promise,
    (error) => error instanceof RagPathContractError && error.code === code,
  );
}

test("owner roots are strict and project roots derive only from a typed project ref", () => {
  assert.deepEqual(resolveRagOwnerRoot({ owner_scope: "common" }), {
    owner_scope: "common",
    project_ref: null,
    project_code: null,
    owner_root_ref: "_workspaces/knowledge/rag",
  });
  assert.deepEqual(resolveRagOwnerRoot({ owner_scope: "project", project_ref: PROJECT_REF }), {
    owner_scope: "project",
    project_ref: PROJECT_REF,
    project_code: "P24-049",
    owner_root_ref: "_workspaces/P24-049/reference_payloads/rag",
  });

  assertCode(() => resolveRagOwnerRoot({ owner_scope: "Project", project_ref: PROJECT_REF }), "RAG_OWNER_SCOPE_INVALID");
  assertCode(() => resolveRagOwnerRoot({ owner_scope: "project" }), "RAG_PROJECT_REF_REQUIRED");
  assertCode(() => resolveRagOwnerRoot({ owner_scope: "common", project_ref: PROJECT_REF }), "RAG_OWNER_PROJECT_MISMATCH");
  assertCode(
    () => resolveRagOwnerRoot({
      owner_scope: "project",
      project_ref: { ...PROJECT_REF, entity_type: "task" },
    }),
    "RAG_PROJECT_REF_TYPE_MISMATCH",
  );
  assertCode(
    () => resolveRagOwnerRoot({
      owner_scope: "project",
      project_ref: { ...PROJECT_REF, owner_surface: "other" },
    }),
    "RAG_PROJECT_REF_OWNER_MISMATCH",
  );
  assertCode(
    () => resolveRagOwnerRoot({
      owner_scope: "project",
      project_ref: { ...PROJECT_REF, entity_id: "p24-049" },
    }),
    "RAG_PROJECT_CODE_NONCANONICAL",
  );
});

test("asset targets use the locked project/common roots and an explicit allowlist", () => {
  assert(RAG_ASSET_KINDS.includes("indexes_local"));
  assert(RAG_ASSET_KINDS.includes("source_text_work_cards"));

  assert.deepEqual(
    resolveRagAssetTarget({
      owner_scope: "project",
      project_ref: PROJECT_REF,
      asset_kind: "indexes_local",
      path_segments: ["source_text_indexes", "ridx_abc", "source_text_index.json"],
    }),
    {
      owner_scope: "project",
      project_ref: PROJECT_REF,
      project_code: "P24-049",
      owner_root_ref: "_workspaces/P24-049/reference_payloads/rag",
      asset_kind: "indexes_local",
      asset_root_ref: "_workspaces/P24-049/reference_payloads/rag/indexes_local",
      target_ref: "_workspaces/P24-049/reference_payloads/rag/indexes_local/source_text_indexes/ridx_abc/source_text_index.json",
      path_segments: ["source_text_indexes", "ridx_abc", "source_text_index.json"],
    },
  );
  assert.equal(
    resolveRagAssetTarget({
      owner_scope: "common",
      asset_kind: "answer_runs",
      path_segments: ["run_001", "answer.json"],
    }).target_ref,
    "_workspaces/knowledge/rag/answer_runs/run_001/answer.json",
  );

  assertCode(
    () => resolveRagAssetTarget({ owner_scope: "common", asset_kind: "private_indexes" }),
    "RAG_ASSET_KIND_INVALID",
  );
  for (const unsafeSegment of ["..", ".", "a/b", "a\\b", "name.", "name ", "CON"] ) {
    assert.throws(
      () => resolveRagAssetTarget({
        owner_scope: "project",
        project_ref: PROJECT_REF,
        asset_kind: "answer_runs",
        path_segments: [unsafeSegment],
      }),
      RagPathContractError,
    );
  }
});

test("lexical validation rejects traversal, absolute, UNC, drive, owner mismatch, and cross-project refs", () => {
  const root = "_workspaces/P24-049/reference_payloads/rag";
  const validTarget = `${root}/answer_runs/run_001/answer.json`;
  assert.equal(
    assertRagPathLexicallyContained({ root_ref: root, target_ref: validTarget }).status,
    "contained",
  );

  for (const unsafeRef of [
    "../_workspaces/P24-049/reference_payloads/rag/answer_runs/a.json",
    ["", "tmp", "answer.json"].join("/"),
    ["C:", "tmp", "answer.json"].join("/"),
    ["C:", "tmp", "answer.json"].join("\\"),
    "\\\\server\\share\\answer.json",
    "_workspaces/P24-049/reference_payloads/rag/./answer_runs/a.json",
  ]) {
    assert.throws(
      () => assertRagPathLexicallyContained({ root_ref: root, target_ref: unsafeRef }),
      RagPathContractError,
    );
  }

  assertCode(
    () => assertRagTargetMatchesOwner({
      owner_scope: "project",
      project_ref: PROJECT_REF,
      target_ref: "_workspaces/P25-050/reference_payloads/rag/answer_runs/a.json",
    }),
    "RAG_PATH_LEXICAL_ESCAPE",
  );
  assertCode(
    () => assertRagTargetMatchesOwner({
      owner_scope: "common",
      target_ref: validTarget,
    }),
    "RAG_PATH_LEXICAL_ESCAPE",
  );
});

test("Windows NFC, casefold, and trailing-dot-space aliases are rejected", () => {
  const prefix = "_workspaces/knowledge/rag/answer_runs";
  assertCode(
    () => assertNoWindowsPathCollisions([`${prefix}/Caf\u00e9`, `${prefix}/Cafe\u0301`]),
    "RAG_PATH_WINDOWS_COLLISION",
  );
  assertCode(
    () => assertNoWindowsPathCollisions([`${prefix}/Run_001`, `${prefix}/run_001`]),
    "RAG_PATH_WINDOWS_COLLISION",
  );
  assertCode(
    () => assertNoWindowsPathCollisions([`${prefix}/run_001`, `${prefix}/run_001.`]),
    "RAG_PATH_WINDOWS_COLLISION",
  );
  assertCode(
    () => resolveRagAssetTarget({
      owner_scope: "common",
      asset_kind: "answer_runs",
      path_segments: ["run_001"],
      collision_refs: [`${prefix}/RUN_001`],
    }),
    "RAG_PATH_WINDOWS_COLLISION",
  );
});

test("legacy project refs are inspection-only and require explicit dry-run or migration intent", () => {
  const legacyRef = `${COMMON_RAG_ROOT_REF}/indexes_local/source_text_indexes/legacy/index.json`;
  assertCode(
    () => inspectLegacyProjectRagRef({
      owner_scope: "project",
      project_ref: PROJECT_REF,
      legacy_ref: legacyRef,
      intent: "write",
    }),
    "RAG_LEGACY_PROJECT_WRITE_BLOCKED",
  );
  assertCode(
    () => inspectLegacyProjectRagRef({
      owner_scope: "common",
      project_ref: PROJECT_REF,
      legacy_ref: legacyRef,
      intent: "migration",
    }),
    "RAG_LEGACY_PROJECT_SCOPE_REQUIRED",
  );
  assert.deepEqual(
    inspectLegacyProjectRagRef({
      owner_scope: "project",
      project_ref: PROJECT_REF,
      legacy_ref: legacyRef,
      intent: "dry_run",
    }),
    {
      classification: "legacy_project_input",
      intent: "dry_run",
      legacy_ref: legacyRef,
      asset_kind: "indexes_local",
      project_ref: PROJECT_REF,
      project_code: "P24-049",
      target_owner_root_ref: "_workspaces/P24-049/reference_payloads/rag",
      write_allowed: false,
    },
  );
});

test("immutable output helper creates once, no-ops on the same digest, and conflicts on change", () => {
  assert.deepEqual(decideImmutableRagOutput({ candidate_digest: DIGEST_A }), {
    decision: "create",
    output_digest: DIGEST_A,
    write_allowed: true,
  });
  assert.deepEqual(
    decideImmutableRagOutput({ existing_digest: DIGEST_A, candidate_digest: DIGEST_A }),
    { decision: "idempotent_noop", output_digest: DIGEST_A, write_allowed: false },
  );
  assertCode(
    () => decideImmutableRagOutput({ existing_digest: DIGEST_A, candidate_digest: DIGEST_B }),
    "RAG_IMMUTABLE_OUTPUT_CONFLICT",
  );
});

test("write verifier accepts a missing leaf under a materialized synthetic project root", async (t) => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-rag-paths-"));
  t.after(() => rm(repoRoot, { recursive: true, force: true }));
  await mkdir(
    path.join(repoRoot, "_workspaces", "P24-049", "reference_payloads", "rag", "answer_runs"),
    { recursive: true },
  );
  const targetRef = resolveRagAssetTarget({
    owner_scope: "project",
    project_ref: PROJECT_REF,
    asset_kind: "answer_runs",
    path_segments: ["run_001", "answer.json"],
  }).target_ref;
  const result = await verifyRagWriteContainment({
    repo_root: repoRoot,
    owner_scope: "project",
    project_ref: PROJECT_REF,
    target_ref: targetRef,
  });
  assert.equal(result.status, "contained");
  assert.equal(result.target_exists, false);
  assert.equal(result.owner_root_exists, true);
  assert.equal(result.binding_verified, true);
  assert.equal(result.binding_status, "repo_internal");
  assert.equal(result.asset_kind, "answer_runs");
  assert.deepEqual(result.reparse_refs, []);
  assert.equal(JSON.stringify(result).includes(repoRoot), false);

  await assertRejectsCode(
    verifyRagWriteContainment({
      repo_root: repoRoot,
      owner_scope: "project",
      project_ref: OTHER_PROJECT_REF,
      target_ref: targetRef,
    }),
    "RAG_PATH_LEXICAL_ESCAPE",
  );
});

test("write verifier safely resolves only to the nearest existing ancestor when owner root is absent", async (t) => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-rag-paths-"));
  t.after(() => rm(repoRoot, { recursive: true, force: true }));
  await mkdir(path.join(repoRoot, "_workspaces", "P24-049"), { recursive: true });
  const targetRef = resolveRagAssetTarget({
    owner_scope: "project",
    project_ref: PROJECT_REF,
    asset_kind: "indexes_local",
    path_segments: ["ridx_001", "index.json"],
  }).target_ref;
  const result = await verifyRagWriteContainment({
    repo_root: repoRoot,
    owner_scope: "project",
    project_ref: PROJECT_REF,
    target_ref: targetRef,
  });
  assert.equal(result.status, "contained");
  assert.equal(result.owner_root_exists, false);
  assert.equal(result.binding_verified, false);
  assert.equal(result.binding_status, "owner_root_missing");
  assert.equal(result.target_exists, false);
  assert.equal("repo_root_realpath" in result, false);
  assert.equal("owner_root_path" in result, false);
  assert.equal("owner_root_realpath" in result, false);
  assert.equal("verified_existing_ancestor_path" in result, false);
  assert.equal("verified_existing_ancestor_realpath" in result, false);
});

test("write verifier inventories real siblings and blocks casefold aliases without caller hints", async (t) => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-rag-paths-"));
  t.after(() => rm(repoRoot, { recursive: true, force: true }));
  const answerRoot = path.join(
    repoRoot,
    "_workspaces",
    "P24-049",
    "reference_payloads",
    "rag",
    "answer_runs",
  );
  await mkdir(path.join(answerRoot, "Run_001"), { recursive: true });
  const targetRef = resolveRagAssetTarget({
    owner_scope: "project",
    project_ref: PROJECT_REF,
    asset_kind: "answer_runs",
    path_segments: ["run_001", "answer.json"],
  }).target_ref;
  await assertRejectsCode(
    verifyRagWriteContainment({
      repo_root: repoRoot,
      owner_scope: "project",
      project_ref: PROJECT_REF,
      target_ref: targetRef,
    }),
    "RAG_PATH_WINDOWS_COLLISION",
  );
});

test("write verifier rejects an owner-parent junction that resolves outside repo_root", async (t) => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-rag-paths-"));
  const outsideRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-rag-owner-outside-"));
  t.after(() => rm(repoRoot, { recursive: true, force: true }));
  t.after(() => rm(outsideRoot, { recursive: true, force: true }));
  await mkdir(path.join(repoRoot, "_workspaces"), { recursive: true });
  await mkdir(path.join(outsideRoot, "reference_payloads", "rag", "answer_runs"), {
    recursive: true,
  });
  try {
    await symlink(
      outsideRoot,
      path.join(repoRoot, "_workspaces", "P24-049"),
      process.platform === "win32" ? "junction" : "dir",
    );
  } catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP"].includes(error?.code)) {
      t.skip(`junction/symlink fixture unavailable: ${error.code}`);
      return;
    }
    throw error;
  }
  const targetRef = resolveRagAssetTarget({
    owner_scope: "project",
    project_ref: PROJECT_REF,
    asset_kind: "answer_runs",
    path_segments: ["run_001", "answer.json"],
  }).target_ref;
  await assertRejectsCode(
    verifyRagWriteContainment({
      repo_root: repoRoot,
      owner_scope: "project",
      project_ref: PROJECT_REF,
      target_ref: targetRef,
    }),
    "RAG_APPROVED_OWNER_BINDING_REQUIRED",
  );
});

test("write verifier accepts an exact external owner binding and a normal target child", async (t) => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-rag-paths-"));
  const externalOwner = await mkdtemp(path.join(os.tmpdir(), "soulforge-rag-owner-approved-"));
  t.after(() => rm(repoRoot, { recursive: true, force: true }));
  t.after(() => rm(externalOwner, { recursive: true, force: true }));
  const approvedOwnerRoot = path.join(externalOwner, "reference_payloads", "rag");
  await mkdir(path.join(repoRoot, "_workspaces"), { recursive: true });
  await mkdir(path.join(approvedOwnerRoot, "answer_runs", "run_001"), { recursive: true });
  try {
    await symlink(
      externalOwner,
      path.join(repoRoot, "_workspaces", "P24-049"),
      process.platform === "win32" ? "junction" : "dir",
    );
  } catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP"].includes(error?.code)) {
      t.skip(`junction/symlink fixture unavailable: ${error.code}`);
      return;
    }
    throw error;
  }
  const targetRef = resolveRagAssetTarget({
    owner_scope: "project",
    project_ref: PROJECT_REF,
    asset_kind: "answer_runs",
    path_segments: ["run_001"],
  }).target_ref;
  const result = await verifyRagWriteContainment({
    repo_root: repoRoot,
    owner_scope: "project",
    project_ref: PROJECT_REF,
    target_ref: targetRef,
    approved_owner_root_realpath: await realpath(approvedOwnerRoot),
  });
  assert.equal(result.status, "contained");
  assert.equal(result.target_exists, true);
  assert.equal(result.binding_verified, true);
  assert.equal(result.binding_status, "approved_external");
  assert.deepEqual(result.reparse_refs, ["_workspaces/P24-049"]);
  assert.equal(JSON.stringify(result).includes(externalOwner), false);
});

test("write verifier rejects a mismatched external owner binding", async (t) => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-rag-paths-"));
  const externalOwner = await mkdtemp(path.join(os.tmpdir(), "soulforge-rag-owner-actual-"));
  const differentOwner = await mkdtemp(path.join(os.tmpdir(), "soulforge-rag-owner-other-"));
  t.after(() => rm(repoRoot, { recursive: true, force: true }));
  t.after(() => rm(externalOwner, { recursive: true, force: true }));
  t.after(() => rm(differentOwner, { recursive: true, force: true }));
  await mkdir(path.join(repoRoot, "_workspaces"), { recursive: true });
  await mkdir(path.join(externalOwner, "reference_payloads", "rag", "answer_runs"), {
    recursive: true,
  });
  const differentApprovedRoot = path.join(differentOwner, "reference_payloads", "rag");
  await mkdir(differentApprovedRoot, { recursive: true });
  try {
    await symlink(
      externalOwner,
      path.join(repoRoot, "_workspaces", "P24-049"),
      process.platform === "win32" ? "junction" : "dir",
    );
  } catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP"].includes(error?.code)) {
      t.skip(`junction/symlink fixture unavailable: ${error.code}`);
      return;
    }
    throw error;
  }
  const targetRef = resolveRagAssetTarget({
    owner_scope: "project",
    project_ref: PROJECT_REF,
    asset_kind: "answer_runs",
    path_segments: ["run_001"],
  }).target_ref;
  await assertRejectsCode(
    verifyRagWriteContainment({
      repo_root: repoRoot,
      owner_scope: "project",
      project_ref: PROJECT_REF,
      target_ref: targetRef,
      approved_owner_root_realpath: await realpath(differentApprovedRoot),
    }),
    "RAG_APPROVED_OWNER_BINDING_MISMATCH",
  );
});

test("write verifier rejects a synthetic junction or symlink that escapes the owner root", async (t) => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-rag-paths-"));
  const outsideRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-rag-outside-"));
  t.after(() => rm(repoRoot, { recursive: true, force: true }));
  t.after(() => rm(outsideRoot, { recursive: true, force: true }));

  const ragRoot = path.join(
    repoRoot,
    "_workspaces",
    "P24-049",
    "reference_payloads",
    "rag",
  );
  await mkdir(ragRoot, { recursive: true });
  const escapePath = path.join(ragRoot, "answer_runs");
  try {
    await symlink(outsideRoot, escapePath, process.platform === "win32" ? "junction" : "dir");
  } catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP"].includes(error?.code)) {
      t.skip(`junction/symlink fixture unavailable: ${error.code}`);
      return;
    }
    throw error;
  }

  const targetRef = resolveRagAssetTarget({
    owner_scope: "project",
    project_ref: PROJECT_REF,
    asset_kind: "answer_runs",
    path_segments: ["run_001", "answer.json"],
  }).target_ref;
  await assertRejectsCode(
    verifyRagWriteContainment({
      repo_root: repoRoot,
      owner_scope: "project",
      project_ref: PROJECT_REF,
      target_ref: targetRef,
    }),
    "RAG_PATH_REALPATH_ESCAPE",
  );
});

test("write verifier rejects a final project target junction into the in-repo common owner", async (t) => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-rag-paths-"));
  t.after(() => rm(repoRoot, { recursive: true, force: true }));
  const projectAnswerRoot = path.join(
    repoRoot,
    "_workspaces",
    "P24-049",
    "reference_payloads",
    "rag",
    "answer_runs",
  );
  const commonTarget = path.join(
    repoRoot,
    "_workspaces",
    "knowledge",
    "rag",
    "answer_runs",
    "run_001",
  );
  await mkdir(projectAnswerRoot, { recursive: true });
  await mkdir(commonTarget, { recursive: true });
  try {
    await symlink(
      commonTarget,
      path.join(projectAnswerRoot, "run_001"),
      process.platform === "win32" ? "junction" : "dir",
    );
  } catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP"].includes(error?.code)) {
      t.skip(`junction/symlink fixture unavailable: ${error.code}`);
      return;
    }
    throw error;
  }

  const targetRef = resolveRagAssetTarget({
    owner_scope: "project",
    project_ref: PROJECT_REF,
    asset_kind: "answer_runs",
    path_segments: ["run_001"],
  }).target_ref;
  await assertRejectsCode(
    verifyRagWriteContainment({
      repo_root: repoRoot,
      owner_scope: "project",
      project_ref: PROJECT_REF,
      target_ref: targetRef,
    }),
    "RAG_FINAL_TARGET_REPARSE_BLOCKED",
  );
});

test("write verifier rejects a final cross-owner junction under an approved external owner", async (t) => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-rag-paths-"));
  const externalOwner = await mkdtemp(path.join(os.tmpdir(), "soulforge-rag-owner-approved-"));
  const otherOwner = await mkdtemp(path.join(os.tmpdir(), "soulforge-rag-owner-cross-"));
  t.after(() => rm(repoRoot, { recursive: true, force: true }));
  t.after(() => rm(externalOwner, { recursive: true, force: true }));
  t.after(() => rm(otherOwner, { recursive: true, force: true }));
  const approvedOwnerRoot = path.join(externalOwner, "reference_payloads", "rag");
  const answerRoot = path.join(approvedOwnerRoot, "answer_runs");
  const crossOwnerTarget = path.join(otherOwner, "run_cross");
  await mkdir(path.join(repoRoot, "_workspaces"), { recursive: true });
  await mkdir(answerRoot, { recursive: true });
  await mkdir(crossOwnerTarget, { recursive: true });
  try {
    await symlink(
      externalOwner,
      path.join(repoRoot, "_workspaces", "P24-049"),
      process.platform === "win32" ? "junction" : "dir",
    );
    await symlink(
      crossOwnerTarget,
      path.join(answerRoot, "run_cross"),
      process.platform === "win32" ? "junction" : "dir",
    );
  } catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP"].includes(error?.code)) {
      t.skip(`junction/symlink fixture unavailable: ${error.code}`);
      return;
    }
    throw error;
  }
  const targetRef = resolveRagAssetTarget({
    owner_scope: "project",
    project_ref: PROJECT_REF,
    asset_kind: "answer_runs",
    path_segments: ["run_cross"],
  }).target_ref;
  await assertRejectsCode(
    verifyRagWriteContainment({
      repo_root: repoRoot,
      owner_scope: "project",
      project_ref: PROJECT_REF,
      target_ref: targetRef,
      approved_owner_root_realpath: await realpath(approvedOwnerRoot),
    }),
    "RAG_FINAL_TARGET_REPARSE_BLOCKED",
  );
});
