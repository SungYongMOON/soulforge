import assert from "node:assert/strict";
import {
  mkdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { test } from "node:test";
import { mkdtempSync } from "node:fs";

import {
  RUNTIME_PREFLIGHT_INPUT_SCHEMA,
  runRuntimePreflight,
} from "./five_field_runtime_preflight.mjs";

const DIGEST = `sha256:${"a".repeat(64)}`;
const ROOT_NAMES = [
  "runner",
  "source",
  "writer-workmeta",
  "writer-private-state",
  "config",
  "locks",
];

function nonAcceptance(receipt) {
  assert.equal(receipt.official_completion, false);
  assert.equal(receipt.worksession_acceptance, false);
  assert.equal(receipt.taskdriver_acceptance, false);
  assert.equal(receipt.erp_acceptance, false);
  assert.equal(receipt.mcp_acceptance, false);
  assert.equal(receipt.claim_ceiling, "operational_evidence_only");
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "sf-runtime-preflight-"));
  const isolated = join(root, "isolated");
  mkdirSync(isolated);
  for (const name of ROOT_NAMES) mkdirSync(join(isolated, name));
  const inputPath = join(isolated, "config", "input.json");
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
      launch: {
        input_path: inputPath,
      },
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
    },
  };
}

test("accepts exact isolated sibling topology and complete evidence", () => {
  const f = fixture();
  try {
    const receipt = runRuntimePreflight(f.input);
    assert.equal(receipt.status, "PASS", JSON.stringify(receipt));
    assert.match(receipt.manifest_digest, /^sha256:[0-9a-f]{64}$/u);
    assert.match(
      receipt.launch_binding_digest,
      /^sha256:[0-9a-f]{64}$/u,
    );
    assert.deepEqual(receipt.hold_reasons, []);
    assert.equal(receipt.topology.same_parent, true);
    assert.equal(receipt.topology.pairwise_disjoint, true);
    assert.equal(JSON.stringify(receipt).includes(f.root), false);
    nonAcceptance(receipt);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("missing ACL, NAS, restore, or fencing evidence HOLDs without paths", () => {
  for (const [name, mutate, reason] of [
    ["acl", (input) => {
      input.evidence.acl.active_roots_write_denied = false;
    }, "acl_evidence_missing"],
    ["nas", (input) => {
      input.evidence.nas.classifications.config = "regenerable_excluded";
    }, "nas_evidence_missing"],
    ["restore", (input) => {
      input.evidence.restore.cursor_restore_tested = false;
    }, "restore_evidence_missing"],
    ["fencing", (input) => {
      input.evidence.fencing.single_writer = false;
    }, "fencing_evidence_missing"],
  ]) {
    const f = fixture();
    try {
      mutate(f.input);
      const receipt = runRuntimePreflight(f.input);
      assert.equal(receipt.status, "HOLD", name);
      assert.deepEqual(receipt.hold_reasons, [reason], name);
      assert.equal(JSON.stringify(receipt).includes(f.root), false, name);
      nonAcceptance(receipt);
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  }
});

test("wrong names, non-siblings, overlaps, and forbidden roots fail closed", () => {
  for (const [name, mutate, reason] of [
    ["wrong name", (f) => {
      const path = join(f.root, "wrong-runner");
      mkdirSync(path);
      f.input.roots.runner = path;
    }, "runtime_root_name_invalid"],
    ["non sibling", (f) => {
      const nestedParent = join(f.root, "other");
      mkdirSync(nestedParent);
      const path = join(nestedParent, "source");
      mkdirSync(path);
      f.input.roots.source = path;
    }, "runtime_roots_not_siblings"],
    ["overlap", (f) => {
      const path = join(f.input.roots.runner, "source");
      mkdirSync(path);
      f.input.roots.source = path;
    }, "runtime_roots_overlap"],
    ["forbidden", (f) => {
      f.input.forbidden_roots[0].path = dirnameFor(
        f.input.roots.writer_workmeta,
      );
    }, "forbidden_root_overlap"],
  ]) {
    const f = fixture();
    try {
      mutate(f);
      const receipt = runRuntimePreflight(f.input);
      assert.equal(receipt.status, "HOLD", name);
      assert.deepEqual(receipt.hold_reasons, [reason], name);
      assert.equal(JSON.stringify(receipt).includes(f.root), false, name);
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  }
});

function dirnameFor(path) {
  return path.slice(0, -(basename(path).length + 1));
}

test("reparse alias and unknown or sensitive nested input never leak", () => {
  const linked = fixture();
  try {
    const alias = join(
      dirnameFor(linked.input.roots.runner),
      "runner-alias",
    );
    let created = false;
    try {
      symlinkSync(linked.input.roots.runner, alias, "junction");
      created = true;
    } catch {
      // Windows hosts without junction privilege still cover canonical roots.
    }
    if (created) {
      linked.input.roots.runner = alias;
      const receipt = runRuntimePreflight(linked.input);
      assert.equal(receipt.status, "HOLD");
      assert.ok(receipt.hold_reasons.includes(
        "runtime_root_realpath_invalid",
      ));
      assert.equal(JSON.stringify(receipt).includes(linked.root), false);
    }
  } finally {
    rmSync(linked.root, { recursive: true, force: true });
  }

  for (const [name, mutate] of [
    ["unknown", (input) => {
      input.evidence.acl.unexpected = "marker-private";
    }],
    ["forbidden key", (input) => {
      input.evidence.fencing.credential = "marker-private";
    }],
    ["URL", (input) => {
      input.evidence.fencing.host_identity_digest =
        "https://private.invalid/marker-private";
    }],
  ]) {
    const f = fixture();
    try {
      mutate(f.input);
      const receipt = runRuntimePreflight(f.input);
      assert.equal(receipt.status, "HOLD", name);
      assert.equal(JSON.stringify(receipt).includes("marker-private"), false);
      assert.equal(JSON.stringify(receipt).includes(f.root), false);
      nonAcceptance(receipt);
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  }
});

test("config input must be canonical, non-reparse, and inside config root", () => {
  const outside = fixture();
  try {
    const outsidePath = join(outside.root, "alternate-input.json");
    writeFileSync(outsidePath, "{}\n", "utf8");
    outside.input.launch.input_path = outsidePath;
    const receipt = runRuntimePreflight(outside.input);
    assert.equal(receipt.status, "HOLD");
    assert.deepEqual(
      receipt.hold_reasons,
      ["runtime_input_outside_config"],
    );
    assert.equal(JSON.stringify(receipt).includes(outside.root), false);
  } finally {
    rmSync(outside.root, { recursive: true, force: true });
  }

  const linked = fixture();
  try {
    const target = linked.input.launch.input_path;
    const alias = join(linked.input.roots.config, "alternate.json");
    let created = false;
    try {
      symlinkSync(target, alias, "file");
      created = true;
    } catch {
      // Hosts without symlink privilege still exercise containment above.
    }
    if (created) {
      linked.input.launch.input_path = alias;
      const receipt = runRuntimePreflight(linked.input);
      assert.equal(receipt.status, "HOLD");
      assert.deepEqual(
        receipt.hold_reasons,
        ["runtime_input_realpath_invalid"],
      );
      assert.equal(JSON.stringify(receipt).includes(linked.root), false);
    }
  } finally {
    rmSync(linked.root, { recursive: true, force: true });
  }
});

test("every forbidden-root category is mandatory", () => {
  const f = fixture();
  try {
    f.input.forbidden_roots = f.input.forbidden_roots.filter(
      (row) => row.kind !== "active_private_state",
    );
    const receipt = runRuntimePreflight(f.input);
    assert.equal(receipt.status, "HOLD");
    assert.deepEqual(
      receipt.hold_reasons,
      ["forbidden_root_kind_missing"],
    );
    assert.equal(JSON.stringify(receipt).includes(f.root), false);
    nonAcceptance(receipt);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});
