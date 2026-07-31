import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";

import {
  LEASE_TTL_FORMULA,
  RUNTIME_PREFLIGHT_INPUT_SCHEMA,
  RUNTIME_PREFLIGHT_V1_INPUT_SCHEMA,
  STALE_RECOVERY_POLICY,
  WORKTREE_INVENTORY_SOURCE_CLASSIFICATION,
  WORKTREE_INVENTORY_TOOL_CLASSIFICATION,
  WRITER_EPOCH_FORMULA,
  runRuntimePreflight,
  runtimeAttestationDigest,
  runtimeLatestReceiptDigest,
  runtimePathDigest,
} from "./five_field_runtime_preflight.mjs";

const DIGEST_A = `sha256:${"a".repeat(64)}`;
const DIGEST_B = `sha256:${"b".repeat(64)}`;
const DIGEST_C = `sha256:${"c".repeat(64)}`;
const NOW = "2026-07-31T04:05:00.000Z";
const OBSERVED = "2026-07-31T04:00:00.000Z";
const EXPIRES = "2026-07-31T04:10:00.000Z";
const ROOT_NAMES = [
  "runner",
  "source",
  "writer-workmeta",
  "writer-private-state",
  "config",
  "locks",
];

function seal(value) {
  value.attestation_digest = runtimeAttestationDigest(value);
  return value;
}

function nonAcceptance(receipt) {
  assert.equal(receipt.official_completion, false);
  assert.equal(receipt.worksession_acceptance, false);
  assert.equal(receipt.taskdriver_acceptance, false);
  assert.equal(receipt.erp_acceptance, false);
  assert.equal(receipt.mcp_acceptance, false);
  assert.equal(receipt.claim_ceiling, "operational_evidence_only");
}

function inventoryGroup(paths) {
  const root_digests = paths.map(runtimePathDigest).sort();
  return {
    count: root_digests.length,
    zero_count: root_digests.length === 0,
    root_digests,
  };
}

