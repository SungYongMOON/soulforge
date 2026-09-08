import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, linkSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { APP_ROOT, externalDirectory, resolveDataDirectory } from "../src/runtime_paths.mjs";
import { openStore } from "../src/store.mjs";
import { backupData, restoreData } from "../src/data_recovery.mjs";

test("restored CORE pins its backend including a SQLite-disabled runtime", async (t) => {
  const temp = mkdtempSync(path.join(tmpdir(), "sonar-core-format-"));
  const childEnv = { ...process.env }; delete childEnv.NODE_OPTIONS;
  const hasSqlite = await import("node:sqlite").then(() => true, () => false);
  try {
    for (const backend of ["sqlite", "jsonl"]) {
      await t.test(`${backend} restore format`, { skip: backend === "sqlite" && !hasSqlite }, async () => {
      const original = path.join(temp, `${backend}-original`), restored = path.join(temp, `${backend}-restored`);
      const writer = await openStore({ dataDir: original, backend });
      writer.upsertItem({ id: "synthetic", source: "fixture", type: "news" }); writer.close();
      const backupDir = path.join(temp, `${backend}-backup`);
      const backup = await backupData({ dataDir: original, backupDir });
      restoreData({ backupDir, dataDir: restored, expectedManifestSha256: backup.manifestSha256 });
      const before = readFileSync(path.join(restored, backend === "sqlite" ? "intel.db" : "intel.jsonl"));
      for (const readOnly of [true, false]) await assert.rejects(openStore({ dataDir: restored, backend: backend === "sqlite" ? "jsonl" : "sqlite", readOnly }), /core_backend_mismatch/);
      const program = `import {openStore} from ${JSON.stringify(new URL("../src/store.mjs", import.meta.url).href)};
        const results=[];for(const readOnly of [true,false]) {try{const s=await openStore({dataDir:process.argv[1],readOnly});results.push({backend:s.backendName,count:s.countItems()});s.close();}catch(e){results.push({error:e.message});}}console.log(JSON.stringify(results));`;
      const child = spawnSync(process.execPath, ["--no-experimental-sqlite", "--input-type=module", "-e", program, restored], { env: childEnv, encoding: "utf8", windowsHide: true, timeout: 5000 });
      assert.equal(child.status, 0, child.stderr);
      assert.deepEqual(JSON.parse(child.stdout), backend === "sqlite" ? [{ error: "sqlite_backend_unavailable" }, { error: "sqlite_backend_unavailable" }] : [{ backend: "jsonl", count: 1 }, { backend: "jsonl", count: 1 }]);
      assert.ok(readFileSync(path.join(restored, backend === "sqlite" ? "intel.db" : "intel.jsonl")).equals(before));
      assert.deepEqual(readdirSync(restored).sort(), ["collection-disabled-after-restore", backend === "sqlite" ? "intel.db" : "intel.jsonl"]);
      const enabled = await openStore({ dataDir: restored, readOnly: true });
      assert.equal(enabled.backendName, backend); assert.equal(enabled.countItems(), 1); enabled.close();
      });
    }
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test("custom file aliases cannot escape a data root or obtain independent leases on one file", async () => {
  const temp = mkdtempSync(path.join(tmpdir(), "sonar-file-alias-"));
  try {
    const outside = path.join(temp, "outside.jsonl");
    writeFileSync(outside, '{"id":"synthetic","source":"fixture","type":"news"}\n');
    linkSync(outside, path.join(temp, "hardlink.jsonl"));
    const before = readFileSync(outside);
    const roots = [path.join(temp, "safe-a"), path.join(temp, "safe-b")];
    for (const dataDir of roots) {
      for (const option of ["dbFileName", "jsonlFileName"]) {
        for (const alias of ["../outside.jsonl", "..\\outside.jsonl", outside, "nested/intel.db", "intel.db.", "intel.db ", "intel.db:alternate", "INTEL.DB", "", null]) {
          for (const readOnly of [true, false]) await assert.rejects(openStore({ dataDir, backend: "jsonl", readOnly, [option]: alias }), /store_filename_not_canonical/);
          assert.equal(existsSync(dataDir), false, "invalid filename must not create a root or lease");
        }
      }
    }
    assert.ok(readFileSync(outside).equals(before));
    const direct = path.join(temp, "direct"); mkdirSync(direct);
    linkSync(outside, path.join(direct, "intel.jsonl"));
    await assert.rejects(openStore({ dataDir: direct, backend: "jsonl" }), /data_file_link_forbidden/);
    assert.equal(existsSync(path.join(direct, "data-operation.lock")), false);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test("explicit external data location rejects runtime/canonical paths and aliases before writes", async () => {
  const temp = mkdtempSync(path.join(tmpdir(), "sonar-paths-"));
  try {
    for (const input of [undefined, "", "relative", APP_ROOT, path.dirname(APP_ROOT), path.parse(APP_ROOT).root, path.join(temp, "_workmeta/data"), path.join(temp, "_workspaces/data")]) assert.throws(() => externalDirectory(input));
    assert.throws(() => resolveDataDirectory(["--data-dir"], { SONAR_INTEL_DATA_DIR: temp }), /data_dir_required/);
    assert.equal(resolveDataDirectory([], { SONAR_INTEL_DATA_DIR: temp }), temp);
    assert.equal(resolveDataDirectory(["--data-dir", temp], { SONAR_INTEL_DATA_DIR: "invalid" }), temp);
    const alias = path.join(temp, "alias");
    symlinkSync(APP_ROOT, alias, process.platform === "win32" ? "junction" : "dir");
    assert.throws(() => externalDirectory(path.join(alias, "new-data")), /link_forbidden/);
    const file = path.join(temp, "file"); writeFileSync(file, "synthetic");
    assert.throws(() => externalDirectory(file), /not_directory/);
    const missing = path.join(temp, "missing");
    const reader = await openStore({ dataDir: missing, readOnly: true }); reader.close();
    assert.equal(existsSync(missing), false);
    const writer = await openStore({ dataDir: path.join(temp, "core"), backend: "jsonl" });
    writer.upsertItem({ id: "synthetic", source: "fixture", type: "news" });
    await assert.rejects(openStore({ dataDir: path.join(temp, "core"), backend: "jsonl" }), /data_directory_busy/);
    writer.close();
    const reopened = await openStore({ dataDir: path.join(temp, "core") });
    assert.equal(reopened.backendName, "jsonl");
    assert.equal(reopened.countItems(), 1);
    reopened.close();
    assert.equal(existsSync(path.join(temp, "core/intel.db")), false);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test("all CLI entrypoints require external data and restored collection refuses before network", () => {
  const temp = mkdtempSync(path.join(tmpdir(), "sonar-cli-paths-"));
  const env = { ...process.env, SONAR_INTEL_NETWORK: "0", SONAR_INTEL_DATA_DIR: "" };
  try {
    for (const entry of ["server.mjs", "tools/collect_once.mjs", "tools/analyze_once.mjs", "tools/export_snapshot.mjs"]) {
      const invoke = (args) => spawnSync(process.execPath, [path.join(APP_ROOT, entry), ...args], { env, encoding: "utf8", timeout: 5000, windowsHide: true });
      assert.equal(invoke(["--help"]).status, 0);
      assert.equal(invoke([]).status, 1);
      assert.match(invoke(["--data-dir", APP_ROOT]).stderr, /runtime_data_overlap/);
      assert.match(invoke(["--data-dir", "relative"]).stderr, /data_directory_must_be_absolute/);
    }
    const restore = path.join(temp, "restored"); mkdirSync(restore);
    writeFileSync(path.join(restore, "collection-disabled-after-restore"), "");
    const result = spawnSync(process.execPath, [path.join(APP_ROOT, "tools/collect_once.mjs"), "--data-dir", restore], { env, encoding: "utf8", timeout: 5000, windowsHide: true });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /collection_reconciliation_required/);
    assert.equal(existsSync(path.join(restore, "intel.db")), false);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});
