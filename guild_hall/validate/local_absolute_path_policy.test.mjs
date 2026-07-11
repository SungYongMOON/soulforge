import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findLocalAbsolutePathViolations } from "./local_absolute_path_policy.mjs";

const policyCli = fileURLToPath(new URL("./local_absolute_path_policy.mjs", import.meta.url));

test("local absolute path policy flags concrete local paths", () => {
  const fixtures = buildFakeLocalPathFixtures();
  const text = [
    `run_from: ${fixtures.windowsRoot}`,
    `tool: ${fixtures.windowsTool}`,
    `mac: ${fixtures.userPath}`,
    `mounted: ${fixtures.volumePath}`,
    `file_link: ${fixtures.fileUri}`,
  ].join("\n");

  const violations = findLocalAbsolutePathViolations(text, "example.yaml");
  assert.deepEqual(
    violations.map((violation) => violation.id),
    [
      "windows_local_absolute_path",
      "windows_local_absolute_path",
      "posix_local_absolute_path",
      "posix_local_absolute_path",
      "file_uri_absolute_path",
    ],
  );
  assertRedactedViolations(violations, Object.values(fixtures));
});

test("local absolute path policy ignores URLs and repo-relative paths", () => {
  const text = [
    "source: https://github.com/SungYongMOON/soulforge.git",
    "demo: demo://attachments/example.zip",
    "relative: _workmeta/system/runs/example/RUN_MANIFEST.yaml",
    "placeholder: <LOCAL_SOULFORGE_ROOT>/guild_hall/state",
  ].join("\n");

  assert.equal(findLocalAbsolutePathViolations(text, "example.md").length, 0);
});

