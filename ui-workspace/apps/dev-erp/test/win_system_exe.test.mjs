import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, win32 } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { resolveGitExecutable, resolvePythonExecutable, system32Exe } from "../src/win_system_exe.mjs";

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const WIN_ROOT = ["C:", "Windows"].join(win32.sep);

test("system32Exe joins an absolute SystemRoot and fails closed on anything less", () => {
  assert.equal(system32Exe("taskkill.exe", { SystemRoot: WIN_ROOT }), win32.join(WIN_ROOT, "System32", "taskkill.exe"));
  assert.equal(system32Exe("cmd.exe", { windir: WIN_ROOT }), win32.join(WIN_ROOT, "System32", "cmd.exe"), "windir is the fallback spelling");
  assert.equal(system32Exe("cmd.exe", {}), null, "no SystemRoot -> no PATH fallback, null");
  assert.equal(system32Exe("cmd.exe", { SystemRoot: "" }), null);
  assert.equal(system32Exe("cmd.exe", { SystemRoot: "Windows" }), null, "a relative SystemRoot is not a trusted root");
});

test("resolveGitExecutable: the env pin wins, and an INVALID pin is an error, never a silent bypass", () => {
  const dir = mkdtempSync(join(tmpdir(), "dev-erp-gitpin-"));
  const pinned = join(dir, "git.exe");
  writeFileSync(pinned, "");
  assert.deepEqual(resolveGitExecutable({ env: { DEV_ERP_GIT_EXE: pinned }, platform: "win32" }),
    { command: pinned, source: "env_pin" });
  assert.deepEqual(resolveGitExecutable({ env: { DEV_ERP_GIT_EXE: join(dir, "ghost.exe") }, platform: "win32" }),
    { command: null, reason: "git_pin_invalid" });
  const dirNamedExe = join(dir, "dir-git.exe");
  mkdirSync(dirNamedExe);
  assert.deepEqual(resolveGitExecutable({ env: { DEV_ERP_GIT_EXE: dirNamedExe }, platform: "win32" }),
    { command: null, reason: "git_pin_invalid" },
    "a DIRECTORY named like the binary is not a valid pin");
  assert.deepEqual(resolveGitExecutable({ env: { DEV_ERP_GIT_EXE: "relative/git.exe" }, platform: "linux" }),
    { command: null, reason: "git_pin_invalid" },
    "the pin is validated on every platform");
});

test("resolvePythonExecutable follows the same ladder with DEV_ERP_PYTHON and python-coded reasons", () => {
  const dir = mkdtempSync(join(tmpdir(), "dev-erp-pypin-"));
  const pinned = join(dir, "python.exe");
  writeFileSync(pinned, "");
  assert.deepEqual(resolvePythonExecutable({ env: { DEV_ERP_PYTHON: pinned }, platform: "win32" }),
    { command: pinned, source: "env_pin" });
  assert.deepEqual(resolvePythonExecutable({ env: { DEV_ERP_PYTHON: join(dir, "ghost.exe") }, platform: "win32" }),
    { command: null, reason: "python_pin_invalid" });
  const pyAbs = ["C:", "Interp", "python.exe"].join(win32.sep);
  const calls = [];
  assert.deepEqual(resolvePythonExecutable({
    env: { SystemRoot: WIN_ROOT }, platform: "win32",
    runWhere: (whereExe, name) => { calls.push(name); return [pyAbs]; },
  }), { command: pyAbs, source: "where" });
  assert.deepEqual(calls, ["python.exe"]);
  assert.deepEqual(resolvePythonExecutable({ env: {}, platform: "win32", runWhere: () => [pyAbs] }),
    { command: null, reason: "python_unresolved" });
  assert.deepEqual(resolvePythonExecutable({ env: {}, platform: "linux" }), { command: "python3", source: "path" });
});

test("the REAL where lookup never selects a binary from the caller's cwd (planted git.exe)", () => {
  if (process.platform !== "win32") return;
  // where.exe searches its own cwd before PATH; the resolver pins the
  // where cwd to System32 so a git.exe planted in the SERVER's cwd (a
  // writable repo/app dir) can never be selected. This runs the real
  // defaultRunWhere in a subprocess whose cwd holds the planted binary.
  const dir = mkdtempSync(join(tmpdir(), "dev-erp-plant-"));
  writeFileSync(join(dir, "git.exe"), "MZ not a real binary");
  const moduleUrl = pathToFileURL(join(APP_ROOT, "src", "win_system_exe.mjs")).href;
  const probe = spawnSync(process.execPath, ["--input-type=module", "-e",
    `import(${JSON.stringify(moduleUrl)}).then((m) => console.log(JSON.stringify(m.resolveGitExecutable())));`],
  { cwd: dir, encoding: "utf8", timeout: 30000, windowsHide: true });
  assert.equal(probe.status, 0, probe.stderr);
  const resolved = JSON.parse(String(probe.stdout).trim());
  if (resolved.command !== null) {
    assert.equal(resolved.command.toLowerCase().startsWith(dir.toLowerCase()), false,
      "a planted cwd git.exe must never win the where lookup");
  }
});

test("resolveGitExecutable on win32 goes through the pinned System32 where.exe and accepts only absolute .exe hits", () => {
  const gitAbs = ["C:", "Tools", "Git", "cmd", "git.exe"].join(win32.sep);
  const calls = [];
  const resolved = resolveGitExecutable({
    env: { SystemRoot: WIN_ROOT },
    platform: "win32",
    runWhere: (whereExe, name) => {
      calls.push([whereExe, name]);
      return ["git.cmd", gitAbs];
    },
  });
  assert.deepEqual(resolved, { command: gitAbs, source: "where" });
  assert.deepEqual(calls, [[win32.join(WIN_ROOT, "System32", "where.exe"), "git.exe"]],
    "where.exe itself is invoked by absolute System32 path");
  assert.deepEqual(resolveGitExecutable({ env: { SystemRoot: WIN_ROOT }, platform: "win32", runWhere: () => [] }),
    { command: null, reason: "git_unresolved" });
  assert.deepEqual(resolveGitExecutable({
    env: { SystemRoot: WIN_ROOT }, platform: "win32",
    runWhere: () => ["git.cmd", "relative\\git.exe"],
  }), { command: null, reason: "git_unresolved" },
  "cmd shims and relative lines never qualify");
  assert.deepEqual(resolveGitExecutable({ env: {}, platform: "win32", runWhere: () => [gitAbs] }),
    { command: null, reason: "git_unresolved" },
    "no SystemRoot -> no where.exe -> unresolved, never a bare PATH lookup");
});

test("resolveGitExecutable on posix keeps plain git (developer-owned PATH) when no pin is set", () => {
  assert.deepEqual(resolveGitExecutable({ env: {}, platform: "linux" }), { command: "git", source: "path" });
});
