import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { buildPack, nodeTestRunner } from "../tools/build_pack.mjs";
import { buildReleaseTestEnv, createReleaseWorkspace, exerciseReleaseLifecycle, releaseSmokeVerdict, verifyReleaseGeneration } from "../tools/release_rehearsal.mjs";
import { listReleaseStaticAssets } from "../tools/release_static_assets.mjs";

const clock = () => "2026-09-07T00:00:00.000Z";
const temp = (t) => { const dir = mkdtempSync(join(tmpdir(), "release-rehearsal-test-")); t.after(() => rmSync(dir, { recursive: true, force: true })); return dir; };

test("isolated Windows profile gives real PowerShell native AppData paths inside the fixture", { skip: process.platform !== "win32" }, (t) => {
  const root = temp(t);
  const env = buildReleaseTestEnv(root);
  const cwd = join(root, "immutable-payload"); mkdirSync(cwd);
  const exe = join(env.SystemRoot ?? env.WINDIR, "System32/WindowsPowerShell/v1.0/powershell.exe");
  const command = "ConvertTo-Json -Compress -InputObject @([Environment]::GetFolderPath('LocalApplicationData'), [Environment]::GetFolderPath('ApplicationData'))";
  const result = spawnSync(exe, ["-NoProfile", "-NonInteractive", "-Command", command], { cwd, env, encoding: "utf8", windowsHide: true, timeout: 15_000 });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), [env.LOCALAPPDATA, env.APPDATA], "empty native paths would make PowerShell cache writes relative to the immutable payload cwd");
});

test("release static closure includes tracked public SVGs and excludes ignored or force-added private skins", (t) => {
  const root = temp(t);
  const git = (...args) => { const out = spawnSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true }); assert.equal(out.status, 0, out.stderr); };
  git("init", "--quiet");
  mkdirSync(join(root, "static/skins/regions"), { recursive: true });
  mkdirSync(join(root, "static/skins/dungeons"), { recursive: true });
  writeFileSync(join(root, ".gitignore"), "static/skins/dungeons/\nstatic/skins/main.*\n");
  writeFileSync(join(root, "static/skins/regions/forest.svg"), "<svg/>\n");
  writeFileSync(join(root, "static/skins/dungeons/scratch.png"), "synthetic private scratch\n");
  writeFileSync(join(root, "static/skins/main.png"), "synthetic private main\n");
  writeFileSync(join(root, "static/untracked-scratch.txt"), "untracked\n");
  git("add", ".gitignore", "static/skins/regions/forest.svg");
  assert.deepEqual(listReleaseStaticAssets(root, "static"), ["static/skins/regions/forest.svg"]);
  git("add", "--force", "static/skins/dungeons/scratch.png", "static/skins/main.png");
  assert.deepEqual(listReleaseStaticAssets(root, "static"), ["static/skins/regions/forest.svg"]);
  assert.equal(readFileSync(join(root, "static/skins/dungeons/scratch.png"), "utf8"), "synthetic private scratch\n");
});

test("default real runner observes complete TAP totals and refuses silent skips as release coverage", (t) => {
  const root = temp(t);
  writeFileSync(join(root, "pass.test.mjs"), 'import test from "node:test"; test("real pass", () => {});\n');
  writeFileSync(join(root, "skip.test.mjs"), 'import test from "node:test"; test("unavailable fixture", {skip: "explicit unsupported host"}, () => {});\n');
  writeFileSync(join(root, "fail.test.mjs"), 'import test from "node:test"; test("real failure", () => {throw new Error("fixture failure")});\n');
  const pass = nodeTestRunner(["pass.test.mjs"], { cwd: root });
  assert.deepEqual(pass.counts, { tests: 1, pass: 1, fail: 0, cancelled: 0, skipped: 0, todo: 0 });
  assert.equal(releaseSmokeVerdict(pass).ok, true);
  const skipped = nodeTestRunner(["pass.test.mjs", "skip.test.mjs"], { cwd: root });
  assert.equal(skipped.ok, true, "process success alone is weaker than complete coverage");
  assert.equal(skipped.counts.skipped, 1);
  assert.match(skipped.skipped_tests[0], /explicit unsupported host/);
  assert.equal(releaseSmokeVerdict(skipped).reason, "unsupported_declared_smoke_coverage");
  assert.equal(releaseSmokeVerdict(pass, [{path: "missing", reason: "unsupported"}]).ok, false);
  assert.equal(releaseSmokeVerdict({ok: true}).reason, "test_totals_unobserved");
  assert.equal(releaseSmokeVerdict(nodeTestRunner(["fail.test.mjs"], { cwd: root })).ok, false);
});

