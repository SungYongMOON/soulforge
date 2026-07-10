import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import {
  existsSync as nodeExistsSync,
  promises as fsPromises,
  readFileSync as nodeReadFileSync,
  realpathSync as nodeRealpathSync,
  statSync as nodeStatSync,
} from "node:fs";
import { posix, win32 } from "node:path";
import { fileURLToPath } from "node:url";

export const CODEX_WORKSPACE_REGISTRY_SCHEMA = "dev_erp.codex_workspace_registry.v1";
const PUBLIC_SCHEMA = "dev_erp.codex_workspace_registry.public.v1";
const DEFAULT_PROBE_TIMEOUT_MS = 2000;
const MAX_PROBE_TIMEOUT_MS = 10_000;
const ROOT_ISOLATION_OUTPUT_MAX = 8192;
const REGISTRY_FIELDS = new Set(["schema", "machine_id", "trust_domain_id", "workspaces"]);
const WORKSPACE_FIELDS = new Set([
  "workspace_id", "label", "root_kind", "root", "default_access", "enabled",
  "allowed_project_ids", "allowed_account_ids", "allowed_roles", "allowed_write_prefixes",
]);
const GRANT_FIELDS = new Set([
  "grant_id", "workspace_id", "workspace_revision", "workspace_root_fingerprint", "project_id", "item_id", "relative_prefix",
  "approved_by", "approved_at", "expires_at", "revoked", "revoked_at",
]);
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const CONTROL_RE = /[\x00-\x1f]/;
const PROTECTED_SEGMENT_RE = /^(?:\.git|\.codex|\.ssh|\.gnupg|\.aws|\.azure|\.kube|\.env(?:\..*)?|_workmeta|private-state|secret|secrets|credential|credentials|token|tokens|password|passwords|cookie|cookies)$/i;
const RUNTIME_DB_RE = /^dev-erp\.db(?:-(?:wal|shm))?$/i;
const PRIVATE_KEY_RE = /^(?:server|private|ca)\.key$/i;
const WINDOWS_DEVICE_NAME_RE = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
const HOST_PATH_IN_TEXT_RE = /(?:[A-Za-z]:[\\/]|\\\\[^\\/\s]+[\\/][^\\/\s]+(?:[\\/]|$)|\/(?:home|users|tmp|var|etc|opt|srv|mnt|soulforge)(?:\/|$))/i;
const ROOT_ISOLATION_CHILD_PATH = fileURLToPath(new URL("./codex_workspace_root_isolation_child.cjs", import.meta.url));

const DEFAULT_SYNC_FS = Object.freeze({
  existsSync: nodeExistsSync,
  realpathSync: nodeRealpathSync,
  statSync: nodeStatSync,
});

export class WorkspaceRegistryError extends Error {
  constructor(code) {
    super(`workspace_registry:${code}`);
    this.name = "WorkspaceRegistryError";
    this.code = code;
  }
}

function fail(code) {
  throw new WorkspaceRegistryError(code);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertKnownFields(value, allowed, code) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(code);
  }
}

function cleanText(value, { max = 120, code = "invalid_text" } = {}) {
  if (typeof value !== "string") fail(code);
  const text = value.trim();
  if (value !== text || !text || text.length > max || CONTROL_RE.test(text)) fail(code);
  return text;
}

function cleanIdArray(value, { field, required = false } = {}) {
  const invalidCode = `workspace_${field}_invalid`;
  const duplicateCode = `workspace_${field}_duplicate`;
  if (value === undefined) {
    if (required) fail(invalidCode);
    return null;
  }
  if (!Array.isArray(value) || value.length < 1 || value.length > 256) fail(invalidCode);
  const output = [];
  const seen = new Set();
  for (const entry of value) {
    const id = cleanText(entry, { max: 64, code: invalidCode });
    if (!ID_RE.test(id)) fail(invalidCode);
    const key = id.toLowerCase();
    if (seen.has(key)) fail(duplicateCode);
    seen.add(key);
    output.push(id);
  }
  return Object.freeze(output);
}

