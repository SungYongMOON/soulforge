import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  access,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  symlink,
  truncate,
  unlink,
  utimes,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  FILE_ACTIVITY_CACHE_POLICY,
  FILE_ACTIVITY_LIFE_TREE_PROJECTION_SCHEMA,
  FILE_ACTIVITY_RECONCILE_LIMITS,
  FILE_OBSERVATION_PACKET_SCHEMA,
  FILE_RECONCILE_EVENT_SCHEMA,
  FILE_RECONCILE_RECEIPT_SCHEMA,
  FILE_REVISION_CHECKPOINT_SCHEMA,
  FILE_REVISION_STATE_SCHEMA,
  FILE_ACTIVITY_STATE_LIMITS,
  buildPathCollisionKeys,
  cadenceForRole,
  classifyCadenceFreshness,
  detectPathCollisions,
  observationIdFor,
  pathFingerprintForCollisionKeys,
  reconcileObservationPackets,
  reconcileObservationPacketsWithArtifacts,
  restoreRevisionStateCheckpoint,
  scanWorkspace,
} from "./file_activity.mjs";

const PROJECT = "P00-TEST";
const BINDING = "shared_worksite";
const PRIMARY = {
  projectCode: PROJECT,
  workspaceBindingId: BINDING,
  reconcilerNodeId: "mac-mini-primary",
  reconcilerNodeRole: "always_on_node",
  bindingValid: true,
  operationalPrimary: true,
};

test("cadence contract covers four canonical roles and 2x/6x freshness", () => {
  assert.deepEqual(cadenceForRole("work_pc").triggers, ["startup", "resume", "daily_full"]);
  assert.equal(cadenceForRole("tool_pc").active_scan_minutes, 10);
  assert.equal(cadenceForRole("portable_dev_pc").battery_aware, true);
  assert.equal(cadenceForRole("always_on_node").inbox_reconcile_minutes, 1);
  assert.equal(cadenceForRole("always_on_node").requires_operational_primary, true);

  const last = "2026-07-12T00:00:00.000Z";
  assert.equal(classifyCadenceFreshness({ nodeRole: "work_pc", lastIngestedAt: last, now: "2026-07-12T00:10:00.000Z" }).state, "fresh");
  assert.equal(classifyCadenceFreshness({ nodeRole: "work_pc", lastIngestedAt: last, now: "2026-07-12T00:20:00.000Z" }).state, "late");
  assert.equal(classifyCadenceFreshness({ nodeRole: "work_pc", lastIngestedAt: last, now: "2026-07-12T00:31:00.000Z" }).state, "stale");
  assert.throws(() => cadenceForRole("unknown_pc"), /file_activity_node_role_invalid/u);
});

