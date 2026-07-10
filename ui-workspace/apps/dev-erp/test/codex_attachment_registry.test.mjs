import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { link, mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, win32 } from "node:path";
import test from "node:test";

import {
  AttachmentRegistryError,
  CODEX_ATTACHMENT_MANIFEST_SCHEMA,
  appendAttachmentManifestRecord,
  createAttachmentManifest,
  createAttachmentManifestRecord,
  createOpaqueAttachmentId,
  parseAttachmentManifest,
  parseAttachmentManifestJson,
  parseClientAttachmentReference,
  publicAttachmentDescriptor,
  resolveAttachment,
  validateAttachmentId,
} from "../src/codex_attachment_registry.mjs";

const ITEM_A = "ITEM-001";
const ITEM_B = "ITEM-002";
const WINDOWS_DRIVE = ["C", ":"].join("");

function syntheticWindowsPath(...segments) {
  return win32.join(`${WINDOWS_DRIVE}${win32.sep}`, ...segments);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function validRecord(overrides = {}) {
  const bytes = Buffer.from("verified attachment bytes");
  return {
    attachment_id: createOpaqueAttachmentId(),
    item_id: ITEM_A,
    name: "evidence.txt",
    stored_name: "evidence.txt",
    size: bytes.length,
    sha256: sha256(bytes),
    type: "localFile",
    ...overrides,
  };
}

function expectRegistryError(fn, code) {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof AttachmentRegistryError);
    assert.equal(error.code, code);
    assert.equal(error.message, code);
    return true;
  });
}

test("opaque IDs and item-bound manifest records are strict and path-free", () => {
  const firstId = createOpaqueAttachmentId();
  const secondId = createOpaqueAttachmentId();
  assert.match(firstId, /^att_[A-Za-z0-9_-]{32}$/);
  assert.notEqual(firstId, secondId);
  assert.equal(validateAttachmentId(firstId), firstId);
  for (const invalid of ["", "att_1", "ITEM-001", "../file", "att_C:/absolute/path___________"]) {
    expectRegistryError(() => validateAttachmentId(invalid), "attachment_id_invalid");
  }

  const record = createAttachmentManifestRecord(validRecord({ attachment_id: firstId }));
  const manifest = createAttachmentManifest({ item_id: ITEM_A, attachments: [record] });
  assert.equal(manifest.schema, CODEX_ATTACHMENT_MANIFEST_SCHEMA);
  assert.equal(manifest.item_id, ITEM_A);
  assert.equal(manifest.attachments[0].item_id, ITEM_A);
  assert.equal(JSON.stringify(manifest).includes("path"), false);

  const descriptor = publicAttachmentDescriptor(record);
  assert.deepEqual(Object.keys(descriptor).sort(), ["attachment_id", "name", "size", "type"]);
  assert.deepEqual(descriptor, {
    attachment_id: firstId,
    name: "evidence.txt",
    size: record.size,
    type: "localFile",
  });
  assert.equal(JSON.stringify(descriptor).includes(record.sha256), false);
  assert.equal(JSON.stringify(descriptor).includes(record.item_id), false);
});

