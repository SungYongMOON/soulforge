import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { locateInstalledPack, readPackSourceIdentity } from "../src/pack_source_identity.mjs";

const sha256 = (text) => createHash("sha256").update(text).digest("hex");
// The builder's exact digest recipe (build_pack.mjs prepare()): compact
// JSON over the path-sorted [{path, sha256, bytes}] entries.
const packDigestOf = (entries) => sha256(JSON.stringify(entries.map(({ path, sha256: digest, bytes }) => ({ path, sha256: digest, bytes }))));

const FILE_A = "ui-workspace/apps/dev-erp/src/a.mjs";
const FILE_B = "ui-workspace/apps/dev-erp/src/b.mjs";
const CONTENT_A = "export const a = 1;\n";
const CONTENT_B = "export const b = 2;\n";

// Synthetic installed-pack layout: <target>/pack.manifest.json + payload/…
function installedFixture({ tamper = null, mutateManifest = null, gitGoverned = false } = {}) {
  const target = mkdtempSync(join(tmpdir(), "dev-erp-packid-"));
  const payload = join(target, "payload");
  const moduleDir = join(payload, "ui-workspace", "apps", "dev-erp", "src");
  mkdirSync(moduleDir, { recursive: true });
  const files = [
    { path: FILE_A, content: CONTENT_A },
    { path: FILE_B, content: CONTENT_B },
  ];
  for (const file of files) {
    const absolute = join(payload, ...file.path.split("/"));
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, file.content);
  }
  const entries = files
    .map((file) => ({ path: file.path, sha256: sha256(file.content), bytes: file.content.length }))
    .sort((left, right) => (left.path < right.path ? -1 : 1));
  const manifest = {
    schema: "soulforge.deployment_pack_manifest.v0",
    pack_id: "hpp_server_pack",
    version: "0.1.0",
    files: entries,
    pack_digest: packDigestOf(entries),
    claim: "pack_build_artifact_not_a_release",
  };
  if (mutateManifest) mutateManifest(manifest);
  writeFileSync(join(target, "pack.manifest.json"), JSON.stringify(manifest, null, 2));
  if (tamper === "edit") writeFileSync(join(payload, ...FILE_A.split("/")), "export const a = 999;\n");
  if (tamper === "delete") writeFileSync(join(payload, ...FILE_A.split("/")), "");
  if (gitGoverned) mkdirSync(join(payload, "ui-workspace", ".git"));
  return { target, payload, moduleDir };
}

test("an installed pack resolves its identity from the delivered manifest with full verification", () => {
  const { payload, moduleDir } = installedFixture();
  const located = locateInstalledPack(moduleDir);
  assert.equal(located.payloadRoot, payload);
  const identity = readPackSourceIdentity(moduleDir, { verify: "all" });
  assert.equal(identity.pack_digest, packDigestOf([
    { path: FILE_A, sha256: sha256(CONTENT_A), bytes: CONTENT_A.length },
    { path: FILE_B, sha256: sha256(CONTENT_B), bytes: CONTENT_B.length },
  ]));
  assert.equal(identity.verified_files, 2);
  assert.equal(identity.pack_id, "hpp_server_pack");
});

test("tamper fails closed: an edited or truncated manifest-listed file throws, never a degraded identity", () => {
  const edited = installedFixture({ tamper: "edit" });
  assert.throws(() => readPackSourceIdentity(edited.moduleDir, { verify: "all" }),
    (error) => error.code === "pack_source_state_tampered");
  const truncated = installedFixture({ tamper: "delete" });
  assert.throws(() => readPackSourceIdentity(truncated.moduleDir, { verify: "all" }),
    (error) => error.code === "pack_source_state_tampered");
});

