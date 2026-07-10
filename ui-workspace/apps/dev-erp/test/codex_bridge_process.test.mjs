import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import test from "node:test";

import {
  CODEX_TASK_PERMISSION_PROFILE_ID,
  assertCodexThreadPermissionResponse,
  buildCodexAppServerArgs,
  buildCodexChildEnv,
  buildCodexPermissionProfile,
  codexCommandIdentityForSpawnSpec,
  codexAppServerProcessTreeKillSpec,
  stopCodexAppServerProcess,
  windowsCodexDirectSpawnSpec,
} from "../src/codex_bridge.mjs";

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

test("codex bridge process cleanup never skips Windows process-tree kill for direct launch", () => {
  const calls = [];
  const child = { pid: 1234, exitCode: null, signalCode: null, kill: () => { calls.push(["kill"]); return true; } };
  const stopped = stopCodexAppServerProcess(child, {
    platform: "win32",
    preferChildKill: true,
    spawnSyncImpl: () => { calls.push(["taskkill"]); return { status: 0 }; },
  });

  assert.equal(stopped, true);
  assert.deepEqual(calls, [["taskkill"]]);
});

test("Codex child environment drops ERP/provider secrets before process launch", () => {
  const sentinel = ["parent", "secret", "must", "not", "cross"].join("-");
  const env = buildCodexChildEnv({
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    TEMP: process.env.TEMP,
    DEV_ERP_MAIL_PASSWORD: sentinel,
    OPENAI_API_KEY: sentinel,
    HTTP_PROXY: sentinel,
  }, { codexHome: "test-codex-home" });
  assert.equal(env.CODEX_HOME, "test-codex-home");
  assert.equal("DEV_ERP_MAIL_PASSWORD" in env, false);
  assert.equal("OPENAI_API_KEY" in env, false);
  assert.equal("HTTP_PROXY" in env, false);
  assert.equal(JSON.stringify(env).includes(sentinel), false);
  const probe = spawnSync(process.execPath, ["-e", "process.stdout.write(String(Boolean(process.env.DEV_ERP_MAIL_PASSWORD||process.env.OPENAI_API_KEY||process.env.HTTP_PROXY)))"], {
    env,
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(probe.status, 0);
  assert.equal(probe.stdout, "false");
});

test("Codex command permission profile denies the disk by default and reopens only exact paths", () => {
  const root = join(process.cwd(), "workspace-root");
  const writable = join(root, "approved-output");
  const attachment = join(process.cwd(), "service-payloads", "attachment.txt");
  const profile = buildCodexPermissionProfile({
    cwd: root,
    writableRoots: [writable],
    readOnlyPaths: [attachment],
  });
  assert.equal(profile.id, CODEX_TASK_PERMISSION_PROFILE_ID);
  assert.deepEqual(profile.runtimeWorkspaceRoots, [root]);
  const filesystem = profile.configOverrides.find((value) => value.startsWith(`permissions.${profile.id}.filesystem=`));
  assert.match(filesystem, /":root"="deny"/);
  assert.equal(filesystem.includes(`${JSON.stringify(root)}="read"`), true);
  assert.equal(filesystem.includes(`${JSON.stringify(writable)}="write"`), true);
  assert.equal(filesystem.includes(`${JSON.stringify(attachment)}="read"`), true);
  assert.equal(profile.configOverrides.includes(`permissions.${profile.id}.network.enabled=false`), true);
  assert.throws(() => buildCodexPermissionProfile({ cwd: root, writableRoots: [join(process.cwd(), "outside")] }), /write_root_outside_workspace/);
});

test("Codex app-server args select the bounded profile and filter tool environment identity paths", () => {
  const root = join(process.cwd(), "workspace-root");
  const profile = buildCodexPermissionProfile({ cwd: root });
  const args = buildCodexAppServerArgs({ permissionProfile: profile });
  const joined = args.join("\n");
  assert.match(joined, /shell_environment_policy\.inherit="core"/);
  assert.match(joined, /shell_environment_policy\.include_only=/);
  assert.match(joined, /shell_environment_policy\.exclude=.*CODEX_HOME/);
  assert.doesNotMatch(joined, /shell_environment_policy\.inherit="all"/);
  assert.match(joined, /default_permissions="dev_erp_bounded"/);
  assert.match(joined, /permissions\.dev_erp_bounded\.filesystem=\{":root"="deny"/);
});

test("Codex thread permission response must prove profile, runtime roots, and empty instruction sources", () => {
  const root = join(process.cwd(), "workspace-root");
  const profile = buildCodexPermissionProfile({ cwd: root });
  const valid = {
    activePermissionProfile: { id: profile.id, extends: null },
    runtimeWorkspaceRoots: [root],
    instructionSources: [],
    sandbox: { type: "readOnly" },
  };
  assert.equal(assertCodexThreadPermissionResponse(valid, profile), true);
  assert.throws(() => assertCodexThreadPermissionResponse({ ...valid, activePermissionProfile: { id: ":workspace" } }, profile), /profile_mismatch/);
  assert.throws(() => assertCodexThreadPermissionResponse({ ...valid, instructionSources: [join(root, "AGENTS.md")] }, profile), /instruction_sources_not_empty/);
  assert.throws(() => assertCodexThreadPermissionResponse({ ...valid, runtimeWorkspaceRoots: [process.cwd()] }, profile), /runtime_workspace_roots_mismatch/);
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
      command: process.execPath,
      args: [jsPath, "app-server"],
      direct: true,
      identity: {
        kind: "npm_package",
        packageRoot: join(dir, "node_modules", "@openai", "codex"),
        commandPrefixArgs: [jsPath],
      },
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Codex command identity binds the direct runtime tree and version", () => {
  const dir = mkdtempSync(join(tmpdir(), "codex-bridge-identity-"));
  try {
    const binDir = join(dir, "node_modules", "@openai", "codex", "bin");
    const shimPath = join(dir, "codex.cmd");
    const jsPath = join(binDir, "codex.js");
    mkdirSync(binDir, { recursive: true });
    writeFileSync(shimPath, "@echo off\r\n", "utf8");
    writeFileSync(jsPath, "console.log('codex');\n", "utf8");
    const spec = windowsCodexDirectSpawnSpec(shimPath, ["app-server"]);
    const spawnSyncImpl = () => ({ status: 0, stdout: "codex-cli 0.test\n", stderr: "" });
    const first = codexCommandIdentityForSpawnSpec(spec, { spawnSyncImpl });
    assert.match(first.revision, /^[a-f0-9]{64}$/);
    assert.equal(first.version, "codex-cli 0.test");
    assert.equal(first.kind, "npm_package");

    writeFileSync(jsPath, "console.log('changed');\n", "utf8");
    const second = codexCommandIdentityForSpawnSpec(spec, { spawnSyncImpl });
    assert.notEqual(second.revision, first.revision);
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

    const exited = withTimeout(new Promise((resolve) => wrapper.once("exit", resolve)), 8000, "child_exit_timeout");
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
