import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import test from "node:test";

import { codexAppServerProcessTreeKillSpec, stopCodexAppServerProcess, windowsCodexDirectSpawnSpec } from "../src/codex_bridge.mjs";

async function withTimeout(promise, ms, message) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function firstStdoutLine(readable, timeoutMs = 5000) {
  const rl = createInterface({ input: readable });
  try {
    const line = await withTimeout(new Promise((resolve) => rl.once("line", resolve)), timeoutMs, "child_pid_timeout");
    return String(line).trim();
  } finally {
    rl.close();
  }
}

function pidExists(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

test("codex bridge process cleanup uses Windows process-tree kill", () => {
  assert.deepEqual(codexAppServerProcessTreeKillSpec(1234, "win32"), {
    command: "taskkill.exe",
    args: ["/pid", "1234", "/T", "/F"],
  });
});

test("codex bridge process cleanup ignores invalid or non-Windows pids", () => {
  assert.equal(codexAppServerProcessTreeKillSpec(1234, "linux"), null);
  assert.equal(codexAppServerProcessTreeKillSpec(0, "win32"), null);
  assert.equal(codexAppServerProcessTreeKillSpec("abc", "win32"), null);
});

test("codex bridge process cleanup stops the Windows process tree first", () => {
  const calls = [];
  const child = { pid: 1234, exitCode: null, signalCode: null, kill: () => { calls.push(["kill"]); return true; } };
  const stopped = stopCodexAppServerProcess(child, {
    platform: "win32",
    spawnSyncImpl: (command, args, options) => {
      calls.push([command, args, options]);
      return { status: 0 };
    },
  });

  assert.equal(stopped, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "taskkill.exe");
  assert.deepEqual(calls[0][1], ["/pid", "1234", "/T", "/F"]);
  assert.equal(calls[0][2].windowsHide, true);
});

test("codex bridge process cleanup falls back to child kill", () => {
  const calls = [];
  const child = { pid: 1234, exitCode: null, signalCode: null, kill: () => { calls.push(["kill"]); return true; } };
  const stopped = stopCodexAppServerProcess(child, {
    platform: "win32",
    spawnSyncImpl: () => {
      calls.push(["taskkill"]);
      return { status: 1 };
    },
  });

  assert.equal(stopped, true);
  assert.deepEqual(calls, [["taskkill"], ["kill"]]);
});

test("codex bridge process cleanup keeps non-Windows behavior unchanged", () => {
  const calls = [];
  const child = { pid: 1234, exitCode: null, signalCode: null, kill: () => { calls.push(["kill"]); return true; } };
  const stopped = stopCodexAppServerProcess(child, {
    platform: "linux",
    spawnSyncImpl: () => { calls.push(["taskkill"]); return { status: 0 }; },
  });

  assert.equal(stopped, true);
  assert.deepEqual(calls, [["kill"]]);
});

test("codex bridge process cleanup can prefer direct child kill", () => {
  const calls = [];
  const child = { pid: 1234, exitCode: null, signalCode: null, kill: () => { calls.push(["kill"]); return true; } };
  const stopped = stopCodexAppServerProcess(child, {
    platform: "win32",
    preferChildKill: true,
    spawnSyncImpl: () => { calls.push(["taskkill"]); return { status: 0 }; },
  });

  assert.equal(stopped, true);
  assert.deepEqual(calls, [["kill"]]);
});

test("codex bridge resolves an npm cmd shim to a direct node command", () => {
  const dir = mkdtempSync(join(tmpdir(), "codex-bridge-shim-"));
  try {
    const binDir = join(dir, "node_modules", "@openai", "codex", "bin");
    const shimPath = join(dir, "codex.cmd");
    const jsPath = join(binDir, "codex.js");
    mkdirSync(binDir, { recursive: true });
    writeFileSync(shimPath, "@echo off\r\nnode \"%~dp0node_modules\\@openai\\codex\\bin\\codex.js\" %*\r\n", "utf8");
    writeFileSync(jsPath, "console.log('codex');\n", "utf8");

    assert.deepEqual(windowsCodexDirectSpawnSpec(join(dir, "codex"), ["app-server"]), {
      command: "node",
      args: [jsPath, "app-server"],
      direct: true,
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("codex bridge process cleanup kills a live direct Windows app-server process", { skip: process.platform !== "win32" }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "codex-bridge-process-tree-"));
  const scriptPath = join(dir, "child.mjs");
  let wrapper = null;
  let descendantPid = null;
  let stderr = "";

  try {
    writeFileSync(scriptPath, "console.log(process.pid); setInterval(() => {}, 1000);\n", "utf8");
    wrapper = spawn("node", [scriptPath], {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    wrapper.stderr.on("data", (buf) => { stderr += buf.toString(); });

    descendantPid = Number(await firstStdoutLine(wrapper.stdout).catch((err) => {
      err.message = `${err.message}: ${stderr.trim()}`;
      throw err;
    }));
    assert.equal(Number.isInteger(descendantPid), true);
    assert.equal(descendantPid, wrapper.pid);
    assert.equal(pidExists(descendantPid), true);

    const exited = withTimeout(new Promise((resolve) => wrapper.once("exit", resolve)), 5000, "child_exit_timeout");
    assert.equal(stopCodexAppServerProcess(wrapper, { preferChildKill: true }), true);
    await exited;
    assert.equal(wrapper.exitCode !== null || wrapper.signalCode !== null, true);
  } finally {
    if (wrapper) stopCodexAppServerProcess(wrapper, { preferChildKill: true });
    if (descendantPid && pidExists(descendantPid)) {
      stopCodexAppServerProcess({
        pid: descendantPid,
        exitCode: null,
        signalCode: null,
        kill: () => {
          try { process.kill(descendantPid); return true; } catch { return false; }
        },
      });
    }
    rmSync(dir, { recursive: true, force: true });
  }
});
