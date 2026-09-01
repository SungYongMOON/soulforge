import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { createPathRegistry, registrySnapshot } from "../src/path_registry_core.mjs";
import { SEED_AUTHORITY, seedRows } from "../data/registry_seed_v0.mjs";
import {
  aggregateStorageMapState,
  buildStorageMap,
} from "../src/storage_map_projection.mjs";
import { PANEL_STATES } from "../../watch_panel_contract/src/watch_panel_contract.mjs";

const SNAPSHOT = registrySnapshot(createPathRegistry({ authority: SEED_AUTHORITY, rows: seedRows() }));

const RESOLVED_AUTHORITY = Object.freeze({
  registry_schema_owner: "owner.registry_schema",
  private_binding_writer: "writer.binding_svc",
  resolver_runtime_owner: "owner.resolver_runtime",
  write_policy_owner: "owner.write_policy",
});

function operationalSnapshot(rows) {
  return registrySnapshot(createPathRegistry({
    authority: RESOLVED_AUTHORITY,
    rows: rows.map((row) => ({
      ...row,
      module_owner_ref: "guild_hall.path_registry",
      owner_refs: {
        logical: "owner.logical",
        byte: "owner.byte",
        revision: "owner.revision",
        acceptance: "owner.acceptance",
        backup_restore: "owner.backup_restore",
      },
      acl_policy_ref: "policy.acl.v0",
      retention_policy_ref: "policy.retention.v0",
    })),
  }));
}

const FULL_EVIDENCE = Object.freeze({
  binding_state: "bound",
  latest_capture_ref: "capture.mail.gen-104",
  backup_generation_ref: "backup.mail.gen-104",
  freshness_state: "fresh",
  retention_policy_ref: "policy.retention.mail.v0",
  rpo_policy_ref: "policy.rpo.mail.v0",
  restore_test_ref: "restore_test.mail.2026-08-29",
  human_acceptance_state: "accepted",
  evidence_at: "2026-08-30T11:00:00Z",
});

test("full registry-driven coverage: one row per registry row, digest-bound", () => {
  const map = buildStorageMap({ registry_snapshot: SNAPSHOT });
  assert.equal(map.status, "projected");
  assert.equal(map.rows.length, SNAPSHOT.rows.length);
  assert.equal(new Set(map.rows.map((row) => row.row_key)).size, map.rows.length);
  for (const row of map.rows) {
    assert.equal(row.registry_snapshot_digest, SNAPSHOT.snapshot_digest);
    assert.ok(PANEL_STATES.includes(row.watch_state), row.watch_state);
  }
  assert.equal(map.summary.coverage_registered, 50);
  assert.equal(map.summary.coverage_expected, 50);
  assert.equal(
    map.rows.find((row) => row.logical_id === "workroot.bot_execution")?.row_kind,
    "work_root",
  );
  assert.equal(
    map.rows.find((row) => row.logical_id === "canon.workspaces")?.row_kind,
    "root",
  );
  const assetRows = map.rows.filter((row) => row.row_kind === "asset_class");
  assert.equal(assetRows.length, 9);
  assert.ok(assetRows.every((row) => row.watch_state === "hold"));
  const targetRows = map.rows.filter((row) => row.logical_id.startsWith("target."));
  assert.equal(targetRows.length, 9);
  assert.ok(targetRows.every((row) => row.migration_state === "target"
    && row.coverage_state === "missing_evidence"
    && row.watch_state === "hold"
    && row.hold_code === "authority_unresolved_od10"));
});

test("no evidence is never green: unknown rows, held rows hold, aggregate holds", () => {
  const snapshot = operationalSnapshot(seedRows()
    .filter((row) => ["source.mail", "source.linear"].includes(row.logical_path_id)));
  const map = buildStorageMap({ registry_snapshot: snapshot });
  const byId = new Map(map.rows.map((row) => [row.logical_id, row]));
  assert.equal(byId.get("source.mail").watch_state, "unknown");
  assert.equal(byId.get("source.mail").coverage_state, "missing_evidence");
  assert.equal(byId.get("source.linear").watch_state, "hold");
  assert.equal(byId.get("source.linear").hold_code, "record_held");
  assert.equal(map.summary.aggregate_state, "hold");
  assert.ok(map.rows.every((row) => row.watch_state !== "healthy"));
});

