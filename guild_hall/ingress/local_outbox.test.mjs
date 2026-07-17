import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";
import {
  enqueueLocalOutboxFile,
  LOCAL_OUTBOX_BINDING_SCHEMA,
  loadLocalOutboxBinding,
} from "./local_outbox.mjs";

const execFile = promisify(execFileCallback);
const CLI = fileURLToPath(new URL("./local_outbox_cli.mjs", import.meta.url));

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "local-outbox-"));
  const outboxRoot = join(root, "outbox");
  const sourceRoot = join(root, "sources");
  await mkdir(outboxRoot);
  await mkdir(sourceRoot);
  const lanes = {};
  for (const lane of ["team_files", "structured_pc_work", "run_logs"]) {
    const queueRoot = join(outboxRoot, lane);
    await mkdir(queueRoot);
    await mkdir(join(outboxRoot, "state", "receipts", lane), { recursive: true });
    lanes[lane] = {
      enabled: true,
      queue_root: queueRoot,
      source_owner_ref: `${lane}-test-owner`,
    };
  }
  const bindingPath = join(root, "binding.json");
  await writeFile(bindingPath, `${JSON.stringify({
    schema_version: LOCAL_OUTBOX_BINDING_SCHEMA,
    node_id: "test-node",
    outbox_root: outboxRoot,
    lanes,
  }, null, 2)}\n`);
  return { root, outboxRoot, sourceRoot, bindingPath };
}

async function files(root) {
  const result = [];
  async function walk(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) result.push(path);
    }
  }
  await walk(root);
  return result.sort();
}

test("dry-run writes nothing and apply is immutable/idempotent for all lanes", async () => {
  const f = await fixture();
  try {
    for (const lane of ["team_files", "structured_pc_work", "run_logs"]) {
      const source = join(f.sourceRoot, `${lane}.bin`);
      await writeFile(source, `synthetic-${lane}`);
      const before = await files(f.outboxRoot);
      const dry = await enqueueLocalOutboxFile({
        bindingPath: f.bindingPath,
        lane,
        source,
        occurrenceId: `${lane}-occurrence-1`,
      });
      assert.equal(dry.status, "planned");
      assert.equal(dry.writes_performed, 0);
      assert.deepEqual(await files(f.outboxRoot), before);

      const first = await enqueueLocalOutboxFile({
        bindingPath: f.bindingPath,
        lane,
        source,
        occurrenceId: `${lane}-occurrence-1`,
        apply: true,
      });
      assert.equal(first.status, "enqueued");
      assert.equal(first.writes_performed, 2);
      assert.equal(first.source_deleted, false);
      assert.equal(first.official_history_written, false);

      const second = await enqueueLocalOutboxFile({
        bindingPath: f.bindingPath,
        lane,
        source,
        occurrenceId: `${lane}-occurrence-1`,
        apply: true,
      });
      assert.equal(second.status, "unchanged");
      assert.equal(second.writes_performed, 0);
      assert.equal(await readFile(source, "utf8"), `synthetic-${lane}`);
    }
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("one occurrence id cannot be rebound to different bytes", async () => {
  const f = await fixture();
  try {
    const source = join(f.sourceRoot, "event.json");
    await writeFile(source, "first");
    await enqueueLocalOutboxFile({
      bindingPath: f.bindingPath,
      lane: "structured_pc_work",
      source,
      occurrenceId: "stable-event-1",
      apply: true,
    });
    await writeFile(source, "second");
    await assert.rejects(
      enqueueLocalOutboxFile({
        bindingPath: f.bindingPath,
        lane: "structured_pc_work",
        source,
        occurrenceId: "stable-event-1",
        apply: true,
      }),
      /local_outbox_occurrence_conflict/,
    );
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("binding rejects queue escape and source cannot come from the outbox", async () => {
  const f = await fixture();
  try {
    const raw = JSON.parse(await readFile(f.bindingPath, "utf8"));
    raw.lanes.team_files.queue_root = f.sourceRoot;
    await writeFile(f.bindingPath, `${JSON.stringify(raw)}\n`);
    await assert.rejects(loadLocalOutboxBinding(f.bindingPath), /invalid_local_outbox_binding/);

    raw.lanes.team_files.queue_root = join(f.outboxRoot, "team_files");
    await writeFile(f.bindingPath, `${JSON.stringify(raw)}\n`);
    const source = join(f.outboxRoot, "team_files", "already.payload");
    await writeFile(source, "unsafe-overlap");
    await assert.rejects(
      enqueueLocalOutboxFile({
        bindingPath: f.bindingPath,
        lane: "team_files",
        source,
        occurrenceId: "overlap-1",
        apply: true,
      }),
      /local_outbox_source_overlap/,
    );
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("CLI output contains safe metadata and never echoes private paths", async () => {
  const f = await fixture();
  try {
    const source = join(f.sourceRoot, "private-name.bin");
    await writeFile(source, "cli");
    const { stdout, stderr } = await execFile(process.execPath, [
      CLI,
      "--config", f.bindingPath,
      "--lane", "team_files",
      "--source", source,
      "--occurrence-id", "cli-occurrence-1",
    ], { windowsHide: true });
    assert.equal(stderr, "");
    assert.equal(stdout.includes(f.root), false);
    assert.equal(stdout.includes("private-name.bin"), false);
    const parsed = JSON.parse(stdout);
    assert.equal(parsed.status, "planned");
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});
