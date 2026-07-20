import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  inspectMailCollectorRelease,
  preflightSecureMailLauncher,
  runMailBridge,
} from "./mail_bridge.mjs";


function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function summary() {
  return {
    schema_version: "email.fetch.team_mailbox_run.v1",
    partial: false,
    mailboxes_total: 1,
    mailboxes_enabled: 1,
    mailboxes_run: 1,
    mailboxes_skipped: 0,
    total_events: 0,
    total_new_events: 0,
    total_duplicates: 0,
    errors: [],
  };
}

function option(args, name) {
  const index = args.indexOf(name);
  assert.notEqual(index, -1);
  return args[index + 1];
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "mail-bridge-capsule-test-"));
  const dataRoot = join(root, "data");
  const privateConfigRoot = join(dataRoot, "config");
  const sourceRoot = join(root, "public-mail");
  const collectorRoot = join(sourceRoot, "collector");
  await mkdir(privateConfigRoot, { recursive: true });
  await mkdir(collectorRoot, { recursive: true });
  const pythonExecutable = join(root, "python-synthetic.exe");
  const teamCliPath = join(sourceRoot, "team_cli.py");
  const registerPath = join(privateConfigRoot, "team_mailboxes.json");
  const credentialPath = join(privateConfigRoot, "mailbox.env");
  const pythonBytes = Buffer.from("trusted synthetic python runtime\n");
  const cliBytes = Buffer.from("# trusted synthetic mail CLI\n");
  const identityGuardBytes = Buffer.from("# trusted synthetic identity guard\n");
  const collectorBytes = Buffer.from("# trusted synthetic mailbox collector\n");
  const registerBytes = Buffer.from(`${JSON.stringify({
    schema_version: "email.fetch.team_mailbox_register.v1",
    mailboxes: [{ enabled: true, env_file: "mailbox.env" }],
  })}\n`);
  await writeFile(pythonExecutable, pythonBytes);
  await writeFile(teamCliPath, cliBytes);
  await writeFile(join(sourceRoot, "file_identity_guard.py"), identityGuardBytes);
  await writeFile(join(collectorRoot, "team_mailboxes.py"), collectorBytes);
  await writeFile(registerPath, registerBytes);
  await writeFile(credentialPath, "SYNTHETIC_SECRET_MUST_NOT_BE_COPIED=sentinel\n");
  const release = await inspectMailCollectorRelease(teamCliPath);
  return {
    root,
    pythonExecutable,
    pythonBytes,
    teamCliPath,
    cliBytes,
    identityGuardBytes,
    collectorBytes,
    registerPath,
    registerBytes,
    credentialPath,
    binding: {
      dataRoot,
      privateConfigRoot,
      pythonExecutable,
      teamCliPath,
      teamCliSha256: digest(cliBytes),
      collectorTreeSha256: release.collector_tree_sha256,
      registerPath,
      registerSha256: digest(registerBytes),
      limit: 25,
    },
  };
}

