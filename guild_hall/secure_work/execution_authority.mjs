// Consumer of installation-bound identity/assignment authority. No policy,
// account, key, task, permission or approval writer belongs to this module.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { openSync, readSync, fstatSync, closeSync } from "node:fs";
import path from "node:path";
import { assertProtectedPaths } from "./sfx.mjs";

const SHA = /^[a-f0-9]{64}$/, SID = /^S-1-[0-9]+(?:-[0-9]+)+$/;
const REF = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const SYSTEM = ["S-1-5-18", "S-1-5-32-544",
  "S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464"];
const PURPOSE = { controller: "SOURCE", sender: "G3_PROVIDER", worker: "G3_PROVIDER", reviewer: "KEY_SERVICE" };
const OPERATIONS = { "jobs.submit": "controller", "jobs.advance": "controller", "jobs.get": "controller",
  "release.issue": "reviewer", "release.review": "reviewer", "model.dispatch": "sender" };
const fail = () => { throw new Error("SECURE_WORK_ROLE_HOLD"); };
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const same = (a, b) => typeof a === "string" && typeof b === "string"
  && (process.platform === "win32" ? path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase() : path.resolve(a) === path.resolve(b));
function exact(value, fields) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...fields].sort())) fail();
}
function bytes(filename, maximum = 32768) {
  if (typeof filename !== "string" || !path.isAbsolute(filename)) fail();
  const fd = openSync(filename, "r");
  try {
    const before = fstatSync(fd);
    if (!before.isFile() || before.size < 1 || before.size > maximum || before.nlink !== 1) fail();
    const value = Buffer.alloc(before.size + 1);
    const size = readSync(fd, value, 0, value.length, 0), after = fstatSync(fd);
    if (size !== before.size || after.nlink !== 1 || after.size !== before.size
      || after.ctimeMs !== before.ctimeMs || after.mtimeMs !== before.mtimeMs) fail();
    return value.subarray(0, size);
  } finally { closeSync(fd); }
}

// Schedule.Service readback follows the existing registered-task inspection
// pattern. XML and DACL are read, never RegisterTask/Run/Start or credentials.
const TASK_OBSERVER = String.raw`
$ErrorActionPreference = 'Stop'
$taskPath = [Console]::In.ReadToEnd()
$service = New-Object -ComObject Schedule.Service
$service.Connect()
$task = $service.GetFolder('\').GetTask($taskPath)
$definition = $task.Definition
$principal = $definition.Principal
$sid = (New-Object System.Security.Principal.NTAccount($principal.UserId)).Translate([System.Security.Principal.SecurityIdentifier]).Value
$sddl = $task.GetSecurityDescriptor(7)
$descriptor = New-Object System.Security.AccessControl.RawSecurityDescriptor($sddl)
$allows = @()
foreach ($ace in $descriptor.DiscretionaryAcl) {
 if ($ace.AceQualifier -eq [System.Security.AccessControl.AceQualifier]::AccessAllowed) {
  $allows += @{sid=$ace.SecurityIdentifier.Value;rights=[long]$ace.AccessMask}
 }
}
$actions = @()
foreach ($action in $definition.Actions) {
 $actions += @{type=[int]$action.Type;execute=[string]$action.Path;arguments=[string]$action.Arguments;cwd=[string]$action.WorkingDirectory}
}
$utf8 = New-Object Text.UTF8Encoding($false)
$sha = [Security.Cryptography.SHA256]::Create()
$digest = ([BitConverter]::ToString($sha.ComputeHash($utf8.GetBytes($task.Xml)))).Replace('-','').ToLowerInvariant()
@{task_path=[string]$task.Path;enabled=[bool]$task.Enabled;xml_sha256=$digest;principal_sid=$sid;
 logon_type=[int]$principal.LogonType;run_level=[int]$principal.RunLevel;actions=@($actions);
 owner_sid=$descriptor.Owner.Value;allow=@($allows)} | ConvertTo-Json -Depth 6 -Compress
`;

export function observeRegisteredWorkerTask(taskPath, runtime) {
  if (process.platform !== "win32" || typeof taskPath !== "string" || !/^\\[A-Za-z0-9_. -]+$/.test(taskPath)) fail();
  runtime.recheck();
  const output = execFileSync(runtime.binding.os_observer.path, ["-NoProfile", "-NonInteractive", "-EncodedCommand",
    Buffer.from(TASK_OBSERVER, "utf16le").toString("base64")], {
    input: taskPath, env: { ...runtime.environment }, windowsHide: true, timeout: 10000,
    maxBuffer: 32768, stdio: ["pipe", "pipe", "pipe"],
  });
  return JSON.parse(output.toString("utf8").replace(/^\uFEFF/, ""));
}

