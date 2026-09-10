import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFile, mkdtemp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));

async function fixture(initialPause) {
  const root = await mkdtemp(path.join(os.tmpdir(), "soulforge-label-pause-synthetic-"));
  const state = path.join(root, "state");
  await mkdir(state);
  for (const name of ["continuous_label_supervisor_cli.mjs", "continuous_label_supervisor.mjs"]) {
    await copyFile(path.join(ROOT, name), path.join(root, name));
  }
  // The real CLI and supervisor run against a synthetic worker: no ASR, source reads, or runtime access.
  await writeFile(path.join(root, "continuous_label_worker.mjs"), `
import { writeFile } from "node:fs/promises";
import path from "node:path";
export async function runContinuousVoiceLabelWorker(options) {
  await writeFile(path.join(options.stateRoot, "worker-started"), "synthetic");
  await writeFile(path.join(options.stateRoot, "continuous-label-supervisor.pause"), "synthetic pause");
  await new Promise(resolve => setTimeout(resolve, 1400));
  await writeFile(path.join(options.stateRoot, "worker-finished"), "synthetic");
  return { status: "ok", run_id: "synthetic" };
}
`);
  if (initialPause) await writeFile(path.join(state, "continuous-label-supervisor.pause"), "synthetic pause");
  return { root, state };
}

function run(f) {
  return spawnSync(process.execPath, [path.join(f.root, "continuous_label_supervisor_cli.mjs"),
    "--repo-root", f.root, "--voice-root", f.root, "--profile", path.join(f.root, "synthetic-profile.json"),
    "--profile-sha256", "a".repeat(64), "--asr-sha256", "b".repeat(64), "--state-root", f.state,
    "--poll-seconds", "60", "--apply",
  ], { encoding: "utf8", timeout: 5000, env: {} });
}

test("ASR supervisor CLI honors an existing pause without starting a worker or creating state", async () => {
  const f = await fixture(true);
  const result = run(f);
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  assert.deepEqual(await readdir(f.state), ["continuous-label-supervisor.pause"]);
  const events = result.stdout.trim().split("\n").map(JSON.parse);
  assert.equal(events.at(-1).event, "supervisor_stopped");
  assert.equal(events.at(-1).cycles_completed, 0);
});

test("ASR supervisor CLI finishes the in-flight cycle then stops on pause", async () => {
  const f = await fixture(false);
  const result = run(f);
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  assert.equal(await readFile(path.join(f.state, "worker-finished"), "utf8"), "synthetic");
  const events = result.stdout.trim().split("\n").map(JSON.parse);
  assert.equal(events.filter(event => event.event === "cycle_completed").length, 1);
  assert.equal(events.at(-1).event, "supervisor_stopped");
  assert.equal(events.at(-1).status, "stopped");
  assert.equal(events.at(-1).cycles_completed, 1);
});
