// M10-only authority verifier/loader. No grant writer, key generation, runtime
// activation or M06 worker-isolation claim belongs to this module.
import { createHash, createPublicKey, verify } from "node:crypto";
import { execFileSync } from "node:child_process";
import { openSync, readSync, fstatSync, closeSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
export const RUNTIME_FILES = Object.freeze([
  "custody_authority.mjs", "custody_bridge.mjs",
  "src/soulforge_secure_work/custody.py", "src/soulforge_secure_work/adapters.py",
  "../../ui-workspace/apps/dev-erp-mcp/src/ingress_client.mjs",
].map(path => resolve(ROOT, path)));
const MAX_JSON = 32768;
const MUTATE = 2 | 4 | 16 | 64 | 256 | 65536 | 262144 | 524288 | 0x40000000 | 0x10000000;
const SID = /^S-1-[0-9]+(?:-[0-9]+)+$/;
const SHA = /^[a-f0-9]{64}$/;
const SYSTEM = ["S-1-5-18", "S-1-5-32-544",
  "S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464"];
const EVERYONE = ["S-1-1-0", "S-1-5-11", "S-1-5-32-545"];
const DANGEROUS_PRIVILEGES = ["SeBackupPrivilege", "SeRestorePrivilege", "SeTakeOwnershipPrivilege",
  "SeDebugPrivilege", "SeTcbPrivilege", "SeImpersonatePrivilege", "SeCreateTokenPrivilege", "SeAssignPrimaryTokenPrivilege"];
const fail = () => { throw new Error("CUSTODY_AUTHORITY_HOLD"); };
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const canonical = value => value && typeof value === "object"
  ? Array.isArray(value) ? `[${value.map(canonical).join(",")}]`
    : `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`
  : JSON.stringify(value);
function exact(value, fields) {
  if (!value || Array.isArray(value) || typeof value !== "object"
    || canonical(Object.keys(value).sort()) !== canonical([...fields].sort())) fail();
}
function bytes(path, limit = MAX_JSON) {
  if (typeof path !== "string" || !isAbsolute(path)) fail();
  const fd = openSync(path, "r");
  try {
    const before = fstatSync(fd);
    if (!before.isFile() || before.size < 1 || before.size > limit) fail();
    const body = Buffer.alloc(before.size + 1);
    const count = readSync(fd, body, 0, body.length, 0);
    const after = fstatSync(fd);
    if (count !== before.size || before.size !== after.size || before.mtimeMs !== after.mtimeMs
      || before.ctimeMs !== after.ctimeMs || before.ino !== after.ino) fail();
    return body.subarray(0, count);
  } finally { closeSync(fd); }
}
const json = path => JSON.parse(bytes(path));
function chain(path) {
  if (typeof path !== "string" || !isAbsolute(path)) fail();
  const result = [resolve(path)];
  while (dirname(result.at(-1)) !== result.at(-1)) result.push(dirname(result.at(-1)));
  return result;
}

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
  if (process.platform !== "win32" || !Array.isArray(paths) || paths.length > 96) fail();
  exact(executablePin, ["path", "sha256"]);
  const executable = executablePin.path;
  if (!SHA.test(executablePin.sha256) || hash(bytes(executable, 16777216)) !== executablePin.sha256) fail();
  // Metadata only. No credential/source bytes, ACL mutations or logon tokens.
  const windowsRoot = dirname(dirname(dirname(dirname(executable))));
  const output = execFileSync(executable, ["-NoProfile", "-NonInteractive", "-EncodedCommand",
    Buffer.from(OBSERVER, "utf16le").toString("base64")], {
    input: JSON.stringify(paths), windowsHide: true, timeout: 10000, maxBuffer: 1048576,
    stdio: ["pipe", "pipe", "pipe"], env: { SYSTEMROOT: windowsRoot, WINDIR: windowsRoot },
  });
  return JSON.parse(output.toString("utf8").replace(/^\uFEFF/, ""));
}