test("scanner streams exact hashes, reuses unchanged stat tuples, records touch hints, and never claims creation time", async () => {
  const fixture = await makeFixture("scan-cache");
  try {
    const filePath = path.join(fixture, "design.txt");
    await writeVersion(filePath, "alpha-private-payload", "2026-07-12T00:00:00.000Z");
    const first = await scanAt({
      rootPath: fixture,
      nodeId: "work-01",
      nodeRole: "work_pc",
      scanId: "scan:cache-first",
      observedAt: "2026-07-12T00:00:05.000Z",
    });
    assert.equal(first.packet.schema_version, FILE_OBSERVATION_PACKET_SCHEMA);
    assert.equal(first.packet.coverage.complete, true);
    assert.equal(first.packet.observations[0].hash_status, "hashed_exact");
    assert.match(first.packet.observations[0].content_id, /^sha256:[a-f0-9]{64}$/u);
    assert.equal(first.packet.observations[0].fs_modified_at.trust, "untrusted_hint");

    const second = await scanAt({
      rootPath: fixture,
      nodeId: "work-01",
      nodeRole: "work_pc",
      scanId: "scan:cache-second",
      observedAt: "2026-07-12T00:05:05.000Z",
      previousCache: first.next_cache,
    });
    assert.equal(second.packet.observations[0].hash_status, "cached_exact");
    assert.equal(second.packet.observations[0].content_id, first.packet.observations[0].content_id);

    const full = await scanAt({
      rootPath: fixture,
      nodeId: "work-01",
      nodeRole: "work_pc",
      scanId: "scan:cache-full",
      observedAt: "2026-07-12T00:05:30.000Z",
      previousCache: second.next_cache,
      forceRehash: true,
    });
    assert.equal(full.packet.observations[0].hash_status, "hashed_exact");
    assert.equal(full.packet.hash_policy.force_rehash, true);

    await utimes(filePath, new Date("2026-07-12T00:06:00.000Z"), new Date("2026-07-12T00:06:00.000Z"));
    const touched = await scanAt({
      rootPath: fixture,
      nodeId: "work-01",
      nodeRole: "work_pc",
      scanId: "scan:cache-touch",
      observedAt: "2026-07-12T00:06:05.000Z",
      previousCache: second.next_cache,
    });
    assert.equal(touched.packet.observations[0].hash_status, "hashed_exact");
    assert.equal(touched.packet.observations[0].content_id, first.packet.observations[0].content_id);

    const serialized = JSON.stringify(touched.packet);
    assert.equal(serialized.includes(fixture), false);
    assert.equal(serialized.includes("alpha-private-payload"), false);
    assert.doesNotMatch(serialized, /birthtime|created_at|creation_time_at/u);
    assert.equal(touched.packet.boundary.creation_time_claimed, false);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("verified hash cache reuse is provenance-bound, expires at 24 hours, and full scans bypass every cache hit", async () => {
  const fixture = await makeFixture("cache-ttl-provenance");
  try {
    await writeVersion(path.join(fixture, "bounded.txt"), "cache payload", "2026-07-12T00:00:00.000Z");
    const first = await scanAt({
      rootPath: fixture,
      nodeId: "work-01",
      nodeRole: "work_pc",
      scanId: "cache-provenance-first",
      observedAt: "2026-07-12T00:00:00.000Z",
      ingestedAt: "2026-07-12T00:00:01.000Z",
    });
    const firstEntry = first.next_cache.entries[0];
    assert.equal(first.next_cache.schema_version, "soulforge.file_scan_cache.v1");
    assert.equal(firstEntry.provenance.verification_method, "streamed_full_file");
    assert.equal(firstEntry.provenance.producer_node_id, "work-01");
    assert.equal(firstEntry.provenance.source_scan_id, first.packet.scan_id);
    assert.equal(firstEntry.provenance.source_observation_id, first.packet.observations[0].observation_id);
    assert.match(firstEntry.provenance.source_packet_digest, /^sha256:[a-f0-9]{64}$/u);

    const withinTtl = await scanAt({
      rootPath: fixture,
      nodeId: "work-01",
      nodeRole: "work_pc",
      scanId: "cache-provenance-within-ttl",
      observedAt: "2026-07-12T23:59:59.000Z",
      ingestedAt: "2026-07-13T00:00:00.000Z",
      previousCache: first.next_cache,
    });
    assert.equal(withinTtl.packet.observations[0].hash_status, "cached_exact");
    assert.equal(withinTtl.next_cache.entries[0].verified_at, firstEntry.verified_at);
    assert.deepEqual(withinTtl.next_cache.entries[0].provenance, firstEntry.provenance);

    const expired = await scanAt({
      rootPath: fixture,
      nodeId: "work-01",
      nodeRole: "work_pc",
      scanId: "cache-provenance-expired",
      observedAt: "2026-07-13T00:00:01.001Z",
      ingestedAt: "2026-07-13T00:00:01.001Z",
      previousCache: first.next_cache,
    });
    assert.equal(expired.packet.observations[0].hash_status, "hashed_exact");
    assert.equal(expired.packet.counts.cached_exact_count, 0);
    assert.notEqual(expired.next_cache.entries[0].provenance.source_scan_id, firstEntry.provenance.source_scan_id);

    const full = await scanAt({
      rootPath: fixture,
      nodeId: "work-01",
      nodeRole: "work_pc",
      scanId: "cache-provenance-full",
      observedAt: "2026-07-12T00:05:00.000Z",
      ingestedAt: "2026-07-12T00:05:01.000Z",
      previousCache: first.next_cache,
      forceRehash: true,
    });
    assert.equal(full.packet.counts.cached_exact_count, 0);
    assert.equal(full.packet.coverage.hash_complete, true);
    assert(full.packet.observations.every((entry) => entry.hash_status === "hashed_exact"));
    assert.equal(full.packet.node_sequence, 2);
    assert.equal(full.cache_chain_state, "preserved");

    const corruptEntry = structuredClone(first.next_cache);
    corruptEntry.entries[0].unknown_payload = "must not block a full byte pass";
    const recoveredFull = await scanAt({
      rootPath: fixture,
      nodeId: "work-01",
      nodeRole: "work_pc",
      scanId: "cache-provenance-full-corrupt-entry",
      observedAt: "2026-07-12T00:07:00.000Z",
      ingestedAt: "2026-07-12T00:07:01.000Z",
      previousCache: corruptEntry,
      forceRehash: true,
    });
    assert.equal(recoveredFull.packet.node_sequence, 2);
    assert.equal(recoveredFull.packet.counts.cached_exact_count, 0);
    assert.equal(recoveredFull.cache_chain_state, "preserved");

    const legacyCache = structuredClone(first.next_cache);
    legacyCache.schema_version = "soulforge.file_scan_cache.v0";
    const resetFull = await scanAt({
      rootPath: fixture,
      nodeId: "work-01",
      nodeRole: "work_pc",
      scanId: "cache-provenance-full-legacy-reset",
      observedAt: "2026-07-12T00:08:00.000Z",
      ingestedAt: "2026-07-12T00:08:01.000Z",
      previousCache: legacyCache,
      forceRehash: true,
    });
    assert.equal(resetFull.packet.node_sequence, 1);
    assert.equal(resetFull.cache_chain_state, "reset_requires_rebinding");

    const missingProvenance = structuredClone(first.next_cache);
    delete missingProvenance.entries[0].provenance;
    await assert.rejects(() => scanAt({
      rootPath: fixture,
      nodeId: "work-01",
      nodeRole: "work_pc",
      scanId: "cache-provenance-missing",
      observedAt: "2026-07-12T00:06:00.000Z",
      previousCache: missingProvenance,
    }), /scan_cache_entry_unknown_or_missing_field/u);

    const alteredAnchor = structuredClone(first.next_cache);
    alteredAnchor.entries[0].provenance.source_observation_id = `obs:${"0".repeat(64)}`;
    await assert.rejects(() => scanAt({
      rootPath: fixture,
      nodeId: "work-01",
      nodeRole: "work_pc",
      scanId: "cache-provenance-anchor",
      observedAt: "2026-07-12T00:06:00.000Z",
      previousCache: alteredAnchor,
    }), /scan_cache_provenance_relationship_invalid/u);

    await assert.rejects(() => scanAt({
      rootPath: fixture,
      nodeId: "work-01",
      nodeRole: "work_pc",
      scanId: "cache-provenance-regressed",
      observedAt: "2026-07-11T23:59:00.000Z",
      ingestedAt: "2026-07-11T23:59:01.000Z",
      previousCache: first.next_cache,
    }), /scan_cache_clock_regressed/u);
    await assert.rejects(() => scanAt({
      rootPath: fixture,
      nodeId: "work-01",
      nodeRole: "work_pc",
      scanId: "cache-provenance-ttl-too-large",
      observedAt: "2026-07-12T00:06:00.000Z",
      previousCache: first.next_cache,
      verifiedHashTtlMs: FILE_ACTIVITY_CACHE_POLICY.max_verified_hash_ttl_ms + 1,
    }), /verified_hash_cache_ttl_ms_invalid/u);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("secret-like path segments are aggregate-only, while temporary files and symlinks are excluded", async (t) => {
  const fixture = await makeFixture("scan-boundary");
  const outside = await makeFixture("scan-outside");
  try {
    await writeFile(path.join(fixture, ".env"), "DO_NOT_HASH=private", "utf8");
    await mkdir(path.join(fixture, "credentials"), { recursive: true });
    await writeFile(path.join(fixture, "credentials", "config.json"), "credential payload", "utf8");
    await writeFile(path.join(fixture, "draft.tmp"), "temporary", "utf8");
    await writeFile(path.join(fixture, "large.bin"), "1234567890", "utf8");
    await writeFile(path.join(outside, "outside.txt"), "outside payload", "utf8");
    try {
      await symlink(path.join(outside, "outside.txt"), path.join(fixture, "escape-link"));
    } catch (error) {
      t.diagnostic(`symlink fixture unavailable: ${error.code}`);
    }

    const { packet } = await scanAt({
      rootPath: fixture,
      nodeId: "tool-01",
      nodeRole: "tool_pc",
      scanId: "scan:boundary-one",
      observedAt: "2026-07-12T01:00:00.000Z",
      immediateHashBytes: 4,
      byteBudget: 4,
    });
    assert.equal(packet.observations.some((entry) => entry.withheld), false);
    assert.equal(packet.counts.withheld_sensitive_count, 2);
    assert.equal(packet.observations.some((entry) => entry.relative_path === "draft.tmp"), false);
    assert.equal(packet.observations.some((entry) => entry.relative_path === "escape-link"), false);
    assert.equal(packet.observations.find((entry) => entry.relative_path === "large.bin").hash_status, "queued_large");
    assert.equal(packet.coverage.complete, false);
    assert(packet.coverage.gap_reasons.includes("large_file_hash_queued"));
    assert.equal(packet.boundary.symlinks_or_junctions_followed, false);
    assert.equal(packet.boundary.sensitive_files_hashed, false);
    const serialized = JSON.stringify(packet);
    const envKeys = buildPathCollisionKeys(".env");
    const credentialKeys = buildPathCollisionKeys("credentials/config.json");
    assert.equal(serialized.includes(pathFingerprintForCollisionKeys(envKeys)), false);
    assert.equal(serialized.includes(envKeys.exact), false);
    assert.equal(serialized.includes(pathFingerprintForCollisionKeys(credentialKeys)), false);
    assert.equal(serialized.includes(credentialKeys.exact), false);
    assert.equal(serialized.includes(".env"), false);
    assert.equal(serialized.includes("credentials"), false);
    assert.equal(serialized.includes("DO_NOT_HASH=private"), false);
    assert.equal(serialized.includes("credential payload"), false);
    assert.equal(serialized.includes("outside payload"), false);
  } finally {
    await rm(fixture, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test("a secret-like scan root basename or ancestor is aggregate-only and never enumerated or hashed", async () => {
  const fixture = await makeFixture("sensitive-root-boundary");
  try {
    const sensitiveBasenameRoot = path.join(fixture, "credentials-project");
    const sensitiveAncestorRoot = path.join(fixture, "tokens-vault", "worksite");
    await mkdir(sensitiveBasenameRoot, { recursive: true });
    await mkdir(sensitiveAncestorRoot, { recursive: true });
    await writeFile(path.join(sensitiveBasenameRoot, "visible.txt"), "ROOT-SECRET-PAYLOAD", "utf8");
    await writeFile(path.join(sensitiveAncestorRoot, "visible.txt"), "ANCESTOR-SECRET-PAYLOAD", "utf8");

    for (const [index, rootPath] of [sensitiveBasenameRoot, sensitiveAncestorRoot].entries()) {
      const scanned = await scanAt({
        rootPath,
        nodeId: `work-0${index + 1}`,
        nodeRole: "work_pc",
        scanId: `sensitive-root-${index}`,
        observedAt: `2026-07-12T01:3${index}:00.000Z`,
      });
      assert.equal(scanned.packet.coverage.complete, false);
      assert.deepEqual(scanned.packet.coverage.gap_reasons, ["sensitive_root_withheld"]);
      assert.equal(scanned.packet.counts.withheld_sensitive_count, 1);
      assert.equal(scanned.packet.observations.length, 0);
      assert.equal(scanned.packet.boundary.sensitive_root_withheld, true);
      const serialized = JSON.stringify(scanned.packet);
      assert.equal(serialized.includes("credentials-project"), false);
      assert.equal(serialized.includes("tokens-vault"), false);
      assert.equal(serialized.includes("ROOT-SECRET-PAYLOAD"), false);
      assert.equal(serialized.includes("ANCESTOR-SECRET-PAYLOAD"), false);
    }
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("repo over-binding excludes private metadata and collector-owned state without self-observation", async () => {
  const fixture = await makeFixture("collector-owned-exclusion");
  try {
    const protectedRoots = [
      path.join(fixture, ".git"),
      path.join(fixture, "_workmeta", PROJECT),
      path.join(fixture, "private-state", "operations"),
      path.join(fixture, "guild_hall", "state", "local", "file_activity", PROJECT),
    ];
    for (const [index, protectedRoot] of protectedRoots.entries()) {
      await mkdir(protectedRoot, { recursive: true });
      await writeFile(path.join(protectedRoot, `protected-${index}.json`), `PROTECTED_PAYLOAD_${index}`, "utf8");
    }
    await writeFile(path.join(fixture, "visible.txt"), "visible payload", "utf8");

    const scanned = await scanAt({
      rootPath: fixture,
      nodeId: "work-01",
      nodeRole: "work_pc",
      scanId: "collector-owned-overbinding",
      observedAt: "2026-07-12T01:45:00.000Z",
    });
    assert.deepEqual(scanned.packet.observations.map((entry) => entry.relative_path), ["visible.txt"]);
    assert.equal(scanned.packet.counts.excluded_entry_count, protectedRoots.length);
    const serialized = JSON.stringify(scanned.packet);
    assert.equal(serialized.includes("PROTECTED_PAYLOAD"), false);
    assert.equal(serialized.includes("_workmeta"), false);
    assert.equal(serialized.includes("private-state"), false);
    assert.equal(serialized.includes("scan_cache.json"), false);

    const collectorRoot = protectedRoots.at(-1);
    const blocked = await scanAt({
      rootPath: collectorRoot,
      nodeId: "work-01",
      nodeRole: "work_pc",
      scanId: "collector-owned-root",
      observedAt: "2026-07-12T01:46:00.000Z",
    });
    assert.equal(blocked.packet.coverage.complete, false);
    assert.deepEqual(blocked.packet.coverage.gap_reasons, ["collector_owned_root_withheld"]);
    assert.equal(blocked.packet.counts.excluded_entry_count, 1);
    assert.equal(blocked.packet.observations.length, 0);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("entry and byte budgets are explicit incomplete coverage, never weak content identity", async () => {
  const fixture = await makeFixture("scan-budget");
  try {
    await writeFile(path.join(fixture, "a.txt"), "aaaa", "utf8");
    await writeFile(path.join(fixture, "b.txt"), "bbbb", "utf8");
    const entryLimited = await scanAt({
      rootPath: fixture,
      nodeId: "air-01",
      nodeRole: "portable_dev_pc",
      scanId: "scan:entry-limit",
      observedAt: "2026-07-12T02:00:00.000Z",
      maxEntries: 1,
    });
    assert.equal(entryLimited.packet.coverage.complete, false);
    assert.equal(entryLimited.packet.coverage.listing_complete, false);
    assert(entryLimited.packet.coverage.gap_reasons.includes("entry_budget_exhausted"));

    const byteLimited = await scanAt({
      rootPath: fixture,
      nodeId: "air-01",
      nodeRole: "portable_dev_pc",
      scanId: "scan:byte-limit",
      observedAt: "2026-07-12T02:01:00.000Z",
      immediateHashBytes: 100,
      byteBudget: 4,
    });
    assert.equal(byteLimited.packet.coverage.complete, false);
    assert(byteLimited.packet.observations.some((entry) => entry.hash_status === "queued_budget"));
    assert(byteLimited.packet.observations.every((entry) => entry.content_id === null || /^sha256:[a-f0-9]{64}$/u.test(entry.content_id)));
    assert.equal(byteLimited.packet.hash_policy.weak_or_sample_hash_is_identity, false);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("unmounted or offline roots emit an incomplete gap packet and preserve cache without absence inference", async () => {
  const fixture = await makeFixture("offline-gap");
  try {
    await writeFile(path.join(fixture, "present.txt"), "A", "utf8");
    const initial = await scanAt({
      rootPath: fixture,
      nodeId: "work-01",
      nodeRole: "work_pc",
      scanId: "scan:offline-base",
      observedAt: "2026-07-12T02:30:00.000Z",
    });
    let state = reconcile(null, [initial.packet], { absenceThreshold: 1, deletionGraceMs: 0 });
    const offline = await scanAt({
      rootPath: path.join(fixture, "unmounted-worksite"),
      nodeId: "work-01",
      nodeRole: "work_pc",
      scanId: "scan:offline-gap",
      observedAt: "2026-07-12T02:35:00.000Z",
      previousCache: initial.next_cache,
    });
    assert.equal(offline.packet.coverage.complete, false);
    assert.deepEqual(offline.packet.coverage.gap_reasons, ["workspace_root_unavailable"]);
    assert.deepEqual(offline.next_cache.entries, initial.next_cache.entries);
    state = reconcile(state, [offline.packet], { absenceThreshold: 1, deletionGraceMs: 0 });
    assert.equal(state.node_bindings[0].absence_count, 0);
    assert.equal(state.logical_files[0].status, "active");
    assert(state.coverage_gaps.some((entry) => entry.gap_reasons?.includes("workspace_root_unavailable")));
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("NFC, casefold, and trailing-dot-space collisions are conflicts and never overwrite", () => {
  const synthetic = [
    syntheticPathObservation("obs-decomposed", "e\u0301.txt"),
    syntheticPathObservation("obs-composed", "é.txt"),
    syntheticPathObservation("obs-case-a", "Report.txt"),
    syntheticPathObservation("obs-case-b", "report.TXT"),
    syntheticPathObservation("obs-trailing-a", "folder/name"),
    syntheticPathObservation("obs-trailing-b", "folder/name. "),
  ];
  const collisions = detectPathCollisions(synthetic);
  assert(collisions.some((entry) => entry.collision_type === "nfc"));
  assert(collisions.some((entry) => entry.collision_type === "casefold"));
  assert(collisions.some((entry) => entry.collision_type === "cross_platform_trailing_dot_space"));
  assert(collisions.every((entry) => entry.resolution === "conflict_review"));
  assert(collisions.every((entry) => entry.overwrite_allowed === false));
});

test("reconciler keeps colliding paths as separate logical files and marks both for conflict review", async () => {
  const fixture = await makeFixture("collision-reconcile");
  try {
    await writeFile(path.join(fixture, "seed.txt"), "same-content", "utf8");
    const scanned = await scanAt({
      rootPath: fixture,
      nodeId: "work-01",
      nodeRole: "work_pc",
      scanId: "scan:collision-reconcile",
      observedAt: "2026-07-12T02:45:00.000Z",
    });
    const seed = scanned.packet.observations[0];
    const first = observationAtSyntheticPath(seed, "e\u0301.txt");
    const second = observationAtSyntheticPath(seed, "é.txt");
    scanned.packet.observations = [first, second];
    scanned.packet.collisions = detectPathCollisions(scanned.packet.observations);
    const state = reconcile(null, [scanned.packet]);
    assert.equal(state.logical_files.length, 2);
    assert.equal(new Set(state.node_bindings.map((entry) => entry.node_binding_id)).size, 2);
    assert(state.collisions.some((entry) => entry.collision_type === "nfc"));
    assert(state.logical_files.every((entry) => entry.conflict));
    assert(state.logical_files.every((entry) => entry.conflict_reasons.includes("path_collision:nfc")));
    const reconstructed = reconcileObservationPackets({
      ...PRIMARY,
      previousState: state,
      packets: [],
      receivedAt: "2026-07-12T02:46:00.000Z",
    });
    assert(reconstructed.collisions.some((entry) => entry.collision_type === "nfc"));
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("same logical path changed hash creates revisions, unchanged hash with changed mtime becomes touch, and A-B-A is three occurrences", async () => {
  const fixture = await makeFixture("revision-aba");
  try {
    const filePath = path.join(fixture, "spec.txt");
    await writeVersion(filePath, "A", "2026-07-12T03:00:00.000Z");
    const first = await scanAt({ rootPath: fixture, nodeId: "work-01", nodeRole: "work_pc", scanId: "scan:aba-a1", observedAt: "2026-07-12T03:00:05.000Z" });
    let state = reconcile(null, [first.packet]);
    const logicalId = state.logical_files[0].logical_file_id;
    const firstRevisionId = state.revisions[0].revision_id;

    await utimes(filePath, new Date("2026-07-12T03:01:00.000Z"), new Date("2026-07-12T03:01:00.000Z"));
    const touch = await scanAt({ rootPath: fixture, nodeId: "work-01", nodeRole: "work_pc", scanId: "scan:aba-touch", observedAt: "2026-07-12T03:01:05.000Z", previousCache: first.next_cache });
    state = reconcile(state, [touch.packet]);
    assert.equal(state.revisions.length, 1);
    assert.equal(lastObservation(state).event_kind, "touch");

    await writeVersion(filePath, "B", "2026-07-12T03:02:00.000Z");
    const second = await scanAt({ rootPath: fixture, nodeId: "work-01", nodeRole: "work_pc", scanId: "scan:aba-b", observedAt: "2026-07-12T03:02:05.000Z", previousCache: touch.next_cache });
    state = reconcile(state, [second.packet]);
    assert.equal(state.revisions.length, 2);
    assert.equal(lastObservation(state).event_kind, "content_revision");

    await writeVersion(filePath, "A", "2026-07-12T03:03:00.000Z");
    const third = await scanAt({ rootPath: fixture, nodeId: "work-01", nodeRole: "work_pc", scanId: "scan:aba-a2", observedAt: "2026-07-12T03:03:05.000Z", previousCache: second.next_cache });
    state = reconcile(state, [third.packet]);
    assert.equal(state.logical_files.length, 1);
    assert.equal(state.logical_files[0].logical_file_id, logicalId);
    assert.equal(state.revisions.length, 3);
    const aRevisions = state.revisions.filter((entry) => entry.content_id === first.packet.observations[0].content_id);
    assert.equal(aRevisions.length, 2);
    assert.notEqual(aRevisions[0].revision_id, aRevisions[1].revision_id);
    assert(state.revisions.some((entry) => entry.revision_id === firstRevisionId));
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("complete-scan path move is rename, while retaining source path creates a new logical copy sharing content", async () => {
  const fixture = await makeFixture("rename-copy");
  try {
    const oldPath = path.join(fixture, "old.txt");
    const newPath = path.join(fixture, "new.txt");
    const copyPath = path.join(fixture, "copy.txt");
    await writeVersion(oldPath, "same-content", "2026-07-12T04:00:00.000Z");
    const first = await scanAt({ rootPath: fixture, nodeId: "work-01", nodeRole: "work_pc", scanId: "scan:rename-base", observedAt: "2026-07-12T04:00:05.000Z" });
    let state = reconcile(null, [first.packet]);
    const originalLogicalId = state.logical_files[0].logical_file_id;
    const originalRevisionId = state.revisions[0].revision_id;

    await rename(oldPath, newPath);
    const moved = await scanAt({ rootPath: fixture, nodeId: "work-01", nodeRole: "work_pc", scanId: "scan:rename-move", observedAt: "2026-07-12T04:01:05.000Z", previousCache: first.next_cache });
    state = reconcile(state, [moved.packet]);
    assert.equal(state.logical_files.length, 1);
    assert.equal(lastObservation(state).event_kind, "rename");
    assert.equal(lastObservation(state).identity_claim, "inferred");
    assert.equal(lastObservation(state).identity_basis, "unique_same_node_same_content_move_in_complete_listing");
    assert.equal(lastObservation(state).logical_file_id, originalLogicalId);
    assert.equal(lastObservation(state).revision_id, originalRevisionId);

    await copyFile(newPath, copyPath);
    const copied = await scanAt({ rootPath: fixture, nodeId: "work-01", nodeRole: "work_pc", scanId: "scan:rename-copy", observedAt: "2026-07-12T04:02:05.000Z", previousCache: moved.next_cache });
    state = reconcile(state, [copied.packet]);
    assert.equal(state.logical_files.length, 2);
    const copyEvent = state.observations.find((entry) => entry.scan_id === copied.packet.scan_id && entry.event_kind === "copy");
    assert(copyEvent);
    assert.equal(copyEvent.identity_claim, "inferred");
    assert.notEqual(copyEvent.logical_file_id, originalLogicalId);
    const copyRevision = state.revisions.find((entry) => entry.revision_id === copyEvent.revision_id);
    assert.equal(copyRevision.content_id, state.revisions.find((entry) => entry.revision_id === originalRevisionId).content_id);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("concurrent children from the same base remain two heads and conflict instead of last-write-wins", async () => {
  const nodeOneRoot = await makeFixture("concurrent-one");
  const nodeTwoRoot = await makeFixture("concurrent-two");
  try {
    await writeVersion(path.join(nodeOneRoot, "shared.txt"), "A", "2026-07-12T05:00:00.000Z");
    await writeVersion(path.join(nodeTwoRoot, "shared.txt"), "A", "2026-07-12T05:00:00.000Z");
    const baseOne = await scanAt({ rootPath: nodeOneRoot, nodeId: "work-01", nodeRole: "work_pc", scanId: "scan:concurrent-base1", observedAt: "2026-07-12T05:00:05.000Z" });
    const baseTwo = await scanAt({ rootPath: nodeTwoRoot, nodeId: "tool-01", nodeRole: "tool_pc", scanId: "scan:concurrent-base2", observedAt: "2026-07-12T05:00:06.000Z" });
    let state = reconcile(null, [baseOne.packet, baseTwo.packet]);
    assert.equal(state.logical_files.length, 1);
    assert.equal(state.revisions.length, 1);

    await writeVersion(path.join(nodeOneRoot, "shared.txt"), "B", "2026-07-12T05:01:00.000Z");
    await writeVersion(path.join(nodeTwoRoot, "shared.txt"), "C", "2026-07-12T05:01:00.000Z");
    const branchB = await scanAt({ rootPath: nodeOneRoot, nodeId: "work-01", nodeRole: "work_pc", scanId: "scan:concurrent-b", observedAt: "2026-07-12T05:01:05.000Z", previousCache: baseOne.next_cache });
    const branchC = await scanAt({ rootPath: nodeTwoRoot, nodeId: "tool-01", nodeRole: "tool_pc", scanId: "scan:concurrent-c", observedAt: "2026-07-12T05:01:06.000Z", previousCache: baseTwo.next_cache });
    state = reconcile(state, [branchB.packet, branchC.packet]);
    assert.equal(state.revisions.length, 3);
    assert.equal(state.logical_files[0].current_revision_ids.length, 2);
    assert.equal(state.logical_files[0].conflict, true);
    assert(state.logical_files[0].conflict_reasons.includes("concurrent_revision_heads"));
    assert.equal(state.boundary.last_write_wins_resolution, false);
    const branchRevisions = state.revisions.filter((entry) => entry.parent_revision_ids.length === 1);
    assert.equal(branchRevisions.length, 2);
    assert.equal(branchRevisions[0].parent_revision_ids[0], branchRevisions[1].parent_revision_ids[0]);
  } finally {
    await rm(nodeOneRoot, { recursive: true, force: true });
    await rm(nodeTwoRoot, { recursive: true, force: true });
  }
});

test("cross-node case and trailing-space collision keys mark every active logical file as conflict", async () => {
  const nodeOneRoot = await makeFixture("global-collision-one");
  const nodeTwoRoot = await makeFixture("global-collision-two");
  try {
    await writeFile(path.join(nodeOneRoot, "Report.txt"), "A", "utf8");
    await writeFile(path.join(nodeTwoRoot, "report.txt"), "B", "utf8");
    const one = await scanAt({ rootPath: nodeOneRoot, nodeId: "work-01", nodeRole: "work_pc", scanId: "global-case-one", observedAt: "2026-07-12T05:30:00.000Z" });
    const two = await scanAt({ rootPath: nodeTwoRoot, nodeId: "tool-01", nodeRole: "tool_pc", scanId: "global-case-two", observedAt: "2026-07-12T05:30:01.000Z" });
    const state = reconcile(null, [one.packet, two.packet]);
    assert.equal(state.logical_files.length, 2);
    assert(state.collisions.some((entry) => entry.scope === "global_active_node_bindings" && entry.collision_type === "casefold"));
    assert(state.logical_files.every((entry) => entry.conflict));
    assert(state.logical_files.every((entry) => entry.conflict_reasons.includes("path_collision:casefold")));
  } finally {
    await rm(nodeOneRoot, { recursive: true, force: true });
    await rm(nodeTwoRoot, { recursive: true, force: true });
  }
});

test("multiple absent same-content candidates produce uncertain identity conflict instead of a certain rename", async () => {
  const fixture = await makeFixture("ambiguous-move");
  try {
    await writeFile(path.join(fixture, "old-a.txt"), "same", "utf8");
    await writeFile(path.join(fixture, "old-b.txt"), "same", "utf8");
    const base = await scanAt({ rootPath: fixture, nodeId: "work-01", nodeRole: "work_pc", scanId: "ambiguous-base", observedAt: "2026-07-12T05:40:00.000Z" });
    let state = reconcile(null, [base.packet]);
    assert.equal(state.logical_files.length, 2);
    await unlink(path.join(fixture, "old-a.txt"));
    await unlink(path.join(fixture, "old-b.txt"));
    await writeFile(path.join(fixture, "new.txt"), "same", "utf8");
    const moved = await scanAt({ rootPath: fixture, nodeId: "work-01", nodeRole: "work_pc", scanId: "ambiguous-moved", observedAt: "2026-07-12T05:41:00.000Z", previousCache: base.next_cache });
    state = reconcile(state, [moved.packet]);
    const event = state.observations.find((entry) => entry.scan_id === moved.packet.scan_id);
    assert.equal(event.event_kind, "ambiguous_same_content_identity");
    assert.equal(event.identity_claim, "uncertain");
    assert.equal(event.identity_candidate_logical_file_ids.length, 2);
    const logical = state.logical_files.find((entry) => entry.logical_file_id === event.logical_file_id);
    assert.equal(logical.identity_state, "uncertain");
    assert(logical.conflict_reasons.includes("ambiguous_same_content_identity"));
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("copy inference requires the source path to have matching exact content in the current packet", async () => {
  const fixture = await makeFixture("copy-pending-source");
  try {
    await writeFile(path.join(fixture, "source.txt"), "same", "utf8");
    const base = await scanAt({ rootPath: fixture, nodeId: "work-01", nodeRole: "work_pc", scanId: "copy-source-base", observedAt: "2026-07-12T05:45:00.000Z" });
    let state = reconcile(null, [base.packet]);
    await copyFile(path.join(fixture, "source.txt"), path.join(fixture, "candidate.txt"));
    const next = await scanAt({ rootPath: fixture, nodeId: "work-01", nodeRole: "work_pc", scanId: "copy-source-pending", observedAt: "2026-07-12T05:46:00.000Z", previousCache: base.next_cache });
    const sourceObservation = next.packet.observations.find((entry) => entry.relative_path === "source.txt");
    sourceObservation.content_id = null;
    sourceObservation.hash_status = "queued_budget";
    sourceObservation.observation_id = observationIdFor(sourceObservation);
    next.packet.coverage.complete = false;
    next.packet.coverage.hash_complete = false;
    next.packet.coverage.gap_reasons = ["hash_byte_budget_exhausted"];
    state = reconcile(state, [next.packet]);
    const candidateEvent = state.observations.find((entry) => entry.scan_id === next.packet.scan_id && entry.relative_path === "candidate.txt");
    assert.equal(candidateEvent.event_kind, "file_first_observed");
    assert.notEqual(candidateEvent.event_kind, "copy");
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("incomplete scans never add absence; repeated complete absence plus grace is required for deletion", async () => {
  const fixture = await makeFixture("absence");
  try {
    const filePath = path.join(fixture, "remove-me.txt");
    await writeVersion(filePath, "A", "2026-07-12T06:00:00.000Z");
    const initial = await scanAt({ rootPath: fixture, nodeId: "work-01", nodeRole: "work_pc", scanId: "scan:absence-base", observedAt: "2026-07-12T06:00:05.000Z" });
    let state = reconcile(null, [initial.packet], { absenceThreshold: 2, deletionGraceMs: 1000 });
    await unlink(filePath);

    const missingOne = await scanAt({ rootPath: path.join(fixture, "unmounted"), nodeId: "work-01", nodeRole: "work_pc", scanId: "scan:absence-incomplete", observedAt: "2026-07-12T06:01:05.000Z", previousCache: initial.next_cache });
    state = reconcile(state, [missingOne.packet], { absenceThreshold: 2, deletionGraceMs: 1000 });
    assert.equal(state.node_bindings[0].absence_count, 0);
    assert.equal(state.logical_files[0].status, "active");

    const missingTwo = await scanAt({ rootPath: fixture, nodeId: "work-01", nodeRole: "work_pc", scanId: "scan:absence-first", observedAt: "2026-07-12T06:02:05.000Z", previousCache: missingOne.next_cache });
    state = reconcile(state, [missingTwo.packet], { absenceThreshold: 2, deletionGraceMs: 1000 });
    assert.equal(state.node_bindings[0].absence_count, 1);
    assert.equal(state.logical_files[0].status, "active");

    const missingThree = await scanAt({ rootPath: fixture, nodeId: "work-01", nodeRole: "work_pc", scanId: "scan:absence-second", observedAt: "2026-07-12T06:02:07.000Z", previousCache: missingTwo.next_cache });
    state = reconcile(state, [missingThree.packet], { absenceThreshold: 2, deletionGraceMs: 1000 });
    assert.equal(state.node_bindings[0].absence_count, 2);
    assert.equal(state.logical_files[0].status, "deleted_after_confirmed_absence");
    assert.equal(state.counts.deleted_logical_file_count, 1);
    assert(state.recent_events.some((entry) => entry.event_kind === "missing_candidate"));
    assert(state.recent_events.some((entry) => entry.event_kind === "delete"));

    await writeVersion(filePath, "A", "2026-07-12T06:03:00.000Z");
    const restored = await scanAt({ rootPath: fixture, nodeId: "work-01", nodeRole: "work_pc", scanId: "scan:absence-restore", observedAt: "2026-07-12T06:03:05.000Z", previousCache: missingThree.next_cache });
    state = reconcile(state, [restored.packet], { absenceThreshold: 2, deletionGraceMs: 1000 });
    assert.equal(state.logical_files[0].status, "active");
    assert.equal("deleted_at" in state.logical_files[0], false);
    assert.equal("deletion_basis" in state.logical_files[0], false);
    const restoreEvent = state.recent_events.find((entry) => entry.event_kind === "restore");
    assert(restoreEvent);
    assert.match(restoreEvent.event_id, /^file-event:[a-f0-9]{64}$/u);
    assert.equal(restoreEvent.change_interval.basis, "bounded_by_delete_receipt_and_primary_receipt");
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("portable observations never advance absence or deletion authority", async () => {
  const fixture = await makeFixture("portable-absence");
  try {
    const filePath = path.join(fixture, "portable.txt");
    await writeFile(filePath, "A", "utf8");
    const initial = await scanAt({ rootPath: fixture, nodeId: "air-01", nodeRole: "portable_dev_pc", scanId: "portable-base", observedAt: "2026-07-12T06:30:00.000Z" });
    let state = reconcile(null, [initial.packet], { absenceThreshold: 1, deletionGraceMs: 0 });
    await unlink(filePath);
    const absent = await scanAt({ rootPath: fixture, nodeId: "air-01", nodeRole: "portable_dev_pc", scanId: "portable-absent", observedAt: "2026-07-12T06:31:00.000Z", previousCache: initial.next_cache });
    state = reconcile(state, [absent.packet], { absenceThreshold: 1, deletionGraceMs: 0 });
    assert.equal(state.node_bindings[0].absence_count, 0);
    assert.equal(state.logical_files[0].status, "active");
    assert.deepEqual(state.boundary.absence_authority_roles, ["work_pc"]);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("future producer clocks cannot satisfy a 24-hour deletion grace within two primary receipt minutes", async () => {
  const fixture = await makeFixture("receipt-clock-deletion");
  try {
    const filePath = path.join(fixture, "future-clock.txt");
    await writeFile(filePath, "A", "utf8");
    const base = await scanAt({ rootPath: fixture, nodeId: "work-01", nodeRole: "work_pc", scanId: "receipt-base", observedAt: "2026-07-12T09:00:00.000Z" });
    let state = reconcile(null, [base.packet], {
      absenceThreshold: 2,
      deletionGraceMs: 24 * 60 * 60 * 1000,
      receivedAt: "2026-07-12T09:00:02.000Z",
    });
    await unlink(filePath);
    const firstAbsence = await scanAt({ rootPath: fixture, nodeId: "work-01", nodeRole: "work_pc", scanId: "receipt-future-one", observedAt: "2026-08-01T00:00:00.000Z", previousCache: base.next_cache });
    state = reconcile(state, [firstAbsence.packet], {
      absenceThreshold: 2,
      deletionGraceMs: 24 * 60 * 60 * 1000,
      receivedAt: "2026-07-12T10:00:00.000Z",
    });
    const secondAbsence = await scanAt({ rootPath: fixture, nodeId: "work-01", nodeRole: "work_pc", scanId: "receipt-future-two", observedAt: "2026-08-03T00:00:00.000Z", previousCache: firstAbsence.next_cache });
    state = reconcile(state, [secondAbsence.packet], {
      absenceThreshold: 2,
      deletionGraceMs: 24 * 60 * 60 * 1000,
      receivedAt: "2026-07-12T10:02:00.000Z",
    });
    assert.equal(state.node_bindings[0].absence_count, 2);
    assert.equal(state.node_bindings[0].first_absent_received_at, "2026-07-12T10:00:00.000Z");
    assert.equal(state.node_bindings[0].last_absent_received_at, "2026-07-12T10:02:00.000Z");
    assert.equal(state.logical_files[0].status, "active");
    assert.equal(state.recent_events.some((entry) => entry.event_kind === "delete"), false);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("clock skew switches to receipt order after five minutes and blocks exact order after fifteen", async () => {
  const fixture = await makeFixture("clock");
  try {
    const warning = await scanAt({
      rootPath: fixture,
      nodeId: "work-01",
      nodeRole: "work_pc",
      scanId: "scan:clock-warning",
      observedAt: "2026-07-12T07:00:00.000Z",
      ingestedAt: "2026-07-12T07:06:00.000Z",
    });
    assert.equal(warning.packet.temporal_ordering.state, "clock_skew_receipt_order_warning");
    assert.equal(warning.packet.temporal_ordering.ordering_basis, "ingested_at_receipt_order");
    assert.equal(warning.packet.temporal_ordering.exact_temporal_ordering_blocked, false);

    const blocked = await scanAt({
      rootPath: fixture,
      nodeId: "work-01",
      nodeRole: "work_pc",
      scanId: "scan:clock-blocked",
      observedAt: "2026-07-12T07:00:00.000Z",
      ingestedAt: "2026-07-12T07:16:00.001Z",
    });
    assert.equal(blocked.packet.temporal_ordering.state, "clock_skew_blocked_exact_order");
    assert.equal(blocked.packet.temporal_ordering.exact_temporal_ordering_blocked, true);
    const state = reconcile(null, [blocked.packet]);
    assert.equal(state.coverage_gaps[0].exact_temporal_ordering_blocked, true);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("reconciler rejects a chained producer packet whose observed or ingested clock regresses", async () => {
  const fixture = await makeFixture("producer-clock-regression");
  try {
    const filePath = path.join(fixture, "clock.txt");
    await writeVersion(filePath, "A", "2026-07-12T09:00:00.000Z");
    const first = await scanAt({
      rootPath: fixture,
      nodeId: "work-01",
      nodeRole: "work_pc",
      scanId: "producer-clock-first",
      observedAt: "2026-07-12T09:00:01.000Z",
      ingestedAt: "2026-07-12T09:00:02.000Z",
    });
    await writeVersion(filePath, "B", "2026-07-12T09:01:00.000Z");
    const second = await scanAt({
      rootPath: fixture,
      nodeId: "work-01",
      nodeRole: "work_pc",
      scanId: "producer-clock-second",
      observedAt: "2026-07-12T09:01:01.000Z",
      ingestedAt: "2026-07-12T09:01:02.000Z",
      previousCache: first.next_cache,
    });
    const state = reconcile(null, [first.packet], { receivedAt: "2026-07-12T09:00:10.000Z" });
    assert.equal(state.node_cursors[0].last_observed_at, first.packet.observed_at);
    assert.equal(state.node_cursors[0].last_ingested_at, first.packet.ingested_at);

    const regressed = structuredClone(second.packet);
    regressed.observed_at = "2026-07-12T08:59:01.000Z";
    regressed.ingested_at = "2026-07-12T08:59:02.000Z";
    for (const observation of regressed.observations) {
      observation.observed_at = regressed.observed_at;
      observation.ingested_at = regressed.ingested_at;
    }
    assert.throws(() => reconcile(state, [regressed], {
      receivedAt: "2026-07-12T09:01:10.000Z",
    }), /file_activity_producer_clock_regressed/u);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("only operational-primary always-on node reconciles, and weak hashes are rejected", async () => {
  const fixture = await makeFixture("primary");
  try {
    await writeFile(path.join(fixture, "file.txt"), "A", "utf8");
    const scanned = await scanAt({ rootPath: fixture, nodeId: "work-01", nodeRole: "work_pc", scanId: "scan:primary-base", observedAt: "2026-07-12T08:00:00.000Z" });
    assert.throws(() => reconcileObservationPackets({
      ...PRIMARY,
      reconcilerNodeRole: "work_pc",
      packets: [scanned.packet],
    }), /file_activity_reconcile_requires_operational_primary/u);
    assert.throws(() => reconcileObservationPackets({
      ...PRIMARY,
      operationalPrimary: false,
      packets: [scanned.packet],
    }), /file_activity_reconcile_requires_operational_primary/u);

    const weak = structuredClone(scanned.packet);
    weak.observations[0].content_id = "sample:abcd";
    assert.throws(() => reconcile(null, [weak]), /file_activity_weak_content_identity_blocked/u);

    await assert.rejects(() => scanWorkspace({
      projectCode: PROJECT,
      workspaceBindingId: BINDING,
      nodeId: "mac-mini-primary",
      nodeRole: "always_on_node",
      rootPath: fixture,
      bindingValid: true,
      operationalPrimary: false,
      scanId: "scan:always-on-not-primary",
    }), /file_activity_always_on_scan_requires_operational_primary/u);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("reconciler allowlists packet metadata, drops injected payload fields, and blocks absolute or traversal paths", async () => {
  const fixture = await makeFixture("packet-sanitize");
  try {
    await writeFile(path.join(fixture, "safe.txt"), "A", "utf8");
    const scanned = await scanAt({ rootPath: fixture, nodeId: "work-01", nodeRole: "work_pc", scanId: "scan:sanitize-base", observedAt: "2026-07-12T08:30:00.000Z" });
    const injected = structuredClone(scanned.packet);
    injected.raw_body = "top-level payload";
    injected.observations[0].raw_body = "observation payload";
    injected.observations[0].absolute_path = "/private/worksite/safe.txt";
    injected.observations[0].content = "source contents";
    const state = reconcile(null, [injected]);
    const serialized = JSON.stringify(state);
    assert.equal(serialized.includes("top-level payload"), false);
    assert.equal(serialized.includes("observation payload"), false);
    assert.equal(serialized.includes("/private/worksite"), false);
    assert.equal(serialized.includes("source contents"), false);

    const absolute = structuredClone(scanned.packet);
    absolute.observations[0].relative_path = "/private/safe.txt";
    assert.throws(() => reconcile(null, [absolute]), /file_activity_relative_path_invalid/u);
    const traversal = structuredClone(scanned.packet);
    traversal.observations[0].relative_path = "../safe.txt";
    assert.throws(() => reconcile(null, [traversal]), /file_activity_relative_path_invalid/u);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("same scan id and digest is idempotent while same scan id with a different canonical digest fails closed", async () => {
  const fixture = await makeFixture("digest-receipt");
  try {
    await writeFile(path.join(fixture, "file.txt"), "A", "utf8");
    const scanned = await scanAt({ rootPath: fixture, nodeId: "work-01", nodeRole: "work_pc", scanId: "digest-base", observedAt: "2026-07-12T08:40:00.000Z" });
    const state = reconcile(null, [scanned.packet]);
    const duplicate = reconcile(state, [structuredClone(scanned.packet)], { receivedAt: "2026-07-12T08:41:00.000Z" });
    assert.deepEqual(duplicate, state);
    assert.match(state.scan_receipts[0].packet_digest, /^sha256:[a-f0-9]{64}$/u);

    const altered = structuredClone(scanned.packet);
    altered.coverage.complete = false;
    altered.coverage.hash_complete = false;
    altered.coverage.gap_reasons = ["fixture_digest_change"];
    const before = JSON.stringify(state);
    assert.throws(() => reconcile(state, [altered]), /file_activity_scan_digest_conflict/u);
    assert.equal(JSON.stringify(state), before);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("late older node sequence remains evidence and cannot mutate a newer binding or revision head", async () => {
  const fixture = await makeFixture("late-sequence");
  try {
    const filePath = path.join(fixture, "file.txt");
    await writeVersion(filePath, "A", "2026-07-12T08:50:00.000Z");
    const first = await scanAt({ rootPath: fixture, nodeId: "work-01", nodeRole: "work_pc", scanId: "late-a", observedAt: "2026-07-12T08:50:01.000Z" });
    await writeVersion(filePath, "B", "2026-07-12T08:51:00.000Z");
    const second = await scanAt({ rootPath: fixture, nodeId: "work-01", nodeRole: "work_pc", scanId: "late-b", observedAt: "2026-07-12T08:51:01.000Z", previousCache: first.next_cache });
    let state = reconcile(null, [first.packet, second.packet]);
    const headBefore = [...state.logical_files[0].current_revision_ids];
    const revisionCountBefore = state.revisions.length;
    const stale = reissuePacket(first.packet, "late-a-reissued");
    state = reconcile(state, [stale], { receivedAt: "2026-07-12T08:52:00.000Z" });
    assert.deepEqual(state.logical_files[0].current_revision_ids, headBefore);
    assert.equal(state.revisions.length, revisionCountBefore);
    assert.equal(state.scan_receipts.find((entry) => entry.scan_id === stale.scan_id).disposition, "late_stale_no_mutation");
    assert(state.observations.some((entry) => entry.scan_id === stale.scan_id && entry.event_kind === "held_packet_evidence"));
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("node sequence gaps are held without mutation and can apply after the missing chained packet arrives", async () => {
  const fixture = await makeFixture("sequence-gap");
  try {
    const filePath = path.join(fixture, "file.txt");
    await writeVersion(filePath, "A", "2026-07-12T08:55:00.000Z");
    const first = await scanAt({ rootPath: fixture, nodeId: "work-01", nodeRole: "work_pc", scanId: "gap-a", observedAt: "2026-07-12T08:55:01.000Z" });
    await writeVersion(filePath, "B", "2026-07-12T08:56:00.000Z");
    const second = await scanAt({ rootPath: fixture, nodeId: "work-01", nodeRole: "work_pc", scanId: "gap-b", observedAt: "2026-07-12T08:56:01.000Z", previousCache: first.next_cache });
    await writeVersion(filePath, "C", "2026-07-12T08:57:00.000Z");
    const third = await scanAt({ rootPath: fixture, nodeId: "work-01", nodeRole: "work_pc", scanId: "gap-c", observedAt: "2026-07-12T08:57:01.000Z", previousCache: second.next_cache });
    let state = reconcile(null, [first.packet], { receivedAt: "2026-07-12T09:00:00.000Z" });
    state = reconcile(state, [third.packet], { receivedAt: "2026-07-12T09:01:00.000Z" });
    assert.equal(state.revisions.length, 1);
    assert.equal(state.node_cursors[0].last_sequence, 1);
    assert.equal(state.scan_receipts.find((entry) => entry.scan_id === third.packet.scan_id).disposition, "sequence_gap_held");
    assert(state.coverage_gaps.some((entry) => entry.reason === "node_sequence_gap"));
    assert.throws(
      () => reconcile(state, [second.packet], { receivedAt: "2026-07-12T09:00:30.000Z" }),
      /file_activity_primary_receipt_clock_regressed/u,
    );
    state = reconcile(state, [second.packet], { receivedAt: "2026-07-12T09:02:00.000Z" });
    assert.equal(state.node_cursors[0].last_sequence, 2);
    state = reconcile(state, [third.packet], { receivedAt: "2026-07-12T09:03:00.000Z" });
    assert.equal(state.node_cursors[0].last_sequence, 3);
    assert.equal(state.scan_receipts.find((entry) => entry.scan_id === third.packet.scan_id).disposition, "applied");
    assert.equal(state.revisions.length, 3);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("packet validator recomputes collision/path/observation identity and rejects inconsistent coverage or withheld rows", async () => {
  const fixture = await makeFixture("packet-integrity");
  try {
    await writeFile(path.join(fixture, "safe.txt"), "A", "utf8");
    const scanned = await scanAt({ rootPath: fixture, nodeId: "work-01", nodeRole: "work_pc", scanId: "integrity-base", observedAt: "2026-07-12T08:58:00.000Z" });
    const keyMismatch = structuredClone(scanned.packet);
    keyMismatch.observations[0].path_collision_keys.nfc = `nfc:${"0".repeat(64)}`;
    assert.throws(() => reconcile(null, [keyMismatch]), /file_activity_collision_key_mismatch/u);
    const exactMismatch = structuredClone(scanned.packet);
    exactMismatch.observations[0].path_collision_keys.exact = `exact:${"0".repeat(64)}`;
    exactMismatch.observations[0].path_fingerprint = pathFingerprintForCollisionKeys(exactMismatch.observations[0].path_collision_keys);
    exactMismatch.observations[0].observation_id = observationIdFor(exactMismatch.observations[0]);
    assert.throws(() => reconcile(null, [exactMismatch]), /file_activity_collision_key_mismatch/u);
    const fingerprintMismatch = structuredClone(scanned.packet);
    fingerprintMismatch.observations[0].path_fingerprint = `path:${"1".repeat(64)}`;
    assert.throws(() => reconcile(null, [fingerprintMismatch]), /file_activity_path_fingerprint_mismatch/u);
    const observationMismatch = structuredClone(scanned.packet);
    observationMismatch.observations[0].observation_id = `obs:${"2".repeat(64)}`;
    assert.throws(() => reconcile(null, [observationMismatch]), /file_activity_observation_id_mismatch/u);
    const withheld = structuredClone(scanned.packet);
    withheld.observations[0].withheld = true;
    assert.throws(() => reconcile(null, [withheld]), /file_activity_sensitive_observation_row_blocked/u);
    const gapMarkedComplete = structuredClone(scanned.packet);
    gapMarkedComplete.coverage.gap_reasons = ["unexpected_gap"];
    assert.throws(() => reconcile(null, [gapMarkedComplete]), /file_activity_packet_coverage_invalid/u);
    const missingSize = structuredClone(scanned.packet);
    missingSize.observations[0].size_bytes = null;
    assert.throws(() => reconcile(null, [missingSize]), /file_activity_exact_hash_size_required/u);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("all packet clocks require exact UTC milliseconds and reject ambiguous or impossible zones", async () => {
  const fixture = await makeFixture("strict-clock");
  try {
    for (const invalidClock of [
      "2026-07-12",
      "2026-07-12T09:00:00.000",
      "2026-07-12T09:00:00.000+15:00",
      "2026-07-12T09:00:00.000+14:01",
    ]) {
      await assert.rejects(() => scanWorkspace({
        projectCode: PROJECT,
        workspaceBindingId: BINDING,
        nodeId: "work-01",
        nodeRole: "work_pc",
        rootPath: fixture,
        bindingValid: true,
        observedAt: invalidClock,
      }), /file_activity_observed_at_invalid/u);
    }
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("previous revision state is strict-reconstructed, strips unknown payloads, and rejects path or size-cap bypasses", async () => {
  const fixture = await makeFixture("previous-state-boundary");
  try {
    const filePath = path.join(fixture, "state.txt");
    await writeFile(filePath, "state payload", "utf8");
    const first = await scanAt({
      rootPath: fixture,
      nodeId: "work-01",
      nodeRole: "work_pc",
      scanId: "previous-state-first",
      observedAt: "2026-07-12T11:00:00.000Z",
    });
    let state = reconcile(null, [first.packet], { receivedAt: "2026-07-12T11:00:30.000Z" });
    await unlink(filePath);
    const missing = await scanAt({
      rootPath: fixture,
      nodeId: "work-01",
      nodeRole: "work_pc",
      scanId: "previous-state-missing",
      observedAt: "2026-07-12T11:05:00.000Z",
      previousCache: first.next_cache,
    });
    state = reconcile(state, [missing.packet], { receivedAt: "2026-07-12T11:05:30.000Z" });
    assert(state.recent_events.some((entry) => entry.event_kind === "missing_candidate"));

    const rawSentinel = "PRIOR_STATE_RAW_SENTINEL";
    const absoluteSentinel = path.resolve(path.parse(fixture).root, "private", "prior-state-sentinel");
    const poisoned = structuredClone(state);
    poisoned.raw_body = rawSentinel;
    poisoned.unknown_history = Array.from({ length: 10_000 }, () => rawSentinel);
    poisoned.boundary.raw_body = rawSentinel;
    poisoned.compaction.absolute_path = absoluteSentinel;
    poisoned.scan_receipts[0].raw_body = rawSentinel;
    poisoned.observations[0].absolute_path = absoluteSentinel;
    poisoned.logical_files[0].raw_body = rawSentinel;
    poisoned.revisions[0].absolute_path = absoluteSentinel;
    poisoned.node_bindings[0].raw_body = rawSentinel;
    poisoned.recent_events[0].details.absolute_path = absoluteSentinel;

    const reconstructed = reconcileObservationPackets({
      ...PRIMARY,
      previousState: poisoned,
      packets: [],
      receivedAt: "2026-07-12T11:06:00.000Z",
    });
    const serialized = JSON.stringify(reconstructed);
    assert.equal(serialized.includes(rawSentinel), false);
    assert.equal(serialized.includes(absoluteSentinel), false);
    assert.equal("unknown_history" in reconstructed, false);
    assert.equal("raw_body" in reconstructed.logical_files[0], false);
    assert(Buffer.byteLength(serialized, "utf8") < Buffer.byteLength(JSON.stringify(poisoned), "utf8") / 10);

    const absoluteKnownPath = structuredClone(state);
    absoluteKnownPath.node_bindings[0].relative_path = absoluteSentinel;
    assert.throws(() => reconcileObservationPackets({
      ...PRIMARY,
      previousState: absoluteKnownPath,
      packets: [],
      receivedAt: "2026-07-12T11:06:00.000Z",
    }), /file_activity_relative_path_invalid/u);

    const exactKeyTamper = structuredClone(state);
    exactKeyTamper.node_bindings[0].path_collision_keys.exact = buildPathCollisionKeys("other.txt").exact;
    exactKeyTamper.node_bindings[0].path_fingerprint = pathFingerprintForCollisionKeys(
      exactKeyTamper.node_bindings[0].path_collision_keys,
    );
    assert.throws(() => reconcileObservationPackets({
      ...PRIMARY,
      previousState: exactKeyTamper,
      packets: [],
      receivedAt: "2026-07-12T11:06:00.000Z",
    }), /file_activity_previous_state_binding_collision_key_mismatch/u);

    const sensitiveKnownPath = structuredClone(state);
    const sensitiveRelativePath = "credentials/state.txt";
    const sensitiveKeys = buildPathCollisionKeys(sensitiveRelativePath);
    Object.assign(sensitiveKnownPath.node_bindings[0], {
      relative_path: sensitiveRelativePath,
      relative_path_spelling: sensitiveRelativePath,
      path_collision_keys: sensitiveKeys,
      path_fingerprint: pathFingerprintForCollisionKeys(sensitiveKeys),
    });
    assert.throws(() => reconcileObservationPackets({
      ...PRIMARY,
      previousState: sensitiveKnownPath,
      packets: [],
      receivedAt: "2026-07-12T11:06:00.000Z",
    }), /file_activity_previous_state_binding_path_invalid/u);

    const oversized = structuredClone(state);
    oversized.observations = Array.from(
      { length: FILE_ACTIVITY_STATE_LIMITS.recent_event_summaries + 1 },
      () => structuredClone(state.observations[0]),
    );
    assert.throws(() => reconcileObservationPackets({
      ...PRIMARY,
      previousState: oversized,
      packets: [],
      receivedAt: "2026-07-12T11:06:00.000Z",
    }), /file_activity_previous_state_observations_limit_exceeded/u);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("previous scan cache requires an exact allowlist and canonical path, stat, digest, and time entries", async () => {
  const fixture = await makeFixture("previous-cache-boundary");
  try {
    await writeFile(path.join(fixture, "cache.txt"), "cache payload", "utf8");
    const first = await scanAt({
      rootPath: fixture,
      nodeId: "work-01",
      nodeRole: "work_pc",
      scanId: "strict-cache-first",
      observedAt: "2026-07-12T11:30:00.000Z",
    });
    assert.equal(first.next_cache.entries[0].relative_path_spelling, "cache.txt");

    const expectRejected = async (label, mutate, pattern) => {
      const cache = structuredClone(first.next_cache);
      mutate(cache);
      await assert.rejects(() => scanAt({
        rootPath: fixture,
        nodeId: "work-01",
        nodeRole: "work_pc",
        scanId: `strict-cache-${label}`,
        observedAt: "2026-07-12T11:35:00.000Z",
        previousCache: cache,
      }), pattern);
    };

    await expectRejected("top-unknown", (cache) => { cache.raw_body = "CACHE_RAW_SENTINEL"; }, /scan_cache_unknown_or_missing_field/u);
    await expectRejected("entry-unknown", (cache) => {
      cache.entries[0].absolute_path = path.resolve(path.parse(fixture).root, "private", "cache-sentinel");
    }, /scan_cache_entry_unknown_or_missing_field/u);
    await expectRejected("stat-unknown", (cache) => { cache.entries[0].stat_tuple.raw_body = "x"; }, /scan_cache_stat_tuple_unknown_or_missing_field/u);
    await expectRejected("bad-digest", (cache) => { cache.entries[0].content_id = "sha256:not-a-digest"; }, /cache_content_id_invalid/u);
    await expectRejected("bad-stat", (cache) => { cache.entries[0].stat_tuple.changed_time_ms = "0"; }, /cache_stat_changed_time_ms_invalid/u);
    await expectRejected("future-verified", (cache) => { cache.entries[0].verified_at = "2026-07-12T12:00:00.000Z"; }, /scan_cache_verified_at_future/u);
    await expectRejected("exact-key", (cache) => {
      cache.entries[0].path_collision_keys.exact = buildPathCollisionKeys("other.txt").exact;
      cache.entries[0].path_fingerprint = pathFingerprintForCollisionKeys(cache.entries[0].path_collision_keys);
    }, /scan_cache_collision_key_mismatch/u);
    await expectRejected("sensitive", (cache) => {
      const relativePath = "credentials/cache.txt";
      const keys = buildPathCollisionKeys(relativePath);
      Object.assign(cache.entries[0], {
        relative_path: relativePath,
        relative_path_spelling: relativePath,
        path_collision_keys: keys,
        path_fingerprint: pathFingerprintForCollisionKeys(keys),
      });
    }, /scan_cache_path_spelling_mismatch/u);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("reconcile artifacts are deterministic monthly metadata envelopes and checkpoints restore only canonical state", async () => {
  const fixture = await makeFixture("reconcile-artifacts");
  try {
    await writeFile(path.join(fixture, "projection-private-name.txt"), "private source bytes", "utf8");
    const scanned = await scanAt({
      rootPath: fixture,
      nodeId: "work-01",
      nodeRole: "work_pc",
      scanId: "artifact-envelope-one",
      observedAt: "2026-07-12T12:00:00.000Z",
      ingestedAt: "2026-07-12T12:00:01.000Z",
    });
    const options = {
      ...PRIMARY,
      previousState: null,
      packets: [scanned.packet],
      receivedAt: "2026-08-01T00:00:00.000Z",
    };
    const first = reconcileObservationPacketsWithArtifacts(options);
    const repeated = reconcileObservationPacketsWithArtifacts(options);
    assert.deepEqual(repeated, first);
    assert.equal(first.artifacts.receipt_artifacts.length, 1);
    assert.match(first.artifacts.refs.receipt_refs[0], /\/receipts\/2026-07\/[a-f0-9]{64}\.json$/u);
    assert.match(first.artifacts.refs.event_ref, /\/events\/2026-08\/[a-f0-9]{64}\.json$/u);
    assert.match(first.artifacts.refs.checkpoint_ref, /\/checkpoints\/2026-08\/[a-f0-9]{64}\.json$/u);
    assert.equal(first.artifacts.receipt_artifacts[0].value.schema_version, FILE_RECONCILE_RECEIPT_SCHEMA);
    assert.equal(first.artifacts.event_partition.schema_version, FILE_RECONCILE_EVENT_SCHEMA);
    assert.equal(first.artifacts.checkpoint.schema_version, FILE_REVISION_CHECKPOINT_SCHEMA);
    assert.equal(first.artifacts.checkpoint.boundary.tail_replay_supported, false);
    assert.equal(first.state.boundary.checkpoint_tail_replay_supported, false);
    assert.equal(first.state.storage_bounds.lineage_graph_compaction_enabled, false);
    assert.equal(first.state.storage_bounds.blocker_codes.revisions, "file_activity_revision_state_revisions_limit_exceeded");

    const projection = first.artifacts.projection;
    assert.equal(projection.schema_version, FILE_ACTIVITY_LIFE_TREE_PROJECTION_SCHEMA);
    assert.deepEqual(Object.keys(projection).sort(), [
      "boundary",
      "coverage",
      "events",
      "generated_at",
      "project_code",
      "schema_version",
      "source_checkpoint",
      "workspace_binding_id",
    ]);
    assert.equal(projection.coverage.state, "partial");
    assert(projection.coverage.gap_reasons.includes("erp_upload_adapter_unavailable"));
    assert(projection.coverage.gap_reasons.includes("live_collector_not_activated"));
    assert.deepEqual(
      projection.source_checkpoint.partition_refs,
      [...projection.source_checkpoint.partition_refs].sort(),
    );
    assert.equal(projection.boundary.derived_rebuildable, true);
    assert.equal(projection.events.length, 1);
    const event = projection.events[0];
    assert.deepEqual(Object.keys(event).sort(), [
      "access",
      "change_interval",
      "content_id",
      "erp_upload_event_ref",
      "event_kind",
      "evidence_refs",
      "identity_basis",
      "identity_claim",
      "ingested_at",
      "logical_file_id",
      "node_id",
      "node_role",
      "observation_id",
      "observed_at",
      "packet_digest",
      "received_at",
      "revision_id",
      "scan_id",
      "size_bytes",
      "source_event_id",
      "source_kind",
      "uncertainty",
    ]);
    assert.equal(event.source_kind, "scanner_observation");
    assert.equal(event.event_kind, "file_first_observed");
    assert.equal(event.uncertainty, "confirmed");
    assert.equal(event.erp_upload_event_ref, null);
    assert.match(event.content_id, /^sha256:[a-f0-9]{64}$/u);
    assert.equal(event.size_bytes, 20);
    assert.deepEqual(event.evidence_refs, [...event.evidence_refs].sort());
    assert.deepEqual(event.access, { visibility: "admins", account_refs: [] });
    const projectionRaw = JSON.stringify(projection);
    assert.equal(projectionRaw.includes(fixture), false);
    assert.equal(projectionRaw.includes("projection-private-name.txt"), false);
    assert.equal(projectionRaw.includes("private source bytes"), false);
    assert.equal(projectionRaw.includes("relative_path"), false);

    const restored = restoreRevisionStateCheckpoint(first.artifacts.checkpoint, {
      projectCode: PROJECT,
      workspaceBindingId: BINDING,
      reconcilerNodeId: PRIMARY.reconcilerNodeId,
    });
    assert.deepEqual(restored, first.state);
    const unknownTop = structuredClone(first.artifacts.checkpoint);
    unknownTop.raw_body = "CHECKPOINT_RAW_SENTINEL";
    assert.throws(() => restoreRevisionStateCheckpoint(unknownTop, {
      projectCode: PROJECT,
      workspaceBindingId: BINDING,
      reconcilerNodeId: PRIMARY.reconcilerNodeId,
    }), /revision_checkpoint_unknown_or_missing_field/u);
    const tampered = structuredClone(first.artifacts.checkpoint);
    tampered.state.raw_body = "CHECKPOINT_RAW_SENTINEL";
    assert.throws(() => restoreRevisionStateCheckpoint(tampered, {
      projectCode: PROJECT,
      workspaceBindingId: BINDING,
      reconcilerNodeId: PRIMARY.reconcilerNodeId,
    }), /revision_checkpoint_digest_mismatch/u);
    assert.throws(() => restoreRevisionStateCheckpoint(first.artifacts.checkpoint, {
      projectCode: "P99-WRONG",
      workspaceBindingId: BINDING,
      reconcilerNodeId: PRIMARY.reconcilerNodeId,
    }), /revision_checkpoint_scope_mismatch/u);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("reconcile packet batch leaves room for event/checkpoint refs under the strict projection cap", () => {
  assert.equal(FILE_ACTIVITY_RECONCILE_LIMITS.packet_batch + 2, 5000);
  assert.throws(() => reconcileObservationPackets({
    ...PRIMARY,
    packets: Array(FILE_ACTIVITY_RECONCILE_LIMITS.packet_batch + 1).fill(null),
    receivedAt: "2026-07-12T12:00:00.000Z",
  }), /reconcile_packet_batch_limit_exceeded/u);
});

test("projection clock-skew envelopes use receipt-only intervals required by the strict consumer", async () => {
  const fixture = await makeFixture("projection-clock-envelope");
  try {
    await writeFile(path.join(fixture, "clock.txt"), "clock", "utf8");
    const warningScan = await scanAt({
      rootPath: fixture,
      nodeId: "work-warning",
      nodeRole: "work_pc",
      scanId: "projection-clock-warning",
      observedAt: "2026-07-12T12:00:00.000Z",
      ingestedAt: "2026-07-12T12:06:00.001Z",
    });
    const warning = reconcileObservationPacketsWithArtifacts({
      ...PRIMARY,
      packets: [warningScan.packet],
      receivedAt: "2026-07-12T12:07:00.000Z",
    }).artifacts.projection.events[0];
    assert.equal(warning.received_at, "2026-07-12T12:07:00.000Z");
    assert.deepEqual(warning.change_interval, {
      after: "2026-07-12T12:07:00.000Z",
      before: "2026-07-12T12:07:00.000Z",
      basis: "receipt_order_only_clock_skew",
    });

    const blockedScan = await scanAt({
      rootPath: fixture,
      nodeId: "work-blocked",
      nodeRole: "work_pc",
      scanId: "projection-clock-blocked",
      observedAt: "2026-07-12T12:00:00.000Z",
      ingestedAt: "2026-07-12T12:16:00.001Z",
    });
    const blocked = reconcileObservationPacketsWithArtifacts({
      ...PRIMARY,
      packets: [blockedScan.packet],
      receivedAt: "2026-07-12T12:17:00.000Z",
    }).artifacts.projection.events[0];
    assert.equal(blocked.received_at, "2026-07-12T12:17:00.000Z");
    assert.deepEqual(blocked.change_interval, {
      after: "2026-07-12T12:17:00.000Z",
      before: "2026-07-12T12:17:00.000Z",
      basis: "exact_order_blocked_clock_skew",
    });
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("high-volume reducer keeps recent summaries, receipts, and revision observation refs bounded", async () => {
  const fixture = await makeFixture("bounded-state");
  try {
    await writeFile(path.join(fixture, "steady.txt"), "A", "utf8");
    const packets = [];
    let cache = null;
    const count = FILE_ACTIVITY_STATE_LIMITS.scan_receipts + 25;
    const start = Date.parse("2026-07-13T00:00:00.000Z");
    for (let index = 0; index < count; index += 1) {
      const observedAt = new Date(start + index * 1000).toISOString();
      const scanned = await scanAt({
        rootPath: fixture,
        nodeId: "work-01",
        nodeRole: "work_pc",
        scanId: `bounded-${index}`,
        observedAt,
        previousCache: cache,
      });
      packets.push(scanned.packet);
      cache = scanned.next_cache;
    }
    const state = reconcile(null, packets, { receivedAt: new Date(start + count * 1000 + 30_000).toISOString() });
    assert.equal(state.scan_receipts.length, FILE_ACTIVITY_STATE_LIMITS.scan_receipts);
    assert.equal(state.observations.length, FILE_ACTIVITY_STATE_LIMITS.recent_event_summaries);
    assert(state.recent_events.length <= FILE_ACTIVITY_STATE_LIMITS.recent_reconciliation_events);
    assert(state.revisions.every((entry) => entry.observation_ids.length <= FILE_ACTIVITY_STATE_LIMITS.revision_observation_refs));
    assert(state.revisions.every((entry) => entry.source_scan_ids.length <= FILE_ACTIVITY_STATE_LIMITS.revision_observation_refs));
    assert(state.compaction.scan_receipts_dropped_total > 0);
    assert(state.compaction.recent_event_summaries_dropped_total > 0);
    assert(state.compaction.revision_observation_refs_dropped_total > 0);
    assert(Buffer.byteLength(JSON.stringify(state), "utf8") < 2_000_000);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("CLI is dry-run by default and writes only behind --write-outbox / --apply gates", async () => {
  const tempRepo = await makeFixture("cli-repo");
  const worksite = path.join(tempRepo, "approved-worksite");
  const cliPath = path.resolve("guild_hall/file_activity/cli.mjs");
  try {
    await mkdir(path.join(tempRepo, "_workmeta", PROJECT), { recursive: true });
    await mkdir(worksite, { recursive: true });
    await writeFile(path.join(worksite, "artifact.txt"), "private artifact payload", "utf8");
    const scanArgs = [
      cliPath,
      "scan",
      "--repo-root", tempRepo,
      "--project", PROJECT,
      "--binding", BINDING,
      "--node", "work-01",
      "--node-role", "work_pc",
      "--root", worksite,
      "--binding-valid",
      "--observed-at", "2026-07-12T09:00:00.000Z",
      "--ingested-at", "2026-07-12T09:00:01.000Z",
      "--scan-id", scanIdFor("cli-immutable-one"),
    ];
    const dryScan = spawnSync(process.execPath, scanArgs, { encoding: "utf8" });
    assert.equal(dryScan.status, 0, dryScan.stderr);
    const dryScanResult = JSON.parse(dryScan.stdout);
    assert.equal(dryScanResult.status, "dry_run_no_write");
    assert.equal(dryScanResult.side_effects.packet_written, false);
    assert.match(dryScanResult.packet_ref, /^_workmeta\/P00-TEST\/reports\/file_activity\/observations\/work-01\/2026\/07\//u);
    await assert.rejects(() => access(path.join(tempRepo, dryScanResult.packet_ref)));
    const cachePath = path.join(tempRepo, "guild_hall", "state", "local", "file_activity", PROJECT, BINDING, "work-01", "scan_cache.json");
    await assert.rejects(() => access(cachePath));

    const writeScanArgs = [...scanArgs, "--full", "--write-outbox"];
    const scan = spawnSync(process.execPath, writeScanArgs, { encoding: "utf8" });
    assert.equal(scan.status, 0, scan.stderr);
    const scanResult = JSON.parse(scan.stdout);
    assert.equal(scanResult.status, "written");
    assert.equal(scanResult.full_rehash, true);
    assert.equal(scanResult.side_effects.cache_written, true);
    assert.equal(scan.stdout.includes(tempRepo), false);
    const packetPath = path.join(tempRepo, scanResult.packet_ref);
    const packetRaw = await readFile(packetPath, "utf8");
    assert.equal(packetRaw.includes(tempRepo), false);
    assert.equal(packetRaw.includes("private artifact payload"), false);

    const duplicate = spawnSync(process.execPath, writeScanArgs, { encoding: "utf8" });
    assert.equal(duplicate.status, 1);
    assert.match(duplicate.stderr, /file_activity_immutable_packet_exists/u);

    await truncate(cachePath, 64 * 1024 * 1024 + 1);
    const oversizedCache = spawnSync(process.execPath, scanArgs, { encoding: "utf8" });
    assert.equal(oversizedCache.status, 1);
    assert.match(oversizedCache.stderr, /file_activity_scan_cache_read_failed_size_limit_exceeded/u);
    const fullRecovery = spawnSync(process.execPath, [...scanArgs, "--full"], { encoding: "utf8" });
    assert.equal(fullRecovery.status, 0, fullRecovery.stderr);
    assert.equal(JSON.parse(fullRecovery.stdout).cache_chain_state, "reset_requires_rebinding");
    assert.equal(JSON.parse(fullRecovery.stdout).counts.cached_exact_count, 0);

    const reconcileArgs = [
      cliPath,
      "reconcile",
      "--repo-root", tempRepo,
      "--project", PROJECT,
      "--binding", BINDING,
      "--node", "mac-mini-primary",
      "--node-role", "always_on_node",
      "--binding-valid",
      "--operational-primary",
      "--packet", scanResult.packet_ref,
      "--received-at", "2026-07-12T09:00:30.000Z",
    ];
    const dryReconcile = spawnSync(process.execPath, reconcileArgs, { encoding: "utf8" });
    assert.equal(dryReconcile.status, 0, dryReconcile.stderr);
    const dryReconcileResult = JSON.parse(dryReconcile.stdout);
    assert.equal(dryReconcileResult.status, "dry_run_no_write");
    await assert.rejects(() => access(path.join(tempRepo, dryReconcileResult.state_ref)));
    for (const ref of [
      ...dryReconcileResult.artifact_refs.receipt_refs,
      dryReconcileResult.artifact_refs.event_ref,
      dryReconcileResult.artifact_refs.checkpoint_ref,
      dryReconcileResult.artifact_refs.projection_ref,
    ]) await assert.rejects(() => access(path.join(tempRepo, ref)));

    const reconcileRun = spawnSync(process.execPath, [...reconcileArgs, "--apply"], { encoding: "utf8" });
    assert.equal(reconcileRun.status, 0, reconcileRun.stderr);
    const reconcileResult = JSON.parse(reconcileRun.stdout);
    assert.equal(reconcileResult.schema_version, FILE_REVISION_STATE_SCHEMA);
    assert.equal(reconcileResult.counts.logical_file_count, 1);
    assert.equal(reconcileResult.artifact_refs.receipt_refs.length, 1);
    const receipt = JSON.parse(await readFile(path.join(tempRepo, reconcileResult.artifact_refs.receipt_refs[0]), "utf8"));
    const eventPartition = JSON.parse(await readFile(path.join(tempRepo, reconcileResult.artifact_refs.event_ref), "utf8"));
    const checkpoint = JSON.parse(await readFile(path.join(tempRepo, reconcileResult.artifact_refs.checkpoint_ref), "utf8"));
    const projection = JSON.parse(await readFile(path.join(tempRepo, reconcileResult.artifact_refs.projection_ref), "utf8"));
    assert.equal(receipt.schema_version, FILE_RECONCILE_RECEIPT_SCHEMA);
    assert.equal(eventPartition.schema_version, FILE_RECONCILE_EVENT_SCHEMA);
    assert.equal(checkpoint.schema_version, FILE_REVISION_CHECKPOINT_SCHEMA);
    assert.equal(checkpoint.boundary.tail_replay_supported, false);
    assert.equal(projection.schema_version, FILE_ACTIVITY_LIFE_TREE_PROJECTION_SCHEMA);
    assert.equal(projection.events[0].erp_upload_event_ref, null);
    assert.equal(JSON.stringify(projection).includes("artifact.txt"), false);
    const stateRaw = await readFile(path.join(tempRepo, reconcileResult.state_ref), "utf8");
    assert.equal(stateRaw.includes(tempRepo), false);
    assert.equal(stateRaw.includes("private artifact payload"), false);

    const statePath = path.join(tempRepo, reconcileResult.state_ref);
    const evictedState = JSON.parse(stateRaw);
    evictedState.scan_receipts = [];
    evictedState.processed_scan_ids = [];
    await writeFile(statePath, `${JSON.stringify(evictedState, null, 2)}\n`, "utf8");
    const evictedStateRaw = await readFile(statePath, "utf8");
    const durableDuplicate = spawnSync(process.execPath, [...reconcileArgs, "--apply"], { encoding: "utf8" });
    assert.equal(durableDuplicate.status, 0, durableDuplicate.stderr);
    assert.equal(JSON.parse(durableDuplicate.stdout).status, "durable_receipt_duplicate_noop");
    assert.equal(await readFile(statePath, "utf8"), evictedStateRaw);

    const alteredPacket = JSON.parse(packetRaw);
    alteredPacket.counts.excluded_entry_count += 1;
    const alteredRef = scanResult.packet_ref.replace(/\.json$/u, "_altered.json");
    alteredPacket.packet_ref = alteredRef;
    await writeFile(path.join(tempRepo, alteredRef), `${JSON.stringify(alteredPacket, null, 2)}\n`, "utf8");
    const conflictArgs = reconcileArgs.map((entry) => entry === scanResult.packet_ref ? alteredRef : entry);
    const durableConflict = spawnSync(process.execPath, conflictArgs, { encoding: "utf8" });
    assert.equal(durableConflict.status, 1);
    assert.match(durableConflict.stderr, /file_activity_scan_digest_conflict/u);

    const rebuildArgs = [
      cliPath,
      "rebuild",
      "--repo-root", tempRepo,
      "--project", PROJECT,
      "--binding", BINDING,
      "--node", "mac-mini-primary",
      "--node-role", "always_on_node",
      "--binding-valid",
      "--operational-primary",
      "--checkpoint", reconcileResult.artifact_refs.checkpoint_ref,
    ];
    const rebuildDry = spawnSync(process.execPath, rebuildArgs, { encoding: "utf8" });
    assert.equal(rebuildDry.status, 0, rebuildDry.stderr);
    assert.equal(JSON.parse(rebuildDry.stdout).status, "dry_run_rebuild_no_write");
    assert.equal(await readFile(statePath, "utf8"), evictedStateRaw);
    const rebuildApply = spawnSync(process.execPath, [...rebuildArgs, "--apply"], { encoding: "utf8" });
    assert.equal(rebuildApply.status, 0, rebuildApply.stderr);
    assert.equal(JSON.parse(rebuildApply.stdout).status, "rebuilt_from_checkpoint");
    assert.equal(JSON.parse(await readFile(statePath, "utf8")).scan_receipts.length, 1);

    const symlinkStateRef = "revision_state_symlink.json";
    const outsideState = path.join(tempRepo, "outside-state.json");
    await writeFile(outsideState, "outside sentinel", "utf8");
    try {
      await symlink(outsideState, path.join(path.dirname(statePath), symlinkStateRef));
      const symlinkRebuild = spawnSync(
        process.execPath,
        [...rebuildArgs, "--state-ref", symlinkStateRef, "--apply"],
        { encoding: "utf8" },
      );
      assert.equal(symlinkRebuild.status, 1);
      assert.match(symlinkRebuild.stderr, /file_activity_write_symlink_path_blocked/u);
      assert.equal(await readFile(outsideState, "utf8"), "outside sentinel");
    } catch (error) {
      if (error?.code !== "EPERM") throw error;
    }

    await truncate(statePath, 256 * 1024 * 1024 + 1);
    const oversizedState = spawnSync(process.execPath, reconcileArgs, { encoding: "utf8" });
    assert.equal(oversizedState.status, 1);
    assert.match(oversizedState.stderr, /file_activity_revision_state_read_failed_size_limit_exceeded/u);

    const checkpointPath = path.join(tempRepo, reconcileResult.artifact_refs.checkpoint_ref);
    await truncate(checkpointPath, 256 * 1024 * 1024 + 1);
    const oversizedCheckpoint = spawnSync(process.execPath, rebuildArgs, { encoding: "utf8" });
    assert.equal(oversizedCheckpoint.status, 1);
    assert.match(oversizedCheckpoint.stderr, /file_activity_revision_checkpoint_read_failed_size_limit_exceeded/u);

    const fileActivityRoot = path.dirname(statePath);
    const redirectedFileActivityRoot = path.join(tempRepo, "redirected-file-activity");
    await rename(fileActivityRoot, redirectedFileActivityRoot);
    await symlink(redirectedFileActivityRoot, fileActivityRoot);
    const parentSymlinkRebuild = spawnSync(process.execPath, rebuildArgs, { encoding: "utf8" });
    assert.equal(parentSymlinkRebuild.status, 1);
    assert.match(parentSymlinkRebuild.stderr, /file_activity_write_symlink_path_blocked/u);
  } finally {
    await rm(tempRepo, { recursive: true, force: true });
  }
});

test("reconcile preflights immutable conflicts and publishes durable receipts only after state and projection", async () => {
  const tempRepo = await makeFixture("cli-receipt-commit-order");
  const worksite = path.join(tempRepo, "approved-worksite");
  const cliPath = path.resolve("guild_hall/file_activity/cli.mjs");
  try {
    await mkdir(path.join(tempRepo, "_workmeta", PROJECT), { recursive: true });
    await mkdir(worksite, { recursive: true });
    const sourcePath = path.join(worksite, "revision.txt");
    await writeVersion(sourcePath, "A", "2026-07-12T10:00:00.000Z");
    const scanBase = [
      cliPath, "scan",
      "--repo-root", tempRepo,
      "--project", PROJECT,
      "--binding", BINDING,
      "--node", "work-01",
      "--node-role", "work_pc",
      "--root", worksite,
      "--binding-valid",
      "--write-outbox",
    ];
    const firstScan = spawnSync(process.execPath, [
      ...scanBase,
      "--observed-at", "2026-07-12T10:00:01.000Z",
      "--ingested-at", "2026-07-12T10:00:02.000Z",
      "--scan-id", scanIdFor("commit-order-first"),
    ], { encoding: "utf8" });
    assert.equal(firstScan.status, 0, firstScan.stderr);
    const firstPacketRef = JSON.parse(firstScan.stdout).packet_ref;
    const reconcileBase = [
      cliPath, "reconcile",
      "--repo-root", tempRepo,
      "--project", PROJECT,
      "--binding", BINDING,
      "--node", "mac-mini-primary",
      "--node-role", "always_on_node",
      "--binding-valid",
      "--operational-primary",
    ];
    const firstApply = spawnSync(process.execPath, [
      ...reconcileBase,
      "--packet", firstPacketRef,
      "--received-at", "2026-07-12T10:00:10.000Z",
      "--apply",
    ], { encoding: "utf8" });
    assert.equal(firstApply.status, 0, firstApply.stderr);

    await writeVersion(sourcePath, "B", "2026-07-12T10:01:00.000Z");
    const secondScan = spawnSync(process.execPath, [
      ...scanBase,
      "--observed-at", "2026-07-12T10:01:01.000Z",
      "--ingested-at", "2026-07-12T10:01:02.000Z",
      "--scan-id", scanIdFor("commit-order-second"),
    ], { encoding: "utf8" });
    assert.equal(secondScan.status, 0, secondScan.stderr);
    const secondPacketRef = JSON.parse(secondScan.stdout).packet_ref;
    const secondArgs = [
      ...reconcileBase,
      "--packet", secondPacketRef,
      "--received-at", "2026-07-12T10:01:10.000Z",
    ];
    const drySecond = spawnSync(process.execPath, secondArgs, { encoding: "utf8" });
    assert.equal(drySecond.status, 0, drySecond.stderr);
    const dryResult = JSON.parse(drySecond.stdout);
    const conflictPath = path.join(tempRepo, dryResult.artifact_refs.event_ref);
    await mkdir(path.dirname(conflictPath), { recursive: true });
    await writeFile(conflictPath, "{\"tampered\":true}\n", "utf8");
    const statePath = path.join(tempRepo, dryResult.state_ref);
    const stateBefore = await readFile(statePath, "utf8");

    const blockedApply = spawnSync(process.execPath, [...secondArgs, "--apply"], { encoding: "utf8" });
    assert.equal(blockedApply.status, 1);
    assert.match(blockedApply.stderr, /file_activity_immutable_artifact_conflict/u);
    assert.equal(await readFile(statePath, "utf8"), stateBefore);
    await assert.rejects(() => access(path.join(tempRepo, dryResult.artifact_refs.receipt_refs[0])));

    await unlink(conflictPath);
    const recoveredApply = spawnSync(process.execPath, [...secondArgs, "--apply"], { encoding: "utf8" });
    assert.equal(recoveredApply.status, 0, recoveredApply.stderr);
    await access(path.join(tempRepo, dryResult.artifact_refs.receipt_refs[0]));
    assert.notEqual(await readFile(statePath, "utf8"), stateBefore);
  } finally {
    await rm(tempRepo, { recursive: true, force: true });
  }
});

async function makeFixture(label) {
  return mkdtemp(path.join(os.tmpdir(), `soulforge-file-activity-${label}-`));
}

async function writeVersion(filePath, contents, timestamp) {
  await writeFile(filePath, contents, "utf8");
  const time = new Date(timestamp);
  await utimes(filePath, time, time);
}

async function scanAt(options) {
  const observedAt = options.observedAt;
  return scanWorkspace({
    projectCode: PROJECT,
    workspaceBindingId: BINDING,
    nodeId: options.nodeId,
    nodeRole: options.nodeRole,
    rootPath: options.rootPath,
    bindingValid: true,
    operationalPrimary: options.nodeRole === "always_on_node",
    scanId: scanIdFor(options.scanId),
    observedAt,
    ingestedAt: options.ingestedAt ?? new Date(Date.parse(observedAt) + 1000).toISOString(),
    previousCache: options.previousCache,
    immediateHashBytes: options.immediateHashBytes,
    byteBudget: options.byteBudget,
    maxEntries: options.maxEntries,
    forceRehash: options.forceRehash,
    verifiedHashTtlMs: options.verifiedHashTtlMs,
  });
}

function reconcile(previousState, packets, policy = {}) {
  const latestIngestedMs = Math.max(...packets.map((packet) => Date.parse(packet.ingested_at)));
  return reconcileObservationPackets({
    ...PRIMARY,
    previousState,
    packets,
    receivedAt: policy.receivedAt ?? new Date(latestIngestedMs + 30_000).toISOString(),
    ...policy,
  });
}

function scanIdFor(label) {
  if (/^scan:[a-f0-9]{64}$/u.test(String(label))) return String(label);
  return `scan:${createHash("sha256").update(String(label), "utf8").digest("hex")}`;
}

function lastObservation(state) {
  return state.observations[state.observations.length - 1];
}

function syntheticPathObservation(observationId, relativePath) {
  return {
    observation_id: observationId,
    relative_path: relativePath.normalize("NFC"),
    path_collision_keys: buildPathCollisionKeys(relativePath),
  };
}

function observationAtSyntheticPath(seed, rawRelativePath) {
  const pathCollisionKeys = buildPathCollisionKeys(rawRelativePath);
  const observation = {
    ...structuredClone(seed),
    observation_id: null,
    relative_path: rawRelativePath.normalize("NFC"),
    relative_path_spelling: rawRelativePath,
    path_fingerprint: pathFingerprintForCollisionKeys(pathCollisionKeys),
    path_collision_keys: pathCollisionKeys,
  };
  observation.observation_id = observationIdFor(observation);
  return observation;
}

function reissuePacket(packet, label) {
  const reissued = structuredClone(packet);
  reissued.scan_id = scanIdFor(label);
  reissued.packet_ref = null;
  for (const observation of reissued.observations) {
    observation.scan_id = reissued.scan_id;
    observation.observation_id = observationIdFor(observation);
  }
  reissued.collisions = detectPathCollisions(reissued.observations);
  return reissued;
}
