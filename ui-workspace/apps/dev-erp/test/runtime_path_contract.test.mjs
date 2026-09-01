import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, win32 } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const HELPER = join(HERE, "..", "ops", "runtime-path-contract.ps1");
const WINDOWS_ROOT = process.env.SystemRoot || process.env.WINDIR || win32.parse(process.execPath).root;
const POWERSHELL = join(WINDOWS_ROOT, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
const WINDOWS_DRIVE = ["C", ":"].join("");
const windowsPath = (...segments) => `${WINDOWS_DRIVE}${win32.sep}${segments.join(win32.sep)}`;
const uncPath = (...segments) => `${win32.sep.repeat(2)}${segments.join(win32.sep)}`;
const psLiteral = (value) => `'${String(value).replaceAll("'", "''")}'`;

function resolveLayout(pathValue) {
  const command = `. ${psLiteral(HELPER)}; Get-DevErpInstalledLayout -PathValue ${psLiteral(pathValue)} | ConvertTo-Json -Compress`;
  const result = spawnSync(POWERSHELL, ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", command], {
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return JSON.parse(result.stdout.trim());
}

test("runtime path contract preserves drive, UNC, current, and version-independent control roots", {
  skip: process.platform !== "win32",
}, () => {
  const v012 = resolveLayout(windowsPath("Suite", "install", "server-pack", "0.1.2", "payload", "ui-workspace", "apps", "dev-erp"));
  const v015 = resolveLayout(windowsPath("Suite", "install", "server-pack", "0.1.5", "payload", "ui-workspace", "apps", "dev-erp"));
  const current = resolveLayout(windowsPath("Suite", "install", "server-pack", "current", "payload", "ui-workspace", "apps", "dev-erp"));
  for (const layout of [v012, v015, current]) {
    assert.equal(layout.installed, true);
    assert.equal(layout.suite_root, windowsPath("Suite"));
    assert.equal(layout.control_root, windowsPath("Suite", "control"));
  }
  const unc = resolveLayout(uncPath("host.invalid", "share", "Suite", "install", "server-pack", "0.1.5", "payload"));
  assert.equal(unc.suite_root, uncPath("host.invalid", "share", "Suite"));
  assert.equal(unc.control_root, uncPath("host.invalid", "share", "Suite", "control"));
});

test("runtime path contract identifies payload containment without normalizing it away", {
  skip: process.platform !== "win32",
}, () => {
  const app = windowsPath("Suite", "install", "server-pack", "0.1.5", "payload", "ui-workspace", "apps", "dev-erp");
  const inside = windowsPath("Suite", "install", "server-pack", "0.1.5", "payload", "data", "dev-erp.db");
  const outside = windowsPath("Suite", "control", "runtime-state", "dev-erp.db");
  const command = [
    `. ${psLiteral(HELPER)}`,
    `$layout = Get-DevErpInstalledLayout -PathValue ${psLiteral(app)}`,
    `[pscustomobject]@{ inside = Test-DevErpPathInside -Candidate ${psLiteral(inside)} -Boundary $layout.payload_root; outside = Test-DevErpPathInside -Candidate ${psLiteral(outside)} -Boundary $layout.payload_root } | ConvertTo-Json -Compress`,
  ].join("; ");
  const result = spawnSync(POWERSHELL, ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", command], { encoding: "utf8", windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout.trim()), { inside: true, outside: false });
});

test("launcher, NSSM, and watchdog share the external runtime path contract", () => {
  const ops = join(HERE, "..", "ops");
  const launcher = readFileSync(join(ops, "run-dev-erp-background.ps1"), "utf8");
  const watchdog = readFileSync(join(ops, "dev-erp-watchdog.ps1"), "utf8");
  const legacyNssm = readFileSync(join(ops, "install-dev-erp-nssm.ps1"), "utf8");
  const productionNssm = readFileSync(join(ops, "configure-dev-erp-codex-nssm.ps1"), "utf8");
  for (const source of [launcher, watchdog, legacyNssm, productionNssm]) {
    assert.match(source, /runtime-path-contract\.ps1/);
    assert.match(source, /Assert-DevErpExternalRuntimePath -Name "LogRoot"/);
    assert.doesNotMatch(source, /function Resolve-InstalledSuiteRoot/);
  }
  for (const source of [launcher, watchdog, legacyNssm, productionNssm]) {
    assert.match(source, /Assert-DevErpExternalRuntimePath -Name "BackendRoot"/);
    assert.match(source, /Assert-DevErpExternalRuntimePath -Name "DatabasePath"/);
  }
  assert.match(productionNssm, /--knowledge_shell_root/);
  assert.match(productionNssm, /--backend_root/);
  assert.match(legacyNssm, /--backend_root/);
  assert.match(productionNssm, /--db/);
  const server = readFileSync(join(HERE, "..", "server.mjs"), "utf8");
  assert.match(server, /flag\("backend_root"/);
  assert.match(server, /BACKEND_ROOT_CONFIGURED/);
  assert.match(productionNssm, /Installed runtime NSSM configuration requires an explicit external -DatabasePath/);
  assert.match(watchdog, /Installed runtime watchdog requires an explicit external -DatabasePath/);
});