test("mail bridge executes captured code/register and a pinned runtime when source paths swap", async () => {
  const f = await fixture();
  let capsuleRoot;
  let runtimePath;
  try {
    const result = await runMailBridge(f.binding, {
      executor: async ({ executablePath, args, cwd, timeoutMs, lockFiles }) => {
        capsuleRoot = cwd;
        runtimePath = executablePath;
        assert.equal(timeoutMs, 10 * 60 * 1000);
        assert.deepEqual(args.slice(0, 5), ["-I", "-B", "-S", "-X", "utf8"]);
        const capsuleCliPath = args[5];
        assert.notEqual(capsuleCliPath, f.teamCliPath);
        assert.notEqual(option(args, "--register"), f.registerPath);
        assert.equal(option(args, "--register-origin"), f.registerPath);
        assert.deepEqual(await readFile(capsuleCliPath), f.cliBytes);
        assert.deepEqual(
          await readFile(join(dirname(capsuleCliPath), "file_identity_guard.py")),
          f.identityGuardBytes,
        );
        assert.deepEqual(
          await readFile(join(dirname(capsuleCliPath), "collector", "team_mailboxes.py")),
          f.collectorBytes,
        );
        assert.deepEqual(await readFile(option(args, "--register")), f.registerBytes);

        const manifestText = await readFile(option(args, "--identity-manifest"), "utf8");
        assert.equal(digest(manifestText), option(args, "--identity-manifest-sha256"));
        assert.equal(manifestText.includes("SYNTHETIC_SECRET_MUST_NOT_BE_COPIED"), false);
        const credentialLock = lockFiles.find((row) => row.path === f.credentialPath);
        assert.deepEqual(credentialLock, {
          path: f.credentialPath,
          verifyDigest: false,
          requireProtectedAcl: false,
        });
        const manifest = JSON.parse(manifestText);
        assert.deepEqual(Object.keys(manifest.credentials[0]).sort(), ["env_file", "identity"]);

        await rename(f.teamCliPath, `${f.teamCliPath}.trusted`);
        await writeFile(f.teamCliPath, "# swapped executable payload\n");
        await writeFile(
          join(dirname(f.teamCliPath), "collector", "team_mailboxes.py"),
          "# swapped collector payload\n",
        );
        await rename(f.registerPath, `${f.registerPath}.trusted`);
        await writeFile(f.registerPath, "{\"swapped\":true}\n");
        assert.deepEqual(await readFile(capsuleCliPath), f.cliBytes);
        assert.deepEqual(
          await readFile(join(dirname(capsuleCliPath), "collector", "team_mailboxes.py")),
          f.collectorBytes,
        );
        assert.deepEqual(await readFile(option(args, "--register")), f.registerBytes);
        assert.deepEqual(await readFile(executablePath), f.pythonBytes);
        return { exitCode: 0, timedOut: false, stdout: JSON.stringify(summary()), stderr: "" };
      },
    });
    assert.equal(result.status, "ok");
    assert.equal(result.write_count_known, true);
    await assert.rejects(access(capsuleRoot), { code: "ENOENT" });
    await assert.rejects(access(runtimePath), { code: "ENOENT" });
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("mail bridge rejects a collector tree that differs from the externally pinned release", async () => {
  const f = await fixture();
  try {
    await writeFile(join(dirname(f.teamCliPath), "collector", "team_mailboxes.py"), "# changed release\n");
    await assert.rejects(
      runMailBridge(f.binding, { executor: async () => ({}) }),
      { code: "mail_bridge_collector_tree_digest_mismatch" },
    );
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("cleanup leaves a replacement capsule root untouched", async () => {
  const f = await fixture();
  let replacementRoot;
  let displacedRoot;
  try {
    const result = await runMailBridge(f.binding, {
      executor: async ({ cwd }) => {
        replacementRoot = cwd;
        displacedRoot = `${cwd}-displaced`;
        await rename(cwd, displacedRoot);
        await mkdir(cwd);
        await writeFile(join(cwd, "replacement-marker.txt"), "not-owned\n");
        return { exitCode: 0, timedOut: false, stdout: JSON.stringify(summary()), stderr: "" };
      },
    });
    assert.equal(result.status, "failed");
    assert.deepEqual(await readFile(join(replacementRoot, "replacement-marker.txt"), "utf8"), "not-owned\n");
    assert.equal((await readdir(displacedRoot)).length > 0, true);
  } finally {
    if (replacementRoot) await rm(replacementRoot, { recursive: true, force: true });
    if (displacedRoot) await rm(displacedRoot, { recursive: true, force: true });
    await rm(f.root, { recursive: true, force: true });
  }
});

test("real Windows launcher locks the release and runs the hard-linked capsule Python", {
  skip: process.platform !== "win32",
  timeout: 120_000,
}, async () => {
  const root = await mkdtemp(join(tmpdir(), "mail-bridge-real-launch-"));
  try {
    const dataRoot = join(root, "data");
    const privateConfigRoot = join(dataRoot, "config");
    await mkdir(privateConfigRoot, { recursive: true });
    const teamCliPath = fileURLToPath(new URL("../gateway/mail_fetch/team_cli.py", import.meta.url));
    const registerPath = join(privateConfigRoot, "team_mailboxes.json");
    const registerBytes = Buffer.from(`${JSON.stringify({
      schema_version: "email.fetch.team_mailbox_register.v1",
      mailboxes: [],
    })}\n`);
    await writeFile(registerPath, registerBytes);
    const pythonExecutable = execFileSync(
      "python",
      ["-c", "import sys; print(sys.executable)"],
      { encoding: "utf8", windowsHide: true },
    ).trim();
    const release = await inspectMailCollectorRelease(teamCliPath);
    const runtimeDirectory = dirname(pythonExecutable);
    const beforeRuntimePins = (await readdir(runtimeDirectory))
      .filter((name) => name.startsWith(".soulforge-mail-bridge-"));
    const result = await runMailBridge({
      dataRoot,
      privateConfigRoot,
      pythonExecutable,
      teamCliPath,
      teamCliSha256: release.team_cli_sha256,
      collectorTreeSha256: release.collector_tree_sha256,
      registerPath,
      registerSha256: digest(registerBytes),
      limit: 25,
    });
    assert.equal(result.status, "ok");
    assert.equal(result.spawned, true);
    assert.equal(result.mailboxes_total, 0);
    const afterRuntimePins = (await readdir(runtimeDirectory))
      .filter((name) => name.startsWith(".soulforge-mail-bridge-"));
    assert.deepEqual(afterRuntimePins, beforeRuntimePins);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("real capsule launcher discovers and preloads a nested password before mailbox work", {
  skip: process.platform !== "win32",
  timeout: 120_000,
}, async () => {
  const root = await mkdtemp(join(tmpdir(), "mail-bridge-nested-credential-"));
  let acceptedSocket;
  const server = createServer((socket) => {
    acceptedSocket = socket;
  });
  try {
    await new Promise((resolveListen, rejectListen) => {
      server.once("error", rejectListen);
      server.listen(0, "127.0.0.1", resolveListen);
    });
    const port = server.address().port;
    const dataRoot = join(root, "data");
    const privateConfigRoot = join(dataRoot, "config");
    await mkdir(privateConfigRoot, { recursive: true });
    const teamCliPath = fileURLToPath(new URL("../gateway/mail_fetch/team_cli.py", import.meta.url));
    const registerPath = join(privateConfigRoot, "team_mailboxes.json");
    const credentialPath = join(privateConfigRoot, "mailbox.env");
    const nestedCredentialPath = join(privateConfigRoot, "secrets", "hiworks-password.txt");
    const registerBytes = Buffer.from(`${JSON.stringify({
      schema_version: "email.fetch.team_mailbox_register.v1",
      mailboxes: [{
        id: "nested-password",
        account_id: "synthetic",
        email: "nested@example.test",
        display_name: "Nested Password",
        provider: "hiworks",
        enabled: true,
        env_file: "mailbox.env",
        workspace: "synthetic",
      }],
    })}\n`);
    await writeFile(registerPath, registerBytes);
    await mkdir(dirname(nestedCredentialPath), { recursive: true });
    await writeFile(nestedCredentialPath, "synthetic-password-must-not-escape\n");
    await writeFile(credentialPath, [
      "HIWORKS_POP3_HOST=127.0.0.1",
      `HIWORKS_POP3_PORT=${port}`,
      "HIWORKS_POP3_USERNAME=synthetic",
      "HIWORKS_POP3_TIMEOUT_SEC=5",
      "EMAIL_FETCH_RETRY_MAX=1",
      "HIWORKS_POP3_PASSWORD_FILE=secrets/hiworks-password.txt",
      "",
    ].join("\n"));
    const pythonExecutable = execFileSync(
      "python",
      ["-c", "import sys; print(sys.executable)"],
      { encoding: "utf8", windowsHide: true },
    ).trim();
    const release = await inspectMailCollectorRelease(teamCliPath);
    const bridgePromise = runMailBridge({
      dataRoot,
      privateConfigRoot,
      pythonExecutable,
      teamCliPath,
      teamCliSha256: release.team_cli_sha256,
      collectorTreeSha256: release.collector_tree_sha256,
      registerPath,
      registerSha256: digest(registerBytes),
      limit: 25,
    });
    await new Promise((resolveConnection, rejectConnection) => {
      const deadline = setTimeout(
        () => rejectConnection(new Error("synthetic POP3 connection did not start")),
        60_000,
      );
      const poll = () => {
        if (acceptedSocket) {
          clearTimeout(deadline);
          resolveConnection();
          return;
        }
        setTimeout(poll, 25);
      };
      poll();
    });
    await assert.rejects(
      rename(nestedCredentialPath, `${nestedCredentialPath}.replaced`),
      (error) => ["EACCES", "EBUSY", "EPERM"].includes(error?.code),
    );
    acceptedSocket.destroy();
    const result = await bridgePromise;
    assert.equal(result.status, "partial");
    assert.equal(result.spawned, true);
    assert.equal(result.mailboxes_enabled, 1);
    assert.equal(result.mailboxes_run, 1);
    assert.deepEqual(result.error_codes, ["mail_child_failed"]);
    assert.equal(JSON.stringify(result).includes("synthetic-password-must-not-escape"), false);
    await access(nestedCredentialPath);
  } finally {
    if (acceptedSocket) acceptedSocket.destroy();
    await new Promise((resolveClose) => server.close(resolveClose));
    await rm(root, { recursive: true, force: true });
  }
});

test("real capsule launcher rejects nested credential junction traversal", {
  skip: process.platform !== "win32",
  timeout: 120_000,
}, async (t) => {
  const root = await mkdtemp(join(tmpdir(), "mail-bridge-nested-junction-"));
  try {
    const dataRoot = join(root, "data");
    const privateConfigRoot = join(dataRoot, "config");
    const outsideRoot = join(root, "outside");
    await mkdir(privateConfigRoot, { recursive: true });
    await mkdir(outsideRoot, { recursive: true });
    await writeFile(join(outsideRoot, "password.txt"), "synthetic-outside\n");
    try {
      await symlink(outsideRoot, join(privateConfigRoot, "linked"), "junction");
    } catch (error) {
      if (["EACCES", "EPERM"].includes(error?.code)) {
        t.skip("junction creation is unavailable on this Windows profile");
        return;
      }
      throw error;
    }
    const teamCliPath = fileURLToPath(new URL("../gateway/mail_fetch/team_cli.py", import.meta.url));
    const registerPath = join(privateConfigRoot, "team_mailboxes.json");
    const registerBytes = Buffer.from(`${JSON.stringify({
      schema_version: "email.fetch.team_mailbox_register.v1",
      mailboxes: [{
        id: "nested-junction",
        email: "nested@example.test",
        provider: "hiworks",
        enabled: true,
        env_file: "mailbox.env",
      }],
    })}\n`);
    await writeFile(registerPath, registerBytes);
    await writeFile(
      join(privateConfigRoot, "mailbox.env"),
      "HIWORKS_POP3_PASSWORD_FILE=linked/password.txt\n",
    );
    const pythonExecutable = execFileSync(
      "python",
      ["-c", "import sys; print(sys.executable)"],
      { encoding: "utf8", windowsHide: true },
    ).trim();
    const release = await inspectMailCollectorRelease(teamCliPath);
    const result = await runMailBridge({
      dataRoot,
      privateConfigRoot,
      pythonExecutable,
      teamCliPath,
      teamCliSha256: release.team_cli_sha256,
      collectorTreeSha256: release.collector_tree_sha256,
      registerPath,
      registerSha256: digest(registerBytes),
      limit: 25,
    });

    assert.equal(result.status, "failed");
    assert.equal(result.spawned, false);
    assert.deepEqual(result.error_codes, ["mail_child_spawn_failed"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("secure launcher rejects an ambient SystemRoot that selects an arbitrary PowerShell tree", {
  skip: process.platform !== "win32",
}, async () => {
  const root = await mkdtemp(join(tmpdir(), "mail-bridge-fake-system-root-"));
  try {
    const fakePowerShell = join(root, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
    await mkdir(dirname(fakePowerShell), { recursive: true });
    await writeFile(fakePowerShell, "synthetic untrusted powershell\n");
    const moduleUrl = new URL("./mail_bridge.mjs", import.meta.url).href;
    const script = `
      process.env.SystemRoot = ${JSON.stringify(root)};
      process.env.WINDIR = ${JSON.stringify(root)};
      const { preflightSecureMailLauncher } = await import(${JSON.stringify(moduleUrl)});
      try {
        await preflightSecureMailLauncher();
        process.stdout.write(JSON.stringify({ accepted: true }));
      } catch (error) {
        process.stdout.write(JSON.stringify({ accepted: false, code: error.code }));
      }
    `;
    const stdout = execFileSync(process.execPath, ["--input-type=module", "--eval", script], {
      encoding: "utf8",
      windowsHide: true,
      env: process.env,
    });
    assert.deepEqual(JSON.parse(stdout), {
      accepted: false,
      code: "mail_bridge_secure_launch_unsupported",
    });
    assert.deepEqual(await preflightSecureMailLauncher(), { supported: true });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("secure Python launch ignores ambient Python injection and imports without site paths", {
  skip: process.platform !== "win32",
  timeout: 120_000,
}, async () => {
  const root = await mkdtemp(join(tmpdir(), "mail-bridge-isolated-python-"));
  const priorPythonPath = process.env.PYTHONPATH;
  const priorPythonHome = process.env.PYTHONHOME;
  try {
    const sourceRoot = join(root, "release");
    const collectorRoot = join(sourceRoot, "collector");
    const dataRoot = join(root, "data");
    const privateConfigRoot = join(dataRoot, "config");
    const ambientRoot = join(root, "ambient-python-injection");
    await mkdir(collectorRoot, { recursive: true });
    await mkdir(privateConfigRoot, { recursive: true });
    await mkdir(ambientRoot, { recursive: true });
    await writeFile(join(ambientRoot, "ambient_injection.py"), "raise RuntimeError('ambient import executed')\n");
    const teamCliPath = join(sourceRoot, "team_cli.py");
    const scriptBytes = Buffer.from(`
import importlib.util
import json
import os
from pathlib import Path
import sys

operation_temp = Path.cwd() / "temp"
checks = [
    sys.flags.isolated == 1,
    sys.flags.no_user_site == 1,
    sys.flags.no_site == 1,
    sys.flags.dont_write_bytecode == 1,
    os.environ.get("PYTHONNOUSERSITE") == "1",
    "PYTHONPATH" not in os.environ,
    "PYTHONHOME" not in os.environ,
    "COMSPEC" not in os.environ,
    Path(os.environ.get("TEMP", "")).resolve() == operation_temp.resolve(),
    Path(os.environ.get("TMP", "")).resolve() == operation_temp.resolve(),
    importlib.util.find_spec("ambient_injection") is None,
    all("ambient-python-injection" not in entry for entry in sys.path),
]
if "--discover-nested-credentials" in sys.argv:
    print(json.dumps({
        "schema_version": "soulforge.mail.nested_credentials.v1",
        "nested_credentials": [],
    }))
    raise SystemExit(0)
if not all(checks):
    raise RuntimeError("isolated_launch_contract_failed")
print(json.dumps({
    "schema_version": "email.fetch.team_mailbox_run.v1",
    "partial": False,
    "mailboxes_total": 0,
    "mailboxes_enabled": 0,
    "mailboxes_run": 0,
    "mailboxes_skipped": 0,
    "total_events": 0,
    "total_new_events": 0,
    "total_duplicates": 0,
    "errors": [],
}))
`, "utf8");
    await writeFile(teamCliPath, scriptBytes);
    await writeFile(join(sourceRoot, "file_identity_guard.py"), "# capsule-only helper\n");
    await writeFile(join(collectorRoot, "team_mailboxes.py"), "# capsule-only collector\n");
    const registerPath = join(privateConfigRoot, "team_mailboxes.json");
    const registerBytes = Buffer.from(`${JSON.stringify({
      schema_version: "email.fetch.team_mailbox_register.v1",
      mailboxes: [],
    })}\n`);
    await writeFile(registerPath, registerBytes);
    const pythonExecutable = execFileSync(
      "python",
      ["-c", "import sys; print(sys.executable)"],
      { encoding: "utf8", windowsHide: true },
    ).trim();
    const release = await inspectMailCollectorRelease(teamCliPath);
    process.env.PYTHONPATH = ambientRoot;
    process.env.PYTHONHOME = ambientRoot;
    const result = await runMailBridge({
      dataRoot,
      privateConfigRoot,
      pythonExecutable,
      teamCliPath,
      teamCliSha256: release.team_cli_sha256,
      collectorTreeSha256: release.collector_tree_sha256,
      registerPath,
      registerSha256: digest(registerBytes),
      limit: 25,
    });
    assert.equal(result.status, "ok");
    assert.equal(result.mailboxes_total, 0);
  } finally {
    if (priorPythonPath === undefined) delete process.env.PYTHONPATH;
    else process.env.PYTHONPATH = priorPythonPath;
    if (priorPythonHome === undefined) delete process.env.PYTHONHOME;
    else process.env.PYTHONHOME = priorPythonHome;
    await rm(root, { recursive: true, force: true });
  }
});
