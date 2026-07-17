import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";
import { stageIngressFile } from "./collector.mjs";
import { parseArgs } from "./cli.mjs";

const execFile = promisify(execFileCallback);
const FIXED_LANES = {
  team_files: {
    manifestLane: "team_files",
    payload: "ingress/team_files",
    incoming: "ingress/team_files/incoming",
    receipt: "state/receipts/team_files",
    checkpoint: "state/checkpoints/team_files",
    quarantine: "quarantine/team_files",
  },
  structured_pc_work: {
    manifestLane: "pc_activity",
    payload: "ingress/pc_activity",
    incoming: "ingress/pc_activity/work_events/incoming",
    receipt: "state/receipts/pc_activity",
    checkpoint: "state/checkpoints/pc_activity",
    quarantine: "quarantine/pc_activity",
  },
  run_logs: {
    manifestLane: "run_logs",
    payload: "ingress/run_logs",
    incoming: "ingress/run_logs/incoming",
    receipt: "state/receipts/run_logs",
    checkpoint: "state/checkpoints/run_logs",
    quarantine: "quarantine/run_logs",
  },
};

async function writeManifest(dataRoot, mutate = (value) => value) {
  const manifest = {
    schema_version: "soulforge.hpp_private_custody.v1",
    custody_role: "hpp_sole_writer",
    cloud_sync_allowed: false,
    remote_direct_disk_access_allowed: false,
    payload_roots: {},
    state_roots: {
      receipts: "state/receipts",
      checkpoints: "state/checkpoints",
    },
    lane_contracts: {},
    classification_policy: "stable_object_identity_with_project_binding_events",
    raw_in_workmeta_allowed: false,
    workspace_or_workmeta_relocation: false,
  };
  for (const config of Object.values(FIXED_LANES)) {
    manifest.payload_roots[config.manifestLane] = config.payload;
    manifest.lane_contracts[config.manifestLane] = {
      payload: config.payload,
      receipt: config.receipt,
      checkpoint: config.checkpoint,
      quarantine: config.quarantine,
    };
  }
  await writeFile(
    join(dataRoot, "storage_manifest.json"),
    `${JSON.stringify(mutate(manifest), null, 2)}\n`,
  );
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "ingress-staging-"));
  const sourceRoot = join(root, "sources");
  const dataRoot = join(root, "data");
  await mkdir(sourceRoot);
  await mkdir(dataRoot);
  await writeManifest(dataRoot);
  return { root, sourceRoot, dataRoot };
}

async function listTree(root) {
  const rows = [];
  async function walk(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      rows.push(relative(root, path).replaceAll("\\", "/"));
      if (entry.isDirectory() && !entry.isSymbolicLink()) await walk(path);
    }
  }
  await walk(root);
  return rows.sort();
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stageOptions(f, lane, source, extra = {}) {
  return {
    lane,
    source,
    dataRoot: f.dataRoot,
    sourceOwnerRef: "synthetic-node-01",
    sourceKey: `synthetic-${lane}-session-01`,
    ...extra,
  };
}

