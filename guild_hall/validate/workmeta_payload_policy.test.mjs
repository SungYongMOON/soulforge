import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { validateWorkmetaPayloadPolicy } from "./workmeta_payload_policy.mjs";

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

test("workmeta payload policy passes when _workmeta is absent", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-workmeta-payload-policy-"));
  const report = await validateWorkmetaPayloadPolicy({ repoRoot });

  assert.equal(report.ok, true);
  assert.equal(report.present, false);
  assert.equal(report.violation_count, 0);
});

async function writeSample(repoRoot, relativePath) {
  const filePath = path.join(repoRoot, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, "sample", "utf8");
}