test("evidence drives states: healthy, degraded, stale, unavailable", () => {
  const snapshot = operationalSnapshot(seedRows()
    .filter((row) => ["source.mail", "source.slack", "source.voice_plaud", "source.buzz"]
      .includes(row.logical_path_id))
    .map((row) => ({ ...row, current_state: "current" })));
  const map = buildStorageMap({
    registry_snapshot: snapshot,
    evidence: {
      "source.mail": FULL_EVIDENCE,
      "source.slack": { ...FULL_EVIDENCE, restore_test_ref: undefined },
      "source.voice_plaud": { ...FULL_EVIDENCE, freshness_state: "stale" },
      "source.buzz": { ...FULL_EVIDENCE, binding_state: "unavailable" },
    },
  });
  const byId = new Map(map.rows.map((row) => [row.logical_id, row]));
  assert.equal(byId.get("source.mail").watch_state, "healthy");
  assert.equal(byId.get("source.slack").watch_state, "degraded");
  assert.equal(byId.get("source.voice_plaud").watch_state, "stale");
  assert.equal(byId.get("source.buzz").watch_state, "unavailable");
});

test("evidence cannot add rows, carry raw/writer fields, or leak paths", () => {
  assert.equal(
    buildStorageMap({
      registry_snapshot: SNAPSHOT,
      evidence: { "source.ghost": FULL_EVIDENCE },
    }).hold_code,
    "evidence_unregistered",
  );
  assert.equal(
    buildStorageMap({
      registry_snapshot: SNAPSHOT,
      evidence: { "source.mail": { ...FULL_EVIDENCE, raw_message: "leak" } },
    }).hold_code,
    "evidence_forbidden_field",
  );
  assert.equal(
    buildStorageMap({
      registry_snapshot: SNAPSHOT,
      evidence: { "source.mail": { ...FULL_EVIDENCE, sole_writer_ref: "writer.x" } },
    }).hold_code,
    "evidence_forbidden_field",
  );
  assert.equal(
    buildStorageMap({
      registry_snapshot: SNAPSHOT,
      evidence: { "source.mail": { ...FULL_EVIDENCE, backup_generation_ref: ["C:", "backups", "mail"].join("/") } },
    }).hold_code,
    "evidence_absolute_path",
  );
  assert.equal(
    buildStorageMap({
      registry_snapshot: SNAPSHOT,
      evidence: { "source.mail": { ...FULL_EVIDENCE, latest_capture_ref: "capture body leaked" } },
    }).hold_code,
    "evidence_ref_invalid",
  );
  assert.equal(
    buildStorageMap({
      registry_snapshot: SNAPSHOT,
      evidence: { "source.mail": { ...FULL_EVIDENCE, restore_test_ref: "hold:od-10.restore" } },
    }).hold_code,
    "evidence_ref_invalid",
  );
});

test("rows expose no writer, raw, or topology-card fields", () => {
  const map = buildStorageMap({ registry_snapshot: SNAPSHOT });
  for (const row of map.rows) {
    for (const forbidden of ["write_policy", "sole_writer_ref", "authorized_writer_refs",
      "raw_message", "message_body", "secret", "binding_refs",
      // Overlay-only: no field a consumer could use to mint a duplicate
      // source card or competing node health truth.
      "label", "display_name", "node_kind", "edges", "health_state"]) {
      assert.ok(!(forbidden in row), `${row.logical_id}:${forbidden}`);
    }
  }
  assert.equal(map.projection_kind, "backup_readiness_overlay");
});

test("seed source identities resolve to EXISTING pinned topology nodes", () => {
  // RED-02 pinned artifact is the single topology truth; the overlay reuses
  // its stable IDs and never mints a node.
  const topology = JSON.parse(readFileSync(
    new URL("../../watchtower/topology/federated_topology.v1.json", import.meta.url), "utf8",
  ));
  const topologyIds = new Set(topology.nodes.map((node) => node.id));
  const map = buildStorageMap({ registry_snapshot: SNAPSHOT });
  const byId = new Map(map.rows.map((row) => [row.logical_id, row]));

  const expectedBindings = {
    "source.slack": ["watchtower::src_slack"],
    "source.mail": ["watchtower::src_hiworks", "watchtower::src_gmail"],
    "source.voice_plaud": ["watchtower::src_plaud"],
    "source.cloud_drive": ["watchtower::src_onedrive"],
  };
  for (const [logicalId, refs] of Object.entries(expectedBindings)) {
    assert.deepEqual(byId.get(logicalId).topology_node_refs, refs, logicalId);
    for (const ref of refs) {
      assert.ok(topologyIds.has(ref), `${ref} must exist in the pinned topology`);
    }
  }
  // Every claimed ref (not just the expected four) must resolve.
  for (const row of map.rows) {
    for (const ref of row.topology_node_refs) {
      assert.ok(topologyIds.has(ref), `${row.logical_id} -> ${ref}`);
    }
  }
  // Linear has no stable topology identity: registry-contract-only row.
  assert.deepEqual(byId.get("source.linear").topology_node_refs, []);
  // One topology node never backs two overlay rows.
  const claimed = map.rows.flatMap((row) => row.topology_node_refs);
  assert.equal(new Set(claimed).size, claimed.length);
});

