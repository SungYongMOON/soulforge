import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, copyFile, readFile, rm, writeFile } from "node:fs/promises";
import { request } from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_LAUNCHER = path.resolve(HERE, "..", "ops", "run-dev-erp-background.ps1");
const SOURCE_START_BAT = path.resolve(HERE, "..", "start-windows.bat");
const PROTECTED_RUNTIME_PORT = 4300;
const WINDOWS_ROOT = process.env.SystemRoot || process.env.WINDIR || path.parse(process.execPath).root;
const POWERSHELL = path.join(
  WINDOWS_ROOT,
  "System32",
  "WindowsPowerShell",
  "v1.0",
  "powershell.exe",
);
const CMD = path.join(WINDOWS_ROOT, "System32", "cmd.exe");
const TASKKILL = path.join(WINDOWS_ROOT, "System32", "taskkill.exe");

function sensitiveEnvironmentName(name) {
  return /^(DEV_ERP_|ERP_|CODEX_|OLLAMA_|OPENAI_|ANTHROPIC_|AZURE_|AWS_|GOOGLE_|GEMINI_|GH_|GITHUB_|GIT_|NPM_|YARN_|PNPM_|SLACK_|TELEGRAM_|SMTP_|IMAP_|MAIL_|NODE_)/i.test(name)
    || /(^|_)(TOKEN|SECRET|PASSWORD|PASSPHRASE|API_?KEY|ACCESS_?KEY|PRIVATE_?KEY|CREDENTIALS?|COOKIE|SESSION)(_|$)/i.test(name)
    || /^(ALL_PROXY|HTTP_PROXY|HTTPS_PROXY|NO_PROXY|CURL_CA_BUNDLE|REQUESTS_CA_BUNDLE|SSL_CERT_DIR|SSL_CERT_FILE|SSLKEYLOGFILE|OPENSSL_CONF|DATABASE_URL|REDIS_URL|MYSQL_PWD|PGPASSFILE)$/i.test(name);
}

function testEnvironment(overrides = {}) {
  const env = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (!sensitiveEnvironmentName(name)) env[name] = value;
  }
  return { ...env, ...overrides };
}

function runPowerShell(scriptPath, args = [], env = testEnvironment()) {
  return new Promise((resolve, reject) => {
    const child = spawn(POWERSHELL, [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      scriptPath,
      ...args,
    ], { windowsHide: true, env });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("exit", (code) => resolve({ code, stdout, stderr }));
  });
}

function runPowerShellCommand(command, env = testEnvironment()) {
  return new Promise((resolve, reject) => {
    const child = spawn(POWERSHELL, [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      command,
    ], { windowsHide: true, env });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("exit", (code) => resolve({ code, stdout, stderr }));
  });
}

function powerShellLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function windowsCommandLine(arguments_) {
  return arguments_.map((value) => {
    assert.equal(String(value).includes('"'), false);
    return `"${value}"`;
  }).join(" ");
}

async function reservePort(excluded = new Set()) {
  while (true) {
    const port = await new Promise((resolve, reject) => {
      const server = net.createServer();
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        server.close((error) => error ? reject(error) : resolve(address.port));
      });
    });
    if (port !== PROTECTED_RUNTIME_PORT && !excluded.has(port)) return port;
  }
}

async function waitForHttp(port, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await new Promise((resolve, reject) => {
        const req = request({ host: "127.0.0.1", port, path: "/", timeout: 500 }, (res) => {
          res.resume();
          res.on("end", resolve);
        });
        req.on("timeout", () => req.destroy(new Error("timeout")));
        req.on("error", reject);
        req.end();
      });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error(`listener ${port} did not become ready`);
}

async function waitForPortClosed(port, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await new Promise((resolve, reject) => {
        const socket = net.connect({ host: "127.0.0.1", port }, () => {
          socket.destroy();
          resolve();
        });
        socket.once("error", reject);
      });
    } catch {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`listener ${port} did not close`);
}

