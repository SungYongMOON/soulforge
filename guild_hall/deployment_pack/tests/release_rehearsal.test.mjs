import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { buildPack, nodeTestRunner } from "../tools/build_pack.mjs";
import { buildReleaseTestEnv, createReleaseWorkspace, exerciseReleaseLifecycle, readWorkshopTestConfig, readIntakeTestConfig, runReleaseRehearsal, releaseSmokeVerdict, verifyReleaseGeneration } from "../tools/release_rehearsal.mjs";
import { listReleaseStaticAssets } from "../tools/release_static_assets.mjs";

const clock = () => "2026-09-07T00:00:00.000Z";
const temp = (t) => { const dir = mkdtempSync(join(tmpdir(), "release-rehearsal-test-")); t.after(() => rmSync(dir, { recursive: true, force: true })); return dir; };

test('company intake dependencies reach real HPP source and installed children only through explicit synthetic config', async t => {
  const root=temp(t), source=join(root,'source'), file=join(root,'intake-test.json');
  const config={pythonExecutable:process.execPath,kitRoot:join(root,'synthetic-kit'),provenance:'synthetic_fixture'};
  writeFileSync(file,JSON.stringify(config));
  const pin=readIntakeTestConfig(file); assert.deepEqual(JSON.parse(pin.bytes),config);
  for(const bad of [{...config,env:{}},{...config,provenance:'released'},{...config,kitRoot:'relative'}]) {
    writeFileSync(file,JSON.stringify(bad));
    assert.throws(()=>readIntakeTestConfig(file),{code:'rehearsal_intake_config_invalid'});
  }
  writeFileSync(file,JSON.stringify(config));
  await assert.rejects(runReleaseRehearsal({packIds:['tool_workshop_pack'],intakeTestConfig:file}),{code:'rehearsal_intake_config_without_pack'});
  mkdirSync(join(source,'guild_hall/deployment_pack/tools'),{recursive:true});
  mkdirSync(join(source,'guild_hall/deployment_pack/packs'),{recursive:true});
  writeFileSync(join(source,'guild_hall/deployment_pack/tools/emit_hpp_spec.mjs'),'// synthetic spec check\n');
  // This case exercises dependency transport, not the real server start gate.
  writeFileSync(join(source,'guild_hall/deployment_pack/tools/prove_start_stop.mjs'),
    'import {writeFileSync} from "node:fs";import {join} from "node:path";writeFileSync(join(process.argv[3],"start_stop.receipt.json"),JSON.stringify({ok:true,synthetic:true}));\n');
  writeFileSync(join(source,'core.mjs'),'export const value=1;\n');
  writeFileSync(join(source,'runtime.test.mjs'),`
    import test from 'node:test'; import assert from 'node:assert/strict';
    test('bounded intake runtime selection',()=>{
      assert.equal(process.env.WORK_INTAKE_TEST_PYTHON,process.execPath);
      assert.equal(process.env.SOULFORGE_SECURE_WORK_TEST_PYTHON,process.execPath);
      assert.equal(process.env.WORK_INTAKE_TEST_KIT_ROOT,${JSON.stringify(config.kitRoot)});
      assert.equal(process.env.SOULFORGE_PPTX_TEST_CONFIG,undefined);
      assert.equal(process.env.SOULFORGE_SECURE_WORK_CONFIG,undefined);
    });
  `);
  writeFileSync(join(source,'guild_hall/deployment_pack/packs/hpp_server_pack.spec.json'),JSON.stringify({
    schema:'soulforge.deployment_pack_spec.v0',pack_id:'hpp_server_pack',version:'0.1.0',
    host_effect_policy:{reboot:'forbidden',driver_change:'forbidden',system_update:'forbidden',service_restart_scope:'pack_services_only'},
    content_roles:{server_modules:['core.mjs'],validators:['runtime.test.mjs']},smoke_test_entries:['runtime.test.mjs'],
    release_notes_ref:'release_notes.hpp_server_pack.v0_1_0',install_manual_ref:'manual.install.hpp_server_pack',
    upgrade_manual_ref:'manual.upgrade.hpp_server_pack',rollback_manual_ref:'manual.rollback.hpp_server_pack',
    support_owner_ref:'owner.platform_support',secret_refs:[],
  }));
  const result=await runReleaseRehearsal({rootDir:source,workDir:join(root,'rehearsal'),packIds:['hpp_server_pack'],intakeTestConfig:file,clock});
  assert.equal(result.ok,true,JSON.stringify(result.receipt.packs.map(p=>({failure:p.failure,stages:p.stages}))));
  const pack=result.receipt.packs[0];
  assert.equal(pack.stages.source_unit.counts.pass,1); assert.equal(pack.stages.installed_smoke.counts.pass,1);
  assert.equal(pack.test_runtime.synthetic_intake_config_sha256,pin.sha256);
});

