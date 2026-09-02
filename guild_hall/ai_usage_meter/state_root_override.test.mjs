// The meter CLI honours the shared SOULFORGE_STATE_ROOT / SOULFORGE_OWNER_ROOT
// override for hook, collect, report and dashboard, keeps `--state-root` and
// SOULFORGE_AI_USAGE_METER_STATE_ROOT above it, refuses a set-but-invalid
// value without writing anywhere, and behaves exactly as before when unset.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const CLI_PATH = fileURLToPath(new URL("./cli.mjs", import.meta.url));
const OVERRIDE_VARIABLES = ["SOULFORGE_STATE_ROOT", "SOULFORGE_OWNER_ROOT", "SOULFORGE_AI_USAGE_METER_STATE_ROOT"];

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

// Every run gets a non-git working directory and a private CODEX_HOME, so the
// git-common-checkout path never resolves and the only pre-existing default is
// the documented `<CODEX_HOME>/usage-meter` fallback.
async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "sf-meter-state-root-override-"));
  t.after(async () => { await rm(root, { recursive: true, force: true }); });
  const make = async (...segments) => {
    const target = path.join(root, ...segments);
    await mkdir(target, { recursive: true });
    return target;
  };
  return {
    root,
    cwd: await make("cwd"),
    codexHome: await make("codex-home"),
    sessions: await make("sessions"),
    stateRoot: await make("state-root"),
    ownerRoot: await make("owner-root"),
    meterRoot: await make("explicit-meter-root"),
    flagRoot: await make("flag-root"),
  };
}

function runCli(fixtureValue, args, { env = {}, input = null } = {}) {
  const baseEnv = { ...process.env };
  for (const name of OVERRIDE_VARIABLES) delete baseEnv[name];
  baseEnv.CODEX_HOME = fixtureValue.codexHome;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI_PATH, ...args], {
      cwd: fixtureValue.cwd,
      env: { ...baseEnv, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(input === null ? "" : `${JSON.stringify(input)}\n`);
  });
}

const sessionStart = (sessionId) => ({ hook_event_name: "SessionStart", session_id: sessionId });
const meterUnder = (stateRoot) => path.join(stateRoot, "operations", "ai_usage_meter");

async function readHealth(meterRoot) {
  return JSON.parse(await readFile(path.join(meterRoot, "health", "latest.json"), "utf8"));
}

test("hook writes under SOULFORGE_STATE_ROOT/operations/ai_usage_meter and never under the CODEX_HOME fallback", async (t) => {
  const f = await fixture(t);
  const result = await runCli(f, ["hook"], {
    env: { SOULFORGE_STATE_ROOT: f.stateRoot },
    input: sessionStart("override-session-1"),
  });
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {});
  const health = await readHealth(meterUnder(f.stateRoot));
  assert.equal(health.status, "ok");
  assert.equal(health.detail, null, "no fallback reason: the override is a first-class root");
  assert.equal(await exists(path.join(meterUnder(f.stateRoot), "lifecycle")), true);
  assert.equal(await exists(path.join(f.codexHome, "usage-meter")), false);
  assert.equal(await exists(path.join(f.cwd, "guild_hall")), false);
});

test("hook: SOULFORGE_OWNER_ROOT derives <owner>/guild_hall/state/operations/ai_usage_meter", async (t) => {
  const f = await fixture(t);
  const result = await runCli(f, ["hook"], {
    env: { SOULFORGE_OWNER_ROOT: f.ownerRoot },
    input: sessionStart("override-session-2"),
  });
  assert.equal(result.code, 0, result.stderr);
  const health = await readHealth(path.join(f.ownerRoot, "guild_hall", "state", "operations", "ai_usage_meter"));
  assert.equal(health.status, "ok");
  assert.equal(await exists(path.join(f.codexHome, "usage-meter")), false);
});

test("hook precedence: --state-root, then SOULFORGE_AI_USAGE_METER_STATE_ROOT, then SOULFORGE_STATE_ROOT, then SOULFORGE_OWNER_ROOT", async (t) => {
  const f = await fixture(t);
  const everything = {
    SOULFORGE_STATE_ROOT: f.stateRoot,
    SOULFORGE_OWNER_ROOT: f.ownerRoot,
    SOULFORGE_AI_USAGE_METER_STATE_ROOT: f.meterRoot,
  };

  const flagged = await runCli(f, ["hook", "--state-root", f.flagRoot], { env: everything, input: sessionStart("precedence-1") });
  assert.equal(flagged.code, 0, flagged.stderr);
  assert.equal((await readHealth(f.flagRoot)).status, "ok");
  assert.equal(await exists(path.join(f.meterRoot, "health")), false);
  assert.equal(await exists(meterUnder(f.stateRoot)), false);

  const meterEnv = await runCli(f, ["hook"], { env: everything, input: sessionStart("precedence-2") });
  assert.equal(meterEnv.code, 0, meterEnv.stderr);
  assert.equal((await readHealth(f.meterRoot)).status, "ok");
  assert.equal(await exists(meterUnder(f.stateRoot)), false);

  const stateEnv = await runCli(f, ["hook"], {
    env: { SOULFORGE_STATE_ROOT: f.stateRoot, SOULFORGE_OWNER_ROOT: f.ownerRoot },
    input: sessionStart("precedence-3"),
  });
  assert.equal(stateEnv.code, 0, stateEnv.stderr);
  assert.equal((await readHealth(meterUnder(f.stateRoot))).status, "ok");
  assert.equal(await exists(path.join(f.ownerRoot, "guild_hall")), false);
});

