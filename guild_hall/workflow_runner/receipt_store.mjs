import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

import { canonicalJson, sha256Bytes } from "./canonical.mjs";
import { validateWorkflowReceipt } from "./contract.mjs";
import { fail } from "./errors.mjs";

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/;

function confined(root, candidate, { allowRoot = false } = {}) {
  const relative = path.relative(root, candidate);
  if (allowRoot && relative === "") return true;
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
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
      if (metadata.isSymbolicLink()) fail("receipt_path_link_forbidden", `Receipt path contains a link or junction: ${segment}`);
      if (!metadata.isDirectory()) fail("receipt_path_component_not_directory", `Receipt path component is not a directory: ${segment}`);
    } catch (error) {
      if (error?.code === "ENOENT") return;
      throw error;
    }
  }
}

async function confirmTarget(target, expectedBytes, fsOps) {
  const metadata = await fsOps.lstat(target);
  if (!metadata.isFile() || metadata.isSymbolicLink()) fail("receipt_target_identity_invalid", "Receipt target must be a non-link regular file");
  const persisted = await fsOps.readFile(target);
  if (!persisted.equals(expectedBytes)) fail("receipt_existing_mismatch", "Existing receipt bytes do not match the requested receipt");
  return {
    sha256: sha256Bytes(persisted),
    size: persisted.length,
  };
}

export function createFilesystemReceiptAdapter({ workmetaRoot, allowedProjectCodes, repositoryRoot, fsOps = fs, afterLink = null }) {
  if (typeof workmetaRoot !== "string" || !path.isAbsolute(workmetaRoot)) fail("receipt_root_invalid", "Receipt root must be absolute");
  if (typeof repositoryRoot !== "string" || !path.isAbsolute(repositoryRoot)) fail("receipt_repository_root_invalid", "Receipt adapter requires the absolute repository root");
  const resolvedRepositoryRoot = path.resolve(repositoryRoot);
  const resolvedWorkmetaRoot = path.resolve(workmetaRoot);
  if (resolvedWorkmetaRoot !== path.join(resolvedRepositoryRoot, "_workmeta")) fail("receipt_root_invalid", "Receipt root must be the repository companion _workmeta directory");
  if (!Array.isArray(allowedProjectCodes) || allowedProjectCodes.length < 1 || allowedProjectCodes.some((value) => !SAFE_ID.test(value))) {
    fail("receipt_project_allowlist_invalid", "Receipt adapter requires an explicit project-code allowlist");
  }
  const projects = new Set(allowedProjectCodes);
  let boundaryPromise = null;
  const ensureBoundary = () => {
    boundaryPromise ??= (async () => {
      const repositoryMetadata = await fsOps.lstat(resolvedRepositoryRoot);
      if (!repositoryMetadata.isDirectory() || repositoryMetadata.isSymbolicLink()) fail("receipt_repository_identity_invalid", "Repository root must be a non-link directory");
      await assertNoLinkedPath(resolvedRepositoryRoot, resolvedWorkmetaRoot, fsOps);
      await fsOps.mkdir(resolvedWorkmetaRoot, { recursive: true });
      await assertNoLinkedPath(resolvedRepositoryRoot, resolvedWorkmetaRoot, fsOps);
      const realRepositoryRoot = await fsOps.realpath(resolvedRepositoryRoot);
      const realWorkmetaRoot = await fsOps.realpath(resolvedWorkmetaRoot);
      if (realWorkmetaRoot !== path.join(realRepositoryRoot, "_workmeta")) fail("receipt_root_symlink_escape", "Receipt root escaped the repository companion _workmeta directory");
      return { realRepositoryRoot, realWorkmetaRoot };
    })();
    return boundaryPromise;
  };

  return {
    async write({ receipt, bytes, projectCode }) {
      validateWorkflowReceipt(receipt);
      if (!projects.has(projectCode)) fail("receipt_project_not_approved", "Receipt project is not adapter-approved");
      if (!Buffer.isBuffer(bytes)) fail("receipt_bytes_invalid", "Receipt adapter requires exact bytes");
      const expectedBytes = Buffer.from(`${canonicalJson(receipt)}\n`, "utf8");
      if (!bytes.equals(expectedBytes)) fail("receipt_bytes_mismatch", "Receipt bytes do not match the validated metadata-only contract");

      const { realWorkmetaRoot } = await ensureBoundary();
      const declaredRunDirectory = path.join(realWorkmetaRoot, projectCode, "runs", receipt.job_id);
      if (!confined(realWorkmetaRoot, declaredRunDirectory)) fail("receipt_path_escape", "Receipt path escaped _workmeta");
      await assertNoLinkedPath(realWorkmetaRoot, declaredRunDirectory, fsOps);
      await fsOps.mkdir(declaredRunDirectory, { recursive: true });
      await assertNoLinkedPath(realWorkmetaRoot, declaredRunDirectory, fsOps);
      const runDirectory = await fsOps.realpath(declaredRunDirectory);
      if (!confined(realWorkmetaRoot, runDirectory)) fail("receipt_path_symlink_escape", "Receipt run directory escaped _workmeta");

      const target = path.join(runDirectory, "workflow_receipt.json");
      const temporary = path.join(runDirectory, `.workflow_receipt-${randomUUID()}.tmp`);
      let linked = false;
      try {
        const handle = await fsOps.open(temporary, "wx");
        try {
          await handle.writeFile(bytes);
          await handle.sync();
        } finally {
          await handle.close();
        }
        try {
          await fsOps.link(temporary, target);
          linked = true;
        } catch (error) {
          if (error?.code !== "EEXIST") throw error;
        }
        if (linked && afterLink) await afterLink({ target, runDirectory });
        const confirmed = await confirmTarget(target, expectedBytes, fsOps);
        await syncDirectory(runDirectory, fsOps);
        return {
          payload_ref: `receipt:${receipt.job_id}:workflow_receipt`,
          sha256: confirmed.sha256,
          size: confirmed.size,
          media_type: "application/json",
        };
      } catch (error) {
        if (linked) {
          try {
            await confirmTarget(target, expectedBytes, fsOps);
            await fsOps.rm(target, { force: false });
            await syncDirectory(runDirectory, fsOps);
          } catch {
            fail("receipt_postcommit_manual_recovery_required", "Committed receipt identity changed before confirmation; automatic cleanup is unsafe");
          }
        }
        throw error;
      } finally {
        await fsOps.rm(temporary, { force: true });
      }
    },
  };
}
