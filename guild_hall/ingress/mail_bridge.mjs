import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import {
  link,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readdir,
  realpath,
  rmdir,
  unlink,
  writeFile,
} from "node:fs/promises";
import { platform, tmpdir } from "node:os";
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { comparablePathIdentity as comparable } from "../shared/physical_path_identity.mjs";

export const MAIL_BRIDGE_RESULT_SCHEMA = "soulforge.ingress.mail_bridge_result.v1";
export const MAIL_BRIDGE_TIMEOUT_MS = 10 * 60 * 1000;

const TEAM_REGISTER_SCHEMA = "email.fetch.team_mailbox_register.v1";
const SAFE_ERROR_CODE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;
const ALLOWED_CHILD_ERROR_CODES = new Set([
  "gateway_mail_fetch_team_cli_error",
  "mail_capsule_nested_credential_file_not_preloaded",
  "mail_capsule_nested_credential_file_unsupported",
  "mail_capsule_nested_credential_name_mismatch",
  "mail_capsule_nested_credential_parent_mismatch",
  "mail_capsule_nested_credential_path_mismatch",
  "mail_capsule_nested_credential_preload_empty",
  "mailbox_run_error",
]);
const SAFE_SOURCE_CHILD_ERROR_CODE = /^(?:outlook_sent|source_custody)_[a-z0-9_]+$/;
const REPO_RELATIVE_PREFIXES = [
  "guild_hall/",
  "private-state/",
  "_workmeta/",
  "_workspaces/",
];
const STARTUP_WINDOWS_SYSTEM_ROOT = String(process.env.SystemRoot || process.env.WINDIR || "").trim();

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function inside(root, target) {
  const rel = relative(root, target);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

async function optionalLstat(path) {
  try {
    return await lstat(path, { bigint: true });
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function sameIdentity(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs
    && left.birthtimeNs === right.birthtimeNs;
}

function serializedIdentity(info) {
  return {
    dev: String(info.dev),
    ino: String(info.ino),
    size: String(info.size),
    mtime_ns: String(info.mtimeNs),
    birthtime_ns: String(info.birthtimeNs),
    change_ns: String(info.ctimeNs),
  };
}

function sameSerializedIdentity(left, right) {
  return ["dev", "ino", "size", "mtime_ns", "birthtime_ns", "change_ns"]
    .every((field) => left?.[field] === right?.[field]);
}

function directoryIdentity(info) {
  return {
    dev: String(info.dev),
    ino: String(info.ino),
    birthtime_ns: String(info.birthtimeNs),
  };
}

function sameDirectoryIdentity(left, right) {
  return ["dev", "ino", "birthtime_ns"].every((field) => left?.[field] === right?.[field]);
}

async function assertNormalDirectory(path, code) {
  const info = await optionalLstat(path);
  if (!info || !info.isDirectory() || info.isSymbolicLink()) fail(code);
  try {
    if (comparable(await realpath(path)) !== comparable(resolve(path))) fail(code);
  } catch (error) {
    if (error?.code === code) throw error;
    fail(code);
  }
}

async function assertNormalFile(path, code) {
  const info = await optionalLstat(path);
  if (!info || !info.isFile() || info.isSymbolicLink()) fail(code);
  try {
    if (comparable(await realpath(path)) !== comparable(resolve(path))) fail(code);
  } catch (error) {
    if (error?.code === code) throw error;
    fail(code);
  }
  return info;
}

async function stableFile(path, unsafeCode, unstableCode, { capture = false } = {}) {
  const before = await assertNormalFile(path, unsafeCode);
  const handle = await open(path, "r");
  const hash = createHash("sha256");
  const chunks = [];
  let opened;
  try {
    opened = await handle.stat({ bigint: true });
    if (!opened.isFile() || !sameIdentity(before, opened)) fail(unstableCode);
    for await (const chunk of handle.readableWebStream()) {
      const bytes = Buffer.from(chunk);
      hash.update(bytes);
      if (capture) chunks.push(bytes);
    }
    if (!sameIdentity(opened, await handle.stat({ bigint: true }))) fail(unstableCode);
  } finally {
    await handle.close();
  }
  const after = await assertNormalFile(path, unsafeCode);
  if (!sameIdentity(before, after) || !sameIdentity(opened, after)) fail(unstableCode);
  return {
    sha256: hash.digest("hex"),
    bytes: capture ? Buffer.concat(chunks) : null,
    identity: serializedIdentity(opened),
  };
}

async function pinnedFileIdentity(path, unsafeCode, unstableCode) {
  const before = await assertNormalFile(path, unsafeCode);
  const handle = await open(path, "r");
  let opened;
  try {
    opened = await handle.stat({ bigint: true });
    if (!opened.isFile() || !sameIdentity(before, opened)) fail(unstableCode);
  } finally {
    await handle.close();
  }
  const after = await assertNormalFile(path, unsafeCode);
  if (!sameIdentity(opened, after)) fail(unstableCode);
  return serializedIdentity(opened);
}

function normalizeEnvRef(value) {
  if (typeof value !== "string" || value.trim() !== value || !value) {
    fail("mail_bridge_env_ref_invalid");
  }
  const normalized = value.replaceAll("\\", "/");
  if (normalized.startsWith("/")
    || normalized.startsWith("~")
    || /^[A-Za-z]:\//.test(normalized)) fail("mail_bridge_env_ref_invalid");
  const parts = normalized.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) {
    fail("mail_bridge_env_ref_invalid");
  }
  return normalized;
}

function envPath(binding, envRef) {
  const base = REPO_RELATIVE_PREFIXES.some((prefix) => envRef.startsWith(prefix))
    ? binding.privateConfigRoot
    : dirname(binding.registerPath);
  const target = resolve(base, ...envRef.split("/"));
  if (!inside(binding.privateConfigRoot, target)) fail("mail_bridge_env_ref_outside_private_config");
  return target;
}

function parseRegister(buffer) {
  let value;
  try {
    value = JSON.parse(buffer);
  } catch {
    fail("mail_bridge_register_invalid");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)
    || value.schema_version !== TEAM_REGISTER_SCHEMA
    || !Array.isArray(value.mailboxes)) fail("mail_bridge_register_invalid");
  return value.mailboxes;
}

function portableRelative(root, path) {
  const value = relative(root, path);
  if (!value || value === ".." || value.startsWith(`..${sep}`) || isAbsolute(value)) {
    fail("mail_bridge_collector_tree_unsafe");
  }
  return value.split(sep).join("/");
}

async function capturePythonTree(root, current = root, files = []) {
  await assertNormalDirectory(current, "mail_bridge_collector_tree_unsafe");
  const entries = await readdir(current, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    if (entry.name === "__pycache__") continue;
    const sourcePath = join(current, entry.name);
    if (entry.isSymbolicLink()) fail("mail_bridge_collector_tree_unsafe");
    if (entry.isDirectory()) {
      await capturePythonTree(root, sourcePath, files);
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith(".py")) continue;
    const captured = await stableFile(
      sourcePath,
      "mail_bridge_collector_file_unsafe",
      "mail_bridge_collector_file_unstable",
      { capture: true },
    );
    files.push({
      sourcePath,
      relativePath: portableRelative(root, sourcePath),
      ...captured,
    });
  }
  return files;
}

async function captureCollectorCode(binding, cli, { requireCollector }) {
  const sourceRoot = dirname(binding.teamCliPath);
  await assertNormalDirectory(sourceRoot, "mail_bridge_collector_tree_unsafe");
  const files = [{
    sourcePath: binding.teamCliPath,
    relativePath: basename(binding.teamCliPath),
    ...cli,
  }];
  const identityHelper = join(sourceRoot, "file_identity_guard.py");
  const helperInfo = await optionalLstat(identityHelper);
  if (helperInfo) {
    const captured = await stableFile(
      identityHelper,
      "mail_bridge_collector_file_unsafe",
      "mail_bridge_collector_file_unstable",
      { capture: true },
    );
    files.push({
      sourcePath: identityHelper,
      relativePath: "file_identity_guard.py",
      ...captured,
    });
  } else if (requireCollector) {
    fail("mail_bridge_collector_tree_incomplete");
  }

  const collectorRoot = join(sourceRoot, "collector");
  const collectorInfo = await optionalLstat(collectorRoot);
  if (collectorInfo) {
    if (!collectorInfo.isDirectory() || collectorInfo.isSymbolicLink()) {
      fail("mail_bridge_collector_tree_unsafe");
    }
    await capturePythonTree(sourceRoot, collectorRoot, files);
  } else if (requireCollector) {
    fail("mail_bridge_collector_tree_incomplete");
  }
  if (requireCollector && !files.some((file) => file.relativePath === "collector/team_mailboxes.py")) {
    fail("mail_bridge_collector_tree_incomplete");
  }

  for (const file of files) {
    const verified = await stableFile(
      file.sourcePath,
      "mail_bridge_collector_file_unsafe",
      "mail_bridge_collector_file_unstable",
    );
    if (verified.sha256 !== file.sha256) fail("mail_bridge_collector_file_unstable");
  }
  return files;
}

function collectorTreeDigest(files) {
  const rows = files
    .map((file) => ({ relativePath: file.relativePath, sha256: file.sha256 }))
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  const hash = createHash("sha256");
  hash.update("soulforge.mail.collector_tree.v1\0", "utf8");
  for (const row of rows) {
    hash.update(row.relativePath, "utf8");
    hash.update("\0", "utf8");
    hash.update(row.sha256, "ascii");
    hash.update("\n", "utf8");
  }
  return hash.digest("hex");
}

export async function inspectMailCollectorRelease(teamCliPath, { requireCollector = true } = {}) {
  const resolvedTeamCliPath = resolve(teamCliPath);
  const cli = await stableFile(
    resolvedTeamCliPath,
    "mail_bridge_team_cli_unsafe",
    "mail_bridge_team_cli_unstable",
    { capture: true },
  );
  const collectorFiles = await captureCollectorCode(
    { teamCliPath: resolvedTeamCliPath },
    cli,
    { requireCollector },
  );
  return {
    team_cli_sha256: cli.sha256,
    collector_tree_sha256: collectorTreeDigest(collectorFiles),
  };
}

async function captureMailBinding(binding, { requireCollector = false } = {}) {
  await assertNormalDirectory(binding.dataRoot, "mail_bridge_data_root_unsafe");
  await assertNormalDirectory(binding.privateConfigRoot, "mail_bridge_private_config_root_unsafe");
  if (!inside(binding.privateConfigRoot, binding.registerPath)) {
    fail("mail_bridge_register_outside_private_config");
  }
  const python = await stableFile(
    binding.pythonExecutable,
    "mail_bridge_python_executable_unsafe",
    "mail_bridge_python_executable_unstable",
  );
  const cli = await stableFile(
    binding.teamCliPath,
    "mail_bridge_team_cli_unsafe",
    "mail_bridge_team_cli_unstable",
    { capture: true },
  );
  if (cli.sha256 !== binding.teamCliSha256) fail("mail_bridge_team_cli_digest_mismatch");
  const collectorFiles = await captureCollectorCode(binding, cli, { requireCollector });
  if (collectorTreeDigest(collectorFiles) !== binding.collectorTreeSha256) {
    fail("mail_bridge_collector_tree_digest_mismatch");
  }
  const register = await stableFile(
    binding.registerPath,
    "mail_bridge_register_unsafe",
    "mail_bridge_register_unstable",
    { capture: true },
  );
  if (register.sha256 !== binding.registerSha256) fail("mail_bridge_register_digest_mismatch");
  const rows = parseRegister(register.bytes.toString("utf8"));
  let enabled = 0;
  const credentials = new Map();
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row) || typeof row.enabled !== "boolean") {
      fail("mail_bridge_register_invalid");
    }
    if (!row.enabled) continue;
    enabled += 1;
    const envRef = normalizeEnvRef(row.env_file);
    const target = envPath(binding, envRef);
    if (!credentials.has(envRef)) {
      credentials.set(envRef, {
        env_file: envRef,
        path: target,
        identity: await pinnedFileIdentity(
          target,
          "mail_bridge_credential_file_missing_or_unsafe",
          "mail_bridge_credential_file_unstable",
        ),
      });
    }
  }
  return {
    mailboxes_total: rows.length,
    mailboxes_enabled: enabled,
    credential_files_checked: enabled,
    python,
    collectorFiles,
    register,
    credentials: [...credentials.values()].sort((left, right) => left.env_file.localeCompare(right.env_file)),
  };
}

