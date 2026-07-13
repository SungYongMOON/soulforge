import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  linkSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  CodexTurnProjectionError,
  materializeCodexTurnProjection,
  openVerifiedCodexTurnProjection,
  publicCodexTurnProjectionReceipt,
  removeCodexTurnProjection,
} from "../src/codex_turn_projection.mjs";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const TEMP_ROOT = realpathSync(tmpdir());

function attachment(path, bytes, overrides = {}) {
  return {
    attachment_id: "att_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    name: "selected.txt",
    size: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    type: "localFile",
    source_path: path,
    ...overrides,
  };
}

function projectionInput(root, attachments) {
  return {
    projectionRoot: join(root, "projection-root"),
    itemId: "ITEM-001",
    projectId: "PROJECT-TEST",
    workspaceId: "p23_043_team",
    workspaceRevision: HASH_A,
    workspaceRootFingerprint: HASH_B,
    attachments,
  };
}

function assertCode(code) {
  return (error) => {
    assert.ok(error instanceof CodexTurnProjectionError);
    assert.equal(error.code, code);
    assert.equal(error.message, code);
    return true;
  };
}

test("projection copies only selected attachments and exposes no source path", async (t) => {
  const root = mkdtempSync(join(TEMP_ROOT, "dev-erp-projection-selected-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const sourceRoot = join(root, "source-payloads", "ITEM-001");
  mkdirSync(sourceRoot, { recursive: true });
  const selectedBytes = Buffer.from("selected evidence", "utf8");
  const siblingBytes = Buffer.from("unselected private sibling", "utf8");
  const selectedPath = join(sourceRoot, "selected.txt");
  const siblingPath = join(sourceRoot, "sibling.txt");
  writeFileSync(selectedPath, selectedBytes);
  writeFileSync(siblingPath, siblingBytes);

  const input = projectionInput(root, [attachment(selectedPath, selectedBytes)]);
  const descriptor = await materializeCodexTurnProjection(input);
  assert.match(descriptor.revision, /^[a-f0-9]{64}$/);
  assert.equal(descriptor.file_count, 1);
  assert.equal(descriptor.total_bytes, selectedBytes.length);

  const receipt = publicCodexTurnProjectionReceipt(descriptor);
  const publicJson = JSON.stringify({ descriptor, receipt });
  assert.equal(publicJson.includes(root), false);
  assert.equal(publicJson.includes(sourceRoot), false);
  assert.equal(publicJson.includes(selectedPath), false);
  assert.equal(publicJson.includes(siblingPath), false);

  const opened = await openVerifiedCodexTurnProjection({
    projectionRoot: input.projectionRoot,
    descriptor,
  });
  assert.equal(JSON.stringify(opened).includes(root), false);
  assert.equal(Object.keys(opened).includes("internal"), false);
  assert.equal(opened.manifest.files.length, 1);
  assert.equal(opened.manifest.files[0].attachment_id, "att_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
  assert.equal(readFileSync(opened.internal.files[0].path, "utf8"), selectedBytes.toString("utf8"));
  assert.equal(readdirSync(join(opened.internal.path, "attachments")).length, 1);
  assert.equal(readFileSync(siblingPath, "utf8"), siblingBytes.toString("utf8"));

  const removed = await removeCodexTurnProjection({
    projectionRoot: input.projectionRoot,
    descriptor,
  });
  assert.equal(removed.removed, true);
  assert.equal(existsSync(opened.internal.path), false);
  assert.equal(existsSync(selectedPath), true);
  assert.equal(existsSync(siblingPath), true);
  assert.deepEqual(readdirSync(input.projectionRoot), []);
});

test("projected file or manifest tampering fails closed and is not cleaned up", async (t) => {
  const root = mkdtempSync(join(TEMP_ROOT, "dev-erp-projection-tamper-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = join(root, "source.txt");
  const bytes = Buffer.from("original", "utf8");
  writeFileSync(source, bytes);
  const input = projectionInput(root, [attachment(source, bytes)]);

  const descriptor = await materializeCodexTurnProjection(input);
  const opened = await openVerifiedCodexTurnProjection({ projectionRoot: input.projectionRoot, descriptor });
  chmodSync(opened.internal.files[0].path, 0o600);
  writeFileSync(opened.internal.files[0].path, Buffer.from("tampered", "utf8"));
  await assert.rejects(
    openVerifiedCodexTurnProjection({ projectionRoot: input.projectionRoot, descriptor }),
    assertCode("projection_file_hash_mismatch"),
  );
  await assert.rejects(
    removeCodexTurnProjection({ projectionRoot: input.projectionRoot, descriptor }),
    assertCode("projection_file_hash_mismatch"),
  );
  assert.equal(existsSync(opened.internal.path), true);
  await assert.rejects(
    materializeCodexTurnProjection(input),
    assertCode("projection_root_not_empty"),
  );

  const secondRoot = mkdtempSync(join(TEMP_ROOT, "dev-erp-projection-manifest-tamper-"));
  t.after(() => rmSync(secondRoot, { recursive: true, force: true }));
  const secondSource = join(secondRoot, "source.txt");
  writeFileSync(secondSource, bytes);
  const secondInput = projectionInput(secondRoot, [attachment(secondSource, bytes)]);
  const secondDescriptor = await materializeCodexTurnProjection(secondInput);
  const secondOpened = await openVerifiedCodexTurnProjection({
    projectionRoot: secondInput.projectionRoot,
    descriptor: secondDescriptor,
  });
  const secondManifest = join(secondOpened.internal.path, ".projection-manifest.json");
  chmodSync(secondManifest, 0o600);
  writeFileSync(secondManifest, "{}\n", "utf8");
  await assert.rejects(
    openVerifiedCodexTurnProjection({ projectionRoot: secondInput.projectionRoot, descriptor: secondDescriptor }),
    assertCode("projection_manifest_hash_mismatch"),
  );
});

test("one projection is globally active and any stale sibling blocks open, cleanup, and replacement", async (t) => {
  const root = mkdtempSync(join(TEMP_ROOT, "dev-erp-projection-single-active-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = join(root, "source.txt");
  const bytes = Buffer.from("single active", "utf8");
  writeFileSync(source, bytes);
  const input = projectionInput(root, [attachment(source, bytes)]);
  const descriptor = await materializeCodexTurnProjection(input);
  assert.deepEqual(readdirSync(input.projectionRoot), [input.projectId]);
  assert.deepEqual(readdirSync(join(input.projectionRoot, input.projectId)), [descriptor.revision]);

  const siblingRevision = "c".repeat(64);
  mkdirSync(join(input.projectionRoot, input.projectId, siblingRevision));
  await assert.rejects(
    openVerifiedCodexTurnProjection({ projectionRoot: input.projectionRoot, descriptor }),
    assertCode("projection_project_not_single_revision"),
  );
  await assert.rejects(
    removeCodexTurnProjection({ projectionRoot: input.projectionRoot, descriptor }),
    assertCode("projection_project_not_single_revision"),
  );
  await assert.rejects(
    materializeCodexTurnProjection(input),
    assertCode("projection_root_not_empty"),
  );
  assert.equal(existsSync(join(input.projectionRoot, ".projection-operation-lock")), false);

  const staleRoot = join(root, "stale-root");
  mkdirSync(staleRoot);
  writeFileSync(join(staleRoot, "stale-entry"), "stale", "utf8");
  await assert.rejects(
    materializeCodexTurnProjection({ ...input, projectionRoot: staleRoot }),
    assertCode("projection_root_not_empty"),
  );
  assert.deepEqual(readdirSync(staleRoot), ["stale-entry"]);
});

test("source symlinks and hardlinks are rejected before publication", async (t) => {
  const root = mkdtempSync(join(TEMP_ROOT, "dev-erp-projection-links-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const realSource = join(root, "real.txt");
  const bytes = Buffer.from("linked", "utf8");
  writeFileSync(realSource, bytes);

  const hardlink = join(root, "hardlink.txt");
  linkSync(realSource, hardlink);
  await assert.rejects(
    materializeCodexTurnProjection(projectionInput(root, [attachment(hardlink, bytes)])),
    assertCode("projection_source_link_unsafe"),
  );

  rmSync(hardlink, { force: true });
  const symlink = join(root, "symlink.txt");
  try {
    symlinkSync(realSource, symlink, "file");
  } catch (error) {
    t.diagnostic(`symlink fixture unavailable: ${error.code || "unknown"}`);
    return;
  }
  await assert.rejects(
    materializeCodexTurnProjection(projectionInput(root, [attachment(symlink, bytes)])),
    assertCode("projection_source_link_unsafe"),
  );
});

test("an ancestor junction cannot retarget the projection root", async (t) => {
  const root = mkdtempSync(join(TEMP_ROOT, "dev-erp-projection-ancestor-link-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const realWorkerRoot = join(root, "real-worker-root");
  const linkedWorkerRoot = join(root, "linked-worker-root");
  mkdirSync(realWorkerRoot);
  try {
    symlinkSync(realWorkerRoot, linkedWorkerRoot, process.platform === "win32" ? "junction" : "dir");
  } catch (error) {
    t.diagnostic(`directory-link fixture unavailable: ${error.code || "unknown"}`);
    return;
  }
  const source = join(root, "source.txt");
  const bytes = Buffer.from("must not cross ancestor link", "utf8");
  writeFileSync(source, bytes);
  const input = {
    ...projectionInput(root, [attachment(source, bytes)]),
    projectionRoot: join(linkedWorkerRoot, "turn-projections"),
  };

  await assert.rejects(
    materializeCodexTurnProjection(input),
    assertCode("projection_root_invalid"),
  );
  assert.equal(existsSync(join(realWorkerRoot, "turn-projections")), false);
});

test("source content changes or stale verified metadata never publish a projection", async (t) => {
  const root = mkdtempSync(join(TEMP_ROOT, "dev-erp-projection-source-change-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = join(root, "source.bin");
  const before = Buffer.alloc(8 * 1024 * 1024, 0x31);
  writeFileSync(source, before);
  const input = projectionInput(root, [attachment(source, before, { name: "source.bin" })]);
  const pending = materializeCodexTurnProjection(input);
  writeFileSync(source, Buffer.alloc(before.length, 0x32));
  await assert.rejects(pending, (error) => {
    assert.ok(error instanceof CodexTurnProjectionError);
    assert.ok(new Set([
      "projection_source_changed",
      "projection_source_hash_mismatch",
      "projection_source_size_mismatch",
    ]).has(error.code), error.code);
    return true;
  });
  const projectRoot = join(input.projectionRoot, input.projectId);
  if (existsSync(projectRoot)) {
    assert.equal(readdirSync(projectRoot).some((name) => /^[a-f0-9]{64}$/.test(name)), false);
  }
});

test("traversal-like binding and attachment names are rejected without path-bearing errors", async (t) => {
  const root = mkdtempSync(join(TEMP_ROOT, "dev-erp-projection-traversal-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = join(root, "source.txt");
  const bytes = Buffer.from("fixture", "utf8");
  writeFileSync(source, bytes);

  await assert.rejects(
    materializeCodexTurnProjection({
      ...projectionInput(root, [attachment(source, bytes)]),
      projectId: "../outside",
    }),
    assertCode("projection_project_id_invalid"),
  );
  await assert.rejects(
    materializeCodexTurnProjection(projectionInput(root, [attachment(source, bytes, { name: "../outside.txt" })])),
    assertCode("projection_attachment_name_invalid"),
  );
  assert.equal(existsSync(join(root, "outside")), false);
});
