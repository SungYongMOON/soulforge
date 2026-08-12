import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { validateWorkmetaPayloadPolicy, validateWorkmetaWriteTarget } from "./workmeta_payload_policy.mjs";

const execFileAsync = promisify(execFile);
const cliPath = fileURLToPath(new URL("./workmeta_payload_policy.mjs", import.meta.url));

test("workmeta payload policy flags blocked payload extensions under _workmeta only", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-workmeta-payload-policy-"));
  await writeSample(repoRoot, "_workmeta/P00-000_INBOX/reports/메일_이력/메일_이력.xlsx");
  await writeSample(repoRoot, "_workmeta/P00-000_INBOX/reports/메일_이력/메일_이력.csv");
  await writeSample(repoRoot, "_workmeta/.git/objects/not-a-work-file.xlsx");
  await writeSample(repoRoot, "_workspaces/P00-000_INBOX/reports/메일_이력/메일_이력.xlsx");

  const report = await validateWorkmetaPayloadPolicy({ repoRoot });

  assert.equal(report.ok, false);
  assert.equal(report.present, true);
  assert.deepEqual(report.violations.map((violation) => violation.path), [
    "_workmeta/P00-000_INBOX/reports/메일_이력/메일_이력.xlsx",
  ]);
});

test("workmeta payload policy flags blocked symlink names without following targets", async (t) => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-workmeta-payload-policy-"));
  await writeSample(repoRoot, "safe-target.txt");
  await writeSample(repoRoot, "safe-target-dir/inside.xlsx");
  if (!(await linkSample(t, repoRoot, "safe-target.txt", "_workmeta/P00-000_INBOX/reports/linked.xlsx"))) return;
  if (!(await linkSample(t, repoRoot, "safe-target.txt", "_workmeta/P00-000_INBOX/reports/linked.pdf"))) return;
  if (!(await linkSample(t, repoRoot, "safe-target.txt", "_workmeta/P00-000_INBOX/reports/linked.txt"))) return;
  if (!(await linkSample(t, repoRoot, "safe-target.txt", "_workmeta/.git/objects/ignored.xlsx"))) return;
  if (!(await linkSample(t, repoRoot, "safe-target.txt", "_workspaces/P00-000_INBOX/reports/linked.xlsx"))) return;
  if (!(await linkSample(t, repoRoot, "safe-target-dir", "_workmeta/P00-000_INBOX/reports/linked_dir"))) return;

  const report = await validateWorkmetaPayloadPolicy({ repoRoot });

  assert.equal(report.ok, false);
  assert.deepEqual(report.violations.map((violation) => violation.path), [
    "_workmeta/P00-000_INBOX/reports/linked.pdf",
    "_workmeta/P00-000_INBOX/reports/linked.xlsx",
  ]);
});

test("workmeta payload policy passes when _workmeta is absent", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-workmeta-payload-policy-"));
  const report = await validateWorkmetaPayloadPolicy({ repoRoot });

  assert.equal(report.ok, true);
  assert.equal(report.present, false);
  assert.equal(report.violation_count, 0);
});

test("write-target guard rejects generated runtime paths before they exist", () => {
  const repoRoot = path.resolve("synthetic-soulforge-root");
  const report = validateWorkmetaWriteTarget({
    repoRoot,
    targetPath: "_workmeta/demo_project/runs/run_01/artifact_run/build.mjs",
  });

  assert.equal(report.ok, false);
  assert.deepEqual(report.violations.map((violation) => violation.id), [
    "generated_runtime_path_in_workmeta",
    "non_metadata_file_type_in_workmeta",
  ]);
});

test("write-target guard rejects git internals under the metadata repository", () => {
  const repoRoot = path.resolve("synthetic-soulforge-root");
  const report = validateWorkmetaWriteTarget({
    repoRoot,
    targetPath: "_workmeta/.git/objects",
    targetKind: "directory",
  });

  assert.equal(report.ok, false);
  assert.deepEqual(report.violations.map((violation) => violation.id), ["generated_runtime_path_in_workmeta"]);
});

test("write-target guard permits compact metadata receipts and workspace artifacts", () => {
  const repoRoot = path.resolve("synthetic-soulforge-root");
  const receipt = validateWorkmetaWriteTarget({
    repoRoot,
    targetPath: "_workmeta/demo_project/runs/run_01/run_receipt.yaml",
  });
  const artifact = validateWorkmetaWriteTarget({
    repoRoot,
    targetPath: "_workspaces/demo_project/060_SFR/01_Work/output.hwpx",
  });

  assert.equal(receipt.ok, true);
  assert.equal(receipt.applies, true);
  assert.equal(artifact.ok, true);
  assert.equal(artifact.applies, false);
});

test("tree validator flags untracked runtime residue even when gitignore could hide it", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-workmeta-payload-policy-"));
  await writeSample(repoRoot, "_workmeta/demo_project/runs/run_01/__pycache__/builder.pyc");
  await writeSample(repoRoot, "_workmeta/demo_project/runs/run_01/visual_qa/page-01.png");

  const report = await validateWorkmetaPayloadPolicy({ repoRoot });

  assert.equal(report.ok, false);
  assert.deepEqual([...new Set(report.violations.map((violation) => violation.id))].sort(), [
    "generated_runtime_path_in_workmeta",
    "non_metadata_file_type_in_workmeta",
  ]);
});

test("workmeta payload policy CLI runs when invoked by file path", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-workmeta-payload-policy-"));

  const { stdout } = await execFileAsync(process.execPath, [cliPath, "--root", repoRoot], {
    encoding: "utf8",
  });

  assert.match(stdout, /Soulforge Workmeta Payload Policy/);
  assert.match(stdout, /present: no/);
});

async function writeSample(repoRoot, relativePath) {
  const filePath = path.join(repoRoot, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, "sample", "utf8");
}

async function linkSample(t, repoRoot, targetRelativePath, linkRelativePath) {
  const linkPath = path.join(repoRoot, linkRelativePath);
  await mkdir(path.dirname(linkPath), { recursive: true });
  try {
    await symlink(path.join(repoRoot, targetRelativePath), linkPath);
  } catch (error) {
    if (process.platform === "win32" && ["EPERM", "EINVAL"].includes(error.code)) {
      t.skip(`symlink creation unavailable on this Windows environment: ${error.code}`);
      return false;
    }
    throw error;
  }
  return true;
}