test("unclassified paths force a drift hold; forged snapshots reject", () => {
  const map = buildStorageMap({ registry_snapshot: SNAPSHOT, unclassified_count: 3 });
  assert.equal(map.summary.aggregate_state, "hold");
  assert.equal(map.summary.hold_code, "unclassified_paths");
  assert.ok(map.rows.every((row) => row.path_drift_state === "drift"));
  assert.equal(buildStorageMap({ registry_snapshot: { schema: "forged" } }).hold_code, "snapshot_invalid");
  const tamperedRows = SNAPSHOT.rows.map((row) => (
    row.logical_path_id === "source.mail" ? { ...row, current_state: "current" } : row
  ));
  assert.equal(
    buildStorageMap({ registry_snapshot: { ...SNAPSHOT, rows: tamperedRows } }).hold_code,
    "snapshot_digest_mismatch",
  );
  assert.equal(
    buildStorageMap({ registry_snapshot: { ...SNAPSHOT, registry_revision: 2 } }).hold_code,
    "snapshot_digest_mismatch",
  );
  assert.equal(
    buildStorageMap({ registry_snapshot: SNAPSHOT, unclassified_count: -1 }).hold_code,
    "unclassified_count_invalid",
  );
});

test("state precedence is deterministic: hold > unavailable > stale > degraded > unknown > healthy", () => {
  assert.equal(aggregateStorageMapState(["healthy", "unknown", "degraded"]), "degraded");
  assert.equal(aggregateStorageMapState(["healthy", "stale", "degraded"]), "stale");
  assert.equal(aggregateStorageMapState(["unavailable", "stale"]), "unavailable");
  assert.equal(aggregateStorageMapState(["healthy", "hold"]), "hold");
  assert.equal(aggregateStorageMapState(["healthy", "healthy"]), "healthy");
  assert.equal(aggregateStorageMapState([]), "unknown");
  assert.equal(aggregateStorageMapState(["green_is_not_a_state"]), "hold");
});

test("not_applicable rows are excluded from expected coverage and aggregate", () => {
  const rows = seedRows()
    .filter((row) => ["source.mail", "source.slack"].includes(row.logical_path_id))
    .map((row) => ({
      ...row,
      current_state: "current",
      applicability: row.logical_path_id === "source.slack" ? "not_applicable" : "applicable",
    }));
  const snapshot = operationalSnapshot(rows);
  const map = buildStorageMap({
    registry_snapshot: snapshot,
    evidence: { "source.mail": FULL_EVIDENCE },
  });
  const byId = new Map(map.rows.map((row) => [row.logical_id, row]));
  // The N/A row still renders (visible, not silent) but is excluded from
  // expected coverage and cannot drag the aggregate to unknown.
  assert.equal(byId.get("source.slack").applicability_state, "not_applicable");
  assert.equal(byId.get("source.slack").watch_state, "unknown");
  assert.equal(map.summary.coverage_registered, 2);
  assert.equal(map.summary.coverage_expected, 1);
  assert.equal(map.summary.aggregate_state, "healthy");
});

test("OD-10 authority sentinels hold every row and the aggregate despite complete evidence", () => {
  const map = buildStorageMap({
    registry_snapshot: SNAPSHOT,
    evidence: { "source.mail": FULL_EVIDENCE },
  });
  assert.ok(map.rows.every((row) => row.watch_state === "hold"));
  assert.equal(map.rows.find((row) => row.logical_id === "source.mail").hold_code, "authority_unresolved_od10");
  assert.equal(map.summary.aggregate_state, "hold");
  assert.equal(map.summary.hold_code, "authority_unresolved_od10");
});

test("a fully evidenced registry with resolved authority can aggregate healthy", () => {
  const rows = seedRows().filter((row) => row.logical_path_id === "source.mail")
    .map((row) => ({ ...row, current_state: "current" }));
  const snapshot = operationalSnapshot(rows);
  const map = buildStorageMap({
    registry_snapshot: snapshot,
    evidence: { "source.mail": FULL_EVIDENCE },
  });
  assert.equal(map.summary.aggregate_state, "healthy");
});