test("work directory refuses occupied, repository, operational and junction paths before writing", (t) => {
  const root = temp(t); const repo = join(root, "repo"); mkdirSync(repo);
  const sentinel = join(repo, "sentinel"); writeFileSync(sentinel, "untouched\n");
  assert.throws(() => createReleaseWorkspace({ rootDir: repo, workDir: repo }), { code: "rehearsal_workdir_unsafe" });
  assert.throws(() => createReleaseWorkspace({ rootDir: repo, workDir: join(repo, "new") }), { code: "rehearsal_workdir_unsafe" });
  assert.throws(() => createReleaseWorkspace({ rootDir: repo, workDir: root }), { code: "rehearsal_workdir_not_fresh" });
  assert.throws(() => createReleaseWorkspace({ rootDir: repo, workDir: join(root, "install", "new") }), { code: "rehearsal_workdir_unsafe" });
  const link = join(root, "alias"); symlinkSync(repo, link, "junction");
  assert.throws(() => createReleaseWorkspace({ rootDir: repo, workDir: join(link, "new") }), { code: "rehearsal_parent_unsafe" });
  assert.equal(readFileSync(sentinel, "utf8"), "untouched\n");
  assert.equal(createReleaseWorkspace({ rootDir: repo, workDir: join(root, "fresh") }), join(root, "fresh"));
});

test("real-built fixture upgrades distinct bytes, reads retained hashes and restores damaged bytes inside its fresh root", (t) => {
  const root = temp(t); const source = join(root, "source"); mkdirSync(source);
  const work = join(root, "work"); mkdirSync(work);
  writeFileSync(join(root, "outside-sentinel"), "unchanged\n");
  writeFileSync(join(source, "core.mjs"), "export const value = 1;\n");
  writeFileSync(join(source, "core.test.mjs"), 'import test from "node:test"; import assert from "node:assert/strict"; import {value} from "./core.mjs"; test("fixture", () => assert.equal(value, 1));\n');
  const specPath = join(source, "spec.json");
  writeFileSync(specPath, JSON.stringify({
    schema: "soulforge.deployment_pack_spec.v0", pack_id: "tool_workshop_pack", version: "0.1.0",
    host_effect_policy: { reboot: "forbidden", driver_change: "forbidden", system_update: "forbidden", service_restart_scope: "pack_services_only" },
    content_roles: { resource_lease_helper: ["core.mjs"], validators: ["core.test.mjs"] }, smoke_test_entries: ["core.test.mjs"],
    release_notes_ref: "release_notes.tool_workshop_pack.v0_1_0", install_manual_ref: "manual.install.tool_workshop_pack", upgrade_manual_ref: "manual.upgrade.tool_workshop_pack", rollback_manual_ref: "manual.rollback.tool_workshop_pack", support_owner_ref: "owner.platform_support", secret_refs: [],
  }));
  const built = buildPack(specPath, { rootDir: source, outDir: join(work, "build"), clock });
  const result = exerciseReleaseLifecycle({ packDir: built.packDir, workDir: work, clock });
  assert.equal(result.ok, true);
  assert.notEqual(result.prior.pack_digest, result.current.pack_digest);
  assert.equal(result.retained_after_upgrade.pack_digest, result.prior.pack_digest);
  assert.equal(result.retained_after_rollback.pack_digest, result.current.pack_digest);
  assert.equal(result.restored.pack_digest, result.backup.pack_digest);
  assert.equal(result.damaged_previous_retained_without_manifest, true);
  assert.equal(verifyReleaseGeneration(built.packDir).pack_digest, built.manifest.pack_digest);
  assert.equal(readFileSync(join(source, "core.mjs"), "utf8"), "export const value = 1;\n");
  assert.equal(readFileSync(join(root, "outside-sentinel"), "utf8"), "unchanged\n");
  assert.throws(() => exerciseReleaseLifecycle({ packDir: built.packDir, workDir: source, clock }), { code: "rehearsal_lifecycle_path_escapes" });
  assert.throws(() => exerciseReleaseLifecycle({ packDir: built.packDir, workDir: work, clock }), { code: "rehearsal_lifecycle_target_not_fresh" });
  writeFileSync(join(built.packDir, "payload", "unexpected-cache"), "synthetic cache\n");
  assert.throws(() => verifyReleaseGeneration(built.packDir), (error) => error.code === "rehearsal_generation_mismatch"
    && error.mismatches.includes("unmanifested:unexpected-cache"), "cache pollution remains an explicit integrity failure");
});
