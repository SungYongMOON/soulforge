import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { APP_ROOT, externalDirectory, resolveDataDirectory } from "../src/runtime_paths.mjs";
import { openStore } from "../src/store.mjs";

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
