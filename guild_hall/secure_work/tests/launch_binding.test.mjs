import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync, rmSync, linkSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { executeVerified, guardNodeImports, pythonInvocation, renderInstalledLauncher,
  verifyInstallation } from "../sfx.mjs";

const MODULE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OWNER = "S-1-5-21-111-222-333-1001";
const SENDER = "S-1-5-21-111-222-333-1002";
const hash = value => createHash("sha256").update(value).digest("hex");
const pin = p => ({ path: p, sha256: hash(readFileSync(p)) });
function fixture(t) {
  const temp = mkdtempSync(path.join(tmpdir(), "secure-work-launch-test-"));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const install = path.join(temp, "install"), runtime = path.join(temp, "runtime"), kit = path.join(temp, "kit");
  const lane = path.join(install, "guild_hall/secure_work");
  const put = (p, value) => { mkdirSync(path.dirname(p), { recursive: true }); writeFileSync(p, value); return p; };
  const launcher = put(path.join(lane, "sfx.mjs"), readFileSync(path.join(MODULE, "sfx.mjs")));
  put(path.join(lane, "src/soulforge_secure_work/launch_runtime.py"), readFileSync(path.join(MODULE, "src/soulforge_secure_work/launch_runtime.py")));
  put(path.join(lane, "src/soulforge_secure_work/cli.py"), "# synthetic CLI\n");
  const unusedPython = put(path.join(lane, "src/soulforge_secure_work/unused.py"), "# unopened Python module\n");
  const engine = put(path.join(lane, "src/soulforge_secure_work/engine.py"), "# synthetic engine\n");
  put(path.join(lane, "custody_bridge.mjs"), readFileSync(path.join(MODULE, "custody_bridge.mjs")));
  put(path.join(lane, "execution_authority.mjs"), readFileSync(path.join(MODULE, "execution_authority.mjs")));
  const sdk = path.join(install, "node_modules/@synthetic/sdk");
  put(path.join(sdk, "package.json"), JSON.stringify({ type: "module", exports: "./index.mjs" }));
  const sdkEntry = put(path.join(sdk, "index.mjs"), "globalThis.__secureImportMarker = 'sdk'; export class IngressClient {}\n");
  const unusedSdk = put(path.join(sdk, "unused.mjs"), "globalThis.__secureImportMarker = 'unused'; export const value = 1;\n");
  const ingress = put(path.join(install, "ui-workspace/apps/dev-erp-mcp/src/ingress_client.mjs"),
    "export { IngressClient } from '@synthetic/sdk';\n");
  const late = put(path.join(install, "late.mjs"), "export const load = p => import(p);\n");
  const python = put(path.join(runtime, "python.exe"), "synthetic interpreter, never executed\n");
  const node = put(path.join(runtime, "node.exe"), "synthetic node, never executed\n");
  const observer = put(path.join(runtime, "Windows/System32/WindowsPowerShell/v1.0/powershell.exe"), "synthetic OS observer, never executed\n");
  const stdlib = path.join(runtime, "Lib");
  const startupModule = put(path.join(stdlib, "encodings/__init__.py"), "# synthetic pre-bootstrap dependency\n");
  const dll = put(path.join(runtime, "python314.dll"), "synthetic native runtime\n");
  const kitModule = put(path.join(kit, "src/sf_sewe/models.py"), "# synthetic external kit\n");
  const unusedKit = put(path.join(kit, "src/sf_sewe/unused.py"), "# synthetic unused kit module\n");
  const recipes = path.join(kit, "recipes");
  put(path.join(recipes, "synthetic.json"), "{}");
  const pythonPaths = [stdlib, path.join(lane, "src"), path.join(kit, "src")];
  const startup = put(path.join(runtime, "python._pth"), pythonPaths.join("\n") + "\n");
  const publicKey = put(path.join(temp, "synthetic-public-material"), "synthetic public verification bytes\n");
  const policyPath = put(path.join(temp, "execution-policy.json"), JSON.stringify({
    epoch: 1, expires_at: Date.now() + 60000, revoked: false, issuer_key_id: "trust.synthetic",
    public_key_sha256: pin(publicKey).sha256,
    roles: {
      controller: { sid: SENDER, principal_ref: "synthetic.controller", purpose: "SOURCE", capabilities: ["jobs.get", "jobs.submit", "jobs.advance"] },
      sender: { sid: "S-1-5-21-111-222-333-1003", principal_ref: "synthetic.sender", purpose: "G3_PROVIDER", capabilities: ["model.dispatch"] },
      worker: { sid: "S-1-5-21-111-222-333-1004", principal_ref: "synthetic.worker", purpose: "G3_PROVIDER", capabilities: [] },
      reviewer: { sid: "S-1-5-21-111-222-333-1005", principal_ref: "synthetic.reviewer", purpose: "KEY_SERVICE", capabilities: ["release.issue", "release.review"] },
    }, context: { project_ref: "synthetic.project", assignment_ref: "synthetic.assignment", assignment_epoch: 1,
      task_ref: "synthetic.task", route_sha256: "a".repeat(64), audience: "scripted.subprocess" },
    worker_registration: { task_path: "\\SyntheticWorker", xml_sha256: "a".repeat(64) },
  }));
  const configPath = put(path.join(temp, "config.json"), JSON.stringify({ schema: "soulforge.secure_work.config.v0",
    permit_trust_pubkey_path: publicKey, execution_authority: { policy_path: policyPath, policy_sha256: pin(policyPath).sha256 },
    kit_root: kit, recipe_root: recipes, pilot_root: path.join(temp, "working"), status_path: path.join(temp, "status.json"),
    runtime: { python_executable: python }, adapters: { transport: { python_executable: python } } }));
  const bindingPath = path.join(lane, "custody_runtime_binding.json");
  function members(root) {
    const result = [];
    function visit(dir) {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (p === launcher || p === bindingPath) continue;
        if (entry.isDirectory()) visit(p);
        else result.push({ relative_path: path.relative(root, p).split(path.sep).join("/"), sha256: hash(readFileSync(p)) });
      }
    }
    visit(root);
    return result.sort((a, b) => a.relative_path.localeCompare(b.relative_path));
  }
  const binding = { config_path: configPath, config_sha256: pin(configPath).sha256, trust_owner_sid: OWNER,
    node_executable: pin(node), os_observer: pin(observer), launch: { roots: [install, runtime, kit].map(p => ({ path: p, files: members(p) })),
      python_executable: python, python_startup: startup, python_paths: pythonPaths, kit_root: kit, recipe_root: recipes } };
  const anchor = { install_root: install, trust_owner_sid: OWNER, binding_sha256: "0".repeat(64),
    node_executable: pin(node), os_observer: pin(observer) };
  function saveBinding() { put(bindingPath, JSON.stringify(binding)); anchor.binding_sha256 = pin(bindingPath).sha256; }
  saveBinding();
  const evidence = { sid: SENDER, groups: [], privileges: [], elevated: false };
  const observe = paths => ({ ...evidence, paths: paths.map(p => ({ path: p, owner_sid: OWNER, reparse: false,
    allow: [{ sid: OWNER, rights: 2032127 }, { sid: SENDER, rights: 1179785 }] })) });
  const verify = () => verifyInstallation(anchor, { observe, launcherPath: launcher, executablePath: node });
  return { temp, install, runtime, kit, lane, launcher, python, node, observer, startup, startupModule, dll,
    sdk, sdkEntry, unusedSdk, unusedPython, unusedKit, kitModule, engine, ingress, late, configPath,
    bindingPath, binding, anchor, evidence, observe, put, saveBinding, verify };
}