async function createLauncherFixture({
  delegateListener = false,
  parentControlPort = 0,
  shutdownExitCode = 0,
  autoExitMilliseconds = 0,
} = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "dev-erp-launcher-"));
  const app = path.join(root, "ui-workspace", "apps", "dev-erp");
  const ops = path.join(app, "ops");
  await mkdir(ops, { recursive: true });
  const launcher = path.join(ops, "run-dev-erp-background.ps1");
  const serverPath = path.join(app, "server.mjs");
  const shutdownToken = randomUUID();
  await copyFile(SOURCE_LAUNCHER, launcher);
  await writeFile(serverPath, `
import { writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const value = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
};
const host = value("--host", "127.0.0.1");
const port = Number(value("--port", "0"));
const shutdownToken = ${JSON.stringify(shutdownToken)};
const delegateListener = ${JSON.stringify(delegateListener)};
const parentControlPort = ${JSON.stringify(parentControlPort)};
const shutdownExitCode = ${JSON.stringify(shutdownExitCode)};
const autoExitMilliseconds = ${JSON.stringify(autoExitMilliseconds)};
writeFileSync(path.join(here, "fixture.pid"), String(process.pid));
writeFileSync(path.join(here, "fixture.argv.json"), JSON.stringify(process.argv.slice(1)));
writeFileSync(path.join(here, "fixture.env.json"), JSON.stringify({
  chat_provider: process.env.ERP_CHAT_PROVIDER || null,
  mail_collect: process.env.DEV_ERP_MAIL_COLLECT_SEC || null,
  auto_intake: process.env.DEV_ERP_AUTO_INTAKE || null,
  autosync: process.env.DEV_ERP_AUTOSYNC || null,
  morning_brief: process.env.DEV_ERP_MORNING_BRIEF || null,
  fileio: process.env.DEV_ERP_FILEIO || null,
  self_register: process.env.DEV_ERP_ALLOW_SELF_REGISTER || null,
  codex_bridge: process.env.DEV_ERP_CODEX_TASK_BRIDGE || null,
  codex_worker_url: process.env.DEV_ERP_CODEX_WORKER_URL || null,
  codex_worker_token_present: Boolean(process.env.DEV_ERP_CODEX_WORKER_TOKEN),
  codex_mock_write: process.env.DEV_ERP_CODEX_MOCK_WRITE_FILE || null,
  codex_home: process.env.CODEX_HOME || null,
  tls_key: process.env.DEV_ERP_TLS_KEY || null,
  cookie_secure_env: process.env.DEV_ERP_COOKIE_SECURE || null,
  node_options: process.env.NODE_OPTIONS || null,
  http_proxy: process.env.HTTP_PROXY || process.env.http_proxy || null,
  openai_key_present: Boolean(process.env.OPENAI_API_KEY),
  github_token_present: Boolean(process.env.GITHUB_TOKEN),
  generic_password_present: Boolean(process.env.SYNTHETIC_PASSWORD),
  generic_session_token_present: Boolean(process.env.SYNTHETIC_SESSION_TOKEN),
}));
const server = createServer((req, res) => {
  if (req.method === "POST"
      && req.url === "/__fixture_shutdown__"
      && req.headers["x-fixture-token"] === shutdownToken) {
    res.writeHead(202, { connection: "close" });
    res.end("stopping", () => server.close(() => process.exit(shutdownExitCode)));
    return;
  }
  res.end("ok");
});
if (delegateListener) {
  server.listen(parentControlPort, "127.0.0.1", () => {
    writeFileSync(path.join(here, "parent-control-ready"), "ready");
    const child = spawn(process.execPath, [
      path.join(here, "delegated-listener.mjs"),
      String(port),
      shutdownToken,
    ], { detached: true, stdio: "ignore", windowsHide: true });
    child.unref();
  });
} else {
  server.listen(port, host, () => {
    if (autoExitMilliseconds > 0) {
      setTimeout(() => server.close(() => process.exit(shutdownExitCode)), autoExitMilliseconds);
    }
  });
}
`, "utf8");
  await writeFile(path.join(app, "delegated-listener.mjs"), `
import { createServer } from "node:http";
const port = Number(process.argv[2]);
const shutdownToken = process.argv[3];
const server = createServer((req, res) => {
  if (req.method === "POST"
      && req.url === "/__fixture_shutdown__"
      && req.headers["x-fixture-token"] === shutdownToken) {
    res.writeHead(202, { connection: "close" });
    res.end("stopping", () => server.close(() => process.exit(0)));
    return;
  }
  res.end("delegated-ok");
});
server.listen(port, "127.0.0.1");
setTimeout(() => server.close(() => process.exit(0)), 60_000).unref();
`, "utf8");
  return {
    root,
    app,
    launcher,
    serverPath,
    pidFile: path.join(app, "fixture.pid"),
    envFile: path.join(app, "fixture.env.json"),
    argvFile: path.join(app, "fixture.argv.json"),
    parentControlReadyFile: path.join(app, "parent-control-ready"),
    shutdownToken,
  };
}

async function readFixturePid(pidFile) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      return Number((await readFile(pidFile, "utf8")).trim());
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error("fixture pid was not written");
}

async function stopChildProcess(child, timeoutMs = 5_000) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill();
  await Promise.race([
    exited,
    new Promise((_, reject) => setTimeout(
      () => reject(new Error("fixture child did not exit")),
      timeoutMs,
    )),
  ]);
}

async function shutdownFixture(port, token, timeoutMs = 5_000) {
  let statusCode;
  try {
    statusCode = await new Promise((resolve, reject) => {
      const req = request({
        host: "127.0.0.1",
        port,
        path: "/__fixture_shutdown__",
        method: "POST",
        headers: { "x-fixture-token": token, connection: "close" },
        timeout: 500,
      }, (res) => {
        res.resume();
        res.on("end", () => resolve(res.statusCode));
      });
      req.on("timeout", () => req.destroy(new Error("timeout")));
      req.on("error", reject);
      req.end();
    });
  } catch (error) {
    if (error?.code === "ECONNREFUSED") return;
    throw error;
  }
  assert.equal(statusCode, 202, "fixture-owned shutdown channel was not accepted");

  await waitForPortClosed(port, timeoutMs);
}

async function removeFixtureRoot(root) {
  await rm(root, {
    recursive: true,
    force: true,
    maxRetries: 50,
    retryDelay: 100,
  });
}

