import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  archiveThreadEnrollmentHistory,
  createEmptyThreadEnrollmentRegistry,
  readThreadEnrollmentRegistry,
  registerExistingThread,
  retireThreadEnrollment,
  rolloverThreadEnrollment,
  validateThreadEnrollmentRegistry,
  writeThreadEnrollmentRegistryAtomic
} from "./live-thread-enrollment.mjs";

const AT = "2026-08-04T01:02:03.000Z";
const ENV = {};
const CLI_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "scripts", "live-thread-enrollment-cli.mjs");

function registration(threadId, overrides = {}) {
  return {
    threadId,
    organizationGroupId: "org-development1",
    routeId: "route-board",
    workId: "work-board",
    threadKind: "task",
    displayLabel: "Board TASK",
    relationship: "primary",
    lifecycle: "current",
    ...overrides
  };
}

test("exact registration is idempotent and conflicting metadata is rejected", () => {
  const empty = createEmptyThreadEnrollmentRegistry({ now: AT });
  const first = registerExistingThread(empty, registration("thread-001"), { now: AT, env: ENV });
  assert.equal(first.error, null);
  assert.equal(first.changed, true);
  assert.equal(first.registry.entries.length, 1);
  const repeat = registerExistingThread(first.registry, registration("thread-001"), { now: "2026-08-04T01:03:03.000Z", env: ENV });
  assert.equal(repeat.error, null);
  assert.equal(repeat.changed, false);
  assert.equal(repeat.registry.registry_revision, first.registry.registry_revision);
  const conflict = registerExistingThread(first.registry, registration("thread-001", { routeId: "route-other" }), { now: AT, env: ENV });
  assert.equal(conflict.error, "thread_id_conflict");
});

test("enrollment forces metadata-only false raw flags and validates them", () => {
  const empty = createEmptyThreadEnrollmentRegistry({ now: AT });
  const rejected = registerExistingThread(empty, registration("thread-raw", { raw_preview: true }), { now: AT, env: ENV });
  assert.equal(rejected.error, "invalid_enrollment_entry");
  const accepted = registerExistingThread(empty, registration("thread-safe", { raw_preview: false, raw_turns: false }), { now: AT, env: ENV });
  assert.equal(accepted.entry.metadata_only, true);
  assert.equal(accepted.entry.raw_preview, false);
  assert.equal(accepted.entry.raw_turns, false);
  const invalidRegistry = {
    ...accepted.registry,
    entries: [{ ...accepted.entry, raw_messages: true }]
  };
  assert.equal(validateThreadEnrollmentRegistry(invalidRegistry).valid, false);
});

test("owner display labels normalize Korean text and reject unsafe values", () => {
  const empty = createEmptyThreadEnrollmentRegistry({ now: AT });
  const fullWidthKoreanLabel = "\uFF23\uFF25\uFF2F\u3000\u2014\u3000\uAC1C\uBC1C1 \uCC45\uC784 TASK";
  const normalizedKoreanLabel = "CEO \u2014 \uAC1C\uBC1C1 \uCC45\uC784 TASK";
  const accepted = registerExistingThread(
    empty,
    registration("thread-korean-label", { displayLabel: fullWidthKoreanLabel }),
    { now: AT, env: ENV }
  );
  assert.equal(accepted.error, null);
  assert.equal(accepted.entry.display_label, normalizedKoreanLabel);

  for (const displayLabel of ["https://example.test/private", "file:private", "C:relative-path", "/private/worktree", "owner\nTASK", "x".repeat(121)]) {
    const rejected = registerExistingThread(empty, registration(`thread-unsafe-${displayLabel.length}`, { displayLabel }), { now: AT, env: ENV });
    assert.equal(rejected.error, "invalid_enrollment_entry");
  }

  const unsafeRegistry = {
    ...accepted.registry,
    entries: [{ ...accepted.entry, display_label: "//server/private" }]
  };
  assert.equal(validateThreadEnrollmentRegistry(unsafeRegistry).valid, false);
});