test("all three lanes dry-run with zero writes, then apply idempotently", async (t) => {
  const f = await fixture();
  try {
    for (const [lane, config] of Object.entries(FIXED_LANES)) {
      await t.test(lane, async () => {
        const body = `SYNTHETIC_RAW_SENTINEL_${lane}`;
        const source = join(f.sourceRoot, `${lane}.bin`);
        await writeFile(source, body);
        const before = await listTree(f.dataRoot);
        const dryRun = await stageIngressFile(stageOptions(f, lane, source));
        assert.equal(dryRun.mode, "dry_run");
        assert.equal(dryRun.status, "planned");
        assert.equal(dryRun.writes_performed, 0);
        assert.deepEqual(await listTree(f.dataRoot), before);
        assert.ok(dryRun.storage_ref.startsWith(`${config.incoming}/`));

        const applied = await stageIngressFile(stageOptions(f, lane, source, { apply: true }));
        assert.equal(applied.status, "staged");
        assert.equal(applied.writes_performed, 3);
        assert.equal(await readFile(join(f.dataRoot, ...applied.storage_ref.split("/")), "utf8"), body);
        const receiptText = await readFile(join(f.dataRoot, ...applied.receipt_ref.split("/")), "utf8");
        const checkpointText = await readFile(join(f.dataRoot, ...applied.checkpoint_ref.split("/")), "utf8");
        assert.equal(JSON.parse(receiptText).project_state, "unclassified");
        assert.equal(JSON.parse(checkpointText).project_state, "unclassified");
        assert.equal(JSON.parse(receiptText).source_identity_digest, applied.source_identity_digest);
        assert.equal(JSON.parse(checkpointText).source_identity_digest, applied.source_identity_digest);
        for (const rendered of [JSON.stringify(applied), receiptText, checkpointText]) {
          assert.ok(!rendered.includes(body));
          assert.ok(!rendered.includes(source));
          assert.ok(!rendered.includes(f.dataRoot));
        }

        const rerun = await stageIngressFile(stageOptions(f, lane, source, { apply: true }));
        assert.equal(rerun.status, "unchanged");
        assert.equal(rerun.writes_performed, 0);
      });
    }
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("changed source digest adds an immutable version without replacing the first", async () => {
  const f = await fixture();
  try {
    const source = join(f.sourceRoot, "changing.bin");
    await writeFile(source, "synthetic-version-one");
    const first = await stageIngressFile(stageOptions(f, "team_files", source, { apply: true }));
    await writeFile(source, "synthetic-version-two");
    const second = await stageIngressFile(stageOptions(f, "team_files", source, { apply: true }));
    assert.notEqual(first.sha256, second.sha256);
    assert.equal(first.source_identity_digest, second.source_identity_digest);
    assert.ok(first.receipt_ref.includes(`/${first.source_identity_digest}/`));
    assert.ok(second.receipt_ref.includes(`/${first.source_identity_digest}/`));
    assert.notEqual(first.receipt_ref, second.receipt_ref);
    assert.equal(dirname(first.receipt_ref), dirname(second.receipt_ref));
    assert.equal(dirname(first.checkpoint_ref), dirname(second.checkpoint_ref));
    assert.equal((await readdir(join(f.dataRoot, ...dirname(first.receipt_ref).split("/")))).length, 2);
    assert.equal((await readdir(join(f.dataRoot, ...dirname(first.checkpoint_ref).split("/")))).length, 2);
    assert.equal(await readFile(join(f.dataRoot, ...first.storage_ref.split("/")), "utf8"), "synthetic-version-one");
    assert.equal(await readFile(join(f.dataRoot, ...second.storage_ref.split("/")), "utf8"), "synthetic-version-two");
    assert.equal(await readFile(source, "utf8"), "synthetic-version-two");
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("two provenance identities share one content payload but keep distinct metadata", async () => {
  const f = await fixture();
  try {
    const body = "synthetic-shared-content";
    const sourceA = join(f.sourceRoot, "source-a.bin");
    const sourceB = join(f.sourceRoot, "source-b.bin");
    await writeFile(sourceA, body);
    await writeFile(sourceB, body);
    const first = await stageIngressFile(stageOptions(f, "team_files", sourceA, {
      sourceOwnerRef: "synthetic-node-a",
      sourceKey: "synthetic-session-a",
      apply: true,
    }));
    const second = await stageIngressFile(stageOptions(f, "team_files", sourceB, {
      sourceOwnerRef: "synthetic-node-b",
      sourceKey: "synthetic-session-b",
      apply: true,
    }));

    assert.equal(first.storage_ref, second.storage_ref);
    assert.equal(first.sha256, second.sha256);
    assert.notEqual(first.source_identity_digest, second.source_identity_digest);
    assert.notEqual(first.receipt_ref, second.receipt_ref);
    assert.notEqual(first.checkpoint_ref, second.checkpoint_ref);
    assert.equal(first.writes_performed, 3);
    assert.equal(second.writes_performed, 2);
    const firstReceipt = JSON.parse(await readFile(join(f.dataRoot, ...first.receipt_ref.split("/")), "utf8"));
    const secondReceipt = JSON.parse(await readFile(join(f.dataRoot, ...second.receipt_ref.split("/")), "utf8"));
    assert.equal(firstReceipt.source_owner_ref, "synthetic-node-a");
    assert.equal(firstReceipt.source_key, "synthetic-session-a");
    assert.equal(secondReceipt.source_owner_ref, "synthetic-node-b");
    assert.equal(secondReceipt.source_key, "synthetic-session-b");
    for (const rendered of [JSON.stringify(first), JSON.stringify(second)]) {
      assert.ok(!rendered.includes("synthetic-node-a"));
      assert.ok(!rendered.includes("synthetic-node-b"));
      assert.ok(!rendered.includes("synthetic-session-a"));
      assert.ok(!rendered.includes("synthetic-session-b"));
    }
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("missing or unsafe provenance identifiers reject with zero writes", async () => {
  const f = await fixture();
  try {
    const source = join(f.sourceRoot, "source.bin");
    await writeFile(source, "synthetic");
    const cases = [
      [{ sourceOwnerRef: undefined }, "source_owner_ref_required"],
      [{ sourceKey: undefined }, "source_key_required"],
      [{ sourceOwnerRef: "../node" }, "invalid_source_owner_ref"],
      [{ sourceOwnerRef: "node\\escape" }, "invalid_source_owner_ref"],
      [{ sourceOwnerRef: "node 01" }, "invalid_source_owner_ref"],
      [{ sourceKey: "session/one" }, "invalid_source_key"],
      [{ sourceKey: ".." }, "invalid_source_key"],
      [{ sourceKey: "x".repeat(129) }, "invalid_source_key"],
    ];
    for (const [override, code] of cases) {
      const before = await listTree(f.dataRoot);
      await assert.rejects(
        stageIngressFile(stageOptions(f, "team_files", source, { ...override, apply: true })),
        { code },
      );
      assert.deepEqual(await listTree(f.dataRoot), before);
    }
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("CLI parser requires both opaque provenance identifiers", () => {
  const base = ["--lane", "team_files", "--source", "source.bin", "--data-root", "absolute-data-root"];
  assert.throws(() => parseArgs(base), { code: "missing_required_argument" });
  assert.throws(
    () => parseArgs([...base, "--source-owner-ref", "synthetic-node"]),
    { code: "missing_required_argument" },
  );
  const parsed = parseArgs([
    ...base,
    "--source-owner-ref", "synthetic-node",
    "--source-key", "synthetic-session",
  ]);
  assert.equal(parsed.sourceOwnerRef, "synthetic-node");
  assert.equal(parsed.sourceKey, "synthetic-session");
});

test("absolute data root, lane enum, regular source, and non-overlap are mandatory", async () => {
  const f = await fixture();
  try {
    const source = join(f.sourceRoot, "source.bin");
    await writeFile(source, "synthetic");
    await assert.rejects(
      stageIngressFile(stageOptions(f, "other", source)),
      { code: "invalid_lane" },
    );
    await assert.rejects(
      stageIngressFile(stageOptions(f, "team_files", source, { dataRoot: "relative-data" })),
      { code: "data_root_must_be_absolute" },
    );
    await assert.rejects(
      stageIngressFile(stageOptions(f, "team_files", f.sourceRoot)),
      { code: "source_not_regular_file" },
    );
    const overlapping = join(f.dataRoot, "source.bin");
    await writeFile(overlapping, "synthetic");
    await assert.rejects(
      stageIngressFile(stageOptions(f, "team_files", overlapping)),
      { code: "source_data_root_overlap" },
    );
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("source symlink and destination directory symlink fail closed", async () => {
  const f = await fixture();
  try {
    const source = join(f.sourceRoot, "source.bin");
    const linkedSource = join(f.sourceRoot, "linked-source");
    const linkedSourceTarget = join(f.root, "linked-source-target");
    await writeFile(source, "synthetic");
    await mkdir(linkedSourceTarget);
    await symlink(linkedSourceTarget, linkedSource, process.platform === "win32" ? "junction" : "dir");
    await assert.rejects(
      stageIngressFile(stageOptions(f, "team_files", linkedSource)),
      { code: "unsafe_source" },
    );

    const outside = join(f.root, "outside");
    const incomingParent = join(f.dataRoot, "ingress", "team_files");
    await mkdir(incomingParent, { recursive: true });
    await mkdir(outside);
    await symlink(outside, join(incomingParent, "incoming"), process.platform === "win32" ? "junction" : "dir");
    await assert.rejects(
      stageIngressFile(stageOptions(f, "team_files", source, { apply: true })),
      { code: "unsafe_staging_directory" },
    );
    assert.deepEqual(await readdir(outside), []);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("manifest traversal or lane contract drift is rejected without writes", async () => {
  const f = await fixture();
  try {
    const source = join(f.sourceRoot, "source.bin");
    await writeFile(source, "synthetic");
    await writeManifest(f.dataRoot, (manifest) => {
      manifest.lane_contracts.team_files.payload = "../escape";
      return manifest;
    });
    const before = await listTree(f.dataRoot);
    await assert.rejects(
      stageIngressFile(stageOptions(f, "team_files", source, { apply: true })),
      { code: "invalid_storage_manifest" },
    );
    assert.deepEqual(await listTree(f.dataRoot), before);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("unstable source fails before any final payload, receipt, or checkpoint", async () => {
  const f = await fixture();
  try {
    const source = join(f.sourceRoot, "unstable.bin");
    await writeFile(source, "AAAA");
    await assert.rejects(
      stageIngressFile(stageOptions(f, "structured_pc_work", source, {
        apply: true,
        afterSourceHash: () => writeFile(source, "BBBB"),
      })),
      { code: "source_unstable" },
    );
    assert.deepEqual(await listTree(f.dataRoot), ["storage_manifest.json"]);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("existing payload, receipt, and checkpoint mismatches fail closed", async () => {
  const f = await fixture();
  try {
    const source = join(f.sourceRoot, "source.bin");
    await writeFile(source, "synthetic");
    const staged = await stageIngressFile(stageOptions(f, "run_logs", source, { apply: true }));
    const payloadPath = join(f.dataRoot, ...staged.storage_ref.split("/"));
    const receiptPath = join(f.dataRoot, ...staged.receipt_ref.split("/"));
    const checkpointPath = join(f.dataRoot, ...staged.checkpoint_ref.split("/"));

    await writeFile(payloadPath, "corrupt");
    await assert.rejects(
      stageIngressFile(stageOptions(f, "run_logs", source, { apply: true })),
      { code: "existing_payload_mismatch" },
    );
    await writeFile(payloadPath, "synthetic");

    const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
    await writeFile(receiptPath, JSON.stringify({ ...receipt, unexpected: true }));
    await assert.rejects(
      stageIngressFile(stageOptions(f, "run_logs", source, { apply: true })),
      { code: "existing_receipt_mismatch" },
    );
    await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);

    const checkpoint = JSON.parse(await readFile(checkpointPath, "utf8"));
    await writeFile(checkpointPath, JSON.stringify({ ...checkpoint, complete: false }));
    await assert.rejects(
      stageIngressFile(stageOptions(f, "run_logs", source, { apply: true })),
      { code: "existing_checkpoint_mismatch" },
    );
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("changed physical parent is revalidated before final publication", async () => {
  const f = await fixture();
  try {
    const body = "synthetic-parent-integrity";
    const source = join(f.sourceRoot, "source.bin");
    const contentDigest = digest(body);
    const payloadParent = join(
      f.dataRoot,
      "ingress",
      "team_files",
      "incoming",
      contentDigest.slice(0, 2),
    );
    const outside = join(f.root, "outside-publication");
    await writeFile(source, body);
    await mkdir(outside);
    await assert.rejects(
      stageIngressFile(stageOptions(f, "team_files", source, {
        apply: true,
        testHooks: {
          afterPayloadTempVerified: async () => {
            await rm(payloadParent, { recursive: true, force: true });
            await symlink(outside, payloadParent, process.platform === "win32" ? "junction" : "dir");
          },
        },
      })),
      { code: "unsafe_staging_directory" },
    );
    assert.deepEqual(await readdir(outside), []);
    assert.ok(!(await listTree(f.dataRoot)).some((path) => path.includes(".partial-")));
    assert.equal(await readFile(source, "utf8"), body);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("CLI output contains only safe metadata and never echoes source or payload", async () => {
  const f = await fixture();
  try {
    const source = join(f.sourceRoot, "cli.bin");
    const body = "SYNTHETIC_CLI_RAW_SENTINEL";
    await writeFile(source, body);
    const { stdout, stderr } = await execFile(
      process.execPath,
      [
        join(dirname(fileURLToPath(import.meta.url)), "cli.mjs"),
        "--lane", "team_files",
        "--source", source,
        "--source-owner-ref", "synthetic-cli-node",
        "--source-key", "synthetic-cli-session",
        "--data-root", f.dataRoot,
      ],
      { windowsHide: true },
    );
    assert.equal(stderr, "");
    const result = JSON.parse(stdout);
    assert.equal(result.mode, "dry_run");
    for (const rendered of [stdout, stderr]) {
      assert.ok(!rendered.includes(source));
      assert.ok(!rendered.includes(f.dataRoot));
      assert.ok(!rendered.includes(body));
      assert.ok(!rendered.includes("synthetic-cli-node"));
      assert.ok(!rendered.includes("synthetic-cli-session"));
    }
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("digest-addressed path is derived from SHA-256 only", async () => {
  const f = await fixture();
  try {
    const source = join(f.sourceRoot, "private-name-is-not-retained.txt");
    const body = "synthetic-digest-input";
    await writeFile(source, body);
    const result = await stageIngressFile(stageOptions(f, "team_files", source));
    assert.equal(result.sha256, digest(body));
    assert.equal(result.storage_ref, `ingress/team_files/incoming/${result.sha256.slice(0, 2)}/${result.sha256}`);
    assert.ok(!result.storage_ref.includes("private-name"));
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});
