import {
  closeSync,
  constants as fsConstants,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

import {
  WORKFLOW_ARTIFACT_MEDIA_TYPES,
  WORKFLOW_ARTIFACT_ROLES,
  WORKFLOW_INPUT_HANDLE_RE,
  WORKFLOW_JOB_ID_RE,
  WORKFLOW_OPERATION_ID_RE,
  WORKFLOW_RAW_OUTPUT_MAX_BYTES,
  WorkflowJobError,
  canonicalJson,
  sha256Bytes,
} from "./workflow_job_contract.mjs";

const ROLE_FILES = Object.freeze({
  report_document_json: join("audit", "report_document.json"),
  final_report_md: join("final", "report.md"),
  final_report_html: join("final", "report.html"),
  protected_semantic_manifest: join("audit", "protected_semantic_manifest.json"),
  preservation_audit: join("audit", "preservation_audit.json"),
  semantic_verification: join("audit", "semantic_verification.json"),
});

function fail(code, status = 400) {
  throw new WorkflowJobError(code, status);
}

function comparable(value) {
  const normalized = resolve(value);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function isStrictChild(root, target) {
  const rel = relative(resolve(root), resolve(target));
  return rel.length > 0 && rel !== ".." && !rel.startsWith(`..${sep}`) && !resolve(rel).startsWith(`${sep}${sep}`);
}

function assertRegularSingleLink(path, expectedSize = null) {
  const stat = lstatSync(path, { bigint: true });
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1n) fail("workflow_payload_file_unsafe", 409);
  if (expectedSize !== null && stat.size !== BigInt(expectedSize)) fail("workflow_payload_size_mismatch", 409);
  return stat;
}

function writeExclusive(path, bytes) {
  mkdirSync(dirname(path), { recursive: true });
  const noFollow = fsConstants.O_NOFOLLOW || 0;
  const fd = openSync(path, fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY | noFollow, 0o600);
  try {
    writeFileSync(fd, bytes);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  assertRegularSingleLink(path, bytes.length);
  const stored = readFileSync(path);
  if (!stored.equals(bytes)) fail("workflow_payload_write_verification_failed", 409);
}

function verifiedBytes(path, { size, sha256 }) {
  assertRegularSingleLink(path, size);
  const bytes = readFileSync(path);
  if (bytes.length !== size || sha256Bytes(bytes) !== sha256) fail("workflow_payload_hash_mismatch", 409);
  return bytes;
}

function removeVerifiedStaging(stagingRoot, path) {
  if (!isStrictChild(stagingRoot, path) || !existsSync(path)) return;
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) return;
  rmSync(path, { recursive: true, force: true });
}

export class WorkflowJobPayloadStore {
  constructor({ backendRoot }) {
    if (!backendRoot) fail("workflow_payload_backend_root_missing", 503);
    this.backendRoot = resolve(backendRoot);
    this.root = resolve(this.backendRoot, "_workspaces", "system", "dev-erp", "workflow-jobs");
    const expected = resolve(this.backendRoot, "_workspaces", "system", "dev-erp", "workflow-jobs");
    if (comparable(this.root) !== comparable(expected)) fail("workflow_payload_root_invalid", 503);
    this.inputRoot = join(this.root, ".inputs");
    this.stagingRoot = join(this.root, ".staging");
    mkdirSync(this.inputRoot, { recursive: true });
    mkdirSync(this.stagingRoot, { recursive: true });
    this.rootReal = realpathSync.native(this.root);
    this.assertReady();
  }

  assertReady() {
    const stat = lstatSync(this.root);
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail("workflow_payload_root_unsafe", 503);
    if (comparable(realpathSync.native(this.root)) !== comparable(this.rootReal)) fail("workflow_payload_root_retargeted", 503);
    for (const directory of [this.inputRoot, this.stagingRoot]) {
      if (!isStrictChild(this.root, directory)) fail("workflow_payload_root_escape", 503);
      const child = lstatSync(directory);
      if (!child.isDirectory() || child.isSymbolicLink()) fail("workflow_payload_root_unsafe", 503);
    }
    return true;
  }

  inputPath(handleId) {
    if (!WORKFLOW_INPUT_HANDLE_RE.test(handleId)) fail("workflow_input_handle_invalid");
    const path = join(this.inputRoot, `${handleId}.body`);
    if (!isStrictChild(this.inputRoot, path)) fail("workflow_payload_path_escape");
    return path;
  }

  createInputBody({ handleId, bytes }) {
    this.assertReady();
    if (!Buffer.isBuffer(bytes) || bytes.length < 1) fail("workflow_input_body_invalid");
    const path = this.inputPath(handleId);
    writeExclusive(path, bytes);
    const sha256 = sha256Bytes(bytes);
    return Object.freeze({
      body_ref: `wjb:${handleId}:${sha256}`,
      body_sha256: sha256,
      body_size: bytes.length,
    });
  }

  readInputBody(input) {
    this.assertReady();
    if (!input || !WORKFLOW_INPUT_HANDLE_RE.test(String(input.handle_id || ""))) fail("workflow_input_handle_invalid");
    const expectedRef = `wjb:${input.handle_id}:${input.body_sha256}`;
    if (input.body_ref !== expectedRef) fail("workflow_input_pointer_forged", 409);
    return verifiedBytes(this.inputPath(input.handle_id), { size: input.body_size, sha256: input.body_sha256 });
  }

  removeInputBody(handleId) {
    this.assertReady();
    const path = this.inputPath(handleId);
    if (!existsSync(path)) return;
    assertRegularSingleLink(path);
    rmSync(path, { force: true });
  }

  artifactPath(jobId, role) {
    if (!WORKFLOW_JOB_ID_RE.test(jobId)) fail("workflow_job_id_invalid");
    if (!WORKFLOW_ARTIFACT_ROLES.includes(role)) fail("workflow_artifact_role_invalid");
    const jobRoot = join(this.root, jobId);
    const path = join(jobRoot, ROLE_FILES[role]);
    if (!isStrictChild(jobRoot, path)) fail("workflow_payload_path_escape");
    return path;
  }

  persistArtifactSet({ jobId, operationId, artifacts }) {
    this.assertReady();
    if (!WORKFLOW_JOB_ID_RE.test(jobId)) fail("workflow_job_id_invalid");
    if (!WORKFLOW_OPERATION_ID_RE.test(operationId)) fail("workflow_operation_id_invalid");
    if (!Array.isArray(artifacts) || artifacts.length !== WORKFLOW_ARTIFACT_ROLES.length) {
      fail("workflow_artifact_set_invalid");
    }
    const roles = new Set();
    let total = 0;
    for (const artifact of artifacts) {
      if (!artifact || !WORKFLOW_ARTIFACT_ROLES.includes(artifact.role) || roles.has(artifact.role)) fail("workflow_artifact_set_invalid");
      if (!Buffer.isBuffer(artifact.bytes)) fail("workflow_artifact_body_invalid");
      if (artifact.media_type !== WORKFLOW_ARTIFACT_MEDIA_TYPES[artifact.role]) fail("workflow_artifact_media_type_invalid");
      roles.add(artifact.role);
      total += artifact.bytes.length;
    }
    if (WORKFLOW_ARTIFACT_ROLES.some((role) => !roles.has(role))) fail("workflow_artifact_set_invalid");
    if (total > WORKFLOW_RAW_OUTPUT_MAX_BYTES) fail("workflow_artifact_total_too_large", 413);

    const staging = join(this.stagingRoot, `${jobId}.${operationId}`);
    const finalRoot = join(this.root, jobId);
    if (!isStrictChild(this.stagingRoot, staging) || !isStrictChild(this.root, finalRoot)) fail("workflow_payload_path_escape");
    if (existsSync(finalRoot)) {
      const adopted = this.adoptArtifactSet({ jobId, operationId });
      for (const artifact of artifacts) {
        const stored = adopted.find((item) => item.role === artifact.role);
        if (!stored
          || stored.sha256 !== sha256Bytes(artifact.bytes)
          || stored.size !== artifact.bytes.length
          || stored.media_type !== artifact.media_type) {
          fail("workflow_artifact_adoption_conflict", 409);
        }
      }
      return adopted;
    }
    if (existsSync(staging)) fail("workflow_artifact_target_exists", 409);
    mkdirSync(staging);
    let renamed = false;
    try {
      const metadata = [];
      for (const artifact of artifacts) {
        const relativePath = ROLE_FILES[artifact.role];
        const path = join(staging, relativePath);
        if (!isStrictChild(staging, path)) fail("workflow_payload_path_escape");
        writeExclusive(path, artifact.bytes);
        const sha256 = sha256Bytes(artifact.bytes);
        metadata.push({
          role: artifact.role,
          payload_ref: `wja:${jobId}:${artifact.role}:${sha256}`,
          sha256,
          size: artifact.bytes.length,
          media_type: artifact.media_type,
        });
      }
      metadata.sort((a, b) => a.role.localeCompare(b.role));
      const manifest = Buffer.from(`${canonicalJson({
        schema: "dev_erp.workflow_artifact_manifest.v1",
        job_id: jobId,
        operation_id: operationId,
        artifacts: metadata,
      })}\n`, "utf8");
      writeExclusive(join(staging, "artifact_manifest.json"), manifest);
      renameSync(staging, finalRoot);
      renamed = true;
      const rootStat = lstatSync(finalRoot);
      if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) fail("workflow_artifact_root_unsafe", 409);
      for (const artifact of metadata) {
        verifiedBytes(this.artifactPath(jobId, artifact.role), artifact);
      }
      const storedManifest = readFileSync(join(finalRoot, "artifact_manifest.json"));
      if (!storedManifest.equals(manifest)) fail("workflow_artifact_manifest_mismatch", 409);
      return metadata;
    } catch (error) {
      if (!renamed) removeVerifiedStaging(this.stagingRoot, staging);
      throw error;
    }
  }

  adoptArtifactSet({ jobId, operationId }) {
    this.assertReady();
    if (!WORKFLOW_JOB_ID_RE.test(jobId)) fail("workflow_job_id_invalid");
    if (!WORKFLOW_OPERATION_ID_RE.test(operationId)) fail("workflow_operation_id_invalid");
    const finalRoot = join(this.root, jobId);
    if (!isStrictChild(this.root, finalRoot) || !existsSync(finalRoot)) fail("workflow_artifact_manifest_missing", 409);
    const rootStat = lstatSync(finalRoot, { bigint: true });
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink() || rootStat.nlink < 1n) fail("workflow_artifact_root_unsafe", 409);
    const manifestPath = join(finalRoot, "artifact_manifest.json");
    if (!isStrictChild(finalRoot, manifestPath) || !existsSync(manifestPath)) fail("workflow_artifact_manifest_missing", 409);
    const manifestStat = lstatSync(manifestPath, { bigint: true });
    if (!manifestStat.isFile() || manifestStat.isSymbolicLink() || manifestStat.nlink !== 1n || manifestStat.size > 131_072n) {
      fail("workflow_artifact_manifest_unsafe", 409);
    }
    const bytes = readFileSync(manifestPath);
    let manifest;
    try {
      manifest = JSON.parse(bytes.toString("utf8"));
    } catch {
      fail("workflow_artifact_manifest_invalid", 409);
    }
    if (!manifest
      || Object.keys(manifest).sort().join(",") !== "artifacts,job_id,operation_id,schema"
      || manifest.schema !== "dev_erp.workflow_artifact_manifest.v1"
      || manifest.job_id !== jobId
      || manifest.operation_id !== operationId
      || !Array.isArray(manifest.artifacts)
      || manifest.artifacts.length !== WORKFLOW_ARTIFACT_ROLES.length) {
      fail("workflow_artifact_manifest_invalid", 409);
    }
    const canonical = Buffer.from(`${canonicalJson(manifest)}\n`, "utf8");
    if (!canonical.equals(bytes)) fail("workflow_artifact_manifest_mismatch", 409);
    const roles = new Set();
    let total = 0;
    for (const artifact of manifest.artifacts) {
      if (!artifact
        || Object.keys(artifact).sort().join(",") !== "media_type,payload_ref,role,sha256,size"
        || !WORKFLOW_ARTIFACT_ROLES.includes(artifact.role)
        || roles.has(artifact.role)
        || artifact.media_type !== WORKFLOW_ARTIFACT_MEDIA_TYPES[artifact.role]
        || !Number.isSafeInteger(artifact.size)
        || artifact.size < 0
        || artifact.payload_ref !== `wja:${jobId}:${artifact.role}:${artifact.sha256}`) {
        fail("workflow_artifact_manifest_invalid", 409);
      }
      verifiedBytes(this.artifactPath(jobId, artifact.role), artifact);
      roles.add(artifact.role);
      total += artifact.size;
    }
    if (WORKFLOW_ARTIFACT_ROLES.some((role) => !roles.has(role)) || total > WORKFLOW_RAW_OUTPUT_MAX_BYTES) {
      fail("workflow_artifact_manifest_invalid", 409);
    }
    return [...manifest.artifacts].sort((a, b) => a.role.localeCompare(b.role));
  }

  readArtifact(artifact) {
    this.assertReady();
    if (!artifact || !WORKFLOW_JOB_ID_RE.test(String(artifact.job_id || ""))) fail("workflow_artifact_invalid");
    const expectedRef = `wja:${artifact.job_id}:${artifact.role}:${artifact.sha256}`;
    if (artifact.payload_ref !== expectedRef) fail("workflow_artifact_pointer_forged", 409);
    if (artifact.media_type !== WORKFLOW_ARTIFACT_MEDIA_TYPES[artifact.role]) fail("workflow_artifact_media_type_invalid");
    return verifiedBytes(this.artifactPath(artifact.job_id, artifact.role), artifact);
  }
}

export function createWorkflowJobPayloadStore(options) {
  return new WorkflowJobPayloadStore(options);
}
