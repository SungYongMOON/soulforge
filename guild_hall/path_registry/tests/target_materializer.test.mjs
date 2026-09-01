import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { createPathRegistry, registrySnapshot } from "../src/path_registry_core.mjs";
import { SEED_AUTHORITY, seedRows } from "../data/registry_seed_v0.mjs";
import {
  APPROVED_EMPTY_MATERIALIZATION_ROOT_REF,
  applyTargetMaterialization,
  planTargetMaterialization,
  rollbackTargetMaterialization,
} from "../src/target_materializer.mjs";

const SNAPSHOT = registrySnapshot(createPathRegistry({ authority: SEED_AUTHORITY, rows: seedRows() }));
const ROOT_REF = APPROVED_EMPTY_MATERIALIZATION_ROOT_REF;
const PLAN17_DOCUMENT_URL = new URL(
  "../../../docs/architecture/foundation/team_member_engineering_program/17_PHYSICAL_ARCHITECTURE_PATH_REGISTRY_AND_STORAGE_MAP.md",
  import.meta.url,
);

function documentCodeBlockAfter(heading) {
  const documentText = readFileSync(PLAN17_DOCUMENT_URL, "utf8");
  const headingOffset = documentText.indexOf(heading);
  assert.notEqual(headingOffset, -1, `missing Plan 17 heading: ${heading}`);
  const openingOffset = documentText.indexOf("```text", headingOffset);
  assert.notEqual(openingOffset, -1, `missing Plan 17 code block after: ${heading}`);
  const bodyStart = openingOffset + "```text".length;
  const closingOffset = documentText.indexOf("```", bodyStart);
  assert.notEqual(closingOffset, -1, `unterminated Plan 17 code block after: ${heading}`);
  return documentText.slice(bodyStart, closingOffset).trim();
}

function documentedDataRootPaths() {
  const lines = documentCodeBlockAfter("## Target data-root catalog view").split(/\r?\n/u);
  assert.equal(lines.shift(), "data_root/");
  const stack = [];
  const paths = [];
  for (const line of lines) {
    const match = line.match(/^((?:│  |   )*)(?:├─ |└─ )(.+)$/u);
    assert.ok(match, `unrecognized Plan 17 tree line: ${line}`);
    const level = match[1].length / 3;
    assert.equal(Number.isInteger(level), true, `invalid Plan 17 tree indentation: ${line}`);
    stack.length = level;
    const segments = match[2].replace(/\/$/u, "").split("/");
    const firstDynamicSegment = segments.findIndex((segment) => segment.startsWith("<"));
    const staticSegments = firstDynamicSegment === -1
      ? segments
      : segments.slice(0, firstDynamicSegment);
    if (staticSegments.length === 0) continue;
    const path = [...stack, ...staticSegments].join("/");
    paths.push(path);
    stack.push(...staticSegments);
  }
  return paths;
}

function documentedSourceLaneDirectories() {
  const lines = documentCodeBlockAfter("## Uniform external-source lane").split(/\r?\n/u);
  assert.equal(lines.shift(), "10_SOURCE_CAPTURE_CATALOG/<source-id>/");
  return lines.map((line) => {
    const match = line.match(/^(?:├─ |└─ )([A-Za-z0-9-]+)\/$/u);
    assert.ok(match, `unrecognized Plan 17 source-lane line: ${line}`);
    return match[1];
  });
}

function documentedMaterializerDirectories() {
  const paths = new Set(documentedDataRootPaths());
  const sourceLanePrefix = "10_SOURCE_CAPTURE_CATALOG/";
  const sourceLanes = [...paths].filter((path) => (
    path.startsWith(sourceLanePrefix) && !path.slice(sourceLanePrefix.length).includes("/")
  ));
  for (const sourceLane of sourceLanes) {
    for (const directory of documentedSourceLaneDirectories()) {
      paths.add(`${sourceLane}/${directory}`);
    }
    paths.add(`60_BACKUP_GENERATIONS/${sourceLane.slice(sourceLanePrefix.length)}`);
  }
  return [...paths].sort();
}

function freshRoots() {
  const containment = mkdtempSync(join(tmpdir(), "sf-materializer-"));
  const root = join(containment, "canary");
  mkdirSync(root);
  return { containment, root };
}

function plannedNow() {
  const plan = planTargetMaterialization({
    registry_snapshot: SNAPSHOT,
    approved_empty_materialization_root_ref: ROOT_REF,
  });
  assert.equal(plan.status, "planned");
  return plan;
}

