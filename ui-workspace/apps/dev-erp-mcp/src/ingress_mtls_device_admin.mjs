import { createHash, randomBytes, X509Certificate } from "node:crypto";
import { lstat, open, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";

import {
  INGRESS_MTLS_DEVICE_REGISTRY_SCHEMA,
  normalizeIngressMtlsDeviceRegistry,
} from "./ingress_mtls_gateway.mjs";

function fail(code, status = 400) {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  throw error;
}

function comparable(value) {
  return process.platform === "win32" ? value.toLowerCase() : value;
}

function absolute(value) {
  if (typeof value !== "string" || !isAbsolute(value)) fail("device_registry_absolute_required");
  return resolve(value);
}

async function normalFile(path, code) {
  let info;
  try { info = await lstat(path); } catch { fail(code); }
  if (!info.isFile() || info.isSymbolicLink()
    || comparable(await realpath(path)) !== comparable(resolve(path))) fail(code);
}

async function readRegistry(path) {
  await normalFile(path, "device_registry_unsafe");
  let raw;
  try { raw = JSON.parse(await readFile(path, "utf8")); } catch { fail("invalid_mtls_device_registry"); }
  normalizeIngressMtlsDeviceRegistry(raw);
  return raw;
}

function revision(now) {
  return `rev_${new Date(now).toISOString().replace(/[-:.TZ]/g, "")}_${randomBytes(4).toString("hex")}`;
}

async function atomic(path, raw) {
  normalizeIngressMtlsDeviceRegistry(raw);
  const temporary = `${path}.partial-${randomBytes(12).toString("hex")}`;
  try {
    await writeFile(temporary, `${JSON.stringify(raw, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function withLock(registryPath, operation) {
  const path = absolute(registryPath);
  const parent = dirname(path);
  const parentInfo = await lstat(parent);
  if (!parentInfo.isDirectory() || parentInfo.isSymbolicLink()
    || comparable(await realpath(parent)) !== comparable(resolve(parent))) fail("device_registry_parent_unsafe");
  const lockPath = `${path}.lock`;
  let lock;
  try { lock = await open(lockPath, "wx", 0o600); }
  catch (error) {
    if (error?.code === "EEXIST") fail("device_registry_locked", 409);
    throw error;
  }
  try { return await operation(path); }
  finally {
    await lock.close();
    await rm(lockPath, { force: true });
  }
}

function fingerprint(raw) {
  return createHash("sha256").update(raw).digest("hex");
}

function publicDevice(device) {
  return {
    certificate_ref: `sha256:${device.certificate_sha256.slice(0, 12)}`,
    credential_id: device.credential_id,
    account_id: device.account_id,
    device_id: device.device_id,
    allowed_agent_ids: device.allowed_agent_ids,
    created_at: device.created_at,
    expires_at: device.expires_at,
    revoked_at: device.revoked_at,
  };
}

export async function initializeIngressMtlsDeviceRegistry({ registryPath, now = Date.now() } = {}) {
  return withLock(registryPath, async (path) => {
    const raw = {
      schema_version: INGRESS_MTLS_DEVICE_REGISTRY_SCHEMA,
      revision: revision(now),
      devices: [],
    };
    try {
      await writeFile(path, `${JSON.stringify(raw, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
    } catch (error) {
      if (error?.code === "EEXIST") fail("device_registry_already_exists", 409);
      throw error;
    }
    return { status: "initialized", revision: raw.revision, device_count: 0 };
  });
}

export async function enrollIngressMtlsDevice({
  registryPath,
  certificatePath,
  credentialId,
  accountId,
  deviceId,
  allowedAgentIds,
  expiresAt,
  now = Date.now(),
} = {}) {
  const certPath = absolute(certificatePath);
  await normalFile(certPath, "device_certificate_unsafe");
  let certificate;
  try { certificate = new X509Certificate(await readFile(certPath)); }
  catch { fail("device_certificate_invalid"); }
  const certExpiry = Date.parse(certificate.validTo);
  const requestedExpiry = Number(expiresAt);
  if (certificate.ca || !certificate.keyUsage?.includes("1.3.6.1.5.5.7.3.2")
    || !Number.isFinite(certExpiry) || certExpiry <= now
    || !Number.isFinite(requestedExpiry) || requestedExpiry <= now || requestedExpiry > certExpiry) {
    fail("device_certificate_invalid");
  }
  const certificateSha256 = fingerprint(certificate.raw);
  return withLock(registryPath, async (path) => {
    const raw = await readRegistry(path);
    if (raw.devices.some((entry) => entry.certificate_sha256 === certificateSha256)) {
      fail("device_certificate_conflict", 409);
    }
    if (raw.devices.some((entry) => entry.credential_id === credentialId && entry.revoked_at === null)) {
      fail("active_device_credential_conflict", 409);
    }
    const device = {
      certificate_sha256: certificateSha256,
      credential_id: credentialId,
      account_id: accountId,
      device_id: deviceId,
      allowed_agent_ids: allowedAgentIds,
      created_at: new Date(now).toISOString(),
      expires_at: new Date(requestedExpiry).toISOString(),
      revoked_at: null,
    };
    const next = { ...raw, revision: revision(now), devices: [...raw.devices, device] };
    normalizeIngressMtlsDeviceRegistry(next);
    await atomic(path, next);
    return { status: "enrolled", revision: next.revision, device: publicDevice(device) };
  });
}

export async function revokeIngressMtlsDevice({ registryPath, credentialId, revokedAt = Date.now(), now = Date.now() } = {}) {
  return withLock(registryPath, async (path) => {
    const raw = await readRegistry(path);
    const index = raw.devices.findIndex((entry) => entry.credential_id === credentialId && entry.revoked_at === null);
    if (index < 0) fail("active_device_not_found", 404);
    const devices = raw.devices.map((entry, entryIndex) => entryIndex === index
      ? { ...entry, revoked_at: new Date(revokedAt).toISOString() }
      : entry);
    const next = { ...raw, revision: revision(now), devices };
    await atomic(path, next);
    return { status: "revoked", revision: next.revision, device: publicDevice(devices[index]) };
  });
}

export async function listIngressMtlsDevices({ registryPath } = {}) {
  const raw = await readRegistry(absolute(registryPath));
  return {
    revision: raw.revision,
    devices: raw.devices.map(publicDevice),
    full_fingerprints_exposed: false,
  };
}