function hash(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function statIdentity(stat) {
  const scalar = (value) => typeof value === "bigint"
    ? value.toString(10)
    : (Number.isSafeInteger(value) ? String(value) : null);
  const dev = scalar(stat?.dev);
  const ino = scalar(stat?.ino);
  if (dev === null || ino === null || (dev === "0" && ino === "0")) return null;
  return `${dev}:${ino}`;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function stripTrailingSeparators(value, pathApi) {
  const root = pathApi.parse(value).root;
  let output = value;
  while (output.length > root.length && (output.endsWith("\\") || output.endsWith("/"))) {
    output = output.slice(0, -1);
  }
  return output;
}

function stripWindowsDevicePrefix(value) {
  let output = String(value).replaceAll("/", "\\");
  const lower = output.toLowerCase();
  if (lower.startsWith("\\\\?\\unc\\")) output = `\\\\${output.slice(8)}`;
  else if (lower.startsWith("\\\\?\\")) output = output.slice(4);
  return output;
}

function comparablePath(value, style) {
  if (style === "windows") {
    return stripTrailingSeparators(win32.normalize(stripWindowsDevicePrefix(value)), win32).toLowerCase();
  }
  return stripTrailingSeparators(posix.normalize(String(value)), posix);
}

function detectedPathStyle(value) {
  const raw = String(value);
  if (/^(?:[A-Za-z]:[\\/]|\\\\)/.test(raw)) return "windows";
  if (posix.isAbsolute(raw)) return "posix";
  return null;
}

function isInside(root, target, style) {
  const base = comparablePath(root, style);
  const candidate = comparablePath(target, style);
  const separator = style === "windows" ? "\\" : "/";
  return candidate === base || candidate.startsWith(`${base}${separator}`);
}

function isWindowsDevicePath(value) {
  const normalized = String(value).replaceAll("/", "\\").toLowerCase();
  return normalized.startsWith("\\\\?\\")
    || normalized.startsWith("\\\\.\\")
    || normalized.startsWith("\\??\\")
    || normalized.includes("\\globalroot\\");
}

function pathSegments(value, style) {
  const normalized = style === "windows"
    ? stripWindowsDevicePrefix(value).replaceAll("/", "\\")
    : String(value);
  return normalized.split(style === "windows" ? "\\" : "/").filter(Boolean);
}

function isProtectedPath(value, style) {
  const segments = pathSegments(value, style);
  if (segments.some((segment) => PROTECTED_SEGMENT_RE.test(segment)
      || RUNTIME_DB_RE.test(segment)
      || PRIVATE_KEY_RE.test(segment)
      || WINDOWS_DEVICE_NAME_RE.test(segment)
      || /[. ]$/.test(segment)
      || (!/^[A-Za-z]:$/.test(segment) && /[<>:"|?*]/.test(segment)))) return true;
  const normalized = segments.join("/").toLowerCase();
  return normalized.includes("ui-workspace/apps/dev-erp/data")
    || normalized.includes("_workspaces/system/dev-erp")
    || normalized.includes("guild_hall/state/gateway/mailbox/state")
    || normalized.includes("guild_hall/state")
    || /(?:^|\/)data\/tls(?:\/|$)/.test(normalized)
    || /(?:^|\/)logs\/service(?:\/|$)/.test(normalized);
}

function normalizeWorkspaceRoot(rootValue, rootKind) {
  const raw = cleanText(rootValue, { max: 2048, code: "workspace_root_invalid" });
  if (isWindowsDevicePath(raw)) fail("workspace_device_path_forbidden");
  const rawSegments = raw.replaceAll("\\", "/").split("/").filter(Boolean);
  if (rawSegments.some((segment) => segment === "." || segment === "..")) fail("workspace_root_invalid");

  let normalized;
  let style;
  if (rootKind === "unc") {
    const windowsRaw = raw.replaceAll("/", "\\");
    if (!windowsRaw.startsWith("\\\\") || !win32.isAbsolute(windowsRaw)) fail("workspace_root_invalid");
    normalized = stripTrailingSeparators(win32.normalize(windowsRaw), win32);
    const parts = normalized.slice(2).split("\\").filter(Boolean);
    if (parts.length < 3) fail("workspace_filesystem_root_forbidden");
    if (parts[1].endsWith("$")) fail("workspace_protected_path_forbidden");
    style = "windows";
  } else if (rootKind === "local") {
    if (/^(?:\\\\|\/\/)/.test(raw)) fail("workspace_root_invalid");
    if (/^[A-Za-z]:[\\/]/.test(raw)) {
      normalized = stripTrailingSeparators(win32.normalize(raw), win32);
      style = "windows";
    } else if (posix.isAbsolute(raw)) {
      normalized = stripTrailingSeparators(posix.normalize(raw), posix);
      style = "posix";
    } else {
      fail("workspace_root_invalid");
    }
  } else {
    fail("workspace_root_kind_invalid");
  }

  const pathApi = style === "windows" ? win32 : posix;
  if (comparablePath(normalized, style) === comparablePath(pathApi.parse(normalized).root, style)) {
    fail("workspace_filesystem_root_forbidden");
  }
  const comparable = comparablePath(normalized, style);
  if (style === "windows"
      && /^(?:[a-z]:\\(?:users\\[^\\]+|soulforge(?:-runtime)?(?:\\_workspaces(?:\\system)?)?|windows|program files(?: \(x86\))?|programdata)|\\\\[^\\]+\\[^\\]+)$/i.test(comparable)) {
    fail("workspace_root_too_broad");
  }
  if (style === "posix" && /^(?:\/home\/[^/]+|\/users\/[^/]+|\/soulforge(?:-runtime)?(?:\/_workspaces(?:\/system)?)?)$/i.test(comparable)) {
    fail("workspace_root_too_broad");
  }
  if (isProtectedPath(normalized, style)) fail("workspace_protected_path_forbidden");
  return { root: normalized, style };
}

function uncNamespace(root) {
  const normalized = stripWindowsDevicePrefix(root);
  const parts = normalized.slice(2).split("\\").filter(Boolean);
  return parts.length >= 2 ? `\\\\${parts[0]}\\${parts[1]}`.toLowerCase() : null;
}

function normalizeRelativePath(value, { allowEmpty = true } = {}) {
  if (typeof value !== "string") return { error: "invalid_relative_path" };
  const raw = value.trim();
  if (value !== raw) return { error: "invalid_relative_path" };
  if (!raw) return allowEmpty ? { ok: true, path: "", segments: [] } : { error: "invalid_relative_path" };
  if (CONTROL_RE.test(raw)
      || posix.isAbsolute(raw)
      || win32.isAbsolute(raw)
      || /^[A-Za-z]:/.test(raw)
      || /^(?:\\\\|\/\/)/.test(raw)) return { error: "invalid_relative_path" };
  const normalized = raw.replaceAll("\\", "/");
  const segments = normalized.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === ".." || segment.includes(":"))) {
    return { error: "invalid_relative_path" };
  }
  if (isProtectedPath(segments.join("/"), "posix")) return { error: "protected_relative_path" };
  return { ok: true, path: segments.join("/"), segments };
}

function normalizeAllowedWritePrefixes(value, style) {
  if (value === undefined) return Object.freeze([]);
  if (!Array.isArray(value) || value.length > 16) fail("workspace_write_prefixes_invalid");
  const prefixes = [];
  const seen = new Set();
  for (const entry of value) {
    const normalized = normalizeRelativePath(entry, { allowEmpty: false });
    if (!normalized.ok) fail("workspace_write_prefix_invalid");
    const key = style === "windows" ? normalized.path.toLowerCase() : normalized.path;
    if (seen.has(key)) fail("workspace_write_prefix_duplicate");
    for (const existing of seen) {
      if (key.startsWith(`${existing}/`) || existing.startsWith(`${key}/`)) {
        fail("workspace_write_prefix_overlap");
      }
    }
    seen.add(key);
    prefixes.push(normalized.path);
  }
  return Object.freeze(prefixes.sort((left, right) => left.localeCompare(right)));
}

function normalizeWorkspaceRow(value, machineId, trustDomainId) {
  if (!isRecord(value)) fail("workspace_invalid");
  assertKnownFields(value, WORKSPACE_FIELDS, "workspace_unknown_field");
  const workspaceId = cleanText(value.workspace_id, { max: 64, code: "workspace_id_invalid" });
  if (!ID_RE.test(workspaceId)) fail("workspace_id_invalid");
  const label = cleanText(value.label, { max: 120, code: "workspace_label_invalid" });
  if (HOST_PATH_IN_TEXT_RE.test(label)) fail("workspace_label_path_forbidden");
  const rootKind = cleanText(value.root_kind, { max: 16, code: "workspace_root_kind_invalid" });
  if (!new Set(["local", "unc"]).has(rootKind)) fail("workspace_root_kind_invalid");
  if (value.default_access !== undefined && value.default_access !== "read-only") {
    fail("workspace_default_access_invalid");
  }
  if (value.enabled !== undefined && typeof value.enabled !== "boolean") fail("workspace_enabled_invalid");
  const allowedProjectIds = cleanIdArray(value.allowed_project_ids, { field: "allowed_project_ids", required: true });
  const allowedAccountIds = cleanIdArray(value.allowed_account_ids, { field: "allowed_account_ids" });
  const allowedRoles = cleanIdArray(value.allowed_roles, { field: "allowed_roles" });
  if (value.enabled !== false && !allowedAccountIds && !allowedRoles) fail("workspace_principal_scope_required");
  if (value.enabled !== false && allowedRoles?.some((role) => role.toLowerCase() !== "admin")) {
    fail("workspace_principal_scope_too_broad");
  }
  const { root, style } = normalizeWorkspaceRoot(value.root, rootKind);
  const allowedWritePrefixes = normalizeAllowedWritePrefixes(value.allowed_write_prefixes, style);
  const workspaceRevision = hash(`${machineId}\0${trustDomainId}\0${workspaceId}\0${rootKind}\0${comparablePath(root, style)}\0${allowedWritePrefixes.join("\0")}`);
  return Object.freeze({
    workspace_id: workspaceId,
    label,
    root_kind: rootKind,
    root,
    style,
    enabled: value.enabled !== false,
    default_access: "read-only",
    allowed_project_ids: allowedProjectIds,
    allowed_account_ids: allowedAccountIds,
    allowed_roles: allowedRoles,
    allowed_write_prefixes: allowedWritePrefixes,
    workspace_revision: workspaceRevision,
    root_fingerprint: workspaceRevision,
  });
}

function publicRow(row) {
  return deepFreeze({
    workspace_id: row.workspace_id,
    label: row.label,
  });
}

function cleanAuthorizationContext(context) {
  if (!isRecord(context) || context.authenticated !== true) return { error: "authentication_required" };
  const projectId = typeof context.project_id === "string" ? context.project_id.trim() : "";
  if (!projectId || projectId !== context.project_id || !ID_RE.test(projectId)) {
    return { error: "authorization_context_invalid" };
  }
  let accountId = null;
  if (context.account_id !== undefined && context.account_id !== null && context.account_id !== "") {
    if (typeof context.account_id !== "string") return { error: "authorization_context_invalid" };
    accountId = context.account_id.trim();
    if (!accountId || accountId !== context.account_id || !ID_RE.test(accountId)) {
      return { error: "authorization_context_invalid" };
    }
  }
  const roles = context.roles === undefined || context.roles === null
    ? []
    : context.roles;
  if (!Array.isArray(roles) || roles.length > 256) return { error: "authorization_context_invalid" };
  const normalizedRoles = [];
  const seenRoles = new Set();
  for (const role of roles) {
    if (typeof role !== "string") return { error: "authorization_context_invalid" };
    const normalized = role.trim();
    if (!normalized || normalized !== role || !ID_RE.test(normalized)) {
      return { error: "authorization_context_invalid" };
    }
    const key = normalized.toLowerCase();
    if (seenRoles.has(key)) return { error: "authorization_context_invalid" };
    seenRoles.add(key);
    normalizedRoles.push(key);
  }
  return {
    ok: true,
    project_id: projectId,
    account_id: accountId?.toLowerCase() ?? null,
    roles: normalizedRoles,
  };
}

async function defaultAvailabilityProbe({ root }) {
  const stat = await fsPromises.stat(root);
  return stat.isDirectory();
}

function boundedTimeout(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return DEFAULT_PROBE_TIMEOUT_MS;
  return Math.max(1, Math.min(MAX_PROBE_TIMEOUT_MS, Math.floor(number)));
}

async function runBoundedProbe(probe, payload, timeoutMs, timers = {}) {
  const setTimer = timers.setTimeout ?? setTimeout;
  const clearTimer = timers.clearTimeout ?? clearTimeout;
  let timer;
  const operation = Promise.resolve()
    .then(() => probe(payload))
    .then((value) => ({ type: "result", value }), () => ({ type: "error" }));
  const timeout = new Promise((resolve) => {
    timer = setTimer(() => resolve({ type: "timeout" }), timeoutMs);
  });
  const result = await Promise.race([operation, timeout]);
  clearTimer(timer);
  return result;
}

function runRootIsolationChild(rows, forbiddenRoots, timeoutMs, options = {}) {
  const spawnImpl = options.spawnImpl ?? spawn;
  const setTimer = options.setTimeout ?? setTimeout;
  const clearTimer = options.clearTimeout ?? clearTimeout;
  return new Promise((resolveResult) => {
    let settled = false;
    let stdout = "";
    let child;
    let timer = null;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimer(timer);
      resolveResult(value);
    };
    try {
      child = spawnImpl(process.execPath, [ROOT_ISOLATION_CHILD_PATH], {
        windowsHide: true,
        shell: false,
        stdio: ["pipe", "pipe", "ignore"],
        env: Object.fromEntries([
          "SystemRoot", "windir", "TEMP", "TMP",
        ].filter((key) => process.env[key]).map((key) => [key, process.env[key]])),
      });
    } catch {
      resolveResult({ type: "worker_failed" });
      return;
    }
    timer = setTimer(() => {
      try { child.kill(); } catch {}
      finish({ type: "timeout" });
    }, timeoutMs);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (Buffer.byteLength(stdout, "utf8") > ROOT_ISOLATION_OUTPUT_MAX) {
        try { child.kill(); } catch {}
        finish({ type: "protocol_invalid" });
      }
    });
    child.on("error", () => finish({ type: "worker_failed" }));
    child.on("close", (code) => {
      if (settled) return;
      if (code !== 0) return finish({ type: "worker_failed" });
      let value;
      try { value = JSON.parse(stdout); }
      catch { return finish({ type: "protocol_invalid" }); }
      finish({ type: "result", value });
    });
    try {
      child.stdin.end(JSON.stringify({ rows, forbidden_roots: forbiddenRoots }));
    } catch {
      try { child.kill(); } catch {}
      finish({ type: "worker_failed" });
    }
  });
}

class CodexWorkspaceRegistry {
  #byId;
  #descriptor;
  #rootIsolationRevision;
  #rootTreeRevision;
  #rows;
  #trustDomainId;

  constructor({ machineId, trustDomainId, rows, mappingRevision }) {
    this.#rows = Object.freeze([...rows]);
    this.#byId = new Map(this.#rows.map((row) => [row.workspace_id, row]));
    this.#rootIsolationRevision = null;
    this.#rootTreeRevision = null;
    this.#trustDomainId = trustDomainId;
    this.#descriptor = deepFreeze({
      schema: PUBLIC_SCHEMA,
      machine_id: machineId,
      mapping_revision: mappingRevision,
      workspaces: rows.filter((row) => row.enabled).map(publicRow),
    });
    Object.freeze(this);
  }

  get mappingRevision() {
    return this.#descriptor.mapping_revision;
  }

  get trustDomainId() {
    return this.#trustDomainId;
  }

  get rootIsolationRevision() {
    return this.#rootIsolationRevision;
  }

  get rootTreeRevision() {
    return this.#rootTreeRevision;
  }

  publicDescriptor() {
    return this.#descriptor;
  }

  toJSON() {
    return this.publicDescriptor();
  }

  validateRootIsolation(options = {}) {
    const fs = options.fs ?? DEFAULT_SYNC_FS;
    if (!["realpathSync", "statSync"].every((name) => typeof fs?.[name] === "function")) {
      return { ok: false, error: "workspace_root_isolation_adapter_invalid" };
    }
    const roots = [];
    try {
      for (const row of this.#rows.filter((candidate) => candidate.enabled)) {
        const real = fs.realpathSync(row.root);
        const stat = fs.statSync(real);
        if (typeof stat?.isDirectory !== "function" || !stat.isDirectory()) {
          return { ok: false, error: "workspace_root_isolation_unavailable" };
        }
        const realStyle = detectedPathStyle(real);
        if (!realStyle || realStyle !== row.style) {
          return { ok: false, error: "workspace_root_style_mismatch" };
        }
        roots.push({
          workspace_id: row.workspace_id,
          style: realStyle,
          real,
          comparable: comparablePath(real, row.style),
          dev: Number.isSafeInteger(stat.dev) ? stat.dev : null,
          ino: Number.isSafeInteger(stat.ino) ? stat.ino : null,
        });
      }
    } catch {
      return { ok: false, error: "workspace_root_isolation_unavailable" };
    }
    for (let left = 0; left < roots.length; left += 1) {
      for (let right = left + 1; right < roots.length; right += 1) {
        const a = roots[left];
        const b = roots[right];
        const sameFilesystemObject = a.dev !== null && a.ino !== null && b.dev !== null && b.ino !== null
          && (a.dev !== 0 || a.ino !== 0)
          && a.dev === b.dev && a.ino === b.ino;
        const pathOverlap = a.style === b.style
          && (isInside(a.real, b.real, a.style) || isInside(b.real, a.real, a.style));
        if (sameFilesystemObject || pathOverlap) {
          this.#rootIsolationRevision = null;
          this.#rootTreeRevision = null;
          return { ok: false, error: "workspace_root_real_overlap" };
        }
      }
    }
    const revision = hash(JSON.stringify(roots.map((row) => ({
      workspace_id: row.workspace_id,
      style: row.style,
      real: row.comparable,
      dev: row.dev,
      ino: row.ino,
    }))));
    this.#rootIsolationRevision = revision;
    this.#rootTreeRevision = revision;
    return deepFreeze({ ok: true, revision, workspace_count: roots.length });
  }

  async validateRootIsolationAsync(options = {}) {
    const mutableByWorkspace = options.mutablePrefixesByWorkspace;
    if (mutableByWorkspace !== undefined
        && (!mutableByWorkspace || typeof mutableByWorkspace !== "object" || Array.isArray(mutableByWorkspace))) {
      return { ok: false, error: "workspace_root_isolation_adapter_invalid" };
    }
    let rows;
    try {
      rows = this.#rows.filter((candidate) => candidate.enabled).map((row) => {
        const mutable = mutableByWorkspace?.[row.workspace_id] ?? [];
        if (!Array.isArray(mutable) || mutable.length > 16) throw new Error("invalid_mutable_prefixes");
        const normalized = mutable.map((prefix) => {
          const result = normalizeRelativePath(prefix, { allowEmpty: false });
          if (!result.ok) throw new Error("invalid_mutable_prefixes");
          return result.path;
        });
        return {
          workspace_id: row.workspace_id,
          style: row.style,
          root: row.root,
          ...(normalized.length ? { mutable_relative_prefixes: normalized } : {}),
        };
      });
    } catch {
      this.#rootIsolationRevision = null;
      this.#rootTreeRevision = null;
      return { ok: false, error: "workspace_root_isolation_adapter_invalid" };
    }
    const forbiddenRoots = Array.isArray(options.forbiddenRoots) ? options.forbiddenRoots : [];
    if (forbiddenRoots.length > 256
        || forbiddenRoots.some((root) => typeof root !== "string" || !root || root.length > 4096)) {
      this.#rootIsolationRevision = null;
      this.#rootTreeRevision = null;
      return { ok: false, error: "workspace_root_isolation_adapter_invalid" };
    }
    const timeoutMs = boundedTimeout(options.timeoutMs);
    const result = typeof options.probe === "function"
      ? await runBoundedProbe(options.probe, { rows, forbidden_roots: forbiddenRoots }, timeoutMs, options)
      : await runRootIsolationChild(rows, forbiddenRoots, timeoutMs, options);
    if (result.type === "timeout") {
      this.#rootIsolationRevision = null;
      this.#rootTreeRevision = null;
      return { ok: false, error: "workspace_root_isolation_timeout" };
    }
    if (result.type === "worker_failed" || result.type === "error") {
      this.#rootIsolationRevision = null;
      this.#rootTreeRevision = null;
      return { ok: false, error: "workspace_root_isolation_worker_failed" };
    }
    if (result.type === "protocol_invalid") {
      this.#rootIsolationRevision = null;
      this.#rootTreeRevision = null;
      return { ok: false, error: "workspace_root_isolation_protocol_invalid" };
    }
    const receipt = result.value;
    const exactKeys = receipt && typeof receipt === "object" && !Array.isArray(receipt)
      ? Object.keys(receipt).sort().join(",")
      : "";
    if (receipt?.ok === false
        && exactKeys === "error,ok"
        && new Set([
          "workspace_root_real_overlap",
          "workspace_root_boundary_overlap",
          "workspace_root_style_mismatch",
          "workspace_root_identity_unavailable",
          "workspace_root_isolation_unavailable",
          "workspace_root_isolation_protocol_invalid",
          "workspace_tree_protected_entry",
          "workspace_tree_link_unsafe",
          "workspace_tree_scan_limit",
        ]).has(receipt.error)) {
      this.#rootIsolationRevision = null;
      this.#rootTreeRevision = null;
      return { ok: false, error: receipt.error };
    }
    if (receipt?.ok !== true
        || exactKeys !== "forbidden_root_count,immutable_tree_revision,ok,revision,scanned_entry_count,tree_revision,workspace_count"
        || !/^[a-f0-9]{64}$/.test(receipt.revision)
        || !/^[a-f0-9]{64}$/.test(receipt.tree_revision)
        || !/^[a-f0-9]{64}$/.test(receipt.immutable_tree_revision)
        || receipt.workspace_count !== rows.length
        || receipt.forbidden_root_count !== forbiddenRoots.length
        || !Number.isSafeInteger(receipt.scanned_entry_count)
        || receipt.scanned_entry_count < 0) {
      this.#rootIsolationRevision = null;
      this.#rootTreeRevision = null;
      return { ok: false, error: "workspace_root_isolation_protocol_invalid" };
    }
    this.#rootIsolationRevision = receipt.revision;
    this.#rootTreeRevision = receipt.tree_revision;
    return deepFreeze({
      ok: true,
      revision: receipt.revision,
      tree_revision: receipt.tree_revision,
      immutable_tree_revision: receipt.immutable_tree_revision,
      workspace_count: receipt.workspace_count,
      forbidden_root_count: receipt.forbidden_root_count,
      scanned_entry_count: receipt.scanned_entry_count,
    });
  }

  authorize(workspaceId, context = {}) {
    const row = this.#byId.get(String(workspaceId ?? ""));
    if (!row) return { ok: false, error: "unknown_workspace" };
    if (!row.enabled) return { ok: false, error: "workspace_disabled", workspace_id: row.workspace_id };
    const auth = cleanAuthorizationContext(context);
    if (!auth.ok) return { ok: false, error: auth.error };
    if (!row.allowed_project_ids.includes(auth.project_id)) {
      return { ok: false, error: "workspace_project_forbidden", workspace_id: row.workspace_id };
    }
    const accountRestricted = Array.isArray(row.allowed_account_ids);
    const roleRestricted = Array.isArray(row.allowed_roles);
    if (accountRestricted || roleRestricted) {
      const accountAllowed = accountRestricted
        && !!auth.account_id
        && row.allowed_account_ids.some((id) => id.toLowerCase() === auth.account_id);
      const allowedRoles = roleRestricted ? new Set(row.allowed_roles.map((role) => role.toLowerCase())) : null;
      const roleAllowed = !!allowedRoles && auth.roles.some((role) => allowedRoles.has(role));
      if (!accountAllowed && !roleAllowed) {
        return { ok: false, error: "workspace_principal_forbidden", workspace_id: row.workspace_id };
      }
    }
    return { ok: true, workspace: publicRow(row) };
  }

  authorizedPublicRows(context = {}) {
    const rows = [];
    for (const row of this.#byId.values()) {
      const decision = this.authorize(row.workspace_id, context);
      if (decision.ok) rows.push(decision.workspace);
    }
    return deepFreeze(rows.sort((a, b) => a.workspace_id.localeCompare(b.workspace_id)));
  }

  checkWritePrefixes(workspaceId, relativePrefixes = []) {
    const row = this.#byId.get(String(workspaceId ?? ""));
    if (!row) return { ok: false, error: "unknown_workspace" };
    if (!row.enabled) return { ok: false, error: "workspace_disabled", workspace_id: row.workspace_id };
    if (!Array.isArray(relativePrefixes) || relativePrefixes.length > 16) {
      return { ok: false, error: "workspace_write_prefixes_invalid" };
    }
    const normalizedPrefixes = [];
    const seen = new Set();
    const allowed = row.allowed_write_prefixes.map((prefix) => (
      row.style === "windows" ? prefix.toLowerCase() : prefix
    ));
    for (const candidate of relativePrefixes) {
      const normalized = normalizeRelativePath(candidate, { allowEmpty: false });
      if (!normalized.ok) return { ok: false, error: normalized.error };
      const key = row.style === "windows" ? normalized.path.toLowerCase() : normalized.path;
      if (seen.has(key)) return { ok: false, error: "workspace_write_prefix_duplicate" };
      if (!allowed.some((prefix) => key === prefix || key.startsWith(`${prefix}/`))) {
        return { ok: false, error: "workspace_write_prefix_forbidden" };
      }
      seen.add(key);
      normalizedPrefixes.push(normalized.path);
    }
    return deepFreeze({ ok: true, relative_write_prefixes: normalizedPrefixes });
  }

  authorizeWritePrefixes(workspaceId, relativePrefixes = [], context = {}) {
    const authorization = this.authorize(workspaceId, context);
    if (!authorization.ok) return authorization;
    return this.checkWritePrefixes(workspaceId, relativePrefixes);
  }

  async probe(workspaceId, options = {}) {
    const row = this.#byId.get(String(workspaceId ?? ""));
    if (!row) return { ok: false, error: "unknown_workspace" };
    if (!row.enabled) return { ok: false, error: "workspace_disabled", workspace_id: row.workspace_id };
    const timeoutMs = boundedTimeout(options.timeoutMs);
    const result = await runBoundedProbe(options.probe ?? defaultAvailabilityProbe, {
      workspace_id: row.workspace_id,
      root_kind: row.root_kind,
      root: row.root,
      root_fingerprint: row.root_fingerprint,
    }, timeoutMs, options);
    if (result.type === "timeout") return { ok: false, error: "probe_timeout", workspace_id: row.workspace_id };
    if (result.type === "error") return { ok: false, error: "probe_failed", workspace_id: row.workspace_id };
    const available = result.value === true || result.value?.available === true || result.value?.ok === true;
    if (!available) return { ok: false, error: "workspace_offline", workspace_id: row.workspace_id };
    return { ok: true, workspace: publicRow(row) };
  }

  resolvePath(workspaceId, relativePath = "", options = {}) {
    const row = this.#byId.get(String(workspaceId ?? ""));
    if (!row) return { ok: false, error: "unknown_workspace" };
    if (!row.enabled) return { ok: false, error: "workspace_disabled", workspace_id: row.workspace_id };
    const relative = normalizeRelativePath(relativePath);
    if (relative.error) return { ok: false, error: relative.error, workspace_id: row.workspace_id };
    const pathApi = row.style === "windows" ? win32 : posix;
    const target = relative.segments.length ? pathApi.resolve(row.root, ...relative.segments) : row.root;
    if (!isInside(row.root, target, row.style)) {
      return { ok: false, error: "path_escape", workspace_id: row.workspace_id };
    }

    const fs = options.fs ?? DEFAULT_SYNC_FS;
    if (!["existsSync", "realpathSync", "statSync"].every((name) => typeof fs[name] === "function")) {
      return { ok: false, error: "filesystem_adapter_invalid", workspace_id: row.workspace_id };
    }
    try {
      if (!fs.existsSync(row.root)) return { ok: false, error: "workspace_offline", workspace_id: row.workspace_id };
      if (!fs.existsSync(target)) return { ok: false, error: "path_not_found", workspace_id: row.workspace_id };
      const realRoot = fs.realpathSync(row.root);
      const rootStat = fs.statSync(realRoot, { bigint: true });
      if (!rootStat.isDirectory()) return { ok: false, error: "workspace_not_directory", workspace_id: row.workspace_id };
      const rootIdentity = statIdentity(rootStat);
      if (!rootIdentity) return { ok: false, error: "filesystem_identity_unavailable", workspace_id: row.workspace_id };
      const realTarget = fs.realpathSync(target);
      if (!isInside(realRoot, realTarget, row.style)) {
        return { ok: false, error: "junction_escape", workspace_id: row.workspace_id };
      }
      if (isProtectedPath(realTarget, row.style)) {
        return { ok: false, error: "protected_relative_path", workspace_id: row.workspace_id };
      }
      const targetStat = comparablePath(realTarget, row.style) === comparablePath(realRoot, row.style)
        ? rootStat
        : fs.statSync(realTarget);
      return {
        ok: true,
        workspace_id: row.workspace_id,
        relative_path: relative.path,
        path: realTarget,
        path_style: row.style,
        root_fingerprint: hash(`${row.root_fingerprint}\0${comparablePath(realRoot, row.style)}\0${rootIdentity}`),
        workspace_revision: row.workspace_revision,
        mapping_revision: this.mappingRevision,
        effective_access: "read-only",
        target_is_directory: typeof targetStat?.isDirectory === "function" && targetStat.isDirectory(),
      };
    } catch {
      return { ok: false, error: "filesystem_resolution_failed", workspace_id: row.workspace_id };
    }
  }

  async resolvePathAsync(workspaceId, relativePath = "", options = {}) {
    const row = this.#byId.get(String(workspaceId ?? ""));
    if (!row) return { ok: false, error: "unknown_workspace" };
    if (!row.enabled) return { ok: false, error: "workspace_disabled", workspace_id: row.workspace_id };
    const relative = normalizeRelativePath(relativePath);
    if (relative.error) return { ok: false, error: relative.error, workspace_id: row.workspace_id };
    const pathApi = row.style === "windows" ? win32 : posix;
    const target = relative.segments.length ? pathApi.resolve(row.root, ...relative.segments) : row.root;
    if (!isInside(row.root, target, row.style)) {
      return { ok: false, error: "path_escape", workspace_id: row.workspace_id };
    }
    const fs = options.fs ?? fsPromises;
    if (!["realpath", "stat"].every((name) => typeof fs?.[name] === "function")) {
      return { ok: false, error: "filesystem_adapter_invalid", workspace_id: row.workspace_id };
    }
    const operation = async () => {
      try {
        const realRoot = await fs.realpath(row.root);
        const rootStat = await fs.stat(realRoot, { bigint: true });
        if (typeof rootStat?.isDirectory !== "function" || !rootStat.isDirectory()) {
          return { ok: false, error: "workspace_not_directory", workspace_id: row.workspace_id };
        }
        const rootIdentity = statIdentity(rootStat);
        if (!rootIdentity) return { ok: false, error: "filesystem_identity_unavailable", workspace_id: row.workspace_id };
        const realTarget = await fs.realpath(target);
        if (!isInside(realRoot, realTarget, row.style)) {
          return { ok: false, error: "junction_escape", workspace_id: row.workspace_id };
        }
        if (isProtectedPath(realTarget, row.style)) {
          return { ok: false, error: "protected_relative_path", workspace_id: row.workspace_id };
        }
        const targetStat = comparablePath(realTarget, row.style) === comparablePath(realRoot, row.style)
          ? rootStat
          : await fs.stat(realTarget);
        return {
          ok: true,
          workspace_id: row.workspace_id,
          relative_path: relative.path,
          path: realTarget,
          path_style: row.style,
          root_fingerprint: hash(`${row.root_fingerprint}\0${comparablePath(realRoot, row.style)}\0${rootIdentity}`),
          workspace_revision: row.workspace_revision,
          mapping_revision: this.mappingRevision,
          effective_access: "read-only",
          target_is_directory: typeof targetStat?.isDirectory === "function" && targetStat.isDirectory(),
        };
      } catch {
        return { ok: false, error: "filesystem_resolution_failed", workspace_id: row.workspace_id };
      }
    };
    const raced = await runBoundedProbe(operation, {}, boundedTimeout(options.timeoutMs), options);
    if (raced.type === "timeout") return { ok: false, error: "filesystem_resolution_timeout", workspace_id: row.workspace_id };
    if (raced.type === "error") return { ok: false, error: "filesystem_resolution_failed", workspace_id: row.workspace_id };
    return raced.value;
  }
}