test("local absolute path policy redacts human and JSON report values", async () => {
  const fixtures = buildFakeLocalPathFixtures();
  const repoRoot = await fs.mkdtemp(path.join(tmpdir(), "path-policy-redaction-"));
  const init = spawnSync("git", ["init", "--quiet"], { cwd: repoRoot, encoding: "utf8" });
  assert.equal(init.status, 0, init.stderr);

  await fs.writeFile(
    path.join(repoRoot, "fixture.md"),
    [`mac: ${fixtures.userPath}`, `mounted: ${fixtures.volumePath}`, `file_link: ${fixtures.fileUri}`].join("\n"),
    "utf8",
  );

  const human = spawnSync(process.execPath, [policyCli, "--root", repoRoot, "--scope", "changed"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert.equal(human.status, 1, human.stderr);
  assert.match(human.stdout, /<redacted>/);
  assert.match(human.stdout, /fingerprint=sha256:[a-f0-9]{16}/);
  assertValuesNotEchoed(human.stdout, [fixtures.userPath, fixtures.volumePath, fixtures.fileUri]);

  const json = spawnSync(process.execPath, [policyCli, "--root", repoRoot, "--scope", "changed", "--json"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert.equal(json.status, 1, json.stderr);
  assertValuesNotEchoed(json.stdout, [fixtures.userPath, fixtures.volumePath, fixtures.fileUri]);
  assert.equal(json.stdout.includes(repoRoot), false);

  const report = JSON.parse(json.stdout);
  assert.equal(report.summary.violations_total, 3);
  assert.equal(report.repos[0].root, "<redacted>");
  assert.equal(typeof report.repos[0].root_length, "number");
  assert.match(report.repos[0].root_fingerprint, /^sha256:[a-f0-9]{16}$/);
  assertRedactedViolations(report.violations, [fixtures.userPath, fixtures.volumePath, fixtures.fileUri]);
});

test("local absolute path policy skips tracked symlinks without reading targets", async (t) => {
  const repoRoot = await fs.mkdtemp(path.join(tmpdir(), "path-policy-symlink-repo-"));
  const outsideRoot = await fs.mkdtemp(path.join(tmpdir(), "path-policy-symlink-target-"));
  const outsideTarget = path.join(outsideRoot, "outside-target.md");
  const sentinel = "SENTINEL_SYMLINK_TARGET_DO_NOT_READ_20260605";
  const targetLocalPath = `${"/"}${"Users"}/synthetic-symlink-target/Soulforge/secret.md`;

  const init = spawnSync("git", ["init", "--quiet"], { cwd: repoRoot, encoding: "utf8" });
  assert.equal(init.status, 0, init.stderr);

  await fs.writeFile(
    outsideTarget,
    [`sentinel: ${sentinel}`, `target_path: ${outsideTarget}`, `local_path: ${targetLocalPath}`].join("\n"),
    "utf8",
  );

  const linkPath = path.join(repoRoot, "linked-outside-target.md");
  try {
    await fs.symlink(outsideTarget, linkPath);
  } catch (error) {
    if (process.platform === "win32" && ["EPERM", "EINVAL"].includes(error.code)) {
      t.skip(`symlink creation unavailable on this Windows environment: ${error.code}`);
      return;
    }
    throw error;
  }

  const linkStats = await fs.lstat(linkPath);
  assert.equal(linkStats.isSymbolicLink(), true);

  const add = spawnSync("git", ["add", "linked-outside-target.md"], { cwd: repoRoot, encoding: "utf8" });
  assert.equal(add.status, 0, add.stderr);

  const human = spawnSync(process.execPath, [policyCli, "--root", repoRoot, "--scope", "tracked"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert.equal(human.status, 0, human.stderr);
  assertValuesNotEchoed(`${human.stdout}\n${human.stderr}`, [sentinel, outsideTarget, targetLocalPath]);

  const json = spawnSync(process.execPath, [policyCli, "--root", repoRoot, "--scope", "tracked", "--json"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert.equal(json.status, 0, json.stderr);
  assertValuesNotEchoed(`${json.stdout}\n${json.stderr}`, [sentinel, outsideTarget, targetLocalPath]);

  const report = JSON.parse(json.stdout);
  assert.equal(report.ok, true);
  assert.equal(report.summary.violations_total, 0);
  assert.equal(report.summary.files_scanned, 0);
  assert.deepEqual(
    report.skipped.map((item) => ({ path: item.path, reason: item.reason })),
    [{ path: "linked-outside-target.md", reason: "symlink_file" }],
  );
});

test("local absolute path policy fails closed when git listing fails", async () => {
  const repoRoot = await fs.mkdtemp(path.join(tmpdir(), "path-policy-gitfail-"));
  const init = spawnSync("git", ["init", "--quiet"], { cwd: repoRoot, encoding: "utf8" });
  assert.equal(init.status, 0, init.stderr);
  await fs.writeFile(path.join(repoRoot, "tracked.md"), "clean repo-relative content\n", "utf8");
  const add = spawnSync("git", ["add", "tracked.md"], { cwd: repoRoot, encoding: "utf8" });
  assert.equal(add.status, 0, add.stderr);
  const commit = spawnSync(
    "git",
    ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "--quiet", "-m", "seed"],
    { cwd: repoRoot, encoding: "utf8" },
  );
  assert.equal(commit.status, 0, commit.stderr);
  // .git/index 파손: rev-parse 는 통과하되 ls-files 가 실패하는 부분 실패 상태 재현
  await fs.writeFile(path.join(repoRoot, ".git", "index"), "garbage-not-an-index", "utf8");

  const json = spawnSync(process.execPath, [policyCli, "--root", repoRoot, "--scope", "tracked", "--json"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert.equal(json.status, 1, json.stderr);
  const report = JSON.parse(json.stdout);
  assert.equal(report.ok, false);
  assert.equal(report.skipped.some((item) => /^git_list_failed:/.test(item.reason)), true);
  assert.equal(json.stdout.includes(repoRoot), false);
});

test("local absolute path policy fails closed when tracked scope lists zero files", async () => {
  const repoRoot = await fs.mkdtemp(path.join(tmpdir(), "path-policy-empty-"));
  const init = spawnSync("git", ["init", "--quiet"], { cwd: repoRoot, encoding: "utf8" });
  assert.equal(init.status, 0, init.stderr);

  const json = spawnSync(process.execPath, [policyCli, "--root", repoRoot, "--scope", "tracked", "--json"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert.equal(json.status, 1, json.stderr);
  const report = JSON.parse(json.stdout);
  assert.equal(report.ok, false);
  assert.equal(report.skipped.some((item) => item.reason === "tracked_scope_empty"), true);
});

function buildFakeLocalPathFixtures() {
  return {
    windowsRoot: `${"C:"}/Soulforge`,
    windowsTool: `${"C:"}\\\\Cadence\\\\SPB_25.1\\\\tools\\\\bin\\\\psp_cmd.exe`,
    userPath: `${"/"}${"Users"}/synthetic-user/Workspace/Soulforge`,
    volumePath: `${"/"}${"Volumes"}/SyntheticDrive/Soulforge`,
    fileUri: `${"file:"}${"///"}${"Users"}/synthetic-user/Workspace/Soulforge/README.md`,
  };
}

function assertRedactedViolations(violations, rawValues) {
  for (const violation of violations) {
    assert.equal(violation.value, "<redacted>");
    assert.equal(typeof violation.value_length, "number");
    assert.match(violation.value_fingerprint, /^sha256:[a-f0-9]{16}$/);
    assert.match(violation.reason, /^concrete_/);
  }
  assertValuesNotEchoed(JSON.stringify(violations), rawValues);
}

function assertValuesNotEchoed(output, rawValues) {
  for (const rawValue of rawValues) {
    assert.equal(output.includes(rawValue), false);
  }
}