test("background launcher defaults to loopback core-only posture and requires opt-in switches", {
  skip: process.platform !== "win32",
}, async () => {
  const fixture = await createLauncherFixture();
  try {
    const port = await reservePort();
    const base = ["-Port", String(port), "-BackendRoot", fixture.root, "-DryRun"];
    const safe = await runPowerShell(fixture.launcher, base);
    assert.equal(safe.code, 0, safe.stderr);
    assert.match(safe.stdout, /host=127\.0\.0\.1/);
    assert.match(safe.stdout, /secure-cookie=auto/);
    assert.match(safe.stdout, /tls=auto/);
    assert.match(safe.stdout, /integrations=none/);
    assert.match(safe.stdout, /real-meta=off fixture=off/);

    const llmRejected = await runPowerShell(fixture.launcher, [...base, "-EnableLocalLlm"]);
    assert.notEqual(llmRejected.code, 0);
    assert.match(`${llmRejected.stdout}\n${llmRejected.stderr}`, /disabled by the 2026-07-23 owner policy/);

    const optedIn = await runPowerShell(fixture.launcher, [
      ...base,
      "-ListenOnLan",
      "-SecureCookie",
      "-EnableMailCollect",
      "-EnableAutoIntake",
      "-EnableAutosync",
      "-EnableMorningBrief",
      "-MorningBriefPublicUrl", "https://erp.invalid",
      "-MorningBriefDomainAllow", "example.invalid",
      "-EnableCodexWorker",
    ]);
    assert.equal(optedIn.code, 0, optedIn.stderr);
    assert.match(optedIn.stdout, /host=0\.0\.0\.0/);
    assert.match(optedIn.stdout, /secure-cookie=on/);
    assert.match(optedIn.stdout, /integrations=lan,mail-collect,auto-intake,autosync,morning-brief,codex-worker/);
  } finally {
    await removeFixtureRoot(fixture.root);
  }
});

test("foreground launcher remains attached and returns the exact Node exit status", {
  skip: process.platform !== "win32",
}, async () => {
  const fixture = await createLauncherFixture({
    shutdownExitCode: 7,
    autoExitMilliseconds: 5_000,
  });
  const port = await reservePort();
  const databasePath = path.join(fixture.app, "data", "scheduled.db");
  const processArguments = [
    fixture.serverPath,
    "--host", "127.0.0.1",
    "--port", String(port),
    "--knowledge_shell_root", fixture.root,
    "--no-real-meta",
    "--no-fixture",
    "--db", databasePath,
  ];
  const expectedCommandLine = windowsCommandLine([process.execPath, ...processArguments]);

  try {
    const command = [
      `$global:FixturePidPath = ${powerShellLiteral(fixture.pidFile)}`,
      `$global:FixtureExecutablePath = ${powerShellLiteral(process.execPath)}`,
      `$global:FixtureCommandLine = ${powerShellLiteral(expectedCommandLine)}`,
      "function global:Get-NetTCPConnection { param($LocalPort,$State,$ErrorAction); if (Test-Path -LiteralPath $global:FixturePidPath) { [pscustomobject]@{ OwningProcess=[int](Get-Content -LiteralPath $global:FixturePidPath -Raw) } } }",
      "function global:Get-CimInstance { param($ClassName,$Filter,$ErrorAction); [pscustomobject]@{ ExecutablePath=$global:FixtureExecutablePath; CommandLine=$global:FixtureCommandLine } }",
      `& ${powerShellLiteral(fixture.launcher)} -Port ${port} -BackendRoot ${powerShellLiteral(fixture.root)} -DatabasePath ${powerShellLiteral(databasePath)} -Foreground`,
      "exit $LASTEXITCODE",
    ].join("; ");
    const result = await runPowerShellCommand(command);
    assert.equal(result.code, 7, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /foreground running/);
    assert.match(result.stdout, /foreground exited: exit=7/);
    assert.equal(result.stdout.includes(databasePath), false);
    await waitForPortClosed(port);
    assert.deepEqual(JSON.parse(await readFile(fixture.argvFile, "utf8")), processArguments);
    const env = JSON.parse(await readFile(fixture.envFile, "utf8"));
    assert.equal(env.codex_bridge, "worker");
    assert.equal(env.fileio, null);
    assert.equal(env.self_register, null);
  } finally {
    await removeFixtureRoot(fixture.root);
  }
});

test("background launcher passes explicit split TLS paths without reporting them", {
  skip: process.platform !== "win32",
}, async () => {
  const fixture = await createLauncherFixture();
  const port = await reservePort();
  const certDir = path.join(fixture.root, "synthetic certificate location");
  const keyDir = path.join(fixture.root, "synthetic private key location");
  const certPath = path.join(certDir, "server.crt");
  const keyPath = path.join(keyDir, "server.key");
  const caPath = path.join(certDir, "ca.crt");
  let fixtureStarted = false;
  try {
    await mkdir(certDir, { recursive: true });
    await mkdir(keyDir, { recursive: true });
    await writeFile(certPath, "synthetic-certificate", "utf8");
    await writeFile(keyPath, "synthetic-private-key", "utf8");
    await writeFile(caPath, "synthetic-ca", "utf8");

    const pairOnly = await runPowerShell(fixture.launcher, [
      "-Port", String(port),
      "-BackendRoot", fixture.root,
      "-TlsCertPath", certPath,
      "-TlsKeyPath", keyPath,
      "-DryRun",
    ]);
    assert.equal(pairOnly.code, 0, pairOnly.stderr);
    assert.match(pairOnly.stdout, /tls=explicit/);
    for (const value of [certPath, keyPath]) {
      assert.equal(`${pairOnly.stdout}\n${pairOnly.stderr}`.includes(value), false);
    }

    const result = await runPowerShell(fixture.launcher, [
      "-Port", String(port),
      "-BackendRoot", fixture.root,
      "-TlsCertPath", certPath,
      "-TlsKeyPath", keyPath,
      "-TlsCaPath", caPath,
    ]);
    fixtureStarted = result.code === 0;
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /tls=explicit/);
    for (const value of [certPath, keyPath, caPath]) {
      assert.equal(`${result.stdout}\n${result.stderr}`.includes(value), false);
    }
    await waitForHttp(port);
    assert.deepEqual(JSON.parse(await readFile(fixture.argvFile, "utf8")), [
      fixture.serverPath,
      "--host", "127.0.0.1",
      "--port", String(port),
      "--knowledge_shell_root", fixture.root,
      "--no-real-meta",
      "--no-fixture",
      "--tls-cert", certPath,
      "--tls-key", keyPath,
      "--tls-ca", caPath,
    ]);
  } finally {
    if (fixtureStarted) await shutdownFixture(port, fixture.shutdownToken);
    await removeFixtureRoot(fixture.root);
  }
});

