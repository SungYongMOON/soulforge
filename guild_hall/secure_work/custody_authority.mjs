// M10-only authority verifier/loader. No grant writer, key generation, runtime
// activation or M06 worker-isolation claim belongs to this module.
import { createHash, createPublicKey, verify } from "node:crypto";
import { openSync, readSync, fstatSync, closeSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { observeWindowsSecurity, assertProtectedPaths } from "./sfx.mjs";
export { observeWindowsSecurity } from "./sfx.mjs";

const ROOT = dirname(fileURLToPath(import.meta.url));
export const RUNTIME_FILES = Object.freeze([
  "custody_authority.mjs", "custody_bridge.mjs",
  "custody_operation.mjs", "src/soulforge_secure_work/custody_ipc.py",
  "src/soulforge_secure_work/custody.py", "src/soulforge_secure_work/adapters.py",
  "../../ui-workspace/apps/dev-erp-mcp/src/ingress_client.mjs",
].map(path => resolve(ROOT, path)));
const MAX_JSON = 32768;
const SID = /^S-1-[0-9]+(?:-[0-9]+)+$/;
const SHA = /^[a-f0-9]{64}$/;
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
  let credentialHash = null;

  function protectedPaths(paths, { owner = anchor.trust_owner_sid, denyRead = false } = {}) {
    return assertProtectedPaths(paths, owner, query, { denyRead });
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
      if (config.execution_purpose === "custody.deposit") {
        // Exact credential bytes are installation-bound only at this custody
        // sender. A changed file is rejected before each ingress boundary and
        // before an authorization proof can permit the controller's ACK write.
        const tokenPath = config.adapters.custody.token_file;
        if (!SHA.test(config.adapters.custody.token_sha256)) fail();
        protectedPaths([tokenPath]);
        if (hash(bytes(tokenPath, 4096)) !== config.adapters.custody.token_sha256) fail();
      }
      return { binding_sha256: bindingHash, principal: policy.ingress_principal,
        expires_at: Math.min(claims.expires_at, policy.expires_at) / 1000 };
    } catch { fail(); }
  }
  return Object.freeze({
    authorize,
    authorizeRequest(request) {
      try {
        const samePrincipal = canonical(authorize(request.binding).principal) === canonical(request.principal);
        if (credentialHash !== null) {
          const config = JSON.parse(bytes(anchor.config_path));
          protectedPaths([config.adapters.custody.token_file]);
          if (hash(bytes(config.adapters.custody.token_file, 4096)) !== credentialHash) fail();
        }
        return samePrincipal;
      }
      catch { return false; }
    },
    token(binding) {
      try {
        authorize(binding);
        const configBytes = bytes(anchor.config_path);
        if (hash(configBytes) !== anchor.config_sha256) fail();
        const config = JSON.parse(configBytes);
        const path = config.adapters.custody.token_file;
        protectedPaths([path]);
        const raw = bytes(path, 4096);
        if (config.execution_purpose === "custody.deposit" && hash(raw) !== config.adapters.custody.token_sha256) fail();
        const value = raw.toString("utf8");
        if (!/^sfig_v1_[A-Za-z0-9_-]{43}\r?\n?$/.test(value)) fail();
        credentialHash = hash(raw);
        return value.trim();
      } catch { fail(); }
    },
  });
}