test("rollover promotes exact pending enrollment and preserves the prior record as history", () => {
  const empty = createEmptyThreadEnrollmentRegistry({ now: AT });
  const oldCurrent = registerExistingThread(empty, registration("thread-old"), { now: AT, env: ENV }).registry;
  const pending = registerExistingThread(
    oldCurrent,
    registration("thread-new", {
      lifecycle: "pending",
      threadKind: "continuation",
      relationship: "continuation",
      parentThreadId: "thread-old",
      priorThreadHistoryPointer: "history:thread-old"
    }),
    { now: "2026-08-04T01:03:03.000Z", env: ENV }
  ).registry;
  const rollover = rolloverThreadEnrollment(pending, {
    priorThreadId: "thread-old",
    threadId: "thread-new",
    nextLifecycle: "current"
  }, { now: "2026-08-04T01:04:03.000Z", env: ENV });
  assert.equal(rollover.error, null);
  assert.equal(rollover.registry.entries.find((entry) => entry.thread_id === "thread-old").lifecycle, "history");
  assert.equal(rollover.registry.entries.find((entry) => entry.thread_id === "thread-new").lifecycle, "current");
  const retired = retireThreadEnrollment(rollover.registry, "thread-new", { now: "2026-08-04T01:05:03.000Z", env: ENV });
  assert.equal(retired.entry.lifecycle, "retired");
  const history = archiveThreadEnrollmentHistory(retired.registry, "thread-new", { now: "2026-08-04T01:06:03.000Z", env: ENV });
  assert.equal(history.entry.lifecycle, "history");
});

test("atomic writer replaces a temp registry without leaving temporary files", async () => {
  const directory = await mkdtemp(join(tmpdir(), "team-ops-thread-enrollment-"));
  try {
    const path = join(directory, "thread_visibility.v1.json");
    const registry = registerExistingThread(
      createEmptyThreadEnrollmentRegistry({ now: AT }),
      registration("thread-atomic", { displayLabel: "\uC6B4\uC601 \uCD1D\uAD04 TASK" }),
      { now: AT, env: ENV }
    ).registry;
    await writeThreadEnrollmentRegistryAtomic(path, registry, { env: ENV });
    const loaded = await readThreadEnrollmentRegistry(path);
    assert.equal(loaded.status, "available");
    assert.equal(loaded.registry.entries[0].thread_id, "thread-atomic");
    assert.equal(loaded.registry.entries[0].display_label, "\uC6B4\uC601 \uCD1D\uAD04 TASK");
    const files = await readdir(directory);
    assert.deepEqual(files, ["thread_visibility.v1.json"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("enrollment CLI accepts only a safe owner-provided display label", async () => {
  const directory = await mkdtemp(join(tmpdir(), "team-ops-thread-enrollment-cli-"));
  try {
    const path = join(directory, "thread_visibility.v1.json");
    const env = { ...process.env, TEAM_OPS_BOARD_LIVE_THREADS_DISABLED: "0" };
    delete env.TEAM_OPS_BOARD_THREAD_VISIBILITY_REGISTRY;
    const args = [
      CLI_PATH,
      "register-existing",
      "--registry", path,
      "--thread-id", "thread-cli-label",
      "--organization-group-id", "org-development1",
      "--thread-kind", "task",
      "--display-label", "Owner release TASK",
      "--relationship", "primary"
    ];
    const accepted = spawnSync(process.execPath, args, { encoding: "utf8", env });
    assert.equal(accepted.status, 0, accepted.stderr);
    const loaded = await readThreadEnrollmentRegistry(path);
    assert.equal(loaded.registry.entries[0].display_label, "Owner release TASK");

    const rejected = spawnSync(process.execPath, [
      CLI_PATH,
      "register-existing",
      "--registry", path,
      "--thread-id", "thread-cli-unsafe",
      "--organization-group-id", "org-development1",
      "--thread-kind", "task",
      "--display-label", "https://example.test/private",
      "--relationship", "primary"
    ], { encoding: "utf8", env });
    assert.equal(rejected.status, 1);
    assert.match(rejected.stderr, /invalid_enrollment_entry/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("emergency environment and registry configuration disable enrollment mutation", () => {
  const empty = createEmptyThreadEnrollmentRegistry({ now: AT, disabled: true });
  const configBlocked = registerExistingThread(empty, registration("thread-config-blocked"), { now: AT, env: ENV });
  assert.equal(configBlocked.error, "live_thread_enrollment_disabled");
  const envBlocked = registerExistingThread(
    createEmptyThreadEnrollmentRegistry({ now: AT }),
    registration("thread-env-blocked"),
    { now: AT, env: { TEAM_OPS_BOARD_LIVE_THREADS_DISABLED: "1" } }
  );
  assert.equal(envBlocked.error, "live_thread_enrollment_disabled");
});
