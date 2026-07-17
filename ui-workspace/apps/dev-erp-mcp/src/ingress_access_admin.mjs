import { randomBytes } from "node:crypto";
import { lstat, open, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";

import {
  generateIngressToken,
  hashIngressToken,
  INGRESS_MCP_AUTH_SCHEMA,
  normalizeIngressAuthRegistry,
} from "./ingress_mcp_service.mjs";

function fail(code, status = 400) {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  throw error;
}

function pathValue(value) {
  if (typeof value !== "string" || !isAbsolute(value)) fail("auth_registry_absolute_required");
  return resolve(value);
}

function comparable(value) {
  return process.platform === "win32" ? value.toLowerCase() : value;
}

async function assertNormalParent(path) {
  const parent = dirname(path);
  const info = await lstat(parent);
  if (!info.isDirectory() || info.isSymbolicLink()
    || comparable(await realpath(parent)) !== comparable(resolve(parent))) {
    fail("auth_registry_parent_unsafe");
  }
}

async function readRegistry(path) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink()
    || comparable(await realpath(path)) !== comparable(resolve(path))) fail("auth_registry_unsafe");
  let raw;
  try { raw = JSON.parse(await readFile(path, "utf8")); }
  catch { fail("invalid_ingress_mcp_auth_registry"); }
  normalizeIngressAuthRegistry(raw);
  return raw;
}

function revision(now) {
  return `rev_${new Date(now).toISOString().replace(/[-:.TZ]/g, "")}_${randomBytes(4).toString("hex")}`;
}

async function atomicRegistry(path, raw) {
  normalizeIngressAuthRegistry(raw);
  const temporary = `${path}.partial-${randomBytes(12).toString("hex")}`;
  try {
    await writeFile(temporary, `${JSON.stringify(raw, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function withLock(registryPath, operation) {
  const path = pathValue(registryPath);
  await assertNormalParent(path);
  const lockPath = `${path}.lock`;
  let lock;
  try {
    lock = await open(lockPath, "wx", 0o600);
  } catch (error) {
    if (error?.code === "EEXIST") fail("auth_registry_locked", 409);
    throw error;
  }
  try {
    await lock.writeFile(`${JSON.stringify({ pid: process.pid, acquired_at: new Date().toISOString() })}\n`);
    await lock.sync();
  } catch (error) {
    await lock.close().catch(() => {});
    await rm(lockPath, { force: true }).catch(() => {});
    throw error;
  }
  try { return await operation(path); }
  finally {
    await lock?.close();
    await rm(lockPath, { force: true });
  }
}

function publicRecord(entry) {
  return {
    credential_id: entry.credential_id,
    account_id: entry.account_id,
    device_id: entry.device_id,
    agent_id: entry.agent_id,
    project_scopes: entry.project_scopes,
    capabilities: entry.capabilities,
    created_at: entry.created_at,
    expires_at: entry.expires_at,
    revoked_at: entry.revoked_at,
  };
}

export async function initializeIngressAuthRegistry({ registryPath, now = Date.now() } = {}) {
  return withLock(registryPath, async (path) => {
    const raw = {
      schema_version: INGRESS_MCP_AUTH_SCHEMA,
      revision: revision(now),
      tokens: [],
    };
    try {
      await writeFile(path, `${JSON.stringify(raw, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
    } catch (error) {
      if (error?.code === "EEXIST") fail("auth_registry_already_exists", 409);
      throw error;
    }
    return { status: "initialized", revision: raw.revision, credential_count: 0 };
  });
}

export async function issueIngressCredential({
  registryPath,
  credentialId,
  accountId,
  deviceId,
  agentId,
  projectScopes,
  capabilities,
  expiresAt,
  now = Date.now(),
} = {}) {
  return withLock(registryPath, async (path) => {
    const raw = await readRegistry(path);
    if (raw.tokens.some((entry) => entry.credential_id === credentialId)) fail("credential_id_conflict", 409);
    const token = generateIngressToken();
    const expires = Number(expiresAt);
    if (!Number.isFinite(expires) || expires <= now) fail("credential_expiry_invalid");
    const entry = {
      credential_id: credentialId,
      account_id: accountId,
      device_id: deviceId,
      agent_id: agentId,
      token_hash: hashIngressToken(token),
      project_scopes: projectScopes,
      capabilities,
      created_at: new Date(now).toISOString(),
      expires_at: new Date(expires).toISOString(),
      revoked_at: null,
    };
    const next = { ...raw, revision: revision(now), tokens: [...raw.tokens, entry] };
    normalizeIngressAuthRegistry(next);
    await atomicRegistry(path, next);
    return {
      status: "issued",
      revision: next.revision,
      credential: publicRecord(entry),
      token,
      token_display_policy: "one_time_only",
    };
  });
}

export async function revokeIngressCredential({ registryPath, credentialId, revokedAt = Date.now(), now = Date.now() } = {}) {
  return withLock(registryPath, async (path) => {
    const raw = await readRegistry(path);
    const index = raw.tokens.findIndex((entry) => entry.credential_id === credentialId);
    if (index < 0) fail("credential_not_found", 404);
    if (raw.tokens[index].revoked_at) {
      return { status: "already_revoked", revision: raw.revision, credential: publicRecord(raw.tokens[index]) };
    }
    const tokens = raw.tokens.map((entry, entryIndex) => entryIndex === index
      ? { ...entry, revoked_at: new Date(revokedAt).toISOString() }
      : entry);
    const next = { ...raw, revision: revision(now), tokens };
    await atomicRegistry(path, next);
    return { status: "revoked", revision: next.revision, credential: publicRecord(tokens[index]) };
  });
}

export async function listIngressCredentials({ registryPath } = {}) {
  const path = pathValue(registryPath);
  const raw = await readRegistry(path);
  return {
    revision: raw.revision,
    credentials: raw.tokens.map(publicRecord),
    token_hashes_exposed: false,
  };
}