test("a fixed whole generation verifies and the actual execution function uses only isolated pinned Python", async t => {
  const f = fixture(t), verified = f.verify();
  let calls = 0;
  const result = await executeVerified(verified, ["doctor"], { spawn(executable, argv, options) {
    calls++;
    assert.equal(executable, f.python);
    assert.deepEqual(argv.slice(0, 6), ["-I", "-S", "-B", "-X", "utf8", "-c"]);
    assert.match(argv[6], /launch_runtime/);
    assert.ok(argv[6].length < 32768);
    assert.equal(JSON.parse(options.input.toString()).config_path, f.configPath);
    assert.equal(Object.hasOwn(options.env, "PATH"), false);
    assert.equal(Object.hasOwn(options.env, "PYTHONPATH"), false);
    assert.equal(options.cwd, f.runtime);
    return { status: 0 };
  } });
  assert.deepEqual(result, { exitCode: 0 });
  assert.equal(calls, 1);
  assert.throws(() => pythonInvocation(verified, "cli", ["--config", f.configPath]));
  assert.throws(() => pythonInvocation(verified, "cli", ["--config=anything"]));
  assert.throws(() => pythonInvocation(verified, "cli", ["permit", "approve", "--actor", "caller"]));
});

test("controller SID cannot enter the worker and missing identity policy never falls back to inherited spawn", async t => {
  const f = fixture(t);
  let spawns = 0;
  await assert.rejects(executeVerified(f.verify(), ["--worker"], { spawn() { spawns++; return { status: 0 }; } }));
  assert.equal(spawns, 0);
  const config = JSON.parse(readFileSync(f.configPath));
  delete config.execution_authority;
  f.put(f.configPath, JSON.stringify(config));
  f.binding.config_sha256 = pin(f.configPath).sha256; f.saveBinding();
  await assert.rejects(executeVerified(f.verify(), ["doctor"], { spawn() { spawns++; return { status: 0 }; } }));
  assert.equal(spawns, 0);
});

