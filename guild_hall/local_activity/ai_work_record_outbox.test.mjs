import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  AI_WORK_RECORD_STORAGE_CLASSIFICATION,
  AiWorkRecordOutboxError,
  acknowledgeAiWorkRecordEvent,
  appendAiWorkRecordEvent,
  assertSyntheticAiWorkRecordRoot,
  getAiWorkRecordOutboxPaths,
  inspectAiWorkRecordCandidate,
  listPendingAiWorkRecordEvents,
  readAiWorkRecordHistory,
  validateAiWorkRecordOutboxBatch,
  withAiWorkRecordOutboxLock,
} from "./ai_work_record_outbox.mjs";
import {
  AI_WORK_RECORD_EVENT_SCHEMA_VERSION,
  computeAiWorkRecordEventDigest,
  sealAiWorkRecordEvent,
} from "../shared/ai_work_record_event.mjs";

const execFileAsync = promisify(execFile);
const PROJECT = "project_synthetic";
const STARTED_AT = "2026-07-30T00:00:00.000Z";
const CLI_PATH = fileURLToPath(
  new URL("./ai_work_record_outbox_cli.mjs", import.meta.url),
);

function metadataRef(refKind, refId) {
  return { ref_kind: refKind, ref_id: refId };
}

function startEvent(overrides = {}) {
  return sealAiWorkRecordEvent({
    schema_version: AI_WORK_RECORD_EVENT_SCHEMA_VERSION,
    event_id: "aiwr.event.001",
    work_id: "aiwr.work.001",
    idempotency_key: "aiwr.idem.001",
    event_kind: "start",
    sequence: 0,
    previous_event_digest: null,
    project_ref: PROJECT,
    task_ref: "task.synthetic",
    actor: {
      node_id: "node.synthetic",
      agent_id: "agent.synthetic",
      tool: "codex",
      tool_version: "v1.0",
    },
    started_at: STARTED_AT,
    occurred_at: STARTED_AT,
    recorded_at: STARTED_AT,
    status: "active",
    purpose: "Record bounded synthetic work metadata.",
    scope: "Public synthetic A2 outbox fixture.",
    source_refs: [],
    result_refs: [],
    evidence_refs: [],
    stop_conditions: [],
    uncertainties: [],
    metadata_boundary: "metadata_only",
    official_completion: false,
    whole_chat_capture: false,
    screen_capture: false,
    keyboard_capture: false,
    os_activity_capture: false,
    ...overrides,
  });
}

function nextEvent(previous, overrides = {}) {
  const sequence = overrides.sequence ?? previous.sequence + 1;
  const eventKind = overrides.event_kind ?? "checkpoint";
  return sealAiWorkRecordEvent({
    schema_version: AI_WORK_RECORD_EVENT_SCHEMA_VERSION,
    event_id: `aiwr.event.${String(sequence + 1).padStart(3, "0")}`,
    work_id: previous.work_id,
    idempotency_key: `aiwr.idem.${String(sequence + 1).padStart(3, "0")}`,
    event_kind: eventKind,
    sequence,
    previous_event_digest: previous.event_digest,
    project_ref: previous.project_ref,
    task_ref: previous.task_ref,
    actor: { ...previous.actor },
    started_at: previous.started_at,
    occurred_at: new Date(
      Date.parse(previous.occurred_at) + 1000,
    ).toISOString(),
    recorded_at: new Date(
      Date.parse(previous.recorded_at) + 1000,
    ).toISOString(),
    status: {
      checkpoint: "active",
      closeout_pending: "closeout_pending",
      closeout: "closed",
      correction: "closed",
    }[eventKind],
    purpose: "Record next bounded synthetic work metadata.",
    scope: previous.scope,
    source_refs: [],
    result_refs: [],
    evidence_refs: [],
    stop_conditions: [],
    uncertainties: [],
    metadata_boundary: "metadata_only",
    official_completion: false,
    whole_chat_capture: false,
    screen_capture: false,
    keyboard_capture: false,
    os_activity_capture: false,
    ...overrides,
  });
}

function closeoutEvent(pending, overrides = {}) {
  return nextEvent(pending, {
    event_kind: "closeout",
    status: "closed",
    closeout_kind: "completed_candidate",
    result_refs: [metadataRef("result", "result.synthetic.001")],
    evidence_refs: [metadataRef("test", "test.synthetic.001")],
    ...overrides,
  });
}

function correctionEvent(previous, target) {
  return nextEvent(previous, {
    event_kind: "correction",
    status: "closed",
    correction_ref: {
      event_id: target.event_id,
      event_digest: target.event_digest,
      reason: "Correct synthetic metadata annotation.",
    },
  });
}

function redigest(event) {
  const changed = { ...event };
  delete changed.event_digest;
  changed.event_digest = computeAiWorkRecordEventDigest(changed);
  return changed;
}