export function parseWorkspaceRegistry(document) {
  if (!isRecord(document)) fail("registry_invalid");
  assertKnownFields(document, REGISTRY_FIELDS, "registry_unknown_field");
  if (document.schema !== CODEX_WORKSPACE_REGISTRY_SCHEMA) fail("registry_schema_invalid");
  const machineId = cleanText(document.machine_id, { max: 64, code: "machine_id_invalid" });
  if (!ID_RE.test(machineId)) fail("machine_id_invalid");
  const trustDomainId = cleanText(document.trust_domain_id, { max: 64, code: "trust_domain_id_invalid" });
  if (!ID_RE.test(trustDomainId)) fail("trust_domain_id_invalid");
  if (!Array.isArray(document.workspaces) || document.workspaces.length < 1 || document.workspaces.length > 128) {
    fail("registry_workspaces_invalid");
  }
  const rows = document.workspaces.map((row) => normalizeWorkspaceRow(row, machineId, trustDomainId))
    .sort((a, b) => a.workspace_id.localeCompare(b.workspace_id));
  const seen = new Set();
  for (const row of rows) {
    const key = row.workspace_id.toLowerCase();
    if (seen.has(key)) fail("workspace_duplicate");
    seen.add(key);
  }
  const enabledRows = rows.filter((row) => row.enabled);
  const enabledRootKinds = new Set(enabledRows.map((row) => row.root_kind));
  if (enabledRootKinds.size > 1) fail("workspace_root_authority_mixed");
  if (enabledRootKinds.has("unc")) {
    const namespaces = new Set(enabledRows.map((row) => uncNamespace(row.root)));
    if (namespaces.has(null) || namespaces.size !== 1) fail("workspace_unc_namespace_mismatch");
  }
  for (let left = 0; left < enabledRows.length; left += 1) {
    for (let right = left + 1; right < enabledRows.length; right += 1) {
      const a = enabledRows[left];
      const b = enabledRows[right];
      if (a.style === b.style
          && (isInside(a.root, b.root, a.style) || isInside(b.root, a.root, a.style))) {
        fail("workspace_root_overlap");
      }
    }
  }
  const revisionPayload = rows.map((row) => ({
    workspace_id: row.workspace_id,
    label: row.label,
    root_kind: row.root_kind,
    root: comparablePath(row.root, row.style),
    enabled: row.enabled,
    default_access: row.default_access,
    allowed_project_ids: row.allowed_project_ids,
    allowed_account_ids: row.allowed_account_ids,
    allowed_roles: row.allowed_roles,
    allowed_write_prefixes: row.allowed_write_prefixes,
  }));
  const mappingRevision = hash(JSON.stringify({
    schema: CODEX_WORKSPACE_REGISTRY_SCHEMA,
    machine_id: machineId,
    trust_domain_id: trustDomainId,
    workspaces: revisionPayload,
  }));
  return new CodexWorkspaceRegistry({ machineId, trustDomainId, rows, mappingRevision });
}

