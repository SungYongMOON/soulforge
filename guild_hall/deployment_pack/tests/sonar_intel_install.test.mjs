import assert from "node:assert/strict";
import test from "node:test";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { createServer as netServer } from "node:net";
import { once } from "node:events";
import { buildPack, installPack, runInstalledSmoke } from "../tools/build_pack.mjs";
import { backupPack, upgradePack, rollbackPack, restorePack } from "../tools/pack_lifecycle.mjs";
import { readPackGeneration } from "../src/pack_sbom_artifact.mjs";
import { SONAR_APP, sonarIntelPackMembers } from "../tools/sonar_intel_pack_members.mjs";
import { openStore } from "../../../ui-workspace/apps/sonar-intel/src/store.mjs";
import { asOf, records } from "../../../ui-workspace/apps/sonar-intel/test/fixtures/analysis_sample.mjs";
import { validateModuleManifest } from "../../module_operability/src/manifest_schema.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const BRIDGE = "ui-workspace/apps/dev-erp/test/sonar_intel_pack_smoke.test.mjs";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const clock = () => "2026-09-08T00:00:00.000Z";
// Reviewed matches are URL credential property checks and explicit negative
// synthetic fixtures. These immutable pins fail if their bytes change.
const REVIEW = {
  "src/analysis/index.mjs": "0c20b3c24b3894d3ddce5b94e72d71b31260c9df694dd553b0996109568194e6",
  "src/collectors/diagnostics.mjs": "5584a315990df2660f12ef493bb24950bbbd283563ff81c31de2552609b322af",
  "src/collectors/papers.mjs": "3a9270de9bc61ed85fc0fa19b004946968f8620e97741fe22cc3c43c07534097",
  "test/analysis.test.mjs": "953c38be6c378917debc53be10bad6112e3a7b3520f70739f4a5b9529572ce69",
  "test/papers.test.mjs": "6de822f33de6f1686782812b6b48db50bf8523efb00e6c85754509295dc50322",
};
function componentSpec(rootDir, version = "0.1.0") {
  const roles = sonarIntelPackMembers(rootDir);
  roles.validators = [...roles.validators, BRIDGE];
  return {
    schema: "soulforge.deployment_pack_spec.v0", pack_id: "hpp_server_pack", version,
    host_effect_policy: { reboot: "forbidden", driver_change: "forbidden", system_update: "forbidden", service_restart_scope: "pack_services_only" },
    content_roles: roles, smoke_test_entries: ["test/sonar_intel_pack_smoke.test.mjs"],
    test_cwd: "ui-workspace/apps/dev-erp", test_concurrency: 1,
    release_notes_ref: "release_notes.hpp_sonar_component.synthetic",
    install_manual_ref: "manual.install.hpp_server_pack", upgrade_manual_ref: "manual.upgrade.hpp_server_pack",
    rollback_manual_ref: "manual.rollback.hpp_server_pack", support_owner_ref: "owner.platform_support", secret_refs: [],
    content_scan_reviewed_files: Object.entries(REVIEW).map(([file, sha256]) => ({ path: `${SONAR_APP}/${file}`, sha256 })),
  };
}
// This isolated component fixture is not the full HPP release spec. Recompute
// its source closure through the test-only emitter seam, never by echoing the
// spec under audit; the real builder CLI still uses the catalog's HPP emitter.
function componentEmitter(version = "0.1.0") {
  return (emitterPath, { rootDir }) => {
    assert.equal(emitterPath, "guild_hall/deployment_pack/tools/emit_hpp_spec.mjs");
    return { ok: true, emitted: JSON.stringify(componentSpec(rootDir, version)), summary: "synthetic component closure recomputed" };
  };
}
function env() {
  const result = { ...process.env };
  for (const key of Object.keys(result)) if (/^(SONAR_|NODE_OPTIONS$)/.test(key)) delete result[key];
  return { ...result, SONAR_INTEL_NETWORK: "0" };
}
function cli(app, entry, args = []) {
  return spawnSync(process.execPath, ["--max-old-space-size=192", path.join(app, entry), ...args], { encoding: "utf8", timeout: 10000, windowsHide: true, env: env() });
}
async function readServer(app, dataDir) {
  const child = spawn(process.execPath, [path.join(app, "server.mjs"), "--data-dir", dataDir, "--port", "0"], { windowsHide: true, env: env(), stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "", stderr = "";
  child.stdout.on("data", (part) => { stdout += part; });
  child.stderr.on("data", (part) => { stderr += part; });
  const exited = once(child, "exit");
  let base;
  try {
    const until = Date.now() + 5000;
    while (Date.now() < until && child.exitCode === null) {
      base = stdout.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
      if (base) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.ok(base, `loopback server must start: ${stderr}`);
    const get = async (route) => { const response = await fetch(base + route); assert.equal(response.status, 200); return response.json(); };
    const html = await fetch(base).then((response) => response.text());
    assert.match(html, /id="evidence-detail"/);
    const status = await get("/api/status"), analysis = await get("/api/analysis"), signals = await get("/api/signals");
    let relation = null, evidence = null;
    if (analysis.corpusDigest) {
      relation = await get("/api/relations?keyword=sas&days=14&min=1");
      const id = relation.edges[0]?.evidenceIds[0];
      assert.ok(id);
      evidence = await get(`/api/evidence?id=${id}`);
      assert.equal(evidence.corpusDigest, analysis.corpusDigest);
    }
    assert.equal((await fetch(base + "/api/status", { method: "POST" })).status, 405);
    return { status, analysis, signals, relation, evidence };
  } finally {
    if (child.exitCode === null) child.kill("SIGTERM");
    await Promise.race([exited, new Promise((_, reject) => setTimeout(() => reject(new Error("server_stop_timeout")), 5000).unref())]);
    if (base) {
      const probe = netServer(); probe.listen(Number(new URL(base).port), "127.0.0.1"); await once(probe, "listening");
      await new Promise((resolve) => probe.close(resolve));
    }
  }
}

test("HPP sonar component installs and preserves external data through CLI/HTTP and code/data recovery", { timeout: 120000 }, async () => {
  const temp = mkdtempSync(path.join(tmpdir(), "sonar-installed-proof-"));
  const sourceApp = path.join(ROOT, SONAR_APP), target = path.join(temp, "installed");
  const dataDir = path.join(temp, "working-data");
  let receipt;
  try {
    assert.deepEqual(validateModuleManifest(JSON.parse(readFileSync(path.join(sourceApp, "module.manifest.json")))), { ok: true, problems: [] });
    const spec = componentSpec(ROOT), specPath = path.join(temp, "sonar-component.spec.json");
    writeFileSync(specPath, JSON.stringify(spec));
    const built = buildPack(specPath, { rootDir: ROOT, outDir: path.join(temp, "build"), clock, emitter: componentEmitter() });
    assert.deepEqual(built.manifest.files.map((file) => file.path).sort(), [...new Set(Object.values(spec.content_roles).flat())].sort());
    const installed = installPack({ packDir: built.packDir, targetDir: target, clock });
    const app = path.join(installed.payloadTarget, SONAR_APP);
    assert.ok(existsSync(path.join(app, "config/sources.json")));
    assert.ok(existsSync(path.join(app, "tools/data_recovery.mjs")));
    const smoke = runInstalledSmoke({ payloadDir: installed.payloadTarget, entries: spec.smoke_test_entries, testCwd: spec.test_cwd, concurrency: 1, clock });
    assert.equal(smoke.ok, true, smoke.summary);
    const writer = await openStore({ dataDir, backend: "jsonl" });
    records.forEach((record) => writer.upsertItem(record)); writer.close();
    const core = hash(readFileSync(path.join(dataDir, "intel.jsonl")));
    const sourceAnalysis = cli(sourceApp, "tools/analyze_once.mjs", ["--data-dir", dataDir, "--as-of", asOf]);
    assert.equal(sourceAnalysis.status, 0, sourceAnalysis.stderr);
    const beforeAnalysis = readFileSync(path.join(dataDir, "analysis.json"));
    const installedAnalysis = cli(app, "tools/analyze_once.mjs", ["--data-dir", dataDir, "--as-of", asOf]);
    assert.equal(installedAnalysis.status, 0, installedAnalysis.stderr);
    assert.equal(installedAnalysis.stdout, sourceAnalysis.stdout);
    assert.ok(readFileSync(path.join(dataDir, "analysis.json")).equals(beforeAnalysis));
    const sourceRead = await readServer(sourceApp, dataDir), installedRead = await readServer(app, dataDir);
    assert.deepEqual(installedRead, sourceRead);
    assert.equal(installedRead.signals.count, records.length);
    assert.ok(installedRead.status.sourceContracts.every((contract) => contract.account.state === "unknown"));
    const missing = path.join(temp, "missing-data");
    assert.deepEqual(await readServer(sourceApp, missing), await readServer(app, missing));
    assert.equal(existsSync(missing), false);
    for (const entry of ["server.mjs", "tools/collect_once.mjs", "tools/analyze_once.mjs", "tools/export_snapshot.mjs"]) {
      for (const invalid of ["relative", path.join(temp, "_workspaces/forbidden"), ""]) {
        const a = cli(sourceApp, entry, ["--data-dir", invalid]);
        const b = cli(app, entry, ["--data-dir", invalid]);
        assert.equal(a.status, 1); assert.equal(b.status, a.status); assert.equal(b.stderr, a.stderr);
      }
      assert.match(cli(app, entry, ["--data-dir", installed.payloadTarget]).stderr, /runtime_data_overlap/);
    }
    assert.equal(hash(readFileSync(path.join(dataDir, "intel.jsonl"))), core);
    readPackGeneration({ packDir: target });
    // Policy-file absence has the same fail-closed semantics in isolated
    // source-shaped and installed-shaped copies; no tracked file is removed.
    const missingPolicies = [path.join(temp, "source-missing-policy"), path.join(temp, "installed-missing-policy/payload")];
    for (const root of missingPolicies) {
      cpSync(installed.payloadTarget, root, { recursive: true });
      rmSync(path.join(root, SONAR_APP, "config/sources.json"));
    }
    for (const entry of ["server.mjs", "tools/analyze_once.mjs"]) {
      const results = missingPolicies.map((root) => cli(path.join(root, SONAR_APP), entry, ["--data-dir", dataDir, "--port", "0", "--as-of", asOf]));
      assert.equal(results[0].status, 1); assert.equal(results[1].status, 1);
      assert.equal(results[0].stderr, results[1].stderr); assert.match(results[0].stderr, /ENOENT/);
    }
    const backupResult = cli(app, "tools/data_recovery.mjs", ["backup", "--data-dir", dataDir, "--backup-dir", path.join(temp, "data-backup")]);
    assert.equal(backupResult.status, 0, backupResult.stderr);
    const restoredData = path.join(temp, "restored-data");
    const restored = cli(app, "tools/data_recovery.mjs", ["restore", "--backup-dir", path.join(temp, "data-backup"), "--data-dir", restoredData]);
    assert.equal(restored.status, 0, restored.stderr);
    assert.equal(hash(readFileSync(path.join(restoredData, "intel.jsonl"))), core);
    assert.deepEqual(await readServer(app, restoredData), installedRead);
    assert.match(cli(app, "tools/collect_once.mjs", ["--data-dir", restoredData]).stderr, /collection_reconciliation_required/);
    const codeBackup = path.join(temp, "code-backup"); backupPack({ targetDir: target, backupDir: codeBackup, clock });
    const nextRoot = path.join(temp, "next-source");
    cpSync(installed.payloadTarget, nextRoot, { recursive: true });
    const packagePath = path.join(nextRoot, SONAR_APP, "package.json");
    const pkg = JSON.parse(readFileSync(packagePath)); pkg.version = "0.1.1"; writeFileSync(packagePath, JSON.stringify(pkg));
    const nextSpec = componentSpec(nextRoot, "0.1.1"), nextSpecPath = path.join(temp, "next.spec.json");
    writeFileSync(nextSpecPath, JSON.stringify(nextSpec));
    const next = buildPack(nextSpecPath, { rootDir: nextRoot, outDir: path.join(temp, "build-next"), clock, emitter: componentEmitter("0.1.1") });
    assert.notEqual(next.manifest.pack_digest, built.manifest.pack_digest);
    upgradePack({ packDir: next.packDir, targetDir: target, clock });
    assert.equal(readPackGeneration({ packDir: target }).manifest.version, "0.1.1");
    assert.deepEqual(await readServer(app, dataDir), installedRead);
    rollbackPack({ targetDir: target, clock });
    assert.equal(readPackGeneration({ packDir: target }).manifest.pack_digest, built.manifest.pack_digest);
    writeFileSync(path.join(app, "static/index.html"), "synthetic damaged payload");
    assert.throws(() => readPackGeneration({ packDir: target }));
    restorePack({ backupDir: codeBackup, targetDir: target, clock });
    assert.equal(readPackGeneration({ packDir: target }).manifest.pack_digest, built.manifest.pack_digest);
    assert.deepEqual(await readServer(app, dataDir), installedRead);
    assert.equal(hash(readFileSync(path.join(dataDir, "intel.jsonl"))), core);
    receipt = { ok: true, scope: "isolated_hpp_sonar_component_not_full_hpp_release", pack_digest: built.manifest.pack_digest, next_pack_digest: next.manifest.pack_digest, files: built.manifest.files.length,
      payload_unchanged_after_execution: true, source_installed_parity: true, code_lifecycle_readback: true, data_restore_readback: true,
      fixture_records: records.length, core_sha256: core, corpus_digest: installedRead.analysis.corpusDigest,
      external_collection_calls: 0, model_calls: 0, operational_services_changed: 0, manual_runtime_start_required: true };
    writeFileSync(path.join(temp, "sonar-install.receipt.json"), JSON.stringify(receipt, null, 2));
    if (process.env.SONAR_PACK_PROOF_KEEP === "1") console.log(JSON.stringify({ fixture_root: temp, receipt }));
  } finally {
    if (process.env.SONAR_PACK_PROOF_KEEP !== "1" || !receipt) rmSync(temp, { recursive: true, force: true });
  }
});
