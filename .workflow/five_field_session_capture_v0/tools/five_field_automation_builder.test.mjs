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
  GENERATED_AUTOMATION_NAME,
  buildPausedAutomation,
} from "./five_field_automation_builder.mjs";
import {
  RUNTIME_PREFLIGHT_INPUT_SCHEMA,
  runRuntimePreflight,
} from "./five_field_runtime_preflight.mjs";

const DIGEST = `sha256:${"a".repeat(64)}`;

function sha256(value) {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function syntheticCurrent(overrides = {}) {
  const values = {
    version: 1,
    id: "soulforge-five-field-sweep",
    kind: "cron",
    name: "Synthetic Daily Sweep",
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

function fixture(currentBytes = syntheticCurrent()) {
  const root = mkdtempSync(join(tmpdir(), "sf-automation-builder-"));
  const isolatedRoot = join(root, "isolated");
  const roots = {
    runner: join(isolatedRoot, "runner"),
    source: join(isolatedRoot, "source"),
    writer_workmeta: join(isolatedRoot, "writer-workmeta"),
    writer_private_state: join(isolatedRoot, "writer-private-state"),
    config: join(isolatedRoot, "config"),
    locks: join(isolatedRoot, "locks"),
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

  const forbiddenKinds = [
    "active_public_repo",
    "active_workmeta",
    "active_private_state",
    "codex_worktree",
    "orca_worktree",
    "installed_automation_control",
  ];
  const forbidden_roots = forbiddenKinds.map((kind, index) => {
    const path = join(root, `forbidden-${index}`);
    mkdirSync(path);
    return { kind, path };
  });
  const runtimePreflightInput = {
    schema_version: RUNTIME_PREFLIGHT_INPUT_SCHEMA,
    roots,
    launch: { input_path: inputPath },
    forbidden_roots,
    evidence: {
      acl: {
        status: "VERIFIED",
        principal_intent: "dedicated_runner_least_privilege",
        runner_read_execute: true,
        source_read_only: true,
        config_read_only: true,
        writers_modify: true,
        locks_modify: true,
        active_roots_write_denied: true,
        attestation_digest: DIGEST,
      },
      nas: {
        status: "VERIFIED",
        classifications: {
          runner: "regenerable_excluded",
          source: "regenerable_excluded",
          writer_workmeta: "backup_recovery_included",
          writer_private_state: "backup_recovery_included",
          config: "secret_operational_capture_prohibited",
          locks: "ephemeral_excluded",
        },
        attestation_digest: DIGEST,
      },
      restore: {
        status: "VERIFIED",
        ledger_restore_tested: true,
        cursor_restore_tested: true,
        attestation_digest: DIGEST,
      },
      fencing: {
        status: "VERIFIED",
        single_writer: true,
        host_identity_digest: DIGEST,
        writer_epoch: 1,
        stale_recovery_policy:
          "same_host_dead_pid_expired_owner_approved",
        attestation_digest: DIGEST,
      },
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
    inputPath,
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

function nonAcceptance(receipt) {
  assert.equal(receipt.official_completion, false);
  assert.equal(receipt.worksession_acceptance, false);
  assert.equal(receipt.taskdriver_acceptance, false);
  assert.equal(receipt.erp_acceptance, false);
  assert.equal(receipt.mcp_acceptance, false);
  assert.equal(receipt.claim_ceiling, "operational_evidence_only");
}

test("deterministically builds exact PAUSED candidate and rollback", () => {
  const f = fixture();
  try {
    const first = buildPausedAutomation(f.input);
    const second = buildPausedAutomation(structuredClone(f.input));
    assert.equal(first.status, "SUCCESS", JSON.stringify(first.receipt));
    assert.equal(second.status, "SUCCESS");
    assert.equal(first.candidate.bytes, second.candidate.bytes);
    assert.equal(first.candidate.sha256, sha256(first.candidate.bytes));
    assert.equal(first.rollback.bytes, f.input.current_toml_bytes);
    assert.equal(first.rollback.sha256, f.input.expected_current_sha256);
    assert.match(first.candidate.bytes, /^# Generated by/u);
    assert.match(first.candidate.bytes, /status = "PAUSED"/u);
    assert.match(first.candidate.bytes, /updated_at = 300/u);
    assert.ok(first.candidate.bytes.includes(
      f.input.runtime_preflight_receipt.manifest_digest,
    ));
    for (const flag of [
      "--runtime-root",
      "--config-root",
      "--runtime-manifest-digest",
      "--input",
    ]) assert.ok(first.candidate.bytes.includes(flag), flag);
    assert.equal(first.receipt.candidate_status, "PAUSED");
    assert.equal(JSON.stringify(first.receipt).includes(f.root), false);
    assert.equal(
      JSON.stringify(first.receipt).includes("synthetic-project"),
      false,
    );
    nonAcceptance(first.receipt);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("preserves schedule, model, reasoning, target, and creation identity", () => {
  const current = syntheticCurrent({
    model: "synthetic-model-v2",
    reasoning_effort: "high",
    project_id: "synthetic-project-v2",
    created_at: 777,
  });
  const f = fixture(current);
  try {
    const result = buildPausedAutomation(f.input);
    assert.equal(result.status, "SUCCESS");
    for (const expected of [
      'model = "synthetic-model-v2"',
      'reasoning_effort = "high"',
      'project_id = "synthetic-project-v2"',
      "created_at = 777",
      "BYHOUR=7",
    ]) assert.ok(result.candidate.bytes.includes(expected), expected);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("normalizes legacy display name while preserving byte-exact rollback", () => {
  const legacyName = "Soulforge 5-Field Sweep (daily)";
  const current = syntheticCurrent({ name: legacyName });
  const f = fixture(current);
  try {
    const result = buildPausedAutomation(f.input);
    assert.equal(result.status, "SUCCESS", JSON.stringify(result.receipt));
    assert.ok(result.candidate.bytes.includes(
      `name = ${JSON.stringify(GENERATED_AUTOMATION_NAME)}`,
    ));
    assert.equal(result.candidate.bytes.includes(legacyName), false);
    assert.equal(result.rollback.bytes, current);
    assert.equal(result.rollback.sha256, sha256(current));
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("fails closed on builder digest, path, schema, and unknown fields", () => {
  for (const [name, mutate, reason] of [
    ["digest", (f) => {
      f.input.expected_current_sha256 = `sha256:${"0".repeat(64)}`;
    }, "automation_current_digest_mismatch"],
    ["preflight status", (f) => {
      f.input.runtime_preflight_receipt.status = "HOLD";
    }, "runtime_preflight_receipt_invalid"],
    ["relative node", (f) => {
      f.input.isolated.node_path = "node";
    }, "automation_node_path_invalid"],
    ["runner outside cwd", (f) => {
      f.input.isolated.runner_script_path =
        resolve("synthetic-other", "runner.mjs");
    }, "automation_runner_outside_cwd"],
    ["config outside topology", (f) => {
      f.input.isolated.input_path =
        resolve("synthetic-other", "config", "input.json");
    }, "automation_topology_binding_invalid"],
    ["unknown field", (f) => {
      f.input.unexpected = "private-marker";
    }, "automation_builder_contract_invalid"],
    ["schema", (f) => {
      f.input.schema_version = "unknown";
    }, "automation_builder_schema_invalid"],
    ["private-shaped target", (f) => {
      const current = syntheticCurrent({ project_id: "C:/private-target" });
      f.input.current_toml_bytes = current;
      f.input.expected_current_sha256 = sha256(current);
    }, "automation_contract_invalid"],
  ]) {
    const f = fixture();
    try {
      mutate(f);
      const result = buildPausedAutomation(f.input);
      assert.equal(result.status, "HOLD", name);
      assert.deepEqual(result.receipt.hold_reasons, [reason], name);
      assert.equal(result.candidate, null, name);
      assert.equal(result.rollback, null, name);
      assert.equal(JSON.stringify(result).includes("private-marker"), false);
      nonAcceptance(result.receipt);
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  }
});

test("forged PASS cannot bypass forbidden roots or preflight evidence", () => {
  for (const [name, mutate] of [
    ["active root overlap", (f) => {
      f.input.runtime_preflight_input.forbidden_roots[0].path =
        f.roots.runner;
    }],
    ["topology overlap", (f) => {
      f.input.runtime_preflight_input.roots.source = f.roots.runner;
    }],
    ["missing ACL evidence", (f) => {
      f.input.runtime_preflight_input.evidence.acl
        .active_roots_write_denied = false;
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
      assert.equal(JSON.stringify(result).includes(f.root), false, name);
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  }
});

test("reviewed receipt digest and topology must equal recomputed receipt", () => {
  for (const [name, mutate] of [
    ["manifest digest", (f) => {
      f.input.runtime_preflight_receipt.manifest_digest =
        `sha256:${"0".repeat(64)}`;
    }],
    ["launch digest", (f) => {
      f.input.runtime_preflight_receipt.launch_binding_digest =
        `sha256:${"0".repeat(64)}`;
    }],
    ["topology", (f) => {
      f.input.runtime_preflight_receipt.topology.pairwise_disjoint = false;
    }],
  ]) {
    const f = fixture();
    try {
      mutate(f);
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

test("isolated launch paths must match the recomputed launch binding", () => {
  const f = fixture();
  try {
    f.input.isolated.input_path = join(f.roots.config, "alternate.json");
    const result = buildPausedAutomation(f.input);
    assert.equal(result.status, "HOLD");
    assert.deepEqual(
      result.receipt.hold_reasons,
      ["runtime_launch_binding_mismatch"],
    );
    assert.equal(result.candidate, null);
    assert.equal(JSON.stringify(result).includes(f.root), false);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("rejects secret or URL-shaped current bytes without echoing them", () => {
  for (const marker of [
    "access_token=synthetic-private-marker",
    "https://private.invalid/synthetic-private-marker",
  ]) {
    const current = syntheticCurrent({ prompt: marker });
    const f = fixture(current);
    try {
      const result = buildPausedAutomation(f.input);
      assert.equal(result.status, "HOLD");
      assert.deepEqual(
        result.receipt.hold_reasons,
        ["automation_bytes_boundary_invalid"],
      );
      assert.equal(JSON.stringify(result).includes(marker), false);
      nonAcceptance(result.receipt);
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  }
});