export function loadCustodyAuthority(runtimeBinding, { observe = null, now = () => Date.now() } = {}) {
  // Only installation/launcher code supplies this argument. CLI callers cannot.
  if (!runtimeBinding || (observe !== null && typeof observe !== "function")) fail();
  exact(runtimeBinding, ["config_path", "config_sha256", "trust_owner_sid", "os_observer", "node_executable"]);
  const anchor = structuredClone(runtimeBinding);
  if (!SHA.test(anchor.config_sha256) || !SID.test(anchor.trust_owner_sid)) fail();
  exact(anchor.os_observer, ["path", "sha256"]);
  exact(anchor.node_executable, ["path", "sha256"]);
  if (resolve(anchor.node_executable.path) !== resolve(process.execPath)
    || !SHA.test(anchor.node_executable.sha256)
    || hash(bytes(process.execPath, 268435456)) !== anchor.node_executable.sha256) fail();
  const query = observe || (paths => observeWindowsSecurity(paths, anchor.os_observer));

  function protectedPaths(paths, { owner = anchor.trust_owner_sid, denyRead = false } = {}) {
    const full = [...new Set(paths.flatMap(chain))];
    const evidence = query(full);
    if (!SID.test(evidence?.sid) || evidence.sid === owner || evidence.elevated !== false
      || !Array.isArray(evidence.groups) || !evidence.groups.every(s => SID.test(s))
      || !Array.isArray(evidence.privileges) || evidence.privileges.some(p => typeof p !== "string" || DANGEROUS_PRIVILEGES.includes(p))
      || !Array.isArray(evidence.paths) || evidence.paths.length !== full.length) fail();
    const callers = new Set([evidence.sid, ...evidence.groups, ...EVERYONE]);
    // Conservative effective-access check: any applicable Allow rejects writes,
    // even if a Deny ACE may mask it. Privileged administrator tokens are denied.
    if (evidence.groups.includes("S-1-5-32-544") || SYSTEM.includes(evidence.sid)) fail();
    for (let i = 0; i < full.length; i++) {
      const item = evidence.paths[i];
      if (resolve(item.path) !== full[i] || item.reparse !== false || !SID.test(item.owner_sid)
        || ![owner, ...SYSTEM].includes(item.owner_sid) || !Array.isArray(item.allow)) fail();
      for (const ace of item.allow) {
        if (!SID.test(ace.sid) || !Number.isSafeInteger(ace.rights)) fail();
        if ((ace.rights & MUTATE) && (callers.has(ace.sid) || ![owner, ...SYSTEM].includes(ace.sid))) fail();
        if (denyRead && paths.includes(full[i]) && callers.has(ace.sid) && (ace.rights & (1 | 0x80000000 | 0x10000000))) fail();
      }
    }
    return evidence.sid;
  }

  function authorize(binding) {
    try {
      exact(binding, ["project_hint", "occurrence_id", "idempotency_key", "input_revision", "sha256", "size", "route_sha256"]);
      if (!SHA.test(binding.sha256) || !SHA.test(binding.route_sha256) || !Number.isSafeInteger(binding.size)
        || binding.size < 1 || binding.size > 1048576 || ["project_hint", "occurrence_id", "idempotency_key", "input_revision"].some(
          key => typeof binding[key] !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(binding[key]))) fail();
      const senderSid = protectedPaths([anchor.config_path, resolve(ROOT, "custody_runtime_binding.json"),
        ...RUNTIME_FILES, process.execPath, anchor.os_observer.path]);
      const configBytes = bytes(anchor.config_path);
      if (hash(configBytes) !== anchor.config_sha256) fail();
      const config = JSON.parse(configBytes);
      const pin = config.custody_authority;
      exact(pin, ["policy_path", "policy_sha256", "approval_root"]);
      if (!SHA.test(pin.policy_sha256) || config.adapters?.custody?.enabled !== true
        || config.adapters.custody.live_enabled !== true) fail();
      protectedPaths([pin.policy_path, pin.approval_root]);
      const policyBytes = bytes(pin.policy_path);
      if (hash(policyBytes) !== pin.policy_sha256) fail();
      const policy = JSON.parse(policyBytes);
      exact(policy, ["action", "epoch", "revoked", "expires_at", "approver_sid", "sender_sid",
        "issuer_key_id", "public_key_spki", "project_scopes", "route_sha256", "ingress_principal", "signing_key_path", "runtime_files"]);
      if (policy.action !== "custody.deposit" || policy.revoked !== false || !Number.isSafeInteger(policy.epoch)
        || policy.epoch < 1 || !Number.isSafeInteger(policy.expires_at) || now() >= policy.expires_at
        || policy.approver_sid !== anchor.trust_owner_sid || policy.sender_sid !== senderSid
        || !Array.isArray(policy.project_scopes) || !policy.project_scopes.includes(binding.project_hint)
        || policy.route_sha256 !== binding.route_sha256) fail();
      exact(policy.ingress_principal, ["account_id", "device_id", "agent_id"]);
      if (Object.values(policy.ingress_principal).some(v => typeof v !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(v))) fail();
      if (!Array.isArray(policy.runtime_files) || policy.runtime_files.length !== RUNTIME_FILES.length) fail();
      for (let i = 0; i < RUNTIME_FILES.length; i++) {
        const file = policy.runtime_files[i];
        exact(file, ["path", "sha256"]);
        if (resolve(file.path) !== RUNTIME_FILES[i] || hash(bytes(file.path, 1048576)) !== file.sha256) fail();
      }
      protectedPaths([policy.signing_key_path], { denyRead: true });
      const bindingHash = hash(canonical(binding));
      const approvalPath = resolve(pin.approval_root, `${bindingHash}.json`);
      protectedPaths([approvalPath]);
      const approval = json(approvalPath);
      exact(approval, ["binding_sha256", "policy_sha256", "policy_epoch", "issuer_key_id", "issued_at", "expires_at", "signature"]);
      const { signature, ...claims } = approval;
      if (claims.binding_sha256 !== bindingHash || claims.policy_sha256 !== pin.policy_sha256
        || claims.policy_epoch !== policy.epoch || claims.issuer_key_id !== policy.issuer_key_id
        || !Number.isSafeInteger(claims.issued_at) || !Number.isSafeInteger(claims.expires_at)
        || claims.issued_at > now() || now() >= claims.expires_at || claims.expires_at - claims.issued_at > 300000
        || claims.expires_at > policy.expires_at || typeof signature !== "string" || !/^[A-Za-z0-9+/]{86}==$/.test(signature)) fail();
      const der = Buffer.from(policy.public_key_spki, "base64");
      const key = createPublicKey({ key: der, format: "der", type: "spki" });
      if (key.asymmetricKeyType !== "ed25519" || policy.issuer_key_id !== `trust.${hash(der.subarray(-32)).slice(0, 32)}`
        || !verify(null, Buffer.from(canonical(claims)), key, Buffer.from(signature, "base64"))) fail();
      // Re-observe after reading: changed process identity/trust ACLs cannot be
      // hidden behind an earlier successful inspection.
      if (protectedPaths([anchor.config_path, pin.policy_path, approvalPath]) !== senderSid) fail();
      return { binding_sha256: bindingHash, principal: policy.ingress_principal,
        expires_at: Math.min(claims.expires_at, policy.expires_at) / 1000 };
    } catch { fail(); }
  }
  return Object.freeze({
    authorize,
    authorizeRequest(request) {
      try { return canonical(authorize(request.binding).principal) === canonical(request.principal); }
      catch { return false; }
    },
    token(binding) {
      try {
        authorize(binding);
        const configBytes = bytes(anchor.config_path);
        if (hash(configBytes) !== anchor.config_sha256) fail();
        const path = JSON.parse(configBytes).adapters.custody.token_file;
        protectedPaths([path]);
        const value = bytes(path, 4096).toString("utf8");
        if (!/^sfig_v1_[A-Za-z0-9_-]{43}\r?\n?$/.test(value)) fail();
        return value.trim();
      } catch { fail(); }
    },
  });
}
