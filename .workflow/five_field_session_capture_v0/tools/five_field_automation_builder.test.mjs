import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";

import {
  AUTOMATION_BUILDER_INPUT_SCHEMA,
  AUTOMATION_BUILDER_RECEIPT_SCHEMA,
  AUTOMATION_BUILDER_V1_INPUT_SCHEMA,
  GENERATED_AUTOMATION_NAME,
  buildPausedAutomation,
} from "./five_field_automation_builder.mjs";
import {
  LEASE_TTL_FORMULA,
  RUNTIME_PREFLIGHT_INPUT_SCHEMA,
  STALE_RECOVERY_POLICY,
  WORKTREE_INVENTORY_SOURCE_CLASSIFICATION,
  WORKTREE_INVENTORY_TOOL_CLASSIFICATION,
  WRITER_EPOCH_FORMULA,
  runRuntimePreflight,
  runtimeAttestationDigest,
  runtimeLatestReceiptDigest,
  runtimePathDigest,
} from "./five_field_runtime_preflight.mjs";
import { canonicalize } from "./five_field_recovery_contract.mjs";

const DIGEST_A = `sha256:${"a".repeat(64)}`;
const DIGEST_B = `sha256:${"b".repeat(64)}`;
const DIGEST_C = `sha256:${"c".repeat(64)}`;

