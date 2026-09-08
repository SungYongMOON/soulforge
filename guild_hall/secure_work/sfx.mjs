#!/usr/bin/env node
// Fixed installation entrypoint. Before verification: Node builtins only.
// The installer must pin this launcher and Node under an independently owned,
// immutable generation. A generated file/hash is NOT proof of that OS custody.
// This source checkout deliberately has no authority to launch a runtime.
import { createHash } from "node:crypto";
import { spawnSync, execFileSync } from "node:child_process";
import { closeSync, existsSync, fstatSync, lstatSync, openSync, readFileSync,
  readSync, readdirSync, realpathSync } from "node:fs";
import { registerHooks, isBuiltin } from "node:module";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const INSTALLATION_ANCHOR = null; // INSTALLER_FIXED_ANCHOR
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SHA = /^[a-f0-9]{64}$/;
const SID = /^S-1-[0-9]+(?:-[0-9]+)+$/;
const SYSTEM = ["S-1-5-18", "S-1-5-32-544",
  "S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464"];
const EVERYONE = ["S-1-1-0", "S-1-5-11", "S-1-5-32-545"];
const MUTATE = 2 | 4 | 16 | 64 | 256 | 65536 | 262144 | 524288 | 0x40000000 | 0x10000000;
const DANGEROUS_PRIVILEGES = ["SeBackupPrivilege", "SeRestorePrivilege", "SeTakeOwnershipPrivilege",
  "SeDebugPrivilege", "SeTcbPrivilege", "SeImpersonatePrivilege", "SeCreateTokenPrivilege", "SeAssignPrimaryTokenPrivilege"];
