import { execFile } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { lstat, open, readFile, realpath, unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { BackupControllerError, validateBinding } from "./controller.mjs";

const execFileAsync = promisify(execFile);
const WRITE_GRANT = /\((?:F|M|W|D|WDAC|WO|AD|DC|DE)\)/i;
const DENY_GRANT = /\(DENY\)/i;

function fail(code) {
  throw new BackupControllerError(code);
}

function normalized(value) {
  return path.resolve(value).replace(/[\\/]+$/, "").toLowerCase();
}

function overlaps(left, right) {
  const a = normalized(left);
  const b = normalized(right);
  return a === b || a.startsWith(`${b}${path.sep}`) || b.startsWith(`${a}${path.sep}`);
}

function strictDescendant(child, parent) {
  const nested = normalized(child);
  const owner = normalized(parent);
  return nested !== owner && nested.startsWith(`${owner}${path.sep}`);
}

function approvedOperationalContainment(left, right) {
  const entries = new Map([left, right]);
  const runtime = entries.get("runtime_checkout_root");
  const metadata = entries.get("project_metadata_root") ?? entries.get("cross_project_state_root");
  if (runtime && metadata) {
    const expectedLeaf = entries.has("project_metadata_root") ? "_workmeta" : "private-state";
    return normalized(metadata.path) === normalized(path.join(runtime.path, expectedLeaf));
  }

  const erpDb = entries.get("erp_db_file");
  if (runtime && erpDb) return strictDescendant(erpDb.path, runtime.path);

  const policy = entries.get("hpp_recovery_policy");
  const projectMetadata = entries.get("project_metadata_root");
  if (policy && projectMetadata) return strictDescendant(policy.path, projectMetadata.path);

  return false;
}

export function parseWindowsReparseTag(output) {
  const match = String(output).match(/0x[0-9a-f]{8}(?![0-9a-f])/i);
  if (!match) fail("preflight_reparse_unparseable");
  return match[0].toLowerCase();
}

export async function runReadOnlyCommand({ file, args, signal }) {
  try {
    const { stdout = "", stderr = "" } = await execFileAsync(file, args, { windowsHide: true, encoding: "utf8", maxBuffer: 1024 * 1024, signal });
    return { code: 0, stdout, stderr };
  } catch (error) {
    if (error?.code === "ABORT_ERR") fail("preflight_command_aborted");
    return { code: Number.isInteger(error?.code) ? error.code : 1, stdout: error?.stdout ?? "", stderr: error?.stderr ?? "" };
  }
}

async function inspectPathDefault(resource, { commandRunner = runReadOnlyCommand, signal } = {}) {
  let stat;
  let physicalPath;
  try {
    stat = await lstat(resource.path);
    physicalPath = await realpath(resource.path);
  } catch {
    fail("preflight_path_inspection_failed");
  }
  let reparseTag = null;
  if (process.platform === "win32" && resource.kind !== "raidrive_network_directory") {
    const query = await commandRunner({ file: "fsutil.exe", args: ["reparsepoint", "query", resource.path], signal });
    if (query.code === 0) {
      reparseTag = parseWindowsReparseTag(query.stdout);
    } else if (query.code !== 1) {
      fail("preflight_reparse_query_failed");
    }
  }
  return {
    type: stat.isDirectory() ? "directory" : stat.isFile() ? "file" : "other",
    realpath: physicalPath,
    is_link: stat.isSymbolicLink(),
    reparse_tag: reparseTag,
  };
}

export function parseIcaclsWriterExclusive(output, { writerIdentities = [], resourcePath = null } = {}) {
  if (typeof output !== "string" || output.length === 0) fail("acl_output_unparseable");
  const allowed = new Set([
    "nt authority\\system",
    "builtin\\administrators",
    "nt service\\trustedinstaller",
    "system",
    ...writerIdentities.map((identity) => String(identity).trim().toLowerCase()),
  ]);
  const entries = [];
  for (const line of output.split(/\r?\n/)) {
    let candidate = line.trim();
    if (resourcePath && candidate.toLowerCase().startsWith(String(resourcePath).toLowerCase())) candidate = candidate.slice(String(resourcePath).length).trim();
    if (candidate === "") continue;
    const match = candidate.match(/^(.+?):((?:\([^)]*\))+)$/);
    if (!match) {
      const numbers = candidate.match(/\d+/g) ?? [];
      if (!candidate.includes(":") && numbers.length === 2 && /^\D*\d+\D+\d+\D*$/u.test(candidate)) continue;
      fail("acl_output_unparseable");
    }
    const identity = match[1].trim().toLowerCase();
    entries.push({ identity, grants: match[2] });
  }
  if (entries.length === 0) fail("acl_output_unparseable");
  for (const entry of entries) {
    if (!DENY_GRANT.test(entry.grants) && WRITE_GRANT.test(entry.grants) && !allowed.has(entry.identity)) return false;
  }
  return true;
}

async function assertWriterExclusiveAcl(resourcePath, code, { commandRunner, signal, writerIdentities }) {
  const acl = await commandRunner({ file: "icacls.exe", args: [resourcePath], signal });
  if (acl.code !== 0) fail("acl_query_failed");
  let exclusive;
  try {
    exclusive = parseIcaclsWriterExclusive(acl.stdout, { writerIdentities, resourcePath });
  } catch {
    fail("acl_output_unparseable");
  }
  if (!exclusive) fail(code);
}

const RUNTIME_TRACKED_PATHS = Object.freeze([
  "guild_hall/backup_controller",
  "guild_hall/ingress/recovery.mjs",
  "guild_hall/ingress/recovery_cli.mjs",
  "ui-workspace/apps/dev-erp/tools/runtime_ops.mjs",
]);

