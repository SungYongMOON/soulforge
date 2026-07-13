import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

import { sha256Bytes } from "./canonical.mjs";
import { MAX_ARTIFACT_SIZE } from "./contract.mjs";
import { fail } from "./errors.mjs";

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/;
const OPAQUE_REF = /^[a-z][a-z0-9_-]{1,31}:[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const ROLE_FILES = Object.freeze({
  report_document_json: { filename: "report_document.json", mediaType: "application/json" },
  final_report_md: { filename: "final_report.md", mediaType: "text/markdown" },
  final_report_html: { filename: "final_report.html", mediaType: "text/html" },
  protected_semantic_manifest: { filename: "protected_semantic_manifest.json", mediaType: "application/json" },
  preservation_audit: { filename: "preservation_audit.json", mediaType: "application/json" },
  semantic_verification: { filename: "semantic_verification.json", mediaType: "application/json" },
});

function confined(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== "" && !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative);
}

async function pathExists(target, fsOps) {
  try {
    await fsOps.lstat(target);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function syncDirectory(directory, fsOps) {
  let handle;
  try {
    handle = await fsOps.open(directory, constants.O_RDONLY);
    await handle.sync();
  } catch (error) {
    if (!new Set(["EINVAL", "ENOTSUP", "EPERM", "EISDIR"]).has(error?.code)) throw error;
  } finally {
    await handle?.close();
  }
}

async function assertNoLinkedPath(base, target, fsOps) {
  const relative = path.relative(base, target);
  let current = base;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    try {
      const metadata = await fsOps.lstat(current);
      if (metadata.isSymbolicLink()) fail("artifact_path_link_forbidden", `Artifact path contains a link or junction: ${segment}`);
      if (!metadata.isDirectory()) fail("artifact_path_component_not_directory", `Artifact path component is not a directory: ${segment}`);
    } catch (error) {
      if (error?.code === "ENOENT") return;
      throw error;
    }
  }
}

async function verifyPersistedArtifactSet(directory, expected, fsOps) {
  const directoryMetadata = await fsOps.lstat(directory);
  if (!directoryMetadata.isDirectory() || directoryMetadata.isSymbolicLink()) fail("artifact_committed_directory_identity_invalid", "Committed artifact set must be a non-link directory");
  const expectedNames = new Set(expected.map((item) => ROLE_FILES[item.role]?.filename));
  if (expectedNames.has(undefined)) fail("artifact_committed_role_invalid", "Committed artifact expectation has an unknown role");
  const actualNames = new Set(await fsOps.readdir(directory));
  if (canonicalSet(actualNames) !== canonicalSet(expectedNames)) fail("artifact_committed_role_set_mismatch", "Committed artifact role set is incomplete or contains unexpected files");
  const verified = [];
  for (const item of expected) {
    const spec = ROLE_FILES[item.role];
    const target = path.join(directory, spec.filename);
    const metadata = await fsOps.lstat(target);
    if (!metadata.isFile() || metadata.isSymbolicLink()) fail("artifact_committed_file_identity_invalid", `Committed artifact is not a non-link regular file: ${item.role}`);
    const bytes = await fsOps.readFile(target);
    const expectedSize = item.bytes ? item.bytes.length : item.size;
    const expectedHash = item.bytes ? sha256Bytes(item.bytes) : item.sha256;
    if (bytes.length !== expectedSize || sha256Bytes(bytes) !== expectedHash) fail("artifact_committed_hash_mismatch", `Committed artifact changed: ${item.role}`);
    verified.push({ role: item.role, sha256: expectedHash, size: expectedSize, media_type: spec.mediaType });
  }
  return verified;
}

export function createFilesystemArtifactAdapter({ root, storageClass, ownerApprovalRef = null, repositoryRoot, fsOps = fs, beforeCommit = null, afterCommit = null }) {
  if (typeof root !== "string" || !path.isAbsolute(root)) {
    fail("artifact_root_not_absolute", "Artifact root must be an absolute adapter configuration path");
  }
  if (!new Set(["workspace_system", "owner_approved_shared_worksite"]).has(storageClass)) {
    fail("artifact_storage_class_invalid", "Artifact storage class must be explicit");
  }
  if (storageClass === "owner_approved_shared_worksite" && (typeof ownerApprovalRef !== "string" || !OPAQUE_REF.test(ownerApprovalRef))) {
    fail("artifact_owner_approval_missing", "External shared worksite requires an opaque owner approval ref");
  }
  if (typeof repositoryRoot !== "string" || !path.isAbsolute(repositoryRoot)) {
    fail("artifact_repository_root_invalid", "Artifact adapter requires the absolute repository root for boundary enforcement");
  }
  const resolvedRoot = path.resolve(root);
  const resolvedRepositoryRoot = path.resolve(repositoryRoot);
  const approvedWorkspaceRoot = path.join(resolvedRepositoryRoot, "_workspaces", "system");
  if (storageClass === "workspace_system" && !confined(approvedWorkspaceRoot, resolvedRoot)) {
    fail("artifact_workspace_system_mismatch", "First-slice artifact root must be a child of _workspaces/system");
  }
  if (storageClass === "owner_approved_shared_worksite" && (confined(resolvedRepositoryRoot, resolvedRoot) || resolvedRoot === resolvedRepositoryRoot)) {
    fail("artifact_shared_worksite_inside_repository", "Owner-approved shared worksite must remain outside the public repository tree");
  }
  let boundaryPromise = null;
  const ensureBoundary = () => {
    boundaryPromise ??= (async () => {
      const repositoryMetadata = await fsOps.lstat(resolvedRepositoryRoot);
      if (!repositoryMetadata.isDirectory() || repositoryMetadata.isSymbolicLink()) fail("artifact_repository_identity_invalid", "Repository root must be a non-link directory");
      const inspectionBase = storageClass === "workspace_system" ? resolvedRepositoryRoot : path.parse(resolvedRoot).root;
      await assertNoLinkedPath(inspectionBase, resolvedRoot, fsOps);
      await fsOps.mkdir(resolvedRoot, { recursive: true });
      await assertNoLinkedPath(inspectionBase, resolvedRoot, fsOps);
      const realRoot = await fsOps.realpath(resolvedRoot);
      const realRepositoryRoot = await fsOps.realpath(resolvedRepositoryRoot);
      const lowered = realRoot.split(path.sep).filter(Boolean).map((segment) => segment.toLowerCase());
      for (const denied of ["_workmeta", ".git", ".workflow", ".registry", "guild_hall", "docs"]) {
        if (lowered.includes(denied)) fail("artifact_forbidden_root", `Artifact root is inside forbidden owner surface ${denied}`);
      }
      if (storageClass === "workspace_system") {
        const realApprovedRoot = path.join(realRepositoryRoot, "_workspaces", "system");
        if (!confined(realApprovedRoot, realRoot)) fail("artifact_root_symlink_escape", "Artifact root escaped _workspaces/system");
      } else if (confined(realRepositoryRoot, realRoot) || realRoot === realRepositoryRoot) {
        fail("artifact_shared_worksite_inside_repository", "Owner-approved shared worksite resolved inside the public repository tree");
      }
      return realRoot;
    })();
    return boundaryPromise;
  };
  return {
    async writeArtifactSet({ jobId, projectCode, artifacts, beforeArtifactCommit = null }) {
      if (!SAFE_ID.test(jobId)) fail("artifact_job_id_invalid", "Artifact job id is not safe");
      if (!SAFE_ID.test(projectCode)) fail("artifact_project_code_invalid", "Artifact project code is not safe");
      if (!Array.isArray(artifacts) || artifacts.length < 5 || artifacts.length > 6) {
        fail("artifact_set_invalid", "Artifact set must contain five or six fixed-role files");
      }
      const realRoot = await ensureBoundary();
      const finalDirectory = path.join(realRoot, jobId);
      if (!confined(realRoot, finalDirectory)) fail("artifact_path_escape", "Final artifact directory escapes the configured root");
      if (await pathExists(finalDirectory, fsOps)) fail("artifact_no_overwrite", `Artifact set already exists for ${jobId}`);

      const roles = new Set();
      const prepared = artifacts.map((artifact) => {
        const spec = ROLE_FILES[artifact?.role];
        if (!spec) fail("artifact_role_not_allowed", `Artifact role is not allowed: ${artifact?.role}`);
        if (roles.has(artifact.role)) fail("artifact_duplicate_role", `Duplicate artifact role ${artifact.role}`);
        roles.add(artifact.role);
        if (artifact.mediaType !== spec.mediaType) fail("artifact_media_type_mismatch", `Media type mismatch for ${artifact.role}`);
        const bytes = Buffer.isBuffer(artifact.bytes) ? artifact.bytes : Buffer.from(artifact.bytes);
        if (bytes.length < 1 || bytes.length > MAX_ARTIFACT_SIZE) fail("artifact_size_invalid", `Artifact size invalid for ${artifact.role}`);
        return { ...artifact, ...spec, bytes };
      });
      for (const required of ["report_document_json", "final_report_md", "protected_semantic_manifest", "preservation_audit", "semantic_verification"]) {
        if (!roles.has(required)) fail("artifact_required_role_missing", `Missing required audit role ${required}`);
      }
      const expectedArtifactRefs = prepared.map((item) => ({
        role: item.role,
        payload_ref: `artifact:${jobId}:${item.role}`,
        sha256: sha256Bytes(item.bytes),
        size: item.bytes.length,
        media_type: item.mediaType,
      }));
      const storageAttestation = {
        storage_class: storageClass,
        project_code: projectCode,
        owner_approval_ref: ownerApprovalRef,
        report_bodies_in_workmeta: false,
        public_repo_storage: false,
        atomic_no_overwrite: true,
      };

      const stagingDirectory = path.join(realRoot, `.tmp-${jobId}-${randomUUID()}`);
      if (!confined(realRoot, stagingDirectory)) fail("artifact_path_escape", "Staging directory escapes the configured root");
      await fsOps.mkdir(stagingDirectory, { recursive: false });
      let committed = false;
      try {
        for (const item of prepared) {
          const target = path.join(stagingDirectory, item.filename);
          if (!confined(stagingDirectory, target)) fail("artifact_path_escape", "Artifact file escapes staging directory");
          const handle = await fsOps.open(target, "wx");
          try {
            await handle.writeFile(item.bytes);
            await handle.sync();
          } finally {
            await handle.close();
          }
        }
        await syncDirectory(stagingDirectory, fsOps);
        if (beforeArtifactCommit) await beforeArtifactCommit({ artifactRefs: expectedArtifactRefs, storageAttestation });
        if (beforeCommit) await beforeCommit({ stagingDirectory, finalDirectory, artifactRefs: expectedArtifactRefs, storageAttestation });
        if (await pathExists(finalDirectory, fsOps)) fail("artifact_no_overwrite", `Artifact set appeared concurrently for ${jobId}`);
        await fsOps.rename(stagingDirectory, finalDirectory);
        committed = true;
        await syncDirectory(realRoot, fsOps);
        if (afterCommit) await afterCommit({ finalDirectory, realRoot });
      } catch (error) {
        if (!committed) {
          await fsOps.rm(stagingDirectory, { recursive: true, force: true });
        } else {
          try {
            await verifyPersistedArtifactSet(finalDirectory, prepared, fsOps);
            const rollbackDirectory = path.join(realRoot, `.rollback-${jobId}-${randomUUID()}`);
            await fsOps.rename(finalDirectory, rollbackDirectory);
            await fsOps.rm(rollbackDirectory, { recursive: true, force: false });
            await syncDirectory(realRoot, fsOps);
          } catch {
            fail("artifact_postcommit_manual_recovery_required", "Committed artifact identity changed before post-commit verification; automatic cleanup is unsafe");
          }
        }
        throw error;
      }

      let persisted;
      try {
        persisted = await verifyPersistedArtifactSet(finalDirectory, prepared, fsOps);
      } catch {
        fail("artifact_postcommit_manual_recovery_required", "Committed artifact identity changed before post-commit verification; automatic cleanup is unsafe");
      }
      const artifactRefs = persisted.map((item) => ({ ...item, payload_ref: `artifact:${jobId}:${item.role}` }));
      return {
        artifact_refs: artifactRefs,
        storage_attestation: storageAttestation,
      };
    },

    async adoptArtifactSet({ jobId, projectCode, artifactRefs }) {
      if (!SAFE_ID.test(jobId) || !SAFE_ID.test(projectCode)) fail("artifact_adoption_identity_invalid", "Artifact adoption identity is invalid");
      if (!Array.isArray(artifactRefs) || artifactRefs.length < 5 || artifactRefs.length > 6) fail("artifact_adoption_refs_invalid", "Artifact adoption requires the complete expected ref set");
      const realRoot = await ensureBoundary();
      const finalDirectory = path.join(realRoot, jobId);
      if (!confined(realRoot, finalDirectory) || !await pathExists(finalDirectory, fsOps)) fail("artifact_adoption_target_missing", "Committed artifact set is not available for adoption");
      let persisted;
      try {
        persisted = await verifyPersistedArtifactSet(finalDirectory, artifactRefs, fsOps);
      } catch (error) {
        if (error?.code === "artifact_committed_role_set_mismatch" || error?.code === "artifact_committed_hash_mismatch" || error?.code === "artifact_committed_file_identity_invalid") {
          fail("artifact_adoption_exact_match_failed", "Existing artifact set does not exactly match the durable execution intent");
        }
        throw error;
      }
      return {
        artifact_refs: persisted.map((item) => ({ ...item, payload_ref: `artifact:${jobId}:${item.role}` })),
        storage_attestation: {
          storage_class: storageClass,
          project_code: projectCode,
          owner_approval_ref: ownerApprovalRef,
          report_bodies_in_workmeta: false,
          public_repo_storage: false,
          atomic_no_overwrite: true,
        },
        adopted: true,
      };
    },

    async rollbackArtifactSet({ jobId, projectCode, artifactRefs }) {
      if (!SAFE_ID.test(jobId) || !SAFE_ID.test(projectCode)) fail("artifact_rollback_identity_invalid", "Rollback identity is invalid");
      const realRoot = await ensureBoundary();
      const finalDirectory = path.join(realRoot, jobId);
      if (!confined(realRoot, finalDirectory) || !await pathExists(finalDirectory, fsOps)) {
        fail("artifact_rollback_target_missing", "Committed artifact set is not available for rollback");
      }
      await verifyPersistedArtifactSet(finalDirectory, artifactRefs, fsOps);
      const tombstone = path.join(realRoot, `.rollback-${jobId}-${randomUUID()}`);
      await fsOps.rename(finalDirectory, tombstone);
      await fsOps.rm(tombstone, { recursive: true, force: false });
      await syncDirectory(realRoot, fsOps);
      return { rolled_back: true };
    },
  };
}

function canonicalSet(values) {
  return [...values].sort().join("\u0000");
}