test("planning holds without an exact approved canary root ref (OD-10)", () => {
  assert.equal(
    planTargetMaterialization({ registry_snapshot: SNAPSHOT }).hold_code,
    "materialization_root_unapproved",
  );
  assert.equal(
    planTargetMaterialization({
      registry_snapshot: SNAPSHOT,
      approved_empty_materialization_root_ref: "hold:od-10.materializer_canary_root",
    }).hold_code,
    "materialization_root_unapproved",
  );
  assert.equal(
    planTargetMaterialization({
      registry_snapshot: SNAPSHOT,
      approved_empty_materialization_root_ref: "canary.synthetic_test_root.v0",
    }).hold_code,
    "materialization_root_unapproved",
  );
  assert.equal(
    planTargetMaterialization({
      registry_snapshot: { schema: "forged" },
      approved_empty_materialization_root_ref: ROOT_REF,
    }).hold_code,
    "snapshot_invalid",
  );
});

test("plan is registry-driven: every seed source lane appears, no secret dir", () => {
  const plan = plannedNow();
  for (const lane of ["linear", "slack", "mail", "voice-plaud", "cloud-drive", "buzz",
    "hermes", "git", "nas", "pc-activity", "team-files", "run-logs"]) {
    assert.ok(plan.directories.includes(`10_SOURCE_CAPTURE_CATALOG/${lane}/capture-generations`), lane);
    assert.ok(plan.directories.includes(`60_BACKUP_GENERATIONS/${lane}`), lane);
  }
  assert.ok(plan.directories.includes("90_PROJECTIONS/watch-4192"));
  assert.ok(plan.directories.every((dir) => !dir.toLowerCase().includes("secret")));
  assert.equal(plan.registry_snapshot_digest, SNAPSHOT.snapshot_digest);
});

test("Plan 17 documented data spine and materializer plan have exact parity", () => {
  assert.deepEqual(plannedNow().directories, documentedMaterializerDirectories());
});

test("two source rows that collapse to one lane id hold instead of merging", () => {
  const rows = seedRows();
  const mail = rows.find((row) => row.logical_path_id === "source.mail");
  rows.push({
    ...mail,
    logical_path_id: "source.voice-plaud",
    topology_node_refs: [],
    binding_refs: [],
  });
  const snapshot = registrySnapshot(createPathRegistry({ authority: SEED_AUTHORITY, rows }));
  const outcome = planTargetMaterialization({
    registry_snapshot: snapshot,
    approved_empty_materialization_root_ref: ROOT_REF,
  });
  assert.equal(outcome.hold_code, "source_lane_collision");
  assert.equal(outcome.detail, "voice-plaud");
});

test("dry-run creates nothing; apply creates all; replay is idempotent", () => {
  const { containment, root } = freshRoots();
  try {
    const plan = plannedNow();
    const dry = applyTargetMaterialization(plan, {
      root_path: root, containment_root: containment, mode: "dry-run",
    });
    assert.equal(dry.status, "dry_run");
    assert.equal(dry.created.length, plan.directories.length);
    assert.ok(!existsSync(join(root, "00_CATALOG")));

    const applied = applyTargetMaterialization(plan, {
      root_path: root, containment_root: containment, mode: "apply",
    });
    assert.equal(applied.status, "applied");
    assert.equal(applied.created.length, plan.directories.length);
    assert.equal(applied.existing.length, 0);
    assert.equal(applied.payload_moved, 0);
    assert.ok(existsSync(join(root, "10_SOURCE_CAPTURE_CATALOG", "voice-plaud", "receipts")));

    const replay = applyTargetMaterialization(plan, {
      root_path: root, containment_root: containment, mode: "apply",
    });
    assert.equal(replay.status, "applied");
    assert.equal(replay.created.length, 0);
    assert.equal(replay.existing.length, plan.directories.length);
  } finally {
    rmSync(containment, { recursive: true, force: true });
  }
});

test("foreign payload in the root refuses materialization", () => {
  const { containment, root } = freshRoots();
  try {
    writeFileSync(join(root, "notes.txt"), "existing payload");
    const outcome = applyTargetMaterialization(plannedNow(), {
      root_path: root, containment_root: containment, mode: "apply",
    });
    assert.equal(outcome.hold_code, "root_not_empty_foreign_payload");
    assert.ok(!existsSync(join(root, "00_CATALOG")));
  } finally {
    rmSync(containment, { recursive: true, force: true });
  }
});

test("a planned path occupied by a file or reparse point refuses apply", () => {
  const { containment, root } = freshRoots();
  try {
    writeFileSync(join(root, "70_QUARANTINE"), "not a directory");
    const occupied = applyTargetMaterialization(plannedNow(), {
      root_path: root, containment_root: containment, mode: "apply",
    });
    assert.equal(occupied.hold_code, "planned_path_occupied");
    rmSync(join(root, "70_QUARANTINE"));

    let linked = false;
    try {
      mkdirSync(join(containment, "elsewhere"));
      symlinkSync(join(containment, "elsewhere"), join(root, "80_CUSTODY_RECEIPT_INDEX"), "junction");
      linked = true;
    } catch {
      // Symlink/junction creation unavailable on this host: guard covered by
      // the file-occupation branch above.
    }
    if (linked) {
      const reparse = applyTargetMaterialization(plannedNow(), {
        root_path: root, containment_root: containment, mode: "apply",
      });
      assert.equal(reparse.hold_code, "planned_path_occupied");
      assert.match(reparse.detail, /reparse_point/);
    }
  } finally {
    rmSync(containment, { recursive: true, force: true });
  }
});