const fail = () => { throw new Error("SECURE_WORK_LAUNCH_HOLD"); };
const hash = data => createHash("sha256").update(data).digest("hex");
const exact = (v, keys) => {
  if (!v || typeof v !== "object" || Array.isArray(v)
    || JSON.stringify(Object.keys(v).sort()) !== JSON.stringify([...keys].sort())) fail();
};
const norm = p => process.platform === "win32" ? path.resolve(p).toLowerCase() : path.resolve(p);
const same = (a, b) => typeof a === "string" && typeof b === "string" && norm(a) === norm(b);
const within = (root, p) => {
  const rel = path.relative(norm(root), norm(p));
  return rel === "" || (!path.isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${path.sep}`));
};
function chain(p) {
  if (typeof p !== "string" || !path.isAbsolute(p)) fail();
  const list = [path.resolve(p)];
  while (path.dirname(list.at(-1)) !== list.at(-1)) list.push(path.dirname(list.at(-1)));
  return list;
}
function normal(p, kind = null, osComponent = false) {
  for (const item of chain(p)) if (lstatSync(item).isSymbolicLink()) fail();
  const stat = lstatSync(p);
  if (!same(realpathSync(p), p) || (kind === "file" && (!stat.isFile() || (!osComponent && stat.nlink !== 1)))
    || (kind === "directory" && !stat.isDirectory())) fail();
  return stat;
}
function bytes(p, limit = 536870912, osComponent = false) {
  const before = normal(p, "file", osComponent);
  if (before.size > limit) fail();
  const fd = openSync(p, "r");
  try {
    const info = fstatSync(fd);
    if (info.ino !== before.ino || info.dev !== before.dev || info.size !== before.size) fail();
    const body = Buffer.alloc(info.size + 1);
    const count = readSync(fd, body, 0, body.length, 0);
    const after = fstatSync(fd);
    if (count !== info.size || (!osComponent && after.nlink !== 1) || after.size !== info.size
      || after.ctimeMs !== info.ctimeMs || after.mtimeMs !== info.mtimeMs) fail();
    return body.subarray(0, count);
  } finally { closeSync(fd); }
}
// Same metadata-only observer used by the M10 authority module.
const OBSERVER = String.raw`
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$inputPaths = @([Console]::In.ReadToEnd() | ConvertFrom-Json)
$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object System.Security.Principal.WindowsPrincipal($identity)
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class SecureWorkTokenRead {
 [StructLayout(LayoutKind.Sequential)] public struct Luid { public uint Low; public int High; }
 [DllImport("advapi32.dll", SetLastError=true)] public static extern bool GetTokenInformation(IntPtr token, int kind, IntPtr data, int length, out int needed);
 [DllImport("advapi32.dll", CharSet=CharSet.Unicode, SetLastError=true)] public static extern bool LookupPrivilegeName(string system, ref Luid luid, StringBuilder name, ref int length);
}
'@
$needed = 0
[void][SecureWorkTokenRead]::GetTokenInformation($identity.Token, 3, [IntPtr]::Zero, 0, [ref]$needed)
if ($needed -lt 4 -or $needed -gt 65536) { throw 'token_metadata_unavailable' }
$buffer = [Runtime.InteropServices.Marshal]::AllocHGlobal($needed)
$privileges = @()
try {
 if (-not [SecureWorkTokenRead]::GetTokenInformation($identity.Token, 3, $buffer, $needed, [ref]$needed)) { throw 'token_metadata_unavailable' }
 $count = [Runtime.InteropServices.Marshal]::ReadInt32($buffer)
 if ($count -lt 0 -or $count -gt 128 -or (4 + $count * 12) -gt $needed) { throw 'token_metadata_unavailable' }
 for ($i=0; $i -lt $count; $i++) {
   $offset = 4 + $i * 12
   $luid = New-Object SecureWorkTokenRead+Luid
   $luid.Low = [uint32][Runtime.InteropServices.Marshal]::ReadInt32($buffer, $offset)
   $luid.High = [Runtime.InteropServices.Marshal]::ReadInt32($buffer, $offset + 4)
   $name = New-Object Text.StringBuilder(256)
   $length = 256
   if (-not [SecureWorkTokenRead]::LookupPrivilegeName($null, [ref]$luid, $name, [ref]$length)) { throw 'token_metadata_unavailable' }
   $privileges += $name.ToString()
 }
} finally { [Runtime.InteropServices.Marshal]::FreeHGlobal($buffer) }
$rows = @()
foreach ($path in $inputPaths) {
  $item = Get-Item -LiteralPath $path -Force
  $acl = Get-Acl -LiteralPath $path
  $owner = (New-Object System.Security.Principal.NTAccount($acl.Owner)).Translate([System.Security.Principal.SecurityIdentifier]).Value
  $allow = @()
  foreach ($rule in $acl.Access) {
    if ($rule.AccessControlType -eq [System.Security.AccessControl.AccessControlType]::Allow) {
      $sid = $rule.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value
      $allow += @{sid=$sid; rights=[long]$rule.FileSystemRights}
    }
  }
  $rows += @{path=[System.IO.Path]::GetFullPath($path); owner_sid=$owner;
    reparse=[bool]($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint); allow=@($allow)}
}
@{sid=$identity.User.Value; groups=@($identity.Groups | ForEach-Object {$_.Value}); privileges=@($privileges);
 elevated=$principal.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator);
 paths=@($rows)} | ConvertTo-Json -Depth 8 -Compress
`;

export function observeWindowsSecurity(paths, executablePin) {
  if (process.platform !== "win32" || !Array.isArray(paths) || paths.length > 2048) fail();
  exact(executablePin, ["path", "sha256"]);
  const executable = executablePin.path;
  if (!SHA.test(executablePin.sha256) || hash(bytes(executable, 16777216, true)) !== executablePin.sha256) fail();
  // Metadata only. No credential/source bytes, ACL mutations or logon tokens.
  const windowsRoot = path.dirname(path.dirname(path.dirname(path.dirname(executable))));
  const output = execFileSync(executable, ["-NoProfile", "-NonInteractive", "-EncodedCommand",
    Buffer.from(OBSERVER, "utf16le").toString("base64")], {
    input: JSON.stringify(paths), windowsHide: true, timeout: 30000, maxBuffer: 16777216,
    stdio: ["pipe", "pipe", "pipe"], env: { SYSTEMROOT: windowsRoot, WINDIR: windowsRoot },
  });
  return JSON.parse(output.toString("utf8").replace(/^\uFEFF/, ""));
}


export function assertProtectedPaths(paths, owner, query, { denyRead = false } = {}) {
  if (!SID.test(owner)) fail();
  const all = [...new Set(paths.flatMap(chain))];
  let sender = null;
  // Bounded OS requests; checking every directory prevents an unlisted child
  // from being added by the sender after a successful file hash.
  for (let offset = 0; offset < all.length; offset += 2048) {
    const full = all.slice(offset, offset + 2048);
    const evidence = query(full);
    if (!SID.test(evidence?.sid) || evidence.sid === owner || evidence.elevated !== false
      || !Array.isArray(evidence.groups) || !evidence.groups.every(s => SID.test(s))
      || !Array.isArray(evidence.privileges) || evidence.privileges.some(p =>
        typeof p !== "string" || DANGEROUS_PRIVILEGES.includes(p))
      || !Array.isArray(evidence.paths) || evidence.paths.length !== full.length
      || evidence.groups.includes("S-1-5-32-544") || SYSTEM.includes(evidence.sid)
      || (sender !== null && sender !== evidence.sid)) fail();
    sender = evidence.sid;
    const callers = new Set([sender, ...evidence.groups, ...EVERYONE]);
    for (let i = 0; i < full.length; i++) {
      const item = evidence.paths[i];
      if (!same(item.path, full[i]) || item.reparse !== false
        || ![owner, ...SYSTEM].includes(item.owner_sid) || !Array.isArray(item.allow)) fail();
      for (const ace of item.allow) {
        if (!SID.test(ace.sid) || !Number.isSafeInteger(ace.rights)) fail();
        if ((ace.rights & MUTATE) && (callers.has(ace.sid) || ![owner, ...SYSTEM].includes(ace.sid))) fail();
        if (denyRead && paths.some(p => same(p, full[i])) && callers.has(ace.sid)
          && (ace.rights & (1 | 0x80000000 | 0x10000000))) fail();
      }
    }
  }
  return sender;
}
function pin(value, osComponent = false) {
  exact(value, ["path", "sha256"]);
  assertRuntimePath(value.path);
  if (!SHA.test(value.sha256) || hash(bytes(value.path, 536870912, osComponent)) !== value.sha256) fail();
}
function assertRuntimePath(value) {
  if (typeof value !== "string" || !path.isAbsolute(value)) fail();
  // Known storage-surface names are an additional boundary, not a claim that
  // an ordinary name proves code-only contents. Keep explicit root exclusions.
  for (const component of value.split(/[\\/]/)) {
    const name = component.replace(/[ .]+$/, "");
    if (/^(?:\.env(?:\..*)?|credentials?|vault|jobs|outbox|receipts|private-state|[._-]*(?:working(?:[-_](?:data|state|root))?|workspaces?|workmeta|canonical(?:[-_](?:data|bytes|root))?))$/i.test(name)
      || /\.(?:key|pfx|p12)$/i.test(name)) fail();
  }
}
export function renderInstalledLauncher(source, anchor) {
  // Pure source generation for the existing installer, no write/registration,
  // key generation or activation. Owner/OS custody remains a separate gate.
  exact(anchor, ["install_root", "trust_owner_sid", "binding_sha256", "node_executable", "os_observer",
    ...(anchor && Object.hasOwn(anchor, "role") ? ["role"] : [])]);
  if (anchor.role) validateRolePin(anchor.role, anchor.trust_owner_sid);
  if (!path.isAbsolute(anchor.install_root) || !SID.test(anchor.trust_owner_sid) || !SHA.test(anchor.binding_sha256)) fail();
  for (const value of [anchor.node_executable, anchor.os_observer]) {
    exact(value, ["path", "sha256"]);
    if (!path.isAbsolute(value.path) || !SHA.test(value.sha256)) fail();
  }
  const marker = "const INSTALLATION_ANCHOR = " + "null; // INSTALLER_FIXED_ANCHOR";
  if (typeof source !== "string" || source.split(marker).length !== 2) fail();
  return source.replace(marker, `const INSTALLATION_ANCHOR = ${JSON.stringify(anchor)}; // INSTALLER_FIXED_ANCHOR`);
}
function validateRolePin(role, owner) {
  exact(role, ["name", "sid", ...(role && Object.hasOwn(role, "purpose") ? ["purpose"] : [])]);
  if (!["controller", "sender", "worker", "reviewer"].includes(role.name) || !SID.test(role.sid) || role.sid === owner) fail();
  if (Object.hasOwn(role, "purpose") && (role.name !== "sender" || !["model.dispatch", "custody.deposit"].includes(role.purpose))) fail();
}
// Kept as non-executing compatibility helpers. Neither selects launch authority.
export function resolveConfigPath(argv, env) {
  const flag = argv.indexOf("--config");
  if (flag >= 0 && argv[flag + 1] && !argv[flag + 1].startsWith("--")) return argv[flag + 1];
  return env.SOULFORGE_SECURE_WORK_CONFIG || null;
}
export function readRuntime(configPath) {
  if (!configPath) return { code: "CONFIG_NOT_BOUND" };
  if (!existsSync(configPath)) return { code: "CONFIG_FILE_MISSING" };
  let config;
  try { config = JSON.parse(readFileSync(configPath, "utf8")); }
  catch { return { code: "CONFIG_FILE_INVALID" }; }
  if (config.schema !== "soulforge.secure_work.config.v0") return { code: "CONFIG_SCHEMA_MISMATCH" };
  const interpreter = config?.runtime?.python_executable;
  if (typeof interpreter !== "string" || !interpreter) return { code: "PYTHON_NOT_BOUND" };
  if (!path.isAbsolute(interpreter)) return { code: "PYTHON_PATH_NOT_ABSOLUTE" };
  if (!existsSync(interpreter)) return { code: "PYTHON_NOT_FOUND" };
  return { interpreter };
}
function inventory(root, omitted) {
  assertRuntimePath(root);
  const files = new Map(), directories = [];
  function visit(dir) {
    normal(dir, "directory");
    directories.push(dir);
    if (files.size + directories.length > 100000) fail();
    for (const name of readdirSync(dir).sort()) {
      // Credential/vault/work bytes must never enter runtime inventory.
      const target = path.join(dir, name);
      assertRuntimePath(target);
      if (omitted.some(p => same(p, target))) continue;
      const info = normal(target);
      if (info.isDirectory()) visit(target);
      else if (info.isFile()) {
        normal(target, "file");
        files.set(path.relative(root, target).split(path.sep).join("/"), target);
      } else fail();
    }
  }
  visit(root);
  return { files, directories };
}
export function verifyInstallation(anchor, { observe = null, launcherPath = fileURLToPath(import.meta.url),
  executablePath = process.execPath } = {}) {
  // anchor is supplied by installed code; the CLI never accepts it as input.
  anchor = structuredClone(anchor);
  exact(anchor, ["install_root", "trust_owner_sid", "binding_sha256", "node_executable", "os_observer",
    ...(anchor && Object.hasOwn(anchor, "role") ? ["role"] : [])]);
  if (Object.hasOwn(anchor, "role")) validateRolePin(anchor.role, anchor.trust_owner_sid);
  if (!SID.test(anchor.trust_owner_sid) || !SHA.test(anchor.binding_sha256)
    || !same(launcherPath, path.join(anchor.install_root, "guild_hall/secure_work/sfx.mjs"))
    || !same(executablePath, anchor.node_executable?.path)) fail();
  assertRuntimePath(anchor.install_root);
  assertRuntimePath(launcherPath);
  pin(anchor.node_executable);
  pin(anchor.os_observer, true);
  const query = observe || (paths => observeWindowsSecurity(paths, anchor.os_observer));
  const bindingPath = path.join(path.dirname(launcherPath), "custody_runtime_binding.json");
  const sender = assertProtectedPaths([launcherPath, bindingPath, executablePath, anchor.os_observer.path],
    anchor.trust_owner_sid, query);
  // The immutable launcher selects its OS role BEFORE reading any binding or
  // config contents. A worker token entering a controller launcher sees no
  // controller configuration, including its private data locations.
  if (anchor.role && sender !== anchor.role.sid) fail();
  const raw = bytes(bindingPath, 16777216);
  if (hash(raw) !== anchor.binding_sha256) fail();
  const binding = JSON.parse(raw);
  exact(binding, ["config_path", "config_sha256", "trust_owner_sid", "node_executable", "os_observer", "launch"]);
  if (binding.trust_owner_sid !== anchor.trust_owner_sid
    || JSON.stringify(binding.node_executable) !== JSON.stringify(anchor.node_executable)
    || JSON.stringify(binding.os_observer) !== JSON.stringify(anchor.os_observer)
    || !SHA.test(binding.config_sha256)) fail();
  assertProtectedPaths([binding.config_path], anchor.trust_owner_sid, query);
  const configBytes = bytes(binding.config_path, 32768);
  if (hash(configBytes) !== binding.config_sha256) fail();
  const config = JSON.parse(configBytes);
  if (config.schema !== "soulforge.secure_work.config.v0") fail();
  const launch = binding.launch;
  exact(launch, ["roots", "python_executable", "python_startup", "python_paths", "kit_root", "recipe_root"]);
  if (!Array.isArray(launch.roots) || launch.roots.length < 2 || launch.roots.length > 12
    || !Array.isArray(launch.python_paths) || launch.python_paths.length < 2 || launch.python_paths.length > 16
    || !same(config.runtime?.python_executable, launch.python_executable)
    || !same(config.kit_root, launch.kit_root) || !same(config.recipe_root, launch.recipe_root)
    || (config.adapters?.transport?.python_executable
      && !same(config.adapters.transport.python_executable, launch.python_executable))) fail();
  const forbidden = [config.pilot_root, config.status_path, config.permit_trust_signing_key_path,
    config.permit_trust_pubkey_path, config.adapters?.transport?.key_file, config.adapters?.custody?.token_file]
    .filter(p => p !== undefined && p !== null);
  if (forbidden.some(p => typeof p !== "string" || !path.isAbsolute(p))) fail();
  const expected = new Map(), protectedItems = [binding.config_path, bindingPath, launcherPath];
  const roots = [];
  for (const entry of launch.roots) {
    exact(entry, ["path", "files"]);
    assertRuntimePath(entry.path);
    normal(entry.path, "directory");
    if (roots.some(root => within(root, entry.path) || within(entry.path, root))
      || forbidden.some(p => within(entry.path, p) || within(p, entry.path))
      || !Array.isArray(entry.files) || entry.files.length < 1 || entry.files.length > 100000) fail();
    roots.push(entry.path);
    const actual = inventory(entry.path, [bindingPath, launcherPath]);
    if (actual.files.size !== entry.files.length) fail();
    protectedItems.push(...actual.directories, ...actual.files.values());
    const seen = new Set();
    for (const item of entry.files) {
      exact(item, ["relative_path", "sha256"]);
      if (typeof item.relative_path !== "string" || !SHA.test(item.sha256)
        || seen.has(item.relative_path) || !actual.files.has(item.relative_path)) fail();
      seen.add(item.relative_path);
      const target = actual.files.get(item.relative_path);
      expected.set(norm(target), item.sha256);
    }
  }
  if (!roots.some(root => same(root, anchor.install_root))
    || !roots.some(root => within(root, path.dirname(launch.python_executable)))
    || !roots.some(root => within(root, path.dirname(executablePath)))
    || !roots.some(root => within(root, launch.kit_root))
    || !roots.some(root => within(root, launch.recipe_root))) fail();
  // Require the interpreter directory (DLLs, pyvenv.cfg, startup files) and the
  // complete configured stdlib/site-package directories, not an import trace.
  for (const p of launch.python_paths) {
    if (typeof p !== "string" || p.length > 1024) fail();
    normal(p, "directory");
    if (!roots.some(root => within(root, p))) fail();
  }
  for (const p of [launch.python_executable, executablePath, launch.python_startup,
    path.join(anchor.install_root, "guild_hall/secure_work/src/soulforge_secure_work/launch_runtime.py"),
    path.join(anchor.install_root, "guild_hall/secure_work/src/soulforge_secure_work/cli.py"),
    path.join(launch.kit_root, "src/sf_sewe/models.py"),
    path.join(anchor.install_root, "ui-workspace/apps/dev-erp-mcp/src/ingress_client.mjs")]) {
    if (!expected.has(norm(p))) fail();
  }
  if (!launch.python_paths.some(p => same(p, path.join(anchor.install_root, "guild_hall/secure_work/src")))
    || !launch.python_paths.some(p => same(p, path.join(launch.kit_root, "src")))) fail();
  // Check custody BEFORE reading dependency bytes, including every directory.
  if (assertProtectedPaths(protectedItems, anchor.trust_owner_sid, query) !== sender) fail();
  for (const [p, sha] of expected) if (hash(bytes(p)) !== sha) fail();
  // Windows CPython's _pth startup fixes stdlib resolution BEFORE Python runs.
  // A venv pointing at an unlisted base installation is not a supported launch.
  if (path.basename(launch.python_startup).toLowerCase() !== "python._pth"
    || path.basename(launch.python_executable).toLowerCase() !== "python.exe"
    || !same(path.dirname(launch.python_startup), path.dirname(launch.python_executable))) fail();
  const startup = bytes(launch.python_startup, 32768).toString("utf8").split(/\r?\n/)
    .map(line => line.trim()).filter(line => line && !line.startsWith("#"));
  if (startup.length !== launch.python_paths.length || startup.some((line, i) =>
    /^import\b/.test(line) || !same(path.resolve(path.dirname(launch.python_startup), line), launch.python_paths[i]))) fail();
  if (readdirSync(path.dirname(launch.python_executable)).filter(name => /\._pth$/i.test(name)).length !== 1) fail();
  expected.set(norm(launcherPath), hash(bytes(launcherPath)));
  if (assertProtectedPaths([launcherPath, bindingPath, binding.config_path], anchor.trust_owner_sid, query) !== sender) fail();
  const checkFile = p => {
    if (!expected.has(norm(p)) || hash(bytes(p)) !== expected.get(norm(p))) fail();
  };
  return Object.freeze({ binding, config, expected, roots, launcherPath, checkFile, observeSecurity: query,
    installationRole: anchor.role ? Object.freeze({ ...anchor.role }) : null,
    recheck: () => verifyInstallation(anchor, { observe, launcherPath, executablePath }),
    environment: Object.freeze({ SYSTEMROOT: path.dirname(path.dirname(path.dirname(path.dirname(anchor.os_observer.path)))),
      WINDIR: path.dirname(path.dirname(path.dirname(path.dirname(anchor.os_observer.path)))) }) });
}
export function guardNodeImports(runtime) {
  return registerHooks({
    resolve(specifier, context, nextResolve) {
      if (isBuiltin(specifier)) return nextResolve(specifier, context);
      const result = nextResolve(specifier, context);
      if (!result.url.startsWith("file:")) fail();
      runtime.checkFile(fileURLToPath(result.url));
      return result;
    },
    load(url, context, nextLoad) {
      if (!url.startsWith("node:")) {
        if (!url.startsWith("file:")) fail();
        runtime.checkFile(fileURLToPath(url));
      }
      return nextLoad(url, context);
    },
  });
}
export function pythonInvocation(runtime, mode, argv = []) {
  if (!["cli", "worker", "sender", "custody_sender", "feedback_prepare", "feedback_verify"].includes(mode)
    || (mode.startsWith("feedback_") && argv.length !== 0) || argv.some(a => ["--config", "--actor", "--role", "--principal"].some(
    flag => a === flag || a.startsWith(`${flag}=`)))) fail();
  const launch = runtime.binding.launch;
  const packet = { mode, argv, config_path: runtime.binding.config_path, config_sha256: runtime.binding.config_sha256,
    kit_root: launch.kit_root, node: runtime.binding.node_executable.path, launcher: runtime.launcherPath,
    python_paths: launch.python_paths, files: Object.fromEntries(runtime.expected), environment: runtime.environment };
  if (!["cli", "feedback_prepare", "feedback_verify"].includes(mode)) {
    delete packet.config_path;
    delete packet.config_sha256;
  }
  const bootstrap = path.join(path.dirname(runtime.launcherPath), "src/soulforge_secure_work/launch_runtime.py");
  // sys is builtin. No PYTHONPATH, site, user site, cwd, .pth, startup script or
  // inherited environment participates in application import resolution.
  const code = `import sys; sys.path[:] = ${JSON.stringify(launch.python_paths)}; sys.dont_write_bytecode = True; exec(compile(open(${JSON.stringify(bootstrap)}, "rb").read(), ${JSON.stringify(bootstrap)}, "exec"), {"__name__": "__main__", "_LAUNCH_PACKET": sys.stdin.buffer.readline(16777217).decode("utf8")})`;
  // The whole closure does not fit Windows' command-line limit. This pipe is
  // created by verified Node code; caller stdin is appended only as worker data
  // after the one bounded installation packet line and cannot replace it.
  const inputPrefix = Buffer.from(`${JSON.stringify(packet)}\n`);
  if (inputPrefix.length > 16777216) fail();
  return { executable: launch.python_executable, args: ["-I", "-S", "-B", "-X", "utf8", "-c", code],
    inputPrefix,
    options: { env: { ...runtime.environment }, cwd: path.dirname(launch.python_executable), windowsHide: true } };
}
function readWorkerInput() {
  const buffer = Buffer.alloc(1048577);
  let size = 0;
  while (size < buffer.length) {
    const count = readSync(0, buffer, size, buffer.length - size, null);
    if (count === 0) return buffer.subarray(0, size);
    size += count;
  }
  fail();
}
async function executionAuthority(runtime) {
  const hooks = guardNodeImports(runtime);
  try {
    const { loadExecutionAuthority } = await import(pathToFileURL(path.join(path.dirname(runtime.launcherPath), "execution_authority.mjs")).href);
    return loadExecutionAuthority(runtime);
  } finally { hooks.deregister(); }
}
export async function executeVerified(runtime, argv, { spawn = spawnSync } = {}) {
  if (argv[0] === "--preflight" && argv.length === 1) return { ok: true, code: "SECURE_WORK_LAUNCH_VERIFIED" };
  const roles = await executionAuthority(runtime);
  if (["--g2-feedback-prepare", "--g2-feedback-publish"].includes(argv[0]) && argv.length === 1) {
    const mode = argv[0] === "--g2-feedback-prepare" ? "prepare" : "publish";
    roles.entry(mode === "prepare" ? "jobs.advance" : "model.dispatch");
    const hooks = guardNodeImports(runtime);
    try {
      runtime.recheck();
      const { executeFeedbackAdapter } = await import(pathToFileURL(path.join(path.dirname(runtime.launcherPath), "g2_feedback_publisher.mjs")).href);
      const result = await executeFeedbackAdapter(runtime, mode);
      runtime.recheck();
      return result;
    } finally { hooks.deregister(); }
  }
  if (argv.some(a => a.startsWith("--g2-feedback"))) fail();
  if (argv[0] === "--g2-custody-inspect" && argv.length === 1) {
    roles.entry("jobs.advance");
    const hooks = guardNodeImports(runtime);
    try {
      runtime.recheck();
      const { inspectG2Custody } = await import(pathToFileURL(path.join(path.dirname(runtime.launcherPath), "g2_linear_custody_cli.mjs")).href);
      const result = await inspectG2Custody(runtime);
      runtime.recheck();
      return result;
    } finally { hooks.deregister(); }
  }
  if (argv.some(a => a.startsWith("--g2-custody"))) fail();
  if (argv[0] === "--role-entry" && argv.length === 1) {
    const request = JSON.parse(readWorkerInput());
    exact(request, ["operation"]);
    return roles.entry(request.operation);
  }
  if (argv[0] === "--role-check" && argv.length === 1) {
    const request = JSON.parse(readWorkerInput());
    if (request.operation === "permit.identity") {
      exact(request, ["operation", "scope", "record"]);
      return roles.verifyPermitIdentity(request.scope, request.record);
    }
    exact(request, ["operation", "scope"]);
    return roles.authorize(request.operation, request.scope);
  }
  if (argv[0] === "--worker-preflight" && argv.length === 1) return roles.workerContract();
  if (argv[0] === "--channel-contract" && argv.length === 1) {
    const request = JSON.parse(readWorkerInput());
    exact(request, ["scope"]);
    return roles.channelContract(request.scope);
  }
  if (argv[0] === "--custody-channel-contract" && argv.length === 1) {
    const request = JSON.parse(readWorkerInput());
    exact(request, ["scope"]);
    return roles.custodyChannelContract(request.scope);
  }
  if (argv[0] === "--custody-operation" && argv.length === 1) {
    roles.requireRole("sender");
    roles.custodyChannelContract();
    const hooks = guardNodeImports(runtime);
    try {
      runtime.recheck();
      const { loadCustodyAuthority } = await import(pathToFileURL(path.join(path.dirname(runtime.launcherPath), "custody_authority.mjs")).href);
      const { launch, ...custodyBinding } = runtime.binding;
      const authority = loadCustodyAuthority(custodyBinding);
      const { custodyOperation } = await import(pathToFileURL(path.join(path.dirname(runtime.launcherPath), "custody_operation.mjs")).href);
      return await custodyOperation(authority, runtime);
    } finally { hooks.deregister(); }
  }
  const worker = argv[0] === "--worker" && argv.length === 1;
  const sender = argv[0] === "--sender" && argv.length === 1;
  const custodySender = argv[0] === "--custody-sender" && argv.length === 1;
  if (custodySender) {
    roles.requireRole("sender");
    roles.custodyChannelContract();
  } else if (worker || sender) {
    roles.requireRole(worker ? "worker" : "sender");
    roles.channelContract();
  } else {
    if (argv.some(a => a.startsWith("--preflight") || a.startsWith("--custody") || a.startsWith("--worker")
      || a.startsWith("--sender") || a.startsWith("--channel"))) fail();
    if (argv[0] === "permit") roles.entry(argv[1] === "approve" ? "release.issue" : "release.review");
    else roles.entry(argv[0] === "request" ? "jobs.submit" : argv[0] === "advance" ? "jobs.advance" : "jobs.get");
  }
  runtime.recheck();
  const command = pythonInvocation(runtime, custodySender ? "custody_sender" : worker ? "worker" : sender ? "sender" : "cli",
    worker || sender || custodySender ? [] : argv);
  const result = spawn(command.executable, command.args, { ...command.options,
    stdio: ["pipe", "inherit", "inherit"], input: command.inputPrefix, timeout: worker || sender || custodySender ? 150000 : undefined });
  if (result.error) fail();
  return { exitCode: result.status ?? 1 };
}
async function main() {
  try {
    // Node options/import hooks execute before JS; rejecting here is defense in
    // depth. The approved OS launcher must independently launch pinned Node with
    // a clean environment and fixed arguments. This JS cannot prove its parent.
    if (process.execArgv.length || process.env.NODE_OPTIONS || process.env.NODE_PATH
      || process.env.PYTHONPATH || process.env.PYTHONHOME || process.env.SOULFORGE_SECURE_WORK_CONFIG) fail();
    const runtime = verifyInstallation(INSTALLATION_ANCHOR);
    const result = await executeVerified(runtime, process.argv.slice(2));
    if (Object.hasOwn(result, "exitCode")) return result.exitCode;
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return 0;
  } catch {
    process.stdout.write('{"ok":false,"code":"SECURE_WORK_LAUNCH_HOLD"}\n');
    return 2;
  }
}
if (process.argv[1] && same(process.argv[1], fileURLToPath(import.meta.url))) {
  // Finish this builtin-only module's evaluation before verified authority
  // modules import its helpers back. Awaiting main at module scope deadlocks
  // that dynamic-import cycle; main still owns all validation and exit results.
  // An unsettled promise without live handles must not become exit 0.
  process.exitCode = 2;
  void main().then(code => { process.exitCode = code; });
}