test("background launcher rejects incomplete TLS paths without disclosing them", {
  skip: process.platform !== "win32",
}, async () => {
  const fixture = await createLauncherFixture();
  const port = await reservePort();
  const certPath = path.join(fixture.root, "synthetic-cert-only.crt");
  const keyPath = path.join(fixture.root, "synthetic-key-only.key");
  const caPath = path.join(fixture.root, "synthetic-ca-only.crt");
  try {
    await writeFile(certPath, "synthetic-certificate", "utf8");
    await writeFile(keyPath, "synthetic-private-key", "utf8");
    await writeFile(caPath, "synthetic-ca", "utf8");
    for (const [parameter, value, expectedError] of [
      ["-TlsCertPath", certPath, /-TlsCertPath and -TlsKeyPath must be provided together/],
      ["-TlsKeyPath", keyPath, /-TlsCertPath and -TlsKeyPath must be provided together/],
      ["-TlsCaPath", caPath, /-TlsCaPath requires -TlsCertPath and -TlsKeyPath/],
    ]) {
      const result = await runPowerShell(fixture.launcher, [
        "-Port", String(port),
        "-BackendRoot", fixture.root,
        parameter, value,
        "-DryRun",
      ]);
      const output = `${result.stdout}\n${result.stderr}`;
      assert.notEqual(result.code, 0);
      assert.match(output, expectedError);
      assert.equal(output.includes(value), false);
    }
    await assert.rejects(readFile(fixture.pidFile, "utf8"), { code: "ENOENT" });
  } finally {
    await removeFixtureRoot(fixture.root);
  }
});

test("background launcher fails closed when listener enumeration fails", {
  skip: process.platform !== "win32",
}, async () => {
  const fixture = await createLauncherFixture();
  const unknownPath = path.join(fixture.root, "unknown-enumeration-listener.mjs");
  const port = await reservePort();
  await writeFile(unknownPath, `
import { createServer } from "node:http";
createServer((_req, res) => res.end("enumeration-owner-still-alive")).listen(Number(process.argv[2]), "127.0.0.1");
`, "utf8");
  const unknown = spawn(process.execPath, [unknownPath, String(port)], {
    stdio: "ignore",
    windowsHide: true,
    env: testEnvironment(),
  });
  try {
    await waitForHttp(port);
    const command = [
      "function global:Get-NetTCPConnection { param($LocalPort, $State, $ErrorAction) throw 'synthetic_listener_enumeration_failure' }",
      `& ${powerShellLiteral(fixture.launcher)} -Port ${port} -BackendRoot ${powerShellLiteral(fixture.root)}`,
    ].join("; ");
    const result = await runPowerShellCommand(command);
    assert.notEqual(result.code, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /synthetic_listener_enumeration_failure/);
    await waitForHttp(port);
    assert.equal(unknown.exitCode, null);
    await assert.rejects(readFile(fixture.pidFile, "utf8"), { code: "ENOENT" });
  } finally {
    await stopChildProcess(unknown);
    await removeFixtureRoot(fixture.root);
  }
});

test("background launcher refuses an unknown alternate-port owner without terminating it", {
  skip: process.platform !== "win32",
}, async () => {
  const fixture = await createLauncherFixture();
  const unknownPath = path.join(fixture.root, "unknown-listener.mjs");
  const port = await reservePort();
  await writeFile(unknownPath, `
import { createServer } from "node:http";
createServer((_req, res) => res.end("unknown-still-alive")).listen(Number(process.argv[2]), "127.0.0.1");
`, "utf8");
  const unknown = spawn(process.execPath, [unknownPath, String(port)], {
    stdio: "ignore",
    windowsHide: true,
    env: testEnvironment(),
  });
  try {
    await waitForHttp(port);
    const result = await runPowerShell(fixture.launcher, [
      "-Port", String(port),
      "-BackendRoot", fixture.root,
    ]);
    assert.notEqual(result.code, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /unidentified process/);
    assert.match(`${result.stdout}\n${result.stderr}`, /no process was terminated/);
    await waitForHttp(port);
    assert.equal(unknown.exitCode, null);
  } finally {
    await stopChildProcess(unknown);
    await removeFixtureRoot(fixture.root);
  }
});

test("background launcher rejects changed and extra argv for the same executable and server", {
  skip: process.platform !== "win32",
}, async () => {
  const fixture = await createLauncherFixture();
  const cases = [
    {
      name: "changed argument",
      mutate: (args) => args.map((value, index) => index === 6 ? `${value}-changed` : value),
    },
    {
      name: "extra argument",
      mutate: (args) => [...args, "--allow-self-register"],
    },
  ];
  try {
    for (const scenario of cases) {
      const port = await reservePort();
      const expected = [
        fixture.serverPath,
        "--host", "127.0.0.1",
        "--port", String(port),
        "--knowledge_shell_root", fixture.root,
        "--no-real-meta",
        "--no-fixture",
      ];
      const owner = spawn(process.execPath, scenario.mutate(expected), {
        stdio: "ignore",
        windowsHide: true,
        env: testEnvironment(),
      });
      try {
        await waitForHttp(port);
        const result = await runPowerShell(fixture.launcher, [
          "-Port", String(port),
          "-BackendRoot", fixture.root,
        ]);
        assert.notEqual(result.code, 0, scenario.name);
        assert.match(`${result.stdout}\n${result.stderr}`, /unidentified process/, scenario.name);
        await waitForHttp(port);
        assert.equal(owner.exitCode, null, scenario.name);
      } finally {
        await stopChildProcess(owner);
      }
    }
  } finally {
    await removeFixtureRoot(fixture.root);
  }
});