function sha256(value) {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function seal(value) {
  return {
    ...value,
    attestation_digest: runtimeAttestationDigest(value),
  };
}

function reseal(value) {
  delete value.attestation_digest;
  value.attestation_digest = runtimeAttestationDigest(value);
}

function syntheticCurrent(overrides = {}) {
  const values = {
    version: 1,
    id: "soulforge-five-field-sweep",
    kind: "cron",
    name: "Soulforge 5-Field Sweep (daily)",
    prompt: "Synthetic legacy prompt",
    status: "ACTIVE",
    rrule:
      "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA,SU;BYHOUR=7;BYMINUTE=35;BYSECOND=0",
    model: "synthetic-model",
    reasoning_effort: "medium",
    execution_environment: "local",
    project_id: "synthetic-project",
    cwds: [resolve("synthetic-legacy-root")],
    created_at: 100,
    updated_at: 200,
    ...overrides,
  };
  return [
    `version = ${values.version}`,
    `id = ${JSON.stringify(values.id)}`,
    `kind = ${JSON.stringify(values.kind)}`,
    `name = ${JSON.stringify(values.name)}`,
    `prompt = ${JSON.stringify(values.prompt)}`,
    `status = ${JSON.stringify(values.status)}`,
    `rrule = ${JSON.stringify(values.rrule)}`,
    `model = ${JSON.stringify(values.model)}`,
    `reasoning_effort = ${JSON.stringify(values.reasoning_effort)}`,
    `execution_environment = ${JSON.stringify(values.execution_environment)}`,
    `target = { type = "project", project_id = ${JSON.stringify(values.project_id)} }`,
    `cwds = ${JSON.stringify(values.cwds)}`,
    `created_at = ${values.created_at}`,
    `updated_at = ${values.updated_at}`,
    "",
  ].join("\n");
}

function inventoryGroup(paths) {
  const root_digests = paths.map((path) => runtimePathDigest(path)).sort();
  return {
    count: root_digests.length,
    zero_count: root_digests.length === 0,
    root_digests,
  };
}

function fixture(currentBytes = syntheticCurrent()) {
  const root = mkdtempSync(join(tmpdir(), "sf-automation-builder-v2-"));
  const isolated = join(root, "isolated");
  const roots = {
    runner: join(isolated, "runner"),
    source: join(isolated, "source"),
    writer_workmeta: join(isolated, "writer-workmeta"),
    writer_private_state: join(isolated, "writer-private-state"),
    config: join(isolated, "config"),
    locks: join(isolated, "locks"),
  };
  for (const path of Object.values(roots)) {
    mkdirSync(path, { recursive: true });
  }
  const runnerScript = join(
    roots.runner,
    ".workflow",
    "five_field_session_capture_v0",
    "tools",
    "five_field_cursor_runner.mjs",
  );
  mkdirSync(dirname(runnerScript), { recursive: true });
  writeFileSync(runnerScript, "// synthetic runner\n", "utf8");
  const inputPath = join(roots.config, "input.json");
  writeFileSync(inputPath, "{}\n", "utf8");

  const activePublic = join(root, "active-public");
  const activeWorkmeta = join(activePublic, "_workmeta");
  const activePrivateState = join(activePublic, "private-state");
  const automationControl = join(root, "automation-control");
  const codexRoot = join(root, "codex-worktree");
  const orcaRoot = join(root, "orca-worktree");
  mkdirSync(activeWorkmeta, { recursive: true });
  mkdirSync(activePrivateState);
  mkdirSync(automationControl);
  mkdirSync(codexRoot);
  mkdirSync(orcaRoot);

  const guarded_roots = {
    active_public_root: activePublic,
    active_workmeta: activeWorkmeta,
    active_private_state: activePrivateState,
    automation_control_root: automationControl,
  };
  const forbidden_roots = [
    ...Object.entries(guarded_roots).map(([kind, path]) => ({ kind, path })),
    { kind: "codex_worktree", path: codexRoot },
    { kind: "orca_worktree", path: orcaRoot },
  ];
  const codex = inventoryGroup([codexRoot]);
  const orca = inventoryGroup([orcaRoot]);
  const now = Date.now();
  const observed_at = new Date(now - 1_000).toISOString();
  const expires_at = new Date(now + 10 * 60_000).toISOString();
  const worktree_inventory = seal({
    observed_at,
    expires_at,
    source_classification: WORKTREE_INVENTORY_SOURCE_CLASSIFICATION,
    tool_classification: WORKTREE_INVENTORY_TOOL_CLASSIFICATION,
    complete: true,
    codex,
    orca,
    root_set_digest: sha256(canonicalize({
      codex: codex.root_digests,
      orca: orca.root_digests,
    })),
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
    observed_at,
    expires_at,
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
      latest_receipt_digest: runtimeLatestReceiptDigest(
        DIGEST_A,
        DIGEST_B,
      ),
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
  const forbidden_config = {
    include: false,
    include_if: false,
    instead_of: false,
    push_instead_of: false,
  };
  const noninteractive = {
    terminal_prompt_blocked: true,
    credential_interactive_blocked: true,
    askpass_blocked: true,
    ssh_batch_mode: true,
    failure_output_discarded: true,
  };
  const git_authority = seal({
    status: "VERIFIED",
    observed_at,
    expires_at,
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
  const runtimePreflightInput = {
    schema_version: RUNTIME_PREFLIGHT_INPUT_SCHEMA,
    roots,
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
  };
  const runtimePreflightReceipt = runRuntimePreflight(
    runtimePreflightInput,
  );
  assert.equal(
    runtimePreflightReceipt.status,
    "PASS",
    JSON.stringify(runtimePreflightReceipt),
  );
  return {
    root,
    roots,
    currentBytes,
    input: {
      schema_version: AUTOMATION_BUILDER_INPUT_SCHEMA,
      current_toml_bytes: currentBytes,
      expected_current_sha256: sha256(currentBytes),
      candidate_updated_at: 300,
      runtime_preflight_input: runtimePreflightInput,
      runtime_preflight_receipt: runtimePreflightReceipt,
      isolated: {
        cwd: roots.runner,
        node_path: resolve(process.execPath),
        runner_script_path: runnerScript,
        input_path: inputPath,
      },
    },
  };
}

function assertNonAcceptance(receipt) {
  assert.equal(receipt.official_completion, false);
  assert.equal(receipt.worksession_acceptance, false);
  assert.equal(receipt.taskdriver_acceptance, false);
  assert.equal(receipt.erp_acceptance, false);
  assert.equal(receipt.mcp_acceptance, false);
  assert.equal(receipt.claim_ceiling, "operational_evidence_only");
}

test("v2 deterministically binds reviewed evidence and exact candidate hash", () => {
  const f = fixture();
  try {
    const first = buildPausedAutomation(f.input);
    const second = buildPausedAutomation(structuredClone(f.input));
    assert.equal(first.status, "SUCCESS", JSON.stringify(first.receipt));
    assert.equal(second.status, "SUCCESS");
    assert.equal(first.receipt.schema_version, AUTOMATION_BUILDER_RECEIPT_SCHEMA);
    assert.equal(first.candidate.bytes, second.candidate.bytes);
    assert.equal(first.candidate.sha256, sha256(first.candidate.bytes));
    assert.equal(first.receipt.candidate_sha256, first.candidate.sha256);
    assert.equal(first.rollback.bytes, f.currentBytes);
    assert.equal(first.rollback.sha256, sha256(f.currentBytes));
    assert.equal(
      first.receipt.runtime_manifest_digest,
      f.input.runtime_preflight_receipt.manifest_digest,
    );
    assert.equal(
      first.receipt.runtime_evidence_digest,
      f.input.runtime_preflight_receipt.evidence_digest,
    );
    assert.equal(
      first.receipt.runtime_launch_binding_digest,
      f.input.runtime_preflight_receipt.launch_binding_digest,
    );
    for (const [flag, digest] of [
      ["--runtime-manifest-digest", first.receipt.runtime_manifest_digest],
      ["--runtime-evidence-digest", first.receipt.runtime_evidence_digest],
      [
        "--runtime-launch-binding-digest",
        first.receipt.runtime_launch_binding_digest,
      ],
    ]) {
      assert.ok(first.candidate.bytes.includes(flag), flag);
      assert.ok(first.candidate.bytes.includes(digest), digest);
    }
    assert.ok(first.candidate.bytes.includes(
      `name = ${JSON.stringify(GENERATED_AUTOMATION_NAME)}`,
    ));
    assert.equal(
      first.candidate.bytes.includes("Soulforge 5-Field Sweep (daily)"),
      false,
    );
    assert.equal(JSON.stringify(first.receipt).includes(f.root), false);
    assertNonAcceptance(first.receipt);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("v1 and previous PASS summary envelopes explicitly HOLD", () => {
  const f = fixture();
  try {
    const v1 = structuredClone(f.input);
    v1.schema_version = AUTOMATION_BUILDER_V1_INPUT_SCHEMA;
    const v1Result = buildPausedAutomation(v1);
    assert.equal(v1Result.status, "HOLD");
    assert.deepEqual(
      v1Result.receipt.hold_reasons,
      ["automation_builder_v1_explicit_hold"],
    );

    const summary = structuredClone(f.input);
    delete summary.runtime_preflight_input;
    delete summary.runtime_preflight_receipt;
    summary.runtime_preflight = {
      status: "PASS",
      manifest_digest: DIGEST_A,
      evidence_digest: DIGEST_B,
      launch_binding_digest: DIGEST_C,
    };
    const summaryResult = buildPausedAutomation(summary);
    assert.equal(summaryResult.status, "HOLD");
    assert.deepEqual(
      summaryResult.receipt.hold_reasons,
      ["automation_builder_contract_invalid"],
    );
    assert.equal(JSON.stringify(summaryResult).includes(f.root), false);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("missing, stale, root, inventory, Git, and backup evidence HOLD", () => {
  for (const [name, mutate] of [
    ["missing evidence", (f) => {
      delete f.input.runtime_preflight_input.evidence.git_authority;
    }],
    ["stale inventory", (f) => {
      const inventory = f.input.runtime_preflight_input.worktree_inventory;
      inventory.observed_at = "2020-01-01T00:00:00.000Z";
      inventory.expires_at = "2020-01-01T00:10:00.000Z";
      reseal(inventory);
    }],
    ["active root overlap", (f) => {
      const input = f.input.runtime_preflight_input;
      input.guarded_roots.active_public_root = f.roots.runner;
      input.forbidden_roots.find(
        (row) => row.kind === "active_public_root",
      ).path = f.roots.runner;
    }],
    ["inventory mismatch", (f) => {
      const inventory = f.input.runtime_preflight_input.worktree_inventory;
      inventory.codex.count += 1;
      reseal(inventory);
    }],
    ["Git projection", (f) => {
      const git = f.input.runtime_preflight_input.evidence.git_authority;
      git.writers.workmeta.config_read_only = false;
      reseal(git);
    }],
    ["backup projection", (f) => {
      const backup =
        f.input.runtime_preflight_input.evidence.backup_restore;
      backup.surface_classifications.writer_workmeta_clone =
        "backup_restore_included";
      reseal(backup);
    }],
    ["restore receipt aggregate", (f) => {
      const backup =
        f.input.runtime_preflight_input.evidence.backup_restore;
      backup.restore.latest_receipt_digest = DIGEST_C;
      reseal(backup);
    }],
  ]) {
    const f = fixture();
    try {
      mutate(f);
      const result = buildPausedAutomation(f.input);
      assert.equal(result.status, "HOLD", name);
      assert.deepEqual(
        result.receipt.hold_reasons,
        ["runtime_preflight_recheck_failed"],
        name,
      );
      assert.equal(result.candidate, null, name);
      assert.equal(result.rollback, null, name);
      assert.equal(JSON.stringify(result).includes(f.root), false, name);
      assertNonAcceptance(result.receipt);
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  }
});

test("reviewed digest, topology, inventory, and fixed-false drift HOLD", () => {
  for (const [name, mutate] of [
    ["manifest digest", (receipt) => {
      receipt.manifest_digest = DIGEST_A;
    }],
    ["evidence digest", (receipt) => {
      receipt.evidence_digest = DIGEST_A;
    }],
    ["launch digest", (receipt) => {
      receipt.launch_binding_digest = DIGEST_A;
    }],
    ["topology", (receipt) => {
      receipt.topology.forbidden_union_complete = false;
    }],
    ["inventory", (receipt) => {
      receipt.inventory.fresh = false;
    }],
    ["lease host", (receipt) => {
      receipt.lease_policy.host_identity_digest = DIGEST_A;
    }],
    ["lease initial epoch", (receipt) => {
      receipt.lease_policy.initial_writer_epoch += 1;
    }],
    ["official completion", (receipt) => {
      receipt.official_completion = true;
    }],
    ["TaskDriver acceptance", (receipt) => {
      receipt.taskdriver_acceptance = true;
    }],
  ]) {
    const f = fixture();
    try {
      mutate(f.input.runtime_preflight_receipt);
      const result = buildPausedAutomation(f.input);
      assert.equal(result.status, "HOLD", name);
      assert.deepEqual(
        result.receipt.hold_reasons,
        ["runtime_preflight_receipt_mismatch"],
        name,
      );
      assert.equal(result.candidate, null, name);
      assert.equal(JSON.stringify(result).includes(f.root), false, name);
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  }
});

test("exact launch binding and current automation digest are mandatory", () => {
  for (const [name, mutate, reason] of [
    ["launch", (f) => {
      f.input.isolated.input_path = join(f.roots.config, "alternate.json");
    }, "runtime_launch_binding_mismatch"],
    ["current digest", (f) => {
      f.input.expected_current_sha256 = DIGEST_A;
    }, "automation_current_digest_mismatch"],
  ]) {
    const f = fixture();
    try {
      mutate(f);
      const result = buildPausedAutomation(f.input);
      assert.equal(result.status, "HOLD", name);
      assert.deepEqual(result.receipt.hold_reasons, [reason], name);
      assert.equal(result.candidate, null, name);
      assert.equal(JSON.stringify(result).includes(f.root), false, name);
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  }
});

test("schedule, model, reasoning, target, created_at, and rollback stay exact", () => {
  const current = syntheticCurrent({
    model: "synthetic-model-v2",
    reasoning_effort: "high",
    project_id: "synthetic-project-v2",
    created_at: 777,
  });
  const f = fixture(current);
  try {
    const result = buildPausedAutomation(f.input);
    assert.equal(result.status, "SUCCESS", JSON.stringify(result.receipt));
    for (const expected of [
      'id = "soulforge-five-field-sweep"',
      'model = "synthetic-model-v2"',
      'reasoning_effort = "high"',
      'project_id = "synthetic-project-v2"',
      "created_at = 777",
      "BYHOUR=7",
      'status = "PAUSED"',
    ]) assert.ok(result.candidate.bytes.includes(expected), expected);
    assert.equal(result.rollback.bytes, current);
    assert.equal(result.rollback.sha256, sha256(current));
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("secret-shaped current bytes HOLD without receipt leakage", () => {
  const marker = "access_token=synthetic-private-marker";
  const f = fixture(syntheticCurrent({ prompt: marker }));
  try {
    const result = buildPausedAutomation(f.input);
    assert.equal(result.status, "HOLD");
    assert.deepEqual(
      result.receipt.hold_reasons,
      ["automation_bytes_boundary_invalid"],
    );
    assert.equal(JSON.stringify(result).includes(marker), false);
    assert.equal(JSON.stringify(result).includes(f.root), false);
    assertNonAcceptance(result.receipt);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});
