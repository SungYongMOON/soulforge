import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { BackupControllerError, loadBinding } from "./controller.mjs";

export const ACTIVATION_SCHEMA_VERSION = "soulforge.backup_controller.activation.v1";

const SAFE_ID = /^[a-z0-9][a-z0-9._-]{2,63}$/;
const SAFE_REF = /^[A-Za-z0-9][A-Za-z0-9_.-]{7,127}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const GIT_SHA1 = /^[a-f0-9]{40}$/;

function fail(code) {
  throw new BackupControllerError(code);
}

function exactKeys(value, expected, code) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail(code);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) fail(code);
}

function iso(value, code) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value)) || new Date(value).toISOString() !== value) fail(code);
  return value;
}

function normalizeHost(value) {
  return String(value).trim().toLowerCase();
}

export function validateActivationSidecar(sidecar) {
  exactKeys(sidecar, ["schema_version", "binding_ref", "expected_binding_sha256", "runtime_commit_sha", "approval_ref", "writer", "feature_state", "not_before", "expires_at"], "activation_shape_invalid");
  if (sidecar.schema_version !== ACTIVATION_SCHEMA_VERSION) fail("activation_schema_invalid");
  if (typeof sidecar.binding_ref !== "string" || !path.isAbsolute(sidecar.binding_ref)) fail("activation_binding_ref_invalid");
  sidecar.binding_ref = path.resolve(sidecar.binding_ref);
  if (typeof sidecar.expected_binding_sha256 !== "string" || !SHA256.test(sidecar.expected_binding_sha256)) fail("activation_binding_digest_invalid");
  if (typeof sidecar.runtime_commit_sha !== "string" || !GIT_SHA1.test(sidecar.runtime_commit_sha)) fail("activation_runtime_commit_invalid");
  if (typeof sidecar.approval_ref !== "string" || !SAFE_REF.test(sidecar.approval_ref)) fail("activation_approval_ref_invalid");
  exactKeys(sidecar.writer, ["node_id", "hostname", "platform"], "activation_writer_invalid");
  if (!SAFE_ID.test(sidecar.writer.node_id) || !SAFE_ID.test(sidecar.writer.hostname) || sidecar.writer.platform !== "win32") fail("activation_writer_invalid");
  sidecar.writer.hostname = normalizeHost(sidecar.writer.hostname);
  if (sidecar.feature_state !== "off" && sidecar.feature_state !== "on") fail("activation_feature_state_invalid");
  iso(sidecar.not_before, "activation_not_before_invalid");
  iso(sidecar.expires_at, "activation_expiry_invalid");
  if (Date.parse(sidecar.expires_at) <= Date.parse(sidecar.not_before)) fail("activation_window_invalid");
  return sidecar;
}

export async function loadActivationSidecar(sidecarRef) {
  if (typeof sidecarRef !== "string" || !path.isAbsolute(sidecarRef)) fail("activation_sidecar_ref_invalid");
  const resolved = path.resolve(sidecarRef);
  let bytes;
  try {
    bytes = await readFile(resolved);
  } catch {
    fail("activation_sidecar_read_failed");
  }
  let sidecar;
  try {
    sidecar = JSON.parse(bytes.toString("utf8"));
  } catch {
    fail("activation_sidecar_json_invalid");
  }
  validateActivationSidecar(sidecar);
  return {
    sidecar,
    sidecar_ref: resolved,
    sidecar_sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

export async function resolveActivation({ sidecarRef, now = new Date(), observedHost = { hostname: os.hostname(), platform: process.platform } } = {}) {
  const instant = now instanceof Date ? new Date(now.getTime()) : new Date(now);
  if (Number.isNaN(instant.getTime())) fail("now_invalid");
  const loaded = await loadActivationSidecar(sidecarRef);
  const { binding, binding_sha256: bindingSha256 } = await loadBinding(loaded.sidecar.binding_ref);
  const sidecar = loaded.sidecar;
  if (sidecar.expected_binding_sha256 !== bindingSha256) fail("activation_binding_digest_mismatch");
  if (sidecar.approval_ref !== binding.activation.approval_ref) fail("activation_approval_ref_mismatch");
  if (sidecar.feature_state !== binding.feature_state) fail("activation_feature_state_mismatch");
  if (sidecar.not_before !== binding.activation.not_before) fail("activation_not_before_mismatch");
  if (sidecar.writer.node_id !== binding.writer.node_id || sidecar.writer.hostname !== binding.writer.hostname || sidecar.writer.platform !== binding.writer.platform) fail("activation_writer_mismatch");
  if (normalizeHost(observedHost?.hostname) !== binding.writer.hostname || observedHost?.platform !== binding.writer.platform) fail("observed_writer_mismatch");
  const timestamp = instant.getTime();
  if (timestamp < Date.parse(sidecar.not_before)) fail("activation_not_yet_valid");
  if (timestamp >= Date.parse(sidecar.expires_at)) fail("activation_expired");
  return Object.freeze({
    ...loaded,
    binding,
    binding_sha256: bindingSha256,
    feature_enabled: sidecar.feature_state === "on",
    observed_at: instant.toISOString(),
  });
}
