import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { validateWorkmetaPayloadPolicy } from "./workmeta_payload_policy.mjs";

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

test("workmeta payload policy flags blocked symlink names without following targets", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-workmeta-payload-policy-"));
  await writeSample(repoRoot, "safe-target.txt");
  await writeSample(repoRoot, "safe-target-dir/inside.xlsx");
  await linkSample(repoRoot, "safe-target.txt", "_workmeta/P00-000_INBOX/reports/linked.xlsx");
  await linkSample(repoRoot, "safe-target.txt", "_workmeta/P00-000_INBOX/reports/linked.pdf");
  await linkSample(repoRoot, "safe-target.txt", "_workmeta/P00-000_INBOX/reports/linked.txt");
  await linkSample(repoRoot, "safe-target.txt", "_workmeta/.git/objects/ignored.xlsx");
  await linkSample(repoRoot, "safe-target.txt", "_workspaces/P00-000_INBOX/reports/linked.xlsx");
  await linkSample(repoRoot, "safe-target-dir", "_workmeta/P00-000_INBOX/reports/linked_dir");

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

async function linkSample(repoRoot, targetRelativePath, linkRelativePath) {
  const linkPath = path.join(repoRoot, linkRelativePath);
  await mkdir(path.dirname(linkPath), { recursive: true });
  await symlink(path.join(repoRoot, targetRelativePath), linkPath);
}
