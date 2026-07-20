import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { link, mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  LegacyMailCustodyError,
  manifestDigest,
  materializeLegacyMailCustody,
  validateLegacyMailCustodyBinding,
} from "./legacy_mail_custody_materializer.mjs";

const APPROVAL = "owner-synthetic-legacy-custody-v1";
const CLI = join(import.meta.dirname, "legacy_mail_custody_materializer.mjs");

function sha(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function fixture(t, entries = [
  ["events/mail.jsonl", "normalized body\n"],
  ["attachments/file.bin", "attachment bytes\n"],
]) {
  const root = await mkdtemp(join(tmpdir(), "legacy-mail-custody-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = join(root, "private-source");
  const destination = join(root, "hpp-custody");
  await mkdir(source);
  const files = [];
  for (const [relativeRef, content] of entries) {
    const path = join(source, ...relativeRef.split("/"));
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
    files.push({ relative_ref: relativeRef, sha256: sha(content), size: Buffer.byteLength(content) });
  }
  files.sort((left, right) => left.relative_ref.localeCompare(right.relative_ref, "en"));
  const binding = {
    schema_version: "soulforge.legacy_mail_custody_binding.v1",
    snapshot_id: "private-state-synthetic-v1",
    source_root: source,
    destination_root: destination,
    approval_ref: APPROVAL,
    expected_manifest_sha256: manifestDigest(files),
    files,
  };
  const bindingPath = join(root, "binding.json");
  await writeFile(bindingPath, `${JSON.stringify(binding, null, 2)}\n`);
  return { root, source, destination, binding, bindingPath };
}

async function listAll(root) {
  const output = [];
  async function walk(path, prefix = "") {
    for (const entry of await readdir(path, { withFileTypes: true }).catch(() => [])) {
      const ref = prefix ? `${prefix}/${entry.name}` : entry.name;
      output.push(ref);
      if (entry.isDirectory()) await walk(join(path, entry.name), ref);
    }
  }
  await walk(root);
  return output.sort();
}

test("dry-run verifies explicit files, emits no locators, and writes nothing", async (t) => {
  const f = await fixture(t);
  const before = await listAll(f.root);
  const result = await materializeLegacyMailCustody({ bindingPath: f.bindingPath });
  const after = await listAll(f.root);
  assert.equal(result.status, "ready");
  assert.equal(result.mode, "dry_run");
  assert.equal(result.file_count, 2);
  assert.equal(result.objects_written, 0);
  assert.deepEqual(after, before);
  const rendered = JSON.stringify(result);
  assert.equal(rendered.includes(f.source), false);
  assert.equal(rendered.includes(f.destination), false);
  assert.equal(rendered.includes("mail.jsonl"), false);
});

test("apply publishes content-addressed objects and an immutable committed snapshot", async (t) => {
  const f = await fixture(t);
  const sourceBefore = await Promise.all(f.binding.files.map(async (entry) => readFile(join(f.source, ...entry.relative_ref.split("/")))));
  const result = await materializeLegacyMailCustody({ bindingPath: f.bindingPath, apply: true, approvalRef: APPROVAL });
  assert.equal(result.status, "committed");
  assert.equal(result.objects_written, 2);
  assert.equal(result.snapshot_published, true);
  for (const entry of f.binding.files) {
    const object = await readFile(join(f.destination, "objects", "sha256", entry.sha256.slice(0, 2), `${entry.sha256}.bin`));
    assert.equal(sha(object), entry.sha256);
  }
  const snapshot = join(f.destination, "snapshots", f.binding.snapshot_id);
  assert.equal(JSON.parse(await readFile(join(snapshot, "COMMITTED.json"), "utf8")).snapshot_id, f.binding.snapshot_id);
  const sourceAfter = await Promise.all(f.binding.files.map(async (entry) => readFile(join(f.source, ...entry.relative_ref.split("/")))));
  assert.deepEqual(sourceAfter, sourceBefore);
  assert.equal((await listAll(f.destination)).some((ref) => ref.includes(".partial")), false);
});

test("identical replay is idempotent and does not overwrite", async (t) => {
  const f = await fixture(t);
  await materializeLegacyMailCustody({ bindingPath: f.bindingPath, apply: true, approvalRef: APPROVAL });
  const replay = await materializeLegacyMailCustody({ bindingPath: f.bindingPath, apply: true, approvalRef: APPROVAL });
  assert.equal(replay.objects_written, 0);
  assert.equal(replay.snapshot_published, false);
  assert.equal(replay.overwrite_count, 0);
  assert.equal(replay.delete_count, 0);
});

test("wrong approval and changed source fail with fixed codes", async (t) => {
  const f = await fixture(t);
  await assert.rejects(
    materializeLegacyMailCustody({ bindingPath: f.bindingPath, apply: true, approvalRef: "wrong-approval-ref" }),
    (error) => error instanceof LegacyMailCustodyError && error.code === "legacy_custody_approval_mismatch",
  );
  await writeFile(join(f.source, "events", "mail.jsonl"), "mutated\n");
  await assert.rejects(
    materializeLegacyMailCustody({ bindingPath: f.bindingPath }),
    (error) => error instanceof LegacyMailCustodyError && error.code === "legacy_custody_source_digest_mismatch",
  );
});

test("traversal, duplicate refs, overlap, and manifest drift fail closed", async (t) => {
  const f = await fixture(t);
  const variants = [
    [{ ...f.binding, files: [{ ...f.binding.files[0], relative_ref: "../escape" }] }, "legacy_custody_relative_ref_invalid"],
    [{ ...f.binding, files: [f.binding.files[0], f.binding.files[0]] }, "legacy_custody_relative_ref_duplicate"],
    [{ ...f.binding, files: [f.binding.files[0], { ...f.binding.files[0], relative_ref: f.binding.files[0].relative_ref.toUpperCase() }] }, "legacy_custody_relative_ref_duplicate"],
    [{ ...f.binding, destination_root: join(f.source, "nested") }, "legacy_custody_roots_overlap"],
    [{ ...f.binding, expected_manifest_sha256: "0".repeat(64) }, "legacy_custody_manifest_digest_mismatch"],
  ];
  for (const [value, code] of variants) {
    assert.throws(() => validateLegacyMailCustodyBinding(value), (error) => error.code === code);
  }
});

test("symlinked explicit source and symlinked destination root are rejected", async (t) => {
  const f = await fixture(t, [["plain.bin", "plain"]]);
  const linkPath = join(f.source, "linked.bin");
  try {
    await symlink(join(f.source, "plain.bin"), linkPath, "file");
  } catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP"].includes(error?.code)) return;
    throw error;
  }
  const linkEntry = { relative_ref: "linked.bin", sha256: sha("plain"), size: 5 };
  const sourceLinkBinding = { ...f.binding, files: [linkEntry], expected_manifest_sha256: manifestDigest([linkEntry]) };
  await writeFile(f.bindingPath, JSON.stringify(sourceLinkBinding));
  await assert.rejects(materializeLegacyMailCustody({ bindingPath: f.bindingPath }), (error) => error.code === "legacy_custody_source_not_plain_file");

  const external = join(f.root, "external");
  await mkdir(external);
  await symlink(external, f.destination, "junction");
  await writeFile(f.bindingPath, JSON.stringify(f.binding));
  await assert.rejects(materializeLegacyMailCustody({ bindingPath: f.bindingPath }), (error) => error.code === "legacy_custody_destination_root_unsafe");
});

test("source directory links and hard-linked files are rejected", async (t) => {
  const f = await fixture(t, [["real/plain.bin", "plain"]]);
  const linkedDirectory = join(f.source, "linked-dir");
  try {
    await symlink(join(f.source, "real"), linkedDirectory, "junction");
  } catch (error) {
    if (!["EPERM", "EACCES", "ENOTSUP"].includes(error?.code)) throw error;
  }
  if (await readFile(join(linkedDirectory, "plain.bin")).then(() => true).catch(() => false)) {
    const linkedEntry = { relative_ref: "linked-dir/plain.bin", sha256: sha("plain"), size: 5 };
    const binding = { ...f.binding, files: [linkedEntry], expected_manifest_sha256: manifestDigest([linkedEntry]) };
    await writeFile(f.bindingPath, JSON.stringify(binding));
    await assert.rejects(materializeLegacyMailCustody({ bindingPath: f.bindingPath }), (error) => error.code === "legacy_custody_source_not_plain_file");
  }

  const hardPath = join(f.source, "hard.bin");
  await link(join(f.source, "real", "plain.bin"), hardPath);
  const hardEntry = { relative_ref: "hard.bin", sha256: sha("plain"), size: 5 };
  const hardBinding = { ...f.binding, files: [hardEntry], expected_manifest_sha256: manifestDigest([hardEntry]) };
  await writeFile(f.bindingPath, JSON.stringify(hardBinding));
  await assert.rejects(materializeLegacyMailCustody({ bindingPath: f.bindingPath }), (error) => error.code === "legacy_custody_source_not_plain_file");
});

test("a junction in a missing destination chain is rejected before any external directory is created", async (t) => {
  const f = await fixture(t, [["plain.bin", "plain"]]);
  const external = join(f.root, "external-destination");
  const junction = join(f.root, "destination-junction");
  await mkdir(external);
  try {
    await symlink(external, junction, "junction");
  } catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP"].includes(error?.code)) return;
    throw error;
  }
  const escapedDestination = join(junction, "must-not-exist", "custody");
  const binding = { ...f.binding, destination_root: escapedDestination };
  await writeFile(f.bindingPath, JSON.stringify(binding));
  await assert.rejects(materializeLegacyMailCustody({ bindingPath: f.bindingPath }), (error) => error.code === "legacy_custody_destination_root_unsafe");
  await assert.rejects(
    materializeLegacyMailCustody({ bindingPath: f.bindingPath, apply: true, approvalRef: APPROVAL }),
    (error) => error.code === "legacy_custody_destination_root_unsafe",
  );
  assert.deepEqual(await readdir(external), []);
});

test("junctions in future object or snapshot paths are rejected with zero destination writes", async (t) => {
  for (const kind of ["objects", "snapshots"]) {
    await t.test(kind, async (t) => {
      const f = await fixture(t, [["plain.bin", "plain"]]);
      const external = join(f.root, `external-${kind}`);
      await mkdir(f.destination);
      await mkdir(external);
      const linkPath = kind === "objects"
        ? join(f.destination, "objects")
        : join(f.destination, "snapshots");
      try {
        await symlink(external, linkPath, "junction");
      } catch (error) {
        if (["EPERM", "EACCES", "ENOTSUP"].includes(error?.code)) return;
        throw error;
      }
      await assert.rejects(materializeLegacyMailCustody({ bindingPath: f.bindingPath }), (error) => error.code === "legacy_custody_destination_root_unsafe");
      await assert.rejects(
        materializeLegacyMailCustody({ bindingPath: f.bindingPath, apply: true, approvalRef: APPROVAL }),
        (error) => error.code === "legacy_custody_destination_root_unsafe",
      );
      assert.deepEqual(await readdir(external), []);
      const destinationEntries = await readdir(f.destination);
      assert.deepEqual(destinationEntries, [kind]);
    });
  }
});

test("a corrupt preexisting content-addressed object blocks apply", async (t) => {
  const f = await fixture(t);
  const entry = f.binding.files[0];
  const object = join(f.destination, "objects", "sha256", entry.sha256.slice(0, 2), `${entry.sha256}.bin`);
  await mkdir(dirname(object), { recursive: true });
  await writeFile(object, "corrupt");
  await assert.rejects(materializeLegacyMailCustody({ bindingPath: f.bindingPath }), (error) => error.code === "legacy_custody_destination_conflict");
});

test("a destination race after COMMITTED rolls back only the invocation-owned snapshot", async (t) => {
  const f = await fixture(t, [["plain.bin", "plain"]]);
  const entry = f.binding.files[0];
  const object = join(f.destination, "objects", "sha256", entry.sha256.slice(0, 2), `${entry.sha256}.bin`);
  await assert.rejects(
    materializeLegacyMailCustody({
      bindingPath: f.bindingPath,
      apply: true,
      approvalRef: APPROVAL,
      afterSnapshotPublished: async () => writeFile(object, "raced"),
    }),
    (error) => error.code === "legacy_custody_destination_conflict",
  );
  const committed = join(f.destination, "snapshots", f.binding.snapshot_id, "COMMITTED.json");
  await assert.rejects(readFile(committed), (error) => error.code === "ENOENT");
  assert.equal(await readFile(join(f.source, "plain.bin"), "utf8"), "plain");
});

test("CLI returns sanitized JSON and fixed errors", async (t) => {
  const f = await fixture(t);
  const ok = spawnSync(process.execPath, [CLI, "--binding", f.bindingPath], { encoding: "utf8" });
  assert.equal(ok.status, 0, ok.stderr);
  const rendered = `${ok.stdout}${ok.stderr}`;
  assert.equal(rendered.includes(f.source), false);
  assert.equal(rendered.includes(f.destination), false);
  assert.equal(JSON.parse(ok.stdout).status, "ready");

  const blocked = spawnSync(process.execPath, [CLI, "--binding", f.bindingPath, "--apply", "--approval-ref", "wrong-ref"], { encoding: "utf8" });
  assert.equal(blocked.status, 1);
  assert.deepEqual(JSON.parse(blocked.stderr), {
    schema_version: "soulforge.legacy_mail_custody_materialization_result.v1",
    status: "blocked",
    error_code: "legacy_custody_approval_mismatch",
  });
});