test("a consistent payload+entry rewrite cannot keep the original digest: pack_digest is recomputed, never echoed", () => {
  const tamperedContent = "export const a = 999;\n";
  const { moduleDir } = installedFixture({
    tamper: "edit",
    mutateManifest: (manifest) => {
      const row = manifest.files.find((entry) => entry.path === FILE_A);
      row.sha256 = sha256(tamperedContent);
      row.bytes = tamperedContent.length;
      // pack_digest deliberately left at the ORIGINAL value: per-file
      // verification alone would pass, so only the digest recompute can
      // catch this decoupling.
    },
  });
  assert.throws(() => readPackSourceIdentity(moduleDir, { verify: "all" }),
    (error) => error.code === "pack_source_manifest_invalid");
});

test("an empty file list is invalid even with a self-consistent digest: verifying nothing attests nothing", () => {
  const { moduleDir } = installedFixture({
    mutateManifest: (manifest) => {
      manifest.files = [];
      manifest.pack_digest = packDigestOf([]);
    },
  });
  assert.throws(() => readPackSourceIdentity(moduleDir, { verify: "all" }),
    (error) => error.code === "pack_source_manifest_invalid");
});

test("manifest entries are shape-checked: a non-string hash is invalid, not a crash", () => {
  const { moduleDir } = installedFixture({
    mutateManifest: (manifest) => {
      manifest.files[0].sha256 = 12345;
    },
  });
  assert.throws(() => readPackSourceIdentity(moduleDir, { verify: "all" }),
    (error) => error.code === "pack_source_manifest_invalid");
});

test("full verification with selfPath demands the caller's own module be manifest-listed", () => {
  const { payload, moduleDir } = installedFixture();
  const identity = readPackSourceIdentity(moduleDir, { verify: "all", selfPath: join(payload, ...FILE_A.split("/")) });
  assert.equal(identity.verified_files, 2);
  assert.throws(() => readPackSourceIdentity(moduleDir, { verify: "all", selfPath: join(payload, "ghost.mjs") }),
    (error) => error.code === "pack_source_self_not_in_manifest");
});

test("a tree governed by a .git ancestor refuses pack identity: git wins wherever git exists", () => {
  const { moduleDir } = installedFixture({ gitGoverned: true });
  assert.equal(locateInstalledPack(moduleDir), null);
  assert.equal(readPackSourceIdentity(moduleDir, { verify: "all" }), null);
});

test("outside any installed pack the reader returns null (callers fall through to their own handling)", () => {
  const plain = mkdtempSync(join(tmpdir(), "dev-erp-noPack-"));
  mkdirSync(join(plain, "some", "deep", "dir"), { recursive: true });
  assert.equal(readPackSourceIdentity(join(plain, "some", "deep", "dir")), null);
});

test("self verification checks exactly one file, matched by exact resolved path — never by suffix", () => {
  const decoyContent = "export const decoy = 3;\n";
  // A payload-ROOT manifest row whose path ("b.mjs") is a suffix of
  // FILE_B's, with NO file on disk: suffix matching would select this row
  // and fail on the missing file; exact-path matching must skip it and
  // verify FILE_B's own row.
  const { payload, moduleDir } = installedFixture({
    mutateManifest: (manifest) => {
      manifest.files = [
        { path: "b.mjs", sha256: sha256(decoyContent), bytes: decoyContent.length },
        ...manifest.files,
      ].sort((left, right) => (left.path < right.path ? -1 : 1));
      manifest.pack_digest = packDigestOf(manifest.files);
    },
  });
  const identity = readPackSourceIdentity(moduleDir, { verify: "self", selfPath: join(payload, ...FILE_B.split("/")) });
  assert.equal(identity.verified_files, 1);
  assert.throws(() => readPackSourceIdentity(moduleDir, { verify: "self", selfPath: join(payload, "ghost.mjs") }),
    (error) => error.code === "pack_source_self_not_in_manifest");
  assert.throws(() => readPackSourceIdentity(moduleDir, { verify: "self" }),
    (error) => error.code === "pack_source_self_path_required");
});
