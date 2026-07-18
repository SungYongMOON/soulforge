import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  lstat,
  open,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";

import {
  enqueueLocalOutboxFile,
  loadLocalOutboxBinding,
} from "../../../../guild_hall/ingress/local_outbox.mjs";

export const INGRESS_MCP_CONFIG_SCHEMA = "soulforge.ingress.mcp_binding.v1";
export const INGRESS_MCP_AUTH_SCHEMA = "soulforge.ingress.mcp_auth_registry.v1";
export const INGRESS_MCP_TICKET_SCHEMA = "soulforge.ingress.mcp_upload_ticket.v1";
export const INGRESS_MCP_SUBMISSION_SCHEMA = "soulforge.ingress.mcp_submission.v1";

const TOKEN_RE = /^sfig_v1_[A-Za-z0-9_-]{43}$/;
const TICKET_RE = /^sfigup_[A-Za-z0-9_-]{32}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;
const IDEMPOTENCY_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{7,127}$/;
const SHA256_RE = /^[a-f0-9]{64}$/;
const MEDIA_TYPE_RE = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,63}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,63}$/;
const CAPABILITIES = new Set([
  "upload:team_files",
  "publish:structured_pc_work",
  "publish:run_logs",
  "receipt:read",
]);
const CONFIG_FIELDS = [
  "schema_version", "enabled", "node_id", "listen_host", "listen_port", "public_url",
  "local_outbox_binding_path", "auth_registry_path", "state_root", "submission_root",
  "max_file_bytes", "chunk_bytes", "ticket_ttl_seconds", "max_open_uploads_per_credential",
  "max_pending_upload_bytes_per_credential", "max_retained_upload_bytes_per_credential",
];
const REGISTRY_FIELDS = ["schema_version", "revision", "tokens"];
const TOKEN_FIELDS = [
  "credential_id", "account_id", "device_id", "agent_id", "token_hash", "project_scopes",
  "capabilities", "created_at", "expires_at", "revoked_at",
];
const UPLOAD_FIELDS = [
  "project_hint", "occurrence_id", "idempotency_key", "filename", "size", "sha256", "media_type",
];
const EVENT_FIELDS = [
  "project_hint", "occurrence_id", "idempotency_key", "event_kind", "occurred_at", "task_ref",
  "summary", "outputs", "verification", "next_actions", "stop_conditions",
  "official_completion", "full_transcript_included", "screen_capture_included",
  "keystroke_capture_included", "os_surveillance_included",
];
const TICKET_FIELDS = [
  "schema_version", "ticket_id", "credential_id", "account_id", "device_id", "agent_id",
  "project_hint", "occurrence_id", "idempotency_key", "input_digest", "filename", "media_type",
  "expected_size", "expected_sha256", "received_size", "status", "created_at", "expires_at",
  "finalized_at", "submission_id",
];
const SUBMISSION_FIELDS = [
  "schema_version", "submission_id", "lane", "credential_id", "account_id", "device_id", "agent_id",
  "project_hint", "occurrence_id", "outbox_occurrence_id", "task_ref", "filename", "media_type",
  "sha256", "size", "source_kind", "received_at", "local_outbox_status", "official_completion",
  "official_history_written", "project_promoted", "source_deleted", "source_overwritten",
];
const SAFE_EXTENSIONS = new Set([
  ".pdf", ".txt", ".md", ".csv", ".json", ".xml", ".yaml", ".yml",
  ".xlsx", ".xls", ".docx", ".doc", ".pptx", ".ppt", ".hwp", ".hwpx",
  ".step", ".stp", ".dxf", ".dwg", ".brd", ".dsn", ".zip", ".7z",
  ".png", ".jpg", ".jpeg", ".tif", ".tiff", ".svg", ".wav", ".mp3", ".m4a", ".ogg",
]);

export class IngressMcpError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.name = "IngressMcpError";
    this.code = code;
    this.status = status;
  }
}

function fail(code, status = 400) {
  throw new IngressMcpError(code, status);
}

function comparable(value) {
  return process.platform === "win32" ? value.toLowerCase() : value;
}

function inside(root, target) {
  const rel = relative(root, target);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

function exactFields(value, fields, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  const actual = Object.keys(value).sort();
  const expected = [...fields].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) fail(code);
}

function safeId(value, code, max = 128) {
  const text = String(value ?? "");
  if (!SAFE_ID.test(text) || text.length > max) fail(code);
  return text;
}

