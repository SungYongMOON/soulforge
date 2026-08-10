import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createEmptyThreadEnrollmentRegistry,
  registerExistingThread,
  writeThreadEnrollmentRegistryAtomic
} from "./live-thread-enrollment.mjs";
import {
  createEmptyThreadResultGateRegistry,
  readThreadResultGateRegistry,
  writeThreadResultGateRegistryAtomic
} from "./live-thread-result-gate.mjs";

const AT = "2026-08-04T03:30:00.000Z";
const CLI_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "scripts", "live-thread-result-gate-cli.mjs");

function enrollment(threadId) {
  return {
    threadId,
    organizationGroupId: "development1_company",
    routeId: null,
    workId: "canary-work",
    threadKind: "task",
    displayLabel: "Synthetic CLI task",
    relationship: "primary",
    lifecycle: "current"
  };
}

test("result gate atomic writer leaves no temporary files and emergency environment blocks writes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "team-ops-result-gate-"));
  try {
    const path = join(directory, "thread_result_gate.v1.json");
    const empty = createEmptyThreadResultGateRegistry({ now: AT });
    await writeThreadResultGateRegistryAtomic(path, empty, { env: {} });
    const loaded = await readThreadResultGateRegistry(path, { env: {} });
    assert.equal(loaded.status, "available");
    assert.equal(loaded.registry.registry_revision, 0);
    assert.deepEqual(await readdir(directory), ["thread_result_gate.v1.json"]);
    await assert.rejects(
      writeThreadResultGateRegistryAtomic(path, empty, { env: { TEAM_OPS_BOARD_RESULT_GATES_DISABLED: "1" } }),
      /thread_result_gate_disabled/u
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("result gate CLI validates a deterministic start-result lifecycle and deduplicates an exact event", async () => {
  const directory = await mkdtemp(join(tmpdir(), "team-ops-result-gate-cli-"));
  try {
    const enrollmentPath = join(directory, "thread_visibility.v1.json");
    const resultGatePath = join(directory, "thread_result_gate.v1.json");
    const registry = registerExistingThread(createEmptyThreadEnrollmentRegistry({ now: AT }), enrollment("thread-cli-result"), { now: AT, env: {} }).registry;
    await writeThreadEnrollmentRegistryAtomic(enrollmentPath, registry, { env: {} });
    const shared = ["--registry", resultGatePath, "--enrollment-registry", enrollmentPath];
    const start = [
      CLI_PATH,
      "emit",
      ...shared,
      "--event-id", "event-cli-start",
      "--thread-id", "thread-cli-result",
      "--event-type", "started",
      "--target", "none",
      "--occurred-at", "2026-08-04T03:30:01.000Z"
    ];
    const first = spawnSync(process.execPath, start, { encoding: "utf8", env: process.env });
    assert.equal(first.status, 0, first.stderr);
    const duplicate = spawnSync(process.execPath, start, { encoding: "utf8", env: process.env });
    assert.equal(duplicate.status, 0, duplicate.stderr);
    assert.match(duplicate.stdout, /"changed": false/u);
    const result = spawnSync(process.execPath, [
      CLI_PATH,
      "emit",
      ...shared,
      "--event-id", "event-cli-owner-result",
      "--thread-id", "thread-cli-result",
      "--event-type", "result_ready",
      "--target", "owner",
      "--occurred-at", "2026-08-04T03:30:02.000Z"
    ], { encoding: "utf8", env: process.env });
    assert.equal(result.status, 0, result.stderr);
    const validation = spawnSync(process.execPath, [CLI_PATH, "validate", ...shared], { encoding: "utf8", env: process.env });
    assert.equal(validation.status, 0, validation.stderr);
    assert.match(validation.stdout, /"valid": true/u);
    const loaded = await readThreadResultGateRegistry(resultGatePath, { env: {} });
    assert.equal(loaded.registry.events.length, 2);
    assert.equal(JSON.stringify(loaded.registry).includes("raw"), true);
    assert.equal(JSON.stringify(loaded.registry).includes("prompt"), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