export async function preflightMailBinding(binding) {
  const captured = await captureMailBinding(binding);
  return {
    mailboxes_total: captured.mailboxes_total,
    mailboxes_enabled: captured.mailboxes_enabled,
    credential_files_checked: captured.credential_files_checked,
  };
}

async function writeCapsuleFile(root, path, bytes) {
  if (!inside(root, path)) fail("mail_bridge_capsule_path_unsafe");
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, bytes, { flag: "wx", mode: 0o600 });
}

async function verifyCapsuleFile(path, expectedSha256) {
  const verified = await stableFile(
    path,
    "mail_bridge_capsule_file_unsafe",
    "mail_bridge_capsule_file_unstable",
  );
  if (verified.sha256 !== expectedSha256) fail("mail_bridge_capsule_digest_mismatch");
  return verified;
}

const HARDEN_CAPSULE_ACL_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$path = [System.Text.Encoding]::UTF8.GetString(
  [System.Convert]::FromBase64String([string]$env:SOULFORGE_MAIL_CAPSULE_PATH_B64)
)
$env:SOULFORGE_MAIL_CAPSULE_PATH_B64 = $null
$current = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
$system = New-Object System.Security.Principal.SecurityIdentifier('S-1-5-18')
$administrators = New-Object System.Security.Principal.SecurityIdentifier('S-1-5-32-544')
$acl = New-Object System.Security.AccessControl.DirectorySecurity
$acl.SetAccessRuleProtection($true, $false)
$acl.SetOwner($current)
$inheritance = [System.Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [System.Security.AccessControl.InheritanceFlags]::ObjectInherit
$propagation = [System.Security.AccessControl.PropagationFlags]::None
foreach ($sid in @($current, $system, $administrators)) {
  $rule = New-Object System.Security.AccessControl.FileSystemAccessRule(
    $sid,
    [System.Security.AccessControl.FileSystemRights]::FullControl,
    $inheritance,
    $propagation,
    [System.Security.AccessControl.AccessControlType]::Allow
  )
  [void]$acl.AddAccessRule($rule)
}
[System.IO.Directory]::SetAccessControl($path, $acl)
`;

async function hardenCapsuleAcl(path) {
  if (platform() !== "win32") return;
  const childEnvironment = essentialWindowsEnvironment(path);
  const powershellPath = await trustedWindowsPowerShellPath();
  const encodedScript = Buffer.from(HARDEN_CAPSULE_ACL_SCRIPT, "utf16le").toString("base64");
  const encodedPath = Buffer.from(path, "utf8").toString("base64");
  await new Promise((resolveResult, rejectResult) => {
    execFile(powershellPath, [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-EncodedCommand",
      encodedScript,
    ], {
      cwd: childEnvironment.SystemRoot,
      windowsHide: true,
      timeout: 30_000,
      maxBuffer: 64 * 1024,
      env: {
        ...childEnvironment,
        SOULFORGE_MAIL_CAPSULE_PATH_B64: encodedPath,
      },
    }, (error) => {
      if (error) rejectResult(Object.assign(new Error("mail_bridge_capsule_acl_hardening_failed"), {
        code: "mail_bridge_capsule_acl_hardening_failed",
      }));
      else resolveResult();
    });
  });
}

function capsuleRelative(root, path) {
  const value = relative(root, path);
  if (!value || value === ".." || value.startsWith(`..${sep}`) || isAbsolute(value)) {
    fail("mail_bridge_capsule_path_unsafe");
  }
  return value.split(sep).join("/");
}

async function addCapsuleFile(capsule, path, bytes, sha256) {
  await writeCapsuleFile(capsule.root, path, bytes);
  const verified = await verifyCapsuleFile(path, sha256);
  capsule.ownedFiles.push({
    path,
    relativePath: capsuleRelative(capsule.root, path),
    sha256,
    identity: verified.identity,
  });
}

function expectedCapsuleDirectories(capsule) {
  const directories = new Set();
  for (const file of capsule.ownedFiles) {
    const parts = file.relativePath.split("/");
    parts.pop();
    while (parts.length > 0) {
      directories.add(parts.join("/"));
      parts.pop();
    }
  }
  return [...directories].sort((left, right) => {
    const depth = right.split("/").length - left.split("/").length;
    return depth || right.localeCompare(left);
  });
}

async function inspectCapsuleEntries(root, current = root, entries = { files: [], directories: [] }) {
  await assertNormalDirectory(current, "mail_bridge_capsule_cleanup_unsafe");
  const rows = await readdir(current, { withFileTypes: true });
  rows.sort((left, right) => left.name.localeCompare(right.name));
  for (const row of rows) {
    const target = join(current, row.name);
    if (row.isSymbolicLink()) fail("mail_bridge_capsule_cleanup_unsafe");
    if (row.isDirectory()) {
      entries.directories.push(capsuleRelative(root, target));
      await inspectCapsuleEntries(root, target, entries);
      continue;
    }
    if (!row.isFile()) fail("mail_bridge_capsule_cleanup_unsafe");
    entries.files.push(capsuleRelative(root, target));
  }
  return entries;
}

async function verifyCapsuleOwnership(capsule) {
  const rootInfo = await optionalLstat(capsule.root);
  if (!rootInfo || !rootInfo.isDirectory() || rootInfo.isSymbolicLink()
    || !sameDirectoryIdentity(capsule.rootIdentity, directoryIdentity(rootInfo))) {
    fail("mail_bridge_capsule_cleanup_unsafe");
  }
  await assertNormalDirectory(capsule.root, "mail_bridge_capsule_cleanup_unsafe");
  const expectedFiles = capsule.ownedFiles
    .map((file) => file.relativePath)
    .sort((left, right) => left.localeCompare(right));
  const expectedDirectories = expectedCapsuleDirectories(capsule)
    .sort((left, right) => left.localeCompare(right));
  const actual = await inspectCapsuleEntries(capsule.root);
  actual.files.sort((left, right) => left.localeCompare(right));
  actual.directories.sort((left, right) => left.localeCompare(right));
  if (JSON.stringify(actual.files) !== JSON.stringify(expectedFiles)
    || JSON.stringify(actual.directories) !== JSON.stringify(expectedDirectories)) {
    fail("mail_bridge_capsule_cleanup_unsafe");
  }
  for (const file of capsule.ownedFiles) {
    const verified = await verifyCapsuleFile(file.path, file.sha256);
    if (!sameSerializedIdentity(verified.identity, file.identity)) {
      fail("mail_bridge_capsule_cleanup_unsafe");
    }
  }
}

async function cleanupMailCapsule(capsule) {
  let cleanupError = null;
  if (capsule.runtimePath) {
    try {
      const runtimeInfo = await optionalLstat(capsule.runtimePath);
      if (runtimeInfo) {
        if (!runtimeInfo.isFile()) {
          fail("mail_bridge_runtime_pin_cleanup_unsafe");
        }
        const verified = await stableFile(
          capsule.runtimePath,
          "mail_bridge_runtime_pin_cleanup_unsafe",
          "mail_bridge_runtime_pin_cleanup_unsafe",
        );
        if (verified.sha256 !== capsule.runtimeSha256
          || !sameSerializedIdentity(verified.identity, capsule.runtimeIdentity)) {
          fail("mail_bridge_runtime_pin_cleanup_unsafe");
        }
        const immediatelyBeforeDelete = await verifyCapsuleFile(
          capsule.runtimePath,
          capsule.runtimeSha256,
        );
        if (!sameSerializedIdentity(immediatelyBeforeDelete.identity, capsule.runtimeIdentity)) {
          fail("mail_bridge_runtime_pin_cleanup_unsafe");
        }
        await unlink(capsule.runtimePath);
      }
    } catch (error) {
      cleanupError = error;
    }
  }
  if (capsule.root) {
    try {
      const rootInfo = await optionalLstat(capsule.root);
      if (rootInfo) {
        if (!capsule.rootIdentity || !Array.isArray(capsule.ownedFiles)) {
          fail("mail_bridge_capsule_cleanup_unsafe");
        }
        await verifyCapsuleOwnership(capsule);
        for (const file of [...capsule.ownedFiles]
          .sort((left, right) => right.relativePath.localeCompare(left.relativePath))) {
          const verified = await verifyCapsuleFile(file.path, file.sha256);
          if (!sameSerializedIdentity(verified.identity, file.identity)) {
            fail("mail_bridge_capsule_cleanup_unsafe");
          }
          await unlink(file.path);
        }
        for (const directory of expectedCapsuleDirectories(capsule)) {
          await rmdir(resolve(capsule.root, ...directory.split("/")));
        }
        await rmdir(capsule.root);
      }
    } catch (error) {
      cleanupError ||= error;
    }
  }
  if (cleanupError) throw cleanupError;
}

async function prepareMailCapsule(binding, captured) {
  const capsule = {
    root: null,
    rootIdentity: null,
    ownedFiles: [],
    runtimePath: null,
    runtimeIdentity: null,
    runtimeSha256: null,
  };
  try {
    capsule.root = await mkdtemp(join(tmpdir(), "soulforge-mail-bridge-"));
    await assertNormalDirectory(capsule.root, "mail_bridge_capsule_root_unsafe");
    await hardenCapsuleAcl(capsule.root);
    capsule.rootIdentity = directoryIdentity(
      await lstat(capsule.root, { bigint: true }),
    );
    const tempMarker = Buffer.from("soulforge-mail-operation-temp-v1\n", "utf8");
    await addCapsuleFile(
      capsule,
      join(capsule.root, "temp", ".owner-marker"),
      tempMarker,
      createHash("sha256").update(tempMarker).digest("hex"),
    );
    const mailFetchRoot = join(capsule.root, "guild_hall", "gateway", "mail_fetch");
    for (const file of captured.collectorFiles) {
      const target = resolve(mailFetchRoot, ...file.relativePath.split("/"));
      await addCapsuleFile(capsule, target, file.bytes, file.sha256);
    }

    const registerPath = join(capsule.root, "register", "team_mailboxes.json");
    await addCapsuleFile(capsule, registerPath, captured.register.bytes, captured.register.sha256);

    const runtimeExtension = extname(binding.pythonExecutable);
    capsule.runtimePath = join(
      dirname(binding.pythonExecutable),
      `.soulforge-mail-bridge-${randomUUID()}${runtimeExtension}`,
    );
    try {
      await link(binding.pythonExecutable, capsule.runtimePath);
    } catch (error) {
      fail("mail_bridge_python_runtime_pin_unavailable");
    }
    const sourceAfterLink = await stableFile(
      binding.pythonExecutable,
      "mail_bridge_python_executable_unsafe",
      "mail_bridge_python_executable_unstable",
    );
    const runtime = await stableFile(
      capsule.runtimePath,
      "mail_bridge_python_runtime_pin_unsafe",
      "mail_bridge_python_runtime_pin_unstable",
    );
    if (sourceAfterLink.sha256 !== captured.python.sha256
      || runtime.sha256 !== captured.python.sha256
      || !sameSerializedIdentity(runtime.identity, sourceAfterLink.identity)) {
      fail("mail_bridge_python_runtime_pin_mismatch");
    }
    capsule.runtimeIdentity = runtime.identity;
    capsule.runtimeSha256 = runtime.sha256;

    const identityManifest = Buffer.from(`${JSON.stringify({
      schema_version: "soulforge.ingress.mail_identity_manifest.v1",
      python: {
        identity: runtime.identity,
        sha256: runtime.sha256,
      },
      credentials: captured.credentials.map(({ env_file, identity }) => ({
        env_file,
        identity,
      })),
    })}\n`, "utf8");
    const identityManifestSha256 = createHash("sha256").update(identityManifest).digest("hex");
    const identityManifestPath = join(capsule.root, "identity-manifest.json");
    await addCapsuleFile(
      capsule,
      identityManifestPath,
      identityManifest,
      identityManifestSha256,
    );

    await verifyCapsuleOwnership(capsule);

    const cliRelative = captured.collectorFiles[0].relativePath;
    return {
      ...capsule,
      cliPath: resolve(mailFetchRoot, ...cliRelative.split("/")),
      registerPath,
      identityManifestPath,
      identityManifestSha256,
      launchLockFiles: [
        {
          path: capsule.runtimePath,
          sha256: capsule.runtimeSha256,
          verifyDigest: true,
          requireProtectedAcl: true,
        },
        ...capsule.ownedFiles.map((file) => ({
          path: file.path,
          sha256: file.sha256,
          verifyDigest: true,
          requireProtectedAcl: true,
        })),
        ...captured.credentials.map((credential) => ({
          path: credential.path,
          verifyDigest: false,
          requireProtectedAcl: false,
        })),
      ],
    };
  } catch (error) {
    try {
      await cleanupMailCapsule(capsule);
    } catch {
      // The original preparation failure remains the safe operator signal.
    }
    if (typeof error?.code === "string" && error.code.startsWith("mail_bridge_")) throw error;
    fail("mail_bridge_capsule_prepare_failed");
  }
}

const SECURE_WINDOWS_LAUNCH_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$locks = New-Object 'System.Collections.Generic.List[System.IO.FileStream]'
$spawned = $false
function Get-SidValue($identity) {
  if ($identity -is [System.Security.Principal.SecurityIdentifier]) { return $identity.Value }
  $account = New-Object System.Security.Principal.NTAccount([string]$identity)
  return $account.Translate([System.Security.Principal.SecurityIdentifier]).Value
}
function Assert-ProtectedAcl([string]$path) {
  $currentSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  $allowedSids = @(
    $currentSid,
    'S-1-5-18',
    'S-1-5-32-544',
    'S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464'
  )
  $acl = Get-Acl -LiteralPath $path
  $ownerSid = Get-SidValue $acl.Owner
  if ($allowedSids -notcontains $ownerSid) { throw 'secure_launch_acl_owner_invalid' }
  $dangerous = ([System.Security.AccessControl.FileSystemRights]::WriteData -bor [System.Security.AccessControl.FileSystemRights]::AppendData -bor [System.Security.AccessControl.FileSystemRights]::WriteExtendedAttributes -bor [System.Security.AccessControl.FileSystemRights]::WriteAttributes -bor [System.Security.AccessControl.FileSystemRights]::Delete -bor [System.Security.AccessControl.FileSystemRights]::DeleteSubdirectoriesAndFiles -bor [System.Security.AccessControl.FileSystemRights]::ChangePermissions -bor [System.Security.AccessControl.FileSystemRights]::TakeOwnership)
  foreach ($rule in $acl.Access) {
    if ($rule.AccessControlType -ne [System.Security.AccessControl.AccessControlType]::Allow) { continue }
    $sid = Get-SidValue $rule.IdentityReference
    if ($allowedSids -notcontains $sid -and (($rule.FileSystemRights -band $dangerous) -ne 0)) {
      throw 'secure_launch_acl_write_grant_invalid'
    }
  }
}
function Resolve-NormalContainedFile([string]$root, [string]$path) {
  $comparison = [System.StringComparison]::OrdinalIgnoreCase
  $rootPath = [System.IO.Path]::GetFullPath($root).TrimEnd('\', '/')
  $candidate = [System.IO.Path]::GetFullPath($path)
  $prefix = $rootPath + [System.IO.Path]::DirectorySeparatorChar
  if ($candidate.Equals($rootPath, $comparison) -or -not $candidate.StartsWith($prefix, $comparison)) {
    throw 'secure_launch_nested_path_escape'
  }
  $rootAttributes = [System.IO.File]::GetAttributes($rootPath)
  if (($rootAttributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0 -or
      ($rootAttributes -band [System.IO.FileAttributes]::Directory) -eq 0) {
    throw 'secure_launch_nested_root_unsafe'
  }
  $cursor = [System.IO.Path]::GetDirectoryName($candidate)
  while (-not $cursor.Equals($rootPath, $comparison)) {
    if ([string]::IsNullOrWhiteSpace($cursor) -or -not $cursor.StartsWith($prefix, $comparison)) {
      throw 'secure_launch_nested_path_escape'
    }
    $attributes = [System.IO.File]::GetAttributes($cursor)
    if (($attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0 -or
        ($attributes -band [System.IO.FileAttributes]::Directory) -eq 0) {
      throw 'secure_launch_nested_reparse_point'
    }
    $cursor = [System.IO.Path]::GetDirectoryName($cursor)
  }
  $fileAttributes = [System.IO.File]::GetAttributes($candidate)
  if (($fileAttributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0 -or
      ($fileAttributes -band [System.IO.FileAttributes]::Directory) -ne 0) {
    throw 'secure_launch_nested_file_unsafe'
  }
  return $candidate
}
function Invoke-IsolatedChild($config, [string]$arguments, $environment, [int]$timeoutMs, [ref]$startedFlag) {
  $process = New-Object System.Diagnostics.Process
  try {
    $start = New-Object System.Diagnostics.ProcessStartInfo
    $start.FileName = [string]$config.executablePath
    $start.Arguments = $arguments
    $start.WorkingDirectory = [string]$config.cwd
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $start.StandardOutputEncoding = New-Object System.Text.UTF8Encoding($false)
    $start.StandardErrorEncoding = New-Object System.Text.UTF8Encoding($false)
    $start.EnvironmentVariables.Clear()
    foreach ($property in $environment.PSObject.Properties) {
      $start.EnvironmentVariables[[string]$property.Name] = [string]$property.Value
    }
    $process.StartInfo = $start
    if (-not $process.Start()) { throw 'secure_launch_start_failed' }
    $startedFlag.Value = $true
    $stdoutTask = $process.StandardOutput.ReadToEndAsync()
    $stderrTask = $process.StandardError.ReadToEndAsync()
    $timedOut = -not $process.WaitForExit($timeoutMs)
    if ($timedOut) {
      try { $process.Kill() } catch { }
      try { $process.WaitForExit() } catch { }
    }
    return [pscustomobject]@{
      exitCode = if ($process.HasExited) { [int]$process.ExitCode } else { $null }
      timedOut = [bool]$timedOut
      stdout = [string]$stdoutTask.GetAwaiter().GetResult()
      stderr = [string]$stderrTask.GetAwaiter().GetResult()
    }
  } finally {
    if ($startedFlag.Value -and -not $process.HasExited) {
      try { $process.Kill() } catch { }
      try { $process.WaitForExit() } catch { }
    }
    $process.Dispose()
  }
}
try {
  $encoded = [string]$env:SOULFORGE_MAIL_LAUNCH_CONFIG_B64
  $env:SOULFORGE_MAIL_LAUNCH_CONFIG_B64 = $null
  if ([string]::IsNullOrWhiteSpace($encoded)) { throw 'secure_launch_config_missing' }
  $configText = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($encoded))
  $config = ConvertFrom-Json -InputObject $configText
  foreach ($row in $config.lockFiles) {
    $attributes = [System.IO.File]::GetAttributes([string]$row.path)
    if (($attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
      throw 'secure_launch_reparse_point'
    }
    $stream = [System.IO.File]::Open(
      [string]$row.path,
      [System.IO.FileMode]::Open,
      [System.IO.FileAccess]::Read,
      [System.IO.FileShare]::Read
    )
    if ([bool]$row.verifyDigest) {
      $hash = [System.Security.Cryptography.SHA256]::Create()
      try {
        $actual = [System.BitConverter]::ToString($hash.ComputeHash($stream)).Replace('-', '').ToLowerInvariant()
      } finally {
        $hash.Dispose()
      }
      if ($actual -cne [string]$row.sha256) {
        $stream.Dispose()
        throw 'secure_launch_digest_mismatch'
      }
      $stream.Position = 0
    }
    if ([bool]$row.requireProtectedAcl) { Assert-ProtectedAcl ([string]$row.path) }
    $locks.Add($stream)
  }

  $discoveryStarted = $false
  $discovery = Invoke-IsolatedChild $config ([string]$config.discoveryArguments) $config.childEnvironment ([int]$config.discoveryTimeoutMs) ([ref]$discoveryStarted)
  if ($discovery.timedOut -or $discovery.exitCode -ne 0) {
    throw 'secure_launch_nested_discovery_failed'
  }
  $discoveryPayload = ConvertFrom-Json -InputObject ([string]$discovery.stdout)
  if ([string]$discoveryPayload.schema_version -cne 'soulforge.mail.nested_credentials.v1') {
    throw 'secure_launch_nested_discovery_invalid'
  }
  $nestedRows = @($discoveryPayload.nested_credentials)
  if ($nestedRows.Count -gt 256) { throw 'secure_launch_nested_discovery_invalid' }
  $nestedPaths = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
  foreach ($row in $nestedRows) {
    $nestedPath = Resolve-NormalContainedFile ([string]$config.privateConfigRoot) ([string]$row.path)
    if ($nestedPaths.Add($nestedPath)) {
      $nestedStream = [System.IO.File]::Open(
        $nestedPath,
        [System.IO.FileMode]::Open,
        [System.IO.FileAccess]::Read,
        [System.IO.FileShare]::Read
      )
      $locks.Add($nestedStream)
    }
  }
  $nestedPayloadB64 = [System.Convert]::ToBase64String(
    [System.Text.Encoding]::UTF8.GetBytes([string]$discovery.stdout)
  )
  $actualEnvironmentValues = [ordered]@{}
  foreach ($property in $config.childEnvironment.PSObject.Properties) {
    $actualEnvironmentValues[[string]$property.Name] = [string]$property.Value
  }
  $actualEnvironmentValues['SOULFORGE_MAIL_NESTED_CREDENTIALS_B64'] = $nestedPayloadB64
  $actualEnvironment = [pscustomobject]$actualEnvironmentValues
  $actual = Invoke-IsolatedChild $config ([string]$config.arguments) $actualEnvironment ([int]$config.timeoutMs) ([ref]$spawned)
  $result = [ordered]@{
    exitCode = $actual.exitCode
    errorCode = $null
    timedOut = [bool]$actual.timedOut
    spawned = $true
    stdout = [string]$actual.stdout
    stderr = [string]$actual.stderr
  }
} catch {
  $result = [ordered]@{
    exitCode = $null
    errorCode = 'mail_bridge_secure_launch_failed'
    timedOut = $false
    spawned = [bool]$spawned
    stdout = ''
    stderr = ''
  }
} finally {
  foreach ($stream in $locks) {
    try { $stream.Dispose() } catch { }
  }
}
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::Out.Write(($result | ConvertTo-Json -Compress -Depth 6))
`;

function quoteWindowsArgument(value) {
  const input = String(value);
  if (input.length > 0 && !/[\s"]/.test(input)) return input;
  let output = '"';
  let backslashes = 0;
  for (const character of input) {
    if (character === "\\") {
      backslashes += 1;
      continue;
    }
    if (character === '"') {
      output += "\\".repeat(backslashes * 2 + 1);
      output += '"';
      backslashes = 0;
      continue;
    }
    output += "\\".repeat(backslashes);
    output += character;
    backslashes = 0;
  }
  output += "\\".repeat(backslashes * 2);
  return `${output}"`;
}

function normalizedStartupSystemRoot() {
  if (platform() !== "win32"
    || !/^[A-Za-z]:[\\/]Windows$/i.test(STARTUP_WINDOWS_SYSTEM_ROOT)
    || !isAbsolute(STARTUP_WINDOWS_SYSTEM_ROOT)) {
    fail("mail_bridge_secure_launch_unsupported");
  }
  return resolve(STARTUP_WINDOWS_SYSTEM_ROOT);
}

async function trustedWindowsPowerShellPath() {
  const systemRoot = normalizedStartupSystemRoot();
  const chain = [
    systemRoot,
    join(systemRoot, "System32"),
    join(systemRoot, "System32", "WindowsPowerShell"),
    join(systemRoot, "System32", "WindowsPowerShell", "v1.0"),
  ];
  for (const directory of chain) {
    await assertNormalDirectory(directory, "mail_bridge_secure_launch_unsupported");
  }
  const powershellPath = join(chain.at(-1), "powershell.exe");
  await assertNormalFile(powershellPath, "mail_bridge_secure_launch_unsupported");
  return powershellPath;
}

export async function preflightSecureMailLauncher() {
  await trustedWindowsPowerShellPath();
  return { supported: true };
}

function essentialWindowsEnvironment(operationTemp) {
  if (typeof operationTemp !== "string" || !isAbsolute(operationTemp)) {
    fail("mail_bridge_secure_launch_config_invalid");
  }
  const systemRoot = normalizedStartupSystemRoot();
  return {
    SystemRoot: systemRoot,
    WINDIR: systemRoot,
    TEMP: resolve(operationTemp),
    TMP: resolve(operationTemp),
    PYTHONNOUSERSITE: "1",
  };
}

async function defaultExecutor({ executablePath, args, timeoutMs, cwd, lockFiles, privateConfigRoot }) {
  if (platform() !== "win32") fail("mail_bridge_secure_launch_unsupported");
  const childEnvironment = essentialWindowsEnvironment(join(cwd, "temp"));
  const powershellPath = await trustedWindowsPowerShellPath();
  const uniqueLocks = new Map();
  for (const row of lockFiles || []) {
    if (!row || typeof row.path !== "string"
      || typeof row.verifyDigest !== "boolean"
      || typeof row.requireProtectedAcl !== "boolean"
      || (row.verifyDigest && !/^[a-f0-9]{64}$/.test(row.sha256 || ""))
      || (!row.verifyDigest && Object.hasOwn(row, "sha256"))) {
      fail("mail_bridge_secure_launch_config_invalid");
    }
    const key = comparable(resolve(row.path));
    const existing = uniqueLocks.get(key);
    if (existing && (existing.verifyDigest !== row.verifyDigest
      || (row.verifyDigest && existing.sha256 !== row.sha256))) {
      fail("mail_bridge_secure_launch_config_invalid");
    }
    uniqueLocks.set(key, {
      path: resolve(row.path),
      verifyDigest: row.verifyDigest,
      requireProtectedAcl: Boolean(existing?.requireProtectedAcl || row.requireProtectedAcl),
      ...(row.verifyDigest ? { sha256: row.sha256 } : {}),
    });
  }
  if (uniqueLocks.size === 0) fail("mail_bridge_secure_launch_config_invalid");
  if (typeof privateConfigRoot !== "string" || !isAbsolute(privateConfigRoot)) {
    fail("mail_bridge_secure_launch_config_invalid");
  }
  const launchConfig = {
    executablePath,
    arguments: args.map(quoteWindowsArgument).join(" "),
    discoveryArguments: [...args, "--discover-nested-credentials"]
      .map(quoteWindowsArgument).join(" "),
    cwd,
    timeoutMs,
    discoveryTimeoutMs: Math.min(timeoutMs, 30_000),
    lockFiles: [...uniqueLocks.values()],
    privateConfigRoot: resolve(privateConfigRoot),
    childEnvironment,
  };
  const encodedConfig = Buffer.from(JSON.stringify(launchConfig), "utf8").toString("base64");
  const encodedScript = Buffer.from(SECURE_WINDOWS_LAUNCH_SCRIPT, "utf16le").toString("base64");
  return new Promise((resolveResult) => {
    execFile(powershellPath, [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-EncodedCommand",
      encodedScript,
    ], {
      cwd: childEnvironment.SystemRoot,
      windowsHide: true,
      timeout: timeoutMs + 60_000,
      maxBuffer: 2 * 1024 * 1024,
      env: {
        ...childEnvironment,
        SOULFORGE_MAIL_LAUNCH_CONFIG_B64: encodedConfig,
      },
    }, (error, stdout, stderr) => {
      if (error) {
        resolveResult({
          exitCode: Number.isSafeInteger(error.code) ? error.code : null,
          errorCode: "mail_bridge_secure_launch_failed",
          timedOut: Boolean(error?.killed),
          spawned: false,
          stdout: "",
          stderr: "",
        });
        return;
      }
      try {
        const parsed = JSON.parse(String(stdout || ""));
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
        resolveResult(parsed);
      } catch {
        resolveResult({
          exitCode: null,
          errorCode: "mail_bridge_secure_launch_failed",
          timedOut: false,
          spawned: false,
          stdout: "",
          stderr: "",
        });
      }
    });
  });
}

function count(value) {
  if (!Number.isSafeInteger(value) || value < 0) fail("mail_bridge_child_output_invalid");
  return value;
}

function childErrorCodes(value) {
  if (!Array.isArray(value)) fail("mail_bridge_child_output_invalid");
  const codes = [];
  for (const row of value) {
    const code = row && typeof row === "object" ? row.code : null;
    codes.push(
      typeof code === "string"
        && (ALLOWED_CHILD_ERROR_CODES.has(code) || SAFE_SOURCE_CHILD_ERROR_CODE.test(code))
        ? code
        : "mail_child_error",
    );
  }
  return [...new Set(codes)].sort();
}

function parseChildSummary(stdout) {
  let value;
  try {
    value = JSON.parse(String(stdout || ""));
  } catch {
    fail("mail_bridge_child_output_invalid");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)
    || value.schema_version !== "email.fetch.team_mailbox_run.v1"
    || typeof value.partial !== "boolean") fail("mail_bridge_child_output_invalid");
  return {
    partial: value.partial,
    mailboxes_total: count(value.mailboxes_total),
    mailboxes_enabled: count(value.mailboxes_enabled),
    mailboxes_run: count(value.mailboxes_run),
    mailboxes_skipped: count(value.mailboxes_skipped),
    total_events: count(value.total_events),
    total_new_events: count(value.total_new_events),
    total_duplicates: count(value.total_duplicates),
    error_codes: childErrorCodes(value.errors),
  };
}

function summaryConsistent(summary, preflight) {
  const allEnabledRan = summary.mailboxes_run === summary.mailboxes_enabled;
  const hasMailboxErrors = summary.error_codes.length > 0;
  return summary.mailboxes_total === preflight.mailboxes_total
    && summary.mailboxes_enabled === preflight.mailboxes_enabled
    && summary.mailboxes_skipped === summary.mailboxes_total - summary.mailboxes_enabled
    && summary.mailboxes_run <= summary.mailboxes_enabled
    && summary.total_new_events + summary.total_duplicates === summary.total_events
    && (summary.mailboxes_run > 0 || summary.total_events === 0)
    && (allEnabledRan !== hasMailboxErrors)
    && (summary.partial || allEnabledRan)
    && (!summary.partial || summary.mailboxes_run > 0 || hasMailboxErrors);
}

function failedResult(code, { exitCode = null, spawned = false } = {}) {
  return {
    schema_version: MAIL_BRIDGE_RESULT_SCHEMA,
    status: "failed",
    spawned,
    exit_code: Number.isSafeInteger(exitCode) ? exitCode : null,
    partial: spawned,
    write_count_known: !spawned,
    mailboxes_total: 0,
    mailboxes_enabled: 0,
    mailboxes_run: 0,
    mailboxes_skipped: 0,
    total_events: 0,
    total_new_events: 0,
    total_duplicates: 0,
    credential_files_checked: 0,
    error_codes: [SAFE_ERROR_CODE.test(code || "") ? code : "mail_child_failed"],
  };
}

export function sanitizedMailFailure(code) {
  return failedResult(code);
}

export async function runMailBridge(binding, options = {}) {
  const hasCustomExecutor = typeof options.executor === "function";
  const before = await captureMailBinding(binding, { requireCollector: !hasCustomExecutor });
  const capsule = await prepareMailCapsule(binding, before);
  const args = [
    "-I",
    "-B",
    "-S",
    "-X",
    "utf8",
    capsule.cliPath,
    "--data-root",
    binding.dataRoot,
    "--register",
    capsule.registerPath,
    "--register-origin",
    binding.registerPath,
    "--register-sha256",
    before.register.sha256,
    "--identity-manifest",
    capsule.identityManifestPath,
    "--identity-manifest-sha256",
    capsule.identityManifestSha256,
    "--private-config-root",
    binding.privateConfigRoot,
    "--ingress-only",
    "--once",
    "--limit",
    String(binding.limit),
    "--json",
  ];
  const executor = hasCustomExecutor ? options.executor : defaultExecutor;
  let execution;
  let executorFailed = false;
  let cleanupFailed = false;
  try {
    execution = await executor({
      executablePath: capsule.runtimePath,
      args,
      timeoutMs: MAIL_BRIDGE_TIMEOUT_MS,
      cwd: capsule.root,
      lockFiles: capsule.launchLockFiles,
      privateConfigRoot: binding.privateConfigRoot,
    });
  } catch {
    executorFailed = true;
  } finally {
    try {
      await cleanupMailCapsule(capsule);
    } catch {
      cleanupFailed = true;
    }
  }
  if (cleanupFailed) {
    return failedResult("mail_bridge_capsule_cleanup_failed", {
      exitCode: execution?.exitCode,
      spawned: Boolean(!executorFailed && execution && execution.spawned !== false),
    });
  }
  if (executorFailed) return failedResult("mail_executor_failed");
  if (!execution || typeof execution !== "object") return failedResult("mail_executor_failed");
  const childSpawned = execution.spawned !== false;
  if (execution.timedOut) {
    return failedResult("mail_child_timeout", { exitCode: execution.exitCode, spawned: childSpawned });
  }
  let summary;
  try {
    summary = parseChildSummary(execution.stdout);
  } catch (error) {
    const errorCode = execution.errorCode && SAFE_ERROR_CODE.test(execution.errorCode)
      ? "mail_child_spawn_failed"
      : error?.code || "mail_bridge_child_output_invalid";
    return failedResult(errorCode, { exitCode: execution.exitCode, spawned: childSpawned });
  }
  if (!summaryConsistent(summary, before)) {
    return failedResult("mail_bridge_child_output_invalid", {
      exitCode: execution.exitCode,
      spawned: childSpawned,
    });
  }
  const exitCode = Number.isSafeInteger(execution.exitCode) ? execution.exitCode : null;
  const partial = summary.partial || exitCode !== 0 || summary.error_codes.length > 0;
  const errorCodes = [...summary.error_codes];
  if (partial && errorCodes.length === 0) {
    errorCodes.push(exitCode === 0 ? "mail_child_partial" : "mail_child_failed");
  }
  return {
    schema_version: MAIL_BRIDGE_RESULT_SCHEMA,
    status: partial ? "partial" : "ok",
    spawned: true,
    exit_code: exitCode,
    partial,
    write_count_known: true,
    mailboxes_total: summary.mailboxes_total,
    mailboxes_enabled: summary.mailboxes_enabled,
    mailboxes_run: summary.mailboxes_run,
    mailboxes_skipped: summary.mailboxes_skipped,
    total_events: summary.total_events,
    total_new_events: summary.total_new_events,
    total_duplicates: summary.total_duplicates,
    credential_files_checked: before.credential_files_checked,
    error_codes: [...new Set(errorCodes)].sort(),
  };
}
