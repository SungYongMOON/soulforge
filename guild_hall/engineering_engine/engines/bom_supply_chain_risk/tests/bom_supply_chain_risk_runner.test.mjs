import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("BOM/SCR zero-write runner is deterministic and leaves its caller directory unchanged", () => {
  const runner = fileURLToPath(new URL("../tools/bom_supply_chain_risk_runner.mjs", import.meta.url));
  const sandbox = mkdtempSync(join(tmpdir(), "bom-scr-runner-"));
  try {
    const first = spawnSync(process.execPath, [runner], { cwd: sandbox, encoding: "utf8", timeout: 10_000 });
    const second = spawnSync(process.execPath, [runner], { cwd: sandbox, encoding: "utf8", timeout: 10_000 });

    assert.equal(first.status, 0, first.stderr);
    assert.equal(second.status, 0, second.stderr);
    assert.equal(first.stderr, "");
    assert.equal(second.stderr, "");
    assert.equal(first.stdout, second.stdout);
    assert.deepEqual(readdirSync(sandbox), []);

    const result = JSON.parse(first.stdout);
    assert.equal(result.assessment.overall_state, "hold");
    assert.deepEqual(result.receipt.effects, {
      filesystem_writes: 0,
      network_requests: 0,
      model_calls: 0,
      procurement_actions: 0,
      erp_writes: 0,
      authority_actions: 0,
    });
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});