test("manifest parsing rejects cross-item records, duplicates, unknown fields, and malformed JSON", () => {
  const record = validRecord();
  const privatePath = syntheticWindowsPath("private");
  const malformedJson = `{raw-path:${privatePath}}`;
  expectRegistryError(() => parseAttachmentManifest({
    schema: CODEX_ATTACHMENT_MANIFEST_SCHEMA,
    item_id: ITEM_B,
    attachments: [record],
  }), "attachment_manifest_item_mismatch");

  expectRegistryError(() => parseAttachmentManifest({
    schema: CODEX_ATTACHMENT_MANIFEST_SCHEMA,
    item_id: ITEM_A,
    attachments: [record, record],
  }), "attachment_manifest_duplicate_id");

  expectRegistryError(() => parseAttachmentManifest({
    schema: CODEX_ATTACHMENT_MANIFEST_SCHEMA,
    item_id: ITEM_A,
    attachments: [{ ...record, path: syntheticWindowsPath("private", "file.txt") }],
  }), "attachment_record_unknown_field");

  expectRegistryError(() => parseAttachmentManifest({
    schema: CODEX_ATTACHMENT_MANIFEST_SCHEMA,
    item_id: ITEM_A,
    attachments: [record],
    root: privatePath,
  }), "attachment_manifest_unknown_field");

  expectRegistryError(
    () => parseAttachmentManifestJson(malformedJson),
    "attachment_manifest_json_invalid",
  );
  try {
    parseAttachmentManifestJson(malformedJson);
  } catch (error) {
    assert.equal(String(error).includes("private"), false);
  }

  const manifest = createAttachmentManifest({ item_id: ITEM_A, attachments: [record] });
  expectRegistryError(
    () => appendAttachmentManifestRecord(manifest, record),
    "attachment_manifest_duplicate_id",
  );
  expectRegistryError(
    () => appendAttachmentManifestRecord(manifest, validRecord({ item_id: ITEM_B })),
    "attachment_manifest_item_mismatch",
  );
});

test("stored names are basenames under both Windows and POSIX semantics", () => {
  const invalidNames = [
    "../evidence.txt",
    "..\\evidence.txt",
    "folder/evidence.txt",
    "folder\\evidence.txt",
    syntheticWindowsPath("evidence.txt"),
    ["", "tmp", "evidence.txt"].join("/"),
    "evidence.txt:stream",
    "CON.txt",
    "NUL",
    "evidence.txt.",
    " evidence.txt",
    "evidence.txt ",
  ];
  for (const stored_name of invalidNames) {
    expectRegistryError(
      () => createAttachmentManifestRecord(validRecord({ stored_name })),
      "attachment_stored_name_invalid",
    );
  }
  expectRegistryError(
    () => createAttachmentManifestRecord(validRecord({ name: syntheticWindowsPath("Users", "owner", "secret.txt") })),
    "attachment_name_invalid",
  );
});

test("client references round-trip public fields but reject every raw path field", () => {
  const record = createAttachmentManifestRecord(validRecord());
  const descriptor = publicAttachmentDescriptor(record);
  assert.deepEqual(parseClientAttachmentReference(descriptor), {
    ok: true,
    attachment_id: record.attachment_id,
    claims: { name: record.name, size: record.size, type: record.type },
  });
  assert.deepEqual(parseClientAttachmentReference({ attachment_id: record.attachment_id }), {
    ok: true,
    attachment_id: record.attachment_id,
    claims: {},
  });

  for (const key of ["path", "Path", "absolute_path", "local_path", "stored_name", "cwd", "root", "workspace_root"]) {
    const reference = { attachment_id: record.attachment_id, [key]: syntheticWindowsPath("private", "file.txt") };
    assert.deepEqual(parseClientAttachmentReference(reference), {
      ok: false,
      error: "client_attachment_path_forbidden",
    });
  }
  assert.deepEqual(parseClientAttachmentReference({
    attachment_id: record.attachment_id,
    sha256: record.sha256,
  }), { ok: false, error: "attachment_reference_unknown_field" });
});

