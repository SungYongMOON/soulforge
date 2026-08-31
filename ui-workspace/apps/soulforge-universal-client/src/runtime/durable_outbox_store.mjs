import { createHash, randomUUID } from "node:crypto";
import {
  lstat,
  open,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";

import {
  acknowledgeFrame,
  createWorkSessionOutbox,
  enqueueFrame,
} from "./work_session_outbox.mjs";

export const DURABLE_OUTBOX_SCHEMA = "soulforge.universal_client.durable_outbox.v0";

const ENVELOPE_FIELDS = Object.freeze(["schema_version", "generation", "state", "state_digest"]);
const STATE_FIELDS = Object.freeze([
  "schema_version", "session_ref", "device_ref", "project_ref", "frames",
  "acknowledged_through", "official_task_completed", "accepted_knowledge_written",
]);
const FRAME_FIELDS = Object.freeze([
  "frame_ref", "sequence", "kind", "payload_ref", "payload_digest",
  "idempotency_key", "created_at", "acknowledgement",
]);
const ACK_FIELDS = Object.freeze(["receipt_ref", "acknowledged_at", "payload_digest"]);
const DIGEST = /^sha256:[0-9a-f]{64}$/u;

function fail(code) {
  const error = new TypeError(code);
  error.code = code;
  throw error;
}

function exact(value, fields, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  const keys = Object.keys(value).sort();
  const expected = [...fields].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) fail(code);
}

function digest(value) {
  return `sha256:${createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex")}`;
}

function freeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

async function normalRoot(value) {
  if (typeof value !== "string" || !isAbsolute(value)) fail("durable_outbox_root_invalid");
  const root = resolve(value);
  const info = await lstat(root).catch(() => null);
  if (!info?.isDirectory() || info.isSymbolicLink() || resolve(await realpath(root)) !== root) {
    fail("durable_outbox_root_unsafe");
  }
  return root;
}

function validateState(state) {
  exact(state, STATE_FIELDS, "durable_outbox_state_invalid");
  if (!Array.isArray(state.frames)) fail("durable_outbox_state_invalid");
  for (const frame of state.frames) {
    exact(frame, FRAME_FIELDS, "durable_outbox_state_invalid");
    if (frame.acknowledgement !== null) exact(frame.acknowledgement, ACK_FIELDS, "durable_outbox_state_invalid");
  }
  if (state.official_task_completed !== false || state.accepted_knowledge_written !== false) {
    fail("durable_outbox_authority_invalid");
  }
  return state;
}

function validateEnvelope(envelope) {
  exact(envelope, ENVELOPE_FIELDS, "durable_outbox_envelope_invalid");
  if (envelope.schema_version !== DURABLE_OUTBOX_SCHEMA
    || !Number.isSafeInteger(envelope.generation) || envelope.generation < 1
    || typeof envelope.state_digest !== "string" || !DIGEST.test(envelope.state_digest)) {
    fail("durable_outbox_envelope_invalid");
  }
  validateState(envelope.state);
  if (envelope.state_digest !== digest(envelope.state)) fail("durable_outbox_digest_mismatch");
  return envelope;
}

async function readEnvelope(root) {
  const statePath = join(root, "outbox-state.json");
  let bytes;
  try { bytes = await readFile(statePath, "utf8"); }
  catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
  let parsed;
  try { parsed = JSON.parse(bytes); }
  catch { fail("durable_outbox_json_invalid"); }
  return validateEnvelope(parsed);
}

async function writeEnvelope(root, envelope) {
  validateEnvelope(envelope);
  const statePath = join(root, "outbox-state.json");
  const temporary = join(root, `outbox-state.partial-${randomUUID()}`);
  try {
    await writeFile(temporary, `${JSON.stringify(envelope, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    const handle = await open(temporary, "r+");
    try { await handle.sync(); } finally { await handle.close(); }
    await rename(temporary, statePath);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function withLock(root, operation) {
  const lockPath = join(root, "outbox.lock");
  let handle;
  try { handle = await open(lockPath, "wx"); }
  catch (error) {
    if (error?.code === "EEXIST") fail("durable_outbox_locked");
    throw error;
  }
  try { return await operation(); }
  finally {
    await handle.close();
    await rm(lockPath, { force: true });
  }
}

export async function initializeDurableOutbox({ root: rootInput, session_ref, device_ref, project_ref } = {}) {
  const root = await normalRoot(rootInput);
  return withLock(root, async () => {
    const existing = await readEnvelope(root);
    if (existing) {
      if (existing.state.session_ref !== session_ref
        || existing.state.device_ref !== device_ref
        || existing.state.project_ref !== project_ref) fail("durable_outbox_binding_conflict");
      return freeze(structuredClone(existing));
    }
    const state = createWorkSessionOutbox({ session_ref, device_ref, project_ref });
    const envelope = {
      schema_version: DURABLE_OUTBOX_SCHEMA,
      generation: 1,
      state,
      state_digest: digest(state),
    };
    await writeEnvelope(root, envelope);
    return freeze(structuredClone(envelope));
  });
}

export async function loadDurableOutbox({ root: rootInput } = {}) {
  const root = await normalRoot(rootInput);
  const envelope = await readEnvelope(root);
  if (!envelope) fail("durable_outbox_missing");
  return freeze(structuredClone(envelope));
}

async function mutate(rootInput, operation) {
  const root = await normalRoot(rootInput);
  return withLock(root, async () => {
    const current = await readEnvelope(root);
    if (!current) fail("durable_outbox_missing");
    const outcome = operation(current.state);
    if (outcome.state === current.state) return freeze({ status: outcome.status, envelope: structuredClone(current) });
    const next = {
      schema_version: DURABLE_OUTBOX_SCHEMA,
      generation: current.generation + 1,
      state: outcome.state,
      state_digest: digest(outcome.state),
    };
    await writeEnvelope(root, next);
    return freeze({ status: outcome.status, envelope: structuredClone(next) });
  });
}

export function enqueueDurableFrame({ root, frame } = {}) {
  return mutate(root, (state) => enqueueFrame(state, frame));
}

export function acknowledgeDurableFrame({ root, acknowledgement } = {}) {
  return mutate(root, (state) => acknowledgeFrame(state, acknowledgement));
}
