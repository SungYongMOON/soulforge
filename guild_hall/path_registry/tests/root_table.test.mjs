// The table that turns a root class into a place on this host. Every root here is
// a fresh temp directory; no real estate path appears in this file.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { PHYSICAL_ROOT_CLASSES } from "../src/path_registry_core.mjs";
import { ROOT_TABLE_SCHEMA, physicalRootFor, readRootTable } from "../src/root_table.mjs";

const sha = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

function freshRoot(name) {
  const root = mkdtempSync(join(tmpdir(), `pr-root-${name}-`));
  return root;
}

function tableFile(roots, { schema = ROOT_TABLE_SCHEMA } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "pr-table-"));
  const path = join(dir, "estate_roots.json");
  const bytes = Buffer.from(`${JSON.stringify({ schema_version: schema, roots })}\n`);
  writeFileSync(path, bytes);
  return { path, sha256: sha(bytes), dir };
}

test("an admitted table answers by alias and never by guessing", () => {
  const data = freshRoot("data"), control = freshRoot("control");
  const { path, sha256 } = tableFile({ data_root: data, control_root: control });
  const table = readRootTable({ tablePath: path, expectedSha256: sha256 });
  assert.equal(table.schema_version, ROOT_TABLE_SCHEMA);
  assert.equal(table.table_sha256, sha256);
  assert.deepEqual(table.aliases, ["control_root", "data_root"]);
  assert.equal(physicalRootFor(table, "data_root"), data);
  // An alias nobody bound is refused, not resolved to a sibling or a default.
  assert.throws(() => physicalRootFor(table, "runtime_root"), /root_table_alias_not_bound/u);
  assert.throws(() => physicalRootFor(table, "not_a_class"), /root_table_alias_not_bound/u);
});

test("the vocabulary is the registry's, so a table cannot invent a root class", () => {
  const root = freshRoot("x");
  const { path, sha256 } = tableFile({ made_up_root: root });
  assert.throws(() => readRootTable({ tablePath: path, expectedSha256: sha256 }), /root_table_alias_unknown/u);
  // Every class the registry declares is spellable; the table just need not bind them all.
  for (const alias of PHYSICAL_ROOT_CLASSES) {
    const one = tableFile({ [alias]: freshRoot("each") });
    const table = readRootTable({ tablePath: one.path, expectedSha256: one.sha256 });
    assert.deepEqual(table.aliases, [alias]);
  }
});

test("the table is pinned, because it is what locates the estate", () => {
  const data = freshRoot("data");
  const { path, sha256 } = tableFile({ data_root: data });
  assert.throws(() => readRootTable({ tablePath: path }), /root_table_pin_required/u);
  assert.throws(() => readRootTable({ tablePath: path, expectedSha256: sha(Buffer.from("other")) }),
    /root_table_pin_mismatch/u);
  // Changed underneath a caller that pinned it: refused, not silently followed.
  writeFileSync(path, `${JSON.stringify({ schema_version: ROOT_TABLE_SCHEMA, roots: { data_root: freshRoot("moved") } })}\n`);
  assert.throws(() => readRootTable({ tablePath: path, expectedSha256: sha256 }), /root_table_pin_mismatch/u);
});

test("only an absolute path may enter, and only a plain directory may be a root", () => {
  const data = freshRoot("data");
  assert.throws(() => readRootTable({ tablePath: "estate_roots.json", expectedSha256: sha(Buffer.from("x")) }),
    /root_table_path_not_absolute/u);
  const relative = tableFile({ data_root: "Soulforge-data" });
  assert.throws(() => readRootTable({ tablePath: relative.path, expectedSha256: relative.sha256 }),
    /root_table_value_not_absolute/u);
  const absent = tableFile({ data_root: join(data, "does-not-exist") });
  assert.throws(() => readRootTable({ tablePath: absent.path, expectedSha256: absent.sha256 }),
    /root_table_root_unavailable/u);
  const file = join(data, "a-file");
  writeFileSync(file, "x");
  const notDir = tableFile({ data_root: file });
  assert.throws(() => readRootTable({ tablePath: notDir.path, expectedSha256: notDir.sha256 }),
    /root_table_root_not_a_plain_directory/u);
});

test("a link standing in for a root is refused rather than followed", (t) => {
  const real = freshRoot("real"), holder = freshRoot("holder");
  const link = join(holder, "data-link");
  try { symlinkSync(real, link, "junction"); }
  catch { return t.skip("this host does not allow creating a junction"); }
  const { path, sha256 } = tableFile({ data_root: link });
  // The whole point of pinning a root is that it is that directory, not whatever
  // a link points at today.
  assert.throws(() => readRootTable({ tablePath: path, expectedSha256: sha256 }),
    /root_table_root_not_a_plain_directory|root_table_root_not_canonical/u);
  rmSync(link, { recursive: true, force: true });
});

test("an address has one meaning or none: roots may not repeat or nest", () => {
  const data = freshRoot("data");
  const twice = tableFile({ data_root: data, control_root: data });
  assert.throws(() => readRootTable({ tablePath: twice.path, expectedSha256: twice.sha256 }),
    /root_table_roots_not_distinct/u);
  const inner = join(data, "inside");
  mkdirSync(inner);
  const nested = tableFile({ data_root: data, control_root: inner });
  assert.throws(() => readRootTable({ tablePath: nested.path, expectedSha256: nested.sha256 }),
    /root_table_roots_nested/u);
});

test("a table that is not one is refused rather than half-read", () => {
  const data = freshRoot("data");
  for (const roots of [{}, [], null, "data_root"]) {
    const bad = tableFile(roots);
    assert.throws(() => readRootTable({ tablePath: bad.path, expectedSha256: bad.sha256 }), /root_table_invalid/u);
  }
  const wrongSchema = tableFile({ data_root: data }, { schema: "soulforge.something_else.v0" });
  assert.throws(() => readRootTable({ tablePath: wrongSchema.path, expectedSha256: wrongSchema.sha256 }),
    /root_table_invalid/u);
  const dir = mkdtempSync(join(tmpdir(), "pr-table-bad-"));
  const notJson = join(dir, "estate_roots.json");
  writeFileSync(notJson, "{ not json");
  assert.throws(() => readRootTable({ tablePath: notJson, expectedSha256: sha(Buffer.from("{ not json")) }),
    /root_table_unreadable/u);
});