test("hook refuses (exit 1, nothing written anywhere) when the override is relative or missing", async (t) => {
  const f = await fixture(t);
  const relative = path.join("relative", "state-root");
  const missing = path.join(f.root, "does-not-exist");
  for (const env of [
    { SOULFORGE_STATE_ROOT: relative },
    { SOULFORGE_STATE_ROOT: missing },
    { SOULFORGE_OWNER_ROOT: missing },
    { SOULFORGE_OWNER_ROOT: missing, SOULFORGE_STATE_ROOT: f.stateRoot },
  ]) {
    const result = await runCli(f, ["hook"], { env, input: sessionStart("invalid-override") });
    assert.equal(result.code, 1, `expected refusal for ${Object.keys(env).join("+")}`);
    assert.equal(result.stdout, "");
    const error = JSON.parse(result.stderr);
    assert.equal(error.ok, false);
    assert.equal(error.error, "soulforge_root_override_invalid");
    assert.equal(result.stderr.includes(f.root), false, "stderr must not echo the configured path");
  }
  assert.equal(await exists(path.join(f.codexHome, "usage-meter")), false);
  assert.equal(await exists(path.join(f.cwd, "relative")), false);
  assert.equal(await exists(missing), false);
  assert.equal(await exists(meterUnder(f.stateRoot)), false);
});

test("unset: the hook still falls back to <CODEX_HOME>/usage-meter from a non-git directory, exactly as before", async (t) => {
  const f = await fixture(t);
  const result = await runCli(f, ["hook"], { input: sessionStart("unchanged-default") });
  assert.equal(result.code, 0, result.stderr);
  const health = await readHealth(path.join(f.codexHome, "usage-meter"));
  assert.equal(health.status, "ok");
  assert.equal(health.detail, "hook_common_root_unavailable");
  assert.equal(await exists(meterUnder(f.stateRoot)), false);
});

test("collect --apply, report and dashboard resolve the override when --state-root is omitted", async (t) => {
  const f = await fixture(t);
  const env = { SOULFORGE_STATE_ROOT: f.stateRoot };
  const meterRoot = meterUnder(f.stateRoot);

  const collected = await runCli(f, ["collect", "--sessions-root", f.sessions, "--apply"], { env });
  assert.equal(collected.code, 0, collected.stderr);
  assert.equal(JSON.parse(collected.stdout).coverage.scope, "full_sessions_root");
  assert.equal(await exists(path.join(meterRoot, "coverage", "latest.json")), true);

  const reported = await runCli(f, ["report"], { env });
  assert.equal(reported.code, 0, reported.stderr);
  assert.equal(typeof JSON.parse(reported.stdout), "object");

  const dashboard = await runCli(f, ["dashboard"], { env });
  assert.equal(dashboard.code, 0, dashboard.stderr);
  assert.equal(await exists(path.join(meterRoot, "dashboard.html")), true);

  const meterEnvDashboard = await runCli(f, ["dashboard"], {
    env: { ...env, SOULFORGE_AI_USAGE_METER_STATE_ROOT: f.meterRoot },
  });
  assert.equal(meterEnvDashboard.code, 0, meterEnvDashboard.stderr);
  assert.equal(await exists(path.join(f.meterRoot, "dashboard.html")), true);

  assert.equal(await exists(path.join(f.codexHome, "usage-meter")), false);
});

test("unset: commands that require --state-root still fail closed with their existing codes", async (t) => {
  const f = await fixture(t);
  for (const [args, code] of [
    [["report"], "state_root_required"],
    [["dashboard"], "state_root_required"],
    [["collect", "--sessions-root", f.sessions, "--apply"], "state_root_required_for_apply"],
  ]) {
    const result = await runCli(f, args);
    assert.equal(result.code, 1, `${args.join(" ")} must still fail without a state root`);
    assert.equal(JSON.parse(result.stderr).error, code);
  }
  assert.equal(await exists(path.join(f.codexHome, "usage-meter")), false);
  assert.equal(await exists(meterUnder(f.stateRoot)), false);
});

test("usage-projection keeps requiring an explicit --state-root even under the override", async (t) => {
  const f = await fixture(t);
  const result = await runCli(f, ["usage-projection", "--read-only=1", "--thread-id", "thread-a"], {
    env: { SOULFORGE_STATE_ROOT: f.stateRoot },
  });
  assert.equal(result.code, 1);
  assert.equal(JSON.parse(result.stderr).error, "state_root_required");
});
