import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  acknowledgeDurableFrame,
  enqueueDurableFrame,
  initializeDurableOutbox,
  loadDurableOutbox,
} from "../src/runtime/durable_outbox_store.mjs";

async function root() {
  return mkdtemp(join(tmpdir(), "soulforge-universal-client-outbox-"));
}

function frame(sequence = 1) {
  return {
    frame_ref: `frame.alpha.${sequence}`,
    sequence,
    kind: "result_candidate",
    payload_ref: `payload.alpha.${sequence}`,
    payload_digest: `sha256:${String(sequence).repeat(64)}`,
    idempotency_key: `idem-alpha-${sequence}`,
    created_at: `2026-09-01T00:0${sequence}:00.000Z`,
  };
}

test("durable outbox survives reopen, preserves pending ACK, and replays idempotently", async () => {
  const store = await root();
  await initializeDurableOutbox({
    root: store,
    session_ref: "session.alpha.1",
    device_ref: "device.alpha.1",
    project_ref: "project.alpha",
  });
  const appended = await enqueueDurableFrame({ root: store, frame: frame(1) });
  assert.equal(appended.envelope.state.frames[0].acknowledgement, null);
  const reopened = await loadDurableOutbox({ root: store });
  assert.equal(reopened.generation, 2);
  assert.equal(reopened.state.frames[0].payload_ref, "payload.alpha.1");
  const replay = await enqueueDurableFrame({ root: store, frame: frame(1) });
  assert.equal(replay.status, "NO_OP");
  assert.equal(replay.envelope.generation, 2);
});

test("exact ACK persists across restart without completing Task or knowledge", async () => {
  const store = await root();
  await initializeDurableOutbox({ root: store, session_ref: "session.a", device_ref: "device.a", project_ref: "project.a" });
  await enqueueDurableFrame({ root: store, frame: frame(1) });
  await acknowledgeDurableFrame({ root: store, acknowledgement: {
    frame_ref: "frame.alpha.1",
    sequence: 1,
    payload_digest: frame(1).payload_digest,
    receipt_ref: "receipt.alpha.1",
    acknowledged_at: "2026-09-01T00:02:00.000Z",
  } });
  const reopened = await loadDurableOutbox({ root: store });
  assert.equal(reopened.state.acknowledged_through, 1);
  assert.equal(reopened.state.official_task_completed, false);
  assert.equal(reopened.state.accepted_knowledge_written, false);
});

test("tamper, binding conflict, lock, and partial files fail closed", async () => {
  const store = await root();
  await initializeDurableOutbox({ root: store, session_ref: "session.a", device_ref: "device.a", project_ref: "project.a" });
  await assert.rejects(() => initializeDurableOutbox({
    root: store, session_ref: "session.other", device_ref: "device.a", project_ref: "project.a",
  }), /binding_conflict/u);
  await writeFile(join(store, "outbox.lock"), "held\n", "utf8");
  await assert.rejects(() => enqueueDurableFrame({ root: store, frame: frame(1) }), /locked/u);
  const locked = await readFile(join(store, "outbox-state.json"), "utf8");
  await writeFile(join(store, "outbox-state.partial-orphan"), locked, "utf8");
  const reopened = await loadDurableOutbox({ root: store });
  assert.equal(reopened.generation, 1);
  const parsed = JSON.parse(locked);
  parsed.state.project_ref = "project.tampered";
  await writeFile(join(store, "outbox-state.json"), `${JSON.stringify(parsed)}\n`, "utf8");
  await assert.rejects(() => loadDurableOutbox({ root: store }), /digest_mismatch/u);
});

test("root must be a real pre-existing directory", async () => {
  const base = await root();
  await assert.rejects(() => loadDurableOutbox({ root: join(base, "missing") }), /root_unsafe/u);
  const file = join(base, "file");
  await writeFile(file, "x", "utf8");
  await assert.rejects(() => loadDurableOutbox({ root: file }), /root_unsafe/u);
  await mkdir(join(base, "normal"));
});
