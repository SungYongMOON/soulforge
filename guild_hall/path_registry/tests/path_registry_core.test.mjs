import assert from "node:assert/strict";
import { test } from "node:test";

import {
  authorizeOperation,
  authorityHolds,
  createPathRegistry,
  registerBinding,
  registryReadiness,
  registrySnapshot,
  resolvePath,
  updateRecord,
  validateRecord,
  PHYSICAL_ROOT_CLASSES,
} from "../src/path_registry_core.mjs";
import { SEED_AUTHORITY, seedRows } from "../data/registry_seed_v0.mjs";

const NOW = "2026-08-30T12:00:00Z";

const ACTOR = Object.freeze({
  node_ref: "node.dev_pc_1",
  project_scope_ref: "org:common",
  writer_identity: "writer.mail_collector",
  evaluation_time: NOW,
});

const SYN_AUTHORITY = Object.freeze({
  registry_schema_owner: "owner.registry_schema",
  private_binding_writer: "writer.binding_svc",
  resolver_runtime_owner: "owner.resolver_runtime",
  write_policy_owner: "owner.write_policy",
});

function synRow(overrides) {
  return {
    logical_path_id: "lane.mail_capture",
    row_kind: "source",
    physical_root_class: "data_root",
    logical_owner_class: "source_lane",
    parent_binding_ref: null,
    product_refs: ["product.erp"],
    portfolio_refs: ["sf-p08"],
    module_owner_ref: "guild_hall.path_registry",
    asset_or_source_class: "source_capture_lane",
    source_class: "external_saas",
    project_or_org_scope_ref: "org:common",
    topology_node_refs: [],
    binding_refs: [{
      binding_ref: "binding.mail.node1",
      node_ref: "node.dev_pc_1",
      role: "current",
      binding_revision: 1,
      binding_epoch: 3,
      expires_at: null,
      registered_by: "writer.binding_svc",
    }],
    owner_refs: {
      logical: "owner.logical",
      byte: "owner.byte",
      revision: "owner.revision",
      acceptance: "owner.acceptance",
      backup_restore: "owner.backup",
    },
    sensitivity: "protected",
    acl_policy_ref: "policy.acl.v0",
    write_policy: "append_create_only",
    sole_writer_ref: null,
    authorized_writer_refs: ["writer.mail_collector"],
    backup_class: "authoritative",
    retention_policy_ref: "policy.retention.v0",
    current_state: "current",
    manifest_ref: null,
    latest_receipt_ref: null,
    migration_ref: null,
    rollback_ref: null,
    applicability: "applicable",
    ...overrides,
  };
}

function synRegistry(rows) {
  return createPathRegistry({ authority: SYN_AUTHORITY, rows });
}

function mutate(registry, overrides = {}) {
  return authorizeOperation(registry, {
    logical_path_id: "lane.mail_capture",
    operation: "append",
    actor: ACTOR,
    asserted_registry_revision: registry.registry_revision,
    asserted_binding_epoch: 3,
    ...overrides,
  });
}

// --- Seed registry: fails closed under OD-10 hold sentinels ---

test("seed registry validates, holds authority, and blocks readiness", () => {
  const registry = createPathRegistry({ authority: SEED_AUTHORITY, rows: seedRows() });
  assert.equal(registry.records.size, 40);
  assert.deepEqual(authorityHolds(registry), [
    "registry_schema_owner", "private_binding_writer",
    "resolver_runtime_owner", "write_policy_owner",
  ]);
  for (const cls of PHYSICAL_ROOT_CLASSES) {
    assert.ok(registry.records.has(`root.${cls}`), `root.${cls} registered`);
  }
  assert.deepEqual(
    [...registry.records.values()]
      .filter((record) => record.row_kind === "asset_class")
      .map((record) => record.logical_path_id)
      .sort(),
    [
      "asset.ai_workforce", "asset.artifacts", "asset.bom_material",
      "asset.datasets", "asset.engine_rules_profiles", "asset.knowledge",
      "asset.project_assets", "asset.templates", "asset.test_results",
    ],
  );
  assert.ok(
    [...registry.records.values()]
      .filter((record) => record.row_kind === "asset_class")
      .every((record) => record.current_state === "held"
        && record.binding_refs.length === 0
        && record.topology_node_refs.length === 0),
  );
  const readiness = registryReadiness(registry);
  assert.equal(readiness.status, "hold");
  assert.equal(readiness.hold_code, "readiness_blocked");
  assert.ok(readiness.reasons.includes("authority:private_binding_writer"));

  const denial = authorizeOperation(registry, {
    logical_path_id: "source.mail",
    operation: "create",
    actor: ACTOR,
    asserted_registry_revision: registry.registry_revision,
    asserted_binding_epoch: 1,
  });
  assert.equal(denial.status, "hold");
  assert.equal(denial.hold_code, "authority_unresolved_od10");

  const bindingDenied = registerBinding(registry, "source.mail", {
    binding_ref: "binding.x", node_ref: "node.dev_pc_1", role: "current",
    binding_revision: 1, binding_epoch: 1, expires_at: null,
  }, { writer_identity: "writer.anything" });
  assert.equal(bindingDenied.hold_code, "authority_unresolved_od10");
});