function directSyntheticEntry(f, argv, input = "") {
  // Only the copied test launcher substitutes synthetic OS evidence and its
  // fake executable pin. Keep the real main/executeVerified/import graph and
  // complete fixture verification, rather than importing sfx into the test.
  const source = readFileSync(f.launcher, "utf8");
  const marker = "const runtime = verifyInstallation(INSTALLATION_ANCHOR);";
  assert.equal(source.split(marker).length, 2);
  const replacement = `const runtime = verifyInstallation(${JSON.stringify(f.anchor)}, {
    launcherPath: fileURLToPath(import.meta.url), executablePath: ${JSON.stringify(f.node)},
    observe: paths => ({ sid: ${JSON.stringify(SENDER)}, groups: [], privileges: [], elevated: false,
      paths: paths.map(p => ({ path: p, owner_sid: ${JSON.stringify(OWNER)}, reparse: false,
        allow: [{ sid: ${JSON.stringify(OWNER)}, rights: 2032127 }, { sid: ${JSON.stringify(SENDER)}, rights: 1179785 }] })) }),
  });`;
  f.put(f.launcher, source.replace(marker, replacement));
  return spawnSync(process.execPath, [f.launcher, ...argv], { encoding: "utf8", input,
    env: { SYSTEMROOT: process.env.SYSTEMROOT, WINDIR: process.env.WINDIR }, timeout: 5000, windowsHide: true });
}

test("direct launcher entrypoint resolves the real execution-authority import and emits its bounded result", t => {
  const f = fixture(t);
  const result = directSyntheticEntry(f, ["--role-check"], JSON.stringify({ operation: "jobs.get", scope: null }));
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).principal_ref, "synthetic.controller");
});

test("direct custody entrypoint resolves its authority module before a normal unbound denial", t => {
  const f = fixture(t);
  // Isolate the second back-import: no real OS task, policy or credential
  // authorization is claimed by this deliberately synthetic role stub.
  const roles = f.put(path.join(f.lane, "execution_authority.mjs"),
    "export const loadExecutionAuthority = () => ({ requireRole() {} });\n");
  const custody = f.put(path.join(f.lane, "custody_authority.mjs"),
    readFileSync(path.join(MODULE, "custody_authority.mjs"), "utf8") + '\nprocess.stderr.write("synthetic-custody-imported\\n");\n');
  const files = f.binding.launch.roots[0].files;
  files.find(item => item.relative_path === "guild_hall/secure_work/execution_authority.mjs").sha256 = pin(roles).sha256;
  files.push({ relative_path: "guild_hall/secure_work/custody_authority.mjs", sha256: pin(custody).sha256 });
  f.saveBinding();
  const result = directSyntheticEntry(f, ["--custody-bridge"], "{}");
  assert.equal(result.error, undefined);
  assert.equal(result.status, 2, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { ok: false, code: "SECURE_WORK_LAUNCH_HOLD" });
  assert.equal(result.stderr, "synthetic-custody-imported\n");
});

test("a main promise left pending without live handles cannot exit with false success", t => {
  const f = fixture(t);
  const roles = f.put(path.join(f.lane, "execution_authority.mjs"),
    "export const loadExecutionAuthority = () => new Promise(() => {});\n");
  f.binding.launch.roots[0].files.find(item => item.relative_path === "guild_hall/secure_work/execution_authority.mjs").sha256 = pin(roles).sha256;
  f.saveBinding();
  const result = directSyntheticEntry(f, ["--role-check"], JSON.stringify({ operation: "jobs.get", scope: null }));
  assert.equal(result.error, undefined);
  assert.equal(result.status, 2, result.stderr);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
});

for (const field of ["unusedSdk", "sdkEntry", "unusedPython", "engine", "unusedKit", "kitModule", "startupModule", "dll", "configPath"]) {
  test(`${field} tampering prevents interpreter/SDK import, including unused and pre-bootstrap dependencies`, async t => {
    const f = fixture(t);
    delete globalThis.__secureImportMarker;
    f.put(f[field], "globalThis.__secureImportMarker = 'tampered';\n");
    let executed = false;
    await assert.rejects(async () => executeVerified(f.verify(), ["doctor"], { spawn() { executed = true; } }));
    assert.equal(executed, false);
    assert.equal(globalThis.__secureImportMarker, undefined);
  });
}