test("background launcher strips inherited sensitive env and restores only explicit opt-ins", {
  skip: process.platform !== "win32",
}, async () => {
  const fixture = await createLauncherFixture();
  const port = await reservePort();
  let fixtureStarted = false;
  try {
    const result = await runPowerShell(fixture.launcher, [
      "-Port", String(port),
      "-BackendRoot", fixture.root,
      "-SecureCookie",
      "-EnableMailCollect",
      "-EnableAutoIntake",
      "-EnableAutosync",
      "-EnableMorningBrief",
      "-MorningBriefPublicUrl", "https://erp.invalid",
      "-MorningBriefDomainAllow", "example.invalid",
      "-EnableCodexWorker",
    ], testEnvironment({
      DEV_ERP_FILEIO: "1",
      DEV_ERP_ALLOW_SELF_REGISTER: "1",
      DEV_ERP_TLS_KEY: "synthetic-test-key-path",
      DEV_ERP_COOKIE_SECURE: "1",
      DEV_ERP_CODEX_WORKER_URL: "https://worker.invalid",
      DEV_ERP_CODEX_WORKER_TOKEN: "synthetic-test-only",
      DEV_ERP_CODEX_SANDBOX: "read-only",
      DEV_ERP_CODEX_MOCK_WRITE_FILE: "synthetic-mock-path",
      CODEX_HOME: "synthetic-generic-codex-home",
      NODE_OPTIONS: "--no-warnings",
      HTTP_PROXY: "http://proxy.invalid",
      OPENAI_API_KEY: "synthetic-test-only",
      GITHUB_TOKEN: "synthetic-test-only",
      SYNTHETIC_PASSWORD: "synthetic-test-only",
      SYNTHETIC_SESSION_TOKEN: "synthetic-test-only",
    }));
    fixtureStarted = result.code === 0;
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /background started/);
    await waitForHttp(port);

    const env = JSON.parse(await readFile(fixture.envFile, "utf8"));
    assert.equal(env.chat_provider, null);
    assert.equal(env.mail_collect, "900");
    assert.equal(env.auto_intake, "1");
    assert.equal(env.autosync, "1");
    assert.equal(env.morning_brief, "1");
    assert.equal(env.codex_bridge, "worker");
    assert.equal(env.codex_worker_url, "https://worker.invalid");
    assert.equal(env.codex_worker_token_present, true);
    for (const name of [
      "fileio", "self_register", "codex_mock_write", "codex_home", "tls_key",
      "cookie_secure_env", "node_options", "http_proxy",
    ]) {
      assert.equal(env[name], null, `${name} should be stripped`);
    }
    for (const name of [
      "openai_key_present", "github_token_present", "generic_password_present",
      "generic_session_token_present",
    ]) {
      assert.equal(env[name], false, `${name} should be stripped`);
    }
    assert.ok(JSON.parse(await readFile(fixture.argvFile, "utf8")).includes("--secure-cookie"));
  } finally {
    if (fixtureStarted) await shutdownFixture(port, fixture.shutdownToken);
    await removeFixtureRoot(fixture.root);
  }
});

test("background launcher replaces only an exact executable and full command-line match", {
  skip: process.platform !== "win32",
}, async () => {
  const fixture = await createLauncherFixture();
  const port = await reservePort();
  let fixtureStarted = false;
  const args = ["-Port", String(port), "-BackendRoot", fixture.root];
  try {
    const first = await runPowerShell(fixture.launcher, args, testEnvironment({
      ERP_CHAT_PROVIDER: "ollama",
      DEV_ERP_MAIL_COLLECT_SEC: "900",
      DEV_ERP_AUTO_INTAKE: "1",
      DEV_ERP_AUTOSYNC: "1",
      DEV_ERP_MORNING_BRIEF: "1",
      DEV_ERP_FILEIO: "1",
      DEV_ERP_ALLOW_SELF_REGISTER: "1",
      DEV_ERP_TLS_KEY: "synthetic-test-key-path",
      DEV_ERP_CODEX_WORKER_TOKEN: "synthetic-test-only",
      DEV_ERP_CODEX_MOCK_WRITE_FILE: "synthetic-mock-path",
      CODEX_HOME: "synthetic-generic-codex-home",
      NODE_OPTIONS: "--no-warnings",
      HTTP_PROXY: "http://proxy.invalid",
      OPENAI_API_KEY: "synthetic-test-only",
      GITHUB_TOKEN: "synthetic-test-only",
      SYNTHETIC_PASSWORD: "synthetic-test-only",
      SYNTHETIC_SESSION_TOKEN: "synthetic-test-only",
    }));
    assert.equal(first.code, 0, first.stderr);
    fixtureStarted = true;
    await waitForHttp(port);
    const firstPid = await readFixturePid(fixture.pidFile);
    assert.deepEqual(JSON.parse(await readFile(fixture.envFile, "utf8")), {
      chat_provider: null,
      mail_collect: null,
      auto_intake: null,
      autosync: null,
      morning_brief: null,
      fileio: null,
      self_register: null,
      codex_bridge: "worker",
      codex_worker_url: null,
      codex_worker_token_present: false,
      codex_mock_write: null,
      codex_home: null,
      tls_key: null,
      cookie_secure_env: null,
      node_options: null,
      http_proxy: null,
      openai_key_present: false,
      github_token_present: false,
      generic_password_present: false,
      generic_session_token_present: false,
    });

    const dryRun = await runPowerShell(fixture.launcher, [...args, "-DryRun"]);
    assert.equal(dryRun.code, 0, dryRun.stderr);
    assert.match(dryRun.stdout, /action=would_replace_exact_match/);
    await waitForHttp(port);
    assert.equal(Number((await readFile(fixture.pidFile, "utf8")).trim()), firstPid);

    const second = await runPowerShell(fixture.launcher, args);
    assert.equal(second.code, 0, second.stderr);
    await waitForHttp(port);
    const secondPid = await readFixturePid(fixture.pidFile);
    assert.notEqual(secondPid, firstPid);
  } finally {
    if (fixtureStarted) await shutdownFixture(port, fixture.shutdownToken);
    await removeFixtureRoot(fixture.root);
  }
});