test("hostile root admission and tampered plans reject", () => {
  const { containment, root } = freshRoots();
  try {
    const outside = applyTargetMaterialization(plannedNow(), {
      root_path: tmpdir(), containment_root: containment, mode: "apply",
    });
    assert.equal(outside.hold_code, "root_admission_rejected");

    const tampered = {
      ...plannedNow(),
      directories: ["00_CATALOG", "../escape"],
    };
    const escape = applyTargetMaterialization(tampered, {
      root_path: root, containment_root: containment, mode: "apply",
    });
    assert.equal(escape.hold_code, "plan_untrusted");

    assert.equal(
      applyTargetMaterialization(plannedNow(), {
        root_path: root, containment_root: containment, mode: "sync",
      }).hold_code,
      "mode_invalid",
    );
  } finally {
    rmSync(containment, { recursive: true, force: true });
  }
});

test("apply and rollback require exact authenticated plan and receipt identities", () => {
  const { containment, root } = freshRoots();
  try {
    const plan = plannedNow();
    const forgedPlan = { ...plan };
    assert.equal(
      applyTargetMaterialization(forgedPlan, {
        root_path: root, containment_root: containment, mode: "apply",
      }).hold_code,
      "plan_untrusted",
    );
    assert.ok(!existsSync(join(root, "00_CATALOG")));

    const applied = applyTargetMaterialization(plan, {
      root_path: root, containment_root: containment, mode: "apply",
    });
    assert.equal(applied.status, "applied");
    const forgedReceipt = {
      ...applied,
      created: ["00_CATALOG"],
    };
    assert.equal(
      rollbackTargetMaterialization(forgedReceipt, {
        root_path: root, containment_root: containment,
      }).hold_code,
      "receipt_untrusted",
    );
    assert.ok(existsSync(join(root, "00_CATALOG")));

    const rollback = rollbackTargetMaterialization(applied, {
      root_path: root, containment_root: containment,
    });
    assert.equal(rollback.status, "rolled_back");
  } finally {
    rmSync(containment, { recursive: true, force: true });
  }
});

test("mid-apply failure retains authenticated recovery evidence and never deletes payload", () => {
  const { containment, root } = freshRoots();
  try {
    writeFileSync(join(root, "70_QUARANTINE"), "foreign payload");
    const held = applyTargetMaterialization(plannedNow(), {
      root_path: root, containment_root: containment, mode: "apply",
    });
    assert.equal(held.hold_code, "planned_path_occupied");
    assert.equal(held.recovery_receipt.status, "recovery_required");
    assert.ok(held.recovery_receipt.created.includes("00_CATALOG"));
    assert.ok(existsSync(join(root, "00_CATALOG")));

    const forgedRecovery = { ...held.recovery_receipt };
    assert.equal(
      rollbackTargetMaterialization(forgedRecovery, {
        root_path: root, containment_root: containment,
      }).hold_code,
      "receipt_untrusted",
    );
    assert.ok(existsSync(join(root, "70_QUARANTINE")));

    const recovered = rollbackTargetMaterialization(held.recovery_receipt, {
      root_path: root, containment_root: containment,
    });
    assert.equal(recovered.status, "rolled_back");
    assert.ok(!existsSync(join(root, "00_CATALOG")));
    assert.ok(existsSync(join(root, "70_QUARANTINE")));
  } finally {
    rmSync(containment, { recursive: true, force: true });
  }
});

test("rollback removes only still-empty created directories and keeps payload", () => {
  const { containment, root } = freshRoots();
  try {
    const plan = plannedNow();
    const applied = applyTargetMaterialization(plan, {
      root_path: root, containment_root: containment, mode: "apply",
    });
    assert.equal(applied.status, "applied");
    const payloadDir = join(root, "70_QUARANTINE");
    writeFileSync(join(payloadDir, "kept.bin"), "payload appeared after apply");

    const rollback = rollbackTargetMaterialization(applied, {
      root_path: root, containment_root: containment,
    });
    assert.equal(rollback.status, "rolled_back");
    assert.ok(rollback.retained.includes("70_QUARANTINE"));
    assert.ok(existsSync(join(payloadDir, "kept.bin")));
    assert.ok(!existsSync(join(root, "00_CATALOG")));
    assert.equal(rollback.removed.length + rollback.retained.length, applied.created.length);

    const otherRoots = freshRoots();
    try {
      const mismatch = rollbackTargetMaterialization(applied, {
        root_path: otherRoots.root, containment_root: otherRoots.containment,
      });
      assert.equal(mismatch.hold_code, "root_commitment_mismatch");
    } finally {
      rmSync(otherRoots.containment, { recursive: true, force: true });
    }
  } finally {
    rmSync(containment, { recursive: true, force: true });
  }
});