async function syntheticRoot(t) {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "soulforge-ai-work-record-test-"),
  );
  t.after(async () => {
    await rm(root, { recursive: true, force: true });
    await assert.rejects(() => readFile(root), { code: "ENOENT" });
  });
  return root;
}

let lockCounter = 0;

async function withSyntheticLock(root, callback) {
  lockCounter += 1;
  const suffix = String(lockCounter).padStart(3, "0");
  return withAiWorkRecordOutboxLock({
    stateRoot: root,
    projectCode: PROJECT,
    ownerToken: `owner.synthetic.${suffix}`,
    fencingToken: `fence.synthetic.${suffix}`,
    acquiredAt: `2026-07-30T00:10:${suffix.slice(1)}.000Z`,
  }, callback);
}

async function publish(root, event, attemptSuffix, onDurableStep = null) {
  return withSyntheticLock(root, (fence) => appendAiWorkRecordEvent({
    stateRoot: root,
    projectCode: PROJECT,
    event,
    attemptId: `attempt.synthetic.${attemptSuffix}`,
    attemptedAt: event.recorded_at,
    fence,
    onDurableStep,
  }));
}

async function listFiles(root) {
  const output = [];
  async function walk(directory) {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error?.code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(target);
      else output.push(path.relative(root, target).replaceAll("\\", "/"));
    }
  }
  await walk(root);
  return output.sort((left, right) => left.localeCompare(right, "en"));
}

async function planSyntheticBackup(root) {
  const projectRoot = path.join(root, "projects", PROJECT);
  const allowed = new Map([
    ["outbox", new Set(["ai_work_record"])],
    ["state", new Set(["ai_work_record"])],
  ]);
  const unclassified = [];
  for (const owner of await readdir(projectRoot, { withFileTypes: true })) {
    const children = allowed.get(owner.name);
    if (!owner.isDirectory() || !children) {
      unclassified.push(owner.name);
      continue;
    }
    for (const child of await readdir(
      path.join(projectRoot, owner.name),
      { withFileTypes: true },
    )) {
      if (!child.isDirectory() || !children.has(child.name)) {
        unclassified.push(`${owner.name}/${child.name}`);
      }
    }
  }
  if (unclassified.length > 0) {
    const error = new Error("unclassified_entries");
    error.entries = unclassified.sort((left, right) => (
      left.localeCompare(right, "en")
    ));
    throw error;
  }
  const prefix = `projects/${PROJECT}/`;
  const includedPrefixes = Object.entries(
    AI_WORK_RECORD_STORAGE_CLASSIFICATION,
  )
    .filter(([, classification]) => (
      classification === "backup_recovery_included"
    ))
    .map(([relative]) => `${prefix}${relative}/`);
  return (await listFiles(root)).filter((relative) => (
    includedPrefixes.some((included) => relative.startsWith(included))
    && !relative.endsWith(".tmp")
  ));
}