test("extra files, omitted manifest members, a forged binding and a missing anchor fail closed", t => {
  const f = fixture(t);
  f.put(path.join(f.sdk, "injected.mjs"), "throw new Error('must not execute')");
  assert.throws(f.verify);
  rmSync(path.join(f.sdk, "injected.mjs"));
  f.binding.launch.roots[0].files.pop(); f.saveBinding();
  assert.throws(f.verify);
  assert.throws(() => verifyInstallation(null));
  f.put(f.bindingPath, "{}");
  assert.throws(f.verify);
});

test("valid hashes do not replace OS owner/principal/write-custody evidence", t => {
  const f = fixture(t);
  f.evidence.sid = OWNER;
  assert.throws(f.verify);
  f.evidence.sid = SENDER; f.evidence.elevated = true;
  assert.throws(f.verify);
  f.evidence.elevated = false; f.evidence.groups = ["S-1-5-32-544"];
  assert.throws(f.verify);
  f.evidence.groups = [];
  const writable = paths => { const value = f.observe(paths); value.paths[0].allow.push({ sid: SENDER, rights: 2 }); return value; };
  assert.throws(() => verifyInstallation(f.anchor, { observe: writable, launcherPath: f.launcher, executablePath: f.node }));
});

test("working/credential roots are refused before inventory and hardlinks cannot widen runtime custody", t => {
  const f = fixture(t);
  const original = readFileSync(f.configPath);
  const config = JSON.parse(original);
  config.pilot_root = f.kit;
  f.put(f.configPath, JSON.stringify(config));
  f.binding.config_sha256 = pin(f.configPath).sha256; f.saveBinding();
  assert.throws(f.verify);
  f.put(f.configPath, original); f.binding.config_sha256 = pin(f.configPath).sha256; f.saveBinding();
  const secret = path.join(f.runtime, "credentials");
  mkdirSync(secret);
  f.put(path.join(secret, "do-not-read.key"), "synthetic never-read content");
  assert.throws(f.verify);
  rmSync(secret, { recursive: true });
  linkSync(f.unusedKit, path.join(f.temp, "external-hardlink"));
  assert.throws(f.verify);
});

function assertDeniedBeforeDataRead(t, verify, protectedRoot, label) {
  const originalOpen = fs.openSync, originalReadDir = fs.readdirSync;
  let opens = 0, scans = 0, denied;
  const inside = p => {
    if (typeof p !== "string") return false;
    const relative = path.relative(path.resolve(protectedRoot).toLowerCase(), path.resolve(p).toLowerCase());
    return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
  };
  t.mock.method(fs, "openSync", function(p, ...args) {
    if (inside(p)) opens++;
    return originalOpen.call(this, p, ...args);
  });
  t.mock.method(fs, "readdirSync", function(p, ...args) {
    if (inside(p)) scans++;
    return originalReadDir.call(this, p, ...args);
  });
  syncBuiltinESMExports();
  try { verify(); } catch (error) { denied = error; }
  finally { t.mock.restoreAll(); syncBuiltinESMExports(); }
  assert.equal(denied?.message, "SECURE_WORK_LAUNCH_HOLD", `${label}: expected denial; opens=${opens}, scans=${scans}`);
  assert.equal(opens, 0, `${label}: protected bytes were opened`);
  assert.equal(scans, 0, `${label}: protected directory was enumerated`);
}

for (const placement of ["nested", "root", "ancestor"]) {
  test(`protected data names in a ${placement} path are denied before enumeration or byte reads`, t => {
    for (const name of ["working", "_workspaces", "_workmeta", "canonical", "WoRkInG", "_WORKSPACES",
      "_WORKMETA", "CaNoNiCaL", "working-data", "canonical_bytes", "workspace", "workmeta"]) {
      const f = fixture(t);
      const protectedRoot = placement === "nested" ? path.join(f.runtime, "ordinary", name)
        : path.join(f.temp, "independent", name);
      const runtimeRoot = placement === "ancestor" ? path.join(protectedRoot, "runtime") : protectedRoot;
      const candidate = f.put(path.join(runtimeRoot, "synthetic.txt"), "synthetic data must not be inventoried\n");
      const sha256 = hash("synthetic data must not be inventoried\n");
      if (placement === "nested") {
        f.binding.launch.roots[1].files.push({ relative_path: path.relative(f.runtime, candidate).split(path.sep).join("/"), sha256 });
      } else {
        f.binding.launch.roots.push({ path: runtimeRoot, files: [{ relative_path: "synthetic.txt", sha256 }] });
      }
      f.saveBinding();
      assertDeniedBeforeDataRead(t, f.verify, protectedRoot, `${placement}/${name}`);
    }
  });
}