export function loadExecutionAuthority(runtime, { now = () => Date.now(), inspectTask = null } = {}) {
  const anchor = runtime.binding, pin = runtime.config.execution_authority;
  exact(pin, ["policy_path", "policy_sha256"]);
  if (!SHA.test(pin.policy_sha256) || typeof runtime.observeSecurity !== "function") fail();
  const protect = paths => assertProtectedPaths(paths, anchor.trust_owner_sid, runtime.observeSecurity);
  function current() {
    runtime.recheck();
    const sid = protect([pin.policy_path]);
    const raw = bytes(pin.policy_path);
    if (hash(raw) !== pin.policy_sha256) fail();
    const policy = JSON.parse(raw);
    exact(policy, ["epoch", "expires_at", "revoked", "roles", "context", "issuer_key_id", "public_key_sha256", "worker_registration",
      ...(Object.hasOwn(policy, "ipc") ? ["ipc", "sender_registration"] : [])]);
    if (!Number.isSafeInteger(policy.epoch) || policy.epoch < 1 || policy.revoked !== false
      || !Number.isSafeInteger(policy.expires_at) || now() >= policy.expires_at
      || !REF.test(policy.issuer_key_id) || !SHA.test(policy.public_key_sha256)) fail();
    exact(policy.roles, Object.keys(PURPOSE));
    const seenSid = new Set([anchor.trust_owner_sid]), seenRef = new Set();
    for (const [name, role] of Object.entries(policy.roles)) {
      exact(role, ["sid", "principal_ref", "purpose", "capabilities"]);
      if (!SID.test(role.sid) || SYSTEM.includes(role.sid) || seenSid.has(role.sid)
        || !REF.test(role.principal_ref) || seenRef.has(role.principal_ref) || role.purpose !== PURPOSE[name]
        || !Array.isArray(role.capabilities) || role.capabilities.some(value => !REF.test(value))) fail();
      seenSid.add(role.sid); seenRef.add(role.principal_ref);
    }
    const roleName = Object.keys(policy.roles).find(name => policy.roles[name].sid === sid);
    if (!roleName) fail();
    const context = policy.context;
    exact(context, ["project_ref", "assignment_ref", "assignment_epoch", "task_ref", "route_sha256", "audience"]);
    if (![context.project_ref, context.assignment_ref, context.task_ref, context.audience].every(value => REF.test(value))
      || !SHA.test(context.route_sha256) || !Number.isSafeInteger(context.assignment_epoch) || context.assignment_epoch < 1) fail();
    // Peer configs contain no key locations or bytes, even public-key bytes.
    // M05 verification stays with the controller that owns the M07 journal.
    if (!["sender", "worker"].includes(roleName)) {
      const keyPath = runtime.config.permit_trust_pubkey_path;
      protect([keyPath]);
      if (hash(bytes(keyPath, 1024)) !== policy.public_key_sha256) fail();
      if (protect([pin.policy_path, keyPath]) !== sid) fail();
    }
    if (now() >= policy.expires_at) fail();
    return { policy, roleName, sid };
  }
  function scopeMatches(scope, policy) {
    exact(scope, ["project_ref", "assignment_ref", "assignment_epoch", "task_ref", "policy_epoch", "route_sha256", "audience"]);
    if (scope.policy_epoch !== policy.epoch || Object.entries(policy.context).some(([key, value]) => scope[key] !== value)) fail();
  }
  function proof(value) {
    const { policy, roleName } = value;
    return { ...policy.context, policy_epoch: policy.epoch, principal_ref: policy.roles[roleName].principal_ref,
      purpose: policy.roles[roleName].purpose, issuer_key_id: policy.issuer_key_id, expires_at: policy.expires_at };
  }
  function signingBoundary(value) {
    const signingPath = runtime.config.permit_trust_signing_key_path;
    protect([signingPath]);
    const evidence = runtime.observeSecurity([signingPath]);
    if (evidence.sid !== value.sid || evidence.paths?.length !== 1) fail();
    const key = evidence.paths[0];
    if (!same(key.path, signingPath) || key.reparse !== false || !Array.isArray(key.allow)) fail();
    for (const ace of key.allow) {
      // No sender/controller/worker, broad group, or unknown account may read
      // the release signing key. No private key bytes are read by this gate.
      if ((ace.rights & (1 | 0x80000000 | 0x10000000))
        && ![anchor.trust_owner_sid, value.policy.roles.reviewer.sid, ...SYSTEM].includes(ace.sid)) fail();
    }
  }
  function requireRole(name) {
    const value = current();
    if (value.roleName !== name) fail();
    return proof(value);
  }
  function authorize(operation, scope = null) {
    const value = current(), expectedRole = OPERATIONS[operation];
    if (!expectedRole || value.roleName !== expectedRole
      || !value.policy.roles[expectedRole].capabilities.includes(operation)) fail();
    if (scope !== null || !["jobs.submit", "jobs.get", "jobs.advance"].includes(operation)) scopeMatches(scope, value.policy);
    if (expectedRole === "reviewer") signingBoundary(value);
    return proof(value);
  }
  function channelContract(scope = null) {
    const value = current(), { policy, roleName } = value;
    if (!["controller", "sender", "worker"].includes(roleName)) fail();
    exact(runtime.installationRole, ["name", "sid"]);
    if (runtime.installationRole.name !== roleName || runtime.installationRole.sid !== value.sid) fail();
    if (scope !== null) scopeMatches(scope, policy);
    if (roleName === "controller") authorize("jobs.advance", { ...policy.context, policy_epoch: policy.epoch });
    if (roleName === "sender") authorize("model.dispatch", { ...policy.context, policy_epoch: policy.epoch });
    exact(policy.ipc, ["sender_pipe", "worker_pipe"]);
    if (!Object.values(policy.ipc).every(p => typeof p === "string" && /^soulforge-secure-[a-z0-9-]{16,80}$/.test(p))
      || policy.ipc.sender_pipe === policy.ipc.worker_pipe) fail();
    if (roleName !== "controller") {
      // Each peer has its OWN immutable installation/config. A worker never
      // reads a controller config to discover which private paths to avoid.
      exact(runtime.config, ["schema", "execution_role", "runtime", "kit_root", "recipe_root", "execution_authority"]);
      if (runtime.config.execution_role !== roleName) fail();
      exact(runtime.config.runtime, ["python_executable"]);
    }
    // Pin only self/downstream launchers. A worker pinning its upstream sender
    // would create mutually recursive binding/launcher hashes that no real
    // installer could seal. Kernel identity authenticates the upstream peer.
    if (roleName !== "worker") registeredContract("sender", value, true);
    registeredContract("worker", value, true);
    if (current().sid !== value.sid) fail();
    return { role: roleName, scope: { ...policy.context, policy_epoch: policy.epoch },
      sids: Object.fromEntries(["controller", "sender", "worker"].map(role => [role, policy.roles[role].sid])),
      ...policy.ipc, expires_at: policy.expires_at };
  }
  function registeredContract(role, value, requireChannel = false) {
    const expected = value.policy[role + "_registration"];
    const extended = expected && Object.hasOwn(expected, "launcher_path");
    exact(expected, ["task_path", "xml_sha256", ...(extended ? ["launcher_path", "node_path", "working_directory"] : [])]);
    if (requireChannel && !extended) fail();
    if (!/^\\[A-Za-z0-9_. -]+$/.test(expected.task_path) || !SHA.test(expected.xml_sha256)) fail();
    const launcher = extended ? expected.launcher_path : runtime.launcherPath;
    const node = extended ? expected.node_path : anchor.node_executable.path;
    const cwd = extended ? expected.working_directory : path.dirname(node);
    if (![launcher, node, cwd].every(p => typeof p === "string" && path.isAbsolute(p)) || launcher.includes('"')) fail();
    if (extended) {
      // Other role launchers are public code pins in the closed generation,
      // never their role config/binding or controller private-data paths.
      runtime.checkFile(launcher); runtime.checkFile(node);
    }
    const task = (inspectTask || (p => observeRegisteredWorkerTask(p, runtime)))(expected.task_path);
    if (task?.task_path !== expected.task_path || task.enabled !== true || task.xml_sha256 !== expected.xml_sha256
      || task.principal_sid !== value.policy.roles[role].sid || task.run_level !== 0
      || ![1, 2].includes(task.logon_type) || !Array.isArray(task.actions) || task.actions.length !== 1
      || ![anchor.trust_owner_sid, ...SYSTEM].includes(task.owner_sid) || !Array.isArray(task.allow)) fail();
    const action = task.actions[0];
    if (action.type !== 0 || !same(action.execute, node) || action.arguments !== `"${launcher}" --${role}`
      || !same(action.cwd, cwd) || !same(cwd, path.dirname(node))) fail();
    for (const ace of task.allow) {
      if (!SID.test(ace.sid) || !Number.isSafeInteger(ace.rights)) fail();
      if ((ace.rights & (2 | 4 | 16 | 64 | 256 | 65536 | 262144 | 524288 | 0x40000000 | 0x10000000))
        && ![anchor.trust_owner_sid, ...SYSTEM].includes(ace.sid)) fail();
    }
    return true;
  }
  return Object.freeze({
    requireRole,
    authorize,
    channelContract,
    entry(operation) {
      const value = current();
      return authorize(operation, { ...value.policy.context, policy_epoch: value.policy.epoch });
    },
    verifyPermitIdentity(scope, record) {
      const value = current();
      if (value.roleName === "worker") fail();
      scopeMatches(scope, value.policy);
      if (record?.actor_ref !== value.policy.roles.reviewer.principal_ref
        || record?.issuer_key_id !== value.policy.issuer_key_id
        || record?.permit?.key_id !== value.policy.issuer_key_id) fail();
      return proof(value);
    },
    workerContract() {
      const value = current();
      registeredContract("worker", value);
      if (current().sid !== value.sid) fail();
      if (value.policy.ipc) {
        channelContract();
        return { registration_checked: true, execution_enabled: false,
          code: "WORKER_CHANNEL_BOUND_INACTIVE", role: "worker", purpose: PURPOSE.worker };
      }
      return { registration_checked: true, execution_enabled: false,
        code: "WORKER_BYTE_CHANNEL_UNBOUND", role: "worker", purpose: PURPOSE.worker };
    },
  });
}