test("only explicit bounded synthetic workshop runtime fields can reach the tool rehearsal", async t => {
  const root = temp(t), file = join(root, "synthetic-runtime.json");
  const config = {artifactRoot: root, templatePath: join(root, "fixture.pptx"), pythonExecutable: process.execPath, templateProvenance: "synthetic_fixture", templateApprovalRef: "approval.synthetic_template"};
  writeFileSync(file, JSON.stringify(config));
  const admitted = readWorkshopTestConfig(file);
  assert.deepEqual(JSON.parse(admitted.bytes), config); assert.match(admitted.sha256, /^[a-f0-9]{64}$/);
  for (const value of [{...config, liveEnabled: true}, {...config, templateProvenance: "owner_approved"}, {...config, templatePath: "relative"}, {...config, templateApprovalRef: null}]) {
    writeFileSync(file, JSON.stringify(value)); assert.throws(() => readWorkshopTestConfig(file), {code: "rehearsal_workshop_config_invalid"});
  }
  writeFileSync(file, " ".repeat(16 * 1024 + 1));
  assert.throws(() => readWorkshopTestConfig(file), {code: "rehearsal_workshop_config_invalid"});
  await assert.rejects(runReleaseRehearsal({packIds: ["team_client_pack"], workshopTestConfig: file}), {code: "rehearsal_workshop_config_without_pack"});
});

test("the real tool rehearsal forwards its explicit Python binding to source and installed HWPX tests", async t => {
  const root = temp(t), source = join(root, "source"), file = join(root, "synthetic-runtime.json");
  mkdirSync(join(source, "guild_hall/deployment_pack/tools"), {recursive: true});
  mkdirSync(join(source, "guild_hall/deployment_pack/packs"), {recursive: true});
  writeFileSync(join(source, "guild_hall/deployment_pack/tools/emit_tool_workshop_spec.mjs"), "// fixed synthetic emitter\n");
  writeFileSync(join(source, "core.mjs"), "export const value = 1;\n");
  // The child is a real Node test process; it verifies transport of the
  // declared runtime selection. Actual HWPX authorship remains the native suite.
  writeFileSync(join(source, "runtime.test.mjs"), `
    import test from 'node:test';
    import assert from 'node:assert/strict';
    import {readFileSync} from 'node:fs';
    test('explicit runtime reaches the real child', () => {
      const config = JSON.parse(readFileSync(process.env.SOULFORGE_PPTX_TEST_CONFIG, 'utf8'));
      assert.equal(process.env.SOULFORGE_HWPX_TEST_PYTHON, config.pythonExecutable);
      assert.equal(process.env.SOULFORGE_PDF_TEST_PYTHON, config.pythonExecutable);
      assert.equal(process.env.SOULFORGE_PDF_TEST_POPPLER, process.execPath);
      assert.equal(Object.keys(config).length, 5, 'PPTX keeps its original five-field contract');
      assert.equal(config.pythonExecutable, process.execPath);
    });
  `);
  const config = {artifactRoot: root, templatePath: join(root, "fixture.pptx"), pythonExecutable: process.execPath,
    templateProvenance: "synthetic_fixture", templateApprovalRef: "approval.synthetic_runtime_transport"};
  writeFileSync(file, JSON.stringify(config));
  writeFileSync(join(source, "guild_hall/deployment_pack/packs/tool_workshop_pack.spec.json"), JSON.stringify({
    schema: "soulforge.deployment_pack_spec.v0", pack_id: "tool_workshop_pack", version: "0.1.0",
    host_effect_policy: {reboot: "forbidden", driver_change: "forbidden", system_update: "forbidden", service_restart_scope: "pack_services_only"},
    content_roles: {resource_lease_helper: ["core.mjs"], validators: ["runtime.test.mjs"]},
    smoke_test_entries: ["runtime.test.mjs"],
    release_notes_ref: "release_notes.tool_workshop_pack.v0_1_0", install_manual_ref: "manual.install.tool_workshop_pack",
    upgrade_manual_ref: "manual.upgrade.tool_workshop_pack", rollback_manual_ref: "manual.rollback.tool_workshop_pack",
    support_owner_ref: "owner.platform_support", secret_refs: [],
  }));
  const result = await runReleaseRehearsal({rootDir: source, workDir: join(root, "rehearsal"),
    packIds: ["tool_workshop_pack"], workshopTestConfig: file, workshopPdfRenderer: process.execPath, clock});
  assert.equal(result.ok, true, JSON.stringify(result.receipt.packs.map(pack => ({failure: pack.failure, source: pack.stages.source_unit}))));
  const pack = result.receipt.packs[0];
  assert.equal(pack.stages.source_unit.counts.pass, 1);
  assert.equal(pack.stages.installed_smoke.counts.pass, 1);
  assert.equal(pack.test_runtime.synthetic_config_sha256, readWorkshopTestConfig(file).sha256);
  assert.match(pack.test_runtime.pdf_renderer_sha256, /^[a-f0-9]{64}$/);
  await assert.rejects(runReleaseRehearsal({rootDir: source, packIds: ['tool_workshop_pack'], workshopPdfRenderer: process.execPath}),
    {code: 'rehearsal_pdf_renderer_without_workshop_config'});
});

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