function fixture({ codexCount = 1, orcaCount = 1 } = {}) {
  const root = mkdtempSync(join(tmpdir(), "sf-runtime-preflight-v2-"));
  const isolated = join(root, "isolated");
  mkdirSync(isolated);
  for (const name of ROOT_NAMES) mkdirSync(join(isolated, name));
  const inputPath = join(isolated, "config", "input.json");
  writeFileSync(inputPath, "{}\n", "utf8");

  const activePublic = join(root, "active-public");
  const activeWorkmeta = join(activePublic, "_workmeta");
  const activePrivateState = join(activePublic, "private-state");
  const automationControl = join(root, "automation-control");
  mkdirSync(activeWorkmeta, { recursive: true });
  mkdirSync(activePrivateState);
  mkdirSync(automationControl);

  const codex = [];
  for (let index = 0; index < codexCount; index += 1) {
    const path = join(root, `codex-${index}`);
    mkdirSync(path);
    codex.push(path);
  }
  const orca = [];
  for (let index = 0; index < orcaCount; index += 1) {
    const path = join(root, `orca-${index}`);
    mkdirSync(path);
    orca.push(path);
  }

  const guarded_roots = {
    active_public_root: activePublic,
    active_workmeta: activeWorkmeta,
    active_private_state: activePrivateState,
    automation_control_root: automationControl,
  };
  const forbidden_roots = [
    ...Object.entries(guarded_roots).map(([kind, path]) => ({ kind, path })),
    ...codex.map((path) => ({ kind: "codex_worktree", path })),
    ...orca.map((path) => ({ kind: "orca_worktree", path })),
  ];
  const codexInventory = inventoryGroup(codex);
  const orcaInventory = inventoryGroup(orca);
  const worktree_inventory = seal({
    observed_at: OBSERVED,
    expires_at: EXPIRES,
    source_classification: WORKTREE_INVENTORY_SOURCE_CLASSIFICATION,
    tool_classification: WORKTREE_INVENTORY_TOOL_CLASSIFICATION,
    complete: true,
    codex: codexInventory,
    orca: orcaInventory,
    root_set_digest: `sha256:${inventoryDigest(
      codexInventory.root_digests,
      orcaInventory.root_digests,
    )}`,
  });

  const workmetaAuthority = `sha256:${"1".repeat(64)}`;
  const privateAuthority = `sha256:${"2".repeat(64)}`;
  const acl = seal({
    status: "VERIFIED",
    principal_intent: "dedicated_runner_least_privilege",
    runner_read_execute: true,
    source_read_only: true,
    config_read_only: true,
    writers_modify: true,
    locks_modify: true,
    active_roots_write_denied: true,
  });
  const backup_restore = seal({
    status: "VERIFIED",
    observed_at: OBSERVED,
    expires_at: EXPIRES,
    authorities: {
      workmeta: {
        classification: "backup_recovery_included",
        authority_fingerprint: workmetaAuthority,
        backup_receipt_digest: DIGEST_A,
      },
      private_state: {
        classification: "backup_recovery_included",
        authority_fingerprint: privateAuthority,
        backup_receipt_digest: DIGEST_B,
      },
    },
    surface_classifications: {
      runner: "regenerable_excluded",
      source: "regenerable_excluded",
      writer_workmeta_clone: "regenerable_excluded",
      writer_private_state_clone: "regenerable_excluded",
      locks: "regenerable_excluded",
      execution_temp: "regenerable_excluded",
      config: "capture_prohibited",
      remote_url: "capture_prohibited",
      credential: "capture_prohibited",
      owner_token: "capture_prohibited",
      authoritative_ledger: "backup_restore_included",
      authoritative_cursor_authority: "backup_restore_included",
      redacted_receipt: "backup_restore_included",
    },
    clone_state: {
      writer_workmeta_dirty: false,
      writer_private_state_dirty: false,
      writer_workmeta_unpushed_commits: 0,
      writer_private_state_unpushed_commits: 0,
    },
    cursor_ledger_binding: {
      status: "VERIFIED",
      ledger_remote_inclusion_verified: true,
      cursor_points_only_to_included_ledger: true,
      included_ledger_digest: DIGEST_A,
      cursor_binding_digest: DIGEST_B,
    },
    restore: {
      destination_class: "isolated_scratch_non_authority",
      destination_root_digest: DIGEST_C,
      latest_receipt_digest: runtimeLatestReceiptDigest(DIGEST_A, DIGEST_B),
      manifest_digest: DIGEST_B,
      forbidden_root_clear: true,
      excluded_surfaces_absent: true,
      active_roots_untouched: true,
      workmeta: {
        status: "VERIFIED",
        authority_fingerprint: workmetaAuthority,
        receipt_digest: DIGEST_A,
        manifest_digest: DIGEST_B,
        destination_binding_digest: DIGEST_C,
        latest_receipt: true,
        manifest_match: true,
        hash_match: true,
        ref_match: true,
        remote_inclusion_verified: true,
        monotonic_sequence: true,
        monotonic_writer_epoch: true,
      },
      private_state: {
        status: "VERIFIED",
        authority_fingerprint: privateAuthority,
        receipt_digest: DIGEST_B,
        manifest_digest: DIGEST_B,
        destination_binding_digest: DIGEST_C,
        latest_receipt: true,
        manifest_match: true,
        hash_match: true,
        ref_match: true,
        remote_inclusion_verified: true,
        monotonic_sequence: true,
        monotonic_writer_epoch: true,
      },
    },
  });
  const noninteractive = {
    terminal_prompt_blocked: true,
    credential_interactive_blocked: true,
    askpass_blocked: true,
    ssh_batch_mode: true,
    failure_output_discarded: true,
  };
  const forbidden_config = {
    include: false,
    include_if: false,
    instead_of: false,
    push_instead_of: false,
  };
  const git_authority = seal({
    status: "VERIFIED",
    observed_at: OBSERVED,
    expires_at: EXPIRES,
    writers: {
      workmeta: {
        status: "VERIFIED",
        writer_role: "writer_workmeta",
        logical_remote: "ledger-authority",
        ref: "refs/heads/main",
        transport_class: "https",
        authority_fingerprint: workmetaAuthority,
        config_projection_digest: DIGEST_A,
        config_content_digest: DIGEST_B,
        read_probe_status: "PASS",
        full_config_read: true,
        config_read_only: true,
        immutable_recheck: true,
        forbidden_config: structuredClone(forbidden_config),
        noninteractive: structuredClone(noninteractive),
      },
      private_state: {
        status: "VERIFIED",
        writer_role: "writer_private_state",
        logical_remote: "cursor-authority",
        ref: "refs/heads/main",
        transport_class: "ssh",
        authority_fingerprint: privateAuthority,
        config_projection_digest: DIGEST_B,
        config_content_digest: DIGEST_C,
        read_probe_status: "PASS",
        full_config_read: true,
        config_read_only: true,
        immutable_recheck: true,
        forbidden_config: structuredClone(forbidden_config),
        noninteractive: structuredClone(noninteractive),
      },
    },
  });
  const lease_policy = seal({
    status: "VERIFIED",
    authority_profile: "owner_with_state",
    operational_primary: true,
    owner_token_class: "opaque_random_256_v1",
    first_lease_stale: false,
    host_identity_digest: DIGEST_C,
    restored_writer_epoch: 4,
    authority_writer_epoch: 7,
    receipt_writer_epoch: 6,
    initial_writer_epoch: 8,
    ttl_minutes: 30,
    ttl_formula: LEASE_TTL_FORMULA,
    epoch_formula: WRITER_EPOCH_FORMULA,
    stale_recovery_policy: STALE_RECOVERY_POLICY,
  });

  return {
    root,
    input: {
      schema_version: RUNTIME_PREFLIGHT_INPUT_SCHEMA,
      roots: {
        runner: join(isolated, "runner"),
        source: join(isolated, "source"),
        writer_workmeta: join(isolated, "writer-workmeta"),
        writer_private_state: join(isolated, "writer-private-state"),
        config: join(isolated, "config"),
        locks: join(isolated, "locks"),
      },
      launch: { input_path: inputPath },
      guarded_roots,
      forbidden_roots,
      worktree_inventory,
      evidence: {
        acl,
        backup_restore,
        git_authority,
        lease_policy,
      },
    },
  };
}