export async function probeRuntimeGitDefault(runtimeRoot, expectedCommitSha, { commandRunner = runReadOnlyCommand, signal } = {}) {
  if (typeof expectedCommitSha !== "string" || !/^[a-f0-9]{40}$/.test(expectedCommitSha)) fail("runtime_commit_sha_required");
  const head = await commandRunner({ file: "git.exe", args: ["-C", runtimeRoot, "rev-parse", "--verify", "HEAD"], signal });
  if (head.code !== 0 || String(head.stdout).trim().toLowerCase() !== expectedCommitSha) fail("runtime_commit_mismatch");
  const status = await commandRunner({ file: "git.exe", args: ["-C", runtimeRoot, "status", "--porcelain=v1", "--untracked-files=no", "--", ...RUNTIME_TRACKED_PATHS], signal });
  if (status.code !== 0) fail("runtime_git_status_failed");
  if (String(status.stdout).trim() !== "") fail("runtime_tracked_files_dirty");
  return { head: expectedCommitSha, tracked_clean: true };
}

export async function probeRaiDriveReportRoot(reportRoot) {
  const probeRef = path.join(reportRoot, `.backup-controller-probe-${randomUUID()}.tmp`);
  const bytes = randomBytes(32);
  let handle;
  try {
    handle = await open(probeRef, "wx");
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    handle = null;
    const observed = await readFile(probeRef);
    const expectedDigest = createHash("sha256").update(bytes).digest("hex");
    const observedDigest = createHash("sha256").update(observed).digest("hex");
    if (expectedDigest !== observedDigest) fail("raidrive_probe_digest_mismatch");
  } catch (error) {
    if (error instanceof BackupControllerError) throw error;
    fail("raidrive_probe_failed");
  } finally {
    await handle?.close().catch(() => {});
    await unlink(probeRef).catch(() => {});
  }
}

export async function preflightBinding(bindingInput, {
  observedHost = { hostname: os.hostname(), platform: process.platform, user: os.userInfo().username },
  pathInspector = inspectPathDefault,
  commandRunner = runReadOnlyCommand,
  reportProbe = probeRaiDriveReportRoot,
  gitProbe = probeRuntimeGitDefault,
  runtimeCommitSha,
  allowWriteProbe = false,
  signal,
} = {}) {
  const binding = validateBinding(bindingInput);
  if (String(observedHost?.hostname).trim().toLowerCase() !== binding.writer.hostname || observedHost?.platform !== binding.writer.platform) fail("observed_writer_mismatch");

  const pathEntries = [["state_root", { kind: "directory", path: binding.state_root }], ...Object.entries(binding.resources)];
  for (let left = 0; left < pathEntries.length; left += 1) {
    for (let right = left + 1; right < pathEntries.length; right += 1) {
      if (approvedOperationalContainment(pathEntries[left], pathEntries[right])) continue;
      if (overlaps(pathEntries[left][1].path, pathEntries[right][1].path)) fail("preflight_path_overlap");
    }
  }

  const inspections = new Map();
  for (const [resourceId, resource] of pathEntries) {
    const inspected = await pathInspector(resource, { commandRunner, signal, resourceId });
    const expectedType = resource.kind === "file" || resource.kind === "pinned_file" ? "file" : "directory";
    if (inspected?.type !== expectedType) fail("preflight_resource_type_mismatch");
    if (inspected.is_link === true || normalized(inspected.realpath) !== normalized(resource.path)) fail("preflight_link_or_realpath_drift");
    if (resource.kind === "onedrive_cloud_directory") {
      if (inspected.reparse_tag !== "0x9000601a") fail("preflight_onedrive_profile_mismatch");
    } else if (inspected.reparse_tag !== null && inspected.reparse_tag !== undefined) {
      fail("preflight_unapproved_reparse_point");
    }
    inspections.set(resourceId, inspected);
  }

  const policyBytes = await readFile(binding.resources.hpp_recovery_policy.path).catch(() => fail("hpp_recovery_policy_read_failed"));
  const policyDigest = createHash("sha256").update(policyBytes).digest("hex");
  if (policyDigest !== binding.resources.hpp_recovery_policy.sha256) fail("hpp_recovery_policy_digest_mismatch");
  await gitProbe(binding.resources.runtime_checkout_root.path, runtimeCommitSha, { commandRunner, signal });

  const writerIdentities = [
    observedHost.user,
    observedHost.user ? `${binding.writer.hostname}\\${observedHost.user}` : null,
    observedHost.domain && observedHost.user ? `${observedHost.domain}\\${observedHost.user}` : null,
  ].filter(Boolean);
  await assertWriterExclusiveAcl(binding.resources.hpp_data_root.path, "hpp_acl_not_writer_exclusive", { commandRunner, signal, writerIdentities });
  await assertWriterExclusiveAcl(binding.resources.hpp_restore_test_root.path, "hpp_restore_acl_not_writer_exclusive", { commandRunner, signal, writerIdentities });
  await assertWriterExclusiveAcl(binding.state_root, "controller_acl_not_writer_exclusive", { commandRunner, signal, writerIdentities });

  if (binding.feature_state === "on") {
    if (!allowWriteProbe) fail("raidrive_write_probe_required");
    await reportProbe(binding.resources.nas_report_root.path, { signal });
  }

  return Object.freeze({ ok: true, resource_count: inspections.size, policy_sha256: policyDigest, write_probe_performed: binding.feature_state === "on" });
}