test("background launcher attests the spawned PID and cleans only its retained handle on failure", {
  skip: process.platform !== "win32",
}, async () => {
  const port = await reservePort();
  const parentControlPort = await reservePort(new Set([port]));
  const fixture = await createLauncherFixture({ delegateListener: true, parentControlPort });
  try {
    const result = await runPowerShell(fixture.launcher, [
      "-Port", String(port),
      "-BackendRoot", fixture.root,
    ]);
    assert.notEqual(result.code, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /spawned PID is not the sole listener/);
    await readFile(fixture.parentControlReadyFile, "utf8");
    await waitForPortClosed(parentControlPort);
    await waitForHttp(port);
  } finally {
    await shutdownFixture(port, fixture.shutdownToken);
    await removeFixtureRoot(fixture.root);
  }
});

function parseLauncherIntegrations(stdout) {
  const match = stdout.match(/(?:^|\s)integrations=([^\s]+)/);
  assert.ok(match, "launcher must emit integrations= summary");
  const raw = match[1].trim();
  if (raw === "none") return new Set();
  return new Set(raw.split(",").map((s) => s.trim()).filter(Boolean));
}

async function stopChildProcessTree(child, timeoutMs = 5_000) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === "win32" && child.pid) {
    try {
      execFileSync(TASKKILL, ["/T", "/F", "/PID", String(child.pid)], { stdio: "ignore" });
    } catch {}
  }
  await stopChildProcess(child, timeoutMs).catch(() => {});
}

function runCmd(cwd, scriptName, env = testEnvironment(), timeoutMs = 15_000) {
  return new Promise((resolve, reject) => {
    const child = spawn(CMD, ["/d", "/c", scriptName], {
      cwd,
      windowsHide: true,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timer = null;
    let settled = false;

    const cleanupTimer = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });

    child.on("error", async (err) => {
      if (settled) return;
      settled = true;
      cleanupTimer();
      await stopChildProcessTree(child).catch(() => {});
      reject(err);
    });

    child.on("exit", (code, signal) => {
      if (settled) return;
      settled = true;
      cleanupTimer();
      if (code === null) {
        reject(new Error(`runCmd process terminated abnormally without exit code (signal=${signal})`));
        return;
      }
      resolve({ code, stdout, stderr });
    });

    timer = setTimeout(async () => {
      if (settled) return;
      settled = true;
      await stopChildProcessTree(child).catch(() => {});
      reject(new Error(`runCmd timed out after ${timeoutMs}ms (script=${scriptName})`));
    }, timeoutMs);
  });
}