function safeText(value, { code, required = false, max = 4000 } = {}) {
  const text = String(value ?? "").replace(/\r\n?/g, "\n").trim();
  if ((required && !text) || text.length > max || /\0/.test(text)) fail(code);
  return text || null;
}

function safeList(value, code) {
  if (!Array.isArray(value) || value.length > 20) fail(code);
  return value.map((entry) => safeText(entry, { code, required: true, max: 1000 }));
}

function iso(value, code) {
  const parsed = Date.parse(String(value ?? ""));
  if (!Number.isFinite(parsed)) fail(code);
  return new Date(parsed).toISOString();
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

async function exists(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function assertNormalDirectory(path, code) {
  let info;
  try {
    info = await lstat(path);
  } catch (error) {
    if (error?.code === "ENOENT") fail(code);
    throw error;
  }
  if (!info.isDirectory() || info.isSymbolicLink()) fail(code);
  if (comparable(await realpath(path)) !== comparable(resolve(path))) fail(code);
}

async function assertNormalFile(path, code) {
  let info;
  try {
    info = await lstat(path);
  } catch (error) {
    if (error?.code === "ENOENT") fail(code);
    throw error;
  }
  if (!info.isFile() || info.isSymbolicLink()) fail(code);
  if (comparable(await realpath(path)) !== comparable(resolve(path))) fail(code);
}

async function assertContainedChain(root, target, code) {
  const rootPath = resolve(root);
  const targetPath = resolve(target);
  if (!inside(rootPath, targetPath)) fail(code);
  await assertNormalDirectory(rootPath, code);
  let current = rootPath;
  for (const part of relative(rootPath, targetPath).split(sep).filter(Boolean)) {
    current = resolve(current, part);
    await assertNormalDirectory(current, code);
  }
}

async function readJson(path, code) {
  await assertNormalFile(path, code);
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    fail(code);
  }
}

async function atomicJson(root, path, payload) {
  const target = resolve(path);
  if (!inside(root, target)) fail("ingress_mcp_state_escape");
  await assertContainedChain(root, dirname(target), "ingress_mcp_state_unsafe");
  if (await exists(target)) {
    const info = await lstat(target);
    if (!info.isFile() || info.isSymbolicLink()) fail("ingress_mcp_state_unsafe");
  }
  const temporary = `${target}.partial-${randomBytes(12).toString("hex")}`;
  try {
    await writeFile(temporary, `${JSON.stringify(payload, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function immutableJson(root, path, payload, conflictCode) {
  const target = resolve(path);
  if (!inside(root, target)) fail("ingress_mcp_state_escape");
  await assertContainedChain(root, dirname(target), "ingress_mcp_state_unsafe");
  const serialized = `${JSON.stringify(payload, null, 2)}\n`;
  try {
    await writeFile(target, serialized, { encoding: "utf8", flag: "wx" });
    return true;
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    if (await readFile(target, "utf8") !== serialized) fail(conflictCode, 409);
    return false;
  }
}

async function hashFile(path) {
  const handle = await open(path, "r");
  const hash = createHash("sha256");
  try {
    for await (const chunk of handle.readableWebStream()) hash.update(Buffer.from(chunk));
  } finally {
    await handle.close();
  }
  return hash.digest("hex");
}

function absolutePath(value, code) {
  if (typeof value !== "string" || !isAbsolute(value)) fail(code);
  return resolve(value);
}

export async function loadIngressMcpConfig(configPath) {
  const path = absolutePath(configPath, "ingress_mcp_config_absolute_required");
  const raw = await readJson(path, "invalid_ingress_mcp_config");
  exactFields(raw, CONFIG_FIELDS, "invalid_ingress_mcp_config");
  if (raw.schema_version !== INGRESS_MCP_CONFIG_SCHEMA || typeof raw.enabled !== "boolean") {
    fail("invalid_ingress_mcp_config");
  }
  const publicUrl = new URL(String(raw.public_url || ""));
  if (String(raw.listen_host) !== "127.0.0.1"
    || !Number.isSafeInteger(raw.listen_port) || raw.listen_port < 1024 || raw.listen_port > 65535
    || !["http:", "https:"].includes(publicUrl.protocol)
    || (publicUrl.protocol === "http:" && !["127.0.0.1", "localhost", "::1"].includes(publicUrl.hostname))
    || publicUrl.username || publicUrl.password || publicUrl.search || publicUrl.hash
    || !["", "/"].includes(publicUrl.pathname)) {
    fail("invalid_ingress_mcp_config");
  }
  const config = {
    schemaVersion: INGRESS_MCP_CONFIG_SCHEMA,
    enabled: raw.enabled,
    nodeId: safeId(raw.node_id, "invalid_ingress_mcp_config"),
    listenHost: "127.0.0.1",
    listenPort: raw.listen_port,
    publicUrl,
    localOutboxBindingPath: absolutePath(raw.local_outbox_binding_path, "invalid_ingress_mcp_config"),
    authRegistryPath: absolutePath(raw.auth_registry_path, "invalid_ingress_mcp_config"),
    stateRoot: absolutePath(raw.state_root, "invalid_ingress_mcp_config"),
    submissionRoot: absolutePath(raw.submission_root, "invalid_ingress_mcp_config"),
    maxFileBytes: Number(raw.max_file_bytes),
    chunkBytes: Number(raw.chunk_bytes),
    ticketTtlSeconds: Number(raw.ticket_ttl_seconds),
    maxOpenUploadsPerCredential: Number(raw.max_open_uploads_per_credential),
    maxPendingUploadBytesPerCredential: Number(raw.max_pending_upload_bytes_per_credential),
    maxRetainedUploadBytesPerCredential: Number(raw.max_retained_upload_bytes_per_credential),
  };
  if (!Number.isSafeInteger(config.maxFileBytes) || config.maxFileBytes < 1 || config.maxFileBytes > 2 * 1024 ** 3
    || !Number.isSafeInteger(config.chunkBytes) || config.chunkBytes < 64 * 1024 || config.chunkBytes > 16 * 1024 ** 2
    || !Number.isSafeInteger(config.ticketTtlSeconds) || config.ticketTtlSeconds < 60 || config.ticketTtlSeconds > 86400
    || !Number.isSafeInteger(config.maxOpenUploadsPerCredential) || config.maxOpenUploadsPerCredential < 1
    || config.maxOpenUploadsPerCredential > 1000
    || !Number.isSafeInteger(config.maxPendingUploadBytesPerCredential)
    || config.maxPendingUploadBytesPerCredential < config.maxFileBytes
    || !Number.isSafeInteger(config.maxRetainedUploadBytesPerCredential)
    || config.maxRetainedUploadBytesPerCredential < config.maxPendingUploadBytesPerCredential
    || !inside(config.stateRoot, config.submissionRoot)) fail("invalid_ingress_mcp_config");
  await assertNormalDirectory(config.stateRoot, "ingress_mcp_state_unsafe");
  await assertNormalDirectory(config.submissionRoot, "ingress_mcp_submission_root_unsafe");
  await assertNormalFile(config.authRegistryPath, "ingress_mcp_auth_registry_unsafe");
  return config;
}

export function normalizeIngressAuthRegistry(raw) {
  exactFields(raw, REGISTRY_FIELDS, "invalid_ingress_mcp_auth_registry");
  if (raw.schema_version !== INGRESS_MCP_AUTH_SCHEMA || !Array.isArray(raw.tokens) || raw.tokens.length > 10000) {
    fail("invalid_ingress_mcp_auth_registry");
  }
  safeId(raw.revision, "invalid_ingress_mcp_auth_registry");
  const ids = new Set();
  const hashes = new Set();
  return raw.tokens.map((token) => {
    exactFields(token, TOKEN_FIELDS, "invalid_ingress_mcp_auth_registry");
    const normalized = {
      credentialId: safeId(token.credential_id, "invalid_ingress_mcp_auth_registry", 40),
      accountId: safeId(token.account_id, "invalid_ingress_mcp_auth_registry", 80),
      deviceId: safeId(token.device_id, "invalid_ingress_mcp_auth_registry", 80),
      agentId: safeId(token.agent_id, "invalid_ingress_mcp_auth_registry", 80),
      tokenHash: String(token.token_hash || ""),
      projectScopes: token.project_scopes,
      capabilities: token.capabilities,
      createdAt: iso(token.created_at, "invalid_ingress_mcp_auth_registry"),
      expiresAt: iso(token.expires_at, "invalid_ingress_mcp_auth_registry"),
      revokedAt: token.revoked_at === null ? null : iso(token.revoked_at, "invalid_ingress_mcp_auth_registry"),
    };
    if (ids.has(normalized.credentialId) || hashes.has(normalized.tokenHash) || !SHA256_RE.test(normalized.tokenHash)
      || !Array.isArray(normalized.projectScopes) || normalized.projectScopes.length > 100
      || !Array.isArray(normalized.capabilities) || normalized.capabilities.length > CAPABILITIES.size) {
      fail("invalid_ingress_mcp_auth_registry");
    }
    ids.add(normalized.credentialId);
    hashes.add(normalized.tokenHash);
    normalized.projectScopes = [...new Set(normalized.projectScopes.map((scope) => safeId(scope, "invalid_ingress_mcp_auth_registry")))].sort();
    normalized.capabilities = [...new Set(normalized.capabilities.map((capability) => {
      if (!CAPABILITIES.has(capability)) fail("invalid_ingress_mcp_auth_registry");
      return capability;
    }))].sort();
    return normalized;
  });
}

function tokenMatch(left, right) {
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

function publicPrincipal(principal) {
  return {
    account_id: principal.accountId,
    device_id: principal.deviceId,
    agent_id: principal.agentId,
    project_scopes: principal.projectScopes,
    capabilities: principal.capabilities,
    expires_at: principal.expiresAt,
  };
}

function requireProject(principal, projectHint) {
  const project = safeId(projectHint, "invalid_project_hint", 80);
  if (!principal.projectScopes.includes(project)) fail("project_scope_forbidden", 403);
  return project;
}

function requireCapability(principal, capability) {
  if (!principal.capabilities.includes(capability)) fail("capability_forbidden", 403);
}

function validateFilename(value) {
  const filename = String(value ?? "").normalize("NFC");
  if (!filename || filename.length > 180 || basename(filename) !== filename
    || filename !== filename.trim() || /[<>:"/\\|?*\x00-\x1f]/.test(filename) || /[. ]$/.test(filename)
    || !SAFE_EXTENSIONS.has(extname(filename).toLowerCase())) fail("invalid_filename");
  return filename;
}

function normalizeUpload(principal, input, maxFileBytes) {
  exactFields(input, UPLOAD_FIELDS, "invalid_upload_request");
  requireCapability(principal, "upload:team_files");
  const size = Number(input.size);
  if (!Number.isSafeInteger(size) || size < 1 || size > maxFileBytes || !SHA256_RE.test(String(input.sha256 || ""))) {
    fail("invalid_upload_request");
  }
  const mediaType = String(input.media_type || "").toLowerCase();
  if (!MEDIA_TYPE_RE.test(mediaType)) fail("invalid_upload_request");
  const idempotencyKey = String(input.idempotency_key || "");
  if (!IDEMPOTENCY_RE.test(idempotencyKey)) fail("invalid_idempotency_key");
  return {
    project_hint: requireProject(principal, input.project_hint),
    occurrence_id: safeId(input.occurrence_id, "invalid_occurrence_id", 64),
    idempotency_key: idempotencyKey,
    filename: validateFilename(input.filename),
    size,
    sha256: input.sha256,
    media_type: mediaType,
  };
}

function normalizeEvent(principal, lane, input) {
  exactFields(input, EVENT_FIELDS, "invalid_event_request");
  requireCapability(principal, `publish:${lane}`);
  if (input.official_completion !== false || input.full_transcript_included !== false
    || input.screen_capture_included !== false || input.keystroke_capture_included !== false
    || input.os_surveillance_included !== false) fail("event_capture_boundary_violation", 403);
  const idempotencyKey = String(input.idempotency_key || "");
  if (!IDEMPOTENCY_RE.test(idempotencyKey)) fail("invalid_idempotency_key");
  return {
    project_hint: requireProject(principal, input.project_hint),
    occurrence_id: safeId(input.occurrence_id, "invalid_occurrence_id", 64),
    idempotency_key: idempotencyKey,
    event_kind: safeId(input.event_kind, "invalid_event_kind", 80),
    occurred_at: iso(input.occurred_at, "invalid_event_time"),
    task_ref: input.task_ref === null ? null : safeId(input.task_ref, "invalid_task_ref", 120),
    summary: safeText(input.summary, { code: "invalid_event_summary", required: true, max: 8000 }),
    outputs: safeList(input.outputs, "invalid_event_outputs"),
    verification: safeText(input.verification, { code: "invalid_event_verification", max: 4000 }),
    next_actions: safeList(input.next_actions, "invalid_event_next_actions"),
    stop_conditions: safeList(input.stop_conditions, "invalid_event_stop_conditions"),
    official_completion: false,
    full_transcript_included: false,
    screen_capture_included: false,
    keystroke_capture_included: false,
    os_surveillance_included: false,
  };
}

export async function createIngressMcpService({ configPath, now = () => Date.now() } = {}) {
  const config = await loadIngressMcpConfig(configPath);
  const outboxBinding = await loadLocalOutboxBinding(config.localOutboxBindingPath);
  if (inside(outboxBinding.outboxRoot, config.stateRoot) || inside(config.stateRoot, outboxBinding.outboxRoot)) {
    fail("ingress_mcp_outbox_state_overlap");
  }
  const roots = {
    tickets: resolve(config.stateRoot, "tickets"),
    uploads: resolve(config.stateRoot, "uploads"),
    indexes: resolve(config.stateRoot, "indexes"),
    events: resolve(config.stateRoot, "event_sources"),
    quotaLocks: resolve(config.stateRoot, "quota_locks"),
  };
  for (const root of Object.values(roots)) await assertNormalDirectory(root, "ingress_mcp_state_unsafe");

  async function registryTokens() {
    return normalizeIngressAuthRegistry(await readJson(config.authRegistryPath, "invalid_ingress_mcp_auth_registry"));
  }

  async function authenticate(value) {
    const raw = String(value || "").replace(/^Bearer\s+/i, "").trim();
    if (!TOKEN_RE.test(raw)) fail("ingress_auth_required", 401);
    const digest = sha256(raw);
    const tokens = await registryTokens();
    const principal = tokens.find((entry) => tokenMatch(entry.tokenHash, digest));
    if (!principal || principal.revokedAt || Date.parse(principal.expiresAt) <= now()) fail("ingress_auth_invalid", 401);
    return principal;
  }

  async function requireLivePrincipal(principal) {
    const tokens = await registryTokens();
    const current = tokens.find((entry) => entry.credentialId === principal?.credentialId);
    if (!current || current.revokedAt || Date.parse(current.expiresAt) <= now()
      || current.accountId !== principal.accountId || current.deviceId !== principal.deviceId
      || current.agentId !== principal.agentId || current.tokenHash !== principal.tokenHash) {
      fail("ingress_auth_invalid", 401);
    }
    return current;
  }

  function indexPath(principal, kind, idempotencyKey) {
    return resolve(roots.indexes, `${sha256(`${kind}\0${principal.credentialId}\0${idempotencyKey}`)}.json`);
  }

  function ticketPath(ticketId) {
    if (!TICKET_RE.test(ticketId)) fail("upload_ticket_invalid", 401);
    return resolve(roots.tickets, `${ticketId}.json`);
  }

  function uploadPath(ticketId) {
    if (!TICKET_RE.test(ticketId)) fail("upload_ticket_invalid", 401);
    return resolve(roots.uploads, `${ticketId}.partial`);
  }

  function submissionPath(submissionId) {
    safeId(submissionId, "submission_id_invalid");
    return resolve(config.submissionRoot, `${submissionId}.json`);
  }

  async function withCredentialQuotaLock(principal, operation) {
    const path = resolve(roots.quotaLocks, `${principal.credentialId}.lock`);
    let handle;
    try {
      handle = await open(path, "wx");
      await handle.sync();
    } catch (error) {
      await handle?.close().catch(() => {});
      if (error?.code === "EEXIST") fail("ingress_quota_busy", 429);
      throw error;
    }
    try { return await operation(); }
    finally {
      await handle.close();
      await rm(path, { force: true });
    }
  }

  async function assertUploadQuota(principal, requestedBytes) {
    const names = (await readdir(roots.tickets)).filter((name) => /^sfigup_[A-Za-z0-9_-]{32}\.json$/.test(name));
    if (names.length > 10000) fail("ingress_ticket_inventory_too_large", 429);
    let openUploads = 0;
    let pendingBytes = 0;
    let retainedBytes = 0;
    for (const name of names) {
      const ticket = await readTicket(name.slice(0, -5));
      if (ticket.credential_id !== principal.credentialId) continue;
      retainedBytes += ticket.expected_size;
      if (ticket.status === "pending" && Date.parse(ticket.expires_at) > now()) {
        openUploads += 1;
        pendingBytes += ticket.expected_size;
      }
    }
    if (openUploads >= config.maxOpenUploadsPerCredential) fail("ingress_open_upload_quota_exceeded", 429);
    if (pendingBytes + requestedBytes > config.maxPendingUploadBytesPerCredential) {
      fail("ingress_pending_byte_quota_exceeded", 429);
    }
    if (retainedBytes + requestedBytes > config.maxRetainedUploadBytesPerCredential) {
      fail("ingress_retained_byte_quota_exceeded", 429);
    }
  }

  async function readTicket(ticketId) {
    const ticket = await readJson(ticketPath(ticketId), "upload_ticket_invalid");
    exactFields(ticket, TICKET_FIELDS, "upload_ticket_invalid");
    if (ticket.schema_version !== INGRESS_MCP_TICKET_SCHEMA || ticket.ticket_id !== ticketId) fail("upload_ticket_invalid", 401);
    return ticket;
  }

  async function readSubmission(submissionId) {
    const submission = await readJson(submissionPath(submissionId), "submission_not_found");
    exactFields(submission, SUBMISSION_FIELDS, "submission_invalid");
    if (submission.schema_version !== INGRESS_MCP_SUBMISSION_SCHEMA
      || submission.submission_id !== submissionId) fail("submission_invalid", 409);
    return submission;
  }

  function publicTicket(ticket, replayed = false) {
    return {
      ticket_id: ticket.ticket_id,
      status: ticket.status,
      expected_size: ticket.expected_size,
      received_size: ticket.received_size,
      chunk_bytes: config.chunkBytes,
      expires_at: ticket.expires_at,
      submission_id: ticket.submission_id,
      replayed,
    };
  }

  async function prepareUpload(principalInput, input) {
    const principal = await requireLivePrincipal(principalInput);
    const normalized = normalizeUpload(principal, input, config.maxFileBytes);
    const inputDigest = sha256(canonical(normalized));
    const idxPath = indexPath(principal, "upload", normalized.idempotency_key);
    if (await exists(idxPath)) {
      const index = await readJson(idxPath, "upload_idempotency_index_invalid");
      if (index.input_digest !== inputDigest) fail("idempotency_conflict", 409);
      return publicTicket(await readTicket(index.ticket_id), true);
    }
    return withCredentialQuotaLock(principal, async () => {
      if (await exists(idxPath)) {
        const index = await readJson(idxPath, "upload_idempotency_index_invalid");
        if (index.input_digest !== inputDigest) fail("idempotency_conflict", 409);
        return publicTicket(await readTicket(index.ticket_id), true);
      }
      await assertUploadQuota(principal, normalized.size);
      const ticketId = `sfigup_${sha256(`upload\0${principal.credentialId}\0${normalized.idempotency_key}`).slice(0, 32)}`;
      const createdAt = new Date(now()).toISOString();
      const ticket = {
        schema_version: INGRESS_MCP_TICKET_SCHEMA,
        ticket_id: ticketId,
        credential_id: principal.credentialId,
        account_id: principal.accountId,
        device_id: principal.deviceId,
        agent_id: principal.agentId,
        project_hint: normalized.project_hint,
        occurrence_id: normalized.occurrence_id,
        idempotency_key: normalized.idempotency_key,
        input_digest: inputDigest,
        filename: normalized.filename,
        media_type: normalized.media_type,
        expected_size: normalized.size,
        expected_sha256: normalized.sha256,
        received_size: 0,
        status: "pending",
        created_at: createdAt,
        expires_at: new Date(now() + config.ticketTtlSeconds * 1000).toISOString(),
        finalized_at: null,
        submission_id: null,
      };
      if (await exists(ticketPath(ticketId))) {
        const recovered = await readTicket(ticketId);
        const uploadInfo = await stat(uploadPath(ticketId));
        if (recovered.credential_id !== principal.credentialId || recovered.input_digest !== inputDigest
          || !uploadInfo.isFile() || uploadInfo.size !== recovered.received_size) fail("upload_ticket_conflict", 409);
        await immutableJson(config.stateRoot, idxPath, {
          schema_version: "soulforge.ingress.mcp_idempotency_index.v1",
          kind: "upload",
          credential_id: principal.credentialId,
          idempotency_key: normalized.idempotency_key,
          input_digest: inputDigest,
          ticket_id: ticketId,
        }, "idempotency_conflict");
        return publicTicket(recovered, true);
      }
      let handle;
      try {
        handle = await open(uploadPath(ticketId), "wx");
        await handle.sync();
      } catch (error) {
        if (error?.code !== "EEXIST") throw error;
        const orphan = await stat(uploadPath(ticketId));
        if (!orphan.isFile() || orphan.size !== 0) fail("upload_orphan_conflict", 409);
      } finally {
        await handle?.close();
      }
      await immutableJson(config.stateRoot, ticketPath(ticketId), ticket, "upload_ticket_conflict");
      await immutableJson(config.stateRoot, idxPath, {
        schema_version: "soulforge.ingress.mcp_idempotency_index.v1",
        kind: "upload",
        credential_id: principal.credentialId,
        idempotency_key: normalized.idempotency_key,
        input_digest: inputDigest,
        ticket_id: ticketId,
      }, "idempotency_conflict");
      return publicTicket(ticket, false);
    });
  }

  async function requireTicket(principalInput, ticketId) {
    const principal = await requireLivePrincipal(principalInput);
    const ticket = await readTicket(ticketId);
    if (ticket.credential_id !== principal.credentialId || ticket.account_id !== principal.accountId
      || ticket.device_id !== principal.deviceId || ticket.agent_id !== principal.agentId
      || (ticket.status === "pending" && Date.parse(ticket.expires_at) <= now())) fail("upload_ticket_invalid", 401);
    return { principal, ticket };
  }

  async function appendChunk(principalInput, ticketId, offset, bytes) {
    const { ticket } = await requireTicket(principalInput, ticketId);
    if (ticket.status !== "pending") fail("upload_ticket_not_pending", 409);
    if (!Buffer.isBuffer(bytes) || bytes.length < 1 || bytes.length > config.chunkBytes) fail("upload_chunk_invalid");
    if (!Number.isSafeInteger(offset) || offset !== ticket.received_size) {
      const error = new IngressMcpError("upload_offset_conflict", 409);
      error.receivedSize = ticket.received_size;
      throw error;
    }
    if (offset + bytes.length > ticket.expected_size) fail("upload_size_exceeded", 413);
    const path = uploadPath(ticketId);
    const info = await stat(path);
    if (!info.isFile() || info.size !== ticket.received_size) fail("upload_state_conflict", 409);
    const handle = await open(path, "r+");
    try {
      const result = await handle.write(bytes, 0, bytes.length, offset);
      if (result.bytesWritten !== bytes.length) fail("upload_write_incomplete", 500);
      await handle.sync();
    } finally {
      await handle.close();
    }
    const updated = { ...ticket, received_size: offset + bytes.length };
    await atomicJson(config.stateRoot, ticketPath(ticketId), updated);
    return { ticket_id: ticketId, received_size: updated.received_size, expected_size: ticket.expected_size, complete: updated.received_size === ticket.expected_size };
  }

  async function uploadStatus(principalInput, ticketId) {
    const { ticket } = await requireTicket(principalInput, ticketId);
    return publicTicket(ticket, true);
  }

  async function submissionStatus(principalInput, submissionId) {
    const principal = await requireLivePrincipal(principalInput);
    requireCapability(principal, "receipt:read");
    const submission = await readSubmission(submissionId);
    if (submission.account_id !== principal.accountId
      || !principal.projectScopes.includes(submission.project_hint)) fail("submission_not_found", 404);
    const ackPath = resolve(outboxBinding.outboxRoot, "state", "acks", submission.lane, `${submission.outbox_occurrence_id}.json`);
    let verified = false;
    if (await exists(ackPath)) {
      const ack = await readJson(ackPath, "submission_ack_invalid");
      verified = ack.source_key === submission.outbox_occurrence_id && ack.sha256 === submission.sha256 && ack.size === submission.size;
      if (!verified) fail("submission_ack_invalid", 409);
    }
    return {
      submission_id: submission.submission_id,
      lane: submission.lane,
      project_hint: submission.project_hint,
      status: verified ? "verified_server_ack" : "pending_server_ack",
      sha256: submission.sha256,
      size: submission.size,
      official_history_written: false,
      source_deleted: false,
    };
  }

  async function finalizeUpload(principalInput, ticketId) {
    const { principal, ticket } = await requireTicket(principalInput, ticketId);
    if (ticket.status === "finalized" && ticket.submission_id) return submissionStatus(principal, ticket.submission_id);
    if (ticket.status !== "pending" || ticket.received_size !== ticket.expected_size) fail("upload_incomplete", 409);
    const source = uploadPath(ticketId);
    if (await hashFile(source) !== ticket.expected_sha256) fail("upload_sha256_mismatch", 409);
    const outboxOccurrenceId = `mcp_${principal.credentialId}_${ticket.occurrence_id}`;
    const staged = await enqueueLocalOutboxFile({
      bindingPath: config.localOutboxBindingPath,
      lane: "team_files",
      source,
      occurrenceId: outboxOccurrenceId,
      apply: true,
    });
    const submissionId = `sfigsub_${sha256(`upload\0${ticket.ticket_id}`).slice(0, 32)}`;
    const submission = {
      schema_version: INGRESS_MCP_SUBMISSION_SCHEMA,
      submission_id: submissionId,
      lane: "team_files",
      credential_id: principal.credentialId,
      account_id: principal.accountId,
      device_id: principal.deviceId,
      agent_id: principal.agentId,
      project_hint: ticket.project_hint,
      occurrence_id: ticket.occurrence_id,
      outbox_occurrence_id: outboxOccurrenceId,
      task_ref: null,
      filename: ticket.filename,
      media_type: ticket.media_type,
      sha256: ticket.expected_sha256,
      size: ticket.expected_size,
      source_kind: "authenticated_chunked_upload",
      received_at: new Date(now()).toISOString(),
      local_outbox_status: staged.status,
      official_completion: false,
      official_history_written: false,
      project_promoted: false,
      source_deleted: false,
      source_overwritten: false,
    };
    await immutableJson(config.submissionRoot, submissionPath(submissionId), submission, "submission_conflict");
    await atomicJson(config.stateRoot, ticketPath(ticketId), {
      ...ticket,
      status: "finalized",
      finalized_at: new Date(now()).toISOString(),
      submission_id: submissionId,
    });
    return submissionStatus(principal, submissionId);
  }

  async function publishEvent(principalInput, lane, input) {
    if (!new Set(["structured_pc_work", "run_logs"]).has(lane)) fail("invalid_event_lane");
    const principal = await requireLivePrincipal(principalInput);
    const normalized = normalizeEvent(principal, lane, input);
    const inputDigest = sha256(canonical({ lane, ...normalized }));
    const idxPath = indexPath(principal, lane, normalized.idempotency_key);
    if (await exists(idxPath)) {
      const index = await readJson(idxPath, "event_idempotency_index_invalid");
      if (index.input_digest !== inputDigest) fail("idempotency_conflict", 409);
      return submissionStatus(principal, index.submission_id);
    }
    const submissionId = `sfigsub_${sha256(`${lane}\0${principal.credentialId}\0${normalized.idempotency_key}`).slice(0, 32)}`;
    const sourcePath = resolve(roots.events, `${submissionId}.json`);
    const eventEnvelope = {
      schema_version: "soulforge.ingress.bounded_event.v1",
      lane,
      actor: {
        account_id: principal.accountId,
        device_id: principal.deviceId,
        agent_id: principal.agentId,
      },
      ...normalized,
      accepted_history: false,
    };
    await immutableJson(config.stateRoot, sourcePath, eventEnvelope, "event_source_conflict");
    const outboxOccurrenceId = `mcp_${principal.credentialId}_${normalized.occurrence_id}`;
    const staged = await enqueueLocalOutboxFile({
      bindingPath: config.localOutboxBindingPath,
      lane,
      source: sourcePath,
      occurrenceId: outboxOccurrenceId,
      apply: true,
    });
    const sourceInfo = await stat(sourcePath);
    const sourceHash = await hashFile(sourcePath);
    const submission = {
      schema_version: INGRESS_MCP_SUBMISSION_SCHEMA,
      submission_id: submissionId,
      lane,
      credential_id: principal.credentialId,
      account_id: principal.accountId,
      device_id: principal.deviceId,
      agent_id: principal.agentId,
      project_hint: normalized.project_hint,
      occurrence_id: normalized.occurrence_id,
      outbox_occurrence_id: outboxOccurrenceId,
      task_ref: normalized.task_ref,
      filename: null,
      media_type: "application/json",
      sha256: sourceHash,
      size: sourceInfo.size,
      source_kind: "bounded_structured_event",
      received_at: new Date(now()).toISOString(),
      local_outbox_status: staged.status,
      official_completion: false,
      official_history_written: false,
      project_promoted: false,
      source_deleted: false,
      source_overwritten: false,
    };
    await immutableJson(config.submissionRoot, submissionPath(submissionId), submission, "submission_conflict");
    await immutableJson(config.stateRoot, idxPath, {
      schema_version: "soulforge.ingress.mcp_idempotency_index.v1",
      kind: lane,
      credential_id: principal.credentialId,
      idempotency_key: normalized.idempotency_key,
      input_digest: inputDigest,
      submission_id: submissionId,
    }, "idempotency_conflict");
    return submissionStatus(principal, submissionId);
  }

  return Object.freeze({
    config,
    authenticate,
    whoami: (principal) => publicPrincipal(principal),
    prepareUpload,
    uploadStatus,
    appendChunk,
    finalizeUpload,
    publishEvent,
    submissionStatus,
  });
}

export function hashIngressToken(token) {
  if (!TOKEN_RE.test(String(token || ""))) fail("invalid_ingress_token");
  return sha256(token);
}

export function generateIngressToken() {
  return `sfig_v1_${randomBytes(32).toString("base64url")}`;
}
