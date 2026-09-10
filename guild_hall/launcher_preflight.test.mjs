import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const digest = (value) => createHash("sha256").update(value).digest("hex");

function runLauncher(launcher, args) {
  // A parent PowerShell edition can supply an incompatible module search path.
  // Let Windows PowerShell initialize its own built-in modules for this child.
  return spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-File", launcher, ...args], {
    encoding: "utf8", timeout: 10000, env: { ...process.env, PSModulePath: "" },
  });
}

function assertForwardedArguments(result, lane, args) {
  const receipt = result.stdout.trim().split(/\r?\n/u).map(line => JSON.parse(line)).find(value => value.preflight === true);
  assert.ok(receipt, "dry CLI must receive the preflight invocation");
  const value = key => args[args.indexOf(key) + 1];
  const expected = lane === "ingress"
    ? ["--config", value("-BindingPath"), "--config-digest", value("-BindingDigest"), "--preflight"]
    : ["--repo-root", value("-RepoRoot"), "--voice-root", value("-VoiceRoot"),
      "--profile", value("-ProfilePath"), "--profile-sha256", value("-ProfileSha256"),
      "--asr-sha256", value("-AsrSha256"), "--state-root", value("-StateRoot"),
      "--poll-seconds", value("-PollSeconds"), "--max-asr-sessions", value("-MaxAsrSessions"),
      "--max-label-sessions", value("-MaxLabelSessions"), "--preflight"];
  assert.deepEqual(receipt.args, expected);
}

async function snapshot(root) {
  const result = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const child = path.join(root, entry.name);
    result.push([entry.name, entry.isDirectory() ? await snapshot(child) : digest(await readFile(child))]);
  }
  return result.sort(([a], [b]) => a.localeCompare(b));
}

async function fixture(lane) {
  const root = await mkdtemp(path.join(os.tmpdir(), "soulforge-preflight-synthetic-"));
  const runtime = path.join(root, "runtime with spaces");
  const moduleRoot = path.join(runtime, "guild_hall", lane);
  await mkdir(moduleRoot, { recursive: true });
  const cli = lane === "ingress" ? "continuous_supervisor_cli.mjs" : "continuous_label_supervisor_cli.mjs";
  const dryCli = `
const args = process.argv.slice(2);
if (args.includes('--apply')) throw new Error('preflight must not apply');
process.stdout.write(JSON.stringify({preflight: true, args}) + '\\n');
`;
  await writeFile(path.join(moduleRoot, cli), dryCli);
  if (lane === "ingress") await writeFile(path.join(moduleRoot, "continuous_cli.mjs"), dryCli);
  if (lane === "ingress") {
    const binding = path.join(root, "binding.json");
    const bytes = '{"synthetic":true}\n';
    await writeFile(binding, bytes);
    return { root, args: ["-RuntimeRoot", runtime, "-BindingPath", binding, "-BindingDigest", `sha256:${digest(bytes)}`] };
  }
  const repo = path.join(root, "repo");
  const voice = path.join(root, "voice");
  const bin = path.join(root, "asr");
  await Promise.all([mkdir(repo), mkdir(path.join(voice, "config"), { recursive: true }), mkdir(bin)]);
  const profile = path.join(voice, "config", "profile.json");
  await writeFile(profile, "{}");
  await writeFile(path.join(bin, "whisper-cli.exe"), "synthetic binary; never execute");
  return { root, args: [
    "-RuntimeRoot", runtime, "-RepoRoot", repo, "-VoiceRoot", voice,
    "-ProfilePath", profile, "-ProfileSha256", digest("{}"),
    "-AsrBinRoot", bin, "-AsrSha256", digest("synthetic binary; never execute"),
    "-StateRoot", path.join(root, "planned-state"), "-PollSeconds", "60",
    "-MaxAsrSessions", "1", "-MaxLabelSessions", "2",
  ] };
}

test("voice preflight preserves an existing state tree", { skip: process.platform !== "win32" }, async () => {
  const f = await fixture("voice_capture");
  const state = f.args[f.args.indexOf("-StateRoot") + 1];
  await mkdir(path.join(state, "receipts"), { recursive: true });
  await writeFile(path.join(state, "receipts", "synthetic.json"), '{"synthetic":true}');
  const before = await snapshot(f.root);
  const result = runLauncher(path.join(ROOT, "voice_capture", "ops", "run-continuous-label-supervisor.ps1"), [...f.args, "-Preflight"]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(await snapshot(f.root), before);
});

test("voice preflight rejects overlapping state and voice roots without writes", { skip: process.platform !== "win32" }, async () => {
  const f = await fixture("voice_capture");
  f.args[f.args.indexOf("-StateRoot") + 1] = f.args[f.args.indexOf("-VoiceRoot") + 1];
  const before = await snapshot(f.root);
  const result = runLauncher(path.join(ROOT, "voice_capture", "ops", "run-continuous-label-supervisor.ps1"), [...f.args, "-Preflight"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /protected roots overlap/iu);
  assert.deepEqual(await snapshot(f.root), before);
});

for (const [lane, launcher] of [
  ["ingress", "run-continuous-ingress-supervisor.ps1"],
  ["voice_capture", "run-continuous-label-supervisor.ps1"],
]) {
  for (const flag of ["-Preflight", "--preflight"]) {
    test(`${lane} ${flag} validates canonical launcher arguments without writes or apply execution`, { skip: process.platform !== "win32" }, async () => {
      const f = await fixture(lane);
      const before = await snapshot(f.root);
      const result = runLauncher(path.join(ROOT, lane, "ops", launcher), [...f.args, flag]);
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /preflight/iu);
      assertForwardedArguments(result, lane, f.args);
      assert.deepEqual(await snapshot(f.root), before, "preflight created or changed fixture data, logs, or locks");
    });
  }
  test(`${lane} preflight still rejects a digest mismatch before any writes`, { skip: process.platform !== "win32" }, async () => {
    const f = await fixture(lane);
    const key = lane === "ingress" ? "-BindingDigest" : "-ProfileSha256";
    f.args[f.args.indexOf(key) + 1] = `${lane === "ingress" ? "sha256:" : ""}${"0".repeat(64)}`;
    const before = await snapshot(f.root);
    const result = runLauncher(path.join(ROOT, lane, "ops", launcher), [...f.args, "-Preflight"]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /digest mismatch/iu);
    assert.deepEqual(await snapshot(f.root), before);
  });
}