test("an executable pin below a protected data component is refused before reading its bytes", t => {
  const f = fixture(t), protectedRoot = path.join(f.temp, "independent", "_WoRkMeTa");
  const node = f.put(path.join(protectedRoot, "node.exe"), "synthetic node pin\n");
  f.anchor.node_executable = { path: node, sha256: hash("synthetic node pin\n") };
  f.binding.node_executable = f.anchor.node_executable;
  f.saveBinding();
  assertDeniedBeforeDataRead(t, () => verifyInstallation(f.anchor, {
    observe: f.observe, launcherPath: f.launcher, executablePath: node,
  }), protectedRoot, "node-pin/_workmeta");
});

test("an explicitly excluded data root with an ordinary name remains unread", t => {
  const f = fixture(t), protectedRoot = path.join(f.temp, "ordinary-store");
  f.put(path.join(protectedRoot, "synthetic.txt"), "synthetic data\n");
  const config = JSON.parse(readFileSync(f.configPath));
  config.pilot_root = protectedRoot;
  f.put(f.configPath, JSON.stringify(config));
  f.binding.config_sha256 = pin(f.configPath).sha256;
  f.binding.launch.roots.push({ path: protectedRoot, files: [{ relative_path: "synthetic.txt", sha256: hash("synthetic data\n") }] });
  f.saveBinding();
  assertDeniedBeforeDataRead(t, f.verify, protectedRoot, "explicit/ordinary-store");
});

test("startup site/import directives and an alternate _pth are refused even when freshly hashed", t => {
  const f = fixture(t);
  f.put(f.startup, readFileSync(f.startup, "utf8") + "import site\n");
  const item = f.binding.launch.roots[1].files.find(v => v.relative_path === "python._pth");
  item.sha256 = pin(f.startup).sha256; f.saveBinding();
  assert.throws(f.verify);
  const clean = fixture(t);
  const alternate = clean.put(path.join(clean.runtime, "python314._pth"), "outside\n");
  clean.binding.launch.roots[1].files.push({ relative_path: "python314._pth", sha256: pin(alternate).sha256 });
  clean.saveBinding();
  assert.throws(clean.verify);
});

test("Node hook loads the real resolution chain only inside the verified closure, and catches late dynamic drift", async t => {
  const f = fixture(t), runtime = f.verify(), hooks = guardNodeImports(runtime);
  try {
    delete globalThis.__secureImportMarker;
    await import(pathToFileURL(f.ingress).href);
    assert.equal(globalThis.__secureImportMarker, "sdk");
    const dynamic = await import(pathToFileURL(f.late).href);
    f.put(f.unusedSdk, "globalThis.__secureImportMarker = 'bad-late'; export const value = 2;\n");
    await assert.rejects(dynamic.load(pathToFileURL(f.unusedSdk).href));
    assert.equal(globalThis.__secureImportMarker, "sdk");
    const outside = f.put(path.join(f.temp, "outside.mjs"), "globalThis.__secureImportMarker = 'outside';\n");
    await assert.rejects(dynamic.load(pathToFileURL(outside).href));
    assert.equal(globalThis.__secureImportMarker, "sdk");
    assert.throws(runtime.recheck);
  } finally { hooks.deregister(); delete globalThis.__secureImportMarker; }
});

test("source generation grants no readiness and public/direct CLI cannot nominate its own trust root", t => {
  const f = fixture(t);
  const generated = renderInstalledLauncher(readFileSync(f.launcher, "utf8"), f.anchor);
  assert.match(generated, /INSTALLER_FIXED_ANCHOR/);
  assert.throws(() => renderInstalledLauncher(generated, f.anchor));
  const result = spawnSync(process.execPath, [path.join(MODULE, "sfx.mjs"), "--config", f.configPath, "doctor"], {
    encoding: "utf8", env: { SYSTEMROOT: process.env.SYSTEMROOT, WINDIR: process.env.WINDIR } });
  assert.equal(result.status, 2);
  assert.deepEqual(JSON.parse(result.stdout), { ok: false, code: "SECURE_WORK_LAUNCH_HOLD" });
  // No SDK exists at this source location in the fixture; direct bridge must
  // still deny without importing it, even when stdin carries a fake authority.
  const direct = spawnSync(process.execPath, [path.join(f.lane, "custody_bridge.mjs")], {
    encoding: "utf8", input: '{"authority":true}' });
  assert.equal(direct.status, 1);
  assert.match(direct.stderr, /CUSTODY_BRIDGE_DENIED/);
});