async function readJsonFileWithRetry(filePath, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const content = await readFile(filePath, "utf8");
      if (content && content.trim().length > 0) {
        return JSON.parse(content);
      }
    } catch (err) {
      if (err?.code !== "ENOENT" && !(err instanceof SyntaxError)) {
        throw err;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for parseable JSON at ${filePath}`);
}

async function createStartBatFixture({ runtimeFolder = true } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "dev-erp-bat-"));
  const app = runtimeFolder
    ? path.join(root, "Soulforge-runtime", "ui-workspace", "apps", "dev-erp")
    : path.join(root, "Soulforge-dev", "ui-workspace", "apps", "dev-erp");
  await mkdir(app, { recursive: true });
  const batPath = path.join(app, "start-windows.bat");
  await copyFile(SOURCE_START_BAT, batPath);
  const serverPath = path.join(app, "server.mjs");
  await writeFile(serverPath, `
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const outputFile = process.env.DEV_ERP_FIXTURE_OUTPUT_FILE || "bat_fixture.env.json";
writeFileSync(path.join(here, outputFile), JSON.stringify({
  port: process.env.DEV_ERP_PORT || null,
  host: process.env.DEV_ERP_HOST || null,
  auto_intake: process.env.DEV_ERP_AUTO_INTAKE || null,
  autosync: process.env.DEV_ERP_AUTOSYNC || null,
  intake_llm: process.env.DEV_ERP_INTAKE_LLM || null,
  mail_collect: process.env.DEV_ERP_MAIL_COLLECT_SEC || null,
}));
process.exit(0);
`, "utf8");
  return {
    root,
    app,
    batPath,
    envFile: path.join(app, "bat_fixture.env.json"),
  };
}

test("start-windows.bat does not default DEV_ERP_AUTO_INTAKE and DEV_ERP_AUTOSYNC on port 4300 and preserves explicit opt-in", {
  skip: process.platform !== "win32",
}, async () => {
  const fixture = await createStartBatFixture({ runtimeFolder: true });
  // Synthetic dummy values satisfy start-windows.bat lines 16-27 fail-closed validation on port 4300 without inspecting real env/credentials.
  const runtimeEnv = testEnvironment({
    DEV_ERP_CODEX_WORKER_URL: "https://worker.invalid",
    DEV_ERP_CODEX_WORKER_TOKEN: "synthetic-token",
    DEV_ERP_CODEX_WORKER_EXPECTED_IDENTITY_HASH: "synthetic-hash",
    DEV_ERP_CODEX_WORKER_EXPECTED_RUNTIME_IDENTITY_SHA256: "synthetic-sha256",
    DEV_ERP_CODEX_WORKER_ATTEST_PUBLIC_KEY_FILE: "synthetic-attest-file",
    DEV_ERP_CODEX_WORKER_EXPECTED_ATTESTATION_KEY_ID: "synthetic-key-id",
    DEV_ERP_BACKEND_ROOT: fixture.root,
    DEV_ERP_CODEX_TURN_PROJECTION_ROOT: path.join(fixture.root, "turn"),
    DEV_ERP_CODEX_WORKSPACE_REGISTRY: path.join(fixture.root, "workspaces.json"),
    DEV_ERP_CODEX_TRUST_DOMAIN: "synthetic-domain",
    DEV_ERP_CODEX_TASK_ATTACHMENT_ROOT: path.join(fixture.root, "attachments"),
    DEV_ERP_CODEX_MESSAGE_PAYLOAD_ROOT: path.join(fixture.root, "payload"),
  });
  try {
    // Case 1: absent flags -> both flags remain un-defaulted (null)
    const out1 = path.join(fixture.app, "bat_fixture.case1.env.json");
    const defaultResult = await runCmd(fixture.app, "start-windows.bat", {
      ...runtimeEnv,
      DEV_ERP_FIXTURE_OUTPUT_FILE: "bat_fixture.case1.env.json",
    });
    assert.equal(defaultResult.code, 0, `${defaultResult.stdout}\n${defaultResult.stderr}`);
    const defaultEnv = await readJsonFileWithRetry(out1);
    assert.equal(defaultEnv.port, "4300");
    assert.equal(defaultEnv.intake_llm, "none");
    assert.equal(defaultEnv.auto_intake, null, "DEV_ERP_AUTO_INTAKE must not be defaulted by start-windows.bat on port 4300");
    assert.equal(defaultEnv.autosync, null, "DEV_ERP_AUTOSYNC must not be defaulted by start-windows.bat on port 4300");

    // Case 2: explicit DEV_ERP_AUTO_INTAKE only -> auto_intake="1", autosync stays un-defaulted (null)
    const out2 = path.join(fixture.app, "bat_fixture.case2.env.json");
    const autoIntakeOnlyResult = await runCmd(fixture.app, "start-windows.bat", {
      ...runtimeEnv,
      DEV_ERP_AUTO_INTAKE: "1",
      DEV_ERP_FIXTURE_OUTPUT_FILE: "bat_fixture.case2.env.json",
    });
    assert.equal(autoIntakeOnlyResult.code, 0, `${autoIntakeOnlyResult.stdout}\n${autoIntakeOnlyResult.stderr}`);
    const autoIntakeOnlyEnv = await readJsonFileWithRetry(out2);
    assert.equal(autoIntakeOnlyEnv.port, "4300");
    assert.equal(autoIntakeOnlyEnv.auto_intake, "1");
    assert.equal(autoIntakeOnlyEnv.autosync, null, "DEV_ERP_AUTOSYNC must not be defaulted when only DEV_ERP_AUTO_INTAKE is set");

    // Case 3: explicit DEV_ERP_AUTOSYNC only -> autosync="1", auto_intake stays un-defaulted (null)
    const out3 = path.join(fixture.app, "bat_fixture.case3.env.json");
    const autosyncOnlyResult = await runCmd(fixture.app, "start-windows.bat", {
      ...runtimeEnv,
      DEV_ERP_AUTOSYNC: "1",
      DEV_ERP_FIXTURE_OUTPUT_FILE: "bat_fixture.case3.env.json",
    });
    assert.equal(autosyncOnlyResult.code, 0, `${autosyncOnlyResult.stdout}\n${autosyncOnlyResult.stderr}`);
    const autosyncOnlyEnv = await readJsonFileWithRetry(out3);
    assert.equal(autosyncOnlyEnv.port, "4300");
    assert.equal(autosyncOnlyEnv.auto_intake, null, "DEV_ERP_AUTO_INTAKE must not be defaulted when only DEV_ERP_AUTOSYNC is set");
    assert.equal(autosyncOnlyEnv.autosync, "1");

    // Case 4: both explicit opt-ins -> both preserved
    const out4 = path.join(fixture.app, "bat_fixture.case4.env.json");
    const optInResult = await runCmd(fixture.app, "start-windows.bat", {
      ...runtimeEnv,
      DEV_ERP_AUTO_INTAKE: "1",
      DEV_ERP_AUTOSYNC: "1",
      DEV_ERP_FIXTURE_OUTPUT_FILE: "bat_fixture.case4.env.json",
    });
    assert.equal(optInResult.code, 0, `${optInResult.stdout}\n${optInResult.stderr}`);
    const optInEnv = await readJsonFileWithRetry(out4);
    assert.equal(optInEnv.port, "4300");
    assert.equal(optInEnv.auto_intake, "1");
    assert.equal(optInEnv.autosync, "1");
  } finally {
    await removeFixtureRoot(fixture.root);
  }
});

test("start-windows.bat does not default DEV_ERP_AUTO_INTAKE and DEV_ERP_AUTOSYNC on dev port 4310 and preserves explicit opt-in", {
  skip: process.platform !== "win32",
}, async () => {
  const fixture = await createStartBatFixture({ runtimeFolder: false });
  const devEnv = testEnvironment({
    DEV_ERP_BACKEND_ROOT: fixture.root,
    DEV_ERP_CODEX_TURN_PROJECTION_ROOT: path.join(fixture.root, "turn"),
    DEV_ERP_CODEX_WORKSPACE_REGISTRY: path.join(fixture.root, "workspaces.json"),
    DEV_ERP_CODEX_TASK_ATTACHMENT_ROOT: path.join(fixture.root, "attachments"),
    DEV_ERP_CODEX_MESSAGE_PAYLOAD_ROOT: path.join(fixture.root, "payload"),
  });
  try {
    // Case 1: absent flags -> both flags remain un-defaulted (null)
    const out1 = path.join(fixture.app, "bat_fixture.dev1.env.json");
    const defaultResult = await runCmd(fixture.app, "start-windows.bat", {
      ...devEnv,
      DEV_ERP_FIXTURE_OUTPUT_FILE: "bat_fixture.dev1.env.json",
    });
    assert.equal(defaultResult.code, 0, `${defaultResult.stdout}\n${defaultResult.stderr}`);
    const defaultEnv = await readJsonFileWithRetry(out1);
    assert.equal(defaultEnv.port, "4310");
    assert.equal(defaultEnv.intake_llm, null);
    assert.equal(defaultEnv.auto_intake, null, "DEV_ERP_AUTO_INTAKE must not be defaulted by start-windows.bat on port 4310");
    assert.equal(defaultEnv.autosync, null, "DEV_ERP_AUTOSYNC must not be defaulted by start-windows.bat on port 4310");

    // Case 2: explicit opt-in -> preserved
    const out2 = path.join(fixture.app, "bat_fixture.dev2.env.json");
    const optInResult = await runCmd(fixture.app, "start-windows.bat", {
      ...devEnv,
      DEV_ERP_AUTO_INTAKE: "1",
      DEV_ERP_AUTOSYNC: "1",
      DEV_ERP_FIXTURE_OUTPUT_FILE: "bat_fixture.dev2.env.json",
    });
    assert.equal(optInResult.code, 0, `${optInResult.stdout}\n${optInResult.stderr}`);
    const optInEnv = await readJsonFileWithRetry(out2);
    assert.equal(optInEnv.port, "4310");
    assert.equal(optInEnv.auto_intake, "1");
    assert.equal(optInEnv.autosync, "1");
  } finally {
    await removeFixtureRoot(fixture.root);
  }
});

test("background launcher defaults to mutation routes OFF on port 4300 when flags are absent", {
  skip: process.platform !== "win32",
}, async () => {
  const fixture = await createLauncherFixture();
  try {
    const base = ["-Port", "4300", "-BackendRoot", fixture.root, "-DryRun"];
    const safe = await runPowerShell(fixture.launcher, base);
    assert.equal(safe.code, 0, safe.stderr);
    assert.match(safe.stdout, /port=4300/);
    const safeIntegrations = parseLauncherIntegrations(safe.stdout);
    assert.equal(safeIntegrations.has("auto-intake"), false);
    assert.equal(safeIntegrations.has("autosync"), false);

    // -EnableAutosync alone does not require -EnableMailCollect
    const autosyncOnly = await runPowerShell(fixture.launcher, [
      ...base,
      "-EnableAutosync",
    ]);
    assert.equal(autosyncOnly.code, 0, autosyncOnly.stderr);
    const autosyncIntegrations = parseLauncherIntegrations(autosyncOnly.stdout);
    assert.equal(autosyncIntegrations.has("autosync"), true);
    assert.equal(autosyncIntegrations.has("auto-intake"), false);

    // -EnableAutoIntake requires -EnableMailCollect per launcher parameter contract
    const autoIntake = await runPowerShell(fixture.launcher, [
      ...base,
      "-EnableMailCollect",
      "-EnableAutoIntake",
    ]);
    assert.equal(autoIntake.code, 0, autoIntake.stderr);
    const autoIntakeIntegrations = parseLauncherIntegrations(autoIntake.stdout);
    assert.equal(autoIntakeIntegrations.has("auto-intake"), true);
    assert.equal(autoIntakeIntegrations.has("mail-collect"), true);
    assert.equal(autoIntakeIntegrations.has("autosync"), false);

    // Both flags opted in
    const bothOptedIn = await runPowerShell(fixture.launcher, [
      ...base,
      "-EnableMailCollect",
      "-EnableAutoIntake",
      "-EnableAutosync",
    ]);
    assert.equal(bothOptedIn.code, 0, bothOptedIn.stderr);
    const bothIntegrations = parseLauncherIntegrations(bothOptedIn.stdout);
    assert.equal(bothIntegrations.has("auto-intake"), true);
    assert.equal(bothIntegrations.has("autosync"), true);
    assert.equal(bothIntegrations.has("mail-collect"), true);
  } finally {
    await removeFixtureRoot(fixture.root);
  }
});