export function parseWorkspaceRegistryJson(text) {
  let document;
  try {
    document = JSON.parse(String(text));
  } catch {
    fail("invalid_json");
  }
  return parseWorkspaceRegistry(document);
}

export function loadWorkspaceRegistry(filePath, options = {}) {
  const readFileSync = options.readFileSync ?? nodeReadFileSync;
  let text;
  try {
    text = readFileSync(filePath, "utf8");
  } catch {
    fail("registry_read_failed");
  }
  return parseWorkspaceRegistryJson(text);
}

function dateValue(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return NaN;
  return Date.parse(value);
}

function downgrade(reason) {
  return { allowed: false, effective_access: "read-only", reason };
}

export function evaluateWriteGrant(grant, context, options = {}) {
  if (!grant) return downgrade("no_write_grant");
  if (!isRecord(grant) || !isRecord(context)) return downgrade("grant_malformed");
  if (Object.keys(grant).some((key) => !GRANT_FIELDS.has(key))) return downgrade("grant_malformed");

  const required = [
    "grant_id", "workspace_id", "workspace_revision", "workspace_root_fingerprint", "project_id", "item_id", "relative_prefix",
    "approved_by", "approved_at", "expires_at",
  ];
  if (required.some((key) => typeof grant[key] !== "string" || !grant[key].trim())) return downgrade("grant_malformed");
  if (required.some((key) => grant[key] !== grant[key].trim() || CONTROL_RE.test(grant[key]) || grant[key].length > 1024)) {
    return downgrade("grant_malformed");
  }
  if (grant.revoked !== undefined && typeof grant.revoked !== "boolean") return downgrade("grant_malformed");
  if (grant.revoked_at !== undefined && grant.revoked_at !== null) {
    if (typeof grant.revoked_at !== "string"
        || !grant.revoked_at
        || grant.revoked_at !== grant.revoked_at.trim()
        || CONTROL_RE.test(grant.revoked_at)) return downgrade("grant_malformed");
  }

  const prefix = normalizeRelativePath(grant.relative_prefix, { allowEmpty: false });
  const requested = normalizeRelativePath(context.relative_path, { allowEmpty: false });
  if (prefix.error || requested.error) return downgrade("grant_malformed");
  const approvedAt = dateValue(grant.approved_at);
  const expiresAt = dateValue(grant.expires_at);
  const now = options.now instanceof Date
    ? options.now.getTime()
    : (typeof options.now === "number" ? options.now : Date.parse(options.now ?? new Date().toISOString()));
  if (![approvedAt, expiresAt, now].every(Number.isFinite) || expiresAt <= approvedAt) return downgrade("grant_malformed");
  let revokedAt = null;
  if (grant.revoked_at) {
    revokedAt = dateValue(grant.revoked_at);
    if (!Number.isFinite(revokedAt)) return downgrade("grant_malformed");
  }
  if (grant.revoked === true || (revokedAt !== null && revokedAt <= now)) return downgrade("grant_revoked");
  if (approvedAt > now) return downgrade("grant_not_yet_valid");
  if (expiresAt <= now) return downgrade("grant_expired");
  if (grant.workspace_id !== context.workspace_id) return downgrade("workspace_mismatch");
  if (grant.workspace_revision !== context.workspace_revision) return downgrade("workspace_revision_mismatch");
  if (grant.workspace_root_fingerprint !== context.workspace_root_fingerprint) return downgrade("workspace_root_mismatch");
  if (grant.project_id !== context.project_id) return downgrade("project_mismatch");
  if (grant.item_id !== context.item_id) return downgrade("item_mismatch");

  const allowedApprovers = Array.isArray(context.allowed_approvers)
    ? context.allowed_approvers.map((value) => String(value).trim().toLowerCase()).filter(Boolean)
    : [];
  if (!allowedApprovers.includes(grant.approved_by.trim().toLowerCase())) return downgrade("approver_not_allowed");
  const pathStyle = context.path_style === "windows" ? "windows" : (context.path_style === "posix" ? "posix" : null);
  if (!pathStyle) return downgrade("grant_malformed");
  const prefixComparable = pathStyle === "windows" ? prefix.path.toLowerCase() : prefix.path;
  const requestedComparable = pathStyle === "windows" ? requested.path.toLowerCase() : requested.path;
  if (requestedComparable !== prefixComparable && !requestedComparable.startsWith(`${prefixComparable}/`)) {
    return downgrade("prefix_mismatch");
  }
  return {
    allowed: true,
    effective_access: "workspace-write",
    grant_id: grant.grant_id,
    relative_prefix: prefix.path,
  };
}