test("real file resolution verifies item binding, size, hash, and keeps internal paths out of JSON", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "dev-erp-attachment-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const itemDir = join(root, ITEM_A);
  await mkdir(itemDir, { recursive: true });
  const bytes = Buffer.from("verified attachment bytes");
  const filePath = join(itemDir, "evidence.txt");
  await writeFile(filePath, bytes);
  const record = createAttachmentManifestRecord(validRecord({
    size: bytes.length,
    sha256: sha256(bytes),
  }));
  const manifest = createAttachmentManifest({ item_id: ITEM_A, attachments: [record] });
  const descriptor = publicAttachmentDescriptor(record);

  const resolved = await resolveAttachment({
    itemDir,
    itemId: ITEM_A,
    manifest,
    reference: descriptor,
  });
  assert.equal(resolved.ok, true);
  assert.deepEqual(resolved.attachment, descriptor);
  assert.equal(resolved.internal.path, await realpath(filePath));
  assert.equal(resolved.internal.sha256, record.sha256);
  assert.equal(Object.keys(resolved).includes("internal"), false);
  const serialized = JSON.stringify(resolved);
  assert.equal(serialized.includes(root), false);
  assert.equal(serialized.includes(record.sha256), false);
  assert.deepEqual(JSON.parse(serialized), { ok: true, attachment: descriptor });

  const unknown = await resolveAttachment({
    itemDir,
    itemId: ITEM_A,
    manifest,
    reference: { attachment_id: createOpaqueAttachmentId() },
  });
  assert.deepEqual(unknown, { ok: false, error: "attachment_unknown" });

  const crossItem = await resolveAttachment({
    itemDir,
    itemId: ITEM_B,
    manifest,
    reference: { attachment_id: record.attachment_id },
  });
  assert.deepEqual(crossItem, { ok: false, error: "attachment_cross_item_forbidden" });

  const forgedMetadata = await resolveAttachment({
    itemDir,
    itemId: ITEM_A,
    manifest,
    reference: { ...descriptor, name: "forged.txt" },
  });
  assert.deepEqual(forgedMetadata, { ok: false, error: "attachment_client_metadata_mismatch" });
});

test("same-size content tampering fails hash verification and size tampering fails closed", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "dev-erp-attachment-tamper-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const itemDir = join(root, ITEM_A);
  await mkdir(itemDir, { recursive: true });
  const original = Buffer.from("original-content");
  const filePath = join(itemDir, "evidence.txt");
  await writeFile(filePath, original);
  const record = createAttachmentManifestRecord(validRecord({
    size: original.length,
    sha256: sha256(original),
  }));
  const manifest = createAttachmentManifest({ item_id: ITEM_A, attachments: [record] });
  const reference = { attachment_id: record.attachment_id };

  await writeFile(filePath, Buffer.from("tampered-content"));
  assert.equal((await resolveAttachment({ itemDir, itemId: ITEM_A, manifest, reference })).error, "attachment_hash_mismatch");

  await writeFile(filePath, Buffer.from("short"));
  assert.equal((await resolveAttachment({ itemDir, itemId: ITEM_A, manifest, reference })).error, "attachment_size_mismatch");
});

test("hardlinked attachment targets fail closed before content is supplied", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "dev-erp-attachment-hardlink-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const itemDir = join(root, ITEM_A);
  await mkdir(itemDir, { recursive: true });
  const outside = join(root, "outside.txt");
  const bytes = Buffer.from("verified attachment bytes");
  await writeFile(outside, bytes);
  await link(outside, join(itemDir, "evidence.txt"));
  const record = createAttachmentManifestRecord(validRecord({
    size: bytes.length,
    sha256: sha256(bytes),
  }));
  const manifest = createAttachmentManifest({ item_id: ITEM_A, attachments: [record] });
  assert.deepEqual(await resolveAttachment({
    itemDir,
    itemId: ITEM_A,
    manifest,
    reference: { attachment_id: record.attachment_id },
  }), { ok: false, error: "attachment_link_unsafe" });
});

function directoryStat() {
  return { isDirectory: () => true };
}

