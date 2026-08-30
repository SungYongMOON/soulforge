import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createPathRegistry, registrySnapshot } from "../../../../../guild_hall/path_registry/src/path_registry_core.mjs";
import { SEED_AUTHORITY, seedRows } from "../../../../../guild_hall/path_registry/data/registry_seed_v0.mjs";
import { buildStorageMap } from "../../../../../guild_hall/path_registry/src/storage_map_projection.mjs";
import {
  STORAGE_MAP_BINDING_SCHEMA,
  STORAGE_MAP_PATH,
  createStorageMapServerAdapter,
  readStorageMapSnapshot,
  validateStorageMapBinding,
  validateStorageMapSnapshot,
} from "./storage-map-adapter.mjs";

const NOW = Date.parse("2026-08-31T12:00:00.000Z");
const OBSERVED_AT = new Date(NOW).toISOString();

function fixtureSnapshot() {
  const projection = buildStorageMap({
    registry_snapshot: registrySnapshot(createPathRegistry({
      authority: SEED_AUTHORITY,
      rows: seedRows(),
    })),
  });
  return JSON.parse(JSON.stringify({ ...projection, observed_at: OBSERVED_AT }));
}

function digest(text) {
  return `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`;
}

function bindingFor(snapshotPath, raw, snapshot = JSON.parse(raw), overrides = {}) {
  return {
    schema_version: STORAGE_MAP_BINDING_SCHEMA,
    enabled: true,
    snapshot_path: snapshotPath,
    expected_snapshot_sha256: digest(raw),
    expected_registry_snapshot_digest: snapshot.registry_snapshot_digest,
    access_policy: {
      read_only: true,
      loopback_only: true,
      follow_symlinks: false,
      require_single_link: true,
    },
    ...overrides,
  };
}

async function capture(handler, request) {
  const output = { status: 0, headers: {}, body: "", next: false };
  await new Promise((resolve) => {
    handler(
      request,
      {
        set statusCode(value) { output.status = value; },
        setHeader(key, value) { output.headers[key] = value; },
        end(value = "") { output.body = String(value); resolve(); },
      },
      () => { output.next = true; resolve(); },
    );
  });
  return output;
}

function middlewareFor(options = {}) {
  const handlers = [];
  const plugin = createStorageMapServerAdapter(options);
  plugin.configureServer({ middlewares: { use: (handler) => handlers.push(handler) } });
  assert.equal(handlers.length, 1);
  return handlers[0];
}

test("binding is exact, read-only, pinned, and default-OFF without a private binding", async () => {
  const snapshot = fixtureSnapshot();
  const raw = JSON.stringify(snapshot);
  const samplePath = path.join(tmpdir(), "storage-map.json");
  const valid = bindingFor(samplePath, raw, snapshot);
  assert.deepEqual(validateStorageMapBinding(valid), valid);

  for (const poisoned of [
    { ...valid, unexpected: true },
    { ...valid, snapshot_path: "relative.json" },
    { ...valid, expected_snapshot_sha256: "sha256:short" },
    { ...valid, access_policy: { ...valid.access_policy, read_only: false } },
    { ...valid, access_policy: { ...valid.access_policy, follow_symlinks: true } },
  ]) {
    assert.throws(() => validateStorageMapBinding(poisoned), /storage_map_binding_invalid/u);
  }

  const unconfigured = await readStorageMapSnapshot({ now: () => NOW });
  assert.equal(unconfigured.status, "unavailable");
  assert.equal(unconfigured.reason, "storage_map_binding_unconfigured");
  assert.equal(unconfigured.authority_boundary.writer_authority, false);
});