test("seed snapshot digest is deterministic and rebuild-stable", () => {
  const a = registrySnapshot(createPathRegistry({ authority: SEED_AUTHORITY, rows: seedRows() }));
  const b = registrySnapshot(createPathRegistry({ authority: SEED_AUTHORITY, rows: seedRows() }));
  assert.match(a.snapshot_digest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(a.snapshot_digest, b.snapshot_digest);
  assert.equal(a.rows.length, 40);
});

test("secret owner root: read is a secret boundary and contract is pinned", () => {
  const registry = createPathRegistry({ authority: SEED_AUTHORITY, rows: seedRows() });
  const read = authorizeOperation(registry, {
    logical_path_id: "root.secret_owner_root",
    operation: "read",
    actor: ACTOR,
    asserted_registry_revision: registry.registry_revision,
    asserted_binding_epoch: 1,
  });
  assert.equal(read.hold_code, "secret_boundary");
  assert.throws(
    () => validateRecord(synRow({
      logical_path_id: "root.bad_secret",
      physical_root_class: "secret_owner_root",
      sensitivity: "secret_ref_only",
      write_policy: "read_only",
      backup_class: "forbidden",
    })),
    /secret_root_contract_violation/,
  );
});

test("public rows reject host-local absolute paths in any string leaf", () => {
  // Bad-input probes are concatenated so the repo path-policy source scan
  // does not read them as real local absolute paths.
  const probes = [
    ["C:", "soulforge-data"].join("/"),
    ["C:", "data"].join("\\"),
    ["", "", "nas", "share"].join("/"),
    ["", "var", "data"].join("/"),
  ];
  for (const leak of probes) {
    assert.throws(
      () => validateRecord(synRow({ acl_policy_ref: leak })),
      /absolute_path_forbidden|ref_invalid/,
      leak,
    );
  }
});

// --- Resolver: stable HOLD, never fallback ---

test("resolver holds: unregistered, scope, unbound, ambiguous, expired, held", () => {
  const rows = [
    synRow({}),
    synRow({
      logical_path_id: "lane.two_bindings",
      binding_refs: [
        { binding_ref: "binding.a", node_ref: "node.dev_pc_1", role: "current", binding_revision: 1, binding_epoch: 1, expires_at: null, registered_by: "writer.binding_svc" },
        { binding_ref: "binding.b", node_ref: "node.dev_pc_1", role: "current", binding_revision: 2, binding_epoch: 2, expires_at: null, registered_by: "writer.binding_svc" },
      ],
    }),
    synRow({
      logical_path_id: "lane.expired",
      binding_refs: [{ binding_ref: "binding.old", node_ref: "node.dev_pc_1", role: "current", binding_revision: 1, binding_epoch: 1, expires_at: "2026-01-01T00:00:00Z", registered_by: "writer.binding_svc" }],
    }),
    synRow({ logical_path_id: "lane.held_row", current_state: "held" }),
    synRow({ logical_path_id: "lane.target_only", binding_refs: [{ binding_ref: "binding.t", node_ref: "node.dev_pc_1", role: "target", binding_revision: 1, binding_epoch: 1, expires_at: null, registered_by: "writer.binding_svc" }] }),
  ];
  const registry = synRegistry(rows);

  assert.equal(resolvePath(registry, "lane.absent", ACTOR).hold_code, "unregistered_path");
  assert.equal(
    resolvePath(registry, "lane.mail_capture", { ...ACTOR, project_scope_ref: "project:p26_014" }).hold_code,
    "scope_mismatch",
  );
  assert.equal(
    resolvePath(registry, "lane.mail_capture", { ...ACTOR, node_ref: "node.other_pc" }).hold_code,
    "binding_unbound",
  );
  assert.equal(resolvePath(registry, "lane.two_bindings", ACTOR).hold_code, "ambiguous_binding");
  assert.equal(resolvePath(registry, "lane.expired", ACTOR).hold_code, "binding_expired");
  assert.equal(resolvePath(registry, "lane.held_row", ACTOR).hold_code, "record_held");
  // A target-role binding is never a read/resolve fallback.
  assert.equal(resolvePath(registry, "lane.target_only", ACTOR).hold_code, "binding_unbound");
  assert.equal(resolvePath({ schema: "forged" }, "lane.mail_capture", ACTOR).hold_code, "registry_unavailable");

  const ok = resolvePath(registry, "lane.mail_capture", ACTOR);
  assert.equal(ok.status, "resolved");
  assert.equal(ok.binding_ref, "binding.mail.node1");
  assert.equal(ok.binding_epoch, 3);
});

// --- Operation-aware write guard ---

test("append_create_only: create/append allowed, overwrite and foreign writer denied", () => {
  const registry = synRegistry([synRow({})]);
  assert.equal(mutate(registry, { operation: "create" }).status, "allowed");
  assert.equal(mutate(registry, { operation: "append" }).status, "allowed");
  assert.equal(mutate(registry, { operation: "overwrite" }).hold_code, "append_only_violation");
  assert.equal(
    mutate(registry, { actor: { ...ACTOR, writer_identity: "writer.intruder" } }).hold_code,
    "writer_unauthorized",
  );
});

test("delete and move are globally gated until the R7 migration leaf", () => {
  const registry = synRegistry([synRow({})]);
  assert.equal(mutate(registry, { operation: "delete" }).hold_code, "destructive_operation_gated");
  assert.equal(mutate(registry, { operation: "move" }).hold_code, "destructive_operation_gated");
});

test("read_only and forbidden write policies deny before any filesystem access", () => {
  const registry = synRegistry([
    synRow({ logical_path_id: "lane.ro", write_policy: "read_only", authorized_writer_refs: [] }),
    synRow({ logical_path_id: "lane.fb", write_policy: "forbidden", authorized_writer_refs: [] }),
  ]);
  assert.equal(mutate(registry, { logical_path_id: "lane.ro" }).hold_code, "write_policy_read_only");
  assert.equal(mutate(registry, { logical_path_id: "lane.fb" }).hold_code, "write_policy_forbidden");
});

test("sole_writer: exact writer allowed, wrong writer denied, revocation fences", () => {
  const base = synRegistry([synRow({
    write_policy: "sole_writer",
    sole_writer_ref: "writer.mail_collector",
    authorized_writer_refs: [],
  })]);
  assert.equal(mutate(base, { operation: "overwrite" }).status, "allowed");
  assert.equal(
    mutate(base, { actor: { ...ACTOR, writer_identity: "writer.intruder" } }).hold_code,
    "wrong_sole_writer",
  );

  const revoked = updateRecord(
    base, "lane.mail_capture", { sole_writer_ref: "writer.successor" },
    { writer_identity: "owner.write_policy" },
  );
  assert.equal(revoked.registry_revision, base.registry_revision + 1);
  // Old writer with fresh revision: revoked. Old writer with old revision: stale.
  assert.equal(mutate(revoked, {}).hold_code, "wrong_sole_writer");
  assert.equal(
    mutate(revoked, { asserted_registry_revision: base.registry_revision }).hold_code,
    "stale_registry_revision",
  );
  assert.equal(
    mutate(revoked, { actor: { ...ACTOR, writer_identity: "writer.successor" } }).status,
    "allowed",
  );
});

test("rebuild_only: rebuilder create/overwrite only", () => {
  const registry = synRegistry([synRow({
    write_policy: "rebuild_only",
    sole_writer_ref: "writer.rebuilder",
    authorized_writer_refs: [],
  })]);
  const rebuilder = { ...ACTOR, writer_identity: "writer.rebuilder" };
  assert.equal(mutate(registry, { operation: "overwrite", actor: rebuilder }).status, "allowed");
  assert.equal(mutate(registry, { operation: "append", actor: rebuilder }).hold_code, "rebuild_only_operation");
  assert.equal(mutate(registry, { operation: "overwrite" }).hold_code, "wrong_sole_writer");
});

test("stale binding epoch and stale registry revision are fenced", () => {
  const registry = synRegistry([synRow({})]);
  assert.equal(mutate(registry, { asserted_binding_epoch: 2 }).hold_code, "stale_binding_epoch");
  assert.equal(
    mutate(registry, { asserted_registry_revision: 99 }).hold_code,
    "stale_registry_revision",
  );
});

test("current/target fencing: target rows and unbound writes cannot proceed", () => {
  const registry = synRegistry([
    synRow({ logical_path_id: "lane.target_row", current_state: "target" }),
    synRow({ logical_path_id: "lane.unbound", binding_refs: [] }),
  ]);
  assert.equal(mutate(registry, { logical_path_id: "lane.target_row" }).hold_code, "target_not_writable");
  assert.equal(mutate(registry, { logical_path_id: "lane.unbound" }).hold_code, "binding_unbound");
  assert.equal(mutate(registry, { logical_path_id: "lane.ghost" }).hold_code, "unregistered_path");
});

test("duplicate topology identity is unrepresentable", () => {
  // Two rows claiming the same existing topology node must fail at
  // registry construction, not merge into a second source truth.
  assert.throws(
    () => synRegistry([
      synRow({ topology_node_refs: ["watchtower::src_slack"] }),
      synRow({
        logical_path_id: "lane.slack_shadow",
        topology_node_refs: ["watchtower::src_slack"],
      }),
    ]),
    /duplicate_topology_identity/,
  );
  // The same node listed twice on one row is equally rejected.
  assert.throws(
    () => validateRecord(synRow({
      topology_node_refs: ["watchtower::src_slack", "watchtower::src_slack"],
    })),
    /duplicate_topology_identity/,
  );
});

test("updateRecord is a gated surface: OD-10 hold, writer identity, no binding smuggling", () => {
  const seed = createPathRegistry({ authority: SEED_AUTHORITY, rows: seedRows() });
  assert.equal(
    updateRecord(seed, "source.mail", { current_state: "current" },
      { writer_identity: "writer.anything" }).hold_code,
    "authority_unresolved_od10",
  );

  const registry = synRegistry([synRow({})]);
  assert.equal(
    updateRecord(registry, "lane.mail_capture", { current_state: "held" },
      { writer_identity: "writer.intruder" }).hold_code,
    "record_writer_unauthorized",
  );
  assert.equal(
    updateRecord(registry, "lane.mail_capture", { current_state: "held" }).hold_code,
    "record_writer_unauthorized",
  );
  assert.equal(
    updateRecord(registry, "lane.mail_capture",
      { binding_refs: [] }, { writer_identity: "owner.write_policy" }).hold_code,
    "patch_invalid",
  );
});

test("sub-second expiry compares numerically, not lexicographically", () => {
  const registry = synRegistry([synRow({
    binding_refs: [{
      binding_ref: "binding.subsec", node_ref: "node.dev_pc_1", role: "current",
      binding_revision: 1, binding_epoch: 3,
      expires_at: "2026-08-30T12:00:00.500Z", registered_by: "writer.binding_svc",
    }],
  })]);
  // Lexicographically "…00.500Z" <= "…00Z" would be an (incorrect) expiry.
  assert.equal(resolvePath(registry, "lane.mail_capture", ACTOR).status, "resolved");
});

test("impossible and NaN ISO clocks fail before expiry and authorization", () => {
  const hostileClocks = [
    "2026-02-30T12:00:00Z",
    "2026-13-01T12:00:00Z",
  ];
  for (const expiresAt of hostileClocks) {
    assert.throws(
      () => synRegistry([synRow({
        binding_refs: [{
          binding_ref: "binding.hostile_clock", node_ref: "node.dev_pc_1", role: "current",
          binding_revision: 1, binding_epoch: 3, expires_at: expiresAt,
          registered_by: "writer.binding_svc",
        }],
      })]),
      /clock_invalid/,
      expiresAt,
    );
  }

  const registry = synRegistry([synRow({})]);
  for (const evaluationTime of hostileClocks) {
    const actor = { ...ACTOR, evaluation_time: evaluationTime };
    assert.equal(
      resolvePath(registry, "lane.mail_capture", actor).hold_code,
      "actor_context_invalid",
      evaluationTime,
    );
    assert.equal(
      mutate(registry, { actor }).hold_code,
      "actor_context_invalid",
      evaluationTime,
    );
  }
});

// --- Binding registration under resolved authority ---

test("registerBinding: writer identity, ambiguity, and revision bump", () => {
  const registry = synRegistry([synRow({ binding_refs: [] })]);
  const wrongWriter = registerBinding(registry, "lane.mail_capture", {
    binding_ref: "binding.new", node_ref: "node.dev_pc_1", role: "current",
    binding_revision: 1, binding_epoch: 1, expires_at: null,
  }, { writer_identity: "writer.intruder" });
  assert.equal(wrongWriter.hold_code, "binding_writer_unauthorized");

  const bound = registerBinding(registry, "lane.mail_capture", {
    binding_ref: "binding.new", node_ref: "node.dev_pc_1", role: "current",
    binding_revision: 1, binding_epoch: 1, expires_at: null,
  }, { writer_identity: "writer.binding_svc" });
  assert.equal(bound.registry_revision, registry.registry_revision + 1);
  assert.equal(resolvePath(bound, "lane.mail_capture", ACTOR).status, "resolved");

  const clash = registerBinding(bound, "lane.mail_capture", {
    binding_ref: "binding.second", node_ref: "node.dev_pc_1", role: "current",
    binding_revision: 2, binding_epoch: 2, expires_at: null,
  }, { writer_identity: "writer.binding_svc" });
  assert.equal(clash.hold_code, "ambiguous_binding");

  const snapA = registrySnapshot(registry);
  const snapB = registrySnapshot(bound);
  assert.notEqual(snapA.snapshot_digest, snapB.snapshot_digest);
});