function inventoryDigest(codex, orca) {
  // Mirrors the public canonical digest without exposing fixture paths.
  const canonical = (value) => {
    if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
    if (value && typeof value === "object") {
      return `{${Object.keys(value).sort().map((key) =>
        `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
    }
    return JSON.stringify(value);
  };
  return createHash("sha256")
    .update(canonical({ codex, orca }))
    .digest("hex");
}

function reseal(value) {
  value.attestation_digest = runtimeAttestationDigest(value);
}

function run(input) {
  return runRuntimePreflight(input, { now: NOW });
}

test("v2 accepts exact roots, explicit inventory, and canonical evidence", () => {
  const f = fixture();
  try {
    const receipt = run(f.input);
    assert.equal(receipt.status, "PASS", JSON.stringify(receipt));
    assert.equal(receipt.inventory.codex_count, 1);
    assert.equal(receipt.inventory.orca_count, 1);
    assert.equal(receipt.inventory.codex_zero, false);
    assert.equal(receipt.inventory.orca_zero, false);
    assert.equal(
      receipt.inventory.source_classification,
      WORKTREE_INVENTORY_SOURCE_CLASSIFICATION,
    );
    assert.equal(
      receipt.inventory.tool_classification,
      WORKTREE_INVENTORY_TOOL_CLASSIFICATION,
    );
    assert.equal(receipt.topology.mandatory_roots_bound, true);
    assert.equal(receipt.topology.forbidden_union_complete, true);
    assert.equal(receipt.lease_policy.host_identity_digest, DIGEST_C);
    assert.equal(receipt.lease_policy.restored_writer_epoch, 4);
    assert.equal(receipt.lease_policy.authority_writer_epoch, 7);
    assert.equal(receipt.lease_policy.receipt_writer_epoch, 6);
    assert.equal(receipt.lease_policy.initial_writer_epoch, 8);
    assert.match(receipt.evidence_digest, /^sha256:[0-9a-f]{64}$/u);
    assert.match(receipt.manifest_digest, /^sha256:[0-9a-f]{64}$/u);
    assert.equal(JSON.stringify(receipt).includes(f.root), false);
    nonAcceptance(receipt);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("v1 is an explicit HOLD and never falls through", () => {
  const receipt = run({
    schema_version: RUNTIME_PREFLIGHT_V1_INPUT_SCHEMA,
  });
  assert.equal(receipt.status, "HOLD");
  assert.deepEqual(
    receipt.hold_reasons,
    ["runtime_preflight_v1_explicit_hold"],
  );
  nonAcceptance(receipt);
});

test("automation control root is mandatory and exactly bound to the union", () => {
  for (const mutate of [
    (f) => {
      f.input.forbidden_roots = f.input.forbidden_roots.filter(
        (row) => row.kind !== "automation_control_root",
      );
    },
    (f) => {
      const replacement = join(f.root, "other-control");
      mkdirSync(replacement);
      f.input.forbidden_roots.find(
        (row) => row.kind === "automation_control_root",
      ).path = replacement;
    },
  ]) {
    const f = fixture();
    try {
      mutate(f);
      const receipt = run(f.input);
      assert.equal(receipt.status, "HOLD");
      assert.deepEqual(
        receipt.hold_reasons,
        ["mandatory_forbidden_root_mismatch"],
      );
      assert.equal(JSON.stringify(receipt).includes(f.root), false);
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  }
});

test("inventory supports explicit zero and rejects omission, stale, or forgery", () => {
  const zero = fixture({ codexCount: 0, orcaCount: 0 });
  try {
    const receipt = run(zero.input);
    assert.equal(receipt.status, "PASS", JSON.stringify(receipt));
    assert.equal(receipt.inventory.codex_zero, true);
    assert.equal(receipt.inventory.orca_zero, true);
  } finally {
    rmSync(zero.root, { recursive: true, force: true });
  }

  for (const [reason, mutate] of [
    ["codex_inventory_mismatch", (f) => {
      f.input.forbidden_roots = f.input.forbidden_roots.filter(
        (row) => row.kind !== "codex_worktree",
      );
    }],
    ["worktree_inventory_attestation_invalid", (f) => {
      f.input.worktree_inventory.codex.count = 2;
    }],
    ["worktree_inventory_stale", (f) => {
      f.input.worktree_inventory.expires_at = "2026-07-31T04:04:00.000Z";
      reseal(f.input.worktree_inventory);
    }],
    ["worktree_inventory_classification_invalid", (f) => {
      f.input.worktree_inventory.source_classification = "raw_payload";
      reseal(f.input.worktree_inventory);
    }],
    ["worktree_inventory_classification_invalid", (f) => {
      f.input.worktree_inventory.tool_classification = "unknown_probe";
      reseal(f.input.worktree_inventory);
    }],
    ["codex_inventory_mismatch", (f) => {
      f.input.worktree_inventory.codex.root_digests.push(DIGEST_A);
      f.input.worktree_inventory.codex.root_digests.sort();
      f.input.worktree_inventory.codex.count += 1;
      reseal(f.input.worktree_inventory);
    }],
  ]) {
    const f = fixture();
    try {
      mutate(f);
      const receipt = run(f.input);
      assert.equal(receipt.status, "HOLD");
      assert.deepEqual(receipt.hold_reasons, [reason]);
      assert.equal(JSON.stringify(receipt).includes(f.root), false);
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  }
});

test("backup evidence distinguishes authorities, clones, and restore receipt", () => {
  for (const [reason, mutate] of [
    ["backup_surface_classification_invalid", (input) => {
      input.evidence.backup_restore.surface_classifications
        .writer_workmeta_clone =
        "backup_recovery_included";
      reseal(input.evidence.backup_restore);
    }],
    ["input_boundary_invalid", (input) => {
      input.evidence.backup_restore.surface_classifications.remote_url =
        "regenerable_excluded";
      reseal(input.evidence.backup_restore);
    }],
    ["backup_clone_unpublished_state_invalid", (input) => {
      input.evidence.backup_restore.clone_state
        .writer_private_state_unpushed_commits = 1;
      reseal(input.evidence.backup_restore);
    }],
    ["cursor_ledger_binding_invalid", (input) => {
      input.evidence.backup_restore.cursor_ledger_binding
        .cursor_points_only_to_included_ledger = false;
      reseal(input.evidence.backup_restore);
    }],
    ["workmeta_restore_authority_mismatch", (input) => {
      input.evidence.backup_restore.restore.workmeta.authority_fingerprint =
        DIGEST_C;
      reseal(input.evidence.backup_restore);
    }],
    ["workmeta_restore_authority_mismatch", (input) => {
      input.evidence.backup_restore.restore.workmeta.receipt_digest =
        DIGEST_C;
      reseal(input.evidence.backup_restore);
    }],
    ["workmeta_restore_authority_mismatch", (input) => {
      input.evidence.backup_restore.restore.workmeta.manifest_digest =
        DIGEST_C;
      reseal(input.evidence.backup_restore);
    }],
    ["restore_latest_receipt_aggregate_mismatch", (input) => {
      input.evidence.backup_restore.restore.latest_receipt_digest = DIGEST_C;
      reseal(input.evidence.backup_restore);
    }],
    ["private_state_restore_authority_mismatch", (input) => {
      input.evidence.backup_restore.restore.private_state.ref_match = false;
      reseal(input.evidence.backup_restore);
    }],
    ["restore_destination_invalid", (input) => {
      input.evidence.backup_restore.restore.destination_class =
        "live_writer_clone";
      reseal(input.evidence.backup_restore);
    }],
    ["restore_destination_invalid", (input) => {
      input.evidence.backup_restore.restore.excluded_surfaces_absent = false;
      reseal(input.evidence.backup_restore);
    }],
    ["restore_destination_invalid", (input) => {
      input.evidence.backup_restore.restore.active_roots_untouched = false;
      reseal(input.evidence.backup_restore);
    }],
  ]) {
    const f = fixture();
    try {
      mutate(f.input);
      const receipt = run(f.input);
      assert.equal(receipt.status, "HOLD");
      assert.deepEqual(receipt.hold_reasons, [reason]);
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  }
});

test("Git authority rejects forbidden config and unsafe read/immutability modes", () => {
  for (const [reason, mutate] of [
    ["workmeta_forbidden_config_present", (writer) => {
      writer.forbidden_config.include = true;
    }],
    ["workmeta_forbidden_config_present", (writer) => {
      writer.forbidden_config.include_if = true;
    }],
    ["workmeta_forbidden_config_present", (writer) => {
      writer.forbidden_config.instead_of = true;
    }],
    ["workmeta_forbidden_config_present", (writer) => {
      writer.forbidden_config.push_instead_of = true;
    }],
    ["workmeta_git_authority_missing", (writer) => {
      writer.read_probe_status = "FAILED";
    }],
    ["workmeta_git_authority_missing", (writer) => {
      writer.config_read_only = false;
    }],
    ["workmeta_git_authority_missing", (writer) => {
      writer.immutable_recheck = false;
    }],
    ["workmeta_git_authority_missing", (writer) => {
      writer.full_config_read = false;
    }],
    ["workmeta_git_authority_missing", (writer) => {
      writer.writer_role = "writer_private_state";
    }],
    ["workmeta_git_authority_missing", (writer) => {
      writer.logical_remote = "Ledger Authority";
    }],
    ["workmeta_git_authority_missing", (writer) => {
      writer.ref = "refs/private/main";
    }],
    ["workmeta_git_authority_missing", (writer) => {
      writer.transport_class = "local_file";
    }],
    ["workmeta_noninteractive_missing", (writer) => {
      writer.noninteractive.terminal_prompt_blocked = false;
    }],
    ["git_backup_authority_binding_mismatch", (_writer, input) => {
      input.evidence.git_authority.writers.workmeta.logical_remote =
        input.evidence.git_authority.writers.private_state.logical_remote;
    }],
    ["git_backup_authority_binding_mismatch", (writer, input) => {
      writer.authority_fingerprint =
        input.evidence.git_authority.writers.private_state
          .authority_fingerprint;
    }],
  ]) {
    const f = fixture();
    try {
      mutate(f.input.evidence.git_authority.writers.workmeta, f.input);
      reseal(f.input.evidence.git_authority);
      const receipt = run(f.input);
      assert.equal(receipt.status, "HOLD");
      assert.deepEqual(receipt.hold_reasons, [reason]);
      assert.equal(JSON.stringify(receipt).includes(f.root), false);
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  }
});

test("lease policy is declarative, bounded, and never generates a live value", () => {
  for (const mutate of [
    (lease) => {
      lease.authority_profile = "operator";
    },
    (lease) => {
      lease.operational_primary = false;
    },
    (lease) => {
      lease.owner_token_class = "caller_text";
    },
    (lease) => {
      lease.first_lease_stale = true;
    },
    (lease) => {
      lease.host_identity_digest = "not-a-digest";
    },
    (lease) => {
      lease.restored_writer_epoch = -1;
    },
    (lease) => {
      lease.authority_writer_epoch = 1.5;
    },
    (lease) => {
      lease.receipt_writer_epoch = Number.MAX_SAFE_INTEGER + 1;
    },
    (lease) => {
      lease.initial_writer_epoch = 7;
    },
    (lease) => {
      lease.initial_writer_epoch = 9;
    },
    (lease) => {
      lease.ttl_minutes = 14;
    },
    (lease) => {
      lease.ttl_minutes = 121;
    },
    (lease) => {
      lease.epoch_formula = "1";
    },
  ]) {
    const f = fixture();
    try {
      mutate(f.input.evidence.lease_policy);
      reseal(f.input.evidence.lease_policy);
      const receipt = run(f.input);
      assert.equal(receipt.status, "HOLD");
      assert.deepEqual(receipt.hold_reasons, ["lease_policy_invalid"]);
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  }
});

test("overlap, reparse, unknown keys, and sensitive evidence fail without leak", () => {
  const overlap = fixture();
  try {
    overlap.input.forbidden_roots.find(
      (row) => row.kind === "codex_worktree",
    ).path = dirname(overlap.input.roots.writer_workmeta);
    const receipt = run(overlap.input);
    assert.equal(receipt.status, "HOLD");
    assert.equal(JSON.stringify(receipt).includes(overlap.root), false);
  } finally {
    rmSync(overlap.root, { recursive: true, force: true });
  }

  const linked = fixture();
  try {
    const alias = join(dirname(linked.input.roots.runner), "runner-alias");
    let created = false;
    try {
      symlinkSync(linked.input.roots.runner, alias, "junction");
      created = true;
    } catch {
      // Windows without junction privilege retains the other path sentinels.
    }
    if (created) {
      linked.input.roots.runner = alias;
      assert.equal(run(linked.input).status, "HOLD");
    }
  } finally {
    rmSync(linked.root, { recursive: true, force: true });
  }

  for (const mutate of [
    (input) => {
      input.evidence.acl.unexpected = "marker-private";
    },
    (input) => {
      input.evidence.git_authority.writers.workmeta.credential =
        "marker-private";
    },
  ]) {
    const f = fixture();
    try {
      mutate(f.input);
      const receipt = run(f.input);
      assert.equal(receipt.status, "HOLD");
      assert.equal(JSON.stringify(receipt).includes("marker-private"), false);
      assert.equal(JSON.stringify(receipt).includes(f.root), false);
      nonAcceptance(receipt);
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  }
});