test("Windows and POSIX realpath containment reject symlink or junction escapes", async () => {
  const record = createAttachmentManifestRecord(validRecord());
  const manifest = createAttachmentManifest({ item_id: ITEM_A, attachments: [record] });
  const reference = { attachment_id: record.attachment_id };

  const windowsRoot = syntheticWindowsPath("Team", "ItemA");
  const windowsCandidate = win32.join(windowsRoot, record.stored_name);
  const windowsFs = {
    realpath: async (value) => {
      if (win32.normalize(value).toLowerCase() === win32.normalize(windowsRoot).toLowerCase()) return windowsRoot;
      if (win32.normalize(value).toLowerCase() === win32.normalize(windowsCandidate).toLowerCase()) {
        return syntheticWindowsPath("Outside", "evidence.txt");
      }
      throw new Error("ENOENT");
    },
    stat: async () => directoryStat(),
    lstat: async () => { throw new Error("must not lstat escaped target"); },
    open: async () => { throw new Error("must not open escaped target"); },
  };
  assert.deepEqual(await resolveAttachment({
    itemDir: windowsRoot,
    itemId: ITEM_A,
    manifest,
    reference,
    fs: windowsFs,
  }), { ok: false, error: "attachment_symlink_escape" });

  const posixRoot = "/srv/items/item-a";
  const posixFs = {
    realpath: async (value) => value === posixRoot ? posixRoot : "/srv/items/item-ab/evidence.txt",
    stat: async () => directoryStat(),
    lstat: async () => { throw new Error("must not lstat escaped target"); },
    open: async () => { throw new Error("must not open escaped target"); },
  };
  assert.deepEqual(await resolveAttachment({
    itemDir: posixRoot,
    itemId: ITEM_A,
    manifest,
    reference,
    fs: posixFs,
  }), { ok: false, error: "attachment_symlink_escape" });
});

function fakeReadHandle(bytes, stat) {
  let offset = 0;
  return {
    stat: async () => stat,
    read: async (buffer, bufferOffset, length) => {
      const bytesRead = Math.min(length, bytes.length - offset);
      if (bytesRead > 0) bytes.copy(buffer, bufferOffset, offset, offset + bytesRead);
      offset += bytesRead;
      return { bytesRead, buffer };
    },
    close: async () => {},
  };
}

test("Windows containment is case-insensitive while POSIX containment remains case-sensitive", async () => {
  const bytes = Buffer.from("verified attachment bytes");
  const record = createAttachmentManifestRecord(validRecord({ size: bytes.length, sha256: sha256(bytes) }));
  const manifest = createAttachmentManifest({ item_id: ITEM_A, attachments: [record] });
  const reference = { attachment_id: record.attachment_id };
  const fileStat = { size: bytes.length, dev: 1, ino: 2, nlink: 1, mtimeMs: 10, isFile: () => true };

  const windowsRoot = syntheticWindowsPath("Team", "ItemA");
  const windowsCandidate = win32.join(windowsRoot, record.stored_name);
  const realWindowsRoot = syntheticWindowsPath("team", "itema").replace(/^C/, "c");
  const realWindowsTarget = syntheticWindowsPath("TEAM", "ITEMA", "EVIDENCE.TXT");
  const windowsFs = {
    realpath: async (value) => {
      if (win32.normalize(value).toLowerCase() === win32.normalize(windowsRoot).toLowerCase()) return realWindowsRoot;
      if (win32.normalize(value).toLowerCase() === win32.normalize(windowsCandidate).toLowerCase()) return realWindowsTarget;
      throw new Error("ENOENT");
    },
    stat: async (value) => win32.normalize(value).toLowerCase() === win32.normalize(realWindowsRoot).toLowerCase()
      ? directoryStat()
      : fileStat,
    lstat: async () => fileStat,
    open: async () => fakeReadHandle(bytes, fileStat),
  };
  const windowsResult = await resolveAttachment({
    itemDir: windowsRoot,
    itemId: ITEM_A,
    manifest,
    reference,
    fs: windowsFs,
  });
  assert.equal(windowsResult.ok, true);
  assert.equal(windowsResult.internal.path, realWindowsTarget);

  const posixRoot = "/srv/ItemA";
  const posixFs = {
    realpath: async (value) => value === posixRoot ? "/srv/itema" : "/srv/ITEMA/evidence.txt",
    stat: async () => directoryStat(),
    lstat: async () => { throw new Error("must not lstat case-mismatched path"); },
    open: async () => { throw new Error("must not open case-mismatched path"); },
  };
  assert.deepEqual(await resolveAttachment({
    itemDir: posixRoot,
    itemId: ITEM_A,
    manifest,
    reference,
    fs: posixFs,
  }), { ok: false, error: "attachment_symlink_escape" });
});