test("a pinned disabled file binding stays OFF and an exact pinned enabled file binding is readable", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "storage-map-binding-"));
  try {
    const snapshotPath = path.join(root, "snapshot.json");
    const bindingPath = path.join(root, "binding.json");
    const snapshot = fixtureSnapshot();
    const raw = JSON.stringify(snapshot);
    await writeFile(snapshotPath, raw, "utf8");

    const disabledBinding = bindingFor(snapshotPath, raw, snapshot, { enabled: false });
    const disabledRaw = JSON.stringify(disabledBinding);
    await writeFile(bindingPath, disabledRaw, "utf8");
    const disabled = await readStorageMapSnapshot({
      bindingPath,
      bindingSha256: digest(disabledRaw),
      now: () => NOW,
    });
    assert.equal(disabled.status, "unavailable");
    assert.equal(disabled.reason, "storage_map_disabled_by_binding");

    const enabledRaw = JSON.stringify({ ...disabledBinding, enabled: true });
    await writeFile(bindingPath, enabledRaw, "utf8");
    const ready = await readStorageMapSnapshot({
      bindingPath,
      bindingSha256: digest(enabledRaw),
      now: () => NOW,
    });
    assert.deepEqual(ready, snapshot);

    const missingPin = await readStorageMapSnapshot({ bindingPath, now: () => NOW });
    assert.equal(missingPin.reason, "storage_map_binding_unconfigured");

    const redirectedPath = path.join(root, "redirected-snapshot.json");
    const redirectedRaw = JSON.stringify({
      ...disabledBinding,
      enabled: true,
      snapshot_path: redirectedPath,
    });
    await writeFile(bindingPath, redirectedRaw, "utf8");
    const stalePin = await readStorageMapSnapshot({
      bindingPath,
      bindingSha256: digest(enabledRaw),
      now: () => NOW,
    });
    assert.equal(stalePin.reason, "storage_map_binding_unavailable");
    assert.equal(JSON.stringify(stalePin).includes(bindingPath), false);
    assert.equal(JSON.stringify(stalePin).includes(redirectedPath), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("valid pinned R3 overlay is served verbatim with its required emission clock", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "storage-map-valid-"));
  try {
    const snapshotPath = path.join(root, "snapshot.json");
    const snapshot = fixtureSnapshot();
    const raw = JSON.stringify(snapshot);
    await writeFile(snapshotPath, raw, "utf8");
    const binding = bindingFor(snapshotPath, raw, snapshot);

    const readback = await readStorageMapSnapshot({ binding, now: () => NOW });
    assert.deepEqual(readback, snapshot);
    assert.equal(readback.schema, "soulforge.watch_storage_map.v0");
    assert.equal(readback.projection_kind, "backup_readiness_overlay");
    assert.equal(readback.observed_at, OBSERVED_AT);

    const handler = middlewareFor({ binding, now: () => NOW });
    const response = await capture(handler, {
      url: STORAGE_MAP_PATH,
      method: "GET",
      socket: { remoteAddress: "127.0.0.1" },
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers["Cache-Control"], "no-store");
    assert.equal(response.headers["X-Content-Type-Options"], "nosniff");
    assert.deepEqual(JSON.parse(response.body), snapshot);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("endpoint is exact-path, GET-only, and loopback-only", async () => {
  const handler = middlewareFor();
  const wrongPath = await capture(handler, {
    url: `${STORAGE_MAP_PATH}?raw=1`, method: "GET", socket: { remoteAddress: "127.0.0.1" },
  });
  assert.equal(wrongPath.next, true);
  assert.equal(wrongPath.body, "");

  const wrongMethod = await capture(handler, {
    url: STORAGE_MAP_PATH, method: "POST", socket: { remoteAddress: "127.0.0.1" },
  });
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.Allow, "GET");
  assert.equal(wrongMethod.body, "");

  const remote = await capture(handler, {
    url: STORAGE_MAP_PATH, method: "GET", socket: { remoteAddress: "192.0.2.10" },
  });
  assert.equal(remote.status, 403);
  assert.equal(remote.body, "");
});

test("tamper, foreign schema, digest mismatch, raw fields, local paths, and missing clock fail closed", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "storage-map-poison-"));
  try {
    const snapshotPath = path.join(root, "snapshot.json");
    const baseline = fixtureSnapshot();
    const baselineRaw = JSON.stringify(baseline);

    await writeFile(snapshotPath, baselineRaw, "utf8");
    const tamperedBinding = bindingFor(snapshotPath, baselineRaw, baseline);
    await writeFile(snapshotPath, `${baselineRaw} `, "utf8");
    assert.equal((await readStorageMapSnapshot({ binding: tamperedBinding, now: () => NOW })).status, "unavailable");

    const poisoned = [
      { ...baseline, schema: "foreign.storage_map" },
      { ...baseline, registry_snapshot_digest: `sha256:${"f".repeat(64)}` },
      { ...baseline, raw_message: "not permitted" },
      { ...baseline, observed_at: undefined },
      {
        ...baseline,
        rows: baseline.rows.map((row, index) => index === 0
          ? { ...row, owner_pointer: ["C:", "private", "source"].join("\\") }
          : row),
      },
    ];

    for (const candidate of poisoned) {
      const raw = JSON.stringify(candidate);
      await writeFile(snapshotPath, raw, "utf8");
      const result = await readStorageMapSnapshot({
        binding: bindingFor(snapshotPath, raw, baseline),
        now: () => NOW,
      });
      assert.equal(result.status, "unavailable");
      assert.equal(result.reason, "storage_map_snapshot_unavailable");
      assert.equal(JSON.stringify(result).includes("private"), false);
      assert.equal(JSON.stringify(result).includes("raw_message"), false);
    }

    assert.throws(() => validateStorageMapSnapshot({ ...baseline, raw_body: "x" }, {
      expectedRegistrySnapshotDigest: baseline.registry_snapshot_digest,
      now: NOW,
    }), /storage_map_snapshot_invalid/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("root/migration enums, topology identity uniqueness, and drift invariants are exact", () => {
  const baseline = fixtureSnapshot();
  const validate = (candidate) => validateStorageMapSnapshot(candidate, {
    expectedRegistrySnapshotDigest: baseline.registry_snapshot_digest,
    now: NOW,
  });
  const poisonRow = (index, patch) => ({
    ...baseline,
    rows: baseline.rows.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row),
  });

  assert.throws(() => validate(poisonRow(0, { physical_root_class: "invented_root" })), /storage_map_row_invalid/u);
  assert.throws(() => validate(poisonRow(0, { migration_state: "ready_like" })), /storage_map_row_invalid/u);

  const topologyOwner = baseline.rows.findIndex((row) => row.topology_node_refs.length > 0);
  const second = baseline.rows.findIndex((row, index) => index !== topologyOwner && row.topology_node_refs.length === 0);
  assert.ok(topologyOwner >= 0 && second >= 0);
  assert.throws(
    () => validate(poisonRow(second, { topology_node_refs: [...baseline.rows[topologyOwner].topology_node_refs] })),
    /storage_map_topology_identity_duplicate/u,
  );

  const driftSummary = { ...baseline.summary, unclassified_count: 1, aggregate_state: "hold", hold_code: "unclassified_paths" };
  const driftCandidate = {
    ...baseline,
    summary: driftSummary,
    rows: baseline.rows.map((row) => ({ ...row, unclassified_count: 1, path_drift_state: "none_observed" })),
  };
  assert.throws(() => validate(driftCandidate), /storage_map_row_invalid/u);
});

test("stable-read races and read errors are sanitized without path, raw bytes, or exception text", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "storage-map-race-"));
  try {
    const snapshotPath = path.join(root, "snapshot.json");
    const snapshot = fixtureSnapshot();
    const raw = JSON.stringify(snapshot);
    await writeFile(snapshotPath, raw, "utf8");
    const binding = bindingFor(snapshotPath, raw, snapshot);

    const raced = await readStorageMapSnapshot({
      binding,
      now: () => NOW,
      testHooks: {
        beforeRead: async () => writeFile(snapshotPath, `${raw} `, "utf8"),
      },
    });
    assert.equal(raced.status, "unavailable");
    assert.equal(raced.reason, "storage_map_snapshot_unavailable");

    const secretMarker = "sensitive-marker-not-for-response";
    const errored = await readStorageMapSnapshot({
      binding,
      now: () => NOW,
      testHooks: {
        readStableFileOverride: async () => { throw new Error(`${secretMarker}:${snapshotPath}`); },
      },
    });
    const serialized = JSON.stringify(errored);
    assert.equal(serialized.includes(secretMarker), false);
    assert.equal(serialized.includes(snapshotPath), false);
    assert.equal(serialized.includes(raw.slice(0, 32)), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Vite registers the default-OFF storage-map adapter and implementation has zero mutation capability", async () => {
  const appRoot = path.resolve(import.meta.dirname, "../..");
  const vite = await readFile(path.join(appRoot, "vite.config.ts"), "utf8");
  assert.match(vite, /import \{ createStorageMapServerAdapter \} from "\.\/src\/server\/storage-map-adapter\.mjs";/u);
  assert.match(vite, /bindingPath: process\.env\.TEAM_OPS_STORAGE_MAP_BINDING/u);
  assert.match(vite, /bindingSha256: process\.env\.TEAM_OPS_STORAGE_MAP_BINDING_SHA256/u);

  const source = await readFile(path.join(import.meta.dirname, "storage-map-adapter.mjs"), "utf8");
  for (const forbidden of ["writeFile", "appendFile", "rename", "unlink", "rm(", "mkdir", "createWriteStream"]) {
    assert.equal(source.includes(forbidden), false, `mutation capability forbidden: ${forbidden}`);
  }
  assert.match(source, /readStableFile/u);
  assert.doesNotMatch(source, /SOULFORGE_AI_USAGE_PROJECT_ROOT/u);
});