async function copyRelativeFiles(sourceRoot, targetRoot, relativeFiles) {
  for (const relative of relativeFiles) {
    const target = path.join(targetRoot, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(path.join(sourceRoot, relative), target);
  }
}

function assertOutboxCode(error, code) {
  assert.equal(error instanceof AiWorkRecordOutboxError, true);
  assert.equal(error.code, code);
  assert.equal(error.message, code);
  return true;
}

test("dedicated layout and NAS classification exclude legacy ingress surfaces", async (t) => {
  const root = await syntheticRoot(t);
  assert.equal(assertSyntheticAiWorkRecordRoot(root), root);
  const paths = getAiWorkRecordOutboxPaths({
    stateRoot: root,
    projectCode: PROJECT,
  });
  assert.equal(
    path.relative(root, paths.events).replaceAll("\\", "/"),
    `projects/${PROJECT}/outbox/ai_work_record/events`,
  );
  assert.equal(
    path.relative(root, paths.pending).replaceAll("\\", "/"),
    `projects/${PROJECT}/outbox/ai_work_record/pending`,
  );
  assert.equal(
    path.relative(root, paths.retry_index).replaceAll("\\", "/"),
    `projects/${PROJECT}/state/ai_work_record/retry_index`,
  );
  assert.deepEqual(AI_WORK_RECORD_STORAGE_CLASSIFICATION, {
    "outbox/ai_work_record/events": "backup_recovery_included",
    "outbox/ai_work_record/pending": "backup_recovery_included",
    "outbox/ai_work_record/receipts": "backup_recovery_included",
    "state/ai_work_record/retry_index": "backup_recovery_included",
    "state/ai_work_record/lock": "regenerable_excluded",
  });
  assert.doesNotMatch(
    Object.values(paths).join("\n"),
    /(?:ingress|local_outbox|structured_pc_work)/u,
  );
});

test("synthetic backup and restore include declared surfaces, exclude lock/temp, and HOLD unknown entries", async (t) => {
  const root = await syntheticRoot(t);
  const backup = await mkdtemp(
    path.join(os.tmpdir(), "soulforge-ai-work-record-backup-test-"),
  );
  const restored = await syntheticRoot(t);
  t.after(() => rm(backup, { recursive: true, force: true }));
  await publish(root, startEvent(), "backup.0");
  const paths = getAiWorkRecordOutboxPaths({
    stateRoot: root,
    projectCode: PROJECT,
  });
  await mkdir(path.dirname(paths.lock), { recursive: true });
  await writeFile(paths.lock, "regenerable synthetic lock\n", "utf8");
  await writeFile(
    path.join(paths.events, ".orphan.atomic.tmp"),
    "regenerable synthetic temp\n",
    "utf8",
  );
  const unknown = path.join(paths.project_root, "unknown_surface");
  await mkdir(unknown, { recursive: true });
  await writeFile(path.join(unknown, "probe.json"), "{}\n", "utf8");
  await assert.rejects(
    () => planSyntheticBackup(root),
    (error) => {
      assert.equal(error.message, "unclassified_entries");
      assert.deepEqual(error.entries, ["unknown_surface"]);
      return true;
    },
  );
  assert.deepEqual(await listFiles(backup), []);

  await rm(unknown, { recursive: true, force: true });
  const included = await planSyntheticBackup(root);
  assert.equal(included.some((file) => file.includes("/events/")), true);
  assert.equal(included.some((file) => file.includes("/pending/")), true);
  assert.equal(included.some((file) => file.includes("/receipts/")), true);
  assert.equal(included.some((file) => file.includes("/retry_index/")), true);
  assert.equal(included.some((file) => file.endsWith("/lock")), false);
  assert.equal(included.some((file) => file.endsWith(".tmp")), false);

  await copyRelativeFiles(root, backup, included);
  await copyRelativeFiles(backup, restored, included);
  assert.deepEqual(await listFiles(restored), included);
  for (const relative of included) {
    assert.equal(
      await readFile(path.join(restored, relative), "utf8"),
      await readFile(path.join(root, relative), "utf8"),
    );
  }
});

test("mutation is synthetic-temp-only and rejects an HPP-like absolute root", async () => {
  const liveLike = path.resolve(
    os.tmpdir(),
    "nested",
    "soulforge-ai-work-record-test-not-direct",
  );
  assert.throws(
    () => assertSyntheticAiWorkRecordRoot(liveLike),
    (error) => assertOutboxCode(error, "synthetic_state_root_required"),
  );
  await assert.rejects(
    () => withAiWorkRecordOutboxLock({
      stateRoot: liveLike,
      projectCode: PROJECT,
      ownerToken: "owner.synthetic",
      fencingToken: "fence.synthetic",
      acquiredAt: STARTED_AT,
    }, async () => {}),
    (error) => assertOutboxCode(error, "synthetic_state_root_required"),
  );

  const outsideTemporaryRoot = path.resolve(
    process.cwd(),
    `soulforge-ai-work-record-test-outside-${process.pid}`,
  );
  assert.equal(
    path.basename(outsideTemporaryRoot).startsWith(
      "soulforge-ai-work-record-test-",
    ),
    true,
  );
  await assert.rejects(
    () => withAiWorkRecordOutboxLock({
      stateRoot: outsideTemporaryRoot,
      projectCode: PROJECT,
      ownerToken: "owner.synthetic.outside",
      fencingToken: "fence.synthetic.outside",
      acquiredAt: STARTED_AT,
    }, async () => {}),
    (error) => assertOutboxCode(error, "synthetic_state_root_required"),
  );
  await assert.rejects(
    () => lstat(outsideTemporaryRoot),
    (error) => error?.code === "ENOENT",
  );
});

test("synthetic writer rejects a pre-existing symlink in its selected path", async (t) => {
  const root = await syntheticRoot(t);
  const projectRoot = path.join(root, "projects", PROJECT);
  const escapeTarget = path.join(root, "synthetic-escape-target");
  await mkdir(projectRoot, { recursive: true });
  await mkdir(escapeTarget, { recursive: true });
  try {
    await symlink(
      escapeTarget,
      path.join(projectRoot, "outbox"),
      process.platform === "win32" ? "junction" : "dir",
    );
  } catch (error) {
    if (error?.code === "EPERM") {
      t.skip("host policy does not permit a synthetic symlink probe");
      return;
    }
    throw error;
  }
  await assert.rejects(
    () => publish(root, startEvent(), "symlink.0"),
    (error) => assertOutboxCode(error, "outbox_symlink_forbidden"),
  );
  assert.deepEqual(await listFiles(escapeTarget), []);
});

test("strict schema then JS validation then reducer all run before any write", async (t) => {
  const root = await syntheticRoot(t);
  const unknown = { ...startEvent(), unexpected_field: "synthetic" };
  await assert.rejects(
    () => publish(root, unknown, "schema"),
    (error) => assertOutboxCode(error, "strict_schema_validation_failed"),
  );
  assert.deepEqual(await listFiles(root), []);

  const impossible = redigest({
    ...startEvent(),
    started_at: "2026-02-30T00:00:00.000Z",
    occurred_at: "2026-02-30T00:00:00.000Z",
    recorded_at: "2026-02-30T00:00:00.000Z",
  });
  await assert.rejects(
    () => publish(root, impossible, "validator"),
    (error) => assertOutboxCode(error, "event_validation_failed"),
  );
  assert.deepEqual(await listFiles(root), []);

  const start = startEvent();
  const gap = nextEvent(start, { sequence: 2 });
  await assert.rejects(
    () => publish(root, gap, "reducer"),
    (error) => assertOutboxCode(error, "reducer_hold_start_event_required"),
  );
  assert.deepEqual(await listFiles(root), []);

  await assert.rejects(
    () => withSyntheticLock(root, (fence) => appendAiWorkRecordEvent({
      stateRoot: root,
      projectCode: PROJECT,
      event: startEvent(),
      attemptId: "attempt.synthetic.invalid-time",
      attemptedAt: "not-a-time",
      fence,
    })),
    (error) => assertOutboxCode(error, "attempted_at_invalid"),
  );
  assert.deepEqual(await listFiles(root), []);

  const longAttempt = `attempt.${"a".repeat(112)}`;
  const longAttemptResult = await withSyntheticLock(
    root,
    (fence) => appendAiWorkRecordEvent({
      stateRoot: root,
      projectCode: PROJECT,
      event: startEvent(),
      attemptId: longAttempt,
      attemptedAt: STARTED_AT,
      fence,
    }),
  );
  assert.equal(longAttemptResult.disposition, "local_persisted");
});

test("full lifecycle is append-only, ordered pending, acked without deletion, and correction-preserving", async (t) => {
  const root = await syntheticRoot(t);
  const start = startEvent();
  const checkpoint = nextEvent(start);
  const pending = nextEvent(checkpoint, {
    event_kind: "closeout_pending",
    status: "closeout_pending",
  });
  const closeout = closeoutEvent(pending);
  const correction = correctionEvent(closeout, checkpoint);
  const lifecycle = [start, checkpoint, pending, closeout, correction];

  for (const [index, event] of lifecycle.entries()) {
    const result = await publish(root, event, `lifecycle.${index}`);
    assert.equal(result.official_completion, false);
    assert.equal(result.receipt_state, "local_persisted");
  }
  const history = await readAiWorkRecordHistory({
    stateRoot: root,
    projectCode: PROJECT,
    workId: start.work_id,
  });
  assert.deepEqual(
    history.map((event) => event.event_kind),
    ["start", "checkpoint", "closeout_pending", "closeout", "correction"],
  );
  assert.deepEqual(history.at(-1).correction_ref, correction.correction_ref);

  const beforeAck = await listPendingAiWorkRecordEvents({
    stateRoot: root,
    projectCode: PROJECT,
  });
  assert.equal(beforeAck.pending_count, 5);
  assert.deepEqual(
    [...beforeAck.pending].sort((left, right) => (
      left.order_key.localeCompare(right.order_key, "en")
    )),
    beforeAck.pending,
  );

  const ack = await withSyntheticLock(root, (fence) =>
    acknowledgeAiWorkRecordEvent({
      stateRoot: root,
      projectCode: PROJECT,
      workId: start.work_id,
      eventId: start.event_id,
      eventDigest: start.event_digest,
      sequence: start.sequence,
      ackId: "ack.synthetic.001",
      ackedAt: "2026-07-30T00:20:00.000Z",
      fence,
    }));
  assert.equal(ack.disposition, "acknowledged");
  const afterAck = await listPendingAiWorkRecordEvents({
    stateRoot: root,
    projectCode: PROJECT,
  });
  assert.equal(afterAck.pending_count, 4);
  assert.equal(
    afterAck.pending.some((item) => item.event_id === start.event_id),
    false,
  );
  assert.equal(
    (await readAiWorkRecordHistory({
      stateRoot: root,
      projectCode: PROJECT,
      workId: start.work_id,
    })).length,
    5,
  );
});

test("missing terminal result or evidence cannot close and creates no artifact", async (t) => {
  const root = await syntheticRoot(t);
  const start = startEvent();
  const pending = nextEvent(start, {
    event_kind: "closeout_pending",
    status: "closeout_pending",
  });
  await publish(root, start, "close-gate.0");
  await publish(root, pending, "close-gate.1");
  const valid = closeoutEvent(pending);
  const invalid = redigest({
    ...valid,
    result_refs: [],
    evidence_refs: [],
  });
  await assert.rejects(
    () => publish(root, invalid, "close-gate.2"),
    (error) => assertOutboxCode(error, "strict_schema_validation_failed"),
  );
  const history = await readAiWorkRecordHistory({
    stateRoot: root,
    projectCode: PROJECT,
    workId: start.work_id,
  });
  assert.deepEqual(
    history.map((event) => event.event_kind),
    ["start", "closeout_pending"],
  );
});

test("identical replay is a no-op repair while event and idempotency conflicts HOLD", async (t) => {
  const root = await syntheticRoot(t);
  const start = startEvent();
  const first = await publish(root, start, "replay.0");
  const second = await publish(root, start, "replay.1");
  assert.equal(first.disposition, "local_persisted");
  assert.equal(second.disposition, "replayed_local_persisted");
  assert.equal((await readAiWorkRecordHistory({
    stateRoot: root,
    projectCode: PROJECT,
    workId: start.work_id,
  })).length, 1);

  const eventIdConflict = sealAiWorkRecordEvent({
    ...start,
    purpose: "Different synthetic purpose.",
  });
  await assert.rejects(
    () => publish(root, eventIdConflict, "conflict.event"),
    (error) => assertOutboxCode(
      error,
      "reducer_hold_event_id_conflict",
    ),
  );
  const idempotencyConflict = nextEvent(start, {
    idempotency_key: start.idempotency_key,
  });
  await assert.rejects(
    () => publish(root, idempotencyConflict, "conflict.idempotency"),
    (error) => assertOutboxCode(
      error,
      "reducer_hold_idempotency_key_conflict",
    ),
  );
});

test("event and idempotency identities cannot be reused by another work chain", async (t) => {
  const root = await syntheticRoot(t);
  const first = startEvent();
  await publish(root, first, "project-identity.0");
  const reusedEventId = startEvent({
    work_id: "aiwr.work.002",
    idempotency_key: "aiwr.idem.002",
  });
  await assert.rejects(
    () => publish(root, reusedEventId, "project-identity.1"),
    (error) => assertOutboxCode(error, "event_id_conflict"),
  );
  const reusedIdempotency = startEvent({
    event_id: "aiwr.event.002",
    work_id: "aiwr.work.003",
  });
  await assert.rejects(
    () => publish(root, reusedIdempotency, "project-identity.2"),
    (error) => assertOutboxCode(error, "idempotency_key_conflict"),
  );
  assert.equal((await readAiWorkRecordHistory({
    stateRoot: root,
    projectCode: PROJECT,
    workId: first.work_id,
  })).length, 1);
});

test("sequence, previous digest, lifecycle order, and time regressions HOLD", () => {
  const start = startEvent();
  const checkpoint = nextEvent(start);
  const cases = [
    nextEvent(start, { sequence: 2 }),
    nextEvent(start, {
      previous_event_digest: `sha256:${"a".repeat(64)}`,
    }),
    nextEvent(start, {
      event_kind: "closeout",
      status: "closed",
      closeout_kind: "completed_candidate",
      result_refs: [metadataRef("result", "result.synthetic.001")],
      evidence_refs: [metadataRef("test", "test.synthetic.001")],
    }),
    nextEvent(checkpoint, {
      occurred_at: start.occurred_at,
      recorded_at: start.recorded_at,
    }),
  ];
  for (const candidate of cases) {
    assert.throws(
      () => validateAiWorkRecordOutboxBatch(
        [candidate],
        candidate.sequence === 2 && candidate.previous_event_digest === checkpoint.event_digest
          ? [start, checkpoint]
          : [start],
      ),
      (error) => {
        assert.equal(error instanceof AiWorkRecordOutboxError, true);
        assert.match(error.code, /^reducer_hold_/u);
        return true;
      },
    );
  }
});

test("fencing mismatch HOLDs before durable event publication", async (t) => {
  const root = await syntheticRoot(t);
  const paths = getAiWorkRecordOutboxPaths({
    stateRoot: root,
    projectCode: PROJECT,
  });
  await assert.rejects(
    () => withSyntheticLock(root, async (fence) => {
      await writeFile(paths.lock, `${JSON.stringify({
        owner_token: "owner.superseding",
        fencing_token: "fence.superseding",
        acquired_at: "2026-07-30T00:30:00.000Z",
      })}\n`, "utf8");
      return appendAiWorkRecordEvent({
        stateRoot: root,
        projectCode: PROJECT,
        event: startEvent(),
        attemptId: "attempt.fenced",
        attemptedAt: STARTED_AT,
        fence,
      });
    }),
    (error) => assertOutboxCode(error, "fencing_token_mismatch"),
  );
  assert.equal(
    (await listFiles(root)).some((file) => file.includes("/events/")),
    false,
  );
});

test("lock contention HOLDs and never recovers or overwrites another owner", async (t) => {
  const root = await syntheticRoot(t);
  await withSyntheticLock(root, async () => {
    await assert.rejects(
      () => withSyntheticLock(root, async () => {}),
      (error) => assertOutboxCode(error, "outbox_lock_busy"),
    );
  });
});

test("crash after immutable event publish is healed by deterministic retry", async (t) => {
  const root = await syntheticRoot(t);
  const start = startEvent();
  await assert.rejects(
    () => publish(root, start, "crash.0", async (step) => {
      if (step === "event.complete") {
        const error = new Error("synthetic_crash");
        error.code = "synthetic_crash";
        throw error;
      }
    }),
    { code: "synthetic_crash" },
  );
  assert.equal((await readAiWorkRecordHistory({
    stateRoot: root,
    projectCode: PROJECT,
    workId: start.work_id,
  })).length, 1);
  assert.equal((await listPendingAiWorkRecordEvents({
    stateRoot: root,
    projectCode: PROJECT,
  })).pending_count, 0);

  const repaired = await publish(root, start, "crash.1");
  assert.equal(repaired.disposition, "replayed_local_persisted");
  assert.equal((await listPendingAiWorkRecordEvents({
    stateRoot: root,
    projectCode: PROJECT,
  })).pending_count, 1);
});

test("temporary write failure cleans temp files; orphan temp is ignored; retry publishes", async (t) => {
  const root = await syntheticRoot(t);
  const start = startEvent();
  await assert.rejects(
    () => publish(root, start, "rename.0", async (step) => {
      if (step === "event.temporary_synced") {
        const error = new Error("synthetic_rename_failure");
        error.code = "synthetic_rename_failure";
        throw error;
      }
    }),
    { code: "synthetic_rename_failure" },
  );
  assert.equal(
    (await listFiles(root)).some((file) => file.endsWith(".tmp")),
    false,
  );
  const paths = getAiWorkRecordOutboxPaths({
    stateRoot: root,
    projectCode: PROJECT,
  });
  const eventDir = path.join(paths.events, start.work_id);
  await mkdir(eventDir, { recursive: true });
  const attemptId = "attempt.synthetic.rename.1";
  const token = `tmp.${createHash("sha256")
    .update(`${attemptId}\u0000event`)
    .digest("hex")
    .slice(0, 32)}`;
  const eventFile = [
    String(start.sequence).padStart(16, "0"),
    start.event_digest.replace(":", "-"),
  ].join("-") + ".json";
  await writeFile(
    path.join(eventDir, `.${eventFile}.${token}.tmp`),
    "synthetic incomplete bytes",
    "utf8",
  );
  const result = await publish(root, start, "rename.1");
  assert.equal(result.disposition, "local_persisted");
  assert.equal((await readAiWorkRecordHistory({
    stateRoot: root,
    projectCode: PROJECT,
    workId: start.work_id,
  })).length, 1);
});

test("ack requires local_persisted receipt and conflicting identity HOLDs", async (t) => {
  const root = await syntheticRoot(t);
  const start = startEvent();
  await assert.rejects(
    () => withSyntheticLock(root, (fence) => acknowledgeAiWorkRecordEvent({
      stateRoot: root,
      projectCode: PROJECT,
      workId: start.work_id,
      eventId: start.event_id,
      eventDigest: start.event_digest,
      sequence: start.sequence,
      ackId: "ack.synthetic.missing",
      ackedAt: "2026-07-30T00:40:00.000Z",
      fence,
    })),
    (error) => assertOutboxCode(error, "ack_event_not_found"),
  );
  await publish(root, start, "ack.0");
  await assert.rejects(
    () => withSyntheticLock(root, (fence) => acknowledgeAiWorkRecordEvent({
      stateRoot: root,
      projectCode: PROJECT,
      workId: start.work_id,
      eventId: start.event_id,
      eventDigest: start.event_digest,
      sequence: start.sequence,
      ackId: "ack.synthetic.too-early",
      ackedAt: "2026-07-29T23:59:59.999Z",
      fence,
    })),
    (error) => assertOutboxCode(error, "ack_time_before_event"),
  );
  await assert.rejects(
    () => withSyntheticLock(root, (fence) => acknowledgeAiWorkRecordEvent({
      stateRoot: root,
      projectCode: PROJECT,
      workId: start.work_id,
      eventId: start.event_id,
      eventDigest: `sha256:${"b".repeat(64)}`,
      sequence: start.sequence,
      ackId: "ack.synthetic.conflict",
      ackedAt: "2026-07-30T00:40:01.000Z",
      fence,
    })),
    (error) => assertOutboxCode(error, "ack_event_conflict"),
  );
});

test("tampered, renamed, or foreign queue receipts HOLD instead of hiding pending work", async (t) => {
  const tamperedPendingRoot = await syntheticRoot(t);
  await publish(tamperedPendingRoot, startEvent(), "tamper.pending");
  const pendingRelative = (await listFiles(tamperedPendingRoot)).find(
    (file) => file.includes("/outbox/ai_work_record/pending/"),
  );
  const pendingPath = path.join(tamperedPendingRoot, pendingRelative);
  const pendingRecord = JSON.parse(await readFile(pendingPath, "utf8"));
  pendingRecord.receipt_digest = `sha256:${"0".repeat(64)}`;
  await writeFile(
    pendingPath,
    `${JSON.stringify(pendingRecord, null, 2)}\n`,
    "utf8",
  );
  await assert.rejects(
    () => listPendingAiWorkRecordEvents({
      stateRoot: tamperedPendingRoot,
      projectCode: PROJECT,
    }),
    (error) => assertOutboxCode(
      error,
      "pending_receipt_digest_mismatch",
    ),
  );

  const renamedPendingRoot = await syntheticRoot(t);
  await publish(renamedPendingRoot, startEvent(), "tamper.rename");
  const renamedRelative = (await listFiles(renamedPendingRoot)).find(
    (file) => file.includes("/outbox/ai_work_record/pending/"),
  );
  await rename(
    path.join(renamedPendingRoot, renamedRelative),
    path.join(
      path.dirname(path.join(renamedPendingRoot, renamedRelative)),
      "0000000000000000-renamed.json",
    ),
  );
  await assert.rejects(
    () => listPendingAiWorkRecordEvents({
      stateRoot: renamedPendingRoot,
      projectCode: PROJECT,
    }),
    (error) => assertOutboxCode(error, "pending_record_path_mismatch"),
  );

  const tamperedPersistedRoot = await syntheticRoot(t);
  const persistedEvent = startEvent();
  await publish(
    tamperedPersistedRoot,
    persistedEvent,
    "tamper.persisted",
  );
  const persistedRelative = (await listFiles(tamperedPersistedRoot)).find(
    (file) => file.includes("/receipts/local_persisted/"),
  );
  await writeFile(
    path.join(tamperedPersistedRoot, persistedRelative),
    "{}\n",
    "utf8",
  );
  await assert.rejects(
    () => withSyntheticLock(
      tamperedPersistedRoot,
      (fence) => acknowledgeAiWorkRecordEvent({
        stateRoot: tamperedPersistedRoot,
        projectCode: PROJECT,
        workId: persistedEvent.work_id,
        eventId: persistedEvent.event_id,
        eventDigest: persistedEvent.event_digest,
        sequence: persistedEvent.sequence,
        ackId: "ack.synthetic.tampered",
        ackedAt: "2026-07-30T00:50:00.000Z",
        fence,
      }),
    ),
    (error) => assertOutboxCode(
      error,
      "local_persisted_receipt_invalid",
    ),
  );

  const foreignAckRoot = await syntheticRoot(t);
  const ackEvent = startEvent();
  await publish(foreignAckRoot, ackEvent, "tamper.ack");
  const paths = getAiWorkRecordOutboxPaths({
    stateRoot: foreignAckRoot,
    projectCode: PROJECT,
  });
  const ackDirectory = path.join(
    paths.receipts_ack,
    ackEvent.work_id,
    ackEvent.event_id,
  );
  await mkdir(ackDirectory, { recursive: true });
  await writeFile(path.join(ackDirectory, "foreign.json"), "{}\n", "utf8");
  await assert.rejects(
    () => listPendingAiWorkRecordEvents({
      stateRoot: foreignAckRoot,
      projectCode: PROJECT,
    }),
    (error) => assertOutboxCode(error, "ack_receipt_invalid"),
  );
});

test("a bounded orphan ACK atomic temp stays regenerable and same-ID retry repairs it", async (t) => {
  const root = await syntheticRoot(t);
  const event = startEvent();
  await publish(root, event, "ack-orphan.0");
  const paths = getAiWorkRecordOutboxPaths({
    stateRoot: root,
    projectCode: PROJECT,
  });
  const ackId = "ack.synthetic.orphan";
  const token = `tmp.${createHash("sha256")
    .update(`${ackId}\u0000ack`)
    .digest("hex")
    .slice(0, 32)}`;
  const ackDirectory = path.join(
    paths.receipts_ack,
    event.work_id,
    event.event_id,
  );
  await mkdir(ackDirectory, { recursive: true });
  const orphan = path.join(
    ackDirectory,
    `.${ackId}.json.${token}.tmp`,
  );
  await writeFile(orphan, "synthetic interrupted bytes\n", "utf8");
  assert.equal((await listPendingAiWorkRecordEvents({
    stateRoot: root,
    projectCode: PROJECT,
  })).pending_count, 1);

  const result = await withSyntheticLock(
    root,
    (fence) => acknowledgeAiWorkRecordEvent({
      stateRoot: root,
      projectCode: PROJECT,
      workId: event.work_id,
      eventId: event.event_id,
      eventDigest: event.event_digest,
      sequence: event.sequence,
      ackId,
      ackedAt: "2026-07-30T00:50:00.000Z",
      fence,
    }),
  );
  assert.equal(result.disposition, "acknowledged");
  assert.equal((await listPendingAiWorkRecordEvents({
    stateRoot: root,
    projectCode: PROJECT,
  })).pending_count, 0);
  assert.equal((await listFiles(root)).some((file) => file.endsWith(".tmp")), false);
});

test("CLI is feature-OFF, synthetic-apply-only, deterministic, and error output does not leak paths", async (t) => {
  const root = await syntheticRoot(t);
  const event = startEvent();
  const encoded = Buffer.from(JSON.stringify(event), "utf8").toString("base64");
  const baseArgs = [
    CLI_PATH,
    "--operation", "publish",
    "--state-root", root,
    "--project", PROJECT,
    "--event-base64", encoded,
  ];
  await assert.rejects(
    () => execFileAsync(process.execPath, baseArgs),
    (error) => {
      assert.match(error.stderr, /ai_work_record_outbox_rejected:feature_off/u);
      assert.doesNotMatch(error.stderr, new RegExp(
        root.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"),
        "u",
      ));
      return true;
    },
  );
  const dry = await execFileAsync(process.execPath, [...baseArgs, "--dry-run"]);
  const dryResult = JSON.parse(dry.stdout);
  assert.equal(dryResult.mode, "dry_run");
  assert.equal(dryResult.official_completion, false);
  assert.deepEqual(await listFiles(root), []);

  const ackArgs = [
    CLI_PATH,
    "--operation", "ack",
    "--state-root", root,
    "--project", PROJECT,
    "--work-id", event.work_id,
    "--event-id", event.event_id,
    "--event-digest", event.event_digest,
    "--sequence", String(event.sequence),
    "--ack-id", "ack.synthetic.cli-dry",
    "--acked-at", "2026-07-30T00:50:00.000Z",
    "--dry-run",
  ];
  await assert.rejects(
    () => execFileAsync(process.execPath, ackArgs),
    (error) => {
      assert.match(
        error.stderr,
        /ai_work_record_outbox_rejected:ack_event_not_found/u,
      );
      return true;
    },
  );
  await publish(root, event, "cli-dry.0");
  const beforeAckDryRun = await listFiles(root);
  const ackDryRun = await execFileAsync(process.execPath, ackArgs);
  const ackDryResult = JSON.parse(ackDryRun.stdout);
  assert.equal(ackDryResult.mode, "dry_run");
  assert.equal(ackDryResult.event_digest, event.event_digest);
  assert.deepEqual(await listFiles(root), beforeAckDryRun);

  const liveLike = path.join(root, "nested");
  await assert.rejects(
    () => execFileAsync(process.execPath, [
      CLI_PATH,
      "--operation", "pending",
      "--state-root", liveLike,
      "--project", PROJECT,
      "--synthetic-apply",
    ]),
    (error) => {
      assert.match(
        error.stderr,
        /ai_work_record_outbox_rejected:synthetic_state_root_required/u,
      );
      assert.doesNotMatch(error.stderr, /nested/u);
      return true;
    },
  );
  await assert.rejects(
    () => execFileAsync(process.execPath, [
      CLI_PATH,
      "--operation", "pending",
      "--state-root", liveLike,
      "--project", PROJECT,
      "--dry-run",
    ]),
    (error) => {
      assert.match(
        error.stderr,
        /ai_work_record_outbox_rejected:synthetic_state_root_required/u,
      );
      assert.doesNotMatch(error.stderr, /nested/u);
      return true;
    },
  );
});

test("stored public-synthetic artifacts contain no raw capture or authority escalation", async (t) => {
  const root = await syntheticRoot(t);
  await publish(root, startEvent(), "boundary.0");
  const files = await listFiles(root);
  const bodies = [];
  for (const file of files) {
    if (file.endsWith(".json")) {
      bodies.push(await readFile(path.join(root, file), "utf8"));
    }
  }
  const combined = bodies.join("\n");
  assert.doesNotMatch(
    combined,
    /(?:body_text|body_html|provider_payload|whole.chat|screen.capture|keyboard.capture|os.activity.capture)\s*:\s*true/iu,
  );
  assert.doesNotMatch(
    combined,
    /(?:password|cookie|credential|authorization|bearer|api[_ -]?key|private[_ -]?key)/iu,
  );
  assert.doesNotMatch(combined, /[A-Za-z]:[\\/]/u);
  assert.match(combined, /"official_completion": false/u);
});
